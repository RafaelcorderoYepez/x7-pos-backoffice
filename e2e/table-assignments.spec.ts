import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del workspace de Table Assignments: contexto de turno abierto, filtro por servicio,
// despacho con traspaso de cobertura y aviso de cuentas abiertas al liberar.

const MERCHANT = { id: 7, name: 'X7 Bistro' };

// Horas relativas a hoy: el turno abierto se resuelve por `status: active` + sin endTime,
// y fijar fechas absolutas haría que el spec caducara.
const today = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const yesterday = (h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const SHIFTS = [
  { id: 7, merchantId: MERCHANT.id, role: 'waiter', status: 'active', startTime: today(11) },
  {
    id: 6,
    merchantId: MERCHANT.id,
    role: 'cook',
    status: 'closed',
    startTime: yesterday(8),
    endTime: yesterday(16),
  },
];

const TABLES = [
  {
    id: 10,
    merchant_id: MERCHANT.id,
    number: 'A1',
    capacity: 4,
    status: 'occupied',
    location: '',
    rotation: 0,
    shape: 'Square',
    pos_x: 0,
    pos_y: 0,
    floorPlan: { id: 1, name: 'Main' },
    floorZone: { id: 3, name: 'VIP Lounge', color: '#D97706' },
  },
  {
    id: 11,
    merchant_id: MERCHANT.id,
    number: 'B2',
    capacity: 2,
    status: 'available',
    location: '',
    rotation: 0,
    shape: 'Square',
    pos_x: 0,
    pos_y: 0,
    floorPlan: { id: 1, name: 'Main' },
    floorZone: { id: 4, name: 'Terrace', color: '#16A34A' },
  },
];

const COLLABORATORS = [
  { id: 5, name: 'John Doe', role: 'waiter', status: 'active', user_id: 9, merchant_id: MERCHANT.id },
  { id: 6, name: 'Ana Rivas', role: 'waiter', status: 'active', user_id: 10, merchant_id: MERCHANT.id },
];

const ASSIGNMENTS = [
  {
    id: 1,
    shiftId: 7,
    tableId: 10,
    collaboratorId: 5,
    assignedAt: today(12, 30),
    releasedAt: null,
    status: 'active',
    collaborator: { id: 5, name: 'John Doe', role: 'waiter', code: 'W-12' },
  },
  {
    id: 2,
    shiftId: 6,
    tableId: 11,
    collaboratorId: 6,
    assignedAt: yesterday(8),
    releasedAt: yesterday(16, 15),
    status: 'inactive',
    collaborator: { id: 6, name: 'Ana Rivas', role: 'waiter' },
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

async function bootstrap(page: Page) {
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

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );
  await page.route(
    (url) => url.pathname === '/api/tables',
    (route) => route.fulfill(json(paginated(TABLES))),
  );
  await page.route(
    (url) => url.pathname === '/api/shifts',
    (route) => route.fulfill(json(paginated(SHIFTS))),
  );
  await page.route(
    (url) => url.pathname === '/api/collaborators',
    (route) => route.fulfill(json(paginated(COLLABORATORS))),
  );
  await page.route(
    (url) => url.pathname === '/api/table-assignments',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        captured.push({ method: 'POST', path: '/api/table-assignments', body });
        return route.fulfill(json({ statusCode: 201, message: 'created', data: { id: 99, ...body } }, 201));
      }
      return route.fulfill(json(paginated(ASSIGNMENTS)));
    },
  );
  await page.route(
    (url) => /^\/api\/table-assignments\/\d+$/.test(url.pathname),
    (route) => {
      const req = route.request();
      const body = JSON.parse(req.postData() || '{}');
      captured.push({ method: req.method(), path: new URL(req.url()).pathname, body });
      return route.fulfill(json({ statusCode: 200, message: 'ok', data: { id: 1, ...body } }));
    },
  );

  return captured;
}

async function gotoAssignments(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Restaurant Operations').click();
  await page.getByText('Dining System', { exact: true }).click();
  await page.getByText('Table assignments matrix').click();
  await expect(page.getByRole('heading', { name: 'Table Assignments', exact: true })).toBeVisible();
}

// ==================== Historia 4: parrilla y contexto de turno ====================

test('arranca en el turno abierto y deja volver a uno histórico', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  await expect(page.getByLabel('Filter by shift')).toHaveValue('7');
  // La cobertura de ayer pertenece al turno cerrado: no se ve al entrar.
  await expect(page.getByText('Ana Rivas')).toHaveCount(0);

  await page.getByLabel('Filter by shift').selectOption('6');

  await expect(page.getByText('Ana Rivas')).toBeVisible();
  await expect(page.getByText('John Doe')).toHaveCount(0);
});

test('la fila muestra colaborador, mesa con su zona y ventana de servicio', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  await expect(page.getByText('John Doe')).toBeVisible();
  await expect(page.getByText('waiter · W-12')).toBeVisible();
  await expect(page.getByText('A1')).toBeVisible();
  await expect(page.getByText('VIP Lounge')).toBeVisible();
  await expect(page.getByTestId('assignment-duty-window-1')).toHaveText('Assigned: 12:30 PM | Duty Active');
  await expect(page.getByTestId('assignment-status-1')).toHaveText('On Duty');
});

test('una cobertura cerrada muestra ambas marcas y su badge', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  await page.getByLabel('Filter by shift').selectOption('6');

  await expect(page.getByTestId('assignment-duty-window-2')).toHaveText(
    'Assigned: 08:00 AM | Released: 04:15 PM',
  );
  await expect(page.getByTestId('assignment-status-2')).toHaveText('Released');
});

test('el filtro de servicio separa las vivas de las cerradas', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  await page.getByLabel('Filter by shift').selectOption('');
  await page.getByLabel('Filter by duty status').selectOption('released');

  await expect(page.getByText('Ana Rivas')).toBeVisible();
  await expect(page.getByText('John Doe')).toHaveCount(0);

  await page.getByLabel('Filter by duty status').selectOption('active');

  await expect(page.getByText('John Doe')).toBeVisible();
  await expect(page.getByText('Ana Rivas')).toHaveCount(0);
});

test('la búsqueda encuentra por nombre de zona', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  await page.getByLabel('Search assignments').fill('vip lounge');

  await expect(page.getByText('John Doe')).toBeVisible();
});

// ==================== Historia 5: despacho, traspaso y liberación ====================

test('despachar una mesa libre crea la cobertura con el turno abierto', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoAssignments(page);

  await page.getByRole('button', { name: 'Assign Table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /assign table/i });
  await dialog.getByRole('combobox', { name: /^table/i }).selectOption('11');
  await dialog.getByRole('combobox', { name: /^collaborator/i }).selectOption('6');
  await dialog.getByRole('button', { name: /^assign table$/i }).click();

  await expect(dialog).toBeHidden();
  expect(captured.find((c) => c.method === 'POST')?.body).toEqual({
    shiftId: 7,
    tableId: 11,
    collaboratorId: 6,
    status: 'active',
  });
});

test('asignar una mesa ya cubierta pide confirmación antes de tocar nada', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoAssignments(page);

  await page.getByRole('button', { name: 'Assign Table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /assign table/i });
  // A1 ya la cubre John Doe en el turno abierto.
  await dialog.getByRole('combobox', { name: /^table/i }).selectOption('10');
  await dialog.getByRole('combobox', { name: /^collaborator/i }).selectOption('6');
  await dialog.getByRole('button', { name: /^assign table$/i }).click();

  const confirm = page.getByRole('dialog', { name: /reassign table/i });
  await expect(confirm.getByRole('alert')).toContainText(
    "Table A1 is currently assigned to John Doe. Reassigning will automatically release John Doe's duty. Proceed?",
  );
  // Nada se ha escrito todavía.
  expect(captured).toHaveLength(0);
});

test('confirmar el traspaso libera al titular y crea la nueva cobertura', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoAssignments(page);

  await page.getByRole('button', { name: 'Assign Table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /assign table/i });
  await dialog.getByRole('combobox', { name: /^table/i }).selectOption('10');
  await dialog.getByRole('combobox', { name: /^collaborator/i }).selectOption('6');
  await dialog.getByRole('button', { name: /^assign table$/i }).click();

  await page
    .getByRole('dialog', { name: /reassign table/i })
    .getByRole('button', { name: /^reassign table$/i })
    .click();

  await expect.poll(() => captured.some((c) => c.method === 'POST')).toBe(true);
  const released = captured.find((c) => c.path === '/api/table-assignments/1');
  expect(released?.method).toBe('PATCH');
  expect(released?.body).toMatchObject({ status: 'inactive' });
  expect(released?.body.releasedAt).toBeTruthy();
  expect(captured.find((c) => c.method === 'POST')?.body).toMatchObject({ collaboratorId: 6 });
});

test('liberar una mesa con comensales avisa de las cuentas abiertas', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  await page.getByRole('button', { name: 'Release A1' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Table A1 has active guest orders. Ensure open checks are transferred to another collaborator before releasing.',
  );
});

test('confirmar la liberación sella la marca de salida', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoAssignments(page);

  await page.getByRole('button', { name: 'Release A1' }).click();
  await page.getByRole('button', { name: /^release table$/i }).click();

  await expect
    .poll(() => captured.find((c) => c.path === '/api/table-assignments/1')?.body.releasedAt)
    .toBeTruthy();
});

test('una cobertura ya cerrada no ofrece liberarse otra vez', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  await page.getByLabel('Filter by shift').selectOption('6');

  await expect(page.getByRole('button', { name: 'Release B2' })).toBeDisabled();
});

test('el asignador deja acotar las mesas por zona antes de elegir', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  await page.getByRole('button', { name: 'Assign Table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /assign table/i });
  const table = dialog.getByRole('combobox', { name: /^table/i });

  await expect(table.getByRole('option', { name: /A1/ })).toBeAttached();
  await expect(table.getByRole('option', { name: /B2/ })).toBeAttached();

  // VIP Lounge sólo tiene A1.
  await dialog.getByRole('combobox', { name: /filter tables by zone/i }).selectOption('3');

  await expect(table.getByRole('option', { name: /A1/ })).toBeAttached();
  await expect(table.getByRole('option', { name: /B2/ })).toHaveCount(0);
});

// ==================== Historia 6: quick links ====================

test('la barra inferior marca TABLE ASSIGNMENTS y navega a los otros workspaces', async ({ page }) => {
  await bootstrap(page);
  await gotoAssignments(page);

  const nav = page.getByRole('navigation', { name: /dining system workspace shortcuts/i });
  await expect(nav.getByText('TABLE ASSIGNMENTS', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('button', { name: 'FLOOR ZONES' }).click();

  await expect(page.getByRole('main').getByRole('heading', { name: /floor zones/i })).toBeVisible();
});
