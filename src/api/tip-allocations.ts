import {
  apiRequest,
  unwrapItem,
  unwrapList,
  type MaybeEnvelopedItem,
  type MaybeEnvelopedList,
} from './http';
import type {
  TipAllocation,
  FetchTipAllocationsParams,
  TipAllocationsSummaryMetrics,
  CreateTipAllocationDto,
  UpdateTipAllocationDto,
  TipOption,
  ShiftOption,
} from '../types/tip-allocations';

export interface FetchTipAllocationsResponse {
  data: TipAllocation[];
  meta?: {
    total: number;
    indexes_used?: string[];
  };
}

export async function fetchTipOptions(): Promise<TipOption[]> {
  const json = await apiRequest<MaybeEnvelopedList<TipOption>>(
    '/v1/tips/options',
    { method: 'GET' },
    'Failed to fetch tip options.',
  );
  return unwrapList(json);
}

export async function fetchShiftOptions(): Promise<ShiftOption[]> {
  const json = await apiRequest<MaybeEnvelopedList<ShiftOption>>(
    '/v1/shifts/options',
    { method: 'GET' },
    'Failed to fetch shift options.',
  );
  return unwrapList(json);
}

/**
 * Fetches tip allocations
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

  const json = await apiRequest<FetchTipAllocationsResponse | TipAllocation[]>(
    path,
    { method: 'GET' },
    'Failed to load tip allocations. Please try again.',
  );
  let allocations: TipAllocation[] = [];

  if (Array.isArray(json)) {
    allocations = json;
  } else if (json && Array.isArray(json.data)) {
    allocations = json.data;
  }

  return allocations.map(normalizeTipAllocation);
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
  existingAllocations: TipAllocation[] = []
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

  const json = await apiRequest<MaybeEnvelopedItem<TipAllocation>>(
    '/v1/tip-allocations',
    { method: 'POST', body: JSON.stringify(dto) },
    'Failed to create tip allocation.',
  );
  return normalizeTipAllocation(unwrapItem(json));
}

export async function updateTipAllocation(
  id: number,
  dto: UpdateTipAllocationDto
): Promise<TipAllocation> {
  if (dto.percentage !== undefined) {
    const parsedPercentage = parseFloat(String(dto.percentage));
    if (parsedPercentage < 0 || parsedPercentage > 100.0) {
      throw new Error('Allocation percentage must be between 0.00 and 100.00.');
    }
  }

  const json = await apiRequest<MaybeEnvelopedItem<TipAllocation>>(
    `/v1/tip-allocations/${id}`,
    { method: 'PATCH', body: JSON.stringify(dto) },
    'Failed to update tip allocation.',
  );
  return normalizeTipAllocation(unwrapItem(json));
}

export async function updateTipAllocationStatus(
  id: number,
  dto: UpdateTipAllocationDto
): Promise<TipAllocation> {
  return updateTipAllocation(id, dto);
}
