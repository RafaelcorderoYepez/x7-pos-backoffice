// Alta y edición de un repartidor.
//
// Mismos límites que CreateDeliveryDriverDto (nombre ≤100, teléfono ≤20 y 4-19 dígitos). El
// estado sólo ofrece active / inactive / off_duty: `on_delivery` lo pone el flujo de
// asignaciones, así que con el repartidor en reparto se muestra de sólo lectura y el cuerpo
// del PATCH no lleva `status` (el backend respondería 409).

import React, { useState } from 'react';
import type { DeliveryDriver, DeliveryDriverDraft, EditableDriverStatus, VehicleType } from '../../../../types/delivery-drivers';
import {
  DRIVER_NAME_MAX,
  DRIVER_PHONE_MAX,
  DRIVER_STATUS_META,
  EDITABLE_DRIVER_STATUSES,
  VEHICLE_META,
  VEHICLE_TYPES,
  driverCode,
  isVehicleType,
  validateDriverForm,
  type DriverFormValues,
} from '../../../../lib/delivery-drivers';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { SideDrawer } from '../../shared/SideDrawer';
import { ModalFormError, ModalFormFooter } from '../../shared/AppModal';

interface DriverFormDrawerProps {
  initial?: DeliveryDriver;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (draft: DeliveryDriverDraft) => void;
}

const fieldClass =
  'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md outline-none w-full font-poppins focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] hover:text-primary! transition-colors duration-200';
const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider flex items-center gap-1.5';

const initialStatus = (status: string | undefined): EditableDriverStatus =>
  (EDITABLE_DRIVER_STATUSES as string[]).includes(status ?? '') ? (status as EditableDriverStatus) : 'active';

export const DriverFormDrawer: React.FC<DriverFormDrawerProps> = ({
  initial,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const isEdit = Boolean(initial);
  const onDelivery = initial?.status === 'on_delivery';
  const [values, setValues] = useState<DriverFormValues>({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    vehicleType: initial && isVehicleType(initial.vehicleType) ? initial.vehicleType : '',
    status: initialStatus(initial?.status),
  });
  const [touched, setTouched] = useState<Partial<Record<keyof DriverFormValues, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  useModalDismiss(onCancel);

  const { errors, draft } = validateDriverForm(values, { lockStatus: onDelivery });
  const set = (patch: Partial<DriverFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const touch = (key: keyof DriverFormValues) => setTouched((t) => ({ ...t, [key]: true }));
  // Los límites de longitud se avisan en cuanto se superan; "obligatorio" tras salir del campo.
  const show = (key: keyof DriverFormValues) =>
    (submitted || touched[key] || (key === 'name' && values.name.trim().length > DRIVER_NAME_MAX) ||
      (key === 'phone' && values.phone.trim().length > DRIVER_PHONE_MAX)) && errors[key];

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!draft || submitting) return;
    onSubmit(draft);
  };

  const errorText = (key: keyof DriverFormValues) =>
    show(key) ? (
      <p className="text-body-sm text-error" role="alert" data-testid={`driver-${key}-error`}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <SideDrawer
      title={isEdit ? `Edit ${driverCode(initial!.id)}` : 'New driver'}
      subtitle={isEdit ? initial!.name : 'DELIVERY DRIVERS'}
      onClose={onCancel}
      closeDisabled={submitting}
      maxWidth={520}
    >
      <form noValidate onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 font-poppins">
        {formError ? <ModalFormError message={formError} /> : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="driver-name" className={labelClass}>
            <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">
              badge
            </span>
            Full name *
          </label>
          <input
            id="driver-name"
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            onBlur={() => touch('name')}
            placeholder="Mario Lopez"
            autoComplete="off"
            aria-invalid={Boolean(show('name'))}
            className={fieldClass}
          />
          {errorText('name') ?? (
            <p className="text-[11px] text-[#5f5e5e]">
              {values.name.trim().length}/{DRIVER_NAME_MAX}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="driver-phone" className={labelClass}>
            <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">
              call
            </span>
            Phone *
          </label>
          <input
            id="driver-phone"
            type="tel"
            value={values.phone}
            onChange={(e) => set({ phone: e.target.value })}
            onBlur={() => touch('phone')}
            placeholder="+1 (809) 555-1234"
            autoComplete="off"
            aria-invalid={Boolean(show('phone'))}
            className={fieldClass}
          />
          {errorText('phone') ?? (
            <p className="text-[11px] text-[#5f5e5e]">Unique per merchant. Spaces, dashes and parentheses are ignored.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="driver-vehicle" className={labelClass}>
            <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">
              pedal_bike
            </span>
            Vehicle type *
          </label>
          <select
            id="driver-vehicle"
            value={values.vehicleType}
            onChange={(e) => set({ vehicleType: e.target.value as VehicleType })}
            onBlur={() => touch('vehicleType')}
            aria-invalid={Boolean(show('vehicleType'))}
            className={fieldClass}
          >
            <option value="">Select a vehicle…</option>
            {VEHICLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {VEHICLE_META[v].label}
              </option>
            ))}
          </select>
          {errorText('vehicleType')}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="driver-status" className={labelClass}>
            <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">
              person_pin
            </span>
            Status
          </label>
          {onDelivery ? (
            <>
              <input
                id="driver-status"
                readOnly
                disabled
                value={DRIVER_STATUS_META.on_delivery.label}
                className={`${fieldClass} opacity-70 cursor-not-allowed`}
              />
              <p className="text-[11px] text-[#5f5e5e]">
                On a delivery — the status is managed by the assignment and unlocks when it finishes.
              </p>
            </>
          ) : (
            <>
              <select
                id="driver-status"
                value={values.status}
                onChange={(e) => set({ status: e.target.value as EditableDriverStatus })}
                className={fieldClass}
              >
                {EDITABLE_DRIVER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {DRIVER_STATUS_META[s].label}
                  </option>
                ))}
              </select>
              {errorText('status') ?? (
                <p className="text-[11px] text-[#5f5e5e]">Only Available drivers can receive new deliveries.</p>
              )}
            </>
          )}
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : isEdit ? 'Save driver' : 'Create driver'}
          isSubmitting={submitting}
          submitDisabled={Boolean(submitted && !draft)}
        />
      </form>
    </SideDrawer>
  );
};

export default DriverFormDrawer;
