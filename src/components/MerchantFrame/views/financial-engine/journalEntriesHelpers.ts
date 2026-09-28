import type { JournalEntryReferenceType, JournalEntryStatus } from '../../../../types/accounting';

export const STATUS_BADGE_CLASSES: Record<JournalEntryStatus, string> = {
  DRAFT: 'bg-amber-500/10 text-amber-600',
  POSTED: 'bg-green-500/10 text-green-600',
  VOIDED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

export const REFERENCE_TYPE_OPTIONS: JournalEntryReferenceType[] = [
  'ORDER',
  'PAYMENT',
  'PAYROLL',
  'TAX',
  'INVENTORY',
  'ADJUSTMENT',
  'MANUAL',
];

export function formatCurrency(n: number | null | undefined): string {
  const val = typeof n === 'number' && !isNaN(n) ? n : (parseFloat(String(n ?? 0)) || 0);
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEntryDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
