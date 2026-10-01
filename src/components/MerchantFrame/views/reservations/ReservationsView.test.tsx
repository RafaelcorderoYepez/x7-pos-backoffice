import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationsView } from './ReservationsView';

let storedRole = 'merchant_admin';
vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
  getStoredUser: vi.fn(() => ({ id: 2, role: storedRole, merchant: { id: 3 } })),
}));

// The workspace always lives inside the application router: the standard quick access panel uses useNavigate to drop to the public URL when there is no onNavigate.
const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

// Moments in local time: the grill is grouped by the time shown on the local clock..
const at = (h: number, m = 0): string => new Date(2026, 3, 16, h, m, 0).toISOString();

const RESERVATIONS = [
  {
    id: 1,
    merchant_id: 3,
    customer_id: 44,
    reservation_date: at(19),
    duration_minutes: 90,
    seated_at: null,
    party_size: 4,
    status: 'pending',
    source: 'phone',
    special_requests: 'Happy Birthday!',
    created_by: 7,
    guests: [],
  },
  {
    id: 2,
    merchant_id: 3,
    customer_id: null,
    reservation_date: at(20),
    duration_minutes: 120,
    seated_at: at(20, 4),
    party_size: 2,
    status: 'seated',
    source: 'walk_in',
    special_requests: null,
    created_by: 7,
    guests: [
      {
        id: 9,
        reservation_id: 2,
        name: 'Carlos Mendoza',
        email: 'carlos@example.com',
        phone: '600333444',
        is_primary: true,
        is_active: true,
      },
    ],
  },
  {
    id: 3,
    merchant_id: 3,
    customer_id: null,
    reservation_date: at(21),
    duration_minutes: 90,
    seated_at: null,
    party_size: 6,
    status: 'no_show',
    source: 'online',
    special_requests: null,
    created_by: 7,
    guests: [],
  },
];

const CUSTOMERS = [
  { id: 44, name: 'Lucía Prat', email: 'lucia@example.com', phone: '600111222', merchantId: 3 },
  { id: 45, name: 'Ana Ruiz', email: 'ana@example.com', phone: '600999888', merchantId: 3 },
];

const TABLES = [
  { id: 10, number: 'A1', capacity: 4, status: 'available' },
  { id: 11, number: 'B2', capacity: 6, status: 'available' },
];

let reservationRows = RESERVATIONS;
const calls: Array<{ url: string; method: string; body?: unknown }> = [];

// Availability matrix served by the backend: 19:00 free, 19:15 adjusted, 19:30 full for the requested group, 19:45 free.
const slot = (time: string, level: string, bookable = true, over: Record<string, unknown> = {}) => ({
  time,
  start: at(19, Number(time.slice(3))),
  booked_seats: level === 'available' ? 10 : level === 'limited' ? 45 : 58,
  projected_seats: 0,
  occupancy_pct: level === 'available' ? 16.7 : level === 'limited' ? 75 : 96.7,
  level,
  arrivals: 4,
  fits_capacity: bookable,
  fits_throttle: true,
  bookable,
  ...over,
});
const AVAILABILITY = {
  date: '2026-04-16',
  party_size: 4,
  duration_minutes: 90,
  seat_capacity: 60,
  capacity_source: 'settings',
  slot_interval_minutes: 15,
  max_covers_per_slot: 20,
  shifts: [
    {
      name: 'Dinner',
      start: '19:00',
      end: '20:00',
      occupancy_pct: 96.7,
      level: 'limited',
      slots: [
        slot('19:00', 'available'),
        slot('19:15', 'limited'),
        slot('19:30', 'sold_out', false),
        slot('19:45', 'available'),
      ],
    },
  ],
};
const SETTINGS = {
  seat_capacity: 60,
  effective_seat_capacity: 60,
  capacity_source: 'settings',
  slot_interval_minutes: 15,
  max_covers_per_slot: 20,
  shifts: [{ name: 'Dinner', start: '19:00', end: '23:00' }],
  updated_at: null,
};
const CAPACITY_409 = {
  statusCode: 409,
  error: 'Conflict',
  code: 'CAPACITY_OVERRIDE_REQUIRED',
  message: 'Over capacity: 58 of 60 seats are already committed around 19:00, so a party of 4 does not fit (2 free). A manager override is required to overbook.',
};
// When the server responds with a 409 capacity error if no override is provided.
let createConflict = false;
let confirmConflict = false;

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
  storedRole = 'merchant_admin';
  createConflict = false;
  confirmConflict = false;

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes('/reservation-capacity/availability')) {
        return jsonResponse({ statusCode: 200, data: AVAILABILITY });
      }
      if (url.includes('/reservation-capacity/settings')) {
        return jsonResponse({
          statusCode: 200,
          data: method === 'PUT' ? { ...SETTINGS, ...body } : SETTINGS,
        });
      }
      if (url.includes('/reservation?')) {
        return jsonResponse({ statusCode: 200, data: reservationRows, total: reservationRows.length });
      }
      if (url.includes('/customers')) return jsonResponse(CUSTOMERS);
      if (url.includes('/tables')) return jsonResponse({ statusCode: 200, data: TABLES });
      if (url.includes('/reservation-guest')) return jsonResponse({ statusCode: 201, data: {} });
      if (/\/reservation\/\d+\/cancel/.test(url)) {
        return jsonResponse({ statusCode: 200, data: { ...reservationRows[0], status: 'cancelled' } });
      }
      if (/\/reservation\/\d+$/.test(url)) {
        if (confirmConflict && body.status === 'confirmed' && !body.manager_override) {
          return jsonResponse(CAPACITY_409, 409);
        }
        return jsonResponse({ statusCode: 200, data: { ...reservationRows[0], ...body } });
      }
      if (url.endsWith('/reservation')) {
        if (createConflict && !body.manager_override) return jsonResponse(CAPACITY_409, 409);
        return jsonResponse({
          statusCode: 201,
          data: {
            ...RESERVATIONS[0],
            id: 99,
            capacity_override_by: body.manager_override ? 43 : null,
          },
        });
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
  renderIn(<ReservationsView merchantId={3} />);
  await waitFor(() => expect(screen.getByTestId('reservation-timeline')).toBeInTheDocument());
};

describe('hydration of the reserve book', () => {
  it('asks the server for the day so that the query uses the composite index', async () => {
    await renderView();
    const listCall = calls.find((c) => c.url.includes('/reservation?'));
    // A loose `date`: this is what the backend translates to a sargable range over
    // [merchant_id, reservation_date]. Filtering the day on the client would fetch the entire table.
    expect(listCall?.url).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    expect(listCall?.url).toContain('limit=100');
  });

  it('Paint each reservation in its time slot.', async () => {
    await renderView();
    const card = screen.getByTestId('booking-card-1');
    expect(within(card).getByText(/#RES-1/)).toBeInTheDocument();
    expect(within(card).getByText(/07:00 PM – 08:30 PM \(90 min\)/)).toBeInTheDocument();
  });

  it('It displays the CRM client name and the roster name.', async () => {
    await renderView();
    expect(within(screen.getByTestId('booking-card-1')).getByText('Lucía Prat')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('booking-card-2')).getByText('Carlos Mendoza'),
    ).toBeInTheDocument();
  });

  it('It highlights special requests only when they exist', async () => {
    await renderView();
    expect(screen.getByTestId('special-requests-1')).toHaveTextContent('Happy Birthday!');
    expect(screen.queryByTestId('special-requests-2')).not.toBeInTheDocument();
  });

  it('It shows the arrival time of a table that is already seated', async () => {
    await renderView();
    expect(within(screen.getByTestId('booking-card-2')).getByText(/Seated 08:04 PM/)).toBeInTheDocument();
  });

  it('It labels the source channel of each reservation', async () => {
    await renderView();
    expect(within(screen.getByTestId('booking-card-1')).getByText('Phone')).toBeInTheDocument();
    expect(within(screen.getByTestId('booking-card-2')).getByText('Walk-in')).toBeInTheDocument();
  });
});

describe('daily KPI strip', () => {
  it('It sums the expected guests, excluding the cancelled ones', async () => {
    await renderView();
    // 4 + 2 + 6 = 12.
    expect(within(screen.getByTestId('kpi-expected')).getByText('12')).toBeInTheDocument();
  });

  it('It counts the covers and their occupancy percentage', async () => {
    await renderView();
    const covered = screen.getByTestId('kpi-covered');
    expect(within(covered).getByText('2')).toBeInTheDocument();
    expect(within(covered).getByText(/16\.7% of expected covers/)).toBeInTheDocument();
  });

  it('It counts the pending confirmations', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-pending')).getByText('1')).toBeInTheDocument();
  });

  it('It calculates the no-show rate over the total of the day', async () => {
    await renderView();
    const noShow = screen.getByTestId('kpi-no-show');
    expect(within(noShow).getByText('33.3%')).toBeInTheDocument();
    expect(within(noShow).getByText('1 of 3 bookings')).toBeInTheDocument();
  });

  it('It measures the entire day, not just what the filters show', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /seated/i }));

    await waitFor(() => expect(screen.queryByTestId('booking-card-1')).not.toBeInTheDocument());
    // The service's no-show rate does not change because the host filters the view..
    expect(within(screen.getByTestId('kpi-no-show')).getByText('33.3%')).toBeInTheDocument();
  });
});

describe('filtering engine', () => {
  it('It filters by status when checking the box', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /pending/i }));

    await waitFor(() => expect(screen.queryByTestId('booking-card-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('booking-card-1')).toBeInTheDocument();
  });

  it('It filters by source channel', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /walk-in/i }));

    await waitFor(() => expect(screen.queryByTestId('booking-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('booking-card-2')).toBeInTheDocument();
  });

  it('It searches by special request', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search reservations/i }), 'birthday');

    await waitFor(() => expect(screen.queryByTestId('booking-card-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('booking-card-1')).toBeInTheDocument();
  });

  it('It searches by guest phone number', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search reservations/i }), '600333');

    await waitFor(() => expect(screen.queryByTestId('booking-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('booking-card-2')).toBeInTheDocument();
  });

  it('It does not re-request data from the server when filtering', async () => {
    const user = userEvent.setup();
    await renderView();
    const before = calls.filter((c) => c.url.includes('/reservation?')).length;

    await user.click(screen.getByRole('checkbox', { name: /pending/i }));

    await waitFor(() => expect(screen.queryByTestId('booking-card-2')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.url.includes('/reservation?')).length).toBe(before);
  });

  it('It offers to clear the filters when nothing is visible', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search reservations/i }), 'zzzz');

    await waitFor(() =>
      expect(screen.getByText(/No bookings match your active filters/)).toBeInTheDocument(),
    );
    const filterBar = screen.getByRole('region', { name: /reservation filters/i });
    await user.click(within(filterBar).getByRole('button', { name: /clear filters/i }));
    await waitFor(() => expect(screen.getByTestId('booking-card-1')).toBeInTheDocument());
  });
});

describe('lifecycle controller', () => {
  it('It only offers the legal transitions of each state', async () => {
    await renderView();

    const pending = screen.getByTestId('booking-card-1');
    expect(within(pending).getByRole('button', { name: 'Confirmed' })).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: 'Seated' })).toBeInTheDocument();
    // You cannot jump from slope to completed.
    expect(within(pending).queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();

    const seated = screen.getByTestId('booking-card-2');
    expect(within(seated).getByRole('button', { name: 'Completed' })).toBeInTheDocument();
    expect(within(seated).queryByRole('button', { name: 'Cancelled' })).not.toBeInTheDocument();
  });

  it('It closes the action bar in terminal states', async () => {
    await renderView();
    const noShow = screen.getByTestId('booking-card-3');
    expect(within(noShow).getByText(/Lifecycle closed/)).toBeInTheDocument();
    expect(within(noShow).queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();
  });

  it('It seats the table with a PATCH without sending seated_at (the server seals it)', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      within(screen.getByTestId('booking-card-1')).getByRole('button', { name: 'Seated' }),
    );

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH' && /\/reservation\/1$/.test(c.url));
      expect(patch).toBeDefined();
      expect(patch?.body).toEqual({ status: 'seated' });
    });
  });

  it('It confirms a reservation in a full slot, opening the override and retrying with credentials', async () => {
    confirmConflict = true;
    const user = userEvent.setup();
    await renderView();

    await user.click(
      within(screen.getByTestId('booking-card-1')).getByRole('button', { name: 'Confirmed' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('manager-override')).toHaveTextContent(/58 of 60 seats/);
    await user.type(within(dialog).getByLabelText(/manager email/i), 'boss@x.com');
    await user.type(within(dialog).getByLabelText(/manager password/i), 'S3cret!');
    await user.click(within(dialog).getByRole('button', { name: /authorize & confirmed/i }));

    await waitFor(() => {
      const retried = calls.filter(
        (c) => c.method === 'PATCH' && /\/reservation\/1$/.test(c.url),
      );
      expect(retried).toHaveLength(2);
      expect(retried[1].body).toEqual({
        status: 'confirmed',
        manager_override: { email: 'boss@x.com', password: 'S3cret!' },
      });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('It cancels a reservation using the dedicated endpoint that leaves a trail in the history', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      within(screen.getByTestId('booking-card-1')).getByRole('button', { name: 'Cancelled' }),
    );

    await waitFor(() =>
      expect(calls.some((c) => /\/reservation\/1\/cancel$/.test(c.url) && c.method === 'PATCH')).toBe(
        true,
      ),
    );
  });
});

describe('reservation registration', () => {
  const openDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /new reservation/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  };

  // The time is only chosen in the slot matrix: without pressing one, you cannot book.
  const pickSlot = async (user: ReturnType<typeof userEvent.setup>, time = '19:00') => {
    await user.click(await within(screen.getByRole('dialog')).findByTestId(`slot-${time}`));
  };

  it('It creates the reservation with the slot, group, duration and channel', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText(/party size/i));
    await user.type(within(dialog).getByLabelText(/party size/i), '3');
    await user.selectOptions(within(dialog).getByLabelText(/booking source/i), 'qr');
    await pickSlot(user);
    await user.type(
      within(dialog).getByLabelText(/special requests/i),
      'Window seat preferred',
    );
    await user.click(within(dialog).getByRole('button', { name: /book table/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
      expect(post?.body).toMatchObject({
        party_size: 3,
        duration_minutes: 90,
        source: 'qr',
        special_requests: 'Window seat preferred',
      });
    });
  });

  it('It does not send created_by: the server seals it from the token', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);
    await pickSlot(user);

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /book table/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
      expect(post).toBeDefined();
      expect(post?.body).not.toHaveProperty('created_by');
    });
  });

  it('It links an existing CRM customer via autocomplete', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: /link crm profile/i }));
    await user.type(within(dialog).getByLabelText(/search by name, phone or email/i), 'Ana');
    await user.click(await within(dialog).findByRole('button', { name: /Ana Ruiz/ }));

    expect(within(dialog).getByText(/Linked to Ana Ruiz \(customer #45\)/)).toBeInTheDocument();
    await pickSlot(user);

    await user.click(within(dialog).getByRole('button', { name: /book table/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
      expect(post?.body).toMatchObject({ customer_id: 45 });
    });
  });

  it('It creates a lightweight guest linked to the reservation when there are no matches', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/guest name/i), 'Marta Gil');
    await user.type(within(dialog).getByLabelText(/^phone$/i), '+34 600 555 444');
    await pickSlot(user);
    await user.click(within(dialog).getByRole('button', { name: /book table/i }));

    await waitFor(() => {
      const guestPost = calls.find((c) => c.url.includes('/reservation-guest'));
      expect(guestPost?.body).toMatchObject({
        reservation_id: 99,
        name: 'Marta Gil',
        // Without separators: @IsPhoneNumber rejects them and varchar(20) isn't that great.
        phone: '+34600555444',
        is_primary: true,
      });
    });
    // Without a CRM record behind it, the reservation does not have a customer_id..
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
    expect(post?.body).not.toHaveProperty('customer_id');
  });

  it('It paints the slot matrix with the server semaphore and selects the time when pressed', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    const matrix = await within(dialog).findByTestId('slot-matrix');
    await waitFor(() => expect(within(matrix).getByTestId('slot-19:15')).toBeInTheDocument());

    expect(within(matrix).getByTestId('slot-19:00')).toHaveAttribute('data-level', 'available');
    expect(within(matrix).getByTestId('slot-19:15')).toHaveAttribute('data-level', 'limited');
    expect(within(matrix).getByTestId('slot-19:30')).toHaveAttribute('data-level', 'sold_out');
    expect(within(matrix).getByTestId('slot-19:15')).toHaveAccessibleName(
      /19:15 — Limited capacity: 45 of 60 seats committed \(75%\)/,
    );

    // There is no longer a free time field: the selected time slot IS the reservation time.
    expect(within(dialog).queryByLabelText(/^time$/i)).not.toBeInTheDocument();
    await user.click(within(matrix).getByTestId('slot-19:45'));
    expect(within(matrix).getByTestId('slot-19:45')).toHaveAttribute('aria-pressed', 'true');

    const query = calls.find((c) => c.url.includes('/reservation-capacity/availability'));
    expect(query?.url).toMatch(/party_size=2&duration_minutes=90/);
  });

  it('It blocks a full slot until the manager authorizes with their credentials', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.click(await within(dialog).findByTestId('slot-19:30'));

    const panel = within(dialog).getByTestId('manager-override');
    expect(panel).toHaveTextContent(/sold out for a party of 4/i);
    const submit = within(dialog).getByRole('button', { name: /authorize & book/i });
    expect(submit).toBeDisabled();

    await user.type(within(panel).getByLabelText(/manager email/i), 'boss@x.com');
    expect(submit).toBeDisabled();
    await user.type(within(panel).getByLabelText(/manager password/i), 'S3cret!');
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
      expect(post?.body).toMatchObject({
        manager_override: { email: 'boss@x.com', password: 'S3cret!' },
      });
    });
    expect(await screen.findByText(/manager override/i)).toBeInTheDocument();
  });

  it('It does not request override in a free slot nor sends credentials', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.click(await within(dialog).findByTestId('slot-19:15'));
    expect(within(dialog).queryByTestId('manager-override')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /book table/i }));
    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
      expect(post?.body).not.toHaveProperty('manager_override');
    });
  });

  it('It requests override for a full slot when the server rejects the reservation', async () => {
    createConflict = true;
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await pickSlot(user, '19:00');
    await user.click(within(dialog).getByRole('button', { name: /book table/i }));

    const panel = await within(dialog).findByTestId('manager-override');
    expect(panel).toHaveTextContent(/58 of 60 seats/);

    // Another time slot: the 409 was at 7:00 PM, so the notice disappears.
    await user.click(within(dialog).getByTestId('slot-19:45'));
    expect(within(dialog).queryByTestId('manager-override')).not.toBeInTheDocument();

    await user.click(within(dialog).getByTestId('slot-19:00'));
    const again = within(dialog).getByTestId('manager-override');
    await user.type(within(again).getByLabelText(/manager email/i), 'boss@x.com');
    await user.type(within(again).getByLabelText(/manager password/i), 'S3cret!');
    await user.click(within(dialog).getByRole('button', { name: /authorize & book/i }));

    await waitFor(() =>
      expect(
        calls.filter((c) => c.method === 'POST' && c.url.endsWith('/reservation')),
      ).toHaveLength(2),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('It does not allow booking until a slot is selected and sends the slot time', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await within(dialog).findByTestId('slot-19:45');
    expect(within(dialog).getByRole('button', { name: /book table/i })).toBeDisabled();
    expect(within(dialog).getByText(/pick a time slot/i)).toBeInTheDocument();

    await pickSlot(user, '19:45');
    expect(within(dialog).queryByText(/pick a time slot/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /book table/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
      const sent = new Date((post?.body as { reservation_date: string }).reservation_date);
      expect([sent.getHours(), sent.getMinutes()]).toEqual([19, 45]);
    });
  });

  it('It rejects a non-positive group size', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText(/party size/i));
    await user.type(within(dialog).getByLabelText(/party size/i), '0');
    await user.click(within(dialog).getByRole('button', { name: /book table/i }));

    expect(await within(dialog).findByText(/Party size must be greater than 0/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/reservation'))).toBe(false);
  });
});

describe('empty state', () => {
  it('invites you to make the first reservation for the service', async () => {
    reservationRows = [];
    renderIn(<ReservationsView merchantId={3} />);
    await waitFor(() =>
      expect(screen.getByTestId('reservations-empty-state')).toBeInTheDocument(),
    );
  });
});

describe('capacity & shifts', () => {
  it('the manager edits capacity, arrival limit and shifts', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: /capacity & shifts/i }));
    const dialog = await screen.findByRole('dialog');
    const seats = await within(dialog).findByLabelText(/total seat capacity/i);
    expect(seats).toHaveValue('60');

    await user.clear(seats);
    await user.clear(within(dialog).getByLabelText(/max guests arriving per slot/i));
    await user.selectOptions(within(dialog).getByLabelText(/slot interval/i), '30');
    await user.click(within(dialog).getByRole('button', { name: /add shift/i }));
    await user.type(within(dialog).getByLabelText('Shift 2 name'), 'Lunch');

    await user.click(within(dialog).getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT' && c.url.includes('/reservation-capacity/settings'));
      expect(put?.body).toEqual({
        seat_capacity: null,
        slot_interval_minutes: 30,
        max_covers_per_slot: null,
        shifts: [
          { name: 'Dinner', start: '19:00', end: '23:00' },
          { name: 'Lunch', start: '12:00', end: '16:00' },
        ],
      });
    });
  });

  it('does not offer the settings to those who are not the manager', async () => {
    storedRole = 'merchant_user';
    await renderView();
    expect(screen.queryByRole('button', { name: /capacity & shifts/i })).not.toBeInTheDocument();
  });
});
