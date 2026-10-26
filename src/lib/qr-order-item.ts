// Domain logic, financial calculation, and business rules for QR Order Line-Items (QROrderItem).
// Enforces precision 12, scale 2 on unit_price and subtotal_price, integer validation on quantity,
// strictly verifies subtotal_price = quantity * unit_price, and validates relational bindings.

import type {
  CreateQROrderItemDto,
  QROrderItem,
  QROrderItemStatus,
} from '../types/qr-order-item';
import { QR_ORDER_ITEM_STATUSES } from '../types/qr-order-item';

/**
 * Calculates subtotal_price strictly computed as quantity * unit_price,
 * rounded to standard monetary precision (precision: 12, scale: 2).
 */
export function calculateSubtotalPrice(quantity: number, unitPrice: number): number {
  if (isNaN(quantity) || isNaN(unitPrice)) return 0;
  return Number((Math.round(quantity * unitPrice * 100) / 100).toFixed(2));
}

/**
 * Validates integer field representing count of items ordered (quantity).
 * Must be a positive integer (>= 1, no decimal fractions).
 */
export function validateQuantity(qty: unknown): {
  valid: boolean;
  error?: string;
  parsedValue?: number;
} {
  if (qty === undefined || qty === null || qty === '') {
    return { valid: false, error: 'Quantity is required.' };
  }

  const str = String(qty).trim();
  const num = Number(str);

  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, error: 'Quantity must be a valid integer.' };
  }

  if (!Number.isInteger(num)) {
    return { valid: false, error: 'Quantity must be a whole integer without decimals (e.g. 1, 2, 3).' };
  }

  if (num < 1) {
    return { valid: false, error: 'Quantity must be at least 1 item ordered.' };
  }

  if (num > 99999) {
    return { valid: false, error: 'Quantity exceeds maximum allowable single order limit (99,999).' };
  }

  return { valid: true, parsedValue: num };
}

/**
 * Validates financial precision of unit_price (TypeORM: precision 12, scale 2).
 * Allowed range: 0.00 to 9,999,999,999.99 (up to 10 integer digits and up to 2 decimal places).
 */
export function validateUnitPrice(price: unknown): {
  valid: boolean;
  error?: string;
  parsedValue?: number;
} {
  if (price === undefined || price === null || price === '') {
    return { valid: false, error: 'Unit price is required.' };
  }

  const str = String(price).trim();
  const monetaryRegex = /^\d{1,10}(\.\d{1,2})?$/;

  if (!monetaryRegex.test(str)) {
    const num = Number(str);
    if (isNaN(num)) {
      return { valid: false, error: 'Unit price must be a valid numeric monetary value.' };
    }
    if (num < 0) {
      return { valid: false, error: 'Unit price cannot be negative.' };
    }
    if (str.includes('.')) {
      const decimals = str.split('.')[1];
      if (decimals && decimals.length > 2) {
        return {
          valid: false,
          error: 'Unit price exceeds precision limit: maximum 2 decimal places allowed (scale: 2).',
        };
      }
    }
    return {
      valid: false,
      error: 'Unit price exceeds maximum precision of 12 digits (max 9,999,999,999.99).',
    };
  }

  const parsed = parseFloat(str);
  if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
    return { valid: false, error: 'Unit price must be a valid non-negative number.' };
  }

  if (parsed > 9999999999.99) {
    return {
      valid: false,
      error: 'Unit price exceeds maximum allowed value of 9,999,999,999.99 (precision: 12, scale: 2).',
    };
  }

  return { valid: true, parsedValue: Number(parsed.toFixed(2)) };
}

/**
 * Strictly verifies that subtotal_price equals quantity * unit_price with monetary precision.
 */
export function validateSubtotalPrice(
  quantity: number,
  unitPrice: number,
  subtotal: number
): { valid: boolean; error?: string; expectedSubtotal?: number } {
  const expected = calculateSubtotalPrice(quantity, unitPrice);
  const diff = Math.abs(subtotal - expected);

  if (diff > 0.01) {
    return {
      valid: false,
      error: `Subtotal price ($${Number(subtotal).toFixed(2)}) strictly must equal quantity (${quantity}) × unit price ($${Number(unitPrice).toFixed(2)}) = $${expected.toFixed(2)} (precision: 12, scale: 2).`,
      expectedSubtotal: expected,
    };
  }

  return { valid: true, expectedSubtotal: expected };
}

/**
 * Validates logical status (active, inactive, archived).
 */
export function validateQROrderItemStatus(status: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!status || typeof status !== 'string') {
    return { valid: false, error: 'Status is required.' };
  }

  const normalized = status.trim().toLowerCase() as QROrderItemStatus;
  if (!QR_ORDER_ITEM_STATUSES.includes(normalized)) {
    return {
      valid: false,
      error: `Invalid status "${status}". Allowed values: ${QR_ORDER_ITEM_STATUSES.join(', ')}.`,
    };
  }

  return { valid: true };
}

/**
 * Validates complete payload for creating or updating a QROrderItem record.
 * Validates non-nullable foreign keys qr_order_id and qr_menu_item_id,
 * integer quantity, precision 12 scale 2 unit_price & subtotal_price, and status.
 */
export function validateQROrderItemPayload(
  dto: Partial<CreateQROrderItemDto>
): {
  valid: boolean;
  fieldErrors: Record<string, string>;
  error?: string;
  computedSubtotal?: number;
} {
  const fieldErrors: Record<string, string> = {};

  // Parent QR Order foreign key (non-nullable)
  if (!dto.qr_order_id || Number(dto.qr_order_id) <= 0) {
    fieldErrors.qr_order_id = 'Parent QR Order is required (qr_order_id cannot be null).';
  }

  // Original QR Menu Item catalog item (non-nullable)
  if (!dto.qr_menu_item_id || Number(dto.qr_menu_item_id) <= 0) {
    fieldErrors.qr_menu_item_id = 'Menu Catalog Item is required (qr_menu_item_id cannot be null).';
  }

  // Master POS Order Item foreign key (required)
  if (!dto.order_item_id || Number(dto.order_item_id) <= 0) {
    fieldErrors.order_item_id = 'Master POS Order Item is required (order_item_id cannot be null).';
  }

  // Quantity integer validation (count of items ordered)
  const qtyCheck = validateQuantity(dto.quantity);
  if (!qtyCheck.valid) {
    fieldErrors.quantity = qtyCheck.error || 'Invalid quantity.';
  }

  // Unit price precision (precision: 12, scale: 2)
  const priceCheck = validateUnitPrice(dto.unit_price);
  if (!priceCheck.valid) {
    fieldErrors.unit_price = priceCheck.error || 'Invalid unit price.';
  }

  // Subtotal price calculation & verification (required)
  let computedSubtotal: number | undefined;
  if (qtyCheck.valid && priceCheck.valid) {
    computedSubtotal = calculateSubtotalPrice(qtyCheck.parsedValue!, priceCheck.parsedValue!);

    if (dto.subtotal_price === undefined || dto.subtotal_price === null) {
      fieldErrors.subtotal_price = 'Subtotal price is required.';
    } else {
      const subCheck = validateSubtotalPrice(
        qtyCheck.parsedValue!,
        priceCheck.parsedValue!,
        Number(dto.subtotal_price)
      );
      if (!subCheck.valid) {
        fieldErrors.subtotal_price = subCheck.error!;
      }
    }
  } else if (dto.subtotal_price === undefined || dto.subtotal_price === null) {
    fieldErrors.subtotal_price = 'Subtotal price is required.';
  }

  // Status field validation
  const statusCheck = validateQROrderItemStatus(dto.status);
  if (!statusCheck.valid) {
    fieldErrors.status = statusCheck.error || 'Invalid status.';
  }

  const valid = Object.keys(fieldErrors).length === 0;
  return {
    valid,
    fieldErrors,
    error: valid ? undefined : Object.values(fieldErrors)[0],
    computedSubtotal,
  };
}

/**
 * Formats monetary amounts into standard USD currency string ($XX.XX) with 2 decimal places.
 */
export function formatCurrency(amount: number | string | null | undefined): string {
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
 * Order Line Badge: Displays #QR-ORI-{id} badge.
 */
export function formatQROrderItemBadge(id: number | string): string {
  return `#QR-ORI-${id}`;
}

/**
 * Parent QR Order Badge: Displays #QR-ORD-{qr_order_id}.
 */
export function formatQROrderBadge(qrOrderId: number | string): string {
  return `#QR-ORD-${qrOrderId}`;
}

/**
 * Master POS Order Line Item Tag: Displays #POS-ORI-{order_item_id}.
 */
export function formatPOSOrderItemBadge(orderItemId?: number | string | null): string {
  if (!orderItemId || orderItemId === 0) {
    return 'UNLINKED POS LINE';
  }
  return `#POS-ORI-${orderItemId}`;
}

/**
 * Quantity Badge: Monospace count indicator (e.g. "x2", "x1").
 */
export function formatQuantityBadge(quantity: number | string): string {
  return `x${quantity}`;
}

/**
 * Filters QR order items based on search term, status set, and parent QR order filter.
 */
export function filterQROrderItems(
  items: QROrderItem[],
  filters: {
    searchTerm?: string;
    statuses?: Set<string>;
    qrOrderId?: number | string | 'ALL';
    qrMenuItemId?: number | string | 'ALL';
  }
): QROrderItem[] {
  const search = filters.searchTerm ? filters.searchTerm.trim().toLowerCase() : '';
  const allowedStatuses = filters.statuses;
  const qrOrderIdFilter = filters.qrOrderId;
  const qrMenuItemIdFilter = filters.qrMenuItemId;

  return items.filter((item) => {
    // Filter by Parent QR Order
    if (qrOrderIdFilter && qrOrderIdFilter !== 'ALL') {
      const targetOrderId = Number(qrOrderIdFilter);
      if (item.qr_order_id !== targetOrderId) {
        return false;
      }
    }

    // Filter by Catalog Menu Item (qr_menu_item_id)
    if (qrMenuItemIdFilter && qrMenuItemIdFilter !== 'ALL') {
      const targetMenuItemId = Number(qrMenuItemIdFilter);
      if (Number(item.qr_menu_item_id) !== targetMenuItemId) {
        return false;
      }
    }

    // Filter by Status
    if (allowedStatuses !== undefined) {
      if (!allowedStatuses.has(item.status)) {
        return false;
      }
    }

    // Filter by Search Query
    if (search) {
      const oriBadge = formatQROrderItemBadge(item.id).toLowerCase();
      const ordBadge = formatQROrderBadge(item.qr_order_id).toLowerCase();
      const posTag = formatPOSOrderItemBadge(item.order_item_id).toLowerCase();
      const dishName = (item.qrMenuItem?.name || '').toLowerCase();
      const notes = (item.notes || '').toLowerCase();
      const posProductName = (item.orderItem?.product_name || '').toLowerCase();

      const matches =
        oriBadge.includes(search) ||
        ordBadge.includes(search) ||
        posTag.includes(search) ||
        dishName.includes(search) ||
        notes.includes(search) ||
        posProductName.includes(search) ||
        String(item.id).includes(search) ||
        String(item.qr_order_id).includes(search) ||
        String(item.order_item_id || '').includes(search);

      if (!matches) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Computes high-level financial & operational metrics across QR order line items.
 * Calculates total processed lines, active items sold, ratio of items per order,
 * and percentage of orders containing custom preparation notes.
 */
export function aggregateQROrderItemMetrics(items: QROrderItem[]): {
  totalCount: number;
  totalLinesProcessed: number;
  activeCount: number;
  inactiveCount: number;
  archivedCount: number;
  totalPortions: number;
  activePortions: number;
  totalItemsSold: number;
  averageItemsPerOrder: number;
  specialInstructionsRatio: number;
  itemsWithNotesCount: number;
  uniqueOrderCount: number;
  totalGrossVolume: number;
  activeGrossTotal: number;
} {
  let totalCount = 0;
  let activeCount = 0;
  let inactiveCount = 0;
  let archivedCount = 0;
  let totalPortions = 0;
  let activePortions = 0;
  let totalGrossVolume = 0;
  let activeGrossTotal = 0;
  let itemsWithNotesCount = 0;
  const orderIds = new Set<number>();

  for (const item of items) {
    totalCount += 1;
    const qty = Number(item.quantity) || 0;
    const subtotal = Number(item.subtotal_price) || 0;

    totalPortions += qty;
    totalGrossVolume += subtotal;

    if (item.qr_order_id) {
      orderIds.add(Number(item.qr_order_id));
    }

    if (item.notes && item.notes.trim()) {
      itemsWithNotesCount += 1;
    }

    if (item.status === 'active') {
      activeCount += 1;
      activePortions += qty;
      activeGrossTotal += subtotal;
    } else if (item.status === 'inactive') {
      inactiveCount += 1;
    } else if (item.status === 'archived') {
      archivedCount += 1;
    }
  }

  const uniqueOrderCount = orderIds.size;
  const averageItemsPerOrder =
    uniqueOrderCount > 0 ? Number((totalCount / uniqueOrderCount).toFixed(1)) : 0;
  const specialInstructionsRatio =
    totalCount > 0 ? Number(((itemsWithNotesCount / totalCount) * 100).toFixed(1)) : 0;

  return {
    totalCount,
    totalLinesProcessed: totalCount,
    activeCount,
    inactiveCount,
    archivedCount,
    totalPortions,
    activePortions,
    totalItemsSold: activePortions,
    averageItemsPerOrder,
    specialInstructionsRatio,
    itemsWithNotesCount,
    uniqueOrderCount,
    totalGrossVolume: Number(totalGrossVolume.toFixed(2)),
    activeGrossTotal: Number(activeGrossTotal.toFixed(2)),
  };
}

/**
 * Cascade Recalculation Engine:
 * Recalculates parent QROrder entity's total_amount based on all line items.
 * Only line items with status === 'active' contribute to the parent order's total_amount.
 * Updating an item recalculates subtotal_price and triggers this cascade recalculation.
 * Soft-deleting (status = 'inactive') or archiving an item excludes its subtotal_price,
 * recalculating the parent order's total_amount with monetary precision (precision: 12, scale: 2).
 */
export function calculateParentOrderTotal(
  qrOrderId: number,
  items: QROrderItem[]
): number {
  const activeItems = items.filter(
    (item) => Number(item.qr_order_id) === Number(qrOrderId) && item.status === 'active'
  );
  const total = activeItems.reduce((acc, curr) => acc + (Number(curr.subtotal_price) || 0), 0);
  return Number(total.toFixed(2));
}

