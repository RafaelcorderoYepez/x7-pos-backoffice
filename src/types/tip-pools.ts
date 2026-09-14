export type TipPoolDistributionType = 'EQUAL' | 'PERCENTAGE' | 'POINTS' | 'ROLE_BASED';

export type TipPoolStatus = 'OPEN' | 'CLOSED' | 'SETTLED';

export type TipPoolRecordStatus = 'ACTIVE' | 'DELETED';

export interface TipPool {
  id: number;
  company_id: string;
  merchant_id: string;
  shift_id: number;
  name: string;
  distribution_type: TipPoolDistributionType;
  total_amount: number;
  status: TipPoolStatus;
  record_status: TipPoolRecordStatus;
  created_at: string;
  updated_at?: string;
  closed_at?: string | null;
  shift_time_window?: string;
  notes?: string | null;
}

export interface FetchTipPoolsParams {
  company_id: string;
  merchant_id: string;
  shift_id?: number | string;
  status?: TipPoolStatus | 'ALL';
  distribution_type?: TipPoolDistributionType | 'ALL';
  record_status?: TipPoolRecordStatus | 'ALL';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TipPoolsSummaryMetrics {
  totalAmount: number;
  totalCount: number;
  openCount: number;
  openAmount: number;
  closedCount: number;
  closedAmount: number;
  settledCount: number;
  settledAmount: number;
  activeCount: number;
  deletedCount: number;
}

export interface CreateTipPoolDto {
  company_id?: string;
  merchant_id?: string;
  shift_id: number;
  name: string;
  distribution_type: TipPoolDistributionType;
  status?: TipPoolStatus;
  record_status?: TipPoolRecordStatus;
  notes?: string | null;
}

export interface UpdateTipPoolDto {
  shift_id?: number;
  name?: string;
  distribution_type?: TipPoolDistributionType;
  status?: TipPoolStatus;
  record_status?: TipPoolRecordStatus;
  closed_at?: string | null;
  notes?: string | null;
}

export interface ActiveShiftOption {
  id: number;
  name: string;
  time_window: string;
  status: 'OPEN' | 'ACTIVE' | 'CLOSED';
}

