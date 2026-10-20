// Pure logic of the distribution rates workspace.
//
// `computeDeliveryFee` is the mirror of
// x7-pos-back-end/src/commerce/delivery-system/delivery-fee/utils/delivery-fee-calculator.util.ts
// (used for the drawer preview; the calculation that counts is `POST /delivery-fee/quote`).
// Consistency rules (free_above > min_order_amount, only one active rate per zone)
// They are also applied by the server: here they only avoid a trip that will end in 400/409.

import type {
  DeliveryFee,
  DeliveryFeeStatus,
  DeliveryFeeSummary,
  DeliveryZone,
} from '../types/delivery';

export const FEE_STATUSES: DeliveryFeeStatus[] = ['active', 'inactive'];

export const FEE_STATUS_META: Record<DeliveryFeeStatus, { label: string; color: string; pill: string }> = {
  active: { label: 'Active', color: '#10b981', pill: 'bg-[#10b981] text-white' },
  inactive: { label: 'Inactive', color: '#64748b', pill: 'bg-[#64748b] text-white' },
};

/** decimal(12, 2) in the base. */
export const FEE_MAX_AMOUNT = 9999999999.99;

export const feeCode = (id: number): string => `#FEE-${id}`;

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${abs}`;
}

/** Postgres sends decimals as text; here they are normalized only once when hydrating. */
export function normalizeFee(raw: DeliveryFee): DeliveryFee {
  const num = (v: unknown): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v);
  return {
    ...raw,
    base_fee: num(raw.base_fee) ?? 0,
    per_km_fee: num(raw.per_km_fee),
    min_order_amount: num(raw.min_order_amount),
    free_above: num(raw.free_above),
  };
}

// ================= Calculadora =================

export interface FeeSchedule {
  base_fee: number;
  per_km_fee?: number | null;
  min_order_amount?: number | null;
  free_above?: number | null;
}

export interface FeeComputation {
  eligible: boolean;
  shortfall: number;
  free_delivery: boolean;
  distance_charge: number;
  fee: number;
}

const toCents = (value: number | null | undefined): number | null =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Math.round(Number(value) * 100);

export function computeDeliveryFee(
  schedule: FeeSchedule,
  subtotal: number,
  distanceKm = 0,
): FeeComputation {
  const subtotalCents = toCents(subtotal) ?? 0;
  const baseCents = toCents(schedule.base_fee) ?? 0;
  const perKmCents = toCents(schedule.per_km_fee) ?? 0;
  const minCents = toCents(schedule.min_order_amount);
  const freeCents = toCents(schedule.free_above);
  const distance = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;

  const shortfallCents = minCents !== null && subtotalCents < minCents ? minCents - subtotalCents : 0;
  const free = freeCents !== null && subtotalCents >= freeCents;
  const distanceChargeCents = Math.round(distance * perKmCents);
  return {
    eligible: shortfallCents === 0,
    shortfall: shortfallCents / 100,
    free_delivery: free,
    distance_charge: free ? 0 : distanceChargeCents / 100,
    fee: free ? 0 : (baseCents + distanceChargeCents) / 100,
  };
}

// ================= Amount entries =================

export type MoneyParse = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Handwritten amount. Empty = null (optional field with no value). More than 2 decimal places
 * REJECT instead of rounding: DTO uses `maxDecimalPlaces: 2` and rounding silently
 * would change the rate that the user believes they have set.
 */
export function parseMoneyInput(raw: string, label: string): MoneyParse {
  const text = raw.trim().replace(/^\$/, '');
  if (!text) return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: `${label} must be a number` };
  const [, decimals = ''] = text.split('.');
  if (decimals.length > 2) return { ok: false, error: `${label} allows at most 2 decimals` };
  const value = Number(text);
  if (value > FEE_MAX_AMOUNT) return { ok: false, error: `${label} is too large` };
  return { ok: true, value };
}

/** Normalizes when leaving the field: "5.9" → "5.90". Leave intact what is not an amount. */
export function formatMoneyInput(raw: string): string {
  const parsed = parseMoneyInput(raw, 'value');
  return parsed.ok && parsed.value !== null ? parsed.value.toFixed(2) : raw;
}

export const moneyInputValue = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : Number(value).toFixed(2);

// ================= Form validation =================

export interface FeeFormValues {
  zoneId: string;
  baseFee: string;
  perKmFee: string;
  minOrder: string;
  freeAbove: string;
  status: DeliveryFeeStatus;
}

export type FeeFormErrors = Partial<Record<keyof FeeFormValues, string>>;

export interface ParsedFeeForm {
  deliveryZone: number;
  base_fee: number;
  per_km_fee: number | null;
  min_order_amount: number | null;
  free_above: number | null;
  status: DeliveryFeeStatus;
}

export function validateFeeForm(
  values: FeeFormValues,
  context: { fees: DeliveryFee[]; editingId?: number },
): { errors: FeeFormErrors; parsed: ParsedFeeForm | null } {
  const errors: FeeFormErrors = {};

  if (!values.zoneId) errors.zoneId = 'Pick the delivery zone this fee applies to';

  const base = parseMoneyInput(values.baseFee, 'Base fee');
  if (!base.ok) errors.baseFee = base.error;
  else if (base.value === null) errors.baseFee = 'Base fee is required';
  else if (base.value <= 0) errors.baseFee = 'Base fee must be greater than 0';

  const perKm = parseMoneyInput(values.perKmFee, 'Per km rate');
  if (!perKm.ok) errors.perKmFee = perKm.error;
  const minOrder = parseMoneyInput(values.minOrder, 'Minimum order');
  if (!minOrder.ok) errors.minOrder = minOrder.error;
  const freeAbove = parseMoneyInput(values.freeAbove, 'Free above');
  if (!freeAbove.ok) errors.freeAbove = freeAbove.error;

  if (
    minOrder.ok &&
    freeAbove.ok &&
    minOrder.value !== null &&
    freeAbove.value !== null &&
    freeAbove.value <= minOrder.value
  ) {
    errors.freeAbove = `Free delivery threshold must be greater than the minimum order (${formatMoney(minOrder.value)})`;
  }

  if (values.zoneId && values.status === 'active') {
    const clash = activeFeeForZone(context.fees, Number(values.zoneId), context.editingId);
    if (clash) {
      errors.status = `${feeCode(clash.id)} is already the active fee for this zone — deactivate it first or save this one as inactive`;
    }
  }

  const valid = Object.keys(errors).length === 0;
  return {
    errors,
    parsed: valid
      ? {
          deliveryZone: Number(values.zoneId),
          base_fee: (base as { value: number }).value,
          per_km_fee: (perKm as { value: number | null }).value,
          min_order_amount: (minOrder as { value: number | null }).value,
          free_above: (freeAbove as { value: number | null }).value,
          status: values.status,
        }
      : null,
  };
}

export function activeFeeForZone(
  fees: DeliveryFee[],
  zoneId: number,
  excludeId?: number,
): DeliveryFee | null {
  return (
    fees.find(
      (fee) => fee.status === 'active' && fee.deliveryZone?.id === zoneId && fee.id !== excludeId,
    ) ?? null
  );
}

// ================= Filtros y KPIs =================

export interface FeeFilters {
  search: string;
  statuses: DeliveryFeeStatus[];
}

export const EMPTY_FEE_FILTERS: FeeFilters = { search: '', statuses: [] };

export const hasActiveFeeFilters = (filters: FeeFilters): boolean =>
  Boolean(filters.search.trim()) || filters.statuses.length > 0;

const fold = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matchesFeeFilters(fee: DeliveryFee, filters: FeeFilters): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(fee.status)) return false;
  const term = fold(filters.search.trim());
  if (!term) return true;
  return fold(fee.deliveryZone?.name ?? '').includes(term) || fold(feeCode(fee.id)).includes(term);
}

export interface FeeMetrics {
  /** Base_fee average of active zone active rates; null if there are none. */
  averageBaseFee: number | null;
  /** Active zones with an active rate that offers free shipping (free_above > 0). */
  freeShippingZones: number;
  /** Active zones without active rate: there no one can collect a distribution. */
  zonesLackingFees: Array<Pick<DeliveryZone, 'id' | 'name'>>;
}

export function computeFeeMetrics(fees: DeliveryFee[], zones: DeliveryZone[]): FeeMetrics {
  const activeZoneIds = new Set(zones.filter((z) => z.status === 'active').map((z) => z.id));
  const activeFees = fees.filter((fee) => fee.status === 'active' && fee.deliveryZone);
  const pricedActive = activeFees.filter((fee) => activeZoneIds.has(fee.deliveryZone!.id));

  const averageBaseFee = pricedActive.length
    ? Math.round(
        (pricedActive.reduce((sum, fee) => sum + Math.round(fee.base_fee * 100), 0) /
          pricedActive.length),
      ) / 100
    : null;

  // Same as `GET /delivery-fee/summary`: only ACTIVE zones with a valid free_above (> 0).
  const freeShippingZones = new Set(
    pricedActive
      .filter((fee) => fee.free_above !== null && Number(fee.free_above) > 0)
      .map((fee) => fee.deliveryZone!.id),
  ).size;

  const pricedZoneIds = new Set(activeFees.map((fee) => fee.deliveryZone!.id));
  const zonesLackingFees = zones.filter(
    (zone) => zone.status === 'active' && !pricedZoneIds.has(zone.id),
  );

  return { averageBaseFee, freeShippingZones, zonesLackingFees };
}

/**
 * Banner KPIs: those of the server (`GET /delivery-fee/summary`) when they arrive correctly
 * formed; if not (old backend, network failure), those calculated on the client.
 */
export function resolveFeeMetrics(
  local: FeeMetrics,
  summary: DeliveryFeeSummary | null | undefined,
): FeeMetrics {
  if (
    !summary ||
    typeof summary !== 'object' ||
    typeof summary.free_shipping_zones !== 'number' ||
    !Array.isArray(summary.zones_without_fee)
  ) {
    return local;
  }
  return {
    averageBaseFee:
      summary.avg_base_fee === null || summary.avg_base_fee === undefined
        ? null
        : Number(summary.avg_base_fee),
    freeShippingZones: summary.free_shipping_zones,
    zonesLackingFees: summary.zones_without_fee.map((z) => ({ id: Number(z.id), name: z.name })),
  };
}
