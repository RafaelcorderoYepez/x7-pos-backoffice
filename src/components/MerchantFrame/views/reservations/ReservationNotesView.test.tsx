import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReservationNotesView } from './ReservationNotesView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// El workspace vive siempre dentro del router de la aplicación: el panel de accesos
// rápidos estándar usa useNavigate para caer a la URL pública cuando no hay onNavigate.
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
      // Inactiva: no debe aparecer en el feed.
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

describe('feed cronológico', () => {
  it('ordena las notas de más reciente a más antigua', async () => {
    await renderView();
    const cards = screen.getAllByTestId(/^note-card-/);
    // 18:00 (id 3) > 17:00 (id 1) > 16:00 (id 2).
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'note-card-3',
      'note-card-1',
      'note-card-2',
    ]);
  });

  it('deja fuera las notas inactivas', async () => {
    await renderView();
    expect(screen.queryByTestId('note-card-4')).not.toBeInTheDocument();
  });

  it('enlaza cada nota con su reserva y su comensal', async () => {
    await renderView();
    const card = screen.getByTestId('note-card-1');
    expect(card).toHaveTextContent('#RES-1');
    expect(card).toHaveTextContent('Carlos Mendoza');
  });

  it('firma la nota con el nombre y el rol del autor', async () => {
    await renderView();
    // created_by = 2 se resuelve contra el user_id del colaborador.
    expect(screen.getByTestId('note-card-1')).toHaveTextContent('Ana Ruiz (Host)');
  });

  it('muestra tiempo relativo y sello exacto', async () => {
    await renderView();
    expect(screen.getByTestId('note-card-1')).toHaveTextContent(/ago • 16\/04\/2026 17:00/);
  });
});

describe('realce de prioridad', () => {
  it('marca la alergia como prioritaria', async () => {
    await renderView();
    expect(screen.getByTestId('priority-flag-1')).toBeInTheDocument();
    expect(screen.getByTestId('note-card-1')).toHaveTextContent('Allergies');
  });

  it('no marca como prioritaria una nota de asiento u ocasión', async () => {
    await renderView();
    expect(screen.queryByTestId('priority-flag-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('priority-flag-3')).not.toBeInTheDocument();
  });

  it('pinta la alergia con el borde rojo de peligro', async () => {
    await renderView();
    expect(screen.getByTestId('note-card-1').className).toContain('border-[#ef4444]');
  });
});

describe('KPIs del turno', () => {
  it('cuenta el total de notas activas del día', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-total')).getByText('3')).toBeInTheDocument();
  });

  it('cuenta las alertas de alergia', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-allergy')).getByText('1')).toBeInTheDocument();
  });

  it('cuenta las ocasiones especiales', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-occasion')).getByText('1')).toBeInTheDocument();
  });

  it('los KPIs miden el turno entero, no lo filtrado', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search notes/i }), 'peanut');

    await waitFor(() => expect(screen.queryByTestId('note-card-3')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('kpi-total')).getByText('3')).toBeInTheDocument();
  });
});

describe('buscador y filtros', () => {
  it('busca por palabra clave del cuerpo de la nota', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search notes/i }), 'anniversary');

    await waitFor(() => expect(screen.queryByTestId('note-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('note-card-3')).toBeInTheDocument();
  });

  it('busca por nombre del comensal', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByRole('searchbox', { name: /search notes/i }), 'lucía');

    await waitFor(() => expect(screen.queryByTestId('note-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('note-card-3')).toBeInTheDocument();
  });

  it('filtra por categoría', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('checkbox', { name: /allergies/i }));

    await waitFor(() => expect(screen.queryByTestId('note-card-3')).not.toBeInTheDocument());
    expect(screen.getByTestId('note-card-1')).toBeInTheDocument();
  });

  it('el filtro no vuelve a pedir datos al servidor', async () => {
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

  it('inserta el prefijo de la etiqueta rápida', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    await user.click(within(dialog).getByRole('button', { name: /allergy/i }));

    expect(within(dialog).getByLabelText(/^note$/i)).toHaveValue('[ALLERGY] ');
  });

  it('sustituye la etiqueta anterior en vez de encadenarlas', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    const body = within(dialog).getByLabelText(/^note$/i);
    await user.type(body, 'Quiet corner please');
    await user.click(within(dialog).getByRole('button', { name: /seating/i }));
    await user.click(within(dialog).getByRole('button', { name: /vip/i }));

    expect(body).toHaveValue('[VIP] Quiet corner please');
  });

  it('escribir justo después de pulsar la etiqueta no descoloca el texto', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    // Regresión: el cursor se devolvía al final del PREFIJO un frame después del clic, así que
    // la frase se partía y se intercalaba ("[OCCASION] rthday cake at 21:30Surprise bi").
    await user.click(within(dialog).getByRole('button', { name: /occasion/i }));
    const body = within(dialog).getByLabelText(/^note$/i);
    await user.type(body, 'Surprise birthday cake at 21:30');

    expect(body).toHaveValue('[OCCASION] Surprise birthday cake at 21:30');
  });

  it('previsualiza el realce con el que se verá en el pase', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    await user.type(within(dialog).getByLabelText(/^note$/i), 'Severe shellfish allergy');

    const preview = within(dialog).getByTestId('note-preview');
    expect(preview).toHaveTextContent('Allergies');
    expect(preview.className).toContain('border-[#ef4444]');
    expect(within(dialog).getByText(/flagged to the kitchen and floor teams/i)).toBeInTheDocument();
  });

  it('rechaza una nota de puros espacios', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    await user.type(within(dialog).getByLabelText(/^note$/i), '    ');
    await user.click(within(dialog).getByRole('button', { name: /^add note$/i }));

    expect(await within(dialog).findByText(/The note cannot be empty/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('guarda la nota contra la reserva elegida, sin mandar created_by', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    await user.selectOptions(within(dialog).getByLabelText(/reservation/i), '2');
    await user.type(within(dialog).getByLabelText(/^note$/i), 'Birthday cake at dessert');
    await user.click(within(dialog).getByRole('button', { name: /^add note$/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.includes('/reservation-note'));
      expect(post?.body).toEqual({ reservation_id: 2, note: 'Birthday cake at dessert' });
      // El autor lo sella el servidor desde el token.
      expect(post?.body).not.toHaveProperty('created_by');
    });
  });

  it('enseña la petición ya registrada en la reserva como contexto', async () => {
    const user = userEvent.setup();
    await renderView();
    const dialog = await openDrawer(user);

    expect(within(dialog).getByText(/Window seat preferred/)).toBeInTheDocument();
  });
});

describe('estado vacío', () => {
  it('invita a anotar cuando el turno no tiene notas', async () => {
    reservationRows = [{ ...RESERVATIONS[0], notes: [] }];
    renderIn(<ReservationNotesView merchantId={3} />);
    await waitFor(() => expect(screen.getByTestId('notes-empty-state')).toBeInTheDocument());
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
    const current = within(panel).getByText('RESERVATION NOTES', { exact: true });
    expect(current.closest('[aria-current="page"]')).not.toBeNull();
    expect(
      within(panel).queryByRole('button', { name: new RegExp('^RESERVATION NOTES$', 'i') }),
    ).not.toBeInTheDocument();
  });

  it('navega al featureId del ancla pulsada', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderIn(<ReservationNotesView merchantId={3} onNavigate={onNavigate} />);
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
