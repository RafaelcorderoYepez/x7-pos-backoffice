// Lógica pura del roster de repartidores: vocabulario de estados y vehículos, validación del
// formulario (mismos límites que CreateDeliveryDriverDto) y construcción de la query string.

import type {
  DeliveryDriver,
  DeliveryDriverDraft,
  DriverQuery,
  DriverStatus,
  EditableDriverStatus,
  VehicleType,
} from '../types/delivery-drivers';

export const DRIVER_NAME_MAX = 100;
export const DRIVER_PHONE_MAX = 20;
/** Igual que PHONE_PATTERN del backend, aplicado sobre el teléfono normalizado. */
export const DRIVER_PHONE_PATTERN = /^\+?[0-9]{4,19}$/;

export const DRIVER_STATUSES: DriverStatus[] = ['active', 'on_delivery', 'off_duty', 'inactive'];
export const EDITABLE_DRIVER_STATUSES: EditableDriverStatus[] = ['active', 'inactive', 'off_duty'];

export const DRIVER_STATUS_META: Record<DriverStatus, { label: string; color: string; icon: string }> = {
  active: { label: 'Available', color: '#10b981', icon: 'person_pin' },
  on_delivery: { label: 'En route', color: '#3b82f6', icon: 'two_wheeler' },
  off_duty: { label: 'Off shift', color: '#64748b', icon: 'bedtime' },
  inactive: { label: 'Suspended', color: '#ef4444', icon: 'block' },
};

export const VEHICLE_TYPES: VehicleType[] = ['car', 'motorcycle', 'bicycle', 'e_scooter', 'on_foot'];

export const VEHICLE_META: Record<VehicleType, { label: string; icon: string }> = {
  car: { label: 'Car', icon: 'directions_car' },
  motorcycle: { label: 'Motorcycle', icon: 'two_wheeler' },
  bicycle: { label: 'Bicycle', icon: 'pedal_bike' },
  e_scooter: { label: 'E-Scooter', icon: 'electric_scooter' },
  on_foot: { label: 'On Foot', icon: 'directions_walk' },
};

export const driverCode = (id: number): string => `#DRV-${id}`;

export const isDriverStatus = (value: string): value is DriverStatus =>
  (DRIVER_STATUSES as string[]).includes(value);

export const isVehicleType = (value: string): value is VehicleType =>
  (VEHICLE_TYPES as string[]).includes(value);

/** Estado desconocido → píldora neutra con el valor tal cual. */
export function statusMeta(status: string): { label: string; color: string; icon: string } {
  return isDriverStatus(status) ? DRIVER_STATUS_META[status] : { label: status, color: '#64748b', icon: 'help' };
}

/** Las filas antiguas pueden traer texto libre: se muestran tal cual con un icono genérico. */
export function vehicleMeta(vehicle: string): { label: string; icon: string } {
  return isVehicleType(vehicle) ? VEHICLE_META[vehicle] : { label: vehicle || 'Unknown', icon: 'local_shipping' };
}

/** Misma normalización que el backend: "+1 (809) 555-1234" → "+18095551234". */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/^\+/, '').replace(/[\s\-.()]/g, '');
}

// ================= Turno =================

/**
 * El interruptor rápido sólo alterna active ↔ off_duty. En reparto o suspendido el backend
 * responde 409, así que se deshabilita con el motivo como tooltip.
 */
export function shiftToggleState(driver: Pick<DeliveryDriver, 'status'>): {
  onShift: boolean;
  disabled: boolean;
  reason: string;
} {
  if (driver.status === 'on_delivery') {
    return { onShift: true, disabled: true, reason: 'On a delivery — the shift can be changed once it finishes' };
  }
  if (driver.status === 'inactive') {
    return { onShift: false, disabled: true, reason: 'Suspended — reactivate the driver from Edit first' };
  }
  const onShift = driver.status === 'active';
  return {
    onShift,
    disabled: false,
    reason: onShift ? 'On shift — click to set off shift' : 'Off shift — click to set available',
  };
}

// ================= Formulario =================

export interface DriverFormValues {
  name: string;
  phone: string;
  vehicleType: VehicleType | '';
  status: EditableDriverStatus;
}

export type DriverFormErrors = Partial<Record<keyof DriverFormValues, string>>;

export function validateDriverForm(
  values: DriverFormValues,
  options: { lockStatus?: boolean } = {},
): { errors: DriverFormErrors; draft: DeliveryDriverDraft | null } {
  const errors: DriverFormErrors = {};
  const name = values.name.trim();
  const phone = values.phone.trim();

  if (!name) errors.name = 'Name is required';
  else if (name.length > DRIVER_NAME_MAX) errors.name = `Name must be at most ${DRIVER_NAME_MAX} characters`;

  if (!phone) errors.phone = 'Phone is required';
  else if (phone.length > DRIVER_PHONE_MAX) errors.phone = `Phone must be at most ${DRIVER_PHONE_MAX} characters`;
  else if (!DRIVER_PHONE_PATTERN.test(normalizePhone(phone))) {
    errors.phone = 'Phone must contain 4-19 digits, optionally prefixed by +';
  }

  if (!values.vehicleType) errors.vehicleType = 'Pick a vehicle type';
  if (!options.lockStatus && !EDITABLE_DRIVER_STATUSES.includes(values.status)) {
    errors.status = 'Status must be Available, Off shift or Suspended';
  }

  if (Object.keys(errors).length) return { errors, draft: null };
  const draft: DeliveryDriverDraft = { name, phone, vehicleType: values.vehicleType as VehicleType };
  if (!options.lockStatus) draft.status = values.status;
  return { errors, draft };
}

// ================= Consulta =================

export const DRIVER_PAGE_SIZE = 25;
export const SEARCH_DEBOUNCE_MS = 300;

/** Query string del listado: status y vehicleType van separados por comas (el DTO lo acepta). */
export function buildDriverQuery(query: DriverQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  if (query.statuses.length) params.set('status', query.statuses.join(','));
  if (query.vehicleType) params.set('vehicleType', query.vehicleType);
  const search = query.search.trim();
  if (search) params.set('search', search.slice(0, 200));
  return params.toString();
}
