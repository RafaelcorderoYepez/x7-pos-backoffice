import {
  apiRequest,
  unwrapItem,
  unwrapList,
  type MaybeEnvelopedItem,
  type MaybeEnvelopedList,
} from './http';
import type {
  CashTipMovement,
  CreateCashTipMovementDto,
  CashDrawerOption,
  TipOption,
  FetchCashTipMovementsParams,
  CashTipMovementsSummaryMetrics,
} from '../types/cash-tip-movement';
export type {
  CashTipMovement,
  CreateCashTipMovementDto,
  CashDrawerOption,
  TipOption,
  FetchCashTipMovementsParams,
  CashTipMovementsSummaryMetrics,
} from '../types/cash-tip-movement';

export async function fetchOpenCashDrawers(): Promise<CashDrawerOption[]> {
  const payload = await apiRequest<MaybeEnvelopedList<Record<string, unknown>>>(
    '/v1/cash-drawers',
    { method: 'GET' },
    'Failed to fetch open cash drawers.',
  );
  return unwrapList(payload).map((d) => ({
    id: Number(d.id),
    drawer_name: (d.drawer_name as string) || `Cash Drawer #${d.id}`,
    status: String(d.status || 'OPEN').toUpperCase(),
    current_balance: Number(d.currentBalance ?? d.current_balance ?? 0),
  }));
}

export async function fetchAvailableTips(): Promise<TipOption[]> {
  const payload = await apiRequest<MaybeEnvelopedList<TipOption>>(
    '/v1/tips/available',
    { method: 'GET' },
    'Failed to fetch available tips.',
  );
  return unwrapList(payload);
}

/**
 * Hydrates cash tip movements workspace targeting backend REST endpoint GET /api/v1/cash-tip-movements.
 */
export async function fetchCashTipMovements(
  params: FetchCashTipMovementsParams = {}
): Promise<CashTipMovement[]> {
  const query = new URLSearchParams();

  if (params.company_id) query.append('company_id', params.company_id);
  if (params.merchant_id) query.append('merchant_id', params.merchant_id);
  if (params.cash_drawer_id !== undefined && params.cash_drawer_id !== '' && params.cash_drawer_id !== 'ALL') {
    query.append('cash_drawer_id', String(params.cash_drawer_id));
  }
  if (params.tip_id !== undefined && params.tip_id !== '' && params.tip_id !== 'ALL') {
    query.append('tip_id', String(params.tip_id));
  }
  if (params.movement_type && params.movement_type !== 'ALL') {
    query.append('movement_type', params.movement_type);
  }
  if (params.search) query.append('search', params.search);
  if (params.date_from) query.append('date_from', params.date_from);
  if (params.date_to) query.append('date_to', params.date_to);

  const payload = await apiRequest<MaybeEnvelopedList<CashTipMovement>>(
    `/v1/cash-tip-movements?${query.toString()}`,
    { method: 'GET' },
    'Failed to load cash tip movements. Please try again.',
  );
  return unwrapList(payload);
}

/**
 * Registers a physical cash tip movement into (IN) or out of (OUT) an open cash drawer.
 */
export async function createCashTipMovement(
  dto: CreateCashTipMovementDto
): Promise<CashTipMovement> {
  const payload = await apiRequest<MaybeEnvelopedItem<CashTipMovement>>(
    '/v1/cash-tip-movements',
    { method: 'POST', body: JSON.stringify(dto) },
    'Failed to create cash tip movement.',
  );
  return unwrapItem(payload);
}

/**
 * Computes summary metrics for Cash Tip Movements.
 */
export function calculateCashTipMovementsSummaryMetrics(
  movements: CashTipMovement[]
): CashTipMovementsSummaryMetrics {
  let totalInAmount = 0;
  let totalOutAmount = 0;
  let inCount = 0;
  let outCount = 0;

  movements.forEach((item) => {
    const amt = item.amount || 0;
    if (item.movement_type === 'IN') {
      totalInAmount += amt;
      inCount += 1;
    } else if (item.movement_type === 'OUT') {
      totalOutAmount += amt;
      outCount += 1;
    }
  });

  return {
    totalAmount: totalInAmount + totalOutAmount,
    totalInAmount,
    totalOutAmount,
    netAmount: totalInAmount - totalOutAmount,
    totalCount: movements.length,
    inCount,
    outCount,
  };
}

/**
 * Formats ISO created_at timestamp into human-readable date & time string.
 */
export function formatCashTipMovementDateTime(isoString: string): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

