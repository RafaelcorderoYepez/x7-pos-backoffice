/**
 * CashTipMovement entity types — aligned with backend CashTipMovement model
 * and CashTipMovementType enum ('IN' | 'OUT').
 *
 * GET endpoint: GET /api/v1/cash-tip-movements
 * POST endpoint: POST /api/v1/cash-tip-movements
 * Query params leverage database composite index @Index(['cash_drawer_id', 'created_at'])
 * and secondary index @Index(['tip_id']).
 */

export type CashTipMovementType = 'IN' | 'OUT';

export const CASH_TIP_MOVEMENT_TYPES: CashTipMovementType[] = ['IN', 'OUT'];

export const CASH_TIP_MOVEMENT_TYPE_LABELS: Record<CashTipMovementType, string> = {
  IN: 'CASH IN',
  OUT: 'CASH OUT',
};

export interface CashDrawerOption {
  id: number;
  drawer_name: string;
  status: 'OPEN' | 'CLOSED' | 'Open' | 'Close' | string;
  current_balance: number;
}

export interface TipOption {
  id: number;
  amount: number;
  method: string;
  collaborator_name?: string | null;
}

export interface CreateCashTipMovementDto {
  company_id?: string;
  merchant_id?: string;
  cash_drawer_id: number;
  tip_id: number;
  movement_type: CashTipMovementType;
  amount: number;
  notes?: string;
}

export interface CashTipMovement {
  id: number;
  company_id: string;
  merchant_id: string;
  cash_drawer_id: number;
  tip_id: number;
  movement_type: CashTipMovementType;
  amount: number;
  notes?: string | null;
  created_at: string;
  updated_at?: string;

  /** Associated cash drawer relation */
  cash_drawer?: {
    id: number;
    drawer_name?: string;
    shift_id?: number;
    status?: string;
    current_balance?: number;
  } | null;

  /** Linked tip reference relation */
  tip?: {
    id: number;
    amount: number;
    method?: string;
    status?: string;
    order_id?: number | null;
    collaborator_name?: string | null;
  } | null;
}

export interface FetchCashTipMovementsParams {
  company_id?: string;
  merchant_id?: string;
  cash_drawer_id?: number | string;
  tip_id?: number | string;
  movement_type?: CashTipMovementType | 'ALL';
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface CashTipMovementsSummaryMetrics {
  totalAmount: number;
  totalInAmount: number;
  totalOutAmount: number;
  netAmount: number;
  totalCount: number;
  inCount: number;
  outCount: number;
}
