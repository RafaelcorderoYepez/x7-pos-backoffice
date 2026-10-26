import type { DiningTable, TableShape } from '../types/dining-system';
import { TABLE_FOOTPRINT, tableFootprint } from '../types/dining-system';
import type { Outline } from './floor-geometry';
import { clampPointToPolygon, pointInPolygon, tableInsideOutline } from './floor-geometry';

// Colocación de mesas en el editor de planos: rejilla, zoom, encaje dentro de la sala y numeración.
// Funciones puras, sin React: el editor las usa en arrastres, altas y guardado.

// The background draws a 20px grid, but positions snap every 10px: half a
// cell provides sufficient precision without forcing the user to fine-tune pixel by pixel.
export const GRID_PX = 20;
export const SNAP_PX = 10;

export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max);

export const snap = (v: number): number => Math.round(v / SNAP_PX) * SNAP_PX;

// Footprint depends on the TABLE (can define custom dimensions), not just shape.
// A shape-based fallback is kept for the palette, where a table does not yet exist.
export const footprintOf = (shape: TableShape) =>
  TABLE_FOOTPRINT[shape] ?? TABLE_FOOTPRINT.Square;

export const footprintOfTable = (t: {
  shape: TableShape;
  width?: number | null;
  height?: number | null;
}) => tableFootprint(t);

// Outline corner rounding per shape: oval is a full ellipse, booth has
// heavily smoothed corners, and bar counter is barely rounded.
export const shapeRadiusClass = (shape: TableShape): string => {
  if (shape === 'Circle' || shape === 'Oval') return 'rounded-full';
  if (shape === 'Booth') return 'rounded-2xl';
  return 'rounded';
};

// El mayor paso de zoom que deja el lienzo entero dentro del viewport disponible.
export const fitZoom = (
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
export const containToOutline = (
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
export const findFreeSpot = (
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

/**
 * Resolves real parent table id for payload.
 *
 * Returns existing id as-is, translates temporary negative id to backend-assigned id,
 * and returns null if not joined. If parent was new and creation failed, returns null:
 * better to save child unlinked than sending an invalid synthetic id.
 */
export const resolveParentId = (
  parentId: number | null,
  created: Array<{ tempId: number; row: DiningTable }>,
): number | null => {
  if (parentId == null) return null;
  if (parentId > 0) return parentId;
  return created.find((c) => c.tempId === parentId)?.row.id ?? null;
};

// Next available "T{n}". The UNIQUE (merchant_id, number) index converts
// collisions into hard 409s, so deduplication is performed client-side before POST.
export const nextTableNumber = (taken: Set<string>): string => {
  for (let i = 1; i < 5000; i += 1) {
    const candidate = `T${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `T${Date.now()}`;
};
