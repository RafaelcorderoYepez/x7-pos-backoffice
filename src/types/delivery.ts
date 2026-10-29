// Types of epic Delivery Management (zones and rates).
//
// Coordinates in GeoJSON order: [longitude, latitude]. Leaflet works backwards ([lat, lng]);
// the conversion lives in src/lib/delivery-zones.ts and nowhere else.

export type DeliveryZoneStatus = 'active' | 'inactive' | 'maintenance';
export type DeliveryFeeStatus = 'active' | 'inactive';

export type Position = [number, number];
export type LinearRing = Position[];

export interface ZonePolygon {
  type: 'Polygon';
  coordinates: LinearRing[];
}

export interface ZoneMultiPolygon {
  type: 'MultiPolygon';
  coordinates: LinearRing[][];
}

export type ZoneGeometry = ZonePolygon | ZoneMultiPolygon;

export interface DeliveryZone {
  id: number;
  name: string;
  description: string | null;
  /** What the API returns: Typically an object; old rows can bring a chain. */
  geojson: ZoneGeometry | string | null;
  status: DeliveryZoneStatus;
  created_at: string;
  updated_at: string;
  /** Eager relationship: listing brings only {id, name}; the detail, the complete trade. */
  merchant?: { id: number; name: string } | null;
}

export interface DeliveryZoneDraft {
  name: string;
  description: string | null;
  geojson: ZoneGeometry | null;
  status: DeliveryZoneStatus;
}

export interface DeliveryFee {
  id: number;
  deliveryZone: { id: number; name: string; status?: DeliveryZoneStatus } | null;
  base_fee: number;
  per_km_fee: number | null;
  min_order_amount: number | null;
  free_above: number | null;
  status: DeliveryFeeStatus;
  created_at: string;
}

export interface DeliveryFeeDraft {
  deliveryZone: number;
  base_fee: number;
  per_km_fee: number | null;
  min_order_amount: number | null;
  free_above: number | null;
  status: DeliveryFeeStatus;
}

export interface ZoneLocateMatch {
  id: number;
  name: string;
  status: DeliveryZoneStatus;
}

export interface ZoneLocateResult {
  lat: number;
  lng: number;
  covered: boolean;
  zones: ZoneLocateMatch[];
  blocked_zones: ZoneLocateMatch[];
}

export interface ZoneCoverage {
  delivery_orders: number;
  matched_orders: number;
  coverage_pct: number | null;
  /** Added later: an old backend may not send them. */
  active_zones?: number;
  zones_without_geojson?: number;
}

/** `GET /api/delivery-zone/radius-polygon`: circular template, does not save anything. */
export interface RadiusPolygonResult {
  center: { lat: number; lng: number };
  radius_km: number;
  vertex_count: number;
  geojson: ZonePolygon;
}

/** `GET /api/delivery-fee/summary`: KPIs of the fee workspace calculated on the server. */
export interface DeliveryFeeSummary {
  active_zones: number;
  active_fees: number;
  avg_base_fee: number | null;
  free_shipping_zones: number;
  zones_without_fee_count: number;
  zones_without_fee: Array<{ id: number; name: string }>;
}

export type FeeQuoteBlockReason =
  | 'zone_not_accepting_orders'
  | 'no_active_fee'
  | 'below_min_order';

export interface DeliveryFeeQuote {
  delivery_zone_id: number;
  zone_name: string;
  zone_status: DeliveryZoneStatus;
  delivery_fee_id: number | null;
  subtotal: number;
  eligible: boolean;
  shortfall: number;
  free_delivery: boolean;
  base_fee: number;
  per_km_fee: number;
  distance_km: number;
  distance_charge: number;
  fee: number;
  min_order_amount: number | null;
  free_above: number | null;
  reason: FeeQuoteBlockReason | null;
  message: string;
}
