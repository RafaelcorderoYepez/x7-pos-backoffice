// HTTP client for the delivery list.
//
// Actual routes: `/api/delivery-driver` (SINGULAR, without `/v1`). The trade exits the JWT and the
// backend uses `forbidNonWhitelisted`, so bodies are built field by field.

import { MAX_PAGE_LIMIT, request, type Envelope } from './delivery';
import { buildDriverQuery } from '../lib/delivery-drivers';
import type {
  DeliveryDriver,
  DeliveryDriverDraft,
  DriverPage,
  DriverQuery,
  DriverSummary,
} from '../types/delivery-drivers';

export async function listDeliveryDrivers(query: DriverQuery): Promise<DriverPage> {
  const qs = buildDriverQuery({ ...query, limit: Math.min(query.limit, MAX_PAGE_LIMIT) });
  const json = await request<Envelope<DeliveryDriver[]>>(
    `/delivery-driver?${qs}`,
    { method: 'GET' },
    'Failed to load delivery drivers. Please try again.',
  );
  const rows = json?.data ?? [];
  return {
    rows,
    total: json?.pagination?.total ?? rows.length,
    page: json?.pagination?.page ?? query.page,
    totalPages: json?.pagination?.totalPages ?? 1,
  };
}

export async function getDriverSummary(): Promise<DriverSummary> {
  const json = await request<Envelope<DriverSummary>>(
    '/delivery-driver/summary',
    { method: 'GET' },
    'Failed to load the fleet summary.',
  );
  return json.data;
}

const driverBody = (draft: Partial<DeliveryDriverDraft>): Record<string, unknown> => {
  const body: Record<string, unknown> = {};
  if (draft.name !== undefined) body.name = draft.name.trim();
  if (draft.phone !== undefined) body.phone = draft.phone.trim();
  if (draft.vehicleType !== undefined) body.vehicleType = draft.vehicleType;
  if (draft.status !== undefined) body.status = draft.status;
  return body;
};

export async function createDeliveryDriver(draft: DeliveryDriverDraft): Promise<DeliveryDriver> {
  const json = await request<Envelope<DeliveryDriver>>(
    '/delivery-driver',
    { method: 'POST', body: JSON.stringify(driverBody(draft)) },
    'Failed to create the delivery driver.',
  );
  return json.data;
}

export async function updateDeliveryDriver(
  id: number,
  patch: Partial<DeliveryDriverDraft>,
): Promise<DeliveryDriver> {
  const json = await request<Envelope<DeliveryDriver>>(
    `/delivery-driver/${id}`,
    { method: 'PATCH', body: JSON.stringify(driverBody(patch)) },
    'Failed to update the delivery driver.',
  );
  return json.data;
}

/** on_shift=true → active, false → off_duty. 409 if it is in distribution or suspended. */
export async function setDriverShift(id: number, onShift: boolean): Promise<DeliveryDriver> {
  const json = await request<Envelope<DeliveryDriver>>(
    `/delivery-driver/${id}/shift`,
    { method: 'PATCH', body: JSON.stringify({ on_shift: onShift }) },
    'Failed to change the driver shift.',
  );
  return json.data;
}

export async function deleteDeliveryDriver(id: number): Promise<void> {
  await request<Envelope<DeliveryDriver>>(
    `/delivery-driver/${id}`,
    { method: 'DELETE' },
    'Failed to delete the delivery driver.',
  );
}
