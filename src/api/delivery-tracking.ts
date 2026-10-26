// Cliente HTTP del radar en vivo (`/api/delivery-tracking`, singular y sin `/v1`). El
// comercio sale del JWT. Reutiliza `request` de delivery.ts: mismo token y mismo 401.

import type { Envelope } from './delivery';
import { apiRequest } from './http';
import type {
  DeliveryRoute,
  LiveTrackingEntry,
  LiveTrackingQuery,
  TelemetrySummary,
} from '../types/delivery-tracking';

export const buildLiveTrackingQuery = (query: LiveTrackingQuery = {}): string => {
  const params: string[] = [];
  if (query.telemetry_status?.length) {
    params.push(`telemetry_status=${query.telemetry_status.map(encodeURIComponent).join(',')}`);
  }
  if (query.delivery_driver_id) params.push(`delivery_driver_id=${query.delivery_driver_id}`);
  if (query.delivery_assignment_id) params.push(`delivery_assignment_id=${query.delivery_assignment_id}`);
  return params.length ? `?${params.join('&')}` : '';
};

export async function getLiveTracking(query: LiveTrackingQuery = {}): Promise<LiveTrackingEntry[]> {
  const json = await apiRequest<Envelope<LiveTrackingEntry[]>>(
    `/delivery-tracking/live${buildLiveTrackingQuery(query)}`,
    { method: 'GET' },
    'Failed to load live tracking. Please try again.',
  );
  return json?.data ?? [];
}

export async function getTelemetrySummary(): Promise<TelemetrySummary> {
  const json = await apiRequest<Envelope<TelemetrySummary>>(
    '/delivery-tracking/summary',
    { method: 'GET' },
    'Failed to load the telemetry summary.',
  );
  return json.data;
}

export async function getDeliveryRoute(assignmentId: number): Promise<DeliveryRoute> {
  const json = await apiRequest<Envelope<DeliveryRoute>>(
    `/delivery-tracking/route/${assignmentId}`,
    { method: 'GET' },
    'Failed to load the route trail.',
  );
  return json.data;
}
