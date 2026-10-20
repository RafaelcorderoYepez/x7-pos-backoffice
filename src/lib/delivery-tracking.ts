// Pure live radar logic: effective state of telemetry (signal detection
// lost on client), relative time, coordinate format, marker style
// and fusion of positions arriving in real time.
//
// The threshold is the same as the backend (SIGNAL_LOST_AFTER_MS = 3 min in
// delivery-tracking.constants.ts): If they diverge, the card and the KPI would say different things.

import type {
  LiveTrackingEntry,
  RoutePoint,
  TelemetryStatus,
} from '../types/delivery-tracking';
import type { LocationUpdatedPayload } from './delivery-realtime';

export const SIGNAL_LOST_AFTER_SECONDS = 180;
/** Double the threshold: the amber marker turns red. */
export const CRITICAL_STALE_SECONDS = SIGNAL_LOST_AFTER_SECONDS * 2;
export const ON_TIME_THRESHOLD_MINUTES = 45;
export const LIVE_POLL_MS = 15_000;
export const FOCUS_STORAGE_KEY = 'delivery-tracking:focus-assignment';

export const TRACKING_COLORS = {
  active: '#10b981',
  signal_lost: '#f59e0b',
  critical: '#ef4444',
  inactive: '#64748b',
  primary: '#ae001a',
} as const;

export const TELEMETRY_META: Record<
  TelemetryStatus,
  { label: string; filterLabel: string; color: string; pill: string; icon: string }
> = {
  active: {
    label: 'Live GPS',
    filterLabel: 'Active',
    color: TRACKING_COLORS.active,
    pill: 'bg-[#10b981] text-white',
    icon: 'sensors',
  },
  signal_lost: {
    label: 'Stale telemetry',
    filterLabel: 'Signal lost',
    color: TRACKING_COLORS.signal_lost,
    pill: 'bg-[#f59e0b] text-white',
    icon: 'wifi_off',
  },
  inactive: {
    label: 'Tracking ended',
    filterLabel: 'Inactive',
    color: TRACKING_COLORS.inactive,
    pill: 'bg-[#64748b] text-white',
    icon: 'location_off',
  },
};

export const VEHICLE_ICONS: Record<string, string> = {
  car: 'directions_car',
  motorcycle: 'two_wheeler',
  bicycle: 'pedal_bike',
  e_scooter: 'electric_scooter',
  on_foot: 'directions_walk',
};

export const vehicleIcon = (type: string | null | undefined): string =>
  (type && VEHICLE_ICONS[type]) || 'local_shipping';

export const trackingCode = (id: number) => `#TRK-${id}`;
export const assignmentCode = (id: number) => `#ASN-${id}`;

export const formatCoord = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(6) : '—';

// ================= Tiempo =================

/**
 * Radar input + `anchorMs`: the time (navigator clock) of the last ping. If
 * anchor with `seconds_since_update`, which is calculated by the server, so that a local clock
 * out of phase do not mark everything as lost signal.
 */
export interface TrackedEntry extends LiveTrackingEntry {
  anchorMs: number | null;
}

const parseMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

export const anchorEntries = (entries: LiveTrackingEntry[], fetchedAt: number): TrackedEntry[] =>
  entries.map((entry) => ({
    ...entry,
    anchorMs:
      entry.seconds_since_update != null
        ? fetchedAt - entry.seconds_since_update * 1000
        : parseMs(entry.recorded_at),
  }));

export const secondsSinceUpdate = (entry: TrackedEntry, now: number): number | null =>
  entry.anchorMs == null ? null : Math.max(0, Math.floor((now - entry.anchorMs) / 1000));

/** State to be painted: `inactive` commands; no ping or ping > 180 s → `signal_lost`. */
export const effectiveStatus = (entry: TrackedEntry, now: number): TelemetryStatus => {
  if (entry.telemetry_status === 'inactive') return 'inactive';
  const seconds = secondsSinceUpdate(entry, now);
  if (seconds == null) return 'signal_lost';
  return seconds > SIGNAL_LOST_AFTER_SECONDS ? 'signal_lost' : 'active';
};

export const formatRelativeTime = (seconds: number | null): string => {
  if (seconds == null) return 'No signal yet';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `Updated ${Math.floor(seconds / 3600)}h ago`;
  return `Updated ${Math.floor(seconds / 86_400)}d ago`;
};

/** Marker color: amber when signal is lost, red after double the threshold. */
export const markerColor = (status: TelemetryStatus, seconds: number | null): string => {
  if (status === 'active') return TRACKING_COLORS.active;
  if (status === 'inactive') return TRACKING_COLORS.inactive;
  return seconds == null || seconds > CRITICAL_STALE_SECONDS
    ? TRACKING_COLORS.critical
    : TRACKING_COLORS.signal_lost;
};

// ================= Marcadores =================

export interface MarkerStyle {
  status: TelemetryStatus;
  color: string;
  icon: string;
  focused: boolean;
}

/** `L.divIcon` HTML: vehicle in Material Symbols, halo `ping` only if live. */
export const markerHtml = ({ status, color, icon, focused }: MarkerStyle): string => {
  const ping =
    status === 'active'
      ? `<span class="absolute inset-0 rounded-full animate-ping motion-reduce:animate-none" style="background:${color};opacity:.45"></span>`
      : '';
  const ring = focused ? TRACKING_COLORS.primary : '#ffffff';
  return (
    `<div class="trk-marker relative hover:text-primary transition-colors duration-200" data-status="${status}" data-color="${color}" style="width:34px;height:34px">` +
    ping +
    `<span class="relative flex items-center justify-center rounded-full shadow-md" style="width:34px;height:34px;background:${color};border:3px solid ${ring}">` +
    `<span class="material-symbols-outlined" style="font-size:18px;color:#fff">${icon}</span>` +
    `</span></div>`
  );
};

// ================= Ruta =================

export const sortRoutePoints = (points: RoutePoint[]): RoutePoint[] =>
  [...points].sort((a, b) => {
    const ta = parseMs(a.recorded_at) ?? Number.POSITIVE_INFINITY;
    const tb = parseMs(b.recorded_at) ?? Number.POSITIVE_INFINITY;
    return ta === tb ? a.id - b.id : ta - tb;
  });

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distance of the route (haversine), in km. */
export const routeDistanceKm = (points: RoutePoint[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    total += 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
};

export const appendRoutePoint = (points: RoutePoint[], payload: LocationUpdatedPayload): RoutePoint[] =>
  points.some((p) => p.id === payload.trackingId)
    ? points
    : sortRoutePoints([
        ...points,
        { id: payload.trackingId, lat: Number(payload.lat), lng: Number(payload.lng), recorded_at: payload.recorded_at },
      ]);

// ================= Tiempo real =================

/**
 * Applies a position pushed by the socket. Returns `null` if the assignment is not in
 * the list (new cast): the view should ask for `/live` again.
 */
export const applyLocationUpdate = (
  entries: TrackedEntry[],
  payload: LocationUpdatedPayload,
  receivedAt: number,
): TrackedEntry[] | null => {
  const index = entries.findIndex((e) => e.delivery_assignment_id === payload.assignmentId);
  if (index === -1) return null;
  const emitted = parseMs(payload.emittedAt);
  const recorded = parseMs(payload.recorded_at);
  const lagMs = emitted != null && recorded != null ? Math.max(0, emitted - recorded) : 0;
  const next = [...entries];
  next[index] = {
    ...entries[index],
    tracking_id: payload.trackingId,
    lat: Number(payload.lat),
    lng: Number(payload.lng),
    recorded_at: payload.recorded_at,
    seconds_since_update: Math.floor(lagMs / 1000),
    telemetry_status: payload.status === 'inactive' ? 'inactive' : 'active',
    anchorMs: receivedAt - lagMs,
  };
  return next;
};

// ================= Foco =================

export type FocusSelection =
  | { kind: 'driver'; id: number }
  | { kind: 'assignment'; id: number }
  | null;

export const encodeFocus = (focus: FocusSelection): string => (focus ? `${focus.kind}:${focus.id}` : '');

export const decodeFocus = (value: string): FocusSelection => {
  const match = /^(driver|assignment):(\d+)$/.exec(value);
  if (!match) return null;
  return { kind: match[1] as 'driver' | 'assignment', id: Number(match[2]) };
};

export const matchesFocus = (entry: LiveTrackingEntry, focus: FocusSelection): boolean => {
  if (!focus) return true;
  return focus.kind === 'assignment'
    ? entry.delivery_assignment_id === focus.id
    : entry.driver?.id === focus.id;
};

/** Reads (without clearing) the focus that another view left in sessionStorage. */
export const peekStoredFocus = (): number | null => {
  try {
    const raw = window.sessionStorage.getItem(FOCUS_STORAGE_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

export const clearStoredFocus = (): void => {
  try {
    window.sessionStorage.removeItem(FOCUS_STORAGE_KEY);
  } catch {
    // Locked storage - nothing to clean.
  }
};
