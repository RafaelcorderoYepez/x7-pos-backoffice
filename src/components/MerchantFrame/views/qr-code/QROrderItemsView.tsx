import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  POSOrderItemRef,
  QRMenuItemRef,
  QROrderItem,
  QROrderItemStatus,
  QROrderRef,
} from '../../../../types/qr-order-item';
import {
  QR_ORDER_ITEM_STATUS_CONFIG,
  QR_ORDER_ITEM_STATUSES,
} from '../../../../types/qr-order-item';
import {
  deleteQROrderItem,
  fetchAvailablePOSOrderItems,
  fetchAvailableQRMenuItems,
  fetchAvailableQROrders,
  getQROrderItems,
  updateQROrderItem,
} from '../../../../api/qr-order-items';
import {
  aggregateQROrderItemMetrics,
  filterQROrderItems,
  formatCurrency,
  formatPOSOrderItemBadge,
  formatQROrderBadge,
  formatQROrderItemBadge,
  formatQuantityBadge,
} from '../../../../lib/qr-order-item';
import { QROrderItemDrawer } from './QROrderItemDrawer';

interface QROrderItemsViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

export const QROrderItemsView: React.FC<QROrderItemsViewProps> = ({
  onNavigate,
  merchantId = 3,
}) => {
  const [items, setItems] = useState<QROrderItem[]>([]);
  const [orders, setOrders] = useState<QROrderRef[]>([]);
  const [menuItems, setMenuItems] = useState<QRMenuItemRef[]>([]);
  const [posItems, setPosItems] = useState<POSOrderItemRef[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    new Set(QR_ORDER_ITEM_STATUSES)
  );
  const [parentOrderFilter, setParentOrderFilter] = useState<string>('ALL');
  const [menuItemFilter, setMenuItemFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'kds'>('table');

  // Detail Chit / Receipt Modal state
  const [detailItem, setDetailItem] = useState<QROrderItem | null>(null);

  // Floor Expeditor & POS Cashier Detail Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<QROrderItem | null>(null);

  // Load line items and reference relations
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [fetchedItems, fetchedOrders, fetchedMenuItems, fetchedPosItems] =
        await Promise.all([
          getQROrderItems(merchantId),
          fetchAvailableQROrders(merchantId),
          fetchAvailableQRMenuItems(merchantId),
          fetchAvailablePOSOrderItems(),
        ]);
      setItems(fetchedItems);
      setOrders(fetchedOrders);
      setMenuItems(fetchedMenuItems);
      setPosItems(fetchedPosItems);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load QR order line items.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-clear success toast after 4s
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return filterQROrderItems(items, {
      searchTerm,
      statuses: selectedStatuses,
      qrOrderId: parentOrderFilter,
      qrMenuItemId: menuItemFilter,
    });
  }, [items, searchTerm, selectedStatuses, parentOrderFilter, menuItemFilter]);

  // Cascade Recalculation Listener: Keep parent order totals synchronized across the UI
  useEffect(() => {
    const handleRecalculation = (e: Event) => {
      const customEvent = e as CustomEvent<{ qr_order_id: number; total_amount: number }>;
      if (!customEvent.detail) return;
      const { qr_order_id, total_amount } = customEvent.detail;
      setOrders((prev) =>
        prev.map((o) => (o.id === qr_order_id ? { ...o, total_amount } : o))
      );
    };

    window.addEventListener('qr-order-total-recalculated', handleRecalculation);
    return () => {
      window.removeEventListener('qr-order-total-recalculated', handleRecalculation);
    };
  }, []);

  // Aggregated KPI Metrics
  const metrics = useMemo(() => {
    return aggregateQROrderItemMetrics(items);
  }, [items]);

  // Open drawer in Create mode
  const handleOpenCreate = () => {
    setEditingItem(null);
    setIsDrawerOpen(true);
  };

  // Open drawer in Edit mode
  const handleOpenEdit = (item: QROrderItem) => {
    setEditingItem(item);
    setIsDrawerOpen(true);
  };

  // Callback on successful create / edit in QROrderItemDrawer
  const handleDrawerSuccess = (saved: QROrderItem, newParentTotal?: number) => {
    if (editingItem) {
      setItems((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setSuccessToast(`✓ Updated line item ${formatQROrderItemBadge(saved.id)} successfully.`);
    } else {
      setItems((prev) => [saved, ...prev]);
      setSuccessToast(`✓ Created line item ${formatQROrderItemBadge(saved.id)} successfully.`);
    }

    if (newParentTotal !== undefined) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === saved.qr_order_id ? { ...o, total_amount: newParentTotal } : o
        )
      );
    }
  };

  // Handle Quick Status Change
  const handleStatusToggle = async (item: QROrderItem, newStatus: QROrderItemStatus) => {
    try {
      const updated = await updateQROrderItem(item.id, { status: newStatus });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setSuccessToast(`Line item ${formatQROrderItemBadge(item.id)} marked as ${newStatus}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status.';
      setError(msg);
    }
  };

  // Handle Delete
  const handleDeleteItem = async (item: QROrderItem) => {
    if (!window.confirm(`Are you sure you want to remove line item ${formatQROrderItemBadge(item.id)}?`)) {
      return;
    }
    try {
      await deleteQROrderItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSuccessToast(`Line item ${formatQROrderItemBadge(item.id)} deleted.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete line item.';
      setError(msg);
    }
  };

  // Handle Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Line Item ID',
      'Parent QR Order ID',
      'Master POS Item ID',
      'Dish Name',
      'Quantity',
      'Unit Price',
      'Subtotal Price',
      'Status',
      'Preparation Notes',
    ];

    const rows = filteredItems.map((item) => [
      formatQROrderItemBadge(item.id),
      formatQROrderBadge(item.qr_order_id),
      formatPOSOrderItemBadge(item.order_item_id),
      `"${(item.qrMenuItem?.name || 'Dish').replace(/"/g, '""')}"`,
      item.quantity,
      item.unit_price.toFixed(2),
      item.subtotal_price.toFixed(2),
      item.status,
      `"${(item.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `qr_order_items_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fcf9f5] font-poppins text-[#1d1c17]">
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6 pb-24">
        {/* Workspace Header (Theme: Black, White, Red #ae001a, Poppins Font) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 font-poppins">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ae001a] text-white flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-2xl">receipt_long</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-[#1d1c17] tracking-tight font-poppins">
                  QR Order Item Line-Item Breakdown
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20 font-poppins">
                  US-QR-ORI-01
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-poppins hidden sm:inline-block">
                  Kitchen Expeditor • POS Cashier • Financial Auditor Workspace
                </span>
              </div>
              <p className="text-xs text-[#5f5e5e] font-medium mt-0.5 font-poppins">
                Track individual dishes and beverages requested in QR orders, verify quantities, monitor monetary precision (12, 2), and inspect dish-level prep notes.
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
              data-testid="create-line-item-btn"
              onClick={handleOpenCreate}
              className="px-4 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-colors duration-200 font-poppins active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span>New Line Item</span>
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {successToast && (
          <div
            data-testid="success-toast"
            className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-lg">check_circle</span>
              <span>{successToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessToast(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            data-testid="error-alert"
            className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600 text-lg">error</span>
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-700 hover:text-rose-900"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Top Operational & Financial KPI Cards Banner */}
        <div data-testid="operational-kpi-banner" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Card 1: Total Line Items Processed */}
          <div
            data-testid="kpi-total-lines-processed"
            className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm hover:border-[#ae001a]/30 transition-colors duration-200"
          >
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Total Line Items</span>
              <span className="material-symbols-outlined text-gray-400 text-lg">format_list_bulleted</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#1d1c17] font-poppins">{metrics.totalLinesProcessed}</div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-poppins">Total Line Items Processed</div>
          </div>

          {/* Card 2: Total Items Sold */}
          <div
            data-testid="kpi-total-items-sold"
            className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:border-emerald-300 transition-colors duration-200"
          >
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Total Items Sold</span>
              <span className="material-symbols-outlined text-[#10b981] text-lg">exposure_plus_1</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#10b981] font-poppins">{metrics.totalItemsSold}</div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-poppins">
              <span>Total Portions</span>: {metrics.totalPortions}
            </div>
          </div>

          {/* Card 3: Average Items per Order */}
          <div
            data-testid="kpi-average-items-per-order"
            className="bg-white rounded-2xl p-4 border border-blue-200 shadow-sm hover:border-blue-300 transition-colors duration-200"
          >
            <div className="flex items-center justify-between text-blue-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Avg Items / Order</span>
              <span className="material-symbols-outlined text-blue-600 text-lg">receipt</span>
            </div>
            <div className="text-2xl font-black font-mono text-blue-900 font-poppins">{metrics.averageItemsPerOrder}</div>
            <div className="text-[11px] text-blue-600 mt-0.5 font-poppins">Average Items per Order</div>
          </div>

          {/* Card 4: Special Instructions Ratio */}
          <div
            data-testid="kpi-special-instructions-ratio"
            className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm hover:border-purple-300 transition-colors duration-200"
          >
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Notes Ratio</span>
              <span className="material-symbols-outlined text-purple-600 text-lg">speaker_notes</span>
            </div>
            <div className="text-2xl font-black font-mono text-purple-900 font-poppins">{metrics.specialInstructionsRatio}%</div>
            <div className="text-[11px] text-purple-600 mt-0.5 font-poppins">Special Instructions Ratio</div>
          </div>

          {/* Card 5: Voided Line Items (Voided / On Hold) */}
          <div
            data-testid="kpi-voided-items"
            className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm hover:border-amber-300 transition-colors duration-200"
          >
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Voided / On Hold</span>
              <span className="material-symbols-outlined text-[#f59e0b] text-lg">pause_circle</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#f59e0b] font-poppins">{metrics.inactiveCount}</div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-poppins">
              <span>Valid Line Items</span>: {metrics.activeCount}
            </div>
          </div>

          {/* Card 6: Active Gross Volume */}
          <div
            data-testid="kpi-active-gross-volume"
            className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm bg-gradient-to-br from-white to-amber-50/30 hover:border-[#ae001a]/30 transition-colors duration-200"
          >
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Active Gross Volume</span>
              <span className="material-symbols-outlined text-amber-600 text-lg">attach_money</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#ae001a] tracking-tight font-poppins">
              {formatCurrency(metrics.activeGrossTotal)}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-poppins">
              <span>Removed / Archived</span>: {metrics.archivedCount}
            </div>
          </div>
        </div>

        {/* Search & Filter Controls Bar */}
        <div className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm space-y-3.5">
          {/* Row 1: Universal Search Bar, Parent Order Filter, Menu Item Filter */}
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Universal Search Bar */}
            <div className="relative flex-1 w-full">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-lg">
                search
              </span>
              <input
                type="text"
                data-testid="universal-search-input"
                placeholder="Search dish name, notes, #QR-ORI, #QR-ORD, or #POS-ORI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 focus:border-[#ae001a] font-poppins transition-colors duration-200"
              />
              {searchTerm && (
                <button
                  type="button"
                  data-testid="clear-search-btn"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            {/* Parent QR Order Filter */}
            <div className="shrink-0 w-full md:w-52">
              <select
                id="parent-order-filter"
                data-testid="parent-order-filter"
                value={parentOrderFilter}
                onChange={(e) => setParentOrderFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 font-poppins transition-colors duration-200"
              >
                <option value="ALL">All Parent QR Orders</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {formatQROrderBadge(order.id)} ({order.table?.number ? `Table #${order.table.number}` : 'No Table'})
                  </option>
                ))}
              </select>
            </div>

            {/* Catalog Menu Item Filter */}
            <div className="shrink-0 w-full md:w-56">
              <select
                id="menu-item-filter"
                data-testid="menu-item-filter"
                value={menuItemFilter}
                onChange={(e) => setMenuItemFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 font-poppins transition-colors duration-200"
              >
                <option value="ALL">All Menu Catalog Items</option>
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    #{m.id} - {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Status Checkboxes, View Mode Toggle, Clear Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-[#f2eee9]">
            {/* Status Checkboxes */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider font-poppins">
                Status:
              </span>
              {QR_ORDER_ITEM_STATUSES.map((statusKey) => {
                const config = QR_ORDER_ITEM_STATUS_CONFIG[statusKey];
                const isChecked = selectedStatuses.has(statusKey);
                return (
                  <label
                    key={statusKey}
                    data-testid={`status-checkbox-label-${statusKey}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold font-poppins border cursor-pointer select-none transition-colors duration-200 ${
                      isChecked
                        ? config.badgeClass
                        : 'bg-gray-50 text-gray-400 border-gray-200 opacity-60 hover:text-[#ae001a] hover:border-[#ae001a]/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      data-testid={`status-checkbox-${statusKey}`}
                      checked={isChecked}
                      onChange={() => {
                        const next = new Set(selectedStatuses);
                        if (next.has(statusKey)) {
                          next.delete(statusKey);
                        } else {
                          next.add(statusKey);
                        }
                        setSelectedStatuses(next);
                      }}
                      className="rounded text-[#ae001a] focus:ring-[#ae001a] focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer accent-[#ae001a]"
                    />
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
                    <span>{config.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <span className="text-[#5f5e5e] text-xs font-poppins">
                Showing <strong className="text-[#1d1c17] font-bold">{filteredItems.length}</strong> of {items.length} line items
              </span>

              {(searchTerm || parentOrderFilter !== 'ALL' || menuItemFilter !== 'ALL' || selectedStatuses.size < QR_ORDER_ITEM_STATUSES.length) && (
                <button
                  type="button"
                  data-testid="reset-filters-btn"
                  onClick={() => {
                    setSearchTerm('');
                    setParentOrderFilter('ALL');
                    setMenuItemFilter('ALL');
                    setSelectedStatuses(new Set(QR_ORDER_ITEM_STATUSES));
                  }}
                  className="px-2.5 py-1 text-xs font-bold text-gray-500 hover:text-[#ae001a] font-poppins transition-colors duration-200 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                  <span>Clear Filters</span>
                </button>
              )}

              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  title="Table Grid View"
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-poppins flex items-center gap-1 transition-colors duration-200 ${
                    viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-[#ae001a]'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">table_rows</span>
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('kds')}
                  title="KDS Expeditor Cards View"
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-poppins flex items-center gap-1 transition-colors duration-200 ${
                    viewMode === 'kds' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-[#ae001a]'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">dashboard</span>
                  <span className="hidden sm:inline">KDS</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Directory Grid / Table View */}
        {loading ? (
          <div className="bg-white rounded-2xl p-12 border border-[#e8e2d8] text-center shadow-sm">
            <span className="material-symbols-outlined text-4xl text-[#ae001a] animate-spin mb-3">
              progress_activity
            </span>
            <p className="text-sm font-bold text-gray-700 font-poppins">Loading QR order items workspace...</p>
            <p className="text-xs text-gray-400 mt-1 font-poppins">Hydrating TypeORM relations and calculations.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-16 rounded-2xl bg-white border border-[#e8e2d8] text-center flex flex-col items-center justify-center shadow-xs font-poppins">
            <div className="w-16 h-16 rounded-2xl bg-red-50 text-[#ae001a] flex items-center justify-center mb-4 border border-red-200 shadow-inner">
              <span className="material-symbols-outlined text-3xl">receipt_long</span>
            </div>
            <h3 className="text-base font-bold text-[#1d1c17] font-poppins">
              No QR Order Line Items Found
            </h3>
            <p className="text-xs text-[#5f5e5e] mt-1 max-w-md font-poppins">
              {items.length === 0
                ? 'No line items have been registered or submitted for QR orders yet.'
                : 'No line items match your active search and filter parameters.'}
            </p>
            <div className="mt-6 flex items-center gap-3">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setParentOrderFilter('ALL');
                    setMenuItemFilter('ALL');
                    setSelectedStatuses(new Set(QR_ORDER_ITEM_STATUSES));
                  }}
                  className="px-4 py-2 rounded-xl border border-[#e8e2d8] text-xs font-bold text-[#5f5e5e] hover:bg-slate-50 transition-colors"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                data-testid="create-line-item-empty-btn"
                onClick={handleOpenCreate}
                className="px-5 py-2.5 rounded-xl bg-[#ae001a] text-white text-xs font-bold hover:bg-[#8e0015] shadow-md transition-colors"
              >
                + Add First Line Item
              </button>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          <div className="bg-white rounded-2xl border border-[#e8e2d8] shadow-sm overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#fcfaf7] border-b border-[#e8e2d8] text-gray-600 font-bold uppercase tracking-wider text-[10px] font-poppins">
                    <th className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">format_list_bulleted</span>
                        <span>Line Item & Parent</span>
                      </div>
                    </th>
                    <th className="py-3.5 px-4">Menu Dish / Catalog Item</th>
                    <th className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">receipt</span>
                        <span>POS Binding</span>
                      </div>
                    </th>
                    <th className="py-3.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-xs">exposure_plus_1</span>
                        <span>Qty</span>
                      </div>
                    </th>
                    <th className="py-3.5 px-4">Price Breakdown</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2eee9]">
                  {filteredItems.map((item) => {
                    const statusConfig =
                      QR_ORDER_ITEM_STATUS_CONFIG[item.status as QROrderItemStatus] ||
                      QR_ORDER_ITEM_STATUS_CONFIG.active;
                    const dishName = item.qrMenuItem?.name || 'QR Menu Dish';
                    const imageUrl =
                      item.qrMenuItem?.image_url ||
                      'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80';

                    return (
                      <tr
                        key={item.id}
                        data-testid={`line-item-row-${item.id}`}
                        className="hover:bg-[#faf8f4] transition-colors duration-200"
                      >
                        {/* Order Line Badge: #QR-ORI-{id} & Parent #QR-ORD-{qr_order_id} */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-1">
                            <span
                              data-testid={`badge-line-item-${item.id}`}
                              className="font-mono font-black text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-900 border border-gray-300 inline-block shadow-2xs font-poppins hover:text-[#ae001a] transition-colors duration-200"
                            >
                              {formatQROrderItemBadge(item.id)}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium font-poppins">
                              <span className="material-symbols-outlined text-xs text-gray-400">
                                link
                              </span>
                              <span>Parent:</span>
                              <span
                                data-testid={`parent-badge-${item.id}`}
                                className="font-mono font-bold text-[#ae001a] hover:underline cursor-pointer font-poppins transition-colors duration-200"
                                onClick={() => {
                                  if (onNavigate) {
                                    onNavigate('qr-code-orders');
                                  }
                                }}
                              >
                                {formatQROrderBadge(item.qr_order_id)}
                              </span>
                            </div>
                            {item.qrOrder?.table?.number && (
                              <div className="text-[10px] text-gray-400 font-medium font-poppins">
                                Table #{item.qrOrder.table.number}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Menu Item Info: Dish Name & Thumbnail Preview */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex items-start gap-3">
                            <img
                              src={imageUrl}
                              alt={dishName}
                              className="w-12 h-12 rounded-xl object-cover border border-gray-200 shrink-0 shadow-2xs bg-gray-100"
                              onError={(e) => {
                                // Fallback icon on image load failure
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="space-y-0.5">
                              <div className="font-bold text-gray-900 text-xs leading-tight font-poppins hover:text-[#ae001a] transition-colors duration-200">
                                {dishName}
                              </div>
                              <div className="text-[10px] text-gray-500 line-clamp-1 font-poppins">
                                {item.qrMenuItem?.description || 'Catalog menu item'}
                              </div>
                              <div className="text-[10px] font-mono text-gray-400 font-poppins">
                                Catalog ID: #{item.qr_menu_item_id}
                              </div>
                              {item.notes && (
                                <div
                                  data-testid={`notes-box-${item.id}`}
                                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded cursor-pointer hover:bg-amber-100 transition-colors"
                                  title={`Special Prep Instruction: ${item.notes}`}
                                  onClick={() => setDetailItem(item)}
                                >
                                  <span className="material-symbols-outlined text-xs text-amber-700">speaker_notes</span>
                                  <span className="italic font-semibold truncate max-w-[160px]">"{item.notes}"</span>
                                  <span className="sr-only">{item.notes}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Master POS Line Binding: #POS-ORI-{order_item_id} */}
                        <td className="py-3.5 px-4 align-top">
                          {item.order_item_id ? (
                            <div className="space-y-0.5">
                              <span
                                data-testid={`pos-line-tag-${item.id}`}
                                className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 inline-block font-poppins"
                              >
                                {formatPOSOrderItemBadge(item.order_item_id)}
                              </span>
                              <div className="text-[10px] text-gray-400 font-poppins">
                                Master POS Synced
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic font-poppins">
                              Unlinked POS Line
                            </span>
                          )}
                        </td>

                        {/* Quantity Badge: Monospace count indicator "x2" */}
                        <td className="py-3.5 px-3 align-top text-center">
                          <span
                            data-testid={`quantity-badge-${item.id}`}
                            className="font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-gray-100 text-gray-900 border border-gray-300 shadow-2xs inline-block font-poppins hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                          >
                            {formatQuantityBadge(item.quantity)}
                          </span>
                        </td>

                        {/* Price Breakdown: unit_price alongside subtotal_price */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-black text-[#1d1c17] font-poppins hover:text-[#ae001a] transition-colors duration-200">
                                {formatCurrency(item.subtotal_price)}
                              </span>
                              <span className="text-[10px] text-gray-400 font-semibold uppercase font-poppins">
                                Subtotal
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-500 font-medium font-poppins">
                              {formatCurrency(item.unit_price)} each
                            </div>
                            <div className="text-[9px] text-gray-400 font-mono font-poppins">
                              {item.quantity} × {formatCurrency(item.unit_price)}
                            </div>
                          </div>
                        </td>

                        {/* Status Pill */}
                        <td className="py-3.5 px-4 align-top whitespace-nowrap">
                          <span
                            data-testid={`status-pill-${item.id}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold font-poppins border ${statusConfig.pillClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                            <span>{statusConfig.label}</span>
                            <span className="sr-only">
                              {item.status === 'active' ? 'Valid Line Item' : item.status === 'inactive' ? 'Voided / On Hold' : 'Removed'}
                            </span>
                          </span>
                        </td>

                        {/* Row Actions */}
                        <td className="py-3.5 px-4 align-top text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              data-testid={`view-chit-btn-${item.id}`}
                              title="Kitchen Chit / Receipt Preview"
                              onClick={() => setDetailItem(item)}
                              className="p-1.5 rounded-lg text-gray-600 hover:text-[#ae001a] hover:bg-gray-100 transition-colors duration-200"
                            >
                              <span className="material-symbols-outlined text-base">print</span>
                            </button>
                            <button
                              type="button"
                              data-testid={`edit-btn-${item.id}`}
                              title="Edit line item"
                              onClick={() => handleOpenEdit(item)}
                              className="p-1.5 rounded-lg text-gray-600 hover:text-[#ae001a] hover:bg-gray-100 transition-colors duration-200"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                            {item.status === 'active' ? (
                              <button
                                type="button"
                                title="Void / Put on hold"
                                onClick={() => handleStatusToggle(item, 'inactive')}
                                className="p-1.5 rounded-lg text-amber-600 hover:text-[#ae001a] hover:bg-amber-50 transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-base">pause_circle</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Set Valid / Active"
                                onClick={() => handleStatusToggle(item, 'active')}
                                className="p-1.5 rounded-lg text-emerald-600 hover:text-[#ae001a] hover:bg-emerald-50 transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-base">check_circle</span>
                              </button>
                            )}
                            <button
                              type="button"
                              data-testid={`delete-btn-${item.id}`}
                              title="Delete item"
                              onClick={() => handleDeleteItem(item)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-[#ae001a] hover:bg-rose-50 transition-colors duration-200"
                            >
                              <span className="material-symbols-outlined text-base">delete</span>
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
          /* KDS Expeditor Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
              const statusConfig =
                QR_ORDER_ITEM_STATUS_CONFIG[item.status as QROrderItemStatus] ||
                QR_ORDER_ITEM_STATUS_CONFIG.active;
              const dishName = item.qrMenuItem?.name || 'QR Menu Dish';
              const imageUrl =
                item.qrMenuItem?.image_url ||
                'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80';

              return (
                <div
                  key={item.id}
                  data-testid={`kds-card-${item.id}`}
                  className="bg-white rounded-2xl border border-[#e8e2d8] shadow-sm p-4 space-y-3 flex flex-col justify-between hover:shadow-md transition"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-900 border border-gray-300">
                          {formatQROrderItemBadge(item.id)}
                        </span>
                        <span className="font-mono font-bold text-xs text-[#ae001a]">
                          {formatQROrderBadge(item.qr_order_id)}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusConfig.pillClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                        <span>{statusConfig.label}</span>
                      </span>
                    </div>

                    <div className="flex items-start gap-3">
                      <img
                        src={imageUrl}
                        alt={dishName}
                        className="w-14 h-14 rounded-xl object-cover border border-gray-200 shrink-0 shadow-2xs"
                      />
                      <div className="space-y-1 flex-1">
                        <div className="font-black text-sm text-[#1d1c17] leading-snug">
                          {dishName}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-sm px-2 py-0.5 bg-gray-100 rounded text-gray-900">
                            {formatQuantityBadge(item.quantity)}
                          </span>
                          <span className="font-black text-sm text-gray-900">
                            {formatCurrency(item.subtotal_price)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Master POS Tag */}
                    {item.order_item_id && (
                      <div className="text-[10px] font-mono text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block">
                        {formatPOSOrderItemBadge(item.order_item_id)}
                      </div>
                    )}

                    {/* Prominent Notes Box for KDS Expeditor */}
                    {item.notes ? (
                      <div
                        data-testid={`kds-notes-${item.id}`}
                        className="p-2.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-950 text-xs font-bold"
                      >
                        <div className="flex items-center gap-1 text-[10px] uppercase text-amber-800 font-black mb-0.5">
                          <span className="material-symbols-outlined text-xs">priority_high</span>
                          <span>*** EXPEDITOR SPECIAL INSTRUCTION ***</span>
                        </div>
                        <div>"{item.notes}"</div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 italic">No custom notes.</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-[10px] text-gray-400">
                      Unit: {formatCurrency(item.unit_price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDetailItem(item)}
                      className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs">print</span>
                      <span>Chit Ticket</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail / Receipt / Kitchen Chit Modal */}
        {detailItem && (
          <div
            data-testid="chit-modal-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          >
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Chit Header Bar */}
              <div className="bg-[#1d1c17] text-white px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-xl">receipt_long</span>
                  <h3 className="font-bold text-sm tracking-wide">
                    Kitchen Expeditor Ticket & Receipt
                  </h3>
                </div>
                <button
                  type="button"
                  data-testid="close-chit-btn"
                  onClick={() => setDetailItem(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Chit Content */}
              <div className="p-6 space-y-4 bg-[#fdfdfd] text-xs">
                <div className="text-center border-b border-dashed border-gray-400 pb-3">
                  <h4 className="font-black text-sm uppercase tracking-widest text-[#1d1c17]">
                    X7 POINT OF SALE
                  </h4>
                  <p className="text-[11px] text-gray-600 uppercase mt-0.5 font-bold">
                    Kitchen Station Line Breakdown Chit
                  </p>
                  <div className="text-[10px] text-gray-500 mt-1">
                    {new Date().toLocaleString()}
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs font-bold border-b border-gray-200 pb-2">
                  <span>LINE ITEM: {formatQROrderItemBadge(detailItem.id)}</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-300 text-gray-700">
                    PARENT: {formatQROrderBadge(detailItem.qr_order_id)}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="font-bold text-gray-700">MASTER POS LINE: </span>
                    <span className="font-mono font-bold">
                      {formatPOSOrderItemBadge(detailItem.order_item_id)}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700">DISH: </span>
                    <span className="font-black text-sm">
                      {detailItem.qrMenuItem?.name || 'QR Menu Dish'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700">QUANTITY: </span>
                    <span className="font-mono font-black text-sm px-2 py-0.5 bg-gray-200 rounded">
                      {formatQuantityBadge(detailItem.quantity)}
                    </span>
                  </div>
                </div>

                {/* HIGH PROMINENCE DISH-LEVEL PREPARATION NOTES IN KDS / RECEIPT */}
                <div
                  data-testid="chit-special-notes-box"
                  className="border-2 border-black p-3 bg-amber-50 rounded-xl"
                >
                  <div className="text-[10px] font-black uppercase text-amber-900 flex items-center gap-1 mb-1">
                    <span className="material-symbols-outlined text-xs text-amber-700">warning</span>
                    <span>*** DISH-LEVEL INSTRUCTIONS & NOTES ***</span>
                  </div>
                  <div className="font-black text-xs text-black leading-snug">
                    {detailItem.notes ? detailItem.notes : 'NO SPECIAL NOTES'}
                  </div>
                </div>

                {/* Financial Precision (12, 2) Calculation Breakdown */}
                <div className="space-y-1 border-t border-dashed border-gray-400 pt-3 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Unit Price (scale: 2):</span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(detailItem.unit_price)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Quantity:</span>
                    <span className="font-mono font-semibold">{detailItem.quantity}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-black border-t border-gray-200 pt-1.5 text-gray-900">
                    <span>SUBTOTAL PRICE:</span>
                    <span className="font-mono text-base text-[#ae001a]">
                      {formatCurrency(detailItem.subtotal_price)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    data-testid="print-chit-btn"
                    onClick={() => window.print()}
                    className="flex-1 py-2 bg-[#1d1c17] hover:bg-black text-white font-bold text-xs rounded-xl uppercase flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <span className="material-symbols-outlined text-sm">print</span>
                    <span>Print Ticket</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailItem(null)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 uppercase transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floor Expeditor & POS Cashier Line Item Detail Drawer */}
        <QROrderItemDrawer
          isOpen={isDrawerOpen}
          mode={editingItem ? 'edit' : 'create'}
          item={editingItem}
          orders={orders}
          menuItems={menuItems}
          posItems={posItems}
          onClose={() => setIsDrawerOpen(false)}
          onSuccess={handleDrawerSuccess}
        />
      </div>
    </div>
  );
};
