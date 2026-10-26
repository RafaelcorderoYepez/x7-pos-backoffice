import { describe, expect, it } from 'vitest';
import {
  buildDriverQuery,
  driverCode,
  normalizePhone,
  shiftToggleState,
  statusMeta,
  validateDriverForm,
  vehicleMeta,
} from './delivery-drivers';

describe('delivery-drivers helpers', () => {
  it('formats the driver code', () => {
    expect(driverCode(7)).toBe('#DRV-7');
  });

  it('maps statuses and vehicles to labels, with a fallback for legacy values', () => {
    expect(statusMeta('on_delivery')).toMatchObject({ label: 'En route', color: '#3b82f6' });
    expect(statusMeta('weird').label).toBe('weird');
    expect(vehicleMeta('e_scooter')).toEqual({ label: 'E-Scooter', icon: 'electric_scooter' });
    expect(vehicleMeta('Truck')).toEqual({ label: 'Truck', icon: 'local_shipping' });
  });

  it('normalizes phones like the backend', () => {
    expect(normalizePhone(' +1 (809) 555-1234 ')).toBe('+18095551234');
    expect(normalizePhone('809.555.1234')).toBe('8095551234');
  });

  it('only allows the shift toggle for active and off_duty drivers', () => {
    expect(shiftToggleState({ status: 'active' })).toMatchObject({ onShift: true, disabled: false });
    expect(shiftToggleState({ status: 'off_duty' })).toMatchObject({ onShift: false, disabled: false });
    expect(shiftToggleState({ status: 'on_delivery' }).disabled).toBe(true);
    expect(shiftToggleState({ status: 'inactive' }).disabled).toBe(true);
  });

  it('validates the form with the backend limits', () => {
    const base = { name: 'Mario', phone: '+18095551234', vehicleType: 'car' as const, status: 'active' as const };
    expect(validateDriverForm(base).draft).toEqual(base);
    expect(validateDriverForm({ ...base, name: ' ' }).errors.name).toBe('Name is required');
    expect(validateDriverForm({ ...base, name: 'x'.repeat(101) }).errors.name).toMatch(/100/);
    expect(validateDriverForm({ ...base, phone: '1'.repeat(21) }).errors.phone).toMatch(/20/);
    expect(validateDriverForm({ ...base, phone: 'abc' }).errors.phone).toMatch(/4-19 digits/);
    expect(validateDriverForm({ ...base, vehicleType: '' }).errors.vehicleType).toBeDefined();
    expect(validateDriverForm(base, { lockStatus: true }).draft).not.toHaveProperty('status');
  });

  it('builds the list query with comma-separated filters', () => {
    expect(
      buildDriverQuery({ statuses: ['active', 'off_duty'], vehicleType: 'car', search: ' ana ', page: 2, limit: 25 }),
    ).toBe('page=2&limit=25&status=active%2Coff_duty&vehicleType=car&search=ana');
    expect(buildDriverQuery({ statuses: [], vehicleType: '', search: '', page: 1, limit: 25 })).toBe('page=1&limit=25');
  });
});
