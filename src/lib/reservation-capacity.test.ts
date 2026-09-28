import { describe, expect, it } from 'vitest';
import { ApiError, getApiErrorDetails } from './api-error';
import {
  CAPACITY_OVERRIDE_REQUIRED,
  draftToSettingsPayload,
  findSlot,
  hasOverrideErrors,
  hasSettingsErrors,
  isCapacityOverrideError,
  overrideErrors,
  settingsErrors,
  settingsToDraft,
  slotSummary,
  type DayAvailability,
  type SlotAvailability,
} from './reservation-capacity';

const slot = (time: string, over: Partial<SlotAvailability> = {}): SlotAvailability => ({
  time,
  start: '',
  booked_seats: 30,
  projected_seats: 34,
  occupancy_pct: 50,
  level: 'available',
  arrivals: 4,
  fits_capacity: true,
  fits_throttle: true,
  bookable: true,
  ...over,
});

const DAY: DayAvailability = {
  date: '2026-04-16',
  party_size: 4,
  duration_minutes: 90,
  seat_capacity: 60,
  capacity_source: 'settings',
  slot_interval_minutes: 15,
  max_covers_per_slot: 20,
  shifts: [
    {
      name: 'Dinner',
      start: '19:00',
      end: '20:00',
      occupancy_pct: 50,
      level: 'available',
      slots: [slot('19:00'), slot('19:15'), slot('19:30'), slot('19:45')],
    },
  ],
};

describe('findSlot', () => {
  it('finds the slot on the grid and the one containing an off-grid time', () => {
    expect(findSlot(DAY, '19:15')?.time).toBe('19:15');
    expect(findSlot(DAY, '19:22')?.time).toBe('19:15');
  });

  it('returns null outside every shift or without data', () => {
    expect(findSlot(DAY, '12:30')).toBeNull();
    expect(findSlot(null, '19:00')).toBeNull();
    expect(findSlot(DAY, '')).toBeNull();
  });
});

describe('slotSummary', () => {
  it('describes a free slot with the committed load', () => {
    expect(slotSummary(slot('19:00'), 60, 4, 20)).toBe(
      '19:00 — High availability: 30 of 60 seats committed (50%).',
    );
  });

  it('explains why a slot is sold out for this party', () => {
    expect(
      slotSummary(slot('19:30', { booked_seats: 58, fits_capacity: false, bookable: false }), 60, 4, 20),
    ).toBe('19:30 — sold out for a party of 4: 58 of 60 seats committed (50%), only 2 free.');
    expect(
      slotSummary(slot('19:30', { arrivals: 18, fits_throttle: false, bookable: false }), 60, 4, 20),
    ).toContain('arrival pacing limit reached: 18 of 20');
  });
});

describe('manager override', () => {
  it('requires a valid email and a password', () => {
    expect(overrideErrors({ email: '', password: '' })).toEqual({
      email: 'Manager email is required',
      password: 'Manager password is required',
    });
    expect(overrideErrors({ email: 'boss', password: 'x' }).email).toBe('Enter a valid email');
    expect(hasOverrideErrors({ email: 'boss@x.com', password: 'x' })).toBe(false);
  });

  it('recognizes only the capacity 409 as an override opportunity', () => {
    expect(isCapacityOverrideError(new ApiError('full', 409, CAPACITY_OVERRIDE_REQUIRED))).toBe(true);
    // Un 409 de mesa ocupada no se arregla con un override.
    expect(isCapacityOverrideError(new ApiError('table taken', 409))).toBe(false);
    expect(isCapacityOverrideError(new Error('x'))).toBe(false);
  });

  it('reads message and code from the error body in one pass', async () => {
    const response = {
      json: () =>
        Promise.resolve({ statusCode: 409, code: CAPACITY_OVERRIDE_REQUIRED, message: 'Over capacity' }),
    } as Response;
    await expect(getApiErrorDetails(response, 'fallback')).resolves.toEqual({
      message: 'Over capacity',
      code: CAPACITY_OVERRIDE_REQUIRED,
    });
    const broken = { json: () => Promise.reject(new Error('not json')) } as Response;
    await expect(getApiErrorDetails(broken, 'fallback')).resolves.toEqual({ message: 'fallback' });
  });
});

describe('settings form', () => {
  const settings = {
    seat_capacity: null,
    effective_seat_capacity: 54,
    capacity_source: 'tables' as const,
    slot_interval_minutes: 15,
    max_covers_per_slot: null,
    shifts: [{ name: 'Dinner', start: '19:00', end: '23:00' }],
    updated_at: null,
  };

  it('round-trips defaults as empty fields and back to null', () => {
    const draft = settingsToDraft(settings);
    expect(draft).toEqual({
      seatCapacity: '',
      slotInterval: '15',
      maxCoversPerSlot: '',
      shifts: [{ name: 'Dinner', start: '19:00', end: '23:00' }],
    });
    expect(draftToSettingsPayload({ ...draft, shifts: [{ name: ' Dinner ', start: '19:00', end: '23:00' }] })).toEqual({
      seat_capacity: null,
      slot_interval_minutes: 15,
      max_covers_per_slot: null,
      shifts: [{ name: 'Dinner', start: '19:00', end: '23:00' }],
    });
  });

  it('validates numbers and shifts', () => {
    const draft = settingsToDraft(settings);
    const errors = settingsErrors({
      ...draft,
      seatCapacity: '0',
      maxCoversPerSlot: '2.5',
      shifts: [
        { name: '', start: '19:00', end: '23:00' },
        { name: 'Late', start: '22:00', end: '22:00' },
        { name: 'Night', start: '22:00', end: '01:00' },
      ],
    });
    expect(errors.seatCapacity).toMatch(/greater than 0/);
    expect(errors.maxCoversPerSlot).toMatch(/whole number/);
    expect(errors.shifts).toEqual(['Name the shift', 'Start and end cannot be the same', '']);
    expect(hasSettingsErrors(errors)).toBe(true);
    expect(settingsErrors({ ...draft, shifts: [] }).form).toBe('Keep at least one service shift');
    expect(hasSettingsErrors(settingsErrors(draft))).toBe(false);
  });
});
