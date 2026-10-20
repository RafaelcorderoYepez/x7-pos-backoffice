// Delivery Tracking Live Radar Contracts, Mirror
// x7-pos-back-end/src/commerce/delivery-system/delivery-tracking/delivery-tracking.service.ts
// (`LiveTrackingEntry`, `TelemetrySummaryResult`, `DeliveryRouteResult`). The dates arrive
// as ISO strings by JSON; The coordinates already come as a number (decimal 10.6).

export const TELEMETRY_STATUSES = ['active', 'signal_lost', 'inactive'] as const;
export type TelemetryStatus = (typeof TELEMETRY_STATUSES)[number];

export type VehicleType = 'car' | 'motorcycle' | 'bicycle' | 'e_scooter' | 'on_foot';

export interface LiveTrackingDriver {
  id: number;
  name: string;
  vehicle_type: VehicleType | string | null;
}

export interface LiveTrackingEntry {
  delivery_assignment_id: number;
  delivery_status: string;
  driver: LiveTrackingDriver | null;
  tracking_id: number | null;
  lat: number | null;
  lng: number | null;
  recorded_at: string | null;
  seconds_since_update: number | null;
  telemetry_status: TelemetryStatus;
  minutes_since_assigned: number | null;
  on_time: boolean | null;
}

export interface TelemetrySummary {
  live_deliveries: number;
  active_sessions: number;
  signal_lost: number;
  inactive: number;
  signal_lost_after_seconds: number;
  on_time_ratio_pct: number | null;
  on_time_threshold_minutes: number;
}

export interface RoutePoint {
  id: number;
  lat: number;
  lng: number;
  recorded_at: string | null;
}

export interface DeliveryRoute {
  delivery_assignment_id: number;
  delivery_status: string;
  driver: { id: number; name: string } | null;
  points: RoutePoint[];
  truncated: boolean;
}

export interface LiveTrackingQuery {
  telemetry_status?: TelemetryStatus[];
  delivery_driver_id?: number;
  delivery_assignment_id?: number;
}
