// Merchant settlements domain (platform → merchant).
// The platform collects orders from each restaurant and pays the merchant the net
// daily amount ("cashout"). These types model that flow.
// Properties in snake_case to match REST contract (/api/v1/platform/...).

export type OrderChannel = 'POS' | 'ONLINE' | 'QR' | 'DELIVERY';
export type OrderPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'WALLET';
export type OrderStatus = 'COMPLETED' | 'REFUNDED' | 'VOIDED' | 'PENDING';

export const ORDER_STATUSES: OrderStatus[] = ['COMPLETED', 'REFUNDED', 'VOIDED', 'PENDING'];
export const ORDER_CHANNELS: OrderChannel[] = ['POS', 'ONLINE', 'QR', 'DELIVERY'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  COMPLETED: 'Completed',
  REFUNDED: 'Refunded',
  VOIDED: 'Voided',
  PENDING: 'Pending',
};

// A merchant order in one of their restaurant branches.
export interface MerchantOrder {
  id: number;
  company_id: number;
  merchant_name: string;
  branch_name: string;
  order_number: string;
  order_date: string; // Business day (YYYY-MM-DD or ISO).
  channel: OrderChannel;
  payment_method: OrderPaymentMethod;
  gross_amount: number | string;
  status: OrderStatus;
  settlement_id?: number | null; // Settlement that already included this order.
  created_at?: string;
}

export type SettlementStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'ON_HOLD' | 'FAILED';

export const SETTLEMENT_STATUSES: SettlementStatus[] = [
  'PENDING',
  'PROCESSING',
  'PAID',
  'ON_HOLD',
  'FAILED',
];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  PAID: 'Paid',
  ON_HOLD: 'On Hold',
  FAILED: 'Failed',
};

// Daily merchant settlement: the net amount transferred by the platform.
export interface MerchantSettlement {
  id: number;
  company_id: number;
  merchant_name: string;
  settlement_date: string; // Settled business day.
  orders_count: number;
  gross_collected: number | string; // Sum of COMPLETED orders for the day.
  refunds: number | string; // Sum of REFUNDED orders for the day.
  platform_fee: number | string; // Platform fee commission.
  net_payout: number | string; // gross_collected - platform_fee - refunds.
  status: SettlementStatus;
  payout_reference?: string | null;
  paid_at?: string | null;
  created_at?: string;
  orders?: MerchantOrder[];
}

// DTO to execute payout ("cashout").
export interface ExecutePayoutDto {
  reference?: string;
}
