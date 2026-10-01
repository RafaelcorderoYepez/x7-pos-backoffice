import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationNotesView } from './ReservationNotesView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// The workspace always resides within the application router: the standard quick access panel uses useNavigate to drop to the public URL when there is no onNavigate.
const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const at = (h: number, m = 0): string => new Date(2026, 3, 16, h, m, 0).toISOString();

const note = (
  id: number,
  reservationId: number,
  text: string,
  hour: number,
  createdBy = 2,
) => ({
  id,
  reservation_id: reservationId,
  note: text,
  created_by: createdBy,
  created_at: at(hour),
  is_active: true,
});

const RESERVATIONS = [
  {
    id: 1, merchant_id: 3, customer_id: null, reservation_date: at(19), duration_minutes: 90,
    seated_at: null, party_size: 4, status: 'confirmed', source: 'phone',
    special_requests: 'Window seat preferred', created_by: 2,
    guests: [{ id: 1, reservation_id: 1, name: 'Carlos Mendoza', is_primary: true, is_active: true }],
    notes: [
      note(1, 1, '[ALLERGY] Severe peanut allergy on Seat 2', 17),
      note(2, 1, '[SEATING] Prefers quiet booth near window', 16),
    ],
  },
  {
    id: 2, merchant_id: 3, customer_id: null, reservation_date: at(20), duration_minutes: 120,
    seated_at: null, party_size: 2, status: 'pending', source: 'online',
    special_requests: null, created_by: 2,
    guests: [{ id: 2, reservation_id: 2, name: 'Lucía Prat', is_primary: true, is_active: true }],
    notes: [
      note(3, 2, '[OCCASION] Celebrating 10th Anniversary', 18),
      // Inactive: should not appear in the feed.
      { ...note(4, 2, '[VIP] old note', 15), is_active: false },
    ],
  },
];

const STAFF = [{ id: 9, user_id: 2, name: 'Ana Ruiz', role: 'host' }];

let reservationRows = RESERVATIONS;
const calls: Array<{ url: string; method: string; body?: unknown }> = [];

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

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (url.includes('/reservation?')) {
        return jsonResponse({ statusCode: 200, data: reservationRows, total: reservationRows.length });
      }
      if (url.includes('/collaborators')) return jsonResponse({ statusCode: 200, data: STAFF });
      if (url.includes('/customers')) return jsonResponse([]);
      if (url.includes('/reservation-note')) {
        return jsonResponse({ statusCode: 201, data: note(99, 1, 'new', 19) });
      }
      return jsonResponse({ statusCode: 200, data: [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderView = async () => {
  renderIn(<ReservationNotesView merchantId={3} />);
  await waitFor(() => expect(screen.getByTestId('notes-feed')).toBeInTheDocument());
};

describe('chronological feed', () => {
  it('Sort the notes from newest to oldest', async () => {
    await renderView();
    const cards = screen.getAllByTestId(/^note-card-/);
    // 18:00 (id 3) > 17:00 (id 1) > 16:00 (id 2).
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'note-card-3',
      'note-card-1',
      'note-card-2',
    ]);
  });

  it('leaves out the inactive notes', async () => {
    await renderView();
    expect(screen.queryByTestId('note-card-4')).not.toBeInTheDocument();
  });

  it('links each note with its reservation and guest', async () => {
    await renderView();
    const card = screen.getByTestId('note-card-1');
    expect(card).toHaveTextContent('#RES-1');
    expect(card).toHaveTextContent('Carlos Mendoza');
  });

  it('Sign the note with the name of the author and role', async () => {
    await renderView();
    // created_by = 2 resolves against the contributor's user_id.
    expect(screen.getByTestId('note-card-1')).toHaveTextContent('Ana Ruiz (Host)');
  });

  it('shows relative time and exact stamp', async () => {
    await renderView();
    expect(screen.getByTestId('note-card-1')).toHaveTextContent(/ago • 16\/04\/2026 17:00/);
  });
});

describe('priority highlighting', () => {
  it('marks the allergy as priority', async () => {
    await renderView();
    expect(screen.getByTestId('priority-flag-1')).toBeInTheDocument();
    expect(screen.getByTestId('note-card-1')).toHaveTextContent('Allergies');
  });

  it('does not mark as priority a note about a seat or occasion', async () => {
    await renderView();
    expect(screen.queryByTestId('priority-flag-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('priority-flag-3')).not.toBeInTheDocument();
  });

  it('Paint the allergy with the red danger border.', async () => {
    await renderView();
    expect(screen.getByTestId('note-card-1').className).toContain('border-[#ef4444]');
  });
});

describe('Shift KPIs', () => {
  it('counts the total of active notes of the day', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-total')).getByText('3')).toBeInTheDocument();
  });

  it('counts allergy alerts', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-allergy')).getByText('1')).toBeInTheDocument();
  });

  it('counts special occasions', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-occasion')).getByText('1')).toBeInTheDocument();
  });

  it('Shift KPIs measure the entire shift, not the filtered results', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search notes/i }), 'peanut');

    await waitFor(() => expect(screen.queryByTestId('note-card-3')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('kpi-total')).getByText('3')).toBeInTheDocument();
  });
});

describe('search and filters', () => {
  it('searches by keyword from the note body', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search notes/i }), 'anniversary');

    await waitFor(() => expect(screen.queryByTestId('note-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('note-card-3')).toBeInTheDocument();
  });

  it('searches by guest name', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search notes/i }), 'lucía');

    await waitFor(() => expect(screen.queryByTestId('note-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('note-card-3')).toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /allergies/i }));

    await waitFor(() => expect(screen.queryByTestId('note-card-3')).not.toBeInTheDocument());
    expect(screen.getByTestId('note-card-1')).toBeInTheDocument();
  });

  it('the filter does not request data from the server again', async () => {
    const user = userEvent.setup();
    await renderView();
    const before = calls.filter((c) => c.url.includes('/reservation?')).length;

    await user.type(screen.getByRole('searchbox', { name: /search notes/i }), 'peanut');

    await waitFor(() => expect(screen.queryByTestId('note-card-3')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.url.includes('/reservation?')).length).toBe(before);
  });
});

describe('drawer de alta', () => {
  const openDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /add note/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    return screen.getByRole('dialog');
  };

  it('inserts the prefix of the quick label', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    await user.click(within(dialog).getByRole('button', { name: /allergy/i }));

    expect(within(dialog).getByLabelText(/^note$/i)).toHaveValue('[ALLERGY] ');
  });

  it('replaces the previous label instead of chaining them', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    const body = within(dialog).getByLabelText(/^note$/i);
    await user.type(body, 'Quiet corner please');
    await user.click(within(dialog).getByRole('button', { name: /seating/i }));
    await user.click(within(dialog).getByRole('button', { name: /vip/i }));

    expect(body).toHaveValue('[VIP] Quiet corner please');
  });

  it('writes just after clicking the label without displacing the text', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

// Regression: the cursor returned to the end of the PREFIX one frame after the click, so
// the sentence was broken and inserted ("[OCCASION] rthday cake at 21:30 Surprise bi").
    await user.click(within(dialog).getByRole('button', { name: /occasion/i }));
    const body = within(dialog).getByLabelText(/^note$/i);
    await user.type(body, 'Surprise birthday cake at 21:30');

    expect(body).toHaveValue('[OCCASION] Surprise birthday cake at 21:30');
  });

  it('Preview the enhancement it will have in the pass', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    await user.type(within(dialog).getByLabelText(/^note$/i), 'Severe shellfish allergy');

    const preview = within(dialog).getByTestId('note-preview');
    expect(preview).toHaveTextContent('Allergies');
    expect(preview.className).toContain('border-[#ef4444]');
    expect(within(dialog).getByText(/flagged to the kitchen and floor teams/i)).toBeInTheDocument();
  });

  it('rejects a note of pure spaces', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    await user.type(within(dialog).getByLabelText(/^note$/i), '    ');
    await user.click(within(dialog).getByRole('button', { name: /^add note$/i }));

    expect(await within(dialog).findByText(/The note cannot be empty/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('saves the note against the selected reservation, without sending created_by', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    await user.selectOptions(within(dialog).getByLabelText(/reservation/i), '2');
    await user.type(within(dialog).getByLabelText(/^note$/i), 'Birthday cake at dessert');
    await user.click(within(dialog).getByRole('button', { name: /^add note$/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.includes('/reservation-note'));
      expect(post?.body).toEqual({ reservation_id: 2, note: 'Birthday cake at dessert' });
      // The author seals it on the server from the token.
      expect(post?.body).not.toHaveProperty('created_by');
    });
  });

  it('shows the already registered request in the reservation as context', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    expect(within(dialog).getByText(/Window seat preferred/)).toBeInTheDocument();
  });
});

describe('empty state', () => {
  it('invites to write when the shift has no notes', async () => {
    reservationRows = [{ ...RESERVATIONS[0], notes: [] }];
    renderIn(<ReservationNotesView merchantId={3} />);
    await waitFor(() => expect(screen.getByTestId('notes-empty-state')).toBeInTheDocument());
  });
});
