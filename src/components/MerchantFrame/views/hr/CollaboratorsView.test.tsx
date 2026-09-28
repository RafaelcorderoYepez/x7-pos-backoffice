import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CollaboratorsView } from './CollaboratorsView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const at = (day: number, h: number): string => new Date(2026, 7, day, h, 0, 0).toISOString();

const SHIFTS = [
  { id: 7, merchantId: 3, role: 'waiter', status: 'active', startTime: at(24, 11) },
  {
    id: 6,
    merchantId: 3,
    role: 'cook',
    status: 'closed',
    startTime: at(23, 8),
    endTime: at(23, 16),
  },
];

const USERS = [
  { id: 9, username: 'jperez', email: 'juan@store.com', role: 'merchant_user', scope: 'merchant_web', isActive: true, merchantId: 3 },
  { id: 10, username: 'arivas', email: 'ana@store.com', role: 'merchant_user', scope: 'merchant_web', isActive: true, merchantId: 3 },
  { id: 11, username: 'libre', email: 'libre@store.com', role: 'merchant_user', scope: 'merchant_web', isActive: true, merchantId: 3 },
];

const COLLABORATORS = [
  {
    id: 12,
    user_id: 9,
    merchant_id: 3,
    name: 'Juan Perez',
    role: 'waiter',
    status: 'active',
    created_at: '2026-08-24T10:00:00Z',
    shift_id: 7,
    shift: { id: 7, role: 'waiter', startTime: at(24, 11), endTime: null, status: 'active' },
    user: { id: 9, username: 'jperez', email: 'juan@store.com' },
  },
  {
    id: 13,
    user_id: 10,
    merchant_id: 3,
    name: 'Ana Rivas',
    role: 'cook',
    // Legacy Spanish value: normalizes to "On Vacation".
    status: 'vacaciones',
    created_at: '2026-07-01T10:00:00Z',
    shift_id: null,
    shift: null,
    user: { id: 10, username: 'arivas', email: 'ana@store.com' },
  },
];

const SUMMARY = {
  collaborator_id: 12,
  counts: {
    shiftAssignments: 12,
    tableAssignments: 4,
    openedCashDrawers: 7,
    closedCashDrawers: 6,
    orders: 143,
  },
  ordersTotal: 15420.5,
  recentShiftAssignments: [
    { id: 1, shiftId: 7, startTime: at(24, 11), endTime: null, status: 'active' },
  ],
  recentTableAssignments: [
    {
      id: 55,
      tableId: 10,
      tableNumber: 'A1',
      zoneName: 'VIP Lounge',
      assignedAt: at(24, 12),
      releasedAt: null,
    },
  ],
  recentCashDrawers: [
    { id: 3, custody: 'opened', status: 'closed', createdAt: at(24, 9), updatedAt: at(24, 17) },
  ],
  recentOrders: [
    { id: 900, order_number: 'ORD-0900', total: 120.5, status: 'paid', created_at: at(24, 13) },
  ],
};

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

interface Overrides {
  collaborators?: unknown[];
  createStatus?: number;
  createBody?: unknown;
  summaryStatus?: number;
  usersStatus?: number;
}

function backend({
  collaborators = COLLABORATORS,
  createStatus = 201,
  createBody,
  summaryStatus = 200,
  usersStatus = 200,
}: Overrides = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes('/summary')) {
      return summaryStatus === 200
        ? jsonRes({ data: SUMMARY })
        : jsonRes({ message: 'Collaborator not found' }, summaryStatus);
    }
    if (url.includes('/collaborators')) {
      if (method === 'POST') {
        return jsonRes(
          createBody ?? { data: { id: 99 } },
          createStatus,
        );
      }
      if (method === 'PUT') return jsonRes({ data: { id: 12 } });
      if (method === 'DELETE') return jsonRes({ data: { id: 12, status: 'deleted' } });
      return jsonRes({ data: collaborators });
    }
    // REAL route for merchant admin: root `GET /users` is
    // exclusive to PORTAL_ADMIN and returns 403.
    if (url.includes('/users/merchant/')) {
      return usersStatus === 200
        ? jsonRes({ data: USERS })
        : jsonRes({ message: 'Forbidden resource' }, usersStatus);
    }
    if (url.includes('/shifts')) return jsonRes({ data: SHIFTS });
    return jsonRes({ data: [] });
  });
}

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

function callsTo(method: string, fragment: string) {
  return fetchMock()
    .mock.calls.filter(
      ([url, init]) =>
        String(url).includes(fragment) && (init as RequestInit | undefined)?.method === method,
    )
    .map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String((init as RequestInit).body ?? '{}')),
    }));
}

async function renderView(over: Overrides = {}) {
  vi.stubGlobal('fetch', backend(over));
  render(<CollaboratorsView merchantId={3} />);
  await screen.findByText('Juan Perez');
}

describe('CollaboratorsView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', backend());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('directorio', () => {
    it('renders empty state when no staff exists', async () => {
      vi.stubGlobal('fetch', backend({ collaborators: [] }));
      render(<CollaboratorsView merchantId={3} />);

      expect(await screen.findByTestId('collaborators-empty-state')).toHaveTextContent(
        'No collaborators registered.',
      );
    });

    it('pinta avatar con iniciales, referencia y cuenta enlazada', async () => {
      await renderView();

      expect(screen.getByTestId('collaborator-avatar-12')).toHaveTextContent('JP');
      expect(screen.getByText('#CLB-12')).toBeInTheDocument();
      expect(screen.getByText('#USR-9')).toBeInTheDocument();
      expect(screen.getByText('juan@store.com')).toBeInTheDocument();
    });

    it('pinta el rol y la fecha de alta', async () => {
      await renderView();
      const grid = within(screen.getByRole('table'));

      expect(grid.getByText('Waiter')).toBeInTheDocument();
      expect(grid.getByText('Aug 24, 2026')).toBeInTheDocument();
    });

    it('muestra el turno asignado y marca "Unassigned" cuando no lo hay', async () => {
      const user = userEvent.setup();
      await renderView();

      expect(
        within(screen.getByRole('table')).getByText('Waiter Shift - Aug 24'),
      ).toBeInTheDocument();

      // Ana is on vacation: default filter must be cleared to view.
      await user.selectOptions(screen.getByLabelText('Filter by status'), '');
      expect(await screen.findByText('Unassigned')).toBeInTheDocument();
    });

    it('normalizes legacy Spanish status', async () => {
      const user = userEvent.setup();
      await renderView();
      await user.selectOptions(screen.getByLabelText('Filter by status'), '');

      await screen.findByText('Ana Rivas');
      expect(screen.getByTestId('collaborator-status-13')).toHaveTextContent('On Vacation');
      expect(screen.getByTestId('collaborator-status-13').className).toContain('amber');
    });
  });

  describe('filtros', () => {
    it('starts displaying only active staff', async () => {
      await renderView();

      expect(screen.getByLabelText('Filter by status')).toHaveValue('active');
      expect(screen.queryByText('Ana Rivas')).not.toBeInTheDocument();
    });

    it('filtra por rol', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.selectOptions(screen.getByLabelText('Filter by status'), '');
      await user.selectOptions(screen.getByLabelText('Filter by role'), 'cook');

      expect(await screen.findByText('Ana Rivas')).toBeInTheDocument();
      expect(screen.queryByText('Juan Perez')).not.toBeInTheDocument();
    });

    it('busca por referencia de cuenta de plataforma', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.type(screen.getByLabelText('Search collaborators'), '#USR-9');

      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });

    it('busca por correo', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.type(screen.getByLabelText('Search collaborators'), 'nadie@x.com');

      await waitFor(() => expect(screen.queryByText('Juan Perez')).not.toBeInTheDocument());
    });

    it('filtra por turno', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.selectOptions(screen.getByLabelText('Filter by shift'), '7');

      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });
  });

  describe('alta', () => {
    it('only offers accounts without collaborator profile', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Register Collaborator' }));
      const dialog = await screen.findByRole('dialog', { name: /register collaborator/i });
      const select = within(dialog).getByRole('combobox', { name: /platform account/i });

      // 9 and 10 already have profiles; only 11 is available.
      expect(within(select).queryByRole('option', { name: /#USR-9/ })).not.toBeInTheDocument();
      expect(within(select).queryByRole('option', { name: /#USR-10/ })).not.toBeInTheDocument();
      expect(within(select).getByRole('option', { name: /#USR-11/ })).toBeInTheDocument();
    });

    it('si las cuentas no cargan, el formulario explica el fallo real', async () => {
      const user = userEvent.setup();
      await renderView({ usersStatus: 403 });

      await user.click(screen.getByRole('button', { name: 'Register Collaborator' }));
      const dialog = await screen.findByRole('dialog', { name: /register collaborator/i });

      // Previously stated "all accounts already have profiles", misidentifying error cause.
      expect(within(dialog).getByRole('alert')).toHaveTextContent(/failed to load|forbidden/i);
      expect(
        within(dialog).queryByText(/already has a collaborator profile/i),
      ).not.toBeInTheDocument();
    });

    it('requests accounts via merchant route rather than global list', async () => {
      await renderView();

      const paths = fetchMock().mock.calls.map(([url]) => String(url));
      expect(paths.some((p) => p.includes('/users/merchant/3'))).toBe(true);
      // Root listing would return 403 for merchant admin.
      expect(paths.some((p) => /\/users(\?|$)/.test(p))).toBe(false);
    });

    it('proposes account name and allows overriding it', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Register Collaborator' }));
      const dialog = await screen.findByRole('dialog', { name: /register collaborator/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /platform account/i }),
        '11',
      );

      const name = within(dialog).getByLabelText(/display name/i);
      expect(name).toHaveValue('libre');

      await user.clear(name);
      await user.type(name, 'Dining room name');
      await user.click(within(dialog).getByRole('button', { name: /^register collaborator$/i }));

      await waitFor(() => expect(callsTo('POST', '/collaborators')).toHaveLength(1));
      expect(callsTo('POST', '/collaborators')[0].body).toEqual({
        user_id: 11,
        merchant_id: 3,
        name: 'Dining room name',
        role: 'waiter',
        status: 'active',
        shift_id: null,
      });
    });

    it('submits selected shift', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Register Collaborator' }));
      const dialog = await screen.findByRole('dialog', { name: /register collaborator/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /platform account/i }),
        '11',
      );
      await user.selectOptions(within(dialog).getByLabelText(/recurring shift/i), '7');
      await user.click(within(dialog).getByRole('button', { name: /^register collaborator$/i }));

      await waitFor(() => expect(callsTo('POST', '/collaborators')).toHaveLength(1));
      expect(callsTo('POST', '/collaborators')[0].body.shift_id).toBe(7);
    });

    it('translates 409 unique constraint error to story message', async () => {
      const user = userEvent.setup();
      await renderView({
        createStatus: 409,
        createBody: { message: "User with ID '11' is already a collaborator." },
      });

      await user.click(screen.getByRole('button', { name: 'Register Collaborator' }));
      const dialog = await screen.findByRole('dialog', { name: /register collaborator/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /platform account/i }),
        '11',
      );
      await user.click(within(dialog).getByRole('button', { name: /^register collaborator$/i }));

      expect(await screen.findByText(/#USR-11 is already registered as an active collaborator/i))
        .toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('no deja reasignar la cuenta de plataforma', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Edit profile for Juan Perez' }));
      const dialog = await screen.findByRole('dialog', { name: /edit profile/i });

      expect(within(dialog).getByLabelText(/platform account/i)).toHaveAttribute('readonly');
    });

    it('guarda con PUT sin mandar user_id ni merchant_id', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Edit profile for Juan Perez' }));
      const dialog = await screen.findByRole('dialog', { name: /edit profile/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /^status/i }),
        'inactive',
      );
      await user.click(within(dialog).getByRole('button', { name: /save profile/i }));

      await waitFor(() => expect(callsTo('PUT', '/collaborators/12')).toHaveLength(1));
      const body = callsTo('PUT', '/collaborators/12')[0].body;
      expect(body).toMatchObject({ name: 'Juan Perez', role: 'waiter', status: 'inactive' });
      expect(body.user_id).toBeUndefined();
      expect(body.merchant_id).toBeUndefined();
    });
  });

  describe('detail drawer', () => {
    it('summarizes metrics for each operational relation', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(
        screen.getByRole('button', { name: 'View profile details for Juan Perez' }),
      );

      const tabs = await screen.findByRole('tablist');
      expect(within(tabs).getByRole('tab', { name: /shift assignments/i })).toHaveTextContent('12');
      expect(within(tabs).getByRole('tab', { name: /dining tables/i })).toHaveTextContent('4');
      // Custodia = abiertas + cerradas.
      expect(within(tabs).getByRole('tab', { name: /cash custody/i })).toHaveTextContent('13');
      expect(within(tabs).getByRole('tab', { name: /orders/i })).toHaveTextContent('143');
    });

    it('muestra la cabecera con rol, estado y turno', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(
        screen.getByRole('button', { name: 'View profile details for Juan Perez' }),
      );

      expect(await screen.findByTestId('detail-status-badge')).toHaveTextContent('Active');
      expect(screen.getAllByText(/#CLB-12 · #USR-9/).length).toBeGreaterThan(0);
    });

    it('switches tabs and displays sales volume', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(
        screen.getByRole('button', { name: 'View profile details for Juan Perez' }),
      );
      await user.click(await screen.findByRole('tab', { name: /orders/i }));

      expect(screen.getByTestId('orders-volume')).toHaveTextContent('143');
      expect(screen.getByTestId('orders-volume')).toHaveTextContent('$15,420.50');
      expect(screen.getByTestId('tab-orders')).toHaveTextContent('ORD-0900');
    });

    it('displays table alongside its zone', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(
        screen.getByRole('button', { name: 'View profile details for Juan Perez' }),
      );
      await user.click(await screen.findByRole('tab', { name: /dining tables/i }));

      expect(screen.getByTestId('tab-tables')).toHaveTextContent('A1');
      expect(screen.getByTestId('tab-tables')).toHaveTextContent('VIP Lounge');
    });

    it('allows retry if summary fails', async () => {
      const user = userEvent.setup();
      await renderView({ summaryStatus: 500 });

      await user.click(
        screen.getByRole('button', { name: 'View profile details for Juan Perez' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent('Collaborator not found');
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe('HR navigation', () => {
    it('marca el workspace activo y navega a los otros', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      vi.stubGlobal('fetch', backend());
      render(<CollaboratorsView merchantId={3} onNavigate={onNavigate} />);
      await screen.findByText('Juan Perez');

      const nav = within(
        screen.getByRole('navigation', { name: /human resources workspace shortcuts/i }),
      );
      expect(nav.getByText('COLLABORATORS DATABASE')).toHaveAttribute('aria-current', 'page');

      await user.click(nav.getByRole('button', { name: 'COLLABORATOR CONTRACTS' }));
      expect(onNavigate).toHaveBeenCalledWith('collaborators-contracts');

      await user.click(nav.getByRole('button', { name: 'TIME ENTRIES CONTROL' }));
      expect(onNavigate).toHaveBeenCalledWith('collaborators-time-entries');
    });
  });
});
