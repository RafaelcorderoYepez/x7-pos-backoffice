import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { NavHubBar } from '../../../../shared/NavHubBar';
import { HeaderQuickTabs } from '../../../../shared/HeaderQuickTabs';
import { TableOptionsMenu, TablePaginationFooter, NoColumnsEmptyState, TableEmptyState, type TableDensity } from '../../../../shared/TableOptionsMenu';
import { getDensityPadding } from '../../../../shared/tableOptionsHelpers';
import { KitchenQuickLinks } from './KitchenQuickLinks';
import { useKdsCriticalSla } from '../../../../../lib/kds-sla-config';
import { KitchenDevResetButton } from './KitchenDevResetButton';
import {
  apiRequest,
  unwrapItem,
  unwrapList,
  type MaybeEnvelopedItem,
  type MaybeEnvelopedList,
} from '../../../../../api/http';
import { ApiError } from '../../../../../lib/api-error';

export type KitchenItemPrepStatus = 'held' | 'pending' | 'in_preparation' | 'ready';

export interface KitchenOrderItemDetail {
  id: number;
  kitchenOrderId: number;
  orderItemId?: number | null;
  productId: number;
  variantId?: number | null;
  quantity: number;
  preparedQuantity: number;
  preparationStatus: KitchenItemPrepStatus;
  course?: 'appetizer' | 'main_course' | 'dessert' | 'beverage';
  holdUntil?: string | null;
  firedAt?: string | null;
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

const getItemPrepAction = (course?: string, productName?: string) => {
  const c = (course || '').toLowerCase();
  const n = (productName || '').toLowerCase();

  const isBeverage =
    c === 'beverage' ||
    c === 'drink' ||
    c.includes('bev') ||
    n.includes('latte') ||
    n.includes('coffee') ||
    n.includes('cafe') ||
    n.includes('soda') ||
    n.includes('juice') ||
    n.includes('tea') ||
    n.includes('cocktail') ||
    n.includes('beer') ||
    n.includes('drink') ||
    n.includes('frappe') ||
    n.includes('smoothie') ||
    n.includes('water') ||
    n.includes('wine') ||
    n.includes('liquor') ||
    n.includes('mojito') ||
    n.includes('margarita');

  if (isBeverage) {
    return {
      verb: 'POUR',
      icon: 'local_bar',
      title: 'Start pouring (Move to IN PREP)',
    };
  }

  return {
    verb: 'PREP',
    icon: 'restaurant',
    title: 'Start preparing (Move to IN PREP)',
  };
};

interface KitchenOrderItemsViewProps {
  onNavigate?: (view: string) => void;
}

export const KitchenOrderItemsView: React.FC<KitchenOrderItemsViewProps> = ({ onNavigate }) => {
  const [items, setItems] = useState<KitchenOrderItemDetail[]>([]);
  const [stations, setStations] = useState<KitchenStationOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [criticalSlaMinutes] = useKdsCriticalSla();

  // Filters
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshInterval, setRefreshInterval] = useState<number>(10); // 10s default
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [actionInProgressId, setActionInProgressId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleToggleStatusFilter = (statusKey: string) => {
    if (statusKey === 'ALL') {
      setSelectedStatusFilters([]);
    } else {
      setSelectedStatusFilters(prev =>
        prev.includes(statusKey) ? prev.filter(s => s !== statusKey) : [...prev, statusKey]
      );
    }
    setCurrentPage(1);
  };

  // Real-time clock for elapsed second counters
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' | 'auto_bump' = 'success') => {
    setToastMessage(prev => ({ text, type, id: (prev?.id ?? 0) + 1 }));
  };

  // 1. Fetch stations
  const fetchStations = useCallback(async () => {
    try {
      const data = await apiRequest<
        MaybeEnvelopedList<{ id: number; name: string; stationType?: string; station_type?: string }>
      >('/kitchen-station?status=active&limit=100', { method: 'GET' }, 'Failed to load kitchen stations.');
      setStations(
        unwrapList(data).map((s) => ({
          id: s.id,
          name: s.name,
          stationType: s.stationType || s.station_type,
        })),
      );
    } catch {
      // ignore station fetch error
    }
  }, []);

  // 2. Fetch all kitchen order items
  const loadItems = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setIsRefreshing(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        limit: '100',
        page: '1',
        sortBy: 'createdAt',
        sortOrder: 'ASC',
      });

      const resData = await apiRequest<{ data?: KitchenOrderItemDetail[] }>(
        `/kitchen-order-items?${queryParams.toString()}`,
        { method: 'GET' },
        'Failed to load kitchen order items',
      );
      const rawItems: KitchenOrderItemDetail[] = resData.data || [];
      setItems(rawItems);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      if (!isBackground) {
        const msg = err instanceof Error ? err.message : 'Error loading kitchen items';
        setError(msg);
      }
    } finally {
      if (!isBackground) setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchStations();
      loadItems(false);
    });
  }, [fetchStations, loadItems]);

  // Polling interval
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => {
      loadItems(true);
    }, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval, loadItems]);

  // Listen to global KDS reset event
  useEffect(() => {
    const handleReset = () => {
      loadItems(true);
    };
    window.addEventListener('x7_kds_data_reset', handleReset);
    return () => window.removeEventListener('x7_kds_data_reset', handleReset);
  }, [loadItems]);

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
      let data: { data?: KitchenOrderItemDetail; autoBumped?: boolean } & Partial<KitchenOrderItemDetail>;
      try {
        data = await apiRequest<typeof data>(
          `/kitchen-order-items/${item.id}/increment`,
          { method: 'POST' },
          'Could not update prepared quantity',
        );
      } catch (err) {
        // Fallback only when the increment route is missing (older backends). Any other error is a
        // real rejection: falling back to a PUT would overwrite the count the server refused.
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        const newPrepared = item.preparedQuantity >= item.quantity ? 0 : item.preparedQuantity + 1;
        const newStatus: KitchenItemPrepStatus =
          newPrepared === item.quantity ? 'ready' : newPrepared > 0 ? 'in_preparation' : 'pending';

        const putData = await apiRequest<MaybeEnvelopedItem<KitchenOrderItemDetail>>(
          `/kitchen-order-items/${item.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({ preparedQuantity: newPrepared, preparationStatus: newStatus }),
          },
          'Could not update prepared quantity',
        );
        const fallbackItem = unwrapItem(putData);
        setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...fallbackItem } : it)));
        showToast(
          `${item.product.name}: ${newPrepared}/${item.quantity} Prepared (${newStatus.toUpperCase()})`,
          'info'
        );
        return;
      }

      const updatedItem = unwrapItem(data);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating item quantity';
      showToast(msg, 'warning');
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
      const newPrepared = Math.max(0, item.preparedQuantity - 1);
      // Keep in active preparation (in_preparation); it only returns to pending when you press Undo
      const newStatus: KitchenItemPrepStatus = 'in_preparation';

      const data = await apiRequest<MaybeEnvelopedItem<KitchenOrderItemDetail>>(
        `/kitchen-order-items/${item.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            preparedQuantity: newPrepared,
            preparationStatus: newStatus,
          }),
        },
        'Failed to decrement quantity',
      );
      const updatedItem = unwrapItem(data);
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...updatedItem } : it)));
      showToast(`${item.product.name}: Decremented to ${newPrepared}/${item.quantity}`, 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error decrementing item';
      showToast(msg, 'warning');
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
      const data = await apiRequest<MaybeEnvelopedItem<KitchenOrderItemDetail>>(
        `/kitchen-order-items/${item.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            preparedQuantity: item.quantity,
            preparationStatus: 'ready',
          }),
        },
        'Failed to mark item ready',
      );
      const updatedItem = unwrapItem(data);
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...updatedItem } : it)));
      showToast(`✓ ${item.product.name} (x${item.quantity}) marked READY!`, 'success');

      // Check if ticket might be completed
      loadItems(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error marking item ready';
      showToast(msg, 'warning');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Handle Fire Item (Held -> Pending)
  const handleFireItem = async (item: KitchenOrderItemDetail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (actionInProgressId === item.id) return;

    setActionInProgressId(item.id);
    try {
      const data = await apiRequest<MaybeEnvelopedItem<KitchenOrderItemDetail>>(
        `/kitchen-order-items/${item.id}/fire`,
        { method: 'POST' },
        'Failed to fire item',
      );
      const updatedItem = unwrapItem(data);
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, ...updatedItem, preparationStatus: 'pending' } : it)));
      showToast(`🔥 Fired "${item.product?.name || 'Item'}" to active preparation queue!`, 'success');
      loadItems(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error firing item';
      showToast(msg, 'warning');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Handle Start Item (POUR / PREP / FIRE -> in_preparation)
  const handleStartItem = async (item: KitchenOrderItemDetail, e?: React.MouseEvent) => {
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
      if (item.preparationStatus === 'held') {
        await apiRequest<void>(
          `/kitchen-order-items/${item.id}/fire`,
          { method: 'POST' },
          'Failed to fire item',
        );
        showToast(`🔥 Fired "${item.product?.name || 'Item'}" to active preparation!`, 'success');
      } else {
        await apiRequest<void>(
          `/kitchen-order-items/${item.id}`,
          { method: 'PUT', body: JSON.stringify({ preparationStatus: 'in_preparation' }) },
          'Failed to start item preparation',
        );
        const action = getItemPrepAction(item.course, item.product?.name);
        showToast(`Started ${action.verb.toLowerCase()} for "${item.product?.name || 'Dish'}"`, 'info');
      }

      setItems(prev =>
        prev.map(it =>
          it.id === item.id ? { ...it, preparationStatus: 'in_preparation' } : it
        )
      );
      loadItems(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error starting item';
      showToast(msg, 'warning');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Handle Revert/Undo on an individual item (Ready -> In Prep -> Pending/Held)
  const handleRevertItemToPending = async (item: KitchenOrderItemDetail, e?: React.MouseEvent) => {
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
      const isReadyState = item.preparationStatus === 'ready';

      if (isReadyState) {
        // Ready -> in_preparation
        const targetPreparedQty = Math.max(0, item.quantity - 1);
        const data = await apiRequest<MaybeEnvelopedItem<KitchenOrderItemDetail>>(
          `/kitchen-order-items/${item.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              preparationStatus: 'in_preparation',
              preparedQuantity: targetPreparedQty,
              completedAt: null,
            }),
          },
          'Failed to undo ready status',
        );
        const updatedItem = unwrapItem(data);
        setItems(prev =>
          prev.map(it =>
            it.id === item.id
              ? {
                  ...it,
                  ...updatedItem,
                  preparationStatus: 'in_preparation',
                  preparedQuantity: targetPreparedQty,
                  completedAt: null,
                }
              : it
          )
        );
        showToast(`↩️ "${item.product.name}" returned to In Prep.`, 'info');
      } else {
        // in_preparation -> pending or held
        const isStagedCourse = item.course === 'dessert' || item.course === 'main_course';
        if (isStagedCourse) {
          const data = await apiRequest<MaybeEnvelopedItem<KitchenOrderItemDetail>>(
            `/kitchen-order-items/${item.id}/hold?holdMinutes=10`,
            { method: 'POST' },
            'Failed to hold item',
          );
          const updatedItem = unwrapItem(data);
          setItems(prev =>
            prev.map(it =>
              it.id === item.id
                ? {
                    ...it,
                    ...updatedItem,
                    preparationStatus: 'held',
                    preparedQuantity: 0,
                    startedAt: null,
                    completedAt: null,
                  }
                : it
            )
          );
          showToast(`↩️ "${item.product.name}" returned to Held.`, 'info');
        } else {
          const data = await apiRequest<MaybeEnvelopedItem<KitchenOrderItemDetail>>(
            `/kitchen-order-items/${item.id}`,
            {
              method: 'PUT',
              body: JSON.stringify({
                preparedQuantity: 0,
                preparationStatus: 'pending',
                startedAt: null,
                completedAt: null,
              }),
            },
            'Failed to revert item',
          );
          const updatedItem = unwrapItem(data);
          setItems(prev =>
            prev.map(it =>
              it.id === item.id
                ? {
                    ...it,
                    ...updatedItem,
                    preparedQuantity: 0,
                    preparationStatus: 'pending',
                    startedAt: null,
                    completedAt: null,
                  }
                : it
            )
          );
          showToast(`↩️ REVERTED: "${item.product.name}" returned to queue.`, 'info');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reverting item';
      showToast(msg, 'warning');
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
      await apiRequest<void>(
        `/kitchen-orders/${kitchenOrderId}/recall`,
        { method: 'POST' },
        'Could not recall order. Check server permissions.',
      );

      showToast(`↺ RECALLED #KO-${kitchenOrderId} back to Active Preparation!`, 'info');
      window.dispatchEvent(
        new CustomEvent('x7_kds_data_reset', {
          detail: { action: 'recall', orderId: kitchenOrderId },
        }),
      );
      window.dispatchEvent(new CustomEvent('online_orders_refresh'));
      await loadItems();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error recalling order';
      showToast(msg, 'warning');
    }
  };

  // 3. Computed Metrics & Filtered Data
  const activeItems = useMemo(() => {
    return items.filter(it => {
      const orderStatus = (it.kitchenOrder as { businessStatus?: string } | null | undefined)?.businessStatus?.toLowerCase();
      const logicalOrderStatus = (it.kitchenOrder as { status?: string } | null | undefined)?.status?.toLowerCase();
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
    const held = stationFilteredItems.filter(i => i.preparationStatus === 'held').length;
    const pending = stationFilteredItems.filter(i => i.preparationStatus === 'pending').length;
    const inPrep = stationFilteredItems.filter(i => i.preparationStatus === 'in_preparation').length;
    const ready = stationFilteredItems.filter(i => i.preparationStatus === 'ready').length;
    return { total, held, pending, inPrep, ready };
  }, [stationFilteredItems]);

  // Filter by Tab and Search
  const filteredItems = useMemo(() => {
    let result = stationFilteredItems;

    // Status Multi-Select Filtering
    if (selectedStatusFilters.length > 0) {
      result = result.filter(i => {
        const itemStatus = (i.preparationStatus || '').toUpperCase();
        return selectedStatusFilters.some(st => {
          if (st === 'HELD') return itemStatus === 'HELD';
          if (st === 'PENDING') return itemStatus === 'PENDING';
          if (st === 'IN_PREPARATION') return itemStatus === 'IN_PREPARATION';
          if (st === 'READY') return itemStatus === 'READY';
          return false;
        });
      });
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

    // 1. Group items by kitchen order (kitchenOrderId) to keep orders grouped together
    const orderGroupsMap = new Map<number, {
      kitchenOrderId: number;
      orderId?: number | null;
      stationName?: string | null;
      priority: number;
      businessStatus: string;
      tier: number;
      createdAt: string;
      items: KitchenOrderItemDetail[];
    }>();

    for (const it of result) {
      const orderId = it.kitchenOrderId;
      let grp = orderGroupsMap.get(orderId);
      if (!grp) {
        const orderStatus = it.kitchenOrder?.businessStatus || 'pending';
        const tier = getStatusTier(orderStatus);
        grp = {
          kitchenOrderId: orderId,
          orderId: it.kitchenOrder?.orderId,
          stationName: it.kitchenOrder?.stationName,
          priority: it.kitchenOrder?.priority ?? 0,
          businessStatus: orderStatus,
          tier,
          createdAt: it.createdAt,
          items: [],
        };
        orderGroupsMap.set(orderId, grp);
      }
      grp.items.push(it);
      if (new Date(it.createdAt).getTime() < new Date(grp.createdAt).getTime()) {
        grp.createdAt = it.createdAt;
      }
    }

    const orderGroups = Array.from(orderGroupsMap.values());

    // 2. Sort kitchen orders (Option C):
    // - Tier 1: Active (pending/started) -> Higher VIP priority first, then FIFO (oldest first)
    // - Tier 2: Completed -> newest first
    // - Tier 3: Cancelled -> newest first
    orderGroups.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;

      if (a.tier === 1) {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // 3. Sort line-items WITHIN each kitchen order by operational state:
    // in_preparation > pending > ready > held
    const rankItem = (st: string) => {
      if (st === 'in_preparation') return 1;
      if (st === 'pending') return 2;
      if (st === 'ready') return 3;
      if (st === 'held') return 4;
      return 5;
    };

    for (const grp of orderGroups) {
      grp.items.sort((a, b) => {
        const rA = rankItem(a.preparationStatus);
        const rB = rankItem(b.preparationStatus);
        if (rA !== rB) return rA - rB;
        return a.id - b.id;
      });
    }

    // 4. Flatten the sorted list keeping items of each order together
    const flatItems: KitchenOrderItemDetail[] = [];
    for (const grp of orderGroups) {
      flatItems.push(...grp.items);
    }

    return flatItems;
  }, [stationFilteredItems, selectedStatusFilters, searchQuery]);

  // Groups by order for visual section dividers (Option C)
  const groupedOrderItems = useMemo(() => {
    const groups: Array<{
      kitchenOrderId: number;
      orderId?: number | null;
      stationName?: string | null;
      priority: number;
      businessStatus: string;
      createdAt: string;
      items: KitchenOrderItemDetail[];
    }> = [];

    const map = new Map<number, typeof groups[0]>();

    for (const item of filteredItems) {
      let g = map.get(item.kitchenOrderId);
      if (!g) {
        g = {
          kitchenOrderId: item.kitchenOrderId,
          orderId: item.kitchenOrder?.orderId,
          stationName: item.kitchenOrder?.stationName,
          priority: item.kitchenOrder?.priority ?? 0,
          businessStatus: item.kitchenOrder?.businessStatus || 'pending',
          createdAt: item.createdAt,
          items: [],
        };
        map.set(item.kitchenOrderId, g);
        groups.push(g);
      }
      g.items.push(item);
      if (new Date(item.createdAt).getTime() < new Date(g.createdAt).getTime()) {
        g.createdAt = item.createdAt;
      }
    }

    return groups;
  }, [filteredItems]);

  const toggleGroup = (id: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAllGroups = () => {
    setCollapsedGroups(new Set());
  };

  const collapseAllGroups = () => {
    setCollapsedGroups(new Set(groupedOrderItems.map(g => g.kitchenOrderId)));
  };

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
    const diffSec = Math.max(0, Math.floor((currentTime - start) / 1000));
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

      {/* 1. Header Card Workspace (Title only) */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
              lunch_dining
            </span>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
              KDS ITEM PREPARATION CONTROL &amp; DISPATCH WORKSPACE
            </h2>
          </div>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Atomic line-item tracking, multi-serve partial quantity incrementer, station queues &amp; automated dish dispatch.
          </p>
        </div>
      </div>

      {/* 1.5 Real-Time Summary KPI Banner (4 identical cards to Kitchen Stations in horizontal row) */}
      <div className="grid grid-cols-4 gap-4 w-full">
        {/* KPI 1: Total Line Items */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0 cursor-default">
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
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0 cursor-default">
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
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0 cursor-default">
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
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0 cursor-default">
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

      {/* 2. Canonical Unified Filter Toolbar */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
        {/* Row 1: Search and Station Selector on left, View Switcher + Auto-Refresh on right */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[#5f5e5e]">
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
                className="h-[34px] w-full pl-9 pr-8 text-xs rounded-lg border border-[#d5cfc4] focus:outline-none focus:border-[#ae001a] bg-[#fcfcfb] text-[#1d1c17] placeholder:text-[#8c857b] transition-colors duration-200"
                aria-label="Search kitchen order items"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Station Dropdown Selector (Using 'soup_kitchen' icon) */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="material-symbols-outlined text-base">soup_kitchen</span>
              <select
                value={selectedStationId}
                onChange={e => {
                  setSelectedStationId(
                    e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                  );
                  setCurrentPage(1);
                }}
                className="h-[34px] px-3 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] text-[#1d1c17] focus:outline-none focus:border-[#ae001a] text-xs cursor-pointer max-w-[190px] transition-colors duration-200"
                aria-label="Filter by kitchen station"
              >
                <option value="ALL">All Stations ({stations.length})</option>
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: View Switcher Toggle & Auto-Refresh */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher Toggle */}
            <div className="flex items-center h-[34px] bg-[#f2ede5] p-0.5 rounded-lg border border-[#e8e2d8] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Station Card Grid (Tap-to-Increment)"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'grid' ? 'text-[#ae001a]' : ''}`}>grid_view</span>
                Dish Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Comprehensive Line-Item Table"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'table' ? 'text-[#ae001a]' : ''}`}>table_rows</span>
                Audit Table
              </button>
            </div>

            {/* Canonical Auto Refresh */}
            <div className="flex items-center h-[34px] px-2.5 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] gap-1.5 text-xs text-[#5f5e5e] shrink-0">
              <button
                type="button"
                onClick={() => loadItems(false)}
                disabled={loading || isRefreshing}
                className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
                title="Refresh items now"
              >
                <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin text-[#ae001a]' : ''}`}>
                  sync
                </span>
              </button>
              <select
                value={refreshInterval}
                onChange={e => setRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-[11px] font-semibold text-[#1d1c17] focus:outline-none cursor-pointer h-full"
              >
                <option value={0}>Auto: Off</option>
                <option value={5}>Auto: 5s</option>
                <option value={10}>Auto: 10s</option>
                <option value={30}>Auto: 30s</option>
                <option value={60}>Auto: 60s</option>
              </select>
            </div>

            <div className="hidden sm:flex items-center h-[34px] gap-1 text-[11px] text-[#5f5e5e] pl-1 shrink-0">
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>Updated:</span>
              <span className="font-mono font-bold text-[#1d1c17]">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Row 2: STATUS Pills Strip + Expand/Collapse Buttons */}
        <div className="flex items-center gap-1 pt-2.5 border-t border-[#f0ede6] overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#5f5e5e] shrink-0 mr-0.5">
            STATUS:
          </span>

          {/* All Pill */}
          <button
            type="button"
            onClick={() => handleToggleStatusFilter('ALL')}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
              selectedStatusFilters.length === 0
                ? 'bg-[#1d1c17] text-white border-[#1d1c17] shadow-xs'
                : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
            }`}
          >
            <span>All</span>
            <span
              className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                selectedStatusFilters.length === 0 ? 'bg-white/20 text-white' : 'bg-zinc-100 text-[#5f5e5e]'
              }`}
            >
              {counts.total}
            </span>
          </button>

          {/* HELD Pill (Icon: lock_clock) */}
          <button
            type="button"
            onClick={() => handleToggleStatusFilter('HELD')}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
              selectedStatusFilters.includes('HELD')
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
            }`}
          >
            <span className="material-symbols-outlined text-[12px]">lock_clock</span>
            <span>HELD</span>
            <span
              className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                selectedStatusFilters.includes('HELD') ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {counts.held}
            </span>
          </button>

          {/* PENDING Pill (Icon: schedule) */}
          <button
            type="button"
            onClick={() => handleToggleStatusFilter('PENDING')}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
              selectedStatusFilters.includes('PENDING')
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
            }`}
          >
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            <span>PENDING</span>
            <span
              className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                selectedStatusFilters.includes('PENDING') ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {counts.pending}
            </span>
          </button>

          {/* IN PREPARATION Pill (Icon: play_circle) */}
          <button
            type="button"
            onClick={() => handleToggleStatusFilter('IN_PREPARATION')}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
              selectedStatusFilters.includes('IN_PREPARATION')
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-50'
            }`}
          >
            <span className="material-symbols-outlined text-[12px]">play_circle</span>
            <span>IN PREPARATION</span>
            <span
              className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                selectedStatusFilters.includes('IN_PREPARATION') ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {counts.inPrep}
            </span>
          </button>

          {/* READY Pill (Icon: check_circle) */}
          <button
            type="button"
            onClick={() => handleToggleStatusFilter('READY')}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
              selectedStatusFilters.includes('READY')
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            <span>READY</span>
            <span
              className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                selectedStatusFilters.includes('READY') ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {counts.ready}
            </span>
          </button>

          {/* Expand All / Collapse All Buttons on the right side */}
          {viewMode === 'grid' && (
            <div className="flex items-center gap-1.5 ml-auto shrink-0 pr-0.5">
              <button
                type="button"
                onClick={expandAllGroups}
                className="h-[28px] px-2.5 rounded-lg border border-[#d5cfc4] bg-white text-[#5f5e5e] hover:border-[#ae001a] hover:text-[#ae001a] hover:bg-[#fcfcfb] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                title="Expand all orders"
              >
                <span className="material-symbols-outlined text-[15px]">unfold_more</span>
                <span>Expand All</span>
              </button>
              <button
                type="button"
                onClick={collapseAllGroups}
                className="h-[28px] px-2.5 rounded-lg border border-[#d5cfc4] bg-white text-[#5f5e5e] hover:border-[#ae001a] hover:text-[#ae001a] hover:bg-[#fcfcfb] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                title="Collapse all orders"
              >
                <span className="material-symbols-outlined text-[15px]">unfold_less</span>
                <span>Collapse All</span>
              </button>
            </div>
          )}
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
          <div className="space-y-6">
            {groupedOrderItems.map(group => {
              const readyCount = group.items.filter(i => i.preparationStatus === 'ready').length;
              const inPrepCount = group.items.filter(i => i.preparationStatus === 'in_preparation').length;
              const pendingCount = group.items.filter(i => i.preparationStatus === 'pending').length;
              const heldCount = group.items.filter(i => i.preparationStatus === 'held').length;
              const isCollapsed = collapsedGroups.has(group.kitchenOrderId);

              return (
                <div key={group.kitchenOrderId} className="space-y-3">
                  {/* Visual Order Separator & Header Banner (Option C) */}
                  <div
                    onClick={() => toggleGroup(group.kitchenOrderId)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#f6f2e9] border border-[#e2dcce] rounded-xl shadow-xs cursor-pointer select-none hover:border-[#d5cfc4] transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-xs text-[#ae001a] bg-red-100/90 border border-red-200 px-2.5 py-1 rounded-md">
                        #KO-{group.kitchenOrderId}
                      </span>
                      {group.orderId && (
                        <span className="font-mono text-[11px] font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] px-2 py-0.5 rounded-md">
                          #ORD-{group.orderId}
                        </span>
                      )}
                      {group.priority > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            group.priority >= 3
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : group.priority === 2
                              ? 'bg-red-100 text-[#ae001a] border border-red-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {group.priority >= 3 ? 'VIP (+3)' : group.priority === 2 ? 'URGENT (+2)' : 'HIGH (+1)'}
                        </span>
                      )}
                      {group.stationName && (
                        <span className="text-[10px] font-bold text-[#5f5e5e] bg-white px-2 py-0.5 rounded-md border border-[#e8e2d8]">
                          {group.stationName}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          group.businessStatus === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : group.businessStatus === 'cancelled'
                            ? 'bg-zinc-200 text-zinc-700 border border-zinc-300'
                            : group.businessStatus === 'started'
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {group.businessStatus?.toUpperCase() || 'PENDING'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-bold text-[11px] text-[#1d1c17] bg-white px-2.5 py-1 rounded-md border border-[#e8e2d8]">
                        {group.items.length} {group.items.length === 1 ? 'Dish' : 'Dishes'}
                        <span className="text-[#5f5e5e] font-normal ml-1">
                          ({readyCount > 0 ? `${readyCount} ready` : ''}
                          {readyCount > 0 && inPrepCount > 0 ? ', ' : ''}
                          {inPrepCount > 0 ? `${inPrepCount} in prep` : ''}
                          {(readyCount > 0 || inPrepCount > 0) && pendingCount > 0 ? ', ' : ''}
                          {pendingCount > 0 ? `${pendingCount} pending` : ''}
                          {(readyCount > 0 || inPrepCount > 0 || pendingCount > 0) && heldCount > 0 ? ', ' : ''}
                          {heldCount > 0 ? `${heldCount} held` : ''})
                        </span>
                      </span>
                      <span className="text-[11px] font-mono text-[#5f5e5e] bg-white px-2 py-1 rounded-md border border-[#e8e2d8] flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">schedule</span>
                        {formatElapsedTime(group.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          toggleGroup(group.kitchenOrderId);
                        }}
                        className="p-1 rounded text-[#5f5e5e] hover:text-[#ae001a] hover:bg-black/5 cursor-pointer transition-colors"
                        title={isCollapsed ? 'Expand this order' : 'Collapse this order'}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isCollapsed ? 'expand_more' : 'expand_less'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Cards Grid for this Order */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {group.items.map(item => {
            const isHeld = item.preparationStatus === 'held';
            const isReady = item.preparationStatus === 'ready';
            const isInPrep = item.preparationStatus === 'in_preparation';
            const isPending = !isHeld && !isInPrep && !isReady;
            const isOrderClosed =
              item.kitchenOrder?.businessStatus === 'completed' ||
              item.kitchenOrder?.businessStatus === 'cancelled';
            const itemAction = getItemPrepAction(item.course, item.product?.name);

            const progressPercent = item.quantity > 0
              ? Math.min(100, Math.round((item.preparedQuantity / item.quantity) * 100))
              : 0;

            const isActionLoading = actionInProgressId === item.id;
            const itemAgeMs = Math.max(0, currentTime - new Date(item.createdAt).getTime());
            const isSlaBreached = itemAgeMs >= criticalSlaMinutes * 60 * 1000 && !isOrderClosed && !isReady;

            return (
              <div
                key={item.id}
                onClick={
                  isPending
                    ? e => handleStartItem(item, e)
                    : isInPrep
                    ? e => handleIncrement(item, e)
                    : undefined
                }
                className={`group relative rounded-xl border transition-all select-none flex flex-col justify-between overflow-hidden shadow-xs ${
                  isOrderClosed
                    ? 'bg-zinc-50/80 border-zinc-200 opacity-85 cursor-default'
                    : isReady
                    ? 'bg-emerald-50/40 border-emerald-300 hover:border-emerald-400 cursor-default'
                    : isHeld
                    ? 'bg-amber-50/40 border-dashed border-amber-400 hover:border-amber-500'
                    : isInPrep
                    ? 'bg-blue-50/40 border-blue-300 hover:border-blue-400 cursor-pointer'
                    : 'bg-white border-[#e8e2d8] hover:border-blue-400 hover:shadow-sm cursor-pointer'
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
                          (item.kitchenOrder?.priority ?? 0) >= 3
                            ? 'bg-purple-100 text-purple-800 border border-purple-300'
                            : (item.kitchenOrder?.priority ?? 0) === 2
                            ? 'bg-red-100 text-[#ae001a] border border-red-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {(item.kitchenOrder?.priority ?? 0) >= 3
                          ? 'VIP (+3)'
                          : (item.kitchenOrder?.priority ?? 0) === 2
                          ? 'URGENT (+2)'
                          : 'HIGH (+1)'}
                      </span>
                    )}

                    {/* SLA shield badge */}
                    {isSlaBreached && (
                      <span className="text-[10px] bg-red-600 text-white border border-red-700 px-1.5 py-0.5 rounded font-black tracking-wide flex items-center gap-0.5 shadow-xs animate-pulse">
                        <span className="material-symbols-outlined text-[11px]">shield</span>
                        SLA
                      </span>
                    )}

                    {/* Course badge */}
                    {item.course && (
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                        {item.course.replace('_', ' ')}
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
                    ) : isHeld ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-400 uppercase tracking-wider animate-pulse">
                        <span className="material-symbols-outlined text-xs">lock_clock</span>
                        HELD
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
                  ) : isHeld ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleFireItem(item, e)}
                        disabled={isActionLoading}
                        title={`Fire directly to ${itemAction.verb.toLowerCase()} (In Prep)`}
                        className="h-7 px-3 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white rounded text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                      >
                        <span className="material-symbols-outlined text-sm">local_fire_department</span>
                        <span>FIRE</span>
                      </button>
                    </div>
                  ) : isPending ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleStartItem(item, e)}
                        disabled={isActionLoading}
                        title={itemAction.title}
                        className="h-7 px-3 rounded text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50"
                      >
                        <span className="material-symbols-outlined text-sm">{itemAction.icon}</span>
                        <span>{itemAction.verb}</span>
                      </button>
                    </div>
                  ) : isReady ? (
                    /* When it is READY, only the Undo button is on the right (the READY badge is already on the left) */
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleRevertItemToPending(item, e)}
                        disabled={isActionLoading}
                        title="Revert item to pending (Undo)"
                        className="w-7 h-7 rounded bg-[#f0ebe1] hover:bg-amber-100 text-[#5f5e5e] hover:text-amber-800 border border-[#e8e2d8] hover:border-amber-300 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-xs">undo</span>
                      </button>
                    </div>
                  ) : (
                    /* IN PREP */
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
                        title="Tap to Increment prepared quantity (+1)"
                        className="px-2.5 h-7 rounded text-xs font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <span className="material-symbols-outlined text-xs">add</span>
                        <span>{`+1 ${itemAction.verb === 'POUR' ? 'Pour' : 'Prep'}`}</span>
                      </button>

                      {/* Mark All Ready */}
                      <button
                        onClick={e => handleMarkAllReady(item, e)}
                        disabled={isActionLoading}
                        title="Instantly mark all quantity ready"
                        className="w-7 h-7 rounded bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-800 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-xs font-black">done_all</span>
                      </button>

                      {/* Revert to Queue (Undo) */}
                      {(isInPrep || item.preparedQuantity > 0) && (
                        <button
                          onClick={e => handleRevertItemToPending(item, e)}
                          disabled={isActionLoading}
                          title="Revert to Queue (Undo)"
                          className="w-7 h-7 rounded bg-[#f0ebe1] hover:bg-amber-100 text-[#5f5e5e] hover:text-amber-800 border border-[#e8e2d8] hover:border-amber-300 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xs">undo</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
                    );
                  })}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* VIEW MODE 2: DETAILED TABLE VIEW (Audit & Multi-Item Density) */
        <div className="bg-white border border-[#e8e2d8] rounded-xl shadow-sm relative overflow-hidden">
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
              <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <table className="w-full table-fixed text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="border-b border-[#e8e2d8] bg-[#ece8e0] text-[#5f5e5e] font-sans font-semibold text-label-caps text-xs">
                      {visibleColumns.itemDish && <th className={`${densityPadding} w-auto min-w-[200px]`}>Item / Dish</th>}
                      {visibleColumns.ticket && <th className={`${densityPadding} w-32 min-w-[100px]`}>Ticket</th>}
                      {visibleColumns.station && <th className={`${densityPadding} w-36 min-w-[110px]`}>Station</th>}
                      {visibleColumns.multiplier && <th className={`${densityPadding} text-center w-24 min-w-[70px]`}>Multiplier</th>}
                      {visibleColumns.progress && <th className={`${densityPadding} text-center w-36 min-w-[110px]`}>Progress (Prepared)</th>}
                      {visibleColumns.prepState && <th className={`${densityPadding} text-center w-36 min-w-[110px]`}>Preparation State</th>}
                      {visibleColumns.notes && <th className={`${densityPadding} w-44 min-w-[130px]`}>Notes / Callouts</th>}
                      {visibleColumns.actions && <th className={`${densityPadding} text-right w-28 min-w-[90px]`}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8] text-xs font-sans">
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
                      paginatedItems.map((item, index) => {
                        const isHeld = item.preparationStatus === 'held';
                        const isReady = item.preparationStatus === 'ready';
                        const isInPrep = item.preparationStatus === 'in_preparation';
                        const isPending = !isHeld && !isInPrep && !isReady;
                        const isOrderClosed =
                          item.kitchenOrder?.businessStatus === 'completed' ||
                          item.kitchenOrder?.businessStatus === 'cancelled';
                        const itemAction = getItemPrepAction(item.course, item.product?.name);
                        const isNewOrderGroup = index === 0 || item.kitchenOrderId !== paginatedItems[index - 1].kitchenOrderId;

                        return (
                          <React.Fragment key={item.id}>
                            {isNewOrderGroup && (
                              <tr key={`header-${item.kitchenOrderId}-${index}`} className="bg-[#f6f2e9] border-t-2 border-b border-[#ded5c5]">
                                <td colSpan={activeColSpan} className="px-4 py-2 font-bold text-xs text-[#1d1c17]">
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-[#ae001a] bg-red-100/90 border border-red-200 px-2 py-0.5 rounded text-[11px]">
                                        #KO-{item.kitchenOrderId}
                                      </span>
                                      {item.kitchenOrder?.orderId && (
                                        <span className="text-[#5f5e5e] font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-[#e8e2d8]">
                                          #ORD-{item.kitchenOrder.orderId}
                                        </span>
                                      )}
                                      {item.kitchenOrder?.stationName && (
                                        <span className="text-[10px] text-[#5f5e5e] bg-white px-2 py-0.5 rounded border border-[#e8e2d8]">
                                          {item.kitchenOrder.stationName}
                                        </span>
                                      )}
                                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                        {item.kitchenOrder?.businessStatus?.toUpperCase() || 'PENDING'}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-[#5f5e5e] font-mono flex items-center gap-1">
                                      <span className="material-symbols-outlined text-xs">schedule</span>
                                      Order Elapsed: {formatElapsedTime(item.createdAt)}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr
                              className={`hover:bg-[#f8f3eb] transition-colors ${
                          isOrderClosed
                            ? 'bg-zinc-50/60 opacity-85'
                            : isReady
                            ? 'bg-emerald-50/30'
                            : isHeld
                            ? 'bg-amber-50/30'
                            : isInPrep
                            ? 'bg-blue-50/30'
                            : ''
                        }`}
                      >
                        {visibleColumns.itemDish && (
                          <td className={`${densityPadding} truncate`}>
                            <div className="min-w-0 flex flex-col justify-center">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`font-bold text-[#1d1c17] text-sm truncate ${isReady ? 'line-through text-emerald-800/60' : ''}`} title={item.product?.name}>
                                  {item.product?.name || 'Dish Item'}
                                </span>
                                {item.variant?.name && (
                                  <span className="text-[#5f5e5e] text-xs font-normal shrink-0">
                                    ({item.variant.name})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-[#5f5e5e] font-mono font-normal shrink-0">
                                  #{item.id}
                                </span>
                                {item.course && (
                                  <span className="text-[9px] uppercase font-normal px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                    {item.course.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        )}

                        {visibleColumns.ticket && (
                          <td className={`${densityPadding} font-mono font-normal text-xs text-[#1d1c17]`}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#ae001a]">#KO-{item.kitchenOrderId}</span>
                              {isOrderClosed && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider bg-zinc-200 text-zinc-700 border border-zinc-300 px-1 py-0.2 rounded">
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
                            <span className="inline-block px-2 py-0.5 rounded bg-[#f0ebe1] border border-[#e8e2d8] font-normal text-xs text-[#1d1c17]">
                              {item.quantity}x
                            </span>
                          </td>
                        )}

                        {visibleColumns.progress && (
                          <td className={`${densityPadding} text-center`}>
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono font-normal text-xs text-[#1d1c17]">
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
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                                <span className="material-symbols-outlined text-xs">check</span>
                                READY
                              </span>
                            ) : isHeld ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-400 uppercase">
                                <span className="material-symbols-outlined text-xs">lock_clock</span>
                                HELD
                              </span>
                            ) : isInPrep ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 uppercase">
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
                            ) : isHeld ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={e => handleFireItem(item, e)}
                                  disabled={actionInProgressId === item.id}
                                  className="h-6 px-2.5 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                                  title={`Fire directly to ${itemAction.verb.toLowerCase()} (In Prep)`}
                                >
                                  <span className="material-symbols-outlined text-xs">local_fire_department</span>
                                  <span>Fire</span>
                                </button>
                              </div>
                            ) : isPending ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={e => handleStartItem(item, e)}
                                  disabled={actionInProgressId === item.id}
                                  className="h-6 px-2.5 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 shadow-xs cursor-pointer active:scale-95 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50"
                                  title={itemAction.title}
                                >
                                  <span className="material-symbols-outlined text-xs">{itemAction.icon}</span>
                                  <span>{itemAction.verb}</span>
                                </button>
                              </div>
                            ) : isReady ? (
                              /* When READY, only show Undo button in actions (READY badge is already rendered in prepState column) */
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={e => handleRevertItemToPending(item, e)}
                                  title="Revert to Queue (Undo)"
                                  className="p-1 text-[#5f5e5e] hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-sm">undo</span>
                                </button>
                              </div>
                            ) : (
                              /* IN PREP */
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

                                {/* Primary Tap Increment (+1) */}
                                <button
                                  onClick={e => handleIncrement(item, e)}
                                  className="px-3 py-1 rounded text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                  <span className="material-symbols-outlined text-xs">add</span>
                                  <span>{`+1 ${itemAction.verb === 'POUR' ? 'Pour' : 'Prep'}`}</span>
                                </button>

                                <button
                                  onClick={e => handleMarkAllReady(item, e)}
                                  title="Mark Ready"
                                  className="p-1 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-sm">done_all</span>
                                </button>

                                {(isInPrep || item.preparedQuantity > 0) && (
                                  <button
                                    onClick={e => handleRevertItemToPending(item, e)}
                                    title="Revert to Queue (Undo)"
                                    className="p-1 text-[#5f5e5e] hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-sm">undo</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                        </tr>
                      </React.Fragment>
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
            onClick: () => onNavigate?.('kitchen-order-items'),
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
      {KitchenDevResetButton && <KitchenDevResetButton onResetComplete={() => loadItems(true)} />}
    </div>
  );
};
export default KitchenOrderItemsView;
