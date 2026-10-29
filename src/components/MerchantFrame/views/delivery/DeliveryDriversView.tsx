// Delivery drivers roster: fleet KPIs (`GET /api/delivery-driver/summary`), filters that go
// to the backend as query params (multiple status, vehicleType, search with debounce),
// table with click-to-call, quick shift switch (`PATCH /:id/shift`), registration/edit
// in drawer and soft erase with confirmation on the page.
//
// Real time: changes in fleet status and assignments reorder the list and
// KPIs (a delivery person goes to "En route" when accepting an order without anyone touching this view).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  DeliveryDriver,
  DeliveryDriverDraft,
  DriverPage,
  DriverStatus,
  DriverSummary,
  VehicleType,
} from '../../../../types/delivery-drivers';
import {
  DRIVER_PAGE_SIZE,
  DRIVER_STATUSES,
  DRIVER_STATUS_META,
  SEARCH_DEBOUNCE_MS,
  VEHICLE_META,
  VEHICLE_TYPES,
  driverCode,
  shiftToggleState,
  statusMeta,
  vehicleMeta,
} from '../../../../lib/delivery-drivers';
import { formatTimestamp } from '../../../../lib/delivery-zones';
import {
  createDeliveryDriver,
  deleteDeliveryDriver,
  getDriverSummary,
  listDeliveryDrivers,
  setDriverShift,
  updateDeliveryDriver,
} from '../../../../api/delivery-drivers';
import { ApiError } from '../../../../lib/api-error';
import { getAccessToken } from '../../../../lib/auth-storage';
import { connectDeliveryRealtime } from '../../../../lib/delivery-realtime';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { Toast, type ToastState } from '../../shared/Toast';
import { DriverFormDrawer } from './DriverFormDrawer';

interface DeliveryDriversViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

const chipButton =
  'px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-primary! transition-colors duration-200 disabled:opacity-40 cursor-pointer';
const inputClass =
  'px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] hover:text-primary! transition-colors duration-200 font-sans';

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

// ================= Deletion confirmation =================

const ConfirmDeleteDriver: React.FC<{
  driver: DeliveryDriver;
  submitting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ driver, submitting, error, onCancel, onConfirm }) => {
  useModalDismiss(onCancel);
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[10000] flex justify-center items-center p-4 font-sans">
      <div className="absolute inset-0" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete driver"
        className="relative bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-50 border border-red-100 text-[#ae001a]">
            <span className="material-symbols-outlined text-2xl" aria-hidden="true">
              delete
            </span>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-[#1d1c17]">Delete this driver?</p>
            <p className="text-sm text-[#5f5e5e] leading-relaxed">
              <span className="font-poppins font-semibold">{driverCode(driver.id)}</span>{' '}
              <span className="font-poppins">{driver.name}</span> will be removed from the roster and can no longer
              receive deliveries. Past assignments keep their history.
            </p>
          </div>
        </div>
        {error ? (
          <p className="mt-4 p-3 border border-error/30 bg-red-50 rounded text-body-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary! hover:bg-[#f2ede5] transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200"
          >
            {submitting ? 'Deleting…' : 'Delete driver'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ================= Vista =================

export const DeliveryDriversView: React.FC<DeliveryDriversViewProps> = () => {
  const [statuses, setStatuses] = useState<DriverStatus[]>([]);
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [result, setResult] = useState<DriverPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DriverSummary | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryDriver | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirming, setConfirming] = useState<DeliveryDriver | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const requestSeq = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Real-time search: a request when you stop typing, not one per key.
  useEffect(() => {
    if (searchInput.trim() === search) return;
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getDriverSummary());
    } catch (err) {
      console.error('Error fetching the fleet summary:', err);
    }
  }, []);

  const loadDrivers = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const next = await listDeliveryDrivers({ statuses, vehicleType, search, page, limit: DRIVER_PAGE_SIZE });
      if (seq !== requestSeq.current) return; // response from an already obsolete filter
      setResult(next);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error('Error fetching delivery drivers:', err);
      setError(errorMessage(err, 'Failed to load delivery drivers. Please check if the backend is running.'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
    // reloadKey forces a reload with the same filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, vehicleType, search, page, reloadKey]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadDrivers();
    });
  }, [loadDrivers]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadSummary();
    });
  }, [loadSummary]);

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1);
    void loadSummary();
  }, [loadSummary]);

  // ================= Tiempo real =================

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const connection = connectDeliveryRealtime(token, {
      onDriverStatusChanged: () => refreshRef.current(),
      onAssignmentChanged: () => refreshRef.current(),
      onReconnect: () => refreshRef.current(),
    });
    return () => connection.close();
  }, []);

  // ================= Escritura =================

  const handleSubmit = async (draft: DeliveryDriverDraft) => {
    setSubmitting(true);
    setFormError('');
    try {
      if (editing) await updateDeliveryDriver(editing.id, draft);
      else await createDeliveryDriver(draft);
      setDrawerOpen(false);
      setToast({ message: editing ? `${driverCode(editing.id)} updated` : 'Driver added to the roster', type: 'success' });
      setEditing(null);
      refresh();
    } catch (err) {
      console.error('Error saving the delivery driver:', err);
      setFormError(errorMessage(err, 'Failed to save the delivery driver.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleShift = async (driver: DeliveryDriver) => {
    const state = shiftToggleState(driver);
    if (state.disabled) return;
    setBusyId(driver.id);
    try {
      await setDriverShift(driver.id, !state.onShift);
      setToast({
        message: `${driver.name} is now ${state.onShift ? 'off shift' : 'available'}`,
        type: 'success',
      });
      refresh();
    } catch (err) {
      setToast({ message: errorMessage(err, 'Failed to change the driver shift.'), type: 'error' });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirming) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteDeliveryDriver(confirming.id);
      setToast({ message: `${driverCode(confirming.id)} deleted`, type: 'success' });
      setConfirming(null);
      refresh();
    } catch (err) {
      setDeleteError(errorMessage(err, 'Failed to delete the driver.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const openDrawer = (driver: DeliveryDriver | null) => {
    setEditing(driver);
    setFormError('');
    setDrawerOpen(true);
  };

  const toggleStatus = (status: DriverStatus, checked: boolean) => {
    setStatuses((prev) => (checked ? [...prev, status] : prev.filter((s) => s !== status)));
    setPage(1);
  };

  const filtersActive = statuses.length > 0 || vehicleType !== '' || searchInput.trim() !== '';
  const clearFilters = () => {
    setStatuses([]);
    setVehicleType('');
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  // ================= Render =================

  const kpis = [
    {
      id: 'total',
      label: 'Total registered drivers',
      value: summary?.total,
      hint: 'every driver on the roster',
      icon: 'groups',
      accent: '#ae001a',
    },
    {
      id: 'available',
      label: 'Available couriers',
      value: summary?.available,
      hint: 'on shift and ready to assign',
      icon: 'person_pin',
      accent: DRIVER_STATUS_META.active.color,
    },
    {
      id: 'en-route',
      label: 'Couriers en route',
      value: summary?.en_route,
      hint: 'carrying a delivery right now',
      icon: 'two_wheeler',
      accent: DRIVER_STATUS_META.on_delivery.color,
    },
    {
      id: 'unavailable',
      label: 'Off-duty / inactive',
      value: summary?.unavailable,
      hint: 'off shift or suspended',
      icon: 'bedtime',
      accent: DRIVER_STATUS_META.off_duty.color,
    },
  ];

  const rows = result?.rows ?? [];
  const initialLoading = loading && !result;

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              two_wheeler
            </span>
            Delivery Drivers
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Your courier fleet: who is available, who is en route and who is off shift.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openDrawer(null)}
          className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            person_add
          </span>
          Add Driver
        </button>
      </div>

      {/* ---------- Fleet KPIs ---------- */}
      <section
        aria-label="Fleet metrics"
        data-testid="driver-kpis"
        className="sticky -top-8 z-10 -mt-2 pt-8 pb-2 bg-[#f1ece4] grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4"
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
              <p className="text-h2 font-bold text-[#1d1c17] leading-tight">{kpi.value ?? '—'}</p>
              <p className="text-body-sm text-[#5f5e5e] truncate">{kpi.hint}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ---------- Filtros ---------- */}
      <section
        aria-label="Driver filters"
        className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3"
      >
        <div className="relative flex-1 min-w-[240px]">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or phone…"
            aria-label="Search drivers by name or phone"
            maxLength={200}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] outline-none text-sm transition-colors duration-200"
          />
        </div>
        <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]">
          <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">
            directions_car
          </span>
          Vehicle
          <select
            aria-label="Vehicle type"
            value={vehicleType}
            onChange={(e) => {
              setVehicleType(e.target.value as VehicleType | '');
              setPage(1);
            }}
            className={inputClass}
          >
            <option value="">All vehicles</option>
            {VEHICLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {VEHICLE_META[v].label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Status</legend>
          {DRIVER_STATUSES.map((status) => (
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
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DRIVER_STATUS_META[status].color }} aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">{DRIVER_STATUS_META[status].label}</span>
            </label>
          ))}
        </fieldset>
        {filtersActive ? (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
          >
            Clear Filters
          </button>
        ) : null}
      </section>

      {/* ---------- Roster ---------- */}
      <section
        aria-label="Driver roster"
        aria-busy={loading}
        className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-x-auto"
      >
        {error ? (
          <div data-testid="drivers-error" className="m-6 border border-red-300 bg-red-50 p-8 text-center font-sans">
            <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
              error
            </span>
            <p className="mt-3 text-red-700 font-medium">{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors duration-200"
            >
              Retry Connection
            </button>
          </div>
        ) : initialLoading ? (
          <div className="p-6 flex flex-col gap-3" data-testid="drivers-loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-[#ece8e0] rounded animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          filtersActive ? (
            <div data-testid="drivers-no-match" className="p-12 flex flex-col items-center text-center gap-3">
              <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
                search_off
              </span>
              <p className="text-sm text-[#5f5e5e]">No driver matches these filters.</p>
            </div>
          ) : (
            <div data-testid="drivers-empty-state" className="p-16 flex flex-col items-center text-center gap-3">
              <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
                two_wheeler
              </span>
              <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
                No drivers yet. Register your first courier to start assigning deliveries.
              </p>
              <button type="button" onClick={() => openDrawer(null)} className="text-primary text-sm font-semibold hover:underline">
                Add a driver
              </button>
            </div>
          )
        ) : (
          <>
            <table className={`w-full text-sm transition-opacity ${loading ? 'opacity-60' : ''}`} data-testid="driver-table">
              <thead className="bg-[#f8f3eb] text-[11px] uppercase tracking-wider text-[#5f5e5e]">
                <tr>
                  <th scope="col" className="text-left px-3 py-3">Driver</th>
                  <th scope="col" className="text-left px-3 py-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        phone
                      </span>
                      Contact
                    </span>
                  </th>
                  <th scope="col" className="text-left px-3 py-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        electric_scooter
                      </span>
                      Vehicle
                    </span>
                  </th>
                  <th scope="col" className="text-left px-3 py-3">Merchant</th>
                  <th scope="col" className="text-left px-3 py-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        badge
                      </span>
                      Status
                    </span>
                  </th>
                  <th scope="col" className="text-left px-3 py-3">Shift</th>
                  <th scope="col" className="text-left px-3 py-3">Created</th>
                  <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2ede5]">
                {rows.map((driver) => {
                  const meta = statusMeta(driver.status);
                  const vehicle = vehicleMeta(driver.vehicleType);
                  const shift = shiftToggleState(driver);
                  const busy = busyId === driver.id;
                  return (
                    <tr
                      key={driver.id}
                      data-testid={`driver-row-${driver.id}`}
                      className="group hover:bg-[#f8f3eb] hover:text-primary! transition-colors duration-200"
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ece8e0] text-[#5f5e5e] font-poppins">
                            {driverCode(driver.id)}
                          </span>
                          <span className="font-semibold text-[#1d1c17] font-poppins group-hover:text-primary! transition-colors duration-200">
                            {driver.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <a
                            href={`tel:${driver.phone}`}
                            aria-label={`Call ${driver.name}`}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[#e8e2d8] text-[#5f5e5e] hover:text-primary! hover:border-[#ae001a] transition-colors duration-200"
                          >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                              call
                            </span>
                          </a>
                          <span className="font-poppins text-[#1d1c17] select-all" data-testid={`driver-phone-${driver.id}`}>
                            {driver.phone}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ece8e0] text-[#1d1c17]">
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            {vehicle.icon}
                          </span>
                          {vehicle.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {/* Shortened: the name of the place can be long and pushed the actions outside. */}
                        <span
                          title={driver.merchant?.name ?? undefined}
                          className="inline-flex max-w-[11rem] items-center gap-1 px-2 py-0.5 rounded border border-[#e8e2d8] text-[11px] text-[#5f5e5e]"
                        >
                          <span className="material-symbols-outlined text-sm shrink-0" aria-hidden="true">
                            storefront
                          </span>
                          <span className="truncate">{driver.merchant?.name ?? '—'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          data-testid={`driver-status-${driver.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white font-poppins bg-[var(--pill)] ring-1 ring-[var(--pill)] hover:bg-white! hover:text-primary! transition-colors duration-200"
                          style={{ '--pill': meta.color } as React.CSSProperties}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span title={shift.reason} className="inline-flex">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={shift.onShift}
                            aria-label={`Shift for ${driver.name}`}
                            title={shift.reason}
                            disabled={shift.disabled || busy}
                            onClick={() => void handleShift(driver)}
                            className="group/shift inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-primary! transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span
                              className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                                shift.onShift ? 'bg-[#10b981]' : 'bg-[#cbd5e1]'
                              }`}
                              aria-hidden="true"
                            >
                              <span
                                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                                  shift.onShift ? 'left-[18px]' : 'left-0.5'
                                }`}
                              />
                            </span>
                            {/* Status pill indicates active shift: accessible text only here. */}
                            <span className="sr-only">{busy ? 'Updating…' : shift.onShift ? 'On shift' : 'Off shift'}</span>
                          </button>
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-[#5f5e5e]" title={formatTimestamp(driver.created_at)}>
                        {driver.created_at
                          ? new Date(driver.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          className={chipButton}
                          aria-label={`Edit ${driverCode(driver.id)}`}
                          onClick={() => openDrawer(driver)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={chipButton}
                          aria-label={`Delete ${driverCode(driver.id)}`}
                          onClick={() => {
                            setDeleteError('');
                            setConfirming(driver);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {result && result.totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#f2ede5] text-[11px] text-[#5f5e5e]">
                <span>
                  Page {result.page} of {result.totalPages} · {result.total} drivers
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={chipButton}
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={chipButton}
                    disabled={page >= result.totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </span>
              </div>
            ) : null}
          </>
        )}
      </section>

      {drawerOpen ? (
        <DriverFormDrawer
          initial={editing ?? undefined}
          submitting={submitting}
          formError={formError}
          onCancel={() => {
            setDrawerOpen(false);
            setEditing(null);
          }}
          onSubmit={(draft) => void handleSubmit(draft)}
        />
      ) : null}

      {confirming ? (
        <ConfirmDeleteDriver
          driver={confirming}
          submitting={deleteBusy}
          error={deleteError}
          onCancel={() => {
            if (!deleteBusy) setConfirming(null);
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};

export default DeliveryDriversView;
