import type {
  CreateQRMenuItemDto,
  QRMenuItem,
  QRMenuItemProductRef,
  QRMenuItemStatus,
  QRMenuSection,
  UpdateQRMenuItemDto,
} from '../types/qr-menu';
import { getAccessToken } from '../lib/auth-storage';
import { ApiError } from '../lib/api-error';
import { getStoredSections } from './qr-menu-sections';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const STORAGE_ITEMS_KEY = 'x7_qr_menu_items_live';
export const STORAGE_POS_PRODUCTS_KEY = 'x7_pos_products_live';

function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// -----------------------------------------------------------------------------
// Financial Precision Helpers (precision: 12, scale: 2)
// -----------------------------------------------------------------------------

/**
 * Validates financial precision according to TypeORM decimal(12, 2).
 * - Must be a valid finite number >= 0.
 * - Decimal scale must not exceed 2 places.
 * - Integer portion must not exceed 10 digits (total precision: 12).
 */
export function validateItemPricePrecision(price: number | string | null | undefined): {
  valid: boolean;
  error?: string;
  normalizedPrice?: number;
} {
  if (price === null || price === undefined || String(price).trim() === '') {
    return { valid: false, error: 'Price is required.' };
  }

  const numVal = typeof price === 'number' ? price : parseFloat(String(price).trim());

  if (isNaN(numVal) || !isFinite(numVal)) {
    return { valid: false, error: 'Price must be a valid number.' };
  }

  if (numVal < 0) {
    return { valid: false, error: 'Price cannot be negative.' };
  }

  // Check string representation for decimal precision
  const strVal = String(price).trim();
  const parts = strVal.split('.');

  if (parts.length > 2) {
    return { valid: false, error: 'Price format is invalid.' };
  }

  if (parts.length === 2 && parts[1].length > 2) {
    return {
      valid: false,
      error: `Price cannot exceed 2 decimal places (precision: 12, scale: 2). Provided: ${parts[1].length} decimals.`,
    };
  }

  const intPart = parts[0].replace('-', '');
  if (intPart.length > 10) {
    return {
      valid: false,
      error: 'Price exceeds maximum allowable precision (max 10 digits before decimal).',
    };
  }

  return { valid: true, normalizedPrice: Math.round(numVal * 100) / 100 };
}

/**
 * Formats a monetary price in monospace currency tag ($XX.XX with 2 decimals).
 */
export function formatItemPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined) return '$0.00';
  const n = typeof price === 'number' ? price : parseFloat(String(price));
  if (isNaN(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Canonical item display name extractor.
 */
export function getItemDisplayName(item: {
  name?: string;
  product_name?: string;
  product?: { name: string } | null;
}): string {
  if (item.name && item.name.trim().length > 0) return item.name.trim();
  if (item.product?.name && item.product.name.trim().length > 0) return item.product.name.trim();
  if (item.product_name && item.product_name.trim().length > 0) return item.product_name.trim();
  return 'QR Menu Item';
}

// -----------------------------------------------------------------------------
// Seed Data & Relation Hydration
// -----------------------------------------------------------------------------

export const SEED_POS_PRODUCTS: QRMenuItemProductRef[] = [
  { id: 1, name: 'Bone-In Cowboy Ribeye (18oz)', sku: 'POS-STEAK-001', basePrice: 48.0, price: 48.0, description: '18oz USDA Prime cut served with charred marrow butter and smoked sea salt.' },
  { id: 2, name: 'Smoked Brisket Platter', sku: 'POS-BEEF-002', basePrice: 29.5, price: 29.5, description: '14-hour post oak smoke served with house pickled jalapenos, slaw, and toast.' },
  { id: 3, name: 'Wood-Grilled Cedar Plank Salmon', sku: 'POS-SEAFOOD-003', basePrice: 32.0, price: 32.0, description: 'Fresh Atlantic salmon roasted over cedar with brown sugar bourbon glaze.' },
  { id: 4, name: 'Smoked Bourbon Old Fashioned', sku: 'POS-BAR-004', basePrice: 16.0, price: 16.0, description: 'Small batch bourbon infused with cherrywood smoke and aromatic bitters.' },
  { id: 5, name: 'Texas Hill Country Cabernet', sku: 'POS-WINE-005', basePrice: 18.0, price: 18.0, description: 'Estate bottled reserve with rich notes of blackberry and dark cocoa.' },
  { id: 6, name: 'Molten Dark Chocolate Skillet', sku: 'POS-DESSERT-006', basePrice: 12.0, price: 12.0, description: 'Warm dark chocolate cake with molten core, vanilla gelato, and salted caramel.' },
  { id: 7, name: 'Wagyu Smash Burger Combo', sku: 'POS-BURGER-007', basePrice: 17.5, price: 17.5, description: 'Double American Wagyu patties, aged Wisconsin cheddar, and seasoned waffle fries.' },
  { id: 8, name: 'Truffle Mushroom Melt Panini', sku: 'POS-PANINI-008', basePrice: 15.0, price: 15.0, description: 'Sautéed cremini mushrooms, cave-aged Gruyère cheese, and white truffle aioli.' },
];

export const INITIAL_QR_ITEMS: QRMenuItem[] = [
  {
    id: 9001,
    merchant_id: 3,
    qr_menu_section_id: 501,
    product_id: 1,
    product_name: 'Bone-In Cowboy Ribeye (18oz)',
    name: 'Bone-In Cowboy Ribeye (18oz)',
    description: '18oz USDA Prime cut served with charred bone marrow butter and flaked smoked sea salt.',
    notes: 'Charred medium rare recommended.',
    image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
    price: 48.0,
    display_order: 1,
    is_available: true,
    is_visible: true,
    status: 'active',
  },
  {
    id: 9002,
    merchant_id: 3,
    qr_menu_section_id: 501,
    product_id: 2,
    product_name: 'Smoked Brisket Platter',
    name: 'Smoked Brisket Platter',
    description: '14-hour post oak smoke served with house pickled jalapenos, creamy slaw, and Texas toast.',
    notes: 'Signature house specialty.',
    image_url: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&auto=format&fit=crop&q=80',
    price: 29.5,
    display_order: 2,
    is_available: true,
    is_visible: true,
    status: 'active',
  },
  {
    id: 9003,
    merchant_id: 3,
    qr_menu_section_id: 501,
    product_id: 3,
    product_name: 'Wood-Grilled Cedar Plank Salmon',
    name: 'Wood-Grilled Cedar Plank Salmon',
    description: 'Fresh Atlantic salmon roasted over cedar with brown sugar bourbon glaze and roasted asparagus.',
    notes: 'Gluten conscious option.',
    image_url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80',
    price: 32.0,
    display_order: 3,
    is_available: false, // 86'd out of stock
    is_visible: true,
    status: 'active',
  },
  {
    id: 9004,
    merchant_id: 3,
    qr_menu_section_id: 502,
    product_id: 4,
    product_name: 'Smoked Bourbon Old Fashioned',
    name: 'Smoked Bourbon Old Fashioned',
    description: 'Small batch bourbon infused with cherrywood smoke, demerara syrup, and aromatic bitters.',
    notes: 'Tableside smoked cloche presentation.',
    image_url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80',
    price: 16.0,
    display_order: 1,
    is_available: true,
    is_visible: true,
    status: 'active',
  },
  {
    id: 9005,
    merchant_id: 3,
    qr_menu_section_id: 502,
    product_id: 5,
    product_name: 'Texas Hill Country Cabernet',
    name: 'Texas Hill Country Cabernet',
    description: 'Estate bottled reserve with rich notes of blackberry compote, toasted cedar, and dark cocoa.',
    notes: 'Vintage 2021.',
    image_url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80',
    price: 18.0,
    display_order: 2,
    is_available: true,
    is_visible: true,
    status: 'active',
  },
  {
    id: 9006,
    merchant_id: 3,
    qr_menu_section_id: 503,
    product_id: 6,
    product_name: 'Molten Dark Chocolate Skillet',
    name: 'Molten Dark Chocolate Skillet',
    description: 'Warm Guittard dark chocolate cake with molten core, Madagascar vanilla gelato, and salted caramel.',
    notes: 'Baked fresh to order. Allow 12 minutes.',
    image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
    price: 12.0,
    display_order: 1,
    is_available: true,
    is_visible: true,
    status: 'active',
  },
  {
    id: 9007,
    merchant_id: 3,
    qr_menu_section_id: 504,
    product_id: 7,
    product_name: 'Wagyu Smash Burger Combo',
    name: 'Wagyu Smash Burger Combo',
    description: 'Double American Wagyu patties, aged Wisconsin cheddar, house secret sauce, and seasoned waffle fries.',
    notes: 'Includes soda or iced tea.',
    image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    price: 17.5,
    display_order: 1,
    is_available: true,
    is_visible: true,
    status: 'active',
  },
  {
    id: 9008,
    merchant_id: 3,
    qr_menu_section_id: 505,
    product_id: 8,
    product_name: 'Truffle Mushroom Melt Panini',
    name: 'Truffle Mushroom Melt Panini',
    description: 'Sautéed cremini mushrooms, cave-aged Gruyère cheese, white truffle aioli on grilled sourdough.',
    notes: 'Vegetarian friendly.',
    image_url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
    price: 15.0,
    display_order: 1,
    is_available: true,
    is_visible: true,
    status: 'inactive',
  },
  {
    id: 9009,
    merchant_id: 3,
    qr_menu_section_id: 504,
    product_id: null, // Standalone QR Item!
    name: 'Parmesan Truffle Loaded Fries',
    description: 'Crispy skin-on fries tossed in white truffle oil, freshly grated Pecorino Romano, and chives.',
    notes: 'Exclusive QR mobile appetizer.',
    image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
    price: 9.75,
    display_order: 2,
    is_available: true,
    is_visible: true,
    status: 'active',
  },
];

export function getStoredItems(): QRMenuItem[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (localStorage.getItem('x7_qr_menu_items_mock_db')) {
        localStorage.removeItem('x7_qr_menu_items_mock_db');
      }
    }
  } catch {
    // Ignore
  }

  const raw = typeof window !== 'undefined' && window.localStorage ? localStorage.getItem(STORAGE_ITEMS_KEY) : null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Exclude mock items with id >= 9000
        return parsed.filter((it: QRMenuItem) => it && Number(it.id) < 9000);
      }
    } catch {
      // Ignore
    }
  }
  return [];
}

export function persistStoredItems(items: QRMenuItem[]): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(items));
  }
}

export function getStoredPOSProducts(): QRMenuItemProductRef[] {
  const raw = typeof window !== 'undefined' && window.localStorage ? localStorage.getItem(STORAGE_POS_PRODUCTS_KEY) : null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Ignore
    }
  }
  return [];
}

/**
 * Hydrates an item with its parent QRMenuSection and mapped POS Product reference.
 */
export function hydrateItemRelations(
  item: QRMenuItem,
  sections?: QRMenuSection[],
  products?: QRMenuItemProductRef[]
): QRMenuItem {
  const allSections = sections || getStoredSections();
  const allProducts = products || getStoredPOSProducts();

  const rawAny = item as unknown as Record<string, unknown>;
  const secObj = rawAny.qrMenuSection as Record<string, unknown> | undefined;
  const prodObj = rawAny.product as Record<string, unknown> | undefined;

  const sectionId = item.qr_menu_section_id || (secObj?.id ? Number(secObj.id) : 0);
  const productId = item.product_id != null ? Number(item.product_id) : (prodObj?.id != null ? Number(prodObj.id) : null);
  const section = allSections.find((s) => s.id === sectionId);
  const product = productId != null ? allProducts.find((p) => p.id === productId) || (prodObj as unknown as QRMenuItemProductRef) || null : null;

  const rawPrice = item.price !== undefined ? item.price : (prodObj?.basePrice ?? product?.basePrice ?? product?.price ?? 0);
  const priceNum = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice || 0));

  return {
    ...item,
    id: Number(item.id),
    qr_menu_section_id: sectionId,
    product_id: productId,
    name: item.name?.trim() || product?.name || (prodObj?.name as string) || item.product_name || getItemDisplayName(item),
    product_name: product?.name || (prodObj?.name as string) || item.product_name || item.name,
    description: item.description || item.notes || '',
    notes: item.notes || item.description || '',
    image_url: item.image_url || '',
    is_available: item.is_available ?? (item.is_visible !== false),
    is_visible: item.is_visible ?? (item.is_available !== false),
    price: isNaN(priceNum) ? 0.0 : Math.round(priceNum * 100) / 100,
    merchant_id: item.merchant_id || 1,
    merchant: item.merchant || { id: item.merchant_id || 1, name: 'Merchant #1' },
    qrMenuSection: section || (secObj as unknown as QRMenuSection),
    product: product,
  };
}

// -----------------------------------------------------------------------------
// Media Validation
// -----------------------------------------------------------------------------

/**
 * Validates image format and URLs for image_url.
 * Supports:
 * - http:// or https:// URLs with valid protocol, hostname, and allowed extensions.
 * - data:image/(png|jpe?g|webp|avif|gif|svg+xml);base64,...
 */
export function validateImageUrl(url: string | null | undefined): { valid: boolean; error?: string } {
  if (!url || url.trim().length === 0) {
    return { valid: true };
  }
  const trimmed = url.trim();

  // Validate data:image Base64 data URLs
  if (trimmed.startsWith('data:')) {
    if (/^data:image\/(png|jpe?g|webp|avif|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return { valid: true };
    }
    return {
      valid: false,
      error: 'Invalid base64 image encoding. Allowed formats: PNG, JPG, WebP, AVIF, GIF, SVG.',
    };
  }

  // Validate HTTP/HTTPS URLs
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Image URL must use http:// or https:// protocol.' };
    }

    // Check file extension if specified in the path
    const cleanPath = parsed.pathname.toLowerCase();
    const match = cleanPath.match(/\.([a-z0-9]+)$/);
    if (match) {
      const ext = match[1];
      const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg'];
      if (!allowedExts.includes(ext)) {
        return {
          valid: false,
          error: `Unsupported image format ".${ext}". Allowed: ${allowedExts.join(', ')}.`,
        };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid image URL format.' };
  }
}

// -----------------------------------------------------------------------------
// Domain Validation
// -----------------------------------------------------------------------------

export function validateItemConstraints(
  dto: Partial<CreateQRMenuItemDto>,
  options?: { availableSections?: QRMenuSection[] }
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  // Name validation
  if (dto.name !== undefined) {
    const trimmed = dto.name.trim();
    if (trimmed.length === 0) {
      errors.name = 'Item name is required.';
    } else if (dto.name.length > 100) {
      errors.name = `Item name must not exceed 100 characters (current: ${dto.name.length}).`;
    }
  }

  // Description validation
  if (dto.description !== undefined) {
    const trimmed = dto.description.trim();
    if (trimmed.length === 0) {
      errors.description = 'Item description is required.';
    }
  }

  // Media / Image URL validation
  if (dto.image_url !== undefined && dto.image_url.trim().length > 0) {
    const mediaCheck = validateImageUrl(dto.image_url);
    if (!mediaCheck.valid) {
      errors.image_url = mediaCheck.error || 'Invalid image format or URL.';
    }
  }

  // Section validation
  if (dto.qr_menu_section_id !== undefined) {
    if (!dto.qr_menu_section_id || dto.qr_menu_section_id <= 0) {
      errors.qr_menu_section_id = 'A valid menu section must be selected.';
    } else if (options?.availableSections && options.availableSections.length > 0) {
      const exists = options.availableSections.some((s) => s.id === dto.qr_menu_section_id);
      if (!exists) {
        errors.qr_menu_section_id = `The selected section (ID #${dto.qr_menu_section_id}) does not exist.`;
      }
    }
  }

  // Price validation (precision 12, scale 2)
  if (dto.price !== undefined) {
    const priceCheck = validateItemPricePrecision(dto.price);
    if (!priceCheck.valid) {
      errors.price = priceCheck.error || 'Invalid price.';
    }
  }

  // Status validation
  if (dto.status !== undefined) {
    const validStatuses: QRMenuItemStatus[] = ['active', 'inactive', 'archived'];
    if (!validStatuses.includes(dto.status as QRMenuItemStatus)) {
      errors.status = `Status must be one of: ${validStatuses.join(', ')}.`;
    }
  }

  // Display order validation
  if (dto.display_order !== undefined) {
    if (dto.display_order < 1 || !Number.isInteger(dto.display_order)) {
      errors.display_order = 'Display order must be a positive integer greater than or equal to 1.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// -----------------------------------------------------------------------------
// Fetch POS Products
// -----------------------------------------------------------------------------

export async function getPOSProducts(): Promise<QRMenuItemProductRef[]> {
  try {
    const res = await fetch(`${API_BASE}/products?limit=100`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const json = await res.json();
      const list = Array.isArray(json) ? json : json.data || [];
      if (Array.isArray(list)) {
        const mapped: QRMenuItemProductRef[] = list.map((p: Record<string, unknown>) => ({
          id: Number(p.id),
          name: String(p.name || 'Unnamed Product'),
          sku: typeof p.sku === 'string' ? p.sku : undefined,
          basePrice: typeof p.basePrice === 'number' || typeof p.price === 'number' ? Number(p.basePrice || p.price) : 0,
          price: typeof p.price === 'number' ? p.price : undefined,
          description: typeof p.description === 'string' ? p.description : undefined,
        }));
        localStorage.setItem(STORAGE_POS_PRODUCTS_KEY, JSON.stringify(mapped));
        return mapped;
      }
    }
  } catch {
    // Network failure or offline backend
  }
  return getStoredPOSProducts();
}

// -----------------------------------------------------------------------------
// QRMenuItem CRUD Operations
// -----------------------------------------------------------------------------

export interface GetQRMenuItemsFilter {
  merchantId?: number;
  sectionId?: number;
  menuId?: number;
}

/**
 * Retrieve QR Menu Items with relational hydration (section and product).
 */
export async function getQRMenuItems(filter?: GetQRMenuItemsFilter): Promise<QRMenuItem[]> {
  try {
    const queryParams = new URLSearchParams();
    if (filter?.sectionId) queryParams.set('qr_menu_section_id', String(filter.sectionId));
    if (filter?.merchantId) queryParams.set('merchant_id', String(filter.merchantId));
    queryParams.set('limit', '100');

    const url = `${API_BASE}/qr-menu-items${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const res = await fetch(url, { headers: authHeaders() });

    if (res.ok) {
      const data = await res.json();
      const itemsList = Array.isArray(data) ? data : data.data || [];
      const sections = getStoredSections();
      const products = getStoredPOSProducts();
      const hydrated = itemsList.map((it: QRMenuItem) => hydrateItemRelations(it, sections, products));
      if (hydrated.length > 0) {
        persistStoredItems(hydrated);
      }
      return hydrated;
    }
  } catch {
    // Backend offline fallback
  }

  // Local storage fallback (strictly for offline or test mode, returns empty array if no user items saved)
  let items = getStoredItems();
  const sections = getStoredSections();
  const products = getStoredPOSProducts();

  if (filter?.sectionId) {
    items = items.filter((it) => it.qr_menu_section_id === filter.sectionId);
  }

  if (filter?.menuId) {
    const sectionIdsInMenu = new Set(
      sections.filter((s) => s.qr_menu_id === filter.menuId).map((s) => s.id)
    );
    items = items.filter((it) => sectionIdsInMenu.has(it.qr_menu_section_id));
  }

  return items.map((it) => hydrateItemRelations(it, sections, products));
}

/**
 * Get a single QR menu item by its ID.
 */
export async function getQRMenuItemById(id: number): Promise<QRMenuItem> {
  try {
    const res = await fetch(`${API_BASE}/qr-menu-items/${id}`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      const raw = data.data ?? data;
      return hydrateItemRelations(raw);
    }
  } catch {
    // Fallback
  }

  const items = getStoredItems();
  const found = items.find((it) => it.id === id);
  if (!found) {
    throw new ApiError('QR Menu Item not found', 404);
  }
  return hydrateItemRelations(found);
}

/**
 * Create a new QR Menu Item with validation and precision enforcement.
 */
export async function createQRMenuItem(
  dto: CreateQRMenuItemDto,
  availableSections?: QRMenuSection[]
): Promise<QRMenuItem> {
  const validation = validateItemConstraints(dto, { availableSections });
  if (!validation.valid) {
    const firstErr = Object.values(validation.errors)[0];
    throw new ApiError(firstErr || 'Validation failed for QR Menu Item.', 400);
  }

  const priceResult = validateItemPricePrecision(dto.price);
  const normalizedPrice = priceResult.normalizedPrice ?? Number(dto.price);

  const sections = availableSections || getStoredSections();
  const products = getStoredPOSProducts();

  // Determine display_order if not provided
  let displayOrder = dto.display_order;
  if (!displayOrder) {
    const items = getStoredItems();
    const sectionItems = items.filter((it) => it.qr_menu_section_id === dto.qr_menu_section_id);
    displayOrder = sectionItems.length > 0 ? Math.max(...sectionItems.map((it) => it.display_order || 0)) + 1 : 1;
  }

  const payload = {
    qrMenuSection: dto.qr_menu_section_id,
    qr_menu_section_id: dto.qr_menu_section_id,
    product: dto.product_id != null && dto.product_id > 0 ? Number(dto.product_id) : undefined,
    product_id: dto.product_id != null && dto.product_id > 0 ? Number(dto.product_id) : undefined,
    name: dto.name.trim(),
    price: normalizedPrice,
    description: dto.description?.trim() || '',
    image_url: dto.image_url?.trim() || '',
    notes: dto.description?.trim() || '',
    display_order: displayOrder,
    status: dto.status || 'active',
    is_available: dto.is_available ?? true,
    is_visible: dto.is_available ?? true,
  };

  try {
    const res = await fetch(`${API_BASE}/qr-menu-items`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const created = await res.json();
      const raw = created.data ?? created;
      const hydrated = hydrateItemRelations(raw, sections, products);
      const items = getStoredItems();
      persistStoredItems([hydrated, ...items.filter((i) => i.id !== hydrated.id)]);
      return hydrated;
    } else {
      const errJson = await res.json().catch(() => null);
      const errMsg = errJson?.message
        ? (Array.isArray(errJson.message) ? errJson.message.join(', ') : errJson.message)
        : `Failed to create QR menu item (${res.status})`;
      throw new ApiError(errMsg, res.status);
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    // Fallback to local storage only if offline/network error
  }

  const items = getStoredItems();
  const newItemId = items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 9001;
  const newItem: QRMenuItem = {
    id: newItemId,
    merchant_id: dto.merchant_id || 1,
    qr_menu_section_id: dto.qr_menu_section_id,
    product_id: dto.product_id ?? null,
    name: dto.name.trim(),
    product_name: dto.name.trim(),
    description: dto.description?.trim() || '',
    notes: dto.description?.trim() || '',
    image_url: dto.image_url?.trim() || '',
    price: normalizedPrice,
    display_order: displayOrder,
    is_available: dto.is_available ?? true,
    is_visible: dto.is_available ?? true,
    status: dto.status || 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const updatedItems = [newItem, ...items];
  persistStoredItems(updatedItems);

  return hydrateItemRelations(newItem, sections, products);
}

/**
 * Update an existing QR Menu Item.
 */
export async function updateQRMenuItem(
  id: number,
  dto: UpdateQRMenuItemDto,
  availableSections?: QRMenuSection[]
): Promise<QRMenuItem> {
  const validation = validateItemConstraints(dto, { availableSections });
  if (!validation.valid) {
    const firstErr = Object.values(validation.errors)[0];
    throw new ApiError(firstErr || 'Validation failed for QR Menu Item.', 400);
  }

  let normalizedPrice = dto.price;
  if (dto.price !== undefined) {
    const priceResult = validateItemPricePrecision(dto.price);
    normalizedPrice = priceResult.normalizedPrice ?? Number(dto.price);
  }

  const sections = availableSections || getStoredSections();
  const products = getStoredPOSProducts();

  const payload = {
    ...(dto.qr_menu_section_id !== undefined
      ? { qrMenuSection: dto.qr_menu_section_id, qr_menu_section_id: dto.qr_menu_section_id }
      : {}),
    ...(dto.product_id !== undefined
      ? {
          product: dto.product_id != null && dto.product_id > 0 ? Number(dto.product_id) : null,
          product_id: dto.product_id != null && dto.product_id > 0 ? Number(dto.product_id) : null,
        }
      : {}),
    ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
    ...(normalizedPrice !== undefined ? { price: normalizedPrice } : {}),
    ...(dto.description !== undefined ? { description: dto.description.trim(), notes: dto.description.trim() } : {}),
    ...(dto.image_url !== undefined ? { image_url: dto.image_url.trim() } : {}),
    ...(dto.display_order !== undefined ? { display_order: dto.display_order } : {}),
    ...(dto.is_available !== undefined
      ? { is_available: dto.is_available, is_visible: dto.is_available }
      : {}),
    ...(dto.status !== undefined ? { status: dto.status } : {}),
  };

  try {
    const res = await fetch(`${API_BASE}/qr-menu-items/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const updated = await res.json();
      const raw = updated.data ?? updated;
      const hydrated = hydrateItemRelations(raw, sections, products);
      const items = getStoredItems();
      persistStoredItems(items.map((it) => (it.id === hydrated.id ? hydrated : it)));
      return hydrated;
    } else {
      const errJson = await res.json().catch(() => null);
      const errMsg = errJson?.message
        ? (Array.isArray(errJson.message) ? errJson.message.join(', ') : errJson.message)
        : `Failed to update QR menu item (${res.status})`;
      throw new ApiError(errMsg, res.status);
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
  }

  const items = getStoredItems();
  const index = items.findIndex((it) => it.id === id);
  if (index === -1) {
    throw new ApiError(`QR Menu Item with ID #${id} not found.`, 404);
  }

  const existing = items[index];
  const updatedItem: QRMenuItem = {
    ...existing,
    ...(dto.name !== undefined ? { name: dto.name.trim(), product_name: dto.name.trim() } : {}),
    ...(dto.description !== undefined ? { description: dto.description.trim(), notes: dto.description.trim() } : {}),
    ...(dto.image_url !== undefined ? { image_url: dto.image_url.trim() } : {}),
    ...(normalizedPrice !== undefined ? { price: normalizedPrice } : {}),
    ...(dto.qr_menu_section_id !== undefined ? { qr_menu_section_id: dto.qr_menu_section_id } : {}),
    ...(dto.product_id !== undefined ? { product_id: dto.product_id } : {}),
    ...(dto.display_order !== undefined ? { display_order: dto.display_order } : {}),
    ...(dto.is_available !== undefined
      ? { is_available: dto.is_available, is_visible: dto.is_available }
      : {}),
    ...(dto.status !== undefined ? { status: dto.status } : {}),
    updated_at: new Date().toISOString(),
  };

  items[index] = updatedItem;
  persistStoredItems(items);

  return hydrateItemRelations(updatedItem, sections, products);
}

/**
 * Real-time Kitchen Availability Toggle (86/Item Out of Stock switch).
 * Instantly updates availability without requiring full menu reload.
 */
export async function toggleQRMenuItemAvailability(
  id: number,
  is_available: boolean
): Promise<QRMenuItem> {
  try {
    const res = await fetch(`${API_BASE}/qr-menu-items/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify({
        is_available,
        is_visible: is_available,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      return hydrateItemRelations(updated);
    }
  } catch {
    // Fallback
  }

  const items = getStoredItems();
  const index = items.findIndex((it) => it.id === id);
  if (index === -1) {
    throw new ApiError(`QR Menu Item #${id} not found`, 404);
  }

  items[index] = {
    ...items[index],
    is_available,
    is_visible: is_available,
    updated_at: new Date().toISOString(),
  };
  persistStoredItems(items);

  return hydrateItemRelations(items[index]);
}

/**
 * Delete a QR menu item.
 */
export async function deleteQRMenuItem(id: number): Promise<{ success: boolean; id: number }> {
  try {
    const res = await fetch(`${API_BASE}/qr-menu-items/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (res.ok) {
      return { success: true, id };
    }
  } catch {
    // Fallback
  }

  const items = getStoredItems();
  const filtered = items.filter((it) => it.id !== id);
  if (filtered.length === items.length) {
    throw new ApiError(`QR Menu Item with ID #${id} not found.`, 404);
  }

  persistStoredItems(filtered);
  return { success: true, id };
}

/**
 * Reorder items in batch within a section.
 */
export async function bulkReorderQRMenuItems(
  sectionId: number,
  itemsOrder: { id: number; display_order: number }[]
): Promise<QRMenuItem[]> {
  const items = getStoredItems();
  const orderMap = new Map<number, number>(itemsOrder.map((o) => [o.id, o.display_order]));

  const updated = items.map((it) => {
    if (it.qr_menu_section_id === sectionId && orderMap.has(it.id)) {
      return {
        ...it,
        display_order: orderMap.get(it.id)!,
        updated_at: new Date().toISOString(),
      };
    }
    return it;
  });

  persistStoredItems(updated);
  return updated.filter((it) => it.qr_menu_section_id === sectionId).map((it) => hydrateItemRelations(it));
}
