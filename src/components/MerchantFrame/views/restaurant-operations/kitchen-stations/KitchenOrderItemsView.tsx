import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getAccessToken } from '../../../../../lib/auth-storage';
import { NavHubBar } from '../../../../shared/NavHubBar';
import { HeaderQuickTabs } from '../../../../shared/HeaderQuickTabs';
import { TableOptionsMenu, TablePaginationFooter, NoColumnsEmptyState, TableEmptyState, getDensityPadding, type TableDensity } from '../../../../shared/TableOptionsMenu';
import { KitchenQuickLinks } from './KitchenQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export type KitchenItemPrepStatus = 'pending' | 'in_preparation' | 'ready';

export interface KitchenOrderItemDetail {
  id: number;
  kitchenOrderId: number;
  orderItemId?: number | null;
  productId: number;
  variantId?: number | null;
  quantity: number;
  preparedQuantity: number;
  preparationStatus: KitchenItemPrepStatus;
  status: 'active' | 'deleted';
  startedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  kitchenOrder: {
    id: number;
    stationId?: number | null;
    stationName?: string | null;
    priority?: number;
    businessStatus?: string;
    orderId?: number | null;
  };
  product: {
    id: number;
    name: string;
  };
  variant?: {
    id: number;
    name: string;
  } | null;
}

interface KitchenStationOption {
  id: number;
  name: string;
  stationType?: string;
}

interface KitchenOrderItemsViewProps {
  onNavigate?: (view: string) => void;
}

export const KitchenOrderItemsView: React.FC<KitchenOrderItemsViewProps> = ({ onNavigate }) => {
  const [items, setItems] = useState<KitchenOrderItemDetail[]>([]);
  const [stations, setStations] = useState<KitchenStationOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'IN_PREPARATION' | 'READY'>('ALL');
  const [selectedStationId, setSelectedStationId] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshInterval, setRefreshInterval] = useState<number>(10); // 10s default
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [actionInProgressId, setActionInProgressId] = useState<number | null>(null);

  // Table options menu states
  const [density, setDensity] = useState<TableDensity>('comfortable');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    itemDish: true,
    ticket: true,
    station: true,
    multiplier: true,
    progress: true,
    prepState: true,
    notes: true,
    actions: true,
  });

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'warning' | 'auto_bump';
    id: number;
  } | null>(null);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' | 'auto_bump' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type, id: Date.now() });
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // 1. Fetch stations
  const fetchStations = async () => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-station?status=active&limit=100`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      const rawList = data.data || data || [];
      setStations(
        rawList.map((s: any) => ({
          id: s.id,
          name: s.name,
          stationType: s.stationType || s.station_type,
        })),
      );
    } catch {
      // ignore station fetch error
    }
  };

  // 2. Fetch all kitchen order items
  const loadItems = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const queryParams = new URLSearchParams({
        limit: '100',
        page: '1',
        sortBy: 'createdAt',
        sortOrder: 'ASC',
      });

      const res = await fetch(`${API_BASE}/kitchen-order-items?${queryParams.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load kitchen order items: ${res.statusText}`);
      }

      const resData = await res.json();
      const rawItems: KitchenOrderItemDetail[] = resData.data || [];
      setItems(rawItems);
    } catch (err: any) {
      if (!isBackground) {
        setError(err.message || 'Error loading kitchen items');
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
    loadItems();
  }, []);

  // Polling interval
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => {
      loadItems(true);
    }, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Handle Tap-to-Increment (+1)
  const handleIncrement = async (item: KitchenOrderItemDetail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (actionInProgressId === item.id) return;

    // Protection 1: Block modification if parent order is completed or cancelled
    const isOrderClosed =
      item.kitchenOrder?.businessStatus === 'completed' ||
      item.kitchenOrder?.businessStatus === 'cancelled';
    if (isOrderClosed) {
      showToast('This order is already completed and cannot be modified.', 'warning');
      return;
    }

    // Protection 2: If item is already at full quantity (READY), ask for confirmation before resetting
    if (item.preparedQuantity >= item.quantity || item.preparationStatus === 'ready') {
      const confirmReset = window.confirm(
        `"${item.product?.name || 'Dish'}" is already marked READY.\n\nAre you sure you want to reset its prepared count back to 0?`
      );
      if (!confirmReset) return;
    }

    setActionInProgressId(item.id);

    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-order-items/${item.id}/increment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        // Fallback: use PUT endpoint if increment is unavailable
        const newPrepared = item.preparedQuantity >= item.quantity ? 0 : item.preparedQuantity + 1;
        const newStatus: KitchenItemPrepStatus =
          newPrepared === item.quantity ? 'ready' : newPrepared > 0 ? 'in_preparation' : 'pending';

        const putRes = await fetch(`${API_BASE}/kitchen-order-items/${item.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            preparedQuantity: newPrepared,
            preparationStatus: newStatus,
          }),
        });

        if (!putRes.ok) {
          throw new Error('Could not update prepared quantity');
        }

        const putData = await putRes.json();
        const updatedItem = putData.data || putData;
        setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...updatedItem } : it)));
        showToast(
          `${item.product.name}: ${newPrepared}/${item.quantity} Prepared (${newStatus.toUpperCase()})`,
          'info'
        );
        return;
      }

      const data = await res.json();
      const updatedItem = data.data || data;
      const isAutoBumped = data.autoBumped || false;

      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...updatedItem } : it)));

      if (isAutoBumped) {
        showToast(
          `🎉 ALL DISHES READY! Ticket #KO-${item.kitchenOrderId} was AUTO-BUMPED to COMPLETED!`,
          'auto_bump'
        );
      } else {
        const dishName = item.product?.name || 'Dish';
        const cur = updatedItem.preparedQuantity ?? item.preparedQuantity + 1;
        showToast(
          `✓ ${dishName}: ${cur} of ${item.quantity} Prepared`,
          cur === item.quantity ? 'success' : 'info'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating item quantity', 'warning');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Handle Quick Decrement (-1)
  const handleDecrement = async (item: KitchenOrderItemDetail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (actionInProgressId === item.id) return;

    const isOrderClosed =
      item.kitchenOrder?.businessStatus === 'completed' ||
      item.kitchenOrder?.businessStatus === 'cancelled';
    if (isOrderClosed) {
      showToast('This order is already completed and cannot be modified.', 'warning');
      return;
    }

    if (item.preparedQuantity <= 0) return;

    setActionInProgressId(item.id);
    try {
      const token = getAccessToken();
      const newPrepared = item.preparedQuantity - 1;
      const newStatus: KitchenItemPrepStatus =
        newPrepared === 0 ? 'pending' : 'in_preparation';

      const res = await fetch(`${API_BASE}/kitchen-order-items/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          preparedQuantity: newPrepared,
          preparationStatus: newStatus,
        }),
      });

      if (!res.ok) throw new Error('Failed to decrement quantity');
      const data = await res.json();
      const updatedItem = data.data || data;
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...updatedItem } : it)));
      showToast(`${item.product.name}: Decremented to ${newPrepared}/${item.quantity}`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Error decrementing item', 'warning');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Handle Mark All Ready
  const handleMarkAllReady = async (item: KitchenOrderItemDetail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (actionInProgressId === item.id) return;

    const isOrderClosed =
      item.kitchenOrder?.businessStatus === 'completed' ||
      item.kitchenOrder?.businessStatus === 'cancelled';
    if (isOrderClosed) {
      showToast('This order is already completed and cannot be modified.', 'warning');
      return;
    }

    setActionInProgressId(item.id);

    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-order-items/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          preparedQuantity: item.quantity,
          preparationStatus: 'ready',
        }),
      });

      if (!res.ok) throw new Error('Failed to mark item ready');
      const data = await res.json();
      const updatedItem = data.data || data;
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...updatedItem } : it)));
      showToast(`✓ ${item.product.name} (x${item.quantity}) marked READY!`, 'success');

      // Check if ticket might be completed
      loadItems(true);
    } catch (err: any) {
      showToast(err.message || 'Error marking item ready', 'warning');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Handle Reset to Pending (0/N)
  const handleResetItem = async (item: KitchenOrderItemDetail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (actionInProgressId === item.id) return;

    const isOrderClosed =
      item.kitchenOrder?.businessStatus === 'completed' ||
      item.kitchenOrder?.businessStatus === 'cancelled';
    if (isOrderClosed) {
      showToast('This order is already completed and cannot be modified.', 'warning');
      return;
    }

    const confirmReset = window.confirm(
      `Reset "${item.product?.name || 'Dish'}" back to PENDING (0/${item.quantity})?`
    );
    if (!confirmReset) return;

    setActionInProgressId(item.id);

    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-order-items/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          preparedQuantity: 0,
          preparationStatus: 'pending',
          startedAt: null,
          completedAt: null,
        }),
      });

      if (!res.ok) throw new Error('Failed to reset item');
      const data = await res.json();
      const updatedItem = data.data || data;
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...updatedItem } : it)));
      showToast(`Reset ${item.product.name} to PENDING (0/${item.quantity})`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Error resetting item', 'warning');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Handle Recall Order (Reopen completed order back to active preparation)
  const handleRecallOrder = async (kitchenOrderId: number, itemName?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const label = itemName ? `"${itemName}" (Order #KO-${kitchenOrderId})` : `Order #KO-${kitchenOrderId}`;
    const confirmRecall = window.confirm(
      `Order #KO-${kitchenOrderId} is currently marked as COMPLETED.\n\nDo you want to RECALL ${label} back to the active preparation line?`
    );
    if (!confirmRecall) return;

    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-orders/${kitchenOrderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ businessStatus: 'started', completedAt: null }),
      });

      if (!res.ok) {
        throw new Error('Could not recall order. Check server permissions.');
      }

      showToast(`↺ RECALLED #KO-${kitchenOrderId} back to Active Preparation!`, 'info');
      await loadItems();
    } catch (err: any) {
      showToast(err.message || 'Error recalling order', 'warning');
    }
  };

  // 3. Computed Metrics & Filtered Data
  const activeItems = useMemo(() => {
    return items.filter(it => {
      const orderStatus = (it.kitchenOrder as any)?.businessStatus?.toLowerCase();
      const logicalOrderStatus = (it.kitchenOrder as any)?.status?.toLowerCase();
      return (
        it.status !== 'deleted' &&
        orderStatus !== 'cancelled' &&
        logicalOrderStatus !== 'cancelled'
      );
    });
  }, [items]);

  const stationFilteredItems = useMemo(() => {
    if (selectedStationId === 'ALL') return activeItems;
    return activeItems.filter(it => it.kitchenOrder?.stationId === selectedStationId);
  }, [activeItems, selectedStationId]);

  // Global counts for badges
  const counts = useMemo(() => {
    const total = stationFilteredItems.length;
    const pending = stationFilteredItems.filter(i => i.preparationStatus === 'pending').length;
    const inPrep = stationFilteredItems.filter(i => i.preparationStatus === 'in_preparation').length;
    const ready = stationFilteredItems.filter(i => i.preparationStatus === 'ready').length;
    return { total, pending, inPrep, ready };
  }, [stationFilteredItems]);

  // Filter by Tab and Search
  const filteredItems = useMemo(() => {
    let result = stationFilteredItems;

    if (activeTab === 'PENDING') {
      result = result.filter(i => i.preparationStatus === 'pending');
    } else if (activeTab === 'IN_PREPARATION') {
      result = result.filter(i => i.preparationStatus === 'in_preparation');
    } else if (activeTab === 'READY') {
      result = result.filter(i => i.preparationStatus === 'ready');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => {
        const prod = (i.product?.name || '').toLowerCase();
        const variant = (i.variant?.name || '').toLowerCase();
        const notes = (i.notes || '').toLowerCase();
        const ticketId = `#ko-${i.kitchenOrderId}`.toLowerCase();
        const station = (i.kitchenOrder?.stationName || '').toLowerCase();
        return (
          prod.includes(q) ||
          variant.includes(q) ||
          notes.includes(q) ||
          ticketId.includes(q) ||
          station.includes(q)
        );
      });
    }

    // Sort: Identical to Kitchen Orders Board (FIFO: Oldest first, newest last)
    // Tier 1: Active parent orders (pending/started)
    // Tier 2: Completed parent orders
    // Tier 3: Cancelled parent orders
    const getStatusTier = (orderBusinessStatus?: string): number => {
      switch (orderBusinessStatus) {
        case 'pending':
        case 'started':
          return 1;
        case 'completed':
          return 2;
        case 'cancelled':
          return 3;
        default:
          return 1;
      }
    };

    return [...result].sort((a, b) => {
      const tierA = getStatusTier(a.kitchenOrder?.businessStatus);
      const tierB = getStatusTier(b.kitchenOrder?.businessStatus);

      if (tierA !== tierB) {
        return tierA - tierB;
      }

      // Tier 1: Active orders -> High priority first
      if (tierA === 1) {
        const prioA = a.kitchenOrder?.priority ?? 0;
        const prioB = b.kitchenOrder?.priority ?? 0;
        if (prioB !== prioA) return prioB - prioA;

        // FIFO: Oldest created first, newest last (la más vieja primero, la más nueva el último)
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeA !== timeB) return timeA - timeB;

        // Ready items in active orders placed slightly below pending/in-prep
        if (a.preparationStatus === 'ready' && b.preparationStatus !== 'ready') return 1;
        if (b.preparationStatus === 'ready' && a.preparationStatus !== 'ready') return -1;

        return a.id - b.id;
      }

      // Tier 2 & 3: Completed / Cancelled -> Oldest first
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) return timeA - timeB;

      return a.id - b.id;
    });
  }, [stationFilteredItems, activeTab, searchQuery]);

  // Paginated items for table view
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const activeColSpan = Object.values(visibleColumns).filter(Boolean).length;
  const densityPadding = getDensityPadding(density);

  // Format Elapsed Time
  const formatElapsedTime = (dateStr: string): string => {
    const start = new Date(dateStr).getTime();
    const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}h ${remMins}m`;
    }
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-20">
      {/* TOAST ALERT BANNER (High-Z Floating) */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 transition-all duration-300">
          <div
            className={`flex items-center gap-3 px-5 py-3.5 rounded-lg shadow-xl border text-sm font-semibold tracking-wide ${
              toastMessage.type === 'auto_bump'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-2 ring-emerald-400'
                : toastMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : toastMessage.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {toastMessage.type === 'auto_bump'
                ? 'celebration'
                : toastMessage.type === 'success'
                ? 'check_circle'
                : toastMessage.type === 'warning'
                ? 'warning'
                : 'info'}
            </span>
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-3 text-[#5f5e5e] hover:text-[#1d1c17] transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 1. Header Card Workspace (Solo para el título) */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            KDS ITEM PREPARATION CONTROL &amp; DISPATCH WORKSPACE
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Atomic line-item tracking, multi-serve partial quantity incrementer, station queues &amp; automated dish dispatch.
          </p>
        </div>
      </div>

      {/* 1.5 Real-Time Summary KPI Banner (4 Cuadrados idénticos a Kitchen Stations en una fila horizontal) */}
      <div className="grid grid-cols-4 gap-4 w-full">
        {/* KPI 1: Total Line Items */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-zinc-100 text-zinc-800 border border-zinc-300 shrink-0 whitespace-nowrap">
            TOTAL
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center border border-zinc-200 shrink-0">
              <span className="material-symbols-outlined text-xl">format_list_bulleted</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-14 sm:pr-16">
                Total Line Items
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : counts.total}
              </div>
            </div>
          </div>
        </div>

        {/* KPI 2: In Preparation */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 shrink-0 whitespace-nowrap">
            COOKING
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shrink-0">
              <span className="material-symbols-outlined text-xl">local_fire_department</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-16 sm:pr-20">
                In Preparation
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : counts.inPrep}{' '}
                <span className="text-xs sm:text-sm text-[#5f5e5e] font-normal">/ {counts.total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Ready to Serve */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
            READY
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">task_alt</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-16 sm:pr-20">
                Ready to Serve
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : counts.ready}{' '}
                <span className="text-xs sm:text-sm text-[#5f5e5e] font-normal">/ {counts.total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 4: Pending Queue */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-200 shrink-0 whitespace-nowrap">
            QUEUED
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <span className="material-symbols-outlined text-xl">schedule</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-16 sm:pr-20">
                Pending Queue
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : counts.pending}{' '}
                <span className="text-xs sm:text-sm text-[#5f5e5e] font-normal">/ {counts.total}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Toolbar Multicriterio idéntico a Kitchen Orders */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Fila 1: Búsqueda a la izquierda y View Switcher + Auto-Refresh a la derecha */}
        <div className="flex flex-row items-center justify-between gap-3 w-full">
          <div className="relative flex-1 min-w-0">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e] font-sans">
              search
            </span>
            <input
              type="text"
              placeholder="Search dish, #KO-{id}, POS #ORD, notes..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans text-[#1d1c17]"
              aria-label="Search kitchen order items"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5f5e5e] hover:text-[#1d1c17] text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* View Switcher Toggle & Auto-Refresh al lado derecho */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher Toggle (Mismo diseño y color que Kitchen Orders / Devices) */}
            <div className="flex items-center bg-[#f2ede5] p-1 rounded border border-[#e8e2d8] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Station Card Grid (Tap-to-Increment)"
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                Dish Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Comprehensive Line-Item Table"
              >
                <span className="material-symbols-outlined text-[16px]">table_rows</span>
                Audit Table
              </button>
            </div>

            {/* Auto Refresh al lado derecho del cambio de modo */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs text-[#5f5e5e] shrink-0 h-[38px]">
              <span className="material-symbols-outlined text-sm text-[#5f5e5e]">sync</span>
              <span className="text-[11px] font-bold text-[#5f5e5e] uppercase">Auto:</span>
              <select
                value={refreshInterval}
                onChange={e => setRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-[#1d1c17] font-semibold focus:outline-none cursor-pointer text-xs"
              >
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
                <option value={0}>Off</option>
              </select>
            </div>
          </div>
        </div>

        {/* Fila 2: Status Tabs (Segmented Pill Buttons al medio, entre Búsqueda y Filtros, sin línea divisoria) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => {
                setActiveTab('ALL');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-[#5f5e5e] hover:text-[#1d1c17] hover:bg-[#f2ede5]'
              }`}
            >
              <span>All Items</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'ALL' ? 'bg-white text-[#ae001a]' : 'bg-[#e8e2d8] text-[#5f5e5e]'
                }`}
              >
                {counts.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('PENDING');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                activeTab === 'PENDING'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-[#5f5e5e] hover:text-[#1d1c17] hover:bg-[#f2ede5]'
              }`}
            >
              <span>Pending</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'PENDING' ? 'bg-white text-[#ae001a]' : 'bg-[#e8e2d8] text-[#5f5e5e]'
                }`}
              >
                {counts.pending}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('IN_PREPARATION');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                activeTab === 'IN_PREPARATION'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-[#5f5e5e] hover:text-[#1d1c17] hover:bg-[#f2ede5]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span>In Preparation</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'IN_PREPARATION' ? 'bg-white text-[#ae001a]' : 'bg-[#e8e2d8] text-[#5f5e5e]'
                }`}
              >
                {counts.inPrep}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('READY');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                activeTab === 'READY'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-[#5f5e5e] hover:text-[#1d1c17] hover:bg-[#f2ede5]'
              }`}
            >
              <span>Ready</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'READY' ? 'bg-white text-[#ae001a]' : 'bg-[#e8e2d8] text-[#5f5e5e]'
                }`}
              >
                {counts.ready}
              </span>
            </button>
          </div>
        </div>

        {/* Fila 3: Filtro de Estación con diseño idéntico a Kitchen Orders */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedStationId}
              onChange={e => {
                setSelectedStationId(
                  e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                );
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by kitchen station"
            >
              <option value="ALL">All Kitchen Stations</option>
              {stations.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TAP-TO-INCREMENT INSTRUCTION CALLOUT */}
      <div className="bg-[#fef9f1] border border-[#e8e2d8] rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-[#5f5e5e]">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#ae001a] text-lg shrink-0">touch_app</span>
          <span className="text-[#1d1c17]">
            <strong className="text-[#ae001a]">Tap-to-Increment:</strong> Click any dish card to increment the prepared quantity (+1). When all items in an order ticket reach <span className="text-emerald-700 font-bold">READY</span> status, the parent order is automatically dispatched (<span className="text-emerald-700 font-bold">AUTO-BUMP</span>).
          </span>
        </div>
        <span className="hidden md:inline-block text-[11px] font-mono text-[#5f5e5e] bg-white px-2 py-0.5 rounded border border-[#e8e2d8] whitespace-nowrap">
          Multi-Serve Incrementer
        </span>
      </div>

      {/* VIEW MODES */}
      {viewMode === 'grid' ? (
        loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#5f5e5e] gap-3">
            <div className="w-10 h-10 border-4 border-[#e8e2d8] border-t-[#ae001a] rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading station line-items...</span>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-sm text-red-800 space-y-3">
            <span className="material-symbols-outlined text-[#ae001a] text-4xl block mx-auto">error</span>
            <p className="font-bold">{error}</p>
            <button
              onClick={() => loadItems()}
              className="px-4 py-2 bg-[#ae001a] text-white font-bold text-xs uppercase hover:bg-[#900015] rounded cursor-pointer transition-colors"
            >
              Retry Connection
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <TableEmptyState
            asTableRow={false}
            icon="restaurant"
            title="No Kitchen Items Found"
            description="No line items match your current station or status filter. All dishes have been prepared or no orders are currently routed."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map(item => {
            const isReady = item.preparationStatus === 'ready';
            const isInPrep = item.preparationStatus === 'in_preparation';
            const isOrderClosed =
              item.kitchenOrder?.businessStatus === 'completed' ||
              item.kitchenOrder?.businessStatus === 'cancelled';
            const canTapCard = !isOrderClosed && !isReady;

            const progressPercent = item.quantity > 0
              ? Math.min(100, Math.round((item.preparedQuantity / item.quantity) * 100))
              : 0;

            const isActionLoading = actionInProgressId === item.id;

            return (
              <div
                key={item.id}
                onClick={canTapCard ? e => handleIncrement(item, e) : undefined}
                className={`group relative rounded-xl border transition-all select-none flex flex-col justify-between overflow-hidden shadow-xs ${
                  isOrderClosed
                    ? 'bg-zinc-50/80 border-zinc-200 opacity-85 cursor-default'
                    : isReady
                    ? 'bg-emerald-50/40 border-emerald-300 hover:border-emerald-400 cursor-default'
                    : isInPrep
                    ? 'bg-blue-50/40 border-blue-300 hover:border-blue-400 cursor-pointer'
                    : 'bg-white border-[#e8e2d8] hover:border-[#ae001a]/50 hover:shadow-sm cursor-pointer'
                }`}
              >
                {/* Top Ticket Info & Priority Badge */}
                <div className="p-3.5 pb-2.5 border-b border-[#e8e2d8] bg-[#fcfbf9] flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[#ae001a] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                      #KO-{item.kitchenOrderId}
                    </span>
                    {item.kitchenOrder?.orderId && (
                      <span className="text-[#5f5e5e] font-mono text-[10px]">
                        #ORD-{item.kitchenOrder.orderId}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Closed badge if parent order is completed or cancelled */}
                    {isOrderClosed && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-zinc-200 text-zinc-700 border border-zinc-300">
                        <span className="material-symbols-outlined text-[11px]">lock</span>
                        {item.kitchenOrder?.businessStatus?.toUpperCase() || 'CLOSED'}
                      </span>
                    )}

                    {/* Priority pill */}
                    {(item.kitchenOrder?.priority ?? 0) > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          (item.kitchenOrder?.priority ?? 0) >= 2
                            ? 'bg-red-100 text-[#ae001a] border border-red-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        P+{(item.kitchenOrder?.priority ?? 0)}
                      </span>
                    )}

                    {/* Station badge */}
                    {item.kitchenOrder?.stationName && (
                      <span className="text-[10px] text-[#5f5e5e] bg-[#f0ebe1] px-2 py-0.5 rounded border border-[#e8e2d8] max-w-[110px] truncate">
                        {item.kitchenOrder.stationName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="p-4 flex-1 flex flex-col justify-between gap-3 bg-white">
                  {/* Product & Variant Title with Quantity Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex-1 min-w-0">
                        <h4
                          className={`font-black text-base leading-snug tracking-tight transition-all text-[#1d1c17] ${
                            isReady ? 'line-through text-emerald-800/60' : ''
                          }`}
                        >
                          {item.product?.name || 'Dish Item'}
                          {item.variant?.name && (
                            <span className="font-normal text-[#5f5e5e] ml-1.5 text-xs">
                              — {item.variant.name}
                            </span>
                          )}
                        </h4>
                      </div>

                      {/* Prominent Multiplier Pill */}
                      <div
                        className={`px-2.5 py-1 rounded font-black text-sm tracking-tight shrink-0 border ${
                          isReady
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isInPrep
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : 'bg-[#f2ede5] text-[#1d1c17] border-[#e8e2d8]'
                        }`}
                      >
                        {item.quantity}x
                      </div>
                    </div>

                    {/* Special Item Notes Banner */}
                    {item.notes && (
                      <div className="mt-2.5 bg-amber-50 border-l-2 border-amber-500 px-2.5 py-1.5 rounded-r text-[11px] text-amber-900 font-medium italic flex items-start gap-1.5 shadow-xs">
                        <span className="material-symbols-outlined text-amber-600 text-xs mt-0.5 shrink-0">
                          info
                        </span>
                        <span>{item.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar & Multi-Serve Counter */}
                  <div className="mt-2 pt-2 border-t border-[#f0ebe1]">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-[#5f5e5e] text-[11px] font-bold uppercase tracking-wider">
                        Prepared Quantity:
                      </span>
                      <span className="font-mono font-black text-sm text-[#1d1c17]">
                        <span
                          className={
                            isReady
                              ? 'text-emerald-700'
                              : isInPrep
                              ? 'text-blue-700'
                              : 'text-[#1d1c17]'
                          }
                        >
                          {item.preparedQuantity}
                        </span>
                        <span className="text-[#5f5e5e]"> / {item.quantity}</span>
                        <span className="text-[10px] text-[#5f5e5e] font-normal ml-1">
                          ({progressPercent}%)
                        </span>
                      </span>
                    </div>

                    {/* Progress Bar Visualizer */}
                    <div className="w-full bg-[#f0ebe1] h-2 rounded-full overflow-hidden p-0.5 border border-[#e8e2d8]">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isReady
                            ? 'bg-emerald-500'
                            : isInPrep
                            ? 'bg-blue-600'
                            : 'bg-zinc-300'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card Footer: Status Badge & Auxiliary Buttons */}
                <div className="px-4 py-3 bg-[#fcfbf9] border-t border-[#e8e2d8] flex items-center justify-between gap-2">
                  {/* Status Badge Tag */}
                  <div className="flex items-center gap-1.5">
                    {isReady ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wider">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        READY
                      </span>
                    ) : isInPrep ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300 uppercase tracking-wider">
                        <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                        IN PREP
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8] uppercase tracking-wider">
                        <span className="material-symbols-outlined text-xs">hourglass_empty</span>
                        PENDING
                      </span>
                    )}
                    <span className="text-[10px] text-[#5f5e5e] font-mono">
                      {formatElapsedTime(item.createdAt)}
                    </span>
                  </div>

                  {/* Interactive Auxiliary Buttons */}
                  {isOrderClosed ? (
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {item.kitchenOrder?.businessStatus === 'completed' && (
                        <button
                          onClick={e => handleRecallOrder(item.kitchenOrderId, item.product?.name, e)}
                          disabled={isActionLoading}
                          title="Recall order and return items to active preparation"
                          className="px-2.5 h-7 rounded text-xs font-bold flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xs">undo</span>
                          <span>Recall</span>
                        </button>
                      )}
                      <div className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded">
                        <span className="material-symbols-outlined text-xs">lock</span>
                        <span>{item.kitchenOrder?.businessStatus === 'cancelled' ? 'Cancelled' : 'Order Closed'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {/* Decrement (-1) */}
                      {item.preparedQuantity > 0 && (
                        <button
                          onClick={e => handleDecrement(item, e)}
                          disabled={isActionLoading}
                          title="Decrement prepared count (-1)"
                          className="w-7 h-7 rounded bg-[#f0ebe1] hover:bg-[#e4ded5] text-[#1d1c17] border border-[#e8e2d8] flex items-center justify-center text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          -1
                        </button>
                      )}

                      {/* Primary Tap Increment (+1) */}
                      <button
                        onClick={e => handleIncrement(item, e)}
                        disabled={isActionLoading}
                        title={isReady ? "Reset prepared count back to 0" : "Tap to Increment prepared quantity (+1)"}
                        className={`px-2.5 h-7 rounded text-xs font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer ${
                          isReady
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : isInPrep
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-[#ae001a] hover:bg-[#900015] text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">
                          {isReady ? 'restart_alt' : 'add'}
                        </span>
                        <span>{isReady ? 'Cycle' : '+1 Prep'}</span>
                      </button>

                      {/* Mark All Ready (if not ready) */}
                      {!isReady && (
                        <button
                          onClick={e => handleMarkAllReady(item, e)}
                          disabled={isActionLoading}
                          title="Instantly mark all quantity ready"
                          className="w-7 h-7 rounded bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-800 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xs font-black">done_all</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : (
        /* VIEW MODE 2: DETAILED TABLE VIEW (Audit & Multi-Item Density) */
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm relative overflow-hidden">
          <HeaderQuickTabs
            title="KITCHEN ORDER ITEMS DIRECTORY"
            badgeCount={
              filteredItems.length <= pageSize
                ? `${filteredItems.length} item${filteredItems.length === 1 ? '' : 's'}`
                : `${Math.min(filteredItems.length, pageSize)} / ${filteredItems.length} items`
            }
            tabs={[]}
            rightElement={
              <TableOptionsMenu
                columns={[
                  { key: 'itemDish', label: 'Item / Dish' },
                  { key: 'ticket', label: 'Ticket' },
                  { key: 'station', label: 'Station' },
                  { key: 'multiplier', label: 'Multiplier' },
                  { key: 'progress', label: 'Progress (Prepared)' },
                  { key: 'prepState', label: 'Preparation State' },
                  { key: 'notes', label: 'Notes / Callouts' },
                  { key: 'actions', label: 'Actions' },
                ]}
                visibleColumns={visibleColumns}
                onToggleColumn={(key) =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    [key]: !prev[key as keyof typeof visibleColumns],
                  }))
                }
                rowDensity={density}
                onChangeDensity={setDensity}
                totalItems={filteredItems.length}
                pageSize={pageSize}
                onChangePageSize={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onReload={() => loadItems()}
                onExportCSV={() => {
                  const headers = 'ID,Ticket,Product,Variant,Qty,Prepared,Status,Station,Notes,Created\n';
                  const rows = filteredItems
                    .map(
                      it =>
                        `"${it.id}","#KO-${it.kitchenOrderId}","${it.product?.name || ''}","${
                          it.variant?.name || ''
                        }",${it.quantity},${it.preparedQuantity},"${it.preparationStatus}","${
                          it.kitchenOrder?.stationName || ''
                        }","${(it.notes || '').replace(/"/g, '""')}","${it.createdAt}"`
                    )
                    .join('\n');
                  const blob = new Blob([headers + rows], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `kds_order_items_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  showToast('Exported kitchen order items to CSV', 'success');
                }}
                onPrint={() => window.print()}
                printLabel="Print Kitchen Order Items"
                onCopySummary={() => {
                  const summaryText = `Kitchen Order Items Summary:\n- Total Items: ${filteredItems.length}\n- Ready: ${filteredItems.filter(i => i.preparationStatus === 'ready').length}\n- In Preparation: ${filteredItems.filter(i => i.preparationStatus === 'in_preparation').length}\n- Pending: ${filteredItems.filter(i => i.preparationStatus === 'pending').length}`;
                  navigator.clipboard.writeText(summaryText);
                }}
              />
            }
          />

          {activeColSpan === 0 ? (
            <NoColumnsEmptyState />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#e8e2d8] bg-[#ece8e0] text-[#5f5e5e] uppercase tracking-wider text-[11px] font-bold">
                      {visibleColumns.itemDish && <th className={densityPadding}>Item / Dish</th>}
                      {visibleColumns.ticket && <th className={densityPadding}>Ticket</th>}
                      {visibleColumns.station && <th className={densityPadding}>Station</th>}
                      {visibleColumns.multiplier && <th className={`${densityPadding} text-center`}>Multiplier</th>}
                      {visibleColumns.progress && <th className={`${densityPadding} text-center`}>Progress (Prepared)</th>}
                      {visibleColumns.prepState && <th className={`${densityPadding} text-center`}>Preparation State</th>}
                      {visibleColumns.notes && <th className={densityPadding}>Notes / Callouts</th>}
                      {visibleColumns.actions && <th className={`${densityPadding} text-right`}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8]">
                    {loading ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                          <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                            sync
                          </span>
                          <p className="text-secondary text-body-md mt-2 font-sans">Loading station line-items...</p>
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white">
                          <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                            error
                          </span>
                          <p className="font-bold">{error}</p>
                          <button
                            type="button"
                            onClick={() => loadItems()}
                            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                          >
                            Retry Connection
                          </button>
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="restaurant"
                        title="No kitchen items found"
                        description="All dishes have been prepared or no orders are currently routed to kitchen stations."
                      />
                    ) : filteredItems.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="restaurant"
                        title="No kitchen items found"
                        description="No line items match your current station or status filter."
                      />
                    ) : (
                      paginatedItems.map(item => {
                    const isReady = item.preparationStatus === 'ready';
                    const isInPrep = item.preparationStatus === 'in_preparation';
                    const isOrderClosed =
                      item.kitchenOrder?.businessStatus === 'completed' ||
                      item.kitchenOrder?.businessStatus === 'cancelled';

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-[#f8f3eb] transition-colors ${
                          isOrderClosed
                            ? 'bg-zinc-50/60 opacity-85'
                            : isReady
                            ? 'bg-emerald-50/30'
                            : isInPrep
                            ? 'bg-blue-50/30'
                            : ''
                        }`}
                      >
                        {visibleColumns.itemDish && (
                          <td className={densityPadding}>
                            <div className="font-bold text-[#1d1c17] text-sm">
                              <span className={isReady ? 'line-through text-emerald-800/60' : ''}>
                                {item.product?.name || 'Dish Item'}
                              </span>
                              {item.variant?.name && (
                                <span className="text-[#5f5e5e] text-xs font-normal ml-1">
                                  ({item.variant.name})
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#5f5e5e] font-mono">
                              ID: #{item.id} • {formatElapsedTime(item.createdAt)} ago
                            </span>
                          </td>
                        )}

                        {visibleColumns.ticket && (
                          <td className={`${densityPadding} font-mono font-bold text-[#1d1c17]`}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#ae001a]">#KO-{item.kitchenOrderId}</span>
                              {isOrderClosed && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wider bg-zinc-200 text-zinc-700 border border-zinc-300 px-1 py-0.2 rounded">
                                  <span className="material-symbols-outlined text-[10px]">lock</span>
                                  {item.kitchenOrder?.businessStatus?.toUpperCase() || 'CLOSED'}
                                </span>
                              )}
                            </div>
                            {item.kitchenOrder?.orderId && (
                              <div className="text-[10px] text-[#5f5e5e] font-normal">
                                #ORD-{item.kitchenOrder.orderId}
                              </div>
                            )}
                          </td>
                        )}

                        {visibleColumns.station && (
                          <td className={densityPadding}>
                            <span className="text-xs text-[#5f5e5e] bg-[#f0ebe1] px-2 py-0.5 rounded border border-[#e8e2d8]">
                              {item.kitchenOrder?.stationName || 'Unassigned'}
                            </span>
                          </td>
                        )}

                        {visibleColumns.multiplier && (
                          <td className={`${densityPadding} text-center`}>
                            <span className="inline-block px-2 py-0.5 rounded bg-[#f0ebe1] border border-[#e8e2d8] font-bold text-xs text-[#1d1c17]">
                              {item.quantity}x
                            </span>
                          </td>
                        )}

                        {visibleColumns.progress && (
                          <td className={`${densityPadding} text-center`}>
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono font-bold text-xs text-[#1d1c17]">
                                <span
                                  className={
                                    isReady
                                      ? 'text-emerald-700'
                                      : isInPrep
                                      ? 'text-blue-700'
                                      : 'text-[#1d1c17]'
                                  }
                                >
                                  {item.preparedQuantity}
                                </span>{' '}
                                / {item.quantity}
                              </span>
                              <div className="w-20 bg-[#f0ebe1] h-1.5 rounded-full overflow-hidden mt-1 border border-[#e8e2d8]">
                                <div
                                  className={`h-full ${
                                    isReady ? 'bg-emerald-500' : isInPrep ? 'bg-blue-600' : 'bg-zinc-300'
                                  }`}
                                  style={{
                                    width: `${Math.round((item.preparedQuantity / item.quantity) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        )}

                        {visibleColumns.prepState && (
                          <td className={`${densityPadding} text-center`}>
                            {isReady ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                                <span className="material-symbols-outlined text-xs">check</span>
                                READY
                              </span>
                            ) : isInPrep ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300 uppercase">
                                IN PREP
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8] uppercase">
                                PENDING
                              </span>
                            )}
                          </td>
                        )}

                        {visibleColumns.notes && (
                          <td className={densityPadding}>
                            {item.notes ? (
                              <span className="text-[11px] text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-300 italic">
                                {item.notes}
                              </span>
                            ) : (
                              <span className="text-[#5f5e5e] text-[11px]">—</span>
                            )}
                          </td>
                        )}

                        {visibleColumns.actions && (
                          <td className={`${densityPadding} text-right`}>
                            {isOrderClosed ? (
                              <div className="inline-flex items-center gap-1.5">
                                {item.kitchenOrder?.businessStatus === 'completed' && (
                                  <button
                                    onClick={e => handleRecallOrder(item.kitchenOrderId, item.product?.name, e)}
                                    className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
                                    title="Recall order back to active preparation"
                                  >
                                    <span className="material-symbols-outlined text-xs">undo</span>
                                    <span>Recall</span>
                                  </button>
                                )}
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
                                  <span className="material-symbols-outlined text-xs">lock</span>
                                  {item.kitchenOrder?.businessStatus === 'cancelled' ? 'Cancelled' : 'Closed'}
                                </span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                {item.preparedQuantity > 0 && (
                                  <button
                                    onClick={e => handleDecrement(item, e)}
                                    className="px-2 py-1 bg-[#f0ebe1] hover:bg-[#e4ded5] text-[#1d1c17] border border-[#e8e2d8] rounded text-xs font-bold cursor-pointer"
                                    title="Decrement"
                                  >
                                    -1
                                  </button>
                                )}

                                <button
                                  onClick={e => handleIncrement(item, e)}
                                  className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer ${
                                    isReady
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      : isInPrep
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                      : 'bg-[#ae001a] hover:bg-[#900015] text-white'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-xs">
                                    {isReady ? 'restart_alt' : 'add'}
                                  </span>
                                  <span>{isReady ? 'Cycle' : '+1 Prep'}</span>
                                </button>

                                {!isReady && (
                                  <button
                                    onClick={e => handleMarkAllReady(item, e)}
                                    title="Mark Ready"
                                    className="p-1 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-sm">done_all</span>
                                  </button>
                                )}

                                {isReady && (
                                  <button
                                    onClick={e => handleResetItem(item, e)}
                                    title="Reset to Pending"
                                    className="p-1 text-[#5f5e5e] hover:text-[#1d1c17] hover:bg-[#f0ebe1] rounded cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-sm">restart_alt</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredItems.length}
            onPageChange={setCurrentPage}
          />
            </>
          )}
        </div>
      )}

      {/* QUICK LINKS BANNER */}
      <div className="w-full">
        <KitchenQuickLinks activeTab="kitchen-order-items" onNavigate={onNavigate} />
      </div>

      {/* PERSISTENT BOTTOM NAVIGATION HUB BAR */}
      <NavHubBar
        title="KDS ORDER ITEMS WORKSPACE"
        subtitle="Item-Level Control & Multi-Serve Incrementer"
        activeModuleId="kitchen-order-items"
        onBackToDashboard={() => onNavigate?.('kitchen-kds-hub')}
        backToDashboardLabel="KDS COMMAND HUB"
        items={[
          {
            id: 'kitchen-stations',
            label: 'KITCHEN STATIONS',
            icon: 'soup_kitchen',
            onClick: () => onNavigate?.('kitchen-stations'),
          },
          {
            id: 'kitchen-display-devices',
            label: 'KDS DEVICES',
            icon: 'desktop_windows',
            onClick: () => onNavigate?.('kitchen-display-devices'),
          },
          {
            id: 'kitchen-orders',
            label: 'KITCHEN ORDERS',
            icon: 'receipt_long',
            onClick: () => onNavigate?.('kitchen-orders'),
          },
          {
            id: 'kitchen-order-items',
            label: 'ORDER ITEMS',
            icon: 'lunch_dining',
            active: true,
          },
          {
            id: 'kitchen-event-log',
            label: 'KDS EVENT LOG',
            icon: 'history',
            onClick: () => onNavigate?.('kitchen-event-log'),
          },
          {
            id: 'kitchen-analytics',
            label: 'KDS ANALYTICS',
            icon: 'bar_chart',
            onClick: () => onNavigate?.('kitchen-analytics'),
          },
        ]}
      />
    </div>
  );
};
export default KitchenOrderItemsView;
