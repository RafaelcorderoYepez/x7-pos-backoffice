import { describe, expect, it } from 'vitest';
import type { DeliveryZone, ZoneGeometry } from '../types/delivery';
import {
  circlePolygon,
  computeZoneMetrics,
  distanceKm,
  editableVertices,
  insertVertex,
  matchesZoneFilters,
  parseLatLngPair,
  parseZoneGeoJson,
  pointInZone,
  polygonFromVertices,
  radiusError,
  vertexCount,
  zoneCode,
  zoneDescriptionError,
  zoneGeometry,
  zoneNameError,
  zonesContaining,
} from './delivery-zones';

const SQUARE: ZoneGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-69.94, 18.45],
      [-69.92, 18.45],
      [-69.92, 18.47],
      [-69.94, 18.47],
      [-69.94, 18.45],
    ],
  ],
};

const zone = (over: Partial<DeliveryZone> = {}): DeliveryZone => ({
  id: 1,
  name: 'Centro, Zona Norte',
  description: 'Downtown blocks',
  geojson: SQUARE,
  status: 'active',
  created_at: '2026-09-30T12:00:00Z',
  updated_at: '2026-09-30T12:00:00Z',
  merchant: { id: 3, name: 'prueba1' },
  ...over,
});

describe('GeoJSON validation (mirror of the backend)', () => {
  it('accepts closed polygons as object, string or Feature', () => {
    expect(parseZoneGeoJson(SQUARE)).toEqual({ ok: true, geometry: SQUARE });
    expect(parseZoneGeoJson(JSON.stringify(SQUARE))).toEqual({ ok: true, geometry: SQUARE });
    expect(parseZoneGeoJson({ type: 'Feature', properties: {}, geometry: SQUARE }).ok).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(parseZoneGeoJson('{"type":')).toEqual({ ok: false, error: 'geojson is not valid JSON' });
  });

  it('rejects an unclosed ring', () => {
    const open = { type: 'Polygon', coordinates: [SQUARE.coordinates[0].slice(0, 4)] };
    const result = parseZoneGeoJson(open);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/not closed/);
  });

  it('rejects degenerate and out-of-range rings', () => {
    const same = [-69.9, 18.4];
    expect(parseZoneGeoJson({ type: 'Polygon', coordinates: [[same, same, same, same]] }).ok).toBe(false);
    const swapped = { type: 'Polygon', coordinates: [SQUARE.coordinates[0].map(([x, y]) => [y, x * 2])] };
    expect(!parseZoneGeoJson(swapped).ok).toBe(true);
  });

  it('rejects unsupported geometry types', () => {
    const result = parseZoneGeoJson({ type: 'LineString', coordinates: [] });
    expect(!result.ok && result.error).toMatch(/not supported/);
  });

  it('reads a zone boundary and counts its vertices', () => {
    expect(vertexCount(zoneGeometry(zone())!)).toBe(4);
    expect(zoneGeometry(zone({ geojson: null }))).toBeNull();
    expect(zoneGeometry(zone({ geojson: 'garbage' }))).toBeNull();
  });
});

describe('point-in-polygon', () => {
  it('finds points inside and outside', () => {
    expect(pointInZone(18.46, -69.93, SQUARE)).toBe(true);
    expect(pointInZone(18.5, -69.93, SQUARE)).toBe(false);
    // lat/lng al revés no debe "caer dentro" por casualidad.
    expect(pointInZone(-69.93, 18.46, SQUARE)).toBe(false);
  });

  it('respects holes', () => {
    const withHole: ZoneGeometry = {
      type: 'Polygon',
      coordinates: [
        SQUARE.coordinates[0],
        [
          [-69.935, 18.455],
          [-69.925, 18.455],
          [-69.925, 18.465],
          [-69.935, 18.465],
          [-69.935, 18.455],
        ],
      ],
    };
    expect(pointInZone(18.46, -69.93, withHole)).toBe(false);
  });

  it('lists the zones containing a point', () => {
    const zones = [zone(), zone({ id: 2, geojson: null }), zone({ id: 3, name: 'Far', geojson: circlePolygon({ lat: 10, lng: 10 }, 1) })];
    expect(zonesContaining(zones, { lat: 18.46, lng: -69.93 }).map((z) => z.id)).toEqual([1]);
  });
});

describe('radius-to-polygon template', () => {
  it('generates a valid closed GeoJSON ring', () => {
    const circle = circlePolygon({ lat: 18.4662, lng: -69.9384 }, 3);
    const result = parseZoneGeoJson(circle);
    expect(result.ok).toBe(true);
    const ring = (circle as { coordinates: number[][][] }).coordinates[0];
    expect(ring).toHaveLength(49);
    expect(ring[0]).toEqual(ring[48]);
  });

  it('places every vertex at the requested distance (±1%)', () => {
    const center = { lat: 18.4662, lng: -69.9384 };
    const ring = (circlePolygon(center, 3) as { coordinates: number[][][] }).coordinates[0];
    ring.forEach(([lng, lat]) => {
      expect(distanceKm(center, { lat, lng })).toBeGreaterThan(2.97);
      expect(distanceKm(center, { lat, lng })).toBeLessThan(3.03);
    });
    expect(pointInZone(center.lat, center.lng, circlePolygon(center, 3))).toBe(true);
  });

  it('validates the radius input', () => {
    expect(radiusError('')).toMatch(/Enter a radius/);
    expect(radiusError('abc')).toMatch(/number/);
    expect(radiusError('0')).toMatch(/between/);
    expect(radiusError('3')).toBe('');
  });
});

describe('vertex editing', () => {
  it('round-trips vertices and closes the ring', () => {
    const vertices = editableVertices(SQUARE)!;
    expect(vertices).toHaveLength(4);
    expect(polygonFromVertices(vertices)).toEqual(SQUARE);
    expect(polygonFromVertices(vertices.slice(0, 2))).toBeNull();
  });

  it('does not offer vertex editing for multi-polygons', () => {
    expect(editableVertices({ type: 'MultiPolygon', coordinates: [SQUARE.coordinates] })).toBeNull();
    expect(editableVertices(null)).toEqual([]);
  });

  it('inserts a new vertex on the nearest edge', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    const next = insertVertex(square, { lat: 1, lng: 2.2 });
    expect(next[2]).toEqual({ lat: 1, lng: 2.2 });
  });
});

describe('form rules', () => {
  it('caps the name at 200 and the description at 500 characters', () => {
    expect(zoneNameError('  ')).toMatch(/required/);
    expect(zoneNameError('x'.repeat(200))).toBe('');
    expect(zoneNameError('x'.repeat(201))).toMatch(/200/);
    expect(zoneDescriptionError('x'.repeat(500))).toBe('');
    expect(zoneDescriptionError('x'.repeat(501))).toMatch(/500/);
  });

  it('parses a pasted "lat, lng" pair', () => {
    expect(parseLatLngPair('18.4662, -69.9384')).toEqual({ lat: 18.4662, lng: -69.9384 });
    expect(parseLatLngPair('Calle 5')).toBeNull();
    expect(parseLatLngPair('95, 10')).toBeNull();
  });
});

describe('filters and KPIs', () => {
  it('searches name, description and code, accent-insensitive', () => {
    const z = zone({ name: 'Zona Pétalo' });
    expect(matchesZoneFilters(z, { search: 'petalo', statuses: [] })).toBe(true);
    expect(matchesZoneFilters(z, { search: 'downtown', statuses: [] })).toBe(true);
    expect(matchesZoneFilters(z, { search: zoneCode(1), statuses: [] })).toBe(true);
    expect(matchesZoneFilters(z, { search: 'sur', statuses: [] })).toBe(false);
  });

  it('filters by status', () => {
    expect(matchesZoneFilters(zone(), { search: '', statuses: ['maintenance'] })).toBe(false);
    expect(matchesZoneFilters(zone({ status: 'maintenance' }), { search: '', statuses: ['maintenance'] })).toBe(true);
  });

  it('tallies active zones and zones without a valid boundary', () => {
    const metrics = computeZoneMetrics([
      zone(),
      zone({ id: 2, status: 'inactive', geojson: null }),
      zone({ id: 3, status: 'maintenance', geojson: '{"type":"Polygon","coordinates":[]}' }),
    ]);
    expect(metrics).toMatchObject({ total: 3, active: 1, unassigned: 2 });
  });
});
