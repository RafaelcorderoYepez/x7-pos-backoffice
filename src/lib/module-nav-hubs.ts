// Barras de navegación persistentes (NavHubBar) de los módulos del backoffice.
//
// Cash Drawers (X7P-4264) usa etiquetas deducidas del patrón de las demás historias: la suya
// no se ha recibido todavía. Si trae otras, se cambian aquí y en module-nav-hubs.test.ts.
//
// Un único mapa por módulo: el botón de regreso a su Command Hub y los accesos directos a
// TODAS sus opciones de 3er nivel (las features de Features.txt), con las etiquetas exactas
// de las historias. MerchantFrame lo consulta con el featureId activo y monta la barra una
// sola vez para la vista, sus estados de error y los stubs "In Development" — así una opción
// que aún no tiene vista sigue siendo navegable hacia sus hermanas.
//
// Kitchen Display System NO está aquí: sus vistas montan su propia NavHubBar desde antes.

export interface ModuleNavItem {
  /** featureId real de Features.txt, que es lo que MerchantFrame resuelve. */
  featureId: string;
  label: string;
  /** Símbolo de Material Symbols Outlined. */
  icon: string;
  /** Descripción para la tarjeta del Command Hub. */
  description: string;
  /** Tiene vista propia; false = cae en el stub "In Development". */
  live: boolean;
}

export interface ModuleNavHub {
  /** Application_Id de Applications.txt. */
  appId: string;
  /** featureId sintético de la página Command Hub del módulo. */
  hubId: string;
  /** Etiqueta del botón de regreso (y título del hub). */
  hubLabel: string;
  title: string;
  category: string;
  icon: string;
  description: string;
  items: ModuleNavItem[];
}

export const MODULE_NAV_HUBS: ModuleNavHub[] = [
  {
    appId: 'hr',
    hubId: 'hr-hub',
    hubLabel: 'HR COMMAND HUB',
    title: 'HR Command Hub',
    category: 'Finance & HR',
    icon: 'badge',
    description: 'Employee records, employment contracts and attendance in one place.',
    items: [
      { featureId: 'collaborators', label: 'COLLABORATORS', icon: 'badge', live: true, description: 'Staff directory: profiles, roles, shifts and account links.' },
      { featureId: 'collaborators-contracts', label: 'COLLABORATORS CONTRACTS', icon: 'contract', live: true, description: 'Employment contracts, terms and renewals.' },
      { featureId: 'collaborators-time-entries', label: 'COLLABORATORS TIME ENTRIES', icon: 'schedule', live: true, description: 'Clock-ins, corrections and overtime for payroll.' },
    ],
  },
  {
    appId: 'dining-system',
    hubId: 'dining-system-hub',
    hubLabel: 'DINING SYSTEM COMMAND HUB',
    title: 'Dining System Command Hub',
    category: 'Restaurant Operations',
    icon: 'restaurant',
    description: 'Floor layout, tables, zones and waiter coverage for live service.',
    items: [
      { featureId: 'floor-plans', label: 'FLOOR PLANS', icon: 'map', live: true, description: 'Design the dining room layout.' },
      { featureId: 'table-assignments', label: 'TABLE ASSIGNMENTS', icon: 'assignment_ind', live: true, description: 'Which waiter covers which table this shift.' },
      { featureId: 'table-zones', label: 'TABLE ZONES', icon: 'layers', live: true, description: 'Group tables into sections and areas.' },
      { featureId: 'tables', label: 'TABLES', icon: 'table_restaurant', live: true, description: 'Table inventory, capacity and live status.' },
    ],
  },
  {
    appId: 'reservations',
    hubId: 'reservations-hub',
    hubLabel: 'RESERVATIONS COMMAND HUB',
    title: 'Reservations Command Hub',
    category: 'Restaurant Operations',
    icon: 'calendar_today',
    description: 'Bookings, guest rosters, table assignments, service notes and status audit.',
    items: [
      { featureId: 'reservation-guests', label: 'RESERVATION GUESTS', icon: 'group', live: true, description: 'Who is coming in each party, and the primary contact.' },
      { featureId: 'reservation-notes', label: 'RESERVATION NOTES', icon: 'event_note', live: true, description: 'Allergies, occasions and seating preferences.' },
      { featureId: 'reservation-status-history', label: 'RESERVATION STATUS HISTORY', icon: 'history', live: true, description: 'Audit log of every status change and its timing.' },
      { featureId: 'reservation-tables', label: 'RESERVATION TABLES', icon: 'table_restaurant', live: true, description: 'Assign physical tables to bookings.' },
      { featureId: 'reservations', label: 'RESERVATIONS', icon: 'calendar_today', live: true, description: 'The booking book: calendar, capacity and lifecycle.' },
    ],
  },
  {
    appId: 'accounts-payable',
    hubId: 'accounts-payable-hub',
    hubLabel: 'ACCOUNTS PAYABLE COMMAND HUB',
    title: 'Accounts Payable Command Hub',
    category: 'Finance & HR',
    icon: 'payments',
    description: 'Supplier invoices, credit notes, payments and how they are allocated.',
    items: [
      { featureId: 'supplier-credit-notes', label: 'SUPPLIER CREDIT NOTES', icon: 'request_quote', live: true, description: 'Credits issued by suppliers and where they were applied.' },
      { featureId: 'supplier-invoice-items', label: 'SUPPLIER INVOICE ITEMS', icon: 'list_alt', live: true, description: 'Line items of supplier invoices and inventory links.' },
      { featureId: 'supplier-invoices', label: 'SUPPLIER INVOICES', icon: 'receipt_long', live: true, description: 'Bills received, due dates and balances.' },
      { featureId: 'supplier-payment-items', label: 'SUPPLIER PAYMENT ITEMS', icon: 'format_list_bulleted', live: true, description: 'Breakdown of each payment voucher.' },
      { featureId: 'supplier-payments', label: 'SUPPLIER PAYMENTS', icon: 'payments', live: true, description: 'Payments made to suppliers.' },
      { featureId: 'supplier-payments-allocation', label: 'SUPPLIER PAYMENTS ALLOCATION', icon: 'account_tree', live: true, description: 'Which invoices each payment or credit note settles.' },
    ],
  },
  {
    appId: 'payrolls',
    hubId: 'payrolls-hub',
    hubLabel: 'PAYROLLS COMMAND HUB',
    title: 'Payrolls Command Hub',
    category: 'Finance & HR',
    icon: 'account_balance_wallet',
    description: 'Payroll runs, per-employee entries, tax detail and adjustments.',
    items: [
      { featureId: 'payroll-adjustments', label: 'PAYROLL ADJUSTMENTS', icon: 'tune', live: false, description: 'Bonuses, deductions and corrections.' },
      { featureId: 'payroll-entries', label: 'PAYROLL ENTRIES', icon: 'list_alt', live: false, description: 'Per-employee lines of each payroll run.' },
      { featureId: 'payroll-runs', label: 'PAYROLL RUNS', icon: 'play_circle', live: false, description: 'Open, calculate and close pay periods.' },
      { featureId: 'payroll-tax-detail', label: 'PAYROLL TAX DETAIL', icon: 'percent', live: false, description: 'Withholdings and employer contributions.' },
    ],
  },
  {
    appId: 'pos',
    hubId: 'pos-hub',
    hubLabel: 'POS COMMAND HUB',
    title: 'POS Command Hub',
    category: 'Restaurant Operations',
    icon: 'point_of_sale',
    description: 'Front-of-house checkout: orders, items, modifiers, payments, discounts and taxes.',
    items: [
      { featureId: 'order-discounts', label: 'ORDER DISCOUNTS', icon: 'sell', live: false, description: 'Discounts applied to orders.' },
      { featureId: 'order-items', label: 'ORDER ITEMS', icon: 'restaurant_menu', live: false, description: 'Dishes and drinks on each order.' },
      { featureId: 'order-item-modifiers', label: 'ORDER ITEM MODIFIERS', icon: 'tune', live: false, description: 'Extras and changes on order items.' },
      { featureId: 'order-payments', label: 'ORDER PAYMENTS', icon: 'credit_card', live: false, description: 'Tenders, split payments and tips.' },
      { featureId: 'order-taxes', label: 'ORDER TAXES', icon: 'percent', live: false, description: 'Taxes calculated per order.' },
      { featureId: 'orders', label: 'ORDERS', icon: 'receipt', live: false, description: 'Open and closed tickets.' },
    ],
  },
  {
    appId: 'cash-drawers',
    hubId: 'cash-drawers-hub',
    hubLabel: 'CASH DRAWERS COMMAND HUB',
    title: 'Cash Drawers Command Hub',
    category: 'Restaurant Operations',
    icon: 'point_of_sale',
    description: 'Drawer sessions, cash shifts, transactions, movements and closing history.',
    items: [
      { featureId: 'cash-drawer-history', label: 'CASH DRAWER HISTORY', icon: 'history', live: true, description: 'Closed drawer sessions and their reconciliation.' },
      { featureId: 'cash-drawers', label: 'CASH DRAWERS', icon: 'point_of_sale', live: true, description: 'Open and close drawer sessions.' },
      { featureId: 'cash-movements', label: 'CASH MOVEMENTS', icon: 'swap_vert', live: true, description: 'Cash in and cash out outside sales.' },
      { featureId: 'cash-shifts', label: 'CASH SHIFTS', icon: 'schedule', live: true, description: 'Cashier shifts on each drawer.' },
      { featureId: 'cash-transactions', label: 'CASH TRANSACTIONS', icon: 'receipt_long', live: true, description: 'Every cash transaction recorded.' },
    ],
  },
  {
    appId: 'billing-transactions',
    hubId: 'billing-transactions-hub',
    hubLabel: 'BILLING & TRANSACTIONS COMMAND HUB',
    title: 'Billing & Transactions Command Hub',
    category: 'CORE',
    icon: 'receipt_long',
    description: 'Receipts issued, their line items and the taxes they carry.',
    items: [
      { featureId: 'receipt-items', label: 'RECEIPT ITEMS', icon: 'list', live: false, description: 'Line items printed on each receipt.' },
      // El featureId de "Receipts" es `receipt-orders` en Features.txt.
      { featureId: 'receipt-orders', label: 'RECEIPTS', icon: 'receipt_long', live: false, description: 'Receipts issued for paid orders.' },
      { featureId: 'receipt-taxes', label: 'RECEIPTS TAXES', icon: 'percent', live: false, description: 'Tax lines allocated to each receipt.' },
    ],
  },
  {
    appId: 'financial-engine',
    hubId: 'financial-engine-hub',
    hubLabel: 'FINANCIAL ENGINE COMMAND HUB',
    title: 'Financial Engine Command Hub',
    category: 'CORE',
    icon: 'account_balance',
    description: 'Double-entry journal and the chart of ledger accounts.',
    items: [
      { featureId: 'journal-entries', label: 'JOURNAL ENTRIES', icon: 'menu_book', live: true, description: 'Posted accounting entries.' },
      { featureId: 'journal-entries-lines', label: 'JOURNAL ENTRIES LINES', icon: 'segment', live: true, description: 'Debit and credit lines of each entry.' },
      { featureId: 'ledger-accounts', label: 'LEDGER ACCOUNTS', icon: 'account_balance', live: true, description: 'Chart of accounts setup.' },
    ],
  },
  {
    appId: 'business-partners',
    hubId: 'business-partners-hub',
    hubLabel: 'BUSINESS PARTNERS COMMAND HUB',
    title: 'Business Partners Command Hub',
    category: 'CORE',
    icon: 'handshake',
    description: 'Customer and supplier master data.',
    items: [
      { featureId: 'customers', label: 'CUSTOMERS', icon: 'person', live: false, description: 'Customer profiles and billing identity.' },
      { featureId: 'suppliers', label: 'SUPPLIERS', icon: 'local_shipping', live: true, description: 'Supplier directory and terms.' },
    ],
  },
];

const HUB_BY_FEATURE = new Map<string, ModuleNavHub>();
for (const hub of MODULE_NAV_HUBS) {
  for (const item of hub.items) HUB_BY_FEATURE.set(item.featureId, hub);
}

/** Módulo al que pertenece un featureId (para montar su barra), o null. */
export const navHubForFeature = (featureId: string): ModuleNavHub | null =>
  HUB_BY_FEATURE.get(featureId) ?? null;

/** Módulo cuyo Command Hub es este featureId sintético (`<appId>-hub`), o null. */
export const navHubById = (hubId: string): ModuleNavHub | null =>
  MODULE_NAV_HUBS.find((hub) => hub.hubId === hubId) ?? null;
