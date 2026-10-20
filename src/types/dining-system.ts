// Dining System domain types (floor plans, zones and tables).
// The properties mix snake_case and camelCase on purpose: they reflect as is the
// actual backend contract (/api/floor-plan, /api/floor-zone, /api/tables), where the
// scalar columns travel in snake_case (merchant_id, pos_x) and relations in
// camelCase (floorPlan, floorZone). We do not normalize so as not to break payloads.

import type { UnitSystem } from '../lib/measurement-units';
import { formatDimensions, formatLength } from '../lib/measurement-units';

// ================= Floor Plan: estados =================

// Triad of states exposed by the UI. The backend persists free varchar and only validates
// ['active','inactive'] on writing (plus 'deleted' on soft), so the UI
// traduce: inactive -> draft, deleted -> archived (ver normalizeFloorPlanStatus).
export type FloorPlanStatus = 'active' | 'draft' | 'archived';

// Ordered list to populate selects and filters without looping through an enum.
export const FLOOR_PLAN_STATUSES: FloorPlanStatus[] = ['active', 'draft', 'archived'];

export const FLOOR_PLAN_STATUS_LABELS: Record<FloorPlanStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
};

export const FLOOR_PLAN_STATUS_BADGE_STYLES: Record<FloorPlanStatus, string> = {
  active: 'bg-green-500/10 text-green-700',
  draft: 'bg-amber-500/10 text-amber-700',
  archived: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

// The backend can return legacy values outside of the triad; we go to 'active' to
// keep the row visible and editable instead of breaking the badge.
export const normalizeFloorPlanStatus = (raw: string): FloorPlanStatus => {
  const value = (raw ?? '').toLowerCase();
  if (value === 'draft' || value === 'inactive') return 'draft';
  if (value === 'archived' || value === 'deleted') return 'archived';
  return 'active';
};

// ================= Tables: shapes =================

// Exact backend casing: DTO validates @IsIn(['Circle','Square','Rectangle']),
// so sending lowercase returns 400.
export type TableShape =
  | 'Circle'
  | 'Square'
  | 'Rectangle'
  | 'Oval'
  | 'Booth'
  | 'Counter';

export const TABLE_SHAPES: TableShape[] = [
  'Circle',
  'Square',
  'Rectangle',
  'Oval',
  'Booth',
  'Counter',
];

// ================= Tables: operational status =================

// Mirror the backend TableStatus enum. The column is free varchar, but these are the
// only values that the POS knows how to paint; 'deleted' is the logical deletion and never a state
// operational, that's why it's not on the list.
export type TableStatus =
  | 'available'
  | 'occupied'
  | 'reserved'
  | 'cleaning'
  | 'out_of_service';

export const TABLE_STATUSES: TableStatus[] = [
  'available',
  'occupied',
  'reserved',
  'cleaning',
  'out_of_service',
];

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  cleaning: 'Cleaning',
  out_of_service: 'Out of Service',
};

// POS operating color code, identical on the grid and on the canvas: free green,
// coral busy, amber reserved, blue in cleaning, dull gray out of order.
export const TABLE_STATUS_BADGE_STYLES: Record<TableStatus, string> = {
  available: 'bg-green-500/10 text-green-700',
  occupied: 'bg-[#ff6b5a]/20 text-[#c2352a]',
  reserved: 'bg-amber-500/10 text-amber-700',
  cleaning: 'bg-blue-500/10 text-blue-700',
  out_of_service: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

export const isTableStatus = (raw?: string | null): raw is TableStatus =>
  TABLE_STATUSES.includes((raw ?? '') as TableStatus);

// The backend may return an inherited status outside of the quintuple; instead of hiding
// We label the row legibly ('needs_bussing' -> 'Needs Bussing') with a neutral badge.
export const tableStatusLabel = (raw?: string | null): string => {
  const value = (raw ?? '').trim();
  if (isTableStatus(value)) return TABLE_STATUS_LABELS[value];
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const tableStatusBadgeStyle = (raw?: string | null): string =>
  isTableStatus(raw ?? '')
    ? TABLE_STATUS_BADGE_STYLES[raw as TableStatus]
    : 'bg-[#ece8e0] text-[#1d1c17]';

// The range that the `rotation` column accepts (int 0-360). A decimal would be truncated silently.
export const TABLE_MIN_ROTATION = 0;
export const TABLE_MAX_ROTATION = 360;

// Limits on the actual size of a table, in canvas pixels (100px = 1m). They replicate the
// of the backend: below 20cm the table is invisible and above 6m it overflows
// cualquier sala razonable.
export const TABLE_MIN_SIZE_PX = 20;
export const TABLE_MAX_SIZE_PX = 600;

// ================= Relational ties =================

// The backend embeds merchant/floorPlan with variable hydration depending on the endpoint
// (sometimes {id,name}, sometimes the entire entity), so only `id` is guaranteed.
export interface MerchantRef {
  id: number;
  name?: string;
}

export interface FloorPlanRef {
  id: number;
  name?: string;
}

// ================= Entidades =================

export interface FloorZone {
  id: number;
  name: string;
  color?: string | null;
  // Region of the area on the canvas (JSON of points in px). null = the zone is just one
  // color label, without drawn area: this is how they were all born before this column existed.
  area?: string | null;
  // free varchar in backend; the UI normalizes it to the triad with normalizeFloorZoneStatus.
  status: string;
  // The /api/floor-zone findAll DOES embed {id,name} from the parent floor (unlike
  // /api/floor-plan with its collections), so the grid doesn't need to resolve it separately.
  floorPlan?: FloorPlanRef | null;
  merchant?: MerchantRef | null;
  created_at?: string;
  updated_at?: string;
}

// The zone shares the triad of states of the map: same vocabulary, same badges.
export type FloorZoneStatus = FloorPlanStatus;
export const FLOOR_ZONE_STATUSES = FLOOR_PLAN_STATUSES;
export const FLOOR_ZONE_STATUS_LABELS = FLOOR_PLAN_STATUS_LABELS;
export const FLOOR_ZONE_STATUS_BADGE_STYLES = FLOOR_PLAN_STATUS_BADGE_STYLES;
export const normalizeFloorZoneStatus = normalizeFloorPlanStatus;

// Default color of a new zone: corporate red, so that the swatch never
// remains empty if the user does not choose anything.
export const DEFAULT_ZONE_COLOR = '#ae001a';

// The backend saves `color` as a free varchar: it may come in a hex, a CSS name, or garbage.
// We only let an inline style pass what the browser knows how to interpret without breaking the
// swatch, and for everything else we fall to the default color.
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const CSS_NAME = /^[a-z]{3,20}$/i;

export const isRenderableColor = (raw?: string | null): boolean =>
  !!raw && (HEX_COLOR.test(raw.trim()) || CSS_NAME.test(raw.trim()));

export const zoneSwatchColor = (raw?: string | null): string =>
  isRenderableColor(raw) ? (raw as string).trim() : DEFAULT_ZONE_COLOR;

export interface CreateFloorZoneDto {
  merchant: number;
  name: string;
  color: string;
  area?: string | null;
  floorPlan: number;
  status: string;
}

// The backend exposes UpdateFloorZoneDto = PartialType(CreateFloorZoneDto); `merchant`
// purposely omitted when editing so as not to reassign the trade zone by accident.
export type UpdateFloorZoneDto = Partial<Omit<CreateFloorZoneDto, 'merchant'>>;

// Unique name per plane: the backend does NOT validate it, so the guard lives in the form.
export const duplicateZoneNameError = (
  name: string,
  planName: string,
): string => `A zone named '${name}' already exists on '${planName}'.`;

// An area with assigned tables cannot be deleted or archived: the tables would remain
// orphans in the area and the POS would not know where to paint them.
export const floorZoneMutationGuard = (tableCount: number): string =>
  tableCount > 0
    ? 'Cannot delete or archive a zone with assigned tables. Reassign tables to another zone or remove them first.'
    : '';

export interface DiningTable {
  id: number;
  merchant_id: number;
  number: string;
  capacity: number;
  status: string; // free varchar: not typed as union to prevent losing values from POS.
  location: string;
  rotation: number; // Degrees 0-360.
  shape: TableShape;
  // Custom canvas pixel dimensions. null/undefined = use default shape dimensions, which
  // is how all tables behaved prior to these columns existing.
  width?: number | null;
  height?: number | null;
  pos_x: number;
  pos_y: number;
  // There is no scalar floor_plan_id in the response - the only way to know which
  // plane belongs the table is this nested object (can come null if the FK is null).
  floorPlan?: FloorPlanRef | null;
  floorZone?: { id: number; name?: string; color?: string | null } | null;
  // Mother table of a union. Real contract asymmetry: /api/tables answer
  // embed `parent_table: {id, number} | null`, while write-only DTOs
  // accept the `parent_table_id` scalar. Both coexist here so as not to lose either;
  // parentTableId() in lib/dining-tables.ts is what unifies them when reading.
  parent_table?: { id: number; number?: string } | null;
  parent_table_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface FloorPlan {
  id: number;
  name: string;
  width: number;
  height: number;
  status: FloorPlanStatus;
  // Room outline (polygon in canvas px) as persisted by the backend:
  // Nullable `text` column with serialized JSON, NOT an array. `null` (or absent in plans
  // before the column) means "full rectangle width × height". geometry lives
  // in src/lib/floor-geometry.ts: parseOutline() is what translates this string into points.
  outline?: string | null;
  merchant?: MerchantRef | null;
  // The backend NEVER embeds tables/floorZones in /api/floor-plan: they are added in the
  // front crossing /api/tables and /api/floor-zone by floorPlan.id.
  tables?: DiningTable[];
  floorZones?: FloorZone[];
  created_at?: string;
  updated_at?: string;
}

// ================= Write DTOs =================

// The merchant field is `merchant` (number), not merchant_id - the backend does not derive it
// of the JWT in floor-plan, it must be sent explicitly.
export interface CreateFloorPlanDto {
  merchant: number;
  name: string;
  width: number;
  height: number;
  // Optional in the backend DTO (@IsOptional + @MaxLength(20000)): omitting this is equivalent to
  // send null, that is, to a rectangular plane.
  outline?: string | null;
  status: string;
}

// PATCH /api/floor-plan/:id uses strict whitelist; we omit `merchant` because
// Object.assign would overwrite the relationship with a raw number and corrupt it.
// `outline` does travel here (inherits from CreateFloorPlanDto): being partial PATCH, skip it
// preserves the saved outline and sending explicit null returns it to rectangle.
export type UpdateFloorPlanDto = Partial<Omit<CreateFloorPlanDto, 'merchant'>>;

// All fields are @IsNotEmpty in the backend except parent_table_id; floorZone is
// required when creating (unlike updating).
export interface CreateDiningTableDto {
  merchant_id: number;
  number: string;
  capacity: number;
  status: string;
  location: string;
  rotation: number;
  shape: TableShape;
  width?: number | null;
  height?: number | null;
  pos_x: number;
  pos_y: number;
  floorZone: number;
  floorPlan: number;
  parent_table_id?: number | null;
}

// PUT /api/tables/:id rejects merchant_id with 400 (forbidNonWhitelisted).
export type UpdateDiningTableDto = Partial<Omit<CreateDiningTableDto, 'merchant_id'>>;

// ================= Canvas spatial rules =================

export const FLOOR_PLAN_MIN_DIMENSION = 300;
export const FLOOR_PLAN_MAX_DIMENSION = 4000;

// width/height are int in Postgres - a decimal would be silently truncated, so I
// we block on the form instead of letting the backend round it.
// `v` ALWAYS arrives in pixels (it's what the backend persists); `system` only writes the
// message on the unit in front of the user, why require "between 300px and 4000px"
// while typing meters is to ask you to do the conversion upside down. Omitting it preserves the
// text in pixels for any caller still speaking on that unit.
export const validateCanvasDimension = (v: number, system?: UnitSystem): string => {
  if (
    Number.isInteger(v) &&
    v >= FLOOR_PLAN_MIN_DIMENSION &&
    v <= FLOOR_PLAN_MAX_DIMENSION
  ) {
    return '';
  }
  const min = system
    ? formatLength(FLOOR_PLAN_MIN_DIMENSION, system)
    : `${FLOOR_PLAN_MIN_DIMENSION}px`;
  const max = system
    ? formatLength(FLOOR_PLAN_MAX_DIMENSION, system)
    : `${FLOOR_PLAN_MAX_DIMENSION}px`;
  return `Canvas dimensions must be between ${min} and ${max}.`;
};

// Default rendered footprint of each shape, in canvas px. It is shared by the editor
// and the clipping check so that "what is seen" and "what is validated" do not diverge.
export const TABLE_FOOTPRINT: Record<TableShape, { w: number; h: number }> = {
  Circle: { w: 80, h: 80 },
  Square: { w: 80, h: 80 },
  Rectangle: { w: 120, h: 70 },
  Oval: { w: 120, h: 80 },
  Booth: { w: 140, h: 90 },
  Counter: { w: 200, h: 60 },
};

// REAL footprint of a table: its own size if it has one, and if not its shape.
// All the editor (drag, clamp, collisions, containment in the polygon) must go through
// here: if someone uses TABLE_FOOTPRINT directly, the resized tables are
// They would behave as if they measured what their shape dictates.
export const tableFootprint = (
  t: Pick<DiningTable, 'shape'> & { width?: number | null; height?: number | null },
): { w: number; h: number } => {
  const base = TABLE_FOOTPRINT[t.shape] ?? TABLE_FOOTPRINT.Square;
  return {
    w: t.width != null && t.width > 0 ? t.width : base.w,
    h: t.height != null && t.height > 0 ? t.height : base.h,
  };
};

// pos_x/pos_y are the upper left corner of the footprint (same origin as the
// editor's absolute positioning), so the right/bottom border adds w/h.
export const isTableClipped = (
  t: Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape'> & {
    width?: number | null;
    height?: number | null;
  },
  width: number,
  height: number,
): boolean => {
  const footprint = tableFootprint(t);
  return (
    t.pos_x < 0 ||
    t.pos_y < 0 ||
    t.pos_x + footprint.w > width ||
    t.pos_y + footprint.h > height
  );
};

// Notice before saving a resize: if any table would be outside the canvas,
// the user must relocate it first (the backend does not relocate anything on its own).
// `width`/`height` travel in pixels the same as table coordinates: `system` only
// decide how those dimensions read in the notice.
export const clippingWarning = (
  tables: DiningTable[],
  width: number,
  height: number,
  system?: UnitSystem,
): string => {
  const n = tables.filter((t) => isTableClipped(t, width, height)).length;
  if (n === 0) return '';
  const size = system
    ? formatDimensions(width, height, system)
    : `${width}px × ${height}px`;
  return `New canvas dimensions (${size}) will clip ${n} existing tables placed outside these bounds. Please adjust table coordinates first.`;
};

// Delete/archive a plan does not crash in the backend: the tables would be orphaned
// pointing to an invisible plane, so the UI blocks it before calling the API.
export const floorPlanMutationGuard = (tableCount: number): string =>
  tableCount > 0
    ? 'Cannot delete or archive a floor plan with active table layouts or open orders. Reassign or clear tables first.'
    : '';
