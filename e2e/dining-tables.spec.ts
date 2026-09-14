import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del workspace de Dining Tables: parrilla con badges de unión y colocación espacial,
// drawer con las tres guardas (número duplicado, límites del lienzo, candado circular),
// bloqueo por servicio vivo, fusión de mesas, traslado de comensales y quick links.
// La API se mockea por route interception, así que no hace falta backend.

const MERCHANT = { id: 7, name: 'X7 Bistro' };

const PLANS = [
  { id: 1, name: 'Main Dining Room', width: 800, height: 600, status: 'active', merchant: MERCHANT },
  { id: 2, name: 'Terrace Deck', width: 500, height: 400, status: 'active', merchant: MERCHANT },
];

const ZONES = [
  { id: 10, name: 'Main Hall', color: '#ae001a', status: 'active', floorPlan: { id: 1 }, merchant: MERCHANT },
  { id: 11, name: 'Bar', color: '#1d1c17', status: 'active', floorPlan: { id: 1 }, merchant: MERCHANT },
  { id: 12, name: 'Terrace', color: '#0f766e', status: 'active', floorPlan: { id: 2 }, merchant: MERCHANT },
];

const table = (over: Record<string, unknown>) => ({
  merchant_id: MERCHANT.id,
  capacity: 4,
  status: 'available',
  location: '',
  rotation: 0,
  shape: 'Square',
  pos_x: 100,
  pos_y: 100,
  floorPlan: { id: 1, name: 'Main Dining Room' },
  floorZone: { id: 10, name: 'Main Hall', color: '#ae001a' },
  parent_table: null,
  ...over,
});

// T-01 ocupada con T-02 unida a ella; T-03 libre en otro plano; T-04 en limpieza.
const TABLES = [
  table({ id: 101, number: 'T-01', status: 'occupied', rotation: 90, shape: 'Circle', pos_x: 100, pos_y: 150, location: 'Near window' }),
  table({ id: 102, number: 'T-02', status: 'occupied', capacity: 2, pos_x: 200, pos_y: 150, parent_table: { id: 101, number: 'T-01' } }),
  table({
    id: 103,
    number: 'T-03',
    capacity: 6,
    pos_x: 300,
    pos_y: 200,
    floorPlan: { id: 2, name: 'Terrace Deck' },
    floorZone: { id: 12, name: 'Terrace', color: '#0f766e' },
  }),
  table({ id: 104, number: 'T-04', status: 'cleaning', capacity: 2, pos_x: 400, pos_y: 200 }),
];

// Una cobertura viva sobre T-03: dispara la guarda de "mesa con camarero" al borrar.
const ASSIGNMENTS = [
  { id: 50, shiftId: 7, tableId: 103, collaboratorId: 5, assignedAt: null, releasedAt: null, status: 'active' },
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

/** Peticiones de escritura capturadas, para afirmar sobre el payload real. */
type Captured = { method: string; path: string; body: Record<string, unknown> };

async function bootstrap(page: Page, opts: { tables?: unknown[]; assignments?: unknown[] } = {}) {
  const captured: Captured[] = [];

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

  // Red por defecto: cualquier /api/ no mockeado devuelve una colección vacía.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );

  await page.route(
    (url) => url.pathname === '/api/floor-plan',
    (route) => route.fulfill(json({ ...paginated(PLANS), pagination: { totalPages: 1 } })),
  );
  await page.route(
    (url) => url.pathname === '/api/floor-zone',
    (route) => route.fulfill(json({ ...paginated(ZONES), pagination: { totalPages: 1 } })),
  );
  await page.route(
    (url) => url.pathname === '/api/table-assignments',
    (route) => route.fulfill(json(paginated(opts.assignments ?? ASSIGNMENTS))),
  );

  // El traslado va antes que /api/tables: comparten prefijo.
  await page.route(
    (url) => url.pathname === '/api/tables/transfer',
    (route) => {
      captured.push({
        method: 'POST',
        path: '/api/tables/transfer',
        body: JSON.parse(route.request().postData() || '{}'),
      });
      return route.fulfill(json({ statusCode: 200, message: 'Table transferred successfully', data: { id: 103 } }));
    },
  );

  await page.route(
    (url) => url.pathname === '/api/tables',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        captured.push({ method: 'POST', path: '/api/tables', body });
        return route.fulfill(json({ statusCode: 201, message: 'created', data: { id: 199, ...body } }, 201));
      }
      return route.fulfill(json(paginated(opts.tables ?? TABLES)));
    },
  );

  await page.route(
    (url) => /^\/api\/tables\/\d+$/.test(url.pathname),
    (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const body = JSON.parse(req.postData() || '{}');
      captured.push({ method: req.method(), path, body });
      return route.fulfill(json({ statusCode: 200, message: 'ok', data: { id: 1, ...body } }));
    },
  );

  return captured;
}

// Ruta de usuario real: el menú lateral. Funciona desde que el filtro de features pasó a
// ser acumulativo (`planId <= userPlanId`); antes, con igualdad exacta, esta entrada no
// aparecía para un comercio de plan 2 y el workspace era inalcanzable.
async function gotoTables(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Restaurant Operations').click();
  await page.getByText('Dining System', { exact: true }).click();
  await page.getByText('Tables Architecture').click();
  await expect(page.getByRole('main').getByRole('heading', { name: /dining tables/i })).toBeVisible();
}

// ============================ Historia 1: directorio ============================

test('la parrilla muestra asientos, colocación espacial y el código de color del estado', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  await expect(page.getByText('4 Seats').first()).toBeVisible();
  // "Pos: [100, 150] | Circle | 90°" — el resumen espacial de la historia.
  await expect(page.getByTestId('table-spatial-101')).toHaveText('Pos: [100, 150] | Circle | 90°');

  await expect(page.getByTestId('table-status-101')).toHaveText('Occupied');
  await expect(page.getByTestId('table-status-104')).toHaveText('Cleaning');
  // Coral para ocupada, azul para limpieza.
  await expect(page.getByTestId('table-status-101')).toHaveClass(/c2352a/);
  await expect(page.getByTestId('table-status-104')).toHaveClass(/blue/);
});

test('las mesas unidas se anuncian en ambos sentidos', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  await expect(page.getByTestId('table-joined-badge-102')).toHaveText(/Joined to T-01/);
  await expect(page.getByTestId('table-children-badge-101')).toHaveText(/1 table joined/);
});

test('el selector de zona cae en cascada del plano elegido', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  const zoneFilter = page.getByLabel('Filter by zone');
  await expect(zoneFilter.getByRole('option', { name: 'Terrace' })).toBeAttached();

  await page.getByLabel('Filter by floor plan').selectOption('1');

  await expect(zoneFilter.getByRole('option', { name: 'Main Hall' })).toBeAttached();
  await expect(zoneFilter.getByRole('option', { name: 'Terrace' })).toHaveCount(0);
});

test('el estado vacío invita a colocar mesas en los planos', async ({ page }) => {
  await bootstrap(page, { tables: [] });
  await gotoTables(page);

  await expect(page.getByTestId('dining-tables-empty-state')).toContainText(
    "No dining tables configured. Click 'Create Table' to place tables on your floor plans.",
  );
});

// ======================= Historia 2: alta, edición y guardas =======================

test('el formulario bloquea un número ya usado por otra mesa', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Edit table T-03' }).click();
  const dialog = page.getByRole('dialog', { name: /edit table/i });
  await dialog.getByLabel(/table number/i).fill('T-01');

  await expect(dialog.getByRole('alert')).toContainText(
    "Table number 'T-01' already exists for this merchant.",
  );
  await expect(dialog.getByRole('button', { name: /save table/i })).toBeDisabled();
});

test('el formulario impide sacar la mesa de los límites de su plano', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Edit table T-03' }).click();
  const dialog = page.getByRole('dialog', { name: /edit table/i });
  // T-03 vive en Terrace Deck, que mide 500 × 400 px (5 m × 4 m).
  await dialog.getByLabel(/position x/i).fill('900');

  await expect(dialog.getByRole('alert')).toContainText("must stay inside 'Terrace Deck'");
  await expect(dialog.getByRole('button', { name: /save table/i })).toBeDisabled();
});

test('el selector de mesa madre excluye a la propia mesa y a su descendencia', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Edit table T-01' }).click();
  const parent = page.getByRole('dialog').getByLabel(/joined to/i);

  await expect(parent.getByRole('option', { name: /T-01/ })).toHaveCount(0);
  await expect(parent.getByRole('option', { name: /T-02/ })).toHaveCount(0);
  await expect(parent.getByRole('option', { name: /T-03/ })).toBeAttached();
});

test('guardar envía coordenadas, giro y vínculo de unión', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Edit table T-03' }).click();
  const dialog = page.getByRole('dialog', { name: /edit table/i });
  await dialog.getByLabel(/rotation/i).fill('45');
  await dialog.getByRole('button', { name: /save table/i }).click();

  await expect(dialog).toBeHidden();
  const put = captured.find((c) => c.method === 'PUT' && c.path === '/api/tables/103');
  expect(put?.body).toMatchObject({ rotation: 45, pos_x: 300, pos_y: 200, parent_table_id: null });
});

test('una mesa ocupada no se puede borrar y la UI explica por qué', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Delete table T-01' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Cannot modify or remove Table T-01 while it has an active guest order or assigned server. Please close open orders first.',
  );
  await expect(page.getByRole('button', { name: /^delete table$/i })).toHaveCount(0);
  expect(captured.filter((c) => c.method === 'DELETE')).toHaveLength(0);
});

test('una mesa libre con camarero asignado tampoco se borra', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  // T-03 está disponible pero tiene una cobertura viva en /api/table-assignments.
  await page.getByRole('button', { name: 'Delete table T-03' }).click();

  await expect(page.getByRole('alert')).toContainText('Cannot modify or remove Table T-03');
});

test('mudar de plano una mesa en servicio queda bloqueado', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Edit table T-01' }).click();
  const dialog = page.getByRole('dialog', { name: /edit table/i });
  await dialog.getByLabel(/floor plan/i).selectOption('2');

  await expect(dialog.getByRole('alert')).toContainText(
    'Cannot modify or remove Table T-01 while it has an active guest order',
  );
  await expect(dialog.getByRole('button', { name: /save table/i })).toBeDisabled();
});

// ======================= Historia 7: fusión y liberación =======================

test('unir mesas a una madre ocupada les hereda el estado', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Join tables to T-01' }).click();
  const dialog = page.getByRole('dialog', { name: /join tables to t-01/i });
  // T-02 ya cuelga de T-01: no vuelve a ofrecerse.
  await expect(dialog.getByLabel('Join table T-02')).toHaveCount(0);

  await dialog.getByLabel('Join table T-03').check();
  await dialog.getByRole('button', { name: /^join tables$/i }).click();

  await expect(dialog).toBeHidden();
  const put = captured.find((c) => c.method === 'PUT' && c.path === '/api/tables/103');
  expect(put?.body).toEqual({ parent_table_id: 101, status: 'occupied' });
});

test('desunir una hija deja su vínculo en null', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Unjoin table T-02' }).click();

  await expect
    .poll(() => captured.find((c) => c.method === 'PUT' && c.path === '/api/tables/102')?.body)
    .toEqual({ parent_table_id: null });
});

test('liberar el grupo devuelve madre e hijas a limpieza', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Release the group joined to table T-01' }).click();

  await expect
    .poll(() => captured.find((c) => c.path === '/api/tables/102')?.body)
    .toEqual({ parent_table_id: null, status: 'cleaning' });
  expect(captured.find((c) => c.path === '/api/tables/101')?.body).toEqual({ status: 'cleaning' });
});

// ======================= Historia 8: traslado de comensales =======================

test('sólo las mesas ocupadas ofrecen traslado', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  await expect(page.getByRole('button', { name: 'Transfer guests from table T-01' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Transfer guests from table T-03' })).toHaveCount(0);
});

test('el traslado sólo admite destinos disponibles y envía origen y destino', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoTables(page);

  await page.getByRole('button', { name: 'Transfer guests from table T-01' }).click();
  const dialog = page.getByRole('dialog', { name: /transfer table t-01/i });
  const target = dialog.getByLabel(/target table/i);

  // Ni la ocupada T-02 ni la de limpieza T-04 pueden recibir comensales.
  await expect(target.getByRole('option', { name: /T-02/ })).toHaveCount(0);
  await expect(target.getByRole('option', { name: /T-04/ })).toHaveCount(0);

  await target.selectOption('103');
  await dialog.getByRole('button', { name: /transfer party/i }).click();

  await expect(dialog).toBeHidden();
  expect(captured.find((c) => c.path === '/api/tables/transfer')?.body).toEqual({
    sourceTableId: 101,
    targetTableId: 103,
  });
});

test('sin mesas libres, el traslado explica el bloqueo en vez de fallar', async ({ page }) => {
  await bootstrap(page, {
    tables: TABLES.map((t) => (t.id === 103 ? { ...t, status: 'reserved' } : t)),
  });
  await gotoTables(page);

  await page.getByRole('button', { name: 'Transfer guests from table T-01' }).click();

  await expect(page.getByRole('alert')).toContainText('No available table can take this party right now');
});

// ======================= Historia 9: degradación sin gateway =======================

test('sin gateway de tiempo real la parrilla sigue usable y lo dice', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  // No hay servidor de sockets en e2e: el canal cae y la vista lo comunica en vez de
  // quedarse en blanco o fingir que está viva.
  await expect(page.getByTestId('dining-realtime-status')).toHaveText(/Offline/);
  await expect(page.getByRole('table').getByText('T-01', { exact: true })).toBeVisible();
});

// ======================= Historia 3: quick links =======================

test('la barra inferior marca el workspace activo y navega a los demás', async ({ page }) => {
  await bootstrap(page);
  await gotoTables(page);

  const nav = page.getByRole('navigation', { name: /dining system workspace shortcuts/i });
  await expect(nav.getByText('DINING TABLES', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('button', { name: 'TABLE ASSIGNMENTS' }).click();

  // La cabecera de la shell repite el nombre de la feature ("Table assignments matrix"),
  // así que el nombre va exacto para apuntar al título de la vista.
  await expect(
    page.getByRole('heading', { name: 'Table Assignments', exact: true }),
  ).toBeVisible();
});
