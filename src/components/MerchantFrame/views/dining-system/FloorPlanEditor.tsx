import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import {
  childTablesOf,
  descendantTableIds,
  wouldCreateCycle,
  eligibleParentTables,
  eligibleTransferTargets,
  inheritedChildStatus,
  joinedChildrenLabel,
  parentTableId,
} from '../../../../lib/dining-tables';
import { useDiningRealtime } from '../../../../lib/useDiningRealtime';
import { TableTransferModal } from './TableTransferModal';
import { Toast } from '../../shared/Toast';
import type {
  CreateDiningTableDto,
  DiningTable,
  FloorPlan,
  FloorZone,
  TableShape,
  UpdateDiningTableDto,
} from '../../../../types/dining-system';
import {
  FLOOR_PLAN_MIN_DIMENSION,
  FLOOR_PLAN_STATUS_BADGE_STYLES,
  TABLE_STATUSES,
  isTableStatus,
  tableStatusLabel,
  FLOOR_PLAN_STATUS_LABELS,
  TABLE_FOOTPRINT,
  TABLE_MIN_SIZE_PX,
  TABLE_MAX_SIZE_PX,
  tableFootprint,
  TABLE_SHAPES,
  isTableClipped,
  normalizeFloorPlanStatus,
} from '../../../../types/dining-system';
import type { UnitSystem } from '../../../../lib/measurement-units';
import {
  UNIT_SYSTEMS,
  UNIT_SYSTEM_LABELS,
  UNIT_SYSTEM_SHORT,
  formatArea,
  formatDimensions,
  formatLength,
  lengthSuffix,
  lengthToPx,
  lengthValue,
  loadUnitSystem,
  saveUnitSystem,
} from '../../../../lib/measurement-units';
import type { Outline } from '../../../../lib/floor-geometry';
import {
  MIN_OUTLINE_VERTICES,
  OUTLINE_PRESETS,
  clampPointToPolygon,
  insertVertex,
  outlinePath,
  outlineWarning,
  parseOutline,
  pointInPolygon,
  polygonBounds,
  polygonArea,
  rectangleOutline,
  removeVertex,
  serializeOutline,
  tableInsideOutline,
  tablesOutsideOutline,
  validateOutline,
} from '../../../../lib/floor-geometry';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ---- Constantes espaciales ----

// The background draws a 20px grid, but positions snap every 10px: half a
// cell provides sufficient precision without forcing the user to fine-tune pixel by pixel.
const GRID_PX = 20;
const SNAP_PX = 10;

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

// Fill color fallback when zone lacks color (backend allows null color).
const FALLBACK_TABLE_COLOR = '#ae001a';
const DEFAULT_ZONE_COLOR = '#ae001a';

// ---- Room boundary ----

// The floor keeps its standard warm tint and the exterior dims: without this contrast an L-shaped
// layout would read as a rectangle with a spot, rather than a room with an inner wall.
const FLOOR_FILL = '#fef9f1';
const OUTSIDE_FILL = '#e0d9cd';
const GRID_LINE = '#e2dbd0';
const WALL_COLOR = '#222222';
const WALL_WIDTH = 4;

// Handle dimensions in SCREEN px: scaled by zoom at render time so they
// remain easily targetable at 25% and do not become enormous blocks at 200%.
const VERTEX_HANDLE_PX = 12;
const EDGE_HANDLE_PX = 7;

type EditorMode = 'tables' | 'shape' | 'zones';

// ---- Presentation units ----

// The button can only display "m"/"ft", so the full system name travels in the
// aria-label: a screen reader should not have to guess what "ft" stands for.
const UNIT_SYSTEM_ARIA: Record<UnitSystem, string> = {
  metric: 'Show measurements in meters',
  imperial: 'Show measurements in feet and inches',
};

// Step size for coordinate inputs. In px it was 10 (grid); in meters or feet that
// same 10 would be a 10m leap, so it is refined to hundredths — matching the
// precision returned by `lengthValue` and preventing browser stepMismatch.
const COORD_STEP = 0.01;

// `limit` is capped at 100 in /api/tables (@Max(100)); MAX_PAGES is a safety belt
// to prevent a corrupted `totalPages` from trapping the editor in an infinite loop.
const PAGE_LIMIT = 100;
const MAX_PAGES = 25;

// ---- Helpers ----

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max);

const snap = (v: number): number => Math.round(v / SNAP_PX) * SNAP_PX;

// Footprint depends on the TABLE (can define custom dimensions), not just shape.
// A shape-based fallback is kept for the palette, where a table does not yet exist.
const footprintOf = (shape: TableShape) =>
  TABLE_FOOTPRINT[shape] ?? TABLE_FOOTPRINT.Square;

const footprintOfTable = (t: {
  shape: TableShape;
  width?: number | null;
  height?: number | null;
}) => tableFootprint(t);

// Outline corner rounding per shape: oval is a full ellipse, booth has
// heavily smoothed corners, and bar counter is barely rounded.
const shapeRadiusClass = (shape: TableShape): string => {
  if (shape === 'Circle' || shape === 'Oval') return 'rounded-full';
  if (shape === 'Booth') return 'rounded-2xl';
  return 'rounded';
};

// Nest returns `message` as string or string[], and ValidationExceptionFilter appends
// `errors`. Flatten everything to a single line to display beside the table.
interface ApiErrorBody {
  message?: string | string[];
  errors?: string[];
}

const errorMessageOf = (body: ApiErrorBody | null | undefined): string => {
  if (!body) return '';
  if (Array.isArray(body.errors) && body.errors.length > 0) return body.errors.join(', ');
  if (Array.isArray(body.message)) return body.message.join(', ');
  return typeof body.message === 'string' ? body.message : '';
};

// El mayor paso de zoom que deja el lienzo entero dentro del viewport disponible.
const fitZoom = (
  viewportW: number,
  viewportH: number,
  canvasW: number,
  canvasH: number,
): number => {
  if (!viewportW || !viewportH || !canvasW || !canvasH) return 1;
  const raw = Math.min(viewportW / canvasW, viewportH / canvasH);
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
    if (ZOOM_STEPS[i] <= raw) return ZOOM_STEPS[i];
  }
  return MIN_ZOOM;
};

// Snaps a table back within room boundary.
//
// clampPointToPolygon constrains POINTS and a table is a rectangle, so we push corner by
// corner: projecting only the center fails because the center can comfortably sit inside
// while a corner pokes through an L-shaped notch. Each iteration fits at least one
// corner; the loop limit avoids infinite cycling in rooms narrower than the table itself.
const containToOutline = (
  x: number,
  y: number,
  shape: TableShape,
  outline: Outline,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } => {
  if (tableInsideOutline({ pos_x: x, pos_y: y, shape }, outline)) return { x, y };

  const fp = footprintOf(shape);
  let nextX = x;
  let nextY = y;

  for (let pass = 0; pass < 8; pass += 1) {
    const corners: Outline = [
      { x: nextX, y: nextY },
      { x: nextX + fp.w, y: nextY },
      { x: nextX + fp.w, y: nextY + fp.h },
      { x: nextX, y: nextY + fp.h },
    ];
    const stray = corners.find((c) => !pointInPolygon(c, outline));
    if (!stray) break;
    const target = clampPointToPolygon(stray, outline);
    // No movement possible (degenerate room): stop rather than looping futilely.
    if (target.x === stray.x && target.y === stray.y) break;
    nextX += target.x - stray.x;
    nextY += target.y - stray.y;
  }

  const fit = (px: number, py: number) => ({
    x: clamp(px, 0, Math.max(0, canvasW - fp.w)),
    y: clamp(py, 0, Math.max(0, canvasH - fp.h)),
  });

  const snapped = fit(snap(nextX), snap(nextY));
  if (tableInsideOutline({ pos_x: snapped.x, pos_y: snapped.y, shape }, outline)) return snapped;
  // The 10px grid is a convenience; staying within the room boundary is mandatory.
  return fit(Math.round(nextX), Math.round(nextY));
};

// Finds free slot in square spiral from canvas center, so
// new tables do not stack exactly on top of each other when clicking "Add" repeatedly.
const findFreeSpot = (
  shape: TableShape,
  existing: Array<Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape'>>,
  canvasW: number,
  canvasH: number,
  outline: Outline,
): { x: number; y: number } => {
  const fp = footprintOf(shape);
  const maxX = Math.max(0, canvasW - fp.w);
  const maxY = Math.max(0, canvasH - fp.h);
  const cx = clamp(snap(canvasW / 2 - fp.w / 2), 0, maxX);
  const cy = clamp(snap(canvasH / 2 - fp.h / 2), 0, maxY);

  const overlaps = (x: number, y: number): boolean =>
    existing.some((t) => {
      const other = footprintOfTable(t);
      return (
        x < t.pos_x + other.w &&
        x + fp.w > t.pos_x &&
        y < t.pos_y + other.h &&
        y + fp.h > t.pos_y
      );
    });

  for (let ring = 0; ring < 30; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const x = clamp(snap(cx + dx * GRID_PX), 0, maxX);
        const y = clamp(snap(cy + dy * GRID_PX), 0, maxY);
        // In an L-shaped layout canvas center might fall in the notch: the grid is
        // traversed similarly, but only points inside the room polygon are valid.
        if (!tableInsideOutline({ pos_x: x, pos_y: y, shape }, outline)) continue;
        if (!overlaps(x, y)) return { x, y };
      }
    }
  }
  // Full room: prefer an overlapping table visible inside the room over one outside.
  return containToOutline(cx, cy, shape, outline, canvasW, canvasH);
};

// Next available "T{n}". The UNIQUE (merchant_id, number) index converts
// collisions into hard 409s, so deduplication is performed client-side before POST.
/**
 * Resolves real parent table id for payload.
 *
 * Returns existing id as-is, translates temporary negative id to backend-assigned id,
 * and returns null if not joined. If parent was new and creation failed, returns null:
 * better to save child unlinked than sending an invalid synthetic id.
 */
const resolveParentId = (
  parentId: number | null,
  created: Array<{ tempId: number; row: DiningTable }>,
): number | null => {
  if (parentId == null) return null;
  if (parentId > 0) return parentId;
  return created.find((c) => c.tempId === parentId)?.row.id ?? null;
};

const nextTableNumber = (taken: Set<string>): string => {
  for (let i = 1; i < 5000; i += 1) {
    const candidate = `T${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `T${Date.now()}`;
};

// ---- Tipos locales ----

// Unsaved tables use negative IDs: serves as stable React key,
// data-testid, and marker for "not yet persisted on server".
type EditorTable = DiningTable;

export interface FloorPlanEditorProps {
  plan: FloorPlan;
  onClose: () => void;
  onSaved?: () => void;
  merchantId: number;
}

export const FloorPlanEditor: React.FC<FloorPlanEditorProps> = ({
  plan,
  onClose,
  onSaved,
  merchantId,
}) => {
  // A floor plan with corrupt dimensions would result in a 0px canvas with no drop area;
  // fallback to domain minimum so the editor remains usable.
  const canvasW = plan.width > 0 ? plan.width : FLOOR_PLAN_MIN_DIMENSION;
  const canvasH = plan.height > 0 ? plan.height : FLOOR_PLAN_MIN_DIMENSION;
  // El backend persiste el estado como varchar libre ('inactive'/'deleted' incluidos):
  // normalizamos antes de indexar los mapas de badge para no pintar "undefined".
  const planStatus = normalizeFloorPlanStatus(plan.status);

  // Boundary resides on the floor plan itself (`floor_plan.outline`, nullable text column) and not
  // on tables: persisted separately via PATCH with its own dirty flag.
  const [mode, setMode] = useState<EditorMode>('tables');
  const [outline, setOutline] = useState<Outline>(() =>
    parseOutline(plan.outline, canvasW, canvasH),
  );
  const [outlineDirty, setOutlineDirty] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);

  // Drawn region per zone (id -> polygon). Hydrated from `zone.area` and lives separate
  // from room boundary: independent polygons saved via PATCH to their respective zone.
  const [zoneAreas, setZoneAreas] = useState<Map<number, Outline>>(new Map());
  const [dirtyZoneIds, setDirtyZoneIds] = useState<Set<number>>(new Set());
  const [selectedZoneVertex, setSelectedZoneVertex] = useState<number | null>(null);
  const [pendingPreset, setPendingPreset] = useState<{
    label: string;
    outline: Outline;
    warning: string;
  } | null>(null);

  const [tables, setTables] = useState<EditorTable[]>([]);
  // All merchant tables, not just this plan: a transfer might move diners
  // to the patio, which is on another canvas.
  const [allTables, setAllTables] = useState<DiningTable[]>([]);
  const [zones, setZones] = useState<FloorZone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<number | null>(null);
  const [takenNumbers, setTakenNumbers] = useState<Set<string>>(new Set());

  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const [pendingDeletes, setPendingDeletes] = useState<number[]>([]);
  // MULTIPLE selection: merging tables is a set operation, so selection
  // tracks the whole set and `selectedId` is just the single-item case.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  // Marquee selection box on empty canvas in canvas coordinates.
  // Explicit parent chosen for merge if any. Effective parent is derived below.
  const [joinParentId, setJoinParentId] = useState<number | null>(null);
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    additive: boolean;
  } | null>(null);

  const [zoom, setZoom] = useState(1);
  // DISPLAY unit. Pixels remain the storage and compute unit: this only controls
  // how values are rendered and input, never what is sent to the API.
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(loadUnitSystem);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  // Zone draft handles create and edit: 'edit' holds the id being
  // renamed/recolored, null indicates a new zone.
  const [zoneDraftOpen, setZoneDraftOpen] = useState(false);
  const [zoneDraftEditId, setZoneDraftEditId] = useState<number | null>(null);
  // Guest transfer: handled server-side in a transaction, executed directly
  // against the API and excluded from the local unsaved changes batch.
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Resolved active zone: drives the color swatch and edit form.
  const activeZone = useMemo(
    () => zones.find((z) => z.id === activeZoneId) ?? null,
    [zones, activeZoneId],
  );
  const [zoneDraftName, setZoneDraftName] = useState('');
  const [zoneDraftColor, setZoneDraftColor] = useState(DEFAULT_ZONE_COLOR);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null,
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Drag state held outside React state: re-rendering on every pointermove just to track
  // cursor offset would introduce unnecessary overhead.
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);
  // Same pattern for boundary vertices: pointer-vertex offset is stored on pointerdown,
  // otherwise vertex would snap abruptly under cursor on initial move.
  const vertexDragRef = useRef<{ index: number; dx: number; dy: number } | null>(null);
  // Synchronous mirror of boundary for pointer handlers (see tablesRef).
  const outlineRef = useRef<Outline>(outline);
  useEffect(() => {
    outlineRef.current = outline;
  }, [outline]);
  // Snapshot of rows as received from server, allowing PUT payloads to include only
  // actually modified items (backend rejects empty update payloads with 400).
  const originalById = useRef<Map<number, DiningTable>>(new Map());
  const tempIdRef = useRef(-1);
  const zoomInitialized = useRef(false);
  // Synchronous state mirror for pointer handlers, firing faster
  // than React re-renders.
  const tablesRef = useRef<EditorTable[]>([]);
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Editor renders in a <body> portal: on mount focus remained trapped on the
  // background grid button behind the aria-modal overlay, so focus is pulled inside.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearAuthSession();
    window.location.href = '/login';
  }, []);

  // ---------------- Carga inicial ----------------

  // Neither endpoint accepts floor plan filter and both are paginated
  // (`limit` capped at 100 in /api/tables), requiring page traversal: fetching only
  // one page would leave merchants with >100 tables seeing partial layouts and cause
  // 409 collision errors. Pagination metadata key differs: `paginationMeta` vs `pagination`.
  const fetchAllPages = useCallback(
    async <T,>(
      resource: string,
    ): Promise<{ rows: T[]; ok: boolean; unauthorized: boolean }> => {
      const rows: T[] = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await fetch(`${API_BASE}/${resource}?limit=${PAGE_LIMIT}&page=${page}`, {
          headers: authHeaders(),
        });
        if (res.status === 401) return { rows, ok: false, unauthorized: true };
        if (!res.ok) return { rows, ok: false, unauthorized: false };
        const json = (await res.json()) as {
          data?: T[];
          paginationMeta?: { totalPages?: number };
          pagination?: { totalPages?: number };
        };
        rows.push(...(json.data ?? []));
        const totalPages =
          json.paginationMeta?.totalPages ?? json.pagination?.totalPages ?? 1;
        if (page >= totalPages) break;
      }
      return { rows, ok: true, unauthorized: false };
    },
    [authHeaders],
  );

  const loadLayout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tablesResult, zonesResult] = await Promise.all([
        fetchAllPages<DiningTable>('tables'),
        fetchAllPages<FloorZone>('floor-zone'),
      ]);

      if (tablesResult.unauthorized || zonesResult.unauthorized) {
        handleUnauthorized();
        return;
      }
      if (!tablesResult.ok) throw new Error('Error loading floor plan tables');

      const allTables = tablesResult.rows;

      // GET /api/tables has no floor plan query param and response lacks a scalar
      // floor_plan_id: relation is nested inside `floorPlan` (hydrated via leftJoinAndSelect).
      // Filtering client-side avoids fallback calls to /tables/:id or /floor-plan/:id.
      const planTables = allTables.filter(
        (t) => t.floorPlan?.id === plan.id && t.status !== 'deleted',
      );

      // Busy numbers pool includes soft-deleted tables: record still exists in
      // database alongside UNIQUE (merchant_id, number) constraint.
      setTakenNumbers(new Set(allTables.map((t) => (t.number ?? '').toLowerCase())));
      setAllTables(allTables.filter((t) => t.status !== 'deleted'));

      originalById.current = new Map(planTables.map((t) => [t.id, { ...t }]));
      setTables(planTables.map((t) => ({ ...t })));
      setDirtyIds(new Set());
      setPendingDeletes([]);

      // /api/floor-zone is NOT scoped by merchant, so we filter by
      // floorPlan.id since the plan already belongs to a single merchant.
      const planZones = zonesResult.rows.filter(
        (z) => z.floorPlan?.id === plan.id && z.status !== 'deleted',
      );
      setZones(planZones);
      // Hydrate drawn regions; zone without `area` simply does not render
      // on map and continues functioning as a color tag.
      setZoneAreas(() => {
        const next = new Map<number, Outline>();
        planZones.forEach((z) => {
          if (z.area) {
            const parsed = parseOutline(z.area, canvasW, canvasH);
            if (parsed.length >= 3) next.set(z.id, parsed);
          }
        });
        return next;
      });
      setActiveZoneId((prev) =>
        prev && planZones.some((z) => z.id === prev) ? prev : (planZones[0]?.id ?? null),
      );
    } catch (err) {
      console.error('Error fetching floor plan layout:', err);
      setError('Failed to load the floor plan layout. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [fetchAllPages, handleUnauthorized, plan.id]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  // Editor mounts per plan; if parent reused instance for another plan, outline
  // must reload to avoid overwriting shapes. Plan ID is compared rather than
  // `plan.outline` so background refreshes do not erase in-progress edits.
  const loadedPlanId = useRef(plan.id);
  useEffect(() => {
    if (loadedPlanId.current === plan.id) return;
    loadedPlanId.current = plan.id;
    setOutline(parseOutline(plan.outline, canvasW, canvasH));
    setOutlineDirty(false);
    setSelectedVertex(null);
    setPendingPreset(null);
  }, [plan.id, plan.outline, canvasW, canvasH]);

  // Initial zoom: largest step fitting complete floor plan into viewport.
  useEffect(() => {
    if (zoomInitialized.current) return;
    const el = viewportRef.current;
    if (!el) return;
    const w = el.clientWidth - 64;
    const h = el.clientHeight - 64;
    if (w <= 0 || h <= 0) return;
    zoomInitialized.current = true;
    setZoom(fitZoom(w, h, canvasW, canvasH));
  }, [canvasW, canvasH, loading]);

  // ---------------- Derivados ----------------

  const zoneById = useMemo(() => {
    const map = new Map<number, FloorZone>();
    zones.forEach((z) => map.set(z.id, z));
    return map;
  }, [zones]);

  // Selected tables ordered by addition: first table acts as proposed
  // parent, matching intuitive user expectations from marquee or Ctrl+clicks.
  const selectedTables = useMemo(
    () =>
      selectedIds
        .map((id) => tables.find((t) => t.id === id))
        .filter((t): t is EditorTable => t != null),
    [tables, selectedIds],
  );

  /**
  * Effective group parent: explicitly chosen table if selected, or first in
  * selection. Deriving it dynamically avoids desync when selection set changes.
  */
  const effectiveJoinParent =
    joinParentId != null && selectedIds.includes(joinParentId)
      ? joinParentId
      : (selectedIds[0] ?? null);

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedId) ?? null,
    [tables, selectedId],
  );

  // Parent-child links that can be DRAWN: only if both tables belong to this plan.
  // If parent is on another plan, link cannot be drawn and is reflected via badge.
  const joinLinks = useMemo(() => {
    const byId = new Map(tables.map((t) => [t.id, t]));
    return tables.flatMap((t) => {
      const pid = parentTableId(t);
      const parent = pid != null ? byId.get(pid) : undefined;
      if (!parent) return [];
      const cf = footprintOfTable(t);
      const pf = footprintOfTable(parent);
      return [
        {
          childId: t.id,
          parentId: parent.id,
          x1: t.pos_x + cf.w / 2,
          y1: t.pos_y + cf.h / 2,
          x2: parent.pos_x + pf.w / 2,
          y2: parent.pos_y + pf.h / 2,
        },
      ];
    });
  }, [tables]);

  // Complete group hierarchy: ascends to root and descends all children to
  // highlight the entire join group rather than just the selected node.
  const selectedGroupIds = useMemo(() => {
    if (!selectedTable) return new Set<number>();
    const byId = new Map(tables.map((t) => [t.id, t]));
    let root = selectedTable;
    // El `climbed` corta la subida si los datos vinieran con un ciclo ya persistido.
    const climbed = new Set<number>([root.id]);
    let pid = parentTableId(root);
    while (pid != null && byId.has(pid) && !climbed.has(pid)) {
      root = byId.get(pid) as EditorTable;
      climbed.add(root.id);
      pid = parentTableId(root);
    }
    return new Set<number>([root.id, ...descendantTableIds(tables, root.id)]);
  }, [tables, selectedTable]);

  // Candidate parent tables: exclude self and descendants (prevents circular loops).
  // Unsaved tables ARE included: temporary IDs are resolved to backend IDs during save.
  const parentChoices = useMemo(
    () => (selectedTable ? eligibleParentTables(tables, selectedTable.id) : []),
    [tables, selectedTable],
  );

  // Index might survive vertex deletion (out of bounds), hence ?? null fallback.
  const selectedVertexPoint = useMemo(
    () => (selectedVertex === null ? null : (outline[selectedVertex] ?? null)),
    [outline, selectedVertex],
  );

  // Boundary counts as a pending change: saved in the same "Save layout"
  // action even though it targets an independent endpoint.
  const dirtyCount = useMemo(
    () =>
      tables.filter((t) => t.id < 0 || dirtyIds.has(t.id)).length +
      pendingDeletes.length +
      (outlineDirty ? 1 : 0) +
      dirtyZoneIds.size,
    [tables, dirtyIds, pendingDeletes, outlineDirty, dirtyZoneIds],
  );

  // ---------------- Guest Transfer ----------------

  // Handled server-side in a transaction (order, cover, and statuses), triggered
  // and reloaded here. Action is disabled with pending unsaved changes to avoid loss.
  const handleTransfer = useCallback(
    async (target: DiningTable) => {
      const source = tablesRef.current.find((t) => t.id === selectedId);
      if (!source) return;
      setTransferSubmitting(true);
      try {
        const res = await fetch(`${API_BASE}/tables/transfer`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ sourceTableId: source.id, targetTableId: target.id }),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return;
        }
        const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
        if (!res.ok) {
          throw new Error(errorMessageOf(json) || 'Transfer rejected by the server');
        }
        setTransferOpen(false);
        await loadLayout();
        setToast({
          message: `Guests moved from ${source.number} to ${target.number}`,
          type: 'success',
        });
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Failed to transfer the table',
          type: 'error',
        });
      } finally {
        setTransferSubmitting(false);
      }
    },
    [authHeaders, handleUnauthorized, loadLayout, selectedId],
  );

  // ---------------- Canal en vivo ----------------

  // Reloading discards unsaved changes, so with pending work we DO NOT reload
  // automatically: prompt the user to make a deliberate decision.
  const refreshFromFloor = () => {
    if (dirtyCount > 0) {
      setToast({
        message:
          'The floor changed on another terminal. Save or discard your changes to pull the update.',
        type: 'error',
      });
      return;
    }
    void loadLayout();
  };

  const { connected: liveConnected } = useDiningRealtime({
    onTableStatusChanged: (p) => {
      if (p.merchantId !== merchantId) return;
      setTables((prev) => {
        const local = prev.find((t) => t.id === p.tableId);
        // Table currently being edited preserves ITS version: incoming events
        // must not overwrite unsaved local work.
        if (!local || dirtyIds.has(p.tableId)) return prev;
        // Borrada en otra terminal: desaparece del lienzo en vez de quedarse pintada.
        if (p.status === 'deleted') return prev.filter((t) => t.id !== p.tableId);
        if (local.status === p.status) return prev;
        return prev.map((t) => (t.id === p.tableId ? { ...t, status: p.status } : t));
      });
    },
    onTableTransferred: (p) => {
      if (p.merchantId === merchantId) refreshFromFloor();
    },
    onFloorPlanUpdated: (p) => {
      if (p.merchantId === merchantId && p.floorPlanId === plan.id) refreshFromFloor();
    },
    onReconnect: () => refreshFromFloor(),
  });

  // Tables whose footprint lies outside room boundary: in L-shaped layouts,
  // the rectangular canvas boundary is not the true perimeter.
  const outsideCount = useMemo(() => tablesOutsideOutline(tables, outline), [tables, outline]);

  // Area in px² (shoelace formula). Stored raw by design: conversion to m²
  // or sq ft happens at render time based on selected unit.
  const roomAreaPx2 = useMemo(() => polygonArea(outline), [outline]);

  // "Custom" = boundary is no longer the full canvas rectangle. Area is only
  // shown then: on standard rectangles it is trivial from width × height.
  const customShape = useMemo(
    () => outline.length !== 4 || Math.abs(roomAreaPx2 - canvasW * canvasH) > 0.5,
    [outline.length, roomAreaPx2, canvasW, canvasH],
  );

  const clippedCount = useMemo(
    () => tables.filter((t) => isTableClipped(t, canvasW, canvasH)).length,
    [tables, canvasW, canvasH],
  );

  const duplicateNumbers = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    tables.forEach((t) => {
      const key = (t.number ?? '').trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) dupes.add(key);
      seen.set(key, t.id);
    });
    return dupes;
  }, [tables]);

  const tableColor = useCallback(
    (t: EditorTable): string => {
      const zone = t.floorZone?.id != null ? zoneById.get(t.floorZone.id) : undefined;
      return zone?.color || t.floorZone?.color || FALLBACK_TABLE_COLOR;
    },
    [zoneById],
  );

  // ---------------- Mutaciones locales ----------------

  const markDirty = useCallback((id: number) => {
    if (id < 0) return; // newly created tables are already marked pending via negative id
    setDirtyIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const patchTable = useCallback(
    (id: number, patch: Partial<EditorTable>) => {
      setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      markDirty(id);
    },
    [markDirty],
  );

  // Position is in canvas px (never screen px), snapped to grid and clamped
  // inside room boundary. Read from tablesRef rather than updater because marking
  // dirty is a side effect that cannot reside inside setState (executed twice in strict mode).
  const moveTable = useCallback(
    (id: number, rawX: number, rawY: number) => {
      const current = tablesRef.current.find((t) => t.id === id);
      if (!current) return;
      const fp = footprintOfTable(current);
      const boxX = clamp(snap(rawX), 0, Math.max(0, canvasW - fp.w));
      const boxY = clamp(snap(rawY), 0, Math.max(0, canvasH - fp.h));
      // Dual boundaries: canvas paper and room outline. On rectangular plans
      // boundaries coincide; on L-shaped layouts it prevents dropping tables into dead space.
      const { x, y } = containToOutline(
        boxX,
        boxY,
        current.shape,
        outlineRef.current,
        canvasW,
        canvasH,
      );
      // Un clic sin desplazamiento real no debe ensuciar el layout.
      if (x === current.pos_x && y === current.pos_y) return;
      setTables((prev) =>
        prev.map((t) => (t.id === id ? { ...t, pos_x: x, pos_y: y } : t)),
      );
      markDirty(id);
    },
    [canvasW, canvasH, markDirty],
  );

  /**
  * Joins or unlinks a table locally: join relation is a table property
  * committed in the same Save operation as coordinates or capacity.
  *
  * Updates both the scalar ID and the nested reference to keep canvas and form in sync.
  */
  const setTableParent = useCallback(
    (childId: number, parentId: number | null) => {
      const parent =
        parentId != null ? (tablesRef.current.find((t) => t.id === parentId) ?? null) : null;
      // When joining an occupied parent, child inherits status: joined table acts as
      // a unified service unit; half-vacant joined tables make no sense in floor operations.
      const inherited = parent ? inheritedChildStatus(parent.status) : null;
      patchTable(childId, {
        parent_table_id: parentId,
        parent_table: parent ? { id: parent.id, number: parent.number } : null,
        ...(inherited ? { status: inherited } : {}),
      });
    },
    [patchTable],
  );

  /**
  * Merges ALL selected tables under a parent.
  *
  * Supports batch linking: marquee select five tables and link in a single action.
  * Potential circular loops are skipped safely without crashing the batch operation.
  */
  const joinSelected = useCallback(
    (parentId: number) => {
      selectedIds
        .filter((id) => id !== parentId && !wouldCreateCycle(tablesRef.current, id, parentId))
        .forEach((childId) => setTableParent(childId, parentId));
    },
    [selectedIds, setTableParent],
  );

  const unjoinSelected = useCallback(() => {
    selectedIds.forEach((id) => setTableParent(id, null));
  }, [selectedIds, setTableParent]);

  const removeTable = useCallback((id: number) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
    setDirtyIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // A locally created table deleted before saving simply disappears:
    // never existed on the server, so no DELETE is queued.
    if (id > 0) setPendingDeletes((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  // ---------------- Room Boundary ----------------

  // Boundary mutations route through here: updates synchronous mirror (pointer handlers
  // read before re-render) and marks boundary dirty for PATCH.
  const applyOutline = useCallback((next: Outline) => {
    outlineRef.current = next;
    setOutline(next);
    setOutlineDirty(true);
  }, []);

  const moveVertex = useCallback(
    (index: number, rawX: number, rawY: number) => {
      const current = outlineRef.current;
      const vertex = current[index];
      if (!vertex) return;
      // Vertices are clamped to canvas extents: room corners can touch
      // the perimeter boundary.
      const x = clamp(snap(rawX), 0, canvasW);
      const y = clamp(snap(rawY), 0, canvasH);
      if (x === vertex.x && y === vertex.y) return;
      applyOutline(current.map((p, i) => (i === index ? { x, y } : p)));
    },
    [applyOutline, canvasW, canvasH],
  );

  const insertAtEdge = useCallback(
    (edgeIndex: number) => {
      applyOutline(insertVertex(outlineRef.current, edgeIndex));
      // New vertex is inserted right behind edge: keeping it selected allows
      // immediate dragging or deletion without searching.
      setSelectedVertex(edgeIndex + 1);
    },
    [applyOutline],
  );

  // Real pointers fire pointerdown and THEN click on the same handle; without this
  // window, action would insert duplicate vertices. Standalone clicks proceed normally.
  const lastEdgeInsert = useRef<{ edge: number; at: number } | null>(null);

  const handleEdgePointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, edgeIndex: number) => {
      if (e.button !== 0) return;
      e.preventDefault();
      lastEdgeInsert.current = { edge: edgeIndex, at: Date.now() };
      insertAtEdge(edgeIndex);
    },
    [insertAtEdge],
  );

  const handleEdgeActivate = useCallback(
    (edgeIndex: number) => {
      const last = lastEdgeInsert.current;
      if (last && last.edge === edgeIndex && Date.now() - last.at < 600) {
        lastEdgeInsert.current = null;
        return;
      }
      insertAtEdge(edgeIndex);
    },
    [insertAtEdge],
  );

  const deleteVertex = useCallback(
    (index: number) => {
      const next = removeVertex(outlineRef.current, index);
      // removeVertex returns SAME reference when deletion fails (3-vertex floor minimum);
      // keeps logic centralized while reporting to user.
      if (next === outlineRef.current) {
        setToast({
          message: `A room needs at least ${MIN_OUTLINE_VERTICES} corners.`,
          type: 'error',
        });
        return;
      }
      applyOutline(next);
      setSelectedVertex(null);
    },
    [applyOutline],
  );

  // Changing layout preset may orphan tables outside room: user is warned beforehand
  // continuar, pero nunca en silencio.
  const requestOutline = useCallback(
    (label: string, candidate: Outline) => {
      const warning = outlineWarning(tablesOutsideOutline(tablesRef.current, candidate));
      if (warning) {
        setPendingPreset({ label, outline: candidate, warning });
        return;
      }
      applyOutline(candidate);
      setSelectedVertex(null);
    },
    [applyOutline],
  );

  const confirmPendingPreset = useCallback(() => {
    if (!pendingPreset) return;
    applyOutline(pendingPreset.outline);
    setSelectedVertex(null);
    setPendingPreset(null);
  }, [applyOutline, pendingPreset]);

  const bringTablesInside = useCallback(() => {
    const current = outlineRef.current;
    const strays = tablesRef.current.filter((t) => !tableInsideOutline(t, current));
    if (strays.length === 0) return;
    strays.forEach((t) => {
      const spot = containToOutline(t.pos_x, t.pos_y, t.shape, current, canvasW, canvasH);
      if (spot.x === t.pos_x && spot.y === t.pos_y) return;
      patchTable(t.id, { pos_x: spot.x, pos_y: spot.y });
    });
    setToast({
      message: `${strays.length} table${strays.length === 1 ? '' : 's'} moved inside the room`,
      type: 'success',
    });
  }, [canvasW, canvasH, patchTable]);

  // ---------------- Zones ----------------

  const createZone = useCallback(
    async (name: string, color: string): Promise<FloorZone | null> => {
      setZoneBusy(true);
      try {
        const res = await fetch(`${API_BASE}/floor-zone`, {
          method: 'POST',
          headers: authHeaders(),
          // All five fields are @IsNotEmpty and `floorPlan`/`merchant` sent as plain
          // integers (backend does not infer merchant from JWT in this endpoint).
          body: JSON.stringify({
            merchant: merchantId,
            name,
            color,
            floorPlan: plan.id,
            status: 'active',
          }),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return null;
        }
        const json = (await res.json().catch(() => ({}))) as ApiErrorBody & {
          data?: FloorZone;
        };
        if (!res.ok || !json.data) {
          throw new Error(errorMessageOf(json) || 'Failed to create the floor zone');
        }
        const created = json.data;
        setZones((prev) => [...prev, created]);
        setActiveZoneId(created.id);
        return created;
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Failed to create the floor zone',
          type: 'error',
        });
        return null;
      } finally {
        setZoneBusy(false);
      }
    },
    [authHeaders, handleUnauthorized, merchantId, plan.id],
  );

  const updateZone = useCallback(
    async (id: number, name: string, color: string): Promise<FloorZone | null> => {
      setZoneBusy(true);
      try {
        // PATCH without `merchant`: zone does not change merchant on rename.
        const res = await fetch(`${API_BASE}/floor-zone/${id}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ name, color }),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return null;
        }
        const json = (await res.json().catch(() => ({}))) as ApiErrorBody & {
          data?: FloorZone;
        };
        if (!res.ok) {
          throw new Error(errorMessageOf(json) || 'Failed to update the floor zone');
        }
        const updated = json.data ?? null;
        setZones((prev) =>
          prev.map((z) => (z.id === id ? { ...z, ...(updated ?? {}), name, color } : z)),
        );
        return updated;
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Failed to update the floor zone',
          type: 'error',
        });
        return null;
      } finally {
        setZoneBusy(false);
      }
    },
    [authHeaders, handleUnauthorized],
  );

  // ---------------- Zone areas ----------------

  const markZoneDirty = useCallback((id: number) => {
    setDirtyZoneIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  /** Draws a default region for active zone: centered quarter of canvas. */
  const drawZoneArea = useCallback(() => {
    if (activeZoneId == null) return;
    const w = Math.max(120, Math.round(canvasW / 2));
    const h = Math.max(120, Math.round(canvasH / 2));
    const x = Math.round((canvasW - w) / 2);
    const y = Math.round((canvasH - h) / 2);
    const rect: Outline = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    setZoneAreas((prev) => new Map(prev).set(activeZoneId, rect));
    markZoneDirty(activeZoneId);
    setSelectedZoneVertex(null);
  }, [activeZoneId, canvasW, canvasH, markZoneDirty]);

  /** Clears region: zone reverts to a color tag without spatial bounds. */
  const clearZoneArea = useCallback(() => {
    if (activeZoneId == null) return;
    setZoneAreas((prev) => {
      const next = new Map(prev);
      next.delete(activeZoneId);
      return next;
    });
    markZoneDirty(activeZoneId);
    setSelectedZoneVertex(null);
  }, [activeZoneId, markZoneDirty]);

  /** Resolves which zone polygon contains a given canvas coordinate point. */
  const zoneAtPoint = useCallback(
    (x: number, y: number): number | null => {
      for (const [id, poly] of zoneAreas) {
        if (pointInPolygon({ x, y }, poly)) return id;
      }
      return null;
    },
    [zoneAreas],
  );

  const handleSaveZoneDraft = useCallback(async () => {
    const name = zoneDraftName.trim();
    if (!name || zoneBusy) return;
    if (zoneDraftEditId != null) {
      const ok = await updateZone(zoneDraftEditId, name, zoneDraftColor);
      if (ok !== null) {
        setZoneDraftOpen(false);
        setZoneDraftEditId(null);
      }
      return;
    }
    const created = await createZone(name, zoneDraftColor);
    if (created) {
      setZoneDraftOpen(false);
      setZoneDraftName('');
    }
  }, [
    createZone,
    updateZone,
    zoneBusy,
    zoneDraftColor,
    zoneDraftEditId,
    zoneDraftName,
  ]);


  // ---------------- Add table ----------------

  const addTable = useCallback(
    async (shape: TableShape) => {
      let zone: FloorZone | null =
        zones.find((z) => z.id === activeZoneId) ?? zones[0] ?? null;

      // `floorZone` is required when creating a table (@IsNotEmpty in CreateTableDto):
      // automatically creates a default "General" zone on first run if none exist.
      if (!zone) {
        zone = await createZone('General', DEFAULT_ZONE_COLOR);
        if (!zone) return;
      }
      if (activeZoneId !== zone.id) setActiveZoneId(zone.id);

      const zoneRef = { id: zone.id, name: zone.name, color: zone.color ?? null };
      const tempId = tempIdRef.current;
      tempIdRef.current -= 1;
      // Leemos el contorno fuera del updater: React puede invocarlo dos veces en modo estricto
      // and available space must be computed against the same room geometry.
      const currentOutline = outlineRef.current;

      setTables((prev) => {
        const taken = new Set(takenNumbers);
        prev.forEach((t) => taken.add((t.number ?? '').toLowerCase()));
        const spot = findFreeSpot(shape, prev, canvasW, canvasH, currentOutline);
        const fresh: EditorTable = {
          id: tempId,
          merchant_id: merchantId,
          number: nextTableNumber(taken),
          capacity: 4,
          status: 'available',
          // `location` is also @IsNotEmpty: zone name is used as default
          // fallback to prevent 400 validation error.
          location: zone.name,
          rotation: 0,
          shape,
          pos_x: spot.x,
          pos_y: spot.y,
          floorPlan: { id: plan.id, name: plan.name },
          floorZone: zoneRef,
        };
        return [...prev, fresh];
      });
      setSelectedIds([tempId]);
    },
    [activeZoneId, canvasW, canvasH, createZone, merchantId, plan.id, plan.name, takenNumbers, zones],
  );

  // ---------------- Arrastre ----------------

  // Screen -> canvas: container is transformed via CSS scale, meaning
  // getBoundingClientRect is scaled; divide by zoom to obtain true canvas px.
  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    },
    [zoom],
  );

  const handleTablePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, t: EditorTable) => {
      // Embedded controls (such as quick delete button) must not initiate table dragging.
      if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
      // Ctrl/Cmd (or Shift) toggles selection and DOES NOT drag: isolating gestures
      // prevents accidental displacement when adding items.
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
      if (additive) {
        setSelectedIds((prev) =>
          prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
        );
        e.preventDefault();
        return;
      }
      // Dragging a table in a multi-selection retains group; otherwise single click
      // resets selection to that table.
      setSelectedIds((prev) => (prev.includes(t.id) ? prev : [t.id]));
      // preventDefault() cancels mousedown and implicit focus, so focus is set manually;
      // without focus, arrow keys fail to reach table. preventScroll avoids jumpy viewport.
      e.currentTarget.focus({ preventScroll: true });
      // Only primary button triggers drag: secondary button opens context menu,
      // and moving table during right-click leaves layout inadvertently dirty.
      if (e.button !== 0) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      dragRef.current = { id: t.id, dx: point.x - t.pos_x, dy: point.y - t.pos_y };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom / navegadores antiguos sin pointer capture: el arrastre sigue funcionando
        // mientras el puntero no salga del elemento.
      }
      e.preventDefault();
    },
    [toCanvasCoords],
  );

  /**
  * Dragging over EMPTY canvas: draws selection marquee.
  *
  * Triggers only when pointerdown initiates outside tables, preventing collision
  * between table dragging and marquee selection.
  */
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      setSelectedVertex(null);
      if (mode !== 'tables' || e.button !== 0) {
        setSelectedIds([]);
        return;
      }
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
      // Without modifier, marquee replaces selection; with modifier, extends it.
      if (!additive) setSelectedIds([]);
      setMarquee({ x1: point.x, y1: point.y, x2: point.x, y2: point.y, additive });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // See comment on table pointerdown handler.
      }
    },
    [mode, toCanvasCoords],
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!marquee) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      setMarquee((prev) => (prev ? { ...prev, x2: point.x, y2: point.y } : prev));
    },
    [marquee, toCanvasCoords],
  );

  const handleCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!marquee) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // See comment on table pointerdown handler.
      }
      const left = Math.min(marquee.x1, marquee.x2);
      const right = Math.max(marquee.x1, marquee.x2);
      const top = Math.min(marquee.y1, marquee.y2);
      const bottom = Math.max(marquee.y1, marquee.y2);
      setMarquee(null);

      // A click without movement does not marquee: deselects, matching standard
      // desktop behavior when clicking empty floor.
      if (right - left < 4 && bottom - top < 4) return;

      // Intersecting bounds is sufficient: requiring full containment is cumbersome
      // in dense floor plans.
      const hit = tablesRef.current
        .filter((t) => {
          const fp = footprintOfTable(t);
          return (
            t.pos_x < right &&
            t.pos_x + fp.w > left &&
            t.pos_y < bottom &&
            t.pos_y + fp.h > top
          );
        })
        .map((t) => t.id);

      setSelectedIds((prev) =>
        marquee.additive ? Array.from(new Set([...prev, ...hit])) : hit,
      );
    },
    [marquee],
  );

  const handleTablePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      moveTable(drag.id, point.x - drag.dx, point.y - drag.dy);
    },
    [moveTable, toCanvasCoords],
  );

  const handleTablePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ver comentario en pointerdown.
      }
      // On release, table center point determines zone: if it lands in a defined
      // zone polygon, table is reassigned to it.
      const table = tablesRef.current.find((t) => t.id === drag.id);
      if (!table) return;
      const fp = footprintOfTable(table);
      const zoneId = zoneAtPoint(table.pos_x + fp.w / 2, table.pos_y + fp.h / 2);
      if (zoneId != null && table.floorZone?.id !== zoneId) {
        const zone = zones.find((z) => z.id === zoneId);
        if (zone) {
          patchTable(table.id, {
            floorZone: { id: zone.id, name: zone.name, color: zone.color ?? null },
          });
        }
      }
    },
    [patchTable, zoneAtPoint, zones],
  );

  // ---- Vertex dragging (ROOM SHAPE mode) ----

  // Zone polygon vertex dragging: tracks pointer offset so vertex does not snap
  // abruptly on pointerdown.
  const zoneVertexDragRef = useRef<{ index: number; dx: number; dy: number } | null>(null);

  const handleZoneVertexPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>, index: number) => {
      setSelectedZoneVertex(index);
      if (e.button !== 0 || activeZoneId == null) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      const poly = zoneAreas.get(activeZoneId);
      const vertex = poly?.[index];
      if (!point || !vertex) return;
      zoneVertexDragRef.current = { index, dx: point.x - vertex.x, dy: point.y - vertex.y };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom no implementa setPointerCapture.
      }
      e.preventDefault();
    },
    [activeZoneId, toCanvasCoords, zoneAreas],
  );

  const handleZoneVertexPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const drag = zoneVertexDragRef.current;
      if (!drag || activeZoneId == null) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      // Snap to grid and clamp to canvas in unscaled canvas coordinates.
      const x = clamp(snap(point.x - drag.dx), 0, canvasW);
      const y = clamp(snap(point.y - drag.dy), 0, canvasH);
      setZoneAreas((prev) => {
        const poly = prev.get(activeZoneId);
        if (!poly) return prev;
        const next = poly.map((p, i) => (i === drag.index ? { x, y } : p));
        return new Map(prev).set(activeZoneId, next);
      });
      markZoneDirty(activeZoneId);
    },
    [activeZoneId, canvasW, canvasH, markZoneDirty, toCanvasCoords],
  );

  const handleZoneVertexPointerUp = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    zoneVertexDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // jsdom.
    }
  }, []);

  const handleVertexPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>, index: number) => {
      setSelectedVertex(index);
      try {
        // Same as tables: preventDefault() eliminates implicit focus; focus is set
        // explicitly so arrow keys work.
        e.currentTarget.focus({ preventScroll: true });
      } catch {
        // jsdom no implementa focus() en SVGElement.
      }
      if (e.button !== 0) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      const vertex = outlineRef.current[index];
      if (!point || !vertex) return;
      vertexDragRef.current = { index, dx: point.x - vertex.x, dy: point.y - vertex.y };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // See table dragging comment.
      }
      e.preventDefault();
    },
    [toCanvasCoords],
  );

  const handleVertexPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const drag = vertexDragRef.current;
      if (!drag) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      moveVertex(drag.index, point.x - drag.dx, point.y - drag.dy);
    },
    [moveVertex, toCanvasCoords],
  );

  const handleVertexPointerUp = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    if (!vertexDragRef.current) return;
    vertexDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // See table dragging comment.
    }
  }, []);

  const handleVertexKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGRectElement>, index: number) => {
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-SNAP_PX, 0],
        ArrowRight: [SNAP_PX, 0],
        ArrowUp: [0, -SNAP_PX],
        ArrowDown: [0, SNAP_PX],
      };
      const delta = deltas[e.key];
      if (delta) {
        e.preventDefault();
        setSelectedVertex(index);
        const vertex = outlineRef.current[index];
        if (vertex) moveVertex(index, vertex.x + delta[0], vertex.y + delta[1]);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteVertex(index);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelectedVertex(index);
      }
    },
    [deleteVertex, moveVertex],
  );

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, t: EditorTable) => {
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-SNAP_PX, 0],
        ArrowRight: [SNAP_PX, 0],
        ArrowUp: [0, -SNAP_PX],
        ArrowDown: [0, SNAP_PX],
      };
      const delta = deltas[e.key];
      if (delta) {
        e.preventDefault();
        setSelectedIds([t.id]);
        moveTable(t.id, t.pos_x + delta[0], t.pos_y + delta[1]);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelectedIds([t.id]);
      }
    },
    [moveTable],
  );

  // ---------------- Guardado ----------------

  const handleSave = useCallback(async () => {
    if (saving || dirtyCount === 0) return;
    setSaving(true);
    setSaveErrors([]);

    const failures: string[] = [];
    const savedDeletes: number[] = [];
    const savedUpdates: number[] = [];
    const created: Array<{ tempId: number; row: DiningTable }> = [];
    let unauthorized = false;

    // Boundary is persisted independently: if it fails, tables still save (and vice versa);
    // errors accumulate and are displayed together without losing user work.
    let outlineSaved = false;
    // Zone regions: each is saved via PATCH to its corresponding zone, not the plan.
    for (const zoneId of dirtyZoneIds) {
      const poly = zoneAreas.get(zoneId);
      const zone = zones.find((z) => z.id === zoneId);
      try {
        const res = await fetch(`${API_BASE}/floor-zone/${zoneId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          // Only `area`: backend update uses Object.assign, so sending scalar IDs
          // would destroy relational entity links.
          body: JSON.stringify({ area: poly ? serializeOutline(poly) : null }),
        });
        if (res.status === 401) {
          unauthorized = true;
        } else if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
          throw new Error(errorMessageOf(json) || 'Zone area rejected by the server');
        }
      } catch (err) {
        failures.push(
          `Zone ${zone?.name ?? zoneId}: ${err instanceof Error ? err.message : 'area could not be saved'}`,
        );
      }
    }

    if (outlineDirty) {
      const invalid = validateOutline(outline);
      if (invalid) {
        failures.push(`Room shape: ${invalid}`);
      } else {
        try {
          const res = await fetch(`${API_BASE}/floor-plan/${plan.id}`, {
            method: 'PATCH',
            headers: authHeaders(),
            // ONLY `outline`: backend update uses Object.assign, so sending scalar
            // `merchant` would corrupt relationship.
            body: JSON.stringify({ outline: serializeOutline(outline) }),
          });
          if (res.status === 401) {
            unauthorized = true;
          } else if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
            throw new Error(errorMessageOf(json) || 'Room shape rejected by the server');
          } else {
            outlineSaved = true;
          }
        } catch (err) {
          failures.push(
            `Room shape: ${err instanceof Error ? err.message : 'could not be saved'}`,
          );
        }
      }
    }

    // Sequential by design: backend validates unique table numbers per merchant;
    // serial execution prevents race conditions and links errors to specific tables.
    if (!unauthorized) {
      for (const id of pendingDeletes) {
        try {
          const res = await fetch(`${API_BASE}/tables/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
          });
          if (res.status === 401) {
            unauthorized = true;
            break;
          }
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
            throw new Error(errorMessageOf(json) || 'Delete rejected by the server');
          }
          savedDeletes.push(id);
        } catch (err) {
          failures.push(
            `Table #${id}: ${err instanceof Error ? err.message : 'could not be deleted'}`,
          );
        }
      }
    }

    if (!unauthorized) {
      // A new table may join another new table: parents are created first so
      // so that its real id exists when processing the child table.
      const pending = tables.filter((row) => row.id < 0);
      const newIds = new Set(pending.map((t) => t.id));
      const parentsFirst = [
        ...pending.filter((t) => {
          const pid = parentTableId(t);
          return pid == null || !newIds.has(pid);
        }),
        ...pending.filter((t) => {
          const pid = parentTableId(t);
          return pid != null && newIds.has(pid);
        }),
      ];

      for (const t of parentsFirst) {
        const zoneId = t.floorZone?.id ?? activeZoneId;
        if (!zoneId) {
          failures.push(`Table ${t.number}: a floor zone is required before saving.`);
          continue;
        }
        const dto: CreateDiningTableDto = {
          merchant_id: merchantId,
          number: t.number.trim(),
          capacity: t.capacity,
          status: t.status,
          location: t.location,
          rotation: Math.round(t.rotation),
          shape: t.shape,
          // Only send custom dimensions if defined; omitting allows backend
          // to persist null and inherit standard shape size.
          ...(t.width != null ? { width: Math.round(t.width) } : {}),
          ...(t.height != null ? { height: Math.round(t.height) } : {}),
          // pos_x/pos_y are integers in Postgres: round client-side for consistent placement.
          pos_x: Math.round(t.pos_x),
          pos_y: Math.round(t.pos_y),
          floorZone: zoneId,
          floorPlan: plan.id,
          // Parent may be a newly created table in this save operation: temporary
          // ID is replaced by assigned ID from POST response.
          ...(resolveParentId(parentTableId(t), created) != null
            ? { parent_table_id: resolveParentId(parentTableId(t), created) }
            : {}),
        };
        try {
          const res = await fetch(`${API_BASE}/tables`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(dto),
          });
          if (res.status === 401) {
            unauthorized = true;
            break;
          }
          const json = (await res.json().catch(() => ({}))) as ApiErrorBody & {
            data?: DiningTable;
          };
          if (!res.ok || !json.data) {
            throw new Error(errorMessageOf(json) || 'Create rejected by the server');
          }
          created.push({ tempId: t.id, row: json.data });
        } catch (err) {
          failures.push(
            `Table ${t.number}: ${err instanceof Error ? err.message : 'could not be created'}`,
          );
        }
      }
    }

    if (!unauthorized) {
      for (const t of tables.filter((row) => row.id > 0 && dirtyIds.has(row.id))) {
        const original = originalById.current.get(t.id);
        const dto: UpdateDiningTableDto = {};
        if (!original || original.number !== t.number) dto.number = t.number.trim();
        if (!original || original.capacity !== t.capacity) dto.capacity = t.capacity;
        if (!original || original.status !== t.status) dto.status = t.status;
        if (!original || original.location !== t.location) dto.location = t.location;
        if (!original || original.rotation !== t.rotation) dto.rotation = Math.round(t.rotation);
        if (!original || original.shape !== t.shape) dto.shape = t.shape;
        if (!original || original.width !== t.width) dto.width = t.width ?? null;
        if (!original || original.height !== t.height) dto.height = t.height ?? null;
        if (!original || original.pos_x !== t.pos_x) dto.pos_x = Math.round(t.pos_x);
        if (!original || original.pos_y !== t.pos_y) dto.pos_y = Math.round(t.pos_y);
        // Compares parent link via parentTableId() rather than field by field: accounts
        // for differences between nested entity and scalar ID.
        if (!original || parentTableId(original) !== parentTableId(t)) {
          dto.parent_table_id = resolveParentId(parentTableId(t), created);
        }
        if (t.floorZone?.id && original?.floorZone?.id !== t.floorZone.id) {
          dto.floorZone = t.floorZone.id;
        }
        // Un PUT sin campos devuelve 400 ("At least one field must be provided").
        if (Object.keys(dto).length === 0) {
          savedUpdates.push(t.id);
          continue;
        }
        try {
          const res = await fetch(`${API_BASE}/tables/${t.id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(dto),
          });
          if (res.status === 401) {
            unauthorized = true;
            break;
          }
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
            throw new Error(errorMessageOf(json) || 'Update rejected by the server');
          }
          savedUpdates.push(t.id);
        } catch (err) {
          failures.push(
            `Table ${t.number}: ${err instanceof Error ? err.message : 'could not be updated'}`,
          );
        }
      }
    }

    if (unauthorized) {
      setSaving(false);
      handleUnauthorized();
      return;
    }

    if (failures.length > 0) {
      // Partial failure: DO NOT reload from server to prevent losing unsaved canvas state.
      // Consolidate successfully persisted items and retain dirty state on remainder.
      if (created.length > 0) {
        const byTempId = new Map(created.map((c) => [c.tempId, c.row]));
        setTables((prev) =>
          prev.map((t) => {
            const row = byTempId.get(t.id);
            if (!row) return t;
            // POST returns floorZone/floorPlan as {id, name}: preserve local
            // object styling attributes if missing in response.
            return {
              ...t,
              ...row,
              floorPlan: row.floorPlan ?? t.floorPlan,
              floorZone: row.floorZone ?? t.floorZone,
            };
          }),
        );
        // Server row becomes new baseline for future diff computation.
        created.forEach((c) => originalById.current.set(c.row.id, { ...c.row }));
        setTakenNumbers((prev) => {
          const next = new Set(prev);
          created.forEach((c) => next.add((c.row.number ?? '').toLowerCase()));
          return next;
        });
      }
      savedUpdates.forEach((id) => {
        const row = tables.find((t) => t.id === id);
        if (row) originalById.current.set(id, { ...row });
      });
      setDirtyIds((prev) => new Set([...prev].filter((id) => !savedUpdates.includes(id))));
      setPendingDeletes((prev) => prev.filter((id) => !savedDeletes.includes(id)));
      // Boundary succeeded even if a table failed: do not resend unnecessarily.
      if (outlineSaved) setOutlineDirty(false);
      if (failures.length === 0) setDirtyZoneIds(new Set());
      setSaveErrors(failures);
      setToast({
        message: `${failures.length} change${failures.length === 1 ? '' : 's'} could not be saved`,
        type: 'error',
      });
      setSaving(false);
      return;
    }

    // loadLayout() reloads tables and zones; saved boundary is already truth locally,
    // avoiding stale props overwrite until parent re-renders.
    await loadLayout();
    setOutlineDirty(false);
    setSelectedIds([]);
    setSaving(false);
    setToast({ message: 'Floor plan layout saved', type: 'success' });
    onSaved?.();
  }, [
    activeZoneId,
    authHeaders,
    dirtyCount,
    dirtyIds,
    handleUnauthorized,
    loadLayout,
    merchantId,
    onSaved,
    outline,
    outlineDirty,
    pendingDeletes,
    plan.id,
    saving,
    tables,
  ]);

  // ---------------- Cierre ----------------

  const requestClose = useCallback(() => {
    if (dirtyCount > 0) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirtyCount, onClose]);

  // Escape key deselects before dismissing modal: losing selection is cheap, losing layout is not.
  useModalDismiss(() => {
    if (dragRef.current || vertexDragRef.current) return;
    if (confirmClose) {
      setConfirmClose(false);
      return;
    }
    if (pendingPreset) {
      setPendingPreset(null);
      return;
    }
    if (selectedVertex !== null) {
      setSelectedVertex(null);
      return;
    }
    if (selectedIds.length > 0) {
      setSelectedIds([]);
      return;
    }
    requestClose();
  });

  // Switching modes clears cross-mode selection: table inspector is hidden
  // in ROOM SHAPE mode, avoiding confusing hidden selections.
  const switchMode = useCallback((next: EditorMode) => {
    setMode(next);
    if (next === 'shape') setSelectedIds([]);
    else if (next === 'zones') {
      setSelectedIds([]);
      setSelectedVertex(null);
    } else setSelectedVertex(null);
  }, []);

  // ---------------- Zoom ----------------

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = ZOOM_STEPS.findIndex((s) => s >= current - 0.001);
      const nextIndex = clamp(
        (index < 0 ? ZOOM_STEPS.length - 1 : index) + direction,
        0,
        ZOOM_STEPS.length - 1,
      );
      return ZOOM_STEPS[nextIndex];
    });
  }, []);

  const resetZoom = useCallback(() => {
    const el = viewportRef.current;
    const w = (el?.clientWidth ?? 0) - 64;
    const h = (el?.clientHeight ?? 0) - 64;
    setZoom(w > 0 && h > 0 ? fitZoom(w, h, canvasW, canvasH) : 1);
  }, [canvasW, canvasH]);

  // ---------------- Unidades ----------------

  // Persisted immediately: users working in feet should not need to reselect on each load.
  const changeUnitSystem = useCallback((next: UnitSystem) => {
    setUnitSystem(next);
    saveUnitSystem(next);
  }, []);

  // ---------------- Render ----------------

  // Stable id per plan: two editors for same plan never coexist, avoiding conflicts.
  // valor generado por React lleva caracteres que ensucian la referencia url(#…) del SVG.
  const gridPatternId = `floor-grid-${plan.id}`;

  const inputClass =
    'w-full bg-[#fef9f1] text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none';
  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider';

  // Legacy status outside standard vocabulary is retained to prevent inadvertent mutation.
  const statusOptions: string[] =
    selectedTable && !isTableStatus(selectedTable.status)
      ? [selectedTable.status, ...TABLE_STATUSES]
      : TABLE_STATUSES;

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      data-testid="floor-plan-editor"
      className="fixed inset-0 z-[1000] flex flex-col bg-[#ece8e0] font-sans text-left outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Floor plan editor — ${plan.name}`}
    >
      {/* ---------------- Top bar ---------------- */}
      <header className="bg-[#222222] px-5 py-3 flex items-center gap-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-white text-xl" aria-hidden="true">
            architecture
          </span>
          <div className="min-w-0">
            <h1 className="text-white font-black text-base tracking-tight truncate">
              {plan.name}
            </h1>
            <p className="text-white/50 text-[11px] font-mono">
              {formatDimensions(canvasW, canvasH, unitSystem)} · {tables.length}{' '}
              {tables.length === 1 ? 'table' : 'tables'}
              {/* Area is only announced when room deviates from standard full rectangle:
              in a rectangle it is already deduced from width × height. */}
              {customShape ? ` · ${formatArea(roomAreaPx2, unitSystem)}` : ''}
            </p>
          </div>
          {/* Live channel connection status, separated from dimension metrics. */}
          <span
            data-testid="editor-realtime-status"
            title={
              liveConnected
                ? 'Live floor updates connected'
                : 'Live floor updates unavailable — the canvas refreshes on reload'
            }
            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
              liveConnected ? 'text-green-400' : 'text-white/40'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              {liveConnected ? 'sensors' : 'sensors_off'}
            </span>
            {liveConnected ? 'Live' : 'Offline'}
          </span>
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${FLOOR_PLAN_STATUS_BADGE_STYLES[planStatus]}`}
          >
            {FLOOR_PLAN_STATUS_LABELS[planStatus]}
          </span>
        </div>

        {/* Mode toggle: Tables vs Room Shape. Both gestures share pointerdown
        on canvas, so they cannot be active simultaneously. */}
        <div
          role="group"
          aria-label="Editor mode"
          className="flex items-center gap-1 bg-white/10 rounded px-1 py-1"
        >
          {(
            [
              { value: 'tables', label: 'Edit tables', text: 'Tables', icon: 'table_restaurant' },
              { value: 'shape', label: 'Edit room shape', text: 'Room shape', icon: 'polyline' },
              { value: 'zones', label: 'Edit zone areas', text: 'Zones', icon: 'grid_view' },
            ] as Array<{ value: EditorMode; label: string; text: string; icon: string }>
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => switchMode(option.value)}
              aria-label={option.label}
              aria-pressed={mode === option.value}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-colors duration-200 ${
                mode === option.value
                  ? 'bg-[#ae001a] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {option.icon}
              </span>
              {option.text}
            </button>
          ))}
        </div>

        {/* Unit system. Placed on top bar for immediate access: managers measure
            in meters or feet and should not have to drill into submenus
            para cambiar de sistema. */}
        <div
          role="group"
          aria-label="Measurement units"
          data-testid="floor-plan-units"
          className="flex items-center gap-1 ml-auto bg-white/10 rounded px-1 py-1"
        >
          {UNIT_SYSTEMS.map((system) => (
            <button
              key={system}
              type="button"
              onClick={() => changeUnitSystem(system)}
              aria-label={UNIT_SYSTEM_ARIA[system]}
              aria-pressed={unitSystem === system}
              title={UNIT_SYSTEM_LABELS[system]}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-colors duration-200 ${
                unitSystem === system
                  ? 'bg-[#ae001a] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              {UNIT_SYSTEM_SHORT[system]}
            </button>
          ))}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 bg-white/10 rounded px-1 py-1">
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="p-1.5 text-white/80 hover:text-white disabled:opacity-30 transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              zoom_out
            </span>
          </button>
          <span
            data-testid="floor-plan-zoom-level"
            className="text-white text-xs font-mono w-12 text-center tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => stepZoom(1)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="p-1.5 text-white/80 hover:text-white disabled:opacity-30 transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              zoom_in
            </span>
          </button>
          <button
            type="button"
            onClick={resetZoom}
            aria-label="Reset zoom to fit"
            className="p-1.5 text-white/80 hover:text-white transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              fit_screen
            </span>
          </button>
        </div>

        {clippedCount > 0 && (
          <span
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-300"
            role="status"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              warning
            </span>
            {clippedCount} outside canvas
          </span>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || dirtyCount === 0}
          data-testid="floor-plan-save"
          aria-label={
            dirtyCount > 0 ? `Save layout (${dirtyCount} pending changes)` : 'Save layout'
          }
          className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            save
          </span>
          {saving ? 'Saving…' : 'Save layout'}
          {dirtyCount > 0 && (
            <span className="bg-white/25 rounded-full px-2 py-0.5 text-[10px] tabular-nums">
              {dirtyCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={requestClose}
          aria-label="Close floor plan editor"
          className="p-2 text-white/60 hover:text-white transition-colors duration-200"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            close
          </span>
        </button>
      </header>

      {/* ---------------- Body ---------------- */}
      <div className="flex-1 flex min-h-0">
        {/* -------- Left tool palette -------- */}
        <aside className="w-60 shrink-0 bg-white border-r border-[#e8e2d8] overflow-y-auto p-4 flex flex-col gap-5">
          <div>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a] mb-2">
              Add table
            </h2>
            <div className="flex flex-col gap-2">
              {TABLE_SHAPES.map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => void addTable(shape)}
                  disabled={loading || zoneBusy || mode === 'shape'}
                  aria-label={`Add ${shape.toLowerCase()} table`}
                  title={
                    mode === 'shape'
                      ? 'Switch back to Tables mode to add a table.'
                      : undefined
                  }
                  className="flex items-center gap-3 px-3 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-left text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    table_restaurant
                  </span>
                  {/* Dimensions stack below shape name: width x height does not fit
                  on the same line as shape label on compact sidebar. */}
                  <span className="min-w-0 flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest">{shape}</span>
                    <span className="text-[10px] text-[#5f5e5e] font-mono">
                      {formatDimensions(
                        TABLE_FOOTPRINT[shape].w,
                        TABLE_FOOTPRINT[shape].h,
                        unitSystem,
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#e8e2d8] pt-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a] mb-2">
              Active zone
            </h2>
            <div className="flex items-center gap-2">
              {/* Color identifies zone: swatch displays active zone tone. */}
              <span
                data-testid="active-zone-swatch"
                aria-hidden="true"
                style={{ backgroundColor: activeZone?.color?.trim() || DEFAULT_ZONE_COLOR }}
                className="inline-block w-6 h-6 rounded border border-[#e8e2d8] shrink-0"
              />
              <select
                value={activeZoneId ?? ''}
                onChange={(e) => setActiveZoneId(e.target.value ? Number(e.target.value) : null)}
                aria-label="Active floor zone"
                className={inputClass}
              >
                {zones.length === 0 && <option value="">No zones yet</option>}
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-[#5f5e5e] mt-1.5 leading-relaxed">
              New tables are assigned to this zone and inherit its colour.
            </p>
            {activeZone && !zoneDraftOpen && (
              <button
                type="button"
                onClick={() => {
                  setZoneDraftEditId(activeZone.id);
                  setZoneDraftName(activeZone.name ?? '');
                  setZoneDraftColor(activeZone.color?.trim() || DEFAULT_ZONE_COLOR);
                  setZoneDraftOpen(true);
                }}
                aria-label={`Edit zone ${activeZone.name}`}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 border border-[#e8e2d8] bg-white text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  palette
                </span>
                Edit this zone
              </button>
            )}

            {zoneDraftOpen ? (
              <div className="mt-3 flex flex-col gap-2 bg-[#f5efe6] border border-[#e8e2d8] p-3 rounded">
                <label htmlFor="new-zone-name" className={labelClass}>
                  {zoneDraftEditId != null ? 'Rename zone' : 'Zone name'}
                </label>
                <input
                  id="new-zone-name"
                  type="text"
                  value={zoneDraftName}
                  onChange={(e) => setZoneDraftName(e.target.value)}
                  placeholder="e.g., Terrace"
                  className={inputClass}
                />
                <div className="flex items-center gap-2">
                  <label htmlFor="new-zone-color" className={labelClass}>
                    Colour
                  </label>
                  <input
                    id="new-zone-color"
                    type="color"
                    value={zoneDraftColor}
                    onChange={(e) => setZoneDraftColor(e.target.value)}
                    className="h-8 w-12 border border-[#e8e2d8] rounded bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveZoneDraft()}
                    disabled={zoneBusy || zoneDraftName.trim().length === 0}
                    className="flex-1 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {zoneBusy
                      ? 'Saving…'
                      : zoneDraftEditId != null
                        ? 'Save zone'
                        : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoneDraftOpen(false);
                      setZoneDraftEditId(null);
                    }}
                    className="flex-1 py-2 border border-[#e8e2d8] bg-white text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setZoneDraftEditId(null);
                  setZoneDraftName('');
                  setZoneDraftColor(DEFAULT_ZONE_COLOR);
                  setZoneDraftOpen(true);
                }}
                aria-label="Create a new floor zone"
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  add
                </span>
                New zone
              </button>
            )}
          </div>

          <div className="border-t border-[#e8e2d8] pt-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a] mb-2">
              How it works
            </h2>
            <ul className="text-[11px] text-[#5f5e5e] leading-relaxed list-disc pl-4 space-y-1">
              {mode === 'tables' ? (
                <>
                  <li>
                    Drag a table to move it — positions snap to a{' '}
                    {formatLength(SNAP_PX, unitSystem)} grid.
                  </li>
                  <li>Arrow keys nudge the focused table.</li>
                  <li>Tables stay inside the room outline, not just inside the canvas.</li>
                </>
              ) : (
                <>
                  <li>Drag a square corner to reshape the room.</li>
                  <li>Click a round midpoint to add a new corner there.</li>
                  <li>Select a corner and press Delete to remove it.</li>
                </>
              )}
              <li>Nothing is persisted until you press Save layout.</li>
            </ul>
          </div>
        </aside>

        {/* -------- Canvas viewport -------- */}
        <div
          ref={viewportRef}
          className="flex-1 min-w-0 overflow-auto p-8 relative"
          onPointerDown={(e) => {
            // Click on empty space outside canvas = deselect.
            if (e.target === e.currentTarget) setSelectedIds([]);
          }}
        >
          {error ? (
            <div className="max-w-md mx-auto border border-red-300 bg-red-50 p-8 text-center rounded">
              <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
                error
              </span>
              <p className="mt-3 text-red-700 font-medium text-sm">{error}</p>
              <button
                type="button"
                onClick={() => void loadLayout()}
                className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <div
              style={{ width: canvasW * zoom, height: canvasH * zoom }}
              className="relative mx-auto"
            >
              <div
                ref={canvasRef}
                data-testid="floor-plan-canvas"
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                style={{
                  width: canvasW,
                  height: canvasH,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  // Dim outer region so room and exterior are immediately distinguishable.
                  backgroundColor: OUTSIDE_FILL,
                  boxShadow: '0 0 0 2px #222222, 0 12px 30px rgba(0,0,0,0.15)',
                  touchAction: 'none',
                }}
                className="relative"
              >
                {/* Floor, grid, and walls. Grid is styled inside boundary polygon
                    fill so it naturally clips to room contours. */}
                <svg
                  width={canvasW}
                  height={canvasH}
                  viewBox={`0 0 ${canvasW} ${canvasH}`}
                  className="absolute inset-0"
                  style={{ pointerEvents: 'none' }}
                  aria-hidden="true"
                >
                  <defs>
                    <pattern
                      id={gridPatternId}
                      width={GRID_PX}
                      height={GRID_PX}
                      patternUnits="userSpaceOnUse"
                    >
                      <rect width={GRID_PX} height={GRID_PX} fill={FLOOR_FILL} />
                      <path
                        d={`M ${GRID_PX} 0 L 0 0 0 ${GRID_PX}`}
                        fill="none"
                        stroke={GRID_LINE}
                        strokeWidth={1}
                      />
                    </pattern>
                  </defs>
                  <path
                    data-testid="room-outline"
                    d={outlinePath(outline)}
                    fill={`url(#${gridPatternId})`}
                    stroke={WALL_COLOR}
                    strokeWidth={WALL_WIDTH}
                    strokeLinejoin="round"
                  />
                </svg>

                {marquee && (
                  <div
                    data-testid="selection-marquee"
                    aria-hidden="true"
                    style={{
                      left: Math.min(marquee.x1, marquee.x2),
                      top: Math.min(marquee.y1, marquee.y2),
                      width: Math.abs(marquee.x2 - marquee.x1),
                      height: Math.abs(marquee.y2 - marquee.y1),
                    }}
                    className="absolute border-2 border-dashed border-[#ae001a] bg-[#ae001a]/10 pointer-events-none z-20"
                  />
                )}

                {/* Join links: dashed lines connecting each child center to its parent center.
                    Rendered before tables so they pass UNDERNEATH them without obscuring numbers or seats. */}
                {joinLinks.length > 0 && (
                  <svg
                    width={canvasW}
                    height={canvasH}
                    viewBox={`0 0 ${canvasW} ${canvasH}`}
                    className="absolute inset-0"
                    style={{ pointerEvents: 'none' }}
                    aria-hidden="true"
                  >
                    {joinLinks.map((link) => {
                      // Dim other join links when a specific group is selected to reduce clutter.
                      const inSelectedGroup =
                        selectedGroupIds.has(link.childId) && selectedGroupIds.has(link.parentId);
                      const dimmed = selectedGroupIds.size > 0 && !inSelectedGroup;
                      return (
                        <line
                          key={`join-${link.childId}`}
                          data-testid={`join-link-${link.childId}`}
                          x1={link.x1}
                          y1={link.y1}
                          x2={link.x2}
                          y2={link.y2}
                          stroke="#ae001a"
                          strokeWidth={inSelectedGroup ? 3 : 2}
                          strokeDasharray="8 6"
                          strokeLinecap="round"
                          opacity={mode === 'tables' ? (dimmed ? 0.25 : 0.85) : 0.2}
                        />
                      );
                    })}
                  </svg>
                )}

                {tables.map((t) => {
                  const fp = footprintOfTable(t);
                  const isSelected = selectedIds.includes(t.id);
                  const joinedTo = parentTableId(t);
                  const clipped = isTableClipped(t, canvasW, canvasH);
                  const outsideRoom = !clipped && !tableInsideOutline(t, outline);
                  const duplicated = duplicateNumbers.has((t.number ?? '').trim().toLowerCase());
                  return (
                    <div
                      key={t.id}
                      data-testid={`floor-table-${t.id}`}
                      role="button"
                      // In ROOM SHAPE mode tables are decorative: un-focusable and inert
                      // to prevent pointer conflicts with vertex editing.
                      tabIndex={mode === 'tables' ? 0 : -1}
                      aria-label={
                        joinedTo != null
                          ? `Table ${t.number}, ${t.capacity} seats, ${t.shape.toLowerCase()}, joined to ${
                              tables.find((x) => x.id === joinedTo)?.number ?? `#${joinedTo}`
                            }`
                          : `Table ${t.number}, ${t.capacity} seats, ${t.shape.toLowerCase()}`
                      }
                      aria-pressed={isSelected}
                      onPointerDown={(e) => handleTablePointerDown(e, t)}
                      onPointerMove={handleTablePointerMove}
                      onPointerUp={handleTablePointerUp}
                      onPointerCancel={handleTablePointerUp}
                      // Reset drag if pointer capture is lost to prevent stuck dragged items.
                      onLostPointerCapture={handleTablePointerUp}
                      onKeyDown={(e) => handleTableKeyDown(e, t)}
                      title={
                        clipped
                          ? 'This table sits outside the canvas bounds — drag it back inside.'
                          : outsideRoom
                            ? 'This table sits outside the room outline — drag it back inside.'
                            : duplicated
                              ? 'Duplicate table number — numbers must be unique per merchant.'
                              : undefined
                      }
                      style={{
                        left: t.pos_x,
                        top: t.pos_y,
                        width: fp.w,
                        height: fp.h,
                        transform: `rotate(${t.rotation}deg)`,
                        backgroundColor: tableColor(t),
                        touchAction: 'none',
                        // Dimmed and inert while editing room boundary: serves as reference.
                        // referencia visual, pero no capturan el puntero.
                        opacity: mode === 'tables' ? 1 : 0.35,
                        pointerEvents: mode === 'tables' ? undefined : 'none',
                        // Warning highlight for out-of-bounds tables or duplicates: uses
                        // box-shadow rather than ring to avoid selection outline clash.
                        boxShadow:
                          clipped || outsideRoom || duplicated
                            ? '0 0 0 3px #fbbf24, 0 4px 10px rgba(0,0,0,0.2)'
                            : '0 4px 10px rgba(0,0,0,0.2)',
                      }}
                      className={[
                        'absolute flex flex-col items-center justify-center select-none cursor-grab active:cursor-grabbing text-white',
                        shapeRadiusClass(t.shape),
                        isSelected
                          ? 'outline outline-2 outline-offset-2 outline-[#ae001a] z-10'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="text-xs font-black tracking-tight drop-shadow">
                        {t.number}
                      </span>
                      <span className="text-[10px] font-semibold opacity-80 flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                          person
                        </span>
                        {t.capacity}
                      </span>
                      {t.id < 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-white text-[#ae001a] text-[8px] font-black uppercase px-1 rounded-full border border-[#ae001a]">
                          new
                        </span>
                      )}
                      {joinedTo != null && (
                        <span
                          data-testid={`join-badge-${t.id}`}
                          // Counter-rotate join icon so icon remains upright regardless of table angle.
                          style={{ transform: `rotate(${-t.rotation}deg)` }}
                          title={`Joined to ${
                            tables.find((x) => x.id === joinedTo)?.number ??
                            t.parent_table?.number ??
                            `#${joinedTo}`
                          }`}
                          className="absolute -top-1.5 -left-1.5 bg-white text-[#ae001a] w-4 h-4 rounded-full border border-[#ae001a] flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-[10px]" aria-hidden="true">
                            link
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Zone regions: translucent fills matching each zone color.
                    Rendered in ALL modes and beneath tables — serving as the background
                    layer that identifies spatial zone assignments. */}
                <svg
                  width={canvasW}
                  height={canvasH}
                  viewBox={`0 0 ${canvasW} ${canvasH}`}
                  className="absolute inset-0"
                  style={{ pointerEvents: 'none', overflow: 'visible' }}
                  aria-hidden="true"
                >
                  {zones.map((z) => {
                    const poly = zoneAreas.get(z.id);
                    if (!poly || poly.length < 3) return null;
                    const colour = z.color?.trim() || DEFAULT_ZONE_COLOR;
                    const isActive = z.id === activeZoneId;
                    const b = polygonBounds(poly);
                    return (
                      <g key={`zone-area-${z.id}`} data-testid={`zone-area-${z.id}`}>
                        <path
                          d={outlinePath(poly)}
                          fill={colour}
                          fillOpacity={isActive && mode === 'zones' ? 0.28 : 0.16}
                          stroke={colour}
                          strokeOpacity={isActive && mode === 'zones' ? 0.9 : 0.5}
                          strokeWidth={(isActive && mode === 'zones' ? 3 : 2) / zoom}
                          strokeDasharray={mode === 'zones' && !isActive ? `${6 / zoom}` : undefined}
                        />
                        <text
                          x={b.minX + 8 / zoom}
                          y={b.minY + 20 / zoom}
                          fill={colour}
                          fontSize={14 / zoom}
                          fontWeight="700"
                          style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                        >
                          {z.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {mode === 'zones' && activeZoneId != null && zoneAreas.get(activeZoneId) && (
                  <svg
                    width={canvasW}
                    height={canvasH}
                    viewBox={`0 0 ${canvasW} ${canvasH}`}
                    className="absolute inset-0"
                    style={{ pointerEvents: 'none', overflow: 'visible' }}
                  >
                    {zoneAreas.get(activeZoneId)!.map((p, i) => {
                      const size = VERTEX_HANDLE_PX / zoom;
                      return (
                        <rect
                          key={`zone-vertex-${i}`}
                          data-testid={`zone-vertex-${i}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Zone corner ${i + 1}`}
                          x={p.x - size / 2}
                          y={p.y - size / 2}
                          width={size}
                          height={size}
                          fill={selectedZoneVertex === i ? '#ffffff' : activeZone?.color ?? WALL_COLOR}
                          stroke={activeZone?.color ?? WALL_COLOR}
                          strokeWidth={2 / zoom}
                          style={{ pointerEvents: 'auto', cursor: 'grab' }}
                          onPointerDown={(e) => handleZoneVertexPointerDown(e, i)}
                          onPointerMove={handleZoneVertexPointerMove}
                          onPointerUp={handleZoneVertexPointerUp}
                        />
                      );
                    })}
                  </svg>
                )}

                {/* Boundary outline handles. Rendered AFTER tables to paint on top:
                    in a crowded room, a vertex underneath a table would be unclickable.
                    The layer does not capture pointer events except on the handles themselves. */}
                {mode === 'shape' && (
                  <svg
                    width={canvasW}
                    height={canvasH}
                    viewBox={`0 0 ${canvasW} ${canvasH}`}
                    className="absolute inset-0"
                    style={{ pointerEvents: 'none', overflow: 'visible' }}
                  >
                    {outline.map((p, i) => {
                      // Midpoint of edge i -> i+1 (last wraps back to vertex 0).
                      const next = outline[(i + 1) % outline.length];
                      return (
                        <circle
                          key={`edge-${i}`}
                          data-testid={`outline-edge-${i}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Add a corner on wall ${i + 1}`}
                          cx={(p.x + next.x) / 2}
                          cy={(p.y + next.y) / 2}
                          r={EDGE_HANDLE_PX / zoom}
                          fill={WALL_COLOR}
                          fillOpacity={0.35}
                          stroke="#ffffff"
                          strokeWidth={1.5 / zoom}
                          style={{ pointerEvents: 'auto', cursor: 'copy' }}
                          onPointerDown={(e) => handleEdgePointerDown(e, i)}
                          onClick={() => handleEdgeActivate(i)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleEdgeActivate(i);
                            }
                          }}
                        />
                      );
                    })}

                    {outline.map((p, i) => {
                      // Sized in screen px: dividing by zoom keeps handle target size constant.
                      const size = VERTEX_HANDLE_PX / zoom;
                      const isVertexSelected = selectedVertex === i;
                      return (
                        <rect
                          key={`vertex-${i}`}
                          data-testid={`outline-vertex-${i}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Room corner ${i + 1} at ${formatLength(
                            p.x,
                            unitSystem,
                          )}, ${formatLength(p.y, unitSystem)}`}
                          aria-pressed={isVertexSelected}
                          x={p.x - size / 2}
                          y={p.y - size / 2}
                          width={size}
                          height={size}
                          fill={isVertexSelected ? '#ae001a' : '#ffffff'}
                          stroke={WALL_COLOR}
                          strokeWidth={2 / zoom}
                          style={{
                            pointerEvents: 'auto',
                            cursor: 'grab',
                            touchAction: 'none',
                          }}
                          onPointerDown={(e) => handleVertexPointerDown(e, i)}
                          onPointerMove={handleVertexPointerMove}
                          onPointerUp={handleVertexPointerUp}
                          onPointerCancel={handleVertexPointerUp}
                          onLostPointerCapture={handleVertexPointerUp}
                          onKeyDown={(e) => handleVertexKeyDown(e, i)}
                        />
                      );
                    })}
                  </svg>
                )}
              </div>

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#ece8e0]/70">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Loading layout…
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* -------- Right inspector -------- */}
        <aside
          className="w-80 shrink-0 bg-white border-l border-[#e8e2d8] overflow-y-auto"
          data-no-drag="true"
        >
          <div className="bg-[#f5efe6] border-b border-[#e8e2d8] px-4 py-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
              {mode === 'shape'
                ? 'Room shape'
                : mode === 'zones'
                  ? 'Zone areas'
                  : 'Table inspector'}
            </h2>
          </div>

          {mode === 'zones' ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: activeZone?.color?.trim() || DEFAULT_ZONE_COLOR }}
                  className="inline-block w-6 h-6 rounded border border-[#e8e2d8] shrink-0"
                />
                <select
                  value={activeZoneId ?? ''}
                  onChange={(e) => {
                    setActiveZoneId(e.target.value ? Number(e.target.value) : null);
                    setSelectedZoneVertex(null);
                  }}
                  aria-label="Zone being edited"
                  className={inputClass}
                >
                  {zones.length === 0 && <option value="">No zones yet</option>}
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeZoneId != null && zoneAreas.get(activeZoneId) ? (
                <>
                  <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
                    Drag the square corners to reshape this zone. Tables dropped inside it are
                    assigned to it automatically.
                  </p>
                  <p className="text-[11px] font-mono text-[#1d1c17]">
                    {zoneAreas.get(activeZoneId)!.length} corners ·{' '}
                    {formatArea(polygonArea(zoneAreas.get(activeZoneId)!), unitSystem)}
                  </p>
                  <button
                    type="button"
                    onClick={clearZoneArea}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      delete
                    </span>
                    Remove area
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
                    This zone has no area drawn yet, so it only colours its tables. Draw one to
                    mark which part of the room belongs to it.
                  </p>
                  <button
                    type="button"
                    onClick={drawZoneArea}
                    disabled={activeZoneId == null}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      draw
                    </span>
                    Draw area
                  </button>
                </>
              )}
            </div>
          ) : mode === 'shape' ? (
            <div className="p-4 flex flex-col gap-4" data-testid="floor-plan-room-panel">
              <div>
                <p className={labelClass}>Room presets</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {OUTLINE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        requestOutline(preset.label, preset.build(canvasW, canvasH))
                      }
                      aria-label={`Apply ${preset.label} room preset`}
                      className="px-2 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 rounded"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => requestOutline('Rectangle', rectangleOutline(canvasW, canvasH))}
                  aria-label="Reset room shape to the full canvas"
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    restart_alt
                  </span>
                  Reset to full canvas
                </button>
              </div>

              {/* Warning: applying preset places existing tables out of bounds. */}
              {pendingPreset && (
                <div
                  data-testid="outline-preset-confirm"
                  className="border border-[#ae001a] bg-[#f5efe6] p-3 rounded flex flex-col gap-2"
                >
                  <p className="text-[11px] text-[#1d1c17] leading-relaxed">
                    <strong>{pendingPreset.label}:</strong> {pendingPreset.warning}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={confirmPendingPreset}
                      className="flex-1 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      Apply anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingPreset(null)}
                      className="flex-1 py-2 border border-[#e8e2d8] bg-white text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-[#e8e2d8] pt-4 flex flex-col gap-3">
                <p className="text-[11px] text-[#5f5e5e] font-mono">
                  {outline.length} corners · {formatArea(roomAreaPx2, unitSystem)} ·{' '}
                  {tables.length} {tables.length === 1 ? 'table' : 'tables'}
                </p>

                {selectedVertexPoint ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="insp-corner-x" className={labelClass}>
                        Corner X {lengthSuffix(unitSystem)}
                      </label>
                      <input
                        id="insp-corner-x"
                        type="number"
                        step={COORD_STEP}
                        value={lengthValue(selectedVertexPoint.x, unitSystem)}
                        onChange={(e) =>
                          moveVertex(
                            selectedVertex as number,
                            lengthToPx(Number(e.target.value) || 0, unitSystem),
                            selectedVertexPoint.y,
                          )
                        }
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="insp-corner-y" className={labelClass}>
                        Corner Y {lengthSuffix(unitSystem)}
                      </label>
                      <input
                        id="insp-corner-y"
                        type="number"
                        step={COORD_STEP}
                        value={lengthValue(selectedVertexPoint.y, unitSystem)}
                        onChange={(e) =>
                          moveVertex(
                            selectedVertex as number,
                            selectedVertexPoint.x,
                            lengthToPx(Number(e.target.value) || 0, unitSystem),
                          )
                        }
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
                    Select a corner on the canvas to nudge or delete it.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => deleteVertex(selectedVertex as number)}
                  disabled={selectedVertex === null || outline.length <= MIN_OUTLINE_VERTICES}
                  aria-label="Delete selected room corner"
                  title={
                    outline.length <= MIN_OUTLINE_VERTICES
                      ? `A room needs at least ${MIN_OUTLINE_VERTICES} corners — add one before deleting another.`
                      : selectedVertex === null
                        ? 'Select a corner on the canvas first.'
                        : undefined
                  }
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#ae001a]"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    delete
                  </span>
                  Delete corner
                </button>
              </div>

              <div className="border-t border-[#e8e2d8] pt-4 flex flex-col gap-2">
                <p className={labelClass}>Tables outside the room</p>
                <p className="text-2xl font-black text-[#1d1c17] tabular-nums leading-none">
                  {outsideCount}
                </p>
                {outsideCount > 0 && (
                  <>
                    <p
                      data-testid="outline-warning"
                      role="alert"
                      className="text-[11px] font-semibold text-[#ae001a] leading-relaxed"
                    >
                      {outlineWarning(outsideCount)}
                    </p>
                    <button
                      type="button"
                      onClick={bringTablesInside}
                      aria-label="Bring every table inside the room"
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        move_selection_down
                      </span>
                      Bring all inside
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : selectedIds.length > 1 ? (
            <div className="p-4 flex flex-col gap-4" data-testid="floor-plan-multi-inspector">
              <div>
                <p className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider">
                  Selection
                </p>
                <p className="text-sm text-[#1d1c17] mt-1">
                  <strong>{selectedIds.length} tables</strong> selected ·{' '}
                  {selectedTables.reduce((sum, t) => sum + t.capacity, 0)} seats combined
                </p>
                <p className="text-[11px] text-[#5f5e5e] mt-1 font-mono">
                  {selectedTables.map((t) => t.number).join(', ')}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="multi-parent" className={labelClass}>
                  <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
                    link
                  </span>{' '}
                  Join them under
                </label>
                <select
                  id="multi-parent"
                  value={effectiveJoinParent ?? ''}
                  onChange={(e) => setJoinParentId(Number(e.target.value))}
                  className={inputClass}
                >
                  {selectedTables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.number} · {t.capacity} seats{t.id < 0 ? ' · unsaved' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    effectiveJoinParent != null && joinSelected(effectiveJoinParent)
                  }
                  aria-label={`Join ${selectedIds.length} selected tables`}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    link
                  </span>
                  Join {selectedIds.length} tables
                </button>
                <button
                  type="button"
                  onClick={unjoinSelected}
                  aria-label="Unjoin the selected tables"
                  className="w-full flex items-center justify-center gap-2 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    link_off
                  </span>
                  Unjoin selected
                </button>
              </div>

              <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
                Ctrl/Cmd-click adds or removes a table. Drag on empty floor to box-select. The
                parent keeps the group together; the rest hang from it.
              </p>

              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="w-full py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[10px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
              >
                Clear selection
              </button>
            </div>
          ) : !selectedTable ? (
            <div
              data-testid="floor-plan-inspector-empty"
              className="p-8 text-center flex flex-col items-center gap-3"
            >
              <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
                touch_app
              </span>
              <p className="text-xs text-[#5f5e5e] leading-relaxed">
                Select a table on the canvas to edit its number, capacity, shape, rotation and
                zone.
              </p>
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-4" data-testid="floor-plan-inspector">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-number" className={labelClass}>
                  Table number
                </label>
                <input
                  id="insp-number"
                  type="text"
                  value={selectedTable.number ?? ''}
                  onChange={(e) => patchTable(selectedTable.id, { number: e.target.value })}
                  maxLength={50}
                  className={`${inputClass} font-mono`}
                />
                {duplicateNumbers.has((selectedTable.number ?? '').trim().toLowerCase()) && (
                  <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                    Duplicate table number — numbers must be unique per merchant.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-capacity" className={labelClass}>
                    Capacity
                  </label>
                  <input
                    id="insp-capacity"
                    type="number"
                    min={1}
                    value={selectedTable.capacity}
                    onChange={(e) =>
                      patchTable(selectedTable.id, {
                        capacity: Math.max(1, Math.round(Number(e.target.value) || 1)),
                      })
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-shape" className={labelClass}>
                    Shape
                  </label>
                  <select
                    id="insp-shape"
                    value={selectedTable.shape}
                    onChange={(e) => {
                      const shape = e.target.value as TableShape;
                      const fp = footprintOf(shape);
                      // Cambiar de forma cambia la huella: reencuadramos contra el lienzo y
                      // against room boundaries so table is not partially positioned outside.
                      const spot = containToOutline(
                        clamp(selectedTable.pos_x, 0, Math.max(0, canvasW - fp.w)),
                        clamp(selectedTable.pos_y, 0, Math.max(0, canvasH - fp.h)),
                        shape,
                        outline,
                        canvasW,
                        canvasH,
                      );
                      patchTable(selectedTable.id, {
                        shape,
                        pos_x: spot.x,
                        pos_y: spot.y,
                      });
                    }}
                    className={inputClass}
                  >
                    {TABLE_SHAPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom dimensions: allows deviation from standard shape template.
                  Empty = inherits shape default. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-width" className={labelClass}>
                    Table width {lengthSuffix(unitSystem)}
                  </label>
                  <input
                    id="insp-width"
                    type="number"
                    step={COORD_STEP}
                    min={lengthValue(TABLE_MIN_SIZE_PX, unitSystem)}
                    max={lengthValue(TABLE_MAX_SIZE_PX, unitSystem)}
                    value={lengthValue(footprintOfTable(selectedTable).w, unitSystem)}
                    onChange={(e) => {
                      const px = clamp(
                        lengthToPx(Number(e.target.value) || 0, unitSystem),
                        TABLE_MIN_SIZE_PX,
                        TABLE_MAX_SIZE_PX,
                      );
                      patchTable(selectedTable.id, { width: px });
                    }}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-height" className={labelClass}>
                    Table depth {lengthSuffix(unitSystem)}
                  </label>
                  <input
                    id="insp-height"
                    type="number"
                    step={COORD_STEP}
                    min={lengthValue(TABLE_MIN_SIZE_PX, unitSystem)}
                    max={lengthValue(TABLE_MAX_SIZE_PX, unitSystem)}
                    value={lengthValue(footprintOfTable(selectedTable).h, unitSystem)}
                    onChange={(e) => {
                      const px = clamp(
                        lengthToPx(Number(e.target.value) || 0, unitSystem),
                        TABLE_MIN_SIZE_PX,
                        TABLE_MAX_SIZE_PX,
                      );
                      patchTable(selectedTable.id, { height: px });
                    }}
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              {(selectedTable.width != null || selectedTable.height != null) && (
                <button
                  type="button"
                  onClick={() =>
                    patchTable(selectedTable.id, { width: null, height: null })
                  }
                  className="text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 text-left"
                >
                  Reset to default size
                </button>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-rotation" className={labelClass}>
                  Rotation — {selectedTable.rotation}°
                </label>
                <input
                  id="insp-rotation"
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={selectedTable.rotation}
                  onChange={(e) =>
                    patchTable(selectedTable.id, { rotation: Number(e.target.value) })
                  }
                  className="w-full accent-[#ae001a]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-status" className={labelClass}>
                  Status
                </label>
                <select
                  id="insp-status"
                  value={selectedTable.status}
                  onChange={(e) => patchTable(selectedTable.id, { status: e.target.value })}
                  className={inputClass}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {tableStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-location" className={labelClass}>
                  Location
                </label>
                <input
                  id="insp-location"
                  type="text"
                  value={selectedTable.location}
                  onChange={(e) => patchTable(selectedTable.id, { location: e.target.value })}
                  placeholder="e.g., Near window"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-zone" className={labelClass}>
                  Floor zone
                </label>
                <select
                  id="insp-zone"
                  value={selectedTable.floorZone?.id ?? ''}
                  onChange={(e) => {
                    const zone = zoneById.get(Number(e.target.value));
                    if (!zone) return;
                    patchTable(selectedTable.id, {
                      floorZone: { id: zone.id, name: zone.name, color: zone.color ?? null },
                    });
                  }}
                  className={inputClass}
                >
                  {zones.length === 0 && <option value="">No zones yet</option>}
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-x" className={labelClass}>
                    X {lengthSuffix(unitSystem)}
                  </label>
                  {/* User enters values in active units, converted to pixels locally
                      before persistence. */}
                  <input
                    id="insp-x"
                    type="number"
                    step={COORD_STEP}
                    value={lengthValue(selectedTable.pos_x, unitSystem)}
                    onChange={(e) =>
                      moveTable(
                        selectedTable.id,
                        lengthToPx(Number(e.target.value) || 0, unitSystem),
                        selectedTable.pos_y,
                      )
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-y" className={labelClass}>
                    Y {lengthSuffix(unitSystem)}
                  </label>
                  <input
                    id="insp-y"
                    type="number"
                    step={COORD_STEP}
                    value={lengthValue(selectedTable.pos_y, unitSystem)}
                    onChange={(e) =>
                      moveTable(
                        selectedTable.id,
                        selectedTable.pos_x,
                        lengthToPx(Number(e.target.value) || 0, unitSystem),
                      )
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              {/* ---------------- Table Merging ---------------- */}
              <div className="flex flex-col gap-1.5 pt-3 border-t border-[#e8e2d8]">
                <label htmlFor="insp-parent" className={labelClass}>
                  <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
                    link
                  </span>{' '}
                  Joined to
                </label>
                <select
                  id="insp-parent"
                  value={parentTableId(selectedTable) ?? ''}
                  onChange={(e) =>
                    setTableParent(
                      selectedTable.id,
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className={inputClass}
                >
                  <option value="">Not joined — standalone</option>
                  {parentChoices.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.number} · {t.capacity} seats{t.id < 0 ? ' · unsaved' : ''}
                    </option>
                  ))}
                </select>

                {parentTableId(selectedTable) != null && (
                  <button
                    type="button"
                    onClick={() => setTableParent(selectedTable.id, null)}
                    aria-label={`Unjoin table ${selectedTable.number}`}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      link_off
                    </span>
                    Unjoin
                  </button>
                )}

                {joinedChildrenLabel(tables, selectedTable.id) && (
                  <p
                    data-testid="inspector-group-summary"
                    className="text-[11px] text-[#5f5e5e] leading-relaxed"
                  >
                    {joinedChildrenLabel(tables, selectedTable.id)} —{' '}
                    {childTablesOf(tables, selectedTable.id)
                      .map((c) => c.number)
                      .join(', ')}
                    . Combined capacity{' '}
                    {selectedTable.capacity +
                      childTablesOf(tables, selectedTable.id).reduce(
                        (sum, c) => sum + c.capacity,
                        0,
                      )}
                    .
                  </p>
                )}

                {parentChoices.length === 0 && parentTableId(selectedTable) == null && (
                  <p className="text-[11px] text-[#5f5e5e] italic">
                    No other saved table on this plan can act as the parent.
                  </p>
                )}
              </div>

              {/* ---------------- Guest Transfer ---------------- */}
              {selectedTable.status === 'occupied' && (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTransferOpen(true)}
                    disabled={dirtyCount > 0}
                    aria-label={`Transfer guests from table ${selectedTable.number}`}
                    title={
                      dirtyCount > 0
                        ? 'Save your layout changes first — the transfer runs on the server and would fight your pending edits.'
                        : 'Move this party to another table'
                    }
                    className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#1d1c17]"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      swap_horiz
                    </span>
                    Transfer party
                  </button>
                  {dirtyCount > 0 && (
                    <p className="text-[11px] text-[#5f5e5e] italic">
                      Save the layout to enable the transfer.
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => removeTable(selectedTable.id)}
                aria-label={`Delete table ${selectedTable.number}`}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  delete
                </span>
                Delete table
              </button>
            </div>
          )}

          {saveErrors.length > 0 && (
            <div className="m-4 border border-red-300 bg-red-50 p-3 rounded" role="alert">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-700 mb-1.5">
                Unsaved changes
              </p>
              <ul className="text-[11px] text-red-700 list-disc pl-4 space-y-1">
                {saveErrors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* ---------------- Close Confirmation Modal with Unsaved Changes ---------------- */}
      {confirmClose && (
        <div className="absolute inset-0 z-[1010] bg-black/60 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Discard unsaved layout changes"
            className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="bg-[#222222] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white">
                Unsaved layout changes
              </p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[#1d1c17]">
                You have {dirtyCount} pending change{dirtyCount === 1 ? '' : 's'} on this floor
                plan. Closing the editor now discards them.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="flex-1 py-2.5 border border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                >
                  Discard &amp; close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {transferOpen && selectedTable && (
        <TableTransferModal
          source={selectedTable}
          targets={eligibleTransferTargets(allTables, selectedTable.id)}
          submitting={transferSubmitting}
          onCancel={() => setTransferOpen(false)}
          onSubmit={handleTransfer}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>,
    document.body,
  );
};

export default FloorPlanEditor;
