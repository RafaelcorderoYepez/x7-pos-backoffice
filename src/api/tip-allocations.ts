import { getAccessToken } from '../lib/auth-storage';
import type {
  TipAllocation,
  FetchTipAllocationsParams,
  TipAllocationsSummaryMetrics,
  CreateTipAllocationDto,
  UpdateTipAllocationDto,
  TipOption,
  ShiftOption,
} from '../types/tip-allocations';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const MOCK_TIP_OPTIONS: TipOption[] = [
  { id: 201, amount: 25.0, label: '#TIP-201 ($25.00) - CARD', method: 'CARD' },
  { id: 202, amount: 18.75, label: '#TIP-202 ($18.75) - CASH', method: 'CASH' },
  { id: 203, amount: 25.0, label: '#TIP-203 ($25.00) - CARD', method: 'CARD' },
  { id: 204, amount: 5.5, label: '#TIP-204 ($5.50) - QR PAYMENT', method: 'QR_PAYMENT' },
  { id: 205, amount: 35.0, label: '#TIP-205 ($35.00) - CARD', method: 'CARD' },
  { id: 206, amount: 48.0, label: '#TIP-206 ($48.00) - ONLINE', method: 'ONLINE' },
];

export const MOCK_SHIFT_OPTIONS: ShiftOption[] = [
  { id: 801, label: 'Shift #SFT-801 (Lunch FOH)' },
  { id: 802, label: 'Shift #SFT-802 (Bar Evening)' },
  { id: 803, label: 'Shift #SFT-803 (Dinner FOH)' },
  { id: 804, label: 'Shift #SFT-804 (Late Night)' },
];

export const MOCK_TIP_ALLOCATIONS: TipAllocation[] = [
  {
    id: 701,
    tip_id: 201,
    collaborator_id: 101,
    shift_id: 801,
    role: 'WAITER',
    percentage: 50.0,
    amount: 12.5,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 1).toISOString(),
    collaborator: {
      id: 101,
      first_name: 'Mateo',
      last_name: 'Silva',
      role: 'WAITER',
    },
    tip: {
      id: 201,
      amount: 25.0,
      method: 'CARD',
      order_id: 501,
      status: 'ALLOCATED',
    },
  },
  {
    id: 702,
    tip_id: 201,
    collaborator_id: 103,
    shift_id: 801,
    role: 'RUNNER',
    percentage: 25.0,
    amount: 6.25,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    collaborator: {
      id: 103,
      first_name: 'Carlos',
      last_name: 'Mendoza',
      role: 'RUNNER',
    },
    tip: {
      id: 201,
      amount: 25.0,
      method: 'CARD',
      order_id: 501,
      status: 'ALLOCATED',
    },
  },
  {
    id: 703,
    tip_id: 202,
    collaborator_id: 102,
    shift_id: 802,
    role: 'BARTENDER',
    percentage: 100.0,
    amount: 18.75,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    collaborator: {
      id: 102,
      first_name: 'Sofia',
      last_name: 'Rodríguez',
      role: 'BARTENDER',
    },
    tip: {
      id: 202,
      amount: 18.75,
      method: 'CASH',
      order_id: 502,
      status: 'ALLOCATED',
    },
  },
  {
    id: 704,
    tip_id: 203,
    collaborator_id: 105,
    shift_id: 801,
    role: 'SERVER',
    percentage: 60.0,
    amount: 15.0,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    collaborator: {
      id: 105,
      first_name: 'Elena',
      last_name: 'Vargas',
      role: 'SERVER',
    },
    tip: {
      id: 203,
      amount: 25.0,
      method: 'CARD',
      order_id: 503,
      status: 'ALLOCATED',
    },
  },
  {
    id: 705,
    tip_id: 203,
    collaborator_id: 103,
    shift_id: 801,
    role: 'BUSSER',
    percentage: 20.0,
    amount: 5.0,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    collaborator: {
      id: 103,
      first_name: 'Carlos',
      last_name: 'Mendoza',
      role: 'BUSSER',
    },
    tip: {
      id: 203,
      amount: 25.0,
      method: 'CARD',
      order_id: 503,
      status: 'ALLOCATED',
    },
  },
  {
    id: 706,
    tip_id: 204,
    collaborator_id: 107,
    shift_id: 803,
    role: 'BARTENDER',
    percentage: 50.0,
    amount: 2.75,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    collaborator: {
      id: 107,
      first_name: 'Valeria',
      last_name: 'Castro',
      role: 'BARTENDER',
    },
    tip: {
      id: 204,
      amount: 5.5,
      method: 'QR_PAYMENT',
      order_id: 504,
      status: 'ALLOCATED',
    },
  },
  {
    id: 707,
    tip_id: 205,
    collaborator_id: 106,
    shift_id: 802,
    role: 'HOST',
    percentage: 10.0,
    amount: 3.5,
    record_status: 'DELETED',
    created_at: new Date(Date.now() - 3600000 * 36).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    collaborator: {
      id: 106,
      first_name: 'Gabriel',
      last_name: 'Fernández',
      role: 'HOST',
    },
    tip: {
      id: 205,
      amount: 35.0,
      method: 'CARD',
      order_id: 505,
      status: 'PENDING',
    },
  },
  {
    id: 708,
    tip_id: 206,
    collaborator_id: 108,
    shift_id: 804,
    role: 'KITCHEN',
    percentage: 15.0,
    amount: 7.2,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    collaborator: {
      id: 108,
      first_name: 'Diego',
      last_name: 'Morales',
      role: 'KITCHEN',
    },
    tip: {
      id: 206,
      amount: 48.0,
      method: 'ONLINE',
      order_id: 506,
      status: 'ALLOCATED',
    },
  },
];

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface FetchTipAllocationsResponse {
  data: TipAllocation[];
  meta?: {
    total: number;
    indexes_used?: string[];
  };
}

/**
 * Fetches tip allocations with parameters targeting composite indexes:
 * - Primary composite index: @Index(['tip_id', 'collaborator_id', 'shift_id'])
 * - Secondary composite index: @Index(['role', 'record_status', 'created_at'])
 */
export async function fetchTipAllocations(
  params: FetchTipAllocationsParams = {}
): Promise<TipAllocation[]> {
  const query = new URLSearchParams();

  if (params.tip_id !== undefined && params.tip_id !== '') {
    query.append('tip_id', String(params.tip_id));
  }

  if (params.collaborator_id !== undefined && params.collaborator_id !== '') {
    query.append('collaborator_id', String(params.collaborator_id));
  }

  if (params.shift_id !== undefined && params.shift_id !== '') {
    query.append('shift_id', String(params.shift_id));
  }

  if (params.role && params.role !== 'ALL') {
    query.append('role', params.role);
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

  const path = `/v1/tip-allocations?${query.toString()}`;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const json = (await response.json()) as FetchTipAllocationsResponse | TipAllocation[];
    let allocations: TipAllocation[] = [];

    if (Array.isArray(json)) {
      allocations = json;
    } else if (json && Array.isArray(json.data)) {
      allocations = json.data;
    }

    return allocations.map(normalizeTipAllocation);
  } catch {
    return filterMockTipAllocations(params);
  }
}

export function filterMockTipAllocations(
  params: FetchTipAllocationsParams = {}
): TipAllocation[] {
  let list = [...MOCK_TIP_ALLOCATIONS];

  if (params.tip_id !== undefined && params.tip_id !== '') {
    const targetTipId = String(params.tip_id).toLowerCase().replace('#tip-', '');
    list = list.filter((a) => String(a.tip_id).toLowerCase() === targetTipId);
  }

  if (params.collaborator_id !== undefined && params.collaborator_id !== '') {
    const targetCollabId = String(params.collaborator_id).toLowerCase().replace('#clb-', '');
    list = list.filter((a) =>
      String(a.collaborator_id).toLowerCase().includes(targetCollabId)
    );
  }

  if (params.shift_id !== undefined && params.shift_id !== '') {
    const targetShiftId = String(params.shift_id).toLowerCase().replace('#sft-', '');
    list = list.filter((a) => String(a.shift_id).toLowerCase() === targetShiftId);
  }

  if (params.role && params.role !== 'ALL') {
    list = list.filter((a) => a.role.toUpperCase() === params.role!.toUpperCase());
  }

  if (params.record_status && params.record_status !== 'ALL') {
    list = list.filter((a) => a.record_status === params.record_status);
  }

  if (params.date_from) {
    const fromTime = new Date(params.date_from).getTime();
    list = list.filter((a) => new Date(a.created_at).getTime() >= fromTime);
  }

  if (params.date_to) {
    const toTime = new Date(params.date_to).getTime() + 86400000;
    list = list.filter((a) => new Date(a.created_at).getTime() <= toTime);
  }

  if (params.search && params.search.trim() !== '') {
    const term = params.search.trim().toLowerCase();
    list = list.filter((a) => {
      const alcRef = `#alc-${a.id}`.toLowerCase();
      const tipRef = `#tip-${a.tip_id}`.toLowerCase();
      const sftRef = `#sft-${a.shift_id}`.toLowerCase();
      const clbRef = `#clb-${a.collaborator_id}`.toLowerCase();
      const collabName = `${a.collaborator?.first_name || ''} ${a.collaborator?.last_name || ''}`.toLowerCase();
      const roleStr = a.role.toLowerCase();

      return (
        alcRef.includes(term) ||
        tipRef.includes(term) ||
        sftRef.includes(term) ||
        clbRef.includes(term) ||
        collabName.includes(term) ||
        roleStr.includes(term) ||
        String(a.id).includes(term) ||
        String(a.tip_id).includes(term) ||
        String(a.shift_id).includes(term) ||
        String(a.collaborator_id).includes(term)
      );
    });
  }

  return list.map(normalizeTipAllocation);
}

export function normalizeTipAllocation(raw: TipAllocation): TipAllocation {
  return {
    ...raw,
    percentage: Number(raw.percentage) || 0,
    amount: Number(raw.amount) || 0,
  };
}

/**
 * Formats allocation percentage up to 2 decimal places (e.g. 50.00%)
 */
export function formatAllocationPercentage(percentage: number): string {
  const formatted = percentage.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}%`;
}

/**
 * Formats currency amount ($#,##0.00)
 */
export function formatAllocationCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calculateTipAllocationsSummaryMetrics(
  allocations: TipAllocation[]
): TipAllocationsSummaryMetrics {
  const activeAllocations = allocations.filter((a) => a.record_status === 'ACTIVE');
  const deletedAllocations = allocations.filter((a) => a.record_status === 'DELETED');

  const totalAllocatedAmount = activeAllocations.reduce((acc, a) => acc + a.amount, 0);
  const totalPercentage = activeAllocations.reduce((acc, a) => acc + a.percentage, 0);
  const avgPercentage =
    activeAllocations.length > 0 ? totalPercentage / activeAllocations.length : 0;

  const uniqueCollaborators = new Set(activeAllocations.map((a) => a.collaborator_id));
  const uniqueShifts = new Set(activeAllocations.map((a) => a.shift_id));

  return {
    totalCount: activeAllocations.length,
    activeCount: activeAllocations.length,
    deletedCount: deletedAllocations.length,
    totalAllocatedAmount,
    avgPercentage,
    uniqueCollaboratorsCount: uniqueCollaborators.size,
    uniqueShiftsCount: uniqueShifts.size,
  };
}

/**
 * Validates the 100% allocation ceiling guard for a specific tip_id
 */
export function checkAllocationCeilingGuard(
  tipId: number | string,
  percentage: number,
  recordStatus: string,
  currentAllocationId?: number,
  existingAllocations: TipAllocation[] = MOCK_TIP_ALLOCATIONS
): void {
  if (recordStatus !== 'ACTIVE') return;

  const cleanTipId = Number(String(tipId).replace('#TIP-', '').replace('#tip-', ''));
  const otherActiveAllocations = existingAllocations.filter(
    (a) =>
      Number(a.tip_id) === cleanTipId &&
      a.record_status === 'ACTIVE' &&
      (!currentAllocationId || a.id !== currentAllocationId)
  );

  const existingSum = otherActiveAllocations.reduce((acc, a) => acc + Number(a.percentage), 0);
  const totalPercentage = existingSum + Number(percentage);

  if (totalPercentage > 100.0001) {
    throw new Error(`Total allocations for Tip #TIP-${cleanTipId} cannot exceed 100%.`);
  }
}

export async function createTipAllocation(
  dto: CreateTipAllocationDto
): Promise<TipAllocation> {
  const cleanTipId = Number(String(dto.tip_id).replace('#TIP-', '').replace('#tip-', ''));
  const cleanCollabId = String(dto.collaborator_id).replace('#CLB-', '').replace('#clb-', '');
  const cleanShiftId = Number(String(dto.shift_id).replace('#SFT-', '').replace('#sft-', ''));

  if (!cleanTipId || isNaN(cleanTipId)) {
    throw new Error('Selection of a valid parent tip_id is required.');
  }

  if (!cleanCollabId) {
    throw new Error('Selection of a valid collaborator_id is required.');
  }

  if (!cleanShiftId || isNaN(cleanShiftId)) {
    throw new Error('Selection of a valid shift_id is required.');
  }

  if (!dto.role || dto.role.trim() === '') {
    throw new Error('Role specification is required.');
  }

  const parsedPercentage = parseFloat(String(dto.percentage));
  if (isNaN(parsedPercentage) || parsedPercentage < 0 || parsedPercentage > 100.0) {
    throw new Error('Allocation percentage must be between 0.00 and 100.00.');
  }

  const parsedAmount = parseFloat(String(dto.amount));
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    throw new Error('Allocated amount must be a valid non-negative number.');
  }

  // 100% Allocation Ceiling Guard Validation
  checkAllocationCeilingGuard(
    cleanTipId,
    parsedPercentage,
    dto.record_status || 'ACTIVE'
  );

  try {
    const response = await fetch(`${API_BASE}/v1/tip-allocations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const json = await response.json();
    const created = normalizeTipAllocation(json.data || json);
    MOCK_TIP_ALLOCATIONS.unshift(created);
    return created;
  } catch {
    const newId = Math.floor(700 + Math.random() * 500);
    const tipMatch = MOCK_TIP_OPTIONS.find((t) => t.id === cleanTipId);

    const created: TipAllocation = {
      id: newId,
      tip_id: cleanTipId,
      collaborator_id: cleanCollabId,
      shift_id: cleanShiftId,
      role: dto.role.trim().toUpperCase(),
      percentage: parsedPercentage,
      amount: parsedAmount,
      record_status: dto.record_status || 'ACTIVE',
      created_at: new Date().toISOString(),
      collaborator: {
        id: cleanCollabId,
        first_name: `Collaborator`,
        last_name: `#${cleanCollabId}`,
        role: dto.role.toUpperCase(),
      },
      tip: {
        id: cleanTipId,
        amount: tipMatch ? tipMatch.amount : 25.0,
        status: 'ALLOCATED',
      },
    };

    MOCK_TIP_ALLOCATIONS.unshift(created);
    return created;
  }
}

export async function updateTipAllocation(
  id: number,
  dto: UpdateTipAllocationDto
): Promise<TipAllocation> {
  const existingIndex = MOCK_TIP_ALLOCATIONS.findIndex((a) => a.id === id);
  const existingAllocation = existingIndex !== -1 ? MOCK_TIP_ALLOCATIONS[existingIndex] : null;

  if (!existingAllocation) {
    throw new Error(`Tip allocation #${id} not found.`);
  }

  const targetTipId = dto.tip_id !== undefined ? Number(String(dto.tip_id).replace('#TIP-', '')) : existingAllocation.tip_id;
  const targetPercentage = dto.percentage !== undefined ? parseFloat(String(dto.percentage)) : existingAllocation.percentage;
  const targetStatus = dto.record_status || existingAllocation.record_status;

  if (targetPercentage < 0 || targetPercentage > 100.0) {
    throw new Error('Allocation percentage must be between 0.00 and 100.00.');
  }

  // 100% Allocation Ceiling Guard Validation
  checkAllocationCeilingGuard(
    targetTipId,
    targetPercentage,
    targetStatus,
    id
  );

  try {
    const response = await fetch(`${API_BASE}/v1/tip-allocations/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const json = await response.json();
    const updated = normalizeTipAllocation(json.data || json);
    if (existingIndex !== -1) {
      MOCK_TIP_ALLOCATIONS[existingIndex] = updated;
    }
    return updated;
  } catch {
    const updated: TipAllocation = {
      ...existingAllocation,
      ...(dto.tip_id ? { tip_id: Number(String(dto.tip_id).replace('#TIP-', '')) } : {}),
      ...(dto.collaborator_id ? { collaborator_id: dto.collaborator_id } : {}),
      ...(dto.shift_id ? { shift_id: Number(String(dto.shift_id).replace('#SFT-', '')) } : {}),
      ...(dto.role ? { role: dto.role.toUpperCase() } : {}),
      ...(dto.percentage !== undefined ? { percentage: Number(dto.percentage) } : {}),
      ...(dto.amount !== undefined ? { amount: Number(dto.amount) } : {}),
      ...(dto.record_status ? { record_status: dto.record_status } : {}),
      updated_at: new Date().toISOString(),
    };

    MOCK_TIP_ALLOCATIONS[existingIndex] = updated;
    return updated;
  }
}

export async function updateTipAllocationStatus(
  id: number,
  dto: UpdateTipAllocationDto
): Promise<TipAllocation> {
  return updateTipAllocation(id, dto);
}
