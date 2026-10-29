import { describe, expect, it } from 'vitest';
import type { DeliveryFee, DeliveryZone } from '../types/delivery';
import {
  activeFeeForZone,
  computeDeliveryFee,
  computeFeeMetrics,
  formatMoney,
  formatMoneyInput,
  matchesFeeFilters,
  normalizeFee,
  parseMoneyInput,
  resolveFeeMetrics,
  validateFeeForm,
  type FeeFormValues,
} from './delivery-fees';

const fee = (over: Partial<DeliveryFee> = {}): DeliveryFee => ({
  id: 1,
  deliveryZone: { id: 1, name: 'Centro, Zona Norte', status: 'active' },
  base_fee: 5.99,
  per_km_fee: 1.5,
  min_order_amount: 10.99,
  free_above: 50,
  status: 'active',
  created_at: '2026-09-30T12:00:00Z',
  ...over,
});

const zone = (id: number, status: DeliveryZone['status'] = 'active'): DeliveryZone => ({
  id,
  name: `Zone ${id}`,
  description: null,
  geojson: null,
  status,
  created_at: '',
  updated_at: '',
});

const form = (over: Partial<FeeFormValues> = {}): FeeFormValues => ({
  zoneId: '2',
  baseFee: '5.99',
  perKmFee: '1.50',
  minOrder: '10.99',
  freeAbove: '50.00',
  status: 'active',
  ...over,
});

describe('computeDeliveryFee', () => {
  it('charges base + distance × per km', () => {
    expect(computeDeliveryFee(fee(), 20, 3)).toMatchObject({ eligible: true, fee: 10.49, distance_charge: 4.5 });
  });

  it('avoids floating point residue', () => {
    expect(computeDeliveryFee({ base_fee: 5.99, per_km_fee: 1.1 }, 20, 3).fee).toBe(9.29);
  });

  it('is flat when per_km_fee is null or zero', () => {
    expect(computeDeliveryFee(fee({ per_km_fee: null }), 20, 9).fee).toBe(5.99);
    expect(computeDeliveryFee(fee({ per_km_fee: 0 }), 20, 9).fee).toBe(5.99);
  });

  it('is 0.00 when subtotal >= free_above', () => {
    expect(computeDeliveryFee(fee(), 50, 4)).toMatchObject({ free_delivery: true, fee: 0 });
    expect(computeDeliveryFee(fee(), 49.99, 0).fee).toBe(5.99);
  });

  it('blocks below the minimum order with the missing amount', () => {
    expect(computeDeliveryFee(fee(), 8, 0)).toMatchObject({ eligible: false, shortfall: 2.99 });
  });
});

describe('money inputs (2 decimals)', () => {
  it('parses, rejects a third decimal and formats on blur', () => {
    expect(parseMoneyInput('', 'Fee')).toEqual({ ok: true, value: null });
    expect(parseMoneyInput('$5.9', 'Fee')).toEqual({ ok: true, value: 5.9 });
    expect(parseMoneyInput('5.999', 'Fee')).toEqual({ ok: false, error: 'Fee allows at most 2 decimals' });
    expect(parseMoneyInput('-1', 'Fee').ok).toBe(false);
    expect(formatMoneyInput('5.9')).toBe('5.90');
    expect(formatMoneyInput('abc')).toBe('abc');
  });

  it('formats currency', () => {
    expect(formatMoney(5.99)).toBe('$5.99');
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(null)).toBe('—');
  });

  it('normalizes Postgres decimal strings', () => {
    const raw = { ...fee(), base_fee: '5.99', per_km_fee: null, free_above: '50.00' } as unknown as DeliveryFee;
    expect(normalizeFee(raw)).toMatchObject({ base_fee: 5.99, per_km_fee: null, free_above: 50 });
  });
});

describe('validateFeeForm', () => {
  it('produces a clean payload', () => {
    const { errors, parsed } = validateFeeForm(form(), { fees: [] });
    expect(errors).toEqual({});
    expect(parsed).toEqual({
      deliveryZone: 2,
      base_fee: 5.99,
      per_km_fee: 1.5,
      min_order_amount: 10.99,
      free_above: 50,
      status: 'active',
    });
  });

  it('requires a positive base fee and treats optional amounts as null', () => {
    expect(validateFeeForm(form({ baseFee: '' }), { fees: [] }).errors.baseFee).toMatch(/required/);
    expect(validateFeeForm(form({ baseFee: '0' }), { fees: [] }).errors.baseFee).toMatch(/greater than 0/);
    const { parsed } = validateFeeForm(form({ perKmFee: '', minOrder: '', freeAbove: '' }), { fees: [] });
    expect(parsed).toMatchObject({ per_km_fee: null, min_order_amount: null, free_above: null });
  });

  it('rejects free_above lower than or equal to min_order_amount', () => {
    expect(validateFeeForm(form({ freeAbove: '10.99' }), { fees: [] }).errors.freeAbove).toMatch(/greater than the minimum/);
    expect(validateFeeForm(form({ freeAbove: '5' }), { fees: [] }).parsed).toBeNull();
  });

  it('prevents a second active fee for the same zone', () => {
    const fees = [fee({ id: 7, deliveryZone: { id: 2, name: 'Sur' } })];
    expect(validateFeeForm(form(), { fees }).errors.status).toMatch(/#FEE-7 is already the active fee/);
    expect(validateFeeForm(form({ status: 'inactive' }), { fees }).parsed).not.toBeNull();
    // Editing the active rate itself does not clash with itself.
    expect(validateFeeForm(form(), { fees, editingId: 7 }).errors.status).toBeUndefined();
  });

  it('finds the active fee of a zone', () => {
    const fees = [fee({ id: 1, status: 'inactive' }), fee({ id: 2 })];
    expect(activeFeeForZone(fees, 1)?.id).toBe(2);
    expect(activeFeeForZone(fees, 1, 2)).toBeNull();
  });
});

describe('filters and KPIs', () => {
  it('filters by zone name and status', () => {
    expect(matchesFeeFilters(fee(), { search: 'norte', statuses: [] })).toBe(true);
    expect(matchesFeeFilters(fee(), { search: 'sur', statuses: [] })).toBe(false);
    expect(matchesFeeFilters(fee(), { search: '', statuses: ['inactive'] })).toBe(false);
  });

  it('averages active fees of active zones, counts free shipping and flags unpriced zones', () => {
    const zones = [zone(1), zone(2), zone(3), zone(4, 'inactive')];
    const fees = [
      fee({ id: 1, deliveryZone: { id: 1, name: 'Zone 1' }, base_fee: 4 }),
      fee({ id: 2, deliveryZone: { id: 2, name: 'Zone 2' }, base_fee: 6, free_above: null }),
      fee({ id: 3, deliveryZone: { id: 3, name: 'Zone 3' }, status: 'inactive' }),
      fee({ id: 4, deliveryZone: { id: 4, name: 'Zone 4' }, base_fee: 100 }),
    ];
    const metrics = computeFeeMetrics(fees, zones);
    expect(metrics.averageBaseFee).toBe(5);
    // Zone 4 is down: its free_above doesn't count (same as the backend summary).
    expect(metrics.freeShippingZones).toBe(1);
    expect(metrics.zonesLackingFees.map((z) => z.id)).toEqual([3]);
  });

  it('ignores a free_above of 0 as a free shipping zone', () => {
    const metrics = computeFeeMetrics([fee({ free_above: 0 })], [zone(1)]);
    expect(metrics.freeShippingZones).toBe(0);
  });

  it('has no average without active fees', () => {
    expect(computeFeeMetrics([], [zone(1)]).averageBaseFee).toBeNull();
  });
});

describe('resolveFeeMetrics', () => {
  const local = { averageBaseFee: 5, freeShippingZones: 1, zonesLackingFees: [{ id: 3, name: 'Zone 3' }] };

  it('uses the server summary when it is well formed', () => {
    expect(
      resolveFeeMetrics(local, {
        active_zones: 4, active_fees: 3, avg_base_fee: 6.5, free_shipping_zones: 2,
        zones_without_fee_count: 1, zones_without_fee: [{ id: 9, name: 'Norte' }],
      }),
    ).toEqual({ averageBaseFee: 6.5, freeShippingZones: 2, zonesLackingFees: [{ id: 9, name: 'Norte' }] });
  });

  it('keeps a null average from the server', () => {
    expect(
      resolveFeeMetrics(local, {
        active_zones: 0, active_fees: 0, avg_base_fee: null, free_shipping_zones: 0,
        zones_without_fee_count: 0, zones_without_fee: [],
      }).averageBaseFee,
    ).toBeNull();
  });

  it('falls back to the client metrics without a usable summary', () => {
    expect(resolveFeeMetrics(local, null)).toBe(local);
    expect(resolveFeeMetrics(local, [] as never)).toBe(local);
  });
});
