// Cliente HTTP del épico Delivery Management (zonas y tarifas).
//
// Rutas reales: `/api/delivery-zone` y `/api/delivery-fee` — SINGULARES y sin `/v1`, al
// contrario de lo que dicen las historias (`/api/v1/delivery-zones`, que da 404). La
// actualización va por PATCH. El comercio sale del JWT: el cuerpo ya no lo necesita.
//
// `forbidNonWhitelisted: true` en el backend → los cuerpos se construyen explícitos.

import { apiRequest } from './http';
import { ApiError } from '../lib/api-error';
import type {
  DeliveryFee,
  DeliveryFeeDraft,
  DeliveryFeeQuote,
  DeliveryFeeSummary,
  DeliveryZone,
  DeliveryZoneDraft,
  RadiusPolygonResult,
  ZoneCoverage,
  ZoneLocateResult,
} from '../types/delivery';
import { normalizeFee } from '../lib/delivery-fees';
import type { LatLng } from '../lib/delivery-zones';

// Tope de `limit` de los DTO de consulta.
export const MAX_PAGE_LIMIT = 100;

export interface Envelope<T> {
  statusCode?: number;
  message?: string;
  data: T;
  pagination?: { total: number; page: number; limit: number; totalPages: number };
}

// Recorre todas las páginas: el tope por página es 100 y un comercio con muchas zonas no
// debe perder la 101 en el KPI de "zonas sin tarifa".
export async function listAll<T>(resource: string, fallback: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const json = await apiRequest<Envelope<T[]>>(
      `/${resource}?page=${page}&limit=${MAX_PAGE_LIMIT}`,
      { method: 'GET' },
      fallback,
    );
    rows.push(...(json?.data ?? []));
    const totalPages = json?.pagination?.totalPages ?? 1;
    if (page >= totalPages) break;
  }
  return rows;
}

// ================= Zonas =================

export function listDeliveryZones(): Promise<DeliveryZone[]> {
  return listAll<DeliveryZone>('delivery-zone', 'Failed to load delivery zones. Please try again.');
}

const zoneBody = (draft: Partial<DeliveryZoneDraft>): Record<string, unknown> => {
  const body: Record<string, unknown> = {};
  if (draft.name !== undefined) body.name = draft.name.trim();
  if (draft.description !== undefined) body.description = draft.description?.trim() || null;
  if (draft.geojson !== undefined) body.geojson = draft.geojson;
  if (draft.status !== undefined) body.status = draft.status;
  return body;
};

export async function createDeliveryZone(draft: DeliveryZoneDraft): Promise<DeliveryZone> {
  const json = await apiRequest<Envelope<DeliveryZone>>(
    '/delivery-zone',
    { method: 'POST', body: JSON.stringify(zoneBody(draft)) },
    'Failed to create the delivery zone.',
  );
  return json.data;
}

export async function updateDeliveryZone(
  id: number,
  patch: Partial<DeliveryZoneDraft>,
): Promise<DeliveryZone> {
  const json = await apiRequest<Envelope<DeliveryZone>>(
    `/delivery-zone/${id}`,
    { method: 'PATCH', body: JSON.stringify(zoneBody(patch)) },
    'Failed to update the delivery zone.',
  );
  return json.data;
}

export async function deleteDeliveryZone(id: number): Promise<void> {
  await apiRequest<Envelope<DeliveryZone>>(
    `/delivery-zone/${id}`,
    { method: 'DELETE' },
    'Failed to delete the delivery zone.',
  );
}

export async function locateDeliveryZone(point: LatLng): Promise<ZoneLocateResult> {
  const json = await apiRequest<Envelope<ZoneLocateResult>>(
    `/delivery-zone/locate?lat=${point.lat}&lng=${point.lng}`,
    { method: 'GET' },
    'Failed to check that location.',
  );
  return json.data;
}

export async function getDeliveryCoverage(): Promise<ZoneCoverage> {
  const json = await apiRequest<Envelope<ZoneCoverage>>(
    '/delivery-zone/coverage',
    { method: 'GET' },
    'Failed to load delivery coverage.',
  );
  return json.data;
}

/**
 * Círculo de `radiusKm` alrededor del centro como Polygon cerrado, generado en el servidor
 * (mismo algoritmo que valida el guardado). El DTO admite 3 decimales en el radio.
 */
export async function getRadiusPolygon(input: {
  center: LatLng;
  radiusKm: number;
  segments?: number;
}): Promise<RadiusPolygonResult> {
  const params = new URLSearchParams({
    lat: String(input.center.lat),
    lng: String(input.center.lng),
    radius_km: String(Math.round(input.radiusKm * 1000) / 1000),
  });
  if (input.segments !== undefined) params.set('segments', String(input.segments));
  const json = await apiRequest<Envelope<RadiusPolygonResult>>(
    `/delivery-zone/radius-polygon?${params.toString()}`,
    { method: 'GET' },
    'Failed to generate the radius boundary.',
  );
  return json.data;
}

// ================= Tarifas =================

export async function getDeliveryFeeSummary(): Promise<DeliveryFeeSummary> {
  const json = await apiRequest<Envelope<DeliveryFeeSummary>>(
    '/delivery-fee/summary',
    { method: 'GET' },
    'Failed to load the delivery fee summary.',
  );
  return json.data;
}

export async function listDeliveryFees(): Promise<DeliveryFee[]> {
  const rows = await listAll<DeliveryFee>(
    'delivery-fee',
    'Failed to load delivery fees. Please try again.',
  );
  return rows.map(normalizeFee);
}

const feeBody = (draft: Partial<DeliveryFeeDraft>): Record<string, unknown> => {
  const body: Record<string, unknown> = {};
  if (draft.deliveryZone !== undefined) body.deliveryZone = draft.deliveryZone;
  // Importes siempre a 2 decimales en el cuerpo (el DTO rechaza más).
  const money = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  if (draft.base_fee !== undefined) body.base_fee = money(draft.base_fee);
  if (draft.per_km_fee !== undefined) body.per_km_fee = money(draft.per_km_fee);
  if (draft.min_order_amount !== undefined) body.min_order_amount = money(draft.min_order_amount);
  if (draft.free_above !== undefined) body.free_above = money(draft.free_above);
  if (draft.status !== undefined) body.status = draft.status;
  return body;
};

export async function createDeliveryFee(draft: DeliveryFeeDraft): Promise<DeliveryFee> {
  const json = await apiRequest<Envelope<DeliveryFee>>(
    '/delivery-fee',
    { method: 'POST', body: JSON.stringify(feeBody(draft)) },
    'Failed to create the delivery fee.',
  );
  return normalizeFee(json.data);
}

export async function updateDeliveryFee(
  id: number,
  patch: Partial<DeliveryFeeDraft>,
): Promise<DeliveryFee> {
  const json = await apiRequest<Envelope<DeliveryFee>>(
    `/delivery-fee/${id}`,
    { method: 'PATCH', body: JSON.stringify(feeBody(patch)) },
    'Failed to update the delivery fee.',
  );
  return normalizeFee(json.data);
}

export async function deleteDeliveryFee(id: number): Promise<void> {
  await apiRequest<Envelope<DeliveryFee>>(
    `/delivery-fee/${id}`,
    { method: 'DELETE' },
    'Failed to delete the delivery fee.',
  );
}

export async function quoteDeliveryFee(input: {
  deliveryZoneId: number;
  subtotal: number;
  distanceKm?: number;
}): Promise<DeliveryFeeQuote> {
  const body: Record<string, unknown> = {
    delivery_zone_id: input.deliveryZoneId,
    subtotal: Math.round(input.subtotal * 100) / 100,
  };
  if (input.distanceKm !== undefined) body.distance_km = input.distanceKm;
  const json = await apiRequest<Envelope<DeliveryFeeQuote>>(
    '/delivery-fee/quote',
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to quote the delivery fee.',
  );
  return json.data;
}

// ================= Geocodificación =================

export interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Dirección → coordenadas con Nominatim (OpenStreetMap), el mismo proveedor de las teselas
 * del mapa. Sólo se llama cuando el usuario pulsa "Find address"; nunca por tecla.
 */
export async function geocodeAddress(query: string): Promise<GeocodeHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new ApiError('Address lookup failed. Try coordinates instead.', response.status);
  const rows = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return rows.map((row) => ({ label: row.display_name, lat: Number(row.lat), lng: Number(row.lon) }));
}
