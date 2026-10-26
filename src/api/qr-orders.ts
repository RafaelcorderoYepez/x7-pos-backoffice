import type {
  CreateQROrderDto,
  CustomerRef,
  MerchantRef,
  POSOrderRef,
  QROrder,
  QROrderStatus,
  QRLocationRef,
  TableRef,
  UpdateQROrderDto,
} from '../types/qr-order';
import {
  canTransitionStatus,
  mapBackendStatusToFrontend,
  mapFrontendStatusToBackend,
  validateQROrderPayload,
  validateQROrderStatus,
  validateTotalAmount,
} from '../lib/qr-order';
import { getAccessToken } from '../lib/auth-storage';
import { ApiError } from '../lib/api-error';
import { getQRLocations, fetchAvailableTables as fetchLocationsTables } from './qr-locations';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const STORAGE_KEY = 'x7_qr_orders_mock_db';

// Reference cache for hydrating relations
let _cachedMerchants: MerchantRef[] = [];
let _cachedLocations: QRLocationRef[] = [];
let _cachedCustomers: CustomerRef[] = [];
let _cachedTables: TableRef[] = [];

export const MOCK_MERCHANTS: MerchantRef[] = [
  { id: 1, name: 'Merchant Solutions Corp', code: 'MCH-001' },
  { id: 2, name: 'La Trattoria Patio', code: 'MCH-002' },
  { id: 3, name: 'prueba1', code: 'MCH-003' },
];

export const MOCK_QR_LOCATIONS: QRLocationRef[] = [
  { id: 1, name: 'Mesa Terraza 2', merchant_id: 1, location_type: 'DINE_IN', qr_code_url: 'https://menu.x7pos.com/m/1/loc/1' },
  { id: 2, name: 'Curbside Pickup Point', merchant_id: 1, location_type: 'PICKUP', qr_code_url: 'https://menu.x7pos.com/m/1/loc/2' },
  { id: 3, name: 'Patio Table #12 Access', merchant_id: 3, location_type: 'DINE_IN', qr_code_url: 'https://menu.x7pos.com/m/3/loc/3' },
  { id: 4, name: 'Terrace Table #Patio-01', merchant_id: 3, location_type: 'DINE_IN', qr_code_url: 'https://menu.x7pos.com/m/3/loc/4' },
  { id: 5, name: 'Main Bar Stool #5', merchant_id: 3, location_type: 'DINE_IN', qr_code_url: 'https://menu.x7pos.com/m/3/loc/5' },
];

export const MOCK_CUSTOMERS: CustomerRef[] = [
  { id: 1, name: 'Sofia Ramirez', email: 'sofia.ramirez@example.com', phone: '+1 (555) 234-5678' },
  { id: 2, name: 'Carlos Santana', email: 'carlos.santana@example.com', phone: '+1 (555) 876-5432' },
  { id: 3, name: 'Valentina Mendoza', email: 'v.mendoza@example.com', phone: '+1 (555) 345-6789' },
  { id: 4, name: 'Mateo Fernandez', email: 'mateo.f@example.com', phone: '+1 (555) 987-6543' },
];

export const MOCK_TABLES: TableRef[] = [
  { id: 1, number: 'A1', merchant_id: 1, capacity: 4, zone_name: 'Main Dining Room' },
  { id: 201, number: '12', merchant_id: 3, capacity: 4, zone_name: 'Main Dining Room' },
  { id: 202, number: '14', merchant_id: 3, capacity: 6, zone_name: 'Main Dining Room' },
  { id: 203, number: 'Patio-01', merchant_id: 3, capacity: 2, zone_name: 'Terrace' },
  { id: 204, number: 'Patio-02', merchant_id: 3, capacity: 4, zone_name: 'Terrace' },
  { id: 205, number: 'VIP-1', merchant_id: 1, capacity: 8, zone_name: 'VIP Lounge' },
  { id: 206, number: 'Bar-5', merchant_id: 3, capacity: 2, zone_name: 'Main Bar' },
];

function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function initializeMockOrders(): QROrder[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fallback to seed data
    }
  }

  const seed: QROrder[] = [
    {
      id: 1,
      merchant_id: 3,
      qr_location_id: 1,
      customer_id: 1,
      table_id: 201,
      order_id: 5001,
      qr_order_status: 'PENDING',
      notes: 'Extra lime on grilled salmon, salad dressing on the side please.',
      total_amount: 48.50,
      status: 'active',
      created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(), // 12 min ago
      updated_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
    {
      id: 2,
      merchant_id: 3,
      qr_location_id: 3,
      customer_id: 2,
      table_id: 203,
      order_id: 5002,
      qr_order_status: 'CONFIRMED',
      notes: 'Severe peanut allergy! Please prepare using sanitized cookware.',
      total_amount: 112.75,
      status: 'active',
      created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    },
    {
      id: 3,
      merchant_id: 3,
      qr_location_id: 1,
      customer_id: null, // Guest Scan
      table_id: 202,
      order_id: 5003,
      qr_order_status: 'IN_PREPARATION',
      notes: 'Sparkling mineral water with ice, serve appetizers before steak.',
      total_amount: 64.00,
      status: 'active',
      created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: 4,
      merchant_id: 3,
      qr_location_id: 2,
      customer_id: 3,
      table_id: null, // Curbside Pickup
      order_id: 5004,
      qr_order_status: 'DELIVERED',
      notes: 'Curbside delivery at Bay 2, black Honda Civic with hazard lights on.',
      total_amount: 32.50,
      status: 'active',
      created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      id: 5,
      merchant_id: 3,
      qr_location_id: 4,
      customer_id: null, // Guest Scan
      table_id: 206,
      order_id: 5005,
      qr_order_status: 'CANCELLED',
      notes: 'Customer changed mind and walked out before kitchen ticket confirmation.',
      total_amount: 27.00,
      status: 'archived',
      created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 170).toISOString(),
    },
    {
      id: 6,
      merchant_id: 3,
      qr_location_id: 5,
      customer_id: 4,
      table_id: 205,
      order_id: 5006,
      qr_order_status: 'PENDING',
      notes: 'VIP Birthday Party: bring chocolate mousse with lit sparkler candle.',
      total_amount: 215.80,
      status: 'active',
      created_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    },
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function saveMockOrders(orders: QROrder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

/**
 * Hydrates relational bindings on a QROrder (Merchant, QRLocation, Customer, Table, POSOrder)
 */
export function hydrateQROrderRelations(order: QROrder): QROrder {
  const merchant =
    order.merchant ||
    _cachedMerchants.find((m) => m.id === order.merchant_id) ||
    MOCK_MERCHANTS.find((m) => m.id === order.merchant_id) || {
      id: order.merchant_id,
      name: `Merchant #${order.merchant_id}`,
    };

  const qrLocation =
    order.qrLocation ||
    _cachedLocations.find((l) => l.id === order.qr_location_id) ||
    MOCK_QR_LOCATIONS.find((l) => l.id === order.qr_location_id) || {
      id: order.qr_location_id,
      name: `QR Location #${order.qr_location_id}`,
      location_type: 'DINE_IN',
    };

  const customer =
    order.customer !== undefined
      ? order.customer
      : order.customer_id
      ? _cachedCustomers.find((c) => c.id === order.customer_id) ||
        MOCK_CUSTOMERS.find((c) => c.id === order.customer_id) || {
          id: order.customer_id,
          name: `Customer #${order.customer_id}`,
        }
      : null;

  const table =
    order.table !== undefined
      ? order.table
      : order.table_id
      ? _cachedTables.find((t) => t.id === order.table_id) ||
        MOCK_TABLES.find((t) => t.id === order.table_id) || {
          id: order.table_id,
          number: `${order.table_id}`,
          merchant_id: order.merchant_id,
        }
      : null;

  const posOrder: POSOrderRef = order.order || {
    id: order.order_id,
    order_number: `ORD-${order.order_id}`,
    total_amount: order.total_amount,
    status: order.qr_order_status,
  };

  return {
    ...order,
    merchant,
    qrLocation,
    customer,
    table,
    order: posOrder,
  };
}

function normalizeRawOrder(raw: Record<string, unknown>): QROrder {
  const amountParsed = validateTotalAmount(raw.total_amount ?? raw.totalAmount ?? 0);
  const total_amount = amountParsed.valid ? amountParsed.parsedValue ?? 0 : 0;

  return {
    id: Number(raw.id),
    merchant_id: Number(raw.merchant_id ?? raw.merchantId ?? 3),
    qr_location_id: Number(raw.qr_location_id ?? raw.qrLocationId ?? 1),
    customer_id: raw.customer_id ? Number(raw.customer_id) : (raw.customerId ? Number(raw.customerId) : null),
    table_id: raw.table_id ? Number(raw.table_id) : (raw.tableId ? Number(raw.tableId) : null),
    order_id: Number(raw.order_id ?? raw.orderId ?? raw.id),
    qr_order_status: mapBackendStatusToFrontend(raw.qr_order_status ?? raw.qrOrderStatus ?? 'Submitted'),
    notes: raw.notes ? String(raw.notes) : null,
    total_amount,
    status: String(raw.status || 'active'),
    created_at: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
    updated_at: String(raw.updated_at ?? raw.updatedAt ?? new Date().toISOString()),
    merchant: raw.merchant as MerchantRef | undefined,
    qrLocation: (raw.qrLocation ?? raw.qr_location) as QRLocationRef | undefined,
    customer: (raw.customer ?? null) as CustomerRef | null,
    table: (raw.table ?? null) as TableRef | null,
    order: (raw.order ?? raw.pos_order) as POSOrderRef | undefined,
  };
}

/**
 * Fetch all QR Orders for a given merchant.
 */
export async function getQROrders(merchantId?: number): Promise<QROrder[]> {
  const token = getAccessToken();

  if (token) {
    try {
      const candidatePaths = ['/qr-orders', '/qr-order', '/v1/qr-orders', '/v1/qr-order'];
      for (const path of candidatePaths) {
        const query = merchantId ? `?merchant_id=${merchantId}` : '';
        const response = await fetch(`${API_BASE}${path}${query}`, {
          headers: authHeaders(),
        });
        if (response.ok) {
          const json = await response.json();
          const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
          return rawList.map(normalizeRawOrder).map(hydrateQROrderRelations);
        }
        if (response.status !== 404) break;
      }
    } catch {
      // Fallback to local storage mock data on offline/error
    }
  }

  const mockList = initializeMockOrders();
  const filtered = merchantId
    ? mockList.filter((o) => !o.merchant_id || Number(o.merchant_id) === Number(merchantId))
    : mockList;

  return filtered.map(hydrateQROrderRelations);
}

/**
 * Fetch a single QR Order by ID.
 */
export async function getQROrderById(id: number): Promise<QROrder> {
  const token = getAccessToken();

  if (token) {
    try {
      const candidatePaths = ['/qr-orders', '/qr-order', '/v1/qr-orders', '/v1/qr-order'];
      for (const path of candidatePaths) {
        const response = await fetch(`${API_BASE}${path}/${id}`, {
          headers: authHeaders(),
        });
        if (response.ok) {
          const json = await response.json();
          const raw = (json.data ?? json) as Record<string, unknown>;
          return hydrateQROrderRelations(normalizeRawOrder(raw));
        }
        if (response.status !== 404) break;
      }
    } catch {
      // Fallback to mock
    }
  }

  const mockList = initializeMockOrders();
  const found = mockList.find((o) => o.id === id);
  if (!found) {
    throw new ApiError('QR Order not found.', 404);
  }

  return hydrateQROrderRelations(found);
}

/**
 * Creates a new QR Order and injects it into the POS order binding.
 */
export async function createQROrder(dto: CreateQROrderDto): Promise<QROrder> {
  const tables = await fetchAvailableTables(dto.merchant_id);
  // Validate payload before sending
  const validation = validateQROrderPayload(dto, { tables });
  if (!validation.valid) {
    throw new ApiError(validation.error || 'Invalid QR order payload.', 400);
  }

  const token = getAccessToken();
  if (token) {
    const backendPayload: Record<string, unknown> = {
      merchant: Number(dto.merchant_id),
      qrLocation: Number(dto.qr_location_id),
      order: Number(dto.order_id),
      qr_order_status: mapFrontendStatusToBackend(dto.qr_order_status),
      status: dto.status === 'inactive' ? 'inactive' : 'active',
    };
    if (dto.customer_id) backendPayload.customer = Number(dto.customer_id);
    if (dto.table_id) backendPayload.table = Number(dto.table_id);
    backendPayload.notes = (dto.notes && typeof dto.notes === 'string') ? dto.notes.trim() : '';
    if (dto.total_amount !== undefined) backendPayload.total_amount = Number(dto.total_amount);

    try {
      const candidatePaths = ['/qr-orders', '/qr-order', '/v1/qr-orders', '/v1/qr-order'];
      let response: Response | null = null;
      for (const path of candidatePaths) {
        response = await fetch(`${API_BASE}${path}`, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(backendPayload),
        });
        if (response.status !== 404) break;
        const clone = response.clone();
        const errJson = await clone.json().catch(() => ({}));
        const msg = String(errJson.message || '');
        if (!msg.startsWith('Cannot POST')) break;
      }

      if (response && response.ok) {
        const json = await response.json();
        const raw = (json.data ?? json) as Record<string, unknown>;
        return hydrateQROrderRelations(normalizeRawOrder(raw));
      } else if (response) {
        const errData = await response.json().catch(() => ({}));
        const message = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message || `Server error (${response.status})`;
        throw new ApiError(message, response.status);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Fallback to local mock creation
    }
  }

  const mockList = initializeMockOrders();
  const nextId = mockList.length > 0 ? Math.max(...mockList.map((o) => o.id)) + 1 : 1;

  const newOrder: QROrder = {
    id: nextId,
    merchant_id: dto.merchant_id,
    qr_location_id: dto.qr_location_id,
    customer_id: dto.customer_id || null,
    table_id: dto.table_id || null,
    order_id: dto.order_id,
    qr_order_status: dto.qr_order_status,
    notes: dto.notes?.trim() || null,
    total_amount: dto.total_amount,
    status: dto.status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  mockList.unshift(newOrder);
  saveMockOrders(mockList);

  return hydrateQROrderRelations(newOrder);
}

/**
 * Updates an existing QR Order.
 */
export async function updateQROrder(id: number, dto: UpdateQROrderDto): Promise<QROrder> {
  if (dto.qr_order_status) {
    const statusCheck = validateQROrderStatus(dto.qr_order_status);
    if (!statusCheck.valid) {
      throw new ApiError(statusCheck.error || 'Invalid QR order status.', 400);
    }
  }

  if (dto.total_amount !== undefined) {
    const amountCheck = validateTotalAmount(dto.total_amount);
    if (!amountCheck.valid) {
      throw new ApiError(amountCheck.error || 'Invalid total amount.', 400);
    }
  }

  const mockList = initializeMockOrders();
  const index = mockList.findIndex((o) => o.id === id);

  const token = getAccessToken();
  if (token) {
    const backendPayload: Record<string, unknown> = {};
    if (dto.merchant_id !== undefined) backendPayload.merchant = Number(dto.merchant_id);
    if (dto.qr_location_id !== undefined) backendPayload.qrLocation = Number(dto.qr_location_id);
    if (dto.order_id !== undefined) backendPayload.order = Number(dto.order_id);
    if (dto.qr_order_status !== undefined) {
      backendPayload.qr_order_status = mapFrontendStatusToBackend(dto.qr_order_status);
    }
    if (dto.status !== undefined) {
      backendPayload.status = dto.status === 'inactive' ? 'inactive' : 'active';
    }
    if (dto.customer_id !== undefined) {
      backendPayload.customer = dto.customer_id ? Number(dto.customer_id) : null;
    }
    if (dto.table_id !== undefined) {
      backendPayload.table = dto.table_id ? Number(dto.table_id) : null;
    }
    if (dto.notes !== undefined) {
      backendPayload.notes = dto.notes ? String(dto.notes).trim() : '';
    }
    if (dto.total_amount !== undefined) {
      backendPayload.total_amount = Number(dto.total_amount);
    }

    try {
      const candidatePaths = ['/qr-orders', '/qr-order'];
      let response: Response | null = null;
      for (const path of candidatePaths) {
        response = await fetch(`${API_BASE}${path}/${id}`, {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify(backendPayload),
        });
        if (response.status !== 404) break;
        const clone = response.clone();
        const errJson = await clone.json().catch(() => ({}));
        const msg = String(errJson.message || '');
        if (!msg.startsWith('Cannot PATCH')) break;
      }

      if (response && response.ok) {
        const json = await response.json();
        const raw = (json.data ?? json) as Record<string, unknown>;
        return hydrateQROrderRelations(normalizeRawOrder(raw));
      } else if (response) {
        const errData = await response.json().catch(() => ({}));
        const message = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message || `Server error (${response.status})`;
        throw new ApiError(message, response.status);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Fallback
    }
  }

  if (index === -1) {
    throw new ApiError('QR Order not found.', 404);
  }

  if (dto.qr_order_status && dto.qr_order_status !== mockList[index].qr_order_status) {
    const transitionCheck = canTransitionStatus(mockList[index].qr_order_status, dto.qr_order_status);
    if (!transitionCheck.allowed) {
      throw new ApiError(transitionCheck.reason || 'Invalid status transition.', 400);
    }
  }

  const updated: QROrder = {
    ...mockList[index],
    ...dto,
    customer_id: dto.customer_id !== undefined ? dto.customer_id : mockList[index].customer_id,
    table_id: dto.table_id !== undefined ? dto.table_id : mockList[index].table_id,
    notes: dto.notes !== undefined ? dto.notes : mockList[index].notes,
    updated_at: new Date().toISOString(),
  };

  mockList[index] = updated;
  saveMockOrders(mockList);

  return hydrateQROrderRelations(updated);
}

/**
 * Quick lifecycle transition for the dispatch board.
 */
export async function updateQROrderLifecycleStatus(
  id: number,
  status: QROrderStatus
): Promise<QROrder> {
  return updateQROrder(id, { qr_order_status: status });
}

/**
 * Deletes or archives a QR order.
 */
export async function deleteQROrder(id: number): Promise<{ success: boolean }> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/qr-orders', '/qr-order', '/v1/qr-orders', '/v1/qr-order'];
      for (const path of candidatePaths) {
        const response = await fetch(`${API_BASE}${path}/${id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (response.ok) {
          return { success: true };
        }
        if (response.status !== 404) break;
      }
    } catch {
      // Fallback to mock delete
    }
  }

  const mockList = initializeMockOrders();
  const nextList = mockList.filter((o) => o.id !== id);
  saveMockOrders(nextList);

  return { success: true };
}

/**
 * Fetch available QR Locations for dropdowns.
 */
export async function fetchAvailableQRLocations(merchantId?: number): Promise<QRLocationRef[]> {
  try {
    const locs = await getQRLocations(merchantId);
    if (Array.isArray(locs)) {
      const mapped: QRLocationRef[] = locs.map((l) => ({
        id: l.id,
        name: l.name,
        merchant_id: l.merchant_id,
        location_type: l.location_type,
        qr_code_url: l.qr_code_url,
      }));
      _cachedLocations = mapped;
      if (merchantId) {
        return mapped.filter((l) => !l.merchant_id || Number(l.merchant_id) === Number(merchantId));
      }
      return mapped;
    }
  } catch {
    // Continue to candidate paths
  }

  const targetId = merchantId;
  const token = getAccessToken();

  if (token) {
    try {
      const candidatePaths = ['/qr-locations?limit=100', '/qr-location?limit=100', '/v1/qr-locations?limit=100'];
      for (const path of candidatePaths) {
        const res = await fetch(`${API_BASE}${path}`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const json = await res.json();
          const raw = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
          const list: QRLocationRef[] = raw.map((l) => {
            const locMerchant = l.merchant as Record<string, unknown> | undefined;
            return {
              id: Number(l.id),
              name: String(l.name),
              merchant_id: Number(locMerchant?.id ?? l.merchant_id ?? l.merchantId ?? (targetId || 0)),
              location_type: String(l.location_type || 'DINE_IN'),
              qr_code_url: String(l.qr_code_url || ''),
            };
          });
          _cachedLocations = list;
          if (targetId) {
            return list.filter((l) => !l.merchant_id || Number(l.merchant_id) === Number(targetId));
          }
          return list;
        }
        if (res.status !== 404) break;
      }
    } catch {
      // Fallback
    }
  }

  const result = merchantId
    ? MOCK_QR_LOCATIONS.filter((l) => !l.merchant_id || Number(l.merchant_id) === Number(merchantId))
    : MOCK_QR_LOCATIONS;
  _cachedLocations = result;
  return result;
}

/**
 * Fetch available customers for dropdowns.
 */
export async function fetchAvailableCustomers(merchantId?: number): Promise<CustomerRef[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const query = merchantId ? `?merchant_id=${merchantId}` : '';
      const res = await fetch(`${API_BASE}/customers${query}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        const raw = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        const list: CustomerRef[] = raw.map((c) => ({
          id: Number(c.id),
          name: String(c.name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || `Customer #${c.id}`),
          email: c.email ? String(c.email) : null,
          phone: c.phone ? String(c.phone) : null,
        }));
        _cachedCustomers = list;
        return list;
      }
    } catch {
      // Fallback
    }
  }

  const result = merchantId
    ? MOCK_CUSTOMERS.filter((c) => (c as { merchant_id?: number }).merchant_id ? Number((c as { merchant_id?: number }).merchant_id) === Number(merchantId) : true)
    : MOCK_CUSTOMERS;
  _cachedCustomers = result;
  return result;
}

/**
 * Fetch available tables for dropdowns.
 */
export async function fetchAvailableTables(merchantId?: number): Promise<TableRef[]> {
  try {
    const list = await fetchLocationsTables(merchantId);
    if (Array.isArray(list)) {
      _cachedTables = list;
      if (merchantId) {
        return list.filter((t) => !t.merchant_id || Number(t.merchant_id) === Number(merchantId));
      }
      return list;
    }
  } catch {
    // Continue to direct endpoint candidate fallback
  }

  const targetId = merchantId;
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/tables?limit=100', '/dining/tables?limit=100'];
      for (const path of candidatePaths) {
        const res = await fetch(`${API_BASE}${path}`, {
          headers: authHeaders(),
        });
        if (res.ok) {
          const json = await res.json();
          const raw = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
          const list: TableRef[] = raw.map((t) => {
            const tableMerchant = t.merchant as Record<string, unknown> | undefined;
            const floorZone = t.floorZone as Record<string, unknown> | undefined;
            const zone = t.zone as Record<string, unknown> | undefined;
            return {
              id: Number(t.id),
              number: String(t.number ?? t.table_number ?? t.id),
              merchant_id: Number(tableMerchant?.id ?? t.merchant_id ?? t.merchantId ?? (targetId || 0)),
              capacity: t.capacity ? Number(t.capacity) : undefined,
              zone_name: String(floorZone?.name ?? zone?.name ?? t.zone_name ?? ''),
            };
          });
          _cachedTables = list;
          if (targetId) {
            return list.filter((t) => !t.merchant_id || Number(t.merchant_id) === Number(targetId));
          }
          return list;
        }
        if (res.status !== 404) break;
      }
    } catch {
      // Fallback
    }
  }

  const result = merchantId
    ? MOCK_TABLES.filter((t) => !t.merchant_id || Number(t.merchant_id) === Number(merchantId))
    : MOCK_TABLES;
  _cachedTables = result;
  return result;
}

/**
 * Fetch available merchants for dropdowns.
 */
export async function fetchAvailableMerchants(): Promise<MerchantRef[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/merchants/company/branches`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        const raw = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        if (raw.length > 0) {
          const list: MerchantRef[] = raw.map((m) => ({
            id: Number(m.id),
            name: String(m.name),
            code: String(m.code || `MCH-${m.id}`),
          }));
          _cachedMerchants = list;
          return list;
        }
      }
    } catch {
      // Fallback
    }
  }

  _cachedMerchants = MOCK_MERCHANTS;
  return MOCK_MERCHANTS;
}

/**
 * Fetch available master POS Orders for dropdowns and suggestions.
 */
export async function fetchAvailablePOSOrders(merchantId?: number): Promise<POSOrderRef[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const query = merchantId ? `?merchantId=${merchantId}&limit=50` : '?limit=50';
      const res = await fetch(`${API_BASE}/orders${query}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        const rawList = (json.data?.orders ?? json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(rawList) && rawList.length > 0) {
          return rawList.map((o) => ({
            id: Number(o.id),
            order_number: String(o.order_number ?? o.orderNumber ?? `00000${o.id}`.slice(-6)),
            total_amount: Number(o.total_amount ?? o.totalAmount ?? 0),
            status: String(o.status ?? o.businessStatus ?? 'active'),
            created_at: String(o.created_at ?? o.createdAt ?? ''),
          }));
        }
      }
    } catch {
      // Fallback
    }
  }

  // Fallback to initial seeds (IDs 1..5 for active POS order link)
  return [
    { id: 1, order_number: '000001', total_amount: 35.0, status: 'active' },
    { id: 2, order_number: '000002', total_amount: 50.0, status: 'active' },
    { id: 3, order_number: '000003', total_amount: 75.0, status: 'active' },
    { id: 4, order_number: '000004', total_amount: 110.0, status: 'active' },
    { id: 5, order_number: '000005', total_amount: 45.0, status: 'active' },
  ];
}
