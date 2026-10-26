import { describe, expect, it } from 'vitest';
import {
  canTransitionStatus,
  filterQROrders,
  formatPOSOrderBadge,
  formatQROrderBadge,
  formatQROrderCurrency,
  getCustomerDisplayName,
  getNextLifecycleStatuses,
  validateQROrderPayload,
  validateQROrderStatus,
  validateTableMerchantContext,
  validateTotalAmount,
} from './qr-order';
import type { QROrder, TableRef } from '../types/qr-order';

describe('QR Order Domain Logic & Validation', () => {
  describe('Precision Enforcement (precision: 12, scale: 2)', () => {
    it('accepts valid monetary amounts with 0, 1, or 2 decimal places', () => {
      expect(validateTotalAmount(45).valid).toBe(true);
      expect(validateTotalAmount(45.5).valid).toBe(true);
      expect(validateTotalAmount(45.5).parsedValue).toBe(45.5);
      expect(validateTotalAmount('129.99').valid).toBe(true);
      expect(validateTotalAmount('129.99').parsedValue).toBe(129.99);
      expect(validateTotalAmount(0).valid).toBe(true);
      expect(validateTotalAmount('0.00').valid).toBe(true);
      expect(validateTotalAmount(9999999999.99).valid).toBe(true);
    });

    it('rejects values with more than 2 decimal places (scale: 2 enforcement)', () => {
      const res = validateTotalAmount('45.999');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('scale: 2');
    });

    it('rejects negative values and non-numeric inputs', () => {
      expect(validateTotalAmount(-10.5).valid).toBe(false);
      expect(validateTotalAmount('-5.00').valid).toBe(false);
      expect(validateTotalAmount('abc').valid).toBe(false);
      expect(validateTotalAmount(null).valid).toBe(false);
      expect(validateTotalAmount(undefined).valid).toBe(false);
      expect(validateTotalAmount('').valid).toBe(false);
    });

    it('rejects amounts exceeding maximum precision limit of 12 digits', () => {
      const res = validateTotalAmount('10000000000.00'); // 11 integer digits
      expect(res.valid).toBe(false);
      expect(res.error).toContain('maximum precision');
    });
  });

  describe('Enum Validation (QROrderStatus)', () => {
    it('accepts valid QROrderStatus enum values', () => {
      expect(validateQROrderStatus('PENDING').valid).toBe(true);
      expect(validateQROrderStatus('CONFIRMED').valid).toBe(true);
      expect(validateQROrderStatus('IN_PREPARATION').valid).toBe(true);
      expect(validateQROrderStatus('DELIVERED').valid).toBe(true);
      expect(validateQROrderStatus('CANCELLED').valid).toBe(true);
    });

    it('rejects invalid enum values', () => {
      expect(validateQROrderStatus('COOKING').valid).toBe(false);
      expect(validateQROrderStatus('COMPLETED').valid).toBe(false);
      expect(validateQROrderStatus('REJECTED').valid).toBe(false);
      expect(validateQROrderStatus('').valid).toBe(false);
      expect(validateQROrderStatus(null).valid).toBe(false);
    });
  });

  describe('Table and Merchant Context Validation', () => {
    const mockTables: TableRef[] = [
      { id: 201, number: '12', merchant_id: 3 },
      { id: 202, number: '14', merchant_id: 3 },
      { id: 205, number: 'VIP-1', merchant_id: 1 },
    ];

    it('passes when table_id belongs to the active merchant', () => {
      const res = validateTableMerchantContext(201, 3, mockTables);
      expect(res.valid).toBe(true);
    });

    it('passes when table_id is null or 0', () => {
      expect(validateTableMerchantContext(null, 3, mockTables).valid).toBe(true);
      expect(validateTableMerchantContext(0, 3, mockTables).valid).toBe(true);
    });

    it('rejects table belonging to a different merchant', () => {
      const res = validateTableMerchantContext(205, 3, mockTables);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('belongs to merchant #1');
    });

    it('rejects non-existent table ID', () => {
      const res = validateTableMerchantContext(999, 3, mockTables);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('not found');
    });
  });

  describe('Lifecycle Progression & Transition Restrictions (canTransitionStatus)', () => {
    it('allows valid sequential status progression', () => {
      // PENDING -> CONFIRMED (Accept Order & route to KDS)
      expect(canTransitionStatus('PENDING', 'CONFIRMED').allowed).toBe(true);
      // PENDING -> CANCELLED (Reject Order)
      expect(canTransitionStatus('PENDING', 'CANCELLED').allowed).toBe(true);

      // CONFIRMED -> IN_PREPARATION (Cook / Kitchen Station)
      expect(canTransitionStatus('CONFIRMED', 'IN_PREPARATION').allowed).toBe(true);
      // CONFIRMED -> CANCELLED
      expect(canTransitionStatus('CONFIRMED', 'CANCELLED').allowed).toBe(true);

      // IN_PREPARATION -> DELIVERED (Serve / Table Fulfilled)
      expect(canTransitionStatus('IN_PREPARATION', 'DELIVERED').allowed).toBe(true);
      // IN_PREPARATION -> CANCELLED
      expect(canTransitionStatus('IN_PREPARATION', 'CANCELLED').allowed).toBe(true);
    });

    it('restricts invalid status transitions (e.g., cannot transition directly from DELIVERED back to PENDING)', () => {
      // Acceptance Criteria: cannot transition directly from DELIVERED back to PENDING
      const deliveredToPending = canTransitionStatus('DELIVERED', 'PENDING');
      expect(deliveredToPending.allowed).toBe(false);
      expect(deliveredToPending.reason).toContain('Cannot transition directly from DELIVERED back to PENDING');

      // Cannot transition DELIVERED to CONFIRMED or IN_PREPARATION
      expect(canTransitionStatus('DELIVERED', 'CONFIRMED').allowed).toBe(false);
      expect(canTransitionStatus('DELIVERED', 'IN_PREPARATION').allowed).toBe(false);

      // Terminal CANCELLED cannot revert
      expect(canTransitionStatus('CANCELLED', 'PENDING').allowed).toBe(false);
      expect(canTransitionStatus('CANCELLED', 'CONFIRMED').allowed).toBe(false);

      // Skipping lifecycle stages is restricted (PENDING cannot jump directly to DELIVERED)
      const skipCheck = canTransitionStatus('PENDING', 'DELIVERED');
      expect(skipCheck.allowed).toBe(false);
      expect(skipCheck.reason).toContain('Cannot transition directly from PENDING to DELIVERED');
    });

    it('disallows transitioning to identical status', () => {
      const res = canTransitionStatus('CONFIRMED', 'CONFIRMED');
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('already in CONFIRMED status');
    });
  });

  describe('Full Payload Validation', () => {
    const mockTables: TableRef[] = [{ id: 201, number: '12', merchant_id: 3 }];

    it('passes for a valid payload', () => {
      const res = validateQROrderPayload(
        {
          merchant_id: 3,
          qr_location_id: 1,
          table_id: 201,
          order_id: 5001,
          qr_order_status: 'PENDING',
          total_amount: 48.5,
          status: 'active',
        },
        { tables: mockTables }
      );
      expect(res.valid).toBe(true);
      expect(Object.keys(res.fieldErrors).length).toBe(0);
    });

    it('fails when mandatory fields are missing', () => {
      const res = validateQROrderPayload({});
      expect(res.valid).toBe(false);
      expect(res.fieldErrors.merchant_id).toBeDefined();
      expect(res.fieldErrors.qr_location_id).toBeDefined();
      expect(res.fieldErrors.order_id).toBeDefined();
      expect(res.fieldErrors.qr_order_status).toBeDefined();
      expect(res.fieldErrors.total_amount).toBeDefined();
      expect(res.fieldErrors.status).toBeDefined();
    });

    it('fails when an invalid status transition is submitted in update payload', () => {
      const res = validateQROrderPayload(
        {
          merchant_id: 3,
          qr_location_id: 1,
          order_id: 5001,
          qr_order_status: 'PENDING',
          total_amount: 48.5,
          status: 'active',
        },
        { currentStatus: 'DELIVERED' }
      );
      expect(res.valid).toBe(false);
      expect(res.fieldErrors.qr_order_status).toContain(
        'Cannot transition directly from DELIVERED back to PENDING'
      );
    });
  });

  describe('Formatters and Helpers', () => {
    it('formats badges correctly', () => {
      expect(formatQROrderBadge(42)).toBe('#QR-ORD-42');
      expect(formatPOSOrderBadge(1050)).toBe('#ORD-1050');
    });

    it('formats currency correctly', () => {
      expect(formatQROrderCurrency(48.5)).toBe('$48.50');
      expect(formatQROrderCurrency('125.75')).toBe('$125.75');
      expect(formatQROrderCurrency(0)).toBe('$0.00');
    });

    it('renders customer name or Guest Scan fallback', () => {
      expect(getCustomerDisplayName({ id: 1, name: 'Sofia Ramirez' })).toBe('Sofia Ramirez');
      expect(getCustomerDisplayName(null)).toBe('Guest Scan');
      expect(getCustomerDisplayName({ id: 2, name: '   ' })).toBe('Guest Scan');
    });

    it('provides correct next lifecycle transitions', () => {
      const pendingTransitions = getNextLifecycleStatuses('PENDING');
      expect(pendingTransitions.map((t) => t.target)).toEqual(['CONFIRMED', 'CANCELLED']);

      const prepTransitions = getNextLifecycleStatuses('IN_PREPARATION');
      expect(prepTransitions.map((t) => t.target)).toEqual(['DELIVERED', 'CANCELLED']);

      const deliveredTransitions = getNextLifecycleStatuses('DELIVERED');
      expect(deliveredTransitions).toEqual([]);
    });
  });

  describe('Order Filtering', () => {
    const orders: QROrder[] = [
      {
        id: 1,
        merchant_id: 3,
        qr_location_id: 1,
        order_id: 5001,
        qr_order_status: 'PENDING',
        total_amount: 45.0,
        status: 'active',
        customer: { id: 1, name: 'Sofia Ramirez' },
        table: { id: 201, number: '12' },
        notes: 'Extra lime please',
      },
      {
        id: 2,
        merchant_id: 3,
        qr_location_id: 2,
        order_id: 5002,
        qr_order_status: 'DELIVERED',
        total_amount: 80.0,
        status: 'active',
        customer: null,
        notes: 'Curbside pickup',
      },
    ];

    it('filters by status', () => {
      const filtered = filterQROrders(orders, {
        searchTerm: '',
        selectedStatuses: new Set(['PENDING']),
        locationId: 'ALL',
        selectedLogicalStatuses: new Set(['active']),
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(1);
    });

    it('filters by search query', () => {
      const filtered = filterQROrders(orders, {
        searchTerm: 'lime',
        selectedStatuses: new Set(['PENDING', 'DELIVERED']),
        locationId: 'ALL',
        selectedLogicalStatuses: new Set(['active']),
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].notes).toContain('Extra lime');
    });

    it('matches Guest Scan in search query', () => {
      const filtered = filterQROrders(orders, {
        searchTerm: 'Guest Scan',
        selectedStatuses: new Set(['PENDING', 'DELIVERED']),
        locationId: 'ALL',
        selectedLogicalStatuses: new Set(['active']),
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(2);
    });
  });
});
