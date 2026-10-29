import type { ReactNode } from 'react';
import type { UserProfile } from '../../../services/restaurantService';
import type { SubscriptionPlan } from '../../../types/subscription';
import type { JournalEntry } from '../../../types/accounting';
import type { SupplierCreditNote, SupplierPayment } from '../../../types/accounts-payable';
import { getCurrentMerchantId } from '../../../api/users';

import { SubscriptionPlansView } from '../../SaaSFrame/views/SubscriptionPlansView';
import { PlatformApplicationsView } from '../../SaaSFrame/views/PlatformApplicationsView';
import { PlatformFeatureCatalogView } from '../../SaaSFrame/views/PlatformFeatureCatalogView';
import { PlanApplicationsView } from '../../SaaSFrame/views/PlanApplicationsView';
import { PlanFeaturesView } from '../../SaaSFrame/views/PlanFeaturesView';
import { SaasDashboardView } from './SaasDashboardView';
import { ComingSoonView, PlanFeaturesPickPlanView } from './PlaceholderViews';

import { CategoriesView } from './products-inventory/category/CategoriesView';
import { ProductsView } from './products-inventory/products/ProductsView';
import { VariantsView } from './products-inventory/variants/VariantsView';
import { ModifiersView } from './products-inventory/modifiers/ModifiersView';
import { LocationsView } from './products-inventory/stocks/locations/LocationsView';
import { PurchaseOrdersView } from './products-inventory/purchase-order/PurchaseOrdersView';
import { StockInventoryView } from './products-inventory/stocks/items/StockInventoryView';
import { MovementsView } from './products-inventory/stocks/movements/MovementsView';
import { RawMaterialsView } from './products-inventory/raw-materials/RawMaterialsView';
import { RawMaterialCategoriesView } from './products-inventory/category/RawMaterialCategoriesView';
import { RecipesView } from './products-inventory/recipes/RecipesView';
import { ProductsInventoryHubView } from './products-inventory/ProductsInventoryHubView';
import { RawMaterialsHubView } from './products-inventory/RawMaterialsHubView';

import { TaxRulesView } from './rule-config/TaxRulesView';
import { TipRulesView } from './rule-config/TipRulesView';
import { OvertimeRulesView } from './rule-config/OvertimeRulesView';
import { PayrollRulesView } from './rule-config/PayrollRulesView';

import { CashDrawersView } from './restaurant-operations/CashDrawersView';
import { CashShiftsView } from './restaurant-operations/CashShiftsView';
import { CashTransactionsView } from './restaurant-operations/CashTransactionsView';
import { CashMovementsView } from './restaurant-operations/CashMovementsView';
import { CashDrawerHistoryView } from './restaurant-operations/CashDrawerHistoryView';
import { CollaboratorPersonalScheduleView } from './restaurant-operations/CollaboratorPersonalScheduleView';
import { ShiftAssignmentView } from './restaurant-operations/ShiftAssignmentView';
import { TimeClockKioskView } from './restaurant-operations/TimeClockKioskView';
import { TimeEntriesView as RestaurantTimeEntriesView } from './restaurant-operations/TimeEntriesView';
import { TipsLedgerView } from './restaurant-operations/TipsLedgerView';
import { TipPoolsView } from './restaurant-operations/TipPoolsView';
import { TipPoolMembersView } from './restaurant-operations/TipPoolMembersView';
import { TipAllocationsView } from './restaurant-operations/TipAllocationsView';
import { TipSettlementsView } from './restaurant-operations/TipSettlementsView';
import { CashTipMovementsView } from './restaurant-operations/CashTipMovementsView';
import { OpenShiftsMarketplaceView } from './restaurant-operations/OpenShiftsMarketplaceView';
import { LaborCostForecastingView } from './restaurant-operations/LaborCostForecastingView';

import { KitchenStationsView } from './restaurant-operations/kitchen-stations/KitchenStationsView';
import { KitchenKDSHubView } from './restaurant-operations/kitchen-stations/KitchenKDSHubView';
import { KitchenDisplayDevicesView } from './restaurant-operations/kitchen-stations/KitchenDisplayDevicesView';
import { KitchenOrdersView } from './restaurant-operations/kitchen-stations/KitchenOrdersView';
import { KitchenOrderItemsView } from './restaurant-operations/kitchen-stations/KitchenOrderItemsView';
import { KitchenEventLogView } from './restaurant-operations/kitchen-stations/KitchenEventLogView';
import { KitchenAnalyticsView } from './restaurant-operations/kitchen-stations/KitchenAnalyticsView';

import { LedgerAccountsView } from './financial-engine/LedgerAccountsView';
import { JournalEntriesView } from './financial-engine/JournalEntriesView';
import { JournalEntryLinesView } from './financial-engine/JournalEntryLinesView';

import { SuppliersView } from './accounts-payable/SuppliersView';
import { SupplierInvoicesView } from './accounts-payable/SupplierInvoicesView';
import { SupplierInvoiceItemsView } from './accounts-payable/SupplierInvoiceItemsView';
import { SupplierCreditNotesView } from './accounts-payable/SupplierCreditNotesView';
import { SupplierPaymentsView } from './accounts-payable/SupplierPaymentsView';
import { SupplierPaymentItemsView } from './accounts-payable/SupplierPaymentItemsView';
import { SupplierPaymentAllocationsView } from './accounts-payable/SupplierPaymentAllocationsView';

import { MerchantDirectoryView } from './company-admin/MerchantDirectoryView';
import { UserManagementView } from './company-admin/UserManagementView';
import { CompanyProfileView } from './company-admin/CompanyProfileView';
import { CompanyConfigurationsView } from './company-admin/CompanyConfigurationsView';

import { FloorPlansView } from './dining-system/FloorPlansView';
import { FloorZonesView } from './dining-system/FloorZonesView';
import { DiningTablesView } from './dining-system/DiningTablesView';
import { TableAssignmentsView } from './dining-system/TableAssignmentsView';
import { CollaboratorsView } from './hr/CollaboratorsView';
import { TimeEntriesView as HrTimeEntriesView } from './hr/TimeEntriesView';
import { ContractsView } from './hr/ContractsView';
import { ReservationsView } from './reservations/ReservationsView';
import { ReservationTablesView } from './reservations/ReservationTablesView';
import { ReservationNotesView } from './reservations/ReservationNotesView';
import { ReservationGuestsView } from './reservations/ReservationGuestsView';
import { ReservationStatusHistoryView } from './reservations/ReservationStatusHistoryView';
import { DeliveryZonesView } from './delivery/DeliveryZonesView';
import { DeliveryFeesView } from './delivery/DeliveryFeesView';
import { DeliveryDriversView } from './delivery/DeliveryDriversView';
import { DeliveryTrackingView } from './delivery/DeliveryTrackingView';
import { DeliveryAssignmentsView } from './delivery/DeliveryAssignmentsView';
import { QRLocationsView } from './qr-code/QRLocationsView';
import { QRMenusView } from './qr-code/QRMenusView';
import { QRMenuSectionsView } from './qr-code/QRMenuSectionsView';
import { QRMenuItemsView } from './qr-code/QRMenuItemsView';
import { QROrdersView } from './qr-code/QROrdersView';
import { QROrderItemsView } from './qr-code/QROrderItemsView';
import { QRDeploymentsView } from './qr-code/QRDeploymentsView';
import { OnlineOrderingHubView } from './commerce/OnlineOrderingHubView';
import { OnlineStoresView } from './commerce/online-stores/OnlineStoresView';
import { OnlineMenusView } from './commerce/online-menus/OnlineMenusView';
import { OnlineMenuCategoriesView } from './commerce/online-menu-categories/OnlineMenuCategoriesView';
import { OnlineMenuItemsView } from './commerce/online-menu-items/OnlineMenuItemsView';
import { OnlineOrdersView } from './commerce/online-orders/OnlineOrdersView';

export interface AllocationsContext {
  payment?: SupplierPayment | null;
  creditNote?: SupplierCreditNote | null;
}

/** Lo que una vista del registro necesita de MerchantFrame. */
export interface MerchantViewContext {
  activeCategory: string;
  profile: UserProfile | null;
  selectedPlan: SubscriptionPlan | null;
  refreshTrigger: number;
  /** Cambia de pestaña sin tocar la URL. */
  onNavigate: (view: string) => void;
  /** Navegación de las vistas de personal y propinas (también actualiza la URL). */
  onStaffNavigate: (target: string) => void;
  /** Navegación de las vistas de suscripciones (puede llevar el plan elegido). */
  onSaasNavigate: (view: string, plan?: SubscriptionPlan) => void;
  /** Cambia de pestaña limpiando los filtros de drill-down. */
  navigateToFeature: (featureId: string) => void;
  setActiveTab: (tab: string) => void;
  goToDashboard: () => void;
  openLiveMonitor: () => void;
  linesEntryFilter: JournalEntry | null;
  setLinesEntryFilter: (entry: JournalEntry | null) => void;
  itemsPaymentFilter: SupplierPayment | null;
  setItemsPaymentFilter: (payment: SupplierPayment | null) => void;
  allocationsContext: AllocationsContext | null;
  setAllocationsContext: (context: AllocationsContext | null) => void;
}

type ViewRenderer = (ctx: MerchantViewContext) => ReactNode;

const VIEWS = new Map<string, ViewRenderer>();

/** Registra una vista para una o varias pestañas (ids, alias y URLs heredadas). */
function view(tabs: string | string[], render: ViewRenderer) {
  for (const tab of Array.isArray(tabs) ? tabs : [tabs]) {
    if (VIEWS.has(tab)) throw new Error(`Duplicate merchant view: ${tab}`);
    VIEWS.set(tab, render);
  }
}

const merchantId = () => getCurrentMerchantId() ?? undefined;

// ---- Legales y soporte (aún sin contenido) ----
view('privacy-policy', (ctx) => (
  <ComingSoonView title="Privacy Policy" route="/legal/privacy-policy" icon="gavel" onBack={ctx.goToDashboard} />
));
view('terms-of-service', (ctx) => (
  <ComingSoonView title="Terms of Service" route="/legal/terms-of-service" icon="gavel" onBack={ctx.goToDashboard} />
));
view('help-center', (ctx) => (
  <ComingSoonView title="Help Center" route="/support/help-center" icon="help" onBack={ctx.goToDashboard} />
));

// ---- Platform SaaS ----
view('saas-dashboard', (ctx) => (
  <SaasDashboardView refreshTrigger={ctx.refreshTrigger} onNavigateToView={ctx.onNavigate} />
));
view('sub-plans-core', (ctx) => <SubscriptionPlansView onNavigate={ctx.onSaasNavigate} />);
view('apps-config', (ctx) => <PlatformApplicationsView onNavigate={ctx.onSaasNavigate} />);
view('features-control', (ctx) => <PlatformFeatureCatalogView onNavigate={ctx.onSaasNavigate} />);
view('plan-apps-rules', (ctx) => (
  <PlanApplicationsView plan={ctx.selectedPlan ?? undefined} onNavigate={ctx.onSaasNavigate} />
));
view('plan-features-mapping', (ctx) =>
  ctx.selectedPlan ? (
    <PlanFeaturesView plan={ctx.selectedPlan} onNavigate={ctx.onSaasNavigate} />
  ) : (
    <PlanFeaturesPickPlanView onChoosePlan={() => ctx.navigateToFeature('sub-plans-core')} />
  ),
);
view('merchant-directory', () => <MerchantDirectoryView />);
view('user-management', () => <UserManagementView />);
view('company-profile', () => <CompanyProfileView />);
view('company-configurations', () => <CompanyConfigurationsView />);

// ---- Productos e inventario ----
view('categories', (ctx) => <CategoriesView onNavigate={ctx.onNavigate} />);
view('products', (ctx) => <ProductsView onNavigate={ctx.onNavigate} />);
view('modifiers', (ctx) => <ModifiersView onNavigate={ctx.onNavigate} />);
view('variants', (ctx) => <VariantsView onNavigate={ctx.onNavigate} />);
view('locations', (ctx) => <LocationsView onNavigate={ctx.onNavigate} />);
view('purchase-orders', (ctx) => <PurchaseOrdersView onNavigate={ctx.onNavigate} />);
view('stock-movements', (ctx) => <StockInventoryView onNavigate={ctx.onNavigate} />);
view('movements', (ctx) => <MovementsView onNavigate={ctx.onNavigate} />);
view('raw-materials', (ctx) => <RawMaterialsView onNavigate={ctx.onNavigate} />);
view('raw-material-categories', (ctx) => <RawMaterialCategoriesView onNavigate={ctx.onNavigate} />);
view('recipes', (ctx) => <RecipesView onNavigate={ctx.onNavigate} />);
view(['inventory-dashboard', 'products-inventory-hub'], (ctx) => <ProductsInventoryHubView onNavigate={ctx.onNavigate} />);
view(['raw-materials-dashboard', 'raw-materials-hub'], (ctx) => <RawMaterialsHubView onNavigate={ctx.onNavigate} />);

// ---- Reglas ----
view('merchant-tax-rules', (ctx) => <TaxRulesView onNavigate={ctx.onNavigate} />);
view('merchant-tips-rules', (ctx) => <TipRulesView onNavigate={ctx.onNavigate} />);
view('merchant-overtime-rules', (ctx) => <OvertimeRulesView onNavigate={ctx.onNavigate} />);
view('merchant-payroll-rules', (ctx) => <PayrollRulesView onNavigate={ctx.onNavigate} />);

// ---- Caja ----
view('cash-drawers', (ctx) => <CashDrawersView onNavigate={ctx.onNavigate} />);
view('cash-shifts', (ctx) => <CashShiftsView onNavigate={ctx.onNavigate} />);
view('cash-transactions', (ctx) => <CashTransactionsView onNavigate={ctx.onNavigate} />);
view('cash-movements', (ctx) => <CashMovementsView onNavigate={ctx.onNavigate} />);
view('cash-drawer-history', (ctx) => <CashDrawerHistoryView onNavigate={ctx.onNavigate} />);

// ---- Personal: turnos y asistencia ----
view(['my-schedule', 'personal-schedule', '/staff-management/schedule/me'], (ctx) => (
  <CollaboratorPersonalScheduleView onNavigate={ctx.onStaffNavigate} />
));
view(['shifts', 'daily-timeline', 'daily', '/staff-management/schedule/daily'], (ctx) => (
  <ShiftAssignmentView initialViewMode="daily" onNavigate={ctx.onStaffNavigate} />
));
view(['shift-assignment', 'assignments', 'scheduler'], (ctx) => (
  <ShiftAssignmentView initialViewMode="weekly" onNavigate={ctx.onStaffNavigate} />
));
view(['staff-roster', 'roster'], (ctx) => (
  <ShiftAssignmentView initialViewMode="monthly" onNavigate={ctx.onStaffNavigate} />
));
view(['staff-swaps', 'swaps'], (ctx) => (
  <ShiftAssignmentView initialViewMode="swaps" onNavigate={ctx.onStaffNavigate} />
));
view(
  ['open-shifts', 'marketplace', '/staff-management/schedule/marketplace', '/staff-management/schedule/open-shifts'],
  (ctx) => <OpenShiftsMarketplaceView onNavigate={ctx.onStaffNavigate} />,
);
view(['labor-forecasting', 'forecasting', '/staff-management/schedule/labor-forecasting'], (ctx) => (
  <LaborCostForecastingView onNavigate={ctx.onStaffNavigate} />
));
view(['attendance-ledger', 'ledger'], (ctx) => <RestaurantTimeEntriesView onNavigate={ctx.onStaffNavigate} />);
// Misma pestaña en dos módulos: el registro de asistencia de operaciones y los fichajes de RR. HH.
view(['collaborators-time-entries', 'time-entries'], (ctx) =>
  ctx.activeCategory === 'restaurant-operations' ? (
    <RestaurantTimeEntriesView onNavigate={ctx.onStaffNavigate} />
  ) : (
    <HrTimeEntriesView onNavigate={ctx.onNavigate} merchantId={merchantId()} />
  ),
);
view(['time-clock', 'time-clock-kiosk', 'kiosk'], (ctx) => (
  <TimeClockKioskView onClose={() => ctx.setActiveTab('dashboard')} onNavigate={ctx.onStaffNavigate} />
));

// ---- Propinas ----
view(['tips-ledger', 'tips', '/store-operations/tips-ledger'], (ctx) => <TipsLedgerView onNavigate={ctx.onStaffNavigate} />);
view(
  ['tips-pools', 'tip-pools', '/tips/pools', '/store-operations/tips-pools', '/store-operations/tip-pools'],
  (ctx) => <TipPoolsView onNavigate={ctx.onStaffNavigate} />,
);
view(
  ['tips-pool-members', 'tip-pool-members', 'pool-members', '/tips/pool-members', '/store-operations/tips-pool-members', '/store-operations/tip-pool-members'],
  (ctx) => <TipPoolMembersView onNavigate={ctx.onStaffNavigate} />,
);
view(
  ['tips-allocations', 'tip-allocations', '/tips/allocations', '/store-operations/tips-allocations'],
  (ctx) => <TipAllocationsView onNavigate={ctx.onStaffNavigate} />,
);
view(
  ['tips-settlements', 'tip-settlements', '/tips/settlements', '/store-operations/tips-settlements'],
  (ctx) => <TipSettlementsView onNavigate={ctx.onStaffNavigate} />,
);
view(
  ['tips-cash-movements', 'cash-tip-movements', 'tip-movements', '/tips/cash-movements'],
  (ctx) => <CashTipMovementsView onNavigate={ctx.onStaffNavigate} />,
);

// ---- Contabilidad ----
view('ledger-accounts', (ctx) => <LedgerAccountsView onNavigate={ctx.onNavigate} />);
view('journal-entries', (ctx) => (
  <JournalEntriesView
    onNavigate={ctx.onNavigate}
    onViewLines={(entry) => {
      ctx.setLinesEntryFilter(entry);
      ctx.setActiveTab('journal-entries-lines');
    }}
  />
));
view('journal-entries-lines', (ctx) => (
  <JournalEntryLinesView
    entry={ctx.linesEntryFilter}
    onClearEntry={() => ctx.setLinesEntryFilter(null)}
    onNavigate={(next: string) => {
      ctx.setLinesEntryFilter(null);
      ctx.setActiveTab(next);
    }}
  />
));

// ---- Cuentas por pagar ----
view('suppliers', (ctx) => <SuppliersView onNavigate={ctx.onNavigate} companyId={ctx.profile?.company_id} />);
view('supplier-invoices', (ctx) => (
  <SupplierInvoicesView onNavigate={ctx.onNavigate} companyId={ctx.profile?.company_id} />
));
view('supplier-invoice-items', (ctx) => (
  <SupplierInvoiceItemsView onNavigate={ctx.onNavigate} companyId={ctx.profile?.company_id} />
));
view('supplier-credit-notes', (ctx) => (
  <SupplierCreditNotesView
    onNavigate={ctx.onNavigate}
    companyId={ctx.profile?.company_id}
    onViewAllocations={(creditNote) => {
      ctx.setAllocationsContext({ creditNote });
      ctx.setActiveTab('supplier-payments-allocation');
    }}
  />
));
view('supplier-payments', (ctx) => (
  <SupplierPaymentsView
    onNavigate={ctx.onNavigate}
    companyId={ctx.profile?.company_id}
    onViewItems={(payment) => {
      ctx.setItemsPaymentFilter(payment);
      ctx.setActiveTab('supplier-payment-items');
    }}
    onViewAllocations={(payment) => {
      ctx.setAllocationsContext({ payment });
      ctx.setActiveTab('supplier-payments-allocation');
    }}
  />
));
view('supplier-payment-items', (ctx) => (
  <SupplierPaymentItemsView
    payment={ctx.itemsPaymentFilter}
    onClearPayment={() => ctx.setItemsPaymentFilter(null)}
    onNavigate={(next: string) => {
      ctx.setItemsPaymentFilter(null);
      ctx.setActiveTab(next);
    }}
    companyId={ctx.profile?.company_id}
  />
));
view('supplier-payments-allocation', (ctx) => (
  <SupplierPaymentAllocationsView
    payment={ctx.allocationsContext?.payment ?? null}
    creditNote={ctx.allocationsContext?.creditNote ?? null}
    onClearContext={() => ctx.setAllocationsContext(null)}
    onNavigate={(next: string) => {
      ctx.setAllocationsContext(null);
      ctx.setActiveTab(next);
    }}
    companyId={ctx.profile?.company_id}
  />
));

// ---- Vistas por sucursal (merchantId de la sesión) ----
view('floor-plans', (ctx) => <FloorPlansView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('table-zones', (ctx) => <FloorZonesView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('tables', (ctx) => <DiningTablesView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('table-assignments', (ctx) => <TableAssignmentsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('collaborators', (ctx) => <CollaboratorsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('collaborators-contracts', (ctx) => <ContractsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('reservations', (ctx) => <ReservationsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('reservation-tables', (ctx) => <ReservationTablesView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('reservation-notes', (ctx) => <ReservationNotesView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('reservation-guests', (ctx) => <ReservationGuestsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('reservation-status-history', (ctx) => (
  <ReservationStatusHistoryView onNavigate={ctx.onNavigate} merchantId={merchantId()} />
));
view('delivery-zones', (ctx) => <DeliveryZonesView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('delivery-fees', (ctx) => <DeliveryFeesView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('delivery-drivers', (ctx) => <DeliveryDriversView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('delivery-assignments', (ctx) => <DeliveryAssignmentsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('delivery-tracking', (ctx) => <DeliveryTrackingView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('qr-code-locations', (ctx) => <QRLocationsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('qr-code-menus', (ctx) => <QRMenusView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('qr-code-menu-sections', (ctx) => <QRMenuSectionsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('qr-code-menu-items', (ctx) => <QRMenuItemsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('qr-code-orders', (ctx) => <QROrdersView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('qr-order-items', (ctx) => <QROrderItemsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);
view('qr-code-deployments', (ctx) => <QRDeploymentsView onNavigate={ctx.onNavigate} merchantId={merchantId()} />);

// ---- Commerce ----
view(['online-ordering-hub', 'online-ordering-dashboard'], (ctx) => <OnlineOrderingHubView onNavigate={ctx.onNavigate} />);
view('online-stores', (ctx) => <OnlineStoresView onNavigate={ctx.onNavigate} />);
view('online-menus', (ctx) => <OnlineMenusView onNavigate={ctx.onNavigate} />);
view('online-menu-categories', (ctx) => <OnlineMenuCategoriesView onNavigate={ctx.onNavigate} />);
view('online-menu-items', (ctx) => <OnlineMenuItemsView onNavigate={ctx.onNavigate} />);
view('online-orders', (ctx) => <OnlineOrdersView onNavigate={ctx.onNavigate} />);

// ---- Cocina (KDS) ----
view(['kds-dashboard', 'kitchen-kds-hub'], (ctx) => (
  <KitchenKDSHubView onNavigate={ctx.onNavigate} onOpenLiveMonitor={ctx.openLiveMonitor} />
));
view('kitchen-stations', (ctx) => <KitchenStationsView onNavigate={ctx.onNavigate} />);
view('kitchen-display-devices', (ctx) => <KitchenDisplayDevicesView onNavigate={ctx.onNavigate} />);
view('kitchen-orders', (ctx) => <KitchenOrdersView onNavigate={ctx.onNavigate} />);
view('kitchen-order-items', (ctx) => <KitchenOrderItemsView onNavigate={ctx.onNavigate} />);
view('kitchen-event-log', (ctx) => <KitchenEventLogView onNavigate={ctx.onNavigate} />);
view('kitchen-analytics', (ctx) => <KitchenAnalyticsView onNavigate={ctx.onNavigate} />);

/** Pestañas con vista propia (para tests y para saber si una pestaña está implementada). */
export const REGISTERED_VIEW_TABS: readonly string[] = [...VIEWS.keys()];

/** Vista de la pestaña, o `undefined` si no tiene una registrada. */
export function renderMerchantView(tab: string, ctx: MerchantViewContext): ReactNode | undefined {
  return VIEWS.get(tab)?.(ctx);
}
