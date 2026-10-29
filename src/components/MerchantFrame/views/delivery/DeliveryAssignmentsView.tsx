// Delivery dispatch dashboard: KPIs (`GET /api/delivery-assignment/summary`), filters
// status/fleet type/search (sent to backend as query), Kanban board or
// table, lifecycle actions (valid transitions only), registration and reassignment in
// drawer and live tracking (own tracking view or DSP URL in an iframe).
//
// Real time: `delivery:assignment_changed` / `driver_status_changed` / reconnection → se
// ask again for dashboard and summary. Poll every 30 s as a backup.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  AssignmentCreateDraft,
  AssignmentFilters,
  AssignmentType,
  DeliveryAssignment,
  DeliveryAssignmentSummary,
  DeliveryStatus,
} from '../../../../types/delivery-assignments';
import {
  ASSIGNMENT_TYPES,
  DELIVERY_STATUSES,
  EMPTY_ASSIGNMENT_FILTERS,
  KANBAN_COLUMNS,
  STATUS_META,
  TYPE_META,
  assignmentCode,
  formatMinutes,
  groupByColumn,
  hasActiveAssignmentFilters,
  isDspType,
} from '../../../../lib/delivery-assignments';
import { formatMoney } from '../../../../lib/delivery-fees';
import {
  createDeliveryAssignment,
  getDeliveryAssignmentSummary,
  listAllDrivers,
  listDeliveryAssignments,
  updateDeliveryAssignment,
} from '../../../../api/delivery-assignments';
import { ApiError } from '../../../../lib/api-error';
import { getAccessToken } from '../../../../lib/auth-storage';
import { connectDeliveryRealtime } from '../../../../lib/delivery-realtime';
import { Toast, type ToastState } from '../../shared/Toast';
import {
  AssignmentActions,
  AssignmentCard,
  AssignmentFleetBadge,
  AssignmentIdBadges,
  AssignmentStatusPill,
  AssignmentTimeline,
} from './AssignmentCard';
import { AssignmentFormDrawer } from './AssignmentFormDrawer';
import { AssignmentTrackingDrawer } from './AssignmentTrackingDrawer';

export const TRACKING_FOCUS_KEY = 'delivery-tracking:focus-assignment';
export const SEARCH_DEBOUNCE_MS = 300;
export const POLL_INTERVAL_MS = 30_000;
export const CLOCK_TICK_MS = 30_000;

type BoardMode = 'kanban' | 'table';

interface DeliveryAssignmentsViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

const filterChip =
  'inline-flex items-center gap-2 px-3 py-2 rounded border border-[#e8e2d8] cursor-pointer hover:text-primary! hover:border-[#ae001a] transition-colors duration-200';

export const DeliveryAssignmentsView: React.FC<DeliveryAssignmentsViewProps> = ({ onNavigate }) => {
  const [statuses, setStatuses] = useState<DeliveryStatus[]>([]);
  const [types, setTypes] = useState<AssignmentType[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<BoardMode>('kanban');

  const [rows, setRows] = useState<DeliveryAssignment[]>([]);
  const [summary, setSummary] = useState<DeliveryAssignmentSummary | null>(null);
  const [vehicleByDriver, setVehicleByDriver] = useState<Map<number, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<{ assignment: DeliveryAssignment; to: DeliveryStatus } | null>(null);
  const [drawer, setDrawer] = useState<{ reassign: DeliveryAssignment | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [tracking, setTracking] = useState<DeliveryAssignment | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const filters: AssignmentFilters = useMemo(() => ({ statuses, types, search }), [statuses, types, search]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Search with debounce: typing does not trigger a request per key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Clock relative timers ("Assigned 12 mins ago").
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // ================= Lectura =================

  const seq = useRef(0);
  const loadedRef = useRef(false);

  const fetchBoard = useCallback(async (current: AssignmentFilters) => {
    const id = ++seq.current;
    if (!loadedRef.current) setLoading(true);
    try {
      const [boardRows, kpis] = await Promise.all([listDeliveryAssignments(current), getDeliveryAssignmentSummary()]);
      if (id !== seq.current) return; // old answer: filters changed in the meantime
      setRows(boardRows);
      setSummary(kpis);
      setError('');
      setNow(Date.now());
      loadedRef.current = true;
      setLoaded(true);
    } catch (err) {
      if (id !== seq.current) return;
      console.error('Error fetching delivery assignments:', err);
      const message =
        err instanceof ApiError ? err.message : 'Failed to load the dispatch board. Please check if the backend is running.';
      if (loadedRef.current) setToast({ message, type: 'error' });
      else setError(message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
    void Promise.resolve().then(() => {
      void fetchBoard(filters);
    });
  }, [filters, fetchBoard]);

  const refresh = useCallback(() => {
    void fetchBoard(filtersRef.current);
  }, [fetchBoard]);

  // Backup if the listing does not have vehicleType (previous backend): crosses with fleet.
  const fetchVehicles = useCallback(async () => {
    try {
      const drivers = await listAllDrivers();
      setVehicleByDriver(new Map(drivers.map((d) => [d.id, d.vehicleType ?? null])));
    } catch {
      // Without fleet the icon falls into the generic; The board still works.
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetchVehicles();
    });
  }, [fetchVehicles]);

  // Polling support.
  useEffect(() => {
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Tiempo real.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const connection = connectDeliveryRealtime(token, {
      onAssignmentChanged: () => refresh(),
      onDriverStatusChanged: () => {
        refresh();
        void fetchVehicles();
      },
      onReconnect: () => refresh(),
    });
    return () => connection.close();
  }, [refresh, fetchVehicles]);

  // ================= Escritura =================

  const applyStatus = async (assignment: DeliveryAssignment, to: DeliveryStatus) => {
    setBusyId(assignment.id);
    try {
      await updateDeliveryAssignment(assignment.id, { delivery_status: to });
      setToast({ message: `${assignmentCode(assignment.id)} → ${STATUS_META[to].label}`, type: 'success' });
      refresh();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Failed to update the delivery status.',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleStatus = (assignment: DeliveryAssignment, to: DeliveryStatus) => {
    if (to === 'failed' || to === 'cancelled') {
      setConfirming({ assignment, to });
      return;
    }
    void applyStatus(assignment, to);
  };

  const handleCreate = async (draft: AssignmentCreateDraft) => {
    setSubmitting(true);
    setFormError('');
    try {
      const created = await createDeliveryAssignment(draft);
      setDrawer(null);
      setToast({ message: `${assignmentCode(created.id)} created`, type: 'success' });
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create the assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReassign = async (assignment: DeliveryAssignment, driverId: number) => {
    setSubmitting(true);
    setFormError('');
    try {
      await updateDeliveryAssignment(assignment.id, { deliveryDriver: driverId });
      setDrawer(null);
      setToast({ message: `Driver updated on ${assignmentCode(assignment.id)}`, type: 'success' });
      refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to change the driver.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrack = (assignment: DeliveryAssignment) => {
    if (isDspType(assignment.assignment_type)) {
      setTracking(assignment);
      return;
    }
    try {
      window.sessionStorage.setItem(TRACKING_FOCUS_KEY, String(assignment.id));
    } catch {
      // Without sessionStorage the tracking view opens without focus; It is not blocking.
    }
    onNavigate?.('delivery-tracking');
  };

  const openCreate = () => {
    setFormError('');
    setDrawer({ reassign: null });
  };

  const handlers = {
    onStatus: handleStatus,
    onReassign: (a: DeliveryAssignment) => {
      setFormError('');
      setDrawer({ reassign: a });
    },
    onTrack: handleTrack,
  };

  const vehicleFor = (a: DeliveryAssignment) =>
    a.deliveryDriver ? vehicleByDriver.get(a.deliveryDriver.id) ?? a.deliveryDriver.vehicleType ?? null : null;

  const grouped = useMemo(() => groupByColumn(rows), [rows]);
  const clearFilters = () => {
    setStatuses([]);
    setTypes([]);
    setSearchInput('');
    setSearch('');
  };
  const filtersActive = hasActiveAssignmentFilters({ ...EMPTY_ASSIGNMENT_FILTERS, statuses, types, search: searchInput });

  // ================= Render =================

  if (error && !loaded) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans" data-testid="assignments-error">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors duration-200"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const s = summary;
  const delayed = s?.delayed ?? 0;
  const showValue = (v: string) => (loading && !loaded ? '—' : v);
  const kpis = [
    {
      id: 'pending-dispatch',
      label: 'Pending dispatch orders',
      value: showValue(String(s?.pending_dispatch ?? 0)),
      hint: 'kitchen-ready orders without a courier',
      icon: 'assignment_turned_in',
      accent: '#64748b',
    },
    {
      id: 'in-transit',
      label: 'Orders in-transit',
      value: showValue(String(s?.in_transit ?? 0)),
      hint: 'picked up or on the way',
      icon: 'local_shipping',
      accent: '#8b5cf6',
    },
    {
      id: 'avg-completion',
      label: 'Average completion time',
      value: showValue(formatMinutes(s?.avg_completion_minutes)),
      hint: 'assigned → delivered, last 24 h',
      icon: 'timer',
      accent: '#10b981',
    },
    {
      id: 'delayed',
      label: 'Delayed order warnings',
      value: showValue(String(delayed)),
      hint: delayed > 0 ? `over ${s?.delay_threshold_minutes ?? 45} min since assignment` : 'no delayed deliveries',
      icon: delayed > 0 ? 'warning' : 'verified',
      accent: delayed > 0 ? '#ef4444' : '#10b981',
      alert: delayed > 0,
      tooltip: `Assigned, picked up or in transit for more than ${s?.delay_threshold_minutes ?? 45} minutes`,
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              assignment_turned_in
            </span>
            Delivery Assignments
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Dispatch board: who carries each delivery, where it is in its lifecycle and how long it has taken.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            add
          </span>
          New Assignment
        </button>
      </div>

      {/* ---------- KPIs ---------- */}
      <section
        aria-label="Dispatch metrics"
        data-testid="assignment-kpis"
        className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4"
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            data-testid={`kpi-${kpi.id}`}
            role={kpi.alert ? 'alert' : undefined}
            title={kpi.tooltip}
            className={`border rounded shadow-sm p-5 flex items-center gap-4 border-l-4 hover:shadow-md transition-colors duration-200 ${
              kpi.alert ? 'bg-[#ef4444]/10 border-[#ef4444]/50' : 'bg-white border-[#e8e2d8]'
            }`}
            style={{ borderLeftColor: kpi.accent }}
          >
            <span className="material-symbols-outlined text-3xl shrink-0" style={{ color: kpi.accent }} aria-hidden="true">
              {kpi.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">{kpi.label}</p>
              <p className="text-h2 font-bold text-[#1d1c17] leading-tight font-sans">{kpi.value}</p>
              <p className="text-body-sm text-[#5f5e5e] truncate">{kpi.hint}</p>
            </div>
          </div>
        ))}

        <div
          data-testid="kpi-fleet-share"
          className="bg-white border border-[#e8e2d8] rounded shadow-sm p-5 flex flex-col justify-center gap-2 border-l-4 hover:shadow-md transition-colors duration-200"
          style={{ borderLeftColor: '#ae001a' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">
              hub
            </span>
            In-house vs DSP
          </p>
          {s && s.in_house_share_pct !== null && s.dsp_share_pct !== null ? (
            <>
              <div
                className="flex h-3 w-full rounded-full overflow-hidden bg-[#ece8e0]"
                role="img"
                aria-label={`In-house ${s.in_house_share_pct}% vs DSP ${s.dsp_share_pct}%`}
              >
                <div className="h-full bg-[#ae001a]" style={{ width: `${s.in_house_share_pct}%` }} />
                <div className="h-full bg-[#222222]" style={{ width: `${s.dsp_share_pct}%` }} />
              </div>
              <div className="flex justify-between text-body-sm font-semibold font-sans">
                <span className="text-[#ae001a]">In-house {s.in_house_share_pct}%</span>
                <span className="text-[#222222]">DSP {s.dsp_share_pct}%</span>
              </div>
            </>
          ) : (
            <p className="text-body-sm text-[#5f5e5e]">{loading && !loaded ? '—' : 'No open assignments'}</p>
          )}
        </div>

        <div
          data-testid="kpi-dsp-expenses"
          className="bg-white border border-[#e8e2d8] rounded shadow-sm p-5 flex items-center gap-4 border-l-4 hover:shadow-md transition-colors duration-200"
          style={{ borderLeftColor: '#222222' }}
        >
          <span className="material-symbols-outlined text-3xl shrink-0 text-[#222222]" aria-hidden="true">
            local_shipping
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">DSP service expenses today</p>
            <p className="text-h2 font-bold text-[#1d1c17] leading-tight font-sans">{showValue(formatMoney(s?.dsp_fee_today ?? 0))}</p>
            <p className="text-body-sm text-[#5f5e5e] truncate">DoorDash Drive + Uber Direct fees</p>
          </div>
        </div>
      </section>

      {/* ---------- Filtros ---------- */}
      <section aria-label="Assignment filters" className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Courier name, order id or delivery address…"
              aria-label="Search assignments"
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-colors duration-200"
            />
          </div>
          <div role="group" aria-label="Board layout" className="inline-flex rounded border border-[#e8e2d8] overflow-hidden">
            {(['kanban', 'table'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 hover:text-primary! transition-colors duration-200 ${
                  mode === m ? 'bg-[#222222] text-white' : 'bg-white text-[#5f5e5e]'
                }`}
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {m === 'kanban' ? 'view_kanban' : 'table_rows'}
                </span>
                {m === 'kanban' ? 'Kanban' : 'Table'}
              </button>
            ))}
          </div>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
            >
              Clear Filters
            </button>
          ) : null}
        </div>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">Status</legend>
          {DELIVERY_STATUSES.map((status) => (
            <label key={status} className={filterChip}>
              <input
                type="checkbox"
                aria-label={`Status ${STATUS_META[status].label}`}
                checked={statuses.includes(status)}
                onChange={(e) =>
                  setStatuses((cur) => (e.target.checked ? [...cur, status] : cur.filter((x) => x !== status)))
                }
                className="accent-[#ae001a] w-3.5 h-3.5"
              />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_META[status].color }} aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-wider">{STATUS_META[status].label}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">Fulfillment type</legend>
          {ASSIGNMENT_TYPES.map((type) => (
            <label key={type} className={filterChip}>
              <input
                type="checkbox"
                aria-label={`Fulfillment ${TYPE_META[type].filterLabel}`}
                checked={types.includes(type)}
                onChange={(e) => setTypes((cur) => (e.target.checked ? [...cur, type] : cur.filter((x) => x !== type)))}
                className="accent-[#ae001a] w-3.5 h-3.5"
              />
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {TYPE_META[type].icon}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider">{TYPE_META[type].filterLabel}</span>
            </label>
          ))}
        </fieldset>
      </section>

      {/* ---------- Tablero ---------- */}
      <section aria-label="Dispatch control board" className="flex flex-col gap-3">
        {loading && !loaded ? (
          <div className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-3" data-testid="assignments-loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-[#ece8e0] rounded animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div
            data-testid="assignments-empty-state"
            className="bg-white border border-[#e8e2d8] rounded shadow-sm p-16 flex flex-col items-center text-center gap-3"
          >
            <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
              {filtersActive ? 'search_off' : 'assignment_turned_in'}
            </span>
            <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
              {filtersActive
                ? 'No assignment matches these filters.'
                : 'No delivery assignment yet. Dispatch a kitchen-ready order to get it on the road.'}
            </p>
            {filtersActive ? (
              <button type="button" onClick={clearFilters} className="text-primary text-sm font-semibold hover:underline">
                Clear filters
              </button>
            ) : (
              <button type="button" onClick={openCreate} className="text-primary text-sm font-semibold hover:underline">
                Create an assignment
              </button>
            )}
          </div>
        ) : mode === 'kanban' ? (
          <div data-testid="kanban-board" className="grid grid-flow-col auto-cols-[minmax(200px,1fr)] gap-3 overflow-x-auto pb-2">
            {KANBAN_COLUMNS.map((column) => (
              <div
                key={column.id}
                data-testid={`kanban-column-${column.id}`}
                className="bg-[#f8f3eb] border border-[#e8e2d8] rounded p-3 flex flex-col gap-3 min-h-[160px]"
              >
                {/* Equal header heights across columns (some wrap to two lines): aligned underlines. */}
                <div className="flex items-end justify-between gap-2 border-b-2 pb-2 min-h-[2.75rem]" style={{ borderBottomColor: column.color }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#1d1c17]">{column.label}</p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#5f5e5e] font-sans">
                    {grouped[column.id].length}
                  </span>
                </div>
                {grouped[column.id].map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    now={now}
                    busy={busyId === a.id}
                    vehicleType={vehicleFor(a)}
                    {...handlers}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-x-auto">
            <table className="w-full text-sm" data-testid="assignment-table">
              <thead className="bg-[#f8f3eb] text-[11px] uppercase tracking-wider text-[#5f5e5e]">
                <tr>
                  <th scope="col" className="text-left px-4 py-3">Assignment &amp; order</th>
                  <th scope="col" className="text-left px-4 py-3">Fleet</th>
                  <th scope="col" className="text-left px-4 py-3">Status</th>
                  <th scope="col" className="text-left px-4 py-3">Timeline</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2ede5]">
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    data-testid={`assignment-row-${a.id}`}
                    className="align-top hover:bg-[#f8f3eb] hover:text-primary! transition-colors duration-200"
                  >
                    <td className="px-4 py-3"><AssignmentIdBadges assignment={a} /></td>
                    <td className="px-4 py-3"><AssignmentFleetBadge assignment={a} vehicleType={vehicleFor(a)} /></td>
                    <td className="px-4 py-3"><AssignmentStatusPill status={a.delivery_status} /></td>
                    <td className="px-4 py-3"><AssignmentTimeline assignment={a} now={now} /></td>
                    <td className="px-4 py-3">
                      <AssignmentActions assignment={a} busy={busyId === a.id} {...handlers} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirming
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" role="presentation">
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="assignment-confirm-title"
                className="bg-white rounded shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 font-sans"
              >
                <p id="assignment-confirm-title" className="text-lg font-bold text-[#1d1c17]">
                  {confirming.to === 'cancelled' ? 'Cancel' : 'Mark as failed'} {assignmentCode(confirming.assignment.id)}?
                </p>
                <p className="text-body-sm text-[#5f5e5e]">
                  This closes the delivery for good. An in-house driver goes back to active.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="px-4 py-2 border border-[#e8e2d8] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
                  >
                    Keep delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const { assignment, to } = confirming;
                      setConfirming(null);
                      void applyStatus(assignment, to);
                    }}
                    className="px-4 py-2 bg-[#ef4444] hover:bg-[#b91c1c] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200"
                  >
                    {confirming.to === 'cancelled' ? 'Yes, cancel' : 'Yes, mark failed'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {drawer ? (
        <AssignmentFormDrawer
          reassign={drawer.reassign}
          submitting={submitting}
          formError={formError}
          onCancel={() => setDrawer(null)}
          onCreate={(draft) => void handleCreate(draft)}
          onReassign={(a, driverId) => void handleReassign(a, driverId)}
          onDispatched={(created) => {
            setDrawer(null);
            setToast({ message: `${assignmentCode(created.id)} dispatched via provider`, type: 'success' });
            refresh();
          }}
        />
      ) : null}

      {tracking ? <AssignmentTrackingDrawer assignment={tracking} onClose={() => setTracking(null)} /> : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};

export default DeliveryAssignmentsView;
