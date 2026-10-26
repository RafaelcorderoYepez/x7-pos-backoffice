// Cliente HTTP del tablero de despacho (`/api/delivery-assignment`, SINGULAR y sin `/v1`).
//
// Usa `apiRequest` de api/http (token, 401 → login, mensaje de error del backend).
// `forbidNonWhitelisted: true` → los cuerpos se construyen explícitos y NUNCA llevan
// timestamps ni delivery_status en el alta: los pone el servidor. El comercio sale del JWT.

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

// Hoy ambos responden 503 (proveedor sin configurar); la vista lo traduce a un aviso.
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

// ================= Repartidores (cliente mínimo propio) =================

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

/** Sólo repartidores `active`: off_duty / inactive / on_delivery no pueden recibir pedidos. */
export async function listActiveDrivers(): Promise<AssignmentDriverOption[]> {
  const rows = await listDriversPaged('active');
  // Defensa extra: aunque el backend filtre, nunca se ofrece un repartidor no activo.
  return rows.filter((d) => d.status === 'active');
}

/** Todos los repartidores vivos: el listado de asignaciones no trae vehicleType. */
export function listAllDrivers(): Promise<AssignmentDriverOption[]> {
  return listDriversPaged();
}

// ================= Pedidos de reparto listos =================

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
 * `GET /orders?type=delivery` no filtra por kitchen_status ni por asignación abierta: se
 * filtra en cliente (listo en cocina, no cancelado) y se quitan los pedidos que ya tienen
 * una asignación abierta (pending/assigned/picked_up/in_transit). Mismo criterio que el KPI
 * `pending_dispatch` del backend.
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
