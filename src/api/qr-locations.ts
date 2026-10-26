import type {
  BulkCreateQRLocationsDto,
  CreateQRLocationDto,
  MerchantRef,
  QRLocation,
  QRMenuRef,
  QRMenuType,
  TableRef,
  UpdateQRLocationDto,
} from '../types/qr-location';
import {
  buildDispatchOrderUrl,
  buildQrLandingUrl,
  buildQrTargetUrl,
  generateLocHash,
  generateQrAssetImage,
  syncLocationTypeWithTable,
  validateTableMerchantContext,
  validateUniqueLocationName,
  validateQRLocationPayload,
} from '../lib/qr-location';
import { getAccessToken } from '../lib/auth-storage';
import { ApiError } from '../lib/api-error';
import { getQRMenus } from './qr-menus';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const STORAGE_KEY = 'x7_qr_locations_mock_db';

// Cache for live fetched entities so relations can be hydrated even if backend only returns scalar IDs
let _cachedMerchants: MerchantRef[] = [];
let _cachedMenus: QRMenuRef[] = [];
let _cachedTables: TableRef[] = [];

// Default mock seed data (used when offline, mock mode, or unauthenticated)
export const MOCK_MERCHANTS: MerchantRef[] = [
  {
    id: 1,
    name: 'Bistro Downtown',
    code: 'MCH-001',
    slug: 'bistro-downtown',
    logo_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 2,
    name: 'La Trattoria Patio',
    code: 'MCH-002',
    slug: 'la-trattoria-patio',
    logo_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 3,
    name: 'prueba1',
    code: 'MCH-003',
    slug: 'prueba1',
    logo_url: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=120&auto=format&fit=crop&q=80',
  },
];

export const MOCK_MENUS: QRMenuRef[] = [
  { id: 101, name: 'Main Dinner & Cocktail Menu', is_active: true, design_theme: 'Modern Elegance', status: 'active', merchant_id: 3 },
  { id: 102, name: 'Lunch Express & Drinks Menu', is_active: true, design_theme: 'Tokyo Minimal', status: 'active', merchant_id: 3 },
  { id: 103, name: 'Patio & Terrace Special Menu', is_active: true, design_theme: 'Sunset Coral', status: 'active', merchant_id: 3 },
  { id: 104, name: 'Takeout & Pickup Menu', is_active: true, design_theme: 'Artisan Bakery', status: 'active', merchant_id: 3 },
  { id: 105, name: 'Exclusive Downtown Tasting Menu', is_active: true, design_theme: 'Texas Theme', status: 'active', merchant_id: 1 },
];

export const MOCK_TABLES: TableRef[] = [
  { id: 1, number: 'A1', merchant_id: 1, capacity: 4, zone_name: 'Main Dining Room' },
  { id: 201, number: '12', merchant_id: 3, capacity: 4, zone_name: 'Main Dining Room' },
  { id: 202, number: '14', merchant_id: 3, capacity: 6, zone_name: 'Main Dining Room' },
  { id: 203, number: 'Patio-01', merchant_id: 3, capacity: 2, zone_name: 'Terrace' },
  { id: 204, number: 'Patio-02', merchant_id: 3, capacity: 4, zone_name: 'Terrace' },
  { id: 205, number: 'VIP-1', merchant_id: 1, capacity: 8, zone_name: 'VIP Lounge' },
  { id: 206, number: 'Bar-5', merchant_id: 2, capacity: 2, zone_name: 'Main Bar' },
];

function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function initializeMockData(): QRLocation[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fallback to seed
    }
  }

  const initialList: QRLocation[] = [
    {
      id: 1,
      name: 'Patio Table #12 Access',
      merchant_id: 3,
      qr_menu_id: 101,
      table_id: 201,
      location_type: 'DINE_IN',
      status: 'active',
      qr_code_url: buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: 201, qrMenuId: 101 }),
      qr_code_image: generateQrAssetImage(buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: 201, qrMenuId: 101 }), 'Patio Table #12 Access'),
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'Curbside Pickup Point',
      merchant_id: 3,
      qr_menu_id: 104,
      table_id: null,
      location_type: 'PICKUP',
      status: 'active',
      qr_code_url: buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: null, qrMenuId: 104 }),
      qr_code_image: generateQrAssetImage(buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: null, qrMenuId: 104 }), 'Curbside Pickup Point'),
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 3,
      name: 'Terrace Table #Patio-01',
      merchant_id: 3,
      qr_menu_id: 103,
      table_id: 203,
      location_type: 'DINE_IN',
      status: 'inactive',
      qr_code_url: buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: 203, qrMenuId: 103 }),
      qr_code_image: generateQrAssetImage(buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: 203, qrMenuId: 103 }), 'Terrace Table #Patio-01'),
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 4,
      name: 'Room 402 Room Service QR',
      merchant_id: 3,
      qr_menu_id: 102,
      table_id: null,
      location_type: 'ROOM_SERVICE',
      status: 'archived',
      qr_code_url: buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: null, qrMenuId: 102 }),
      qr_code_image: generateQrAssetImage(buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: null, qrMenuId: 102 }), 'Room 402 Room Service QR'),
      created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 5,
      name: 'Main Bar Stool #05',
      merchant_id: 3,
      qr_menu_id: 101,
      table_id: null,
      location_type: 'DINE_IN',
      status: 'suspended',
      qr_code_url: buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: null, qrMenuId: 101 }),
      qr_code_image: generateQrAssetImage(buildDispatchOrderUrl({ merchantSlug: 'prueba1', tableId: null, qrMenuId: 101 }), 'Main Bar Stool #05'),
      created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialList));
  return initialList;
}

function persistMockData(items: QRLocation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Convert front-end QRMenuType to backend enum ('Table' | 'Pickup' | 'Delivery')
function mapLocationTypeToBackend(type: QRMenuType): 'Table' | 'Pickup' | 'Delivery' {
  if (type === 'PICKUP') return 'Pickup';
  if (type === 'DELIVERY') return 'Delivery';
  return 'Table'; // DINE_IN and ROOM_SERVICE map to Table
}

// Convert backend enum to front-end QRMenuType
function mapBackendLocationTypeToFrontend(type?: string | null): QRMenuType {
  const upper = String(type || '').toUpperCase();
  if (upper === 'PICKUP') return 'PICKUP';
  if (upper === 'DELIVERY') return 'DELIVERY';
  if (upper === 'ROOM_SERVICE') return 'ROOM_SERVICE';
  return 'DINE_IN';
}

function normalizeBackendQRLocation(item: Record<string, unknown>): QRLocation {
  const merchantObj = item.merchant as Record<string, unknown> | undefined;
  const qrMenuObj = item.qrMenu as Record<string, unknown> | undefined;
  const tableObj = item.table as Record<string, unknown> | undefined;

  const merchantId = Number(merchantObj?.id ?? item.merchant_id ?? 0);
  const qrMenuId = Number(qrMenuObj?.id ?? item.qr_menu_id ?? 0);
  const tableId = tableObj?.id !== undefined ? Number(tableObj.id) : (item.table_id !== undefined ? (item.table_id === null ? null : Number(item.table_id)) : null);
  const locType = mapBackendLocationTypeToFrontend(item.location_type as string | undefined);

  const locId = Number(item.id);
  const name = String(item.name || `Location #${locId}`);
  const url = (item.qr_code_url as string) || buildQrLandingUrl(merchantId, locId);
  const img = (item.qr_code_image as string) || generateQrAssetImage(url, name);

  return {
    id: locId,
    name,
    merchant_id: merchantId,
    qr_menu_id: qrMenuId,
    table_id: tableId,
    location_type: locType,
    status: (item.status as QRLocation['status']) || 'active',
    qr_code_url: url,
    qr_code_image: img,
    created_at: String(item.created_at || new Date().toISOString()),
    updated_at: String(item.updated_at || new Date().toISOString()),
    merchant: merchantObj as unknown as QRLocation['merchant'],
    qrMenu: qrMenuObj as unknown as QRLocation['qrMenu'],
    table: tableObj as unknown as QRLocation['table'],
  };
}

function hydrateRelations(item: QRLocation): QRLocation {
  const merchant =
    item.merchant ||
    _cachedMerchants.find((m) => m.id === item.merchant_id) ||
    MOCK_MERCHANTS.find((m) => m.id === item.merchant_id) || {
      id: item.merchant_id,
      name: `Merchant #${item.merchant_id}`,
    };

  const qrMenu =
    item.qrMenu ||
    _cachedMenus.find((m) => m.id === item.qr_menu_id) ||
    MOCK_MENUS.find((m) => m.id === item.qr_menu_id) || {
      id: item.qr_menu_id,
      name: `Menu #${item.qr_menu_id}`,
      is_active: true,
    };

  const foundTable = item.table_id
    ? _cachedTables.find((t) => t.id === item.table_id) ||
      MOCK_TABLES.find((t) => t.id === item.table_id) || {
        id: item.table_id,
        number: item.table?.number || `${item.table_id}`,
        merchant_id: item.merchant_id,
      }
    : null;

  return {
    ...item,
    merchant,
    qrMenu,
    table: foundTable,
  };
}

/**
 * Fetch available merchants from backend or fallback to mocks
 */
export async function fetchAvailableMerchants(): Promise<MerchantRef[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const response = await fetch(`${API_BASE}/merchants/company/branches`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const json = await response.json();
        const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        if (rawList.length > 0) {
          const list: MerchantRef[] = rawList.map((m) => ({
            id: Number(m.id),
            name: String(m.name),
            code: String(m.code || `MCH-${m.id}`),
          }));
          _cachedMerchants = list;
          return list;
        }
      }
    } catch {
      // Ignore network errors and fallback
    }
  }

  _cachedMerchants = MOCK_MERCHANTS;
  return MOCK_MERCHANTS;
}

/**
 * Fetch available QR Menus from backend or fallback to mocks
 */
export async function fetchAvailableQRMenus(merchantId?: number): Promise<QRMenuRef[]> {
  try {
    const list = await getQRMenus(merchantId);
    if (list && list.length > 0) {
      const mapped: QRMenuRef[] = list.map((m) => {
        const mMerchant = m.merchant as Record<string, unknown> | undefined;
        return {
          id: Number(m.id),
          name: String(m.name || `Menu #${m.id}`),
          is_active: m.status ? m.status === 'active' : true,
          design_theme: String(m.design_theme || 'Modern Elegance'),
          status: String(m.status || 'active'),
          merchant_id: Number(mMerchant?.id ?? m.merchant_id ?? (merchantId || 0)),
        };
      });
      _cachedMenus = mapped;

      if (merchantId) {
        const filtered = mapped.filter((m) => !m.merchant_id || m.merchant_id === merchantId);
        if (filtered.length > 0) return filtered;
      }
      return mapped;
    }
  } catch {
    // Continue to candidate paths
  }

  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/qr-menus?limit=100', '/qr-menu?limit=100', '/v1/qr-menus?limit=100', '/v1/qr-menu?limit=100'];
      for (const path of candidatePaths) {
        const response = await fetch(`${API_BASE}${path}`, {
          headers: authHeaders(),
        });
        if (response.ok) {
          const json = await response.json();
          const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
          if (rawList.length > 0) {
            const mapped: QRMenuRef[] = rawList.map((m) => {
              const mMerchant = m.merchant as Record<string, unknown> | undefined;
              return {
                id: Number(m.id),
                name: String(m.name || m.title || `Menu #${m.id}`),
                is_active: m.status ? m.status === 'active' : true,
                design_theme: String(m.design_theme || 'Modern Elegance'),
                status: String(m.status || 'active'),
                merchant_id: Number(mMerchant?.id ?? m.merchant_id ?? 0),
              };
            });
            _cachedMenus = mapped;

            if (merchantId) {
              const filtered = mapped.filter((m) => !m.merchant_id || m.merchant_id === merchantId);
              if (filtered.length > 0) return filtered;
            }
            return mapped;
          }
        }
      }
    } catch {
      // Ignore network errors and fallback
    }
  }

  const result = merchantId ? MOCK_MENUS.filter((m) => !m.merchant_id || m.merchant_id === merchantId) : MOCK_MENUS;
  _cachedMenus = result;
  return result;
}

/**
 * Fetch available dining tables from backend or fallback to mocks
 */
export async function fetchAvailableTables(merchantId?: number): Promise<TableRef[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const response = await fetch(`${API_BASE}/tables?limit=100`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const json = await response.json();
        const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        const mapped: TableRef[] = rawList.map((t) => {
          const tableMerchant = t.merchant as Record<string, unknown> | undefined;
          const floorZone = t.floorZone as Record<string, unknown> | undefined;
          const zone = t.zone as Record<string, unknown> | undefined;
          return {
            id: Number(t.id),
            number: String(t.number ?? t.table_number ?? t.id),
            merchant_id: Number(tableMerchant?.id ?? t.merchant_id ?? t.merchantId ?? (merchantId || 0)),
            capacity: Number(t.capacity || 0),
            zone_name: String(floorZone?.name ?? zone?.name ?? t.zone_name ?? ''),
          };
        });
        _cachedTables = mapped;

        if (merchantId) {
          return mapped.filter((t) => !t.merchant_id || Number(t.merchant_id) === Number(merchantId));
        }
        return mapped;
      }
    } catch {
      // Ignore network errors and fallback
    }
  }

  const result = merchantId
    ? MOCK_TABLES.filter((t) => !t.merchant_id || Number(t.merchant_id) === Number(merchantId))
    : MOCK_TABLES;
  _cachedTables = result;
  return result;
}

/**
 * Retrieves QR Locations. Handles backend singular (/api/qr-location) and plural (/api/qr-locations).
 */
export async function getQRLocations(merchantId?: number): Promise<QRLocation[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/qr-locations', '/qr-location', '/v1/qr-locations', '/v1/qr-location'];
      let response: Response | null = null;
      for (const path of candidatePaths) {
        response = await fetch(`${API_BASE}${path}?limit=100`, {
          headers: authHeaders(),
        });
        if (response.status !== 404) break;
        const clone = response.clone();
        const errJson = await clone.json().catch(() => ({}));
        const msg = String(errJson.message || '');
        if (!msg.startsWith('Cannot GET')) break;
      }

      if (response && response.ok) {
        const json = await response.json();
        const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
        const normalized = rawList.map(normalizeBackendQRLocation);
        const filtered = merchantId
          ? normalized.filter((loc) => !loc.merchant_id || loc.merchant_id === merchantId)
          : normalized;
        return filtered.map(hydrateRelations);
      }
    } catch {
      // Fallback to mock persistence
    }
  }

  const items = initializeMockData();
  const filtered = merchantId ? items.filter((i) => i.merchant_id === merchantId) : items;
  return filtered.map(hydrateRelations);
}

/**
 * Creates a new QR Location. Formats body to match backend expectations.
 */
export async function createQRLocation(dto: CreateQRLocationDto): Promise<QRLocation> {
  const tables = await fetchAvailableTables(dto.merchant_id);
  const items = initializeMockData();

  // Enforce Form Validation & Unique Location Naming under merchant
  const payloadCheck = validateQRLocationPayload(dto, dto.merchant_id, items, tables);
  if (!payloadCheck.valid) {
    throw new ApiError(payloadCheck.error || 'Validation failed.', 400);
  }

  // Business Rule: Table Association Sync
  const finalLocationType = syncLocationTypeWithTable(dto.table_id, dto.location_type);
  const token = getAccessToken();

  if (token) {
    const backendLocationType = mapLocationTypeToBackend(finalLocationType);
    const locHash = generateLocHash(dto.name, 'new');
    const targetUrl =
      dto.qr_code_url ||
      buildQrTargetUrl({
        qrMenuId: dto.qr_menu_id,
        locHash,
        tableId: dto.table_id,
      });
    const targetImage = dto.qr_code_image || generateQrAssetImage(targetUrl, dto.name);

    const backendPayload: Record<string, unknown> = {
      merchant: Number(dto.merchant_id),
      qrMenu: Number(dto.qr_menu_id),
      name: dto.name.trim(),
      location_type: backendLocationType,
      status: dto.status === 'active' ? 'active' : 'inactive',
      qr_code_url: targetUrl,
      qr_code_image: targetImage,
    };
    if (dto.table_id && Number(dto.table_id) > 0) {
      backendPayload.table = Number(dto.table_id);
    }

    try {
      const candidatePaths = ['/qr-locations', '/qr-location', '/v1/qr-locations', '/v1/qr-location'];
      let response: Response | null = null;
      for (const path of candidatePaths) {
        response = await fetch(`${API_BASE}${path}`, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(backendPayload),
        });
        if (response.status !== 404) break;
        const clone = response.clone();
        const errJson = await clone.json().catch(() => ({}));
        const msg = String(errJson.message || '');
        if (!msg.startsWith('Cannot POST')) break;
      }

      if (response && response.ok) {
        const created = await response.json();
        const normalized = normalizeBackendQRLocation(created.data ?? created);
        return hydrateRelations(normalized);
      } else if (response) {
        const errorData = await response.json().catch(() => ({}));
        const message = Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : errorData.message || `Server responded with status ${response.status}`;
        throw new ApiError(message, response.status);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      // If network unreachable, continue to mock fallback below
    }
  }

  // Fallback to local mock persistence
  const newId = items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;
  const activeMerchant = _cachedMerchants.find((m) => m.id === dto.merchant_id) || MOCK_MERCHANTS.find((m) => m.id === dto.merchant_id);
  const locHash = generateLocHash(dto.name, newId);
  const qr_code_url =
    dto.qr_code_url ||
    buildDispatchOrderUrl({
      merchantSlug: activeMerchant?.slug || `merchant-${dto.merchant_id}`,
      tableId: dto.table_id,
      qrMenuId: dto.qr_menu_id,
      locHash,
    });
  const qr_code_image = dto.qr_code_image || generateQrAssetImage(qr_code_url, dto.name);

  const newItem: QRLocation = {
    id: newId,
    name: dto.name,
    merchant_id: dto.merchant_id,
    qr_menu_id: dto.qr_menu_id,
    table_id: dto.table_id || null,
    location_type: finalLocationType,
    status: dto.status,
    qr_code_url,
    qr_code_image,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const updatedList = [newItem, ...items];
  persistMockData(updatedList);
  return hydrateRelations(newItem);
}

/**
 * Updates a QR Location.
 */
export async function updateQRLocation(
  id: number,
  dto: UpdateQRLocationDto
): Promise<QRLocation> {
  const items = initializeMockData();
  const existing = items.find((i) => i.id === id);

  const targetMerchantId = dto.merchant_id ?? existing?.merchant_id ?? 1;
  const targetTableId = dto.table_id !== undefined ? dto.table_id : existing?.table_id;
  const tables = await fetchAvailableTables(targetMerchantId);

  if (dto.name && existing && dto.name.trim() !== existing.name.trim()) {
    const uniqueCheck = validateUniqueLocationName(dto.name, targetMerchantId, items, id);
    if (!uniqueCheck.valid) {
      throw new ApiError(uniqueCheck.error!, 400);
    }
  }

  const validation = validateTableMerchantContext(targetTableId, targetMerchantId, tables);
  if (!validation.valid) {
    throw new ApiError(validation.error || 'Table validation failed.', 400);
  }

  const currentType = dto.location_type ?? existing?.location_type ?? 'DINE_IN';
  const finalLocationType = syncLocationTypeWithTable(targetTableId, currentType);
  const token = getAccessToken();

  if (token) {
    const backendPayload: Record<string, unknown> = {};
    if (dto.name !== undefined) backendPayload.name = dto.name.trim();
    if (dto.merchant_id !== undefined) backendPayload.merchant = Number(dto.merchant_id);
    if (dto.qr_menu_id !== undefined) backendPayload.qrMenu = Number(dto.qr_menu_id);
    if (dto.table_id !== undefined) {
      if (dto.table_id && Number(dto.table_id) > 0) {
        backendPayload.table = Number(dto.table_id);
      }
    }
    if (dto.location_type !== undefined) {
      backendPayload.location_type = mapLocationTypeToBackend(finalLocationType);
    }
    if (dto.status !== undefined) {
      backendPayload.status = dto.status === 'active' ? 'active' : 'inactive';
    }
    if (dto.qr_code_url !== undefined) {
      backendPayload.qr_code_url = dto.qr_code_url;
    }
    if (dto.qr_code_image !== undefined) {
      backendPayload.qr_code_image = dto.qr_code_image;
    }

    try {
      const candidatePaths = ['/qr-locations', '/qr-location', '/v1/qr-locations', '/v1/qr-location'];
      let response: Response | null = null;
      for (const path of candidatePaths) {
        response = await fetch(`${API_BASE}${path}/${id}`, {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify(backendPayload),
        });
        if (response.status !== 404) break;
        const clone = response.clone();
        const errJson = await clone.json().catch(() => ({}));
        const msg = String(errJson.message || '');
        if (!msg.startsWith('Cannot PATCH')) break;
      }

      if (response && response.ok) {
        const updated = await response.json();
        const normalized = normalizeBackendQRLocation(updated.data ?? updated);
        return hydrateRelations(normalized);
      } else if (response) {
        const errorData = await response.json().catch(() => ({}));
        const message = Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : errorData.message || `Server responded with status ${response.status}`;
        throw new ApiError(message, response.status);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
    }
  }

  if (!existing) {
    throw new ApiError(`QR Location #${id} not found.`, 404);
  }

  const locHash = generateLocHash(dto.name ?? existing.name, id);
  const updatedUrl =
    dto.qr_code_url ||
    buildQrTargetUrl({
      qrMenuId: dto.qr_menu_id ?? existing.qr_menu_id,
      locHash,
      tableId: targetTableId,
    });
  const updatedImage =
    dto.qr_code_image || generateQrAssetImage(updatedUrl, dto.name ?? existing.name);

  const updatedItem: QRLocation = {
    ...existing,
    ...dto,
    location_type: finalLocationType,
    qr_code_url: updatedUrl,
    qr_code_image: updatedImage,
    updated_at: new Date().toISOString(),
  };

  const updatedList = items.map((i) => (i.id === id ? updatedItem : i));
  persistMockData(updatedList);
  return hydrateRelations(updatedItem);
}

/**
 * Bulk provisions QR Locations from floor plan tables.
 * Generates batch QRLocation records linked to the selected qr_menu_id in a single transactional payload.
 */
export async function bulkCreateQRLocations(
  dto: BulkCreateQRLocationsDto
): Promise<QRLocation[]> {
  const tables = await fetchAvailableTables(dto.merchant_id);
  const items = initializeMockData();
  const selectedTables = tables.filter((t) => dto.table_ids.includes(t.id));

  if (selectedTables.length === 0) {
    throw new ApiError('No matching physical tables found for bulk deployment.', 400);
  }

  const token = getAccessToken();
  if (token) {
    try {
      const backendPayload = {
        merchant: dto.merchant_id,
        qrMenu: dto.qr_menu_id,
        table_ids: dto.table_ids,
        status: dto.status,
        name_prefix: dto.name_prefix || 'Table',
      };
      const candidatePaths = ['/qr-locations/bulk', '/qr-location/bulk', '/v1/qr-locations/bulk'];
      for (const path of candidatePaths) {
        const response = await fetch(`${API_BASE}${path}`, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(backendPayload),
        });
        if (response.ok) {
          const json = await response.json();
          const rawList = (json.data ?? (Array.isArray(json) ? json : [])) as Array<Record<string, unknown>>;
          if (rawList.length > 0) {
            return rawList.map(normalizeBackendQRLocation).map(hydrateRelations);
          }
        }
        if (response.status !== 404) break;
      }

      // If backend has no dedicated bulk endpoint, provision through createQRLocation
      const createdBulk: QRLocation[] = [];
      for (const table of selectedTables) {
        const name = dto.name_prefix
          ? `${dto.name_prefix} ${table.number}`
          : `Table #${table.number} Access`;
        const loc = await createQRLocation({
          name,
          merchant_id: dto.merchant_id,
          qr_menu_id: dto.qr_menu_id,
          table_id: table.id,
          location_type: 'DINE_IN',
          status: dto.status,
        });
        createdBulk.push(loc);
      }
      if (createdBulk.length > 0) {
        return createdBulk;
      }
    } catch {
      // Fallback to local batch generation
    }
  }

  let nextId = items.length > 0 ? Math.max(...items.map((i) => i.id)) : 0;
  const newLocations: QRLocation[] = [];

  for (const table of selectedTables) {
    nextId += 1;
    const name = dto.name_prefix
      ? `${dto.name_prefix} ${table.number}`
      : `Table #${table.number} Access`;
    const locHash = generateLocHash(name, nextId);
    const targetUrl = buildQrTargetUrl({
      qrMenuId: dto.qr_menu_id,
      locHash,
      tableId: table.id,
    });
    const qrImage = generateQrAssetImage(targetUrl, name);

    const newLoc: QRLocation = {
      id: nextId,
      name,
      merchant_id: dto.merchant_id,
      qr_menu_id: dto.qr_menu_id,
      table_id: table.id,
      location_type: 'DINE_IN',
      status: dto.status,
      qr_code_url: targetUrl,
      qr_code_image: qrImage,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      table,
    };
    newLocations.push(newLoc);
  }

  const updatedList = [...newLocations, ...items];
  persistMockData(updatedList);
  return newLocations.map(hydrateRelations);
}

/**
 * Deletes a QR Location.
 */
export async function deleteQRLocation(id: number): Promise<void> {
  const token = getAccessToken();
  if (token) {
    try {
      const candidatePaths = ['/qr-locations', '/qr-location', '/v1/qr-locations', '/v1/qr-location'];
      for (const path of candidatePaths) {
        const response = await fetch(`${API_BASE}${path}/${id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (response.status !== 404) break;
        const clone = response.clone();
        const errJson = await clone.json().catch(() => ({}));
        const msg = String(errJson.message || '');
        if (!msg.startsWith('Cannot DELETE')) break;
      }
    } catch {
      // Ignore
    }
  }

  const items = initializeMockData();
  const updatedList = items.filter((i) => i.id !== id);
  persistMockData(updatedList);
}
