import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationsView } from './ReservationsView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// El workspace vive siempre dentro del router de la aplicación: el panel de accesos
// rápidos estándar usa useNavigate para caer a la URL pública cuando no hay onNavigate.
const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

// Instantes en hora local: la parrilla agrupa por la hora del reloj del local.
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
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

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
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return jsonResponse({ statusCode: 200, data: { ...reservationRows[0], ...body } });
      }
      if (url.endsWith('/reservation')) {
        return jsonResponse({ statusCode: 201, data: { ...RESERVATIONS[0], id: 99 } });
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

describe('hidratación del libro de reservas', () => {
  it('pide el día al servidor para que la consulta use el índice compuesto', async () => {
    await renderView();
    const listCall = calls.find((c) => c.url.includes('/reservation?'));
    // Un `date` suelto: es lo que el backend traduce a un rango sargable sobre
    // [merchant_id, reservation_date]. Filtrar el día en cliente traería toda la tabla.
    expect(listCall?.url).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    expect(listCall?.url).toContain('limit=100');
  });

  it('pinta cada reserva en su franja horaria', async () => {
    await renderView();
    const card = screen.getByTestId('booking-card-1');
    expect(within(card).getByText(/#RES-1/)).toBeInTheDocument();
    expect(within(card).getByText(/07:00 PM – 08:30 PM \(90 min\)/)).toBeInTheDocument();
  });

  it('muestra el nombre del cliente del CRM y el del roster', async () => {
    await renderView();
    expect(within(screen.getByTestId('booking-card-1')).getByText('Lucía Prat')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('booking-card-2')).getByText('Carlos Mendoza'),
    ).toBeInTheDocument();
  });

  it('destaca las peticiones especiales sólo cuando las hay', async () => {
    await renderView();
    expect(screen.getByTestId('special-requests-1')).toHaveTextContent('Happy Birthday!');
    expect(screen.queryByTestId('special-requests-2')).not.toBeInTheDocument();
  });

  it('muestra la hora de llegada de una mesa ya sentada', async () => {
    await renderView();
    expect(within(screen.getByTestId('booking-card-2')).getByText(/Seated 08:04 PM/)).toBeInTheDocument();
  });

  it('etiqueta el canal de origen de cada reserva', async () => {
    await renderView();
    expect(within(screen.getByTestId('booking-card-1')).getByText('Phone')).toBeInTheDocument();
    expect(within(screen.getByTestId('booking-card-2')).getByText('Walk-in')).toBeInTheDocument();
  });
});

describe('tira de KPIs del día', () => {
  it('suma los comensales esperados dejando fuera las anuladas', async () => {
    await renderView();
    // 4 + 2 + 6 = 12.
    expect(within(screen.getByTestId('kpi-expected')).getByText('12')).toBeInTheDocument();
  });

  it('cuenta los cubiertos y su porcentaje de ocupación', async () => {
    await renderView();
    const covered = screen.getByTestId('kpi-covered');
    expect(within(covered).getByText('2')).toBeInTheDocument();
    expect(within(covered).getByText(/16\.7% of expected covers/)).toBeInTheDocument();
  });

  it('cuenta las confirmaciones pendientes', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-pending')).getByText('1')).toBeInTheDocument();
  });

  it('calcula la tasa de no-shows sobre el total del día', async () => {
    await renderView();
    const noShow = screen.getByTestId('kpi-no-show');
    expect(within(noShow).getByText('33.3%')).toBeInTheDocument();
    expect(within(noShow).getByText('1 of 3 bookings')).toBeInTheDocument();
  });

  it('los KPIs miden el día entero, no lo que dejan ver los filtros', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /seated/i }));

    await waitFor(() => expect(screen.queryByTestId('booking-card-1')).not.toBeInTheDocument());
    // La tasa de no-shows del servicio no cambia porque la anfitriona filtre la vista.
    expect(within(screen.getByTestId('kpi-no-show')).getByText('33.3%')).toBeInTheDocument();
  });
});

describe('motor de filtros', () => {
  it('filtra por estado al marcar la casilla', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /pending/i }));

    await waitFor(() => expect(screen.queryByTestId('booking-card-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('booking-card-1')).toBeInTheDocument();
  });

  it('filtra por canal de origen', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /walk-in/i }));

    await waitFor(() => expect(screen.queryByTestId('booking-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('booking-card-2')).toBeInTheDocument();
  });

  it('busca por petición especial', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search reservations/i }), 'birthday');

    await waitFor(() => expect(screen.queryByTestId('booking-card-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('booking-card-1')).toBeInTheDocument();
  });

  it('busca por el teléfono de un acompañante', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search reservations/i }), '600333');

    await waitFor(() => expect(screen.queryByTestId('booking-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('booking-card-2')).toBeInTheDocument();
  });

  it('el filtro no vuelve a pedir datos al servidor', async () => {
    const user = userEvent.setup();
    await renderView();
    const before = calls.filter((c) => c.url.includes('/reservation?')).length;

    await user.click(screen.getByRole('checkbox', { name: /pending/i }));

    await waitFor(() => expect(screen.queryByTestId('booking-card-2')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.url.includes('/reservation?')).length).toBe(before);
  });

  it('ofrece limpiar los filtros cuando no queda nada visible', async () => {
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

describe('controlador del ciclo de vida', () => {
  it('sólo ofrece las transiciones legales de cada estado', async () => {
    await renderView();

    const pending = screen.getByTestId('booking-card-1');
    expect(within(pending).getByRole('button', { name: 'Confirmed' })).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: 'Seated' })).toBeInTheDocument();
    // Desde pendiente no se puede saltar a completada.
    expect(within(pending).queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();

    const seated = screen.getByTestId('booking-card-2');
    expect(within(seated).getByRole('button', { name: 'Completed' })).toBeInTheDocument();
    expect(within(seated).queryByRole('button', { name: 'Cancelled' })).not.toBeInTheDocument();
  });

  it('cierra la botonera en los estados terminales', async () => {
    await renderView();
    const noShow = screen.getByTestId('booking-card-3');
    expect(within(noShow).getByText(/Lifecycle closed/)).toBeInTheDocument();
    expect(within(noShow).queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();
  });

  it('sienta la mesa con un PATCH sin mandar seated_at (lo sella el servidor)', async () => {
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

  it('anular usa el endpoint dedicado que deja rastro en el histórico', async () => {
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

describe('alta de reserva', () => {
  const openDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /new reservation/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  };

  it('crea la reserva con la franja, el grupo, la duración y el canal', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText(/party size/i));
    await user.type(within(dialog).getByLabelText(/party size/i), '3');
    await user.selectOptions(within(dialog).getByLabelText(/booking source/i), 'qr');
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

  it('no manda created_by: lo sella el servidor desde el token', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /book table/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
      expect(post).toBeDefined();
      expect(post?.body).not.toHaveProperty('created_by');
    });
  });

  it('enlaza un cliente existente del CRM por autocompletado', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: /link crm profile/i }));
    await user.type(within(dialog).getByLabelText(/search by name, phone or email/i), 'Ana');
    await user.click(await within(dialog).findByRole('button', { name: /Ana Ruiz/ }));

    expect(within(dialog).getByText(/Linked to Ana Ruiz \(customer #45\)/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /book table/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
      expect(post?.body).toMatchObject({ customer_id: 45 });
    });
  });

  it('sin coincidencias crea un invitado ligero colgado de la reserva', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/guest name/i), 'Marta Gil');
    await user.type(within(dialog).getByLabelText(/^phone$/i), '+34 600 555 444');
    await user.click(within(dialog).getByRole('button', { name: /book table/i }));

    await waitFor(() => {
      const guestPost = calls.find((c) => c.url.includes('/reservation-guest'));
      expect(guestPost?.body).toMatchObject({
        reservation_id: 99,
        name: 'Marta Gil',
        // Sin separadores: @IsPhoneNumber los rechaza y varchar(20) no da para tanto.
        phone: '+34600555444',
        is_primary: true,
      });
    });
    // Sin ficha de CRM detrás, la reserva no lleva customer_id.
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/reservation'));
    expect(post?.body).not.toHaveProperty('customer_id');
  });

  it('avisa de la sobreventa y exige confirmarla antes de guardar', async () => {
    const user = userEvent.setup();
    await renderView();
    await openDrawer(user);

    const dialog = screen.getByRole('dialog');
    // El salón tiene 10 plazas (mesas de 4 y 6) y la franja del drawer está libre: un grupo
    // de 12 no cabe de ninguna manera.
    await user.clear(within(dialog).getByLabelText(/party size/i));
    await user.type(within(dialog).getByLabelText(/party size/i), '12');

    await waitFor(() =>
      expect(screen.getByTestId('capacity-check')).toHaveTextContent(/exceeds the floor capacity/i),
    );

    const submit = within(dialog).getByRole('button', { name: /confirm over capacity/i });
    await user.click(submit);
    // El primer clic sólo reconoce el aviso: todavía no se ha guardado nada.
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/reservation'))).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: /book table/i }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/reservation'))).toBe(true),
    );
  });

  it('rechaza un tamaño de grupo no positivo', async () => {
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

describe('estado vacío', () => {
  it('invita a tomar la primera reserva del servicio', async () => {
    reservationRows = [];
    renderIn(<ReservationsView merchantId={3} />);
    await waitFor(() =>
      expect(screen.getByTestId('reservations-empty-state')).toBeInTheDocument(),
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
    const current = within(panel).getByText('RESERVATIONS', { exact: true });
    expect(current.closest('[aria-current="page"]')).not.toBeNull();
    expect(
      within(panel).queryByRole('button', { name: new RegExp('^RESERVATIONS$', 'i') }),
    ).not.toBeInTheDocument();
  });

  it('navega al featureId del ancla pulsada', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderIn(<ReservationsView merchantId={3} onNavigate={onNavigate} />);
    const panel = await screen.findByRole('navigation', {
      name: /reservations workspace shortcuts/i,
    });

    await user.click(within(panel).getByRole('button', { name: /TABLE ASSIGNMENTS/i }));

    expect(onNavigate).toHaveBeenCalledWith('reservation-tables');
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
