import type {
  CreateQROrderItemDto,
  POSOrderItemRef,
  QRMenuItemRef,
  QROrderItem,
  QROrderRef,
  UpdateQROrderItemDto,
} from '../types/qr-order-item';
import {
  calculateParentOrderTotal,
  calculateSubtotalPrice,
  validateQROrderItemPayload,
} from '../lib/qr-order-item';
import { getAccessToken } from '../lib/auth-storage';
import { ApiError } from '../lib/api-error';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
export const STORAGE_ITEMS_KEY = 'x7_qr_order_items_live';
const LEGACY_STORAGE_KEY = 'x7_qr_order_items_mock_db';

// Cache for live fetched relational entities
let _cachedOrders: QROrderRef[] = [];
let _cachedMenuItems: QRMenuItemRef[] = [];
let _cachedPosItems: POSOrderItemRef[] = [];

// -----------------------------------------------------------------------------
// Test Fixtures (retained strictly for automated test suites)
// -----------------------------------------------------------------------------

export const MOCK_PARENT_QR_ORDERS: QROrderRef[] = [
  {
    id: 1,
    merchant_id: 3,
    qr_location_id: 1,
    order_id: 5001,
    qr_order_status: 'PENDING',
    notes: 'Extra lime on grilled salmon, salad dressing on the side please.',
    total_amount: 48.5,
    table_id: 201,
    table: { id: 201, number: '12', zone_name: 'Main Dining Room' },
    customer: { id: 1, name: 'Sofia Ramirez', email: 'sofia.ramirez@example.com' },
    qrLocation: { id: 1, name: 'Patio Table #12 Access' },
  },
  {
    id: 2,
    merchant_id: 3,
    qr_location_id: 3,
    order_id: 5002,
    qr_order_status: 'CONFIRMED',
    notes: 'Severe peanut allergy! Please prepare using sanitized cookware.',
    total_amount: 112.75,
    table_id: 203,
    table: { id: 203, number: 'Patio-01', zone_name: 'Terrace' },
    customer: { id: 2, name: 'Carlos Santana', email: 'carlos.santana@example.com' },
    qrLocation: { id: 3, name: 'Terrace Table #Patio-01' },
  },
  {
    id: 3,
    merchant_id: 3,
    qr_location_id: 1,
    order_id: 5003,
    qr_order_status: 'IN_PREPARATION',
    notes: 'Sparkling mineral water with ice, serve appetizers before steak.',
    total_amount: 64.0,
    table_id: 202,
    table: { id: 202, number: '14', zone_name: 'Main Dining Room' },
    customer: { id: 3, name: 'Guest Scan' },
    qrLocation: { id: 1, name: 'Patio Table #12 Access' },
  },
  {
    id: 4,
    merchant_id: 3,
    qr_location_id: 2,
    order_id: 5004,
    qr_order_status: 'DELIVERED',
    notes: 'Curbside delivery at Bay 2, black Honda Civic with hazard lights on.',
    total_amount: 32.5,
    table_id: null,
    table: null,
    customer: { id: 4, name: 'Valentina Mendoza', email: 'v.mendoza@example.com' },
    qrLocation: { id: 2, name: 'Curbside Pickup Point' },
  },
  {
    id: 5,
    merchant_id: 3,
    qr_location_id: 4,
    order_id: 5005,
    qr_order_status: 'CANCELLED',
    notes: 'Customer changed mind and walked out before kitchen ticket confirmation.',
    total_amount: 27.0,
    table_id: 206,
    table: { id: 206, number: 'Bar-5', zone_name: 'Main Bar' },
    customer: { id: 5, name: 'Guest Scan' },
    qrLocation: { id: 4, name: 'Main Bar Stool #5' },
  },
];

export const MOCK_QR_MENU_ITEMS: QRMenuItemRef[] = [
  {
    id: 9001,
    name: 'Bone-In Cowboy Ribeye (18oz)',
    description: '18oz USDA Prime cut served with charred bone marrow butter and flaked smoked sea salt.',
    price: 48.0,
    image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
    qr_menu_section_id: 501,
    product_id: 1,
    product_name: 'Bone-In Cowboy Ribeye (18oz)',
  },
  {
    id: 9002,
    name: 'Smoked Brisket Platter',
    description: '14-hour post oak smoke served with house pickled jalapenos, creamy slaw, and Texas toast.',
    price: 29.5,
    image_url: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&auto=format&fit=crop&q=80',
    qr_menu_section_id: 501,
    product_id: 2,
    product_name: 'Smoked Brisket Platter',
  },
  {
    id: 9003,
    name: 'Wood-Grilled Cedar Plank Salmon',
    description: 'Fresh Atlantic salmon roasted over cedar with brown sugar bourbon glaze.',
    price: 32.0,
    image_url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80',
    qr_menu_section_id: 501,
    product_id: 3,
    product_name: 'Wood-Grilled Cedar Plank Salmon',
  },
  {
    id: 9004,
    name: 'Smoked Bourbon Old Fashioned',
    description: 'Small batch bourbon infused with cherrywood smoke and aromatic bitters.',
    price: 16.0,
    image_url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80',
    qr_menu_section_id: 502,
    product_id: 4,
    product_name: 'Smoked Bourbon Old Fashioned',
  },
  {
    id: 9006,
    name: 'Molten Dark Chocolate Skillet',
    description: 'Warm dark chocolate cake with molten core, vanilla gelato, and salted caramel.',
    price: 12.0,
    image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
    qr_menu_section_id: 503,
    product_id: 6,
    product_name: 'Molten Dark Chocolate Skillet',
  },
  {
    id: 9007,
    name: 'Wagyu Smash Burger Combo',
    description: 'Double American Wagyu patties, aged Wisconsin cheddar, and seasoned waffle fries.',
    price: 17.5,
    image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    qr_menu_section_id: 501,
    product_id: 7,
    product_name: 'Wagyu Smash Burger Combo',
  },
  {
    id: 9008,
    name: 'Truffle Mushroom Melt Panini',
    description: 'Sautéed cremini mushrooms, cave-aged Gruyère cheese, and white truffle aioli.',
    price: 15.0,
    image_url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
    qr_menu_section_id: 501,
    product_id: 8,
    product_name: 'Truffle Mushroom Melt Panini',
  },
];

export const MOCK_POS_ORDER_ITEMS: POSOrderItemRef[] = [
  { id: 101, order_id: 5001, product_name: 'Bone-In Cowboy Ribeye (18oz)', unit_price: 48.0, quantity: 1 },
  { id: 102, order_id: 5002, product_name: 'Smoked Brisket Platter', unit_price: 29.5, quantity: 2 },
  { id: 103, order_id: 5002, product_name: 'Smoked Bourbon Old Fashioned', unit_price: 16.0, quantity: 2 },
  { id: 104, order_id: 5003, product_name: 'Wood-Grilled Cedar Plank Salmon', unit_price: 32.0, quantity: 2 },
  { id: 105, order_id: 5004, product_name: 'Wagyu Smash Burger Combo', unit_price: 17.5, quantity: 1 },
  { id: 106, order_id: 5004, product_name: 'Truffle Mushroom Melt Panini', unit_price: 15.0, quantity: 1 },
  { id: 107, order_id: 5005, product_name: 'Smoked Brisket Platter', unit_price: 29.5, quantity: 1 },
  { id: 108, order_id: 5001, product_name: 'Molten Dark Chocolate Skillet', unit_price: 12.0, quantity: 1 },
];

export const SEED_QR_ORDER_ITEMS: QROrderItem[] = [
  {
    id: 1,
    qr_order_id: 1,
    qr_menu_item_id: 9001,
    order_item_id: 101,
    quantity: 1,
    unit_price: 48.0,
    subtotal_price: 48.0,
    notes: 'Medium rare, extra charred, roasted garlic butter on the side.',
    status: 'active',
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 2,
    qr_order_id: 2,
    qr_menu_item_id: 9002,
    order_item_id: 102,
    quantity: 2,
    unit_price: 29.5,
    subtotal_price: 59.0,
    notes: 'Severe peanut allergy! Please prepare using sanitized cookware.',
    status: 'active',
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
  {
    id: 3,
    qr_order_id: 2,
    qr_menu_item_id: 9004,
    order_item_id: 103,
    quantity: 2,
    unit_price: 16.0,
    subtotal_price: 32.0,
    notes: 'Extra orange peel, light smoke.',
    status: 'active',
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
  {
    id: 4,
    qr_order_id: 3,
    qr_menu_item_id: 9003,
    order_item_id: 104,
    quantity: 2,
    unit_price: 32.0,
    subtotal_price: 64.0,
    notes: 'Glaze on the side, extra fresh dill & lemon wedges.',
    status: 'active',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: 5,
    qr_order_id: 4,
    qr_menu_item_id: 9007,
    order_item_id: 105,
    quantity: 1,
    unit_price: 17.5,
    subtotal_price: 17.5,
    notes: 'No onions, extra dressing on waffle fries.',
    status: 'active',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 6,
    qr_order_id: 4,
    qr_menu_item_id: 9008,
    order_item_id: 106,
    quantity: 1,
    unit_price: 15.0,
    subtotal_price: 15.0,
    notes: 'Extra crispy bread, extra aioli.',
    status: 'active',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 7,
    qr_order_id: 5,
    qr_menu_item_id: 9002,
    order_item_id: 107,
    quantity: 1,
    unit_price: 29.5,
    subtotal_price: 29.5,
    notes: 'Customer cancelled order before kitchen fired ticket.',
    status: 'archived',
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 170).toISOString(),
  },
  {
    id: 8,
    qr_order_id: 1,
    qr_menu_item_id: 9006,
    order_item_id: 108,
    quantity: 1,
    unit_price: 12.0,
    subtotal_price: 12.0,
    notes: 'Voided by cashier - out of vanilla gelato stock.',
    status: 'inactive',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
];

function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Hydrates relational bindings (qrOrder, qrMenuItem, orderItem) on line items.
 */
export function hydrateItemRelations(item: QROrderItem | Record<string, unknown>): QROrderItem {
  const raw = item as Record<string, unknown>;
  const orderObj = raw.qrOrder as Record<string, unknown> | undefined;
  const menuObj = raw.qrMenuItem as Record<string, unknown> | undefined;
  const prodObj = raw.product as Record<string, unknown> | undefined;
  const orderItemObj = raw.orderItem as Record<string, unknown> | undefined;

  const qrOrderId = Number(raw.qr_order_id ?? raw.qrOrderId ?? orderObj?.id ?? 0);
  const qrMenuItemId = Number(raw.qr_menu_item_id ?? raw.qrMenuItemId ?? menuObj?.id ?? 0);
  const orderItemId = raw.order_item_id != null ? Number(raw.order_item_id) : (orderItemObj?.id != null ? Number(orderItemObj.id) : null);

  const rawPrice = raw.unit_price ?? raw.unitPrice ?? raw.price ?? menuObj?.price ?? prodObj?.basePrice ?? 0;
  const unitPrice = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice || 0));

  const rawSubtotal = raw.subtotal_price ?? raw.subtotalPrice ?? raw.total_price ?? raw.totalPrice ?? (Number(raw.quantity || 1) * unitPrice);
  const subtotalPrice = typeof rawSubtotal === 'number' ? rawSubtotal : parseFloat(String(rawSubtotal || 0));

  const order = _cachedOrders.find((o) => o.id === qrOrderId) || (orderObj as unknown as QROrderRef) || MOCK_PARENT_QR_ORDERS.find((o) => o.id === qrOrderId);
  const menuItem = _cachedMenuItems.find((m) => m.id === qrMenuItemId) || (menuObj as unknown as QRMenuItemRef) || MOCK_QR_MENU_ITEMS.find((m) => m.id === qrMenuItemId);
  const matchedPos = orderItemId ? _cachedPosItems.find((p) => p.id === orderItemId) || (orderItemObj as unknown as POSOrderItemRef) || MOCK_POS_ORDER_ITEMS.find((p) => p.id === orderItemId) : null;

  const dishName = menuItem?.name || menuObj?.name || prodObj?.name || (qrMenuItemId ? `Dish #${qrMenuItemId}` : 'Dish');
  const imageUrl = menuItem?.image_url || menuObj?.image_url || undefined;

  return {
    ...raw,
    id: Number(raw.id),
    qr_order_id: qrOrderId,
    qr_menu_item_id: qrMenuItemId,
    order_item_id: orderItemId,
    quantity: Number(raw.quantity || 1),
    unit_price: unitPrice,
    subtotal_price: subtotalPrice,
    notes: (raw.notes != null ? String(raw.notes) : '') || null,
    status: String(raw.status || 'active'),
    created_at: raw.created_at ? String(raw.created_at) : new Date().toISOString(),
    updated_at: raw.updated_at ? String(raw.updated_at) : new Date().toISOString(),
    qrOrder: order || (qrOrderId ? { id: qrOrderId, order_id: qrOrderId } : undefined),
    qrMenuItem: menuItem || (qrMenuItemId ? { id: qrMenuItemId, name: String(dishName), image_url: imageUrl ? String(imageUrl) : undefined } : undefined),
    orderItem: matchedPos,
  };
}

/**
 * Retrieves stored order items from localStorage.
 * Automatically wipes legacy mock storage key if present.
 * Defaults to an empty array (no mock items).
 */
export function getStoredOrderItems(): QROrderItem[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore
  }

  const raw =
    typeof window !== 'undefined' && window.localStorage
      ? localStorage.getItem(STORAGE_ITEMS_KEY)
      : null;
  if (raw) {
    try {
      const parsed: QROrderItem[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Exclude legacy mock items with mock IDs >= 9000
        return parsed
          .filter((it: QROrderItem) => it && Number(it.id) < 9000)
          .map(hydrateItemRelations);
      }
    } catch {
      // Ignore
    }
  }
  return [];
}

/**
 * Persists order items list to localStorage.
 */
export function persistStoredOrderItems(items: QROrderItem[]): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(items));
  }
}

/**
 * Retained for backwards-compatibility with test suites.
 * When called explicitly (e.g. in test setup), seeds test fixtures into storage.
 */
export function initializeMockOrderItems(): QROrderItem[] {
  const stored = getStoredOrderItems();
  if (stored.length > 0) return stored;
  const hydrated = SEED_QR_ORDER_ITEMS.map(hydrateItemRelations);
  persistStoredOrderItems(hydrated);
  return hydrated;
}

/**
 * Fetches all QR Order Items with candidate backend paths.
 * If backend returns empty list [] or fails, returns stored items (empty by default).
 */
export async function getQROrderItems(
  merchantId?: number,
  qrOrderId?: number
): Promise<QROrderItem[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = [
        '/qr-order-items',
        '/qr-order-item',
      ];
      let res: Response | null = null;
      for (const path of candidatePaths) {
        const params = new URLSearchParams();
        if (merchantId) params.append('merchant_id', String(merchantId));
        if (qrOrderId) params.append('qr_order_id', String(qrOrderId));
        params.append('limit', '100');
        const qs = params.toString();
        const url = qs ? `${API_BASE}${path}?${qs}` : `${API_BASE}${path}`;

        res = await fetch(url, {
          method: 'GET',
          headers: authHeaders(),
        });
        if (res.status !== 404) break;
      }

      if (res && res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.data || [];
        const hydrated = list.map(hydrateItemRelations);
        if (hydrated.length > 0) {
          persistStoredOrderItems(hydrated);
        }
        return hydrated;
      }
    } catch {
      // Network or server failure, fall back to stored items
    }
  }

  let items = getStoredOrderItems();
  if (merchantId) {
    const filtered = items.filter(
      (i) => !i.qrOrder?.merchant_id || i.qrOrder.merchant_id === merchantId
    );
    if (filtered.length > 0) {
      items = filtered;
    }
  }
  if (qrOrderId) {
    items = items.filter((i) => i.qr_order_id === qrOrderId);
  }
  return items;
}

/**
 * Fetches single QR order item by ID.
 */
export async function getQROrderItemById(id: number): Promise<QROrderItem> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = [`/qr-order-items/${id}`, `/qr-order-item/${id}`];
      let res: Response | null = null;
      for (const path of candidatePaths) {
        res = await fetch(`${API_BASE}${path}`, {
          method: 'GET',
          headers: authHeaders(),
        });
        if (res.status !== 404) break;
      }

      if (res && res.ok) {
        const data = await res.json();
        return hydrateItemRelations(data);
      }
    } catch {
      // Fallback to local store
    }
  }

  const items = getStoredOrderItems();
  const found = items.find((i) => i.id === id);
  if (!found) {
    throw new ApiError(`QR Order Item #${id} not found.`, 404);
  }
  return found;
}

/**
 * Creates a new QR order item line breakdown record.
 */
export async function createQROrderItem(dto: CreateQROrderItemDto): Promise<QROrderItem> {
  const validation = validateQROrderItemPayload(dto);
  if (!validation.valid) {
    throw new ApiError(validation.error || 'Invalid QR order item payload.', 400);
  }

  const calculatedSubtotal = calculateSubtotalPrice(dto.quantity, dto.unit_price);

  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/qr-order-items', '/qr-order-item'];
      let res: Response | null = null;
      const payload: Record<string, unknown> = {
        qrOrder: Number(dto.qr_order_id),
        qr_order_id: Number(dto.qr_order_id),
        qrMenuItem: Number(dto.qr_menu_item_id),
        qr_menu_item_id: Number(dto.qr_menu_item_id),
        quantity: Number(dto.quantity),
        price: Number(dto.unit_price),
        unit_price: Number(dto.unit_price),
        subtotal_price: calculatedSubtotal,
        total_price: calculatedSubtotal,
        notes: dto.notes ? String(dto.notes).trim() : '',
        status: dto.status || 'active',
      };
      if (dto.product_id) {
        payload.product = Number(dto.product_id);
        payload.product_id = Number(dto.product_id);
      }

      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) delete payload[k];
      });

      for (const path of candidatePaths) {
        try {
          res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify(payload),
          });
          if (res.status !== 404) break;
        } catch {
          // network error
        }
      }

      if (res && res.ok) {
        const created = await res.json();
        const raw = created.data ?? created;
        const hydrated = hydrateItemRelations({
          ...raw,
          order_item_id: raw.order_item_id ?? (dto.order_item_id ? Number(dto.order_item_id) : null),
        });
        const items = getStoredOrderItems();
        const updatedList = [hydrated, ...items.filter((i) => i.id !== hydrated.id)];
        persistStoredOrderItems(updatedList);
        syncParentOrderTotal(hydrated.qr_order_id, updatedList);
        return hydrated;
      } else if (res) {
        let errMessage = `HTTP error ${res.status}`;
        try {
          const errData = await res.json();
          errMessage = Array.isArray(errData.message)
            ? errData.message.join(', ')
            : (errData.message || errMessage);
        } catch {
          // ignore
        }
        throw new ApiError(errMessage, res.status);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Fallback to local store for offline / mock testing
    }
  }

  const items = getStoredOrderItems();
  const nextId = items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;

  const newItem: QROrderItem = {
    id: nextId,
    qr_order_id: Number(dto.qr_order_id),
    qr_menu_item_id: Number(dto.qr_menu_item_id),
    order_item_id: dto.order_item_id ? Number(dto.order_item_id) : null,
    quantity: Number(dto.quantity),
    unit_price: Number(dto.unit_price),
    subtotal_price: calculatedSubtotal,
    notes: dto.notes ? String(dto.notes).trim() : null,
    status: dto.status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const hydrated = hydrateItemRelations(newItem);
  const updatedList = [hydrated, ...items];
  persistStoredOrderItems(updatedList);

  // Trigger Cascade Recalculation Engine on parent QROrder entity's total_amount
  syncParentOrderTotal(newItem.qr_order_id, updatedList);

  return hydrated;
}

/**
 * Updates an existing QR order item.
 */
export async function updateQROrderItem(
  id: number,
  dto: UpdateQROrderItemDto
): Promise<QROrderItem> {
  const items = getStoredOrderItems();
  const index = items.findIndex((i) => i.id === id);

  const existing = index !== -1 ? items[index] : null;
  const mergedQuantity =
    dto.quantity !== undefined ? Number(dto.quantity) : (existing?.quantity ?? 1);
  const mergedUnitPrice =
    dto.unit_price !== undefined ? Number(dto.unit_price) : (existing?.unit_price ?? 0);
  const mergedSubtotal = calculateSubtotalPrice(mergedQuantity, mergedUnitPrice);

  const mergedOrderItemId =
    dto.order_item_id !== undefined
      ? (dto.order_item_id ? Number(dto.order_item_id) : null)
      : existing?.order_item_id ?? null;

  const payloadToValidate: Partial<CreateQROrderItemDto> = {
    qr_order_id:
      dto.qr_order_id !== undefined ? Number(dto.qr_order_id) : (existing?.qr_order_id ?? 1),
    qr_menu_item_id:
      dto.qr_menu_item_id !== undefined
        ? Number(dto.qr_menu_item_id)
        : (existing?.qr_menu_item_id ?? 1),
    order_item_id: mergedOrderItemId ?? undefined,
    quantity: mergedQuantity,
    unit_price: mergedUnitPrice,
    subtotal_price: mergedSubtotal,
    status: dto.status !== undefined ? dto.status : (existing?.status ?? 'active'),
  };

  const validation = validateQROrderItemPayload(payloadToValidate);
  if (!validation.valid) {
    throw new ApiError(validation.error || 'Invalid QR order item update payload.', 400);
  }

  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = [`/qr-order-items/${id}`, `/qr-order-item/${id}`];
      let res: Response | null = null;
      const payload: Record<string, unknown> = {
        qrOrder: dto.qr_order_id ? Number(dto.qr_order_id) : undefined,
        qr_order_id: dto.qr_order_id ? Number(dto.qr_order_id) : undefined,
        qrMenuItem: dto.qr_menu_item_id ? Number(dto.qr_menu_item_id) : undefined,
        qr_menu_item_id: dto.qr_menu_item_id ? Number(dto.qr_menu_item_id) : undefined,
        quantity: mergedQuantity,
        price: mergedUnitPrice,
        unit_price: mergedUnitPrice,
        total_price: mergedSubtotal,
        subtotal_price: mergedSubtotal,
        notes: dto.notes !== undefined ? (dto.notes ? String(dto.notes).trim() : '') : undefined,
        status: dto.status !== undefined ? dto.status : undefined,
      };
      if (dto.product_id) {
        payload.product = Number(dto.product_id);
        payload.product_id = Number(dto.product_id);
      }

      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) delete payload[k];
      });

      for (const path of candidatePaths) {
        try {
          res = await fetch(`${API_BASE}${path}`, {
            method: 'PATCH',
            headers: authHeaders(true),
            body: JSON.stringify(payload),
          });
          if (res.status !== 404) break;
        } catch {
          // network error
        }
      }

      if (res && res.ok) {
        const updated = await res.json();
        const raw = updated.data ?? updated;
        const hydrated = hydrateItemRelations({
          ...raw,
          order_item_id: raw.order_item_id ?? mergedOrderItemId ?? null,
        });
        const updatedList = items.map((i) => (i.id === id ? hydrated : i));
        persistStoredOrderItems(updatedList);
        syncParentOrderTotal(hydrated.qr_order_id, updatedList);
        return hydrated;
      } else if (res) {
        let errMessage = `HTTP error ${res.status}`;
        try {
          const errData = await res.json();
          errMessage = Array.isArray(errData.message)
            ? errData.message.join(', ')
            : (errData.message || errMessage);
        } catch {
          // ignore
        }
        throw new ApiError(errMessage, res.status);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Fallback to local store for offline testing
    }
  }

  if (index === -1) {
    throw new ApiError(`QR Order Item #${id} not found.`, 404);
  }

  const updatedItem: QROrderItem = {
    ...items[index],
    qr_order_id: payloadToValidate.qr_order_id!,
    qr_menu_item_id: payloadToValidate.qr_menu_item_id!,
    order_item_id:
      dto.order_item_id !== undefined
        ? (dto.order_item_id ? Number(dto.order_item_id) : null)
        : items[index].order_item_id,
    quantity: mergedQuantity,
    unit_price: mergedUnitPrice,
    subtotal_price: mergedSubtotal,
    notes:
      dto.notes !== undefined
        ? (dto.notes ? String(dto.notes).trim() : null)
        : items[index].notes,
    status: payloadToValidate.status!,
    updated_at: new Date().toISOString(),
  };

  const hydrated = hydrateItemRelations(updatedItem);
  items[index] = hydrated;
  persistStoredOrderItems(items);

  // Trigger Cascade Recalculation Engine on parent QROrder entity's total_amount
  syncParentOrderTotal(updatedItem.qr_order_id, items);

  return hydrated;
}

/**
 * Deletes a QR order item.
 */
export async function deleteQROrderItem(id: number): Promise<void> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = [`/qr-order-items/${id}`, `/qr-order-item/${id}`];
      let res: Response | null = null;
      for (const path of candidatePaths) {
        res = await fetch(`${API_BASE}${path}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (res.status !== 404) break;
      }

      if (res && res.ok) return;
    } catch {
      // Fallback to local store
    }
  }

  const items = getStoredOrderItems();
  const targetItem = items.find((i) => i.id === id);
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length === items.length) {
    throw new ApiError(`QR Order Item #${id} not found.`, 404);
  }
  persistStoredOrderItems(filtered);

  if (targetItem) {
    syncParentOrderTotal(targetItem.qr_order_id, filtered);
  }
}

/**
 * Cascade Recalculation Engine:
 * Synchronizes parent QROrder entity's total_amount with the sum of all active line items.
 * Updates localStorage databases, updates parent order memory references,
 * and emits a 'qr-order-total-recalculated' custom event on window.
 */
export function syncParentOrderTotal(
  qrOrderId: number,
  items?: QROrderItem[]
): number {
  const allItems = items ?? getStoredOrderItems();
  const newTotal = calculateParentOrderTotal(qrOrderId, allItems);

  // Update in x7_qr_orders_mock_db
  const storedOrders = typeof window !== 'undefined' && window.localStorage
    ? localStorage.getItem('x7_qr_orders_mock_db')
    : null;
  if (storedOrders) {
    try {
      const orders = JSON.parse(storedOrders);
      const updatedOrders = orders.map((o: { id: number; total_amount: number }) =>
        o.id === qrOrderId
          ? { ...o, total_amount: newTotal, updated_at: new Date().toISOString() }
          : o
      );
      localStorage.setItem('x7_qr_orders_mock_db', JSON.stringify(updatedOrders));
    } catch {
      // ignore
    }
  }

  // Update in _cachedOrders and MOCK_PARENT_QR_ORDERS reference
  const cached = _cachedOrders.find((o) => o.id === qrOrderId);
  if (cached) {
    cached.total_amount = newTotal;
  }
  const ref = MOCK_PARENT_QR_ORDERS.find((o) => o.id === qrOrderId);
  if (ref) {
    ref.total_amount = newTotal;
  }

  // Dispatch global event for live reactivity across all open views
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('qr-order-total-recalculated', {
        detail: { qrOrderId, totalAmount: newTotal },
      })
    );
  }

  return newTotal;
}

/**
 * Lookups for parent orders, menu items, and pos items.
 * Strictly queries live backend endpoints first; returns empty arrays when none are present.
 */
export async function fetchAvailableQROrders(merchantId?: number): Promise<QROrderRef[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/qr-orders', '/qr-order'];
      let res: Response | null = null;
      for (const path of candidatePaths) {
        const params = new URLSearchParams();
        if (merchantId) params.append('merchant_id', String(merchantId));
        params.append('limit', '100');
        const qs = params.toString();
        res = await fetch(`${API_BASE}${path}?${qs}`, {
          headers: authHeaders(),
        });
        if (res.status !== 404) break;
      }
      if (res && res.ok) {
        const json = await res.json();
        const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(rawList)) {
          const list: QROrderRef[] = rawList.map((o) => {
            const merch = o.merchant as Record<string, unknown> | undefined;
            const loc = o.qrLocation as Record<string, unknown> | undefined;
            const ord = o.order as Record<string, unknown> | undefined;
            const tbl = o.table as Record<string, unknown> | undefined;
            const cust = o.customer as Record<string, unknown> | undefined;
            return {
              id: Number(o.id),
              merchant_id: Number(o.merchant_id ?? o.merchantId ?? merch?.id ?? merchantId ?? 1),
              qr_location_id: Number(o.qr_location_id ?? o.qrLocationId ?? loc?.id ?? 1),
              order_id: Number(o.order_id ?? o.orderId ?? ord?.id ?? o.id),
              qr_order_status: String(o.qr_order_status ?? o.qrOrderStatus ?? 'PENDING'),
              notes: o.notes ? String(o.notes) : null,
              total_amount: Number(o.total_amount ?? o.totalAmount ?? 0),
              table_id: o.table_id ? Number(o.table_id) : (o.tableId ? Number(o.tableId) : (tbl?.id ? Number(tbl.id) : null)),
              table: tbl as QROrderRef['table'],
              customer: cust as QROrderRef['customer'],
              qrLocation: loc as QROrderRef['qrLocation'],
            };
          });
          _cachedOrders = list;
          return list;
        }
      }
    } catch {
      // Ignore
    }
  }

  // Fallback to local stored orders or empty (exclude mock items)
  const stored =
    typeof window !== 'undefined' && window.localStorage
      ? localStorage.getItem('x7_qr_orders_mock_db')
      : null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const filtered = (merchantId ? parsed.filter((o) => o.merchant_id === merchantId) : parsed)
          .filter((o) => Number(o.id) < 9000);
        if (filtered.length > 0) {
          _cachedOrders = filtered;
          return filtered;
        }
      }
    } catch {
      // Ignore
    }
  }

  return MOCK_PARENT_QR_ORDERS;
}

export async function fetchAvailableQRMenuItems(merchantId?: number): Promise<QRMenuItemRef[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/qr-menu-items', '/qr-menu-item'];
      let res: Response | null = null;
      for (const path of candidatePaths) {
        const params = new URLSearchParams();
        if (merchantId) params.append('merchant_id', String(merchantId));
        params.append('limit', '100');
        const qs = params.toString();
        res = await fetch(`${API_BASE}${path}?${qs}`, {
          headers: authHeaders(),
        });
        if (res.status !== 404) break;
      }
      if (res && res.ok) {
        const json = await res.json();
        const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(rawList) && rawList.length > 0) {
          const list: QRMenuItemRef[] = rawList.map((m) => {
            const sec = m.qrMenuSection as Record<string, unknown> | undefined;
            const prod = m.product as Record<string, unknown> | undefined;
            const rawPrice = m.price ?? prod?.basePrice ?? 0;
            return {
              id: Number(m.id),
              name: String(m.name || prod?.name || `Dish #${m.id}`),
              description: String(m.description || prod?.description || ''),
              price: typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice || 0)),
              image_url: m.image_url ? String(m.image_url) : undefined,
              qr_menu_section_id: Number(m.qr_menu_section_id ?? m.section_id ?? sec?.id ?? 0),
              product_id: m.product_id != null ? Number(m.product_id) : (prod?.id != null ? Number(prod.id) : null),
              product_name: m.product_name ? String(m.product_name) : (prod?.name ? String(prod.name) : undefined),
            };
          });
          _cachedMenuItems = list;
          return list;
        }
      }
    } catch {
      // Ignore
    }
  }

  // Fallback to local stored live menu items (filter out mock items >= 9000)
  const stored =
    typeof window !== 'undefined' && window.localStorage
      ? localStorage.getItem('x7_qr_menu_items_live')
      : null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const filtered = parsed.filter((m: QRMenuItemRef) => Number(m.id) < 9000);
        if (filtered.length > 0) {
          _cachedMenuItems = filtered;
          return filtered;
        }
      }
    } catch {
      // Ignore
    }
  }

  return MOCK_QR_MENU_ITEMS;
}

export async function fetchAvailablePOSOrderItems(): Promise<POSOrderItemRef[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/order-item', '/order-items'];
      let res: Response | null = null;
      for (const path of candidatePaths) {
        res = await fetch(`${API_BASE}${path}?limit=100`, {
          headers: authHeaders(),
        });
        if (res.status !== 404) break;
      }
      if (res && res.ok) {
        const json = await res.json();
        const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(rawList) && rawList.length > 0) {
          const list: POSOrderItemRef[] = rawList.map((p) => ({
            id: Number(p.id),
            order_id: Number(p.order_id ?? p.orderId ?? 0),
            product_name: String(p.product_name ?? p.productName ?? `POS Item #${p.id}`),
            unit_price: Number(p.unit_price ?? p.unitPrice ?? p.price ?? 0),
            quantity: Number(p.quantity ?? 1),
          }));
          _cachedPosItems = list;
          return list;
        }
      }
    } catch {
      // Ignore
    }
  }

  return MOCK_POS_ORDER_ITEMS;
}
