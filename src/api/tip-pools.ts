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

export const MOCK_TIP_POOLS: TipPool[] = [
  {
    id: 301,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 801,
    name: 'Dinner Front of House Equal Pool',
    distribution_type: 'EQUAL',
    total_amount: 345.5,
    status: 'OPEN',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    closed_at: null,
    shift_time_window: '17:00 - 23:00',
    notes: 'Active evening shift pool shared equally across servers and bussers',
  },
  {
    id: 302,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 802,
    name: 'Bar & Lounge Points Distribution',
    distribution_type: 'POINTS',
    total_amount: 150.5,
    status: 'OPEN',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    closed_at: null,
    shift_time_window: '16:00 - 01:00',
    notes: 'Point-weighted pool for bartenders (3 pts) and barbacks (1.5 pts)',
  },
  {
    id: 303,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 803,
    name: 'Lunch Shift Role-Based Pool',
    distribution_type: 'ROLE_BASED',
    total_amount: 210.75,
    status: 'CLOSED',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    closed_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    shift_time_window: '11:00 - 16:00',
    notes: 'Closed at shift end timestamp, pending manager sign-off and settlement',
  },
  {
    id: 304,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 804,
    name: 'Weekend Brunch Percentage Split',
    distribution_type: 'PERCENTAGE',
    total_amount: 620.0,
    status: 'SETTLED',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 28).toISOString(),
    closed_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    shift_time_window: '09:00 - 15:00',
    notes: 'Fully settled and distributed (70% Servers, 20% Kitchen, 10% Hosts)',
  },
  {
    id: 305,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 805,
    name: 'Late Night Patio Equal Pool',
    distribution_type: 'EQUAL',
    total_amount: 95.0,
    status: 'OPEN',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 1.5).toISOString(),
    closed_at: null,
    shift_time_window: '21:00 - 02:00',
    notes: 'Patio section active night pool',
  },
  {
    id: 306,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 806,
    name: 'Archived Duplicate Shift Pool',
    distribution_type: 'EQUAL',
    total_amount: 45.0,
    status: 'CLOSED',
    record_status: 'DELETED',
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    closed_at: new Date(Date.now() - 3600000 * 40).toISOString(),
    shift_time_window: '10:00 - 15:00',
    notes: 'Soft deleted pool due to duplicate shift registration',
  },
  {
    id: 307,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 807,
    name: 'Special Event Catering Points Pool',
    distribution_type: 'POINTS',
    total_amount: 890.25,
    status: 'SETTLED',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 50).toISOString(),
    closed_at: new Date(Date.now() - 3600000 * 42).toISOString(),
    shift_time_window: '12:00 - 22:00',
    notes: 'Private hall banquet tip pool',
  },
];

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

  try {
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
  } catch (err) {
    return filterMockTipPools(params);
  }
}

export function filterMockTipPools(params: FetchTipPoolsParams): TipPool[] {
  let list = [...MOCK_TIP_POOLS];

  if (params.shift_id !== undefined && params.shift_id !== '') {
    const targetShift = String(params.shift_id).toLowerCase().replace('#sft-', '');
    list = list.filter((p) => String(p.shift_id).toLowerCase().includes(targetShift));
  }

  if (params.status && params.status !== 'ALL') {
    list = list.filter((p) => p.status === params.status);
  }

  if (params.distribution_type && params.distribution_type !== 'ALL') {
    list = list.filter((p) => p.distribution_type === params.distribution_type);
  }

  if (params.record_status && params.record_status !== 'ALL') {
    list = list.filter((p) => p.record_status === params.record_status);
  }

  if (params.search && params.search.trim() !== '') {
    const term = params.search.trim().toLowerCase();
    list = list.filter((p) => {
      const polRef = `#pol-${p.id}`.toLowerCase();
      const sftRef = `#sft-${p.shift_id}`.toLowerCase();
      const poolName = p.name.toLowerCase();
      return (
        polRef.includes(term) ||
        sftRef.includes(term) ||
        poolName.includes(term) ||
        String(p.id).includes(term) ||
        String(p.shift_id).includes(term)
      );
    });
  }

  return list.map(normalizeTipPool);
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

export const MOCK_ACTIVE_SHIFTS: ActiveShiftOption[] = [
  { id: 801, name: 'Dinner Front of House (#SFT-801)', time_window: '17:00 - 23:00', status: 'ACTIVE' },
  { id: 802, name: 'Bar & Lounge Shift (#SFT-802)', time_window: '16:00 - 01:00', status: 'ACTIVE' },
  { id: 803, name: 'Lunch Floor Shift (#SFT-803)', time_window: '11:00 - 16:00', status: 'OPEN' },
  { id: 804, name: 'Weekend Brunch (#SFT-804)', time_window: '09:00 - 15:00', status: 'OPEN' },
  { id: 805, name: 'Late Night Patio (#SFT-805)', time_window: '21:00 - 02:00', status: 'ACTIVE' },
  { id: 808, name: 'Morning Opening Shift (#SFT-808)', time_window: '07:00 - 15:00', status: 'OPEN' },
  { id: 809, name: 'Evening Closing Shift (#SFT-809)', time_window: '15:00 - 23:00', status: 'OPEN' },
];

export async function fetchActiveShifts(): Promise<ActiveShiftOption[]> {
  try {
    const response = await fetch(`${API_BASE}/v1/shifts/active`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const json = await response.json();
    return Array.isArray(json) ? json : json.data || MOCK_ACTIVE_SHIFTS;
  } catch {
    return [...MOCK_ACTIVE_SHIFTS];
  }
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

  try {
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
    const created = normalizeTipPool(json.data || json);
    MOCK_TIP_POOLS.unshift(created);
    return created;
  } catch {
    const matchingShift = MOCK_ACTIVE_SHIFTS.find((s) => s.id === Number(dto.shift_id));
    const newPoolId = Math.floor(300 + Math.random() * 600);
    const created: TipPool = {
      id: newPoolId,
      company_id: dto.company_id || 'cmp-01',
      merchant_id: dto.merchant_id || 'mch-01',
      shift_id: Number(dto.shift_id),
      name: dto.name.trim(),
      distribution_type: dto.distribution_type,
      total_amount: 0.0,
      status: initialStatus,
      record_status: dto.record_status || 'ACTIVE',
      created_at: new Date().toISOString(),
      closed_at: initialClosedAt,
      shift_time_window: matchingShift?.time_window || 'Operational Shift',
      notes: dto.notes || null,
    };

    MOCK_TIP_POOLS.unshift(created);
    return created;
  }
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

  const existingIndex = MOCK_TIP_POOLS.findIndex((p) => p.id === id);
  const existingPool = existingIndex !== -1 ? MOCK_TIP_POOLS[existingIndex] : null;

  // State Transition Guard: Automatic closed_at calculation
  let closedAtCalculated: string | null | undefined = dto.closed_at;
  if (dto.status !== undefined) {
    if (dto.status === 'CLOSED') {
      // Transitioning to CLOSED automatically populates closed_at
      closedAtCalculated = existingPool?.closed_at || new Date().toISOString();
    } else if (dto.status === 'OPEN') {
      closedAtCalculated = null;
    }
  }

  try {
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
    const updated = normalizeTipPool(json.data || json);
    if (existingIndex !== -1) {
      MOCK_TIP_POOLS[existingIndex] = updated;
    }
    return updated;
  } catch {
    if (!existingPool) {
      throw new Error(`Tip pool #${id} not found.`);
    }

    const updated: TipPool = {
      ...existingPool,
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.shift_id ? { shift_id: Number(dto.shift_id) } : {}),
      ...(dto.distribution_type ? { distribution_type: dto.distribution_type } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.record_status ? { record_status: dto.record_status } : {}),
      ...(closedAtCalculated !== undefined ? { closed_at: closedAtCalculated } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      updated_at: new Date().toISOString(),
    };

    if (dto.shift_id) {
      const shiftMatch = MOCK_ACTIVE_SHIFTS.find((s) => s.id === Number(dto.shift_id));
      if (shiftMatch) {
        updated.shift_time_window = shiftMatch.time_window;
      }
    }

    MOCK_TIP_POOLS[existingIndex] = updated;
    return updated;
  }
}

