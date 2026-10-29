// Dispatch Dashboard HTTP Client (`/api/delivery-assignment`, SINGULAR and without `/v1`).
//
// Use `apiRequest` from api/http (handles tokens, 401 → login, and backend error messages).
// `forbidNonWhitelisted: true` → request bodies must be explicitly defined and must NEVER 
// include timestamps or `delivery_status` during creation—these are added by the server. The merchant is derived from the JWT.

import { MAX_PAGE_LIMIT, type Envelope } from './delivery';
import { apiRequest } from './http';
import { buildAssignmentQuery, normalizeAssignment, OPEN_DELIVERY_STATUSES } from '../lib/delivery-assignments';
import type {
  AssignmentCreateDraft,
  AssignmentDriverOption,
  AssignmentFilters,
  AssignmentPatch,
  DeliveryAssignment,
  DeliveryAssignmentSummary,
  DspAssignmentType,
  ReadyDeliveryOrder,
} from '../types/delivery-assignments';

const MAX_PAGES = 20;

// ================= Asignaciones =================

export async function listDeliveryAssignments(filters: AssignmentFilters): Promise<DeliveryAssignment[]> {
  const rows: DeliveryAssignment[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const json = await apiRequest<Envelope<DeliveryAssignment[]>>(
      `/delivery-assignment?${buildAssignmentQuery(filters, page, MAX_PAGE_LIMIT)}`,
      { method: 'GET' },
      'Failed to load delivery assignments. Please try again.',
    );
    rows.push(...(json?.data ?? []).map(normalizeAssignment));
    if (page >= (json?.pagination?.totalPages ?? 1)) break;
  }
  return rows;
}

export async function getDeliveryAssignmentSummary(): Promise<DeliveryAssignmentSummary> {
  const json = await apiRequest<Envelope<DeliveryAssignmentSummary>>(
    '/delivery-assignment/summary',
    { method: 'GET' },
    'Failed to load the dispatch summary.',
  );
  return json.data;
}

const createBody = (draft: AssignmentCreateDraft): Record<string, unknown> => {
  const body: Record<string, unknown> = { order: draft.order, assignment_type: draft.assignment_type };
  if (draft.assignment_type === 'in_house') {
    if (draft.deliveryDriver !== undefined) body.deliveryDriver = draft.deliveryDriver;
  } else {
    if (draft.external_delivery_id?.trim()) body.external_delivery_id = draft.external_delivery_id.trim();
    if (draft.external_tracking_url?.trim()) body.external_tracking_url = draft.external_tracking_url.trim();
    if (draft.external_dsp_fee !== undefined) body.external_dsp_fee = draft.external_dsp_fee;
  }
  return body;
};

export async function createDeliveryAssignment(draft: AssignmentCreateDraft): Promise<DeliveryAssignment> {
  const json = await apiRequest<Envelope<DeliveryAssignment>>(
    '/delivery-assignment',
    { method: 'POST', body: JSON.stringify(createBody(draft)) },
    'Failed to create the delivery assignment.',
  );
  return normalizeAssignment(json.data);
}

export async function updateDeliveryAssignment(id: number, patch: AssignmentPatch): Promise<DeliveryAssignment> {
  const body: Record<string, unknown> = {};
  if (patch.deliveryDriver !== undefined) body.deliveryDriver = patch.deliveryDriver;
  if (patch.delivery_status !== undefined) body.delivery_status = patch.delivery_status;
  if (patch.external_delivery_id !== undefined) body.external_delivery_id = patch.external_delivery_id;
  if (patch.external_tracking_url !== undefined) body.external_tracking_url = patch.external_tracking_url;
  if (patch.external_dsp_fee !== undefined) body.external_dsp_fee = patch.external_dsp_fee;
  const json = await apiRequest<Envelope<DeliveryAssignment>>(
    `/delivery-assignment/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update the delivery assignment.',
  );
  return normalizeAssignment(json.data);
}

// Today both respond 503 (provider not configured); The sight translates it into a warning.
export async function requestExternalQuote(orderId: number, provider: DspAssignmentType): Promise<unknown> {
  const json = await apiRequest<Envelope<unknown>>(
    '/delivery-assignment/external-quote',
    { method: 'POST', body: JSON.stringify({ order_id: orderId, provider }) },
    'Failed to request a quote from the provider.',
  );
  return json?.data;
}

export async function requestExternalDispatch(
  orderId: number,
  provider: DspAssignmentType,
  quoteId?: string,
): Promise<DeliveryAssignment> {
  const json = await apiRequest<Envelope<DeliveryAssignment>>(
    '/delivery-assignment/external-dispatch',
    {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, provider, ...(quoteId ? { quote_id: quoteId } : {}) }),
    },
    'Failed to dispatch through the provider.',
  );
  return normalizeAssignment(json.data);
}

// ================= Delivery drivers (own minimum customer) =================

async function listDriversPaged(statusFilter?: string): Promise<AssignmentDriverOption[]> {
  const rows: AssignmentDriverOption[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const qs = new URLSearchParams({ page: String(page), limit: String(MAX_PAGE_LIMIT) });
    if (statusFilter) qs.set('status', statusFilter);
    const json = await apiRequest<Envelope<AssignmentDriverOption[]>>(
      `/delivery-driver?${qs.toString()}`,
      { method: 'GET' },
      'Failed to load delivery drivers.',
    );
    rows.push(...(json?.data ?? []));
    if (page >= (json?.pagination?.totalPages ?? 1)) break;
  }
  return rows;
}

/** Only `active` delivery drivers: off_duty / inactive / on_delivery cannot receive orders. */
export async function listActiveDrivers(): Promise<AssignmentDriverOption[]> {
  const rows = await listDriversPaged('active');
  // Extra defense: even if the backend filters, a non-active dealer is never offered.
  return rows.filter((d) => d.status === 'active');
}

/** All live delivery drivers: the assignment list does not include vehicleType. */
export function listAllDrivers(): Promise<AssignmentDriverOption[]> {
  return listDriversPaged();
}

// ================= Delivery orders ready =================

interface OrdersEnvelope {
  data: Array<{
    id: number;
    orderNumber?: string | null;
    deliveryAddress?: string | null;
    kitchenStatus?: string;
    businessStatus?: string;
    total?: number;
    readyAt?: string | null;
  }>;
  paginationMeta?: { totalPages?: number };
}

/**
 * `GET /orders?type=delivery` does not filter by kitchen_status or open assignment:
 * filters on customer (ready in kitchen, not canceled) and the orders that already have are removed
 * an open assignment (pending/assigned/picked_up/in_transit). Same criteria as the KPI
 * `pending_dispatch` from backend.
 */
export async function listReadyDeliveryOrders(): Promise<ReadyDeliveryOrder[]> {
  const orders: ReadyDeliveryOrder[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const json = await apiRequest<OrdersEnvelope>(
      `/orders?type=delivery&page=${page}&limit=${MAX_PAGE_LIMIT}`,
      { method: 'GET' },
      'Failed to load delivery orders.',
    );
    for (const o of json?.data ?? []) {
      orders.push({
        id: o.id,
        orderNumber: o.orderNumber ?? null,
        deliveryAddress: o.deliveryAddress ?? null,
        kitchenStatus: o.kitchenStatus ?? '',
        businessStatus: o.businessStatus ?? '',
        total: o.total,
        readyAt: o.readyAt ?? null,
      });
    }
    if (page >= (json?.paginationMeta?.totalPages ?? 1)) break;
  }
  const open = await listDeliveryAssignments({ statuses: [...OPEN_DELIVERY_STATUSES], types: [], search: '' });
  const busy = new Set(open.map((a) => a.order?.id));
  return orders.filter((o) => o.kitchenStatus === 'ready' && o.businessStatus !== 'cancelled' && !busy.has(o.id));
}
