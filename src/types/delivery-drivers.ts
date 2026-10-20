// Types of the delivery driver roster (`/api/delivery-driver`).
//
// Mirror of x7-pos-back-end/src/commerce/delivery-system/delivery-driver: commerce exits
// JWT and `on_delivery` is managed only by the assignment flow (not editable by hand).

export type VehicleType = 'car' | 'motorcycle' | 'bicycle' | 'e_scooter' | 'on_foot';

/** Living states (those listed on the roster). `deleted` is soft delete. */
export type DriverStatus = 'active' | 'on_delivery' | 'off_duty' | 'inactive';

/** What an administrator can set from the drawer. */
export type EditableDriverStatus = 'active' | 'inactive' | 'off_duty';

export interface DeliveryDriver {
  id: number;
  name: string;
  /** Normalized by the backend to `tel:` (digits with optional `+`). */
  phone: string;
  /** Old rows may contain unrecognized free text. */
  vehicleType: VehicleType | string;
  status: DriverStatus | string;
  created_at: string;
  merchant?: { id: number; name?: string } | null;
}

export interface DeliveryDriverDraft {
  name: string;
  phone: string;
  vehicleType: VehicleType;
  /** Ignored when editing a delivery driver in delivery (the backend would respond 409). */
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
  /** '' = all vehicles. */
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
