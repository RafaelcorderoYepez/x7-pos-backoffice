// Types of the delivery dashboard (`/api/delivery-assignment`).
//
// Mirror of the backend DTOs: delivery-assignment-response.dto.ts, query-…dto.ts and the
// `GET /delivery-assignment/summary` summary. The timestamps are set by the server.

export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export type AssignmentType = 'in_house' | 'doordash_drive' | 'uber_direct';

export type DspAssignmentType = Exclude<AssignmentType, 'in_house'>;

/** Subset of the order that the listing selects (order.id, order_number, address...). */
export interface AssignmentOrderRef {
  id: number;
  order_number?: string | null;
  delivery_address?: string | null;
  kitchen_status?: string | null;
  ready_at?: string | null;
}

/** Subset of the delivery person that the listing selects. */
export interface AssignmentDriverRef {
  id: number;
  name: string;
  phone?: string | null;
  status?: string;
  vehicleType?: string | null;
}

export interface DeliveryAssignment {
  id: number;
  order: AssignmentOrderRef;
  deliveryDriver: AssignmentDriverRef | null;
  assignment_type: AssignmentType;
  delivery_status: DeliveryStatus;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  external_delivery_id: string | null;
  external_tracking_url: string | null;
  external_dsp_fee: number | null;
  status: string;
}

export interface DeliveryAssignmentSummary {
  pending_dispatch: number;
  pending_assignments: number;
  in_transit: number;
  avg_completion_minutes: number | null;
  delayed: number;
  delay_threshold_minutes: number;
  live_assignments: number;
  in_house_share_pct: number | null;
  dsp_share_pct: number | null;
  dsp_fee_today: number;
}

export interface AssignmentFilters {
  statuses: DeliveryStatus[];
  types: AssignmentType[];
  search: string;
}

/** Delivery driver as returned by `GET /delivery-driver`. */
export interface AssignmentDriverOption {
  id: number;
  name: string;
  phone?: string | null;
  vehicleType?: string | null;
  status: string;
}

/** Delivery order ready in kitchen, from the `GET /orders` list (camelCase). */
export interface ReadyDeliveryOrder {
  id: number;
  orderNumber: string | null;
  deliveryAddress: string | null;
  kitchenStatus: string;
  businessStatus: string;
  total?: number;
  readyAt?: string | null;
}

/** Body of `POST /delivery-assignment`. */
export interface AssignmentCreateDraft {
  order: number;
  assignment_type: AssignmentType;
  deliveryDriver?: number;
  external_delivery_id?: string;
  external_tracking_url?: string;
  external_dsp_fee?: number;
}

/** Body of `PATCH /delivery-assignment/:id`. */
export interface AssignmentPatch {
  deliveryDriver?: number;
  delivery_status?: DeliveryStatus;
  external_delivery_id?: string;
  external_tracking_url?: string;
  external_dsp_fee?: number;
}
