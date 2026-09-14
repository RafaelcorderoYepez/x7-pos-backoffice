import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del directorio de colaboradores: parrilla con referencias y cuenta enlazada, guarda
// del vínculo único, nombre de sala personalizable, cajón de detalle con agregaciones y
// barra de navegación de RR. HH.

const MERCHANT = { id: 7, name: 'X7 Bistro' };

const USERS = [
  { id: 9, username: 'jperez', email: 'juan@store.com', role: 'merchant_user', scope: 'merchant_web', isActive: true, merchantId: MERCHANT.id },
  { id: 10, username: 'arivas', email: 'ana@store.com', role: 'merchant_user', scope: 'merchant_web', isActive: true, merchantId: MERCHANT.id },
  { id: 11, username: 'libre', email: 'libre@store.com', role: 'merchant_user', scope: 'merchant_web', isActive: true, merchantId: MERCHANT.id },
];

const SHIFTS = [
  {
    id: 7,
    merchantId: MERCHANT.id,
    role: 'waiter',
    status: 'active',
    startTime: (() => {
      const d = new Date();
      d.setHours(11, 0, 0, 0);
      return d.toISOString();
    })(),
  },
];

const COLLABORATORS = [
  {
    id: 12,
    user_id: 9,
    merchant_id: MERCHANT.id,
    name: 'Juan Pérez',
    role: 'waiter',
    status: 'active',
    created_at: '2026-08-24T10:00:00Z',
    shift_id: 7,
    shift: { id: 7, role: 'waiter', startTime: SHIFTS[0].startTime, endTime: null, status: 'active' },
    user: { id: 9, username: 'jperez', email: 'juan@store.com', firstname: 'jperez', lastname: 'juan@store.com' },
  },
  {
    id: 13,
    user_id: 10,
    merchant_id: MERCHANT.id,
    name: 'Ana Rivas',
    role: 'cook',
    // Dato heredado en español: la UI debe normalizarlo a "On Vacation".
    status: 'vacaciones',
    created_at: '2026-07-01T10:00:00Z',
    shift_id: null,
    shift: null,
    user: { id: 10, username: 'arivas', email: 'ana@store.com', firstname: 'arivas', lastname: 'ana@store.com' },
  },
];

const SUMMARY = {
  collaborator_id: 12,
  counts: { shiftAssignments: 12, tableAssignments: 4, openedCashDrawers: 7, closedCashDrawers: 6, orders: 143 },
  ordersTotal: 15420.5,
  recentShiftAssignments: [{ id: 1, shiftId: 7, startTime: SHIFTS[0].startTime, endTime: null, status: 'active' }],
  recentTableAssignments: [
    { id: 55, tableId: 10, tableNumber: 'A1', zoneName: 'VIP Lounge', assignedAt: SHIFTS[0].startTime, releasedAt: null },
  ],
  recentCashDrawers: [
    { id: 3, custody: 'opened', status: 'closed', createdAt: SHIFTS[0].startTime, updatedAt: SHIFTS[0].startTime },
  ],
  recentOrders: [
    { id: 900, order_number: 'ORD-0900', total: 120.5, status: 'paid', created_at: SHIFTS[0].startTime },
  ],
};

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

async function bootstrap(page: Page, opts: { collaborators?: unknown[]; createStatus?: number; createBody?: unknown } = {}) {
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
  // Ruta REAL para un administrador de comercio: `GET /api/users` a secas es exclusivo de
  // PORTAL_ADMIN y devolvería 403, dejando el desplegable de cuentas vacío.
  await page.route(
    (url) => /^\/api\/users\/merchant\/\d+$/.test(url.pathname),
    (route) => route.fulfill(json(paginated(USERS))),
  );
  await page.route(
    (url) => url.pathname === '/api/shifts',
    (route) => route.fulfill(json(paginated(SHIFTS))),
  );
  // El resumen va antes que /api/collaborators: comparten prefijo.
  await page.route(
    (url) => /^\/api\/collaborators\/\d+\/summary$/.test(url.pathname),
    (route) => route.fulfill(json({ statusCode: 200, message: 'ok', data: SUMMARY })),
  );
  await page.route(
    (url) => url.pathname === '/api/collaborators',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        captured.push({ method: 'POST', path: '/api/collaborators', body });
        return route.fulfill(
          opts.createStatus === 409
            ? json(opts.createBody ?? { message: "User with ID '11' is already a collaborator." }, 409)
            : json({ statusCode: 201, message: 'created', data: { id: 99, ...body } }, 201),
        );
      }
      return route.fulfill(json(paginated(opts.collaborators ?? COLLABORATORS)));
    },
  );
  await page.route(
    (url) => /^\/api\/collaborators\/\d+$/.test(url.pathname),
    (route) => {
      const req = route.request();
      const body = JSON.parse(req.postData() || '{}');
      captured.push({ method: req.method(), path: new URL(req.url()).pathname, body });
      return route.fulfill(json({ statusCode: 200, message: 'ok', data: { id: 12, ...body } }));
    },
  );

  return captured;
}

async function gotoCollaborators(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Finance & HR').click();
  await page.getByText('HR', { exact: true }).click();
  await page.getByText('Collaborators Database').click();
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Collaborators Database', exact: true }),
  ).toBeVisible();
}

// ==================== Historia 3: directorio ====================

test('la parrilla muestra avatar, referencias y la cuenta de plataforma enlazada', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await expect(page.getByTestId('collaborator-avatar-12')).toHaveText('JP');
  await expect(page.getByText('#CLB-12')).toBeVisible();
  await expect(page.getByText('#USR-9')).toBeVisible();
  await expect(page.getByText('juan@store.com')).toBeVisible();
  // La píldora de rol lleva dentro la ligadura del icono Material ("workWaiter"), así que
  // se afirma sobre la fila en vez de sobre un texto exacto que el icono ensucia.
  const row = page.getByRole('row').filter({ hasText: '#CLB-12' });
  await expect(row).toContainText('Waiter');
  await expect(page.getByText('Aug 24, 2026')).toBeVisible();
});

test('arranca mostrando sólo la plantilla activa', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await expect(page.getByLabel('Filter by status')).toHaveValue('active');
  await expect(page.getByText('Ana Rivas')).toHaveCount(0);
});

test('normaliza un estado heredado en español y lo pinta en ámbar', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByLabel('Filter by status').selectOption('');

  await expect(page.getByTestId('collaborator-status-13')).toHaveText('On Vacation');
  await expect(page.getByTestId('collaborator-status-13')).toHaveClass(/amber/);
});

test('marca "Unassigned" cuando el colaborador no tiene turno', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByLabel('Filter by status').selectOption('');

  await expect(page.getByText('Unassigned')).toBeVisible();
});

test('la búsqueda encuentra por referencia de cuenta de plataforma', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByLabel('Search collaborators').fill('#USR-9');

  await expect(page.getByText('Juan Pérez')).toBeVisible();
});

test('el estado vacío invita a enlazar una cuenta', async ({ page }) => {
  await bootstrap(page, { collaborators: [] });
  await gotoCollaborators(page);

  await expect(page.getByTestId('collaborators-empty-state')).toContainText(
    'No collaborators registered.',
  );
});

// ==================== Historia 1: alta y edición ====================

test('el alta sólo ofrece cuentas sin ficha de colaborador', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByRole('button', { name: 'Register Collaborator', exact: true }).click();
  const select = page.getByRole('dialog').getByRole('combobox', { name: /platform account/i });

  // 9 y 10 ya tienen ficha; sólo 11 queda libre.
  await expect(select.getByRole('option', { name: /#USR-9/ })).toHaveCount(0);
  await expect(select.getByRole('option', { name: /#USR-10/ })).toHaveCount(0);
  await expect(select.getByRole('option', { name: /#USR-11/ })).toBeAttached();
});

test('propone el nombre de la cuenta y permite un nombre de sala propio', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByRole('button', { name: 'Register Collaborator', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /register collaborator/i });
  await dialog.getByRole('combobox', { name: /platform account/i }).selectOption('11');

  await expect(dialog.getByLabel(/display name/i)).toHaveValue('libre');

  await dialog.getByLabel(/display name/i).fill('Nombre de sala');
  await dialog.getByLabel(/recurring shift/i).selectOption('7');
  await dialog.getByRole('button', { name: /^register collaborator$/i }).click();

  await expect(dialog).toBeHidden();
  expect(captured.find((c) => c.method === 'POST')?.body).toEqual({
    user_id: 11,
    merchant_id: MERCHANT.id,
    name: 'Nombre de sala',
    role: 'waiter',
    status: 'active',
    shift_id: 7,
  });
});

test('un 409 del índice único se traduce al mensaje que nombra la cuenta', async ({ page }) => {
  await bootstrap(page, { createStatus: 409 });
  await gotoCollaborators(page);

  await page.getByRole('button', { name: 'Register Collaborator', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /register collaborator/i });
  await dialog.getByRole('combobox', { name: /platform account/i }).selectOption('11');
  await dialog.getByRole('button', { name: /^register collaborator$/i }).click();

  await expect(dialog).toContainText('#USR-11 is already registered as an active collaborator');
});

test('editar no permite reasignar la cuenta y guarda con PUT sin user_id', async ({ page }) => {
  const captured = await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByRole('button', { name: 'Edit profile for Juan Pérez' }).click();
  const dialog = page.getByRole('dialog', { name: /edit profile/i });

  await expect(dialog.getByLabel(/platform account/i)).toHaveAttribute('readonly', '');

  await dialog.getByRole('combobox', { name: /^status/i }).selectOption('inactive');
  await dialog.getByRole('button', { name: /save profile/i }).click();

  await expect(dialog).toBeHidden();
  const put = captured.find((c) => c.path === '/api/collaborators/12');
  expect(put?.method).toBe('PUT');
  expect(put?.body).toMatchObject({ name: 'Juan Pérez', role: 'waiter', status: 'inactive' });
  expect(put?.body.user_id).toBeUndefined();
  expect(put?.body.merchant_id).toBeUndefined();
});

// ==================== Historia 2: cajón de detalle y navegación ====================

test('el cajón de detalle resume las agregaciones de cada relación', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByRole('button', { name: 'View profile details for Juan Pérez' }).click();

  const tabs = page.getByRole('tablist');
  await expect(tabs.getByRole('tab', { name: /shift assignments/i })).toContainText('12');
  await expect(tabs.getByRole('tab', { name: /dining tables/i })).toContainText('4');
  // Custodia = abiertas + cerradas.
  await expect(tabs.getByRole('tab', { name: /cash custody/i })).toContainText('13');
  await expect(tabs.getByRole('tab', { name: /orders/i })).toContainText('143');
  await expect(page.getByTestId('detail-status-badge')).toHaveText('Active');
});

test('la pestaña de comandas muestra el volumen de ventas', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByRole('button', { name: 'View profile details for Juan Pérez' }).click();
  await page.getByRole('tab', { name: /orders/i }).click();

  await expect(page.getByTestId('orders-volume')).toContainText('$15,420.50');
  await expect(page.getByTestId('tab-orders')).toContainText('ORD-0900');
});

test('la pestaña de mesas muestra número y zona', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  await page.getByRole('button', { name: 'View profile details for Juan Pérez' }).click();
  await page.getByRole('tab', { name: /dining tables/i }).click();

  await expect(page.getByTestId('tab-tables')).toContainText('A1');
  await expect(page.getByTestId('tab-tables')).toContainText('VIP Lounge');
});

test('la barra de RR. HH. marca el workspace activo y navega a los otros', async ({ page }) => {
  await bootstrap(page);
  await gotoCollaborators(page);

  const nav = page.getByRole('navigation', { name: /human resources workspace shortcuts/i });
  await expect(nav.getByText('COLLABORATORS DATABASE', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('button', { name: 'TIME ENTRIES CONTROL' }).click();

  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Time Entries Control', exact: true }),
  ).toBeVisible();
});
