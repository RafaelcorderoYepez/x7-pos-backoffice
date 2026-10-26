// Alta y edición de una tarifa de reparto.
//
// Sólo toca la tarifa: la zona (y su perímetro) no cambia desde aquí. Los importes se
// normalizan a 2 decimales al salir del campo y se rechaza un tercer decimal en vez de
// redondearlo en silencio. Las dos reglas de consistencia (free_above > pedido mínimo, una
// sola tarifa activa por zona) las vuelve a aplicar el servidor con 400/409.

import React, { useMemo, useState } from 'react';
import type { DeliveryFee, DeliveryFeeDraft, DeliveryFeeStatus, DeliveryZone } from '../../../../types/delivery';
import {
  FEE_STATUSES,
  FEE_STATUS_META,
  computeDeliveryFee,
  feeCode,
  formatMoney,
  formatMoneyInput,
  moneyInputValue,
  validateFeeForm,
  type FeeFormValues,
} from '../../../../lib/delivery-fees';
import { ZONE_STATUS_META, zoneCode } from '../../../../lib/delivery-zones';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { SideDrawer } from '../../shared/SideDrawer';
import { ModalFormError, ModalFormFooter } from '../../shared/AppModal';

interface FeeFormDrawerProps {
  initial?: DeliveryFee;
  initialZoneId?: number;
  zones: DeliveryZone[];
  fees: DeliveryFee[];
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (draft: DeliveryFeeDraft) => void;
}

const fieldClass =
  'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md outline-none w-full font-poppins focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] hover:text-primary! transition-colors duration-200';
const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider flex items-center gap-1.5';

// Ejemplo fijo de la vista previa: un pedido de 25 a 3 km.
const PREVIEW_SUBTOTAL = 25;
const PREVIEW_DISTANCE_KM = 3;

export const FeeFormDrawer: React.FC<FeeFormDrawerProps> = ({
  initial,
  initialZoneId,
  zones,
  fees,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const isEdit = Boolean(initial);
  const [values, setValues] = useState<FeeFormValues>({
    zoneId: String(initial?.deliveryZone?.id ?? initialZoneId ?? ''),
    baseFee: moneyInputValue(initial?.base_fee),
    perKmFee: moneyInputValue(initial?.per_km_fee),
    minOrder: moneyInputValue(initial?.min_order_amount),
    freeAbove: moneyInputValue(initial?.free_above),
    status: initial?.status ?? 'active',
  });
  const [touched, setTouched] = useState(false);

  useModalDismiss(onCancel);

  // La historia pide listar las zonas ACTIVAS; al editar se conserva la zona actual aunque
  // ya no lo esté, o el select se quedaría sin su valor.
  const zoneOptions = useMemo(
    () =>
      zones.filter(
        (z) => z.status === 'active' || String(z.id) === values.zoneId || z.id === initial?.deliveryZone?.id,
      ),
    [zones, values.zoneId, initial],
  );

  const { errors, parsed } = validateFeeForm(values, { fees, editingId: initial?.id });
  const blocked = !parsed || submitting;
  const set = (patch: Partial<FeeFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const show = (key: keyof FeeFormValues) => (touched || key === 'status' || key === 'freeAbove') && errors[key];

  const preview = parsed
    ? computeDeliveryFee(parsed, PREVIEW_SUBTOTAL, PREVIEW_DISTANCE_KM)
    : null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (blocked || !parsed) return;
    onSubmit(parsed);
  };

  const moneyField = (
    key: 'baseFee' | 'perKmFee' | 'minOrder' | 'freeAbove',
    label: string,
    icon: string,
    placeholder: string,
    hint: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`fee-${key}`} className={labelClass}>
        <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">
          {icon}
        </span>
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-sm" aria-hidden="true">
          $
        </span>
        <input
          id={`fee-${key}`}
          inputMode="decimal"
          value={values[key]}
          onChange={(e) => set({ [key]: e.target.value })}
          onBlur={(e) => set({ [key]: formatMoneyInput(e.target.value) })}
          placeholder={placeholder}
          aria-invalid={Boolean(show(key))}
          className={`${fieldClass} pl-7`}
        />
      </div>
      {show(key) ? (
        <p className="text-body-sm text-error" role="alert">
          {errors[key]}
        </p>
      ) : (
        <p className="text-[11px] text-[#5f5e5e]">{hint}</p>
      )}
    </div>
  );

  return (
    <SideDrawer
      title={isEdit ? `Edit ${feeCode(initial!.id)}` : 'New fee schedule'}
      subtitle={isEdit ? initial?.deliveryZone?.name ?? 'DELIVERY FEES' : 'DELIVERY FEES'}
      onClose={onCancel}
      closeDisabled={submitting}
      maxWidth={560}
    >
      <form noValidate onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 font-sans">
        {formError ? <ModalFormError message={formError} /> : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fee-zone" className={labelClass}>
            <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">
              map
            </span>
            Delivery zone *
          </label>
          <select
            id="fee-zone"
            value={values.zoneId}
            onChange={(e) => set({ zoneId: e.target.value })}
            aria-invalid={Boolean(show('zoneId'))}
            className={fieldClass}
          >
            <option value="">{zoneOptions.length ? 'Select a zone…' : 'No active zone — create one first'}</option>
            {zoneOptions.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zoneCode(zone.id)} · {zone.name}
                {zone.status !== 'active' ? ` (${ZONE_STATUS_META[zone.status].label})` : ''}
              </option>
            ))}
          </select>
          {show('zoneId') ? (
            <p className="text-body-sm text-error" role="alert">
              {errors.zoneId}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {moneyField('baseFee', 'Base fee *', 'payments', '5.99', 'Charged on every delivery in the zone')}
          {moneyField('perKmFee', 'Per km rate', 'straighten', '1.50', 'Optional — empty or 0 = flat base fee')}
          {moneyField('minOrder', 'Minimum order', 'shopping_cart', '10.99', 'Optional — below this, delivery is refused')}
          {moneyField('freeAbove', 'Free above', 'redeem', '50.00', 'Optional — must be above the minimum order')}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fee-status" className={labelClass}>
            Status
          </label>
          <select
            id="fee-status"
            value={values.status}
            onChange={(e) => set({ status: e.target.value as DeliveryFeeStatus })}
            aria-invalid={Boolean(show('status'))}
            className={fieldClass}
          >
            {FEE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FEE_STATUS_META[s].label}
              </option>
            ))}
          </select>
          {show('status') ? (
            <p className="text-body-sm text-error" role="alert" data-testid="single-active-error">
              {errors.status}
            </p>
          ) : (
            <p className="text-[11px] text-[#5f5e5e]">Only one active fee schedule is allowed per zone.</p>
          )}
        </div>

        {/* ---------- Vista previa del cálculo ---------- */}
        <div
          data-testid="fee-preview"
          className="p-3 rounded border border-[#e8e2d8] bg-[#fef9f1] text-body-sm text-[#1d1c17] flex items-start gap-2"
        >
          <span className="material-symbols-outlined text-base text-primary shrink-0" aria-hidden="true">
            calculate
          </span>
          {preview ? (
            <span>
              A {formatMoney(PREVIEW_SUBTOTAL)} order at {PREVIEW_DISTANCE_KM} km{' '}
              {!preview.eligible
                ? `is refused — ${formatMoney(preview.shortfall)} short of the minimum order.`
                : preview.free_delivery
                  ? 'ships free.'
                  : `pays ${formatMoney(preview.fee)} delivery${
                      preview.distance_charge ? ` (${formatMoney(parsed!.base_fee)} + ${formatMoney(preview.distance_charge)} distance)` : ''
                    }.`}
            </span>
          ) : (
            <span className="text-[#5f5e5e]">Fill in the fee to preview what a customer pays.</span>
          )}
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : isEdit ? 'Save fee' : 'Create fee'}
          isSubmitting={submitting}
          submitDisabled={Boolean(touched && !parsed)}
        />
      </form>
    </SideDrawer>
  );
};

export default FeeFormDrawer;
