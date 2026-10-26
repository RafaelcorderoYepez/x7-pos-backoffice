// Workspace de tarifas de reparto: KPIs de precio, aviso de zonas sin tarifa, matriz de
// tarifas y calculadora de checkout contra `POST /api/delivery-fee/quote`.
//
// Se hidrata con tarifas Y zonas: el desplegable del drawer necesita las zonas activas. Los
// KPIs salen de `GET /delivery-fee/summary` (con respaldo en cliente si no responde). Buscar y
// marcar estados filtra la lista ya cargada: no hay recargas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DeliveryFee,
  DeliveryFeeDraft,
  DeliveryFeeQuote,
  DeliveryFeeStatus,
  DeliveryFeeSummary,
  DeliveryZone,
} from '../../../../types/delivery';
import {
  EMPTY_FEE_FILTERS,
  FEE_STATUSES,
  FEE_STATUS_META,
  activeFeeForZone,
  computeFeeMetrics,
  feeCode,
  formatMoney,
  hasActiveFeeFilters,
  matchesFeeFilters,
  parseMoneyInput,
  resolveFeeMetrics,
  type FeeFilters,
} from '../../../../lib/delivery-fees';
import { ZONE_STATUS_META, formatTimestamp, zoneCode } from '../../../../lib/delivery-zones';
import {
  createDeliveryFee,
  deleteDeliveryFee,
  getDeliveryFeeSummary,
  listDeliveryFees,
  listDeliveryZones,
  quoteDeliveryFee,
  updateDeliveryFee,
} from '../../../../api/delivery';
import { ApiError } from '../../../../lib/api-error';
import { Toast, type ToastState } from '../../shared/Toast';
import { FeeFormDrawer } from './FeeFormDrawer';

interface DeliveryFeesViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

const chipButton =
  'px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-primary! transition-colors duration-200 disabled:opacity-40 cursor-pointer';
const inputClass =
  'px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 font-sans';

export const DeliveryFeesView: React.FC<DeliveryFeesViewProps> = ({ onNavigate }) => {
  const [fees, setFees] = useState<DeliveryFee[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [summary, setSummary] = useState<DeliveryFeeSummary | null>(null);
  const [filters, setFilters] = useState<FeeFilters>(EMPTY_FEE_FILTERS);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryFee | null>(null);
  const [presetZoneId, setPresetZoneId] = useState<number | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [quoteZoneId, setQuoteZoneId] = useState('');
  const [quoteSubtotal, setQuoteSubtotal] = useState('');
  const [quoteDistance, setQuoteDistance] = useState('');
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quote, setQuote] = useState<DeliveryFeeQuote | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // El summary no debe tumbar el workspace: si falla, los KPIs se calculan en cliente.
  const fetchSummary = useCallback(async () => {
    try {
      setSummary(await getDeliveryFeeSummary());
    } catch {
      setSummary(null);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [feeRows, zoneRows] = await Promise.all([listDeliveryFees(), listDeliveryZones()]);
      setFees(feeRows);
      setZones(zoneRows);
    } catch (err) {
      console.error('Error fetching delivery fees:', err);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load delivery fees. Please check if the backend is running.',
      );
    } finally {
      setLoading(false);
    }
    await fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetchAll();
    });
  }, [fetchAll]);

  const metrics = useMemo(
    () => resolveFeeMetrics(computeFeeMetrics(fees, zones), summary),
    [fees, zones, summary],
  );
  const visible = useMemo(() => fees.filter((f) => matchesFeeFilters(f, filters)), [fees, filters]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  // ================= Escritura =================

  const handleSubmit = async (draft: DeliveryFeeDraft) => {
    setSubmitting(true);
    setFormError('');
    try {
      if (editing) {
        await updateDeliveryFee(editing.id, draft);
      } else {
        await createDeliveryFee(draft);
      }
      setDrawerOpen(false);
      setToast({ message: editing ? `${feeCode(editing.id)} updated` : 'Fee schedule created', type: 'success' });
      setEditing(null);
      setPresetZoneId(undefined);
      await fetchAll();
    } catch (err) {
      console.error('Error saving the delivery fee:', err);
      setFormError(err instanceof ApiError ? err.message : 'Failed to save the delivery fee.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (fee: DeliveryFee) => {
    const next: DeliveryFeeStatus = fee.status === 'active' ? 'inactive' : 'active';
    if (next === 'active' && fee.deliveryZone) {
      const clash = activeFeeForZone(fees, fee.deliveryZone.id, fee.id);
      if (clash) {
        setToast({
          message: `${feeCode(clash.id)} is already active for ${fee.deliveryZone.name}. Deactivate it first.`,
          type: 'error',
        });
        return;
      }
    }
    setBusyId(fee.id);
    try {
      await updateDeliveryFee(fee.id, { status: next });
      setFees((rows) => rows.map((row) => (row.id === fee.id ? { ...row, status: next } : row)));
      setToast({ message: `${feeCode(fee.id)} ${next === 'active' ? 'activated' : 'deactivated'}`, type: 'success' });
      void fetchSummary();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Failed to change the fee status.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (fee: DeliveryFee) => {
    if (!window.confirm(`Delete ${feeCode(fee.id)} for ${fee.deliveryZone?.name ?? 'this zone'}?`)) return;
    setBusyId(fee.id);
    try {
      await deleteDeliveryFee(fee.id);
      setToast({ message: `${feeCode(fee.id)} deleted`, type: 'success' });
      await fetchAll();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Failed to delete the fee.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = (zoneId?: number) => {
    setEditing(null);
    setPresetZoneId(zoneId);
    setFormError('');
    setDrawerOpen(true);
  };

  // ================= Calculadora =================

  const runQuote = async (event: React.FormEvent) => {
    event.preventDefault();
    setQuote(null);
    setQuoteError('');
    const subtotal = parseMoneyInput(quoteSubtotal, 'Subtotal');
    if (!quoteZoneId) return setQuoteError('Pick a delivery zone');
    if (!subtotal.ok) return setQuoteError(subtotal.error);
    if (subtotal.value === null) return setQuoteError('Enter the order subtotal');
    const distance = quoteDistance.trim() ? Number(quoteDistance) : undefined;
    if (distance !== undefined && (!Number.isFinite(distance) || distance < 0)) {
      return setQuoteError('Distance must be a positive number of km');
    }
    setQuoteBusy(true);
    try {
      setQuote(await quoteDeliveryFee({ deliveryZoneId: Number(quoteZoneId), subtotal: subtotal.value, distanceKm: distance }));
    } catch (err) {
      setQuoteError(err instanceof ApiError ? err.message : 'Failed to quote the delivery fee.');
    } finally {
      setQuoteBusy(false);
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
          onClick={() => void fetchAll()}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors duration-200"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const lacking = metrics.zonesLackingFees;
  const kpis = [
    {
      id: 'average-base-fee',
      label: 'Average base fee',
      value: formatMoney(metrics.averageBaseFee),
      hint: 'across active fees of active zones',
      icon: 'attach_money',
      accent: '#ae001a',
    },
    {
      id: 'free-shipping-zones',
      label: 'Active free shipping zones',
      value: String(metrics.freeShippingZones),
      hint: 'zones with a free delivery threshold',
      icon: 'local_shipping',
      accent: '#10b981',
    },
    {
      id: 'zones-lacking-fees',
      label: 'Zones lacking fee rules',
      value: String(lacking.length),
      hint: lacking.length ? 'active zones that cannot price a delivery' : 'every active zone is priced',
      icon: lacking.length ? 'warning' : 'verified',
      accent: lacking.length ? '#f59e0b' : '#10b981',
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              payments
            </span>
            Delivery Fees
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            What each zone charges: base fee, distance rate, minimum order and free-delivery threshold.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            add
          </span>
          New Fee Schedule
        </button>
      </div>

      {/* ---------- KPIs de tarifas ---------- */}
      <section
        aria-label="Delivery fee metrics"
        data-testid="fee-kpis"
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
              <p className="text-body-sm text-[#5f5e5e] truncate">{kpi.hint}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ---------- Aviso de zonas sin tarifa ---------- */}
      {!loading && lacking.length ? (
        <section
          role="alert"
          data-testid="missing-fee-alert"
          className="border border-[#f59e0b]/60 bg-[#f59e0b]/10 rounded p-4 flex flex-col gap-3"
        >
          <p className="font-semibold text-[#92400e] flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              warning
            </span>
            {lacking.length} active zone{lacking.length === 1 ? ' has' : 's have'} no active fee — delivery orders there cannot be priced.
          </p>
          <div className="flex flex-wrap gap-2">
            {lacking.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => openCreate(zone.id)}
                aria-label={`Create a fee for ${zoneCode(zone.id)} ${zone.name}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#f59e0b] bg-white text-[11px] font-bold font-poppins uppercase tracking-wider text-[#92400e] hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  add
                </span>
                {zoneCode(zone.id)} {zone.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- Filtros ---------- */}
      <section
        aria-label="Fee filters"
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
            placeholder="Filter by zone name…"
            aria-label="Search fees by zone name"
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-colors duration-200"
          />
        </div>
        {FEE_STATUSES.map((status) => (
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
            <span className="text-[11px] font-bold uppercase tracking-wider">{FEE_STATUS_META[status].label}</span>
          </label>
        ))}
        {hasActiveFeeFilters(filters) ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FEE_FILTERS)}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
          >
            Clear Filters
          </button>
        ) : null}
      </section>

      {/* ---------- Matriz de tarifas ---------- */}
      <section aria-label="Delivery fee matrix" className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-[#ece8e0] rounded animate-pulse" />
            ))}
          </div>
        ) : fees.length === 0 ? (
          <div data-testid="fees-empty-state" className="p-16 flex flex-col items-center text-center gap-3">
            <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
              payments
            </span>
            <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
              {zones.length
                ? 'No fee schedule yet. Price your first zone to start taking delivery orders.'
                : 'Create a delivery zone first — fees are attached to zones.'}
            </p>
            {zones.length ? (
              <button type="button" onClick={() => openCreate()} className="text-primary text-sm font-semibold hover:underline">
                Create a fee schedule
              </button>
            ) : (
              <button type="button" onClick={() => onNavigate?.('delivery-zones')} className="text-primary text-sm font-semibold hover:underline">
                Go to Delivery Zones
              </button>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center gap-3">
            <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
              search_off
            </span>
            <p className="text-sm text-[#5f5e5e]">No fee matches these filters — {fees.length} configured.</p>
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="fee-table">
            <thead className="bg-[#f8f3eb] text-[11px] uppercase tracking-wider text-[#5f5e5e]">
              <tr>
                <th scope="col" className="text-left px-4 py-3">Fee &amp; zone</th>
                <th scope="col" className="text-left px-4 py-3">Base &amp; distance</th>
                <th scope="col" className="text-left px-4 py-3">Order thresholds</th>
                <th scope="col" className="text-left px-4 py-3">Status</th>
                <th scope="col" className="text-left px-4 py-3">Created</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2ede5]">
              {visible.map((fee) => {
                const zone = fee.deliveryZone ? zoneById.get(fee.deliveryZone.id) : undefined;
                const zoneStatus = zone?.status ?? fee.deliveryZone?.status;
                const busy = busyId === fee.id;
                return (
                  <tr key={fee.id} data-testid={`fee-row-${fee.id}`} className="group hover:bg-[#f8f3eb] hover:text-primary! transition-colors duration-200">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-poppins uppercase tracking-wider bg-[#ece8e0] text-[#5f5e5e] hover:text-primary! transition-colors duration-200">
                          {feeCode(fee.id)}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold font-poppins text-[#1d1c17] group-hover:text-primary! transition-colors duration-200">
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            map
                          </span>
                          {fee.deliveryZone?.name ?? 'Unknown zone'}
                        </span>
                        {zoneStatus && zoneStatus !== 'active' ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#92400e]">
                            zone {ZONE_STATUS_META[zoneStatus].label.toLowerCase()}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold font-poppins text-[#1d1c17] group-hover:text-primary! transition-colors duration-200">{formatMoney(fee.base_fee)}</span>
                      {fee.per_km_fee ? (
                        <span className="ml-2 inline-flex items-center gap-1 font-poppins text-[#5f5e5e]">
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            route
                          </span>
                          +{formatMoney(fee.per_km_fee)}/km
                        </span>
                      ) : (
                        <span className="ml-2 text-[#5f5e5e]">flat</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {fee.min_order_amount !== null ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-poppins uppercase tracking-wider bg-[#ece8e0] text-[#1d1c17] hover:text-primary! transition-colors duration-200">
                            Min: {formatMoney(fee.min_order_amount)}
                          </span>
                        ) : null}
                        {fee.free_above !== null ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-poppins uppercase tracking-wider bg-[#10b981]/15 text-[#047857] hover:text-primary! transition-colors duration-200">
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                              redeem
                            </span>
                            Free over {formatMoney(fee.free_above)}
                          </span>
                        ) : null}
                        {fee.min_order_amount === null && fee.free_above === null ? (
                          <span className="text-[#5f5e5e]">—</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggle(fee)}
                        aria-label={`${fee.status === 'active' ? 'Deactivate' : 'Activate'} ${feeCode(fee.id)}`}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-poppins uppercase tracking-wider hover:bg-white! hover:text-primary! hover:ring-1 hover:ring-[#ae001a] transition-colors duration-200 disabled:opacity-50 ${FEE_STATUS_META[fee.status].pill}`}
                      >
                        {FEE_STATUS_META[fee.status].label}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#5f5e5e]">{formatTimestamp(fee.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        className={chipButton}
                        onClick={() => {
                          setEditing(fee);
                          setPresetZoneId(undefined);
                          setFormError('');
                          setDrawerOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" disabled={busy} className={chipButton} onClick={() => void handleDelete(fee)}>
                        {busy ? '…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ---------- Calculadora de checkout ---------- */}
      <form
        onSubmit={(e) => void runQuote(e)}
        aria-label="Delivery fee calculator"
        className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-4"
      >
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">
            calculate
          </span>
          Checkout fee calculator
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 items-end">
          <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]">
            Zone
            <select value={quoteZoneId} onChange={(e) => setQuoteZoneId(e.target.value)} className={inputClass}>
              <option value="">Select a zone…</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zoneCode(zone.id)} · {zone.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]">
            Order subtotal ($)
            <input inputMode="decimal" value={quoteSubtotal} onChange={(e) => setQuoteSubtotal(e.target.value)} placeholder="24.50" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]">
            Distance (km)
            <input inputMode="decimal" value={quoteDistance} onChange={(e) => setQuoteDistance(e.target.value)} placeholder="3.2" className={inputClass} />
          </label>
          <button
            type="submit"
            disabled={quoteBusy}
            className="px-4 py-2 bg-[#222222] hover:bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 disabled:opacity-50"
          >
            {quoteBusy ? 'Calculating…' : 'Calculate fee'}
          </button>
        </div>
        {quoteError ? (
          <p className="text-body-sm text-error" role="alert">
            {quoteError}
          </p>
        ) : null}
        {quote ? (
          <div
            data-testid="quote-result"
            role="status"
            className={`p-3 rounded border text-body-sm flex flex-col gap-1 ${
              quote.eligible ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#047857]' : 'border-[#ae001a]/30 bg-[#ae001a]/5 text-[#ae001a]'
            }`}
          >
            <span className="font-semibold font-poppins text-base">
              {quote.eligible ? `Delivery fee: ${formatMoney(quote.fee)}` : 'Checkout blocked'}
            </span>
            {!quote.eligible && quote.shortfall > 0 ? (
              <span data-testid="quote-shortfall" className="font-poppins font-semibold">
                Missing {formatMoney(quote.shortfall)} to reach the {formatMoney(quote.min_order_amount)} minimum order
              </span>
            ) : null}
            {quote.eligible && quote.free_delivery ? (
              <span className="inline-flex items-center gap-1 font-poppins">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  redeem
                </span>
                Free delivery — subtotal reaches the {formatMoney(quote.free_above)} threshold
              </span>
            ) : null}
            <span>{quote.message}</span>
            {quote.eligible && !quote.free_delivery ? (
              <span className="text-[#5f5e5e] font-poppins">
                {formatMoney(quote.base_fee)} base
                {quote.distance_charge
                  ? ` + ${quote.distance_km} km × ${formatMoney(quote.per_km_fee)} = ${formatMoney(quote.distance_charge)}`
                  : ' · flat rate (no distance charge)'}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>

      {drawerOpen ? (
        <FeeFormDrawer
          initial={editing ?? undefined}
          initialZoneId={presetZoneId}
          zones={zones}
          fees={fees}
          submitting={submitting}
          formError={formError}
          onCancel={() => {
            setDrawerOpen(false);
            setEditing(null);
            setPresetZoneId(undefined);
          }}
          onSubmit={(draft) => void handleSubmit(draft)}
        />
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};

export default DeliveryFeesView;
