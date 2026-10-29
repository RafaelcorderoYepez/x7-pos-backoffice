import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getAccessToken, clearAuthSession, getStoredUser } from '../../../../../lib/auth-storage';
import {
  TableOptionsMenu,
  TablePaginationFooter,
  TableEmptyState,
  NoColumnsEmptyState,
  type TableDensity,
} from '../../../../shared/TableOptionsMenu';
import {
  OnlineOrderDetailsDrawer,
  isOnlineOrderEditable,
  type OnlineOrderDetailData,
  type KitchenStationOption,
} from './OnlineOrderDetailsDrawer';
export type { OnlineOrderDetailData };
import {
  OnlineOrderSetupDrawer,
  type OnlineOrderFormData,
  type CustomerOption,
} from './OnlineOrderSetupDrawer';
import { CancelledOrdersModal } from './CancelledOrdersModal';

const devToolModules = import.meta.glob<{
  OnlineOrdersDevSimulator?: React.ComponentType<{
    onComplete?: () => void;
    stores?: OnlineStoreOption[];
  }>;
}>('./OnlineOrdersDevSimulator.tsx', { eager: true });
const OnlineOrdersDevSimulator = devToolModules['./OnlineOrdersDevSimulator.tsx']?.OnlineOrdersDevSimulator;

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export interface OnlineStoreOption {
  id: number;
  subdomain: string;
  name?: string;
  isActive?: boolean;
  is_active?: boolean;
  status?: string;
}

export interface ProductOption {
  id: number;
  name: string;
  price: number;
  basePrice?: number;
  description?: string;
  category?: { id: number; name: string };
  variants?: Array<{ id: number; name: string; price?: number }>;
}

export interface OnlineMenuOption {
  id: number;
  storeId: number;
  name: string;
  isActive: boolean;
}

export interface OnlineMenuItemOption {
  id: number;
  menuId: number;
  productId: number;
  variantId: number | null;
  isAvailable: boolean;
  priceOverride: number | null;
  displayOrder?: number;
  status?: string;
  product?: {
    id: number;
    name: string;
    sku?: string;
    basePrice: number;
  };
  variant?: {
    id: number;
    name: string;
    price: number;
    sku?: string;
  } | null;
  menu?: {
    id: number;
    name: string;
    storeId?: number;
  };
}

interface OnlineOrdersViewProps {
  onNavigate?: (view: string) => void;
}

type OrderTypeFilter = 'all' | 'delivery' | 'pickup' | 'dine_in';
type PaymentStatusFilter = 'all' | 'paid' | 'pending' | 'failed' | 'refunded';

export const OnlineOrdersView: React.FC<OnlineOrdersViewProps> = ({ onNavigate: _onNavigate }) => {
  void _onNavigate;
  const [orders, setOrders] = useState<OnlineOrderDetailData[]>([]);
  const [stores, setStores] = useState<OnlineStoreOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Views
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>('all');
  const [selectedFulfillmentStatuses, setSelectedFulfillmentStatuses] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'split' | 'table'>('split');

  // Table options & pagination
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    orderId: true,
    store: true,
    customer: true,
    type: true,
    itemsAndTotal: true,
    paymentStatus: true,
    fulfillmentStatus: true,
    timestamps: true,
    actions: true,
  });
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Drawer (Inspection & Details)
  const [selectedOrder, setSelectedOrder] = useState<OnlineOrderDetailData | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Cancelled Orders Archive Modal
  const [isCancelledModalOpen, setIsCancelledModalOpen] = useState<boolean>(false);

  // Drawer (Add / Edit Setup)
  const [isSetupDrawerOpen, setIsSetupDrawerOpen] = useState<boolean>(false);
  const [setupDrawerMode, setSetupDrawerMode] = useState<'create' | 'edit'>('create');
  const [orderToEdit, setOrderToEdit] = useState<OnlineOrderDetailData | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [onlineMenus, setOnlineMenus] = useState<OnlineMenuOption[]>([]);
  const [onlineMenuItems, setOnlineMenuItems] = useState<OnlineMenuItemOption[]>([]);
  const [kitchenStations, setKitchenStations] = useState<KitchenStationOption[]>([]);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Auto-refresh state
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());


  // 1. Fetch Online Stores (for dropdown filter)
  const fetchStores = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/online-stores?limit=100`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list: OnlineStoreOption[] = Array.isArray(json)
          ? json
          : json.data || [];
        setStores(list);
      }
    } catch (err) {
      console.warn('Could not load stores filter options:', err);
    }
  }, []);

  // 1b. Fetch Customers (for setup drawer dropdown)
  const fetchCustomers = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/customers?limit=100`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list: CustomerOption[] = Array.isArray(json)
          ? json
          : json.data || [];

        // Scope to active merchant as defense-in-depth
        const storedUser = getStoredUser();
        const activeMerchantId = storedUser?.merchant?.id;
        const scopedList = activeMerchantId
          ? list.filter((c: CustomerOption) => !c.merchantId || c.merchantId === activeMerchantId)
          : list;

        setCustomers(scopedList);
      }
    } catch (err) {
      console.warn('Could not load customers filter options:', err);
    }
  }, []);

  // 1c. Fetch Catalog Products, Online Menus & Menu Items (for setup drawer item builder)
  const fetchProductsAndMenus = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const [prodRes, menuRes, itemRes] = await Promise.all([
        fetch(`${API_BASE}/products?limit=250`, { headers }),
        fetch(`${API_BASE}/online-menus?limit=100`, { headers }).catch(() => null),
        fetch(`${API_BASE}/online-menu-items?limit=100&status=all`, { headers }).catch(() => null),
      ]);

      if (prodRes && prodRes.ok) {
        const json = await prodRes.json();
        const rawList = Array.isArray(json) ? json : json.data || json.items || [];
        const list: ProductOption[] = rawList.map(
          (p: {
            id: number;
            name: string;
            basePrice?: number | string;
            price?: number | string;
            description?: string;
            category?: { id: number; name: string };
            variants?: Array<{ id: number; name: string; price?: number | string }>;
          }) => {
            const rawPrice = p.basePrice ?? p.price ?? 0;
            return {
              id: p.id,
              name: p.name,
              price: Number(rawPrice),
              basePrice: Number(rawPrice),
              description: p.description,
              category: p.category,
              variants: Array.isArray(p.variants)
                ? p.variants.map((v) => ({
                    id: v.id,
                    name: v.name,
                    price: Number(v.price ?? 0),
                  }))
                : [],
            };
          }
        );
        setProducts(list);
      }

      if (menuRes && menuRes.ok) {
        const json = await menuRes.json();
        const rawMenus = Array.isArray(json) ? json : json.data || [];
        setOnlineMenus(
          rawMenus.map(
            (m: {
              id: number;
              storeId?: number;
              store_id?: number;
              store?: { id: number };
              name: string;
              isActive?: boolean;
              is_active?: boolean;
            }) => ({
              id: Number(m.id),
              storeId: Number(m.storeId ?? m.store_id ?? m.store?.id ?? 0),
              name: m.name,
              isActive: m.isActive ?? m.is_active ?? true,
            })
          )
        );
      }

      if (itemRes && itemRes.ok) {
        const json = await itemRes.json();
        const rawItems = Array.isArray(json) ? json : json.data || [];
        setOnlineMenuItems(
          rawItems.map((item: Partial<OnlineMenuItemOption> & Record<string, unknown>) => ({
            id: Number(item.id),
            menuId: Number(item.menuId ?? item.menu_id ?? item.menu?.id ?? 0),
            productId: Number(item.productId ?? item.product_id ?? item.product?.id ?? 0),
            variantId: item.variantId ? Number(item.variantId) : item.variant_id ? Number(item.variant_id) : null,
            isAvailable: Boolean(item.isAvailable ?? item.is_available ?? true),
            priceOverride:
              item.priceOverride !== undefined && item.priceOverride !== null
                ? Number(item.priceOverride)
                : item.price_override !== undefined && item.price_override !== null
                  ? Number(item.price_override)
                  : null,
            displayOrder: Number(item.displayOrder ?? item.display_order ?? 0),
            status: typeof item.status === 'string' ? item.status : 'active',
            product: item.product,
            variant: item.variant,
            menu: item.menu,
          }))
        );
      }
    } catch (err) {
      console.warn('Could not load products and digital menus:', err);
    }
  }, []);

  // 1d. Fetch Kitchen Stations for KDS routing
  const fetchKitchenStations = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${API_BASE}/kitchen-station?status=active&sortBy=displayOrder&sortOrder=ASC`, { headers });
      if (res.ok) {
        const json = await res.json();
        const rawList = Array.isArray(json) ? json : json.data || [];
        setKitchenStations(
          rawList.map(
            (st: {
              id: number;
              name: string;
              stationType?: string;
              displayOrder?: number;
              display_order?: number;
              stationNumber?: number;
              station_number?: number;
            }) => ({
              id: Number(st.id),
              name: String(st.name),
              stationType: st.stationType,
              displayOrder: Number(st.displayOrder ?? st.display_order ?? 1),
              stationNumber: Number(st.stationNumber ?? st.station_number ?? 1),
            })
          )
        );
      }
    } catch (err) {
      console.warn('Failed to load kitchen stations:', err);
    }
  }, []);

  // 2. Fetch Online Orders
  const fetchOrders = useCallback(
    async (silent: boolean = false) => {
      try {
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);
        setError(null);

        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const res = await fetch(`${API_BASE}/online-orders?limit=100&sortBy=id&sortOrder=DESC`, {
          headers,
        });

        if (res.status === 401) {
          clearAuthSession();
          window.location.href = '/login';
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load online orders (HTTP ${res.status})`);
        }

        const json = await res.json();
        const list: OnlineOrderDetailData[] = Array.isArray(json)
          ? json
          : json.data || [];
        setOrders(list);
        setLastUpdated(new Date());

        // Sync selected order in drawer if open without re-triggering dependency cycle
        setSelectedOrder((prev) => {
          if (!prev) return null;
          const fresh = list.find((o) => o.id === prev.id);
          return fresh || prev;
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error fetching online orders';
        setError(msg);
      } finally {
        if (!silent) setIsLoading(false);
        else setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchStores();
    void fetchCustomers();
    void fetchProductsAndMenus();
    void fetchKitchenStations();
    void fetchOrders(false);
  }, [fetchStores, fetchCustomers, fetchProductsAndMenus, fetchKitchenStations, fetchOrders]);

  // Auto-refresh timer & KDS event listener for instant reactive sync
  useEffect(() => {
    const handleKdsEvent = () => {
      void fetchOrders(true);
    };
    window.addEventListener('x7_kds_data_reset', handleKdsEvent);
    window.addEventListener('online_orders_refresh', handleKdsEvent);

    if (autoRefreshInterval <= 0) {
      return () => {
        window.removeEventListener('x7_kds_data_reset', handleKdsEvent);
        window.removeEventListener('online_orders_refresh', handleKdsEvent);
      };
    }

    const timer = setInterval(() => {
      void fetchOrders(true);
    }, autoRefreshInterval * 1000);

    return () => {
      clearInterval(timer);
      window.removeEventListener('x7_kds_data_reset', handleKdsEvent);
      window.removeEventListener('online_orders_refresh', handleKdsEvent);
    };
  }, [autoRefreshInterval, fetchOrders]);

  // 3. Operational Actions: Accept & Inject POS
  const handleAcceptOrder = async (orderId: number, stationId?: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/online-orders/${orderId}/accept`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ stationId: stationId ? Number(stationId) : undefined }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to accept order and inject into POS');
      }

      const updated = await res.json();
      showToast(`Order #ONL-${orderId} successfully ACCEPTED and dispatched to kitchen!`);
      await fetchOrders(true);
      if (updated.data) setSelectedOrder(updated.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept order';
      showToast(msg);
    }
  };

  // 4. Operational Actions: Cancel Order
  const handleCancelOrder = async (orderId: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/online-orders/${orderId}/cancel`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to cancel online order');
      }

      const updated = await res.json().catch(() => null);
      showToast(`Order #ONL-${orderId} has been CANCELLED.`);
      await fetchOrders(true);
      if (updated?.data) setSelectedOrder(updated.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel online order';
      showToast(msg);
    }
  };

  // 5. Operational Actions: Transition Fulfillment Status
  const handleTransitionStatus = async (
    orderId: number,
    nextStatus: OnlineOrderDetailData['fulfillmentStatus']
  ) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(`${API_BASE}/online-orders/${orderId}/fulfillment-status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fulfillmentStatus: nextStatus }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to transition status to ${nextStatus}`);
    }

    showToast(`Order #ONL-${orderId} transitioned to ${nextStatus.replace(/_/g, ' ').toUpperCase()}`);
    await fetchOrders(true);
    if (selectedOrder && selectedOrder.id === orderId) {
      const refreshed = await fetch(`${API_BASE}/online-orders/${orderId}`, { headers });
      if (refreshed.ok) {
        const json = await refreshed.json();
        if (json.data) setSelectedOrder(json.data);
      }
    }
  };

  // 5a. Operational Actions: Update Payment Status
  const handleUpdatePaymentStatus = async (
    orderId: number,
    nextPaymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
  ) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(`${API_BASE}/online-orders/${orderId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ paymentStatus: nextPaymentStatus }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || 'Failed to update payment status');
    }

    showToast(`Order #ONL-${orderId} payment marked as ${nextPaymentStatus.toUpperCase()}`);
    await fetchOrders(true);
    if (selectedOrder && selectedOrder.id === orderId) {
      const refreshed = await fetch(`${API_BASE}/online-orders/${orderId}`, { headers });
      if (refreshed.ok) {
        const json = await refreshed.json();
        if (json.data) setSelectedOrder(json.data);
      }
    }
  };

  // 5b. Operational Actions: Setup Drawer (Create / Edit)
  const handleOpenCreateOrder = () => {
    setSetupDrawerMode('create');
    setOrderToEdit(null);
    void fetchProductsAndMenus();
    setIsSetupDrawerOpen(true);
  };

  const handleOpenEditOrder = (order: OnlineOrderDetailData) => {
    if (!isOnlineOrderEditable(order)) {
      showToast(
        `Orders in '${order.fulfillmentStatus?.replace(/_/g, ' ')}' stage cannot be edited.`
      );
      return;
    }
    setSetupDrawerMode('edit');
    setOrderToEdit(order);
    void fetchProductsAndMenus();
    setIsSetupDrawerOpen(true);
  };

  const handleSubmitOrderSetup = async (
    formData: OnlineOrderFormData,
    mode: 'create' | 'edit'
  ) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    if (mode === 'create') {
      const payload: Record<string, unknown> = {
        storeId: formData.storeId,
        customerId: formData.customerId,
        type: formData.type,
        paymentStatus: formData.paymentStatus,
        notes: formData.notes || null,
        scheduledAt: formData.scheduledAt || null,
        stationId: formData.stationId ? Number(formData.stationId) : null,
      };

      const res = await fetch(`${API_BASE}/online-orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to create online order');
      }

      const created = await res.json();
      const newOrderId = created.data?.id;

      // Attach line items if provided
      if (newOrderId && formData.items && formData.items.length > 0) {
        for (const it of formData.items) {
          try {
            const itemBody: Record<string, unknown> = {
              onlineOrderId: Number(newOrderId),
              productId: Number(it.productId),
              quantity: Number(it.quantity) || 1,
            };
            if (it.variantId) {
              itemBody.variantId = Number(it.variantId);
            }
            if (it.notes && it.notes.trim()) {
              itemBody.notes = it.notes.trim();
            }

            const itemRes = await fetch(`${API_BASE}/online-order-items`, {
              method: 'POST',
              headers,
              body: JSON.stringify(itemBody),
            });

            if (!itemRes.ok) {
              const errData = await itemRes.json().catch(() => ({}));
              console.error('Failed to attach item to online order:', errData);
            }
          } catch (itemErr) {
            console.warn('Failed to attach item to online order:', itemErr);
          }
        }
      }

      // Transition fulfillment status if customized (e.g. accepted, in_preparation)
      if (newOrderId && formData.fulfillmentStatus && formData.fulfillmentStatus !== 'received') {
        try {
          await fetch(`${API_BASE}/online-orders/${newOrderId}/fulfillment-status`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              fulfillmentStatus: formData.fulfillmentStatus,
              stationId: formData.stationId ? Number(formData.stationId) : undefined,
            }),
          });
        } catch (statusErr) {
          console.warn('Failed to update initial fulfillment status:', statusErr);
        }
      }

      showToast(
        `Online Order #${created.data?.id || ''} created successfully with ${formData.items?.length || 0} items!`
      );
      setIsSetupDrawerOpen(false);
      await fetchOrders(true);
    } else {
      if (!formData.id) throw new Error('Order ID is required for editing');

      const payload: Record<string, unknown> = {
        storeId: formData.storeId,
        customerId: formData.customerId,
        type: formData.type,
        paymentStatus: formData.paymentStatus,
        notes: formData.notes || null,
        scheduledAt: formData.scheduledAt || null,
      };

      if (formData.fulfillmentStatus) {
        payload.fulfillmentStatus = formData.fulfillmentStatus;
      }
      if (formData.stationId !== undefined) {
        payload.stationId = formData.stationId ? Number(formData.stationId) : null;
      }

      const res = await fetch(`${API_BASE}/online-orders/${formData.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to update online order');
      }

      // Manage line items differences when editing
      if (formData.id && formData.items) {
        const existingItemIds = new Set((orderToEdit?.items || []).map((it) => it.id));
        const currentItemIds = new Set(formData.items.filter((it) => it.id).map((it) => it.id!));

        // Delete removed items
        for (const existingId of existingItemIds) {
          if (!currentItemIds.has(existingId)) {
            try {
              await fetch(`${API_BASE}/online-order-items/${existingId}`, {
                method: 'DELETE',
                headers,
              });
            } catch (delErr) {
              console.warn('Failed to delete item:', delErr);
            }
          }
        }

        // Add newly added items (items without id)
        for (const it of formData.items) {
          if (!it.id) {
            try {
              const itemBody: Record<string, unknown> = {
                onlineOrderId: Number(formData.id),
                productId: Number(it.productId),
                quantity: Number(it.quantity) || 1,
              };
              if (it.variantId) {
                itemBody.variantId = Number(it.variantId);
              }
              if (it.notes && it.notes.trim()) {
                itemBody.notes = it.notes.trim();
              }

              const itemRes = await fetch(`${API_BASE}/online-order-items`, {
                method: 'POST',
                headers,
                body: JSON.stringify(itemBody),
              });

              if (!itemRes.ok) {
                const errData = await itemRes.json().catch(() => ({}));
                console.error('Failed to add item to existing order:', errData);
              }
            } catch (addErr) {
              console.warn('Failed to add item to existing order:', addErr);
            }
          }
        }
      }

      const updated = await res.json();
      showToast(`Order #ONL-${formData.id} updated successfully!`);
      setIsSetupDrawerOpen(false);
      await fetchOrders(true);

      if (selectedOrder && selectedOrder.id === formData.id) {
        if (updated.data) setSelectedOrder(updated.data);
      }
    }
  };

  // 6. Filtering Logic
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Store filter
      if (selectedStoreFilter !== 'all' && String(order.storeId) !== selectedStoreFilter) {
        return false;
      }

      // Order type filter
      if (orderTypeFilter !== 'all' && order.type !== orderTypeFilter) {
        return false;
      }

      // Payment status filter
      if (paymentFilter !== 'all' && order.paymentStatus !== paymentFilter) {
        return false;
      }

      // Fulfillment status checklist multi-select filter
      if (selectedFulfillmentStatuses.length > 0) {
        const fs = (order.fulfillmentStatus || '').toLowerCase();
        const matchesAny = selectedFulfillmentStatuses.some((st) => {
          const s = st.toLowerCase();
          if (s === 'received') return fs === 'received';
          if (s === 'accepted') return fs === 'accepted';
          if (s === 'in_preparation') return fs === 'in_preparation' || fs === 'in_kitchen';
          if (s === 'ready') return fs === 'ready' || fs === 'ready_for_pickup' || fs === 'out_for_delivery';
          if (s === 'completed') return fs === 'completed';
          if (s === 'cancelled') return fs === 'cancelled';
          return fs === s;
        });
        if (!matchesAny) return false;
      }

      // Universal search query across customer name, order ID (#ONL-{id}), phone, email, notes
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const onlId = `#onl-${order.id}`.toLowerCase();
        const rawId = String(order.id);
        const posOrdId = order.orderId ? `#ord-${order.orderId}`.toLowerCase() : '';
        const rawOrderId = order.orderId ? String(order.orderId) : '';
        const custName = order.customer?.name?.toLowerCase() || '';
        const custEmail = order.customer?.email?.toLowerCase() || '';
        const custPhone = (order.customer?.phone || '').toLowerCase();
        const storeSub = order.store?.subdomain?.toLowerCase() || '';
        const notes = order.notes?.toLowerCase() || '';

        const matches =
          onlId.includes(q) ||
          rawId.includes(q) ||
          posOrdId.includes(q) ||
          rawOrderId.includes(q) ||
          custName.includes(q) ||
          custEmail.includes(q) ||
          custPhone.includes(q) ||
          storeSub.includes(q) ||
          notes.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [
    orders,
    selectedStoreFilter,
    orderTypeFilter,
    paymentFilter,
    selectedFulfillmentStatuses,
    searchQuery,
  ]);

  // Operational KPI counters (Accurate tallies for live digital sales banner)
  const kpiTotal = orders.length;
  const kpiPending = orders.filter((o) => (o.fulfillmentStatus || '').toLowerCase() === 'received').length;
  const kpiAccepted = orders.filter((o) => (o.fulfillmentStatus || '').toLowerCase() === 'accepted').length;
  const kpiInPrep = orders.filter((o) => {
    const s = (o.fulfillmentStatus || '').toLowerCase();
    return s === 'in_preparation' || s === 'in_kitchen';
  }).length;
  const kpiActiveKitchen = kpiAccepted + kpiInPrep;
  const kpiReady = orders.filter((o) => {
    const s = (o.fulfillmentStatus || '').toLowerCase();
    return s === 'ready' || s === 'ready_for_pickup' || s === 'out_for_delivery';
  }).length;
  const kpiCompleted = orders.filter((o) => (o.fulfillmentStatus || '').toLowerCase() === 'completed').length;
  const kpiCancelled = orders.filter((o) => (o.fulfillmentStatus || '').toLowerCase() === 'cancelled').length;

  const handleToggleFulfillmentStatus = (statusKey: string) => {
    if (statusKey === 'ALL') {
      setSelectedFulfillmentStatuses([]);
      setCurrentPage(1);
      return;
    }
    setSelectedFulfillmentStatuses((prev) => {
      const exists = prev.includes(statusKey);
      if (exists) {
        return prev.filter((s) => s !== statusKey);
      } else {
        return [...prev, statusKey];
      }
    });
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    selectedStoreFilter !== 'all' ||
    orderTypeFilter !== 'all' ||
    paymentFilter !== 'all' ||
    selectedFulfillmentStatuses.length > 0
  );

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setSelectedStoreFilter('all');
    setOrderTypeFilter('all');
    setPaymentFilter('all');
    setSelectedFulfillmentStatuses([]);
    setCurrentPage(1);
  };

  // Pagination for Table View
  const totalItems = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  const formatCurrency = (val: number | string | undefined | null) => {
    const num = Number(val) || 0;
    return `$${num.toFixed(2)}`;
  };

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '—';
    }
  };

  const formatFullDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '—';
    }
  };

  const openOrderInspection = (order: OnlineOrderDetailData) => {
    setSelectedOrder(order);
    setIsDrawerOpen(true);
  };

  // Action menu handlers for TableOptionsMenu
  const handleExportCSV = () => {
    if (!filteredOrders || filteredOrders.length === 0) return;
    const headers = [
      'Order ID',
      'POS Order ID',
      'Store Subdomain',
      'Store ID',
      'Customer Name',
      'Customer Email',
      'Order Type',
      'Total Amount',
      'Payment Status',
      'Fulfillment Status',
      'Items Count',
      'Placed At',
      'Accepted At',
      'Ready At',
      'Completed At',
      'Created At',
    ];
    const rows = filteredOrders.map((order) => [
      `#ONL-${order.id}`,
      order.orderId ? `#ORD-${order.orderId}` : 'None',
      `"${(order.store?.subdomain || `Store #${order.storeId}`).replace(/"/g, '""')}"`,
      order.storeId,
      `"${(order.customer?.name || `Customer #${order.customerId}`).replace(/"/g, '""')}"`,
      `"${order.customer?.email || ''}"`,
      order.type,
      order.totalAmount,
      order.paymentStatus,
      order.fulfillmentStatus,
      order.items?.length || 0,
      order.placedAt || '',
      order.acceptedAt || '',
      order.readyAt || '',
      order.completedAt || '',
      order.createdAt,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `online_orders_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported online orders to CSV');
  };

  const handlePrintTable = () => {
    window.print();
  };

  const handleCopySummary = () => {
    if (!filteredOrders || filteredOrders.length === 0) return;
    const text = filteredOrders
      .map(
        (o) =>
          `#ONL-${o.id} [${o.orderId ? `#ORD-${o.orderId}` : 'No POS'}] | ${o.customer?.name || 'Customer'} (${o.customer?.email || 'no email'}) | ${o.type.toUpperCase()} | $${Number(o.totalAmount || 0).toFixed(2)} | Payment: ${o.paymentStatus.toUpperCase()} | Fulfillment: ${o.fulfillmentStatus.toUpperCase()}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    showToast('Orders summary copied to clipboard!');
  };

  const densityPadding =
    rowDensity === 'compact'
      ? 'py-2 px-2'
      : rowDensity === 'spacious'
      ? 'py-4 px-3.5'
      : 'py-2.5 px-2.5';
  const dataColumnsCount =
    (visibleColumns.orderId ? 1 : 0) +
    (visibleColumns.store ? 1 : 0) +
    (visibleColumns.customer ? 1 : 0) +
    (visibleColumns.type ? 1 : 0) +
    (visibleColumns.itemsAndTotal ? 1 : 0) +
    (visibleColumns.paymentStatus ? 1 : 0) +
    (visibleColumns.fulfillmentStatus ? 1 : 0) +
    (visibleColumns.timestamps ? 1 : 0) +
    (visibleColumns.actions ? 1 : 0);
  const activeColSpan = Math.max(1, dataColumnsCount);

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-16 right-6 z-50 bg-[#1d1c17] text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500/40 flex items-center gap-3 animate-fade-in font-sans">
          <span className="material-symbols-outlined text-emerald-400 text-xl">
            check_circle
          </span>
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Card Workspace (Canonical KDS layout matching OnlineMenuItemsView) */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
            shopping_bag
          </span>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            ONLINE ORDERS DISPATCH CONTROL BOARD
          </h2>
        </div>
        <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
          Receive customer orders from digital stores, track order types, monitor payment states, inject into the POS core, and control fulfillment progression.
        </p>
      </div>

      {/* 2. Operational KPI Summary Banner (Live digital sales metrics & milestones - Single Line / 5 Columns - Informational Only) */}
      <div className="grid grid-cols-5 gap-2 sm:gap-2.5 w-full min-w-0">
        {/* KPI 1: Total Web Orders */}
        <div className="bg-white border border-[#e8e2d8] p-2.5 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default font-sans">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shrink-0">
              <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
            </div>
            <div className="min-w-0">
              <div className="text-[9.5px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans font-poppins">
                Total Web Orders
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-[#1d1c17] font-sans font-poppins leading-tight">
                {isLoading ? '...' : kpiTotal}
              </div>
            </div>
          </div>
          <span className="hidden xl:inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 shrink-0 font-sans font-poppins">
            TOTAL
          </span>
        </div>

        {/* KPI 2: Pending Acceptance */}
        <div className="bg-white border border-[#e8e2d8] p-2.5 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default font-sans">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200 shrink-0">
              <span className="material-symbols-outlined text-[18px]">pending_actions</span>
            </div>
            <div className="min-w-0">
              <div className="text-[9.5px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans font-poppins">
                Pending Acceptance
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-[#1d1c17] font-sans font-poppins leading-tight">
                {isLoading ? '...' : kpiPending}
              </div>
            </div>
          </div>
          <span className="hidden xl:inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase bg-sky-100 text-sky-800 border border-sky-200 shrink-0 font-sans font-poppins">
            PENDING
          </span>
        </div>

        {/* KPI 3: Active Kitchen Orders */}
        <div className="bg-white border border-[#e8e2d8] p-2.5 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default font-sans">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <span className="material-symbols-outlined text-[18px]">soup_kitchen</span>
            </div>
            <div className="min-w-0">
              <div className="text-[9.5px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans font-poppins">
                Active Kitchen Orders
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-[#1d1c17] font-sans font-poppins leading-tight">
                {isLoading ? '...' : kpiActiveKitchen}
              </div>
            </div>
          </div>
          <span className="hidden xl:inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 shrink-0 font-sans font-poppins">
            KITCHEN
          </span>
        </div>

        {/* KPI 4: Ready for Pickup/Delivery */}
        <div className="bg-white border border-[#e8e2d8] p-2.5 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default font-sans">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
            </div>
            <div className="min-w-0">
              <div className="text-[9.5px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans font-poppins">
                Ready for Pickup/Delivery
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-[#1d1c17] font-sans font-poppins leading-tight">
                {isLoading ? '...' : kpiReady}
              </div>
            </div>
          </div>
          <span className="hidden xl:inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 font-sans font-poppins">
            READY
          </span>
        </div>

        {/* KPI 5: Fulfilled / Completed */}
        <div className="bg-white border border-[#e8e2d8] p-2.5 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default font-sans">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-700 flex items-center justify-center border border-green-200 shrink-0">
              <span className="material-symbols-outlined text-[18px]">verified</span>
            </div>
            <div className="min-w-0">
              <div className="text-[9.5px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans font-poppins">
                Completed Orders
              </div>
              <div className="text-lg sm:text-xl font-extrabold text-[#1d1c17] font-sans font-poppins leading-tight">
                {isLoading ? '...' : kpiCompleted}
              </div>
            </div>
          </div>
          <span className="hidden xl:inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase bg-green-100 text-green-800 border border-green-200 shrink-0 font-sans font-poppins">
            COMPLETED
          </span>
        </div>
      </div>

      {/* 3. Canonical Unified Filter Toolbar (Search, Selectors, Multi-Select Fulfillment Checklist) */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 shadow-sm flex flex-col gap-3.5">
        {/* Apartado 1: Buscador a la izquierda | Vista ("Dispatch Board" / "Table View") y Auto-Refresco a la derecha */}
        <div className="flex items-center justify-between gap-3 w-full">
          {/* Universal Search Input */}
          <div className="relative flex-1 max-w-md min-w-[200px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-[#76736a] select-none">
              search
            </span>
            <input
              type="text"
              placeholder="Search by customer name, phone, order #ONL, #ORD..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="h-[36px] w-full pl-9 pr-8 text-xs rounded-lg border border-[#d5cfc4] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a]/20 bg-[#fcfcfb] text-[#1d1c17] placeholder:text-[#8c857b] transition-all font-sans font-poppins"
              aria-label="Search orders"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Vista (Dispatch Board & Table View) + Auto Refresco */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher Toggle */}
            <div className="flex items-center h-[36px] bg-[#f2ede5] p-0.5 rounded-lg border border-[#e8e2d8] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`h-full px-3.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer font-sans whitespace-nowrap ${
                  viewMode === 'split'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Dispatch Board View"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'split' ? 'text-[#ae001a]' : ''}`}>
                  view_kanban
                </span>
                Dispatch Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-full px-3.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer font-sans whitespace-nowrap ${
                  viewMode === 'table'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Table View"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'table' ? 'text-[#ae001a]' : ''}`}>
                  table_rows
                </span>
                Table View
              </button>
            </div>

            {/* Canonical Auto Refresh */}
            <div className="flex items-center h-[36px] px-2.5 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] gap-1.5 text-xs text-[#5f5e5e] shrink-0 font-sans">
              <button
                type="button"
                onClick={() => void fetchOrders(true)}
                disabled={isLoading || isRefreshing}
                className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
                title="Sync now"
              >
                <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin text-[#ae001a]' : ''}`}>
                  sync
                </span>
              </button>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-[11px] font-semibold text-[#1d1c17] focus:outline-none cursor-pointer h-full font-sans"
              >
                <option value={0}>Auto: Off</option>
                <option value={5}>Auto: 5s</option>
                <option value={10}>Auto: 10s</option>
                <option value={30}>Auto: 30s</option>
                <option value={60}>Auto: 60s</option>
              </select>
            </div>
          </div>
        </div>

        {/* Apartado 2: Fila Dedicada de Selectores (Storefront, Tipo de Pedido, Estado de Pago, Checklist de Fulfillment y Reset) */}
        <div className="pt-3 border-t border-[#f0ede6] flex flex-wrap items-center gap-2.5 w-full">
          {/* Storefront Selector */}
          <div className="flex items-center h-[34px] px-2.5 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] hover:border-[#b8b0a2] focus-within:border-[#ae001a] transition-all shrink-0">
            <span className="material-symbols-outlined text-[16px] text-[#76736a] mr-1.5 select-none shrink-0">
              storefront
            </span>
            <select
              value={selectedStoreFilter}
              onChange={(e) => {
                setSelectedStoreFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs font-medium text-[#1d1c17] outline-none cursor-pointer pr-1 font-sans font-poppins"
              aria-label="Filter by digital store"
            >
              <option value="all">All Stores ({stores.length})</option>
              {stores.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.subdomain ? `${s.subdomain}.x7pos.com` : `Store #${s.id}`}
                </option>
              ))}
            </select>
          </div>

          {/* Order Type Dropdown */}
          <div className="flex items-center h-[34px] px-2.5 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] hover:border-[#b8b0a2] focus-within:border-[#ae001a] transition-all shrink-0">
            <span className="material-symbols-outlined text-[16px] text-[#76736a] mr-1.5 select-none shrink-0">
              local_shipping
            </span>
            <select
              value={orderTypeFilter}
              onChange={(e) => {
                setOrderTypeFilter(e.target.value as OrderTypeFilter);
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs font-medium text-[#1d1c17] outline-none cursor-pointer pr-1 font-sans font-poppins"
              aria-label="Filter by order type"
            >
              <option value="all">All Order Types</option>
              <option value="delivery">Delivery</option>
              <option value="pickup">Takeout / Pickup</option>
              <option value="dine_in">On-Premise QR</option>
            </select>
          </div>

          {/* Payment Dropdown */}
          <div className="flex items-center h-[34px] px-2.5 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] hover:border-[#b8b0a2] focus-within:border-[#ae001a] transition-all shrink-0">
            <span className="material-symbols-outlined text-[16px] text-[#76736a] mr-1.5 select-none shrink-0">
              payments
            </span>
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value as PaymentStatusFilter);
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs font-medium text-[#1d1c17] outline-none cursor-pointer pr-1 font-sans font-poppins"
              aria-label="Filter by payment status"
            >
              <option value="all">All Payments</option>
              <option value="paid">PAID</option>
              <option value="pending">PENDING (Unpaid)</option>
              <option value="failed">FAILED</option>
              <option value="refunded">REFUNDED</option>
            </select>
          </div>

          {/* Reset All Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="h-[34px] px-2.5 rounded-lg text-xs font-semibold text-[#ae001a] hover:bg-red-50 border border-red-200 transition-colors flex items-center gap-1 cursor-pointer font-sans shrink-0 font-poppins"
              title="Reset all filters"
            >
              <span className="material-symbols-outlined text-[15px]">filter_alt_off</span>
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Apartado 3: Los Status (Checklist Multi-Select Pills Strip) */}
        <div className="pt-3 border-t border-[#f0ede6] w-full flex items-center justify-between min-w-0">
          {/* Left: STATUS Multi-Filter Checklist Pills Strip */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#76736a] shrink-0 mr-1 font-sans font-poppins">
              STATUS:
            </span>

            {/* All Pill */}
            <button
              type="button"
              onClick={() => handleToggleFulfillmentStatus('ALL')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border font-poppins ${
                selectedFulfillmentStatuses.length === 0
                  ? 'bg-[#1d1c17] text-white border-[#1d1c17] shadow-xs'
                  : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">done_all</span>
              <span>All</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedFulfillmentStatuses.length === 0 ? 'bg-white/20 text-white' : 'bg-[#e8e2d8] text-[#5f5e5e]'
                }`}
              >
                {kpiTotal}
              </span>
            </button>

            {/* Received Pill */}
            <button
              type="button"
              onClick={() => handleToggleFulfillmentStatus('received')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border font-poppins ${
                selectedFulfillmentStatuses.includes('received')
                  ? 'bg-sky-700 text-white border-sky-700 shadow-xs'
                  : 'bg-white text-sky-800 border-sky-200 hover:bg-sky-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">inbox</span>
              <span>Received</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedFulfillmentStatuses.includes('received') ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-800'
                }`}
              >
                {kpiPending}
              </span>
            </button>

            {/* Accepted Pill */}
            <button
              type="button"
              onClick={() => handleToggleFulfillmentStatus('accepted')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border font-poppins ${
                selectedFulfillmentStatuses.includes('accepted')
                  ? 'bg-indigo-700 text-white border-indigo-700 shadow-xs'
                  : 'bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">task_alt</span>
              <span>Accepted</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedFulfillmentStatuses.includes('accepted') ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {kpiAccepted}
              </span>
            </button>

            {/* In Prep Pill */}
            <button
              type="button"
              onClick={() => handleToggleFulfillmentStatus('in_preparation')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border font-poppins ${
                selectedFulfillmentStatuses.includes('in_preparation')
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">soup_kitchen</span>
              <span>In Prep</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedFulfillmentStatuses.includes('in_preparation') ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {kpiInPrep}
              </span>
            </button>

            {/* Ready Pill */}
            <button
              type="button"
              onClick={() => handleToggleFulfillmentStatus('ready')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border font-poppins ${
                selectedFulfillmentStatuses.includes('ready')
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">check_circle</span>
              <span>Ready</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedFulfillmentStatuses.includes('ready') ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {kpiReady}
              </span>
            </button>

            {/* Completed Pill */}
            <button
              type="button"
              onClick={() => handleToggleFulfillmentStatus('completed')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border font-poppins ${
                selectedFulfillmentStatuses.includes('completed')
                  ? 'bg-green-700 text-white border-green-700 shadow-xs'
                  : 'bg-white text-green-800 border-green-200 hover:bg-green-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">verified</span>
              <span>Completed</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedFulfillmentStatuses.includes('completed') ? 'bg-white/20 text-white' : 'bg-green-100 text-green-800'
                }`}
              >
                {kpiCompleted}
              </span>
            </button>
          </div>

          {/* Right of status bar: Timestamp + Cancelled Archive Button + New Order Button */}
          <div className="flex items-center gap-2 pl-2 shrink-0 font-sans">
            <div className="hidden lg:flex items-center gap-1 text-[11px] text-[#5f5e5e] font-poppins">
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>Updated:</span>
              <span className="font-mono font-bold text-[#1d1c17]">{lastUpdated.toLocaleTimeString()}</span>
            </div>

            {/* Cancelled Orders Modal Button */}
            <button
              type="button"
              onClick={() => setIsCancelledModalOpen(true)}
              className={`h-[30px] px-2.5 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 font-sans font-poppins whitespace-nowrap border ${
                kpiCancelled > 0
                  ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                  : 'bg-white hover:bg-zinc-50 text-zinc-600 border-zinc-200'
              }`}
              title="View archived cancelled orders"
            >
              <span className={`material-symbols-outlined text-[15px] ${kpiCancelled > 0 ? 'text-red-600' : 'text-zinc-400'}`}>
                archive
              </span>
              <span>Cancelled</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  kpiCancelled > 0 ? 'bg-red-200 text-red-900' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {kpiCancelled}
              </span>
            </button>

            {/* New Online Order Button */}
            <button
              type="button"
              onClick={handleOpenCreateOrder}
              className="h-[30px] px-3 bg-[#ae001a] hover:bg-[#d2272f] text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 font-sans font-poppins whitespace-nowrap"
              title="Create new online order"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              <span>New Order</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-red-600 text-lg">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* 4. Main Views: Dispatch Board (Kanban) vs Table View */}
      {viewMode === 'split' ? (
        <div className="w-full overflow-x-auto pb-2">
          <div className="grid grid-cols-5 min-w-[780px] gap-2.5 sm:gap-3.5 items-start lg:min-w-0 w-full">
            {/* Column 1: RECEIVED */}
            <div className="bg-[#f7f5f0] border border-[#e8e2d8] rounded-xl overflow-hidden flex flex-col min-w-0">
              <div className="bg-[#e8e2d8] px-2.5 sm:px-3 py-2 flex items-center justify-between border-b border-[#d5cfc4] gap-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#1d1c17] uppercase tracking-wider truncate min-w-0">
                  <span className="material-symbols-outlined text-sky-700 text-base shrink-0">inbox</span>
                  <span className="truncate">RECEIVED</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-sky-800 border border-sky-200 shrink-0">
                  {filteredOrders.filter((o) => o.fulfillmentStatus === 'received').length}
                </span>
              </div>

              <div className="p-2 sm:p-2.5 space-y-2.5 min-h-[400px] overflow-y-auto max-h-[calc(100vh-320px)]">
                {filteredOrders
                  .filter((o) => o.fulfillmentStatus === 'received')
                  .map((order) => (
                    <KanbanOrderCard
                      key={order.id}
                      order={order}
                      onOpenInspector={openOrderInspection}
                      onAccept={() => handleAcceptOrder(order.id)}
                      onCancel={() => handleCancelOrder(order.id)}
                      onEdit={() => handleOpenEditOrder(order)}
                      formatCurrency={formatCurrency}
                      formatTimestamp={formatTimestamp}
                    />
                  ))}

                {filteredOrders.filter((o) => o.fulfillmentStatus === 'received').length === 0 && (
                  <div className="py-12 text-center text-xs text-[#8c857b] italic font-sans">
                    No orders awaiting acceptance
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: ACCEPTED */}
            <div className="bg-[#f7f5f0] border border-[#e8e2d8] rounded-xl overflow-hidden flex flex-col min-w-0">
              <div className="bg-[#e8e2d8] px-2.5 sm:px-3 py-2 flex items-center justify-between border-b border-[#d5cfc4] gap-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#1d1c17] uppercase tracking-wider truncate min-w-0">
                  <span className="material-symbols-outlined text-indigo-700 text-base shrink-0">task_alt</span>
                  <span className="truncate">ACCEPTED (POS)</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-indigo-800 border border-indigo-200 shrink-0">
                  {filteredOrders.filter((o) => o.fulfillmentStatus === 'accepted').length}
                </span>
              </div>

              <div className="p-2 sm:p-2.5 space-y-2.5 min-h-[400px] overflow-y-auto max-h-[calc(100vh-320px)]">
                {filteredOrders
                  .filter((o) => o.fulfillmentStatus === 'accepted')
                  .map((order) => (
                    <KanbanOrderCard
                      key={order.id}
                      order={order}
                      onOpenInspector={openOrderInspection}
                      onTransition={(st) => handleTransitionStatus(order.id, st)}
                      onEdit={() => handleOpenEditOrder(order)}
                      formatCurrency={formatCurrency}
                      formatTimestamp={formatTimestamp}
                    />
                  ))}

                {filteredOrders.filter((o) => o.fulfillmentStatus === 'accepted').length === 0 && (
                  <div className="py-12 text-center text-xs text-[#8c857b] italic font-sans">
                    No accepted orders in queue
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: IN PREPARATION */}
            <div className="bg-[#f7f5f0] border border-[#e8e2d8] rounded-xl overflow-hidden flex flex-col min-w-0">
              <div className="bg-[#e8e2d8] px-2.5 sm:px-3 py-2 flex items-center justify-between border-b border-[#d5cfc4] gap-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#1d1c17] uppercase tracking-wider truncate min-w-0">
                  <span className="material-symbols-outlined text-amber-700 text-base shrink-0">skillet</span>
                  <span className="truncate">IN PREPARATION</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-amber-800 border border-amber-200 shrink-0">
                  {
                    filteredOrders.filter(
                      (o) =>
                        o.fulfillmentStatus === 'in_preparation' ||
                        o.fulfillmentStatus === 'in_kitchen'
                    ).length
                  }
                </span>
              </div>

              <div className="p-2 sm:p-2.5 space-y-2.5 min-h-[400px] overflow-y-auto max-h-[calc(100vh-320px)]">
                {filteredOrders
                  .filter(
                    (o) =>
                      o.fulfillmentStatus === 'in_preparation' ||
                      o.fulfillmentStatus === 'in_kitchen'
                  )
                  .map((order) => (
                    <KanbanOrderCard
                      key={order.id}
                      order={order}
                      onOpenInspector={openOrderInspection}
                      onTransition={(st) => handleTransitionStatus(order.id, st)}
                      formatCurrency={formatCurrency}
                      formatTimestamp={formatTimestamp}
                    />
                  ))}

                {filteredOrders.filter(
                  (o) =>
                    o.fulfillmentStatus === 'in_preparation' ||
                    o.fulfillmentStatus === 'in_kitchen'
                ).length === 0 && (
                  <div className="py-12 text-center text-xs text-[#8c857b] italic font-sans">
                    No orders currently preparing
                  </div>
                )}
              </div>
            </div>

            {/* Column 4: READY FOR PICKUP / DELIVERY */}
            <div className="bg-[#f7f5f0] border border-[#e8e2d8] rounded-xl overflow-hidden flex flex-col min-w-0">
              <div className="bg-[#e8e2d8] px-2.5 sm:px-3 py-2 flex items-center justify-between border-b border-[#d5cfc4] gap-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#1d1c17] uppercase tracking-wider truncate min-w-0">
                  <span className="material-symbols-outlined text-emerald-700 text-base shrink-0">
                    notifications_active
                  </span>
                  <span className="truncate">READY</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-emerald-800 border border-emerald-200 shrink-0">
                  {
                    filteredOrders.filter(
                      (o) =>
                        o.fulfillmentStatus === 'ready' ||
                        o.fulfillmentStatus === 'ready_for_pickup' ||
                        o.fulfillmentStatus === 'out_for_delivery'
                    ).length
                  }
                </span>
              </div>

              <div className="p-2 sm:p-2.5 space-y-2.5 min-h-[400px] overflow-y-auto max-h-[calc(100vh-320px)]">
                {filteredOrders
                  .filter(
                    (o) =>
                      o.fulfillmentStatus === 'ready' ||
                      o.fulfillmentStatus === 'ready_for_pickup' ||
                      o.fulfillmentStatus === 'out_for_delivery'
                  )
                  .map((order) => (
                    <KanbanOrderCard
                      key={order.id}
                      order={order}
                      onOpenInspector={openOrderInspection}
                      onTransition={(st) => handleTransitionStatus(order.id, st)}
                      formatCurrency={formatCurrency}
                      formatTimestamp={formatTimestamp}
                    />
                  ))}

                {filteredOrders.filter(
                  (o) =>
                    o.fulfillmentStatus === 'ready' ||
                    o.fulfillmentStatus === 'ready_for_pickup' ||
                    o.fulfillmentStatus === 'out_for_delivery'
                ).length === 0 && (
                  <div className="py-12 text-center text-xs text-[#8c857b] italic font-sans">
                    No orders waiting for handover
                  </div>
                )}
              </div>
            </div>

            {/* Column 5: COMPLETED */}
            <div className="bg-[#f7f5f0] border border-[#e8e2d8] rounded-xl overflow-hidden flex flex-col min-w-0">
              <div className="bg-[#e8e2d8] px-2.5 sm:px-3 py-2 flex items-center justify-between border-b border-[#d5cfc4] gap-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#1d1c17] uppercase tracking-wider truncate min-w-0">
                  <span className="material-symbols-outlined text-green-800 text-base shrink-0">verified</span>
                  <span className="truncate">COMPLETED</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-green-900 border border-green-200 shrink-0">
                  {filteredOrders.filter((o) => o.fulfillmentStatus === 'completed').length}
                </span>
              </div>

              <div className="p-2 sm:p-2.5 space-y-2.5 min-h-[400px] overflow-y-auto max-h-[calc(100vh-320px)]">
                {filteredOrders
                  .filter((o) => o.fulfillmentStatus === 'completed')
                  .slice(0, 15)
                  .map((order) => (
                    <KanbanOrderCard
                      key={order.id}
                      order={order}
                      onOpenInspector={openOrderInspection}
                      formatCurrency={formatCurrency}
                      formatTimestamp={formatTimestamp}
                    />
                  ))}

                {filteredOrders.filter((o) => o.fulfillmentStatus === 'completed').length === 0 && (
                  <div className="py-12 text-center text-xs text-[#8c857b] italic font-sans">
                    No completed orders
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* TABLE DIRECTORY VIEW (Canonical KDS Standard matching OnlineMenuItemsView) */
        <div className="bg-white rounded-xl border border-[#e8e2d8] shadow-xs overflow-hidden">
          {/* Table Header Bar */}
          <div className="bg-[#222222] px-6 py-4 flex items-center justify-between border-b border-[#333333]">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#ae001a] text-xl select-none">
                list_alt
              </span>
              <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
                ONLINE ORDERS DIRECTORY
              </span>
              <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
                {filteredOrders.length === orders.length
                  ? `${orders.length} order${orders.length === 1 ? '' : 's'}`
                  : `${filteredOrders.length} / ${orders.length} orders`}
              </span>
            </div>

            <TableOptionsMenu
              onExportCSV={handleExportCSV}
              onPrint={handlePrintTable}
              onCopySummary={handleCopySummary}
              onReload={() => void fetchOrders(true)}
              columns={[
                { key: 'orderId', label: 'Order ID & POS Link' },
                { key: 'store', label: 'Digital Storefront' },
                { key: 'customer', label: 'Customer Profile' },
                { key: 'type', label: 'Order Type' },
                { key: 'itemsAndTotal', label: 'Items & Total' },
                { key: 'paymentStatus', label: 'Payment Status' },
                { key: 'fulfillmentStatus', label: 'Fulfillment State' },
                { key: 'timestamps', label: 'Milestone Timelines' },
                { key: 'actions', label: 'Dispatch Actions' },
              ]}
              visibleColumns={visibleColumns}
              onToggleColumn={(key) =>
                setVisibleColumns((prev) => ({
                  ...prev,
                  [key]: !prev[key],
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
              totalPages={totalPages}
            />
          </div>

          {dataColumnsCount === 0 ? (
            <NoColumnsEmptyState
              onReset={() =>
                setVisibleColumns({
                  orderId: true,
                  store: true,
                  customer: true,
                  type: true,
                  itemsAndTotal: true,
                  paymentStatus: true,
                  fulfillmentStatus: true,
                  timestamps: true,
                  actions: true,
                })
              }
            />
          ) : (
            <>
              <div className="w-full overflow-hidden">
                <table className="w-full border-collapse font-sans text-xs">
                  <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                    <tr>
                      {visibleColumns.orderId && (
                        <th
                          className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Order ID & POS
                        </th>
                      )}
                      {visibleColumns.store && (
                        <th
                          className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Storefront
                        </th>
                      )}
                      {visibleColumns.customer && (
                        <th
                          className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Customer
                        </th>
                      )}
                      {visibleColumns.type && (
                        <th
                          className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Order Type
                        </th>
                      )}
                      {visibleColumns.itemsAndTotal && (
                        <th
                          className={`text-right text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Total
                        </th>
                      )}
                      {visibleColumns.paymentStatus && (
                        <th
                          className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Payment
                        </th>
                      )}
                      {visibleColumns.fulfillmentStatus && (
                        <th
                          className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Fulfillment
                        </th>
                      )}
                      {visibleColumns.timestamps && (
                        <th
                          className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Timeline
                        </th>
                      )}
                      {visibleColumns.actions && (
                        <th
                          className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap`}
                        >
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8] text-xs text-[#1d1c17]">
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={activeColSpan}
                          className="px-6 py-12 text-center text-secondary font-sans bg-white"
                        >
                          <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                            sync
                          </span>
                          <p className="text-secondary text-body-md mt-2 font-sans">
                            Loading digital orders...
                          </p>
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td
                          colSpan={activeColSpan}
                          className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white"
                        >
                          <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                            error
                          </span>
                          <p className="font-bold">{error}</p>
                          <button
                            type="button"
                            onClick={() => void fetchOrders()}
                            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                          >
                            Retry Connection
                          </button>
                        </td>
                      </tr>
                    ) : filteredOrders.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="shopping_bag"
                        title="No online orders found"
                        description={
                          searchQuery
                            ? `No orders matching "${searchQuery}". Clear your search query or reset filters.`
                            : 'There are currently no customer online orders matching the selected parameters.'
                        }
                      />
                    ) : (
                      paginatedOrders.map((order) => (
                        <tr
                          key={order.id}
                          onClick={() => openOrderInspection(order)}
                          className="hover:bg-[#f8f3eb] transition-colors cursor-pointer group bg-white"
                        >
                          {/* Order ID */}
                          {visibleColumns.orderId && (
                            <td className={densityPadding}>
                              <div className="flex flex-col gap-1 items-start">
                                <span className="font-mono font-bold text-xs bg-[#222222] text-white px-2 py-0.5 rounded">
                                  #ONL-{order.id}
                                </span>
                                {order.orderId ? (
                                  <span className="font-mono font-bold text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">hub</span>
                                    #ORD-{order.orderId}
                                  </span>
                                ) : (
                                  <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                    No POS Bind
                                  </span>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Storefront */}
                          {visibleColumns.store && (
                            <td className={densityPadding}>
                              <div
                                className="font-medium text-[#1d1c17] truncate max-w-[130px]"
                                title={order.store?.subdomain ? `${order.store.subdomain}.x7pos.com` : '—'}
                              >
                                {order.store?.subdomain ? `${order.store.subdomain}.x7pos.com` : '—'}
                              </div>
                              <div className="text-[10px] text-[#8c857b]">Store #{order.storeId}</div>
                            </td>
                          )}

                          {/* Customer */}
                          {visibleColumns.customer && (
                            <td className={densityPadding}>
                              <div
                                className="font-bold text-[#1d1c17] group-hover:text-[#ae001a] transition-colors truncate max-w-[120px]"
                                title={order.customer?.name || `Customer #${order.customerId}`}
                              >
                                {order.customer?.name || `Customer #${order.customerId}`}
                              </div>
                              <div
                                className="text-[10px] text-[#8c857b] font-mono truncate max-w-[120px]"
                                title={order.customer?.email || '—'}
                              >
                                {order.customer?.email || '—'}
                              </div>
                            </td>
                          )}

                          {/* Type */}
                          {visibleColumns.type && (
                            <td className={`${densityPadding} text-center`}>
                              {order.type === 'delivery' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                                  Delivery
                                </span>
                              )}
                              {order.type === 'pickup' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">takeout_dining</span>
                                  Takeout
                                </span>
                              )}
                              {order.type === 'dine_in' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">restaurant</span>
                                  Dine-In
                                </span>
                              )}
                            </td>
                          )}

                          {/* Items & Total */}
                          {visibleColumns.itemsAndTotal && (
                            <td className={`${densityPadding} text-right whitespace-nowrap`}>
                              <div className="font-bold font-mono text-sm text-[#1d1c17]">
                                {formatCurrency(order.totalAmount)}
                              </div>
                              <div
                                className="text-[10px] text-[#8c857b] font-sans cursor-help"
                                title={order.items?.map(it => `${it.quantity}x ${it.product?.name || 'Item'}`).join(', ') || undefined}
                              >
                                {(() => {
                                  const count = order.items?.reduce((sum, it) => sum + (it.quantity || 1), 0) ?? order.items?.length ?? 0;
                                  return `${count} ${count === 1 ? 'item' : 'items'}`;
                                })()}
                              </div>
                            </td>
                          )}

                          {/* Payment */}
                          {visibleColumns.paymentStatus && (
                            <td className={`${densityPadding} text-center`}>
                              {order.paymentStatus === 'paid' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                  PAID
                                </span>
                              )}
                              {order.paymentStatus === 'pending' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">schedule</span>
                                  PENDING
                                </span>
                              )}
                              {(order.paymentStatus === 'failed' || order.paymentStatus === 'refunded') && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-800 border border-red-200 inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">error</span>
                                  {order.paymentStatus.toUpperCase()}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Fulfillment */}
                          {visibleColumns.fulfillmentStatus && (
                            <td className={`${densityPadding} text-center`}>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border inline-flex items-center gap-1 ${
                                  order.fulfillmentStatus === 'received'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : order.fulfillmentStatus === 'accepted'
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : order.fulfillmentStatus === 'in_preparation' ||
                                      order.fulfillmentStatus === 'in_kitchen'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : order.fulfillmentStatus === 'ready' ||
                                      order.fulfillmentStatus === 'ready_for_pickup' ||
                                      order.fulfillmentStatus === 'out_for_delivery'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : order.fulfillmentStatus === 'completed'
                                    ? 'bg-green-100 text-green-800 border-green-300'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }`}
                              >
                                {order.fulfillmentStatus.replace(/_/g, ' ').toUpperCase()}
                              </span>
                              {order.kitchenOrders?.[0]?.station?.name && (
                                <div className="mt-1 text-[10px] text-red-800 font-medium flex items-center justify-center gap-0.5 whitespace-nowrap">
                                  <span className="material-symbols-outlined text-[11px] text-red-600">soup_kitchen</span>
                                  <span>{order.kitchenOrders[0].station.name}</span>
                                </div>
                              )}
                            </td>
                          )}

                          {/* Timestamps */}
                          {visibleColumns.timestamps && (
                            <td className={densityPadding}>
                              <div className="text-[11px] text-[#1d1c17] whitespace-nowrap">
                                {formatFullDate(order.placedAt || order.createdAt)}
                              </div>
                              {order.acceptedAt && (
                                <div className="text-[10px] text-indigo-700 whitespace-nowrap font-mono">
                                  Accepted: {formatTimestamp(order.acceptedAt)}
                                </div>
                              )}
                            </td>
                          )}

                          {/* Actions */}
                          {visibleColumns.actions && (
                            <td
                              className={`${densityPadding} text-center`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                {order.fulfillmentStatus === 'received' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleAcceptOrder(order.id)}
                                      className="w-7 h-7 rounded flex items-center justify-center bg-[#ae001a] hover:bg-[#d2272f] text-white transition-colors cursor-pointer"
                                      title="Accept and inject into POS"
                                    >
                                      <span className="material-symbols-outlined text-[18px] leading-none">
                                        check
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelOrder(order.id)}
                                      className="w-7 h-7 rounded flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                                      title="Reject / Cancel Order"
                                    >
                                      <span className="material-symbols-outlined text-[18px] leading-none">
                                        cancel
                                      </span>
                                    </button>
                                  </>
                                )}

                                {order.fulfillmentStatus === 'accepted' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleTransitionStatus(order.id, 'in_preparation')
                                    }
                                    className="w-7 h-7 rounded flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
                                    title="Start Prep"
                                  >
                                    <span className="material-symbols-outlined text-[18px] leading-none">
                                      skillet
                                    </span>
                                  </button>
                                )}

                                {(order.fulfillmentStatus === 'in_preparation' ||
                                  order.fulfillmentStatus === 'in_kitchen') && (
                                  <button
                                    type="button"
                                    onClick={() => handleTransitionStatus(order.id, 'ready')}
                                    className="w-7 h-7 rounded flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                                    title="Mark Ready"
                                  >
                                    <span className="material-symbols-outlined text-[18px] leading-none">
                                      notifications_active
                                    </span>
                                  </button>
                                )}

                                {(order.fulfillmentStatus === 'ready' ||
                                  order.fulfillmentStatus === 'ready_for_pickup' ||
                                  order.fulfillmentStatus === 'out_for_delivery') && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleTransitionStatus(order.id, 'completed')
                                    }
                                    className="w-7 h-7 rounded flex items-center justify-center bg-green-600 hover:bg-green-700 text-white transition-colors cursor-pointer"
                                    title="Complete Order"
                                  >
                                    <span className="material-symbols-outlined text-[18px] leading-none">
                                      verified
                                    </span>
                                  </button>
                                )}

                                {isOnlineOrderEditable(order) && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditOrder(order)}
                                    className="w-7 h-7 rounded flex items-center justify-center text-[#8c857b] hover:text-[#ae001a] hover:bg-[#ece8e0] transition-colors cursor-pointer"
                                    title="Edit order"
                                  >
                                    <span className="material-symbols-outlined text-[18px] leading-none">
                                      edit
                                    </span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => openOrderInspection(order)}
                                  className="w-7 h-7 rounded flex items-center justify-center text-[#8c857b] hover:text-[#1d1c17] hover:bg-[#ece8e0] transition-colors cursor-pointer"
                                  title="Inspect order details"
                                >
                                  <span className="material-symbols-outlined text-[18px] leading-none">
                                    visibility
                                  </span>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination Footer */}
              <TablePaginationFooter
                totalItems={filteredOrders.length}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                startItem={(currentPage - 1) * pageSize + 1}
                endItem={Math.min(currentPage * pageSize, filteredOrders.length)}
              />
            </>
          )}
        </div>
      )}

      {/* 5. Order Details Inspection Drawer */}
      <OnlineOrderDetailsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        order={selectedOrder}
        kitchenStations={kitchenStations}
        onAcceptOrder={handleAcceptOrder}
        onCancelOrder={handleCancelOrder}
        onTransitionStatus={handleTransitionStatus}
        onUpdatePaymentStatus={handleUpdatePaymentStatus}
        onEditOrder={(order) => {
          setIsDrawerOpen(false);
          handleOpenEditOrder(order);
        }}
      />

      {/* 6. Online Order Setup Drawer (Add / Edit) */}
      <OnlineOrderSetupDrawer
        isOpen={isSetupDrawerOpen}
        mode={setupDrawerMode}
        initialData={orderToEdit}
        stores={stores}
        customers={customers}
        products={products}
        onlineMenus={onlineMenus}
        onlineMenuItems={onlineMenuItems}
        kitchenStations={kitchenStations}
        onClose={() => setIsSetupDrawerOpen(false)}
        onSubmit={handleSubmitOrderSetup}
      />

      {/* 5c. Cancelled Orders Archive Modal */}
      <CancelledOrdersModal
        isOpen={isCancelledModalOpen}
        onClose={() => setIsCancelledModalOpen(false)}
        orders={orders}
        onInspectOrder={openOrderInspection}
        formatCurrency={formatCurrency}
        formatTimestamp={formatTimestamp}
      />

      {/* 6. Isolated Dev Simulator: Deleting OnlineOrdersDevSimulator.tsx safely unmounts it with zero errors */}
      {OnlineOrdersDevSimulator && (
        <OnlineOrdersDevSimulator
          onComplete={() => void fetchOrders(false)}
          stores={stores}
        />
      )}
    </div>
  );
};

interface KanbanOrderCardProps {
  order: OnlineOrderDetailData;
  onOpenInspector: (order: OnlineOrderDetailData) => void;
  onAccept?: () => void;
  onCancel?: () => void;
  onTransition?: (st: OnlineOrderDetailData['fulfillmentStatus']) => void;
  onEdit?: (order: OnlineOrderDetailData) => void;
  formatCurrency: (val: number | string | undefined | null) => string;
  formatTimestamp: (dateStr?: string | null) => string;
}

const KanbanOrderCard: React.FC<KanbanOrderCardProps> = ({
  order,
  onOpenInspector,
  onAccept,
  onCancel,
  onTransition,
  onEdit,
  formatCurrency,
  formatTimestamp,
}) => {
  return (
    <div
      onClick={() => onOpenInspector(order)}
      className="bg-white border border-[#e8e2d8] rounded-xl p-2.5 sm:p-3 shadow-xs hover:shadow-md hover:border-[#ae001a] transition-all cursor-pointer group flex flex-col justify-between gap-2 sm:gap-2.5 font-sans min-w-0 overflow-hidden"
    >
      {/* Top Row: #ONL & POS Link */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono font-bold text-xs bg-[#222222] text-white px-2 py-0.5 rounded">
            #ONL-{order.id}
          </span>
          {order.orderId ? (
            <span className="font-mono font-bold text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[11px]">hub</span>
              #ORD-{order.orderId}
            </span>
          ) : (
            <span className="font-mono text-[9px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
              No POS
            </span>
          )}
        </div>

        <span className="text-[11px] font-mono text-[#8c857b]">
          {formatTimestamp(order.placedAt || order.createdAt)}
        </span>
      </div>

      {/* Customer & Store Info */}
      <div>
        <div className="font-bold text-[#1d1c17] text-xs group-hover:text-[#ae001a] transition-colors truncate">
          {order.customer?.name || `Customer #${order.customerId}`}
        </div>
        <div className="text-[10px] text-[#8c857b] font-mono truncate">
          {order.store?.subdomain ? `${order.store.subdomain}.x7pos.com` : `Store #${order.storeId}`}
        </div>
      </div>

      {/* Type & Payment Badges */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#f2ede5]">
        {/* Type Pill */}
        {order.type === 'delivery' && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
            <span className="material-symbols-outlined text-[11px]">local_shipping</span>
            Delivery
          </span>
        )}
        {order.type === 'pickup' && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <span className="material-symbols-outlined text-[11px]">takeout_dining</span>
            Pickup
          </span>
        )}
        {order.type === 'dine_in' && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
            <span className="material-symbols-outlined text-[11px]">restaurant</span>
            Dine-In
          </span>
        )}

        {/* Payment Pill */}
        {order.paymentStatus === 'paid' && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
            PAID
          </span>
        )}
        {order.paymentStatus === 'pending' && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200">
            UNPAID
          </span>
        )}
        {(order.paymentStatus === 'failed' || order.paymentStatus === 'refunded') && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-50 text-red-800 border border-red-200">
            {order.paymentStatus.toUpperCase()}
          </span>
        )}

        <span className="ml-auto font-mono font-bold text-xs text-[#1d1c17]">
          {formatCurrency(order.totalAmount)}
        </span>
      </div>

      {/* Customer Note Preview */}
      {order.notes && (
        <div className="text-[10px] text-amber-900 bg-amber-50/80 px-2 py-1 rounded border border-amber-200/60 truncate italic flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px] shrink-0">speaker_notes</span>
          <span className="truncate">{order.notes}</span>
        </div>
      )}

      {/* Assigned Kitchen Station */}
      {order.kitchenOrders?.[0]?.station?.name && (
        <div className="text-[10px] font-medium text-red-800 bg-red-50/80 px-2 py-0.5 rounded border border-red-200/60 truncate flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px] shrink-0 text-red-600">soup_kitchen</span>
          <span className="truncate">{order.kitchenOrders[0].station.name}</span>
        </div>
      )}

      {/* Action Footer */}
      <div
        className="pt-2 border-t border-[#f2ede5] flex items-center justify-between gap-1 min-w-0 h-9"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 shrink-0 h-7">
          <button
            type="button"
            onClick={() => onOpenInspector(order)}
            className="w-7 h-7 rounded flex items-center justify-center text-[#8c857b] hover:text-[#1d1c17] hover:bg-[#f2ede5] transition-colors cursor-pointer"
            title="Inspect Order Details"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">visibility</span>
          </button>

          {onEdit && isOnlineOrderEditable(order) && (
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="w-7 h-7 rounded flex items-center justify-center text-[#8c857b] hover:text-[#ae001a] hover:bg-[#f2ede5] transition-colors cursor-pointer"
              title="Edit Order"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">edit</span>
            </button>
          )}

          {order.fulfillmentStatus === 'received' && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-7 h-7 rounded flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              title="Reject / Cancel Order"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">cancel</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 h-7">
          {order.fulfillmentStatus === 'received' && onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="w-7 h-7 rounded flex items-center justify-center bg-[#ae001a] hover:bg-[#d2272f] text-white transition-colors shadow-xs cursor-pointer shrink-0"
              title="Accept and inject into POS"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">check</span>
            </button>
          )}

          {order.fulfillmentStatus === 'accepted' && onTransition && (
            <button
              type="button"
              onClick={() => onTransition('in_preparation')}
              className="w-7 h-7 rounded flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-xs cursor-pointer shrink-0"
              title="Start Prep"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">skillet</span>
            </button>
          )}

          {(order.fulfillmentStatus === 'in_preparation' ||
            order.fulfillmentStatus === 'in_kitchen') &&
            onTransition && (
              <button
                type="button"
                onClick={() =>
                  onTransition(
                    order.type === 'delivery'
                      ? 'out_for_delivery'
                      : 'ready_for_pickup'
                  )
                }
                className="w-7 h-7 rounded flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs cursor-pointer shrink-0"
                title={
                  order.type === 'delivery'
                    ? 'Mark Out for Delivery (syncs KDS)'
                    : 'Mark Ready for Pickup (syncs KDS)'
                }
              >
                <span className="material-symbols-outlined text-[18px] leading-none">notifications_active</span>
              </button>
            )}

          {(order.fulfillmentStatus === 'ready' ||
            order.fulfillmentStatus === 'ready_for_pickup' ||
            order.fulfillmentStatus === 'out_for_delivery') &&
            onTransition && (
              <button
                type="button"
                onClick={() => onTransition('completed')}
                className="w-7 h-7 rounded flex items-center justify-center bg-green-600 hover:bg-green-700 text-white transition-colors shadow-xs cursor-pointer shrink-0"
                title="Complete Order"
              >
                <span className="material-symbols-outlined text-[18px] leading-none">verified</span>
              </button>
            )}
        </div>
      </div>
    </div>
  );
};
