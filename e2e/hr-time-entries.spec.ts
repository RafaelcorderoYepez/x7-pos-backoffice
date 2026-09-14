import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del control de fichajes: parrilla con horas netas y estados derivados, alta manual
// con sus tres guardas, inspector con línea de tiempo y auditoría, y export de nómina.

const MERCHANT = { id: 7, name: 'X7 Bistro' };

/**
 * Reloj fijo en un MIÉRCOLES.
 *
 * La vista arranca filtrando por la semana en curso (lunes a domingo) y distingue "en
 * curso" de "incidencia" comparando con el día de hoy. Con fechas relativas al reloj real
 * el spec se rompía los lunes: "ayer" caía en la semana anterior y desaparecía de la
 * parrilla. Fijando el día, las tres jornadas del fixture caen siempre dentro de la semana
 * y con un día previo disponible.
 */
const NOW = new Date('2026-08-26T14:00:00');

const dayAt = (offsetDays: number, h: number, m = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - offsetDays);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const COLLABORATORS = [
  { id: 4, user_id: 9, merchant_id: MERCHANT.id, name: 'Juan Pérez', role: 'waiter', status: 'active' },
  { id: 5, user_id: 10, merchant_id: MERCHANT.id, name: 'Ana Rivas', role: 'cook', status: 'active' },
];

const ENTRIES = [
  {
    // Entra 3 min tarde: dentro del margen de cortesía, sigue puntual.
    id: 101,
    company_id: 1,
    merchant_id: MERCHANT.id,
    collaborator_id: 4,
    shift_id: 7,
    clock_in: dayAt(0, 8, 3),
    clock_out: dayAt(0, 16),
    break_minutes: 45,
    adjustment_reason: null,
    is_edited: false,
    edited_by_user_id: null,
    edited_at: null,
    regular_hours: 7.2,
    overtime_hours: 0,
    double_overtime_hours: 0,
    approved: false,
    created_at: dayAt(0, 8),
    collaborator: { id: 4, name: 'Juan Pérez', role: 'waiter' },
    shift: { id: 7, role: 'waiter', startTime: dayAt(0, 8), endTime: dayAt(0, 16) },
  },
  {
    // Jornada abierta de hoy: sigue en curso.
    id: 102,
    company_id: 1,
    merchant_id: MERCHANT.id,
    collaborator_id: 5,
    shift_id: null,
    clock_in: dayAt(0, 9),
    clock_out: null,
    break_minutes: 0,
    adjustment_reason: null,
    is_edited: false,
    edited_by_user_id: null,
    edited_at: null,
    regular_hours: 0,
    overtime_hours: 0,
    double_overtime_hours: 0,
    approved: false,
    created_at: dayAt(0, 9),
    collaborator: { id: 5, name: 'Ana Rivas', role: 'cook' },
    shift: null,
  },
  {
    // Ayer: 20 min tarde y corregido por un supervisor.
    id: 103,
    company_id: 1,
    merchant_id: MERCHANT.id,
    collaborator_id: 4,
    shift_id: 7,
    clock_in: dayAt(1, 8, 20),
    clock_out: dayAt(1, 16),
    break_minutes: 0,
    adjustment_reason: 'Forgot Badge',
    is_edited: true,
    edited_by_user_id: 42,
    edited_at: dayAt(1, 18),
    regular_hours: 7.67,
    overtime_hours: 0,
    double_overtime_hours: 0,
    approved: false,
    created_at: dayAt(1, 8),
    collaborator: { id: 4, name: 'Juan Pérez', role: 'waiter' },
    shift: { id: 7, role: 'waiter', startTime: dayAt(1, 8), endTime: dayAt(1, 16) },
  },
];

const REVISIONS = [
  {
    id: 1,
    time_entry_id: 103,
    edited_by_user_id: 42,
    adjustment_reason: 'Forgot Badge',
    previous_clock_in: dayAt(1, 9),
    previous_clock_out: dayAt(1, 16),
    previous_break_minutes: 30,
    new_clock_in: dayAt(1, 8, 20),
    new_clock_out: dayAt(1, 16),
    new_break_minutes: 0,
    created_at: dayAt(1, 18),
  },
];

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

const paginated = (data: unknown[]) => ({
  statusCode: 200,
  message: 'ok',
  data,
  paginationMeta: { page: 1, limit: 100, total: data.length, totalPages: 1, hasNext: false, hasPrev: false },
});

type Captured = { method: string; path: string; body: Record<string, unknown> };

async function bootstrap(page: Page, opts: { entries?: unknown[] } = {}) {
  const captured: Captured[] = [];

  // Congela el reloj del navegador antes de que la vista lo lea para fijar la semana.
  await page.clock.setFixedTime(NOW);

  await page.addInitScript(
    ({ merchant }) => {
      localStorage.setItem('x7_access_token', 'e2e-merchant');
      localStorage.setItem(
        'x7_user',
        JSON.stringify({
          id: 42,
          email: 'gm@x7.com',
          role: 'MERCHANT_ADMIN',
          scope: 'MERCHANT_WEB',
          merchant,
          authorizedFeatureIds: [],
        }),
      );
    },
    { merchant: MERCHANT },
  );

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );
  await page.route(
    (url) => url.pathname === '/api/collaborators',
    (route) => route.fulfill(json(paginated(COLLABORATORS))),
  );
  // El histórico va antes que la colección: comparten prefijo.
  await page.route(
    (url) => /^\/api\/collaborator-time-entries\/\d+\/revisions$/.test(url.pathname),
    (route) => route.fulfill(json({ statusCode: 200, message: 'ok', data: REVISIONS })),
  );
  await page.route(
    (url) => url.pathname === '/api/collaborator-time-entries',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        captured.push({ method: 'POST', path: '/api/collaborator-time-entries', body });
        return route.fulfill(json({ statusCode: 201, message: 'created', data: { id: 999, ...body } }, 201));
      }
      return route.fulfill(json(paginated(opts.entries ?? ENTRIES)));
    },
  );
  await page.route(
    (url) => /^\/api\/collaborator-time-entries\/\d+$/.test(url.pathname),
    (route) => {
      const req = route.request();
      const body = JSON.parse(req.postData() || '{}');
      captured.push({ method: req.method(), path: new URL(req.url()).pathname, body });
      return route.fulfill(json({ statusCode: 200, message: 'ok', data: { id: 101, ...body } }));
    },
  );

  return captured;
}

async function gotoTimeEntries(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Finance & HR').click();
  await page.getByText('HR', { exact: true }).click();
  await page.getByText('Collaborators Time Entries Control').click();
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Time Entries Control', exact: true }),
  ).toBeVisible();
}

// ==================== Historia 1: directorio de fichajes ====================

test('la parrilla contrasta la marca real con la programada y calcula el neto', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await expect(page.getByTestId('entry-in-101')).toHaveText('08:03 AM');
  const row = page.getByRole('row').filter({ hasText: '#TME-101' });
  await expect(row).toContainText('sched 08:00 AM');
  // 08:03→16:00 son 7,95 h; menos 45 min de descanso = 7,20 pagables.
  await expect(page.getByTestId('entry-net-101')).toHaveText('7.20 hrs');
});

test('una jornada sin salida se marca en curso', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await expect(page.getByTestId('entry-in-progress-102')).toHaveText('In Progress');
  await expect(page.getByTestId('entry-status-102')).toHaveText('In Progress');
  await expect(page.getByTestId('on-duty-counter')).toContainText('1 on duty now');
});

test('el retraso fuera del margen se marca; dentro del margen sigue puntual', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await expect(page.getByTestId('entry-status-103')).toHaveText('Tardy');
  await expect(page.getByText('+20m Late')).toBeVisible();
  await expect(page.getByTestId('entry-status-101')).toHaveText('On Time');
});

test('las filas corregidas por un supervisor quedan señaladas', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await expect(page.getByTestId('entry-edited-103')).toContainText('Adjusted');
  await expect(page.getByTestId('entry-edited-101')).toHaveCount(0);
});

test('el filtro por estado y por rol acota la parrilla', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByLabel('Filter by punch status').selectOption('tardy');
  await expect(page.getByText('#TME-103')).toBeVisible();
  await expect(page.getByText('#TME-101')).toHaveCount(0);

  await page.getByLabel('Filter by punch status').selectOption('');
  await page.getByLabel('Filter by role').selectOption('cook');
  await expect(page.getByText('#TME-102')).toBeVisible();
  await expect(page.getByText('#TME-101')).toHaveCount(0);
});

test('la búsqueda encuentra por referencia del fichaje', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByLabel('Search time entries').fill('#TME-102');

  await expect(page.getByText('#TME-102')).toBeVisible();
  await expect(page.getByText('#TME-101')).toHaveCount(0);
});

test('el estado vacío invita a registrar un fichaje a mano', async ({ page }) => {
  await bootstrap(page, { entries: [] });
  await gotoTimeEntries(page);

  await expect(page.getByTestId('time-entries-empty-state')).toContainText(
    'No time entries recorded.',
  );
});

// ==================== Historia 2: alta manual y corrección ====================

// El calendario del navegador rellena sólo la fecha y deja la hora en `--:--`: el campo
// parece relleno pero su value sigue vacío y el botón se apagaba sin decir por qué.
test('el alta abre con la entrada ya puesta y explica si se queda a medias', async ({
  page,
}) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Log Manual Time Entry', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /log manual time entry/i });

  await expect(dialog.getByLabel(/clock-in/i)).toHaveValue(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
  );
  await expect(dialog.getByText('Clock-in needs both a date and a time.')).toHaveCount(0);

  await dialog.getByRole('combobox', { name: /collaborator/i }).selectOption('4');
  // Vaciar el campo reproduce exactamente lo que deja el calendario sin tocar la hora.
  await dialog.getByLabel(/clock-in/i).fill('');

  await expect(dialog.getByText('Clock-in needs both a date and a time.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^log time entry$/i })).toBeDisabled();
  await expect(dialog.getByTestId('net-preview')).toHaveText('—');
});

test('bloquea una salida anterior a la entrada', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Log Manual Time Entry', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /log manual time entry/i });
  await dialog.getByRole('combobox', { name: /collaborator/i }).selectOption('4');
  await dialog.getByLabel(/clock-in/i).fill('2027-01-05T16:00');
  await dialog.getByLabel(/clock-out/i).fill('2027-01-05T08:00');

  await expect(dialog).toContainText('Clock-Out timestamp must be after Clock-In timestamp.');
  await expect(dialog.getByRole('button', { name: /^log time entry$/i })).toBeDisabled();
});

test('bloquea un intervalo que solapa con otro fichaje del mismo colaborador', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Log Manual Time Entry', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /log manual time entry/i });
  await dialog.getByRole('combobox', { name: /collaborator/i }).selectOption('4');

  // Cae dentro del fichaje 101 (hoy 08:03–16:00), con el día tomado del reloj fijo.
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}-${pad(NOW.getDate())}`;
  await dialog.getByLabel(/clock-in/i).fill(`${day}T10:00`);
  await dialog.getByLabel(/clock-out/i).fill(`${day}T12:00`);

  await expect(dialog).toContainText('overlaps time entry #TME-101');
});

test('muestra las horas netas antes de guardar', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Log Manual Time Entry', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /log manual time entry/i });
  await dialog.getByRole('combobox', { name: /collaborator/i }).selectOption('4');
  await dialog.getByLabel(/clock-in/i).fill('2027-01-05T08:00');
  await dialog.getByLabel(/clock-out/i).fill('2027-01-05T17:00');
  await dialog.getByLabel(/unpaid break/i).fill('60');

  await expect(dialog.getByTestId('net-preview')).toHaveText('8.00 hrs');
});

test('el alta viaja con su justificación obligatoria', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Log Manual Time Entry', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /log manual time entry/i });
  await dialog.getByRole('combobox', { name: /collaborator/i }).selectOption('4');
  await dialog.getByLabel(/clock-in/i).fill('2027-01-05T08:00');
  await dialog.getByLabel(/clock-out/i).fill('2027-01-05T16:00');
  await dialog.getByLabel(/adjustment reason/i).selectOption('System Outage');
  await dialog.getByRole('button', { name: /^log time entry$/i }).click();

  await expect(dialog).toBeHidden();
  expect(captured.find((c) => c.method === 'POST')?.body).toMatchObject({
    collaborator_id: 4,
    merchant_id: MERCHANT.id,
    break_minutes: 0,
    adjustment_reason: 'System Outage',
  });
});

test('elegir "otro" exige escribir el motivo', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Log Manual Time Entry', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /log manual time entry/i });
  await dialog.getByRole('combobox', { name: /collaborator/i }).selectOption('4');
  await dialog.getByLabel(/clock-in/i).fill('2027-01-05T08:00');
  await dialog.getByLabel(/adjustment reason/i).selectOption('__custom__');

  await expect(dialog.getByRole('button', { name: /^log time entry$/i })).toBeDisabled();

  await dialog.getByLabel(/custom adjustment reason/i).fill('Reloj averiado');

  await expect(dialog.getByRole('button', { name: /^log time entry$/i })).toBeEnabled();
});

test('la corrección no manda horas: las recalcula el servidor', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Adjust punch #TME-101' }).click();
  const dialog = page.getByRole('dialog', { name: /adjust punch/i });
  await expect(dialog.getByLabel(/collaborator/i)).toHaveAttribute('readonly', '');

  await dialog.getByLabel(/unpaid break/i).fill('30');
  await dialog.getByRole('button', { name: /save adjustment/i }).click();

  await expect(dialog).toBeHidden();
  const put = captured.find((c) => c.path === '/api/collaborator-time-entries/101');
  expect(put?.method).toBe('PUT');
  expect(put?.body.break_minutes).toBe(30);
  expect(put?.body.adjustment_reason).toBeTruthy();
  expect(put?.body.regular_hours).toBeUndefined();
  expect(put?.body.overtime_hours).toBeUndefined();
});

// ==================== Historia 3: inspector, export y navegación ====================

test('el inspector dibuja la jornada y desglosa las horas', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Inspect time entry #TME-101' }).click();

  await expect(page.getByTestId('entry-timeline')).toBeVisible();
  await expect(page.getByTestId('timeline-worked')).toBeVisible();
  await expect(page.getByTestId('timeline-scheduled')).toBeVisible();
  await expect(page.getByTestId('detail-net')).toHaveText('7.20 hrs');
  await expect(page.getByTestId('detail-punch-status')).toHaveText('On Time');
});

test('el inspector muestra el histórico con el antes y el después', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: 'Inspect time entry #TME-103' }).click();

  const list = page.getByTestId('revision-list');
  await expect(list).toContainText('Forgot Badge');
  await expect(list).toContainText('09:00 AM');
  await expect(list).toContainText('08:20 AM');
});

test('el export resume los totales y avisa de las incidencias', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: /export timesheets/i }).click();
  const dialog = page.getByRole('dialog', { name: /export timesheets/i });

  await expect(dialog.getByTestId('export-preview')).toContainText('2 collaborators');
  await expect(dialog.getByTestId('export-preview')).toContainText('3 entries');
  await expect(dialog).toContainText('Department is not carried by the time entry payload');
});

test('el export descarga un CSV con el nombre del rango', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  await page.getByRole('button', { name: /export timesheets/i }).click();
  const dialog = page.getByRole('dialog', { name: /export timesheets/i });

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /download csv/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^timesheet-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);

  // El contenido debe llevar la cabecera de nómina y los totales por colaborador.
  const stream = await download.createReadStream();
  const csv = await new Promise<string>((resolve, reject) => {
    let out = '';
    stream.on('data', (chunk) => (out += chunk));
    stream.on('end', () => resolve(out));
    stream.on('error', reject);
  });
  expect(csv).toContain('Collaborator ID,Collaborator,Role,Entries,Regular Hours');
  expect(csv).toContain('#CLB-4');
  expect(csv).toContain('Juan Pérez');
});

test('la barra de RR. HH. marca TIME ENTRIES y navega al directorio', async ({ page }) => {
  await bootstrap(page);
  await gotoTimeEntries(page);

  const nav = page.getByRole('navigation', { name: /human resources workspace shortcuts/i });
  await expect(nav.getByText('TIME ENTRIES CONTROL', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('button', { name: 'COLLABORATORS DATABASE' }).click();

  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Collaborators Database', exact: true }),
  ).toBeVisible();
});
