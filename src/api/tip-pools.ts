import { getAccessToken } from '../lib/auth-storage';
import type {
  TipPool,
  FetchTipPoolsParams,
  TipPoolsSummaryMetrics,
  CreateTipPoolDto,
  UpdateTipPoolDto,
  ActiveShiftOption,
} from '../types/tip-pools';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';



function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface FetchTipPoolsResponse {
  data: TipPool[];
  meta?: {
    total: number;
    company_id: string;
    merchant_id: string;
    indexes_used?: string[];
  };
}

export async function fetchTipPools(params: FetchTipPoolsParams): Promise<TipPool[]> {
  const query = new URLSearchParams();
  query.append('company_id', params.company_id);
  query.append('merchant_id', params.merchant_id);

  if (params.shift_id !== undefined && params.shift_id !== '') {
    query.append('shift_id', String(params.shift_id));
  }

  if (params.status && params.status !== 'ALL') {
    query.append('status', params.status);
  }

  if (params.distribution_type && params.distribution_type !== 'ALL') {
    query.append('distribution_type', params.distribution_type);
  }

  if (params.record_status && params.record_status !== 'ALL') {
    query.append('record_status', params.record_status);
  }

  if (params.search && params.search.trim() !== '') {
    query.append('search', params.search.trim());
  }

  const path = `/v1/tip-pools?${query.toString()}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  const json = (await response.json()) as FetchTipPoolsResponse | TipPool[];
  let pools: TipPool[] = [];

  if (Array.isArray(json)) {
    pools = json;
  } else if (json && Array.isArray(json.data)) {
    pools = json.data;
  }

  return pools.map(normalizeTipPool);
}

export function normalizeTipPool(raw: TipPool): TipPool {
  return {
    ...raw,
    total_amount: Number(raw.total_amount) || 0,
  };
}

export function formatTipPoolCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTipPoolDateTime(isoString?: string | null): string {
  if (!isoString) return 'Active Shift';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Active Shift';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateTipPoolsSummaryMetrics(pools: TipPool[]): TipPoolsSummaryMetrics {
  const activePools = pools.filter((p) => p.record_status === 'ACTIVE');
  const deletedPools = pools.filter((p) => p.record_status === 'DELETED');

  const totalAmount = activePools.reduce((acc, p) => acc + p.total_amount, 0);

  const openPools = activePools.filter((p) => p.status === 'OPEN');
  const openCount = openPools.length;
  const openAmount = openPools.reduce((acc, p) => acc + p.total_amount, 0);

  const closedPools = activePools.filter((p) => p.status === 'CLOSED');
  const closedCount = closedPools.length;
  const closedAmount = closedPools.reduce((acc, p) => acc + p.total_amount, 0);

  const settledPools = activePools.filter((p) => p.status === 'SETTLED');
  const settledCount = settledPools.length;
  const settledAmount = settledPools.reduce((acc, p) => acc + p.total_amount, 0);

  return {
    totalAmount,
    totalCount: activePools.length,
    openCount,
    openAmount,
    closedCount,
    closedAmount,
    settledCount,
    settledAmount,
    activeCount: activePools.length,
    deletedCount: deletedPools.length,
  };
}

export async function fetchActiveShifts(): Promise<ActiveShiftOption[]> {
  const response = await fetch(`${API_BASE}/v1/shifts/active`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }
  const json = await response.json();
  return Array.isArray(json) ? json : json.data || [];
}

export async function createTipPool(dto: CreateTipPoolDto): Promise<TipPool> {
  if (!dto.shift_id || isNaN(Number(dto.shift_id))) {
    throw new Error('Shift Relation Binding Error: Selection of a valid active shift_id is required.');
  }

  if (!dto.name || dto.name.trim() === '') {
    throw new Error('Tip pool name is required.');
  }

  if (dto.name.length > 150) {
    throw new Error('Tip pool name cannot exceed 150 characters.');
  }

  const initialStatus = dto.status || 'OPEN';
  const initialClosedAt = initialStatus === 'CLOSED' ? new Date().toISOString() : null;

  const response = await fetch(`${API_BASE}/v1/tip-pools`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      ...dto,
      status: initialStatus,
      closed_at: initialClosedAt,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  const json = await response.json();
  return normalizeTipPool(json.data || json);
}

export async function updateTipPool(id: number, dto: UpdateTipPoolDto): Promise<TipPool> {
  if (dto.name !== undefined) {
    if (!dto.name || dto.name.trim() === '') {
      throw new Error('Tip pool name is required.');
    }
    if (dto.name.length > 150) {
      throw new Error('Tip pool name cannot exceed 150 characters.');
    }
  }

  let closedAtCalculated: string | null | undefined = dto.closed_at;
  if (dto.status !== undefined) {
    if (dto.status === 'CLOSED') {
      closedAtCalculated = new Date().toISOString();
    } else if (dto.status === 'OPEN') {
      closedAtCalculated = null;
    }
  }

  const response = await fetch(`${API_BASE}/v1/tip-pools/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      ...dto,
      ...(closedAtCalculated !== undefined ? { closed_at: closedAtCalculated } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  const json = await response.json();
  return normalizeTipPool(json.data || json);
}

