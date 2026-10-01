import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationStatusHistoryView } from './ReservationStatusHistoryView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const at = (h: number, m = 0, s = 0): string => new Date(2026, 3, 16, h, m, s).toISOString();

const summary = (id: number, hour: number, guest: string, status = 'pending') => ({
  id,
  reservation_date: at(hour),
  duration_minutes: 90,
  seated_at: null,
  party_size: 4,
  status,
  guest_name: guest,
});

const RES_1 = summary(1, 19, 'Carlos Mendoza', 'completed');
const RES_2 = summary(2, 20, 'Lucía Prat', 'cancelled');
const RES_3 = summary(3, 21, 'Marta Gil', 'no_show');

const row = (
  id: number,
  reservation: ReturnType<typeof summary>,
  status: string,
  changedAt: string,
  previous: [string, string] | null,
  changedBy: number | null = 2,
) => ({
  id,
  reservation_id: reservation.id,
  status,
  previous_status: previous?.[0] ?? null,
  previous_changed_at: previous?.[1] ?? null,
  changed_at: changedAt,
  changed_by: changedBy,
  is_active: true,
  reservation,
});
// Day served by the backend in changed_at DESC. The creation of #RES-1 (PENDING) was yesterday,
// so it's not on the current day — but the confirmation still brings its `previous_*`.
const DAY = [
  row(8, RES_3, 'no_show', at(21, 20), ['pending', at(10)], null),
  row(4, RES_1, 'completed', at(20, 52), ['seated', at(19, 7)], 9),
  row(6, RES_2, 'cancelled', at(19, 45), ['pending', at(12)], 9),
  row(3, RES_1, 'seated', at(19, 7, 12), ['confirmed', at(14, 20)]),
  row(2, RES_1, 'confirmed', at(14, 20), ['pending', at(14)]),
  row(5, RES_2, 'pending', at(12), null),
];

const LIFECYCLE_1 = [
  row(4, RES_1, 'completed', at(20, 52), ['seated', at(19, 7)], 9),
  row(3, RES_1, 'seated', at(19, 7), ['confirmed', at(14, 20)]),
  row(2, RES_1, 'confirmed', at(14, 20), ['pending', at(14)]),
  row(1, RES_1, 'pending', at(14), null),
];

const STAFF = [
  { id: 20, user_id: 2, name: 'Ana Ruiz', role: 'host' },
  { id: 21, user_id: 9, name: 'Leo Vidal', role: 'manager' },
];

let dayRows: unknown[] = DAY;
const calls: Array<{ url: string; method: string }> = [];

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  } as Response);

const page = (data: unknown[]) => ({
  statusCode: 200,
  data,
  page: 1,
  limit: 100,
  total: data.length,
  totalPages: 1,
  hasNext: false,
  hasPrev: false,
});

beforeEach(() => {
  dayRows = DAY;
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('/reservation-status-history/by-reservation/1?')) {
        return jsonResponse(page(LIFECYCLE_1));
      }
      if (url.includes('/reservation-status-history/by-reservation/')) {
        return jsonResponse({ message: 'Reservation not found', error: 'Not Found', statusCode: 404 }, 404);
      }
      if (url.includes('/reservation-status-history?')) return jsonResponse(page(dayRows));
      if (url.includes('/collaborators')) return jsonResponse({ statusCode: 200, data: STAFF });
      return jsonResponse({ statusCode: 200, data: [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const feedIds = () =>
  within(screen.getByTestId('history-feed'))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-testid'));

describe('ReservationStatusHistoryView', () => {
  it('loads the transitions LOGGED on the selected day', async () => {
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    const dayCall = calls.find((c) => c.url.includes('/reservation-status-history?'));
    expect(dayCall?.url).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    expect(dayCall?.url).toContain('limit=100');
  });

  it('sums the shift KPIs: transitions, seated, cancellations + no-shows, automated', async () => {
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    expect(screen.getByTestId('kpi-transitions')).toHaveTextContent('6');
    expect(screen.getByTestId('kpi-seated')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-cancellations')).toHaveTextContent('2');
    expect(screen.getByTestId('kpi-cancellations')).toHaveTextContent('2 within 30 min');
    expect(screen.getByTestId('kpi-automated')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-lead')).toHaveTextContent('20m');
    expect(screen.getByTestId('kpi-wait')).toHaveTextContent('7m wait');
    expect(screen.getByTestId('kpi-dining')).toHaveTextContent('1h 45m');
  });

  it('lists entries strictly by changed_at DESC with Δt, actor and audit timestamp', async () => {
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    expect(feedIds()).toEqual([
      'history-entry-8', 'history-entry-4', 'history-entry-6',
      'history-entry-3', 'history-entry-2', 'history-entry-5',
    ]);

    const completed = screen.getByTestId('history-entry-4');
    expect(completed).toHaveTextContent('after 1h 45m in Seated');
    expect(completed).toHaveTextContent('Leo Vidal (Manager)');
    expect(completed).toHaveTextContent('16/04/2026 20:52:00');
    expect(completed).toHaveTextContent('#RES-1');
    expect(screen.getByTestId('history-entry-8')).toHaveTextContent('Automated System');
    expect(screen.getByTestId('history-entry-5')).toHaveTextContent('booking created');
  });

  it('annotates each entry with the operational duration it closes', async () => {
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    expect(screen.getByTestId('entry-duration-2')).toHaveTextContent('Confirmation lead 20m');
    expect(screen.getByTestId('entry-duration-3')).toHaveTextContent('Wait at reception: 7m wait');
    expect(screen.getByTestId('entry-duration-4')).toHaveTextContent(
      'Dining 1h 45m · +15m over (booked 1h 30m)',
    );
  });

  it('flags last-minute cancellations and no-shows', async () => {
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    expect(screen.getByTestId('late-flag-6')).toHaveAccessibleName(
      'Late cancellation — 15 min before start',
    );
    expect(screen.getByTestId('late-flag-8')).toHaveAccessibleName(
      'Late no-show — 20 min after start',
    );
  });

  it('filters by target status from the dropdown', async () => {
    const user = userEvent.setup();
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'cancelled');
    expect(feedIds()).toEqual(['history-entry-6']);
    // Shift KPIs still reflect the entire day.
    expect(screen.getByTestId('kpi-transitions')).toHaveTextContent('6');
  });

  it('filters by staff member, including the automated system', async () => {
    const user = userEvent.setup();
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    const staff = screen.getByLabelText('Filter by staff member');
    await waitFor(() =>
      expect(within(staff).getByRole('option', { name: 'Leo Vidal (Manager)' })).toBeInTheDocument(),
    );
    await user.selectOptions(staff, '9');
    expect(feedIds()).toEqual(['history-entry-4', 'history-entry-6']);

    await user.selectOptions(staff, 'automated');
    expect(feedIds()).toEqual(['history-entry-8']);
  });

  it('looks up a reservation and shows its full lifecycle with durations', async () => {
    const user = userEvent.setup();
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    await user.type(screen.getByLabelText('Look up a reservation by ID'), '#RES-1');

    const summaryPanel = await screen.findByTestId('lifecycle-summary');
    expect(within(summaryPanel).getByTestId('lifecycle-lead')).toHaveTextContent('20m');
    expect(within(summaryPanel).getByTestId('lifecycle-wait')).toHaveTextContent('7m wait');
    expect(within(summaryPanel).getByTestId('lifecycle-dining')).toHaveTextContent('+15m over');
    // This includes the discharge, which was not recorded on the selected day..
    expect(feedIds()).toEqual([
      'history-entry-4', 'history-entry-3', 'history-entry-2', 'history-entry-1',
    ]);
    expect(calls.some((c) => c.url.includes('/by-reservation/1?'))).toBe(true);
  });

  it('says so when the looked-up reservation does not exist', async () => {
    const user = userEvent.setup();
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    await user.type(screen.getByLabelText('Look up a reservation by ID'), '999');
    expect(await screen.findByTestId('lifecycle-not-found')).toHaveTextContent('#RES-999');
  });

  it('does not query the API for text that is not a reservation ID', async () => {
    const user = userEvent.setup();
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    await user.type(screen.getByLabelText('Look up a reservation by ID'), 'carlos');
    expect(screen.getByText(/Type a reservation ID/i)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/by-reservation/'))).toBe(false);
  });

  it('is read-only: never offers to edit history and never writes', async () => {
    renderIn(<ReservationStatusHistoryView />);
    await screen.findByTestId('history-feed');

    expect(screen.queryByRole('button', { name: /edit|remove|delete/i })).not.toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('links the #RES badge to the reservation book', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderIn(<ReservationStatusHistoryView onNavigate={onNavigate} />);
    const entry = await screen.findByTestId('history-entry-4');

    await user.click(within(entry).getByRole('button', { name: /#RES-1/ }));
    expect(onNavigate).toHaveBeenCalledWith('reservations');
  });

  it('shows the empty state when nothing was logged on the day', async () => {
    dayRows = [];
    renderIn(<ReservationStatusHistoryView />);
    expect(await screen.findByTestId('history-empty-state')).toBeInTheDocument();
  });
});
