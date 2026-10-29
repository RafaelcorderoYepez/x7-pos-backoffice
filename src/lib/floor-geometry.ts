// Room outline geometry of the floor plan editor.
//
// The backend persists the outline as serialized JSON in `floor_plan.outline` (text column,
// nullable). `null` means "full width × height rectangle", which is how they behaved
// the plans prior to this field. Everything here is PURE: no React, no fetch, no DOM,
// so that the editor and the tests share exactly the same geometric truth.
//
// Coordinate system: canvas pixels, origin top-left, +y down (same as
// the absolute positioning of the editor). That's why polygons are written clockwise.
// visual; The area is taken in absolute value and nothing depends on the orientation.

import { tableFootprint } from '../types/dining-system';

export interface Point {
  x: number;
  y: number;
}

export type Outline = Point[];

// A polygon needs 3 corners to enclose a surface; with 2 is a segment.
export const MIN_OUTLINE_VERTICES = 3;

// Tolerance for floating point comparisons. We work in canvas pixels, where a
// Thousandth of a pixel is floating point noise and never a real difference.
const EPSILON = 1e-9;

// ================= Construction =================

/** Full rectangle: the default outline when the plane has no shape of its own. */
export const rectangleOutline = (w: number, h: number): Outline => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

// The presets are calculated in fractions of the canvas and rounded to integers: thus the outline
// It fits the editor's 10px snap and survives serializeOutline back and forth intact.
const at = (total: number, fraction: number): number => Math.round(total * fraction);

/** Plant presets. build() receives the canvas and returns a polygon fitted to it. */
export const OUTLINE_PRESETS: Array<{
  id: string;
  label: string;
  build: (w: number, h: number) => Outline;
}> = [
  {
    id: 'rectangle',
    label: 'Rectangle',
    build: (w, h) => rectangleOutline(w, h),
  },
  {
    // Letter L: vertical bar on the left + horizontal bar below. The notch is the
    // upper right rectangle, which is OUTSIDE the room even though it is inside the canvas.
    id: 'l-shape',
    label: 'L-Shape',
    build: (w, h) => [
      { x: 0, y: 0 },
      { x: at(w, 0.45), y: 0 },
      { x: at(w, 0.45), y: at(h, 0.6) },
      { x: w, y: at(h, 0.6) },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  },
  {
    // Letter U: two vertical legs and bottom bar; the notch opens at the top, in the center.
    id: 'u-shape',
    label: 'U-Shape',
    build: (w, h) => [
      { x: 0, y: 0 },
      { x: at(w, 0.3), y: 0 },
      { x: at(w, 0.3), y: at(h, 0.6) },
      { x: at(w, 0.7), y: at(h, 0.6) },
      { x: at(w, 0.7), y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  },
  {
    // Chamfered top right corner. The chamfer is measured on the short side so that it does not
    // It takes up the entire room in very long canvases.
    id: 'cut-corner',
    label: 'Cut Corner',
    build: (w, h) => {
      const cut = Math.round(Math.min(w, h) * 0.25);
      return [
        { x: 0, y: 0 },
        { x: w - cut, y: 0 },
        { x: w, y: cut },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    },
  },
];

// ================= Serialization =================

// We only accept finite numbers: a NaN or an Infinity slipped into the JSON would blow up the <path>
// of the SVG and would leave the canvas blank without saying why.
const isPoint = (value: unknown): value is Point => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y)
  );
};

/** Tolerates null, JSON string, already parsed array or garbage. NEVER throw: it falls into the rectangle. */
export const parseOutline = (raw: unknown, w: number, h: number): Outline => {
  const fallback = rectangleOutline(w, h);

  // The backend returns string (text column) but the editor can pass the array already alive;
  // We accept both so as not to force serialization and re-parsing on each render.
  let value: unknown = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return fallback;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }

  if (!Array.isArray(value)) return fallback;

  // If only ONE vertex is corrupted, we discard the entire contour instead of filtering it: a
  // A polygon with a missing corner draws the wrong room, and that's worse than falling into the
  // rectangle, because it would validate tables against limits that the user never drew.
  if (!value.every(isPoint)) return fallback;

  const outline: Outline = value.map((p) => ({ x: p.x, y: p.y }));
  return validateOutline(outline) === '' ? outline : fallback;
};

/** JSON with coordinates rounded to integers. */
export const serializeOutline = (o: Outline): string =>
  JSON.stringify(o.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));

// ================= Medidas =================

export const polygonBounds = (
  o: Outline,
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } => {
  // An empty contour has no box: we return the degenerate origin so that the consumer
  // can divide by width/height without checking for null (you'll get 0, not an exception).
  if (o.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  let minX = o[0].x;
  let minY = o[0].y;
  let maxX = o[0].x;
  let maxY = o[0].y;

  for (const p of o) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

/** Area by the shoelace formula, in absolute value and in px². */
export const polygonArea = (o: Outline): number => {
  if (o.length < MIN_OUTLINE_VERTICES) return 0;

  let sum = 0;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    sum += o[j].x * o[i].y - o[i].x * o[j].y;
  }
  return Math.abs(sum) / 2;
};

// ================= Pertenencia =================

// Is `p` on the segment a-b? Vector product ~0 (collinear) and scalar product <=0
// (between the two extremes, not in the extension of the line).
const isOnSegment = (p: Point, a: Point, b: Point): boolean => {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > EPSILON) return false;
  const dot = (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y);
  return dot <= EPSILON;
};

/** Horizontal ray casting, with the edge counting as INSIDE. */
export const pointInPolygon = (p: Point, o: Outline): boolean => {
  if (o.length < MIN_OUTLINE_VERTICES) return false;

  // The edge is resolved separately: the ray casting is ambiguous just on the edge (depending on what
  // side falls the rounding faces in or out), and a table against the wall must be valid.
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    if (isOnSegment(p, o[j], o[i])) return true;
  }

  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = o[i];
    const b = o[j];
    // We only cross edges that cover the height of the point; the asymmetric comparison (> vs >)
    // avoids counting twice a vertex shared by two edges.
    if (a.y > p.y !== b.y > p.y) {
      const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
};

/** `d` attribute of an SVG <path>, closed with Z. */
export const outlinePath = (o: Outline): string => {
  if (o.length === 0) return '';
  return `M ${o.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`;
};

// ================= Drag inside the room =================

// Projection of p onto the segment a-b, bounded to its ends (t in [0,1]).
const projectOnSegment = (p: Point, a: Point, b: Point): Point => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPSILON) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy };
};

const distance2 = (a: Point, b: Point): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Closest point INSIDE the polygon (to drag without leaving). */
export const clampPointToPolygon = (p: Point, o: Outline): Point => {
  // Without a usable polygon there is nothing to limit: returning the point as is is less harmful than
  // invent a position.
  if (o.length < MIN_OUTLINE_VERTICES) return { x: p.x, y: p.y };
  if (pointInPolygon(p, o)) return { x: p.x, y: p.y };

  // We look for the closest projection on ALL edges, not on the enclosing box:
  // In an L-shaped plan the point may be in the notch, surrounded by the box but outside the room.
  let nearest = projectOnSegment(p, o[o.length - 1], o[0]);
  let best = distance2(p, nearest);
  let edgeStart = o[o.length - 1];
  let edgeEnd = o[0];

  for (let i = 1; i < o.length; i += 1) {
    const candidate = projectOnSegment(p, o[i - 1], o[i]);
    const d = distance2(p, candidate);
    if (d < best) {
      best = d;
      nearest = candidate;
      edgeStart = o[i - 1];
      edgeEnd = o[i];
    }
  }

  // The projection falls EXACTLY onto the wall. We move one pixel in because the
  // consumer rounds coordinates and a fair edge may fall to the outside side when rounding;
  // Furthermore, this way the table is visually inside the room and not mounted on the line.
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len > EPSILON) {
    // We do not know in advance which normal points inward (it depends on the orientation of the
    // polygon), so we tried both and stayed with the one that falls inside.
    const nx = -dy / len;
    const ny = dx / len;
    for (const sign of [1, -1]) {
      const candidate = { x: nearest.x + nx * sign, y: nearest.y + ny * sign };
      if (pointInPolygon(candidate, o)) return candidate;
    }
  }

  // Polygon too narrow to fit a pixel inside: the edge already counts as inside.
  return nearest;
};

// ================= Tables =================

/** A table fits if all 4 corners of its footprint fall inside the polygon. */
export const tableInsideOutline = (
  t: {
    pos_x: number;
    pos_y: number;
    shape: string;
    width?: number | null;
    height?: number | null;
  },
  o: Outline,
): boolean => {
  // pos_x/pos_y is the top left corner of the footprint, same as in isTableClipped.
  const footprint = tableFootprint(t as never);
  const corners: Outline = [
    { x: t.pos_x, y: t.pos_y },
    { x: t.pos_x + footprint.w, y: t.pos_y },
    { x: t.pos_x + footprint.w, y: t.pos_y + footprint.h },
    { x: t.pos_x, y: t.pos_y + footprint.h },
  ];
  return corners.every((c) => pointInPolygon(c, o));
};

export const tablesOutsideOutline = (
  tables: Array<{
    pos_x: number;
    pos_y: number;
    shape: string;
    width?: number | null;
    height?: number | null;
  }>,
  o: Outline,
): number => tables.filter((t) => !tableInsideOutline(t, o)).length;

/** Reform notice. '' when no table is left out. */
export const outlineWarning = (n: number): string =>
  n > 0
    ? `The new room shape leaves ${n} tables outside its boundary. Move them inside before saving.`
    : '';

// ================= Vertex editing =================

/** Inserts a vertex at the midpoint of edge i -> i+1. Returns a NEW array. */
export const insertVertex = (o: Outline, edgeIndex: number): Outline => {
  // Index out of range: we return a copy anyway, so the caller can process
  // the result always as new state and does not have to branch.
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= o.length) {
    return [...o];
  }

  // The last edge closes the polygon (n-1 -> 0), hence the module.
  const a = o[edgeIndex];
  const b = o[(edgeIndex + 1) % o.length];
  const midpoint: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  const next = [...o];
  next.splice(edgeIndex + 1, 0, midpoint);
  return next;
};

/** Remove vertex i. If there are less than MIN_OUTLINE_VERTICES left, it returns the original untouched. */
export const removeVertex = (o: Outline, index: number): Outline => {
  if (!Number.isInteger(index) || index < 0 || index >= o.length) return o;
  // Hard floor: below 3 corners the "polygon" stops enclosing the room and the editor
  // I would be left with nothing to draw or against which to validate tables.
  if (o.length - 1 < MIN_OUTLINE_VERTICES) return o;

  return o.filter((_, i) => i !== index);
};

/** Validates that the polygon is usable (>=3 vertices, no NaN, area > 0). '' if valid. */
export const validateOutline = (o: Outline): string => {
  if (!Array.isArray(o) || o.length < MIN_OUTLINE_VERTICES) {
    return `A room outline needs at least ${MIN_OUTLINE_VERTICES} corners.`;
  }
  if (!o.every(isPoint)) {
    return 'Room outline corners must be valid numbers.';
  }
  // Zero area = all vertices aligned - looks like a stripe and no table would fit inside.
  if (polygonArea(o) <= EPSILON) {
    return 'Room outline must enclose an area.';
  }
  return '';
};
