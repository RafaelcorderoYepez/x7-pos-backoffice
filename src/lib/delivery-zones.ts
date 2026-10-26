// Lógica pura del workspace de zonas de reparto: validación GeoJSON, geocerca
// (point-in-polygon), plantilla de radio, filtros y KPIs.
//
// La validación y el point-in-polygon son un espejo EXACTO de
// x7-pos-back-end/src/commerce/delivery-system/delivery-zone/utils/zone-geojson.util.ts: si
// divergen, el drawer dejaría guardar un perímetro que el servidor rechaza (o al revés).

import type {
  DeliveryZone,
  DeliveryZoneStatus,
  LinearRing,
  Position,
  ZoneGeometry,
} from '../types/delivery';

export const ZONE_NAME_MAX = 200;
export const ZONE_DESCRIPTION_MAX = 500;

export const ZONE_STATUSES: DeliveryZoneStatus[] = ['active', 'inactive', 'maintenance'];

export const ZONE_STATUS_META: Record<
  DeliveryZoneStatus,
  { label: string; color: string; pill: string; icon: string }
> = {
  active: {
    label: 'Active',
    color: '#10b981',
    pill: 'bg-[#10b981] text-white',
    icon: 'check_circle',
  },
  inactive: {
    label: 'Inactive',
    color: '#64748b',
    pill: 'bg-[#64748b] text-white',
    icon: 'pause_circle',
  },
  maintenance: {
    label: 'Maintenance',
    color: '#f59e0b',
    pill: 'bg-[#f59e0b] text-white',
    icon: 'construction',
  },
};

export const zoneCode = (id: number): string => `#ZON-${id}`;

/** Punto en el orden de Leaflet. */
export interface LatLng {
  lat: number;
  lng: number;
}

// ================= Validación GeoJSON =================

export type ZoneGeoJsonResult =
  | { ok: true; geometry: ZoneGeometry }
  | { ok: false; error: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validatePosition(value: unknown, where: string): string | null {
  if (!Array.isArray(value) || value.length < 2) {
    return `${where} must be a [longitude, latitude] pair`;
  }
  const [lng, lat] = value;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return `${where} must contain numbers`;
  }
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return `${where} must contain finite numbers`;
  }
  if (lng < -180 || lng > 180) return `${where} longitude ${lng} is out of range`;
  if (lat < -90 || lat > 90) return `${where} latitude ${lat} is out of range`;
  return null;
}

function validateRing(ring: unknown, where: string): string | null {
  if (!Array.isArray(ring)) return `${where} must be an array of positions`;
  if (ring.length < 4) {
    return `${where} needs at least 4 positions (3 vertices plus the closing point)`;
  }
  for (let i = 0; i < ring.length; i += 1) {
    const error = validatePosition(ring[i], `${where}, position ${i + 1}`);
    if (error) return error;
  }
  const first = ring[0] as number[];
  const last = ring[ring.length - 1] as number[];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return `${where} is not closed: the first and last positions must match`;
  }
  const distinct = new Set((ring as number[][]).slice(0, -1).map((p) => `${p[0]},${p[1]}`));
  if (distinct.size < 3) return `${where} needs at least 3 distinct vertices`;
  return null;
}

function validatePolygonCoordinates(coordinates: unknown, where: string): string | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return `${where} must contain at least one linear ring`;
  }
  for (let i = 0; i < coordinates.length; i += 1) {
    const error = validateRing(coordinates[i], i === 0 ? `${where} outer ring` : `${where} hole ${i}`);
    if (error) return error;
  }
  return null;
}

const cleanRing = (ring: number[][]): LinearRing => ring.map((p) => [p[0], p[1]] as Position);

export function parseZoneGeoJson(input: unknown): ZoneGeoJsonResult {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: 'geojson is not valid JSON' };
    }
  }
  if (!isObject(value)) return { ok: false, error: 'geojson must be a GeoJSON object' };
  if (value.type === 'Feature') return parseZoneGeoJson(value.geometry ?? null);
  if (value.type === 'Polygon') {
    const error = validatePolygonCoordinates(value.coordinates, 'Polygon');
    if (error) return { ok: false, error };
    return {
      ok: true,
      geometry: { type: 'Polygon', coordinates: (value.coordinates as number[][][]).map(cleanRing) },
    };
  }
  if (value.type === 'MultiPolygon') {
    const polygons = value.coordinates;
    if (!Array.isArray(polygons) || polygons.length === 0) {
      return { ok: false, error: 'MultiPolygon must contain at least one polygon' };
    }
    for (let i = 0; i < polygons.length; i += 1) {
      const error = validatePolygonCoordinates(polygons[i], `Polygon ${i + 1}`);
      if (error) return { ok: false, error };
    }
    return {
      ok: true,
      geometry: {
        type: 'MultiPolygon',
        coordinates: (polygons as number[][][][]).map((poly) => poly.map(cleanRing)),
      },
    };
  }
  return {
    ok: false,
    error: `geojson type "${String(value.type)}" is not supported; use Polygon or MultiPolygon`,
  };
}

/** Perímetro válido de una zona, o null ("No Boundary Set"). */
export function zoneGeometry(zone: Pick<DeliveryZone, 'geojson'>): ZoneGeometry | null {
  if (zone.geojson == null || zone.geojson === '') return null;
  const result = parseZoneGeoJson(zone.geojson);
  return result.ok ? result.geometry : null;
}

const polygonsOf = (geometry: ZoneGeometry): LinearRing[][] =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

export function vertexCount(geometry: ZoneGeometry): number {
  return polygonsOf(geometry).reduce(
    (sum, rings) => sum + rings.reduce((acc, ring) => acc + ring.length - 1, 0),
    0,
  );
}

// ================= Geocerca =================

function insideRing(lng: number, lat: number, ring: LinearRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInZone(lat: number, lng: number, geometry: ZoneGeometry): boolean {
  return polygonsOf(geometry).some(
    (rings) =>
      insideRing(lng, lat, rings[0]) && !rings.slice(1).some((hole) => insideRing(lng, lat, hole)),
  );
}

/** Zonas (con perímetro) que contienen el punto. */
export function zonesContaining(zones: DeliveryZone[], point: LatLng): DeliveryZone[] {
  return zones.filter((zone) => {
    const geometry = zoneGeometry(zone);
    return geometry ? pointInZone(point.lat, point.lng, geometry) : false;
  });
}

// ================= Edición de vértices =================

/**
 * Vértices editables del perímetro (anillo exterior, sin el cierre) en orden de Leaflet.
 * Un MultiPolygon o un polígono con huecos NO se edita vértice a vértice (se perderían las
 * piezas extra): devuelve null y el drawer ofrece sólo el editor de GeoJSON crudo.
 */
export function editableVertices(geometry: ZoneGeometry | null): LatLng[] | null {
  if (!geometry) return [];
  if (geometry.type !== 'Polygon' || geometry.coordinates.length !== 1) return null;
  return geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Cierra el anillo a partir de los vértices; null con menos de 3 (no hay polígono aún). */
export function polygonFromVertices(vertices: LatLng[]): ZoneGeometry | null {
  if (vertices.length < 3) return null;
  const ring: LinearRing = vertices.map((v) => [round6(v.lng), round6(v.lat)] as Position);
  ring.push([ring[0][0], ring[0][1]]);
  return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Inserta un vértice en la arista donde menos alarga el perímetro. Añadirlo siempre al
 * final cruzaba el polígono consigo mismo en cuanto se pinchaba "entre" dos vértices.
 */
export function insertVertex(vertices: LatLng[], point: LatLng): LatLng[] {
  if (vertices.length < 3) return [...vertices, point];
  const d = (a: LatLng, b: LatLng) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
  let bestIndex = vertices.length;
  let bestCost = Infinity;
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cost = d(a, point) + d(point, b) - d(a, b);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = i + 1;
    }
  }
  return [...vertices.slice(0, bestIndex), point, ...vertices.slice(bestIndex)];
}

// ================= Plantilla de radio =================

const EARTH_RADIUS_KM = 6371.0088;
export const RADIUS_MIN_KM = 0.1;
export const RADIUS_MAX_KM = 50;

export function radiusError(raw: string): string {
  if (!raw.trim()) return 'Enter a radius in kilometers';
  const km = Number(raw);
  if (!Number.isFinite(km)) return 'Radius must be a number';
  if (km < RADIUS_MIN_KM || km > RADIUS_MAX_KM) {
    return `Radius must be between ${RADIUS_MIN_KM} and ${RADIUS_MAX_KM} km`;
  }
  return '';
}

/**
 * Aproximación poligonal de un círculo geodésico (fórmula del punto de destino sobre la
 * esfera): a 3 km un círculo "plano" en grados sale ovalado fuera del ecuador.
 */
export function circlePolygon(center: LatLng, radiusKm: number, steps = 48): ZoneGeometry {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(center.lat);
  const lng1 = toRad(center.lng);
  const angular = radiusKm / EARTH_RADIUS_KM;
  const vertices: LatLng[] = [];
  for (let i = 0; i < steps; i += 1) {
    const bearing = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    vertices.push({ lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 });
  }
  return polygonFromVertices(vertices) as ZoneGeometry;
}

/** Distancia de círculo máximo en km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Centroide simple (media de vértices) para centrar el mapa o la plantilla de radio. */
export function geometryCenter(geometry: ZoneGeometry): LatLng {
  const positions = polygonsOf(geometry).flatMap((rings) => rings[0].slice(0, -1));
  const sum = positions.reduce((acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), {
    lat: 0,
    lng: 0,
  });
  return { lat: sum.lat / positions.length, lng: sum.lng / positions.length };
}

/** Anillos en orden Leaflet ([lat, lng]) para dibujar la geometría. */
export function leafletRings(geometry: ZoneGeometry): [number, number][][][] {
  return polygonsOf(geometry).map((rings) =>
    rings.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number])),
  );
}

// ================= Coordenadas escritas a mano =================

export function parseCoordinate(raw: string, kind: 'lat' | 'lng'): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const limit = kind === 'lat' ? 90 : 180;
  return Math.abs(n) <= limit ? n : null;
}

/** Acepta "18.4662, -69.9384" pegado de Google Maps (lat, lng). */
export function parseLatLngPair(raw: string): LatLng | null {
  const parts = raw.split(/[,\s;]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = parseCoordinate(parts[0], 'lat');
  const lng = parseCoordinate(parts[1], 'lng');
  return lat === null || lng === null ? null : { lat, lng };
}

export const formatCoordinate = (n: number): string => n.toFixed(5);

// ================= Formulario =================

export function zoneNameError(raw: string): string {
  const name = raw.trim();
  if (!name) return 'Zone name is required';
  if (name.length > ZONE_NAME_MAX) return `Zone name must be ${ZONE_NAME_MAX} characters or fewer`;
  return '';
}

export function zoneDescriptionError(raw: string): string {
  return raw.trim().length > ZONE_DESCRIPTION_MAX
    ? `Description must be ${ZONE_DESCRIPTION_MAX} characters or fewer`
    : '';
}

// ================= Filtros y KPIs =================

export interface ZoneFilters {
  search: string;
  /** Vacío = todos los estados. */
  statuses: DeliveryZoneStatus[];
}

export const EMPTY_ZONE_FILTERS: ZoneFilters = { search: '', statuses: [] };

export const hasActiveZoneFilters = (filters: ZoneFilters): boolean =>
  Boolean(filters.search.trim()) || filters.statuses.length > 0;

const fold = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matchesZoneFilters(zone: DeliveryZone, filters: ZoneFilters): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(zone.status)) return false;
  const term = fold(filters.search.trim());
  if (!term) return true;
  return (
    fold(zone.name).includes(term) ||
    fold(zone.description ?? '').includes(term) ||
    fold(zoneCode(zone.id)).includes(term)
  );
}

export interface ZoneMetrics {
  total: number;
  active: number;
  /** Zonas sin un perímetro GeoJSON válido. */
  unassigned: number;
  byStatus: Record<DeliveryZoneStatus, number>;
}

export function computeZoneMetrics(zones: DeliveryZone[]): ZoneMetrics {
  const byStatus: Record<DeliveryZoneStatus, number> = { active: 0, inactive: 0, maintenance: 0 };
  let unassigned = 0;
  zones.forEach((zone) => {
    byStatus[zone.status] = (byStatus[zone.status] ?? 0) + 1;
    if (!zoneGeometry(zone)) unassigned += 1;
  });
  return { total: zones.length, active: byStatus.active, unassigned, byStatus };
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
