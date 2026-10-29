import { describe, expect, it } from 'vitest';
import {
  aggregateQROrderItemMetrics,
  calculateSubtotalPrice,
  filterQROrderItems,
  formatCurrency,
  formatPOSOrderItemBadge,
  formatQROrderBadge,
  formatQROrderItemBadge,
  formatQuantityBadge,
  validateQROrderItemPayload,
  validateQROrderItemStatus,
  validateQuantity,
  validateSubtotalPrice,
  validateUnitPrice,
} from './qr-order-item';
import type { QROrderItem } from '../types/qr-order-item';

describe('QR Order Item Domain Logic (qr-order-item.ts)', () => {
  describe('Subtotal Calculation & Financial Precision (12, 2)', () => {
    it('strictly calculates subtotal_price as quantity * unit_price rounded to 2 decimal places', () => {
      expect(calculateSubtotalPrice(2, 29.5)).toBe(59.0);
      expect(calculateSubtotalPrice(1, 48.0)).toBe(48.0);
      expect(calculateSubtotalPrice(3, 16.99)).toBe(50.97);
      expect(calculateSubtotalPrice(10, 12.34)).toBe(123.4);
    });

    it('validates quantity as whole positive integer', () => {
      expect(validateQuantity(1).valid).toBe(true);
      expect(validateQuantity(5).valid).toBe(true);
      expect(validateQuantity('2').valid).toBe(true);

      // Decimals rejected
      expect(validateQuantity(1.5).valid).toBe(false);
      expect(validateQuantity('2.7').valid).toBe(false);

      // Negative or zero rejected
      expect(validateQuantity(0).valid).toBe(false);
      expect(validateQuantity(-2).valid).toBe(false);

      // Null or empty rejected
      expect(validateQuantity('').valid).toBe(false);
      expect(validateQuantity(null).valid).toBe(false);
      expect(validateQuantity(undefined).valid).toBe(false);
    });

    it('validates unit_price adhering to precision 12, scale 2', () => {
      expect(validateUnitPrice(48.0).valid).toBe(true);
      expect(validateUnitPrice('29.50').valid).toBe(true);
      expect(validateUnitPrice(0).valid).toBe(true);
      expect(validateUnitPrice(9999999999.99).valid).toBe(true);

      // Exceeds 2 decimal scale
      expect(validateUnitPrice('10.999').valid).toBe(false);
      expect(validateUnitPrice('10.999').error).toContain('scale: 2');

      // Negative price rejected
      expect(validateUnitPrice(-5).valid).toBe(false);

      // Empty or invalid string rejected
      expect(validateUnitPrice('').valid).toBe(false);
      expect(validateUnitPrice('abc').valid).toBe(false);

      // Exceeds 10 digits before decimal (precision 12)
      expect(validateUnitPrice('12345678901.00').valid).toBe(false);
    });

    it('strictly verifies subtotal equals quantity * unit_price', () => {
      // Valid strictly equal subtotal
      const validCheck = validateSubtotalPrice(2, 29.5, 59.0);
      expect(validCheck.valid).toBe(true);
      expect(validCheck.expectedSubtotal).toBe(59.0);

      // Inconsistent subtotal rejected
      const invalidCheck = validateSubtotalPrice(2, 29.5, 65.0);
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.error).toContain('strictly must equal quantity (2) × unit price ($29.50) = $59.00');
    });
  });

  describe('Relational Integrity & Payload Validation', () => {
    it('requires non-nullable qr_order_id and non-nullable qr_menu_item_id', () => {
      const result = validateQROrderItemPayload({
        quantity: 2,
        unit_price: 15.0,
        status: 'active',
      });

      expect(result.valid).toBe(false);
      expect(result.fieldErrors.qr_order_id).toBeDefined();
      expect(result.fieldErrors.qr_menu_item_id).toBeDefined();
    });

    it('accepts complete valid DTO with correct relations and computes subtotal', () => {
      const result = validateQROrderItemPayload({
        qr_order_id: 1,
        qr_menu_item_id: 9001,
        order_item_id: 101,
        quantity: 2,
        unit_price: 25.0,
        subtotal_price: 50.0,
        notes: 'Extra spicy please.',
        status: 'active',
      });

      expect(result.valid).toBe(true);
      expect(result.computedSubtotal).toBe(50.0);
      expect(Object.keys(result.fieldErrors).length).toBe(0);
    });

    it('rejects invalid status', () => {
      expect(validateQROrderItemStatus('active').valid).toBe(true);
      expect(validateQROrderItemStatus('inactive').valid).toBe(true);
      expect(validateQROrderItemStatus('archived').valid).toBe(true);
      expect(validateQROrderItemStatus('pending').valid).toBe(false);
    });
  });

  describe('Badges and Formatters', () => {
    it('formats order line badge as #QR-ORI-{id}', () => {
      expect(formatQROrderItemBadge(1)).toBe('#QR-ORI-1');
      expect(formatQROrderItemBadge(42)).toBe('#QR-ORI-42');
    });

    it('formats parent order badge as #QR-ORD-{qr_order_id}', () => {
      expect(formatQROrderBadge(5)).toBe('#QR-ORD-5');
      expect(formatQROrderBadge(100)).toBe('#QR-ORD-100');
    });

    it('formats master POS order item tag as #POS-ORI-{order_item_id}', () => {
      expect(formatPOSOrderItemBadge(101)).toBe('#POS-ORI-101');
      expect(formatPOSOrderItemBadge(null)).toBe('UNLINKED POS LINE');
      expect(formatPOSOrderItemBadge(0)).toBe('UNLINKED POS LINE');
    });

    it('formats quantity badge as monospace indicator', () => {
      expect(formatQuantityBadge(2)).toBe('x2');
      expect(formatQuantityBadge(10)).toBe('x10');
    });

    it('formats currency with standard two decimals', () => {
      expect(formatCurrency(48)).toBe('$48.00');
      expect(formatCurrency(29.5)).toBe('$29.50');
      expect(formatCurrency(0)).toBe('$0.00');
    });
  });

  describe('Filtering and Metrics Aggregation', () => {
    const mockItems: QROrderItem[] = [
      {
        id: 1,
        qr_order_id: 1,
        qr_menu_item_id: 9001,
        order_item_id: 101,
        quantity: 2,
        unit_price: 48.0,
        subtotal_price: 96.0,
        notes: 'Extra onions',
        status: 'active',
        qrMenuItem: { id: 9001, name: 'Cowboy Ribeye' },
      },
      {
        id: 2,
        qr_order_id: 1,
        qr_menu_item_id: 9002,
        order_item_id: 102,
        quantity: 1,
        unit_price: 30.0,
        subtotal_price: 30.0,
        notes: 'No salt',
        status: 'inactive',
        qrMenuItem: { id: 9002, name: 'Brisket Platter' },
      },
      {
        id: 3,
        qr_order_id: 2,
        qr_menu_item_id: 9003,
        order_item_id: 103,
        quantity: 3,
        unit_price: 10.0,
        subtotal_price: 30.0,
        notes: 'Gluten free',
        status: 'archived',
        qrMenuItem: { id: 9003, name: 'Truffle Fries' },
      },
    ];

    it('filters items by search term on badges, dish name, or notes', () => {
      const res1 = filterQROrderItems(mockItems, { searchTerm: 'ribeye' });
      expect(res1).toHaveLength(1);
      expect(res1[0].id).toBe(1);

      const res2 = filterQROrderItems(mockItems, { searchTerm: '#QR-ORD-2' });
      expect(res2).toHaveLength(1);
      expect(res2[0].id).toBe(3);

      const res3 = filterQROrderItems(mockItems, { searchTerm: 'No salt' });
      expect(res3).toHaveLength(1);
      expect(res3[0].id).toBe(2);
    });

    it('filters items by parent QR order id', () => {
      const res = filterQROrderItems(mockItems, { qrOrderId: 1 });
      expect(res).toHaveLength(2);
    });

    it('filters items by catalog menu item id (qrMenuItemId)', () => {
      const res = filterQROrderItems(mockItems, { qrMenuItemId: 9002 });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(2);
    });

    it('filters items by allowed statuses', () => {
      const res = filterQROrderItems(mockItems, { statuses: new Set(['active']) });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(1);

      // Empty status set returns 0 items
      const resEmpty = filterQROrderItems(mockItems, { statuses: new Set() });
      expect(resEmpty).toHaveLength(0);
    });

    it('aggregates metrics correctly across line items including operational ratios', () => {
      const metrics = aggregateQROrderItemMetrics(mockItems);
      expect(metrics.totalCount).toBe(3);
      expect(metrics.totalLinesProcessed).toBe(3);
      expect(metrics.activeCount).toBe(1);
      expect(metrics.inactiveCount).toBe(1);
      expect(metrics.archivedCount).toBe(1);
      expect(metrics.totalPortions).toBe(6);
      expect(metrics.activePortions).toBe(2);
      expect(metrics.totalItemsSold).toBe(2);
      expect(metrics.uniqueOrderCount).toBe(2); // Order 1 and Order 2
      expect(metrics.averageItemsPerOrder).toBe(1.5); // 3 items / 2 orders = 1.5
      expect(metrics.itemsWithNotesCount).toBe(3);
      expect(metrics.specialInstructionsRatio).toBe(100.0); // 3/3 = 100%
      expect(metrics.activeGrossTotal).toBe(96.0);
      expect(metrics.totalGrossVolume).toBe(156.0);
    });
  });
});
