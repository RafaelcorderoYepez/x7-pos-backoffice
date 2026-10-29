// Persistent navigation hub bars (NavHubBar) for backoffice modules.
//
// Single map per module: return button to its Command Hub and direct links to
// ALL its 3rd level options (features from Features.txt), with exact story labels.
// MerchantFrame references this with active featureId and mounts the bar once
// for the active view, its error states, and "In Development" stubs.
//
// Subscription System: the story spells "SUBCRIPTION PLANS"; the correct spelling
// (SUBSCRIPTION PLANS) is used, like the rest of its labels.
//
// Kitchen Display System and Products / Inventory System mount their own operational Hub and NavHubBar.

export interface ModuleNavItem {
  /** Real featureId from Features.txt resolved by MerchantFrame. */
  featureId: string;
  label: string;
  /** Material Symbols Outlined glyph name. */
  icon: string;
  /** Description for Command Hub card. */
  description: string;
  /** Has its own view; false falls into "In Development" stub. */
  live: boolean;
}

export interface ModuleNavHub {
  /** Application_Id from Applications.txt. */
  appId: string;
  /** Synthetic featureId for module Command Hub page. */
  hubId: string;
  /** Back button label (and hub title). */
  hubLabel: string;
  title: string;
  category: string;
  icon: string;
  description: string;
  items: ModuleNavItem[];
}

export const MODULE_NAV_HUBS: ModuleNavHub[] = [
  {
    appId: 'subscription-system',
    hubId: 'subscription-system-hub',
    hubLabel: 'SUBSCRIPTION SYSTEM COMMAND HUB',
    title: 'Subscription System Command Hub',
    category: 'Platform SaaS',
    icon: 'grid_view',
    description: 'Plans, the applications and features they unlock, and merchant subscriptions and payments.',
    items: [
      { featureId: 'apps-config', label: 'APPLICATIONS', icon: 'apps', live: true, description: 'Platform application catalog and configuration.' },
      { featureId: 'features-control', label: 'FEATURES', icon: 'toggle_on', live: true, description: 'Feature catalog and feature flags.' },
      { featureId: 'merchant-subs-link', label: 'MERCHANT SUBSCRIPTIONS', icon: 'storefront', live: false, description: 'Which plan each merchant is subscribed to.' },
      { featureId: 'plan-apps-rules', label: 'PLAN APPLICATIONS', icon: 'widgets', live: true, description: 'Applications included in each plan.' },
      { featureId: 'plan-features-mapping', label: 'PLAN FEATURES', icon: 'checklist', live: true, description: 'Features unlocked by each plan.' },
      { featureId: 'sub-plans-core', label: 'SUBSCRIPTION PLANS', icon: 'workspace_premium', live: true, description: 'Plan tiers, pricing and billing cycles.' },
      { featureId: 'sub-apps-mapping', label: 'SUBSCRIPTION APPLICATIONS', icon: 'apps_outage', live: false, description: 'Applications active on each merchant subscription.' },
      { featureId: 'sub-payments-billing', label: 'SUBSCRIPTION PAYMENTS', icon: 'payments', live: false, description: 'Subscription invoices and payment history.' },
    ],
  },
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
    appId: 'delivery-management',
    hubId: 'delivery-management-hub',
    hubLabel: 'DELIVERY MANAGEMENT COMMAND HUB',
    title: 'Delivery Management Command Hub',
    category: 'Commerce',
    icon: 'local_shipping',
    description: 'Coverage zones, delivery pricing, drivers, assignments and live tracking.',
    items: [
      { featureId: 'delivery-assignments', label: 'DELIVERY ASSIGNMENTS', icon: 'assignment_turned_in', live: true, description: 'Which driver takes each delivery order.' },
      { featureId: 'delivery-drivers', label: 'DELIVERY DRIVERS', icon: 'two_wheeler', live: true, description: 'Driver roster, vehicles and availability.' },
      { featureId: 'delivery-fees', label: 'DELIVERY FEES', icon: 'payments', live: true, description: 'Base fee, per-km rate, minimum order and free-delivery thresholds.' },
      { featureId: 'delivery-tracking', label: 'DELIVERY TRACKING', icon: 'my_location', live: true, description: 'Driver positions and delivery progress on the map.' },
      { featureId: 'delivery-zones', label: 'DELIVERY ZONES', icon: 'map', live: true, description: 'Geofenced coverage polygons and zone availability.' },
    ],
  },
  {
    appId: 'shifts',
    hubId: 'shifts-hub',
    hubLabel: 'SHIFTS COMMAND HUB',
    title: 'Shifts Command Hub',
    category: 'Restaurant Operations',
    icon: 'schedule',
    description: 'Shift scheduling, shift assignments, roster planning and clock-in management.',
    items: [
      { featureId: 'shift-assignment', label: 'SHIFT ASSIGNMENT', icon: 'assignment', live: true, description: 'Interactive weekly schedule matrix, floor coverage planning and publication control.' },
      { featureId: 'shifts', label: 'SHIFTS', icon: 'schedule', live: true, description: 'Daily Gantt timeline view of staff coverage, hours and active shifts.' },
    ],
  },
  {
    appId: 'tips',
    hubId: 'tips-hub',
    hubLabel: 'TIPS COMMAND HUB',
    title: 'Tips Command Hub',
    category: 'Restaurant Operations',
    icon: 'payments',
    description: 'Tip pools, allocations formulas, settlement processing and cash tip movements.',
    items: [
      { featureId: 'tip-movements', label: 'TIP MOVEMENTS', icon: 'swap_vert', live: true, description: 'Cash tip movements, in-and-out history and shift logs.' },
      { featureId: 'tip-pool-members', label: 'TIP POOL MEMBERS', icon: 'group', live: true, description: 'Staff members roster assigned to active tip pools.' },
      { featureId: 'tip-settlements', label: 'TIP SETTLEMENTS', icon: 'receipt_long', live: true, description: 'Tip distribution runs, execution and payout history.' },
      { featureId: 'tips', label: 'TIPS', icon: 'payments', live: true, description: 'Main tips ledger, collection summary and daily breakdown.' },
      { featureId: 'tips-allocations', label: 'TIPS ALLOCATIONS', icon: 'calculate', live: true, description: 'Tip distribution formulas, points matrix and allocation rules.' },
      { featureId: 'tips-pools', label: 'TIPS POOLS', icon: 'pool', live: true, description: 'Tip pool configuration, contribution rules and member groups.' },
    ],
  },
  {
    appId: 'configuration',
    hubId: 'configuration-hub',
    hubLabel: 'CONFIGURATION COMMAND HUB',
    title: 'Configuration Command Hub',
    category: 'CORE',
    icon: 'settings_applications',
    description: 'Merchant overtime rules, payroll rules, tax rules and tip distribution rules.',
    items: [
      { featureId: 'merchant-overtime-rules', label: 'MERCHANT OVERTIME RULES', icon: 'more_time', live: true, description: 'Overtime thresholds, multiplier rates and daily caps.' },
      { featureId: 'merchant-payroll-rules', label: 'MERCHANT PAYROLL RULES', icon: 'payments', live: true, description: 'Pay periods, salary calculation and withholding rules.' },
      { featureId: 'merchant-tax-rules', label: 'MERCHANT TAX RULES', icon: 'percent', live: true, description: 'Sales tax, VAT rates, tax brackets and exemptions.' },
      { featureId: 'merchant-tips-rules', label: 'MERCHANT TIPS RULES', icon: 'request_quote', live: true, description: 'Tip distribution percentages, pool rules and collection parameters.' },
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
      // The featureId of "Receipts" is `receipt-orders` in features.txt.
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
  {
    appId: 'qr-code',
    hubId: 'qr-code-hub',
    hubLabel: 'QR CODE SYSTEM COMMAND HUB',
    title: 'QR Code System Command Hub',
    category: 'Commerce',
    icon: 'qr_code_2',
    description: 'Physical & virtual QR access points, active QR menus, and dynamic QR code generation.',
    items: [
      { featureId: 'qr-code-locations', label: 'QR CODE LOCATIONS', icon: 'qr_code_2', live: true, description: 'Manage physical and virtual QR access points, assigned menus, tables and dynamic QR assets.' },
      { featureId: 'qr-code-menu-items', label: 'QR CODE MENU ITEMS', icon: 'fastfood', live: true, description: 'Configure items and dishes with real-time availability for QR access.' },
      { featureId: 'qr-code-menu-sections', label: 'QR CODE MENU SECTIONS', icon: 'view_headline', live: true, description: 'Organize menu sections for QR ordering.' },
      { featureId: 'qr-code-menus', label: 'QR CODE MENUS', icon: 'restaurant_menu', live: true, description: 'Deploy and configure digital QR menus.' },
      { featureId: 'qr-code-orders', label: 'QR CODE ORDERS', icon: 'shopping_bag', live: true, description: 'Track live orders originated from QR scans.' },
      { featureId: 'qr-order-items', label: 'QR ORDER ITEMS', icon: 'receipt', live: true, description: 'Detailed line items from QR customer orders.' },
    ],
  },
  {
    appId: 'online-ordering',
    hubId: 'online-ordering-hub',
    hubLabel: 'ONLINE ORDERING COMMAND HUB',
    title: 'Online Ordering Command Hub',
    category: 'Commerce',
    icon: 'space_dashboard',
    description: 'Centralized operational hub for digital storefronts, multi-tenant web portals, menu catalogs, digital payments, live dispatch orders, and delivery logistics.',
    items: [
      { featureId: 'online-stores', label: 'STORES', icon: 'storefront', live: true, description: 'Manage digital storefronts, subdomains, themes, currency and operational status.' },
      { featureId: 'online-payments', label: 'PAYMENTS', icon: 'payments', live: false, description: 'Payment gateways, Stripe/PayPal accounts and digital checkout configurations.' },
      { featureId: 'online-menus', label: 'MENUS', icon: 'restaurant_menu', live: true, description: 'Curated digital menus, seasonal offerings and time-based availability.' },
      { featureId: 'online-menu-categories', label: 'CATEGORIES', icon: 'category', live: true, description: 'Menu taxonomy, sections, families and dish categorization.' },
      { featureId: 'online-menu-items', label: 'ITEMS', icon: 'lunch_dining', live: true, description: 'Online dish catalog, pricing, modifier linkages and stock availability.' },
      { featureId: 'online-orders', label: 'ORDERS', icon: 'shopping_bag', live: true, description: 'Live incoming web orders, customer tracking and dispatch statuses.' },
      { featureId: 'online-order-items', label: 'ORDER ITEMS', icon: 'receipt_long', live: false, description: 'Detailed cart item breakdown, custom modifiers and customer instructions.' },
      { featureId: 'online-delivery-info', label: 'DELIVERY', icon: 'local_shipping', live: false, description: 'Delivery coverage zones, courier fees, minimum order amounts and dispatch timing.' },
    ],
  },
];

const HUB_BY_FEATURE = new Map<string, ModuleNavHub>();
for (const hub of MODULE_NAV_HUBS) {
  for (const item of hub.items) HUB_BY_FEATURE.set(item.featureId, hub);
}

/** Module to which a featureId belongs (to mount its bar), or null. */
export const navHubForFeature = (featureId: string): ModuleNavHub | null =>
  HUB_BY_FEATURE.get(featureId) ?? null;

/** Module whose Command Hub is this synthetic featureId (`<appId>-hub`), or null. */
export const navHubById = (hubId: string): ModuleNavHub | null =>
  MODULE_NAV_HUBS.find((hub) => hub.hubId === hubId) ?? null;
