import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationTablesView } from './ReservationTablesView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// El workspace vive siempre dentro del router de la aplicación: el panel de accesos
// rápidos estándar usa useNavigate para caer a la URL pública cuando no hay onNavigate.
const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const at = (h: number, m = 0): string => new Date(2026, 3, 16, h, m, 0).toISOString();

const ZONE_MAIN = { id: 1, name: 'Main Dining', color: '#3b82f6' };
const ZONE_TERRACE = { id: 2, name: 'Terrace', color: '#10b981' };

const TABLES = [
  { id: 10, merchant_id: 3, number: 'A1', capacity: 2, status: 'available', floorZone: ZONE_MAIN, pos_x: 0, pos_y: 0 },
  { id: 11, merchant_id: 3, number: 'A2', capacity: 4, status: 'available', floorZone: ZONE_MAIN, pos_x: 100, pos_y: 0 },
  { id: 12, merchant_id: 3, number: 'T1', capacity: 6, status: 'available', floorZone: ZONE_TERRACE, pos_x: 0, pos_y: 400 },
  // Libre toda la noche: es la que permite probar una combinación de dos mesas sin chocar.
  { id: 13, merchant_id: 3, number: 'T2', capacity: 2, status: 'available', floorZone: ZONE_TERRACE, pos_x: 100, pos_y: 400 },
];

// RES-1 sentada en A2 (4 plazas, grupo de 4) — aforo suficiente.
// RES-2 confirmada sin mesa — es la que hay que resolver.
// RES-3 con A1 (2 plazas) para un grupo de 5 — aforo insuficiente.
// RES-4 anulada, conserva su fila pero ya no retiene la mesa.
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
    created_by: 2, guests: [{ id: 2, reservation_id: 2, name: 'Lucía Prat', is_primary: true, is_active: true }],
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

describe('tablero de asignación', () => {
  it('pinta las mesas asignadas con número, aforo y zona', async () => {
    await renderView();
    const chip = screen.getByTestId('assigned-table-1-11');
    expect(chip).toHaveTextContent('#A2');
    expect(chip).toHaveTextContent('Cap: 4');
    expect(chip).toHaveTextContent('Main Dining');
  });

  it('deja fuera del tablero las reservas que ya soltaron su mesa', async () => {
    await renderView();
    // La anulada conserva su fila en la base, pero no ocupa sitio en la sala.
    expect(screen.queryByTestId('assignment-card-4')).not.toBeInTheDocument();
  });

  it('marca en verde el aforo que cubre al grupo', async () => {
    await renderView();
    expect(screen.getByTestId('capacity-badge-1')).toHaveTextContent('Seats 4 ≥ 4');
  });

  it('avisa en ámbar cuando el aforo se queda corto', async () => {
    await renderView();
    // Grupo de 5 en una mesa de 2.
    expect(screen.getByTestId('capacity-badge-3')).toHaveTextContent('3 seat(s) short');
  });

  it('marca las reservas sin mesa', async () => {
    await renderView();
    expect(screen.getByTestId('capacity-badge-2')).toHaveTextContent('No table assigned');
  });
});

describe('KPIs de ocupación', () => {
  it('cuenta las mesas asignadas de las reservas vivas', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-tables-assigned')).getByText('2')).toBeInTheDocument();
  });

  it('suma el aforo asignado sobre el total del salón', async () => {
    await renderView();
    const kpi = screen.getByTestId('kpi-assigned-seats');
    expect(within(kpi).getByText('6')).toBeInTheDocument();
    expect(within(kpi).getByText(/of 14 seats in the room/)).toBeInTheDocument();
  });

  it('cuenta las reservas que siguen sin mesa', async () => {
    await renderView();
    const kpi = screen.getByTestId('kpi-unassigned');
    expect(within(kpi).getByText('1')).toBeInTheDocument();
    expect(within(kpi).getByText(/5 guests still to seat/)).toBeInTheDocument();
  });
});

describe('alerta de reservas sin mesa', () => {
  it('avisa de las reservas próximas que no tienen dónde sentarse', async () => {
    await renderView();
    const alert = screen.getByTestId('unassigned-alert');
    expect(alert).toHaveTextContent('1 upcoming booking');
    expect(alert).toHaveTextContent('5 guests');
  });

  it('el atajo de la alerta aísla las reservas sin mesa', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(within(screen.getByTestId('unassigned-alert')).getByRole('button', { name: /show them/i }));

    await waitFor(() => expect(screen.queryByTestId('assignment-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('assignment-card-2')).toBeInTheDocument();
  });

  it('no aparece cuando todo está sentado', async () => {
    reservationRows = [RESERVATIONS[0]];
    renderIn(<ReservationTablesView merchantId={3} />);
    await waitFor(() => expect(screen.getByTestId('assignment-board')).toBeInTheDocument());
    expect(screen.queryByTestId('unassigned-alert')).not.toBeInTheDocument();
  });
});

describe('filtro por zona', () => {
  it('ofrece las zonas del inventario con su recuento', async () => {
    await renderView();
    expect(screen.getByRole('button', { name: /Main Dining \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Terrace \(2\)/ })).toBeInTheDocument();
  });

  it('filtra el tablero por sección de sala', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: /Main Dining/ }));

    await waitFor(() => expect(screen.queryByTestId('assignment-card-2')).not.toBeInTheDocument());
    // RES-1 (A2) y RES-3 (A1) están en Main Dining.
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

  it('el filtro no vuelve a pedir datos al servidor', async () => {
    const user = userEvent.setup();
    await renderView();
    const before = calls.filter((c) => c.url.includes('/reservation?')).length;

    await user.click(screen.getByRole('button', { name: /Main Dining/ }));

    await waitFor(() => expect(screen.queryByTestId('assignment-card-2')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.url.includes('/reservation?')).length).toBe(before);
  });
});

describe('selector de mesas', () => {
  const openPicker = async (user: ReturnType<typeof userEvent.setup>, cardId: number) => {
    await user.click(
      within(screen.getByTestId(`assignment-card-${cardId}`)).getByRole('button', {
        name: /assign tables|change tables/i,
      }),
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  };

  it('sugiere la combinación óptima para el grupo', async () => {
    const user = userEvent.setup();
    await renderView();
    await openPicker(user, 2); // grupo de 5

    const suggestions = within(screen.getByRole('dialog')).getByTestId('table-suggestions');
    // T1 (6 plazas) es la menor libre que se pasa de 5 en la franja de RES-2.
    expect(within(suggestions).getByText(/#T1 · 6 seats · 1 seat spare/)).toBeInTheDocument();
  });

  it('no deja marcar una mesa ocupada en la misma franja', async () => {
    const user = userEvent.setup();
    await renderView();
    await openPicker(user, 2);

    const dialog = screen.getByRole('dialog');
    // A2 la retiene RES-1 de 19:00 a 20:30, que solapa con RES-2 (20:00-21:30).
    const busyBefore = within(dialog).getByTestId('table-option-11');
    expect(busyBefore).toBeDisabled();
    expect(busyBefore).toHaveTextContent('#RES-1');

    // A1 la retiene RES-3 de 21:00 a 22:30, que también solapa.
    expect(within(dialog).getByTestId('table-option-10')).toBeDisabled();

    // T1 la tenía una reserva ANULADA, que ya no retiene nada: queda libre.
    expect(within(dialog).getByTestId('table-option-12')).toBeEnabled();
  });

  it('guarda la combinación elegida en una sola llamada transaccional', async () => {
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
      // Las dos mesas viajan en UNA sola petición: el backend las inserta en transacción.
      expect(bulk?.body).toEqual({ reservation_id: 2, table_ids: [12, 13] });
    });
    expect(calls.filter((c) => c.url.includes('/bulk'))).toHaveLength(1);
  });

  it('enseña el 409 del servidor tal cual, con mesa y reserva en conflicto', async () => {
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

  it('suelta las mesas quitadas antes de ocupar las nuevas', async () => {
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
    // Liberar antes de ocupar evita que la reserva choque consigo misma en la guarda.
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(bulkIdx);
  });

  it('resume el aforo de lo seleccionado frente al grupo', async () => {
    const user = userEvent.setup();
    await renderView();
    await openPicker(user, 2);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByTestId('table-option-13')); // 2 plazas para 5
    expect(within(dialog).getByTestId('picker-summary')).toHaveTextContent('3 seat(s) short');

    await user.click(within(dialog).getByTestId('table-option-12')); // + 6 plazas
    expect(within(dialog).getByTestId('picker-summary')).toHaveTextContent('8 seats for a party of 5');
  });
});

describe('soltar una mesa', () => {
  it('libera la mesa desde la propia píldora', async () => {
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

describe('panel de accesos rápidos estándar', () => {
  it('usa el QuickLaunchPanel común con los 5 sub-módulos', async () => {
    await renderView();

    const panel = screen.getByRole('navigation', { name: /reservations workspace shortcuts/i });
    ['RESERVATIONS', 'GUESTS', 'TABLE ASSIGNMENTS', 'RESERVATION NOTES', 'STATUS HISTORY'].forEach(
      (label) => {
        expect(within(panel).getByText(label, { exact: true })).toBeInTheDocument();
      },
    );
  });

  it('destaca el workspace actual como aria-current y no como botón', async () => {
    await renderView();

    // QuickLaunchPanel pinta el ancla activa como <span aria-current="page">, no navegable.
    const panel = screen.getByRole('navigation', { name: /reservations workspace shortcuts/i });
    const current = within(panel).getByText('TABLE ASSIGNMENTS', { exact: true });
    expect(current.closest('[aria-current="page"]')).not.toBeNull();
    expect(
      within(panel).queryByRole('button', { name: new RegExp('^TABLE ASSIGNMENTS$', 'i') }),
    ).not.toBeInTheDocument();
  });

  it('navega al featureId del ancla pulsada', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderIn(<ReservationTablesView merchantId={3} onNavigate={onNavigate} />);
    const panel = await screen.findByRole('navigation', {
      name: /reservations workspace shortcuts/i,
    });

    await user.click(within(panel).getByRole('button', { name: /GUESTS/i }));

    expect(onNavigate).toHaveBeenCalledWith('reservation-guests');
  });

  it('no monta una barra inferior fija: la navegación es sólo el panel', async () => {
    await renderView();

    // El épico se navega con el QuickLaunchPanel estándar. La barra anclada al pie se retiró:
    // repetía los mismos cinco accesos y tapaba el pie real de la aplicación.
    expect(
      screen.queryByRole('navigation', { name: /reservations sub-module navigation/i }),
    ).not.toBeInTheDocument();
    // La vista se monta aislada, así que cualquier `.fixed.bottom-0` aquí sería suyo — en la
    // aplicación completa ese selector lo cumple además el <main> del shell.
    expect(document.querySelector('.fixed.bottom-0')).toBeNull();
  });
});
