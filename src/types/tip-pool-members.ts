export type TipPoolMemberRecordStatus = 'ACTIVE' | 'DELETED';

export type TipPoolMemberRole =
  | 'WAITER'
  | 'BARTENDER'
  | 'BUSSER'
  | 'RUNNER'
  | 'SERVER'
  | 'HOST'
  | 'KITCHEN'
  | string;

export interface TipPoolMemberCollaboratorProfile {
  id: number | string;
  first_name: string;
  last_name: string;
  email?: string;
  role?: string;
}

export interface TipPoolMemberParentPool {
  id: number;
  name: string;
  distribution_type?: string;
}

export interface TipPoolMember {
  id: number;
  tip_pool_id: number;
  collaborator_id: number | string;
  role: string;
  weight: number;
  record_status: TipPoolMemberRecordStatus;
  created_at: string;
  updated_at?: string;

  // Relational Eager-Hydrated Fields
  collaborator?: TipPoolMemberCollaboratorProfile;
  tip_pool?: TipPoolMemberParentPool;
}

export interface FetchTipPoolMembersParams {
  tip_pool_id?: number | string;
  collaborator_id?: number | string;
  role?: string;
  record_status?: TipPoolMemberRecordStatus | 'ALL';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TipPoolMembersSummaryMetrics {
  totalCount: number;
  activeCount: number;
  deletedCount: number;
  totalWeight: number;
  uniquePoolsCount: number;
  uniqueCollaboratorsCount: number;
}

export interface CreateTipPoolMemberDto {
  tip_pool_id: number;
  collaborator_id: number | string;
  role: string;
  weight: number;
  record_status?: TipPoolMemberRecordStatus;
}

export interface UpdateTipPoolMemberDto {
  tip_pool_id?: number;
  collaborator_id?: number | string;
  role?: string;
  weight?: number;
  record_status?: TipPoolMemberRecordStatus;
}

export interface CollaboratorOption {
  id: number | string;
  first_name: string;
  last_name: string;
  role: string;
}
