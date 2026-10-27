import type {
  CreateQRMenuDto,
  QRMenu,
  QRMenuDesignTheme,
  QRMenuItem,
  QRMenuSection,
  QRMenuStatus,
  QRMenuType,
} from '../types/qr-menu';
import { DESIGN_THEMES, QR_MENU_STATUSES, QR_MENU_TYPES } from '../types/qr-menu';

export interface ValidationResult {
  isValid: boolean;
  fieldErrors: Record<string, string>;
}

/**
 * Validates QR Menu form payload against business rules and acceptance criteria:
 * - name: required, max 100 chars
 * - description: required
 * - status: required, must be 'active' | 'inactive' | 'archived'
 * - design_theme: required, max 100 chars
 * - qr_type: required, enum QRMenuType ('Table' | 'Pickup' | 'Delivery')
 */
export function validateQRMenuPayload(payload: Partial<CreateQRMenuDto>): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  // 1. Menu Name
  const trimmedName = (payload.name ?? '').trim();
  if (!trimmedName) {
    fieldErrors.name = 'Menu name is required.';
  } else if (trimmedName.length > 100) {
    fieldErrors.name = 'Menu name cannot exceed 100 characters.';
  }

  // 2. Menu Description
  const trimmedDescription = (payload.description ?? '').trim();
  if (!trimmedDescription) {
    fieldErrors.description = 'Menu description is required.';
  }

  // 3. Status Selector
  if (!payload.status) {
    fieldErrors.status = 'Status is required.';
  } else if (!QR_MENU_STATUSES.includes(payload.status as QRMenuStatus)) {
    fieldErrors.status = `Status must be one of: ${QR_MENU_STATUSES.join(', ')}.`;
  }

  // 4. Design Theme Picker
  const trimmedTheme = (payload.design_theme ?? '').trim();
  if (!trimmedTheme) {
    fieldErrors.design_theme = 'Design theme is required.';
  } else if (trimmedTheme.length > 100) {
    fieldErrors.design_theme = 'Design theme cannot exceed 100 characters.';
  }

  // 5. QR Type Dropdown
  if (!payload.qr_type) {
    fieldErrors.qr_type = 'QR type is required.';
  } else if (!QR_MENU_TYPES.includes(payload.qr_type as QRMenuType)) {
    fieldErrors.qr_type = `QR type must be one of: ${QR_MENU_TYPES.join(', ')}.`;
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

/**
 * Retrieves the design theme definition by ID or Name, falling back to Texas Theme or first theme.
 */
export function getThemeConfig(themeIdOrName?: string): QRMenuDesignTheme {
  if (!themeIdOrName) return DESIGN_THEMES[0];
  const found = DESIGN_THEMES.find(
    (t) =>
      t.id.toLowerCase() === themeIdOrName.toLowerCase() ||
      t.name.toLowerCase() === themeIdOrName.toLowerCase()
  );
  return (
    found || {
      id: themeIdOrName,
      name: themeIdOrName,
      category: 'Custom Brand Theme',
      description: 'Custom merchant branding configuration.',
      primaryColor: '#b45309',
      secondaryColor: '#78350f',
      accentColor: '#f59e0b',
      backgroundColor: '#fffbeb',
      cardBackground: '#ffffff',
      textColor: '#451a03',
      mutedTextColor: '#92400e',
      headerBackground: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
      badgeStyle: 'bg-amber-100 text-amber-900 border-amber-300',
      fontFamily: 'sans-serif',
      tag: 'Custom',
    }
  );
}

/**
 * Generates an appropriate default duplicate name e.g. "Lunch Menu (Variant)" or "Lunch Menu (Copy)"
 */
export function generateDuplicateMenuName(originalName: string): string {
  const clean = originalName.replace(/\s*\((Copy|\d+|Variant)\)$/i, '').trim();
  return `${clean} (Copy)`;
}

export interface ClonedMenuRelationalResult {
  newMenu: QRMenu;
  newSections: QRMenuSection[];
  newItems: QRMenuItem[];
}

/**
 * Duplication Pipeline Engine:
 * Clones parent menu attributes while maintaining the complete relational structure
 * for underlying sections (qr_menu_section) and items (qr_menu_item).
 * 
 * Re-maps:
 * - New Menu ID
 * - Cloned sections link to the new Menu ID
 * - Cloned items link to their respective cloned section ID
 */
export function cloneMenuRelationalStructure(
  sourceMenu: QRMenu,
  overrides: {
    name?: string;
    description?: string;
    status?: QRMenuStatus;
    design_theme?: string;
    qr_type?: QRMenuType;
    merchant_id?: number;
  },
  existingSections: QRMenuSection[],
  existingItems: QRMenuItem[],
  idGenerator: () => number = () => Date.now() + Math.floor(Math.random() * 1000)
): ClonedMenuRelationalResult {
  const newMenuId = idGenerator();
  const targetMerchantId = overrides.merchant_id ?? sourceMenu.merchant_id;

  const newMenu: QRMenu = {
    id: newMenuId,
    merchant_id: targetMerchantId,
    name: (overrides.name?.trim() || generateDuplicateMenuName(sourceMenu.name)).slice(0, 100),
    description: overrides.description?.trim() ?? sourceMenu.description,
    status: overrides.status ?? 'inactive', // New cloned variants typically start inactive/draft
    design_theme: overrides.design_theme ?? sourceMenu.design_theme,
    qr_type: overrides.qr_type ?? sourceMenu.qr_type,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    merchant: sourceMenu.merchant,
  };

  // Find all sections belonging to the source menu
  const parentSections = existingSections.filter((s) => s.qr_menu_id === sourceMenu.id);

  const newSections: QRMenuSection[] = [];
  const newItems: QRMenuItem[] = [];

  // Mapping from old section ID to new section ID for relational item linking
  const sectionIdMap = new Map<number, number>();

  // 1. Clone each section
  parentSections.forEach((oldSection, secIndex) => {
    const newSectionId = idGenerator() + secIndex + 1;
    sectionIdMap.set(oldSection.id, newSectionId);

    const clonedSection: QRMenuSection = {
      id: newSectionId,
      qr_menu_id: newMenuId,
      name: oldSection.name,
      description: oldSection.description,
      status: oldSection.status,
      display_order: oldSection.display_order,
    };
    newSections.push(clonedSection);
  });

  // 2. Clone each item linked to the sections
  let itemCounter = 0;
  existingItems.forEach((oldItem) => {
    const targetSectionId = sectionIdMap.get(oldItem.qr_menu_section_id);
    if (targetSectionId !== undefined) {
      itemCounter++;
      const newItemId = idGenerator() + 100 + itemCounter;
      const clonedItem: QRMenuItem = {
        ...oldItem,
        id: newItemId,
        qr_menu_section_id: targetSectionId,
      };
      newItems.push(clonedItem);
    }
  });

  // Attach counts to the newly created menu object for convenience
  newMenu.sections = newSections;
  newMenu.sections_count = newSections.length;
  newMenu.items_count = newItems.length;

  return {
    newMenu,
    newSections,
    newItems,
  };
}
