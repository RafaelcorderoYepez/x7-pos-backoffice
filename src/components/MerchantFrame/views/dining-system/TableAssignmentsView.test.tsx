import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { TableAssignmentsView } from './TableAssignmentsView';
import type { UseDiningRealtimeOptions } from '../../../../lib/useDiningRealtime';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

let live: UseDiningRealtimeOptions = {};
vi.mock('../../../../lib/useDiningRealtime', () => ({
  useDiningRealtime: (opts: UseDiningRealtimeOptions) => {
    live = opts;
    return { connected: true };
  },
}));

// Horas en local: el formateador de 12 h de la vista lee el reloj del operador.
const at = (day: number, h: number, m = 0): string =>
  new Date(2026, 6, day, h, m, 0).toISOString();

const SHIFTS = [
  { id: 7, merchantId: 3, role: 'waiter', status: 'active', startTime: at(28, 11) },
  {
    id: 6,
    merchantId: 3,
    role: 'waiter',
    status: 'closed',
    startTime: at(27, 8),
    endTime: at(27, 16),
  },
];

const TABLES = [
  {
    id: 10,
    number: 'A1',
    capacity: 4,
    status: 'occupied',
    floorZone: { id: 3, name: 'VIP Lounge', color: '#D97706' },
  },
  {
    id: 11,
    number: 'B2',
    capacity: 2,
    status: 'available',
    floorZone: { id: 4, name: 'Terrace', color: '#16A34A' },
  },
];

const COLLABORATORS = [
  { id: 5, name: 'John Doe', role: 'waiter', status: 'active' },
  { id: 6, name: 'Ana Ruiz', role: 'waiter', status: 'active' },
];

const ASSIGNMENTS = [
  {
    id: 1,
    shiftId: 7,
    tableId: 10,
    collaboratorId: 5,
    assignedAt: at(28, 12, 30),
    releasedAt: null,
    status: 'active',
    collaborator: { id: 5, name: 'John Doe', role: 'waiter', code: 'W-12' },
  },
  {
    id: 2,
    shiftId: 6,
    tableId: 11,
    collaboratorId: 6,
    assignedAt: at(27, 8),
    releasedAt: at(27, 16, 15),
    status: 'inactive',
    collaborator: { id: 6, name: 'Ana Ruiz', role: 'waiter' },
  },
];

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

interface Overrides {
  assignments?: unknown[];
  collaborators?: unknown[];
  collaboratorsStatus?: number;
}

function defaultFetch({
  assignments = ASSIGNMENTS,
  collaborators = COLLABORATORS,
  collaboratorsStatus = 200,
}: Overrides = {}) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/table-assignments')) return jsonRes({ data: assignments });
    if (u.includes('/collaborators')) {
      return collaboratorsStatus === 200
        ? jsonRes({ data: collaborators })
        : jsonRes({ message: 'Forbidden' }, collaboratorsStatus);
    }
    if (u.includes('/shifts')) return jsonRes({ data: SHIFTS });
    if (u.includes('/tables')) return jsonRes({ data: TABLES });
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

async function renderView(overrides: Overrides = {}) {
  vi.stubGlobal('fetch', defaultFetch(overrides));
  render(<TableAssignmentsView merchantId={3} />);
  await screen.findByText('John Doe');
}

describe('TableAssignmentsView', () => {
  beforeEach(() => {
    live = {};
    vi.stubGlobal('fetch', defaultFetch());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('contexto de turno', () => {
    it('arranca filtrando por el turno abierto', async () => {
      await renderView();

      await waitFor(() =>
        expect(screen.getByLabelText('Filter by shift')).toHaveValue('7'),
      );
      // La cobertura del turno cerrado de ayer queda fuera de la vista inicial.
      expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
    });

    it('permite volver a un turno histórico cerrado', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.selectOptions(screen.getByLabelText('Filter by shift'), '6');

      expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });

    it('marca en el selector qué turnos están abiertos y cuáles cerrados', async () => {
      await renderView();
      const select = screen.getByLabelText('Filter by shift');

      expect(within(select).getByRole('option', { name: /Waiter Shift - Jul 28 · open/ })).toBeInTheDocument();
      expect(within(select).getByRole('option', { name: /Waiter Shift - Jul 27 · closed/ })).toBeInTheDocument();
    });

    it('muestra el estado vacío literal cuando no hay coberturas', async () => {
      vi.stubGlobal('fetch', defaultFetch({ assignments: [] }));
      render(<TableAssignmentsView merchantId={3} />);

      const empty = await screen.findByTestId('table-assignments-empty-state');
      expect(empty).toHaveTextContent(
        "No staff assignments found for the selected shift. Click 'Assign Table' to dispatch collaborators to dining tables.",
      );
    });
  });

  describe('parrilla', () => {
    it('pinta colaborador con su badge de rol y código', async () => {
      await renderView();
      const grid = within(screen.getByRole('table'));

      expect(grid.getByText('John Doe')).toBeInTheDocument();
      expect(grid.getByText('waiter · W-12')).toBeInTheDocument();
    });

    it('pinta la mesa con el swatch de su zona', async () => {
      await renderView();

      expect(screen.getByText('A1')).toBeInTheDocument();
      expect(screen.getByTestId('assignment-zone-swatch-1')).toHaveStyle({
        backgroundColor: '#D97706',
      });
      expect(screen.getByText('VIP Lounge')).toBeInTheDocument();
    });

    it('resume el turno con su nombre y horas', async () => {
      await renderView();
      const grid = within(screen.getByRole('table'));

      expect(grid.getByText('Waiter Shift - Jul 28')).toBeInTheDocument();
      expect(grid.getByText('11:00 AM – open')).toBeInTheDocument();
    });

    it('marca la cobertura viva como servicio activo', async () => {
      await renderView();

      expect(screen.getByTestId('assignment-duty-window-1')).toHaveTextContent(
        'Assigned: 12:30 PM | Duty Active',
      );
      expect(screen.getByTestId('assignment-status-1')).toHaveTextContent('On Duty');
      expect(screen.getByTestId('assignment-status-1').className).toContain('green');
    });

    it('muestra ambas marcas y el badge cerrado en una cobertura liberada', async () => {
      const user = userEvent.setup();
      await renderView();
      await user.selectOptions(screen.getByLabelText('Filter by shift'), '6');

      await screen.findByText('Ana Ruiz');
      expect(screen.getByTestId('assignment-duty-window-2')).toHaveTextContent(
        'Assigned: 08:00 AM | Released: 04:15 PM',
      );
      expect(screen.getByTestId('assignment-status-2')).toHaveTextContent('Released');
      expect(screen.getByTestId('assignment-status-2').className).toContain('blue');
    });
  });

  describe('filtros', () => {
    it('filtra por servicio activo frente a liberadas', async () => {
      const user = userEvent.setup();
      await renderView();

      // Sin turno fijado se ven las dos coberturas.
      await user.selectOptions(screen.getByLabelText('Filter by shift'), '');
      await screen.findByText('Ana Ruiz');

      await user.selectOptions(screen.getByLabelText('Filter by duty status'), 'active');
      expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Filter by duty status'), 'released');
      expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });

    it('busca por nombre de zona', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.type(screen.getByLabelText('Search assignments'), 'vip lounge');
      expect(screen.getByText('John Doe')).toBeInTheDocument();

      await user.clear(screen.getByLabelText('Search assignments'));
      await user.type(screen.getByLabelText('Search assignments'), 'terrace');
      await waitFor(() => expect(screen.queryByText('John Doe')).not.toBeInTheDocument());
    });
  });

  describe('despacho y traspaso', () => {
    it('permite acotar las mesas por zona antes de elegir', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Assign Table' }));
      const dialog = await screen.findByRole('dialog', { name: /assign table/i });
      const table = within(dialog).getByRole('combobox', { name: /^table/i });

      // Sin filtro se ofrecen las dos mesas del comercio.
      expect(within(table).getByRole('option', { name: /A1/ })).toBeInTheDocument();
      expect(within(table).getByRole('option', { name: /B2/ })).toBeInTheDocument();

      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /filter tables by zone/i }),
        '3',
      );

      // VIP Lounge sólo tiene A1.
      expect(within(table).getByRole('option', { name: /A1/ })).toBeInTheDocument();
      expect(within(table).queryByRole('option', { name: /B2/ })).not.toBeInTheDocument();
    });

    it('cambiar de zona descarta una mesa elegida que ya no pertenece', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Assign Table' }));
      const dialog = await screen.findByRole('dialog', { name: /assign table/i });
      const table = within(dialog).getByRole('combobox', { name: /^table/i });
      await user.selectOptions(table, '11');
      expect(table).toHaveValue('11');

      // B2 está en Terrace: al filtrar por VIP Lounge deja de ser una elección válida.
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /filter tables by zone/i }),
        '3',
      );

      expect(table).toHaveValue('');
    });

    it('avisa cuando el filtro deja la lista sin mesas', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Assign Table' }));
      const dialog = await screen.findByRole('dialog', { name: /assign table/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /filter tables by zone/i }),
        '3',
      );
      await user.type(within(dialog).getByLabelText('Filter tables'), 'zzz');

      expect(within(dialog).getByText(/no table matches this zone and filter/i)).toBeInTheDocument();
    });

    it('crea la cobertura cuando la mesa está libre en el turno', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Assign Table' }));
      const dialog = await screen.findByRole('dialog', { name: /assign table/i });
      await user.selectOptions(within(dialog).getByRole('combobox', { name: /^table/i }), '11');
      await user.selectOptions(within(dialog).getByRole('combobox', { name: /^collaborator/i }), '6');
      await user.click(within(dialog).getByRole('button', { name: /^assign table$/i }));

      await waitFor(() => expect(callsTo('POST', '/table-assignments')).toHaveLength(1));
      expect(callsTo('POST', '/table-assignments')[0].body).toEqual({
        shiftId: 7,
        tableId: 11,
        collaboratorId: 6,
        status: 'active',
      });
    });

    it('pide confirmación antes de robarle la mesa a otro camarero', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Assign Table' }));
      const dialog = await screen.findByRole('dialog', { name: /assign table/i });
      // A1 ya la cubre John Doe en el turno 7.
      await user.selectOptions(within(dialog).getByRole('combobox', { name: /^table/i }), '10');
      await user.selectOptions(within(dialog).getByRole('combobox', { name: /^collaborator/i }), '6');
      await user.click(within(dialog).getByRole('button', { name: /^assign table$/i }));

      const confirm = await screen.findByRole('dialog', { name: /reassign table/i });
      expect(within(confirm).getByRole('alert')).toHaveTextContent(
        "Table A1 is currently assigned to John Doe. Reassigning will automatically release John Doe's duty. Proceed?",
      );
      // Nada se ha escrito todavía.
      expect(callsTo('POST', '/table-assignments')).toHaveLength(0);
    });

    it('al confirmar libera al titular y crea la nueva cobertura', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Assign Table' }));
      const dialog = await screen.findByRole('dialog', { name: /assign table/i });
      await user.selectOptions(within(dialog).getByRole('combobox', { name: /^table/i }), '10');
      await user.selectOptions(within(dialog).getByRole('combobox', { name: /^collaborator/i }), '6');
      await user.click(within(dialog).getByRole('button', { name: /^assign table$/i }));

      const confirm = await screen.findByRole('dialog', { name: /reassign table/i });
      await user.click(within(confirm).getByRole('button', { name: /^reassign table$/i }));

      await waitFor(() => expect(callsTo('POST', '/table-assignments')).toHaveLength(1));
      const released = callsTo('PATCH', '/table-assignments/1');
      expect(released).toHaveLength(1);
      expect(released[0].body).toMatchObject({ status: 'inactive' });
      expect(released[0].body.releasedAt).toBeTruthy();
      expect(callsTo('POST', '/table-assignments')[0].body).toMatchObject({ collaboratorId: 6 });
    });

    it('cae al id numérico cuando el plan no incluye el catálogo de colaboradores', async () => {
      const user = userEvent.setup();
      await renderView({ collaboratorsStatus: 403 });

      await user.click(screen.getByRole('button', { name: 'Assign Table' }));
      const dialog = await screen.findByRole('dialog', { name: /assign table/i });

      expect(
        within(dialog).getByRole('spinbutton', { name: /^collaborator/i }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/collaborator directory is not available on this plan/i),
      ).toBeInTheDocument();
    });
  });

  describe('liberación', () => {
    it('avisa de las cuentas abiertas al liberar una mesa ocupada', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Release A1' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Table A1 has active guest orders. Ensure open checks are transferred to another collaborator before releasing.',
      );
    });

    it('sella releasedAt al confirmar', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Release A1' }));
      await user.click(await screen.findByRole('button', { name: /^release table$/i }));

      await waitFor(() => expect(callsTo('PATCH', '/table-assignments/1')).toHaveLength(1));
      expect(callsTo('PATCH', '/table-assignments/1')[0].body.releasedAt).toBeTruthy();
    });

    it('no ofrece liberar una cobertura ya cerrada', async () => {
      const user = userEvent.setup();
      await renderView();
      await user.selectOptions(screen.getByLabelText('Filter by shift'), '6');

      await screen.findByText('Ana Ruiz');
      expect(screen.getByRole('button', { name: 'Release B2' })).toBeDisabled();
    });
  });

  describe('tiempo real', () => {
    it('recarga las coberturas cuando el gateway anuncia un cambio', async () => {
      await renderView();
      const before = fetchMock().mock.calls.filter(([u]) =>
        String(u).includes('/table-assignments?limit=100'),
      ).length;

      live.onAssignmentChanged?.({
        merchantId: 3,
        assignmentId: 1,
        tableId: 10,
        shiftId: 7,
        collaboratorId: 5,
        action: 'released',
        emittedAt: new Date().toISOString(),
      });

      await waitFor(() =>
        expect(
          fetchMock().mock.calls.filter(([u]) =>
            String(u).includes('/table-assignments?limit=100'),
          ).length,
        ).toBeGreaterThan(before),
      );
    });

    it('ignora eventos de otro comercio', async () => {
      await renderView();
      const before = fetchMock().mock.calls.length;

      live.onAssignmentChanged?.({
        merchantId: 99,
        assignmentId: 1,
        tableId: 10,
        shiftId: 7,
        collaboratorId: 5,
        action: 'released',
        emittedAt: new Date().toISOString(),
      });

      expect(fetchMock().mock.calls.length).toBe(before);
    });
  });
});
