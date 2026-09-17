import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationGuestsView } from './ReservationGuestsView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// El workspace vive siempre dentro del router de la aplicación: el panel de accesos
// rápidos estándar usa useNavigate para caer a la URL pública cuando no hay onNavigate.
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

// RES-1: roster completo (2 de 2) con principal contactable.
// RES-2: roster incompleto (1 de 4), principal sin datos de contacto.
// RES-3: sin nadie registrado.
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

describe('roster por reserva', () => {
  it('agrupa a los invitados bajo su reserva', async () => {
    await renderView();
    const card = screen.getByTestId('roster-card-1');
    expect(within(card).getByTestId('guest-row-1')).toBeInTheDocument();
    expect(within(card).getByTestId('guest-row-2')).toBeInTheDocument();
  });

  it('deja fuera las fichas dadas de baja', async () => {
    await renderView();
    expect(screen.queryByTestId('guest-row-9')).not.toBeInTheDocument();
  });

  it('renderiza el badge #GST-{id} y el nombre', async () => {
    await renderView();
    const row = screen.getByTestId('guest-row-1');
    expect(row).toHaveTextContent('#GST-1');
    expect(row).toHaveTextContent('Carlos Mendoza');
  });

  it('enlaza la reserva padre con su badge #RES-{id}', async () => {
    await renderView();
    expect(screen.getByTestId('roster-card-1')).toHaveTextContent('#RES-1');
  });

  it('muestra el contador del roster frente al tamaño del grupo', async () => {
    await renderView();
    expect(screen.getByTestId('roster-count-1')).toHaveTextContent('Registered 2 of 2 Guests');
    expect(screen.getByTestId('roster-count-2')).toHaveTextContent('Registered 1 of 4 Guests');
  });

  it('enseña las reservas sin nadie registrado', async () => {
    await renderView();
    const empty = screen.getByTestId('roster-card-3');
    expect(empty).toHaveTextContent(/Nobody registered on this booking yet/);
    expect(empty).toHaveTextContent('6 guests expected');
  });
});

describe('contacto principal', () => {
  it('marca al principal con su pill', async () => {
    await renderView();
    expect(screen.getByTestId('primary-badge-1')).toHaveTextContent('Primary contact');
    expect(screen.queryByTestId('primary-badge-2')).not.toBeInTheDocument();
  });

  it('sólo ofrece "Make primary" a quien no lo es', async () => {
    await renderView();
    expect(
      within(screen.getByTestId('guest-row-2')).getByRole('button', { name: /make primary/i }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('guest-row-1')).queryByRole('button', { name: /make primary/i }),
    ).not.toBeInTheDocument();
  });

  it('promover manda un solo PATCH: el servidor degrada al anterior', async () => {
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

  it('avisa antes de quitar al principal y dice quién toma el relevo', async () => {
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

  it('cancelar el aviso no borra nada', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    await renderView();

    await user.click(
      within(screen.getByTestId('guest-row-1')).getByRole('button', { name: /remove/i }),
    );

    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('quitar a un acompañante corriente no pregunta nada', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      within(screen.getByTestId('guest-row-2')).getByRole('button', { name: /remove/i }),
    );

    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('avisa del roster sin contacto principal', async () => {
    reservationRows = [{ ...RESERVATIONS[0], guests: [g(1, 1, 'Carlos Mendoza')] }];
    renderIn(<ReservationGuestsView merchantId={3} />);
    await waitFor(() => expect(screen.getByTestId('guest-roster')).toBeInTheDocument());
    expect(screen.getByTestId('primary-warning-1')).toHaveTextContent(/No primary contact/);
  });
});

describe('enlaces de contacto directo', () => {
  it('el teléfono es un enlace tel: sin separadores', async () => {
    await renderView();
    const tel = within(screen.getByTestId('guest-row-1')).getByRole('link', { name: /600333444/ });
    expect(tel).toHaveAttribute('href', 'tel:+34600333444');
  });

  it('el correo es un enlace mailto:', async () => {
    await renderView();
    const mail = within(screen.getByTestId('guest-row-1')).getByRole('link', { name: /carlos@example/ });
    expect(mail).toHaveAttribute('href', 'mailto:carlos@example.com');
  });

  it('sin datos no pinta enlaces muertos', async () => {
    await renderView();
    const row = screen.getByTestId('guest-row-2');
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
    expect(row).toHaveTextContent('No contact details');
  });
});

describe('KPIs del roster', () => {
  it('cuenta las fichas activas del día', async () => {
    await renderView();
    // 2 en RES-1 (la inactiva no cuenta) + 1 en RES-2.
    expect(within(screen.getByTestId('kpi-registered')).getByText('3')).toBeInTheDocument();
  });

  it('cuenta las reservas con principal contactable', async () => {
    await renderView();
    const kpi = screen.getByTestId('kpi-primary-contacts');
    // Sólo RES-1: el principal de RES-2 no tiene ni teléfono ni correo.
    expect(within(kpi).getByText('1')).toBeInTheDocument();
    expect(within(kpi).getByText(/33\.3% of bookings reachable/)).toBeInTheDocument();
  });

  it('promedia la composición sobre todas las reservas', async () => {
    await renderView();
    // 3 fichas / 3 reservas.
    expect(within(screen.getByTestId('kpi-average-party')).getByText('1.0')).toBeInTheDocument();
  });
});

describe('búsqueda y filtros', () => {
  it('localiza a un invitado por teléfono', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search guests/i }), '600333');

    await waitFor(() => expect(screen.queryByTestId('guest-row-3')).not.toBeInTheDocument());
    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument();
    // Y revela la reserva asociada.
    expect(screen.getByTestId('roster-card-1')).toHaveTextContent('#RES-1');
  });

  it('localiza a un invitado por correo', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search guests/i }), 'carlos@example');

    await waitFor(() => expect(screen.queryByTestId('guest-row-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument();
  });

  it('aísla los contactos principales', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /primary contacts only/i }));

    await waitFor(() => expect(screen.queryByTestId('guest-row-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('guest-row-3')).toBeInTheDocument();
  });

  it('aísla los rosters incompletos', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /incomplete rosters/i }));

    // RES-1 está completo (2 de 2) y desaparece; RES-2 sigue.
    await waitFor(() => expect(screen.queryByTestId('guest-row-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('guest-row-3')).toBeInTheDocument();
  });

  it('el filtro no vuelve a pedir datos al servidor', async () => {
    const user = userEvent.setup();
    await renderView();
    const before = calls.filter((c) => c.url.includes('/reservation?')).length;

    await user.type(screen.getByRole('searchbox', { name: /search guests/i }), '600333');

    await waitFor(() => expect(screen.queryByTestId('guest-row-3')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.url.includes('/reservation?')).length).toBe(before);
  });
});

describe('drawer de alta y edición', () => {
  const openAdd = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole('button', { name: /^add guest$/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    return screen.getByRole('dialog');
  };

  it('da de alta al invitado contra la reserva elegida', async () => {
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
        // Sin separadores: es lo que acepta @IsPhoneNumber y lo que cabe en varchar(20).
        phone: '+34600555444',
      });
    });
  });

  it('rechaza un nombre vacío', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }));

    expect(await within(dialog).findByText(/Guest name is required/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('rechaza un nombre por encima del tope de la columna', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    const nameField = within(dialog).getByLabelText(/guest name/i);
    // maxLength corta en el navegador, así que se fuerza el valor para probar la regla.
    await user.click(nameField);
    await user.paste('x'.repeat(140));
    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }));

    // O bien el input recortó a 100 (válido), o se ve el error: nunca se envía algo >100.
    const post = calls.find((c) => c.method === 'POST');
    expect(String((post?.body as { name?: string })?.name ?? '').length).toBeLessThanOrEqual(100);
  });

  it('rechaza un teléfono nacional que el backend devolvería como 400', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.type(within(dialog).getByLabelText(/guest name/i), 'Marta');
    await user.type(within(dialog).getByLabelText(/^phone$/i), '600555444');

    expect(within(dialog).getByText(/international format/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^add guest$/i }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('avisa de a quién desplaza el interruptor de principal', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.type(within(dialog).getByLabelText(/guest name/i), 'Marta');
    await user.click(within(dialog).getByRole('switch'));

    expect(within(dialog).getByTestId('primary-handover')).toHaveTextContent(
      /Carlos Mendoza is the primary contact right now/,
    );
  });

  it('el contador proyecta la ficha que se está escribiendo', async () => {
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

  it('el alta rápida registra un acompañante genérico sin cerrar el drawer', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openAdd(user);

    await user.selectOptions(within(dialog).getByLabelText(/reservation/i), '2');
    await user.click(within(dialog).getByRole('button', { name: /quick add "Guest 2"/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST');
      expect(post?.body).toMatchObject({ reservation_id: 2, name: 'Guest 2' });
    });
    // El drawer sigue abierto para encadenar el siguiente.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('editar bloquea el cambio de reserva', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(within(screen.getByTestId('guest-row-2')).getByRole('button', { name: /edit/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText(/reservation/i)).toBeDisabled();
    expect(within(dialog).getByLabelText(/guest name/i)).toHaveValue('Guest 2');
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
    const current = within(panel).getByText('GUESTS', { exact: true });
    expect(current.closest('[aria-current="page"]')).not.toBeNull();
    expect(
      within(panel).queryByRole('button', { name: new RegExp('^GUESTS$', 'i') }),
    ).not.toBeInTheDocument();
  });

  it('navega al featureId del ancla pulsada', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderIn(<ReservationGuestsView merchantId={3} onNavigate={onNavigate} />);
    const panel = await screen.findByRole('navigation', {
      name: /reservations workspace shortcuts/i,
    });

    await user.click(within(panel).getByRole('button', { name: /RESERVATIONS/i }));

    expect(onNavigate).toHaveBeenCalledWith('reservations');
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
