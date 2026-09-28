import { getAccessToken } from '../lib/auth-storage';
import type {
  TipPoolMember,
  FetchTipPoolMembersParams,
  TipPoolMembersSummaryMetrics,
  CreateTipPoolMemberDto,
  UpdateTipPoolMemberDto,
  CollaboratorOption,
} from '../types/tip-pool-members';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface FetchTipPoolMembersResponse {
  data: TipPoolMember[];
  meta?: {
    total: number;
    indexes_used?: string[];
  };
}

export async function fetchCollaboratorOptions(): Promise<CollaboratorOption[]> {
  const response = await fetch(`${API_BASE}/v1/collaborators`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch collaborator options (${response.status})`);
  }
  const json = await response.json();
  return Array.isArray(json) ? json : json.data || [];
}

/**
 * Fetches tip pool members
 */
export async function fetchTipPoolMembers(
  params: FetchTipPoolMembersParams = {}
): Promise<TipPoolMember[]> {
  const query = new URLSearchParams();

  if (params.tip_pool_id !== undefined && params.tip_pool_id !== '') {
    query.append('tip_pool_id', String(params.tip_pool_id));
  }

  if (params.collaborator_id !== undefined && params.collaborator_id !== '') {
    query.append('collaborator_id', String(params.collaborator_id));
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

  const path = `/v1/tip-pool-members?${query.toString()}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  const json = (await response.json()) as FetchTipPoolMembersResponse | TipPoolMember[];
  let members: TipPoolMember[] = [];

  if (Array.isArray(json)) {
    members = json;
  } else if (json && Array.isArray(json.data)) {
    members = json.data;
  }

  return members.map(normalizeTipPoolMember);
}

export function normalizeTipPoolMember(raw: TipPoolMember): TipPoolMember {
  return {
    ...raw,
    weight: Number(raw.weight) || 0,
  };
}

/**
 * Formats weight value formatted up to 2 decimal places (e.g. 10.50 pts, 1.00 x)
 */
export function formatMemberWeight(weight: number, suffix: string = 'pts'): string {
  const formatted = weight.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export function calculateTipPoolMembersSummaryMetrics(
  members: TipPoolMember[]
): TipPoolMembersSummaryMetrics {
  const activeMembers = members.filter((m) => m.record_status === 'ACTIVE');
  const deletedMembers = members.filter((m) => m.record_status === 'DELETED');

  const totalWeight = activeMembers.reduce((acc, m) => acc + m.weight, 0);

  const uniquePools = new Set(activeMembers.map((m) => m.tip_pool_id));
  const uniqueCollaborators = new Set(activeMembers.map((m) => m.collaborator_id));

  return {
    totalCount: activeMembers.length,
    activeCount: activeMembers.length,
    deletedCount: deletedMembers.length,
    totalWeight,
    uniquePoolsCount: uniquePools.size,
    uniqueCollaboratorsCount: uniqueCollaborators.size,
  };
}

export async function createTipPoolMember(
  dto: CreateTipPoolMemberDto
): Promise<TipPoolMember> {
  if (!dto.tip_pool_id || isNaN(Number(dto.tip_pool_id))) {
    throw new Error('Selection of a valid parent tip_pool_id is required.');
  }

  if (!dto.collaborator_id) {
    throw new Error('Selection of a valid collaborator_id is required.');
  }

  if (!dto.role || dto.role.trim() === '') {
    throw new Error('Role specification is required.');
  }

  if (dto.weight === undefined || isNaN(Number(dto.weight)) || Number(dto.weight) < 0) {
    throw new Error('Distribution weight must be a non-negative number.');
  }

  if (Number(dto.weight) > 999.99) {
    throw new Error('Distribution weight exceeds maximum precision 5, scale 2 (max 999.99).');
  }

  const response = await fetch(`${API_BASE}/v1/tip-pool-members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(dto),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.message || `Failed to create tip pool member (${response.status})`);
  }

  const json = await response.json();
  return normalizeTipPoolMember(json.data || json);
}

export async function updateTipPoolMember(
  id: number,
  dto: UpdateTipPoolMemberDto
): Promise<TipPoolMember> {
  if (dto.weight !== undefined && (isNaN(Number(dto.weight)) || Number(dto.weight) < 0)) {
    throw new Error('Distribution weight must be a non-negative number.');
  }

  const response = await fetch(`${API_BASE}/v1/tip-pool-members/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(dto),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.message || `Failed to update tip pool member (${response.status})`);
  }

  const json = await response.json();
  return normalizeTipPoolMember(json.data || json);
}
