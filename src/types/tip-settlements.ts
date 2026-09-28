// Domain types for Tip Settlements workspace (TipSettlement).
// Centralized auditing of finalized tip payout records, authorizing users, execution methods, and timestamps.

export type SettlementMethod = 'CASH' | 'PAYROLL' | 'BANK_TRANSFER';

export const SETTLEMENT_METHODS: SettlementMethod[] = ['CASH', 'PAYROLL', 'BANK_TRANSFER'];

export const SETTLEMENT_METHOD_LABELS: Record<SettlementMethod, string> = {
  CASH: 'Cash Payout',
  PAYROLL: 'Payroll Direct Deposit',
  BANK_TRANSFER: 'Bank Transfer',
};

export type TipSettlementStatus = 'PENDING' | 'SETTLED' | 'CANCELLED';

export const TIP_SETTLEMENT_STATUSES: TipSettlementStatus[] = ['PENDING', 'SETTLED', 'CANCELLED'];

export const TIP_SETTLEMENT_STATUS_LABELS: Record<TipSettlementStatus, string> = {
  PENDING: 'Pending Execution',
  SETTLED: 'Settled Payout',
  CANCELLED: 'Cancelled Settlement',
};

export interface TipSettlementAuthorizingUser {
  id: number | string;
  name: string;
  email?: string;
  role?: string;
}

export interface TipSettlementCollaboratorProfile {
  id: number | string;
  first_name: string;
  last_name: string;
  email?: string;
  role?: string;
}

export interface TipSettlementOrderRef {
  id: number;
  order_number?: string;
  total_amount?: number;
}

export interface TipSettlement {
  id: number;
  company_id: string;
  merchant_id: string;
  collaborator_id: number | string;
  shift_id: number | string;
  order_id?: number | null;
  total_amount: number;
  settlement_method: SettlementMethod;
  status: TipSettlementStatus;
  settled_by?: number | string | null;
  settled_at?: string | null; // ISO datetime string or null if pending
  notes?: string | null;
  created_at: string;
  updated_at?: string;

  // Relational Eager-Hydrated Fields
  collaborator?: TipSettlementCollaboratorProfile;
  settledByUser?: TipSettlementAuthorizingUser | null;
  order?: TipSettlementOrderRef | null;
}

export interface FetchTipSettlementsParams {
  company_id?: string;
  merchant_id?: string;
  collaborator_id?: number | string;
  shift_id?: number | string;
  order_id?: number | string;
  settlement_method?: SettlementMethod | 'ALL';
  status?: TipSettlementStatus | 'ALL';
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface TipSettlementsSummaryMetrics {
  totalSettledAmount: number;
  totalCount: number;
  settledCount: number;
  pendingCount: number;
  cancelledCount: number;
  avgSettledAmount: number;
  cashAmount: number;
  payrollAmount: number;
  bankTransferAmount: number;
}

export interface CreateTipSettlementDto {
  company_id?: string;
  merchant_id?: string;
  collaborator_id: number | string;
  shift_id: number | string;
  order_id?: number | null;
  total_amount: number;
  settlement_method: SettlementMethod;
  status?: TipSettlementStatus;
  settled_by?: number | string | null;
  settled_at?: string | null;
  notes?: string;
}

export interface UpdateTipSettlementDto {
  total_amount?: number;
  settlement_method?: SettlementMethod;
  status?: TipSettlementStatus;
  settled_by?: number | string | null;
  settled_at?: string | null;
  notes?: string;
}
