import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationTablesView } from './ReservationTablesView';

vi.mock('../../../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/auth-storage')>()),
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// The workspace always lives within the application router: the access panel
// standard quick uses useNavigate to drop to the public URL when there is no onNavigate.
const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const at = (h: number, m = 0): string => new Date(2026, 3, 16, h, m, 0).toISOString();

const ZONE_MAIN = { id: 1, name: 'Main Dining', color: '#3b82f6' };
const ZONE_TERRACE = { id: 2, name: 'Terrace', color: '#10b981' };

const TABLES = [
  { id: 10, merchant_id: 3, number: 'A1', capacity: 2, status: 'available', floorZone: ZONE_MAIN, pos_x: 0, pos_y: 0 },
  { id: 11, merchant_id: 3, number: 'A2', capacity: 4, status: 'available', floorZone: ZONE_MAIN, pos_x: 100, pos_y: 0 },
  { id: 12, merchant_id: 3, number: 'T1', capacity: 6, status: 'available', floorZone: ZONE_TERRACE, pos_x: 0, pos_y: 400 },
  // Free all night: it is the one that allows you to try a combination of two tables without crashing.
  { id: 13, merchant_id: 3, number: 'T2', capacity: 2, status: 'available', floorZone: ZONE_TERRACE, pos_x: 100, pos_y: 400 },
];

// RES-1 seated in A2 (4 seats, group of 4) — sufficient capacity.
// RES-2 confirmed without table — is the one that must be resolved.
// RES-3 with A1 (2 places) for a group of 5 — insufficient capacity.
// RES-4 voided, retains its row but no longer retains the table.
const RESERVATIONS = [
  {
    id: 1, merchant_id: 3, customer_id: null, reservation_date: at(19), duration_minutes: 90,
    seated_at: null, party_size: 4, status: 'confirmed', source: 'phone', special_requests: null,
    created_by: 2, guests: [{ id: 1, reservation_id: 1, name: 'Carlos Mendoza', is_primary: true, is_active: true }],
    tables: [{ reservation_id: 1, table_id: 11, is_active: true }],
  },
  {
    id: 2, merchant_id: 3, customer_id: null, reservation_date: at(20), duration_minutes: 90,
    seated_at: null, party_size: 5, status: 'confirmed', source: 'online', special_requests: null,
    created_by: 2, guests: [{ id: 2, reservation_id: 2, name: 'Lucia Prat', is_primary: true, is_active: true }],
    tables: [],
  },
  {
    id: 3, merchant_id: 3, customer_id: null, reservation_date: at(21), duration_minutes: 90,
    seated_at: null, party_size: 5, status: 'pending', source: 'qr', special_requests: null,
    created_by: 2, guests: [{ id: 3, reservation_id: 3, name: 'Ana Ruiz', is_primary: true, is_active: true }],
    tables: [{ reservation_id: 3, table_id: 10, is_active: true }],
  },
  {
    id: 4, merchant_id: 3, customer_id: null, reservation_date: at(19), duration_minutes: 90,
    seated_at: null, party_size: 2, status: 'cancelled', source: 'phone', special_requests: null,
    created_by: 2, guests: [], tables: [{ reservation_id: 4, table_id: 12, is_active: true }],
  },
];

let reservationRows = RESERVATIONS;
const calls: Array<{ url: string; method: string; body?: unknown }> = [];
let bulkStatus = 201;

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  } as Response);

beforeEach(() => {
  reservationRows = RESERVATIONS;
  calls.length = 0;
  bulkStatus = 201;

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (url.includes('/reservation?')) {
        return jsonResponse({ statusCode: 200, data: reservationRows, total: reservationRows.length });
      }
      if (url.includes('/tables')) return jsonResponse({ statusCode: 200, data: TABLES });
      if (url.includes('/customers')) return jsonResponse([]);
      if (url.includes('/reservation-table/bulk')) {
        return bulkStatus >= 400
          ? jsonResponse(
              { statusCode: 409, message: 'Table A1 is already booked by reservation #9 during this time window.' },
              409,
            )
          : jsonResponse({ statusCode: 201, data: [] });
      }
      if (url.includes('/reservation-table/')) return jsonResponse({ statusCode: 200, data: {} });
      return jsonResponse({ statusCode: 200, data: [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderView = async () => {
  renderIn(<ReservationTablesView merchantId={3} />);
  await waitFor(() => expect(screen.getByTestId('assignment-board')).toBeInTheDocument());
};

describe('assignment board', () => {
  it('paint the assigned tables with number, capacity and area', async () => {
    await renderView();
    const chip = screen.getByTestId('assigned-table-1-11');
    expect(chip).toHaveTextContent('#A2');
    expect(chip).toHaveTextContent('Cap: 4');
    expect(chip).toHaveTextContent('Main Dining');
  });

  it('leaves the reservations that have already released their table off the board', async () => {
    await renderView();
    // The canceled one retains its row at the base, but does not take up space in the room.
    expect(screen.queryByTestId('assignment-card-4')).not.toBeInTheDocument();
  });

  it('mark in green the capacity that covers the group', async () => {
    await renderView();
    expect(screen.getByTestId('capacity-badge-1')).toHaveTextContent('Seats 4 ≥ 4');
  });

  it('warns in amber when the capacity falls short', async () => {
    await renderView();
    // Group of 5 at a table of 2.
    expect(screen.getByTestId('capacity-badge-3')).toHaveTextContent('3 seat(s) short');
  });

  it('mark reservations without a table', async () => {
    await renderView();
    expect(screen.getByTestId('capacity-badge-2')).toHaveTextContent('No table assigned');
  });
});

describe('Occupancy KPIs', () => {
  it('counts assigned tables from live reservations', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-tables-assigned')).getByText('2')).toBeInTheDocument();
  });

  it('Add the assigned capacity to the total of the room', async () => {
    await renderView();
    const kpi = screen.getByTestId('kpi-assigned-seats');
    expect(within(kpi).getByText('6')).toBeInTheDocument();
    expect(within(kpi).getByText(/of 14 seats in the room/)).toBeInTheDocument();
  });

  it('count the reservations that are still without a table', async () => {
    await renderView();
    const kpi = screen.getByTestId('kpi-unassigned');
    expect(within(kpi).getByText('1')).toBeInTheDocument();
    expect(within(kpi).getByText(/5 guests still to seat/)).toBeInTheDocument();
  });
});

describe('reservation alert without table', () => {
  it('notifies upcoming reservations that have nowhere to sit', async () => {
    await renderView();
    const alert = screen.getByTestId('unassigned-alert');
    expect(alert).toHaveTextContent('1 upcoming booking');
    expect(alert).toHaveTextContent('5 guests');
  });

  it('alert shortcut isolates reservations without a table', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(within(screen.getByTestId('unassigned-alert')).getByRole('button', { name: /show them/i }));

    await waitFor(() => expect(screen.queryByTestId('assignment-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('assignment-card-2')).toBeInTheDocument();
  });

  it('does not appear when everything is seated', async () => {
    reservationRows = [RESERVATIONS[0]];
    renderIn(<ReservationTablesView merchantId={3} />);
    await waitFor(() => expect(screen.getByTestId('assignment-board')).toBeInTheDocument());
    expect(screen.queryByTestId('unassigned-alert')).not.toBeInTheDocument();
  });
});

describe('filter by zone', () => {
  it('offers the inventory areas with their count', async () => {
    await renderView();
    expect(screen.getByRole('button', { name: /Main Dining \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Terrace \(2\)/ })).toBeInTheDocument();
  });

  it('filter the board by room section', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: /Main Dining/ }));

    await waitFor(() => expect(screen.queryByTestId('assignment-card-2')).not.toBeInTheDocument());
    // RES-1 (A2) and RES-3 (A1) are in Main Dining.
    expect(screen.getByTestId('assignment-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('assignment-card-3')).toBeInTheDocument();
  });

  it('vuelve a mostrarlo todo con "All zones"', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: /Terrace/ }));
    await waitFor(() => expect(screen.queryByTestId('assignment-card-1')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /all zones/i }));

    await waitFor(() => expect(screen.getByTestId('assignment-card-1')).toBeInTheDocument());
  });

  it('the filter does not request data from the server again', async () => {
    const user = userEvent.setup();
    await renderView();
    const before = calls.filter((c) => c.url.includes('/reservation?')).length;

    await user.click(screen.getByRole('button', { name: /Main Dining/ }));

    await waitFor(() => expect(screen.queryByTestId('assignment-card-2')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.url.includes('/reservation?')).length).toBe(before);
  });
});

describe('table selector', () => {
  const openPicker = async (user: ReturnType<typeof userEvent.setup>, cardId: number) => {
    await user.click(
      within(screen.getByTestId(`assignment-card-${cardId}`)).getByRole('button', {
        name: /assign tables|change tables/i,
      }),
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  };

  it('suggests the optimal combination for the group', async () => {
    const user = userEvent.setup();
    await renderView();
    await openPicker(user, 2); // group of 5

    const suggestions = within(screen.getByRole('dialog')).getByTestId('table-suggestions');
    // T1 (6 seats) is the smallest free space that exceeds 5 in the RES-2 strip.
    expect(within(suggestions).getByText(/#T1 · 6 seats · 1 seat spare/)).toBeInTheDocument();
  });

  it('It does not allow marking an occupied table in the same slot', async () => {
    const user = userEvent.setup();
    await renderView();
    await openPicker(user, 2);

    const dialog = screen.getByRole('dialog');
    // A2 is held by RES-1 from 19:00 to 20:30, which overlaps with RES-2 (20:00-21:30).
    const busyBefore = within(dialog).getByTestId('table-option-11');
    expect(busyBefore).toBeDisabled();
    expect(busyBefore).toHaveTextContent('#RES-1');

    // A1 is held by RES-3 from 9:00 p.m. to 10:30 p.m., which also overlaps.
    expect(within(dialog).getByTestId('table-option-10')).toBeDisabled();

    // T1 had a CANCELED reservation, which no longer retains anything: it is free.
    expect(within(dialog).getByTestId('table-option-12')).toBeEnabled();
  });

  it('saves the chosen combination in a single transactional call', async () => {
    const user = userEvent.setup();
    await renderView();
    await openPicker(user, 2);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByTestId('table-option-12'));
    await user.click(within(dialog).getByTestId('table-option-13'));
    await user.click(within(dialog).getByRole('button', { name: /save assignment/i }));

    await waitFor(() => {
      const bulk = calls.find((c) => c.url.includes('/reservation-table/bulk'));
      expect(bulk?.method).toBe('POST');
      // The two tables travel in ONE request: the backend inserts them in a transaction.
      expect(bulk?.body).toEqual({ reservation_id: 2, table_ids: [12, 13] });
    });
    expect(calls.filter((c) => c.url.includes('/bulk'))).toHaveLength(1);
  });

  it('shows the 409 of the server as is, with table and reservation in conflict', async () => {
    const user = userEvent.setup();
    bulkStatus = 409;
    await renderView();
    await openPicker(user, 2);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByTestId('table-option-12'));
    await user.click(within(dialog).getByRole('button', { name: /save assignment/i }));

    expect(
      await within(dialog).findByText(/already booked by reservation #9/i),
    ).toBeInTheDocument();
  });

  it('release removed tables before occupying new ones', async () => {
    const user = userEvent.setup();
    await renderView();
    await openPicker(user, 1); // ya tiene A2

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByTestId('table-option-11')); // quitar A2
    await user.click(within(dialog).getByTestId('table-option-12')); // poner T1
    await user.click(within(dialog).getByRole('button', { name: /save assignment/i }));

    await waitFor(() => expect(calls.some((c) => c.url.includes('/bulk'))).toBe(true));
    const deleteIdx = calls.findIndex((c) => c.method === 'DELETE');
    const bulkIdx = calls.findIndex((c) => c.url.includes('/bulk'));
    // Releasing before occupying prevents the reserve from colliding with itself in the guard.
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(bulkIdx);
  });

  it('summarizes the capacity of what is selected in front of the group', async () => {
    const user = userEvent.setup();
    await renderView();
    await openPicker(user, 2);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByTestId('table-option-13')); // 2 places for 5
    expect(within(dialog).getByTestId('picker-summary')).toHaveTextContent('3 seat(s) short');

    await user.click(within(dialog).getByTestId('table-option-12')); // + 6 plazas
    expect(within(dialog).getByTestId('picker-summary')).toHaveTextContent('8 seats for a party of 5');
  });
});

describe('drop a table', () => {
  it('free the table from the pill itself', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: /release table A2 from #RES-1/i }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'DELETE' && c.url.includes('/reservation-table/1/11')),
      ).toBe(true),
    );
  });
});
