import { getAccessToken } from '../lib/auth-storage';
import type {
  TipSettlement,
  TipSettlementStatus,
  FetchTipSettlementsParams,
  TipSettlementsSummaryMetrics,
  CreateTipSettlementDto,
} from '../types/tip-settlements';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface FetchTipSettlementsResponse {
  data: TipSettlement[];
  meta?: {
    total: number;
    company_id: string;
    merchant_id: string;
    indexes_used?: string[];
  };
}

/**
 * Loads tip settlement records via GET /api/v1/tip-settlements.
 */
export async function fetchTipSettlements(
  params: FetchTipSettlementsParams = {}
): Promise<TipSettlement[]> {
  const query = new URLSearchParams();

  if (params.company_id) {
    query.append('company_id', params.company_id);
  }
  if (params.merchant_id) {
    query.append('merchant_id', params.merchant_id);
  }
  if (params.collaborator_id !== undefined && params.collaborator_id !== '') {
    query.append('collaborator_id', String(params.collaborator_id));
  }
  if (params.shift_id !== undefined && params.shift_id !== '') {
    query.append('shift_id', String(params.shift_id));
  }
  if (params.order_id !== undefined && params.order_id !== '') {
    query.append('order_id', String(params.order_id));
  }
  if (params.settlement_method && params.settlement_method !== 'ALL') {
    query.append('settlement_method', params.settlement_method);
  }
  if (params.status && params.status !== 'ALL') {
    query.append('status', params.status);
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

  const path = `/v1/tip-settlements?${query.toString()}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  const json = (await response.json()) as FetchTipSettlementsResponse | TipSettlement[];
  let settlements: TipSettlement[] = [];

  if (Array.isArray(json)) {
    settlements = json;
  } else if (json && Array.isArray(json.data)) {
    settlements = json.data;
  }

  return settlements.map(normalizeTipSettlement);
}

/**
 * Creates a new TipSettlement record.
 */
export async function createTipSettlement(dto: CreateTipSettlementDto): Promise<TipSettlement> {
  const response = await fetch(`${API_BASE}/v1/tip-settlements`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.message || `Failed to create tip settlement (${response.status})`);
  }

  const json = await response.json();
  return normalizeTipSettlement(json.data || json);
}

/**
 * Updates a TipSettlement status (e.g. SETTLED or CANCELLED) and sets authorizer.
 */
export async function updateTipSettlementStatus(
  id: number,
  status: TipSettlementStatus,
  settledBy?: number | string | null,
  notes?: string
): Promise<TipSettlement> {
  const response = await fetch(`${API_BASE}/v1/tip-settlements/${id}/status`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status, settled_by: settledBy, notes }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.message || `Failed to update settlement status (${response.status})`);
  }

  const json = await response.json();
  return normalizeTipSettlement(json.data || json);
}

export function normalizeTipSettlement(raw: TipSettlement): TipSettlement {
  return {
    ...raw,
    total_amount: Number(raw.total_amount) || 0,
  };
}

export function formatSettlementCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSettlementDateTime(isoString?: string | null): string {
  if (!isoString) return 'Pending Execution';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Pending Execution';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function calculateTipSettlementsSummaryMetrics(
  settlements: TipSettlement[]
): TipSettlementsSummaryMetrics {
  const settledList = settlements.filter((s) => s.status === 'SETTLED');
  const pendingList = settlements.filter((s) => s.status === 'PENDING');
  const cancelledList = settlements.filter((s) => s.status === 'CANCELLED');

  const totalSettledAmount = settledList.reduce((acc, s) => acc + s.total_amount, 0);

  const cashAmount = settlements
    .filter((s) => s.settlement_method === 'CASH' && s.status === 'SETTLED')
    .reduce((acc, s) => acc + s.total_amount, 0);

  const payrollAmount = settlements
    .filter((s) => s.settlement_method === 'PAYROLL' && s.status === 'SETTLED')
    .reduce((acc, s) => acc + s.total_amount, 0);

  const bankTransferAmount = settlements
    .filter((s) => s.settlement_method === 'BANK_TRANSFER' && s.status === 'SETTLED')
    .reduce((acc, s) => acc + s.total_amount, 0);

  const avgSettledAmount =
    settledList.length > 0 ? totalSettledAmount / settledList.length : 0;

  return {
    totalSettledAmount,
    totalCount: settlements.length,
    settledCount: settledList.length,
    pendingCount: pendingList.length,
    cancelledCount: cancelledList.length,
    avgSettledAmount,
    cashAmount,
    payrollAmount,
    bankTransferAmount,
  };
}
