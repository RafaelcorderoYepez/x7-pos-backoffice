import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DiningTablesView } from './DiningTablesView';
import type { UseDiningRealtimeOptions } from '../../../../lib/useDiningRealtime';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// El editor real monta un lienzo a pantalla completa; aquí sólo interesa que la vista sepa
// abrirlo.
vi.mock('./FloorPlanEditor', () => ({
  FloorPlanEditor: ({ plan, onClose }: { plan: { name: string }; onClose: () => void }) => (
    <div data-testid="floor-plan-editor-stub">
      <span>{plan.name}</span>
      <button type="button" onClick={onClose}>
        close editor
      </button>
    </div>
  ),
}));

// El canal en vivo se sustituye por un testigo: guardamos los manejadores que registra la
// vista para poder disparar eventos del gateway a mano.
let live: UseDiningRealtimeOptions = {};
vi.mock('../../../../lib/useDiningRealtime', () => ({
  useDiningRealtime: (opts: UseDiningRealtimeOptions) => {
    live = opts;
    return { connected: true };
  },
}));

const MERCHANT = { id: 3, name: 'prueba1' };

const PLANS = [
  { id: 1, name: 'Main Floor Plan', width: 1000, height: 700, status: 'active', merchant: MERCHANT },
  { id: 2, name: 'Rooftop Terrace', width: 800, height: 600, status: 'active', merchant: MERCHANT },
];

const ZONES = [
  { id: 10, name: 'VIP Lounge', color: '#D97706', status: 'active', floorPlan: { id: 1 }, merchant: MERCHANT },
  { id: 11, name: 'Terrace', color: '#16A34A', status: 'active', floorPlan: { id: 2 }, merchant: MERCHANT },
];

const TABLES = [
  {
    id: 1,
    merchant_id: 3,
    number: 'T-01',
    capacity: 4,
    status: 'occupied',
    location: 'Near window',
    rotation: 90,
    shape: 'Circle',
    pos_x: 100,
    pos_y: 150,
    floorPlan: { id: 1, name: 'Main Floor Plan' },
    floorZone: { id: 10, name: 'VIP Lounge', color: '#D97706' },
    parent_table: null,
  },
  {
    id: 2,
    merchant_id: 3,
    number: 'T-02',
    capacity: 2,
    status: 'occupied',
    location: '',
    rotation: 0,
    shape: 'Square',
    pos_x: 200,
    pos_y: 150,
    floorPlan: { id: 1, name: 'Main Floor Plan' },
    floorZone: { id: 10, name: 'VIP Lounge', color: '#D97706' },
    // Unida a T-01: la respuesta del backend embebe la madre, no el escalar.
    parent_table: { id: 1, number: 'T-01' },
  },
  {
    id: 3,
    merchant_id: 3,
    number: 'T-03',
    capacity: 6,
    status: 'available',
    location: 'Terrace edge',
    rotation: 0,
    shape: 'Square',
    pos_x: 300,
    pos_y: 200,
    floorPlan: { id: 2, name: 'Rooftop Terrace' },
    floorZone: { id: 11, name: 'Terrace', color: '#16A34A' },
    parent_table: null,
  },
  {
    id: 4,
    merchant_id: 3,
    number: 'T-04',
    capacity: 2,
    status: 'cleaning',
    location: '',
    rotation: 0,
    shape: 'Square',
    pos_x: 400,
    pos_y: 200,
    floorPlan: { id: 1, name: 'Main Floor Plan' },
    floorZone: { id: 10, name: 'VIP Lounge', color: '#D97706' },
    parent_table: null,
  },
];

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

interface FetchOverrides {
  tables?: unknown[];
  assignments?: unknown[];
  delta?: unknown[];
}

function defaultFetch({ tables = TABLES, assignments = [], delta = [] }: FetchOverrides = {}) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    // El delta y la transferencia comparten prefijo con /tables: se resuelven primero.
    if (u.includes('/tables/status-delta')) return jsonRes({ data: delta });
    if (u.includes('/tables/transfer')) return jsonRes({ data: { ok: true } });
    if (u.includes('/table-assignments')) return jsonRes({ data: assignments });
    if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
    if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
    if (u.includes('/tables')) return jsonRes({ data: tables });
    return jsonRes({ data: [] });
  });
}

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

/** Llamadas que salieron con un método concreto hacia una ruta. */
function callsTo(method: string, fragment: string) {
  return fetchMock()
    .mock.calls.filter(
      ([url, init]) =>
        String(url).includes(fragment) &&
        (init as RequestInit | undefined)?.method === method,
    )
    .map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String((init as RequestInit).body ?? '{}')),
    }));
}

async function renderView(overrides: FetchOverrides = {}) {
  vi.stubGlobal('fetch', defaultFetch(overrides));
  render(<DiningTablesView merchantId={3} />);
  await screen.findByText('T-01');
}

describe('DiningTablesView', () => {
  beforeEach(() => {
    live = {};
    vi.stubGlobal('fetch', defaultFetch());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('parrilla', () => {
    it('muestra el estado vacío literal de la historia', async () => {
      vi.stubGlobal('fetch', defaultFetch({ tables: [] }));
      render(<DiningTablesView merchantId={3} />);

      const empty = await screen.findByTestId('dining-tables-empty-state');
      expect(empty).toHaveTextContent(
        "No dining tables configured. Click 'Create Table' to place tables on your floor plans.",
      );
    });

    it('pinta capacidad, zona con swatch y plano de cada mesa', async () => {
      await renderView();
      const grid = within(screen.getByRole('table'));

      expect(grid.getByText('4 Seats')).toBeInTheDocument();
      expect(grid.getAllByText('VIP Lounge').length).toBeGreaterThan(0);
      expect(screen.getByTestId('table-zone-swatch-1')).toHaveStyle({
        backgroundColor: '#D97706',
      });
      expect(grid.getAllByRole('button', { name: /main floor plan/i }).length).toBeGreaterThan(0);
    });

    it('resume la colocación espacial como pos, forma y giro', async () => {
      await renderView();
      expect(screen.getByTestId('table-spatial-1')).toHaveTextContent(
        'Pos: [100, 150] | Circle | 90°',
      );
    });

    it('marca la mesa hija con el badge de unión a su madre', async () => {
      await renderView();
      expect(screen.getByTestId('table-joined-badge-2')).toHaveTextContent('Joined to T-01');
    });

    it('marca la mesa madre con cuántas mesas cuelgan de ella', async () => {
      await renderView();
      expect(screen.getByTestId('table-children-badge-1')).toHaveTextContent('1 table joined');
    });

    it('aplica el código de color operativo a cada estado', async () => {
      await renderView();
      // Coral la ocupada, azul la de limpieza, verde la disponible.
      expect(screen.getByTestId('table-status-1').className).toContain('#c2352a');
      expect(screen.getByTestId('table-status-4').className).toContain('blue');
      expect(screen.getByTestId('table-status-3').className).toContain('green');
      expect(screen.getByTestId('table-status-4')).toHaveTextContent('Cleaning');
    });
  });

  describe('filtros', () => {
    it('el selector de zona cae en cascada del plano elegido', async () => {
      const user = userEvent.setup();
      await renderView();

      const zoneFilter = screen.getByLabelText('Filter by zone');
      expect(within(zoneFilter).getByRole('option', { name: 'Terrace' })).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Filter by floor plan'), '1');

      expect(within(zoneFilter).getByRole('option', { name: 'VIP Lounge' })).toBeInTheDocument();
      expect(within(zoneFilter).queryByRole('option', { name: 'Terrace' })).not.toBeInTheDocument();
    });

    it('ofrece el estado de limpieza en el filtro', async () => {
      await renderView();
      const statusFilter = screen.getByLabelText('Filter by status');
      expect(within(statusFilter).getByRole('option', { name: 'Cleaning' })).toBeInTheDocument();
    });

    it('busca por número, zona o nota de ubicación', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.type(screen.getByLabelText('Search tables'), 'terrace edge');
      await waitFor(() => expect(screen.queryByText('T-01')).not.toBeInTheDocument());
      expect(screen.getByText('T-03')).toBeInTheDocument();
    });
  });

  describe('guarda de servicio vivo', () => {
    it('bloquea borrar una mesa ocupada y explica por qué', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Delete table T-01' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Cannot modify or remove Table T-01 while it has an active guest order or assigned server. Please close open orders first.',
      );
      expect(screen.queryByRole('button', { name: /^delete table$/i })).not.toBeInTheDocument();
      expect(callsTo('DELETE', '/tables/1')).toHaveLength(0);
    });

    it('bloquea borrar una mesa libre que todavía tiene camarero asignado', async () => {
      const user = userEvent.setup();
      await renderView({
        assignments: [{ id: 50, shiftId: 1, tableId: 3, collaboratorId: 5, releasedAt: null, status: 'active' }],
      });

      await user.click(screen.getByRole('button', { name: 'Delete table T-03' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Cannot modify or remove Table T-03',
      );
    });

    it('deja borrar una mesa libre y sin cobertura', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Delete table T-03' }));
      await user.click(await screen.findByRole('button', { name: /^delete table$/i }));

      await waitFor(() => expect(callsTo('DELETE', '/tables/3')).toHaveLength(1));
    });

    it('impide mudar de plano una mesa en servicio', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Edit table T-01' }));
      const dialog = await screen.findByRole('dialog', { name: /edit table/i });
      await user.selectOptions(within(dialog).getByLabelText(/floor plan/i), '2');

      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Cannot modify or remove Table T-01 while it has an active guest order',
      );
      expect(within(dialog).getByRole('button', { name: /save table/i })).toBeDisabled();
    });
  });

  describe('formulario', () => {
    it('rechaza una posición fuera de los límites del plano', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Edit table T-03' }));
      const dialog = await screen.findByRole('dialog', { name: /edit table/i });
      const posX = within(dialog).getByLabelText(/position x/i);
      await user.clear(posX);
      await user.type(posX, '900');

      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        "Table position must stay inside 'Rooftop Terrace': X between 0 and 8 m",
      );
      expect(within(dialog).getByRole('button', { name: /save table/i })).toBeDisabled();
    });

    it('rechaza un giro fuera de 0-360', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Edit table T-03' }));
      const dialog = await screen.findByRole('dialog', { name: /edit table/i });
      const rotation = within(dialog).getByLabelText(/rotation/i);
      await user.clear(rotation);
      await user.type(rotation, '400');

      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Rotation must be a whole number of degrees between 0 and 360.',
      );
    });

    it('avisa del número duplicado con el texto de la historia', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Edit table T-03' }));
      const dialog = await screen.findByRole('dialog', { name: /edit table/i });
      const number = within(dialog).getByLabelText(/table number/i);
      await user.clear(number);
      await user.type(number, 'T-01');

      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        "Table number 'T-01' already exists for this merchant.",
      );
    });

    it('excluye del selector de madre a la propia mesa y a su descendencia', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Edit table T-01' }));
      const dialog = await screen.findByRole('dialog', { name: /edit table/i });
      const parent = within(dialog).getByLabelText(/joined to/i);

      expect(within(parent).queryByRole('option', { name: /T-01/ })).not.toBeInTheDocument();
      expect(within(parent).queryByRole('option', { name: /T-02/ })).not.toBeInTheDocument();
      expect(within(parent).getByRole('option', { name: /T-03/ })).toBeInTheDocument();
    });

    it('guarda coordenadas, giro y unión al enviar', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Edit table T-03' }));
      const dialog = await screen.findByRole('dialog', { name: /edit table/i });
      const rotation = within(dialog).getByLabelText(/rotation/i);
      await user.clear(rotation);
      await user.type(rotation, '45');
      await user.click(within(dialog).getByRole('button', { name: /save table/i }));

      await waitFor(() => expect(callsTo('PUT', '/tables/3')).toHaveLength(1));
      expect(callsTo('PUT', '/tables/3')[0].body).toMatchObject({
        rotation: 45,
        pos_x: 300,
        pos_y: 200,
        parent_table_id: null,
      });
    });
  });

  describe('unión de mesas', () => {
    it('une las mesas elegidas y les hereda el estado de la madre ocupada', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Join tables to T-01' }));
      const dialog = await screen.findByRole('dialog', { name: /join tables to t-01/i });
      // T-02 ya cuelga de T-01: no vuelve a ofrecerse.
      expect(within(dialog).queryByLabelText('Join table T-02')).not.toBeInTheDocument();

      await user.click(within(dialog).getByLabelText('Join table T-03'));
      await user.click(within(dialog).getByRole('button', { name: /^join tables$/i }));

      await waitFor(() => expect(callsTo('PUT', '/tables/3')).toHaveLength(1));
      expect(callsTo('PUT', '/tables/3')[0].body).toEqual({
        parent_table_id: 1,
        status: 'occupied',
      });
    });

    it('desune una mesa hija dejando su vínculo en null', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Unjoin table T-02' }));

      await waitFor(() => expect(callsTo('PUT', '/tables/2')).toHaveLength(1));
      expect(callsTo('PUT', '/tables/2')[0].body).toEqual({ parent_table_id: null });
    });

    it('libera el grupo entero devolviendo madre e hijas a limpieza', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(
        screen.getByRole('button', { name: 'Release the group joined to table T-01' }),
      );

      await waitFor(() => expect(callsTo('PUT', '/tables/2')).toHaveLength(1));
      expect(callsTo('PUT', '/tables/2')[0].body).toEqual({
        parent_table_id: null,
        status: 'cleaning',
      });
      expect(callsTo('PUT', '/tables/1')[0].body).toEqual({ status: 'cleaning' });
    });
  });

  describe('transferencia', () => {
    it('sólo ofrece transferir desde una mesa ocupada', async () => {
      await renderView();
      expect(
        screen.getByRole('button', { name: 'Transfer guests from table T-01' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Transfer guests from table T-03' }),
      ).not.toBeInTheDocument();
    });

    it('lista como destino sólo mesas disponibles y envía la transferencia', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Transfer guests from table T-01' }));
      const dialog = await screen.findByRole('dialog', { name: /transfer table t-01/i });
      const target = within(dialog).getByLabelText(/target table/i);
      // Ni la ocupada T-02 ni la de limpieza T-04 pueden recibir comensales.
      expect(within(target).queryByRole('option', { name: /T-02/ })).not.toBeInTheDocument();
      expect(within(target).queryByRole('option', { name: /T-04/ })).not.toBeInTheDocument();

      await user.selectOptions(target, '3');
      await user.click(within(dialog).getByRole('button', { name: /transfer party/i }));

      await waitFor(() => expect(callsTo('POST', '/tables/transfer')).toHaveLength(1));
      expect(callsTo('POST', '/tables/transfer')[0].body).toEqual({
        sourceTableId: 1,
        targetTableId: 3,
      });
    });

    it('explica el bloqueo cuando ninguna mesa puede recibir', async () => {
      const user = userEvent.setup();
      await renderView({
        tables: TABLES.map((t) => (t.id === 3 ? { ...t, status: 'reserved' } : t)),
      });

      await user.click(screen.getByRole('button', { name: 'Transfer guests from table T-01' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No available table can take this party right now',
      );
    });
  });

  describe('tiempo real', () => {
    it('repinta el estado de una mesa al recibir el evento del gateway', async () => {
      await renderView();
      expect(screen.getByTestId('table-status-3')).toHaveTextContent('Available');

      live.onTableStatusChanged?.({
        merchantId: 3,
        tableId: 3,
        status: 'occupied',
        emittedAt: new Date().toISOString(),
      });

      await waitFor(() =>
        expect(screen.getByTestId('table-status-3')).toHaveTextContent('Occupied'),
      );
    });

    it('ignora eventos de otro comercio', async () => {
      await renderView();

      live.onTableStatusChanged?.({
        merchantId: 99,
        tableId: 3,
        status: 'occupied',
        emittedAt: new Date().toISOString(),
      });

      await waitFor(() =>
        expect(screen.getByTestId('table-status-3')).toHaveTextContent('Available'),
      );
    });

    it('reconcilia con el delta al recuperar la conexión', async () => {
      await renderView({
        delta: [{ ...TABLES[2], status: 'reserved' }],
      });

      live.onReconnect?.('2026-08-19T10:00:00.000Z');

      await waitFor(() =>
        expect(screen.getByTestId('table-status-3')).toHaveTextContent('Reserved'),
      );
      expect(
        fetchMock().mock.calls.some(([url]) =>
          String(url).includes('/tables/status-delta?since=2026-08-19T10%3A00%3A00.000Z'),
        ),
      ).toBe(true);
    });

    it('recarga la parrilla entera si el backend no expone el delta', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string | URL | Request) => {
          const u = String(url);
          if (u.includes('/tables/status-delta')) return jsonRes({ message: 'Not found' }, 404);
          if (u.includes('/table-assignments')) return jsonRes({ data: [] });
          if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
          if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
          if (u.includes('/tables')) return jsonRes({ data: TABLES });
          return jsonRes({ data: [] });
        }),
      );
      render(<DiningTablesView merchantId={3} />);
      await screen.findByText('T-01');
      const before = fetchMock().mock.calls.filter(([u]) =>
        String(u).includes('/tables?limit=100'),
      ).length;

      live.onReconnect?.('2026-08-19T10:00:00.000Z');

      await waitFor(() =>
        expect(
          fetchMock().mock.calls.filter(([u]) => String(u).includes('/tables?limit=100')).length,
        ).toBeGreaterThan(before),
      );
    });

    it('muestra el estado del canal en la cabecera', async () => {
      await renderView();
      expect(screen.getByTestId('dining-realtime-status')).toHaveTextContent('Live');
    });
  });
});
