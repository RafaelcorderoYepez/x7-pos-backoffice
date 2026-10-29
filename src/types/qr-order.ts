// Domain types for QR Order management (QROrder).
// Aligns with TypeORM backend entity mapped to the `qr_order` table.
// Relational binding to Merchant, QRLocation, Customer (nullable), Table (nullable), and POS Order.

export type QROrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PREPARATION'
  | 'DELIVERED'
  | 'CANCELLED';

export type QROrderLogicalStatus = 'active' | 'inactive' | 'archived';

export interface MerchantRef {
  id: number;
  name: string;
  code?: string;
}

export interface QRLocationRef {
  id: number;
  name: string;
  merchant_id?: number;
  location_type?: string;
  qr_code_url?: string;
}

export interface CustomerRef {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface TableRef {
  id: number;
  number: string;
  merchant_id?: number;
  capacity?: number;
  zone_name?: string;
}

export interface POSOrderRef {
  id: number;
  order_number?: string;
  total_amount?: number;
  status?: string;
  created_at?: string;
}

export interface QROrder {
  id: number;
  merchant_id: number;
  qr_location_id: number;
  customer_id?: number | null;
  table_id?: number | null;
  order_id: number;
  qr_order_status: QROrderStatus;
  notes?: string | null;
  total_amount: number; // numeric(12, 2)
  status: QROrderLogicalStatus | string;
  created_at?: string;
  updated_at?: string;

  // TypeORM Eager / Relation Bindings
  merchant?: MerchantRef;
  qrLocation?: QRLocationRef;
  customer?: CustomerRef | null;
  table?: TableRef | null;
  order?: POSOrderRef;
}

export interface CreateQROrderDto {
  merchant_id: number;
  qr_location_id: number;
  customer_id?: number | null;
  table_id?: number | null;
  order_id: number;
  qr_order_status: QROrderStatus;
  notes?: string | null;
  total_amount: number;
  status: QROrderLogicalStatus | string;
}

export interface UpdateQROrderDto {
  merchant_id?: number;
  qr_location_id?: number;
  customer_id?: number | null;
  table_id?: number | null;
  order_id?: number;
  qr_order_status?: QROrderStatus;
  notes?: string | null;
  total_amount?: number;
  status?: QROrderLogicalStatus | string;
}

export const QR_ORDER_STATUSES: QROrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PREPARATION',
  'DELIVERED',
  'CANCELLED',
];

export const QR_ORDER_LOGICAL_STATUSES: QROrderLogicalStatus[] = [
  'active',
  'inactive',
  'archived',
];

export interface QROrderStatusStyleConfig {
  label: string;
  subLabel: string;
  pillHex: string;
  pillClass: string;
  badgeClass: string;
  dotClass: string;
  icon: string;
  kanbanBorder: string;
  kanbanHeaderBg: string;
}

// Visual style mapping aligned with Business Rules & Acceptance Criteria:
// PENDING: Warning Amber pill (#f59e0b - Awaiting Staff Acceptance)
// CONFIRMED / IN_PREPARATION: Info Blue pill (#3b82f6 - Cooking)
// DELIVERED: Success Green pill (#10b981 - Served to Table)
// CANCELLED: Danger Red pill (#ef4444 - Rejected)
export const QR_ORDER_STATUS_CONFIG: Record<QROrderStatus, QROrderStatusStyleConfig> = {
  PENDING: {
    label: 'Pending',
    subLabel: 'Awaiting Staff Acceptance',
    pillHex: '#f59e0b',
    pillClass: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30 font-semibold',
    badgeClass: 'bg-amber-500/10 text-[#f59e0b] border-amber-500/30 font-semibold',
    dotClass: 'bg-[#f59e0b]',
    icon: 'hourglass_top',
    kanbanBorder: 'border-[#f59e0b]/40',
    kanbanHeaderBg: 'bg-[#f59e0b]/10',
  },
  CONFIRMED: {
    label: 'Confirmed',
    subLabel: 'Cooking',
    pillHex: '#3b82f6',
    pillClass: 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/30 font-semibold',
    badgeClass: 'bg-blue-500/10 text-[#3b82f6] border-blue-500/30 font-semibold',
    dotClass: 'bg-[#3b82f6]',
    icon: 'check_circle',
    kanbanBorder: 'border-[#3b82f6]/40',
    kanbanHeaderBg: 'bg-[#3b82f6]/10',
  },
  IN_PREPARATION: {
    label: 'In Preparation',
    subLabel: 'Cooking',
    pillHex: '#3b82f6',
    pillClass: 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/30 font-semibold',
    badgeClass: 'bg-blue-500/10 text-[#3b82f6] border-blue-500/30 font-semibold',
    dotClass: 'bg-[#3b82f6]',
    icon: 'soup_kitchen',
    kanbanBorder: 'border-[#3b82f6]/40',
    kanbanHeaderBg: 'bg-[#3b82f6]/10',
  },
  DELIVERED: {
    label: 'Delivered',
    subLabel: 'Served to Table',
    pillHex: '#10b981',
    pillClass: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30 font-semibold',
    badgeClass: 'bg-emerald-500/10 text-[#10b981] border-emerald-500/30 font-semibold',
    dotClass: 'bg-[#10b981]',
    icon: 'room_service',
    kanbanBorder: 'border-[#10b981]/40',
    kanbanHeaderBg: 'bg-[#10b981]/10',
  },
  CANCELLED: {
    label: 'Cancelled',
    subLabel: 'Rejected',
    pillHex: '#ef4444',
    pillClass: 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30 font-semibold',
    badgeClass: 'bg-rose-500/10 text-[#ef4444] border-rose-500/30 font-semibold',
    dotClass: 'bg-[#ef4444]',
    icon: 'cancel',
    kanbanBorder: 'border-[#ef4444]/40',
    kanbanHeaderBg: 'bg-[#ef4444]/10',
  },
};

export const QR_ORDER_LOGICAL_STATUS_CONFIG: Record<
  QROrderLogicalStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  active: {
    label: 'Active',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 font-medium',
    dotClass: 'bg-emerald-500',
  },
  inactive: {
    label: 'Inactive',
    badgeClass: 'bg-amber-500/10 text-amber-600 border border-amber-500/30 font-medium',
    dotClass: 'bg-amber-500',
  },
  archived: {
    label: 'Archived',
    badgeClass: 'bg-slate-500/10 text-slate-600 border border-slate-500/30 font-medium',
    dotClass: 'bg-slate-500',
  },
};
