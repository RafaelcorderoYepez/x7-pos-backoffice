import type { CashTransaction, CashTransactionType } from '../../../../types/cash-transaction';

export const BALANCE_INCREASING_TYPES: CashTransactionType[] = ['SALE', 'PAY_IN', 'opening', 'sale', 'tip', 'adjustment_up'];
export const BALANCE_DECREASING_TYPES: CashTransactionType[] = ['REFUND', 'PAY_OUT', 'DRAWER_DROP', 'refund', 'withdrawal', 'adjustment_down'];

export function isBalanceIncreasingType(type: CashTransactionType): boolean {
  return BALANCE_INCREASING_TYPES.includes(type);
}

export function isBalanceDecreasingType(type: CashTransactionType): boolean {
  return BALANCE_DECREASING_TYPES.includes(type);
}

export function formatTypeLabel(type: CashTransactionType): string {
  return type.replace(/_/g, ' ').toUpperCase();
}

export function formatLoyaltySource(source: string): string {
  return source.replace(/_/g, ' ');
}

export function amountColorClass(type: CashTransactionType): string {
  if (isBalanceIncreasingType(type)) return 'text-green-600 font-bold';
  if (isBalanceDecreasingType(type)) return 'text-[#ae001a] font-bold';
  return 'text-[#5f5e5e]';
}

export function normalizeTransaction(raw: CashTransaction): CashTransaction {
  return { ...raw, amount: Number(raw.amount) };
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
