// Drawer assignment registration (and dealer reassignment).
//
// Registration: delivery order ready in kitchen WITHOUT open assignment + fleet type.
//  - IN_HOUSE: dropdown only with `active` delivery drivers (GET /delivery-driver?status=active).
//  - DSP: "Request quote" / "Dispatch via provider" vs external-quote / external-dispatch
//    (today 503 → clear notice) and a manual section (external id, https URL, DSP cost) that creates
//    the assignment with POST /delivery-assignment.
// Reassignment: only the active delivery dropdown.

import React, { useEffect, useMemo, useState } from 'react';
import type {
  AssignmentCreateDraft,
  AssignmentDriverOption,
  AssignmentType,
  DeliveryAssignment,
  DspAssignmentType,
  ReadyDeliveryOrder,
} from '../../../../types/delivery-assignments';
import {
  ASSIGNMENT_TYPES,
  TYPE_META,
  assignmentCode,
  isDspType,
  isHttpsUrl,
  orderCode,
  vehicleIcon,
} from '../../../../lib/delivery-assignments';
import { formatMoney, formatMoneyInput, parseMoneyInput } from '../../../../lib/delivery-fees';
import {
  listActiveDrivers,
  listReadyDeliveryOrders,
  requestExternalDispatch,
  requestExternalQuote,
} from '../../../../api/delivery-assignments';
import { ApiError } from '../../../../lib/api-error';
import { SideDrawer } from '../../shared/SideDrawer';

export const PROVIDER_NOT_CONNECTED = 'Provider not connected yet — enter the dispatch details manually.';

interface AssignmentFormDrawerProps {
  /** With assignment: "reassign dealer" mode. */
  reassign?: DeliveryAssignment | null;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onCreate: (draft: AssignmentCreateDraft) => void;
  onReassign: (assignment: DeliveryAssignment, driverId: number) => void;
  /** The vendor created the assignment on its own (external-dispatch OK). */
  onDispatched: (assignment: DeliveryAssignment) => void;
}

const inputClass =
  'px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 font-sans';
const labelClass = 'flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]';
const secondaryButton =
  'inline-flex items-center gap-1.5 px-4 py-2 border border-[#e8e2d8] bg-white text-[11px] font-bold uppercase tracking-widest rounded text-[#1d1c17] hover:text-primary! hover:border-[#ae001a] transition-colors duration-200 disabled:opacity-50';

export const AssignmentFormDrawer: React.FC<AssignmentFormDrawerProps> = ({
  reassign,
  submitting,
  formError,
  onCancel,
  onCreate,
  onReassign,
  onDispatched,
}) => {
  const isReassign = !!reassign;
  const [orders, setOrders] = useState<ReadyDeliveryOrder[]>([]);
  const [drivers, setDrivers] = useState<AssignmentDriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [orderId, setOrderId] = useState('');
  const [type, setType] = useState<AssignmentType>('in_house');
  const [driverId, setDriverId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [dspFee, setDspFee] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [providerBusy, setProviderBusy] = useState(false);
  const [providerMessage, setProviderMessage] = useState<{ tone: 'warn' | 'error' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [orderRows, driverRows] = await Promise.all([
          isReassign ? Promise.resolve([]) : listReadyDeliveryOrders(),
          listActiveDrivers(),
        ]);
        if (!alive) return;
        setOrders(orderRows);
        setDrivers(driverRows);
      } catch (err) {
        if (alive) setLoadError(err instanceof ApiError ? err.message : 'Failed to load orders and drivers.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [isReassign]);

  const currentDriverId = reassign?.deliveryDriver?.id;
  const driverOptions = useMemo(
    () => drivers.filter((d) => d.status === 'active' && d.id !== currentDriverId),
    [drivers, currentDriverId],
  );

  const dsp = isDspType(type);

  const callProvider = async (kind: 'quote' | 'dispatch') => {
    setProviderMessage(null);
    if (!orderId) {
      setErrors({ order: 'Pick a delivery order first' });
      return;
    }
    setProviderBusy(true);
    try {
      if (kind === 'quote') {
        const quote = (await requestExternalQuote(Number(orderId), type as DspAssignmentType)) as { fee?: number } | undefined;
        setProviderMessage({
          tone: 'ok',
          text: quote?.fee !== undefined ? `Quote received: ${formatMoney(quote.fee)}` : 'Quote received.',
        });
        if (quote?.fee !== undefined) setDspFee(Number(quote.fee).toFixed(2));
      } else {
        const created = await requestExternalDispatch(Number(orderId), type as DspAssignmentType);
        onDispatched(created);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setProviderMessage({ tone: 'warn', text: PROVIDER_NOT_CONNECTED });
      } else {
        setProviderMessage({
          tone: 'error',
          text: err instanceof ApiError ? err.message : 'The provider request failed.',
        });
      }
    } finally {
      setProviderBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};

    if (isReassign && reassign) {
      if (!driverId) next.driver = 'Pick an active driver';
      setErrors(next);
      if (Object.keys(next).length) return;
      onReassign(reassign, Number(driverId));
      return;
    }

    if (!orderId) next.order = 'Pick a delivery order';
    const draft: AssignmentCreateDraft = { order: Number(orderId), assignment_type: type };
    if (!dsp) {
      if (driverId) draft.deliveryDriver = Number(driverId);
    } else {
      if (externalId.trim()) {
        if (externalId.trim().length > 255) next.externalId = 'External delivery id allows at most 255 characters';
        draft.external_delivery_id = externalId.trim();
      }
      if (trackingUrl.trim()) {
        if (!isHttpsUrl(trackingUrl)) next.trackingUrl = 'Tracking URL must be a valid https:// link';
        else draft.external_tracking_url = trackingUrl.trim();
      }
      const fee = parseMoneyInput(dspFee, 'DSP fee');
      if (!fee.ok) next.dspFee = fee.error;
      else if (fee.value !== null) draft.external_dsp_fee = fee.value;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    onCreate(draft);
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <span className="text-body-sm text-error normal-case tracking-normal font-normal" role="alert">
        {errors[key]}
      </span>
    ) : null;

  const driverSelect = (
    <label className={labelClass}>
      {isReassign ? 'New driver' : 'Driver'}
      <select
        value={driverId}
        onChange={(e) => setDriverId(e.target.value)}
        className={inputClass}
        disabled={loading}
        aria-label={isReassign ? 'New driver' : 'Driver'}
      >
        <option value="">{isReassign ? 'Select an active driver…' : 'Leave unassigned (pending)'}</option>
        {driverOptions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.vehicleType ? ` · ${d.vehicleType.replace('_', ' ')}` : ''}
          </option>
        ))}
      </select>
      {!loading && driverOptions.length === 0 ? (
        <span className="text-body-sm text-[#92400e] normal-case tracking-normal font-normal">
          No active driver available right now — drivers off duty, inactive or on a delivery are not listed.
        </span>
      ) : (
        <span className="text-body-sm text-[#5f5e5e] normal-case tracking-normal font-normal inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            {vehicleIcon(null)}
          </span>
          Only active drivers are listed.
        </span>
      )}
      {fieldError('driver')}
    </label>
  );

  return (
    <SideDrawer
      title={isReassign && reassign ? `Reassign driver ${assignmentCode(reassign.id)}` : 'New assignment'}
      subtitle={isReassign && reassign ? orderCode(reassign.order?.id) : 'Dispatch a delivery order'}
      onClose={onCancel}
      closeDisabled={submitting}
    >
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5" noValidate>
        {loadError ? (
          <p className="text-body-sm text-error" role="alert">
            {loadError}
          </p>
        ) : null}

        {isReassign ? (
          driverSelect
        ) : (
          <>
            <label className={labelClass}>
              Delivery order
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className={inputClass}
                disabled={loading}
                aria-label="Delivery order"
              >
                <option value="">{loading ? 'Loading ready orders…' : 'Select a kitchen-ready order…'}</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {orderCode(o.id)}
                    {o.orderNumber ? ` (No. ${o.orderNumber})` : ''} · {o.deliveryAddress || 'No address'}
                  </option>
                ))}
              </select>
              {!loading && orders.length === 0 ? (
                <span className="text-body-sm text-[#5f5e5e] normal-case tracking-normal font-normal" data-testid="no-ready-orders">
                  No kitchen-ready delivery order is waiting for dispatch.
                </span>
              ) : null}
              {fieldError('order')}
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1.5">Fulfillment type</legend>
              <div className="flex flex-wrap gap-2">
                {ASSIGNMENT_TYPES.map((t) => (
                  <label
                    key={t}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded border cursor-pointer hover:text-primary! hover:border-[#ae001a] transition-colors duration-200 ${
                      type === t ? 'border-[#ae001a] bg-[#ae001a]/5' : 'border-[#e8e2d8]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="assignment-type"
                      value={t}
                      checked={type === t}
                      onChange={() => {
                        setType(t);
                        setProviderMessage(null);
                        setErrors({});
                      }}
                      className="accent-[#ae001a]"
                    />
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      {TYPE_META[t].icon}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">{TYPE_META[t].label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {!dsp ? (
              driverSelect
            ) : (
              <>
                <section className="flex flex-col gap-3 p-4 rounded border border-[#e8e2d8] bg-[#f8f3eb]">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">
                      sync_alt
                    </span>
                    {TYPE_META[type].label} integration
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={secondaryButton} disabled={providerBusy} onClick={() => void callProvider('quote')}>
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        request_quote
                      </span>
                      Request quote
                    </button>
                    <button type="button" className={secondaryButton} disabled={providerBusy} onClick={() => void callProvider('dispatch')}>
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        local_shipping
                      </span>
                      Dispatch via provider
                    </button>
                  </div>
                  {providerMessage ? (
                    <p
                      role="alert"
                      data-testid="provider-message"
                      className={`text-body-sm p-2 rounded border ${
                        providerMessage.tone === 'warn'
                          ? 'border-[#f59e0b]/60 bg-[#f59e0b]/10 text-[#92400e]'
                          : providerMessage.tone === 'error'
                            ? 'border-[#ae001a]/30 bg-[#ae001a]/5 text-[#ae001a]'
                            : 'border-[#10b981]/40 bg-[#10b981]/10 text-[#047857]'
                      }`}
                    >
                      {providerMessage.text}
                    </p>
                  ) : null}
                </section>

                <section className="flex flex-col gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">Manual dispatch details</p>
                  <label className={labelClass}>
                    External delivery id
                    <input value={externalId} onChange={(e) => setExternalId(e.target.value)} className={inputClass} placeholder="a1b2c3d4-dsp" />
                    {fieldError('externalId')}
                  </label>
                  <label className={labelClass}>
                    Tracking URL
                    <input
                      type="url"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      className={inputClass}
                      placeholder="https://track.example.com/…"
                    />
                    {fieldError('trackingUrl')}
                  </label>
                  <label className={labelClass}>
                    DSP fee ($)
                    <input
                      inputMode="decimal"
                      value={dspFee}
                      onChange={(e) => setDspFee(e.target.value)}
                      onBlur={() => setDspFee((v) => formatMoneyInput(v))}
                      className={inputClass}
                      placeholder="6.50"
                    />
                    {fieldError('dspFee')}
                  </label>
                </section>
              </>
            )}
          </>
        )}

        {formError ? (
          <p className="text-body-sm text-error p-2 rounded border border-[#ae001a]/30 bg-[#ae001a]/5" role="alert" data-testid="form-error">
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-auto pt-4 border-t border-[#f2ede5]">
          <button type="button" onClick={onCancel} disabled={submitting} className={secondaryButton}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || loading}
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : isReassign ? 'Reassign driver' : 'Create assignment'}
          </button>
        </div>
      </form>
    </SideDrawer>
  );
};

export default AssignmentFormDrawer;
