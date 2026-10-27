import { featureIdForDeliveryPath } from '../../lib/delivery-navigation';
import { featureIdForReservationPath } from '../../lib/reservation-navigation';

/**
 * Rutas del backoffice del merchant. Todas renderizan MerchantFrame; la URL solo decide qué
 * categoría y pestaña se abren. App.tsx registra las rutas a partir de esta misma tabla, así que
 * una URL nueva se añade aquí y nada más.
 */

export interface RouteNav {
  category: string;
  tab: string;
}

export interface NavigationLocationState {
  activeTab?: string;
  activeCategory?: string;
  merchantId?: string | number;
}

const OPS = 'restaurant-operations';

function routes(category: string, tab: string, ...paths: string[]): Array<[string, RouteNav]> {
  return paths.map((path) => [path, { category, tab }]);
}

const EXACT_ROUTES: Record<string, RouteNav> = Object.fromEntries([
  ...routes('legal', 'privacy-policy', '/legal/privacy-policy'),
  ...routes('legal', 'terms-of-service', '/legal/terms-of-service'),
  ...routes('support', 'help-center', '/support/help-center'),

  ...routes('platformsaas', 'merchant-directory', '/dashboard/merchants'),
  ...routes('platformsaas', 'user-management', '/dashboard/users'),
  ...routes('platformsaas', 'company-profile', '/dashboard/company-profile'),
  ...routes('platformsaas', 'company-configurations', '/dashboard/company-configurations'),

  ...routes('core', 'journal-entries', '/inventory/journal-entries'),

  // Personal: turnos y asistencia
  ...routes(OPS, 'staff-roster', '/staff-management/schedule/roster'),
  ...routes(OPS, 'shift-assignment', '/staff-management/schedule/assignments'),
  ...routes(OPS, 'daily-timeline', '/staff-management/schedule/daily', '/staff-management/schedule/timeline'),
  ...routes(OPS, 'shifts', '/staff-management/schedule/shifts', '/staff-management/schedule/scheduler'),
  ...routes(OPS, 'staff-swaps', '/staff-management/schedule/swaps'),
  ...routes(OPS, 'open-shifts', '/staff-management/schedule/marketplace', '/staff-management/schedule/open-shifts'),
  ...routes(OPS, 'labor-forecasting', '/staff-management/schedule/labor-forecasting', '/staff-management/schedule/forecasting'),
  ...routes(OPS, 'my-schedule', '/staff-management/schedule/me'),
  ...routes(OPS, 'collaborators-time-entries', '/staff-management/attendance/ledger'),
  ...routes(OPS, 'time-clock-kiosk', '/staff-management/attendance/kiosk'),

  // Propinas y caja
  ...routes(OPS, 'tips-ledger', '/store-operations/tips-ledger', '/tips/ledger'),
  ...routes(OPS, 'tips-allocations', '/store-operations/tips-allocations', '/tips/allocations'),
  ...routes(OPS, 'tips-pools', '/store-operations/tips-pools', '/store-operations/tip-pools', '/tips/pools'),
  ...routes(OPS, 'tips-pool-members', '/store-operations/tips-pool-members', '/store-operations/tip-pool-members', '/tips/pool-members'),
  ...routes(OPS, 'tips-settlements', '/store-operations/tips-settlements', '/store-operations/tip-settlements', '/tips/settlements'),
  ...routes(OPS, 'tips-cash-movements', '/tips/cash-movements', '/store-operations/tips-cash-movements', '/store-operations/cash-tip-movements'),
  ...routes(OPS, 'cash-movements', '/store-operations/cash-movements'),

  // Productos e inventario
  ...routes('inventory', 'products', '/dashboard/products'),
  ...routes('inventory', 'categories', '/dashboard/categories'),
  ...routes('inventory', 'raw-materials', '/dashboard/raw-materials', '/inventory/raw-materials'),
  ...routes('inventory', 'raw-material-categories', '/dashboard/raw-material-categories'),
  ...routes('inventory', 'recipes', '/dashboard/recipes', '/inventory/recipes'),
  ...routes('inventory', 'stock-movements', '/inventory/stocks'),
  ...routes('inventory', 'movements', '/inventory/movements'),
  ...routes('inventory', 'inventory-dashboard', '/inventory/dashboard', '/inventory/hub', '/dashboard/inventory'),
  ...routes('inventory', 'raw-materials-dashboard', '/inventory/raw-materials-dashboard', '/inventory/raw-materials/dashboard', '/dashboard/raw-materials-hub'),

  // Commerce
  ...routes('commerce', 'qr-code-locations', '/qr-code/locations', '/dashboard/qr-locations', '/qr-code-locations'),
  ...routes('commerce', 'qr-code-menus', '/qr-code/menus', '/dashboard/qr-menus', '/qr-code-menus'),
  ...routes('commerce', 'qr-code-menu-sections', '/qr-code/menu-sections'),
  ...routes('commerce', 'qr-code-menu-items', '/qr-code/menu-items'),
  ...routes('commerce', 'qr-code-deployments', '/qr-code/deployments'),
  ...routes('commerce', 'qr-code-orders', '/qr-code/orders'),
  ...routes('commerce', 'qr-order-items', '/qr-code/order-items'),
  ...routes('commerce', 'online-ordering-hub', '/online-ordering', '/online-ordering/hub', '/online-ordering/dashboard', '/dashboard/online-ordering'),
  ...routes('commerce', 'online-stores', '/commerce/online-stores', '/dashboard/online-stores', '/online-stores', '/online-ordering/stores'),
  ...routes('commerce', 'online-menus', '/commerce/online-menus', '/dashboard/online-menus', '/online-menus', '/online-ordering/menus'),
  ...routes('commerce', 'online-payments', '/online-ordering/payments'),
  ...routes('commerce', 'online-menu-categories', '/online-ordering/categories'),
  ...routes('commerce', 'online-menu-items', '/online-ordering/items'),
  ...routes('commerce', 'online-orders', '/online-ordering/orders'),
  ...routes('commerce', 'online-order-items', '/online-ordering/order-items'),
  ...routes('commerce', 'online-delivery-info', '/online-ordering/delivery', '/online-ordering/delivery-info'),
]);

/** Secciones cuyas sub-URLs abren MerchantFrame aunque no estén en la tabla. */
const SECTION_PREFIXES = [
  '/staff-management',
  '/store-operations',
  '/tips',
  '/online-ordering',
  '/reservations',
  '/delivery',
];

/** Rutas que App.tsx registra para MerchantFrame. */
export const MERCHANT_ROUTE_PATHS: string[] = [
  '/dashboard',
  ...Object.keys(EXACT_ROUTES),
  ...SECTION_PREFIXES.map((prefix) => `${prefix}/*`),
];

/** Categoría y pestaña que abre una URL, o null si la URL no fija ninguna. */
export function getNavFromPath(
  path: string,
  locationState?: NavigationLocationState | null,
  profileRole?: string,
): RouteNav | null {
  const exact = EXACT_ROUTES[path];
  if (exact) return exact;

  if (path.startsWith('/reservations/')) {
    return { category: OPS, tab: featureIdForReservationPath(path) };
  }
  if (path === '/delivery' || path.startsWith('/delivery/')) {
    return { category: 'commerce', tab: featureIdForDeliveryPath(path) };
  }
  if (path === '/dashboard') {
    const fallback: RouteNav =
      profileRole === 'SaaS Owner'
        ? { category: 'saas', tab: 'saas-dashboard' }
        : { category: 'core', tab: 'dashboard' };
    return {
      category: locationState?.activeCategory || fallback.category,
      tab: locationState?.activeTab || fallback.tab,
    };
  }
  return null;
}

/** A dónde lleva un enlace interno de las vistas de personal y propinas. */
export interface StaffTarget {
  tab: string;
  path: string;
  /** Solo las de propinas fijan la categoría; el resto la hereda de la URL. */
  category?: string;
}

// Las vistas de personal/propinas navegan con ids de pestaña, alias cortos o URLs indistintamente.
const STAFF_TARGETS: Array<[string[], StaffTarget]> = [
  [['/staff-management/schedule/me', 'my-schedule', 'personal-schedule'],
    { tab: 'my-schedule', path: '/staff-management/schedule/me' }],
  [['/staff-management/schedule/roster', 'staff-roster', 'roster'],
    { tab: 'staff-roster', path: '/staff-management/schedule/roster' }],
  [['/staff-management/schedule/assignments', 'shift-assignment', 'assignments'],
    { tab: 'shift-assignment', path: '/staff-management/schedule/assignments' }],
  [['/staff-management/schedule/daily', '/staff-management/schedule/timeline', 'daily-timeline', 'daily'],
    { tab: 'daily-timeline', path: '/staff-management/schedule/daily' }],
  [['/staff-management/schedule/shifts', '/staff-management/schedule/scheduler', 'shifts', 'scheduler'],
    { tab: 'shifts', path: '/staff-management/schedule/shifts' }],
  [['/staff-management/schedule/swaps', 'staff-swaps', 'swaps'],
    { tab: 'staff-swaps', path: '/staff-management/schedule/swaps' }],
  [['/staff-management/schedule/marketplace', '/staff-management/schedule/open-shifts', 'open-shifts', 'marketplace'],
    { tab: 'open-shifts', path: '/staff-management/schedule/marketplace' }],
  [['/staff-management/schedule/labor-forecasting', 'labor-forecasting', 'forecasting'],
    { tab: 'labor-forecasting', path: '/staff-management/schedule/labor-forecasting' }],
  [['/staff-management/attendance/ledger', 'collaborators-time-entries', 'time-entries', 'ledger'],
    { tab: 'collaborators-time-entries', path: '/staff-management/attendance/ledger' }],
  [['/staff-management/attendance/kiosk', 'time-clock', 'time-clock-kiosk', 'kiosk'],
    { tab: 'time-clock-kiosk', path: '/staff-management/attendance/kiosk' }],
  [['/store-operations/tips-ledger', '/tips/ledger', 'tips-ledger', 'tips'],
    { tab: 'tips-ledger', path: '/store-operations/tips-ledger', category: OPS }],
  [['/store-operations/tips-allocations', '/tips/allocations', 'tips-allocations', 'tip-allocations'],
    { tab: 'tips-allocations', path: '/tips/allocations', category: OPS }],
  [['/tips/pools', 'tips-pools', '/store-operations/tips-pools', '/store-operations/tip-pools'],
    { tab: 'tips-pools', path: '/tips/pools', category: OPS }],
  [['/tips/pool-members', 'tips-pool-members', 'pool-members', '/store-operations/tips-pool-members', '/store-operations/tip-pool-members'],
    { tab: 'tips-pool-members', path: '/tips/pool-members', category: OPS }],
  [['/store-operations/tips-settlements', '/store-operations/tip-settlements', '/tips/settlements', 'tips-settlements', 'tip-settlements'],
    { tab: 'tips-settlements', path: '/tips/settlements', category: OPS }],
  [['/tips/cash-movements', 'tips-cash-movements', 'cash-tip-movements'],
    { tab: 'tips-cash-movements', path: '/tips/cash-movements', category: OPS }],
];

export function resolveStaffTarget(target: string): StaffTarget | null {
  return STAFF_TARGETS.find(([aliases]) => aliases.includes(target))?.[1] ?? null;
}
