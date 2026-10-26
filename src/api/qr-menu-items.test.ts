import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateItemPricePrecision,
  formatItemPrice,
  getItemDisplayName,
  validateItemConstraints,
  hydrateItemRelations,
  getQRMenuItems,
  getQRMenuItemById,
  createQRMenuItem,
  updateQRMenuItem,
  toggleQRMenuItemAvailability,
  deleteQRMenuItem,
  STORAGE_ITEMS_KEY,
  STORAGE_POS_PRODUCTS_KEY,
  INITIAL_QR_ITEMS,
  SEED_POS_PRODUCTS,
} from './qr-menu-items';
import type { QRMenuItem, QRMenuItemStatus, QRMenuSection } from '../types/qr-menu';

describe('QRMenuItem API & Precision Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(INITIAL_QR_ITEMS));
    localStorage.setItem(STORAGE_POS_PRODUCTS_KEY, JSON.stringify(SEED_POS_PRODUCTS));
    vi.restoreAllMocks();
  });

  describe('Financial Precision Enforcement (precision: 12, scale: 2)', () => {
    it('accepts integer and 2-decimal monetary values', () => {
      expect(validateItemPricePrecision(0).valid).toBe(true);
      expect(validateItemPricePrecision('0.00').valid).toBe(true);
      expect(validateItemPricePrecision(29.5).valid).toBe(true);
      expect(validateItemPricePrecision('29.50').valid).toBe(true);
      expect(validateItemPricePrecision(199.99).valid).toBe(true);
      expect(validateItemPricePrecision(48).normalizedPrice).toBe(48.0);
    });

    it('rejects values with more than 2 decimal places (scale: 2)', () => {
      const result = validateItemPricePrecision('14.999');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed 2 decimal places');
    });

    it('rejects negative prices', () => {
      const result = validateItemPricePrecision(-10);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be negative');
    });

    it('rejects non-numeric values', () => {
      const result = validateItemPricePrecision('invalid_price');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
    });

    it('rejects prices exceeding max precision (10 integer digits)', () => {
      const result = validateItemPricePrecision('12345678901.50');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowable precision');
    });

    it('formats prices correctly in standard monospace display', () => {
      expect(formatItemPrice(0)).toBe('$0.00');
      expect(formatItemPrice(29.5)).toBe('$29.50');
      expect(formatItemPrice('48')).toBe('$48.00');
      expect(formatItemPrice(1234.56)).toBe('$1,234.56');
    });
  });

  describe('Domain Constraints Validation', () => {
    const mockSections: QRMenuSection[] = [
      { id: 501, qr_menu_id: 101, name: 'Chef Steaks', description: 'Steaks', status: 'active', display_order: 1 },
    ];

    it('validates required name and max 100 characters', () => {
      const emptyName = validateItemConstraints({ name: '   ', qr_menu_section_id: 501, price: 10 });
      expect(emptyName.valid).toBe(false);
      expect(emptyName.errors.name).toContain('required');

      const longName = validateItemConstraints({ name: 'A'.repeat(101), qr_menu_section_id: 501, price: 10 });
      expect(longName.valid).toBe(false);
      expect(longName.errors.name).toContain('100 characters');

      const validName = validateItemConstraints({ name: 'Truffle Smash Burger', qr_menu_section_id: 501, price: 10 });
      expect(validName.valid).toBe(true);
    });

    it('validates section relational existence', () => {
      const invalidSection = validateItemConstraints(
        { name: 'Burger', qr_menu_section_id: 999, price: 10 },
        { availableSections: mockSections }
      );
      expect(invalidSection.valid).toBe(false);
      expect(invalidSection.errors.qr_menu_section_id).toContain('does not exist');

      const validSection = validateItemConstraints(
        { name: 'Burger', qr_menu_section_id: 501, price: 10 },
        { availableSections: mockSections }
      );
      expect(validSection.valid).toBe(true);
    });

    it('validates status values (active, inactive, archived)', () => {
      const invalidStatus = validateItemConstraints({ status: 'unknown' as unknown as QRMenuItemStatus });
      expect(invalidStatus.valid).toBe(false);
      expect(invalidStatus.errors.status).toContain('Status must be one of');

      const validStatus = validateItemConstraints({ status: 'active' });
      expect(validStatus.valid).toBe(true);
    });
  });

  describe('Relational Hydration (Merchant, Section, POS Product)', () => {
    it('correctly resolves linked section and mapped POS product', () => {
      const mockItem: QRMenuItem = {
        id: 9001,
        merchant_id: 3,
        qr_menu_section_id: 501,
        product_id: 1,
        name: 'Bone-In Cowboy Ribeye',
        price: 48.0,
        display_order: 1,
        status: 'active',
      };

      const hydrated = hydrateItemRelations(mockItem);
      expect(hydrated.merchant?.id).toBe(3);
      expect(hydrated.qrMenuSection).toBeDefined();
      expect(hydrated.qrMenuSection?.id).toBe(501);
      expect(hydrated.product).toBeDefined();
      expect(hydrated.product?.id).toBe(1);
      expect(hydrated.product?.sku).toBe('POS-STEAK-001');
    });

    it('correctly handles standalone QR items without POS product (product_id: null)', () => {
      const standaloneItem: QRMenuItem = {
        id: 9009,
        merchant_id: 3,
        qr_menu_section_id: 504,
        product_id: null,
        name: 'Parmesan Truffle Loaded Fries',
        price: 9.75,
        display_order: 2,
        status: 'active',
      };

      const hydrated = hydrateItemRelations(standaloneItem);
      expect(hydrated.product).toBeNull();
      expect(getItemDisplayName(hydrated)).toBe('Parmesan Truffle Loaded Fries');
    });
  });

  describe('Instant Real-time Stock Availability Toggle (86 / In Stock)', () => {
    it('toggles is_available instantly without corrupting other attributes', async () => {
      localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(INITIAL_QR_ITEMS));

      // Item 9001 starts as is_available: true
      const itemBefore = await getQRMenuItemById(9001);
      expect(itemBefore.is_available).toBe(true);

      // Toggle to 86'd / Out of Stock
      const updated86 = await toggleQRMenuItemAvailability(9001, false);
      expect(updated86.id).toBe(9001);
      expect(updated86.is_available).toBe(false);

      // Verify in local persistence
      const reloaded = await getQRMenuItemById(9001);
      expect(reloaded.is_available).toBe(false);

      // Toggle back to Available
      const updatedBack = await toggleQRMenuItemAvailability(9001, true);
      expect(updatedBack.is_available).toBe(true);
    });
  });

  describe('CRUD Lifecycle Operations', () => {
    it('creates a new item and calculates display order automatically', async () => {
      const created = await createQRMenuItem({
        merchant_id: 3,
        qr_menu_section_id: 501,
        name: 'Smoked Wagyu Short Ribs',
        description: 'Slow braised in dark stout and molasses.',
        price: 36.5,
        status: 'active',
      });

      expect(created.id).toBeGreaterThan(9000);
      expect(created.name).toBe('Smoked Wagyu Short Ribs');
      expect(created.price).toBe(36.5);
      expect(created.display_order).toBeGreaterThanOrEqual(1);
      expect(created.is_available).toBe(true);
      expect(created.status).toBe('active');
    });

    it('updates an existing item with precision enforcement', async () => {
      const updated = await updateQRMenuItem(9002, {
        name: 'Texas Oak Smoked Brisket Platter (Large)',
        price: 34.0,
      });

      expect(updated.id).toBe(9002);
      expect(updated.name).toBe('Texas Oak Smoked Brisket Platter (Large)');
      expect(updated.price).toBe(34.0);
    });

    it('deletes an item successfully', async () => {
      const result = await deleteQRMenuItem(9008);
      expect(result.success).toBe(true);
      expect(result.id).toBe(9008);

      await expect(getQRMenuItemById(9008)).rejects.toThrow();
    });

    it('filters items by menu and section', async () => {
      localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(INITIAL_QR_ITEMS));
      const section501Items = await getQRMenuItems({ sectionId: 501 });
      expect(section501Items.length).toBeGreaterThan(0);
      section501Items.forEach((it) => {
        expect(it.qr_menu_section_id).toBe(501);
      });
    });
  });
});
