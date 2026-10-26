// Workspace de zonas de reparto: KPIs de cobertura, tabla + mapa, comprobador de geocerca
// y conmutador de estado en línea.
//
// Rutas reales: `/api/delivery-zone` (singular, PATCH), acotado al comercio del JWT. El
// filtrado es en cliente: buscar o marcar estados no vuelve a pedir nada ni recarga el mapa.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DeliveryZone,
  DeliveryZoneDraft,
  DeliveryZoneStatus,
  ZoneCoverage,
  ZoneLocateResult,
} from '../../../../types/delivery';
import {
  EMPTY_ZONE_FILTERS,
  ZONE_STATUSES,
  ZONE_STATUS_META,
  computeZoneMetrics,
  formatCoordinate,
  formatTimestamp,
  hasActiveZoneFilters,
  matchesZoneFilters,
  parseLatLngPair,
  vertexCount,
  zoneCode,
  zoneGeometry,
  type LatLng,
  type ZoneFilters,
} from '../../../../lib/delivery-zones';
import {
  createDeliveryZone,
  deleteDeliveryZone,
  geocodeAddress,
  getDeliveryCoverage,
  listDeliveryZones,
  locateDeliveryZone,
  updateDeliveryZone,
} from '../../../../api/delivery';
import { ApiError } from '../../../../lib/api-error';
import { Toast, type ToastState } from '../../shared/Toast';
import { ZoneMap } from './ZoneMap';
import { ZoneFormDrawer } from './ZoneFormDrawer';

interface DeliveryZonesViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

const chipButton =
  'px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-primary! transition-colors duration-200 disabled:opacity-40 cursor-pointer';

// La NavHubBar la monta MerchantFrame; `onNavigate` se mantiene por contrato de las vistas.
export const DeliveryZonesView: React.FC<DeliveryZonesViewProps> = () => {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [coverage, setCoverage] = useState<ZoneCoverage | null>(null);
  const [filters, setFilters] = useState<ZoneFilters>(EMPTY_ZONE_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [fitKey, setFitKey] = useState(0);

  const [lookup, setLookup] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] = useState<(ZoneLocateResult & { label: string }) | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listDeliveryZones();
      setZones(rows);
      setFitKey((k) => k + 1);
    } catch (err) {
      console.error('Error fetching delivery zones:', err);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load delivery zones. Please check if the backend is running.',
      );
    } finally {
      setLoading(false);
    }
    // El KPI de cobertura no debe tumbar el workspace si falla.
    try {
      setCoverage(await getDeliveryCoverage());
    } catch {
      setCoverage(null);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetchZones();
    });
  }, [fetchZones]);

  const metrics = useMemo(() => computeZoneMetrics(zones), [zones]);
  const visible = useMemo(() => zones.filter((z) => matchesZoneFilters(z, filters)), [zones, filters]);
  const merchantName = zones.find((z) => z.merchant?.name)?.merchant?.name ?? null;
  const unassignedZones = useMemo(() => zones.filter((z) => !zoneGeometry(z)), [zones]);

  // ================= Escritura =================

  const handleSubmit = async (draft: DeliveryZoneDraft) => {
    setSubmitting(true);
    setFormError('');
    try {
      if (editing) {
        await updateDeliveryZone(editing.id, draft);
      } else {
        await createDeliveryZone(draft);
      }
      setDrawerOpen(false);
      setToast({ message: editing ? `${draft.name} updated` : `${draft.name} created`, type: 'success' });
      setEditing(null);
      await fetchZones();
    } catch (err) {
      console.error('Error saving the delivery zone:', err);
      setFormError(err instanceof ApiError ? err.message : 'Failed to save the delivery zone.');
    } finally {
      setSubmitting(false);
    }
  };

  // Conmutador en línea: surte efecto al instante (el backend rechaza pedidos nuevos a una
  // zona que no esté `active`), por eso se actualiza la fila sin esperar a recargar todo.
  const handleStatusChange = async (zone: DeliveryZone, status: DeliveryZoneStatus) => {
    if (status === zone.status) return;
    setBusyId(zone.id);
    try {
      const saved = await updateDeliveryZone(zone.id, { status });
      setZones((rows) =>
        rows.map((row) =>
          row.id === zone.id ? { ...row, status: saved.status, updated_at: saved.updated_at } : row,
        ),
      );
      setToast({
        message:
          status === 'active'
            ? `${zone.name} is accepting delivery orders again`
            : `${zone.name} is ${ZONE_STATUS_META[status].label.toLowerCase()} — new orders are blocked`,
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Failed to change the zone status.',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (zone: DeliveryZone) => {
    if (!window.confirm(`Delete ${zoneCode(zone.id)} "${zone.name}"? Its fee schedules stop applying.`)) {
      return;
    }
    setBusyId(zone.id);
    try {
      await deleteDeliveryZone(zone.id);
      setToast({ message: `${zone.name} deleted`, type: 'success' });
      if (selectedId === zone.id) setSelectedId(null);
      await fetchZones();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Failed to delete the zone.',
        type: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  // ================= Geocerca =================

  const runLookup = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = lookup.trim();
    if (!query) return;
    setLookupBusy(true);
    setLookupError('');
    setLookupResult(null);
    try {
      let point: LatLng | null = parseLatLngPair(query);
      let label = point ? `${formatCoordinate(point.lat)}, ${formatCoordinate(point.lng)}` : '';
      if (!point) {
        const [hit] = await geocodeAddress(query);
        if (!hit) {
          setLookupError('Address not found. Try "latitude, longitude" instead.');
          return;
        }
        point = { lat: hit.lat, lng: hit.lng };
        label = hit.label;
      }
      const result = await locateDeliveryZone(point);
      setLookupResult({ ...result, label });
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : 'Failed to check that location.');
    } finally {
      setLookupBusy(false);
    }
  };

  // ================= Render =================

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => void fetchZones()}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors duration-200"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const kpis = [
    {
      id: 'active-zones',
      label: 'Total active zones',
      value: String(metrics.active),
      hint: `${metrics.total} zone${metrics.total === 1 ? '' : 's'} configured · ${metrics.byStatus.maintenance} in maintenance`,
      icon: 'map',
      accent: '#10b981',
    },
    {
      id: 'coverage',
      label: 'Geofenced coverage',
      value: coverage?.coverage_pct != null ? `${coverage.coverage_pct}%` : '—',
      hint: coverage
        ? coverage.delivery_orders
          ? `${coverage.matched_orders} of ${coverage.delivery_orders} delivery orders matched to a polygon`
          : 'No delivery orders yet'
        : 'Coverage unavailable',
      icon: 'radar',
      accent: '#ae001a',
    },
    {
      id: 'unassigned',
      label: 'Unassigned zones',
      value: String(metrics.unassigned),
      hint: metrics.unassigned
        ? `No boundary: ${unassignedZones.map((z) => z.name).join(', ')}`
        : 'Every zone has a boundary',
      icon: metrics.unassigned ? 'warning' : 'verified',
      accent: metrics.unassigned ? '#f59e0b' : '#10b981',
    },
  ];

  const openCreate = () => {
    setEditing(null);
    setFormError('');
    setDrawerOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              map
            </span>
            Delivery Zones
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Geographic coverage perimeters for delivery orders, and whether each one is taking orders.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            add_location_alt
          </span>
          New Zone
        </button>
      </div>

      {/* ---------- KPIs de cobertura (anclados arriba al hacer scroll) ----------
          -top-8/pt-8: el <main> tiene p-8 y el banner se ancla contra ese borde; el fondo del
          lienzo tapa las filas que pasan por detrás. */}
      <section
        aria-label="Delivery coverage metrics"
        data-testid="zone-kpis"
        className="sticky -top-8 z-10 -mt-2 pt-8 pb-2 bg-[#f1ece4] grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4"
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            data-testid={`kpi-${kpi.id}`}
            className="bg-white border border-[#e8e2d8] rounded shadow-sm p-5 flex items-center gap-4 border-l-4 hover:shadow-md transition-colors duration-200"
            style={{ borderLeftColor: kpi.accent }}
          >
            <span className="material-symbols-outlined text-3xl shrink-0" style={{ color: kpi.accent }} aria-hidden="true">
              {kpi.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">{kpi.label}</p>
              <p className="text-h2 font-bold font-poppins text-[#1d1c17] leading-tight">{loading ? '—' : kpi.value}</p>
              <p className="text-body-sm text-[#5f5e5e] truncate" title={kpi.hint}>
                {kpi.hint}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* ---------- Buscador y filtros ---------- */}
      <section
        aria-label="Zone filters"
        className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3"
      >
        <div className="relative flex-1 min-w-[260px]">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search zones by name or description…"
            aria-label="Search zones"
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-colors duration-200"
          />
        </div>
        {ZONE_STATUSES.map((status) => (
          <label
            key={status}
            className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[#e8e2d8] cursor-pointer hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
          >
            <input
              type="checkbox"
              checked={filters.statuses.includes(status)}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  statuses: e.target.checked
                    ? [...filters.statuses, status]
                    : filters.statuses.filter((s) => s !== status),
                })
              }
              className="accent-[#ae001a] w-3.5 h-3.5"
            />
            <span className="w-2 h-2 rounded-full" style={{ background: ZONE_STATUS_META[status].color }} aria-hidden="true" />
            <span className="text-[11px] font-bold font-poppins uppercase tracking-wider">{ZONE_STATUS_META[status].label}</span>
          </label>
        ))}
        {hasActiveZoneFilters(filters) ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_ZONE_FILTERS)}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
          >
            Clear Filters
          </button>
        ) : null}
      </section>

      {/* ---------- Tabla + mapa ---------- */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(440px,1fr))] gap-6 items-start">
        <section aria-label="Delivery zones" className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-[#ece8e0] rounded animate-pulse" />
              ))}
            </div>
          ) : zones.length === 0 ? (
            <div data-testid="zones-empty-state" className="p-16 flex flex-col items-center text-center gap-3">
              <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
                add_location_alt
              </span>
              <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
                No delivery zone yet. Draw the first perimeter — or generate one from a radius around the store.
              </p>
              <button type="button" onClick={openCreate} className="text-primary text-sm font-semibold hover:underline">
                Create a zone
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="p-12 flex flex-col items-center text-center gap-3">
              <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
                search_off
              </span>
              <p className="text-sm text-[#5f5e5e]">No zone matches these filters — {zones.length} configured.</p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_ZONE_FILTERS)}
                className="text-primary text-sm font-semibold hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
            <p
              data-testid="zone-status-hint"
              className="px-4 py-2 text-[11px] text-[#5f5e5e] bg-[#fef9f1] border-b border-[#f2ede5] flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">
                bolt
              </span>
              Switching a zone off (inactive or maintenance) blocks new delivery orders there immediately.
            </p>
            <ul className="divide-y divide-[#f2ede5]" data-testid="zone-list">
              {visible.map((zone) => {
                const geometry = zoneGeometry(zone);
                const busy = busyId === zone.id;
                const selected = selectedId === zone.id;
                return (
                  <li
                    key={zone.id}
                    data-testid={`zone-row-${zone.id}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => setSelectedId(selected ? null : zone.id)}
                    className={`group p-4 flex flex-col gap-2 cursor-pointer border-l-4 hover:bg-[#f8f3eb] hover:text-primary! transition-colors duration-200 ${
                      selected ? 'bg-[#f8f3eb]' : ''
                    }`}
                    style={{ borderLeftColor: ZONE_STATUS_META[zone.status]?.color }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-poppins uppercase tracking-wider bg-[#ece8e0] text-[#5f5e5e]">
                        {zoneCode(zone.id)}
                      </span>
                      <span className="font-semibold font-poppins text-[#1d1c17] group-hover:text-primary! transition-colors duration-200">
                        {zone.name}
                      </span>
                      <span
                        data-testid={`zone-status-${zone.id}`}
                        className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold font-poppins uppercase tracking-wider ${ZONE_STATUS_META[zone.status]?.pill}`}
                      >
                        {ZONE_STATUS_META[zone.status]?.label ?? zone.status}
                      </span>
                    </div>
                    {zone.description ? (
                      <p className="text-body-sm text-[#5f5e5e] line-clamp-2">{zone.description}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {zone.merchant?.name ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#222222] text-white font-bold uppercase tracking-wider">
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            storefront
                          </span>
                          {zone.merchant.name}
                        </span>
                      ) : null}
                      {geometry ? (
                        <span
                          data-testid={`zone-boundary-${zone.id}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#10b981]/15 text-[#047857] font-bold uppercase tracking-wider"
                        >
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            hexagon
                          </span>
                          Polygon defined · {vertexCount(geometry)} vertices
                        </span>
                      ) : (
                        <span
                          data-testid={`zone-boundary-${zone.id}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f59e0b]/15 text-[#92400e] font-bold uppercase tracking-wider"
                        >
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            warning
                          </span>
                          No boundary set
                        </span>
                      )}
                      <span className="text-[#5f5e5e]" title={`Updated ${formatTimestamp(zone.updated_at)}`}>
                        Created {formatTimestamp(zone.created_at)} · Updated {formatTimestamp(zone.updated_at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* Interruptor de un clic: active ⇄ inactive. El backend deja de aceptar
                          pedidos para la zona en el mismo instante en que deja de estar activa. */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={zone.status === 'active'}
                        aria-label={`Accepting orders in ${zone.name}`}
                        data-testid={`zone-switch-${zone.id}`}
                        disabled={busy}
                        title={
                          zone.status === 'active'
                            ? 'Switch off: new delivery orders for this zone are blocked immediately'
                            : 'Switch on: the zone starts accepting delivery orders again'
                        }
                        onClick={() => void handleStatusChange(zone, zone.status === 'active' ? 'inactive' : 'active')}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-bold font-poppins uppercase tracking-wider text-[#5f5e5e] hover:text-primary! transition-colors duration-200 disabled:opacity-50"
                      >
                        <span
                          aria-hidden="true"
                          className={`relative inline-block w-8 h-4 rounded-full transition-colors duration-200 ${
                            zone.status === 'active' ? 'bg-[#10b981]' : 'bg-[#64748b]'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200 ${
                              zone.status === 'active' ? 'left-4' : 'left-0.5'
                            }`}
                          />
                        </span>
                        {zone.status === 'active' ? 'Taking orders' : 'Orders blocked'}
                      </button>
                      <label className="sr-only" htmlFor={`zone-status-select-${zone.id}`}>
                        Status of {zone.name}
                      </label>
                      <select
                        id={`zone-status-select-${zone.id}`}
                        value={zone.status}
                        disabled={busy}
                        onChange={(e) => void handleStatusChange(zone, e.target.value as DeliveryZoneStatus)}
                        className="px-2 py-1 border border-[#e8e2d8] rounded text-[11px] font-bold font-poppins uppercase tracking-wider bg-white hover:border-[#ae001a] hover:text-primary! transition-colors duration-200 disabled:opacity-50"
                      >
                        {ZONE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ZONE_STATUS_META[s].label}
                          </option>
                        ))}
                      </select>
                      <span className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          className={chipButton}
                          onClick={() => {
                            setEditing(zone);
                            setFormError('');
                            setDrawerOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" disabled={busy} className={chipButton} onClick={() => void handleDelete(zone)}>
                          {busy ? '…' : 'Delete'}
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </section>

        <section aria-label="Coverage map" className="flex flex-col gap-4">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-sm p-4 flex flex-col gap-3">
            <ZoneMap
              ariaLabel="Delivery zones map"
              zones={visible}
              selectedZoneId={selectedId}
              onSelectZone={(id) => setSelectedId((current) => (current === id ? null : id))}
              marker={lookupResult ? { point: { lat: lookupResult.lat, lng: lookupResult.lng }, inside: lookupResult.covered } : null}
              fitKey={fitKey}
              height={420}
            />
            <div className="flex flex-wrap gap-3 text-[11px] text-[#5f5e5e]">
              {ZONE_STATUSES.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm" style={{ background: ZONE_STATUS_META[s].color }} aria-hidden="true" />
                  {ZONE_STATUS_META[s].label}
                </span>
              ))}
              <button type="button" onClick={() => setFitKey((k) => k + 1)} className="ml-auto font-bold uppercase tracking-wider hover:text-primary! transition-colors duration-200">
                Fit all zones
              </button>
            </div>
          </div>

          {/* ---------- Comprobador de geocerca ---------- */}
          <form
            onSubmit={(e) => void runLookup(e)}
            aria-label="Address geofencing check"
            className="bg-white border border-[#e8e2d8] rounded shadow-sm p-4 flex flex-col gap-3"
          >
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">
                my_location
              </span>
              Address geofencing check
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                placeholder="18.4662, -69.9384  or  an address"
                aria-label="Address or coordinates to check"
                className="flex-1 min-w-[220px] px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors duration-200"
              />
              <button
                type="submit"
                disabled={lookupBusy || !lookup.trim()}
                className="px-4 py-2 bg-[#222222] hover:bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 disabled:opacity-50"
              >
                {lookupBusy ? 'Checking…' : 'Check'}
              </button>
            </div>
            {lookupError ? (
              <p className="text-body-sm text-error" role="alert">
                {lookupError}
              </p>
            ) : null}
            {lookupResult ? (
              <div
                data-testid="lookup-result"
                role="status"
                className={`p-3 rounded border text-body-sm flex flex-col gap-1 ${
                  lookupResult.covered
                    ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#047857]'
                    : 'border-[#ae001a]/30 bg-[#ae001a]/5 text-[#ae001a]'
                }`}
              >
                <span className="font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    {lookupResult.covered ? 'where_to_vote' : 'wrong_location'}
                  </span>
                  {lookupResult.covered
                    ? `Inside ${lookupResult.zones.map((z) => `${zoneCode(z.id)} ${z.name}`).join(', ')}`
                    : 'Outside every active delivery zone'}
                </span>
                <span className="text-[#5f5e5e] font-poppins truncate" title={lookupResult.label}>
                  {lookupResult.label}
                  {lookupResult.label.startsWith(formatCoordinate(lookupResult.lat))
                    ? ''
                    : ` (${formatCoordinate(lookupResult.lat)}, ${formatCoordinate(lookupResult.lng)})`}
                </span>
                {lookupResult.blocked_zones.length ? (
                  <span className="text-[#92400e]" data-testid="lookup-blocked">
                    {lookupResult.covered ? 'Also inside' : 'Inside'}{' '}
                    {lookupResult.blocked_zones
                      .map((z) => `${zoneCode(z.id)} ${z.name} (${ZONE_STATUS_META[z.status]?.label ?? z.status})`)
                      .join(', ')}{' '}
                    — not accepting orders.
                  </span>
                ) : null}
              </div>
            ) : null}
          </form>
        </section>
      </div>

      {drawerOpen ? (
        <ZoneFormDrawer
          initial={editing ?? undefined}
          otherZones={zones.filter((z) => z.id !== editing?.id)}
          merchantName={merchantName}
          submitting={submitting}
          formError={formError}
          onCancel={() => {
            setDrawerOpen(false);
            setEditing(null);
          }}
          onSubmit={(draft) => void handleSubmit(draft)}
        />
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};

export default DeliveryZonesView;
