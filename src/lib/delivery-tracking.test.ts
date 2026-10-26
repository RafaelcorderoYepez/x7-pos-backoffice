import { describe, expect, it } from 'vitest';
import {
  anchorEntries,
  appendRoutePoint,
  applyLocationUpdate,
  decodeFocus,
  effectiveStatus,
  encodeFocus,
  formatCoord,
  formatRelativeTime,
  markerColor,
  markerHtml,
  routeDistanceKm,
  sortRoutePoints,
  vehicleIcon,
} from './delivery-tracking';
import { buildLiveTrackingQuery } from '../api/delivery-tracking';
import type { LiveTrackingEntry } from '../types/delivery-tracking';

const ENTRY: LiveTrackingEntry = {
  delivery_assignment_id: 7,
  delivery_status: 'in_transit',
  driver: { id: 2, name: 'Ana', vehicle_type: 'motorcycle' },
  tracking_id: 55,
  lat: 18.4662,
  lng: -69.9384,
  recorded_at: '2026-10-12T12:00:00.000Z',
  seconds_since_update: 10,
  telemetry_status: 'active',
  minutes_since_assigned: 12,
  on_time: true,
};

describe('delivery-tracking helpers', () => {
  it('anchors on the server age and flips to signal_lost past 180 s', () => {
    const [entry] = anchorEntries([ENTRY], 1_000_000);
    expect(effectiveStatus(entry, 1_000_000 + 170_000)).toBe('active');
    expect(effectiveStatus(entry, 1_000_000 + 171_000)).toBe('signal_lost');
    expect(effectiveStatus({ ...entry, telemetry_status: 'inactive' }, 1_000_000)).toBe('inactive');
    expect(effectiveStatus({ ...entry, anchorMs: null }, 1_000_000)).toBe('signal_lost');
  });

  it('formats relative time, coordinates and vehicle icons', () => {
    expect(formatRelativeTime(10)).toBe('Updated 10s ago');
    expect(formatRelativeTime(125)).toBe('Updated 2m ago');
    expect(formatRelativeTime(7200)).toBe('Updated 2h ago');
    expect(formatRelativeTime(null)).toBe('No signal yet');
    expect(formatCoord(18.4)).toBe('18.400000');
    expect(formatCoord(null)).toBe('—');
    expect(vehicleIcon('e_scooter')).toBe('electric_scooter');
    expect(vehicleIcon('on_foot')).toBe('directions_walk');
    expect(vehicleIcon(null)).toBe('local_shipping');
  });

  it('colors markers green / amber / red / slate', () => {
    expect(markerColor('active', 5)).toBe('#10b981');
    expect(markerColor('signal_lost', 200)).toBe('#f59e0b');
    expect(markerColor('signal_lost', 361)).toBe('#ef4444');
    expect(markerColor('inactive', 999)).toBe('#64748b');
    expect(markerHtml({ status: 'active', color: '#10b981', icon: 'two_wheeler', focused: false })).toContain('animate-ping');
    expect(markerHtml({ status: 'inactive', color: '#64748b', icon: 'two_wheeler', focused: true })).not.toContain('animate-ping');
  });

  it('sorts, appends and measures the route trail', () => {
    const points = sortRoutePoints([
      { id: 2, lat: 0, lng: 0.01, recorded_at: '2026-10-12T12:01:00Z' },
      { id: 1, lat: 0, lng: 0, recorded_at: '2026-10-12T12:00:00Z' },
    ]);
    expect(points.map((p) => p.id)).toEqual([1, 2]);
    expect(routeDistanceKm(points)).toBeCloseTo(1.112, 2);
    const payload = {
      merchantId: 1, assignmentId: 7, trackingId: 3, driverId: 2, lat: 0, lng: 0.02,
      recorded_at: '2026-10-12T12:02:00Z', status: 'active', emittedAt: '2026-10-12T12:02:01Z',
    };
    expect(appendRoutePoint(points, payload).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(appendRoutePoint(appendRoutePoint(points, payload), payload)).toHaveLength(3);
  });

  it('merges a realtime location and signals unknown assignments', () => {
    const entries = anchorEntries([ENTRY], 0);
    const payload = {
      merchantId: 1, assignmentId: 7, trackingId: 56, driverId: 2, lat: 1.5, lng: 2.5,
      recorded_at: '2026-10-12T12:00:00Z', status: 'inactive', emittedAt: '2026-10-12T12:00:02Z',
    };
    const next = applyLocationUpdate(entries, payload, 10_000)!;
    expect(next[0]).toMatchObject({ lat: 1.5, lng: 2.5, tracking_id: 56, telemetry_status: 'inactive', anchorMs: 8_000 });
    expect(applyLocationUpdate(entries, { ...payload, assignmentId: 99 }, 0)).toBeNull();
  });

  it('round-trips the focus selection and builds the live query', () => {
    expect(decodeFocus(encodeFocus({ kind: 'driver', id: 4 }))).toEqual({ kind: 'driver', id: 4 });
    expect(decodeFocus('')).toBeNull();
    expect(buildLiveTrackingQuery({ telemetry_status: ['active', 'signal_lost'], delivery_driver_id: 2 })).toBe(
      '?telemetry_status=active,signal_lost&delivery_driver_id=2',
    );
    expect(buildLiveTrackingQuery()).toBe('');
  });
});
