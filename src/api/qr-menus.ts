import type {
  CloneQRMenuDto,
  CreateQRMenuDto,
  QRMenu,
  QRMenuItem,
  QRMenuSection,
  QRMenuStatus,
  QRMenuType,
  UpdateQRMenuDto,
} from '../types/qr-menu';
import { cloneMenuRelationalStructure } from '../lib/qr-menu';
import { getAccessToken } from '../lib/auth-storage';
import { ApiError } from '../lib/api-error';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

const STORAGE_MENUS_KEY = 'x7_qr_menus_mock_db';
const STORAGE_SECTIONS_KEY = 'x7_qr_menu_sections_mock_db';
const STORAGE_ITEMS_KEY = 'x7_qr_menu_items_mock_db';

function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Initial Mock Seed Data
export const SEED_QR_MENUS: QRMenu[] = [
  {
    id: 101,
    merchant_id: 3,
    name: 'Main Dinner & Cocktail Menu',
    description: 'Prime dry-aged steaks, artisan wood-fired mains, and crafted cocktail selection.',
    status: 'active',
    design_theme: 'Texas Theme',
    qr_type: 'Table',
    created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    updated_at: new Date().toISOString(),
    sections_count: 3,
    items_count: 8,
    merchant: { id: 3, name: 'prueba1' },
  },
  {
    id: 102,
    merchant_id: 3,
    name: 'Lunch Express & Drinks Menu',
    description: 'Executive weekday lunch combos, artisanal sandwiches, and express business dining.',
    status: 'active',
    design_theme: 'Modern Elegance',
    qr_type: 'Table',
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    updated_at: new Date().toISOString(),
    sections_count: 2,
    items_count: 5,
    merchant: { id: 3, name: 'prueba1' },
  },
  {
    id: 103,
    merchant_id: 3,
    name: 'Patio & Terrace Special Menu',
    description: 'Sun-drenched cocktails, summer tapas, charcuterie boards, and seaside seafood.',
    status: 'inactive',
    design_theme: 'Sunset Coral',
    qr_type: 'Pickup',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
    sections_count: 2,
    items_count: 4,
    merchant: { id: 3, name: 'prueba1' },
  },
  {
    id: 104,
    merchant_id: 3,
    name: 'Takeout & Express Delivery Menu',
    description: 'Curbside pickup specials, family combos, and expedited packaging for home delivery.',
    status: 'active',
    design_theme: 'Emerald Garden',
    qr_type: 'Delivery',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
    sections_count: 2,
    items_count: 6,
    merchant: { id: 3, name: 'prueba1' },
  },
  {
    id: 105,
    merchant_id: 3,
    name: 'Nightlife Speakeasy Lounge',
    description: 'Late night bar menu featuring molecular mixology, small bites, and decadent desserts.',
    status: 'archived',
    design_theme: 'Midnight Bistro',
    qr_type: 'Table',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    updated_at: new Date().toISOString(),
    sections_count: 1,
    items_count: 3,
    merchant: { id: 3, name: 'prueba1' },
  },
];

export const SEED_QR_SECTIONS: QRMenuSection[] = [
  {
    id: 501,
    qr_menu_id: 101,
    name: 'Chef Prime Steaks & Cuts',
    description: 'USDA Prime cuts grilled over Texas oak and mesquite coals.',
    status: 'active',
    display_order: 1,
  },
  {
    id: 502,
    qr_menu_id: 101,
    name: 'Craft Cocktails & Wine',
    description: 'Signature mixology and curated cellar selections.',
    status: 'active',
    display_order: 2,
  },
  {
    id: 503,
    qr_menu_id: 101,
    name: 'Artisan Desserts',
    description: 'Decadent scratch-made pastries and house churned gelato.',
    status: 'active',
    display_order: 3,
  },
  {
    id: 504,
    qr_menu_id: 102,
    name: 'Executive Lunch Combos',
    description: 'Includes cup of soup or garden side salad and fountain drink.',
    status: 'active',
    display_order: 1,
  },
  {
    id: 505,
    qr_menu_id: 102,
    name: 'Gourmet Sandwiches & Bowls',
    description: 'Freshly baked brioche buns and nutrient-dense grain bowls.',
    status: 'active',
    display_order: 2,
  },
  {
    id: 506,
    qr_menu_id: 103,
    name: 'Terrace Tapas & Shareables',
    description: 'Spanish style tapas for outdoor social dining.',
    status: 'active',
    display_order: 1,
  },
  {
    id: 507,
    qr_menu_id: 103,
    name: 'Sangrias & Spritzes',
    description: 'Chilled carafes made with seasonal macerated fruit.',
    status: 'active',
    display_order: 2,
  },
  {
    id: 508,
    qr_menu_id: 104,
    name: 'Family Feasts To-Go',
    description: 'Portioned generously for 4 to 6 people with heat-and-serve instructions.',
    status: 'active',
    display_order: 1,
  },
  {
    id: 509,
    qr_menu_id: 104,
    name: 'Express Pickup Combos',
    description: 'Ready in 15 minutes guaranteed.',
    status: 'active',
    display_order: 2,
  },
  {
    id: 510,
    qr_menu_id: 105,
    name: 'Signature Mixology',
    description: 'Smoked old fashioneds and botanical infusions.',
    status: 'active',
    display_order: 1,
  },
];

export const SEED_QR_ITEMS: QRMenuItem[] = [
  {
    id: 9001,
    qr_menu_section_id: 501,
    product_id: 1,
    product_name: 'Bone-In Cowboy Ribeye (18oz)',
    price: 48.0,
    status: 'active',
    display_order: 1,
    notes: 'Served with charred marrow butter and smoked sea salt.',
    is_visible: true,
  },
  {
    id: 9002,
    qr_menu_section_id: 501,
    product_id: 2,
    product_name: 'Smoked Brisket Platter',
    price: 29.5,
    status: 'active',
    display_order: 2,
    notes: '14-hour post oak smoke with house pickled jalapenos.',
    is_visible: true,
  },
  {
    id: 9003,
    qr_menu_section_id: 501,
    product_id: 3,
    product_name: 'Wood-Grilled Cedar Plank Salmon',
    price: 32.0,
    status: 'active',
    display_order: 3,
    notes: 'Brown sugar bourbon glaze with roasted asparagus.',
    is_visible: true,
  },
  {
    id: 9004,
    qr_menu_section_id: 502,
    product_id: 4,
    product_name: 'Smoked Bourbon Old Fashioned',
    price: 16.0,
    status: 'active',
    display_order: 1,
    notes: 'Cherrywood smoked glass, demerara, angostura bitters.',
    is_visible: true,
  },
  {
    id: 9005,
    qr_menu_section_id: 502,
    product_id: 5,
    product_name: 'Texas Hill Country Cabernet',
    price: 18.0,
    status: 'active',
    display_order: 2,
    notes: 'Full bodied with notes of dark blackberry and oak.',
    is_visible: true,
  },
  {
    id: 9006,
    qr_menu_section_id: 503,
    product_id: 6,
    product_name: 'Molten Dark Chocolate Skillet',
    price: 12.0,
    status: 'active',
    display_order: 1,
    notes: 'Madagascar vanilla bean ice cream & salted caramel drizzle.',
    is_visible: true,
  },
  {
    id: 9007,
    qr_menu_section_id: 504,
    product_id: 7,
    product_name: 'Wagyu Smash Burger Combo',
    price: 17.5,
    status: 'active',
    display_order: 1,
    notes: 'Double patty, aged cheddar, secret sauce, waffle fries.',
    is_visible: true,
  },
  {
    id: 9008,
    qr_menu_section_id: 505,
    product_id: 8,
    product_name: 'Truffle Mushroom Melt Panini',
    price: 15.0,
    status: 'active',
    display_order: 1,
    notes: 'Wild mushrooms, gruyere, white truffle aioli.',
    is_visible: true,
  },
];

function getStoredMenus(): QRMenu[] {
  const raw = localStorage.getItem(STORAGE_MENUS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // Ignore parse errors
    }
  }
  localStorage.setItem(STORAGE_MENUS_KEY, JSON.stringify(SEED_QR_MENUS));
  return SEED_QR_MENUS;
}

function persistStoredMenus(menus: QRMenu[]): void {
  localStorage.setItem(STORAGE_MENUS_KEY, JSON.stringify(menus));
}

function getStoredSections(): QRMenuSection[] {
  const raw = localStorage.getItem(STORAGE_SECTIONS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // Ignore
    }
  }
  localStorage.setItem(STORAGE_SECTIONS_KEY, JSON.stringify(SEED_QR_SECTIONS));
  return SEED_QR_SECTIONS;
}

function persistStoredSections(sections: QRMenuSection[]): void {
  localStorage.setItem(STORAGE_SECTIONS_KEY, JSON.stringify(sections));
}

function getStoredItems(): QRMenuItem[] {
  const liveRaw = localStorage.getItem('x7_qr_menu_items_live');
  if (liveRaw) {
    try {
      const parsed = JSON.parse(liveRaw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // Ignore
    }
  }
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

function persistStoredItems(items: QRMenuItem[]): void {
  localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(items));
}

interface BackendQRMenuRaw {
  id: number;
  merchant_id?: number;
  name?: string;
  title?: string;
  description?: string;
  status?: QRMenuStatus | string;
  design_theme?: string;
  qr_type?: QRMenuType | string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  merchant?: {
    id: number;
    name: string;
  };
}

/**
 * Normalizes backend QRMenu representation into client QRMenu
 */
function normalizeBackendQRMenu(
  raw: BackendQRMenuRaw,
  sections: QRMenuSection[],
  items: QRMenuItem[]
): QRMenu {
  const menuSections = sections.filter((s) => String(s.qr_menu_id) === String(raw.id));
  const sectionIds = new Set(menuSections.map((s) => s.id));
  const menuItems = items.filter((i) => sectionIds.has(i.qr_menu_section_id));

  return {
    id: Number(raw.id),
    merchant_id: raw.merchant?.id ?? raw.merchant_id ?? 3,
    name: raw.name || raw.title || `Menu #${raw.id}`,
    description: raw.description ?? '',
    status: (raw.status as QRMenuStatus) || 'active',
    design_theme: raw.design_theme || 'Texas Theme',
    qr_type: (raw.qr_type as QRMenuType) || 'Table',
    created_at: raw.created_at || raw.createdAt || new Date().toISOString(),
    updated_at: raw.updated_at || raw.updatedAt || new Date().toISOString(),
    merchant: raw.merchant,
    sections: menuSections,
    sections_count: menuSections.length,
    items_count: menuItems.length,
  };
}

/**
 * Fetch all QR Menus (from backend or synced with mock storage fallback)
 */
export async function getQRMenus(merchantId?: number): Promise<QRMenu[]> {
  const storedSections = getStoredSections();
  const storedItems = getStoredItems();
  const token = getAccessToken();
  const localMenus = getStoredMenus();

  if (token) {
    try {
      const candidatePaths = ['/qr-menus?limit=100', '/v1/qr-menus?limit=100'];
      let res: Response | null = null;
      for (const path of candidatePaths) {
        try {
          res = await fetch(`${API_BASE}${path}`, {
            headers: authHeaders(),
          });
          if (res.ok) break;
        } catch {
          // try next path
        }
      }

      if (res && res.ok) {
        const json = (await res.json()) as { data?: BackendQRMenuRaw[] } | BackendQRMenuRaw[];
        const rawList: BackendQRMenuRaw[] = Array.isArray(json)
          ? json
          : Array.isArray(json.data)
            ? json.data
            : [];
        if (rawList.length > 0) {
          const localMap = new Map<string, QRMenu>(
            localMenus.map((m) => [String(m.id), m])
          );

          const mappedBackend: QRMenu[] = rawList.map((m) => {
            const local = localMap.get(String(m.id));
            const normalized = normalizeBackendQRMenu(m, storedSections, storedItems);
            if (local) {
              localMap.delete(String(m.id));
              const localTime = local.updated_at ? new Date(local.updated_at).getTime() : 0;
              const backendTime = (m.updated_at || m.updatedAt) ? new Date(m.updated_at || m.updatedAt!).getTime() : 0;
              // If edited locally in the last 60 seconds or local timestamp is newer, prioritize local edits
              const isRecentLocal = Date.now() - localTime < 60000;
              const useLocal = isRecentLocal || localTime >= backendTime;

              return {
                ...normalized,
                name: useLocal && local.name ? local.name : (m.name || m.title || local.name || normalized.name),
                description: useLocal && local.description !== undefined ? local.description : (m.description !== undefined ? m.description : (local.description ?? normalized.description)),
                status: useLocal && local.status ? local.status : ((m.status as QRMenuStatus) || local.status || normalized.status),
                design_theme: useLocal && local.design_theme ? local.design_theme : (m.design_theme || local.design_theme || normalized.design_theme),
                qr_type: useLocal && local.qr_type ? local.qr_type : ((m.qr_type as QRMenuType) || local.qr_type || normalized.qr_type),
              };
            }
            return normalized;
          });

          // Retain any locally cloned or created menus that aren't yet in the backend DB
          const remainingLocal = Array.from(localMap.values()).map((m) => {
            const secs = storedSections.filter((s) => String(s.qr_menu_id) === String(m.id));
            const secIds = new Set(secs.map((s) => s.id));
            const itms = storedItems.filter((i) => secIds.has(i.qr_menu_section_id));
            return {
              ...m,
              sections: secs,
              sections_count: secs.length,
              items_count: itms.length,
            };
          });

          const merged = [...mappedBackend, ...remainingLocal];
          persistStoredMenus(merged);

          if (merchantId) {
            const filtered = merged.filter((m) => m.merchant_id === merchantId);
            if (filtered.length > 0) return filtered;
          }
          return merged;
        }
      }
    } catch {
      // Ignore network errors and continue to local mock store
    }
  }

  // Fallback to local stored menus
  const hydrated = localMenus.map((m) => {
    const secs = storedSections.filter((s) => String(s.qr_menu_id) === String(m.id));
    const secIds = new Set(secs.map((s) => s.id));
    const itms = storedItems.filter((i) => secIds.has(i.qr_menu_section_id));
    return {
      ...m,
      sections: secs,
      sections_count: secs.length,
      items_count: itms.length,
    };
  });

  if (merchantId) {
    return hydrated.filter((m) => m.merchant_id === merchantId);
  }
  return hydrated;
}

/**
 * Fetch a single QR Menu by ID with all underlying sections and items
 */
export async function getQRMenuById(
  id: number
): Promise<{ menu: QRMenu; sections: QRMenuSection[]; items: QRMenuItem[] }> {
  const menus = await getQRMenus();
  let targetMenu = menus.find((m) => String(m.id) === String(id));
  if (!targetMenu) {
    const local = getStoredMenus();
    targetMenu = local.find((m) => String(m.id) === String(id));
  }
  if (!targetMenu) {
    throw new ApiError(`QR Menu #${id} not found.`, 404);
  }

  const sections = getStoredSections().filter((s) => String(s.qr_menu_id) === String(id));
  const sectionIds = new Set(sections.map((s) => s.id));
  const items = getStoredItems().filter((i) => sectionIds.has(i.qr_menu_section_id));

  return {
    menu: {
      ...targetMenu,
      sections,
      sections_count: sections.length,
      items_count: items.length,
    },
    sections,
    items,
  };
}

/**
 * Create a new QR Menu (POST /api/v1/qr-menus or POST /api/qr-menus)
 */
export async function createQRMenu(
  dto: CreateQRMenuDto,
  merchantId: number = 3
): Promise<QRMenu> {
  const token = getAccessToken();
  const payload = {
    merchant: merchantId,
    name: dto.name,
    description: dto.description,
    status: dto.status === 'archived' ? 'inactive' : dto.status, // Backend entity enum compatibility
    design_theme: dto.design_theme,
    qr_type: dto.qr_type,
  };

  let createdMenu: QRMenu | null = null;

  if (token) {
    const candidatePaths = ['/qr-menus', '/v1/qr-menus', '/qr-menu', '/v1/qr-menu'];
    for (const path of candidatePaths) {
      try {
        const res = await fetch(`${API_BASE}${path}`, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const json = await res.json();
          const raw = json.data ?? json;
          createdMenu = {
            id: Number(raw.id),
            merchant_id: merchantId,
            name: dto.name,
            description: dto.description,
            status: dto.status,
            design_theme: dto.design_theme,
            qr_type: dto.qr_type,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sections_count: 0,
            items_count: 0,
          };
          break;
        }
      } catch {
        // Continue to next path or local fallback
      }
    }
  }

  if (!createdMenu) {
    const nextId = Date.now();
    createdMenu = {
      id: nextId,
      merchant_id: merchantId,
      name: dto.name,
      description: dto.description,
      status: dto.status,
      design_theme: dto.design_theme,
      qr_type: dto.qr_type,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sections_count: 0,
      items_count: 0,
    };
  }

  const existing = getStoredMenus();
  persistStoredMenus([createdMenu, ...existing]);
  return createdMenu;
}

/**
 * Update an existing QR Menu (PATCH /api/v1/qr-menus/:id or PATCH /api/qr-menus/:id)
 */
export async function updateQRMenu(
  id: number,
  dto: UpdateQRMenuDto
): Promise<QRMenu> {
  const token = getAccessToken();

  // Find existing menu to populate any missing required fields for the backend DTO
  const menus = getStoredMenus();
  const index = menus.findIndex((m) => String(m.id) === String(id));
  const current = index !== -1 ? menus[index] : null;

  const targetMerchantId = Number(
    dto.merchant ??
    current?.merchant_id ??
    current?.merchant?.id ??
    3
  );

  const targetName = (dto.name !== undefined ? dto.name : (current?.name ?? `Menu #${id}`)).trim();
  const targetDesc = (dto.description !== undefined ? dto.description : (current?.description ?? '')).trim();
  const targetStatus = dto.status === 'archived' ? 'inactive' : (dto.status ?? (current?.status === 'archived' ? 'inactive' : (current?.status ?? 'active')));
  const targetTheme = (dto.design_theme !== undefined ? dto.design_theme : (current?.design_theme ?? 'Texas Theme')).trim();
  const targetType = dto.qr_type ?? current?.qr_type ?? 'Table';

  // Backend UpdateQRMenuDto extends CreateQRMenuDto which strictly requires:
  // merchant: number, name: string, description: string, status: 'active'|'inactive', design_theme: string, qr_type: QRMenuType
  const backendPayload = {
    merchant: targetMerchantId,
    name: targetName,
    description: targetDesc,
    status: targetStatus,
    design_theme: targetTheme,
    qr_type: targetType,
  };

  let backendUpdated: BackendQRMenuRaw | null = null;

  if (token) {
    const candidatePaths = [
      `/qr-menus/${id}`,
      `/v1/qr-menus/${id}`,
      `/qr-menu/${id}`,
      `/v1/qr-menu/${id}`,
    ];
    for (const path of candidatePaths) {
      try {
        let res = await fetch(`${API_BASE}${path}`, {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify(backendPayload),
        });
        if (res.status === 405) {
          res = await fetch(`${API_BASE}${path}`, {
            method: 'PUT',
            headers: authHeaders(true),
            body: JSON.stringify(backendPayload),
          });
        }
        if (res.ok) {
          const json = await res.json().catch(() => null);
          backendUpdated = (json?.data ?? json) as BackendQRMenuRaw;
          break;
        }
      } catch {
        // Fallback to local storage update
      }
    }
  }

  const storedSections = getStoredSections();
  const storedItems = getStoredItems();
  const menuSections = storedSections.filter((s) => String(s.qr_menu_id) === String(id));
  const sectionIds = new Set(menuSections.map((s) => s.id));
  const menuItems = storedItems.filter((i) => sectionIds.has(i.qr_menu_section_id));

  const updated: QRMenu = {
    id: current?.id ?? Number(id),
    merchant_id: targetMerchantId,
    name: targetName,
    description: targetDesc,
    status: (dto.status as QRMenuStatus) ?? current?.status ?? 'active',
    design_theme: targetTheme,
    qr_type: targetType,
    created_at: current?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    merchant: {
      id: targetMerchantId,
      name: current?.merchant?.name ?? '',
    },
    sections: menuSections,
    sections_count: menuSections.length,
    items_count: menuItems.length,
  };

  // If backend responded with properties, merge any that weren't explicitly provided in dto
  if (backendUpdated) {
    if (backendUpdated.name && dto.name === undefined) updated.name = backendUpdated.name;
    if (backendUpdated.description && dto.description === undefined) updated.description = backendUpdated.description;
    if (backendUpdated.status && dto.status === undefined) updated.status = backendUpdated.status as QRMenuStatus;
    if (backendUpdated.design_theme && dto.design_theme === undefined) updated.design_theme = backendUpdated.design_theme;
    if (backendUpdated.qr_type && dto.qr_type === undefined) updated.qr_type = backendUpdated.qr_type as QRMenuType;
  }

  if (index !== -1) {
    menus[index] = updated;
  } else {
    menus.unshift(updated);
  }

  persistStoredMenus(menus);
  return updated;
}

/**
 * Delete / Archive a QR Menu
 */
export async function deleteQRMenu(id: number): Promise<void> {
  const token = getAccessToken();
  if (token) {
    const candidatePaths = [
      `/qr-menus/${id}`,
      `/v1/qr-menus/${id}`,
      `/qr-menu/${id}`,
      `/v1/qr-menu/${id}`,
    ];
    for (const path of candidatePaths) {
      try {
        const res = await fetch(`${API_BASE}${path}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (res.ok) break;
      } catch {
        // Fallback
      }
    }
  }

  const menus = getStoredMenus().filter((m) => String(m.id) !== String(id));
  persistStoredMenus(menus);
}

/**
 * Menu Cloning & Duplication Pipeline:
 * Duplicates a QRMenu along with its underlying sections (qr_menu_section) and items (qr_menu_item)
 * to create new variants (e.g., "Lunch Menu" -> "Happy Hour Menu").
 */
export async function cloneQRMenu(
  sourceMenuId: number,
  options: CloneQRMenuDto
): Promise<{ menu: QRMenu; sections: QRMenuSection[]; items: QRMenuItem[] }> {
  const { menu: sourceMenu } =
    await getQRMenuById(sourceMenuId);

  const allSections = getStoredSections();
  const allItems = getStoredItems();

  // Execute deep relational duplication
  const { newMenu, newSections, newItems } = cloneMenuRelationalStructure(
    sourceMenu,
    {
      name: options.name,
      description: options.description,
      status: options.status,
      design_theme: options.design_theme,
      qr_type: options.qr_type,
      merchant_id: options.merchant_id,
    },
    allSections,
    allItems
  );

  // Sync with backend if authenticated
  const token = getAccessToken();
  if (token) {
    try {
      const backendPayload = {
        merchant: newMenu.merchant_id,
        name: newMenu.name,
        description: newMenu.description,
        status: newMenu.status === 'archived' ? 'inactive' : newMenu.status,
        design_theme: newMenu.design_theme,
        qr_type: newMenu.qr_type,
      };

      const res = await fetch(`${API_BASE}/qr-menus`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(backendPayload),
      });

      if (res.ok) {
        const json = await res.json();
        const savedBackend = json.data ?? json;
        if (savedBackend?.id) {
          // Relink to backend ID
          newMenu.id = savedBackend.id;
          newSections.forEach((s) => (s.qr_menu_id = savedBackend.id));
        }
      }
    } catch {
      // Keep generated ID
    }
  }

  // Persist locally
  const currentMenus = getStoredMenus();
  persistStoredMenus([newMenu, ...currentMenus]);

  const updatedSections = [...allSections, ...newSections];
  persistStoredSections(updatedSections);

  const updatedItems = [...allItems, ...newItems];
  persistStoredItems(updatedItems);

  return {
    menu: newMenu,
    sections: newSections,
    items: newItems,
  };
}
