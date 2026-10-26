import {
  apiRequest,
  unwrapItem,
  unwrapList,
  type MaybeEnvelopedItem,
  type MaybeEnvelopedList,
} from './http';
import type {
  Tip,
  FetchTipsParams,
  TipsSummaryMetrics,
} from '../types/tips';

export interface FetchTipsResponse {
  data: Tip[];
  meta?: {
    total: number;
    company_id: string;
    merchant_id: string;
    indexes_used?: string[];
  };
}

export async function fetchTips(params: FetchTipsParams): Promise<Tip[]> {
  const query = new URLSearchParams();
  query.append('company_id', params.company_id);
  query.append('merchant_id', params.merchant_id);

  if (params.order_id !== undefined && params.order_id !== '') {
    query.append('order_id', String(params.order_id));
  }

  if (params.status) {
    if (Array.isArray(params.status)) {
      params.status.forEach((st) => query.append('status', st));
    } else if (params.status !== 'ALL') {
      query.append('status', params.status);
    }
  }

  if (params.method && params.method !== 'ALL') {
    query.append('method', params.method);
  }

  if (params.record_status && params.record_status !== 'ALL') {
    query.append('record_status', params.record_status);
  }

  if (params.search && params.search.trim() !== '') {
    query.append('search', params.search.trim());
  }

  if (params.date_from) {
    query.append('date_from', params.date_from);
  }

  if (params.date_to) {
    query.append('date_to', params.date_to);
  }

  const path = `/v1/tips?${query.toString()}`;

  const json = await apiRequest<FetchTipsResponse | Tip[]>(
    path,
    { method: 'GET' },
    'Failed to load tips. Please try again.',
  );
  let tips: Tip[] = [];

  if (Array.isArray(json)) {
    tips = json;
  } else if (json && Array.isArray(json.data)) {
    tips = json.data;
  }

  return tips.map(normalizeTip);
}

export interface PaymentOption {
  id: number;
  reference?: string;
  method?: string;
  amount?: number;
  order_id?: number;
  status?: string;
}

export async function fetchPaymentOptionsForOrder(orderId: number): Promise<PaymentOption[]> {
  const json = await apiRequest<MaybeEnvelopedList<PaymentOption>>(
    `/v1/orders/${orderId}/payments`,
    { method: 'GET' },
    'Failed to fetch order payments.',
  );
  return unwrapList(json);
}

export async function updateTip(id: number, payload: Partial<Tip>): Promise<Tip> {
  const json = await apiRequest<MaybeEnvelopedItem<Tip>>(
    `/v1/tips/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    'Failed to update tip entry.',
  );
  return normalizeTip(unwrapItem(json));
}

export function normalizeTip(raw: Tip): Tip {
  return {
    ...raw,
    amount: Number(raw.amount) || 0,
  };
}

export function formatTipCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTipDateTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateTipsSummaryMetrics(tips: Tip[]): TipsSummaryMetrics {
  const activeTips = tips.filter((t) => t.record_status === 'ACTIVE');
  const deletedTips = tips.filter((t) => t.record_status === 'DELETED');

  const totalAmount = activeTips.reduce((acc, t) => acc + t.amount, 0);

  const pendingTips = activeTips.filter((t) => t.status === 'PENDING');
  const pendingCount = pendingTips.length;
  const pendingAmount = pendingTips.reduce((acc, t) => acc + t.amount, 0);

  const allocatedAmount = activeTips
    .filter((t) => t.status === 'ALLOCATED')
    .reduce((acc, t) => acc + t.amount, 0);

  const settledAmount = activeTips
    .filter((t) => t.status === 'SETTLED')
    .reduce((acc, t) => acc + t.amount, 0);

  return {
    totalAmount,
    pendingCount,
    pendingAmount,
    allocatedAmount,
    settledAmount,
    activeCount: activeTips.length,
    deletedCount: deletedTips.length,
  };
}
