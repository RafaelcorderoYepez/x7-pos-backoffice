import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  CreateQROrderDto,
  CustomerRef,
  MerchantRef,
  POSOrderRef,
  QROrder,
  QROrderStatus,
  QRLocationRef,
  TableRef,
} from '../../../../types/qr-order';
import {
  QR_ORDER_LOGICAL_STATUS_CONFIG,
  QR_ORDER_LOGICAL_STATUSES,
  QR_ORDER_STATUS_CONFIG,
  QR_ORDER_STATUSES,
} from '../../../../types/qr-order';
import {
  createQROrder,
  deleteQROrder,
  fetchAvailableCustomers,
  fetchAvailableMerchants,
  fetchAvailablePOSOrders,
  fetchAvailableQRLocations,
  fetchAvailableTables,
  getQROrders,
  updateQROrder,
  updateQROrderLifecycleStatus,
} from '../../../../api/qr-orders';
import {
  canTransitionStatus,
  filterQROrders,
  formatPOSOrderBadge,
  formatQROrderBadge,
  formatQROrderCurrency,
  getCustomerDisplayName,
  getLocationTableContext,
  getNextLifecycleStatuses,
  validateQROrderPayload,
  validateTotalAmount,
} from '../../../../lib/qr-order';

interface QROrdersViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

export const QROrdersView: React.FC<QROrdersViewProps> = ({
  merchantId = 1,
}) => {
  const [orders, setOrders] = useState<QROrder[]>([]);
  const [merchants, setMerchants] = useState<MerchantRef[]>([]);
  const [locations, setLocations] = useState<QRLocationRef[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [tables, setTables] = useState<TableRef[]>([]);
  const [posOrders, setPosOrders] = useState<POSOrderRef[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<QROrderStatus>>(
    new Set(QR_ORDER_STATUSES)
  );
  const [selectedLogicalStatuses, setSelectedLogicalStatuses] = useState<Set<string>>(
    new Set(QR_ORDER_LOGICAL_STATUSES)
  );
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('table');

  // Filter QR locations and tables strictly by active tenant (merchantId)
  const tenantLocations = useMemo(() => {
    return locations.filter((l) => !l.merchant_id || Number(l.merchant_id) === Number(merchantId || 1));
  }, [locations, merchantId]);

  const tenantTables = useMemo(() => {
    return tables.filter((t) => !t.merchant_id || Number(t.merchant_id) === Number(merchantId || 1));
  }, [tables, merchantId]);

  // Detail Drawer state
  const [detailOrder, setDetailOrder] = useState<QROrder | null>(null);
  const [drawerTableId, setDrawerTableId] = useState<string>('');

  // Kitchen Chit Printout state
  const [ticketPrintOrder, setTicketPrintOrder] = useState<QROrder | null>(null);

  // Synchronize drawer table selector when detailOrder changes
  useEffect(() => {
    if (detailOrder) {
      setDrawerTableId(detailOrder.table_id ? String(detailOrder.table_id) : '');
    }
  }, [detailOrder]);

  // Create / Edit Drawer state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<QROrder | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formGeneralError, setFormGeneralError] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    merchant_id: number;
    qr_location_id: number;
    customer_id: number | null;
    table_id: number | null;
    order_id: number;
    qr_order_status: QROrderStatus;
    notes: string;
    total_amount: string;
    status: string;
  }>({
    merchant_id: merchantId,
    qr_location_id: 1,
    customer_id: null,
    table_id: null,
    order_id: 5010,
    qr_order_status: 'PENDING',
    notes: '',
    total_amount: '35.00',
    status: 'active',
  });

  // Modal tenant options based on the currently selected merchant in the modal form
  const modalTenantLocations = useMemo(() => {
    const target = Number(formData.merchant_id || merchantId || 1);
    return locations.filter((l) => !l.merchant_id || Number(l.merchant_id) === target);
  }, [locations, formData.merchant_id, merchantId]);

  const modalTenantTables = useMemo(() => {
    const target = Number(formData.merchant_id || merchantId || 1);
    return tables.filter((t) => !t.merchant_id || Number(t.merchant_id) === target);
  }, [tables, formData.merchant_id, merchantId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, merchRes, locsRes, custRes, tabRes, posRes] = await Promise.allSettled([
        getQROrders(merchantId),
        fetchAvailableMerchants(),
        fetchAvailableQRLocations(merchantId),
        fetchAvailableCustomers(merchantId),
        fetchAvailableTables(merchantId),
        fetchAvailablePOSOrders(merchantId),
      ]);

      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value);
      if (merchRes.status === 'fulfilled') setMerchants(merchRes.value);
      if (locsRes.status === 'fulfilled') setLocations(locsRes.value);
      if (custRes.status === 'fulfilled') setCustomers(custRes.value);
      if (tabRes.status === 'fulfilled') setTables(tabRes.value);
      if (posRes.status === 'fulfilled') setPosOrders(posRes.value);

      if (ordersRes.status === 'rejected') {
        setError(ordersRes.reason?.message || 'Failed to load QR Orders.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load QR Orders.');
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Flash action notification
  const triggerSuccessAlert = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => {
      setActionSuccessMessage(null);
    }, 3500);
  };

  // Metrics calculation aligned with story specs
  const metrics = useMemo(() => {
    const totalCount = orders.length;
    const pendingCount = orders.filter((o) => o.qr_order_status === 'PENDING').length;
    const activeKitchenOrders = orders.filter(
      (o) => o.qr_order_status === 'CONFIRMED' || o.qr_order_status === 'IN_PREPARATION'
    ).length;
    const deliveredCount = orders.filter((o) => o.qr_order_status === 'DELIVERED').length;
    // Total QR Sales Volume: Sum calculation of total_amount across active QR orders
    const activeOrders = orders.filter((o) => o.status === 'active');
    const totalSalesVolume = activeOrders.reduce(
      (acc, o) => acc + (Number(o.total_amount) || 0),
      0
    );

    return {
      totalCount,
      pendingCount,
      activeKitchenOrders,
      cookingCount: activeKitchenOrders,
      deliveredCount,
      totalSalesVolume,
      totalVolume: totalSalesVolume,
    };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return filterQROrders(orders, {
      searchTerm,
      selectedStatuses,
      locationId: locationFilter,
      selectedLogicalStatuses,
    });
  }, [orders, searchTerm, selectedStatuses, locationFilter, selectedLogicalStatuses]);

  // Status checkbox toggle
  const toggleStatusFilter = (st: QROrderStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(st)) {
        if (next.size > 1) next.delete(st);
      } else {
        next.add(st);
      }
      return next;
    });
  };

  // Quick Lifecycle Advancement with KDS kitchen automation and status progression validation
  const handleAdvanceStatus = async (orderId: number, targetStatus: QROrderStatus) => {
    const currentOrder = orders.find((o) => o.id === orderId);
    if (currentOrder) {
      const transitionCheck = canTransitionStatus(currentOrder.qr_order_status, targetStatus);
      if (!transitionCheck.allowed) {
        alert(transitionCheck.reason);
        return;
      }
    }

    try {
      const updated = await updateQROrderLifecycleStatus(orderId, targetStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (detailOrder?.id === orderId) setDetailOrder(updated);

      // KDS Kitchen Dispatch Automation: PENDING -> CONFIRMED routes line items to KDS screens
      if (currentOrder?.qr_order_status === 'PENDING' && targetStatus === 'CONFIRMED') {
        triggerSuccessAlert(
          `Order #QR-ORD-${orderId} accepted! Line items automatically routed to Kitchen Display System (KDS) screens for preparation.`
        );
      } else {
        triggerSuccessAlert(`Order #QR-ORD-${orderId} moved to ${targetStatus}.`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update order status.');
    }
  };

  // Adjust Dining Table Binding directly from Detail Drawer
  const handleSaveDrawerTable = async (orderId: number) => {
    try {
      const newTableId = drawerTableId ? parseInt(drawerTableId, 10) : null;
      const updated = await updateQROrder(orderId, { table_id: newTableId });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      setDetailOrder(updated);
      const tableName = updated.table?.number ? `Table #${updated.table.number}` : 'No Table (Counter/Pickup)';
      triggerSuccessAlert(`Order #QR-ORD-${orderId} dining table updated to ${tableName}.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update table binding.');
    }
  };

  // Handle Cancellation or Refund from Detail Drawer
  const handleCancelOrRefund = async (orderId: number) => {
    const currentOrder = orders.find((o) => o.id === orderId);
    if (!currentOrder) return;

    if (currentOrder.qr_order_status === 'CANCELLED') {
      alert(`Order #QR-ORD-${orderId} is already cancelled.`);
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to cancel / refund QR Order #QR-ORD-${orderId} (${formatQROrderCurrency(
        currentOrder.total_amount
      )})?`
    );
    if (!confirmed) return;

    try {
      const updated = await updateQROrder(orderId, {
        qr_order_status: 'CANCELLED',
        status: 'archived',
        notes: currentOrder.notes
          ? `${currentOrder.notes} [Cancelled/Refunded by staff]`
          : '[Cancelled/Refunded by staff]',
      });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (detailOrder?.id === orderId) setDetailOrder(updated);
      triggerSuccessAlert(`Order #QR-ORD-${orderId} successfully cancelled and marked for refund.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to process cancellation/refund.');
    }
  };

  // Delete Order
  const handleDeleteOrder = async (orderId: number) => {
    if (window.confirm(`Are you sure you want to remove QR Order #QR-ORD-${orderId}?`)) {
      try {
        await deleteQROrder(orderId);
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        if (detailOrder?.id === orderId) setDetailOrder(null);
        triggerSuccessAlert(`Order #QR-ORD-${orderId} successfully deleted.`);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to delete order.');
      }
    }
  };

  // Open Create Drawer
  const handleOpenCreateModal = () => {
    setEditingOrder(null);
    setFieldErrors({});
    setFormGeneralError(null);
    const initialOrderId = posOrders.length > 0 ? posOrders[0].id : (orders[0]?.order_id || 1);
    const activeMerchant = Number(merchantId || 1);

    setFormData({
      merchant_id: activeMerchant,
      qr_location_id: tenantLocations[0]?.id || locations[0]?.id || 1,
      customer_id: null,
      table_id: tenantTables[0]?.id || null,
      order_id: initialOrderId,
      qr_order_status: 'PENDING',
      notes: '',
      total_amount: '35.00',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  // Open Edit Drawer
  const handleOpenEditModal = (ord: QROrder) => {
    setEditingOrder(ord);
    setFieldErrors({});
    setFormGeneralError(null);
    setFormData({
      merchant_id: ord.merchant_id,
      qr_location_id: ord.qr_location_id,
      customer_id: ord.customer_id || null,
      table_id: ord.table_id || null,
      order_id: ord.order_id,
      qr_order_status: ord.qr_order_status,
      notes: ord.notes || '',
      total_amount: ord.total_amount.toFixed(2),
      status: ord.status || 'active',
    });
    setIsModalOpen(true);
  };

  // Submit Drawer Form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormGeneralError(null);

    const amountValidation = validateTotalAmount(formData.total_amount);
    if (!amountValidation.valid) {
      setFieldErrors((prev) => ({
        ...prev,
        total_amount: amountValidation.error || 'Invalid total amount.',
      }));
      return;
    }

    const payload: CreateQROrderDto = {
      merchant_id: formData.merchant_id,
      qr_location_id: Number(formData.qr_location_id),
      customer_id: formData.customer_id ? Number(formData.customer_id) : null,
      table_id: formData.table_id ? Number(formData.table_id) : null,
      order_id: Number(formData.order_id),
      qr_order_status: formData.qr_order_status,
      notes: formData.notes.trim() || null,
      total_amount: amountValidation.parsedValue ?? 0,
      status: formData.status,
    };

    const payloadValidation = validateQROrderPayload(payload, {
      tables,
      currentStatus: editingOrder ? editingOrder.qr_order_status : undefined,
    });
    if (!payloadValidation.valid) {
      setFieldErrors(payloadValidation.fieldErrors);
      setFormGeneralError(payloadValidation.error || 'Please correct the highlighted fields.');
      return;
    }

    try {
      if (editingOrder) {
        const updated = await updateQROrder(editingOrder.id, payload);
        setOrders((prev) => prev.map((o) => (o.id === editingOrder.id ? updated : o)));
        if (detailOrder?.id === editingOrder.id) setDetailOrder(updated);
        triggerSuccessAlert(`Order #QR-ORD-${editingOrder.id} successfully updated.`);
      } else {
        const created = await createQROrder(payload);
        setOrders((prev) => [created, ...prev]);
        triggerSuccessAlert(`Order #QR-ORD-${created.id} injected into master POS.`);
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      setFormGeneralError(err instanceof Error ? err.message : 'Error submitting QR order.');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'QR_Order_ID',
      'Master_POS_Order_ID',
      'Merchant_ID',
      'Location_Name',
      'Table_Number',
      'Customer_Name',
      'QR_Order_Status',
      'Total_Amount',
      'Customer_Notes',
      'Created_At',
    ];
    const rows = filteredOrders.map((o) => [
      `QR-ORD-${o.id}`,
      `ORD-${o.order_id}`,
      o.merchant_id,
      `"${o.qrLocation?.name || ''}"`,
      `"${o.table?.number || 'N/A'}"`,
      `"${getCustomerDisplayName(o.customer)}"`,
      o.qr_order_status,
      o.total_amount.toFixed(2),
      `"${(o.notes || '').replace(/"/g, '""')}"`,
      o.created_at || '',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `qr_orders_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerSuccessAlert('Exported QR Orders directory to CSV.');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fcf9f5] font-poppins text-[#1d1c17]">
      {/* Toast Notification */}
      {actionSuccessMessage && (
        <div
          data-testid="toast-notification"
          className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-emerald-700 text-white rounded-xl shadow-xl border border-emerald-500/40 animate-slideIn"
        >
          <span className="material-symbols-outlined text-xl">check_circle</span>
          <span className="text-xs font-semibold">{actionSuccessMessage}</span>
        </div>
      )}

      {/* Main Workspace Body */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Main Workspace Header (Theme: Black, White, Red #ae001a, Poppins Font) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 font-poppins">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ae001a] text-white flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-2xl">qr_code_scanner</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-[#1d1c17] tracking-tight font-poppins">
                  QR Order Management Workspace
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20 font-poppins">
                  US-QR-ORD-01
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-poppins hidden sm:inline-block">
                  Live Dispatch Engine
                </span>
              </div>
              <p className="text-xs text-[#5f5e5e] font-medium mt-0.5 font-poppins">
                Dispatch board, master POS order injection (#ORD) and lifecycle management for incoming QR scans.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2.5 rounded-xl border border-[#e8e2d8] bg-white text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors duration-200 font-poppins"
              title="Export CSV"
            >
              <span className="material-symbols-outlined text-base">download</span>
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="w-10 h-10 rounded-xl bg-white border border-[#e8e2d8] flex items-center justify-center text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 shadow-xs"
              title="Refresh Orders"
            >
              <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>

            <button
              type="button"
              onClick={handleOpenCreateModal}
              data-testid="create-qr-order-btn"
              className="px-4 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-colors duration-200 font-poppins active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
              <span>Inject QR Order</span>
            </button>
          </div>
        </div>
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="font-bold underline hover:no-underline ml-4"
            >
              Retry
            </button>
          </div>
        )}

        {/* QR Order Operational KPI Summary Banner */}
        <section
          aria-label="QR Order Operational KPI Summary"
          data-testid="qr-kpi-summary-banner"
          className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 font-poppins"
        >
          {/* Card 1: Total QR Orders */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm hover:border-[#ae001a]/30 transition-colors duration-200">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Total QR Orders
              </span>
              <span className="material-symbols-outlined text-gray-400 text-lg">receipt_long</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#1d1c17] font-poppins">
              {metrics.totalCount}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-poppins">
              Processed today
            </div>
          </div>

          {/* Card 2: Total QR Sales Volume */}
          <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:border-emerald-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Total QR Sales Volume
              </span>
              <span className="sr-only">Total QR Volume</span>
              <span className="material-symbols-outlined text-[#10b981] text-lg">payments</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#10b981] font-poppins">
              {formatQROrderCurrency(metrics.totalSalesVolume)}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-poppins font-medium">
              Sum across active orders
            </div>
          </div>

          {/* Card 3: Pending Acceptance */}
          <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm hover:border-amber-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Pending Acceptance
              </span>
              <span className="material-symbols-outlined text-[#f59e0b] text-lg">pending_actions</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#f59e0b] font-poppins">
              {metrics.pendingCount}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-poppins font-medium">
              Awaiting staff approval
            </div>
          </div>

          {/* Card 4: Active Kitchen Orders */}
          <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-sm hover:border-blue-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-blue-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Active Kitchen Orders
              </span>
              <span className="material-symbols-outlined text-blue-600 text-lg">soup_kitchen</span>
            </div>
            <div className="text-2xl font-black font-mono text-blue-900 font-poppins">
              {metrics.activeKitchenOrders}
            </div>
            <div className="text-[11px] text-blue-600 mt-0.5 font-poppins font-medium">
              Cooking / In-Flight
            </div>
          </div>

          {/* Card 5: Served / Delivered */}
          <div className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm hover:border-purple-300 transition-colors duration-200 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Served / Delivered
              </span>
              <span className="material-symbols-outlined text-purple-600 text-lg">check_circle</span>
            </div>
            <div className="text-2xl font-black font-mono text-purple-900 font-poppins">
              {metrics.deliveredCount}
            </div>
            <div className="text-[11px] text-purple-600 mt-0.5 font-poppins font-medium">
              Delivered to table
            </div>
          </div>
        </section>

        {/* Search, Multi-Filter & View Controls */}
        <section
          aria-label="QR Orders Multi-Filter Controls"
          data-testid="qr-multi-filter-bar"
          className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e2d8] shadow-xs space-y-4 font-poppins"
        >
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Universal Search Bar */}
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-lg pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search customer name, #QR-ORD, table number, or notes..."
                aria-label="Universal Search Bar"
                className="w-full pl-10 pr-9 py-2.5 text-xs rounded-xl border border-[#e8e2d8] bg-[#fcf9f5] focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30 focus:border-[#ae001a] font-poppins text-[#1d1c17] transition-all duration-200"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200"
                  aria-label="Clear search input"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </div>

            {/* QR Location Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <label
                htmlFor="qr-location-filter"
                className="flex items-center gap-1 text-xs font-semibold text-[#5f5e5e] whitespace-nowrap font-poppins"
              >
                <span className="material-symbols-outlined text-base text-[#ae001a]">
                  location_on
                </span>
                <span>QR Location:</span>
              </label>
              <select
                id="qr-location-filter"
                data-testid="qr-location-filter"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="text-xs px-3 py-2.5 rounded-xl border border-[#e8e2d8] bg-[#fcf9f5] focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30 text-[#1d1c17] font-poppins font-medium transition-colors duration-200 cursor-pointer"
              >
                <option value="ALL">All QR Locations ({tenantLocations.length})</option>
                {tenantLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle: Table Directory vs Kanban Dispatch */}
            <div className="flex items-center p-1 bg-[#fcf9f5] border border-[#e8e2d8] rounded-xl shrink-0 self-end md:self-auto">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                data-testid="toggle-table-view"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors duration-200 font-poppins ${
                  viewMode === 'table'
                    ? 'bg-white text-[#ae001a] shadow-xs'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Table Directory View"
              >
                <span className="material-symbols-outlined text-base">table_rows</span>
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                data-testid="toggle-kanban-view"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors duration-200 font-poppins ${
                  viewMode === 'kanban'
                    ? 'bg-white text-[#ae001a] shadow-xs'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Kanban Dispatch Board"
              >
                <span className="material-symbols-outlined text-base">view_kanban</span>
                <span>Kanban</span>
              </button>
            </div>
          </div>

          {/* Bottom Filter Row: QR Order Status Filter & Status Checkboxes */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-[#e8e2d8]/60">
            {/* Multi-select QR Order Status Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider shrink-0 mr-1 font-poppins">
                QR Order Status:
              </span>
              {QR_ORDER_STATUSES.map((st) => {
                const cfg = QR_ORDER_STATUS_CONFIG[st];
                const isSelected = selectedStatuses.has(st);
                const countForStatus = orders.filter((o) => o.qr_order_status === st).length;

                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleStatusFilter(st)}
                    data-testid={`status-filter-${st.toLowerCase()}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all duration-200 shrink-0 font-poppins ${
                      isSelected
                        ? `${cfg.pillClass} border-current shadow-xs`
                        : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600 hover:border-gray-300'
                    }`}
                    aria-pressed={isSelected}
                  >
                    <span className={`w-2 h-2 rounded-full ${isSelected ? cfg.dotClass : 'bg-gray-300'}`} />
                    <span>{cfg.label}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/70 font-bold">
                      {countForStatus}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Status Checkboxes: active, inactive, archived */}
            <div className="flex items-center gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-[#e8e2d8] md:pl-4">
              <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider font-poppins shrink-0">
                Status Checkboxes:
              </span>
              <div className="flex items-center gap-2.5">
                {QR_ORDER_LOGICAL_STATUSES.map((st) => {
                  const isChecked = selectedLogicalStatuses.has(st);
                  const cfg = QR_ORDER_LOGICAL_STATUS_CONFIG[st];

                  return (
                    <label
                      key={st}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#1d1c17] cursor-pointer select-none font-poppins hover:text-[#ae001a] transition-colors duration-200"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedLogicalStatuses((prev) => {
                            const next = new Set(prev);
                            if (next.has(st)) {
                              if (next.size > 1) next.delete(st);
                            } else {
                              next.add(st);
                            }
                            return next;
                          });
                        }}
                        aria-label={`Filter by ${cfg.label} status`}
                        className="w-3.5 h-3.5 rounded border-[#e8e2d8] text-[#ae001a] focus:ring-[#ae001a]/30 accent-[#ae001a] cursor-pointer"
                      />
                      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${cfg.badgeClass}`}>
                        {cfg.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Loading Spinner */}
        {loading && (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined text-4xl text-[#ae001a] animate-spin">
              progress_activity
            </span>
            <p className="text-xs font-medium text-[#5f5e5e]">
              Synchronizing QR orders and master POS engine...
            </p>
          </div>
        )}

        {/* Content Display: Table or Kanban */}
        {!loading && (
          <>
            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#e8e2d8] p-12 text-center shadow-xs">
                <span className="material-symbols-outlined text-5xl text-[#5f5e5e]/40 mb-3">
                  inbox
                </span>
                <h3 className="text-sm font-bold text-[#1d1c17]">No QR Orders Found</h3>
                <p className="text-xs text-[#5f5e5e] max-w-sm mx-auto mt-1 mb-4">
                  No orders match your current filter and search criteria. Try modifying your filters or injecting a new QR order.
                </p>
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[#ae001a] text-white hover:bg-[#8e0015] inline-flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  <span>Inject New Order</span>
                </button>
              </div>
            ) : viewMode === 'table' ? (
              /* TABLE DIRECTORY VIEW */
              <div className="bg-white rounded-2xl border border-[#e8e2d8] shadow-xs overflow-hidden">
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left text-xs text-[#1d1c17] border-collapse">
                    <thead className="bg-[#fcf9f5] border-b border-[#e8e2d8] text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4">Order Badges</th>
                        <th className="py-3.5 px-4">Location & Table</th>
                        <th className="py-3.5 px-4">Customer</th>
                        <th className="py-3.5 px-4">Total Amount</th>
                        <th className="py-3.5 px-4">QR Order Status</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e2d8]">
                      {filteredOrders.map((ord) => {
                        const statusConfig = QR_ORDER_STATUS_CONFIG[ord.qr_order_status];
                        const nextTransitions = getNextLifecycleStatuses(ord.qr_order_status);
                        const customerName = getCustomerDisplayName(ord.customer);
                        const isGuest = customerName === 'Guest Scan';
                        const locContext = getLocationTableContext(ord.qrLocation, ord.table);

                        return (
                          <tr
                            key={ord.id}
                            className="hover:bg-[#fef9f1]/50 transition-colors group"
                            data-testid={`qr-order-row-${ord.id}`}
                          >
                            {/* Badges: #QR-ORD-{id} and #ORD-{order_id} */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex flex-col gap-1 items-start">
                                <span className="font-mono font-bold text-xs text-[#ae001a] bg-[#ae001a]/10 px-2 py-0.5 rounded-md border border-[#ae001a]/20">
                                  {formatQROrderBadge(ord.id)}
                                </span>
                                <span className="font-mono text-[11px] text-[#5f5e5e] bg-gray-100 px-1.5 py-0.5 rounded-md border border-gray-200">
                                  {formatPOSOrderBadge(ord.order_id)}
                                </span>
                              </div>
                            </td>

                            {/* Location & Table Context */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-semibold text-xs text-[#1d1c17]">
                                {locContext.locationName}
                              </div>
                              <div className="text-[11px] text-[#5f5e5e] flex items-center gap-1 mt-0.5">
                                <span className="material-symbols-outlined text-sm text-[#ae001a]">
                                  table_restaurant
                                </span>
                                <span>{locContext.tableText}</span>
                              </div>
                            </td>

                            {/* Customer Info */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                    isGuest
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    {isGuest ? 'person_outline' : 'person'}
                                  </span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-xs text-[#1d1c17]">
                                      {customerName}
                                    </span>
                                    {ord.notes && (
                                      <span
                                        className="material-symbols-outlined text-xs text-amber-600 cursor-pointer"
                                        title={`Special Note: ${ord.notes}`}
                                        onClick={() => setDetailOrder(ord)}
                                      >
                                        speaker_notes
                                      </span>
                                    )}
                                  </div>
                                  {ord.customer?.email && (
                                    <span className="text-[10px] text-[#5f5e5e] block">
                                      {ord.customer.email}
                                    </span>
                                  )}
                                  {ord.notes && (
                                    <span className="sr-only">{ord.notes}</span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Order Amount */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="font-bold text-sm text-[#1d1c17]">
                                {formatQROrderCurrency(ord.total_amount)}
                              </span>
                              <span className="block text-[10px] text-[#5f5e5e]">
                                precision: 12,2
                              </span>
                            </td>

                            {/* QR Order Status Pill */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${statusConfig.pillClass}`}
                              >
                                <span
                                  className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`}
                                />
                                <span>{statusConfig.subLabel}</span>
                              </div>
                            </td>

                            {/* Row Action Buttons */}
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                {/* Next Quick Lifecycle Transition */}
                                {nextTransitions.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAdvanceStatus(ord.id, nextTransitions[0].target)
                                    }
                                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-xs transition-colors flex items-center gap-1 ${nextTransitions[0].colorClass}`}
                                    title={nextTransitions[0].label}
                                  >
                                    <span className="material-symbols-outlined text-xs">
                                      {nextTransitions[0].icon}
                                    </span>
                                    <span>{nextTransitions[0].label}</span>
                                  </button>
                                )}

                                {/* Detail Drawer Button */}
                                <button
                                  type="button"
                                  onClick={() => setDetailOrder(ord)}
                                  className="p-1 rounded-lg border border-[#e8e2d8] text-[#5f5e5e] hover:bg-[#fef9f1] hover:text-[#ae001a] transition-colors"
                                  title="View Full Order Details"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    visibility
                                  </span>
                                </button>

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(ord)}
                                  className="p-1 rounded-lg border border-[#e8e2d8] text-[#5f5e5e] hover:bg-[#fef9f1] hover:text-[#ae001a] transition-colors"
                                  title="Edit Order"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    edit
                                  </span>
                                </button>

                                {/* Delete Button */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOrder(ord.id)}
                                  className="p-1 rounded-lg border border-[#e8e2d8] text-[#5f5e5e] hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                  title="Delete Order"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    delete
                                  </span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* KANBAN DISPATCH BOARD VIEW */
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
                {QR_ORDER_STATUSES.map((columnStatus) => {
                  const cfg = QR_ORDER_STATUS_CONFIG[columnStatus];
                  const colOrders = filteredOrders.filter(
                    (o) => o.qr_order_status === columnStatus
                  );

                  return (
                    <div
                      key={columnStatus}
                      className={`bg-white rounded-2xl border ${cfg.kanbanBorder} shadow-xs flex flex-col max-h-[800px]`}
                    >
                      {/* Column Header */}
                      <div
                        className={`p-3.5 rounded-t-2xl border-b ${cfg.kanbanBorder} ${cfg.kanbanHeaderBg} flex items-center justify-between`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${cfg.dotClass}`} />
                          <h4 className="text-xs font-bold text-[#1d1c17] tracking-tight">
                            {cfg.label}
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white shadow-xs text-[#1d1c17]">
                          {colOrders.length}
                        </span>
                      </div>

                      {/* Cards Container */}
                      <div className="p-3 space-y-3 overflow-y-auto no-scrollbar flex-1">
                        {colOrders.length === 0 ? (
                          <div className="py-8 text-center text-[11px] text-[#5f5e5e]/60 italic">
                            No orders in this stage
                          </div>
                        ) : (
                          colOrders.map((ord) => {
                            const customerName = getCustomerDisplayName(ord.customer);
                            const nextTransitions = getNextLifecycleStatuses(ord.qr_order_status);
                            const locContext = getLocationTableContext(ord.qrLocation, ord.table);

                            return (
                              <div
                                key={ord.id}
                                className="bg-[#fcf9f5] border border-[#e8e2d8] rounded-xl p-3 shadow-xs hover:border-[#ae001a]/40 transition-all space-y-2.5"
                                data-testid={`kanban-card-${ord.id}`}
                              >
                                {/* Card Header: Badges & Amount */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono font-bold text-xs text-[#ae001a] bg-[#ae001a]/10 px-1.5 py-0.5 rounded border border-[#ae001a]/20">
                                      {formatQROrderBadge(ord.id)}
                                    </span>
                                    <span className="font-mono text-[10px] text-[#5f5e5e] bg-gray-100 px-1 py-0.5 rounded border border-gray-200">
                                      {formatPOSOrderBadge(ord.order_id)}
                                    </span>
                                  </div>
                                  <span className="font-bold text-xs text-[#1d1c17]">
                                    {formatQROrderCurrency(ord.total_amount)}
                                  </span>
                                </div>

                                {/* Location & Table */}
                                <div className="text-[11px] text-[#1d1c17] font-semibold flex items-center gap-1">
                                  <span className="material-symbols-outlined text-sm text-[#ae001a]">
                                    storefront
                                  </span>
                                  <span className="truncate">{locContext.locationName}</span>
                                </div>
                                <div className="text-[10px] text-[#5f5e5e] flex items-center gap-1">
                                  <span className="material-symbols-outlined text-xs">
                                    table_restaurant
                                  </span>
                                  <span>{locContext.tableText}</span>
                                </div>

                                {/* Customer Info */}
                                <div className="text-[11px] flex items-center gap-1.5 pt-1 border-t border-[#e8e2d8]">
                                  <span className="material-symbols-outlined text-sm text-[#5f5e5e]">
                                    person
                                  </span>
                                  <span className="font-medium text-[#1d1c17] truncate">
                                    {customerName}
                                  </span>
                                </div>

                                {/* Special Notes Preview */}
                                {ord.notes && (
                                  <div className="text-[10px] bg-amber-500/10 text-amber-900 border border-amber-500/20 p-2 rounded-lg line-clamp-2">
                                    <span className="font-bold block text-[9px] uppercase tracking-wider text-amber-700">
                                      Special Note:
                                    </span>
                                    {ord.notes}
                                  </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[#e8e2d8]">
                                  <button
                                    type="button"
                                    onClick={() => setDetailOrder(ord)}
                                    className="text-[10px] font-bold text-[#ae001a] hover:underline"
                                  >
                                    View Details
                                  </button>

                                  <div className="flex items-center gap-1">
                                    {nextTransitions.map((tr) => (
                                      <button
                                        key={tr.target}
                                        type="button"
                                        onClick={() => handleAdvanceStatus(ord.id, tr.target)}
                                        className={`px-2 py-1 rounded text-[10px] font-bold shadow-xs transition-colors ${tr.colorClass}`}
                                        title={tr.label}
                                      >
                                        {tr.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* DETAIL SIDE DRAWER (Inspect and process individual QR orders) */}
      {detailOrder && typeof document !== 'undefined' && createPortal(
        <div
          data-testid="qr-order-detail-drawer"
          className="fixed inset-0 z-[9999] font-poppins"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setDetailOrder(null)}
          />
          <div className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] max-w-full bg-white shadow-2xl border-l border-[#e8e2d8] flex flex-col z-10 overflow-y-auto">
            {/* Drawer Header */}
            <div className="px-6 py-5 bg-[#fcf9f5] border-b border-[#e8e2d8] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-[#ae001a]">
                    {formatQROrderBadge(detailOrder.id)}
                  </span>
                  <span className="font-mono text-xs text-[#5f5e5e] bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                    {formatPOSOrderBadge(detailOrder.order_id)}
                  </span>
                </div>
                <p className="text-xs text-[#5f5e5e] mt-1">
                  QR scan transactional header & POS linkage
                </p>
              </div>

              <button
                type="button"
                data-testid="close-detail-drawer-btn"
                onClick={() => setDetailOrder(null)}
                className="p-1.5 rounded-lg text-[#5f5e5e] hover:bg-white transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 p-6 space-y-5 overflow-y-auto">
              {/* Lifecycle Status Pill */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block">
                    Current Lifecycle Status
                  </span>
                  {detailOrder.qr_order_status === 'DELIVERED' && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Completed / Terminal
                    </span>
                  )}
                </div>
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                    QR_ORDER_STATUS_CONFIG[detailOrder.qr_order_status].pillClass
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      QR_ORDER_STATUS_CONFIG[detailOrder.qr_order_status].dotClass
                    }`}
                  />
                  <span className="font-bold text-xs">
                    {QR_ORDER_STATUS_CONFIG[detailOrder.qr_order_status].subLabel}
                  </span>
                </div>
              </div>

              {/* KDS Kitchen Dispatch Automation Banner */}
              {(detailOrder.qr_order_status === 'CONFIRMED' ||
                detailOrder.qr_order_status === 'IN_PREPARATION') && (
                <div
                  data-testid="kds-routing-banner"
                  className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-900 flex items-start gap-2.5 animate-fadeIn"
                >
                  <span className="material-symbols-outlined text-blue-600 text-xl mt-0.5 shrink-0">
                    soup_kitchen
                  </span>
                  <div>
                    <div className="font-bold text-xs text-blue-900 flex items-center gap-1.5">
                      <span>⚡ Routed to KDS Kitchen Stations</span>
                      <span className="bg-blue-600 text-white text-[9px] font-mono px-1.5 py-0.2 rounded-full uppercase">
                        Active Prep
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800/90 mt-0.5 leading-snug">
                      Order line items automatically dispatched to Kitchen Display System screens for food preparation.
                    </p>
                  </div>
                </div>
              )}

              {/* Pending Acceptance Action Callout */}
              {detailOrder.qr_order_status === 'PENDING' && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-lg mt-0.5 shrink-0">
                      pending_actions
                    </span>
                    <div>
                      <div className="font-bold text-xs text-amber-900">Awaiting Staff Approval</div>
                      <p className="text-[11px] text-amber-800/90 mt-0.5">
                        Accepting routes items to KDS Kitchen screens.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="drawer-accept-order-btn"
                    onClick={() => handleAdvanceStatus(detailOrder.id, 'CONFIRMED')}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    <span>Accept Order</span>
                  </button>
                </div>
              )}

              {/* Monetary Breakdown */}
              <div className="bg-[#fcf9f5] border border-[#e8e2d8] rounded-2xl p-4">
                <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block mb-1">
                  Total Monetary Value (precision: 12, scale: 2)
                </span>
                <div className="text-2xl font-bold text-[#1d1c17]">
                  {formatQROrderCurrency(detailOrder.total_amount)}
                </div>
                <div className="text-[11px] text-[#5f5e5e] mt-1">
                  Stored as exact numeric precision 12 with scale 2 in TypeORM database.
                </div>
              </div>

              {/* Special Customer Request Notes (High Prominence) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block">
                    Special Customer Request Notes
                  </span>
                  {detailOrder.notes && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                      Expeditor Priority Flag
                    </span>
                  )}
                </div>
                {detailOrder.notes ? (
                  <div
                    data-testid="drawer-customer-notes-callout"
                    className="p-4 rounded-xl bg-amber-500/15 border-2 border-amber-500/30 text-amber-950 text-xs shadow-xs"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5 font-bold text-amber-900 text-xs">
                      <span className="material-symbols-outlined text-amber-700 text-base">warning</span>
                      <span className="uppercase tracking-wider">⚠️ Special Preparation & Allergy Instruction</span>
                    </div>
                    <p className="font-semibold text-[13px] leading-relaxed text-amber-950 font-poppins">
                      {detailOrder.notes}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No customer notes attached.</p>
                )}
              </div>

              {/* Direct Table Binding Adjustment */}
              <div className="p-3.5 rounded-xl bg-[#fcf9f5] border border-[#e8e2d8] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#5f5e5e] font-bold uppercase tracking-wider">
                    Adjust Table Binding
                  </span>
                  <span className="text-[10px] text-gray-500 font-medium">
                    {detailOrder.table ? `Current: #${detailOrder.table.number}` : 'No Table Seating'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={drawerTableId}
                    onChange={(e) => setDrawerTableId(e.target.value)}
                    data-testid="drawer-table-selector"
                    aria-label="Adjust Dining Table Binding"
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-[#e8e2d8] bg-white focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30"
                  >
                    <option value="">No Table (Counter / Pickup)</option>
                    {tables
                      .filter((t) => !t.merchant_id || Number(t.merchant_id) === Number(detailOrder.merchant_id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          Table #{t.number} ({t.zone_name || 'Floor'})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    data-testid="drawer-update-table-btn"
                    onClick={() => handleSaveDrawerTable(detailOrder.id)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-[#1d1c17] hover:bg-black text-white shrink-0 shadow-2xs"
                  >
                    Save Table
                  </button>
                </div>
              </div>

              {/* Location & Dining Table Relational Context */}
              <div className="space-y-3 pt-3 border-t border-[#e8e2d8]">
                <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block">
                  Relational Bindings
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#fcf9f5] border border-[#e8e2d8]">
                    <span className="text-[10px] text-[#5f5e5e] block font-semibold">
                      QR Location
                    </span>
                    <span className="font-bold text-[#1d1c17] mt-0.5 block">
                      {detailOrder.qrLocation?.name || `#LOC-${detailOrder.qr_location_id}`}
                    </span>
                    <span className="text-[10px] text-[#5f5e5e]">
                      ID: {detailOrder.qr_location_id}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#fcf9f5] border border-[#e8e2d8]">
                    <span className="text-[10px] text-[#5f5e5e] block font-semibold">
                      Dining Table
                    </span>
                    <span className="font-bold text-[#1d1c17] mt-0.5 block">
                      {detailOrder.table?.number ? `Table #${detailOrder.table.number}` : 'None (Counter/Pickup)'}
                    </span>
                    {detailOrder.table_id && (
                      <span className="text-[10px] text-[#5f5e5e]">
                        Table ID: {detailOrder.table_id}
                      </span>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-[#fcf9f5] border border-[#e8e2d8]">
                    <span className="text-[10px] text-[#5f5e5e] block font-semibold">
                      Customer
                    </span>
                    <span className="font-bold text-[#1d1c17] mt-0.5 block">
                      {getCustomerDisplayName(detailOrder.customer)}
                    </span>
                    {detailOrder.customer_id && (
                      <span className="text-[10px] text-[#5f5e5e]">
                        Cust ID: {detailOrder.customer_id}
                      </span>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-[#fcf9f5] border border-[#e8e2d8]">
                    <span className="text-[10px] text-[#5f5e5e] block font-semibold">
                      Master POS Order
                    </span>
                    <span className="font-bold text-[#1d1c17] mt-0.5 block">
                      {formatPOSOrderBadge(detailOrder.order_id)}
                    </span>
                    <span className="text-[10px] text-[#5f5e5e]">
                      POS Ref ID: {detailOrder.order_id}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timestamps & Logical Status */}
              <div className="pt-3 border-t border-[#e8e2d8] text-[11px] text-[#5f5e5e] space-y-1">
                <div>
                  <span className="font-semibold">Logical Status:</span>{' '}
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      QR_ORDER_LOGICAL_STATUS_CONFIG[detailOrder.status as keyof typeof QR_ORDER_LOGICAL_STATUS_CONFIG]?.badgeClass ||
                      'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {detailOrder.status}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">Created:</span>{' '}
                  {detailOrder.created_at ? new Date(detailOrder.created_at).toLocaleString() : 'N/A'}
                </div>
                <div>
                  <span className="font-semibold">Last Updated:</span>{' '}
                  {detailOrder.updated_at ? new Date(detailOrder.updated_at).toLocaleString() : 'N/A'}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-5 bg-[#fcf9f5] border-t border-[#e8e2d8] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider block">
                  Advance Order Lifecycle
                </span>
                {detailOrder.qr_order_status === 'DELIVERED' && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    Terminal State
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {QR_ORDER_STATUSES.map((st) => {
                  const cfg = QR_ORDER_STATUS_CONFIG[st];
                  const isCurrent = detailOrder.qr_order_status === st;
                  const transitionCheck = canTransitionStatus(detailOrder.qr_order_status, st);
                  const isAllowed = !isCurrent && transitionCheck.allowed;

                  return (
                    <button
                      key={st}
                      type="button"
                      data-testid={`drawer-status-btn-${st.toLowerCase()}`}
                      disabled={isCurrent || !isAllowed}
                      title={
                        isCurrent
                          ? `Order is currently ${st}`
                          : !isAllowed
                          ? transitionCheck.reason
                          : `Move order to ${st}`
                      }
                      onClick={() => handleAdvanceStatus(detailOrder.id, st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                        isCurrent
                          ? 'bg-gray-100 text-gray-500 border-gray-300 font-black ring-1 ring-gray-300'
                          : !isAllowed
                          ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed opacity-40'
                          : `${cfg.pillClass} hover:opacity-90 shadow-2xs`
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isAllowed ? cfg.dotClass : 'bg-gray-300'}`} />
                      <span>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>

              {detailOrder.qr_order_status === 'DELIVERED' && (
                <p className="text-[10px] text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 font-medium">
                  ✓ Order has been delivered to customer. Lifecycle status cannot be reverted directly to PENDING or earlier phases.
                </p>
              )}

              {/* Actions row: Print Chit, Edit, Cancel/Refund, Delete */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  data-testid="print-kitchen-ticket-btn"
                  onClick={() => setTicketPrintOrder(detailOrder)}
                  className="w-full py-2 px-3 text-xs font-bold rounded-xl border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                >
                  <span className="material-symbols-outlined text-base text-[#ae001a]">receipt_long</span>
                  <span>Kitchen Expeditor Ticket (Print Chit)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(detailOrder)}
                    className="flex-1 py-2 text-xs font-bold rounded-xl border border-[#e8e2d8] bg-white text-[#1d1c17] hover:bg-gray-50 flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-base">edit</span>
                    <span>Edit Order</span>
                  </button>

                  <button
                    type="button"
                    data-testid="drawer-cancel-refund-btn"
                    disabled={detailOrder.qr_order_status === 'CANCELLED'}
                    onClick={() => handleCancelOrRefund(detailOrder.id)}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center gap-1 ${
                      detailOrder.qr_order_status === 'CANCELLED'
                        ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">assignment_return</span>
                    <span>Cancel / Refund</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteOrder(detailOrder.id)}
                    className="px-3 py-2 text-xs font-bold rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ADD / EDIT QR ORDER DRAWER (Slide-Over Right Panel) */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] font-poppins"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setIsModalOpen(false)}
          />
          <div
            data-testid="add-edit-qr-order-drawer"
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[560px] max-w-full bg-white shadow-2xl border-l border-[#e8e2d8] flex flex-col overflow-hidden z-10"
          >
            {/* Drawer Header */}
            <div className="px-6 py-5 bg-[#fcf9f5] border-b border-[#e8e2d8] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1d1c17]">
                  {editingOrder ? `Edit Order #QR-ORD-${editingOrder.id}` : 'Inject New QR Order'}
                </h3>
                <p className="text-xs text-[#5f5e5e] mt-0.5">
                  Configure order header, POS bindings, customer notes, and monetary precision.
                </p>
              </div>
              <button
                type="button"
                data-testid="close-add-edit-drawer-btn"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-[#5f5e5e] hover:bg-white"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleFormSubmit} className="flex-1 p-6 space-y-4 overflow-y-auto">
              {formGeneralError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-base shrink-0">error</span>
                  <span>{formGeneralError}</span>
                </div>
              )}

              {/* Master POS Order ID & Merchant Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                    Master POS Order ID *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-gray-400">
                      #ORD-
                    </span>
                    <input
                      type="number"
                      value={formData.order_id || ''}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, order_id: parseInt(e.target.value, 10) || 0 }))
                      }
                      className={`w-full pl-14 pr-3 py-2 text-xs rounded-xl border ${
                        fieldErrors.order_id ? 'border-rose-400 bg-rose-50/30' : 'border-[#e8e2d8]'
                      } focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30 font-mono`}
                      placeholder="1"
                      list="pos-orders-list"
                      required
                    />
                    <datalist id="pos-orders-list">
                      {posOrders.map((po) => (
                        <option key={po.id} value={po.id}>
                          Order #{po.order_number || po.id}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  {fieldErrors.order_id && (
                    <span className="text-[10px] text-rose-600 mt-1 block">
                      {fieldErrors.order_id}
                    </span>
                  )}
                  {posOrders.length > 0 && !fieldErrors.order_id && (
                    <span className="text-[10px] text-gray-400 mt-1 block font-mono">
                      Active POS Orders available (e.g. #{posOrders[0].id})
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                    Merchant Selector *
                  </label>
                  <select
                    value={formData.merchant_id}
                    onChange={(e) => {
                      const newMerchantId = parseInt(e.target.value, 10);
                      const mTables = tables.filter(
                        (t) => !t.merchant_id || Number(t.merchant_id) === newMerchantId
                      );
                      const mLocs = locations.filter(
                        (l) => !l.merchant_id || Number(l.merchant_id) === newMerchantId
                      );
                      setFormData((p) => ({
                        ...p,
                        merchant_id: newMerchantId,
                        table_id: mTables.length > 0 ? (mTables.some((t) => t.id === p.table_id) ? p.table_id : mTables[0].id) : null,
                        qr_location_id: mLocs.length > 0 ? (mLocs.some((l) => l.id === p.qr_location_id) ? p.qr_location_id : mLocs[0].id) : (p.qr_location_id || 1),
                      }));
                    }}
                    data-testid="form-merchant-selector"
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      fieldErrors.merchant_id ? 'border-rose-400 bg-rose-50/30' : 'border-[#e8e2d8]'
                    } focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30`}
                    required
                  >
                    {merchants.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (#{m.id})
                      </option>
                    ))}
                  </select>
                  {fieldErrors.merchant_id && (
                    <span className="text-[10px] text-rose-600 mt-1 block">
                      {fieldErrors.merchant_id}
                    </span>
                  )}
                </div>
              </div>

              {/* QR Location & Dining Table Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                    QR Location Selector *
                  </label>
                  <select
                    value={formData.qr_location_id}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, qr_location_id: parseInt(e.target.value, 10) }))
                    }
                    data-testid="form-qr-location-selector"
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      fieldErrors.qr_location_id ? 'border-rose-400 bg-rose-50/30' : 'border-[#e8e2d8]'
                    } focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30`}
                    required
                  >
                    {modalTenantLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.qr_location_id && (
                    <span className="text-[10px] text-rose-600 mt-1 block">
                      {fieldErrors.qr_location_id}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                    Dining Table Selector (Optional)
                  </label>
                  <select
                    value={formData.table_id || ''}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        table_id: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                    data-testid="form-table-selector"
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      fieldErrors.table_id ? 'border-rose-400 bg-rose-50/30' : 'border-[#e8e2d8]'
                    } focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30`}
                  >
                    <option value="">No Table (Pickup / Counter)</option>
                    {modalTenantTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table #{t.number} ({t.zone_name || 'Floor'})
                      </option>
                    ))}
                  </select>
                  {fieldErrors.table_id && (
                    <span className="text-[10px] text-rose-600 mt-1 block">
                      {fieldErrors.table_id}
                    </span>
                  )}
                </div>
              </div>

              {/* Customer & Total Amount Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                    Customer Selector
                  </label>
                  <select
                    value={formData.customer_id || ''}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        customer_id: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                    data-testid="form-customer-selector"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#e8e2d8] focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30"
                  >
                    <option value="">Guest Scan (Unregistered)</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                    Total Amount ($) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
                      $
                    </span>
                    <input
                      type="text"
                      value={formData.total_amount}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, total_amount: e.target.value }))
                      }
                      placeholder="0.00"
                      className={`w-full pl-7 pr-3 py-2 text-xs rounded-xl border ${
                        fieldErrors.total_amount ? 'border-rose-400 bg-rose-50/30' : 'border-[#e8e2d8]'
                      } focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30 font-semibold`}
                      required
                    />
                  </div>
                  {fieldErrors.total_amount ? (
                    <span className="text-[10px] text-rose-600 mt-1 block">
                      {fieldErrors.total_amount}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#5f5e5e] mt-1 block">
                      Numeric precision: 12, scale: 2 (e.g. 48.50)
                    </span>
                  )}
                </div>
              </div>

              {/* QR Order Status & Logical Status Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                    QR Order Status *
                  </label>
                  <select
                    value={formData.qr_order_status}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        qr_order_status: e.target.value as QROrderStatus,
                      }))
                    }
                    data-testid="form-qr-order-status"
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      fieldErrors.qr_order_status ? 'border-rose-400 bg-rose-50/30' : 'border-[#e8e2d8]'
                    } focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30`}
                    required
                  >
                    {QR_ORDER_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {QR_ORDER_STATUS_CONFIG[st].label} ({QR_ORDER_STATUS_CONFIG[st].subLabel})
                      </option>
                    ))}
                  </select>
                  {fieldErrors.qr_order_status && (
                    <span className="text-[10px] text-rose-600 mt-1 block font-medium">
                      {fieldErrors.qr_order_status}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                    Status Selector *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
                    data-testid="form-status-selector"
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      fieldErrors.status ? 'border-rose-400 bg-rose-50/30' : 'border-[#e8e2d8]'
                    } focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30`}
                    required
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                  {fieldErrors.status && (
                    <span className="text-[10px] text-rose-600 mt-1 block">
                      {fieldErrors.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Customer Notes */}
              <div>
                <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                  Customer Notes (Preparation Instructions)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="e.g. Extra lime, allergic to shellfish, serve dessert later..."
                  rows={3}
                  data-testid="form-customer-notes"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#e8e2d8] focus:outline-none focus:ring-2 focus:ring-[#ae001a]/30"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-4 border-t border-[#e8e2d8] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#e8e2d8] text-[#5f5e5e] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="submit-qr-order-btn"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-[#ae001a] text-white hover:bg-[#8e0015] shadow-xs"
                >
                  {editingOrder ? 'Save Changes' : 'Inject QR Order'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* KITCHEN EXPEDITOR TICKET PREVIEW MODAL (Printout) */}
      {ticketPrintOrder && typeof document !== 'undefined' && createPortal(
        <div
          data-testid="kitchen-expeditor-ticket-modal"
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTicketPrintOrder(null);
          }}
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col font-mono text-[#111]">
            <div className="px-5 py-3.5 bg-[#1d1c17] text-white flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#ae001a]">receipt_long</span>
                <span>Kitchen Expeditor Ticket</span>
              </span>
              <button
                type="button"
                data-testid="close-ticket-modal-btn"
                onClick={() => setTicketPrintOrder(null)}
                className="text-gray-400 hover:text-white"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs bg-[#fdfdfd]">
              <div className="text-center border-b border-dashed border-gray-400 pb-3">
                <h4 className="font-black text-sm uppercase tracking-widest text-[#1d1c17]">
                  X7 POINT OF SALE
                </h4>
                <p className="text-[11px] text-gray-600 uppercase mt-0.5 font-bold">
                  Kitchen Station Dispatch Chit
                </p>
                <div className="text-[10px] text-gray-500 mt-1">
                  {ticketPrintOrder.created_at
                    ? new Date(ticketPrintOrder.created_at).toLocaleString()
                    : new Date().toLocaleString()}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs font-bold border-b border-gray-200 pb-2">
                <span>ORDER: {formatQROrderBadge(ticketPrintOrder.id)}</span>
                <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-300 text-gray-700">
                  {formatPOSOrderBadge(ticketPrintOrder.order_id)}
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div>
                  <span className="font-bold text-gray-700">LOCATION: </span>
                  <span>{ticketPrintOrder.qrLocation?.name || `#LOC-${ticketPrintOrder.qr_location_id}`}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">TABLE: </span>
                  <span className="font-bold">
                    {ticketPrintOrder.table?.number
                      ? `TABLE #${ticketPrintOrder.table.number}`
                      : 'COUNTER / PICKUP'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">GUEST: </span>
                  <span>{getCustomerDisplayName(ticketPrintOrder.customer).toUpperCase()}</span>
                </div>
              </div>

              {/* HIGH PROMINENCE PREPARATION INSTRUCTIONS / ALLERGY BOX */}
              <div
                data-testid="ticket-special-notes-box"
                className="border-2 border-black p-3 bg-amber-50 rounded"
              >
                <div className="text-[10px] font-black uppercase text-amber-900 flex items-center gap-1 mb-1">
                  <span className="material-symbols-outlined text-xs text-amber-700">warning</span>
                  <span>*** SPECIAL PREPARATION & ALLERGIES ***</span>
                </div>
                <div className="font-black text-xs text-black leading-snug">
                  {ticketPrintOrder.notes ? ticketPrintOrder.notes : 'NO SPECIAL NOTES'}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs border-t border-dashed border-gray-400 pt-3 font-bold">
                <span>TOTAL AMOUNT:</span>
                <span className="text-sm font-black">
                  {formatQROrderCurrency(ticketPrintOrder.total_amount)}
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  data-testid="print-chit-btn"
                  onClick={() => window.print()}
                  className="flex-1 py-2 bg-[#1d1c17] hover:bg-black text-white font-bold text-xs rounded uppercase flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  <span>Print Ticket</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTicketPrintOrder(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 font-bold text-xs rounded hover:bg-gray-100 uppercase"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
