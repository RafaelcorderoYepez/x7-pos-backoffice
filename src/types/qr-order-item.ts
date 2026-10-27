// Domain types for QR Order Line-Items management (QROrderItem).
// Aligns with TypeORM backend entity mapped to the `qr_order_item` table.
// Relational binding to QROrder (qr_order_id), QRMenuItem (qr_menu_item_id), and POS OrderItem (order_item_id).

export type QROrderItemStatus = 'active' | 'inactive' | 'archived';

export interface QROrderRef {
  id: number;
  merchant_id?: number;
  qr_location_id?: number;
  order_id?: number;
  qr_order_status?: string;
  notes?: string | null;
  total_amount?: number;
  table_id?: number | null;
  table?: { id: number; number: string; zone_name?: string } | null;
  customer?: { id: number; name: string; email?: string | null } | null;
  qrLocation?: { id: number; name: string } | null;
}

export interface QRMenuItemRef {
  id: number;
  name: string;
  image_url?: string;
  description?: string;
  price?: number;
  qr_menu_section_id?: number;
  product_id?: number | null;
  product_name?: string;
}

export interface POSOrderItemRef {
  id: number;
  order_id?: number;
  product_name?: string;
  unit_price?: number;
  quantity?: number;
  notes?: string | null;
}

export interface QROrderItem {
  id: number;
  qr_order_id: number; // Non-nullable foreign key to QROrder
  qr_menu_item_id: number; // Non-nullable foreign key to QRMenuItem
  order_item_id?: number | null; // Belongs to master POS OrderItem
  quantity: number; // Integer field representing count of items ordered
  unit_price: number; // Numeric precision of 12 with scale 2
  subtotal_price: number; // Numeric precision of 12 with scale 2 (quantity * unit_price)
  notes?: string | null; // Item-level special preparation instructions
  status: QROrderItemStatus | string; // 'active' | 'inactive' | 'archived'
  created_at?: string;
  updated_at?: string;

  // TypeORM Eager / Relation Bindings
  qrOrder?: QROrderRef;
  qrMenuItem?: QRMenuItemRef;
  orderItem?: POSOrderItemRef | null;
}

export interface CreateQROrderItemDto {
  qr_order_id: number;
  qr_menu_item_id: number;
  order_item_id?: number | null;
  product_id?: number | null;
  quantity: number;
  unit_price: number;
  subtotal_price?: number;
  notes?: string | null;
  status: QROrderItemStatus | string;
}

export interface UpdateQROrderItemDto {
  qr_order_id?: number;
  qr_menu_item_id?: number;
  order_item_id?: number | null;
  product_id?: number | null;
  quantity?: number;
  unit_price?: number;
  subtotal_price?: number;
  notes?: string | null;
  status?: QROrderItemStatus | string;
}

export const QR_ORDER_ITEM_STATUSES: QROrderItemStatus[] = [
  'active',
  'inactive',
  'archived',
];

export interface QROrderItemStatusStyleConfig {
  label: string;
  subLabel: string;
  pillHex: string;
  pillClass: string;
  badgeClass: string;
  dotClass: string;
  borderClass: string;
  icon: string;
}

/**
 * Visual Status Pill & Badge Configurations strictly matching Business Rules:
 * active: Success Green pill (#10b981 - Valid Line Item)
 * inactive: Warning Amber pill (#f59e0b - Voided / On Hold)
 * archived: Danger Red pill (#ef4444 - Removed)
 */
export const QR_ORDER_ITEM_STATUS_CONFIG: Record<
  QROrderItemStatus,
  QROrderItemStatusStyleConfig
> = {
  active: {
    label: 'Active',
    subLabel: 'Active',
    pillHex: '#10b981',
    pillClass: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30 font-semibold',
    badgeClass: 'bg-emerald-500/10 text-[#10b981] border-emerald-500/30 font-semibold',
    dotClass: 'bg-[#10b981]',
    borderClass: 'border-[#10b981]/30',
    icon: 'check_circle',
  },
  inactive: {
    label: 'Inactive',
    subLabel: 'Inactive',
    pillHex: '#f59e0b',
    pillClass: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30 font-semibold',
    badgeClass: 'bg-amber-500/10 text-[#f59e0b] border-amber-500/30 font-semibold',
    dotClass: 'bg-[#f59e0b]',
    borderClass: 'border-[#f59e0b]/30',
    icon: 'pause_circle',
  },
  archived: {
    label: 'Archived',
    subLabel: 'Archived',
    pillHex: '#ef4444',
    pillClass: 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30 font-semibold',
    badgeClass: 'bg-rose-500/10 text-[#ef4444] border-rose-500/30 font-semibold',
    dotClass: 'bg-[#ef4444]',
    borderClass: 'border-[#ef4444]/30',
    icon: 'archive',
  },
};
