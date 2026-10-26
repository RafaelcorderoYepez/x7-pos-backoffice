// Tipos del roster de repartidores (`/api/delivery-driver`).
//
// Espejo de x7-pos-back-end/src/commerce/delivery-system/delivery-driver: el comercio sale del
// JWT y `on_delivery` lo gestiona sólo el flujo de asignaciones (no es editable a mano).

export type VehicleType = 'car' | 'motorcycle' | 'bicycle' | 'e_scooter' | 'on_foot';

/** Estados vivos (los que lista el roster). `deleted` es el borrado suave. */
export type DriverStatus = 'active' | 'on_delivery' | 'off_duty' | 'inactive';

/** Lo que un administrador puede fijar desde el drawer. */
export type EditableDriverStatus = 'active' | 'inactive' | 'off_duty';

export interface DeliveryDriver {
  id: number;
  name: string;
  /** Normalizado por el backend para `tel:` (dígitos con `+` opcional). */
  phone: string;
  /** Las filas antiguas pueden traer texto libre no reconocido. */
  vehicleType: VehicleType | string;
  status: DriverStatus | string;
  created_at: string;
  merchant?: { id: number; name?: string } | null;
}

export interface DeliveryDriverDraft {
  name: string;
  phone: string;
  vehicleType: VehicleType;
  /** Se omite al editar un repartidor en reparto (el backend respondería 409). */
  status?: EditableDriverStatus;
}

export interface DriverSummary {
  total: number;
  available: number;
  en_route: number;
  unavailable: number;
}

export interface DriverQuery {
  statuses: DriverStatus[];
  /** '' = todos los vehículos. */
  vehicleType: VehicleType | '';
  search: string;
  page: number;
  limit: number;
}

export interface DriverPage {
  rows: DeliveryDriver[];
  total: number;
  page: number;
  totalPages: number;
}
