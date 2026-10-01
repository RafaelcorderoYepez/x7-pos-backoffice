import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationGuestsView } from './ReservationGuestsView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// The workspace always lives inside the application router: the standard quick access panel uses useNavigate to drop to the public URL when there is no onNavigate.
const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const at = (h: number): string => new Date(2026, 3, 16, h, 0, 0).toISOString();

const g = (
  id: number,
  reservationId: number,
  name: string,
  extra: Partial<{ email: string; phone: string; is_primary: boolean; is_active: boolean }> = {},
) => ({
  id,
  reservation_id: reservationId,
  name,
  email: extra.email ?? null,
  phone: extra.phone ?? null,
  is_primary: extra.is_primary ?? false,
  is_active: extra.is_active ?? true,
});

// RES-1: Full roster (2 out of 2) with main player contactable.
// RES-2: Incomplete roster (1 out of 4), main player without contact information.
// RES-3: No one registered.
const RESERVATIONS = [
  {
    id: 1, merchant_id: 3, customer_id: null, reservation_date: at(19), duration_minutes: 90,
    seated_at: null, party_size: 2, status: 'confirmed', source: 'phone', special_requests: null,
    created_by: 2,
    guests: [
      g(1, 1, 'Carlos Mendoza', { phone: '+34600333444', email: 'carlos@example.com', is_primary: true }),
      g(2, 1, 'Guest 2'),
      g(9, 1, 'Old companion', { is_active: false }),
    ],
  },
  {
    id: 2, merchant_id: 3, customer_id: null, reservation_date: at(20), duration_minutes: 120,
    seated_at: null, party_size: 4, status: 'pending', source: 'online', special_requests: null,
    created_by: 2,
    guests: [g(3, 2, 'Lucía Prat', { is_primary: true })],
  },
  {
    id: 3, merchant_id: 3, customer_id: null, reservation_date: at(21), duration_minutes: 90,
    seated_at: null, party_size: 6, status: 'confirmed', source: 'qr', special_requests: null,
    created_by: 2, guests: [],
  },
];

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
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (url.includes('/reservation?')) {
        return jsonResponse({ statusCode: 200, data: reservationRows, total: reservationRows.length });
      }
      if (url.includes('/customers')) return jsonResponse([]);
      if (url.includes('/reservation-guest')) {
        return jsonResponse({ statusCode: 201, data: g(99, 1, 'New') });
      }
      return jsonResponse({ statusCode: 200, data: [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderView = async () => {
  renderIn(<ReservationGuestsView merchantId={3} />);
  await waitFor(() => expect(screen.getByTestId('guest-roster')).toBeInTheDocument());
};

describe('reserve roster', () => {
  it('group the guests under your reservation', async () => {
    await renderView();
    const card = screen.getByTestId('roster-card-1');
    expect(within(card).getByTestId('guest-row-1')).toBeInTheDocument();
    expect(within(card).getByTestId('guest-row-2')).toBeInTheDocument();
  });

  it('It excludes decommissioned cards', async () => {
    await renderView();
    expect(screen.queryByTestId('guest-row-9')).not.toBeInTheDocument();
  });

  it('renders the badge #GST-{id} and the name', async () => {
    await renderView();
    const row = screen.getByTestId('guest-row-1');
    expect(row).toHaveTextContent('#GST-1');
    expect(row).toHaveTextContent('Carlos Mendoza');
  });

  it('links the parent reservation with its badge #RES-{id}', async () => {
    await renderView();
    expect(screen.getByTestId('roster-card-1')).toHaveTextContent('#RES-1');
  });

  it('shows the roster counter next to the group size', async () => {
    await renderView();
    expect(screen.getByTestId('roster-count-1')).toHaveTextContent('Registered 2 of 2 Guests');
    expect(screen.getByTestId('roster-count-2')).toHaveTextContent('Registered 1 of 4 Guests');
  });

  it('shows the reservations without anyone registered', async () => {
    await renderView();
    const empty = screen.getByTestId('roster-card-3');
    expect(empty).toHaveTextContent(/Nobody registered on this booking yet/);
    expect(empty).toHaveTextContent('6 guests expected');
  });
});

describe('main contact', () => {
  it('Mark the main one with your pill', async () => {
    await renderView();
    expect(screen.getByTestId('primary-badge-1')).toHaveTextContent('Primary contact');
    expect(screen.queryByTestId('primary-badge-2')).not.toBeInTheDocument();
  });

  it('only offers "Make primary" to those who are not the primary', async () => {
    await renderView();
    expect(
      within(screen.getByTestId('guest-row-2')).getByRole('button', { name: /make primary/i }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('guest-row-1')).queryByRole('button', { name: /make primary/i }),
    ).not.toBeInTheDocument();
  });

  it('Promoting sends a single patch: the server downgrades to the previous one.', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      within(screen.getByTestId('guest-row-2')).getByRole('button', { name: /make primary/i }),
    );

    await waitFor(() => {
      const patches = calls.filter((c) => c.method === 'PATCH');
      expect(patches).toHaveLength(1);
      expect(patches[0].url).toContain('/reservation-guest/2');
      expect(patches[0].body).toEqual({ is_primary: true });
    });
  });

  it('Give notice before removing the main person and say who is taking over.', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      within(screen.getByTestId('guest-row-1')).getByRole('button', { name: /remove/i }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/Carlos Mendoza is the primary contact.*promotes Guest 2/s),
    );
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/reservation-guest/1'))).toBe(true),
    );
  });

  it('canceling the alert does not delete anything', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    await renderView();

    await user.click(
      within(screen.getByTestId('guest-row-1')).getByRole('button', { name: /remove/i }),
    );

    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('Removing a regular passenger does not ask any questions', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      within(screen.getByTestId('guest-row-2')).getByRole('button', { name: /remove/i }),
    );

    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('Give notice of the roster without a main contact', async () => {
    reservationRows = [{ ...RESERVATIONS[0], guests: [g(1, 1, 'Carlos Mendoza')] }];
    renderIn(<ReservationGuestsView merchantId={3} />);
    await waitFor(() => expect(screen.getByTestId('guest-roster')).toBeInTheDocument());
    expect(screen.getByTestId('primary-warning-1')).toHaveTextContent(/No primary contact/);
  });
});

describe('direct contact links', () => {
  it('the phone is a tel: link without separators', async () => {
    await renderView();
    const tel = within(screen.getByTestId('guest-row-1')).getByRole('link', { name: /600333444/ });
    expect(tel).toHaveAttribute('href', 'tel:+34600333444');
  });

  it('the email is a mailto: link', async () => {
    await renderView();
    const mail = within(screen.getByTestId('guest-row-1')).getByRole('link', { name: /carlos@example/ });
    expect(mail).toHaveAttribute('href', 'mailto:carlos@example.com');
  });

  it('Without data, it is impossible to pinpoint dead links.', async () => {
    await renderView();
    const row = screen.getByTestId('guest-row-2');
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
    expect(row).toHaveTextContent('No contact details');
  });
});

describe('KPIs del roster', () => {
  it('Count the active chips of the day', async () => {
    await renderView();
    // 2in RES-1 (the inactive one doesn't count) + 1 in RES-2.
    expect(within(screen.getByTestId('kpi-registered')).getByText('3')).toBeInTheDocument();
  });

  it('The reservations account has a main contact person.', async () => {
    await renderView();
    const kpi = screen.getByTestId('kpi-primary-contacts');
    // RES-1 only: the main office of RES-2 has neither a telephone nor mail.
    expect(within(kpi).getByText('1')).toBeInTheDocument();
    expect(within(kpi).getByText(/33\.3% of bookings reachable/)).toBeInTheDocument();
  });

  it('averages the composition across all reserves', async () => {
    await renderView();
    // 3 chips / 3 reserves.
    expect(within(screen.getByTestId('kpi-average-party')).getByText('1.0')).toBeInTheDocument();
  });
});

describe('search and filters', () => {
  it('finds a guest by phone number', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search guests/i }), '600333');

    await waitFor(() => expect(screen.queryByTestId('guest-row-3')).not.toBeInTheDocument());
    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument();
    // And it reveals the associated reserve.
    expect(screen.getByTestId('roster-card-1')).toHaveTextContent('#RES-1');
  });

  it('finds a guest by email', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search guests/i }), 'carlos@example');

    await waitFor(() => expect(screen.queryByTestId('guest-row-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument();
  });

  it('isolates the primary contacts', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /primary contacts only/i }));

    await waitFor(() => expect(screen.queryByTestId('guest-row-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('guest-row-3')).toBeInTheDocument();
  });

  it('isolate incomplete rosters', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /incomplete rosters/i }));

    // RES-1 is complete (2 of 2) and disappears; RES-2 continues.
    await waitFor(() => expect(screen.queryByTestId('guest-row-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('guest-row-3')).toBeInTheDocument();
  });

  it('the filter does not request data from the server again', async () => {
    const user = userEvent.setup();
    await renderView();
    const before = calls.filter((c) => c.url.includes('/reservation?')).length;

    await user.type(screen.getByRole('searchbox', { name: /search guests/i }), '600333');

    await waitFor(() => expect(screen.queryByTestId('guest-row-3')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.url.includes('/reservation?')).length).toBe(before);
  });
});

describe('drawer for high and low editing', () => {
  const openAdd = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole('button', { name: /^add guest$/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    return screen.getByRole('dialog');
  };

  it('adds a guest to the selected reservation', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.selectOptions(within(dialog).getByLabelText(/reservation/i), '2');
    await user.type(within(dialog).getByLabelText(/guest name/i), 'Marta Gil');
    await user.type(within(dialog).getByLabelText(/^phone$/i), '+34 600 555 444');
    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST');
      expect(post?.body).toMatchObject({
        reservation_id: 2,
        name: 'Marta Gil',
        // Without separators: this is what @IsPhoneNumber accepts and what fits in varchar(20).
        phone: '+34600555444',
      });
    });
  });

  it('rejects an empty name', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }));

    expect(await within(dialog).findByText(/Guest name is required/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('rejects a name that exceeds the column limit', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    const nameField = within(dialog).getByLabelText(/guest name/i);
    // maxLength is truncated in the browser, so the value is forced to test the rule..
    await user.click(nameField);
    await user.paste('x'.repeat(140));
    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }));

    // Either the input was truncated to 100 (valid), or the error is seen: nothing >100 is ever sent
    const post = calls.find((c) => c.method === 'POST');
    expect(String((post?.body as { name?: string })?.name ?? '').length).toBeLessThanOrEqual(100);
  });

  it('rejects a national phone number that the backend would return as 400', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.type(within(dialog).getByLabelText(/guest name/i), 'Marta');
    await user.type(within(dialog).getByLabelText(/^phone$/i), '600555444');

    expect(within(dialog).getByText(/international format/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('It alerts you to whom you move the main switch.', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.type(within(dialog).getByLabelText(/guest name/i), 'Marta');
    await user.click(within(dialog).getByRole('switch'));

    expect(within(dialog).getByTestId('primary-handover')).toHaveTextContent(
      /Carlos Mendoza is the primary contact right now/,
    );
  });

  it('the counter projects the card that is being written', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.selectOptions(within(dialog).getByLabelText(/reservation/i), '2');
    expect(within(dialog).getByTestId('roster-counter')).toHaveTextContent(
      'Registered 1 of 4 Guests',
    );

    await user.type(within(dialog).getByLabelText(/guest name/i), 'Marta');
    expect(within(dialog).getByTestId('roster-counter')).toHaveTextContent(
      'Registered 2 of 4 Guests',
    );
  });

  it('the quick add registers a generic guest without closing the drawer', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.selectOptions(within(dialog).getByLabelText(/reservation/i), '2');
    await user.click(within(dialog).getByRole('button', { name: /quick add "Guest 2"/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST');
      expect(post?.body).toMatchObject({ reservation_id: 2, name: 'Guest 2' });
    });
    // The drawer remains open to chain the next action.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('editing locks the reservation change', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(within(screen.getByTestId('guest-row-2')).getByRole('button', { name: /edit/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText(/reservation/i)).toBeDisabled();
    expect(within(dialog).getByLabelText(/guest name/i)).toHaveValue('Guest 2');
  });
});
