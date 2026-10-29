// Domain logic and business rules for QR Order management (QROrder).
// Enforces precision 12, scale 2 on total_amount, enum validation on qr_order_status,
// and relational binding integrity across Merchant, QRLocation, Table, Customer, and POS Order.

import type {
  CreateQROrderDto,
  CustomerRef,
  QROrder,
  QROrderStatus,
  QRLocationRef,
  TableRef,
} from '../types/qr-order';
import { QR_ORDER_STATUSES } from '../types/qr-order';

/**
 * Validates financial precision of total_amount (TypeORM: precision 12, scale 2).
 * Allowed range: 0.00 to 9,999,999,999.99 (up to 10 integer digits and up to 2 decimal places).
 */
export function validateTotalAmount(amount: unknown): {
  valid: boolean;
  error?: string;
  parsedValue?: number;
} {
  if (amount === undefined || amount === null || amount === '') {
    return { valid: false, error: 'Total amount is required.' };
  }

  const str = String(amount).trim();

  // Regex checks positive or zero monetary values with up to 10 digits before decimal and up to 2 decimal places.
  const monetaryRegex = /^\d{1,10}(\.\d{1,2})?$/;
  if (!monetaryRegex.test(str)) {
    // Check specific reason
    const num = Number(str);
    if (isNaN(num)) {
      return { valid: false, error: 'Total amount must be a valid numeric monetary value.' };
    }
    if (num < 0) {
      return { valid: false, error: 'Total amount cannot be negative.' };
    }
    if (str.includes('.')) {
      const decimals = str.split('.')[1];
      if (decimals && decimals.length > 2) {
        return {
          valid: false,
          error: 'Total amount exceeds precision limit: maximum 2 decimal places allowed (scale: 2).',
        };
      }
    }
    return {
      valid: false,
      error: 'Total amount exceeds maximum precision of 12 digits (max 9,999,999,999.99).',
    };
  }

  const parsed = parseFloat(str);
  if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
    return { valid: false, error: 'Total amount must be a valid positive number.' };
  }

  if (parsed > 9999999999.99) {
    return {
      valid: false,
      error: 'Total amount exceeds maximum allowed value of 9,999,999,999.99 (precision: 12, scale: 2).',
    };
  }

  return { valid: true, parsedValue: Number(parsed.toFixed(2)) };
}

/**
 * Validates strict compliance with the QROrderStatus enum values:
 * PENDING, CONFIRMED, IN_PREPARATION, DELIVERED, CANCELLED.
 */
export const BACKEND_QR_ORDER_STATUSES = [
  'Draft',
  'Submitted',
  'Accepted',
  'Rejected',
  'In Preparation',
  'Ready',
  'Completed',
  'Cancelled',
] as const;

export type BackendQROrderStatus = (typeof BACKEND_QR_ORDER_STATUSES)[number];

/**
 * Maps frontend QROrderStatus ('PENDING', 'CONFIRMED', 'IN_PREPARATION', 'DELIVERED', 'CANCELLED')
 * to NestJS backend QROrderStatus ('Draft', 'Submitted', 'Accepted', 'Rejected', 'In Preparation', 'Ready', 'Completed', 'Cancelled').
 */
export function mapFrontendStatusToBackend(status?: string | null): BackendQROrderStatus {
  if (!status) return 'Submitted';
  const s = String(status).trim();
  switch (s.toUpperCase()) {
    case 'PENDING':
    case 'SUBMITTED':
      return 'Submitted';
    case 'DRAFT':
      return 'Draft';
    case 'CONFIRMED':
    case 'ACCEPTED':
      return 'Accepted';
    case 'IN_PREPARATION':
    case 'IN PREPARATION':
      return 'In Preparation';
    case 'READY':
      return 'Ready';
    case 'DELIVERED':
    case 'COMPLETED':
      return 'Completed';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      if (BACKEND_QR_ORDER_STATUSES.includes(s as BackendQROrderStatus)) {
        return s as BackendQROrderStatus;
      }
      return 'Submitted';
  }
}

/**
 * Maps backend QROrderStatus ('Draft', 'Submitted', 'Accepted', 'In Preparation', etc.)
 * back to frontend QROrderStatus ('PENDING', 'CONFIRMED', 'IN_PREPARATION', 'DELIVERED', 'CANCELLED').
 */
export function mapBackendStatusToFrontend(status?: unknown): QROrderStatus {
  if (!status) return 'PENDING';
  const s = String(status).trim();
  const upper = s.toUpperCase();
  switch (s) {
    case 'Draft':
    case 'Submitted':
    case 'PENDING':
      return 'PENDING';
    case 'Accepted':
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'In Preparation':
    case 'IN_PREPARATION':
      return 'IN_PREPARATION';
    case 'Ready':
    case 'Completed':
    case 'DELIVERED':
      return 'DELIVERED';
    case 'Rejected':
    case 'Cancelled':
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      if (upper === 'ACCEPTED' || upper === 'CONFIRMED') return 'CONFIRMED';
      if (upper === 'IN PREPARATION' || upper === 'IN_PREPARATION') return 'IN_PREPARATION';
      if (upper === 'COMPLETED' || upper === 'READY' || upper === 'DELIVERED') return 'DELIVERED';
      if (upper === 'CANCELLED' || upper === 'REJECTED') return 'CANCELLED';
      return 'PENDING';
  }
}

export function validateQROrderStatus(status: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!status || typeof status !== 'string') {
    return { valid: false, error: 'QR Order status is required.' };
  }

  const normalized = status.trim().toUpperCase() as QROrderStatus;
  const isFrontendStatus = QR_ORDER_STATUSES.includes(normalized);
  const isBackendStatus = BACKEND_QR_ORDER_STATUSES.includes(status.trim() as BackendQROrderStatus);

  if (!isFrontendStatus && !isBackendStatus) {
    return {
      valid: false,
      error: `Invalid QR Order status "${status}". Allowed values: ${QR_ORDER_STATUSES.join(', ')}.`,
    };
  }

  return { valid: true };
}

/**
 * Validates table belongs to the active merchant context.
 */
export function validateTableMerchantContext(
  tableId: number | null | undefined,
  merchantId: number,
  tables?: TableRef[]
): { valid: boolean; error?: string } {
  if (tableId === null || tableId === undefined || tableId === 0) {
    return { valid: true };
  }

  if (!tables || tables.length === 0) {
    return { valid: true };
  }

  const table = tables.find((t) => t.id === tableId);
  if (!table) {
    return { valid: false, error: `Table #${tableId} was not found.` };
  }

  if (table.merchant_id && table.merchant_id !== merchantId) {
    return {
      valid: false,
      error: `Table #${table.number} belongs to merchant #${table.merchant_id}, which does not match active merchant #${merchantId}.`,
    };
  }

  return { valid: true };
}

/**
 * Valid lifecycle status transition map.
 * Enforces strict order progression and restricts invalid transitions.
 * PENDING -> CONFIRMED | CANCELLED
 * CONFIRMED -> IN_PREPARATION | CANCELLED
 * IN_PREPARATION -> DELIVERED | CANCELLED
 * DELIVERED -> Terminal (cannot revert back to PENDING)
 * CANCELLED -> Terminal (cannot revert)
 */
export const VALID_LIFECYCLE_TRANSITIONS: Record<QROrderStatus, QROrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PREPARATION', 'CANCELLED'],
  IN_PREPARATION: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * Validates whether an order status progression is permitted.
 * Restricts invalid status transitions (e.g. cannot transition directly from DELIVERED back to PENDING).
 */
export function canTransitionStatus(
  current: QROrderStatus,
  target: QROrderStatus
): { allowed: boolean; reason?: string } {
  if (current === target) {
    return { allowed: false, reason: `Order is already in ${current} status.` };
  }

  if (current === 'DELIVERED') {
    return {
      allowed: false,
      reason: `Cannot transition directly from DELIVERED back to ${target}. Fulfilled orders cannot be reverted.`,
    };
  }

  if (current === 'CANCELLED') {
    return {
      allowed: false,
      reason: `Cannot transition directly from CANCELLED back to ${target}. Cancelled orders cannot be reverted.`,
    };
  }

  const allowedTargets = VALID_LIFECYCLE_TRANSITIONS[current] || [];
  if (!allowedTargets.includes(target)) {
    return {
      allowed: false,
      reason: `Cannot transition directly from ${current} to ${target}. Valid next transitions: ${
        allowedTargets.length > 0 ? allowedTargets.join(', ') : 'None (Terminal Status)'
      }.`,
    };
  }

  return { allowed: true };
}

/**
 * Validates full payload for QROrder creation / updates.
 * Validates required fields: merchant_id, qr_location_id, order_id, qr_order_status, total_amount, status.
 */
export function validateQROrderPayload(
  dto: Partial<CreateQROrderDto>,
  options?: { tables?: TableRef[]; currentStatus?: QROrderStatus }
): { valid: boolean; fieldErrors: Record<string, string>; error?: string } {
  const fieldErrors: Record<string, string> = {};

  // Merchant (required)
  if (!dto.merchant_id || dto.merchant_id <= 0) {
    fieldErrors.merchant_id = 'A valid merchant ID is required.';
  }

  // QR Location (required)
  if (!dto.qr_location_id || dto.qr_location_id <= 0) {
    fieldErrors.qr_location_id = 'A linked QR Location is required.';
  }

  // Master POS Order (required)
  if (!dto.order_id || dto.order_id <= 0) {
    fieldErrors.order_id = 'A linked master POS Order ID is required.';
  }

  // Status Enum Validation (required)
  const statusCheck = validateQROrderStatus(dto.qr_order_status);
  if (!statusCheck.valid) {
    fieldErrors.qr_order_status = statusCheck.error || 'Invalid QR order status.';
  } else if (
    options?.currentStatus &&
    dto.qr_order_status &&
    dto.qr_order_status !== options.currentStatus
  ) {
    const transitionCheck = canTransitionStatus(options.currentStatus, dto.qr_order_status);
    if (!transitionCheck.allowed) {
      fieldErrors.qr_order_status = transitionCheck.reason!;
    }
  }

  // Logical Status (required: active, inactive, archived)
  if (!dto.status || !['active', 'inactive', 'archived'].includes(dto.status)) {
    fieldErrors.status = 'Status is required (active, inactive, or archived).';
  }

  // Total Amount Precision (required, precision: 12, scale: 2)
  const amountCheck = validateTotalAmount(dto.total_amount);
  if (!amountCheck.valid) {
    fieldErrors.total_amount = amountCheck.error || 'Invalid total amount.';
  }

  // Table merchant context validation
  if (dto.table_id && dto.merchant_id) {
    const tableCheck = validateTableMerchantContext(dto.table_id, dto.merchant_id, options?.tables);
    if (!tableCheck.valid) {
      fieldErrors.table_id = tableCheck.error!;
    }
  }

  const valid = Object.keys(fieldErrors).length === 0;
  return {
    valid,
    fieldErrors,
    error: valid ? undefined : Object.values(fieldErrors)[0],
  };
}

/**
 * Formats total_amount into standard USD/locale currency format with 2 decimal places.
 */
export function formatQROrderCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '$0.00';
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Displays #QR-ORD-{id} badge.
 */
export function formatQROrderBadge(id: number | string): string {
  return `#QR-ORD-${id}`;
}

/**
 * Displays master POS order reference #ORD-{order_id}.
 */
export function formatPOSOrderBadge(orderId: number | string): string {
  return `#ORD-${orderId}`;
}

/**
 * Formats customer full name or "Guest Scan".
 */
export function getCustomerDisplayName(customer?: CustomerRef | null): string {
  if (!customer || !customer.name || !customer.name.trim()) {
    return 'Guest Scan';
  }
  return customer.name.trim();
}

/**
 * Formats QR Location and Dining Table context.
 */
export function getLocationTableContext(
  qrLocation?: QRLocationRef | null,
  table?: TableRef | null
): {
  locationName: string;
  tableText: string;
  combined: string;
} {
  const locationName = qrLocation?.name || 'Unassigned Location';
  const tableText = table?.number ? `Table #${table.number}` : 'No Table Seating';
  const combined = table?.number ? `${locationName} • Table #${table.number}` : locationName;

  return { locationName, tableText, combined };
}

/**
 * Returns allowed next lifecycle transitions for quick workflow dispatch.
 */
export function getNextLifecycleStatuses(current: QROrderStatus): {
  target: QROrderStatus;
  label: string;
  icon: string;
  colorClass: string;
}[] {
  switch (current) {
    case 'PENDING':
      return [
        {
          target: 'CONFIRMED',
          label: 'Accept Order',
          icon: 'check_circle',
          colorClass: 'bg-blue-600 hover:bg-blue-700 text-white',
        },
        {
          target: 'CANCELLED',
          label: 'Reject Order',
          icon: 'cancel',
          colorClass: 'bg-rose-600 hover:bg-rose-700 text-white',
        },
      ];
    case 'CONFIRMED':
      return [
        {
          target: 'IN_PREPARATION',
          label: 'Send to Kitchen',
          icon: 'soup_kitchen',
          colorClass: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        },
        {
          target: 'CANCELLED',
          label: 'Cancel Order',
          icon: 'cancel',
          colorClass: 'bg-rose-600 hover:bg-rose-700 text-white',
        },
      ];
    case 'IN_PREPARATION':
      return [
        {
          target: 'DELIVERED',
          label: 'Mark Delivered',
          icon: 'room_service',
          colorClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        },
        {
          target: 'CANCELLED',
          label: 'Cancel Order',
          icon: 'cancel',
          colorClass: 'bg-rose-600 hover:bg-rose-700 text-white',
        },
      ];
    case 'DELIVERED':
    case 'CANCELLED':
    default:
      return [];
  }
}

/**
 * Filter predicate for QR Orders directory.
 */
export function filterQROrders(
  orders: QROrder[],
  filters: {
    searchTerm: string;
    selectedStatuses: Set<QROrderStatus>;
    locationId: string; // 'ALL' or numeric string
    selectedLogicalStatuses: Set<string>;
  }
): QROrder[] {
  const query = filters.searchTerm.trim().toLowerCase();

  return orders.filter((order) => {
    // Status filter
    if (!filters.selectedStatuses.has(order.qr_order_status)) {
      return false;
    }

    // Logical status filter
    if (order.status && !filters.selectedLogicalStatuses.has(order.status)) {
      return false;
    }

    // Location filter
    if (filters.locationId !== 'ALL') {
      const locIdNum = parseInt(filters.locationId, 10);
      if (order.qr_location_id !== locIdNum) {
        return false;
      }
    }

    // Search query
    if (query) {
      const qrBadge = formatQROrderBadge(order.id).toLowerCase();
      const posBadge = formatPOSOrderBadge(order.order_id).toLowerCase();
      const customerName = getCustomerDisplayName(order.customer).toLowerCase();
      const locationName = (order.qrLocation?.name || '').toLowerCase();
      const tableNumber = (order.table?.number || '').toLowerCase();
      const notes = (order.notes || '').toLowerCase();

      const matches =
        qrBadge.includes(query) ||
        posBadge.includes(query) ||
        customerName.includes(query) ||
        locationName.includes(query) ||
        tableNumber.includes(query) ||
        notes.includes(query);

      if (!matches) return false;
    }

    return true;
  });
}
