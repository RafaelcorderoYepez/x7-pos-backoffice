// Radar en vivo de la flota: KPIs de telemetría, filtros (repartidor/asignación y estado de
// la señal), mapa Leaflet con un marcador por reparto en curso y la lista de tarjetas.
//
// Fuentes: `GET /api/delivery-tracking/live` y `/summary` (sondeo cada 15 s como respaldo),
// el socket de delivery-realtime (posición nueva = mover el marcador al instante) y
// `/route/:assignmentId` para el rastro del reparto enfocado. La señal perdida se recalcula
// en el cliente cada segundo: no hace falta esperar al siguiente sondeo para verla.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeliveryZone } from '../../../../types/delivery';
import {
  TELEMETRY_STATUSES,
  type DeliveryRoute,
  type RoutePoint,
  type TelemetryStatus,
  type TelemetrySummary,
} from '../../../../types/delivery-tracking';
import { getDeliveryRoute, getLiveTracking, getTelemetrySummary } from '../../../../api/delivery-tracking';
import { listDeliveryZones } from '../../../../api/delivery';
import { ApiError } from '../../../../lib/api-error';
import { getAccessToken } from '../../../../lib/auth-storage';
import { connectDeliveryRealtime, type LocationUpdatedPayload } from '../../../../lib/delivery-realtime';
import {
  LIVE_POLL_MS,
  ON_TIME_THRESHOLD_MINUTES,
  TELEMETRY_META,
  anchorEntries,
  appendRoutePoint,
  applyLocationUpdate,
  assignmentCode,
  clearStoredFocus,
  decodeFocus,
  effectiveStatus,
  encodeFocus,
  markerColor,
  matchesFocus,
  peekStoredFocus,
  routeDistanceKm,
  secondsSinceUpdate,
  sortRoutePoints,
  vehicleIcon,
  type FocusSelection,
  type TrackedEntry,
} from '../../../../lib/delivery-tracking';
import { TrackingMap, type TrackingMarker } from './TrackingMap';
import { TrackingCard } from './TrackingCard';

interface DeliveryTrackingViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

const controlClass =
  'px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] hover:text-primary! transition-colors duration-200 font-sans';

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export const DeliveryTrackingView: React.FC<DeliveryTrackingViewProps> = ({ onNavigate }) => {
  const [entries, setEntries] = useState<TrackedEntry[]>([]);
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [statuses, setStatuses] = useState<TelemetryStatus[]>([...TELEMETRY_STATUSES]);
  const [focus, setFocus] = useState<FocusSelection>(() => {
    const stored = peekStoredFocus();
    return stored ? { kind: 'assignment', id: stored } : null;
  });
  const [route, setRoute] = useState<DeliveryRoute | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);

  const loadedRef = useRef(false);
  const requestSeq = useRef(0);
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  });

  // El foco viene de otra vista una sola vez: se consume al montar.
  useEffect(() => {
    clearStoredFocus();
  }, []);

  // ================= Datos =================

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const wanted = statuses.length === TELEMETRY_STATUSES.length ? undefined : statuses;
      const [rows, totals] = await Promise.all([
        statuses.length ? getLiveTracking({ telemetry_status: wanted }) : Promise.resolve([]),
        getTelemetrySummary(),
      ]);
      if (seq !== requestSeq.current) return;
      const fetchedAt = Date.now();
      setEntries(anchorEntries(rows, fetchedAt));
      setSummary(totals);
      setNow(fetchedAt);
      setError('');
      setPollError('');
      loadedRef.current = true;
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error('Error fetching live tracking:', err);
      const message = errorMessage(err, 'Failed to load live tracking. Please check if the backend is running.');
      if (loadedRef.current) setPollError(message);
      else setError(message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [statuses]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    void Promise.resolve().then(() => {
      void refresh();
    });
  }, [refresh]);

  const retry = () => {
    setError('');
    setLoading(true);
    void refresh();
  };

  // Zonas activas como capa tenue: opcional, un fallo no estropea el radar.
  useEffect(() => {
    let alive = true;
    listDeliveryZones()
      .then((rows) => alive && setZones(rows))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Sondeo de respaldo + reloj de 1 s (tiempo relativo y detección de señal perdida).
  useEffect(() => {
    const poll = window.setInterval(() => void refreshRef.current(), LIVE_POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  // ================= Foco y ruta =================

  const focusedAssignmentId = useMemo(() => {
    if (!focus) return null;
    if (focus.kind === 'assignment') return focus.id;
    return entries.find((e) => e.driver?.id === focus.id)?.delivery_assignment_id ?? null;
  }, [focus, entries]);

  const focusedRef = useRef<number | null>(focusedAssignmentId);
  useEffect(() => {
    focusedRef.current = focusedAssignmentId;
  });

  useEffect(() => {
    if (focusedAssignmentId == null) {
      void Promise.resolve().then(() => {
        setRoute(null);
        setRoutePoints([]);
        setRouteError('');
        setRouteLoading(false);
      });
      return;
    }
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      setRouteLoading(true);
      setRouteError('');
      try {
        const data = await getDeliveryRoute(focusedAssignmentId);
        if (!alive) return;
        setRoute(data);
        setRoutePoints(sortRoutePoints(data.points ?? []));
      } catch (err) {
        if (!alive) return;
        setRoute(null);
        setRoutePoints([]);
        setRouteError(errorMessage(err, 'Failed to load the route trail.'));
      } finally {
        if (alive) setRouteLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [focusedAssignmentId]);

  // ================= Tiempo real =================

  const handleLocation = useCallback((payload: LocationUpdatedPayload) => {
    const next = applyLocationUpdate(entriesRef.current, payload, Date.now());
    if (!next) {
      void refreshRef.current();
      return;
    }
    entriesRef.current = next;
    setEntries(next);
    setNow(Date.now());
    if (focusedRef.current === payload.assignmentId) {
      setRoutePoints((points) => appendRoutePoint(points, payload));
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const connection = connectDeliveryRealtime(token, {
      onLocationUpdated: handleLocation,
      onAssignmentChanged: () => void refreshRef.current(),
      onReconnect: () => void refreshRef.current(),
      onConnectionChange: setConnected,
    });
    return () => connection.close();
  }, [handleLocation]);

  // Esc cierra la pantalla completa.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  // ================= Derivados =================

  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        seconds: secondsSinceUpdate(entry, now),
        status: effectiveStatus(entry, now),
      })),
    [entries, now],
  );

  const visible = useMemo(
    () => rows.filter((row) => statuses.includes(row.status) && matchesFocus(row.entry, focus)),
    [rows, statuses, focus],
  );

  const markers: TrackingMarker[] = useMemo(
    () =>
      visible
        .filter((row) => row.entry.lat != null && row.entry.lng != null)
        .map(({ entry, seconds, status }) => ({
          id: entry.delivery_assignment_id,
          lat: entry.lat as number,
          lng: entry.lng as number,
          title: `${assignmentCode(entry.delivery_assignment_id)} · ${entry.driver?.name ?? 'Unassigned'}`,
          style: {
            status,
            color: markerColor(status, seconds),
            icon: vehicleIcon(entry.driver?.vehicle_type),
            focused: entry.delivery_assignment_id === focusedAssignmentId,
          },
        })),
    [visible, focusedAssignmentId],
  );

  const fitPoints = useMemo<Array<[number, number]>>(() => {
    if (focusedAssignmentId != null) {
      const trail = routePoints.map((p) => [p.lat, p.lng] as [number, number]);
      const marker = markers.find((m) => m.id === focusedAssignmentId);
      return marker ? [...trail, [marker.lat, marker.lng]] : trail;
    }
    return markers.map((m) => [m.lat, m.lng] as [number, number]);
  }, [focusedAssignmentId, routePoints, markers]);

  const fitKey = `${encodeFocus(focus)}|${focusedAssignmentId ?? ''}|${route?.delivery_assignment_id ?? ''}|${markers.length > 0}`;

  const driverOptions = useMemo(() => {
    const seen = new Map<number, string>();
    entries.forEach((e) => {
      if (e.driver && !seen.has(e.driver.id)) seen.set(e.driver.id, e.driver.name || `Driver ${e.driver.id}`);
    });
    if (focus?.kind === 'driver' && !seen.has(focus.id)) seen.set(focus.id, `Driver ${focus.id} (not live)`);
    return [...seen.entries()];
  }, [entries, focus]);

  const assignmentOptions = useMemo(() => {
    const list = entries.map((e) => ({
      id: e.delivery_assignment_id,
      label: `${assignmentCode(e.delivery_assignment_id)}${e.driver ? ` · ${e.driver.name}` : ''}`,
    }));
    if (focus?.kind === 'assignment' && !list.some((o) => o.id === focus.id)) {
      list.push({ id: focus.id, label: `${assignmentCode(focus.id)} (not live)` });
    }
    return list;
  }, [entries, focus]);

  const toggleStatus = (status: TelemetryStatus, checked: boolean) =>
    setStatuses((current) =>
      checked
        ? TELEMETRY_STATUSES.filter((s) => s === status || current.includes(s))
        : current.filter((s) => s !== status),
    );

  const focusAssignment = (assignmentId: number) =>
    setFocus((current) =>
      current?.kind === 'assignment' && current.id === assignmentId ? null : { kind: 'assignment', id: assignmentId },
    );

  // ================= Render =================

  if (error) {
    return (
      <div data-testid="tracking-error" className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors duration-200"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const signalLost = summary?.signal_lost ?? 0;
  const threshold = summary?.on_time_threshold_minutes ?? ON_TIME_THRESHOLD_MINUTES;
  const kpis = [
    {
      id: 'active-sessions',
      label: 'Active tracking sessions',
      value: String(summary?.active_sessions ?? 0),
      hint: `${summary?.live_deliveries ?? 0} live ${summary?.live_deliveries === 1 ? 'delivery' : 'deliveries'} on the radar`,
      icon: 'my_location',
      accent: '#10b981',
      alert: false,
    },
    {
      id: 'signal-lost',
      label: 'Signal offline warnings',
      value: String(signalLost),
      hint: signalLost
        ? `no GPS ping for over ${Math.round((summary?.signal_lost_after_seconds ?? 180) / 60)} min`
        : 'every courier is reporting',
      icon: signalLost ? 'wifi_off' : 'sensors',
      accent: signalLost ? '#f59e0b' : '#10b981',
      alert: signalLost > 0,
    },
    {
      id: 'on-time',
      label: 'On-time route ratio',
      value: summary?.on_time_ratio_pct == null ? '—' : `${summary.on_time_ratio_pct}%`,
      hint: `within the ${threshold}-min delivery target`,
      icon: 'route',
      accent: '#ae001a',
      alert: false,
    },
  ];

  const trailKm = routeDistanceKm(routePoints);

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              radar
            </span>
            Delivery Tracking
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Live radar of every courier out on a delivery: last GPS ping, signal health and route trail.
          </p>
        </div>
        <span
          data-testid="connection-indicator"
          data-connected={connected}
          title={connected ? 'Positions are pushed in real time' : `Refreshing every ${LIVE_POLL_MS / 1000} s`}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-widest hover:text-primary! transition-colors duration-200 ${
            connected ? 'border-[#10b981] text-[#047857]' : 'border-[#e8e2d8] text-[#5f5e5e]'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[#10b981]' : 'bg-[#64748b]'}`} aria-hidden="true" />
          {connected ? 'Live' : 'Polling'}
        </span>
      </div>

      {/* ---------- KPIs de telemetría ---------- */}
      <section
        aria-label="Fleet telemetry metrics"
        data-testid="tracking-kpis"
        className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4"
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            data-testid={`kpi-${kpi.id}`}
            data-alert={kpi.alert}
            role={kpi.alert ? 'alert' : undefined}
            className={`border rounded shadow-sm p-5 flex items-center gap-4 border-l-4 hover:text-primary! hover:shadow-md transition-colors duration-200 ${
              kpi.alert ? 'bg-[#f59e0b]/10 border-[#f59e0b]/60' : 'bg-white border-[#e8e2d8]'
            }`}
            style={{ borderLeftColor: kpi.accent }}
          >
            <span className="material-symbols-outlined text-3xl shrink-0" style={{ color: kpi.accent }} aria-hidden="true">
              {kpi.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">{kpi.label}</p>
              <p className="text-h2 font-bold text-[#1d1c17] leading-tight font-sans tabular-nums">
                {loading && !summary ? '—' : kpi.value}
              </p>
              <p className="text-body-sm text-[#5f5e5e] truncate">{kpi.hint}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ---------- Filtros ---------- */}
      <section
        aria-label="Tracking filters"
        className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3"
      >
        <label className="flex items-center gap-2 flex-1 min-w-[260px]">
          <span className="material-symbols-outlined text-[#5f5e5e]" aria-hidden="true">
            my_location
          </span>
          <span className="sr-only">Active courier filter</span>
          <select
            aria-label="Active courier filter"
            value={encodeFocus(focus)}
            onChange={(e) => setFocus(decodeFocus(e.target.value))}
            className={`${controlClass} flex-1`}
          >
            <option value="">Full fleet view</option>
            <optgroup label="Couriers">
              {driverOptions.map(([id, name]) => (
                <option key={`d${id}`} value={`driver:${id}`}>
                  {name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Assignments">
              {assignmentOptions.map((o) => (
                <option key={`a${o.id}`} value={`assignment:${o.id}`}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {focus ? (
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
          >
            Show full fleet
          </button>
        ) : null}
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Telemetry status filter</legend>
          {TELEMETRY_STATUSES.map((status) => (
            <label
              key={status}
              className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[#e8e2d8] cursor-pointer hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
            >
              <input
                type="checkbox"
                checked={statuses.includes(status)}
                onChange={(e) => toggleStatus(status, e.target.checked)}
                className="accent-[#ae001a] w-3.5 h-3.5"
              />
              <span className="w-2 h-2 rounded-full" style={{ background: TELEMETRY_META[status].color }} aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-wider">{TELEMETRY_META[status].filterLabel}</span>
            </label>
          ))}
        </fieldset>
      </section>

      {pollError ? (
        <p role="status" className="text-body-sm text-[#92400e] flex items-center gap-2">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            wifi_off
          </span>
          Last refresh failed: {pollError} Showing the latest known positions.
        </p>
      ) : null}

      {/* ---------- Radar + tarjetas ---------- */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section
          aria-label="Live radar"
          className={
            expanded
              ? 'fixed inset-0 z-[70] bg-white p-4 flex flex-col gap-3'
              : 'bg-white border border-[#e8e2d8] rounded shadow-sm p-4 flex flex-col gap-3'
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-[#ae001a]" aria-hidden="true">
                radar
              </span>
              Live radar · <span className="font-sans tabular-nums">{markers.length}</span> on map
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-pressed={expanded}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#e8e2d8] text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {expanded ? 'fullscreen_exit' : 'fullscreen'}
              </span>
              {expanded ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
          </div>
          <TrackingMap
            markers={markers}
            route={focusedAssignmentId != null ? routePoints : null}
            zones={zones}
            fitPoints={fitPoints}
            fitKey={fitKey}
            onSelect={focusAssignment}
            height={expanded ? 'calc(100vh - 140px)' : 560}
          />
          {focusedAssignmentId != null ? (
            <div data-testid="route-panel" className="flex flex-wrap items-center gap-3 text-body-sm text-[#5f5e5e]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#1d1c17]">
                <span className="material-symbols-outlined text-base text-[#ae001a]" aria-hidden="true">
                  route
                </span>
                Route trail {assignmentCode(focusedAssignmentId)}
              </span>
              {routeLoading ? (
                <span>Loading trail…</span>
              ) : routeError ? (
                <span className="text-[#b91c1c]">{routeError}</span>
              ) : (
                <span className="font-sans tabular-nums" data-testid="route-stats">
                  {routePoints.length} points · {trailKm.toFixed(2)} km
                </span>
              )}
              {route?.truncated ? <span>Showing the most recent points only.</span> : null}
            </div>
          ) : null}
        </section>

        <section aria-label="Active tracking cards" className="flex flex-col gap-3 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              sensors
            </span>
            Active tracking · <span className="font-sans tabular-nums">{visible.length}</span>
          </p>
          {loading ? (
            <div data-testid="tracking-loading" className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-36 bg-[#ece8e0] rounded animate-pulse" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div
              data-testid="tracking-empty-state"
              className="bg-white border border-[#e8e2d8] rounded p-10 flex flex-col items-center text-center gap-3"
            >
              <span className="material-symbols-outlined text-[#d51f2c] text-5xl" aria-hidden="true">
                radar
              </span>
              <p className="text-[#5f5e5e] text-sm leading-relaxed">
                {statuses.length
                  ? 'No courier is out on a delivery right now.'
                  : 'Pick at least one telemetry status to see couriers.'}
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.('delivery-assignments')}
                className="text-primary text-sm font-semibold hover:underline"
              >
                Go to Delivery Assignments
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="bg-white border border-[#e8e2d8] rounded p-8 flex flex-col items-center text-center gap-2">
              <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
                search_off
              </span>
              <p className="text-sm text-[#5f5e5e]">No courier matches these filters — {entries.length} live.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3 lg:max-h-[640px] lg:overflow-y-auto pr-1">
              {visible.map(({ entry, seconds, status }) => (
                <TrackingCard
                  key={entry.delivery_assignment_id}
                  entry={entry}
                  status={status}
                  seconds={seconds}
                  focused={entry.delivery_assignment_id === focusedAssignmentId}
                  onFocus={focusAssignment}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default DeliveryTrackingView;
