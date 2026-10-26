import type {
  BulkReorderSectionItem,
  BulkReorderSectionsDto,
  CreateQRMenuSectionDto,
  QRMenu,
  QRMenuItem,
  QRMenuSection,
  QRMenuSectionStatus,
  UpdateQRMenuSectionDto,
} from '../types/qr-menu';
import { getAccessToken } from '../lib/auth-storage';
import { ApiError } from '../lib/api-error';
import { getQRMenus, SEED_QR_SECTIONS, SEED_QR_ITEMS } from './qr-menus';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const STORAGE_MENUS_KEY = 'x7_qr_menus_mock_db';
export const STORAGE_SECTIONS_KEY = 'x7_qr_menu_sections_mock_db';
export const STORAGE_ITEMS_KEY = 'x7_qr_menu_items_mock_db';

function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function getStoredSections(): QRMenuSection[] {
  const raw = localStorage.getItem(STORAGE_SECTIONS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // Ignore parse errors and fallback
    }
  }
  localStorage.setItem(STORAGE_SECTIONS_KEY, JSON.stringify(SEED_QR_SECTIONS));
  return SEED_QR_SECTIONS;
}

export function persistStoredSections(sections: QRMenuSection[]): void {
  localStorage.setItem(STORAGE_SECTIONS_KEY, JSON.stringify(sections));
}

function getStoredItems(): QRMenuItem[] {
  const raw = localStorage.getItem(STORAGE_ITEMS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // Ignore
    }
  }
  localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(SEED_QR_ITEMS));
  return SEED_QR_ITEMS;
}

/**
 * Get all child menu items attached to a specific section (for cascade protection)
 */
export function getSectionItems(sectionId: number): QRMenuItem[] {
  return getStoredItems().filter((item) => item.qr_menu_section_id === sectionId);
}

/**
 * Validate domain constraints for QRMenuSection
 * - Name: <= 100 characters
 * - Status: <= 50 characters
 * - qr_menu_id: non-nullable, must bind to an existing menu
 */
export function validateSectionConstraints(
  dto: {
    name?: string;
    description?: string;
    status?: string;
    qr_menu_id?: number;
    display_order?: number;
  },
  availableMenus?: QRMenu[]
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (dto.name !== undefined) {
    const trimmed = dto.name.trim();
    if (trimmed.length === 0) {
      errors.name = 'Section name is required.';
    } else if (dto.name.length > 100) {
      errors.name = `Section name must not exceed 100 characters (current: ${dto.name.length}).`;
    }
  }

  if (dto.description !== undefined) {
    const trimmed = dto.description.trim();
    if (trimmed.length === 0) {
      errors.description = 'Section description is required.';
    }
  }

  if (dto.status !== undefined) {
    const trimmed = (dto.status || '').trim();
    if (trimmed.length === 0) {
      errors.status = 'Status is required.';
    } else if (dto.status.length > 50) {
      errors.status = `Status string must not exceed 50 characters (current: ${dto.status.length}).`;
    }
  }

  if (dto.qr_menu_id !== undefined) {
    if (!dto.qr_menu_id || isNaN(dto.qr_menu_id) || dto.qr_menu_id <= 0) {
      errors.qr_menu_id = 'A valid parent QR Menu (qr_menu_id) is required.';
    } else if (availableMenus && availableMenus.length > 0) {
      const exists = availableMenus.some((m) => m.id === dto.qr_menu_id);
      if (!exists) {
        errors.qr_menu_id = `Parent QR Menu #${dto.qr_menu_id} does not exist.`;
      }
    }
  }

  if (dto.display_order !== undefined) {
    if (dto.display_order === null || isNaN(dto.display_order) || dto.display_order < 1) {
      errors.display_order = 'Display order is required and must be a positive integer greater than or equal to 1.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Fetch all QR Menu Sections
 * Relational Binding: Each section is eagerly bound to its parent QRMenu
 * Sequential Sorting: Sections are strictly ordered by display_order within parent menu scope
 */
export async function getQRMenuSections(options?: {
  qrMenuId?: number;
  merchantId?: number;
}): Promise<QRMenuSection[]> {
  const menus = await getQRMenus(options?.merchantId);
  const menuMap = new Map<number, QRMenu>(menus.map((m) => [m.id, m]));
  const storedItems = getStoredItems();
  const token = getAccessToken();

  let sections: QRMenuSection[] = [];

  if (token) {
    try {
      const query = new URLSearchParams();
      if (options?.qrMenuId) query.set('qr_menu_id', String(options.qrMenuId));
      if (options?.merchantId) query.set('merchant_id', String(options.merchantId));
      query.set('limit', '100');

      const url = `${API_BASE}/qr-menu-sections?${query.toString()}`;

      const res = await fetch(url, {
        headers: authHeaders(),
      });

      if (res.ok) {
        const json = await res.json();
        const rawList = Array.isArray(json)
          ? json
          : Array.isArray(json.data)
            ? json.data
            : [];

        if (rawList.length > 0) {
          sections = rawList.map((rawItem: unknown) => {
            const s = rawItem as Record<string, unknown>;
            const qrMenuObj = s.qrMenu as Record<string, unknown> | undefined;
            return {
              id: Number(s.id),
              qr_menu_id: Number(s.qr_menu_id || qrMenuObj?.id || s.menuId),
              name: (s.name as string) || `Section #${s.id}`,
              description: (s.description as string) || '',
              status: ((s.status as QRMenuSectionStatus) || 'active'),
              display_order: Number(s.display_order || s.displayOrder || 1),
            };
          });
          persistStoredSections(sections);
        }
      }
    } catch {
      // Continue to local storage fallback
    }
  }

  if (sections.length === 0) {
    sections = getStoredSections();
  }

  // Hydrate parent QRMenu relational binding and item counts
  const hydrated = sections.map((sec) => {
    const parentMenu = menuMap.get(sec.qr_menu_id);
    const childItems = storedItems.filter((i) => i.qr_menu_section_id === sec.id);
    return {
      ...sec,
      qrMenu: parentMenu,
      items: childItems,
      items_count: childItems.length,
    };
  });

  // Filter by menu if specified
  let result = hydrated;
  if (options?.qrMenuId) {
    result = result.filter((s) => s.qr_menu_id === options.qrMenuId);
  } else if (options?.merchantId) {
    // If merchantId provided, only return sections belonging to that merchant's menus
    const validMenuIds = new Set(menus.map((m) => m.id));
    result = result.filter((s) => validMenuIds.has(s.qr_menu_id));
  }

  // Sequential Sorting: strictly ordered by display_order within parent menu scope
  return result.sort((a, b) => {
    if (a.qr_menu_id !== b.qr_menu_id) {
      return a.qr_menu_id - b.qr_menu_id;
    }
    return a.display_order - b.display_order;
  });
}

/**
 * Fetch a single QR Menu Section by ID
 */
export async function getQRMenuSectionById(id: number): Promise<QRMenuSection> {
  const sections = await getQRMenuSections();
  const found = sections.find((s) => s.id === id);
  if (!found) {
    throw new ApiError(`QR Menu Section #${id} not found.`, 404);
  }
  return found;
}

/**
 * Create a new QRMenuSection
 * Enforces relational integrity (qr_menu_id) and field length limits (name <= 100, status <= 50)
 */
export async function createQRMenuSection(
  dto: CreateQRMenuSectionDto
): Promise<QRMenuSection> {
  const menus = await getQRMenus();
  const validation = validateSectionConstraints(
    {
      name: dto.name,
      description: dto.description,
      status: dto.status,
      qr_menu_id: dto.qr_menu_id,
      display_order: dto.display_order,
    },
    menus
  );

  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0];
    throw new ApiError(firstError, 400);
  }

  const existingSections = getStoredSections();
  const menuSections = existingSections.filter((s) => s.qr_menu_id === dto.qr_menu_id);

  // Compute default display_order if not provided or 0
  let displayOrder = dto.display_order;
  if (!displayOrder || displayOrder < 1) {
    const maxOrder = menuSections.reduce(
      (max, s) => (s.display_order > max ? s.display_order : max),
      0
    );
    displayOrder = maxOrder + 1;
  }

  const token = getAccessToken();
  let createdSection: QRMenuSection | null = null;

  if (token) {
    try {
      const payload = {
        qrMenu: dto.qr_menu_id,
        qr_menu_id: dto.qr_menu_id,
        name: dto.name.trim(),
        description: dto.description?.trim() || '',
        status: dto.status || 'active',
        display_order: displayOrder,
      };

      const res = await fetch(`${API_BASE}/qr-menu-sections`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        const raw = json.data ?? json;
        if (raw?.id) {
          createdSection = {
            id: Number(raw.id),
            qr_menu_id: dto.qr_menu_id,
            name: dto.name.trim(),
            description: dto.description?.trim() || '',
            status: dto.status || 'active',
            display_order: displayOrder,
          };
        }
      } else {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.message
          ? (Array.isArray(errJson.message) ? errJson.message.join(', ') : errJson.message)
          : `Failed to create QR menu section (${res.status})`;
        throw new ApiError(errMsg, res.status);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      // Fallback to local store on offline
    }
  }

  if (!createdSection) {
    const nextId = Date.now();
    createdSection = {
      id: nextId,
      qr_menu_id: dto.qr_menu_id,
      name: dto.name.trim(),
      description: dto.description?.trim() || '',
      status: dto.status || 'active',
      display_order: displayOrder,
    };
  }

  // Persist locally
  const updated = [...existingSections, createdSection];
  persistStoredSections(updated);

  // Eagerly bind parent QRMenu
  const parentMenu = menus.find((m) => m.id === createdSection!.qr_menu_id);
  createdSection.qrMenu = parentMenu;
  createdSection.items_count = 0;

  return createdSection;
}

/**
 * Update an existing QRMenuSection
 */
export async function updateQRMenuSection(
  id: number,
  dto: UpdateQRMenuSectionDto
): Promise<QRMenuSection> {
  const menus = await getQRMenus();
  const validation = validateSectionConstraints(
    {
      name: dto.name,
      description: dto.description,
      status: dto.status,
      qr_menu_id: dto.qr_menu_id,
      display_order: dto.display_order,
    },
    menus
  );

  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0];
    throw new ApiError(firstError, 400);
  }

  const existingSections = getStoredSections();
  const index = existingSections.findIndex((s) => s.id === id);
  if (index === -1) {
    throw new ApiError(`QR Menu Section #${id} not found.`, 404);
  }

  const current = existingSections[index];
  const targetMenuId = dto.qr_menu_id !== undefined ? dto.qr_menu_id : current.qr_menu_id;

  const updatedRecord: QRMenuSection = {
    ...current,
    qr_menu_id: targetMenuId,
    name: dto.name !== undefined ? dto.name.trim() : current.name,
    description: dto.description !== undefined ? dto.description.trim() : current.description,
    status: dto.status !== undefined ? dto.status : current.status,
    display_order: dto.display_order !== undefined ? dto.display_order : current.display_order,
  };

  const token = getAccessToken();
  if (token) {
    try {
      await fetch(`${API_BASE}/qr-menu-sections/${id}`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify({
          qr_menu_id: updatedRecord.qr_menu_id,
          name: updatedRecord.name,
          description: updatedRecord.description,
          status: updatedRecord.status,
          display_order: updatedRecord.display_order,
        }),
      });
    } catch {
      // Continue to local mock persistence
    }
  }

  existingSections[index] = updatedRecord;
  persistStoredSections(existingSections);

  const parentMenu = menus.find((m) => m.id === updatedRecord.qr_menu_id);
  const items = getStoredItems().filter((i) => i.qr_menu_section_id === id);

  return {
    ...updatedRecord,
    qrMenu: parentMenu,
    items_count: items.length,
  };
}

/**
 * Delete / Archive a QR Menu Section
 */
export async function deleteQRMenuSection(id: number): Promise<void> {
  const token = getAccessToken();
  if (token) {
    try {
      await fetch(`${API_BASE}/qr-menu-sections/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    } catch {
      // Continue
    }
  }

  const existing = getStoredSections();
  const filtered = existing.filter((s) => s.id !== id);
  persistStoredSections(filtered);
}

/**
 * Bulk reorder QR Menu Sections sequentially within parent menu scope
 * Sends single atomic payload for display_order attributes
 */
export async function bulkReorderQRMenuSections(
  qrMenuId: number,
  orderedSectionIds: number[]
): Promise<QRMenuSection[]> {
  const allSections = getStoredSections();
  const orderMap = new Map<number, number>();
  orderedSectionIds.forEach((id, index) => {
    orderMap.set(id, index + 1);
  });

  const updated = allSections.map((s) => {
    if (s.qr_menu_id === qrMenuId && orderMap.has(s.id)) {
      return {
        ...s,
        display_order: orderMap.get(s.id)!,
      };
    }
    return s;
  });

  persistStoredSections(updated);

  const sectionsPayload: BulkReorderSectionItem[] = orderedSectionIds.map((id, index) => ({
    id,
    display_order: index + 1,
  }));

  const token = getAccessToken();
  if (token) {
    try {
      const payload: BulkReorderSectionsDto = {
        qr_menu_id: qrMenuId,
        sections: sectionsPayload,
        sectionIds: orderedSectionIds,
      };

      // Try bulk-reorder endpoint first
      const res = await fetch(`${API_BASE}/qr-menu-sections/bulk-reorder`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Fallback to menu-scoped reorder
        await fetch(`${API_BASE}/qr-menus/${qrMenuId}/sections/reorder`, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(payload),
        });
      }
    } catch {
      // Fallback to local store
    }
  }

  return getQRMenuSections({ qrMenuId });
}

/**
 * Reorder QR Menu Sections sequentially within parent menu scope (alias for bulkReorderQRMenuSections)
 */
export async function reorderQRMenuSections(
  qrMenuId: number,
  orderedSectionIds: number[]
): Promise<QRMenuSection[]> {
  return bulkReorderQRMenuSections(qrMenuId, orderedSectionIds);
}
