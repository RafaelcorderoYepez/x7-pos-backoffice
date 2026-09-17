import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken } from '../../../../../lib/auth-storage';
import { NavHubBar } from '../../../../shared/NavHubBar';
import { HeaderQuickTabs } from '../../../../shared/HeaderQuickTabs';
import { TableOptionsMenu, TablePaginationFooter, NoColumnsEmptyState, TableEmptyState, getDensityPadding, type TableDensity } from '../../../../shared/TableOptionsMenu';
import { AppModal } from '../../../shared/AppModal';
import { KitchenQuickLinks } from './KitchenQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export type KitchenOrderBusinessStatus = 'pending' | 'started' | 'completed' | 'cancelled';

export type KitchenCancellationReason =
  | 'data_entry_error'
  | 'customer_complaint'
  | 'out_of_stock'
  | 'preparation_delay'
  | 'other';

export interface KitchenOrderItemLine {
  id: number;
  kitchenOrderId: number;
  orderItemId?: number | null;
  productId: number;
  productName: string;
  variantName?: string | null;
  quantity: number;
  preparedQuantity: number;
  preparationStatus: 'held' | 'pending' | 'in_preparation' | 'ready';
  course?: 'appetizer' | 'main_course' | 'dessert' | 'beverage';
  holdUntil?: string | null;
  firedAt?: string | null;
  notes?: string | null;
}

export interface KitchenOrderTicket {
  id: number;
  merchantId: number;
  orderId?: number | null;
  onlineOrderId?: number | null;
  stationId?: number | null;
  stationName?: string | null;
  priority: number;
  businessStatus: KitchenOrderBusinessStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: KitchenCancellationReason | null;
  cancelledByUserId?: number | null;
  notes?: string | null;
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
  items: KitchenOrderItemLine[];
}

interface KitchenStationOption {
  id: number;
  name: string;
  stationType?: string;
}

interface KitchenOrdersViewProps {
  onNavigate?: (view: string) => void;
}

const CANCELLATION_REASONS: Array<{ value: KitchenCancellationReason; label: string; description: string }> = [
  {
    value: 'data_entry_error',
    label: 'Data Entry Error / Duplicate',
    description: 'Ticket was registered erroneously or entered multiple times.',
  },
  {
    value: 'customer_complaint',
    label: 'Customer Request / Changed Order',
    description: 'Diner requested order cancellation or changed course.',
  },
  {
    value: 'out_of_stock',
    label: 'Ingredient Out of Stock',
    description: 'Kitchen ran out of key ingredients needed for this dish.',
  },
  {
    value: 'preparation_delay',
    label: 'Excessive Kitchen Delay',
    description: 'Table waited beyond acceptable threshold or station queue overloaded.',
  },
  {
    value: 'other',
    label: 'Other Operational Incident',
    description: 'Unspecified kitchen or hardware reason logged in shift report.',
  },
];

const DATE_RANGE_TABS: Array<{
  id: 'all' | 'today' | 'yesterday' | 'week' | 'custom';
  label: string;
  dot?: boolean;
}> = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today', dot: true },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'Last 7 Days' },
  { id: 'custom', label: 'Custom Date Range' },
];

const DEFAULT_MENU_PRODUCTS = [
  'Smash Burger Doble',
  'Ensalada Caesar con Pollo',
  'Pizza Margherita',
  'Tacos al Pastor (3 uds)',
  'Sushi Roll California',
  'Cappuccino Italiano 12oz',
  'Iced Latte',
  'Croissant de Mantequilla',
];

const DEFAULT_PRODUCT_VARIANTS: Record<string, string[]> = {
  'Smash Burger Doble': [
    'Con Queso Cheddar',
    'Doble Carne & Queso',
    'Con Papas Fritas',
    'Sin Cebolla',
  ],
  'Ensalada Caesar con Pollo': [
    'Con Pollo a la Plancha',
    'Con Pollo Crispy',
    'No Croutons (Gluten Free)',
  ],
  'Pizza Margherita': [
    'Mediana 12"',
    'Familiar 16"',
    'Queso Extra',
  ],
  'Tacos al Pastor (3 uds)': [
    'Tradicionales',
    'Con Queso (Gringas)',
    'No Pineapple',
  ],
  'Sushi Roll California': [
    'Roll 8 Piezas',
    'Roll 12 Piezas',
    'Picante (Spicy Sriracha)',
  ],
  'Cappuccino Italiano 12oz': [
    'Mediano 12oz',
    'Grande 16oz',
    'Leche de Almendras',
    'Leche Entera',
  ],
  'Iced Latte': [
    'Iced Latte Regular',
    'Iced Latte Almond Premium',
  ],
  'Croissant de Mantequilla': [
    'Natural',
    'Ham & Cheese Filling',
    'Relleno de Chocolate',
  ],
};

const suggestCourseForProduct = (productName: string): 'beverage' | 'appetizer' | 'main_course' | 'dessert' => {
  const p = (productName || '').toLowerCase().trim();
  if (
    p.includes('cappuccino') || p.includes('latte') || p.includes('cafe') || p.includes('coffee') ||
    p.includes('espresso') || p.includes('tea') || p.includes('tea') || p.includes('beer') ||
    p.includes('cerveza') || p.includes('vino') || p.includes('wine') || p.includes('soda') ||
    p.includes('juice') || p.includes('jugo') || p.includes('water') || p.includes('agua') ||
    p.includes('cocktail') || p.includes('drink') || p.includes('beverage') || p.includes('limonada')
  ) {
    return 'beverage';
  }
  if (
    p.includes('cake') || p.includes('torta') || p.includes('pastel') || p.includes('helado') ||
    p.includes('ice cream') || p.includes('dessert') || p.includes('postre') || p.includes('pie') ||
    p.includes('brownie') || p.includes('cheesecake') || p.includes('croissant')
  ) {
    return 'dessert';
  }
  if (
    p.includes('salad') || p.includes('ensalada') || p.includes('bruschetta') || p.includes('nacho') ||
    p.includes('soup') || p.includes('sopa') || p.includes('wings') || p.includes('alitas') ||
    p.includes('calamari') || p.includes('fries') || p.includes('papas') || p.includes('carpaccio') ||
    p.includes('taco') || p.includes('sushi') || p.includes('roll')
  ) {
    return 'appetizer';
  }
  return 'main_course';
};

export const KitchenOrdersView: React.FC<KitchenOrdersViewProps> = ({ onNavigate }) => {
  const [orders, setOrders] = useState<KitchenOrderTicket[]>([]);
  const [stations, setStations] = useState<KitchenStationOption[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<string[]>(DEFAULT_MENU_PRODUCTS);
  const [productVariantsMap, setProductVariantsMap] = useState<Record<string, string[]>>(DEFAULT_PRODUCT_VARIANTS);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Workspace Mode (Live Bump Screen vs Historical Audit Table)
  const [workspaceMode, setWorkspaceMode] = useState<'bump' | 'audit'>('bump');

  // Multi-Filter Matrix
  const [selectedStationId, setSelectedStationId] = useState<number | 'ALL'>(() => {
    const saved = sessionStorage.getItem('kds_selected_station_filter');
    if (saved) {
      sessionStorage.removeItem('kds_selected_station_filter');
      return saved === 'ALL' ? 'ALL' : Number(saved) || 'ALL';
    }
    return 'ALL';
  });
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'started' | 'completed' | 'cancelled'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    const saved = sessionStorage.getItem('kds_orders_search_query');
    if (saved) {
      sessionStorage.removeItem('kds_orders_search_query');
      return saved;
    }
    return '';
  });
  const [dateRangePreset, setDateRangePreset] = useState<'all' | 'today' | 'yesterday' | 'week' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [cancellationFilter, setCancellationFilter] = useState<'ALL' | KitchenCancellationReason>('ALL');

  // Table options
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    orderRef: true,
    stationPriority: true,
    lifecycleStatus: true,
    createdTimestamp: true,
    startedDelay: true,
    completedPrepTime: true,
    cancellationAudit: true,
    items: true,
    actions: true,
  });

  // Cancellation Modal
  const [cancellingTicket, setCancellingTicket] = useState<KitchenOrderTicket | null>(null);
  const [selectedReason, setSelectedReason] = useState<KitchenCancellationReason>('data_entry_error');
  const [cancellationNotes, setCancellationNotes] = useState<string>('');
  const [cancelSubmitting, setCancelSubmitting] = useState<boolean>(false);

  // Detail Inspection Modal (Audit Trail & Line-Items)
  const [inspectingTicket, setInspectingTicket] = useState<KitchenOrderTicket | null>(null);

  // Create Order Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [formStationId, setFormStationId] = useState<string>('');
  const [formPriority, setFormPriority] = useState<number>(0);
  const [formOrderId, setFormOrderId] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formItems, setFormItems] = useState<
    Array<{
      productName: string;
      variantName: string;
      quantity: number;
      course: 'beverage' | 'appetizer' | 'main_course' | 'dessert';
      notes: string;
      isCustomProduct?: boolean;
      isCustomVariant?: boolean;
    }>
  >([
    { productName: '', variantName: '', quantity: 1, course: 'main_course', notes: '' }
  ]);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Recall last bumped order
  const [lastBumpedOrder, setLastBumpedOrder] = useState<KitchenOrderTicket | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Real-time clock for elapsed second counters
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Toast auto-hide
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
  };

  // 1. Fetch stations & products catalog
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const res = await fetch(`${API_BASE}/kitchen-station?status=active&limit=100`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        const rawList = data.data || data || [];
        setStations(
          rawList.map((s: any) => ({
            id: s.id,
            name: s.name,
            stationType: s.stationType || s.station_type,
          }))
        );
      } catch {
        // ignore error
      }
    };

    const fetchProducts = async () => {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const [prodRes, varRes] = await Promise.all([
          fetch(`${API_BASE}/products?limit=150`, { headers }).catch(() => null),
          fetch(`${API_BASE}/variants?limit=200`, { headers }).catch(() => null),
        ]);

        const newMap: Record<string, string[]> = { ...DEFAULT_PRODUCT_VARIANTS };
        const productNames: string[] = [];

        if (prodRes && prodRes.ok) {
          const data = await prodRes.json();
          const rawList = data.data || data || [];
          rawList.forEach((p: any) => {
            if (p?.name && typeof p.name === 'string' && p.name.trim().length > 0) {
              productNames.push(p.name);
              if (Array.isArray(p.variants) && p.variants.length > 0) {
                const varNames = p.variants
                  .map((v: any) => v.name)
                  .filter((n: any) => typeof n === 'string' && n.trim().length > 0);
                if (varNames.length > 0) {
                  newMap[p.name] = Array.from(new Set([...(newMap[p.name] || []), ...varNames]));
                }
              }
            }
          });
        }

        if (varRes && varRes.ok) {
          const varData = await varRes.json();
          const varList = varData.data || varData || [];
          varList.forEach((v: any) => {
            const pName = v.product?.name;
            if (pName && v.name) {
              if (!newMap[pName]) {
                newMap[pName] = [];
              }
              if (!newMap[pName].includes(v.name)) {
                newMap[pName].push(v.name);
              }
            }
          });
        }

        if (productNames.length > 0) {
          setCatalogProducts(Array.from(new Set([...productNames, ...DEFAULT_MENU_PRODUCTS])));
        }
        setProductVariantsMap(newMap);
      } catch {
        // keep default catalog products
      }
    };

    fetchStations();
    fetchProducts();
  }, []);

  // 2. Fetch all orders
  const loadOrders = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setRefreshing(true);
    setLoadError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params = new URLSearchParams({
        limit: '100',
        page: '1',
      });

      const res = await fetch(`${API_BASE}/kitchen-orders?${params.toString()}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to load orders: ${res.statusText}`);
      }

      const resData = await res.json();
      const rawOrders = resData.data || resData || [];

      const parsedOrders: KitchenOrderTicket[] = rawOrders.map((o: any) => ({
        id: o.id,
        merchantId: o.merchantId || o.merchant_id,
        orderId: o.orderId || o.order_id || null,
        onlineOrderId: o.onlineOrderId || o.online_order_id || null,
        stationId: o.stationId || o.station_id || o.station?.id || null,
        stationName: o.stationName || o.station?.name || null,
        priority: o.priority ?? 0,
        businessStatus: o.businessStatus || o.business_status || 'pending',
        startedAt: o.startedAt || o.started_at || null,
        completedAt: o.completedAt || o.completed_at || null,
        cancelledAt: o.cancelledAt || o.cancelled_at || null,
        cancellationReason: o.cancellationReason || o.cancellation_reason || null,
        cancelledByUserId: o.cancelledByUserId || o.cancelled_by_user_id || null,
        notes: o.notes || null,
        status: o.status || 'active',
        createdAt: o.createdAt || o.created_at || new Date().toISOString(),
        updatedAt: o.updatedAt || o.updated_at || new Date().toISOString(),
        items: (o.kitchenOrderItems || []).map((it: any) => ({
          id: it.id,
          kitchenOrderId: it.kitchenOrderId || it.kitchen_order_id || o.id,
          orderItemId: it.orderItemId || it.order_item_id || null,
          productId: it.productId || it.product_id || it.product?.id,
          productName: it.product?.name || it.productName || 'Dish Item',
          variantName: it.variant?.name || it.variantName || null,
          quantity: it.quantity ?? 1,
          preparedQuantity: it.preparedQuantity ?? it.prepared_quantity ?? 0,
          preparationStatus: it.preparationStatus || it.preparation_status || 'pending',
          course: it.course || null,
          holdUntil: it.holdUntil || it.hold_until || null,
          firedAt: it.firedAt || it.fired_at || null,
          notes: it.notes || null,
        })),
      }));

      setOrders(parsedOrders);
      setLastUpdated(new Date());
    } catch (e: any) {
      setLoadError(e.message || 'Error syncing kitchen orders');
      showToast(e.message || 'Error syncing kitchen orders', 'warning');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Polling interval
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => loadOrders(true), autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval]);

  // Station Filtered pool for KPI metrics
  const stationOrders = useMemo(() => {
    if (selectedStationId === 'ALL') return orders;
    return orders.filter(o => o.stationId === selectedStationId);
  }, [orders, selectedStationId]);

  // Real-time calculation: Average Preparation Time (completed_at - created_at)
  const avgPreparationTime = useMemo(() => {
    const completedList = stationOrders.filter(
      o => o.businessStatus === 'completed' && o.completedAt && o.createdAt
    );
    if (completedList.length === 0) {
      return { formatted: '--', rawSeconds: 0, isBottleneck: false };
    }

    let totalDurationSeconds = 0;
    completedList.forEach(o => {
      const startMs = new Date(o.createdAt).getTime();
      const endMs = new Date(o.completedAt!).getTime();
      const durationSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
      totalDurationSeconds += durationSec;
    });

    const avgSec = Math.round(totalDurationSeconds / completedList.length);
    const mins = Math.floor(avgSec / 60);
    const secs = avgSec % 60;
    const formatted = `${mins}m ${secs.toString().padStart(2, '0')}s`;
    const isBottleneck = avgSec > 15 * 60; // > 15 minutes bottleneck
    return { formatted, rawSeconds: avgSec, isBottleneck, count: completedList.length };
  }, [stationOrders]);

  // Counts for KPI Strip
  const activeOrdersCount = useMemo(
    () => stationOrders.filter(o => o.businessStatus === 'pending' || o.businessStatus === 'started').length,
    [stationOrders]
  );
  const pendingOrdersCount = useMemo(
    () => stationOrders.filter(o => o.businessStatus === 'pending').length,
    [stationOrders]
  );
  const inPrepCount = useMemo(
    () => stationOrders.filter(o => o.businessStatus === 'started').length,
    [stationOrders]
  );
  const completedOrdersCount = useMemo(
    () => stationOrders.filter(o => o.businessStatus === 'completed').length,
    [stationOrders]
  );
  const cancelledOrdersCount = useMemo(
    () => stationOrders.filter(o => o.businessStatus === 'cancelled').length,
    [stationOrders]
  );
  const criticalOrdersCount = useMemo(() => {
    return stationOrders.filter(o => {
      if (o.businessStatus !== 'pending' && o.businessStatus !== 'started') return false;
      const refTime = o.startedAt ? new Date(o.startedAt).getTime() : new Date(o.createdAt).getTime();
      const elapsedMinutes = (currentTime - refTime) / (1000 * 60);
      return elapsedMinutes > 15;
    }).length;
  }, [stationOrders, currentTime]);

  // Segmented Date Range Counts (Image 2 style)
  const dateCounts = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    let base = stationOrders;
    if (statusFilter !== 'ALL') {
      base = base.filter(o => o.businessStatus === statusFilter);
    }
    if (cancellationFilter !== 'ALL') {
      base = base.filter(
        o => o.businessStatus === 'cancelled' && o.cancellationReason === cancellationFilter
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        o =>
          (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
          (o.displayId && o.displayId.toLowerCase().includes(q)) ||
          (o.sourceOrderId && o.sourceOrderId.toLowerCase().includes(q))
      );
    }

    let todayCount = 0;
    let yesterdayCount = 0;
    let weekCount = 0;
    let customCount = 0;

    base.forEach(o => {
      const t = new Date(o.createdAt).getTime();
      if (t >= todayStart) todayCount++;
      if (t >= yesterdayStart && t < todayStart) yesterdayCount++;
      if (t >= weekStart) weekCount++;
      if (customStartDate || customEndDate) {
        let matchCustom = true;
        if (customStartDate) {
          matchCustom = matchCustom && t >= new Date(`${customStartDate}T00:00:00`).getTime();
        }
        if (customEndDate) {
          matchCustom = matchCustom && t <= new Date(`${customEndDate}T23:59:59`).getTime();
        }
        if (matchCustom) customCount++;
      }
    });

    return {
      all: base.length,
      today: todayCount,
      yesterday: yesterdayCount,
      week: weekCount,
      custom: customCount,
    };
  }, [stationOrders, statusFilter, cancellationFilter, searchQuery, customStartDate, customEndDate]);

  // Multi-Filter Matrix Evaluation
  const filteredOrders = useMemo(() => {
    let result = stationOrders;

    // 1. Status Filter
    if (statusFilter !== 'ALL') {
      result = result.filter(o => o.businessStatus === statusFilter);
    }

    // 2. Cancellation Reason Filter (Audit)
    if (cancellationFilter !== 'ALL') {
      result = result.filter(
        o => o.businessStatus === 'cancelled' && o.cancellationReason === cancellationFilter
      );
    }

    // 3. Date Range Filter
    if (dateRangePreset !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
      const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

      if (dateRangePreset === 'today') {
        result = result.filter(o => new Date(o.createdAt).getTime() >= todayStart);
      } else if (dateRangePreset === 'yesterday') {
        result = result.filter(o => {
          const t = new Date(o.createdAt).getTime();
          return t >= yesterdayStart && t < todayStart;
        });
      } else if (dateRangePreset === 'week') {
        result = result.filter(o => new Date(o.createdAt).getTime() >= weekStart);
      } else if (dateRangePreset === 'custom' && (customStartDate || customEndDate)) {
        if (customStartDate) {
          const s = new Date(`${customStartDate}T00:00:00`).getTime();
          result = result.filter(o => new Date(o.createdAt).getTime() >= s);
        }
        if (customEndDate) {
          const e = new Date(`${customEndDate}T23:59:59`).getTime();
          result = result.filter(o => new Date(o.createdAt).getTime() <= e);
        }
      }
    }

    // 4. Universal Search Input
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(o => {
        const idMatch = `#ko-${o.id}`.toLowerCase().includes(q) || String(o.id).includes(q);
        const ordMatch = o.orderId ? `#ord-${o.orderId}`.toLowerCase().includes(q) : false;
        const onlMatch = o.onlineOrderId ? `#onl-${o.onlineOrderId}`.toLowerCase().includes(q) : false;
        const notesMatch = o.notes ? o.notes.toLowerCase().includes(q) : false;
        const stationMatch = o.stationName ? o.stationName.toLowerCase().includes(q) : false;
        const itemsMatch = o.items.some(
          it =>
            it.productName.toLowerCase().includes(q) ||
            (it.variantName && it.variantName.toLowerCase().includes(q)) ||
            (it.notes && it.notes.toLowerCase().includes(q))
        );
        return idMatch || ordMatch || onlMatch || notesMatch || stationMatch || itemsMatch;
      });
    }

    // 5. Dynamic Sorting (Option 1):
    // Tier 1: Active Orders (pending / started) -> At the top, FIFO (oldest createdAt first), priority RUSH first
    // Tier 2: Completed Orders (completed) -> Below active orders, newest completedAt first
    // Tier 3: Cancelled Orders (cancelled) -> At the very bottom, newest cancelledAt/createdAt first
    const getStatusTier = (status: KitchenOrderBusinessStatus): number => {
      switch (status) {
        case 'pending':
        case 'started':
          return 1;
        case 'completed':
          return 2;
        case 'cancelled':
          return 3;
        default:
          return 4;
      }
    };

    return [...result].sort((a, b) => {
      const tierA = getStatusTier(a.businessStatus);
      const tierB = getStatusTier(b.businessStatus);

      if (tierA !== tierB) {
        return tierA - tierB;
      }

      // Tier 1: Active orders (pending / started)
      // Regla de Negocio: SLA Critical Shield (>= 15 min de espera) + Dynamic Priority Score
      if (tierA === 1) {
        const now = Date.now();
        const elapsedMinsA = Math.max(0, Math.floor((now - new Date(a.createdAt).getTime()) / 60000));
        const elapsedMinsB = Math.max(0, Math.floor((now - new Date(b.createdAt).getTime()) / 60000));

        // 1. SLA Shield: Órdenes críticas (>= 15 min esperando) adquieren inmunidad frente a adelantamientos
        const isCriticalA = elapsedMinsA >= 15;
        const isCriticalB = elapsedMinsB >= 15;

        if (isCriticalA && !isCriticalB) return -1; // Orden A en demora crítica se atiende primero
        if (!isCriticalA && isCriticalB) return 1;  // Orden B en demora crítica se atiende primero
        if (isCriticalA && isCriticalB) {
          // Si ambas están en estado crítico, FIFO estricto (la más antigua primero)
          return elapsedMinsB - elapsedMinsA;
        }

        // 2. Cocción en marcha ('started') no se interrumpe por una nueva orden en cola ('pending')
        if (a.businessStatus === 'started' && b.businessStatus === 'pending') return -1;
        if (a.businessStatus === 'pending' && b.businessStatus === 'started') return 1;

        // 3. Dynamic Priority Score ponderado por edad para órdenes regulares (< 15 min):
        // Puntos = (Prioridad * 10) + (Minutos de espera * 1.5)
        const scoreA = (a.priority * 10) + (elapsedMinsA * 1.5);
        const scoreB = (b.priority * 10) + (elapsedMinsB * 1.5);

        if (Math.abs(scoreB - scoreA) > 0.01) {
          return scoreB - scoreA;
        }

        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      // Tier 2: Completed orders -> Oldest first (oldest on top among completed, just below active orders)
      if (tierA === 2) {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.createdAt).getTime();
        return timeA - timeB;
      }

      // Tier 3: Cancelled orders -> Oldest first at the bottom
      const timeA = a.cancelledAt ? new Date(a.cancelledAt).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.cancelledAt ? new Date(b.cancelledAt).getTime() : new Date(b.createdAt).getTime();
      return timeA - timeB;
    });
  }, [stationOrders, statusFilter, cancellationFilter, dateRangePreset, customStartDate, customEndDate, searchQuery]);

  // Paginated records for table view
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const activeColSpan = Object.values(visibleColumns).filter(Boolean).length;
  const densityPadding = getDensityPadding(rowDensity);

  // Actions
  const handleStartPrep = async (order: KitchenOrderTicket) => {
    try {
      const token = getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/kitchen-orders/${order.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ businessStatus: 'started' }),
      });

      if (res.ok) {
        const nowIso = new Date().toISOString();
        setOrders(prev =>
          prev.map(o => (o.id === order.id ? { ...o, businessStatus: 'started', startedAt: nowIso } : o))
        );
        showToast(`Order #KO-${order.id} STARTED preparation`, 'info');
      }
    } catch {
      showToast('Error starting order preparation', 'warning');
    }
  };

  const handleBumpOrder = async (order: KitchenOrderTicket) => {
    try {
      const token = getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/kitchen-orders/${order.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ businessStatus: 'completed' }),
      });

      if (res.ok) {
        const nowIso = new Date().toISOString();
        const updatedItems = (order.items || []).map(it => ({
          ...it,
          preparationStatus: 'ready' as const,
          preparedQuantity: it.quantity,
        }));
        setLastBumpedOrder({
          ...order,
          businessStatus: 'completed',
          completedAt: nowIso,
          items: updatedItems,
        });
        setOrders(prev =>
          prev.map(o =>
            o.id === order.id
              ? {
                  ...o,
                  businessStatus: 'completed',
                  completedAt: nowIso,
                  items: updatedItems,
                }
              : o
          )
        );
        showToast(`Order #KO-${order.id} BUMPED (Completed)`, 'success');
      }
    } catch {
      showToast('Error bumping order', 'warning');
    }
  };

  const handleRecallOrder = async () => {
    if (!lastBumpedOrder) return;
    try {
      const token = getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/kitchen-orders/${lastBumpedOrder.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ businessStatus: 'started', completedAt: null }),
      });

      if (res.ok) {
        const resetItems = (lastBumpedOrder.items || []).map(it => ({
          ...it,
          preparationStatus: 'in_preparation' as const,
          preparedQuantity: 0,
        }));
        setOrders(prev =>
          prev.map(o =>
            o.id === lastBumpedOrder.id
              ? {
                  ...o,
                  businessStatus: 'started',
                  completedAt: null,
                  items: resetItems,
                }
              : o
          )
        );
        showToast(`RECALLED #KO-${lastBumpedOrder.id} to Active Line`, 'info');
        setLastBumpedOrder(null);
      }
    } catch {
      showToast('Error recalling order', 'warning');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingTicket) return;
    try {
      setCancelSubmitting(true);
      const token = getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/kitchen-orders/${cancellingTicket.id}/cancel`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          reason: selectedReason,
          notes: cancellationNotes || undefined,
        }),
      });

      if (res.ok) {
        setOrders(prev =>
          prev.map(o =>
            o.id === cancellingTicket.id
              ? {
                  ...o,
                  businessStatus: 'cancelled',
                  cancellationReason: selectedReason,
                  cancelledAt: new Date().toISOString(),
                }
              : o
          )
        );
        showToast(`Order #KO-${cancellingTicket.id} CANCELLED (${selectedReason})`, 'warning');
        setCancellingTicket(null);
        setCancellationNotes('');
      } else {
        const errJson = await res.json().catch(() => null);
        const msg = Array.isArray(errJson?.message)
          ? errJson.message[0]
          : (errJson?.message || 'Failed to cancel order');
        showToast(msg, 'warning');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error cancelling order', 'warning');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Format Elapsed Time
  const formatDuration = (startIso?: string | null, endIso?: string | null): string => {
    if (!startIso) return '--';
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : currentTime;
    const sec = Math.max(0, Math.floor((end - start) / 1000));
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${mins}m ${remSec.toString().padStart(2, '0')}s`;
  };

  const formatDateClock = (isoStr?: string | null): string => {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-20">
      <div ref={topRef} />

      {/* FLOATING TOAST ALERT */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-bounce transition-all duration-300">
          <div
            className={`flex items-center gap-3 px-5 py-3 rounded-lg shadow-xl text-white text-sm font-semibold tracking-wide border ${
              toastMessage.type === 'success'
                ? 'bg-[#059669] border-emerald-400'
                : toastMessage.type === 'warning'
                ? 'bg-[#b91c1c] border-red-400'
                : 'bg-[#1e293b] border-slate-600'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {toastMessage.type === 'success' ? 'check_circle' : toastMessage.type === 'warning' ? 'block' : 'info'}
            </span>
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-3 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 1. Header Card Workspace (Title only) */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            KITCHEN ORDERS &amp; HISTORICAL AUDIT WORKSPACE
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Multi-filter inspection matrix, preparation bottleneck analysis &amp; complete timestamp audit trail.
          </p>
        </div>
      </div>

      {/* 1.5 Real-Time Summary KPI Banner (4 identical cards to Kitchen Stations without text clipping) */}
      <div className="grid grid-cols-4 gap-4 w-full">
        {/* KPI 1: Active Kitchen Orders */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-red-100 text-[#ae001a] border border-red-200 shrink-0 whitespace-nowrap">
            ACTIVE
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-red-50 text-[#ae001a] flex items-center justify-center border border-red-200 shrink-0">
              <span className="material-symbols-outlined text-xl">receipt_long</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-14 sm:pr-16">
                Active Orders
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : activeOrdersCount}
              </div>
            </div>
          </div>
        </div>

        {/* KPI 2: Avg Preparation Time */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0">
          <span className={`absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase border shrink-0 whitespace-nowrap ${
            avgPreparationTime.isBottleneck ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-200'
          }`}>
            {avgPreparationTime.isBottleneck ? '> 15M DELAY' : 'ON TIME'}
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${
              avgPreparationTime.isBottleneck ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              <span className="material-symbols-outlined text-xl">alarm</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-20 sm:pr-24">
                Avg Prep Time
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {avgPreparationTime.formatted}
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Cancellation Count */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-200 shrink-0 whitespace-nowrap">
            {cancelledOrdersCount > 0 ? 'VOID/WASTE' : 'ZERO VOIDS'}
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <span className="material-symbols-outlined text-xl">block</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-20 sm:pr-24">
                Cancellations
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : cancelledOrdersCount}
              </div>
            </div>
          </div>
        </div>

        {/* KPI 4: Dispatched Orders */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
            DISPATCHED
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">done_all</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-20 sm:pr-22">
                Dispatched
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : completedOrdersCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Multi-criteria Toolbar identical to Kitchen Devices */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4 mb-6">
        {/* Row 1: Search on left and View Switcher on right (identical to Kitchen Devices) */}
        <div className="flex flex-row items-center justify-between gap-3 w-full">
          <div className="relative flex-1 min-w-0">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e] font-sans">
              search
            </span>
            <input
              type="text"
              placeholder="Search #KO-{id}, POS #ORD, #ONL, dish..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
              aria-label="Search kitchen orders"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5f5e5e] hover:text-[#1d1c17] text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* View Switcher Toggle & Auto-Refresh al lado derecho */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher Toggle (Same design and color as Kitchen Devices) */}
            <div className="flex items-center bg-[#f2ede5] p-1 rounded border border-[#e8e2d8] shrink-0">
              <button
                type="button"
                onClick={() => setWorkspaceMode('bump')}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  workspaceMode === 'bump'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Interactive Real-Time Kitchen Bump Screen"
              >
                <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                Live Bump Screen
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode('audit')}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  workspaceMode === 'audit'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Historical Inspection & Bottleneck Table"
              >
                <span className="material-symbols-outlined text-[16px]">table_rows</span>
                Historical Audit Table
              </button>
            </div>

            {/* Auto Refresh al lado derecho */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs text-[#5f5e5e] shrink-0 h-[38px]">
              <span className="material-symbols-outlined text-sm text-[#5f5e5e]">sync</span>
              <span className="text-[11px] font-bold text-[#5f5e5e] uppercase">Auto:</span>
              <select
                value={autoRefreshInterval}
                onChange={e => setAutoRefreshInterval(Number(e.target.value))}
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

        {/* Row 2: Date Range Tabs (Segmented Pill Buttons in middle, between Search and Filters) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {DATE_RANGE_TABS.map(tab => {
              const isActive = dateRangePreset === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setDateRangePreset(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-[#ae001a] text-white shadow-xs'
                      : 'text-[#5f5e5e] hover:text-[#1d1c17] hover:bg-[#f2ede5]'
                  }`}
                >
                  {tab.dot && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive ? 'bg-white' : 'bg-emerald-500 animate-pulse'
                      }`}
                    />
                  )}
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      isActive ? 'bg-white text-[#ae001a]' : 'bg-[#e8e2d8] text-[#5f5e5e]'
                    }`}
                  >
                    {dateCounts[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs when Custom Date Range is selected */}
          {dateRangePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-[#fef9f1] px-3 py-1.5 rounded border border-[#e8e2d8] text-xs">
              <span className="font-bold text-[#1d1c17] text-[11px] uppercase tracking-wider">Range:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[#5f5e5e] text-[11px]">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => {
                    setCustomStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-[#e8e2d8] rounded px-2 py-0.5 text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#5f5e5e] text-[11px]">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => {
                    setCustomEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-[#e8e2d8] rounded px-2 py-0.5 text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                    setCurrentPage(1);
                  }}
                  className="text-xs text-[#ae001a] hover:underline font-bold cursor-pointer ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 3: Filters on left and Action Buttons on right on SAME line */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Izquierda: Filtros desplegables */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Station Filter */}
            <select
              value={selectedStationId}
              onChange={e => {
                setSelectedStationId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by kitchen station"
            >
              <option value="ALL">All Stations</option>
              {stations.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by order status"
            >
              <option value="ALL">All Status</option>
              <option value="pending">Pending</option>
              <option value="started">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Cancellation Reasons Filter */}
            {(statusFilter === 'cancelled' || workspaceMode === 'audit') && (
              <select
                value={cancellationFilter}
                onChange={e => setCancellationFilter(e.target.value as any)}
                className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
                aria-label="Filter by cancellation reason"
              >
                <option value="ALL">All Cancellation Reasons</option>
                {CANCELLATION_REASONS.map(r => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Create Order Button */}
            <button
              type="button"
              onClick={() => {
                setFormStationId(stations[0]?.id ? String(stations[0].id) : '');
                setFormOrderId('');
                setFormNotes('');
                setFormPriority(0);
                setFormItems([{ productName: '', variantName: '', quantity: 1, course: 'main_course', notes: '' }]);
                setCreateError(null);
                setIsCreateModalOpen(true);
              }}
              className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
              title="Create new kitchen ticket"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              CREATE ORDER
            </button>

            {/* Recall Button */}
            {lastBumpedOrder && (
              <button
                type="button"
                onClick={handleRecallOrder}
                className="px-4 py-2 border border-[#e8e2d8] bg-white text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors cursor-pointer flex items-center gap-1.5 rounded"
                title="Undo last bumped ticket"
              >
                <span className="material-symbols-outlined text-sm text-amber-700">undo</span>
                RECALL #KO-{lastBumpedOrder.id}
              </button>
            )}

          </div>
        </div>
      </div>

      {/* 3. Core Workspace Grid (Historical Audit Table vs Live Bump Screen) */}
      {workspaceMode === 'audit' ? (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm relative">
          <HeaderQuickTabs
            title="HISTORICAL AUDIT TRAIL"
            badgeCount={
              filteredOrders.length <= pageSize
                ? `${filteredOrders.length} ticket${filteredOrders.length === 1 ? '' : 's'}`
                : `${Math.min(filteredOrders.length, pageSize)} / ${filteredOrders.length} tickets`
            }
            tabs={[]}
            rightElement={
              <TableOptionsMenu
                columns={[
                  { key: 'orderRef', label: 'Order Reference' },
                  { key: 'stationPriority', label: 'Station & Priority' },
                  { key: 'lifecycleStatus', label: 'Lifecycle Status' },
                  { key: 'createdTimestamp', label: 'Created Timestamp' },
                  { key: 'startedDelay', label: 'Started / Delay' },
                  { key: 'completedPrepTime', label: 'Completed / Prep Time' },
                  { key: 'cancellationAudit', label: 'Cancellation Audit' },
                  { key: 'items', label: 'Items' },
                  { key: 'actions', label: 'Actions' },
                ]}
                visibleColumns={visibleColumns}
                onToggleColumn={(key) =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    [key]: !prev[key as keyof typeof visibleColumns],
                  }))
                }
                rowDensity={rowDensity}
                onChangeDensity={setRowDensity}
                totalItems={filteredOrders.length}
                pageSize={pageSize}
                onChangePageSize={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onReload={() => loadOrders(false)}
                onExportCSV={() => {
                  const headers = 'Ticket_ID,POS_Order_ID,Station,Priority,Status,Created_At,Started_At,Completed_At,Cancelled_At,Cancelled_By,Cancellation_Reason,Notes\n';
                  const rows = filteredOrders
                    .map(
                      o =>
                        `"#KO-${o.id}","${o.orderId ? `#ORD-${o.orderId}` : ''}","${o.stationName || ''}",${o.priority},"${o.businessStatus}","${o.createdAt}","${o.startedAt || ''}","${o.completedAt || ''}","${o.cancelledAt || ''}","${o.cancelledByUserId || ''}","${o.cancellationReason || ''}","${(o.notes || '').replace(/"/g, '""')}"`
                    )
                    .join('\n');
                  const blob = new Blob([headers + rows], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `kds_orders_audit_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  showToast('Exported historical audit table to CSV', 'success');
                }}
                onPrint={() => window.print()}
                printLabel="Print Kitchen Orders Audit"
                onCopySummary={() => {
                  const summaryText = `Kitchen Orders Audit Summary:\n- Total Tickets: ${filteredOrders.length}\n- Completed: ${filteredOrders.filter(o => o.businessStatus === 'completed').length}\n- Cancelled: ${filteredOrders.filter(o => o.businessStatus === 'cancelled').length}\n- In Progress/Pending: ${filteredOrders.filter(o => o.businessStatus === 'started' || o.businessStatus === 'pending').length}`;
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
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="bg-[#ece8e0] text-[#5f5e5e] uppercase tracking-wider text-[11px] font-bold border-b border-[#e8e2d8]">
                      {visibleColumns.orderRef && <th className={densityPadding}>Order Reference</th>}
                      {visibleColumns.stationPriority && <th className={densityPadding}>Station &amp; Priority</th>}
                      {visibleColumns.lifecycleStatus && <th className={`${densityPadding} text-center`}>Lifecycle Status</th>}
                      {visibleColumns.createdTimestamp && <th className={densityPadding}>Created Timestamp</th>}
                      {visibleColumns.startedDelay && <th className={densityPadding}>Started / Delay</th>}
                      {visibleColumns.completedPrepTime && <th className={densityPadding}>Completed / Prep Time</th>}
                      {visibleColumns.cancellationAudit && <th className={densityPadding}>Cancellation Audit</th>}
                      {visibleColumns.items && <th className={`${densityPadding} text-center`}>Items</th>}
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
                          <p className="text-secondary text-body-md mt-2 font-sans">Loading kitchen orders...</p>
                        </td>
                      </tr>
                    ) : loadError ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white">
                          <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                            error
                          </span>
                          <p className="font-bold">{loadError}</p>
                          <button
                            type="button"
                            onClick={() => loadOrders(false)}
                            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                          >
                            Retry Connection
                          </button>
                        </td>
                      </tr>
                    ) : orders.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="receipt_long"
                        title="No kitchen tickets found"
                        description="No kitchen orders have been registered in the system yet."
                      />
                    ) : filteredOrders.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="receipt_long"
                        title="No kitchen tickets found"
                        description="No orders matched your current date, station, status, or cancellation audit criteria."
                      />
                    ) : (
                      paginatedOrders.map(order => {
                    const isCancelled = order.businessStatus === 'cancelled';
                    const isCompleted = order.businessStatus === 'completed';
                    const isStarted = order.businessStatus === 'started';

                    const prepDuration =
                      isCompleted && order.completedAt && order.createdAt
                        ? formatDuration(order.createdAt, order.completedAt)
                        : null;

                    const waitDelay =
                      (isStarted || isCompleted) && order.startedAt && order.createdAt
                        ? formatDuration(order.createdAt, order.startedAt)
                        : null;

                    return (
                      <tr
                        key={order.id}
                        className={`transition-colors duration-150 group ${
                          isCancelled
                            ? 'bg-stone-50/60 opacity-60 hover:opacity-100 hover:bg-[#f8f3eb]'
                            : isCompleted
                            ? 'bg-white hover:bg-[#f8f3eb]'
                            : 'bg-white hover:bg-[#f8f3eb]'
                        }`}
                      >
                        {/* Order Reference */}
                        {visibleColumns.orderRef && (
                          <td className={`${densityPadding} font-sans`}>
                            <div className="flex items-center gap-1.5 font-bold text-[#1d1c17] text-sm">
                              <span className="group-hover:text-[#ae001a] transition-colors">
                                #KO-{order.id}
                              </span>
                              {order.priority > 0 && (
                                <span className="material-symbols-outlined text-xs text-[#ae001a]">
                                  flag
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[#5f5e5e] font-mono">
                              {order.orderId ? (
                                <span>#ORD-{order.orderId}</span>
                              ) : order.onlineOrderId ? (
                                <span>#ONL-{order.onlineOrderId}</span>
                              ) : (
                                <span>Direct POS</span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Station & Priority */}
                        {visibleColumns.stationPriority && (
                          <td className={densityPadding}>
                            <span className="font-semibold text-[#1d1c17] block">
                              {order.stationName || 'Unassigned Station'}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span
                                className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded border ${
                                  order.priority > 0
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                }`}
                              >
                                Priority {order.priority > 0 ? `+${order.priority} HIGH` : 'Normal'}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* Lifecycle Status */}
                        {visibleColumns.lifecycleStatus && (
                          <td className={`${densityPadding} text-center`}>
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                Completed
                              </span>
                            ) : isStarted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase">
                                <span className="material-symbols-outlined text-xs animate-spin">skillet</span>
                                Started
                              </span>
                            ) : isCancelled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 uppercase">
                                <span className="material-symbols-outlined text-xs">cancel</span>
                                Cancelled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-300 uppercase">
                                <span className="material-symbols-outlined text-xs">schedule</span>
                                Pending
                              </span>
                            )}
                          </td>
                        )}

                        {/* Created At */}
                        {visibleColumns.createdTimestamp && (
                          <td className={`${densityPadding} font-mono text-[11px] text-[#1d1c17]`}>
                            {formatDateClock(order.createdAt)}
                          </td>
                        )}

                        {/* Started At / Delay */}
                        {visibleColumns.startedDelay && (
                          <td className={`${densityPadding} font-mono text-[11px]`}>
                            {order.startedAt ? (
                              <div>
                                <span className="text-[#1d1c17]">{formatDateClock(order.startedAt)}</span>
                                {waitDelay && (
                                  <span className="block text-[10px] text-[#5f5e5e]">
                                    Wait: {waitDelay}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[#8a857a]">—</span>
                            )}
                          </td>
                        )}

                        {/* Completed At / Total Duration */}
                        {visibleColumns.completedPrepTime && (
                          <td className={`${densityPadding} font-mono text-[11px]`}>
                            {order.completedAt ? (
                              <div>
                                <span className="text-emerald-700 font-semibold">{formatDateClock(order.completedAt)}</span>
                                {prepDuration && (
                                  <span className="block text-[10px] text-emerald-600 font-bold">
                                    Prep: {prepDuration}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[#8a857a]">—</span>
                            )}
                          </td>
                        )}

                        {/* Cancellation Audit */}
                        {visibleColumns.cancellationAudit && (
                          <td className={densityPadding}>
                            {isCancelled ? (
                              <div className="text-xs">
                                <span className="inline-block bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold border border-red-200">
                                  {order.cancellationReason
                                    ? order.cancellationReason.replace(/_/g, ' ')
                                    : 'unspecified'}
                                </span>
                                {order.cancelledByUserId && (
                                  <span className="block text-[10px] text-[#8a857a] mt-0.5">
                                    By User #{order.cancelledByUserId}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[#8a857a] text-xs">—</span>
                            )}
                          </td>
                        )}

                        {/* Items Count */}
                        {visibleColumns.items && (
                          <td className={`${densityPadding} text-center font-mono font-bold text-xs`}>
                            <span className="inline-block px-2 py-0.5 rounded bg-zinc-100 text-[#1d1c17] border border-zinc-200">
                              {order.items.length} items
                            </span>
                          </td>
                        )}

                        {/* Actions */}
                        {visibleColumns.actions && (
                          <td className={`${densityPadding} text-right`}>
                            <button
                              onClick={() => setInspectingTicket(order)}
                              className="px-2.5 py-1 bg-[#f4efe6] hover:bg-[#ae001a] hover:text-white text-[#1d1c17] border border-[#e8e2d8] rounded text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Inspect Order Details &amp; Line Items"
                            >
                              <span className="material-symbols-outlined text-sm">manage_search</span>
                              <span>Inspect</span>
                            </button>
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
            totalItems={filteredOrders.length}
            onPageChange={setCurrentPage}
          />
            </>
          )}
        </div>
      ) : (
        /* VIEW MODE 2: LIVE BUMP SCREEN (Ticket Cards with clean and clear layout) */
        loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#5f5e5e] gap-3">
            <div className="w-10 h-10 border-4 border-[#e8e2d8] border-t-[#ae001a] rounded-full animate-spin" />
            <span className="text-sm font-medium">Synchronizing kitchen orders...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <TableEmptyState
            asTableRow={false}
            icon="receipt_long"
            title="No Kitchen Tickets Found"
            description="No orders matched your current date, station, status, or cancellation audit criteria."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrders.map(order => {
            const isStarted = order.businessStatus === 'started';
            const isPending = order.businessStatus === 'pending';
            const isCompleted = order.businessStatus === 'completed';
            const isCancelled = order.businessStatus === 'cancelled';

            const startReference = order.startedAt
              ? new Date(order.startedAt).getTime()
              : new Date(order.createdAt).getTime();
            const elapsedSeconds = Math.max(0, Math.floor((currentTime - startReference) / 1000));
            const elapsedMinutes = Math.floor(elapsedSeconds / 60);
            const remainingSec = elapsedSeconds % 60;
            const timerDisplay = `${elapsedMinutes}m ${remainingSec.toString().padStart(2, '0')}s`;

            let timerColorClass = 'bg-stone-700 text-white';
            if (elapsedMinutes >= 15) {
              timerColorClass = 'bg-red-600 text-white animate-pulse font-black';
            } else if (elapsedMinutes >= 8) {
              timerColorClass = 'bg-amber-600 text-white font-bold';
            } else if (isStarted) {
              timerColorClass = 'bg-blue-600 text-white font-bold';
            }

            return (
              <div
                key={order.id}
                className={`bg-white hover:bg-[#fef9f1] border rounded-xl flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 ${
                  isCompleted
                    ? 'border-emerald-400 ring-1 ring-emerald-200 bg-emerald-50/10'
                    : isCancelled
                    ? 'border-red-200 bg-stone-50/70 opacity-65 hover:opacity-100'
                    : isStarted
                    ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm'
                    : 'border-[#e8e2d8]'
                }`}
              >
                {/* Card Header */}
                <div
                  className={`p-3.5 border-b flex items-center justify-between transition-colors ${
                    isCompleted
                      ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                      : isCancelled
                      ? 'bg-red-50 border-red-200 text-red-950'
                      : isStarted
                      ? 'bg-blue-50/90 border-blue-200 text-blue-950'
                      : 'bg-[#fcfbf9] border-[#e8e2d8] text-[#1d1c17]'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-sans font-bold text-sm">
                      <span className="text-[#1d1c17]">#KO-{order.id}</span>
                      {isCompleted && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-black tracking-wide">
                          READY
                        </span>
                      )}
                      {isStarted && (
                        <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-300 px-1.5 py-0.5 rounded font-black tracking-wide">
                          IN PREP
                        </span>
                      )}
                      {isPending && (
                        <span className="text-[10px] bg-stone-100 text-stone-600 border border-stone-300 px-1.5 py-0.5 rounded font-bold tracking-wide">
                          PENDING
                        </span>
                      )}
                      {isCancelled && (
                        <span className="text-[10px] bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 rounded font-black tracking-wide">
                          CANCELLED
                        </span>
                      )}
                      {order.priority > 0 && (
                        <span className="text-[10px] bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.2 rounded font-black">
                          P+{order.priority}
                        </span>
                      )}
                      {elapsedMinutes >= 15 && (isPending || isStarted) && (
                        <span className="text-[10px] bg-red-600 text-white border border-red-700 px-1.5 py-0.5 rounded font-black tracking-wide flex items-center gap-0.5 shadow-xs animate-pulse">
                          <span className="material-symbols-outlined text-[12px]">shield</span>
                          SLA SHIELD
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#5f5e5e] block font-normal">
                      {order.stationName || 'Unassigned'}
                    </span>
                  </div>

                  {/* Timer */}
                  {!isCompleted && !isCancelled && (
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${timerColorClass}`}>
                      {timerDisplay}
                    </span>
                  )}
                </div>

                {/* Body & Items */}
                <div className="p-4 flex-1 flex flex-col gap-3">
                  {/* Notes Callout */}
                  {order.notes && (
                    <div className="bg-amber-50 border-l-2 border-amber-400 px-2.5 py-1.5 rounded-r text-[11px] text-amber-900 font-medium italic">
                      {order.notes}
                    </div>
                  )}

                  {/* Dishes List */}
                  <div className="space-y-2 flex-1 py-1">
                    {order.items.map(it => (
                      <div
                        key={it.id}
                        className="p-2 rounded-lg bg-[#fcfbf9] border border-[#ebe5da] flex items-start justify-between gap-2 text-xs text-[#1d1c17] transition-colors hover:border-[#ded5c5]"
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          {/* Qty pill */}
                          <span className="w-5 h-5 rounded bg-[#eee8dc] text-[#1d1c17] font-mono font-extrabold text-[11px] flex items-center justify-center shrink-0">
                            {it.quantity}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-[#1d1c17] break-words leading-tight">
                                {it.productName}
                              </span>
                              {it.variantName && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#ede7dc] text-[#554d42]">
                                  {it.variantName}
                                </span>
                              )}
                            </div>

                            {/* Course chip */}
                            {it.course && (
                              <div className="mt-1 flex items-center gap-1">
                                <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-white text-[#5f5e5e] border border-[#e2dcce]">
                                  <span>
                                    {it.course === 'beverage'
                                      ? '🍹'
                                      : it.course === 'appetizer'
                                      ? '🥗'
                                      : it.course === 'dessert'
                                      ? '🍰'
                                      : '🍔'}
                                  </span>
                                  <span>{it.course.replace('_', ' ')}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status badge */}
                        <span
                          className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                            it.preparationStatus === 'ready'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : it.preparationStatus === 'held'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : it.preparationStatus === 'in_preparation'
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-zinc-100 text-[#5f5e5e] border-zinc-200'
                          }`}
                        >
                          {it.preparationStatus === 'ready'
                            ? 'Ready'
                            : it.preparationStatus === 'held'
                            ? 'Held'
                            : it.preparationStatus === 'in_preparation'
                            ? 'Prep'
                            : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="px-3.5 py-2.5 bg-[#fcfbf9] border-t border-[#e8e2d8] flex items-center justify-between gap-2">
                  <button
                    onClick={() => setInspectingTicket(order)}
                    className="text-xs text-[#5f5e5e] hover:text-[#ae001a] flex items-center gap-1 font-semibold cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">manage_search</span>
                    <span>Audit</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {isPending && (
                      <button
                        onClick={() => handleStartPrep(order)}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold cursor-pointer transition-colors shadow-xs"
                      >
                        Start
                      </button>
                    )}

                    {!isCompleted && !isCancelled && (
                      <button
                        onClick={() => handleBumpOrder(order)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold cursor-pointer transition-colors shadow-xs"
                      >
                        Bump
                      </button>
                    )}

                    {!isCancelled && !isCompleted && (
                      <button
                        onClick={() => setCancellingTicket(order)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
                        title="Cancel Order"
                      >
                        <span className="material-symbols-outlined text-sm">cancel</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )
      )}

      {/* DETAIL INSPECTION MODAL (HISTORICAL AUDIT PANEL) */}
      {inspectingTicket && (
        <AppModal
          isOpen={true}
          onClose={() => setInspectingTicket(null)}
          title={`Audit Details: Ticket #KO-${inspectingTicket.id}`}
        >
          <div className="space-y-4 text-xs font-sans">
            {/* Top Status & Context Strip */}
            <div className="bg-[#fcfbf9] border border-[#e8e2d8] p-3 rounded-lg flex items-center justify-between">
              <div>
                <span className="font-bold text-[#1d1c17] text-sm">
                  #KO-{inspectingTicket.id}
                </span>
                {inspectingTicket.orderId && (
                  <span className="text-[#5f5e5e] ml-2 font-mono">#ORD-{inspectingTicket.orderId}</span>
                )}
                <span className="block text-[11px] text-[#5f5e5e] mt-0.5">
                  Station: {inspectingTicket.stationName || 'Unassigned'} • Priority: P+{inspectingTicket.priority}
                </span>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  inspectingTicket.businessStatus === 'completed'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : inspectingTicket.businessStatus === 'started'
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : inspectingTicket.businessStatus === 'cancelled'
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : 'bg-zinc-100 text-zinc-800 border-zinc-200'
                }`}
              >
                {inspectingTicket.businessStatus}
              </span>
            </div>

            {/* Timestamps Timeline */}
            <div className="border border-[#e8e2d8] rounded-lg p-3 space-y-2 bg-white">
              <span className="text-xs font-bold text-[#1d1c17] uppercase tracking-wider block border-b border-[#e8e2d8] pb-1">
                Timestamp Audit Trail
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[#5f5e5e] block">Created Timestamp:</span>
                  <span className="font-mono font-semibold text-[#1d1c17]">{formatDateClock(inspectingTicket.createdAt)}</span>
                </div>
                <div>
                  <span className="text-[#5f5e5e] block">Started Timestamp:</span>
                  <span className="font-mono font-semibold text-[#1d1c17]">{formatDateClock(inspectingTicket.startedAt)}</span>
                </div>
                <div>
                  <span className="text-[#5f5e5e] block">Completed Timestamp:</span>
                  <span className="font-mono font-semibold text-emerald-700">{formatDateClock(inspectingTicket.completedAt)}</span>
                </div>
                <div>
                  <span className="text-[#5f5e5e] block">Cancelled Timestamp:</span>
                  <span className="font-mono font-semibold text-red-700">{formatDateClock(inspectingTicket.cancelledAt)}</span>
                </div>
              </div>

              {inspectingTicket.completedAt && inspectingTicket.createdAt && (
                <div className="mt-2 pt-2 border-t border-[#e8e2d8] text-[11px] flex items-center justify-between text-emerald-700 font-semibold">
                  <span>Total Preparation Duration:</span>
                  <span className="font-mono font-bold text-sm">
                    {formatDuration(inspectingTicket.createdAt, inspectingTicket.completedAt)}
                  </span>
                </div>
              )}
            </div>

            {/* Cancellation Details (if cancelled) */}
            {inspectingTicket.businessStatus === 'cancelled' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-900 space-y-1">
                <span className="font-bold uppercase tracking-wider text-[11px] flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-red-600">block</span>
                  Cancellation Reason:
                </span>
                <p className="font-semibold">
                  {inspectingTicket.cancellationReason
                    ? inspectingTicket.cancellationReason.replace(/_/g, ' ')
                    : 'Unspecified'}
                </p>
                {inspectingTicket.cancelledByUserId && (
                  <p className="text-[11px] text-red-700">
                    Cancelled by User ID: #{inspectingTicket.cancelledByUserId}
                  </p>
                )}
                {inspectingTicket.notes && (
                  <p className="text-[11px] italic mt-1 text-red-800 border-t border-red-200 pt-1">
                    Notes: {inspectingTicket.notes}
                  </p>
                )}
              </div>
            )}

            {/* Line Items Breakdown */}
            <div className="border border-[#e8e2d8] rounded-lg p-3 bg-white">
              <span className="text-xs font-bold text-[#1d1c17] uppercase tracking-wider block mb-2">
                Order Items Breakdown ({inspectingTicket.items.length})
              </span>
              <div className="divide-y divide-[#f0ede6]">
                {inspectingTicket.items.map(it => (
                  <div key={it.id} className="py-2 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#1d1c17]">
                        {it.quantity}x {it.productName}
                        {it.variantName && <span className="text-[#5f5e5e] font-normal ml-1">({it.variantName})</span>}
                      </p>
                      {it.notes && <p className="text-[11px] text-amber-700 italic">Notes: {it.notes}</p>}
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                          it.preparationStatus === 'ready'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : it.preparationStatus === 'held'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : it.preparationStatus === 'in_preparation'
                            ? 'bg-blue-100 text-blue-800 border-blue-200'
                            : 'bg-zinc-100 text-[#5f5e5e] border-zinc-200'
                        }`}
                      >
                        {it.preparedQuantity}/{it.quantity} {it.preparationStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectingTicket(null)}
                className="px-4 py-2 bg-[#1d1c17] hover:bg-[#333] text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </AppModal>
      )}

      {/* CANCELLATION REASON MODAL */}
      {cancellingTicket && (
        <AppModal
          isOpen={true}
          onClose={() => setCancellingTicket(null)}
          title={`Cancel Kitchen Ticket #KO-${cancellingTicket.id}`}
        >
          <div className="space-y-4 text-xs font-sans">
            <p className="text-[#5f5e5e]">
              Please select the operational reason for voiding this kitchen ticket. This cancellation will be logged in the audit trail.
            </p>

            <div>
              <label className="block text-xs font-bold text-[#1d1c17] uppercase tracking-wider mb-1.5">
                Cancellation Reason (Required)
              </label>
              <select
                value={selectedReason}
                onChange={e => setSelectedReason(e.target.value as KitchenCancellationReason)}
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded-lg p-2.5 text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
              >
                {CANCELLATION_REASONS.map(r => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1d1c17] uppercase tracking-wider mb-1.5">
                Kitchen Operational Notes
              </label>
              <textarea
                value={cancellationNotes}
                onChange={e => setCancellationNotes(e.target.value)}
                placeholder="Optional explanation for shift audit..."
                rows={3}
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded-lg p-2.5 text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8e2d8]">
              <button
                type="button"
                onClick={() => setCancellingTicket(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-[#1d1c17] font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelSubmitting}
                className="px-4 py-2 bg-[#ae001a] hover:bg-[#800010] text-white font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {cancelSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </AppModal>
      )}

      {/* Slide-over Right Drawer to Create New Kitchen Order */}
      {isCreateModalOpen &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-end items-stretch backdrop-blur-xs font-sans">
            <div className="bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-lg overflow-hidden animate-slide-in-right flex flex-col h-full">
              {/* Drawer Header */}
              <div className="p-4 bg-[#222222] text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ae001a] text-xl">
                    receipt_long
                  </span>
                  <div>
                    <div
                      className="font-bold text-sm tracking-wider uppercase text-white !text-white font-sans"
                      style={{ color: '#ffffff' }}
                    >
                      Create New Kitchen Ticket
                    </div>
                    <p className="text-[10px] text-zinc-400 font-sans">
                      Dispatch ticket to kitchen station with line items
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer p-1"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              {/* Drawer Form Body */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                const validItems = formItems.filter(it => it.productName.trim().length > 0);
                if (validItems.length === 0) {
                  setCreateError('Please specify at least one dish / item name.');
                  return;
                }
                setIsCreating(true);
                setCreateError(null);
                try {
                  const token = getAccessToken();
                  const headers = {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  };
                  const payload = {
                    stationId: formStationId ? Number(formStationId) : (stations[0]?.id || null),
                    priority: Number(formPriority),
                    orderId: formOrderId ? Number(formOrderId) : null,
                    notes: formNotes.trim() || null,
                    businessStatus: 'pending',
                    kitchenOrderItems: validItems.map((it) => ({
                      productName: it.productName.trim(),
                      variantName: it.variantName.trim() || null,
                      quantity: Number(it.quantity) || 1,
                      course: it.course || 'main_course',
                      notes: it.notes.trim() || null,
                    })),
                  };

                  const res = await fetch(`${API_BASE}/kitchen-orders`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                  });

                  if (res.ok) {
                    setIsCreateModalOpen(false);
                    setFormOrderId('');
                    setFormNotes('');
                    setFormPriority(0);
                    setFormItems([{ productName: '', variantName: '', quantity: 1, notes: '' }]);
                    showToast('New kitchen order created successfully!', 'success');
                    loadOrders(true);
                  } else {
                    const errJson = await res.json().catch(() => null);
                    const msg = Array.isArray(errJson?.message) ? errJson.message[0] : (errJson?.message || 'Failed to create order');
                    setCreateError(msg);
                  }
                } catch (err: any) {
                  setCreateError(err.message || 'Network error creating order');
                } finally {
                  setIsCreating(false);
                }
              }} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs flex flex-col justify-between">
                <div className="space-y-4">
                  {createError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-bold">
                      {createError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                        Kitchen Station *
                      </label>
                      <select
                        value={formStationId}
                        onChange={e => setFormStationId(e.target.value)}
                        className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-semibold focus:border-[#ae001a] outline-none cursor-pointer text-[#1d1c17]"
                      >
                        {stations.map(s => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name} (#KST-{s.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                        Priority Level
                      </label>
                      <select
                        value={formPriority}
                        onChange={e => setFormPriority(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-semibold focus:border-[#ae001a] outline-none cursor-pointer text-[#1d1c17]"
                      >
                        <option value={0}>Normal (0)</option>
                        <option value={1}>High (+1)</option>
                        <option value={2}>Urgent (+2)</option>
                        <option value={3}>VIP Rush (+3)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                        POS Ticket # Reference
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 101, 102"
                        value={formOrderId}
                        onChange={e => setFormOrderId(e.target.value)}
                        className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-semibold focus:border-[#ae001a] outline-none text-[#1d1c17]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                        Kitchen Instructions / Notes
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Extra sauce, Allergy..."
                        value={formNotes}
                        onChange={e => setFormNotes(e.target.value)}
                        className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-semibold focus:border-[#ae001a] outline-none text-[#1d1c17]"
                      />
                    </div>
                  </div>

                  {/* Line Items List */}
                  <div className="border-t border-[#e8e2d8] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#1d1c17] uppercase tracking-wider">
                        Order Dishes / Line Items
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormItems(prev => [...prev, { productName: '', variantName: '', quantity: 1, course: 'main_course', notes: '' }])}
                        className="text-[11px] font-bold text-[#ae001a] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span> Add Another Dish
                      </button>
                    </div>

                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {formItems.map((item, index) => {
                        const availableVariants = productVariantsMap[item.productName] || [];

                        return (
                          <div
                            key={index}
                            className="bg-white p-3.5 rounded-xl border border-[#e5dfd5] shadow-2xs hover:border-[#ae001a]/40 transition-all space-y-2.5"
                          >
                            {/* Top row: Item Index & Remove button */}
                            <div className="flex items-center justify-between border-b border-[#f0ece3] pb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-[#1d1c17] text-white font-mono font-black text-[10px] flex items-center justify-center">
                                  {index + 1}
                                </span>
                                <span className="text-[11px] font-bold text-[#1d1c17] tracking-wider">
                                  {item.productName ? item.productName : `Dish #${index + 1}`}
                                </span>
                              </div>

                              {formItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setFormItems(prev => prev.filter((_, i) => i !== index))}
                                  className="text-zinc-400 hover:text-red-600 p-0.5 rounded transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                                  title="Remove dish"
                                >
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                  <span>Remove</span>
                                </button>
                              )}
                            </div>

                            {/* Inputs Grid */}
                            <div className="grid grid-cols-12 gap-2">
                              {/* Product / Dish Select */}
                              <div className="col-span-12 sm:col-span-5">
                                <label className="block text-[10px] font-bold text-[#6f6e6e] uppercase tracking-wider mb-1">
                                  Dish / Product <span className="text-[#ae001a]">*</span>
                                </label>
                                <select
                                  value={
                                    item.isCustomProduct
                                      ? '__custom__'
                                      : catalogProducts.includes(item.productName)
                                      ? item.productName
                                      : item.productName === ''
                                      ? ''
                                      : '__custom__'
                                  }
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '__custom__') {
                                      setFormItems(prev =>
                                        prev.map((it, i) =>
                                          i === index
                                            ? {
                                                ...it,
                                                productName: '',
                                                isCustomProduct: true,
                                                variantName: '',
                                                isCustomVariant: false,
                                              }
                                            : it
                                        )
                                      );
                                    } else {
                                      const available = productVariantsMap[val] || [];
                                      const suggested = suggestCourseForProduct(val);
                                      setFormItems(prev =>
                                        prev.map((it, i) => {
                                          if (i !== index) return it;
                                          const currentValid = available.includes(it.variantName || '');
                                          return {
                                            ...it,
                                            productName: val,
                                            isCustomProduct: false,
                                            course: suggested,
                                            variantName: currentValid ? it.variantName : (available[0] || ''),
                                            isCustomVariant: false,
                                          };
                                        })
                                      );
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-[#faf9f6] border border-[#d8d2c7] rounded-lg text-xs font-semibold focus:border-[#ae001a] focus:bg-white outline-none text-[#1d1c17] transition-all"
                                >
                                  <option value="">-- Select Dish / Product --</option>
                                  <optgroup label="Store Catalog / Menu">
                                    {catalogProducts.map(p => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Other / Custom">
                                    <option value="__custom__">✍️ Custom Product Name...</option>
                                  </optgroup>
                                </select>

                                {(item.isCustomProduct || (!catalogProducts.includes(item.productName) && item.productName !== '')) && (
                                  <input
                                    type="text"
                                    placeholder="Write custom product name..."
                                    value={item.productName}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setFormItems(prev => prev.map((it, i) => i === index ? { ...it, productName: val } : it));
                                    }}
                                    className="mt-1.5 w-full px-2.5 py-1 bg-white border border-[#ae001a] rounded-md text-xs outline-none text-[#1d1c17]"
                                    required
                                  />
                                )}
                              </div>

                              {/* Variant Select */}
                              <div className="col-span-12 sm:col-span-3">
                                <label className="block text-[10px] font-bold text-[#6f6e6e] uppercase tracking-wider mb-1">
                                  Variant
                                </label>
                                <select
                                  disabled={!item.productName && !item.isCustomProduct}
                                  value={
                                    item.isCustomVariant
                                      ? '__custom__'
                                      : availableVariants.includes(item.variantName || '')
                                      ? (item.variantName || '')
                                      : item.variantName === ''
                                      ? ''
                                      : '__custom__'
                                  }
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '__custom__') {
                                      setFormItems(prev =>
                                        prev.map((it, i) =>
                                          i === index ? { ...it, isCustomVariant: true } : it
                                        )
                                      );
                                    } else {
                                      setFormItems(prev =>
                                        prev.map((it, i) =>
                                          i === index
                                            ? {
                                                ...it,
                                                variantName: val === 'Standard' ? '' : val,
                                                isCustomVariant: false,
                                              }
                                            : it
                                        )
                                      );
                                    }
                                  }}
                                  className={`w-full px-2.5 py-1.5 bg-[#faf9f6] border border-[#d8d2c7] rounded-lg text-xs font-semibold focus:border-[#ae001a] focus:bg-white outline-none text-[#1d1c17] transition-all ${
                                    !item.productName && !item.isCustomProduct
                                      ? 'opacity-60 cursor-not-allowed bg-zinc-50'
                                      : 'cursor-pointer'
                                  }`}
                                >
                                  {!item.productName && !item.isCustomProduct ? (
                                    <option value="">-- Select dish first --</option>
                                  ) : (
                                    <option value="">Standard (No variant)</option>
                                  )}
                                  {availableVariants.length > 0 && (
                                    <optgroup label={`${item.productName} Variants`}>
                                      {availableVariants.map(v => (
                                        <option key={v} value={v}>{v}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label="Other / Custom">
                                    <option value="__custom__">✍️ Custom Variant...</option>
                                  </optgroup>
                                </select>

                                {(item.isCustomVariant ||
                                  (item.variantName &&
                                    !availableVariants.includes(item.variantName) &&
                                    item.variantName !== '')) && (
                                  <input
                                    type="text"
                                    placeholder="Write custom variant..."
                                    value={item.variantName}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setFormItems(prev =>
                                        prev.map((it, i) =>
                                          i === index ? { ...it, variantName: val } : it
                                        )
                                      );
                                    }}
                                    className="mt-1.5 w-full px-2.5 py-1 bg-white border border-[#ae001a] rounded-md text-xs outline-none text-[#1d1c17]"
                                  />
                                )}
                              </div>

                              {/* Course Select */}
                              <div className="col-span-8 sm:col-span-3">
                                <label className="block text-[10px] font-bold text-[#6f6e6e] uppercase tracking-wider mb-1">
                                  Course
                                </label>
                                <select
                                  value={item.course || 'main_course'}
                                  onChange={e => {
                                    const val = e.target.value as 'beverage' | 'appetizer' | 'main_course' | 'dessert';
                                    setFormItems(prev => prev.map((it, i) => i === index ? { ...it, course: val } : it));
                                  }}
                                  className="w-full px-2 py-1.5 bg-[#faf9f6] border border-[#d8d2c7] rounded-lg text-xs font-semibold outline-none text-[#1d1c17] focus:border-[#ae001a] focus:bg-white cursor-pointer transition-all"
                                >
                                  <option value="beverage">🍹 Beverage</option>
                                  <option value="appetizer">🥗 Appetizer</option>
                                  <option value="main_course">🍔 Main Course</option>
                                  <option value="dessert">🍰 Dessert</option>
                                </select>
                              </div>

                              {/* Qty Input */}
                              <div className="col-span-4 sm:col-span-1">
                                <label className="block text-[10px] font-bold text-[#6f6e6e] uppercase tracking-wider mb-1 text-center">
                                  Qty
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={e => {
                                    const val = Number(e.target.value) || 1;
                                    setFormItems(prev => prev.map((it, i) => i === index ? { ...it, quantity: val } : it));
                                  }}
                                  className="w-full px-1 py-1.5 bg-[#faf9f6] border border-[#d8d2c7] rounded-lg text-xs text-center font-black outline-none text-[#1d1c17] focus:border-[#ae001a] focus:bg-white transition-all"
                                />
                              </div>
                            </div>

                            {/* Item Preparation Notes */}
                            <div className="pt-1">
                              <input
                                type="text"
                                placeholder="Special prep notes (e.g., extra spicy, no ice, medium rare)..."
                                value={item.notes || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setFormItems(prev => prev.map((it, i) => i === index ? { ...it, notes: val } : it));
                                }}
                                className="w-full px-2.5 py-1 bg-[#faf9f6] border border-[#e5dfd5] rounded-md text-[11px] text-[#1d1c17] placeholder-[#a09c94] focus:border-[#ae001a] focus:bg-white outline-none transition-all"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Drawer Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e8e2d8]">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-xs font-bold uppercase rounded hover:bg-zinc-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-6 py-2 bg-[#ae001a] hover:bg-[#c4001d] text-white text-xs font-bold uppercase rounded transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isCreating ? 'Dispatching...' : 'DISPATCH TO KITCHEN'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 4. Quick Links Banner */}
      <KitchenQuickLinks activeTab="kitchen-orders" onNavigate={onNavigate} />

      {/* 5. Persistent KDS Navigation Hub Bar */}
      <NavHubBar
        title="KDS ORDERS &amp; AUDIT WORKSPACE"
        subtitle="Historical Audit Table &amp; Persistent Sub-Module Routing"
        activeModuleId="kitchen-orders"
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
            active: true,
            onClick: () => onNavigate?.('kitchen-orders'),
          },
          {
            id: 'kitchen-order-items',
            label: 'ORDER ITEMS',
            icon: 'lunch_dining',
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
    </div>
  );
};
export default KitchenOrdersView;
