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

export const MOCK_COLLABORATOR_OPTIONS: CollaboratorOption[] = [
  { id: 101, first_name: 'Mateo', last_name: 'Silva', role: 'WAITER' },
  { id: 102, first_name: 'Sofia', last_name: 'Rodríguez', role: 'BARTENDER' },
  { id: 103, first_name: 'Carlos', last_name: 'Mendoza', role: 'BUSSER' },
  { id: 104, first_name: 'Lucia', last_name: 'Gómez', role: 'RUNNER' },
  { id: 105, first_name: 'Elena', last_name: 'Vargas', role: 'SERVER' },
  { id: 106, first_name: 'Gabriel', last_name: 'Fernández', role: 'HOST' },
  { id: 107, first_name: 'Valeria', last_name: 'Castro', role: 'BARTENDER' },
  { id: 108, first_name: 'Diego', last_name: 'Morales', role: 'KITCHEN' },
];

export const MOCK_TIP_POOL_MEMBERS: TipPoolMember[] = [
  {
    id: 501,
    tip_pool_id: 301,
    collaborator_id: 101,
    role: 'WAITER',
    weight: 10.5,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    collaborator: {
      id: 101,
      first_name: 'Mateo',
      last_name: 'Silva',
      role: 'WAITER',
    },
    tip_pool: {
      id: 301,
      name: 'Dinner Front of House Equal Pool',
      distribution_type: 'EQUAL',
    },
  },
  {
    id: 502,
    tip_pool_id: 301,
    collaborator_id: 103,
    role: 'BUSSER',
    weight: 1.0,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 10).toISOString(),
    collaborator: {
      id: 103,
      first_name: 'Carlos',
      last_name: 'Mendoza',
      role: 'BUSSER',
    },
    tip_pool: {
      id: 301,
      name: 'Dinner Front of House Equal Pool',
      distribution_type: 'EQUAL',
    },
  },
  {
    id: 503,
    tip_pool_id: 302,
    collaborator_id: 102,
    role: 'BARTENDER',
    weight: 3.0,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    collaborator: {
      id: 102,
      first_name: 'Sofia',
      last_name: 'Rodríguez',
      role: 'BARTENDER',
    },
    tip_pool: {
      id: 302,
      name: 'Bar & Lounge Points Distribution',
      distribution_type: 'POINTS',
    },
  },
  {
    id: 504,
    tip_pool_id: 302,
    collaborator_id: 107,
    role: 'BARTENDER',
    weight: 2.5,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    collaborator: {
      id: 107,
      first_name: 'Valeria',
      last_name: 'Castro',
      role: 'BARTENDER',
    },
    tip_pool: {
      id: 302,
      name: 'Bar & Lounge Points Distribution',
      distribution_type: 'POINTS',
    },
  },
  {
    id: 505,
    tip_pool_id: 303,
    collaborator_id: 104,
    role: 'RUNNER',
    weight: 1.5,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 16).toISOString(),
    collaborator: {
      id: 104,
      first_name: 'Lucia',
      last_name: 'Gómez',
      role: 'RUNNER',
    },
    tip_pool: {
      id: 303,
      name: 'Lunch Shift Role-Based Pool',
      distribution_type: 'ROLE_BASED',
    },
  },
  {
    id: 506,
    tip_pool_id: 304,
    collaborator_id: 105,
    role: 'SERVER',
    weight: 5.0,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 30).toISOString(),
    collaborator: {
      id: 105,
      first_name: 'Elena',
      last_name: 'Vargas',
      role: 'SERVER',
    },
    tip_pool: {
      id: 304,
      name: 'Weekend Brunch Percentage Split',
      distribution_type: 'PERCENTAGE',
    },
  },
  {
    id: 507,
    tip_pool_id: 301,
    collaborator_id: 106,
    role: 'HOST',
    weight: 0.75,
    record_status: 'DELETED',
    created_at: new Date(Date.now() - 3600000 * 40).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    collaborator: {
      id: 106,
      first_name: 'Gabriel',
      last_name: 'Fernández',
      role: 'HOST',
    },
    tip_pool: {
      id: 301,
      name: 'Dinner Front of House Equal Pool',
      distribution_type: 'EQUAL',
    },
  },
  {
    id: 508,
    tip_pool_id: 305,
    collaborator_id: 108,
    role: 'KITCHEN',
    weight: 2.0,
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    collaborator: {
      id: 108,
      first_name: 'Diego',
      last_name: 'Morales',
      role: 'KITCHEN',
    },
    tip_pool: {
      id: 305,
      name: 'Late Night Patio Equal Pool',
      distribution_type: 'EQUAL',
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

export interface FetchTipPoolMembersResponse {
  data: TipPoolMember[];
  meta?: {
    total: number;
    indexes_used?: string[];
  };
}

/**
 * Fetches tip pool members with parameters targeting composite index @Index(['tip_pool_id', 'collaborator_id'])
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

  try {
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
  } catch {
    return filterMockTipPoolMembers(params);
  }
}

export function filterMockTipPoolMembers(
  params: FetchTipPoolMembersParams = {}
): TipPoolMember[] {
  let list = [...MOCK_TIP_POOL_MEMBERS];

  if (params.tip_pool_id !== undefined && params.tip_pool_id !== '') {
    const targetPoolId = Number(params.tip_pool_id);
    list = list.filter((m) => m.tip_pool_id === targetPoolId);
  }

  if (params.collaborator_id !== undefined && params.collaborator_id !== '') {
    const targetCollabId = String(params.collaborator_id).toLowerCase().replace('#clb-', '');
    list = list.filter((m) =>
      String(m.collaborator_id).toLowerCase().includes(targetCollabId)
    );
  }

  if (params.role && params.role !== 'ALL') {
    list = list.filter((m) => m.role.toUpperCase() === params.role!.toUpperCase());
  }

  if (params.record_status && params.record_status !== 'ALL') {
    list = list.filter((m) => m.record_status === params.record_status);
  }

  if (params.search && params.search.trim() !== '') {
    const term = params.search.trim().toLowerCase();
    list = list.filter((m) => {
      const mbrRef = `#mbr-${m.id}`.toLowerCase();
      const clbRef = `#clb-${m.collaborator_id}`.toLowerCase();
      const polRef = `#pol-${m.tip_pool_id}`.toLowerCase();
      const collabName = `${m.collaborator?.first_name || ''} ${m.collaborator?.last_name || ''}`.toLowerCase();
      const poolName = (m.tip_pool?.name || '').toLowerCase();
      const roleStr = m.role.toLowerCase();

      return (
        mbrRef.includes(term) ||
        clbRef.includes(term) ||
        polRef.includes(term) ||
        collabName.includes(term) ||
        poolName.includes(term) ||
        roleStr.includes(term) ||
        String(m.id).includes(term) ||
        String(m.collaborator_id).includes(term) ||
        String(m.tip_pool_id).includes(term)
      );
    });
  }

  return list.map(normalizeTipPoolMember);
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

  const cleanCollabId = String(dto.collaborator_id).replace('#CLB-', '');
  const cleanPoolId = String(dto.tip_pool_id).replace('#POL-', '');

  const duplicateMember = MOCK_TIP_POOL_MEMBERS.find(
    (m) =>
      Number(m.tip_pool_id) === Number(cleanPoolId) &&
      String(m.collaborator_id).replace('#CLB-', '') === cleanCollabId &&
      m.record_status === 'ACTIVE'
  );

  if (duplicateMember && (dto.record_status || 'ACTIVE') === 'ACTIVE') {
    throw new Error(
      `Collaborator #CLB-${cleanCollabId} is already assigned to Tip Pool #POL-${cleanPoolId}.`
    );
  }

  try {
    const response = await fetch(`${API_BASE}/v1/tip-pool-members`, {
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
    const created = normalizeTipPoolMember(json.data || json);
    MOCK_TIP_POOL_MEMBERS.unshift(created);
    return created;
  } catch {
    // Offline Mock creation
    const newId = Math.floor(500 + Math.random() * 500);
    const collabMatch = MOCK_COLLABORATOR_OPTIONS.find(
      (c) => String(c.id) === String(dto.collaborator_id)
    );

    const created: TipPoolMember = {
      id: newId,
      tip_pool_id: Number(dto.tip_pool_id),
      collaborator_id: dto.collaborator_id,
      role: dto.role.trim().toUpperCase(),
      weight: Number(dto.weight),
      record_status: dto.record_status || 'ACTIVE',
      created_at: new Date().toISOString(),
      collaborator: {
        id: dto.collaborator_id,
        first_name: collabMatch?.first_name || `Collaborator`,
        last_name: collabMatch?.last_name || `#${dto.collaborator_id}`,
        role: dto.role.toUpperCase(),
      },
      tip_pool: {
        id: Number(dto.tip_pool_id),
        name: `Tip Pool #${dto.tip_pool_id}`,
      },
    };

    MOCK_TIP_POOL_MEMBERS.unshift(created);
    return created;
  }
}

export async function updateTipPoolMember(
  id: number,
  dto: UpdateTipPoolMemberDto
): Promise<TipPoolMember> {
  const existingIndex = MOCK_TIP_POOL_MEMBERS.findIndex((m) => m.id === id);
  const existingMember = existingIndex !== -1 ? MOCK_TIP_POOL_MEMBERS[existingIndex] : null;

  if (dto.weight !== undefined && (isNaN(Number(dto.weight)) || Number(dto.weight) < 0)) {
    throw new Error('Distribution weight must be a non-negative number.');
  }

  try {
    const response = await fetch(`${API_BASE}/v1/tip-pool-members/${id}`, {
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
    const updated = normalizeTipPoolMember(json.data || json);
    if (existingIndex !== -1) {
      MOCK_TIP_POOL_MEMBERS[existingIndex] = updated;
    }
    return updated;
  } catch {
    if (!existingMember) {
      throw new Error(`Tip pool member #${id} not found.`);
    }

    const updated: TipPoolMember = {
      ...existingMember,
      ...(dto.tip_pool_id ? { tip_pool_id: Number(dto.tip_pool_id) } : {}),
      ...(dto.collaborator_id ? { collaborator_id: dto.collaborator_id } : {}),
      ...(dto.role ? { role: dto.role.toUpperCase() } : {}),
      ...(dto.weight !== undefined ? { weight: Number(dto.weight) } : {}),
      ...(dto.record_status ? { record_status: dto.record_status } : {}),
      updated_at: new Date().toISOString(),
    };

    if (dto.collaborator_id) {
      const collabMatch = MOCK_COLLABORATOR_OPTIONS.find(
        (c) => String(c.id) === String(dto.collaborator_id)
      );
      if (collabMatch) {
        updated.collaborator = {
          id: dto.collaborator_id,
          first_name: collabMatch.first_name,
          last_name: collabMatch.last_name,
          role: collabMatch.role,
        };
      }
    }

    MOCK_TIP_POOL_MEMBERS[existingIndex] = updated;
    return updated;
  }
}
