import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del workspace de contratos de colaborador: parrilla con vigencias y alertas de
// caducidad, formulario con sus dos guardas (orden de fechas y solape de acuerdos activos),
// subida del documento firmado, cajón de inspección con visor y bitácora, y la barra de
// navegación entre los tres workspaces de RR. HH.

const MERCHANT = { id: 7, name: 'X7 Bistro' };
const COMPANY_ID = 5;

// Reloj fijo del navegador: las píldoras de caducidad se miden contra este día. Sin él, la
// fila que hoy vence en 16 días saldría vencida dentro de tres semanas y el spec moriría
// solo un martes cualquiera.
const NOW = new Date('2026-06-15T10:00:00');

const COLLABORATORS = [
  { id: 4, user_id: 9, merchant_id: MERCHANT.id, name: 'Juan Pérez', role: 'waiter', status: 'active' },
  { id: 5, user_id: 10, merchant_id: MERCHANT.id, name: 'Ana Rivas', role: 'cook', status: 'active' },
  { id: 6, user_id: 11, merchant_id: MERCHANT.id, name: 'Luis Soto', role: 'host', status: 'active' },
  { id: 7, user_id: 12, merchant_id: MERCHANT.id, name: 'Marta Gil', role: 'cashier', status: 'active' },
];

const base = {
  company_id: COMPANY_ID,
  merchant_id: MERCHANT.id,
  overtime_multiplier: 1.5,
  double_overtime_multiplier: 2,
  tips_included_in_payroll: false,
  document_url: null,
  document_name: null,
  created_at: '2026-01-01T09:00:00.000Z',
  updated_at: '2026-01-01T09:00:00.000Z',
};

const CONTRACTS = [
  {
    ...base,
    id: 12,
    collaborator_id: 4,
    contract_type: 'hourly',
    employment_type: 'full_time',
    pay_frequency: 'hourly',
    wage_rate: 22.5,
    hourly_rate: 22.5,
    base_salary: 0,
    working_hours_per_week: 40,
    active: true,
    start_date: '2026-01-01',
    end_date: null,
    collaborator: { id: 4, name: 'Juan Pérez', role: 'waiter' },
  },
  {
    ...base,
    id: 13,
    collaborator_id: 5,
    contract_type: 'salary',
    employment_type: 'part_time',
    pay_frequency: 'monthly',
    wage_rate: 3500,
    hourly_rate: 0,
    base_salary: 3500,
    working_hours_per_week: 20,
    active: true,
    start_date: '2026-01-01',
    // Dentro de la ventana de renovación respecto a NOW.
    end_date: '2026-07-01',
    collaborator: { id: 5, name: 'Ana Rivas', role: 'cook' },
  },
  {
    ...base,
    id: 14,
    collaborator_id: 6,
    contract_type: 'hourly',
    employment_type: 'temporary',
    pay_frequency: 'hourly',
    wage_rate: 18,
    hourly_rate: 18,
    base_salary: 0,
    working_hours_per_week: 30,
    active: true,
    // Sigue marcado activo en base pero ya venció: es la fila a renovar.
    start_date: '2025-11-01',
    end_date: '2026-05-01',
    document_url: '/uploads/contracts/contract-14.pdf',
    document_name: 'soto-firmado.pdf',
    collaborator: { id: 6, name: 'Luis Soto', role: 'host' },
  },
  {
    ...base,
    id: 15,
    collaborator_id: 7,
    contract_type: 'salary',
    employment_type: 'freelance',
    pay_frequency: 'weekly',
    wage_rate: 600,
    hourly_rate: 0,
    base_salary: 600,
    working_hours_per_week: 15,
    active: false,
    start_date: '2025-01-01',
    end_date: null,
    collaborator: { id: 7, name: 'Marta Gil', role: 'cashier' },
  },
];

const REVISIONS = [
  {
    id: 2,
    contract_id: 12,
    field: 'hourly_rate',
    previous_value: '20',
    new_value: '22.5',
    changed_by_user_id: 9,
    created_at: '2026-03-01T10:00:00.000Z',
  },
  {
    id: 1,
    contract_id: 12,
    field: 'working_hours_per_week',
    previous_value: '35',
    new_value: '40',
    changed_by_user_id: 9,
    created_at: '2026-02-01T10:00:00.000Z',
  },
];

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

const paginated = (data: unknown[]) => ({
  statusCode: 200,
  message: 'ok',
  data,
  paginationMeta: {
    page: 1,
    limit: 100,
    total: data.length,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  },
});

type Captured = { method: string; path: string; body: Record<string, unknown> };

async function bootstrap(
  page: Page,
  opts: {
    contracts?: unknown[];
    revisions?: unknown[];
    createStatus?: number;
    createBody?: unknown;
  } = {},
) {
  const captured: Captured[] = [];
  const uploads: string[] = [];

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
  await page.route(
    (url) => /^\/api\/merchants\/\d+$/.test(url.pathname),
    (route) =>
      route.fulfill(
        json({
          statusCode: 200,
          message: 'ok',
          data: { id: MERCHANT.id, name: MERCHANT.name, company_id: COMPANY_ID },
        }),
      ),
  );
  // La bitácora y la subida van antes que el listado: comparten prefijo de ruta.
  await page.route(
    (url) => /^\/api\/collaborator-contracts\/\d+\/revisions$/.test(url.pathname),
    (route) =>
      route.fulfill(
        json({ statusCode: 200, message: 'ok', data: opts.revisions ?? REVISIONS }),
      ),
  );
  await page.route(
    (url) => /^\/api\/collaborator-contracts\/\d+\/document$/.test(url.pathname),
    (route) => {
      uploads.push(new URL(route.request().url()).pathname);
      return route.fulfill(
        json({
          statusCode: 200,
          message: 'ok',
          data: { id: 99, document_url: '/uploads/contracts/c-99.pdf' },
        }),
      );
    },
  );
  await page.route(
    (url) => url.pathname === '/api/collaborator-contracts',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        captured.push({ method: 'POST', path: '/api/collaborator-contracts', body });
        return route.fulfill(
          opts.createStatus === 409
            ? json(
                opts.createBody ?? {
                  message:
                    'Collaborator with ID 4 already has an active contract. A collaborator can only have one active contract at a time.',
                },
                409,
              )
            : json(
                { statusCode: 201, message: 'created', data: { id: 99, ...body } },
                201,
              ),
        );
      }
      return route.fulfill(json(paginated(opts.contracts ?? CONTRACTS)));
    },
  );
  await page.route(
    (url) => /^\/api\/collaborator-contracts\/\d+$/.test(url.pathname),
    (route) => {
      const req = route.request();
      const body = JSON.parse(req.postData() || '{}');
      captured.push({
        method: req.method(),
        path: new URL(req.url()).pathname,
        body,
      });
      return route.fulfill(
        json({ statusCode: 200, message: 'ok', data: { id: 12, ...body } }),
      );
    },
  );
  // El PDF incrustado se sirve fuera de /api.
  await page.route(
    (url) => url.pathname.startsWith('/uploads/'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4 e2e',
      }),
  );

  return { captured, uploads };
}

async function gotoContracts(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Finance & HR').click();
  await page.getByText('HR', { exact: true }).click();
  await page.getByText('Collaborators Contracts').click();
  await expect(
    page
      .getByRole('main')
      .getByRole('heading', { name: 'Collaborator Contracts', exact: true }),
  ).toBeVisible();
}

const rowOf = (page: Page, ref: string) =>
  page.getByRole('row').filter({ hasText: ref });

// ==================== Historia 1: directorio ====================

test('la parrilla enlaza cada contrato con su colaborador, rol y ficha', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  const row = rowOf(page, '#CTR-12');
  await expect(row).toContainText('Juan Pérez');
  // La píldora de rol lleva dentro la ligadura del icono Material, así que se afirma
  // sobre la fila y no sobre un texto exacto.
  await expect(row).toContainText('Waiter');
  await expect(row).toContainText('#CLB-4');
});

test('la píldora anuncia el tipo de acuerdo', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await expect(page.getByTestId('contract-type-12')).toHaveText('Full-Time');
  await expect(page.getByTestId('contract-type-13')).toHaveText('Part-Time');
});

test('un contrato sin fecha de fin se anuncia como indefinido', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await expect(rowOf(page, '#CTR-12')).toContainText('→ Indefinite');
  await expect(rowOf(page, '#CTR-13')).toContainText('Jul 01, 2026');
});

test('la retribución se lee con su periodo', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await expect(rowOf(page, '#CTR-12')).toContainText('$22.50 / hr');
  await expect(rowOf(page, '#CTR-13')).toContainText('$3,500.00 / month');
});

test('avisa en ámbar del contrato que entra en renovación', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await expect(page.getByTestId('contract-status-13')).toHaveText('Expiring Soon');
  await expect(page.getByTestId('contract-status-13')).toHaveClass(/amber/);
  await expect(rowOf(page, '#CTR-13')).toContainText('Expires in 16 days');
});

test('arranca mostrando sólo los acuerdos en vigor', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await expect(page.getByLabel('Filter by compliance status')).toHaveValue('active');
  await expect(page.getByText('#CTR-12')).toBeVisible();
  await expect(page.getByText('#CTR-13')).toBeVisible();
  await expect(page.getByText('#CTR-14')).toHaveCount(0);
  await expect(page.getByText('#CTR-15')).toHaveCount(0);
});

test('marca en rojo el contrato vencido cuando se pide', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByLabel('Filter by compliance status').selectOption('expired');

  await expect(page.getByTestId('contract-status-14')).toHaveText('Expired');
  await expect(page.getByTestId('contract-status-14')).toHaveClass(/red/);
  await expect(rowOf(page, '#CTR-14')).toContainText('Expired 45 days ago');
});

test('saca a la luz los acuerdos rescindidos cuando se piden', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByLabel('Filter by compliance status').selectOption('terminated');

  await expect(page.getByTestId('contract-status-15')).toHaveText('Terminated');
  await expect(rowOf(page, '#CTR-15')).toContainText('Agreement terminated');
});

test('la búsqueda encuentra por identificador de contrato', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByLabel('Search contracts').fill('#CTR-13');

  await expect(page.getByText('#CTR-13')).toBeVisible();
  await expect(page.getByText('#CTR-12')).toHaveCount(0);
});

test('la búsqueda encuentra por ficha de empleado y por nombre', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByLabel('Search contracts').fill('#CLB-5');
  await expect(page.getByText('#CTR-13')).toBeVisible();

  await page.getByLabel('Search contracts').fill('juan');
  await expect(page.getByText('#CTR-12')).toBeVisible();
  await expect(page.getByText('#CTR-13')).toHaveCount(0);
});

test('filtra por tipo de contrato', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByLabel('Filter by contract type').selectOption('part_time');

  await expect(page.getByText('#CTR-13')).toBeVisible();
  await expect(page.getByText('#CTR-12')).toHaveCount(0);
});

test('la ventana de caducidad deja fuera a los indefinidos', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByLabel('Filter by expiration window').selectOption('30');

  await expect(page.getByText('#CTR-13')).toBeVisible();
  await expect(page.getByText('#CTR-12')).toHaveCount(0);
});

test('el estado vacío invita a registrar el primer contrato', async ({ page }) => {
  await bootstrap(page, { contracts: [] });
  await gotoContracts(page);

  await expect(page.getByTestId('contracts-empty-state')).toContainText(
    'No contracts registered.',
  );
});

// ==================== Historia 2: alta y enmienda ====================

test('el alta envía los términos pactados con la empresa resuelta del comercio', async ({
  page,
}) => {
  const { captured } = await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: /create new contract/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Collaborator \*/).selectOption('6');
  await dialog.getByLabel(/Contract type \*/).selectOption('temporary');
  await dialog.getByLabel(/Wage rate \*/).fill('25.5');
  await dialog.getByLabel(/Pay frequency \*/).selectOption('weekly');
  await dialog.getByLabel(/Hours \/ week \*/).fill('32');
  await dialog.getByRole('button', { name: 'Register Contract' }).click();

  await expect
    .poll(() => captured.filter((c) => c.method === 'POST').length)
    .toBe(1);
  expect(captured[0].body).toMatchObject({
    collaborator_id: 6,
    merchant_id: MERCHANT.id,
    company_id: COMPANY_ID,
    employment_type: 'temporary',
    pay_frequency: 'weekly',
    wage_rate: 25.5,
    working_hours_per_week: 32,
    end_date: null,
    active: true,
  });
});

test('la guarda de fechas impide un contrato que acaba antes de empezar', async ({
  page,
}) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: /create new contract/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Collaborator \*/).selectOption('6');
  await dialog.getByLabel(/Wage rate \*/).fill('20');
  await dialog.getByLabel(/Start date \*/).fill('2026-05-01');
  await dialog.getByLabel('End date').fill('2026-04-01');

  await expect(
    dialog.getByText('Contract End Date must be later than Start Date.'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Register Contract' })).toBeDisabled();
});

test('la guarda de solape nombra el contrato que estorba antes de enviar', async ({
  page,
}) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: /create new contract/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Collaborator \*/).selectOption('4');

  await expect(dialog.getByText(/already has an active agreement \(#CTR-12/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Register Contract' })).toBeDisabled();
});

test('la renovación pasa cuando el contrato anterior ya venció', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: /create new contract/i }).click();
  const dialog = page.getByRole('dialog');
  // #CTR-14 sigue marcado activo pero venció: no debe bloquear a su renovación.
  await dialog.getByLabel(/Collaborator \*/).selectOption('6');
  await dialog.getByLabel(/Wage rate \*/).fill('20');

  await expect(dialog.getByText(/already has an active agreement/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Register Contract' })).toBeEnabled();
});

test('rechaza un adjunto que no es PDF ni Word', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: /create new contract/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Signed contract document').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from('x'),
  });

  await expect(
    dialog.getByText('The signed contract must be a PDF or Word document.'),
  ).toBeVisible();
});

test('sube el documento firmado en cuanto el contrato existe', async ({ page }) => {
  const { uploads } = await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: /create new contract/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Collaborator \*/).selectOption('6');
  await dialog.getByLabel(/Wage rate \*/).fill('20');
  await dialog.getByLabel('Signed contract document').setInputFiles({
    name: 'firmado.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 firmado'),
  });
  await expect(dialog.getByText(/firmado\.pdf/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Register Contract' }).click();

  await expect
    .poll(() => uploads)
    .toContain('/api/collaborator-contracts/99/document');
});

test('el 409 del backend se traduce al contrato concreto que bloquea', async ({ page }) => {
  await bootstrap(page, { createStatus: 409 });
  await gotoContracts(page);

  await page.getByRole('button', { name: /create new contract/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Collaborator \*/).selectOption('6');
  await dialog.getByLabel(/Wage rate \*/).fill('20');
  await dialog.getByRole('button', { name: 'Register Contract' }).click();

  await expect(dialog.getByText(/already has an active contract/)).toBeVisible();
});

test('la enmienda actualiza los términos con PUT', async ({ page }) => {
  const { captured } = await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: 'Amend contract #CTR-12' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Hours \/ week \*/).fill('35');
  await dialog.getByRole('button', { name: 'Save Amendment' }).click();

  await expect.poll(() => captured.filter((c) => c.method === 'PUT').length).toBe(1);
  const put = captured.find((c) => c.method === 'PUT')!;
  expect(put.path).toBe('/api/collaborator-contracts/12');
  expect(put.body).toMatchObject({ working_hours_per_week: 35 });
});

test('la enmienda puede rescindir el acuerdo para liberar al colaborador', async ({
  page,
}) => {
  const { captured } = await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: 'Amend contract #CTR-12' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Agreement status \*/).selectOption('terminated');
  await dialog.getByRole('button', { name: 'Save Amendment' }).click();

  await expect.poll(() => captured.filter((c) => c.method === 'PUT').length).toBe(1);
  expect(captured.find((c) => c.method === 'PUT')!.body).toMatchObject({ active: false });
});

// ==================== Historia 3: inspección y navegación ====================

test('el cajón de inspección resume los términos del acuerdo', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: 'Inspect contract #CTR-13' }).click();
  const dialog = page.getByRole('dialog');

  await expect(dialog.getByText('#CTR-13')).toBeVisible();
  await expect(dialog.getByText('Ana Rivas')).toBeVisible();
  await expect(dialog.getByTestId('contract-detail-status')).toHaveText('Expiring Soon');
  await expect(dialog.getByText('$3,500.00 / month')).toBeVisible();
  await expect(dialog.getByText('20 hrs / week')).toBeVisible();
  await expect(dialog.getByText('Jul 01, 2026')).toBeVisible();
});

test('el visor incrusta el PDF firmado con descarga e impresión', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByLabel('Filter by compliance status').selectOption('expired');
  await page.getByRole('button', { name: 'Inspect contract #CTR-14' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /signed document/i }).click();

  await expect(dialog.getByTestId('contract-document-frame')).toHaveAttribute(
    'src',
    '/uploads/contracts/contract-14.pdf',
  );
  await expect(dialog.getByRole('link', { name: /download/i })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /print/i })).toBeVisible();
});

test('avisa cuando todavía no hay documento firmado adjunto', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: 'Inspect contract #CTR-12' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /signed document/i }).click();

  await expect(dialog.getByText(/No signed document attached yet/)).toBeVisible();
});

test('la bitácora lista las enmiendas con su antes y su después', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: 'Inspect contract #CTR-12' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /amendment history/i }).click();

  const revision = dialog.getByTestId('contract-revision-2');
  await expect(revision).toContainText('Hourly rate');
  await expect(revision).toContainText('$20.00');
  await expect(revision).toContainText('$22.50');
  await expect(dialog.getByTestId('contract-revision-1')).toContainText('Weekly hours');
});

test('un acuerdo sin enmiendas lo dice en vez de dejar el panel vacío', async ({ page }) => {
  await bootstrap(page, { revisions: [] });
  await gotoContracts(page);

  await page.getByRole('button', { name: 'Inspect contract #CTR-12' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /amendment history/i }).click();

  await expect(dialog.getByText(/No amendments recorded/)).toBeVisible();
});

test('desde la inspección se salta directo a enmendar', async ({ page }) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: 'Inspect contract #CTR-12' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /amend contract/i }).click();

  await expect(page.getByRole('button', { name: 'Save Amendment' })).toBeVisible();
});

test('borra un contrato tras confirmar', async ({ page }) => {
  const { captured } = await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: 'Delete contract #CTR-12' }).click();
  // Se ancla al diálogo: los botones de la parrilla llevan "Delete contract #CTR-…" y el
  // nombre accesible casa igual sin distinguir mayúsculas.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete Contract', exact: true })
    .click();

  await expect.poll(() => captured.filter((c) => c.method === 'DELETE').length).toBe(1);
  await expect(page.getByText('#CTR-12')).toHaveCount(0);
});

test('la barra de RR. HH. navega a los otros dos workspaces sin perder el contexto', async ({
  page,
}) => {
  await bootstrap(page);
  await gotoContracts(page);

  await page.getByRole('button', { name: /collaborators database/i }).click();
  await expect(
    page
      .getByRole('main')
      .getByRole('heading', { name: 'Collaborators Database', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: /collaborator contracts/i }).click();
  await expect(
    page
      .getByRole('main')
      .getByRole('heading', { name: 'Collaborator Contracts', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: /time entries control/i }).click();
  await expect(
    page.getByRole('main').getByRole('heading', { name: /time entries/i }),
  ).toBeVisible();
});
