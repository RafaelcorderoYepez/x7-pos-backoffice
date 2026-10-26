import { describe, expect, it } from 'vitest';
import {
  DELIVERY_STATUS_TRANSITIONS,
  buildAssignmentQuery,
  canReassignDriver,
  canTransition,
  formatMinutes,
  groupByColumn,
  isHttpsUrl,
  normalizeAssignment,
  relativeTime,
  statusActions,
  timelineEntries,
  vehicleIcon,
} from './delivery-assignments';
import type { DeliveryAssignment } from '../types/delivery-assignments';

const base: DeliveryAssignment = {
  id: 1,
  order: { id: 10 },
  deliveryDriver: null,
  assignment_type: 'in_house',
  delivery_status: 'pending',
  assigned_at: null,
  picked_up_at: null,
  delivered_at: null,
  external_delivery_id: null,
  external_tracking_url: null,
  external_dsp_fee: null,
  status: 'active',
};

describe('delivery-assignments helpers', () => {
  it('mirrors the backend transition table', () => {
    expect(DELIVERY_STATUS_TRANSITIONS.picked_up).toEqual(['in_transit', 'delivered', 'failed', 'cancelled']);
    expect(canTransition('assigned', 'delivered')).toBe(false);
    expect(canTransition('picked_up', 'delivered')).toBe(true);
    expect(DELIVERY_STATUS_TRANSITIONS.delivered).toEqual([]);
  });

  it('offers only the actions the backend accepts', () => {
    expect(statusActions({ ...base, delivery_status: 'assigned' }).map((a) => a.to)).toEqual(['picked_up', 'failed', 'cancelled']);
    // pending IN_HOUSE: "assigned" se hace con un repartidor, no con un botón de estado.
    expect(statusActions(base).map((a) => a.to)).toEqual(['failed', 'cancelled']);
    // pending DSP: sólo con external_delivery_id.
    expect(statusActions({ ...base, assignment_type: 'uber_direct' }).map((a) => a.to)).toEqual(['failed', 'cancelled']);
    expect(
      statusActions({ ...base, assignment_type: 'uber_direct', external_delivery_id: 'u-1' }).map((a) => a.to),
    ).toEqual(['assigned', 'failed', 'cancelled']);
    expect(statusActions({ ...base, delivery_status: 'cancelled' })).toEqual([]);
    expect(statusActions({ ...base, delivery_status: 'in_transit' }).find((a) => a.to === 'failed')?.destructive).toBe(true);
  });

  it('allows reassigning only in-house pending/assigned', () => {
    expect(canReassignDriver({ assignment_type: 'in_house', delivery_status: 'assigned' })).toBe(true);
    expect(canReassignDriver({ assignment_type: 'in_house', delivery_status: 'picked_up' })).toBe(false);
    expect(canReassignDriver({ assignment_type: 'doordash_drive', delivery_status: 'pending' })).toBe(false);
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(relativeTime('2026-10-12T11:48:00Z', now)).toBe('12 mins ago');
    expect(relativeTime('2026-10-12T11:59:00Z', now)).toBe('1 min ago');
    expect(relativeTime('2026-10-12T11:59:45Z', now)).toBe('just now');
    expect(relativeTime('2026-10-12T09:00:00Z', now)).toBe('3 hrs ago');
    expect(relativeTime('2026-10-10T12:00:00Z', now)).toBe('2 days ago');
    expect(relativeTime(null, now)).toBe('');
  });

  it('builds the timeline from server timestamps', () => {
    expect(timelineEntries({ assigned_at: 'a', picked_up_at: null, delivered_at: 'c' }).map((e) => e.label)).toEqual([
      'Assigned',
      'Delivered',
    ]);
  });

  it('maps vehicle types to icons with a generic fallback', () => {
    expect(vehicleIcon('car')).toBe('directions_car');
    expect(vehicleIcon('motorcycle')).toBe('two_wheeler');
    expect(vehicleIcon('bicycle')).toBe('pedal_bike');
    expect(vehicleIcon('e_scooter')).toBe('electric_scooter');
    expect(vehicleIcon('on_foot')).toBe('directions_walk');
    expect(vehicleIcon(undefined)).toBe('two_wheeler');
  });

  it('groups rows into Kanban columns', () => {
    const g = groupByColumn([
      { ...base, id: 1, delivery_status: 'picked_up' },
      { ...base, id: 2, delivery_status: 'in_transit' },
      { ...base, id: 3, delivery_status: 'failed' },
      { ...base, id: 4, delivery_status: 'cancelled' },
    ]);
    expect(g.moving.map((r) => r.id)).toEqual([1, 2]);
    expect(g.closed.map((r) => r.id)).toEqual([3, 4]);
    expect(g.pending).toEqual([]);
  });

  it('builds the list query with comma-separated multi values', () => {
    const qs = new URLSearchParams(
      buildAssignmentQuery({ statuses: ['picked_up', 'in_transit'], types: ['uber_direct'], search: ' mario ' }, 2, 500),
    );
    expect(qs.get('delivery_status')).toBe('picked_up,in_transit');
    expect(qs.get('assignment_type')).toBe('uber_direct');
    expect(qs.get('search')).toBe('mario');
    expect(qs.get('page')).toBe('2');
    expect(qs.get('limit')).toBe('100');
    expect(new URLSearchParams(buildAssignmentQuery({ statuses: [], types: [], search: '' })).has('search')).toBe(false);
  });

  it('validates https tracking URLs', () => {
    expect(isHttpsUrl('https://track.example.com/a1')).toBe(true);
    expect(isHttpsUrl('http://track.example.com/a1')).toBe(false);
    expect(isHttpsUrl('track.example.com')).toBe(false);
    expect(isHttpsUrl('https://')).toBe(false);
  });

  it('normalizes decimal strings and formats minutes', () => {
    expect(normalizeAssignment({ ...base, external_dsp_fee: '6.50' as unknown as number }).external_dsp_fee).toBe(6.5);
    expect(formatMinutes(27.5)).toBe('27.5 min');
    expect(formatMinutes(30)).toBe('30 min');
    expect(formatMinutes(null)).toBe('—');
  });
});
