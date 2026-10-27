import { describe, expect, it } from 'vitest';
import {
  cloneMenuRelationalStructure,
  generateDuplicateMenuName,
  getThemeConfig,
  validateQRMenuPayload,
} from './qr-menu';
import type { QRMenu, QRMenuItem, QRMenuSection } from '../types/qr-menu';

describe('QR Menu Domain Logic & Business Rules', () => {
  describe('Form Validation (validateQRMenuPayload)', () => {
    it('validates a completely valid QR Menu payload successfully', () => {
      const validPayload = {
        name: 'Summer Cocktail & Tapas Menu',
        description: 'Refreshing signature drinks and artisanal appetizers for our terrace guests.',
        status: 'active' as const,
        design_theme: 'Midnight Bistro',
        qr_type: 'Table' as const,
      };

      const result = validateQRMenuPayload(validPayload);
      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toEqual({});
    });

    it('enforces required fields (name, description, status, design_theme, qr_type)', () => {
      const emptyPayload = {};

      const result = validateQRMenuPayload(emptyPayload);
      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.name).toBe('Menu name is required.');
      expect(result.fieldErrors.description).toBe('Menu description is required.');
      expect(result.fieldErrors.status).toBe('Status is required.');
      expect(result.fieldErrors.design_theme).toBe('Design theme is required.');
      expect(result.fieldErrors.qr_type).toBe('QR type is required.');
    });

    it('enforces max 100 chars limit on menu name', () => {
      const longName = 'A'.repeat(101);
      const result = validateQRMenuPayload({
        name: longName,
        description: 'Valid overview',
        status: 'active',
        design_theme: 'Texas Theme',
        qr_type: 'Table',
      });

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.name).toBe('Menu name cannot exceed 100 characters.');
    });

    it('enforces max 100 chars limit on design_theme', () => {
      const longTheme = 'Theme-'.repeat(25); // > 100 chars
      const result = validateQRMenuPayload({
        name: 'Lunch Menu',
        description: 'Valid overview',
        status: 'active',
        design_theme: longTheme,
        qr_type: 'Table',
      });

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.design_theme).toBe('Design theme cannot exceed 100 characters.');
    });

    it('validates status selector values: active, inactive, archived', () => {
      const invalidStatus = validateQRMenuPayload({
        name: 'Menu',
        description: 'Desc',
        status: 'unknown_status' as unknown as 'active',
        design_theme: 'Texas Theme',
        qr_type: 'Table',
      });
      expect(invalidStatus.isValid).toBe(false);
      expect(invalidStatus.fieldErrors.status).toContain('Status must be one of');

      (['active', 'inactive', 'archived'] as const).forEach((validStatus) => {
        const res = validateQRMenuPayload({
          name: 'Menu',
          description: 'Desc',
          status: validStatus,
          design_theme: 'Texas Theme',
          qr_type: 'Table',
        });
        expect(res.fieldErrors.status).toBeUndefined();
      });
    });

    it('validates qr_type enum picker: Table, Pickup, Delivery', () => {
      const invalidType = validateQRMenuPayload({
        name: 'Menu',
        description: 'Desc',
        status: 'active',
        design_theme: 'Texas Theme',
        qr_type: 'INVALID' as unknown as 'Table',
      });
      expect(invalidType.isValid).toBe(false);
      expect(invalidType.fieldErrors.qr_type).toContain('QR type must be one of');

      (['Table', 'Pickup', 'Delivery'] as const).forEach((validType) => {
        const res = validateQRMenuPayload({
          name: 'Menu',
          description: 'Desc',
          status: 'active',
          design_theme: 'Texas Theme',
          qr_type: validType,
        });
        expect(res.fieldErrors.qr_type).toBeUndefined();
      });
    });
  });

  describe('Theme Configuration (getThemeConfig)', () => {
    it('returns rich theme configuration for Texas Theme', () => {
      const theme = getThemeConfig('Texas Theme');
      expect(theme.id).toBe('Texas Theme');
      expect(theme.primaryColor).toBe('#b45309');
      expect(theme.fontFamily).toBe('serif');
    });

    it('returns rich theme configuration for Modern Elegance and Midnight Bistro', () => {
      const elegance = getThemeConfig('Modern Elegance');
      expect(elegance.primaryColor).toBe('#c59b27');

      const bistro = getThemeConfig('Midnight Bistro');
      expect(bistro.primaryColor).toBe('#8b5cf6');
    });

    it('provides fallback configuration for unknown or custom theme string', () => {
      const custom = getThemeConfig('Retro Neon 80s');
      expect(custom.id).toBe('Retro Neon 80s');
      expect(custom.primaryColor).toBeDefined();
    });
  });

  describe('Menu Duplication Pipeline (cloneMenuRelationalStructure)', () => {
    const parentMenu: QRMenu = {
      id: 101,
      merchant_id: 3,
      name: 'Lunch Express Menu',
      description: 'Quick midday specials and combos.',
      status: 'active',
      design_theme: 'Texas Theme',
      qr_type: 'Table',
      merchant: { id: 3, name: 'Bistro Downtown' },
    };

    const mockSections: QRMenuSection[] = [
      {
        id: 501,
        qr_menu_id: 101,
        name: 'Sandwiches & Wraps',
        description: 'Served with crispy fries or salad',
        status: 'active',
        display_order: 1,
      },
      {
        id: 502,
        qr_menu_id: 101,
        name: 'Beverages',
        description: 'Fresh lemonades and sodas',
        status: 'active',
        display_order: 2,
      },
      {
        id: 999, // Unrelated section belonging to another menu
        qr_menu_id: 202,
        name: 'Dinner Steaks',
        description: 'Not part of lunch menu',
        status: 'active',
        display_order: 1,
      },
    ];

    const mockItems: QRMenuItem[] = [
      {
        id: 9001,
        qr_menu_section_id: 501,
        product_id: 10,
        product_name: 'Smoked Turkey Club',
        price: 14.5,
        status: 'active',
        display_order: 1,
        notes: 'Extra bacon optional',
        is_visible: true,
      },
      {
        id: 9002,
        qr_menu_section_id: 501,
        product_id: 11,
        product_name: 'Crispy Falafel Wrap',
        price: 13.0,
        status: 'active',
        display_order: 2,
        notes: 'Vegan tahini dressing',
        is_visible: true,
      },
      {
        id: 9003,
        qr_menu_section_id: 502,
        product_id: 20,
        product_name: 'Sparkling Mint Lemonade',
        price: 4.5,
        status: 'active',
        display_order: 1,
        is_visible: true,
      },
      {
        id: 9099, // Belongs to section 999
        qr_menu_section_id: 999,
        product_id: 30,
        product_name: 'Prime Ribeye',
        price: 38.0,
        status: 'active',
        display_order: 1,
        is_visible: true,
      },
    ];

    it('generates standard copy name when none specified', () => {
      expect(generateDuplicateMenuName('Lunch Express Menu')).toBe('Lunch Express Menu (Copy)');
      expect(generateDuplicateMenuName('Lunch Express Menu (Copy)')).toBe('Lunch Express Menu (Copy)');
    });

    it('duplicates parent menu attributes and creates independent relational structure for sections and items', () => {
      let mockIdCounter = 1000;
      const idGen = () => ++mockIdCounter;

      const result = cloneMenuRelationalStructure(
        parentMenu,
        {
          name: 'Happy Hour Specials Menu',
          status: 'inactive',
          design_theme: 'Midnight Bistro',
        },
        mockSections,
        mockItems,
        idGen
      );

      // 1. Cloned Menu attributes
      expect(result.newMenu.id).not.toBe(parentMenu.id);
      expect(result.newMenu.name).toBe('Happy Hour Specials Menu');
      expect(result.newMenu.description).toBe(parentMenu.description);
      expect(result.newMenu.status).toBe('inactive');
      expect(result.newMenu.design_theme).toBe('Midnight Bistro');
      expect(result.newMenu.qr_type).toBe('Table');
      expect(result.newMenu.merchant_id).toBe(3);

      // 2. Cloned Sections
      expect(result.newSections.length).toBe(2);
      expect(result.newSections.map((s) => s.name)).toEqual(['Sandwiches & Wraps', 'Beverages']);

      result.newSections.forEach((clonedSection) => {
        expect(clonedSection.qr_menu_id).toBe(result.newMenu.id);
        expect(clonedSection.id).not.toBe(501);
        expect(clonedSection.id).not.toBe(502);
      });

      // 3. Cloned Items
      expect(result.newItems.length).toBe(3);

      // Sandwiches section items
      const clonedSandwichesSection = result.newSections.find((s) => s.name === 'Sandwiches & Wraps')!;
      const sandwichesItems = result.newItems.filter(
        (i) => i.qr_menu_section_id === clonedSandwichesSection.id
      );
      expect(sandwichesItems.length).toBe(2);
      expect(sandwichesItems.map((i) => i.product_name)).toEqual([
        'Smoked Turkey Club',
        'Crispy Falafel Wrap',
      ]);

      // Beverages section items
      const clonedBeveragesSection = result.newSections.find((s) => s.name === 'Beverages')!;
      const beveragesItems = result.newItems.filter(
        (i) => i.qr_menu_section_id === clonedBeveragesSection.id
      );
      expect(beveragesItems.length).toBe(1);
      expect(beveragesItems[0].product_name).toBe('Sparkling Mint Lemonade');

      // Unrelated items were NOT cloned
      expect(result.newItems.some((i) => i.product_name === 'Prime Ribeye')).toBe(false);
    });
  });
});
