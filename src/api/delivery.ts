// HTTP client for the epic Delivery Management (zones and rates).
//
// Actual routes: `/api/delivery-zone` and `/api/delivery-fee` — SINGULAR and without `/v1`, at
// contrary to what the stories say (`/api/v1/delivery-zones`, which gives 404). The
// update goes by PATCH. The trade comes out of the JWT: the body no longer needs it.
//
// `forbidNonWhitelisted: true` in the backend → bodies are constructed explicit.

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

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// `limit` limit of query DTOs.
export const MAX_PAGE_LIMIT = 100;

export interface Envelope<T> {
  statusCode?: number;
  message?: string;
  data: T;
  pagination?: { total: number; page: number; limit: number; totalPages: number };
}

// Exported for delivery customers, assignments and tracking (same token,
// same handling of 401 and errors).
export async function request<T>(path: string, init: RequestInit, fallbackMessage: string): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    clearAuthSession();
    window.location.href = '/login';
    throw new ApiError('Unauthorized', 401);
  }

  if (!response.ok) {
    const { message, code } = await getApiErrorDetails(response, fallbackMessage);
    throw new ApiError(message, response.status, code);
  }

  const text = await response.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

// Go through all the pages: the limit per page is 100 and a business with many areas does not
// you should miss the 101 on the "tariff-free zones" KPI.
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
 * `radiusKm` circle around center as closed Polygon, generated on server
 * (same algorithm that validates the save). The DTO supports 3 decimal places on the radio.
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
  // Always amounts to 2 decimal places in the body (the DTO rejects more).
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

// ================= Geocoding =================

export interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Address → coordinates with Nominatim (OpenStreetMap), the same provider of the tiles
 * of the map. It is only called when the user presses "Find address"; never by key.
 */
export async function geocodeAddress(query: string): Promise<GeocodeHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new ApiError('Address lookup failed. Try coordinates instead.', response.status);
  const rows = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return rows.map((row) => ({ label: row.display_name, lat: Number(row.lat), lng: Number(row.lon) }));
}
