// E2E REAL de Delivery Management: navegador + backoffice + API NestJS + Postgres, sin mocks.
//
// Se activa sólo con E2E_REAL=1 (la suite normal de e2e/ mockea la API y no debe depender
// de un backend vivo). Requisitos: backend en :3001 contra una base de pruebas con las
// semillas de e2e/real/README.md, y el usuario E2E_EMAIL / E2E_PASSWORD.
//
// Los pings GPS se envían por API, como lo haría la app del repartidor; todo lo demás se
// hace por la interfaz. Cada paso deja una captura en E2E_SHOTS (por defecto test-results).

import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const REAL = process.env.E2E_REAL === '1';
const API = process.env.E2E_API ?? 'http://localhost:3001/api';
const EMAIL = process.env.E2E_EMAIL ?? 'admin@x7delivery-e2e.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePass123';
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/delivery-real';

const RED = 'rgb(174, 0, 26)';
const PILL = {
  green: 'rgb(16, 185, 129)',
  slate: 'rgb(100, 116, 139)',
  amber: 'rgb(245, 158, 11)',
  blue: 'rgb(59, 130, 246)',
  purple: 'rgb(139, 92, 246)',
  red: 'rgb(239, 68, 68)',
};

test.describe.configure({ mode: 'serial', timeout: 90_000 });
test.skip(!REAL, 'E2E real: exporta E2E_REAL=1 con el backend y la base de pruebas levantados');

let token = '';
let page: Page;
let step = 0;

const shot = async (name: string) => {
  step += 1;
  await page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, '0')}-${name}.png`, fullPage: true });
};

const api = async (request: APIRequestContext, method: 'get' | 'post', path: string, data?: unknown) => {
  const res = await request[method](`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    ...(data ? { data } : {}),
  });
  expect(res.ok(), `${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
};

const fontOf = (l: Locator) => l.evaluate((el) => getComputedStyle(el).fontFamily);
const colorOf = (l: Locator, prop: 'color' | 'backgroundColor' = 'color') =>
  l.evaluate((el, p) => getComputedStyle(el)[p as 'color'], prop);

/** Patrón común: hover pasa el texto al rojo corporativo con transición de 200 ms. */
const expectRedHover = async (l: Locator) => {
  const transition = await l.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(transition).toContain('0.2s');
  await l.hover();
  await expect.poll(() => colorOf(l)).toBe(RED);
};

/** Nada se sale por la derecha a 1440 px: el contenido cabe en su contenedor. */
const expectNoOverflow = async (l: Locator) => {
  const { scroll, client } = await l.evaluate((el) => {
    const box = el.parentElement ?? el;
    return { scroll: box.scrollWidth, client: box.clientWidth };
  });
  expect(scroll, 'contenido más ancho que su contenedor').toBeLessThanOrEqual(client + 1);
};

/** Píldora de color: al pasar el ratón, fondo blanco y texto rojo (legible). */
const expectPillHover = async (l: Locator) => {
  await l.hover();
  await expect.poll(() => colorOf(l, 'backgroundColor')).toBe('rgb(255, 255, 255)');
  await expect.poll(() => colorOf(l)).toBe(RED);
  await page.mouse.move(0, 0);
};

/** Barra persistente del épico: 5 accesos, el activo en rojo y el regreso al Command Hub. */
const expectNavHub = async (active: string) => {
  // El <nav> mide 0×0 (su barra es position: fixed): la visibilidad se mira en los botones.
  const nav = page.getByRole('navigation', { name: /Delivery Management module navigation/i });
  for (const label of ['DELIVERY ASSIGNMENTS', 'DELIVERY DRIVERS', 'DELIVERY FEES', 'DELIVERY TRACKING', 'DELIVERY ZONES']) {
    await expect(nav.getByRole('button', { name: label })).toBeVisible();
  }
  const current = nav.getByRole('button', { name: active });
  await expect(current).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => colorOf(current, 'backgroundColor')).toBe(RED);
  await expect(nav.getByRole('button', { name: 'DELIVERY MANAGEMENT COMMAND HUB' })).toBeVisible();
};

const goTo = async (label: string) => {
  await page.getByRole('navigation', { name: /Delivery Management module navigation/i }).getByRole('button', { name: label }).click();
  await page.waitForLoadState('networkidle');
};

test.beforeAll(async ({ browser, request }) => {
  const res = await request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  token = (await res.json()).access_token;
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
});

test.afterAll(async () => {
  await page?.close();
});

test('login real y entrada al épico por URL', async () => {
  await page.goto('/login');
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/dashboard|delivery/);
  await page.goto('/delivery/zones');
  await expect(page.getByRole('heading', { name: 'DELIVERY ZONES', exact: true })).toBeVisible();
  await expectNavHub('DELIVERY ZONES');
  await shot('zones-empty');
});

test('zonas: crear con la herramienta de radio, chip de vértices, KPI y geocerca', async () => {
  await page.getByRole('button', { name: /new zone/i }).click();
  await page.fill('#zone-name', 'Centro, Zona Norte');
  await page.fill('#zone-description', 'Providencia y Santiago Centro');
  await page.locator('[aria-label="Boundary tools"] button', { hasText: /radius template/i }).click();
  // La herramienta activa se distingue (borde y texto rojos) y no hay entrada de GeoJSON crudo.
  const radiusTab = page.getByRole('tab', { name: /radius template/i });
  await page.mouse.move(0, 0);
  await expect.poll(() => colorOf(radiusTab)).toBe(RED);
  expect(await colorOf(page.getByRole('tab', { name: /draw on map/i }))).not.toBe(RED);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.fill('#radius-lat', '-33.4372');
  await page.fill('#radius-lng', '-70.6345');
  await page.fill('#radius-km', '5');
  await page.getByRole('button', { name: /Generate 5 km zone/i }).click();
  await expect(page.getByText(/64 vertices/i).first()).toBeVisible();
  await shot('zone-drawer-radius');
  await page.getByRole('button', { name: 'Create zone' }).click();
  await expect(page.getByText('#ZON-1').first()).toBeVisible();
  await expect(page.getByText(/Polygon defined · 64 vertices/i).first()).toBeVisible();

  // Segunda zona sin perímetro y en mantenimiento → aviso de "sin perímetro" y píldora ámbar.
  await page.getByRole('button', { name: /new zone/i }).click();
  await page.fill('#zone-name', 'Zona Sur');
  await page.selectOption('#zone-status', 'maintenance');
  await page.getByRole('button', { name: 'Create zone' }).click();
  await expect(page.getByText('#ZON-2').first()).toBeVisible();
  await expect(page.getByText(/No boundary set/i).first()).toBeVisible();

  // Patrones de diseño: Poppins en IDs/títulos, píldoras por estado, hover rojo en filas.
  expect(await fontOf(page.getByText('#ZON-1').first())).toContain('Poppins');
  const activePill = page.getByTestId(/zone-status-pill|status-pill/).first();
  if (await activePill.count()) expect([PILL.green, PILL.amber]).toContain(await colorOf(activePill, 'backgroundColor'));
  await expectRedHover(page.getByText('Centro, Zona Norte').first());

  // KPI: 1 activa (la de mantenimiento no cuenta) y 1 sin perímetro.
  const kpis = page.locator('main');
  await expect(kpis.getByText(/TOTAL ACTIVE ZONES/i)).toBeVisible();
  await expect(kpis.getByText(/1 zone without a boundary|Zona Sur/i).first()).toBeVisible();
  await shot('zones-created');

  // Búsqueda instantánea por nombre/descripción y filtro de estado.
  await page.getByPlaceholder(/Search zones/i).fill('providencia');
  await expect(page.getByText('#ZON-2')).toHaveCount(0);
  await expect(page.getByText('#ZON-1').first()).toBeVisible();
  await page.getByPlaceholder(/Search zones/i).fill('');
  await shot('zones-search');
});

test('tarifas: KPI de zonas sin tarifa, validaciones, alta y calculadora', async () => {
  await goTo('DELIVERY FEES');
  await expectNavHub('DELIVERY FEES');
  await expect(page.getByText(/Centro, Zona Norte/).first()).toBeVisible(); // aviso de zona sin tarifa
  await shot('fees-missing-rule-alert');

  await page.getByRole('button', { name: /new fee/i }).first().click();
  await page.selectOption('#fee-zone', { label: /Centro, Zona Norte/ as unknown as string }).catch(async () => {
    const value = await page.locator('#fee-zone option', { hasText: 'Centro, Zona Norte' }).getAttribute('value');
    await page.selectOption('#fee-zone', value!);
  });
  await page.fill('#fee-baseFee', '5.99');
  await page.fill('#fee-perKmFee', '1.50');
  await page.fill('#fee-minOrder', '60');
  await page.fill('#fee-freeAbove', '50');
  await page.getByRole('button', { name: 'Create fee' }).click();
  // free_above debe ser ESTRICTAMENTE mayor que el pedido mínimo.
  await expect(page.getByText(/must be (greater|above)/i).first()).toBeVisible();
  await shot('fee-threshold-validation');
  await page.fill('#fee-minOrder', '10.99');
  await page.getByRole('button', { name: 'Create fee' }).click();

  await expect(page.getByText('#FEE-1').first()).toBeVisible();
  await expect(page.getByText('$5.99').first()).toBeVisible();
  await expect(page.getByText('+$1.50/km').first()).toBeVisible();
  await expect(page.getByText(/Min: \$10\.99/).first()).toBeVisible();
  await expect(page.getByText(/Free over \$50\.00/).first()).toBeVisible();
  expect(await fontOf(page.getByText('#FEE-1').first())).toContain('Poppins');
  await expectRedHover(page.getByText('#FEE-1').first());
  await shot('fees-created');

  // Calculadora contra POST /delivery-fee/quote: por debajo del mínimo dice cuánto falta.
  const calc = page.getByTestId(/quote|calculator/).first();
  const scope = (await calc.count()) ? calc : page.locator('form').filter({ hasText: /subtotal/i }).last();
  const zoneSelect = scope.locator('select').first();
  const zoneValue = await zoneSelect.locator('option', { hasText: 'Centro, Zona Norte' }).getAttribute('value');
  await zoneSelect.selectOption(zoneValue!);
  await scope.getByPlaceholder('24.50').fill('8');
  await scope.getByPlaceholder('3.2').fill('2');
  await scope.getByRole('button').last().click();
  await expect(page.getByText(/\$2\.99/).first()).toBeVisible();
  await scope.getByPlaceholder('24.50').fill('20');
  await scope.getByRole('button').last().click();
  await expect(page.getByText(/\$8\.99/).first()).toBeVisible(); // 5.99 + 2 × 1.50
  await scope.getByPlaceholder('24.50').fill('55');
  await scope.getByRole('button').last().click();
  await expect(page.getByText(/\$0\.00/).first()).toBeVisible();
  await shot('fees-calculator');
});

test('repartidores: alta con límites, tel:, vehículo, turno y KPI', async () => {
  await goTo('DELIVERY DRIVERS');
  await expectNavHub('DELIVERY DRIVERS');
  await shot('drivers-empty');

  const create = async (name: string, phone: string, vehicle: string) => {
    await page.getByRole('button', { name: /new driver|add driver/i }).first().click();
    await page.fill('#driver-name', name);
    await page.fill('#driver-phone', phone);
    await page.selectOption('#driver-vehicle', vehicle);
    await page.getByRole('button', { name: 'Create driver' }).click();
    await expect(page.getByText(name).first()).toBeVisible();
  };

  // Límite de 100 caracteres en el nombre.
  await page.getByRole('button', { name: /new driver|add driver/i }).first().click();
  await page.fill('#driver-name', 'x'.repeat(101));
  await expect(page.getByText(/100 characters/i).first()).toBeVisible();
  await shot('driver-length-validation');
  await page.getByRole('button', { name: /cancel/i }).first().click();

  await create('Mario López', '809-555-1234', 'motorcycle');
  await create('Luis Gómez', '+1 (809) 555-9876', 'car');

  await expect(page.locator('a[href="tel:8095551234"]').first()).toBeVisible();
  expect(await fontOf(page.getByText('#DRV-1').first())).toContain('Poppins');
  await expect(page.locator('tr, [data-testid^="driver-row"]').filter({ hasText: 'Mario López' }).getByText('Motorcycle').first()).toBeVisible();

  // Interruptor de turno de un clic: Luis pasa a fuera de turno.
  const luisRow = page.locator('tr, [data-testid^="driver-row"]').filter({ hasText: 'Luis Gómez' }).first();
  await luisRow.getByRole('switch').click();
  const offPill = page.getByTestId('driver-status-2');
  await expect(offPill).toHaveText(/Off shift/i);
  await expect.poll(() => colorOf(offPill, 'backgroundColor')).toBe(PILL.slate);
  await expect.poll(() => colorOf(page.getByTestId('driver-status-1'), 'backgroundColor')).toBe(PILL.green);
  await expectNoOverflow(page.getByTestId('driver-table'));
  await expectPillHover(page.getByTestId('driver-status-1'));
  await expectRedHover(page.getByText('Mario López').first());
  await shot('drivers-created-shift');
});

test('asignaciones: despacho propio, sólo repartidores disponibles, ciclo de vida y terceros', async () => {
  await goTo('DELIVERY ASSIGNMENTS');
  await expectNavHub('DELIVERY ASSIGNMENTS');
  await shot('assignments-empty');

  // Alta propia: el desplegable no ofrece a Luis (fuera de turno).
  await page.getByRole('button', { name: /new assignment/i }).click();
  const orderSelect = page.getByLabel('Delivery order');
  const firstOrder = await orderSelect.locator('option', { hasText: 'E2E-0001' }).getAttribute('value');
  await orderSelect.selectOption(firstOrder!);
  const driverSelect = page.getByLabel('Driver', { exact: true });
  await expect(driverSelect.locator('option', { hasText: 'Mario López' })).toHaveCount(1);
  await expect(driverSelect.locator('option', { hasText: 'Luis Gómez' })).toHaveCount(0);
  const marioValue = await driverSelect.locator('option', { hasText: 'Mario López' }).getAttribute('value');
  await driverSelect.selectOption(marioValue!);
  await shot('assignment-drawer-in-house');
  await page.getByRole('button', { name: 'Create assignment' }).click();
  await expect(page.getByText('#ASN-1').first()).toBeVisible();
  await expect(page.getByText(/#ORD-1/).first()).toBeVisible();
  const card1 = page.getByTestId('assignment-card-1');
  const pill1 = card1.getByTestId('status-pill');
  await expect(pill1).toHaveText(/Assigned/i);
  await expect.poll(() => colorOf(pill1, 'backgroundColor')).toBe(PILL.blue);
  expect(await fontOf(page.getByText('#ASN-1').first())).toContain('Poppins');

  // Ciclo de vida: recogido → en tránsito.
  await card1.getByRole('button', { name: /Mark picked up/i }).click();
  await expect(page.getByTestId('assignment-card-1').getByTestId('timeline')).toContainText(/Picked up/i);
  await page.getByTestId('assignment-card-1').getByRole('button', { name: /Mark in transit/i }).click();
  const transitPill = page.getByTestId('assignment-card-1').getByTestId('status-pill');
  await expect(transitPill).toHaveText(/In transit/i);
  await expect.poll(() => colorOf(transitPill, 'backgroundColor')).toBe(PILL.purple);
  await expectPillHover(transitPill);
  const board = page.getByTestId('kanban-board');
  const { scroll, client } = await board.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll, 'las 5 columnas del Kanban caben a 1440 px').toBeLessThanOrEqual(client + 1);
  await expectRedHover(page.getByTestId('assignment-card-1'));
  await shot('assignment-in-transit');

  // Tercero (Uber Direct): el proveedor no está conectado → aviso; alta manual con su coste.
  await page.getByRole('button', { name: /new assignment/i }).click();
  const secondOrder = await orderSelect.locator('option', { hasText: 'E2E-0002' }).getAttribute('value');
  await orderSelect.selectOption(secondOrder!);
  await page.getByRole('radio', { name: /uber direct/i }).check();
  await page.getByRole('button', { name: 'Request quote' }).click();
  await expect(page.getByTestId('provider-message')).toContainText(/not connected/i);
  await page.getByPlaceholder('a1b2c3d4-dsp').fill('uber-e2e-001');
  await page.getByPlaceholder('https://track.example.com/…').fill('https://track.example.com/uber-e2e-001');
  await page.getByPlaceholder('6.50').fill('6.50');
  await shot('assignment-drawer-dsp');
  await page.getByRole('button', { name: 'Create assignment' }).click();
  await expect(page.getByText(/DSP Fee: \$6\.50/).first()).toBeVisible();
  await expect(page.getByText('Uber Direct').first()).toBeVisible();

  // Vista tabla.
  await page.getByRole('button', { name: /^table$/i }).click();
  await expect(page.getByText('#ASN-2').first()).toBeVisible();
  await shot('assignments-table');
  await page.getByRole('button', { name: /^kanban$/i }).click();
});

test('seguimiento en vivo: pings reales, socket, recorrido y KPI', async ({ request }) => {
  // Primer ping antes de abrir la vista.
  const points = [
    [-33.4372, -70.6345],
    [-33.4351, -70.6301],
    [-33.4329, -70.6262],
  ];
  await api(request, 'post', '/delivery-tracking', { deliveryAssignment: 1, latitude: points[0][0], longitude: points[0][1] });

  await goTo('DELIVERY TRACKING');
  await expectNavHub('DELIVERY TRACKING');
  const card = page.getByTestId('tracking-card-1');
  await expect(card).toContainText('#ASN-1');
  await expect(page.getByTestId('card-trk-1')).toContainText('#TRK-1');
  await expect(page.getByTestId('card-coords-1')).toContainText('-33.437200');
  await expect(page.getByTestId('card-status-1')).toContainText(/Live GPS/i);
  await expect.poll(() => colorOf(page.getByTestId('card-status-1'), 'backgroundColor')).toBe(PILL.green);
  expect(await fontOf(page.getByTestId('card-trk-1'))).toContain('Poppins');
  expect(await fontOf(page.getByTestId('card-coords-1'))).toContain('Poppins');
  await expectRedHover(card);
  await shot('tracking-live');

  // Nuevos pings con la vista abierta: deben llegar por el socket sin recargar. El sondeo
  // de respaldo es cada 15 s, así que exigir < 5 s demuestra que llegó por el socket.
  await expect(page.getByText(/^Live$/).first()).toBeVisible({ timeout: 10_000 });
  for (const [lat, lng] of points.slice(1)) {
    await api(request, 'post', '/delivery-tracking', { deliveryAssignment: 1, latitude: lat, longitude: lng });
  }
  await expect(page.getByTestId('card-coords-1')).toContainText('-33.432900', { timeout: 5_000 });
  await expect(page.getByTestId('card-updated-1')).toContainText(/Updated|ago|now/i);

  // Enfocar al repartidor: recorrido con los 3 puntos.
  await card.click();
  await expect(page.getByText(/3 points/i).first()).toBeVisible();
  await shot('tracking-route-focus');
});

test('cierre: entregado libera al repartidor y el hub del épico', async ({ request }) => {
  await goTo('DELIVERY ASSIGNMENTS');
  await page.getByTestId('assignment-card-1').getByRole('button', { name: /Mark delivered/i }).click();
  const deliveredPill = page.getByTestId('assignment-card-1').getByTestId('status-pill');
  await expect(deliveredPill).toHaveText(/Delivered/i);
  await expect.poll(() => colorOf(deliveredPill, 'backgroundColor')).toBe(PILL.green);
  await shot('assignment-delivered');

  // El repartidor vuelve a estar disponible y el pedido queda entregado.
  const drivers = await api(request, 'get', '/delivery-driver?search=Mario');
  expect(drivers.data[0].status).toBe('active');
  const live = await api(request, 'get', '/delivery-assignment/summary');
  expect(live.data.avg_completion_minutes).not.toBeNull();

  await goTo('DELIVERY DRIVERS');
  await expect(page.locator('tr, [data-testid^="driver-row"]').filter({ hasText: 'Mario López' }).getByText(/Available/i).first()).toBeVisible();
  await shot('drivers-after-delivery');

  // Botón de regreso → Command Hub del épico.
  await page.getByRole('button', { name: 'DELIVERY MANAGEMENT COMMAND HUB' }).click();
  await expect(page.getByText(/Delivery Management Command Hub/i).first()).toBeVisible();
  await page.waitForTimeout(1200); // animación de entrada del hub
  await shot('delivery-command-hub');
});
