export type TipAllocationRecordStatus = 'ACTIVE' | 'DELETED';

export type TipAllocationRole =
  | 'WAITER'
  | 'BARTENDER'
  | 'BUSSER'
  | 'RUNNER'
  | 'SERVER'
  | 'HOST'
  | 'KITCHEN'
  | string;

export interface TipAllocationCollaboratorProfile {
  id: number | string;
  first_name: string;
  last_name: string;
  email?: string;
  role?: string;
}

export interface TipAllocationSourceTip {
  id: number;
  amount: number;
  method?: string;
  order_id?: number;
  status?: string;
  created_at?: string;
}

export interface TipAllocation {
  id: number;
  tip_id: number;
  collaborator_id: number | string;
  shift_id: number;
  role: TipAllocationRole;
  percentage: number;
  amount: number;
  record_status: TipAllocationRecordStatus;
  created_at: string;
  updated_at?: string;

  // Relational Eager-Hydrated Fields
  collaborator?: TipAllocationCollaboratorProfile;
  tip?: TipAllocationSourceTip;
}

export interface FetchTipAllocationsParams {
  tip_id?: number | string;
  collaborator_id?: number | string;
  shift_id?: number | string;
  role?: string;
  record_status?: TipAllocationRecordStatus | 'ALL';
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface TipAllocationsSummaryMetrics {
  totalCount: number;
  activeCount: number;
  deletedCount: number;
  totalAllocatedAmount: number;
  avgPercentage: number;
  uniqueCollaboratorsCount: number;
  uniqueShiftsCount: number;
}

export interface CreateTipAllocationDto {
  tip_id: number | string;
  collaborator_id: number | string;
  shift_id: number | string;
  role: TipAllocationRole;
  percentage: number;
  amount: number;
  record_status?: TipAllocationRecordStatus;
}

export interface UpdateTipAllocationDto {
  tip_id?: number | string;
  collaborator_id?: number | string;
  shift_id?: number | string;
  role?: TipAllocationRole;
  percentage?: number;
  amount?: number;
  record_status?: TipAllocationRecordStatus;
}

export interface TipOption {
  id: number;
  amount: number;
  label: string;
  method?: string;
}

export interface ShiftOption {
  id: number;
  label: string;
}
