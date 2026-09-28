import type { CashShift, CashShiftStatus } from '../../../../types/cash-shift';

export const STATUS_BADGE_CLASSES: Record<CashShiftStatus, string> = {
  OPEN: 'bg-green-500/10 text-green-600',
  CLOSED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  DISCREPANCY: 'bg-orange-500/10 text-orange-700',
  AUDITED: 'bg-purple-500/10 text-purple-700',
};

// The backend stores balances as Postgres `decimal` columns with no server-side
// coercion, so they arrive over the wire as numeric strings (e.g. "120.00").
// Normalize at the fetch boundary so every `CashShift` in state has real numbers.
export function normalizeShift(raw: CashShift): CashShift {
  return {
    ...raw,
    openingBalance: Number(raw.openingBalance),
    systemAmount: raw.systemAmount == null ? null : Number(raw.systemAmount),
    declaredAmount: raw.declaredAmount == null ? null : Number(raw.declaredAmount),
    difference: raw.difference == null ? null : Number(raw.difference),
  };
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function varianceColorClass(difference: number | null): string {
  if (difference == null) return 'text-[#5f5e5e]';
  if (difference === 0) return 'text-[#1d1c17]';
  return difference > 0 ? 'text-green-600 font-bold' : 'text-[#ae001a] font-bold';
}

export function formatVariance(difference: number): string {
  return difference === 0
    ? formatCurrency(0)
    : `${difference > 0 ? '+' : '-'}${formatCurrency(Math.abs(difference))}`;
}
