#!/usr/bin/env node
// Carga datos de demostración en el backend a través de la API, como lo haría el backoffice.
//
// Todo se crea dentro de una empresa y un comercio propios (X7 Demo Bistro, en Miami FL), así
// que no toca los datos de otros. Los datos siguen las convenciones de EE. UU. (USD, sales tax
// sobre el precio, propinas de 18-22%, horas extra FLSA) y están en inglés, como los verá el
// cliente. Es re-ejecutable: antes de crear algo busca si ya existe por su nombre.
//
//   node scripts/seed-demo.mjs --dry-run     # muestra lo que haría, sin escribir nada
//   node scripts/seed-demo.mjs               # crea lo que falte
//   node scripts/seed-demo.mjs --only=kitchen,dining
//
// Variables (opcionales): SEED_API_URL (por defecto VITE_API_URL del .env), SEED_EMAIL,
// SEED_PASSWORD.

import { readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ONLY = [...args].find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',') ?? null;

const envFile = (() => {
  try {
    return readFileSync(new URL('../.env', import.meta.url), 'utf8');
  } catch {
    return '';
  }
})();
const fromEnvFile = (key) => envFile.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const API = (process.env.SEED_API_URL ?? fromEnvFile('VITE_API_URL') ?? 'http://localhost:3000/api').replace(/\/$/, '');
const DOMAIN = 'miami.x7demo.dev';
const EMAIL = process.env.SEED_EMAIL ?? `admin@${DOMAIN}`;
const PASSWORD = process.env.SEED_PASSWORD ?? 'Demo1234!';

// Datos del onboarding (los mismos pasos que el asistente de registro del backoffice).
const DEMO_COMPANY = {
  // Professional es el plan más alto sin contacto con ventas: incluye todo lo que carga este
  // script; solo le faltan loyalty y marketing.
  tierId: 'professional',
  business: {
    legalBusinessName: 'X7 Demo Restaurant Group LLC',
    taxId: '47-2851936',
    primaryIndustry: 'Full Service Restaurant',
    registeredAddress: '1250 Brickell Ave, Suite 400',
    city: 'Miami',
    state: 'FL',
    zipCode: '33131',
  },
  merchant: {
    name: 'X7 Demo Bistro',
    email: `bistro@${DOMAIN}`,
    phone: '+1 (305) 555-0142',
    address: '1250 Brickell Ave',
    city: 'Miami',
    state: 'FL',
    country: 'United States',
  },
  admin: {
    firstName: 'Admin',
    lastName: 'Demo',
    jobTitle: 'General Manager',
    workEmail: EMAIL,
    password: PASSWORD,
    termsAccepted: true,
  },
};

// Miami-Dade: 6% estatal de Florida + 1% de recargo del condado, sobre el precio de carta.
const SALES_TAX_RATE = 0.07;

// ---------------------------------------------------------------------------------------------
// HTTP

let token = null;
let merchantId = null;
let adminUserId = null;

async function request(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const base = Array.isArray(json?.message) ? json.message.join(', ') : json?.message ?? res.statusText;
    // ValidationExceptionFilter manda el detalle por campo en `errors`.
    const details = Array.isArray(json?.errors) ? ` (${json.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('; ')})` : '';
    const message = base + details;
    const err = new Error(`${method} ${path} → ${res.status}: ${message}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const unwrapList = (json) => (Array.isArray(json) ? json : json?.data ?? json?.items ?? []);
const unwrapItem = (json) => json?.data ?? json;

// Algunos listados no aceptan `limit` (u otros filtros) y responden 400: se reintenta sin query.
async function list(path) {
  try {
    return await request('GET', path);
  } catch (err) {
    if (err.status === 400 && path.includes('?')) return request('GET', path.split('?')[0]);
    throw err;
  }
}

const stats = { created: 0, existing: 0, failed: 0 };
let dryRunId = -1;

/**
 * Busca en `listPath` un registro que cumpla `match`; si no existe, lo crea con POST.
 * Devuelve el registro (o uno simulado con id negativo en --dry-run). `found` permite pasar el
 * registro ya buscado en un listado previo, sin volver a pedirlo.
 */
async function ensure(label, listPath, match, createPath, body, found) {
  try {
    const existing = found ?? unwrapList(await list(listPath)).find(match);
    if (existing) {
      stats.existing += 1;
      console.log(`  = ${label} (ya existe, id ${existing.id})`);
      return existing;
    }
  } catch (err) {
    // Sin listado no podemos comprobar duplicados: mejor no crear a ciegas.
    if (!DRY_RUN) throw err;
  }
  if (DRY_RUN) {
    console.log(`  + ${label}  POST ${createPath} ${JSON.stringify(body)}`);
    return { id: dryRunId--, ...body };
  }
  try {
    const created = unwrapItem(await request('POST', createPath, body));
    stats.created += 1;
    console.log(`  + ${label} (id ${created.id})`);
    return created;
  } catch (err) {
    stats.failed += 1;
    console.log(`  ! ${label}: ${err.message}`);
    return null;
  }
}

const byName = (name) => (r) => String(r.name ?? '').trim().toLowerCase() === name.toLowerCase();

/** Registros ya existentes de un listado (para enlazar áreas que se ejecutan por separado). */
async function existing(listPath) {
  try {
    return unwrapList(await list(listPath));
  } catch {
    return [];
  }
}

const idOf = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

/** Monto en dólares redondeado a centavos. */
const usd = (amount) => Math.round(amount * 100) / 100;

/** Empresa del comercio demo (varios DTO de finanzas la piden explícitamente). */
let cachedCompanyId = null;
async function companyId() {
  if (cachedCompanyId == null) {
    const merchant = unwrapItem(await request('GET', `/merchants/${merchantId}`).catch(() => null));
    cachedCompanyId = idOf(merchant?.companyId ?? merchant?.company) ?? null;
  }
  return cachedCompanyId;
}

/** Fecha (YYYY-MM-DD) `daysFromToday` días a partir de hoy. */
const day = (daysFromToday) => at(daysFromToday, 12).slice(0, 10);

/** Fecha local `daysFromToday` días a partir de hoy, a la hora indicada, en ISO. */
const at = (daysFromToday, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

// ---------------------------------------------------------------------------------------------
// Sesión: login con el admin demo; si no existe, se registra la empresa demo (onboarding).

async function login() {
  try {
    const res = await request('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
    token = res.access_token;
    merchantId = res.user?.merchant?.id;
    adminUserId = res.user?.id;
    return true;
  } catch (err) {
    if (err.status === 401 || err.status === 404) return false;
    throw err;
  }
}

async function session() {
  if (await login()) {
    console.log(`Sesión: ${EMAIL} (merchant ${merchantId})`);
    return;
  }
  if (DRY_RUN) {
    console.log(`Sesión: ${EMAIL} no existe; se registraría la empresa demo:`);
    console.log(`  + onboarding ${JSON.stringify({ ...DEMO_COMPANY, admin: { ...DEMO_COMPANY.admin, password: '***' } })}`);
    return;
  }
  // El asistente de onboarding crea empresa, comercio, admin y la suscripción de la empresa.
  console.log('Registrando la empresa demo (onboarding)…');
  const { sessionId } = unwrapItem(await request('POST', '/onboarding/select-subscription', { tierId: DEMO_COMPANY.tierId }));
  await request('POST', '/onboarding/business-profile', { sessionId, ...DEMO_COMPANY.business });
  await request('POST', '/onboarding/merchant-profile', { sessionId, ...DEMO_COMPANY.merchant });
  await request('POST', '/onboarding/provision-account', { sessionId, ...DEMO_COMPANY.admin });
  if (!(await login())) throw new Error('El registro terminó pero el login sigue fallando');
  console.log(`Sesión: ${EMAIL} (merchant ${merchantId})`);
}

// ---------------------------------------------------------------------------------------------
// Áreas. Cada una recibe y devuelve un contexto con los ids que necesitan las siguientes.

const AREAS = {
  async catalog(ctx) {
    console.log('\nCatálogo: categorías, productos, variantes y modificadores');
    const categories = {};
    for (const name of ['Appetizers', 'Entrees', 'Desserts', 'Beverages']) {
      categories[name] = await ensure(`categoría ${name}`, '/category?limit=100', byName(name), '/category', { name, isActive: true });
    }
    const PRODUCTS = [
      ['Conch Fritters', 'DEMO-APP-01', 12.95, 'Appetizers'],
      ['Tuna Tartare', 'DEMO-APP-02', 16.5, 'Appetizers'],
      ['X7 Smash Burger', 'DEMO-ENT-01', 17.95, 'Entrees'],
      ['Grilled Ribeye', 'DEMO-ENT-02', 38, 'Entrees'],
      ['Mushroom Risotto', 'DEMO-ENT-03', 24.5, 'Entrees'],
      ['Key Lime Pie', 'DEMO-DES-01', 9.5, 'Desserts'],
      ['Chocolate Lava Cake', 'DEMO-DES-02', 10.5, 'Desserts'],
      ['Fresh Limeade', 'DEMO-BEV-01', 5.5, 'Beverages'],
      ['Classic Mojito', 'DEMO-BEV-02', 13, 'Beverages'],
    ];
    ctx.products = {};
    for (const [name, sku, basePrice, category] of PRODUCTS) {
      ctx.products[name] = await ensure(`producto ${name}`, '/products?limit=100', byName(name), '/products', {
        name,
        sku,
        basePrice,
        categoryId: categories[category]?.id,
        isActive: true,
      });
    }
    const burger = ctx.products['X7 Smash Burger'];
    if (burger) {
      for (const [name, price] of [['Single', 17.95], ['Double', 21.95]]) {
        await ensure(`variante Burger ${name}`, '/variants?limit=100', (v) => byName(name)(v) && (v.productId ?? v.product?.id) === burger.id, '/variants', {
          name,
          price,
          sku: `DEMO-ENT-01-${name.toUpperCase()}`,
          productId: burger.id,
          isActive: true,
        });
      }
      for (const [name, priceDelta] of [['Extra Cheese', 1.5], ['No Onions', 0], ['Add Bacon', 2.5]]) {
        await ensure(`modificador ${name}`, '/modifiers?limit=100', (m) => byName(name)(m) && (m.productId ?? m.product?.id) === burger.id, '/modifiers', {
          name,
          priceDelta,
          productId: burger.id,
          isActive: true,
        });
      }
    }
    return ctx;
  },

  async config(ctx) {
    console.log('\nConfiguración: impuestos y plan de cuentas');
    await ensure('impuesto FL Sales Tax 7%', '/merchant-tax-rule?limit=100', byName('FL Sales Tax 7%'), '/merchant-tax-rule', {
      name: 'FL Sales Tax 7%',
      description: 'Florida sales tax (6%) plus Miami-Dade County surtax (1%)',
      taxType: 'percentage',
      rate: SALES_TAX_RATE,
      appliesToTips: false,
      appliesToOvertime: false,
    });
    const ACCOUNTS = [
      ['1100', 'Cash on Hand', 'ASSET'],
      ['1200', 'Operating Bank Account', 'ASSET'],
      ['1300', 'Food & Beverage Inventory', 'ASSET'],
      ['2100', 'Accounts Payable', 'LIABILITY'],
      ['2200', 'Sales Tax Payable', 'LIABILITY'],
      ['2300', 'Tips Payable', 'LIABILITY'],
      ['3100', "Owner's Equity", 'EQUITY'],
      ['4100', 'Food Sales', 'REVENUE'],
      ['4200', 'Beverage Sales', 'REVENUE'],
      ['5100', 'Cost of Goods Sold', 'EXPENSE'],
      ['5200', 'Payroll Expense', 'EXPENSE'],
    ];
    for (const [code, name, type] of ACCOUNTS) {
      await ensure(`cuenta ${code} ${name}`, '/ledger-accounts?limit=100', (a) => String(a.code) === code, '/ledger-accounts', { code, name, type });
    }
    return ctx;
  },

  async inventory(ctx) {
    console.log('\nInventario: proveedores, categorías de insumos y bodegas');
    // Sin tax_id: el backend todavía solo acepta RUT chileno (no EIN) en los proveedores.
    for (const [name, email] of [
      ['Sunshine Foodservice', 'orders@sunshinefoods.demo'],
      ['Brickell Fresh Produce', 'sales@brickellproduce.demo'],
      ['Everglades Meat Co.', 'accounts@evergladesmeat.demo'],
    ]) {
      await ensure(`proveedor ${name}`, '/v1/inventory/suppliers?limit=100', byName(name), '/v1/inventory/suppliers', {
        name,
        email,
        isActive: true,
      });
    }
    for (const [name, description] of [
      ['Dairy', 'Milk, cheese, butter and cream'],
      ['Meat & Poultry', 'Beef, pork and chicken'],
      ['Produce', 'Fresh fruit, vegetables and herbs'],
      ['Dry Goods', 'Rice, flour, oils and canned goods'],
    ]) {
      await ensure(`categoría de insumos ${name}`, '/v1/raw-material-categories?limit=100', byName(name), '/v1/raw-material-categories', {
        name,
        description,
        is_active: true,
      });
    }
    const locations = {};
    for (const [name, code, isMainStorage] of [
      ['Main Storage', 'MAIN-01', true],
      ['Walk-in Cooler', 'COLD-01', false],
    ]) {
      locations[name] = await ensure(`bodega ${name}`, '/v1/raw-material-stock/locations?limit=100', byName(name), '/v1/raw-material-stock/locations', {
        name,
        code,
        isMainStorage,
        isActive: true,
      });
    }
    // Bodega de venta: de ella se descuenta el stock (según las recetas) al pagar un pedido.
    // Sin ella el backend se salta el descuento sin avisar.
    const cooler = locations['Walk-in Cooler'];
    const merchant = unwrapItem(await request('GET', `/merchants/${merchantId}`).catch(() => null));
    if (cooler && cooler.id > 0 && merchant && merchant.defaultSalesStockLocationId !== cooler.id) {
      try {
        await request('PUT', `/merchants/${merchantId}`, { defaultSalesStockLocationId: cooler.id });
        stats.created += 1;
        console.log(`  + bodega de venta: Walk-in Cooler (id ${cooler.id})`);
      } catch (err) {
        stats.failed += 1;
        console.log(`  ! bodega de venta: ${err.message}`);
      }
    } else if (cooler && merchant) {
      stats.existing += 1;
    }
    return ctx;
  },

  async kitchen(ctx) {
    console.log('\nCocina: estaciones (una por modo de pantalla)');
    const STATIONS = [
      ['Hot Line', 'HOT', 'GRID', 1],
      ['Cold Prep', 'COLD', 'SUMMARY', 2],
      ['Main Bar', 'BAR', 'AUTO', 3],
      ['Desserts', 'DESSERT', 'MANUAL', 4],
    ];
    ctx.stations = {};
    for (const [name, stationType, displayMode, displayOrder] of STATIONS) {
      ctx.stations[name] = await ensure(`estación ${name} (${displayMode})`, '/kitchen-station?limit=100', byName(name), '/kitchen-station', {
        name,
        stationType,
        displayMode,
        displayOrder,
        maxActiveTicketsCapacity: 15,
        autoRerouteOnOffline: true,
        autoRerouteOnCapacity: true,
      });
    }
    return ctx;
  },

  async dining(ctx) {
    console.log('\nSalón: plano, zonas y mesas');
    const plan = await ensure('plano Main Dining Room', '/floor-plan?limit=100', byName('Main Dining Room'), '/floor-plan', {
      merchant: merchantId,
      name: 'Main Dining Room',
      width: 1000,
      height: 700,
      status: 'active',
    });
    if (!plan) return ctx;
    const zones = {};
    for (const [name, color] of [['Indoor', '#ae001a'], ['Patio', '#2e7d32'], ['Bar', '#1565c0']]) {
      zones[name] = await ensure(`zona ${name}`, '/floor-zone?limit=100', byName(name), '/floor-zone', {
        merchant: merchantId,
        name,
        color,
        floorPlan: plan.id,
        status: 'active',
      });
    }
    const TABLES = [
      ['T1', 4, 'Square', 'Indoor', 80, 80],
      ['T2', 4, 'Square', 'Indoor', 220, 80],
      ['T3', 2, 'Circle', 'Indoor', 360, 80],
      ['T4', 6, 'Rectangle', 'Indoor', 80, 240],
      ['T5', 8, 'Booth', 'Indoor', 260, 240],
      ['T6', 4, 'Circle', 'Patio', 620, 80],
      ['T7', 4, 'Circle', 'Patio', 760, 80],
      ['T8', 2, 'Square', 'Patio', 620, 240],
      ['B1', 6, 'Counter', 'Bar', 80, 520],
    ];
    for (const [number, capacity, shape, zone, pos_x, pos_y] of TABLES) {
      if (!zones[zone]) continue;
      await ensure(`mesa ${number}`, '/tables?limit=100', (t) => String(t.number) === number, '/tables', {
        merchant_id: merchantId,
        number,
        capacity,
        status: 'available',
        location: zone,
        rotation: 0,
        shape,
        pos_x,
        pos_y,
        floorZone: zones[zone].id,
        floorPlan: plan.id,
      });
    }
    return ctx;
  },

  async orders(ctx) {
    console.log('\nComandas de cocina (para el monitor KDS)');
    const station = (name) => ctx.stations?.[name]?.id;
    const ORDERS = [
      ['Table 1', 'Hot Line', 0, [['X7 Smash Burger', 2, 'main_course', 'No onions'], ['Fresh Limeade', 2, 'beverage']]],
      ['Table 4', 'Hot Line', 2, [['Grilled Ribeye', 1, 'main_course', 'Medium rare'], ['Conch Fritters', 3, 'appetizer']]],
      ['Table 6', 'Cold Prep', 0, [['Tuna Tartare', 2, 'appetizer', 'Allergy: sesame (one plate)']]],
      ['Table 7', 'Cold Prep', 1, [['Tuna Tartare', 1, 'appetizer']]],
      ['Bar B1', 'Main Bar', 0, [['Classic Mojito', 4, 'beverage']]],
      ['Table 2', 'Desserts', 0, [['Chocolate Lava Cake', 2, 'dessert'], ['Key Lime Pie', 1, 'dessert']]],
    ];
    if (!ctx.stations) {
      console.log('  (sin estaciones: ejecuta también el área "kitchen")');
      return ctx;
    }
    for (const [table, stationName, priority, items] of ORDERS) {
      await ensure(`comanda ${table} → ${stationName}`, '/kitchen-orders?limit=100', (o) => o.notes === table && o.businessStatus !== 'completed' && o.businessStatus !== 'cancelled', '/kitchen-orders', {
        stationId: station(stationName),
        priority,
        businessStatus: 'pending',
        notes: table,
        skipAutoKitchenItems: true,
        kitchenOrderItems: items.map(([productName, quantity, course, notes]) => ({
          productId: ctx.products?.[productName]?.id ?? null,
          productName,
          quantity,
          course,
          notes: notes ?? null,
        })),
      });
    }
    return ctx;
  },

  // ---- Fase 2 ----

  async staff(ctx) {
    console.log('\nPersonal: usuarios y colaboradores');
    const STAFF = [
      ['Emily Johnson', 'emily', 'waiter', 'Front of House'],
      ['Carlos Rivera', 'carlos', 'waiter', 'Front of House'],
      ['Maria Gonzalez', 'maria', 'cook', 'Kitchen'],
      ['James Smith', 'james', 'cook', 'Kitchen'],
      ['Alex Martinez', 'alex', 'bartender', 'Bar'],
      ['Sophie Brown', 'sophie', 'host', 'Front of House'],
      ['Daniel Lee', 'daniel', 'cashier', 'Front of House'],
      ['Jessica Taylor', 'jessica', 'manager', 'Management'],
    ];
    ctx.collaborators = {};
    // El admin también necesita ficha de colaborador: el backend la exige para abrir cajas.
    await ensure('colaborador Admin Demo (manager)', '/collaborators?limit=100', byName('Admin Demo'), '/collaborators', {
      user_id: adminUserId,
      merchant_id: merchantId,
      name: 'Admin Demo',
      employeeId: 'DEMO-ADMIN',
      department: 'Management',
      role: 'manager',
      status: 'active',
    });
    for (const [name, handle, role, department] of STAFF) {
      const email = `${handle}@${DOMAIN}`;
      const user = await ensure(`usuario ${email}`, `/users/merchant/${merchantId}`, (u) => u.email === email, '/users', {
        username: `x7mia_${handle}`,
        email,
        password: PASSWORD,
        role: 'merchant_user',
        scope: 'merchant_web',
        merchantId,
      });
      if (!user) continue;
      ctx.collaborators[role] ??= [];
      const collaborator = await ensure(`colaborador ${name} (${role})`, '/collaborators?limit=100', byName(name), '/collaborators', {
        user_id: user.id,
        merchant_id: merchantId,
        name,
        employeeId: `DEMO-${handle.toUpperCase()}`,
        department,
        role,
        status: 'active',
      });
      if (collaborator) ctx.collaborators[role].push(collaborator);
    }
    return ctx;
  },

  async shifts(ctx) {
    console.log('\nTurnos: almuerzo y cena de los próximos 7 días, con asignaciones');
    const collaborators = await existing('/collaborators?limit=100');
    const byRole = (role) => collaborators.filter((c) => c.role === role);
    const shifts = await existing('/shifts?limit=100');
    const assignments = await existing('/shift-assignments?limit=100');
    const sameTime = (a, b) => a && b && new Date(a).getTime() === new Date(b).getTime();
    ctx.shifts = [];
    for (let day = 0; day < 7; day += 1) {
      for (const [label, start, end] of [['almuerzo', 11, 17], ['cena', 18, 24]]) {
        const startTime = at(day, start);
        const endTime = at(day, end);
        const found = shifts.find((s) => sameTime(s.startTime ?? s.start_time, startTime) && (s.merchantId ?? s.merchant?.id ?? merchantId) === merchantId);
        const shift = found
          ? (stats.existing++, found)
          : await ensure(`turno ${label} día +${day}`, '/shifts?limit=1', () => false, '/shifts', {
              merchantId,
              startTime,
              endTime,
              status: 'active',
            });
        if (!shift) continue;
        ctx.shifts.push(shift);
        // Un mesero, un cocinero y el bartender en cada turno; en la cena, el segundo de cada uno.
        const pick = (role) => byRole(role)[label === 'cena' ? 1 : 0] ?? byRole(role)[0];
        for (const role of ['waiter', 'cook', 'bartender']) {
          const collaborator = pick(role);
          if (!collaborator) continue;
          const already = assignments.find(
            (a) => idOf(a.shiftId ?? a.shift) === shift.id && idOf(a.collaboratorId ?? a.collaborator) === collaborator.id,
          );
          if (already) {
            stats.existing += 1;
            continue;
          }
          await ensure(`  asignación ${collaborator.name}`, '/shift-assignments?limit=1', () => false, '/shift-assignments', {
            shiftId: shift.id,
            collaboratorId: collaborator.id,
            roleDuringShift: role,
            startTime,
            endTime,
            status: 'active',
          });
        }
      }
    }
    return ctx;
  },

  // Va después de "shifts": abrir el cajón exige un turno de trabajo activo.
  async cash(ctx) {
    console.log('\nCaja: cajón y turno de caja abierto (los pedidos lo exigen)');
    const active = unwrapItem(await request('GET', '/cash-shifts/active').catch(() => null));
    if (active?.id) {
      stats.existing += 1;
      console.log(`  = turno de caja abierto (ya existe, id ${active.id})`);
      return ctx;
    }
    // GET /cash-drawers responde 403 a todos (el backend lee req.merchant en vez de req.user):
    // se reutiliza el cajón de un turno anterior y solo si no hay ninguno se crea uno.
    const previous = (await existing('/cash-shifts?limit=100'))[0];
    let drawerId = idOf(previous?.cashDrawerId ?? previous?.cashDrawer);
    if (!drawerId) {
      const drawer = await ensure('cajón principal', '/cash-shifts?limit=1', () => false, '/cash-drawers', { openingBalance: 300 });
      drawerId = drawer?.id;
    }
    if (!drawerId) return ctx;
    await ensure('turno de caja abierto', '/cash-shifts?limit=1', () => false, '/cash-shifts', {
      cashDrawerId: drawerId,
      openingBalance: 300,
    });
    return ctx;
  },

  async customers(ctx) {
    console.log('\nClientes');
    const CUSTOMERS = [
      ['Ashley Miller', 'ashley.miller@customer.demo', '+1 305-555-0101', '801 Brickell Key Blvd, Apt 1204'],
      ['Brian Davis', 'brian.davis@customer.demo', '+1 305-555-0102', '1435 Brickell Ave, Apt 2507'],
      ['Gabriela Torres', 'gabriela.torres@customer.demo', '+1 305-555-0103', '2121 SW 3rd Ave'],
      ['Michael Wilson', 'michael.wilson@customer.demo', '+1 305-555-0104', '50 Biscayne Blvd, Apt 3310'],
      ['Natalie Perez', 'natalie.perez@customer.demo', '+1 305-555-0105', '1000 S Miami Ave, Apt 907'],
    ];
    for (const [i, [name, email, phone, address]] of CUSTOMERS.entries()) {
      await ensure(`cliente ${name}`, '/customers?limit=100', (c) => c.email === email, '/customers', {
        name,
        email,
        phone,
        // El DTO exige `rut` (identificador fiscal chileno); en EE. UU. se usa un código de cliente.
        rut: `CUST-${String(i + 1).padStart(4, '0')}`,
        address,
        city: 'Miami',
        state: 'FL',
        country: 'United States',
      });
    }
    return ctx;
  },

  async reservations(ctx) {
    console.log('\nReservas (próximos días)');
    const customers = await existing('/customers?limit=100');
    const tables = await existing('/tables?limit=100');
    const reservations = await existing('/reservation?limit=100');
    const table = (number) => tables.find((t) => String(t.number) === number)?.id;
    const customer = (email) => customers.find((c) => c.email === email)?.id;
    const RESERVATIONS = [
      ['ashley.miller@customer.demo', 1, 13, 4, ['T1'], 'confirmed', 'Birthday lunch, bringing a cake'],
      ['brian.davis@customer.demo', 1, 20, 2, ['T3'], 'confirmed', 'Quiet table, please'],
      ['gabriela.torres@customer.demo', 2, 21, 6, ['T4'], 'pending', null],
      ['michael.wilson@customer.demo', 3, 14, 8, ['T5'], 'confirmed', 'Business lunch'],
      ['natalie.perez@customer.demo', 4, 20, 4, ['T6'], 'pending', 'Prefers the patio'],
    ];
    for (const [email, day, hour, party_size, tableNumbers, status, special_requests] of RESERVATIONS) {
      const customer_id = customer(email);
      const reservation_date = at(day, hour);
      const found = reservations.find(
        (r) => idOf(r.customer_id ?? r.customer) === customer_id && new Date(r.reservation_date).getTime() === new Date(reservation_date).getTime(),
      );
      if (found) {
        stats.existing += 1;
        console.log(`  = reserva ${email} (ya existe, id ${found.id})`);
        continue;
      }
      await ensure(`reserva ${email} día +${day} ${hour}:00`, '/reservation?limit=1', () => false, '/reservation', {
        customer_id,
        reservation_date,
        duration_minutes: 90,
        party_size,
        status,
        source: 'phone',
        special_requests: special_requests ?? undefined,
        table_ids: tableNumbers.map(table).filter(Boolean),
      });
    }
    return ctx;
  },

  async delivery(ctx) {
    console.log('\nDelivery: zona, tarifa y repartidores');
    // Polígono aproximado de Brickell y el centro de Miami, en [lng, lat].
    const zone = await ensure('zona Brickell & Downtown', '/delivery-zone?limit=100', byName('Brickell & Downtown'), '/delivery-zone', {
      merchant: merchantId,
      name: 'Brickell & Downtown',
      description: 'Brickell, Brickell Key and Downtown Miami',
      geojson: {
        type: 'Polygon',
        coordinates: [[[-80.205, 25.785], [-80.183, 25.785], [-80.183, 25.75], [-80.205, 25.75], [-80.205, 25.785]]],
      },
      status: 'active',
    });
    if (zone) {
      await ensure('tarifa Brickell & Downtown', '/delivery-fee?limit=100', (f) => idOf(f.deliveryZone ?? f.delivery_zone_id ?? f.deliveryZoneId) === zone.id, '/delivery-fee', {
        deliveryZone: zone.id,
        base_fee: 4.99,
        per_km_fee: 0.75,
        min_order_amount: 20,
        free_above: 75,
        status: 'active',
      });
    }
    for (const [name, phone, vehicleType] of [
      ['Kevin Brooks', '+1 305-555-0121', 'motorcycle'],
      ['Laura Chen', '+1 305-555-0122', 'bicycle'],
      ['Marcus Hill', '+1 305-555-0123', 'car'],
    ]) {
      await ensure(`repartidor ${name}`, '/delivery-driver?limit=100', byName(name), '/delivery-driver', {
        name,
        phone,
        vehicleType,
        status: 'active',
      });
    }
    return ctx;
  },

  async online(ctx) {
    console.log('\nVenta online: tienda y menú');
    const store = await ensure('tienda x7demo-miami', '/online-stores?limit=100', (s) => s.subdomain === 'x7demo-miami', '/online-stores', {
      subdomain: 'x7demo-miami',
      theme: 'default',
      currency: 'USD',
      timezone: 'America/New_York',
      is_active: true,
    });
    if (store) {
      await ensure('menú online Main Menu', '/online-menus?limit=100', byName('Main Menu'), '/online-menus', {
        storeId: store.id,
        name: 'Main Menu',
        isActive: true,
      });
    }
    return ctx;
  },

  async qr(ctx) {
    console.log('\nQR: menú y ubicaciones por mesa');
    const menu = await ensure('menú QR Dine-in Menu', '/qr-menus?limit=100', byName('Dine-in Menu'), '/qr-menus', {
      merchant: merchantId,
      name: 'Dine-in Menu',
      description: 'Scan to order from your table',
      status: 'active',
      design_theme: 'classic',
      qr_type: 'Table',
    });
    if (!menu) return ctx;
    const tables = await existing('/tables?limit=100');
    for (const number of ['T1', 'T2', 'T3', 'T6']) {
      const table = tables.find((t) => String(t.number) === number);
      if (!table) continue;
      const url = `https://x7demo-miami.x7pos.com/qr/${number.toLowerCase()}`;
      await ensure(`QR mesa ${number}`, '/qr-locations?limit=100', byName(`Table ${number}`), '/qr-locations', {
        merchant: merchantId,
        qrMenu: menu.id,
        table: table.id,
        name: `Table ${number}`,
        qr_code_url: url,
        qr_code_image: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}`,
        location_type: 'Table',
        status: 'active',
      });
    }
    return ctx;
  },

  async sales(ctx) {
    console.log('\nVentas: suscripción del comercio y pedidos de mesa');
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    const subscription = await ensure('suscripción del comercio', '/merchant-subscription?limit=100', (s) => idOf(s.merchantId ?? s.merchant) === merchantId && s.status === 'active', '/merchant-subscription', {
      merchantId,
      planId: 2, // Professional, el mismo plan de la empresa
      startDate: today.toISOString(),
      endDate: nextYear.toISOString(),
      renewalDate: nextYear.toISOString(),
      status: 'active',
      paymentMethod: 'seed',
    });
    if (!subscription) return ctx;
    const [tables, customers, collaborators, products, orders] = await Promise.all([
      existing('/tables?limit=100'),
      existing('/customers?limit=100'),
      existing('/collaborators?limit=100'),
      existing('/products?limit=100'),
      existing('/orders?limit=100'),
    ]);
    // El backend exige que el pedido lo registre quien abrió el turno de caja activo.
    const activeShift = unwrapItem(await request('GET', '/cash-shifts/active').catch(() => null));
    const openerId = idOf(activeShift?.openedByCollaborator ?? activeShift?.openedBy);
    const waiter = collaborators.find((c) => c.id === openerId);
    if (!waiter) {
      console.log('  ! sin turno de caja abierto: ejecuta también el área "cash"');
      return ctx;
    }
    const product = (name) => products.find(byName(name));
    const ORDERS = [
      ['T2', 'ashley.miller@customer.demo', 4, [['X7 Smash Burger', 2], ['Classic Mojito', 2]]],
      ['T3', 'brian.davis@customer.demo', 2, [['Grilled Ribeye', 1], ['Tuna Tartare', 1], ['Fresh Limeade', 2]]],
      ['T8', 'gabriela.torres@customer.demo', 2, [['Mushroom Risotto', 2], ['Chocolate Lava Cake', 1]]],
    ];
    for (const [tableNumber, email, guestCount, items] of ORDERS) {
      const table = tables.find((t) => String(t.number) === tableNumber);
      const customer = customers.find((c) => c.email === email);
      if (!table || !customer || !waiter) {
        console.log(`  ! pedido ${tableNumber}: faltan mesa o cliente (ejecuta dining y customers)`);
        continue;
      }
      const found = orders.find((o) => idOf(o.tableId ?? o.table) === table.id && idOf(o.customerId ?? o.customer) === customer.id);
      if (found) {
        stats.existing += 1;
        console.log(`  = pedido mesa ${tableNumber} (ya existe, id ${found.id})`);
        continue;
      }
      const order = await ensure(`pedido mesa ${tableNumber}`, '/orders?limit=1', () => false, '/orders', {
        merchantId,
        tableId: table.id,
        collaboratorId: waiter.id,
        subscriptionId: subscription.id,
        customerId: customer.id,
        businessStatus: 'pending',
        source: 'pos',
        type: 'dine_in',
        guestCount,
      });
      if (!order) continue;
      for (const [name, quantity] of items) {
        const p = product(name);
        if (!p) continue;
        await ensure(`  ${quantity}x ${name}`, '/order-item?limit=1', () => false, '/order-item', {
          orderId: order.id,
          productId: p.id,
          quantity,
          price: Number(p.basePrice),
        });
      }
    }
    return ctx;
  },

  async tips(ctx) {
    console.log('\nPropinas: pozo del turno de hoy');
    const shifts = await existing('/shifts?limit=100');
    const today = at(0, 11);
    const shift = shifts.find((s) => new Date(s.startTime ?? s.start_time).getTime() === new Date(today).getTime());
    if (!shift) {
      console.log('  (sin turno de hoy: ejecuta también el área "shifts")');
      return ctx;
    }
    await ensure("pozo de propinas Today's lunch", '/tip-pools?limit=100', (p) => idOf(p.shiftId ?? p.shift) === shift.id, '/tip-pools', {
      companyId: await companyId(),
      merchantId,
      shiftId: shift.id,
      name: "Today's lunch",
      distributionType: 'equal',
      totalAmount: 0,
      status: 'open',
    });
    return ctx;
  },

  // ---- Fase 3 ----

  async supplies(ctx) {
    console.log('\nInsumos: materias primas, proveedores y stock en bodega');
    const [categories, suppliers, locations] = await Promise.all([
      existing('/v1/raw-material-categories?limit=100'),
      existing('/v1/inventory/suppliers?limit=100'),
      existing('/v1/raw-material-stock/locations?limit=100'),
    ]);
    const category = (name) => categories.find(byName(name))?.id;
    const supplier = (name) => suppliers.find(byName(name))?.id;
    const location = (name) => locations.find(byName(name))?.id;
    const SUPPLIES = [
      // Costo por unidad de consumo (gramo, mililitro o unidad), en USD.
      ['Ground Beef', 'INS-001', 'Meat & Poultry', 'gram', 'lb', 453.6, 0.0132, 'Everglades Meat Co.', 'Walk-in Cooler', 12000, 3000],
      ['Ribeye Steak', 'INS-002', 'Meat & Poultry', 'gram', 'lb', 453.6, 0.0331, 'Everglades Meat Co.', 'Walk-in Cooler', 8000, 2000],
      ['Cheddar Cheese', 'INS-003', 'Dairy', 'gram', 'lb', 453.6, 0.0119, 'Sunshine Foodservice', 'Walk-in Cooler', 4000, 1000],
      ['Whole Milk', 'INS-004', 'Dairy', 'milliliter', 'gal', 3785, 0.0011, 'Sunshine Foodservice', 'Walk-in Cooler', 20000, 5000],
      ['Key Limes', 'INS-005', 'Produce', 'unit', 'case', 100, 0.12, 'Brickell Fresh Produce', 'Walk-in Cooler', 300, 60],
      // El arroz queda en la bodega principal; el área "movements" traspasa una parte a la de venta.
      ['Arborio Rice', 'INS-006', 'Dry Goods', 'gram', 'lb', 453.6, 0.0066, 'Sunshine Foodservice', 'Main Storage', 10000, 2000],
    ];
    for (const [name, code, cat, unit, purchase_unit, conversion_factor, cost_per_unit, supplierName, locationName, qty, minimumQty] of SUPPLIES) {
      const supply = await ensure(`insumo ${name}`, '/v1/inventory/raw-materials?limit=100', byName(name), '/v1/inventory/raw-materials', {
        code,
        sku: `DEMO-${code}`,
        name,
        category_id: category(cat),
        unit,
        purchase_unit,
        consumption_unit: unit,
        conversion_factor,
        minimumQty,
        cost_per_unit,
        isActive: true,
      });
      if (!supply || supply.id < 0) continue;
      if (supplier(supplierName) && !DRY_RUN) {
        await request('POST', `/v1/inventory/raw-materials/${supply.id}/suppliers`, { supplierIds: [supplier(supplierName)] }).catch((err) =>
          console.log(`  ! proveedor de ${name}: ${err.message}`),
        );
      }
      // Al crear el insumo el backend ya abre un ítem de stock (en 0) por bodega: se ajusta
      // el de la bodega elegida, solo si sigue en 0 para no sumar stock en cada ejecución.
      const locationId = location(locationName);
      const item = (await existing('/v1/raw-material-stock/items?limit=100')).find(
        (i) => idOf(i.supply) === supply.id && idOf(i.location) === locationId,
      );
      if (!item) {
        console.log(`  ! sin ítem de stock de ${name} en ${locationName}`);
        continue;
      }
      if (Number(item.currentQty) > 0) {
        stats.existing += 1;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  + stock ${name}  POST /items/${item.id}/adjust {"value":${qty}}`);
        continue;
      }
      try {
        await request('POST', `/items/${item.id}/adjust`, { type: 'absolute', value: qty, reason: 'Opening inventory (demo)' });
        stats.created += 1;
        console.log(`  + stock ${name} en ${locationName}: ${qty}`);
      } catch (err) {
        stats.failed += 1;
        console.log(`  ! stock ${name}: ${err.message}`);
      }
    }
    return ctx;
  },

  async purchasing(ctx) {
    console.log('\nCompras: órdenes de compra');
    const [suppliers, products, locations, orders] = await Promise.all([
      existing('/v1/inventory/suppliers?limit=100'),
      existing('/products?limit=100'),
      existing('/v1/raw-material-stock/locations?limit=100'),
      existing('/v1/purchase-orders?limit=100'),
    ]);
    const mainStorage = locations.find((l) => l.isMainStorage)?.id ?? locations[0]?.id;
    const PURCHASES = [
      ['Sunshine Foodservice', 'DRAFT', [['Fresh Limeade', 24, 1.2], ['Classic Mojito', 12, 3.1]]],
      ['Everglades Meat Co.', 'SENT', [['X7 Smash Burger', 40, 5.4], ['Grilled Ribeye', 20, 14.5]]],
    ];
    for (const [supplierName, status, items] of PURCHASES) {
      const supplierId = suppliers.find(byName(supplierName))?.id;
      if (!supplierId) continue;
      const found = orders.find((o) => idOf(o.supplierId ?? o.supplier) === supplierId);
      if (found) {
        stats.existing += 1;
        console.log(`  = orden de compra ${supplierName} (ya existe, id ${found.id})`);
        continue;
      }
      const totalAmount = usd(items.reduce((sum, [, qty, price]) => sum + qty * price, 0));
      const po = await ensure(`orden de compra ${supplierName} (${status})`, '/v1/purchase-orders?limit=1', () => false, '/v1/purchase-orders', {
        supplierId,
        status,
        totalAmount,
      });
      if (!po || po.id < 0) continue;
      for (const [productName, quantity, unitPrice] of items) {
        const productId = products.find(byName(productName))?.id;
        if (!productId) continue;
        await ensure(`  ${quantity}x ${productName}`, '/purchase-order-item?limit=1', () => false, '/purchase-order-item', {
          purchaseOrderId: po.id,
          productId,
          quantity,
          unitPrice,
          locationId: mainStorage,
        });
      }
    }
    return ctx;
  },

  async payables(ctx) {
    console.log('\nCuentas por pagar: facturas, pagos, asignaciones y nota de crédito');
    const company_id = await companyId();
    const [suppliers, products] = await Promise.all([existing('/v1/inventory/suppliers?limit=100'), existing('/products?limit=100')]);
    const supplier = (name) => suppliers.find(byName(name))?.id;
    const product = (name) => products.find(byName(name));
    // [número, proveedor, emisión (días), vencimiento (días), ítems, estado]
    const INVOICES = [
      ['SI-1001', 'Everglades Meat Co.', -20, 10, [['X7 Smash Burger', 40, 5.4], ['Grilled Ribeye', 20, 14.5]], 'paid'],
      ['SI-1002', 'Sunshine Foodservice', -12, 18, [['Classic Mojito', 12, 3.1], ['Fresh Limeade', 24, 1.2]], 'partially_paid'],
      ['SI-1003', 'Brickell Fresh Produce', -5, 25, [['Tuna Tartare', 15, 6.25]], 'pending'],
    ];
    // En Florida la compra de alimentos para reventa está exenta de sales tax.
    const PURCHASE_TAX_RATE = 0;
    const paymentNumber = (invoiceNumber) => invoiceNumber.replace(/^[A-Z]+-/, 'PAY-');
    const invoices = await existing('/supplier-invoices?limit=100');
    for (const [invoice_number, supplierName, issued, due, items, status] of INVOICES) {
      const subtotal = usd(items.reduce((sum, [, qty, price]) => sum + qty * price, 0));
      const tax_total = usd(subtotal * PURCHASE_TAX_RATE);
      const total_amount = usd(subtotal + tax_total);
      const paid_amount = status === 'paid' ? total_amount : status === 'partially_paid' ? usd(total_amount / 2) : 0;
      const found = invoices.find((i) => i.invoice_number === invoice_number);
      if (found) {
        stats.existing += 1;
        console.log(`  = factura ${invoice_number} (ya existe, id ${found.id})`);
      }
      const invoice =
        found ??
        (await ensure(`factura ${invoice_number} ${supplierName} (${status})`, '/supplier-invoices?limit=1', () => false, '/supplier-invoices', {
          company_id,
          supplier_id: supplier(supplierName),
          invoice_number,
          invoice_date: day(issued),
          due_date: day(due),
          subtotal,
          tax_total,
          total_amount,
          paid_amount,
          balance_due: total_amount - paid_amount,
          status,
        }));
      if (!invoice || invoice.id < 0) continue;
      const invoiceItems = await existing(`/supplier-invoice-items?invoice_id=${invoice.id}&limit=100`);
      for (const [productName, quantity, unit_price] of items) {
        const p = product(productName);
        if (!p) continue;
        if (invoiceItems.some((i) => idOf(i.invoice_id ?? i.invoice) === invoice.id && i.description === productName)) {
          stats.existing += 1;
          continue;
        }
        const line_subtotal = usd(quantity * unit_price);
        const tax_amount = usd(line_subtotal * PURCHASE_TAX_RATE);
        await ensure(`  ${quantity}x ${productName}`, '/supplier-invoice-items?limit=1', () => false, '/supplier-invoice-items', {
          // Sin product_id: enlazar con inventario exige también variant_id y los productos
          // demo no tienen variantes (salvo la burger). La línea queda solo descrita.
          invoice_id: invoice.id,
          description: productName,
          quantity,
          unit_price,
          line_subtotal,
          tax_amount,
          line_total: usd(line_subtotal + tax_amount),
        });
      }
      if (paid_amount > 0) {
        const payment_number = paymentNumber(invoice_number);
        const payment = await ensure(`  pago ${payment_number}`, '/supplier-payments?limit=100', (p) => p.payment_number === payment_number, '/supplier-payments', {
          company_id,
          supplier_id: supplier(supplierName),
          payment_number,
          payment_date: day(issued + 3),
          payment_method: 'transfer',
          reference: `ACH transfer ${payment_number}`,
          total_amount: paid_amount,
          status: 'posted',
        });
        if (!payment || payment.id < 0) continue;
        const forPayment = (r) => idOf(r.payment_id ?? r.payment) === payment.id && r.document_number === invoice_number;
        // Un pago ya contabilizado (posted) no admite ítems nuevos.
        if (payment.status === 'draft') {
          await ensure(`  ítem de pago ${invoice_number}`, '/supplier-payment-items?limit=100', forPayment, '/supplier-payment-items', {
            payment_id: payment.id,
            document_type: 'invoice',
            document_number: invoice_number,
            amount: paid_amount,
          });
        }
        await ensure(`  asignación ${payment_number} → ${invoice_number}`, '/supplier-payment-allocations?limit=100', forPayment, '/supplier-payment-allocations', {
          payment_id: payment.id,
          supplier_id: supplier(supplierName),
          document_type: 'invoice',
          document_number: invoice_number,
          allocated_amount: paid_amount,
        });
      }
    }
    // Los pagos anteriores ya están contabilizados y no admiten ítems: el de la factura pendiente
    // queda en borrador (pago programado) con su ítem.
    const pending = INVOICES.find(([, , , , , status]) => status === 'pending');
    if (pending) {
      const [invoice_number, supplierName, issued, , items] = pending;
      const subtotal = usd(items.reduce((sum, [, qty, price]) => sum + qty * price, 0));
      const amount = usd(subtotal + subtotal * PURCHASE_TAX_RATE);
      const payment_number = paymentNumber(invoice_number);
      const payment = await ensure(`  pago programado ${payment_number} (borrador)`, '/supplier-payments?limit=100', (p) => p.payment_number === payment_number, '/supplier-payments', {
        company_id,
        supplier_id: supplier(supplierName),
        payment_number,
        payment_date: day(issued + 25),
        payment_method: 'transfer',
        reference: `Scheduled ACH transfer ${payment_number}`,
        total_amount: amount,
        status: 'draft',
      });
      if (payment && payment.id > 0 && payment.status === 'draft') {
        await ensure(`  ítem de pago ${invoice_number}`, '/supplier-payment-items?limit=100', (r) => idOf(r.payment_id ?? r.payment) === payment.id, '/supplier-payment-items', {
          payment_id: payment.id,
          document_type: 'invoice',
          document_number: invoice_number,
          amount,
        });
      }
    }
    await ensure('nota de crédito CN-201 Sunshine Foodservice','/supplier-credit-notes?limit=100', (n) => n.credit_note_number === 'CN-201', '/supplier-credit-notes', {
      company_id,
      supplier_id: supplier('Sunshine Foodservice'),
      credit_note_number: 'CN-201',
      issue_date: day(-8),
      total_amount: 45,
      applied_amount: 0,
      status: 'issued',
    });
    return ctx;
  },

  async accounting(ctx) {
    console.log('\nContabilidad: asientos');
    const accounts = await existing('/ledger-accounts?limit=100');
    const account = (code) => accounts.find((a) => String(a.code) === code)?.id;
    const ENTRIES = [
      // Venta del día con su sales tax, compra a proveedor (exenta) y nómina en borrador.
      ['JE-0001', -7, 'POSTED', [['1100', 1070, 0], ['4100', 0, 1000], ['2200', 0, 70]]],
      ['JE-0002', -5, 'POSTED', [['5100', 850, 0], ['2100', 0, 850]]],
      ['JE-0003', -1, 'DRAFT', [['5200', 6200, 0], ['1200', 0, 6200]]],
    ];
    for (const [entry_number, offset, status, lines] of ENTRIES) {
      await ensure(`asiento ${entry_number} (${status})`, '/journal-entry?limit=100', (e) => e.entry_number === entry_number, '/journal-entry', {
        entry_number,
        entry_date: day(offset),
        status,
        lines: lines.map(([code, debit, credit]) => ({ account_id: account(code), debit, credit })),
      });
    }
    return ctx;
  },

  async timeentries(ctx) {
    console.log('\nAsistencia: marcas de los últimos 3 días');
    const company_id = await companyId();
    const [collaborators, entries] = await Promise.all([existing('/collaborators?limit=100'), existing('/collaborator-time-entries?limit=100')]);
    const staff = collaborators.filter((c) => c.name !== 'Admin Demo');
    for (let offset = -3; offset <= -1; offset += 1) {
      for (const [i, c] of staff.entries()) {
        // Turno de almuerzo para la mitad, de cena para el resto; uno con horas extra.
        const lunch = i % 2 === 0;
        const clock_in = at(offset, lunch ? 11 : 18);
        const extra = i === 0 ? 2 : 0;
        const clock_out = at(offset, (lunch ? 17 : 24) + extra);
        const found = entries.find((e) => idOf(e.collaborator_id ?? e.collaborator) === c.id && new Date(e.clock_in).getTime() === new Date(clock_in).getTime());
        if (found) {
          stats.existing += 1;
          continue;
        }
        await ensure(`marca ${c.name} día ${offset}`, '/collaborator-time-entries?limit=1', () => false, '/collaborator-time-entries', {
          company_id,
          merchant_id: merchantId,
          collaborator_id: c.id,
          clock_in,
          clock_out,
          regular_hours: 6,
          overtime_hours: extra,
          break_minutes: 30,
          approved: offset < -1,
        });
      }
    }
    return ctx;
  },

  async payroll(ctx) {
    console.log('\nRemuneraciones: nómina de las dos semanas anteriores');
    const company_id = await companyId();
    // Sin el arreglo de fechas del backend, las columnas `date` se guardan un día antes (desfase
    // por zona horaria), así que el período existente se busca con un día de margen.
    const period_start = day(-14);
    const period_end = day(-1);
    const run = await ensure(`período ${period_start} a ${period_end}`, '/payroll-runs?limit=100', (r) => Math.abs(Date.parse(r.period_start) - Date.parse(period_start)) <= 86_400_000, '/payroll-runs', {
      company_id,
      merchant_id: merchantId,
      period_start,
      period_end,
      status: 'draft',
    });
    if (!run || run.id < 0) return ctx;
    const [collaborators, entries] = await Promise.all([existing('/collaborators?limit=100'), existing('/payroll-entries?limit=100')]);
    // Pago base del período: tarifa por hora × horas (salario mínimo con tip credit de Florida
    // para meseros y bartender); el manager, su sueldo anual / 26.
    const BASE = { waiter: 11.98 * 60, cook: 19.5 * 80, bartender: 12.98 * 60, host: 15.5 * 60, cashier: 16 * 80, manager: 68000 / 26 };
    for (const c of collaborators.filter((x) => x.name !== 'Admin Demo')) {
      if (entries.some((e) => idOf(e.payroll_run_id ?? e.payrollRun) === run.id && idOf(e.collaborator_id ?? e.collaborator) === c.id)) {
        stats.existing += 1;
        continue;
      }
      const base_pay = usd(BASE[c.role] ?? 15 * 60);
      const tips_amount = c.role === 'waiter' || c.role === 'bartender' ? 620 : 0;
      const gross_total = usd(base_pay + tips_amount);
      // Retención federal (10%) + FICA: Social Security 6.2% y Medicare 1.45%. Florida no tiene
      // impuesto estatal a la renta. El detalle va en el área "payrolldetails".
      const tax_total = usd(gross_total * (0.1 + 0.062 + 0.0145));
      await ensure(`  liquidación ${c.name}`, '/payroll-entries?limit=1', () => false, '/payroll-entries', {
        payroll_run_id: run.id,
        collaborator_id: c.id,
        base_pay,
        overtime_pay: 0,
        tips_amount,
        bonuses: 0,
        deductions: 0,
        gross_total,
        tax_total,
        net_total: usd(gross_total - tax_total),
      });
    }
    return ctx;
  },

  async onlineorders(ctx) {
    console.log('\nPedidos online');
    const [stores, customers, products, orders] = await Promise.all([
      existing('/online-stores?limit=100'),
      existing('/customers?limit=100'),
      existing('/products?limit=100'),
      existing('/online-orders?limit=100'),
    ]);
    const store = stores.find((s) => s.subdomain === 'x7demo-bistro');
    if (!store) {
      console.log('  (sin tienda: ejecuta también el área "online")');
      return ctx;
    }
    const ONLINE = [
      ['WEB-001', 'michael.wilson@customer.demo', 'paid', [['X7 Smash Burger', 2], ['Fresh Limeade', 2]]],
      ['WEB-002', 'natalie.perez@customer.demo', 'pending', [['Mushroom Risotto', 1], ['Key Lime Pie', 1]]],
    ];
    for (const [ref, email, paymentStatus, items] of ONLINE) {
      const notes = `Pedido ${ref}`;
      const found = orders.find((o) => o.notes === notes);
      if (found) {
        stats.existing += 1;
        console.log(`  = pedido online ${ref} (ya existe, id ${found.id})`);
        continue;
      }
      const order = await ensure(`pedido online ${ref} (${paymentStatus})`, '/online-orders?limit=1', () => false, '/online-orders', {
        storeId: store.id,
        customerId: customers.find((c) => c.email === email)?.id,
        type: ref === 'WEB-001' ? 'delivery' : 'pickup',
        paymentStatus,
        placedAt: new Date().toISOString(),
        notes,
      });
      if (!order || order.id < 0) continue;
      for (const [name, quantity] of items) {
        const productId = products.find(byName(name))?.id;
        if (!productId) continue;
        await ensure(`  ${quantity}x ${name}`, '/online-order-items?limit=1', () => false, '/online-order-items', {
          onlineOrderId: order.id,
          productId,
          quantity,
        });
      }
    }
    return ctx;
  },

  async deliveryorders(ctx) {
    console.log('\nDelivery: un pedido a domicilio asignado a un repartidor');
    const active = unwrapItem(await request('GET', '/cash-shifts/active').catch(() => null));
    const openerId = idOf(active?.openedByCollaborator ?? active?.openedBy);
    const [subscriptions, customers, zones, drivers, products, orders] = await Promise.all([
      existing('/merchant-subscription?limit=100'),
      existing('/customers?limit=100'),
      existing('/delivery-zone?limit=100'),
      existing('/delivery-driver?limit=100'),
      existing('/products?limit=100'),
      existing('/orders?limit=100'),
    ]);
    const subscription = subscriptions.find((s) => idOf(s.merchantId ?? s.merchant) === merchantId && s.status === 'active');
    const zone = zones.find(byName('Brickell & Downtown'));
    const customer = customers.find((c) => c.email === 'ashley.miller@customer.demo');
    const driver = drivers.find(byName('Kevin Brooks'));
    if (!openerId || !subscription || !zone || !customer || !driver) {
      console.log('  (faltan turno de caja, suscripción, zona, cliente o repartidor: ejecuta cash, sales, delivery y customers)');
      return ctx;
    }
    const deliveryAddress = '801 Brickell Key Blvd, Apt 1204, Miami, FL 33131';
    let order = orders.find((o) => o.deliveryAddress === deliveryAddress || o.delivery_address === deliveryAddress);
    if (order) {
      stats.existing += 1;
      console.log(`  = pedido a domicilio (ya existe, id ${order.id})`);
    } else {
      order = await ensure('pedido a domicilio', '/orders?limit=1', () => false, '/orders', {
        merchantId,
        collaboratorId: openerId,
        subscriptionId: subscription.id,
        customerId: customer.id,
        businessStatus: 'pending',
        source: 'delivery',
        type: 'delivery',
        guestCount: 1,
        deliveryAddress,
        deliveryZoneId: zone.id,
        deliveryFee: 4.99,
      });
      if (!order || order.id < 0) return ctx;
      for (const [name, quantity] of [['X7 Smash Burger', 1], ['Classic Mojito', 1]]) {
        const p = products.find(byName(name));
        if (!p) continue;
        await ensure(`  ${quantity}x ${name}`, '/order-item?limit=1', () => false, '/order-item', {
          orderId: order.id,
          productId: p.id,
          quantity,
          price: Number(p.basePrice),
        });
      }
    }
    await ensure(`asignación a ${driver.name}`, '/delivery-assignment?limit=100', (a) => idOf(a.order ?? a.order_id ?? a.orderId) === order.id, '/delivery-assignment', {
      order: order.id,
      deliveryDriver: driver.id,
      status: 'active',
    });
    return ctx;
  },

  // ---- Fase 4 ----

  async rules(ctx) {
    console.log('\nReglas del comercio: remuneraciones, horas extra y propinas');
    await ensure('regla de nómina Biweekly payroll', '/merchant-payroll-rule?limit=100', byName('Biweekly payroll'), '/merchant-payroll-rule', {
      name: 'Biweekly payroll',
      frequencyPayroll: 'biweekly',
      payDayOfWeek: 5, // viernes
      allowNegativePayroll: false,
      roundingPrecision: 2,
      currency: 'USD',
      autoApprovePayroll: false,
      requiresManagerApproval: true,
    });
    for (const [name, description, calculationMethod, thresholdHours, maxHours, rateValue, appliesOnWeekends, priority] of [
      // FLSA: 1.5x sobre 40 horas semanales (Florida no tiene horas extra diarias).
      ['Weekly overtime (FLSA)', 'Time and a half after 40 hours in a workweek', 'weekly', 40, 60, 150, true, 1],
      ['Holiday premium', 'Time and a half on company holidays', 'holiday', null, null, 150, false, 2],
    ]) {
      await ensure(`regla ${name}`, '/merchant-overtime-rule?limit=100', byName(name), '/merchant-overtime-rule', {
        name,
        description,
        calculationMethod,
        thresholdHours,
        maxHours,
        rateMethod: 'percentage',
        rateValue,
        appliesOnHolidays: true,
        appliesOnWeekends,
        priority,
      });
    }
    await ensure('regla de propinas Suggested tips', '/merchant-tip-rule?limit=100', byName('Suggested tips'), '/merchant-tip-rule', {
      name: 'Suggested tips',
      tipCalculationMethod: 'percentage',
      tipDistributionMethod: 'role_based',
      suggestedPercentages: [0.18, 0.2, 0.22],
      fixedAmountOptions: [2, 5, 10],
      allowCustomTip: true,
      maximumTipPercentage: 50,
      autoDistribute: false,
      staffPercentage: 0.7,
      kitchenPercentage: 0.2,
      managerPercentage: 0.1,
    });
    return ctx;
  },

  async contracts(ctx) {
    console.log('\nContratos de los colaboradores');
    const company_id = await companyId();
    const [collaborators, contracts] = await Promise.all([existing('/collaborators?limit=100'), existing('/collaborator-contracts?limit=100')]);
    // Todos cobran cada dos semanas. Meseros y bartender, con el salario mínimo con tip credit de
    // Florida ($11.98 en 2026); el manager, con sueldo anual (exento de horas extra).
    const CONTRACTS = {
      waiter: ['hourly', 'part_time', 'biweekly', 0, 11.98, 30],
      host: ['hourly', 'part_time', 'biweekly', 0, 15.5, 30],
      bartender: ['hourly', 'full_time', 'biweekly', 0, 12.98, 40],
      cook: ['hourly', 'full_time', 'biweekly', 0, 19.5, 40],
      cashier: ['hourly', 'full_time', 'biweekly', 0, 16, 40],
      manager: ['salary', 'full_time', 'biweekly', 68000, 0, 45],
    };
    for (const c of collaborators) {
      if (contracts.some((k) => idOf(k.collaborator_id ?? k.collaborator) === c.id)) {
        stats.existing += 1;
        continue;
      }
      const [contract_type, employment_type, pay_frequency, base_salary, hourly_rate, working_hours_per_week] = CONTRACTS[c.role] ?? CONTRACTS.waiter;
      await ensure(`contrato ${c.name} (${contract_type})`, '/collaborator-contracts?limit=1', () => false, '/collaborator-contracts', {
        company_id,
        merchant_id: merchantId,
        collaborator_id: c.id,
        contract_type,
        employment_type,
        pay_frequency,
        base_salary,
        hourly_rate,
        wage_rate: hourly_rate,
        working_hours_per_week,
        overtime_multiplier: 1.5,
        double_overtime_multiplier: 2,
        tips_included_in_payroll: c.role === 'waiter' || c.role === 'bartender',
        start_date: day(-180),
        active: true,
      });
    }
    return ctx;
  },

  async cashtransactions(ctx) {
    console.log('\nCaja: ventas, propina y retiro del turno abierto');
    const activeShift = unwrapItem(await request('GET', '/cash-shifts/active').catch(() => null));
    const cashDrawerId = idOf(activeShift?.cashDrawerId ?? activeShift?.cashDrawer);
    const collaboratorId = idOf(activeShift?.openedByCollaborator ?? activeShift?.openedBy);
    if (!cashDrawerId || !collaboratorId) {
      console.log('  ! sin turno de caja abierto: ejecuta también el área "cash"');
      return ctx;
    }
    const [orders, orderItems, transactions] = await Promise.all([
      existing('/orders?limit=100'),
      existing('/order-item?limit=100'),
      existing('/cash-transactions?limit=100'),
    ]);
    const total = (order) =>
      orderItems
        .filter((i) => idOf(i.orderId ?? i.order_id ?? i.order) === order.id)
        .reduce((sum, i) => sum + Number(i.quantity) * Number(i.price), 0);
    // Se marcan por la nota para no repetirlas: el listado no trae otra clave natural.
    const MOVES = orders
      .filter((o) => o.source === 'pos' && total(o) > 0)
      .map((o) => ['sale', usd(total(o)), `Sale order #${o.id} (demo)`, o.id]);
    MOVES.push(['tip', 20, 'Cash tip (demo)'], ['withdrawal', 500, 'Safe drop (demo)']);
    for (const [type, amount, notes, orderId] of MOVES) {
      await ensure(`${type} ${amount}`, '/cash-transactions?limit=1', () => false, '/cash-transactions', {
        cashDrawerId,
        orderId,
        type,
        amount,
        collaboratorId,
        notes,
      }, transactions.find((t) => t.notes === notes));
    }
    return ctx;
  },

  async tipdistribution(ctx) {
    console.log('\nPropinas: propinas de los pedidos, reparto, liquidación y miembros del pozo');
    const company = await companyId();
    const [orders, shifts, assignments, pools, collaborators] = await Promise.all([
      existing('/orders?limit=100'),
      existing('/shifts?limit=100'),
      existing('/shift-assignments?limit=100'),
      existing('/tip-pools?limit=100'),
      existing('/collaborators?limit=100'),
    ]);
    const shift = shifts.find((s) => new Date(s.startTime ?? s.start_time).getTime() === new Date(at(0, 11)).getTime());
    if (!shift) {
      console.log('  (sin turno de hoy: ejecuta también el área "shifts")');
      return ctx;
    }
    // Personal asignado al almuerzo de hoy (mesero, cocinero y bartender).
    const crew = assignments
      .filter((a) => idOf(a.shiftId ?? a.shift) === shift.id)
      .map((a) => collaborators.find((c) => c.id === idOf(a.collaboratorId ?? a.collaborator)))
      .filter(Boolean);
    const waiter = crew.find((c) => c.role === 'waiter');
    const bartender = crew.find((c) => c.role === 'bartender');

    const pool = pools.find((p) => idOf(p.shiftId ?? p.shift) === shift.id);
    if (pool) {
      const members = await existing('/tip-pool-members?limit=100');
      for (const c of crew) {
        const weight = { waiter: 2, bartender: 1.5, cook: 1 }[c.role] ?? 1;
        await ensure(`miembro del pozo ${c.name}`, '/tip-pool-members?limit=1', () => false, '/tip-pool-members', {
          tipPoolId: pool.id,
          collaboratorId: c.id,
          role: c.role,
          weight,
        }, members.find((m) => idOf(m.tipPoolId ?? m.tipPool) === pool.id && idOf(m.collaboratorId ?? m.collaborator) === c.id));
      }
    } else {
      console.log('  (sin pozo de propinas de hoy: ejecuta también el área "tips")');
    }

    // Una propina por pedido de mesa (18, 20 y 22%): con tarjeta (repartida), en efectivo
    // (liquidada) y online (pendiente), para que se vea cada estado.
    const orderItems = await existing('/order-item?limit=100');
    const total = (order) =>
      orderItems.filter((i) => idOf(i.orderId ?? i.order_id ?? i.order) === order.id).reduce((sum, i) => sum + Number(i.quantity) * Number(i.price), 0);
    const tipped = orders.filter((o) => o.source === 'pos' && total(o) > 0);
    const TIPS = [
      ['card', 0.18, 'allocated'],
      ['cash', 0.2, 'settled'],
      ['online', 0.22, 'pending'],
    ];
    const tips = await existing('/tips?limit=100');
    const [allocations, settlements, cashTipMovements] = await Promise.all([
      existing('/tip-allocations?limit=100'),
      existing('/tip-settlements?limit=100'),
      existing('/cash-tip-movements?limit=100'),
    ]);
    const activeShift = unwrapItem(await request('GET', '/cash-shifts/active').catch(() => null));
    const cashDrawerId = idOf(activeShift?.cashDrawerId ?? activeShift?.cashDrawer);
    for (const [i, order] of tipped.slice(0, TIPS.length).entries()) {
      const [method, rate, status] = TIPS[i];
      const amount = usd(total(order) * rate);
      const tip = await ensure(`propina ${method} pedido #${order.id}: ${amount}`, '/tips?limit=1', () => false, '/tips', {
        companyId: company,
        merchantId,
        orderId: order.id,
        amount,
        method,
        status,
      }, tips.find((t) => idOf(t.orderId ?? t.order) === order.id));
      if (!tip || tip.id < 0 || status === 'pending') continue;

      // Reparto 70/30 entre el mesero y el bartender del turno.
      for (const [collaborator, role, percentage] of [[waiter, 'waiter', 70], [bartender, 'bartender', 30]]) {
        if (!collaborator) continue;
        await ensure(`  reparto ${percentage}% a ${collaborator.name}`, '/tip-allocations?limit=1', () => false, '/tip-allocations', {
          tipId: tip.id,
          collaboratorId: collaborator.id,
          shiftId: shift.id,
          role,
          percentage,
          amount: usd((amount * percentage) / 100),
        }, allocations.find((a) => idOf(a.tipId ?? a.tip) === tip.id && idOf(a.collaboratorId ?? a.collaborator) === collaborator.id));
      }
      if (method === 'cash' && cashDrawerId) {
        await ensure(`  entrada de propina a caja`, '/cash-tip-movements?limit=1', () => false, '/cash-tip-movements', {
          cashDrawerId,
          tipId: tip.id,
          movementType: 'in',
          amount,
        }, cashTipMovements.find((m) => idOf(m.tipId ?? m.tip) === tip.id));
      }
      if (status === 'settled' && waiter) {
        await ensure(`  liquidación a ${waiter.name}`, '/tip-settlements?limit=1', () => false, '/tip-settlements', {
          collaboratorId: waiter.id,
          shiftId: shift.id,
          totalAmount: usd(amount * 0.7),
          settlementMethod: 'cash',
          settledBy: adminUserId,
        }, settlements.find((s) => idOf(s.collaboratorId ?? s.collaborator) === waiter.id && idOf(s.shiftId ?? s.shift) === shift.id));
      }
    }
    return ctx;
  },

  async recipes(ctx) {
    console.log('\nRecetas: insumos por plato');
    const [products, supplies, recipes] = await Promise.all([
      existing('/products?limit=100'),
      existing('/v1/inventory/raw-materials?limit=100'),
      existing('/v1/recipes?limit=100'),
    ]);
    const RECIPES = [
      ['X7 Smash Burger', [['Ground Beef', 170], ['Cheddar Cheese', 30]]],
      ['Grilled Ribeye', [['Ribeye Steak', 340]]],
      ['Mushroom Risotto', [['Arborio Rice', 110], ['Whole Milk', 60]]],
      ['Key Lime Pie', [['Key Limes', 3], ['Whole Milk', 80]]],
      ['Fresh Limeade', [['Key Limes', 4]]],
      ['Classic Mojito', [['Key Limes', 1]]],
    ];
    for (const [productName, lines] of RECIPES) {
      const product = products.find(byName(productName));
      if (!product) continue;
      const recipeLines = lines
        .map(([name, quantity]) => {
          const supply = supplies.find(byName(name));
          return supply && { raw_material_id: supply.id, quantity, unit_of_measure: supply.consumption_unit ?? supply.unit };
        })
        .filter(Boolean);
      if (recipeLines.length === 0) {
        console.log(`  ! receta ${productName}: faltan insumos (ejecuta "supplies")`);
        continue;
      }
      await ensure(`receta ${productName}`, '/v1/recipes?limit=1', () => false, '/v1/recipes', {
        productId: product.id,
        name: productName,
        yieldQuantity: 1,
        isActive: true,
        lines: recipeLines,
      }, recipes.find((r) => idOf(r.finishedProductId ?? r.finishedProduct) === product.id));
    }
    return ctx;
  },

  async movements(ctx) {
    console.log('\nInventario: merma y traspaso entre bodegas');
    // El inventario inicial ya deja un movimiento de entrada por insumo (área "supplies").
    const [items, locations, movements] = await Promise.all([
      existing('/v1/raw-material-stock/items?limit=100'),
      existing('/v1/raw-material-stock/locations?limit=100'),
      existing('/v1/raw-material-stock/movements?limit=100'),
    ]);
    const item = (supplyName) => items.find((i) => (i.supply?.name ?? '') === supplyName && Number(i.currentQty) > 0);
    const cold = locations.find(byName('Walk-in Cooler'));
    // El traspaso deja arroz en la bodega de venta, de la que se descuenta al pagar los pedidos.
    const MOVES = [
      ['DEMO-WASTE-01', 'Key Limes', 12, 'OUT', 'WASTE', 'Waste: spoiled key limes'],
      ['DEMO-WASTE-02', 'Whole Milk', 1000, 'OUT', 'WASTE', 'Waste: expired milk'],
      ['DEMO-XFER-01', 'Arborio Rice', 2000, 'TRANSFER', 'TRANSFER', 'Transfer to the walk-in cooler for the line'],
    ];
    for (const [reference, supplyName, quantity, type, movementType, reason] of MOVES) {
      const stockItem = item(supplyName);
      if (!stockItem) {
        console.log(`  ! ${reference}: sin stock de ${supplyName} (ejecuta "supplies")`);
        continue;
      }
      await ensure(`${reference} ${supplyName} ${quantity}`, '/v1/raw-material-stock/movements?limit=1', () => false, '/v1/raw-material-stock/movements', {
        stockItemId: stockItem.id,
        quantity,
        type,
        movementType,
        reason,
        reference,
        sourceLocationId: idOf(stockItem.location),
        ...(type === 'TRANSFER' && cold ? { destinationLocationId: cold.id } : {}),
      }, movements.find((m) => m.reference === reference));
    }
    return ctx;
  },

  async tableassignments(ctx) {
    console.log('\nSalón: mesas asignadas a los meseros en los turnos de hoy');
    const [tables, shifts, collaborators] = await Promise.all([
      existing('/tables?limit=100'),
      existing('/shifts?limit=100'),
      existing('/collaborators?limit=100'),
    ]);
    const waiters = collaborators.filter((c) => c.role === 'waiter');
    const dining = tables.filter((t) => /^T\d+$/.test(String(t.number))).sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
    if (waiters.length === 0) {
      console.log('  (sin meseros: ejecuta también "staff")');
      return ctx;
    }
    // Almuerzo y cena de hoy: el salón se divide en dos, una mitad por mesero (en la cena se
    // invierten). Requiere el arreglo del backend que evalúa el conflicto por turno.
    for (const [hour, flip] of [[11, false], [18, true]]) {
      const shift = shifts.find((s) => new Date(s.startTime ?? s.start_time).getTime() === new Date(at(0, hour)).getTime());
      if (!shift) {
        console.log(`  (sin turno de hoy a las ${hour}:00: ejecuta también "shifts")`);
        continue;
      }
      // Se lista por turno: sin filtro, el backend trae asignaciones de todos los comercios y
      // responde 403 si aparece una ajena.
      const byShift = `/table-assignments?shiftId=${shift.id}&limit=100`;
      const current = await existing(byShift);
      for (const [i, table] of dining.entries()) {
        const half = Math.floor((i * waiters.length) / dining.length);
        const waiter = waiters[flip ? waiters.length - 1 - half : half];
        await ensure(`mesa ${table.number} → ${waiter.name} (${hour}:00)`, byShift, () => false, '/table-assignments', {
          shiftId: shift.id,
          tableId: table.id,
          collaboratorId: waiter.id,
          status: 'active',
        }, current.find((a) => idOf(a.shiftId ?? a.shift) === shift.id && idOf(a.tableId ?? a.table) === table.id));
      }
    }
    return ctx;
  },

  async kdsdevices(ctx) {
    console.log('\nCocina: una pantalla KDS por estación');
    const stations = await existing('/kitchen-station?limit=100');
    for (const [i, station] of stations.entries()) {
      const deviceIdentifier = `DEMO-KDS-${String(station.stationType ?? station.name).toUpperCase()}`;
      await ensure(`pantalla ${station.name}`, '/kitchen-display-devices?limit=100', (d) => d.deviceIdentifier === deviceIdentifier, '/kitchen-display-devices', {
        stationId: station.id,
        name: `${station.name} Display`,
        deviceIdentifier,
        ipAddress: `192.168.1.${101 + i}`,
        isOnline: true,
        lastSync: new Date().toISOString(),
        status: 'active',
      });
    }
    return ctx;
  },

  // ---- Fase 5 ----

  async onlinemenu(ctx) {
    console.log('\nVenta online: categorías y platos del Main Menu');
    const [menus, categories, products, menuCategories, menuItems] = await Promise.all([
      existing('/online-menus?limit=100'),
      existing('/category?limit=100'),
      existing('/products?limit=100'),
      existing('/online-menu-categories?limit=100'),
      existing('/online-menu-items?limit=100'),
    ]);
    const menu = menus.find(byName('Main Menu'));
    if (!menu) {
      console.log('  (sin menú online: ejecuta también el área "online")');
      return ctx;
    }
    const inMenu = (r) => idOf(r.menuId ?? r.menu) === menu.id;
    for (const [displayOrder, name] of ['Appetizers', 'Entrees', 'Desserts', 'Beverages'].entries()) {
      const category = categories.find(byName(name));
      if (!category) continue;
      await ensure(`categoría online ${name}`, '/online-menu-categories?limit=1', () => false, '/online-menu-categories', {
        menuId: menu.id,
        categoryId: category.id,
        displayOrder,
      }, menuCategories.find((c) => inMenu(c) && idOf(c.categoryId ?? c.category) === category.id));
    }
    // Todos los platos, en el orden de la carta, con un precio online $2 mayor en los platos de
    // fondo (comisión de la app); el ribeye aparece agotado.
    const menuProducts = products.filter((p) => String(p.sku ?? '').startsWith('DEMO-')).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    for (const [displayOrder, product] of menuProducts.entries()) {
      const main = String(product.sku).startsWith('DEMO-ENT');
      await ensure(`plato online ${product.name}`, '/online-menu-items?limit=1', () => false, '/online-menu-items', {
        menuId: menu.id,
        productId: product.id,
        isAvailable: product.name !== 'Grilled Ribeye',
        priceOverride: main ? usd(Number(product.basePrice) + 2) : null,
        displayOrder,
      }, menuItems.find((i) => inMenu(i) && idOf(i.productId ?? i.product) === product.id));
    }
    return ctx;
  },

  async onlinepayments(ctx) {
    console.log('\nVenta online: pagos y datos de despacho de los pedidos');
    const [orders, customers, payments, deliveries] = await Promise.all([
      existing('/online-orders?limit=100'),
      existing('/customers?limit=100'),
      existing('/online-payments?limit=100'),
      existing('/online-delivery-info?limit=100'),
    ]);
    const forOrder = (order) => (r) => idOf(r.onlineOrderId ?? r.onlineOrder) === order.id;
    for (const order of orders.filter((o) => /^Pedido WEB-/.test(o.notes ?? ''))) {
      const ref = order.notes.slice('Pedido '.length);
      const paid = order.paymentStatus === 'paid';
      await ensure(`pago ${ref} (${order.paymentStatus})`, '/online-payments?limit=1', () => false, '/online-payments', {
        onlineOrderId: order.id,
        paymentProvider: 'stripe',
        transactionId: `pi_demo_${ref.toLowerCase()}`,
        amount: Number(order.totalAmount ?? 0),
        status: order.paymentStatus,
        processedAt: paid ? order.placedAt : null,
      }, payments.find(forOrder(order)));
      if (order.type !== 'delivery') continue;
      const customer = customers.find((c) => c.id === idOf(order.customerId ?? order.customer));
      await ensure(`despacho ${ref}`, '/online-delivery-info?limit=1', () => false, '/online-delivery-info', {
        onlineOrderId: order.id,
        customerName: customer?.name ?? 'Demo customer',
        address: customer?.address ?? '50 Biscayne Blvd, Apt 3310',
        city: 'Miami',
        phone: customer?.phone ?? '+1 305-555-0104',
        deliveryInstructions: 'Leave with the front desk and text on arrival',
      }, deliveries.find(forOrder(order)));
    }
    return ctx;
  },

  async reservationdetails(ctx) {
    console.log('\nReservas: invitados y notas del personal');
    const [reservations, customers, notes] = await Promise.all([
      existing('/reservation?limit=100'),
      existing('/customers?limit=100'),
      existing('/reservation-note?limit=100'),
    ]);
    const COMPANIONS = ['Ryan Clark', 'Olivia Adams', 'Ethan Wright'];
    const NOTES = ['Regular guest: offer the usual table', 'Birthday: bring dessert with a candle', 'Tree nut allergy', 'Arriving with a stroller', 'Asked for a text confirmation'];
    for (const [i, reservation] of reservations.filter((r) => r.merchant_id === merchantId).entries()) {
      const customer = customers.find((c) => c.id === reservation.customer_id);
      const guests = reservation.guests ?? [];
      // El titular (el cliente) y un acompañante por cada dos comensales adicionales.
      const people = [
        customer && { name: customer.name, email: customer.email, phone: customer.phone, is_primary: true },
        ...COMPANIONS.slice(0, Math.floor((reservation.party_size - 1) / 2)).map((name) => ({ name, is_primary: false })),
      ].filter(Boolean);
      for (const person of people) {
        await ensure(`  invitado ${person.name} (reserva ${reservation.id})`, '/reservation-guest?limit=1', () => false, '/reservation-guest', {
          reservation_id: reservation.id,
          ...person,
          // El DTO exige formato internacional (IsPhoneNumber).
          phone: person.phone?.replace(/[^\d+]/g, '') || undefined,
        }, guests.find((g) => g.name === person.name));
      }
      const note = NOTES[i % NOTES.length];
      await ensure(`  nota "${note}"`, '/reservation-note?limit=1', () => false, '/reservation-note', {
        reservation_id: reservation.id,
        note,
        created_by: adminUserId,
      }, notes.find((n) => n.reservation_id === reservation.id && n.note === note));
    }
    return ctx;
  },

  async orderdetails(ctx) {
    console.log('\nVentas: modificadores, sales tax y pagos de los pedidos de mesa');
    const activeShift = unwrapItem(await request('GET', '/cash-shifts/active').catch(() => null));
    const collaboratorId = idOf(activeShift?.openedByCollaborator ?? activeShift?.openedBy);
    if (!collaboratorId) {
      console.log('  ! sin turno de caja abierto: ejecuta también el área "cash"');
      return ctx;
    }
    const [orders, orderItems, modifiers, itemModifiers, taxes, payments, tips] = await Promise.all([
      existing('/orders?limit=100'),
      existing('/order-item?limit=100'),
      existing('/modifiers?limit=100'),
      existing('/order-item-modifiers?limit=100'),
      existing('/order-taxes?limit=100'),
      existing('/order-payments?limit=100'),
      existing('/tips?limit=100'),
    ]);
    const byOrder = (order) => (r) => idOf(r.orderId ?? r.order_id ?? r.order) === order.id;

    // Las burgers llevan extra cheese y una sin cebolla.
    const burgers = orderItems.filter((i) => i.product?.name === 'X7 Smash Burger');
    for (const [i, item] of burgers.entries()) {
      for (const name of i === 0 ? ['Extra Cheese', 'No Onions'] : ['Extra Cheese']) {
        const modifier = modifiers.find(byName(name));
        if (!modifier) continue;
        await ensure(`  ${name} en Burger (ítem ${item.id})`, '/order-item-modifiers?limit=1', () => false, '/order-item-modifiers', {
          orderItemId: item.id,
          modifierId: modifier.id,
          price: Number(modifier.priceDelta),
        }, itemModifiers.find((m) => idOf(m.orderItemId ?? m.orderItem) === item.id && idOf(m.modifierId ?? m.modifier) === modifier.id));
      }
    }

    // Sales tax sobre el subtotal de cada pedido; el backend lo suma al total.
    const taxName = `FL Sales Tax ${SALES_TAX_RATE * 100}%`;
    for (const order of orders) {
      const subtotal = Number(order.subtotal ?? 0);
      if (subtotal <= 0) continue;
      await ensure(`sales tax pedido #${order.id}`, '/order-taxes?limit=1', () => false, '/order-taxes', {
        orderId: order.id,
        name: taxName,
        rate: SALES_TAX_RATE * 100,
        amount: usd(subtotal * SALES_TAX_RATE),
      }, taxes.find((t) => byOrder(order)(t) && t.name === taxName));
    }

    // Se pagan los pedidos con propina con tarjeta o efectivo (fase 4); el resto queda abierto.
    // Un pago completo descuenta el stock según las recetas y libera la mesa.
    const refreshed = await existing('/orders?limit=100');
    for (const order of refreshed.filter((o) => o.source === 'pos')) {
      const tip = tips.find(byOrder(order));
      if (!tip || !['card', 'cash'].includes(tip.method)) continue;
      const amount = Number(order.balanceDue ?? order.total);
      await ensure(`pago ${tip.method} pedido #${order.id}: ${amount} + propina ${tip.amount}`, '/order-payments?limit=1', () => false, '/order-payments', {
        orderId: order.id,
        collaboratorId,
        amount,
        method: tip.method,
        provider: tip.method === 'card' ? 'stripe' : undefined,
        reference: `DEMO-PAGO-${order.orderNumber ?? order.id}`,
        tipAmount: Number(tip.amount),
        source: 'pos',
        shiftId: activeShift.id,
      }, payments.find(byOrder(order)) ?? (order.isPaid ? order : undefined));
    }
    return ctx;
  },

  async receipts(ctx) {
    console.log('\nBoletas de los pedidos pagados');
    const [orders, orderItems, receipts] = await Promise.all([
      existing('/orders?limit=100'),
      existing('/order-item?limit=100'),
      existing('/receipts?limit=100'),
    ]);
    for (const order of orders.filter((o) => o.isPaid)) {
      const found = receipts.find((r) => idOf(r.orderId ?? r.order_id ?? r.order) === order.id);
      const receipt = await ensure(`boleta pedido #${order.id}`, '/receipts?limit=1', () => false, '/receipts', {
        orderId: order.id,
        type: 'RECEIPT',
        currency: 'USD',
        fiscalData: JSON.stringify({ ein: DEMO_COMPANY.business.taxId, receiptNumber: `R-${1000 + order.id}` }),
      }, found);
      // Ítems e impuesto solo al crearla, para no repetirlos en cada ejecución.
      if (!receipt || receipt.id < 0 || found) continue;
      for (const item of orderItems.filter((i) => idOf(i.orderId ?? i.order) === order.id)) {
        await ensure(`  ${item.quantity}x ${item.product?.name}`, '/receipt-items?limit=1', () => false, '/receipt-items', {
          receiptId: receipt.id,
          name: item.product?.name ?? 'Item',
          sku: item.product?.sku,
          quantity: Number(item.quantity),
          unitPrice: Number(item.price),
          discountAmount: Number(item.discount ?? 0),
        });
      }
      const subtotal = Number(order.subtotal ?? 0);
      await ensure('  sales tax', '/receipt-taxes?limit=1', () => false, '/receipt-taxes', {
        receiptId: receipt.id,
        name: `FL Sales Tax ${SALES_TAX_RATE * 100}%`,
        rate: SALES_TAX_RATE * 100,
        amount: Number(order.taxTotal ?? usd(subtotal * SALES_TAX_RATE)),
        scope: 'RECEIPT',
      });
    }
    return ctx;
  },

  async cashmovements(ctx) {
    console.log('\nCaja: egreso e ingreso manuales del turno abierto');
    const shift = unwrapItem(await request('GET', '/cash-shifts/active').catch(() => null));
    if (!shift?.id) {
      console.log('  ! sin turno de caja abierto: ejecuta también el área "cash"');
      return ctx;
    }
    // Pese al nombre, este listado trae todos los movimientos del turno (egresos e ingresos).
    const movements = await existing(`/cash-shifts/${shift.id}/expenses`);
    for (const [kind, amount, reason] of [
      ['expenses', 25, 'Ice purchase (demo)'],
      ['inflows', 100, 'Change fund (demo)'],
    ]) {
      await ensure(`${kind === 'expenses' ? 'egreso' : 'ingreso'} ${amount}: ${reason}`, '/cash-shifts?limit=1', () => false, `/cash-shifts/${shift.id}/${kind}`, {
        amount,
        reason,
      }, movements.find((m) => m.reason === reason));
    }
    return ctx;
  },

  async kitchenevents(ctx) {
    console.log('\nCocina: bitácora de eventos de las comandas');
    const [kitchenOrders, events] = await Promise.all([existing('/kitchen-orders?limit=100'), existing('/kitchen-event-logs?limit=100')]);
    // Cada comanda registra su inicio; las terminadas, también listo y servido.
    const offset = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
    for (const order of kitchenOrders.filter((o) => (o.merchantId ?? merchantId) === merchantId)) {
      const started = order.startedAt ?? order.createdAt;
      const steps = [['inicio', started, 0]];
      if (order.businessStatus === 'completed') steps.push(['listo', started, 12], ['servido', started, 15]);
      if (order.businessStatus === 'cancelled') steps.push(['cancelado', order.cancelledAt ?? started, 0]);
      for (const [eventType, base, minutes] of steps) {
        await ensure(`  ${eventType} comanda #${order.id} (${order.notes ?? ''})`, '/kitchen-event-logs?limit=1', () => false, '/kitchen-event-logs', {
          kitchenOrderId: order.id,
          stationId: order.stationId,
          userId: adminUserId,
          eventType,
          eventTime: offset(base, minutes),
          message: `Ticket ${order.notes ?? order.id}: ${eventType}`,
        }, events.find((e) => idOf(e.kitchenOrderId ?? e.kitchenOrder) === order.id && e.eventType === eventType));
      }
    }
    return ctx;
  },

  async deliverytracking(ctx) {
    console.log('\nDelivery: ruta del repartidor hacia el cliente');
    const [assignments, points] = await Promise.all([existing('/delivery-assignment?limit=100'), existing('/delivery-tracking?limit=100')]);
    // Del local (1250 Brickell Ave) a 801 Brickell Key Blvd, un punto cada 3 minutos.
    const ROUTE = [
      [25.759512, -80.192417],
      [25.761894, -80.190582],
      [25.764120, -80.188963],
      [25.766487, -80.187214],
      [25.768302, -80.185941],
    ];
    for (const assignment of assignments.filter((a) => a.status === 'active')) {
      if (points.some((p) => idOf(p.deliveryAssignment ?? p.delivery_assignment) === assignment.id)) {
        stats.existing += 1;
        console.log(`  = ruta de la asignación ${assignment.id} (ya existe)`);
        continue;
      }
      for (const [i, [latitude, longitude]] of ROUTE.entries()) {
        await ensure(`  punto ${i + 1} (${latitude}, ${longitude})`, '/delivery-tracking?limit=1', () => false, '/delivery-tracking', {
          deliveryAssignment: assignment.id,
          latitude,
          longitude,
          recorded_at: new Date(Date.now() - (ROUTE.length - 1 - i) * 3 * 60_000).toISOString(),
          status: 'active',
        });
      }
    }
    return ctx;
  },

  async payrolldetails(ctx) {
    console.log('\nRemuneraciones: retenciones, bonos y descuentos de la nómina');
    const [entries, collaborators, taxes, adjustments] = await Promise.all([
      existing('/payroll-entries?limit=100'),
      existing('/collaborators?limit=100'),
      existing('/payroll-tax-details?limit=100'),
      existing('/payroll-adjustments?limit=100'),
    ]);
    const forEntry = (entry) => (r) => idOf(r.payroll_entry_id ?? r.payrollEntry) === entry.id;
    for (const entry of entries) {
      const collaborator = collaborators.find((c) => c.id === entry.collaborator_id);
      // Las retenciones que suman tax_total en el área "payroll" (Florida no tiene impuesto estatal).
      for (const [tax_type, percentage] of [['Federal income tax', 10], ['Social Security', 6.2], ['Medicare', 1.45]]) {
        await ensure(`  ${tax_type} ${percentage}% ${collaborator?.name ?? entry.id}`, '/payroll-tax-details?limit=1', () => false, '/payroll-tax-details', {
          payroll_entry_id: entry.id,
          tax_type,
          percentage,
          amount: usd((Number(entry.gross_total) * percentage) / 100),
        }, taxes.find((t) => forEntry(entry)(t) && t.tax_type === tax_type));
      }
      // Bono a los meseros por la meta de ventas y el descuento de un uniforme a una cocinera.
      const adjustment =
        collaborator?.role === 'waiter' ? ['bonus', 100] : collaborator?.role === 'cook' && collaborator.name.startsWith('Maria') ? ['deduction', 50] : null;
      if (!adjustment) continue;
      const [adjustment_type, amount] = adjustment;
      await ensure(`  ${adjustment_type} ${amount} ${collaborator.name}`, '/payroll-adjustments?limit=1', () => false, '/payroll-adjustments', {
        payroll_entry_id: entry.id,
        adjustment_type,
        // El backend exige los descuentos en negativo.
        amount: adjustment_type === 'deduction' ? -amount : amount,
      }, adjustments.find(forEntry(entry)));
    }
    return ctx;
  },
};

// ---------------------------------------------------------------------------------------------

async function main() {
  console.log(`API: ${API}${DRY_RUN ? '   [DRY RUN: no se escribe nada]' : ''}`);
  await session();
  let ctx = {};
  for (const [name, run] of Object.entries(AREAS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    ctx = await run(ctx);
  }
  console.log(`\nListo: ${stats.created} creados, ${stats.existing} ya existían, ${stats.failed} fallidos.`);
  if (stats.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
