import { describe, expect, it, beforeEach, } from 'vitest';
import {
  validateSectionConstraints,
  getQRMenuSections,
  createQRMenuSection,
  updateQRMenuSection,
  deleteQRMenuSection,
  bulkReorderQRMenuSections,
  getSectionItems,
  STORAGE_SECTIONS_KEY,
  STORAGE_ITEMS_KEY,
} from './qr-menu-sections';
import type { QRMenu, QRMenuItem, QRMenuSection } from '../types/qr-menu';

describe('QRMenuSection API & Validation Layer', () => {
  const mockMenus: QRMenu[] = [
    {
      id: 101,
      merchant_id: 3,
      name: 'Main Dinner Menu',
      description: 'Steaks and cocktails',
      status: 'active',
      design_theme: 'Texas Theme',
      qr_type: 'Table',
    },
    {
      id: 102,
      merchant_id: 3,
      name: 'Lunch Express Menu',
      description: 'Quick lunch combos',
      status: 'active',
      design_theme: 'Modern Elegance',
      qr_type: 'Table',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  describe('Relational Integrity & Form Validation', () => {
    it('validates relational constraint: requires a non-null valid qr_menu_id binding', () => {
      // Missing or zero qr_menu_id
      const resMissing = validateSectionConstraints({
        name: 'Appetizers',
        description: 'Starter plates',
        status: 'active',
        qr_menu_id: 0,
      }, mockMenus);
      expect(resMissing.valid).toBe(false);
      expect(resMissing.errors.qr_menu_id).toBeDefined();

      // Non-existent menu ID
      const resNonExistent = validateSectionConstraints({
        name: 'Appetizers',
        description: 'Starter plates',
        status: 'active',
        qr_menu_id: 9999,
      }, mockMenus);
      expect(resNonExistent.valid).toBe(false);
      expect(resNonExistent.errors.qr_menu_id).toContain('does not exist');

      // Valid existing menu ID
      const resValid = validateSectionConstraints({
        name: 'Appetizers',
        description: 'Starter plates',
        status: 'active',
        qr_menu_id: 101,
      }, mockMenus);
      expect(resValid.valid).toBe(true);
    });

    it('enforces string length constraint on name (<= 100 characters) and requires non-empty name', () => {
      // Empty name
      const resEmpty = validateSectionConstraints({
        name: '   ',
        description: 'Valid desc',
        qr_menu_id: 101,
      }, mockMenus);
      expect(resEmpty.valid).toBe(false);
      expect(resEmpty.errors.name).toBe('Section name is required.');

      // Exactly 100 chars
      const name100 = 'A'.repeat(100);
      const res100 = validateSectionConstraints({
        name: name100,
        description: 'Valid desc',
        qr_menu_id: 101,
      }, mockMenus);
      expect(res100.valid).toBe(true);

      // 101 chars - rejected
      const name101 = 'A'.repeat(101);
      const res101 = validateSectionConstraints({
        name: name101,
        description: 'Valid desc',
        qr_menu_id: 101,
      }, mockMenus);
      expect(res101.valid).toBe(false);
      expect(res101.errors.name).toContain('must not exceed 100 characters');
    });

    it('validates required description input', () => {
      // Missing / empty description
      const resEmptyDesc = validateSectionConstraints({
        name: 'Appetizers',
        description: '   ',
        qr_menu_id: 101,
      }, mockMenus);
      expect(resEmptyDesc.valid).toBe(false);
      expect(resEmptyDesc.errors.description).toBe('Section description is required.');

      // Valid description
      const resValidDesc = validateSectionConstraints({
        name: 'Appetizers',
        description: 'Handcrafted seasonal starter plates',
        qr_menu_id: 101,
      }, mockMenus);
      expect(resValidDesc.valid).toBe(true);
    });

    it('enforces status constraint (required and <= 50 characters)', () => {
      // Empty status
      const resEmptyStatus = validateSectionConstraints({
        name: 'Beverages',
        description: 'Craft drinks',
        status: '   ',
        qr_menu_id: 101,
      }, mockMenus);
      expect(resEmptyStatus.valid).toBe(false);
      expect(resEmptyStatus.errors.status).toBe('Status is required.');

      // Valid status
      const resValidStatus = validateSectionConstraints({
        name: 'Beverages',
        description: 'Craft drinks',
        status: 'active',
        qr_menu_id: 101,
      }, mockMenus);
      expect(resValidStatus.valid).toBe(true);

      // Exceeding 50 characters
      const longStatus = 'S'.repeat(51);
      const resLongStatus = validateSectionConstraints({
        name: 'Beverages',
        description: 'Craft drinks',
        status: longStatus,
        qr_menu_id: 101,
      }, mockMenus);
      expect(resLongStatus.valid).toBe(false);
      expect(resLongStatus.errors.status).toContain('must not exceed 50 characters');
    });

    it('validates display_order is an integer greater than or equal to 1', () => {
      const resInvalid = validateSectionConstraints({
        name: 'Desserts',
        description: 'Sweet treats',
        qr_menu_id: 101,
        display_order: 0,
      }, mockMenus);
      expect(resInvalid.valid).toBe(false);
      expect(resInvalid.errors.display_order).toContain('greater than or equal to 1');
    });
  });

  describe('CRUD Operations & Cascade Protection', () => {
    it('creates a new section, binds it eagerly to parent QRMenu, and calculates display_order', async () => {
      const initialSections: QRMenuSection[] = [
        {
          id: 501,
          qr_menu_id: 101,
          name: 'Starters',
          description: 'Small bites',
          status: 'active',
          display_order: 1,
        },
      ];
      localStorage.setItem(STORAGE_SECTIONS_KEY, JSON.stringify(initialSections));

      const created = await createQRMenuSection({
        qr_menu_id: 101,
        name: 'Main Courses',
        description: 'Prime cuts and signature plates',
        status: 'active',
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe('Main Courses');
      expect(created.qr_menu_id).toBe(101);
      expect(created.display_order).toBe(2); // Auto-incremented to 2
      expect(created.qrMenu?.id).toBe(101);
    });

    it('throws ApiError if required relational binding qr_menu_id is missing on creation', async () => {
      await expect(
        createQRMenuSection({
          qr_menu_id: 0,
          name: 'Invalid Section',
          description: 'Description',
          status: 'active',
        })
      ).rejects.toThrow('A valid parent QR Menu (qr_menu_id) is required.');
    });

    it('returns attached child items via getSectionItems for cascade protection verification', () => {
      const mockItems: QRMenuItem[] = [
        {
          id: 9001,
          qr_menu_section_id: 501,
          product_name: 'Cowboy Ribeye (18oz)',
          price: 48.0,
          status: 'active',
          display_order: 1,
          is_visible: true,
        },
        {
          id: 9002,
          qr_menu_section_id: 501,
          product_name: 'Smoked Brisket Platter',
          price: 29.5,
          status: 'active',
          display_order: 2,
          is_visible: true,
        },
        {
          id: 9003,
          qr_menu_section_id: 502,
          product_name: 'Old Fashioned',
          price: 16.0,
          status: 'active',
          display_order: 1,
          is_visible: true,
        },
      ];
      localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(mockItems));

      const section501Items = getSectionItems(501);
      expect(section501Items).toHaveLength(2);
      expect(section501Items[0].product_name).toBe('Cowboy Ribeye (18oz)');
      expect(section501Items[1].product_name).toBe('Smoked Brisket Platter');

      const section502Items = getSectionItems(502);
      expect(section502Items).toHaveLength(1);
    });

    it('updates an existing section and validates constraints', async () => {
      const seed: QRMenuSection[] = [
        {
          id: 501,
          qr_menu_id: 101,
          name: 'Old Name',
          description: 'Old desc',
          status: 'inactive',
          display_order: 1,
        },
      ];
      localStorage.setItem(STORAGE_SECTIONS_KEY, JSON.stringify(seed));

      const updated = await updateQRMenuSection(501, {
        name: 'Artisan Wood-Fired Mains',
        description: 'Updated description',
        status: 'active',
      });

      expect(updated.name).toBe('Artisan Wood-Fired Mains');
      expect(updated.description).toBe('Updated description');
      expect(updated.status).toBe('active');
    });

    it('deletes a section from storage', async () => {
      const seed: QRMenuSection[] = [
        {
          id: 501,
          qr_menu_id: 101,
          name: 'To be deleted',
          description: 'Desc',
          status: 'archived',
          display_order: 1,
        },
      ];
      localStorage.setItem(STORAGE_SECTIONS_KEY, JSON.stringify(seed));

      await deleteQRMenuSection(501);
      const remaining = await getQRMenuSections();
      expect(remaining.some((s) => s.id === 501)).toBe(false);
    });
  });

  describe('Bulk Reorder Sync & Drag-and-Drop Sequencing', () => {
    it('executes atomic bulk reorder updating display_order sequences (1, 2, 3...) for sibling sections', async () => {
      const seed: QRMenuSection[] = [
        { id: 10, qr_menu_id: 101, name: 'A', description: 'Desc A', status: 'active', display_order: 1 },
        { id: 20, qr_menu_id: 101, name: 'B', description: 'Desc B', status: 'active', display_order: 2 },
        { id: 30, qr_menu_id: 101, name: 'C', description: 'Desc C', status: 'active', display_order: 3 },
      ];
      localStorage.setItem(STORAGE_SECTIONS_KEY, JSON.stringify(seed));

      // Reorder atomically to: 30, 10, 20
      const reordered = await bulkReorderQRMenuSections(101, [30, 10, 20]);
      expect(reordered.find((s) => s.id === 30)?.display_order).toBe(1);
      expect(reordered.find((s) => s.id === 10)?.display_order).toBe(2);
      expect(reordered.find((s) => s.id === 20)?.display_order).toBe(3);
    });
  });
});
