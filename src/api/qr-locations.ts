import type {
  BulkCreateQRLocationsDto,
  CreateQRLocationDto,
  MerchantRef,
  QRLocation,
  QRMenuRef,
  QRLocationStatus,
  QRMenuType,
  TableRef,
  UpdateQRLocationDto,
} from '../types/qr-location';
import {
  buildDispatchOrderUrl,
  buildQrLandingUrl,
  generateQrAssetImage,
  syncLocationTypeWithTable,
  validateTableMerchantContext,
  validateUniqueLocationName,
  validateQRLocationPayload,
} from '../lib/qr-location';
import { ApiError } from '../lib/api-error';
import {
  apiRequest,
  unwrapItem,
  unwrapList,
  type MaybeEnvelopedItem,
  type MaybeEnvelopedList,
} from './http';

// Rutas del backend (NestJS, prefijo global /api): qr-locations, qr-menus, tables, merchants.
const QR_LOCATIONS = '/qr-locations';
// El DTO de mesas limita `limit` a 100; mismo tope para el resto de listas auxiliares.
const LIST_LIMIT = 100;
const STORAGE_KEY = 'x7_qr_locations_mock_db';

export function initializeMockData(): QRLocation[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Fallback to seed
      }
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

  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialList));
  }
  return initialList;
}

export function persistMockData(items: QRLocation[]): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
}

// Cache for live fetched entities so relations can be hydrated even if backend only returns scalar IDs
let _cachedMerchants: MerchantRef[] = [];
let _cachedMenus: QRMenuRef[] = [];
let _cachedTables: TableRef[] = [];

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

// Raw backend shapes (TypeORM entities may return relations or plain foreign keys)
interface BackendQRLocation {
  id: number;
  name: string;
  merchant?: MerchantRef;
  merchant_id?: number;
  qrMenu?: QRMenuRef;
  qr_menu_id?: number;
  table?: TableRef | null;
  table_id?: number | null;
  location_type: string;
  status?: QRLocationStatus;
  qr_code_url?: string;
  qr_code_image?: string;
  created_at?: string;
  updated_at?: string;
}

interface BackendMerchant {
  id: number;
  name: string;
  code?: string | null;
}

interface BackendQRMenu {
  id: number;
  name?: string;
  title?: string;
  status?: string;
  merchant?: { id: number } | null;
  merchant_id?: number;
}

interface BackendTable {
  id: number;
  number: string | number;
  merchant?: { id: number } | null;
  merchant_id?: number;
  capacity?: number;
  floorZone?: { name?: string } | null;
  zone?: { name?: string } | null;
  zone_name?: string;
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

function normalizeBackendQRLocation(item: BackendQRLocation): QRLocation {
  const merchantId = item.merchant?.id ?? item.merchant_id ?? 0;
  const qrMenuId = item.qrMenu?.id ?? item.qr_menu_id ?? 0;
  const tableId = item.table?.id ?? item.table_id ?? null;
  const locType = mapBackendLocationTypeToFrontend(item.location_type);

  const locId = item.id;
  const url = item.qr_code_url || buildQrLandingUrl(merchantId, locId);
  const img = item.qr_code_image || generateQrAssetImage(url, item.name);

  return {
    id: locId,
    name: item.name,
    merchant_id: merchantId,
    qr_menu_id: qrMenuId,
    table_id: tableId,
    location_type: locType,
    status: item.status || 'active',
    qr_code_url: url,
    qr_code_image: img,
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || new Date().toISOString(),
    merchant: item.merchant,
    qrMenu: item.qrMenu,
    table: item.table,
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

  const cachedMenu =
    _cachedMenus.find((m) => m.id === item.qr_menu_id) ||
    MOCK_MENUS.find((m) => m.id === item.qr_menu_id);

  const qrMenu: QRMenuRef = item.qrMenu
    ? {
        ...item.qrMenu,
        design_theme: item.qrMenu.design_theme || cachedMenu?.design_theme,
      }
    : cachedMenu || {
        id: item.qr_menu_id,
        name: `Menu #${item.qr_menu_id}`,
        is_active: true,
      };

  const cachedTable =
    item.table_id
      ? _cachedTables.find((t) => t.id === item.table_id) ||
        MOCK_TABLES.find((t) => t.id === item.table_id)
      : null;

  const foundTable = item.table_id
    ? item.table
      ? {
          ...item.table,
          number: String(item.table.number || cachedTable?.number || item.table_id),
          merchant_id: item.table.merchant_id ?? item.merchant_id,
          zone_name: item.table.zone_name || cachedTable?.zone_name,
        }
      : cachedTable || {
          id: item.table_id,
          number: `${item.table_id}`,
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
 * Sucursales (comercios) de la compañía del usuario.
 */
export async function fetchAvailableMerchants(): Promise<MerchantRef[]> {
  try {
    const json = await apiRequest<MaybeEnvelopedList<BackendMerchant>>(
      '/merchants/company/branches',
      { method: 'GET' },
      'Failed to load merchants. Please try again.',
    );
    const list: MerchantRef[] = unwrapList(json).map((m) => ({
      id: m.id,
      name: m.name,
      code: m.code || `MCH-${m.id}`,
    }));
    _cachedMerchants = list;
    return list;
  } catch {
    return _cachedMerchants.length > 0 ? _cachedMerchants : MOCK_MERCHANTS;
  }
}

/**
 * Menús QR disponibles, filtrados por comercio cuando se indica.
 */
export async function fetchAvailableQRMenus(merchantId?: number): Promise<QRMenuRef[]> {
  try {
    const json = await apiRequest<MaybeEnvelopedList<BackendQRMenu>>(
      `/qr-menus?limit=${LIST_LIMIT}`,
      { method: 'GET' },
      'Failed to load QR menus. Please try again.',
    );
    const rawList = unwrapList(json);
    const toRef = (m: BackendQRMenu): QRMenuRef => {
      const mock = MOCK_MENUS.find((mockM) => mockM.id === m.id);
      return {
        id: m.id,
        name: m.name || m.title || mock?.name || `Menu #${m.id}`,
        is_active: m.status ? m.status === 'active' : true,
        design_theme: mock?.design_theme,
      };
    };
    _cachedMenus = rawList.map(toRef);

    if (!merchantId) return _cachedMenus;
    return rawList
      .filter((m) => !m.merchant || m.merchant.id === merchantId || m.merchant_id === merchantId)
      .map(toRef);
  } catch {
    const fallback = _cachedMenus.length > 0 ? _cachedMenus : MOCK_MENUS;
    if (!merchantId) return fallback;
    return fallback.filter((m) => !m.merchant_id || m.merchant_id === merchantId);
  }
}

/**
 * Mesas del salón, filtradas por comercio cuando se indica.
 */
export async function fetchAvailableTables(merchantId?: number): Promise<TableRef[]> {
  try {
    const json = await apiRequest<MaybeEnvelopedList<BackendTable>>(
      `/tables?limit=${LIST_LIMIT}`,
      { method: 'GET' },
      'Failed to load tables. Please try again.',
    );
    const mapped: TableRef[] = unwrapList(json).map((t) => {
      const mock = MOCK_TABLES.find((mockT) => mockT.id === t.id);
      return {
        id: t.id,
        number: String(t.number),
        merchant_id: t.merchant?.id ?? t.merchant_id ?? (merchantId || 0),
        capacity: t.capacity,
        zone_name: t.floorZone?.name ?? t.zone?.name ?? t.zone_name ?? mock?.zone_name,
      };
    });
    _cachedTables = mapped;

    if (!merchantId) return mapped;
    return mapped.filter((t) => !t.merchant_id || t.merchant_id === merchantId);
  } catch {
    const fallback = _cachedTables.length > 0 ? _cachedTables : MOCK_TABLES;
    if (!merchantId) return fallback;
    return fallback.filter((t) => !t.merchant_id || t.merchant_id === merchantId);
  }
}

/**
 * Puntos de acceso QR (activos e inactivos; el backend excluye los borrados).
 */
export async function getQRLocations(merchantId?: number): Promise<QRLocation[]> {
  try {
    const json = await apiRequest<MaybeEnvelopedList<BackendQRLocation>>(
      `${QR_LOCATIONS}?limit=${LIST_LIMIT}`,
      { method: 'GET' },
      'Failed to load QR Locations directory.',
    );
    const normalized = unwrapList(json).map(normalizeBackendQRLocation);
    const filtered = merchantId
      ? normalized.filter((loc) => !loc.merchant_id || loc.merchant_id === merchantId)
      : normalized;
    return filtered.map(hydrateRelations);
  } catch {
    const items = initializeMockData();
    const filtered = merchantId ? items.filter((i) => i.merchant_id === merchantId) : items;
    return filtered.map(hydrateRelations);
  }
}

/**
 * Crea un punto de acceso QR. Valida nombre único y mesa contra los datos reales del comercio.
 */
export async function createQRLocation(dto: CreateQRLocationDto): Promise<QRLocation> {
  const [items, tables] = await Promise.all([
    getQRLocations(dto.merchant_id),
    fetchAvailableTables(dto.merchant_id),
  ]);

  const payloadCheck = validateQRLocationPayload(dto, dto.merchant_id, items, tables);
  if (!payloadCheck.valid) {
    throw new ApiError(payloadCheck.error || 'Validation failed.', 400);
  }

  // Business Rule: Table Association Sync
  const finalLocationType = syncLocationTypeWithTable(dto.table_id, dto.location_type);
  const tempUrl = buildQrLandingUrl(dto.merchant_id, 'new');

  const backendPayload: Record<string, unknown> = {
    merchant: Number(dto.merchant_id),
    qrMenu: Number(dto.qr_menu_id),
    name: dto.name.trim(),
    location_type: mapLocationTypeToBackend(finalLocationType),
    status: dto.status === 'active' ? 'active' : 'inactive',
    qr_code_url: dto.qr_code_url || tempUrl,
    qr_code_image: dto.qr_code_image || generateQrAssetImage(tempUrl, dto.name),
  };
  if (dto.table_id && Number(dto.table_id) > 0) {
    backendPayload.table = Number(dto.table_id);
  }

  try {
    const created = await apiRequest<MaybeEnvelopedItem<BackendQRLocation>>(
      QR_LOCATIONS,
      { method: 'POST', body: JSON.stringify(backendPayload) },
      'Failed to save QR Location.',
    );
    return hydrateRelations(normalizeBackendQRLocation(unwrapItem(created)));
  } catch (err) {
    if (err instanceof ApiError && err.status !== 404) {
      throw err;
    }
    const mockItems = initializeMockData();
    const newId = mockItems.length > 0 ? Math.max(...mockItems.map((i) => i.id)) + 1 : 1;
    const qr_code_url = dto.qr_code_url || buildQrLandingUrl(dto.merchant_id, newId);
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
    persistMockData([newItem, ...mockItems]);
    return hydrateRelations(newItem);
  }
}

/**
 * Actualiza un punto de acceso QR.
 */
export async function updateQRLocation(
  id: number,
  dto: UpdateQRLocationDto
): Promise<QRLocation> {
  const items = await getQRLocations();
  const existing = items.find((i) => i.id === id);
  if (!existing) {
    throw new ApiError(`QR Location #${id} not found.`, 404);
  }

  const targetMerchantId = dto.merchant_id ?? existing.merchant_id;
  const targetTableId = dto.table_id !== undefined ? dto.table_id : existing.table_id;
  const tables = await fetchAvailableTables(targetMerchantId);

  if (dto.name && dto.name.trim() !== existing.name.trim()) {
    const uniqueCheck = validateUniqueLocationName(dto.name, targetMerchantId, items, id);
    if (!uniqueCheck.valid) {
      throw new ApiError(uniqueCheck.error!, 400);
    }
  }

  const validation = validateTableMerchantContext(targetTableId, targetMerchantId, tables);
  if (!validation.valid) {
    throw new ApiError(validation.error || 'Table validation failed.', 400);
  }

  const currentType = dto.location_type ?? existing.location_type;
  const finalLocationType = syncLocationTypeWithTable(targetTableId, currentType);

  const backendPayload: Record<string, unknown> = {};
  if (dto.name !== undefined) backendPayload.name = dto.name.trim();
  if (dto.merchant_id !== undefined) backendPayload.merchant = Number(dto.merchant_id);
  if (dto.qr_menu_id !== undefined) backendPayload.qrMenu = Number(dto.qr_menu_id);
  if (dto.table_id !== undefined) {
    if (dto.table_id && Number(dto.table_id) > 0) {
      backendPayload.table = Number(dto.table_id);
    } else {
      backendPayload.table = null;
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
    const updated = await apiRequest<MaybeEnvelopedItem<BackendQRLocation>>(
      `${QR_LOCATIONS}/${id}`,
      { method: 'PATCH', body: JSON.stringify(backendPayload) },
      'Failed to save QR Location.',
    );
    return hydrateRelations(normalizeBackendQRLocation(unwrapItem(updated)));
  } catch (err) {
    if (err instanceof ApiError && err.status !== 404) {
      throw err;
    }
    const mockItems = initializeMockData();
    const updatedUrl = dto.qr_code_url || buildQrLandingUrl(targetMerchantId, id);
    const updatedImage = dto.qr_code_image || generateQrAssetImage(updatedUrl, dto.name ?? existing.name);
    const updatedItem: QRLocation = {
      ...existing,
      ...dto,
      location_type: finalLocationType,
      qr_code_url: updatedUrl,
      qr_code_image: updatedImage,
      updated_at: new Date().toISOString(),
    };
    persistMockData(mockItems.map((i) => (i.id === id ? updatedItem : i)));
    return hydrateRelations(updatedItem);
  }
}

/**
 * Bulk provisions QR Locations from floor plan tables.
 * Generates batch QRLocation records linked to the selected qr_menu_id in a single transactional payload.
 */
export async function bulkCreateQRLocations(
  dto: BulkCreateQRLocationsDto
): Promise<QRLocation[]> {
  let tables: TableRef[];
  try {
    tables = await fetchAvailableTables(dto.merchant_id);
  } catch {
    tables = _cachedTables.length > 0 ? _cachedTables : MOCK_TABLES;
  }
  let selectedTables = tables.filter((t) => dto.table_ids.includes(t.id));

  if (selectedTables.length === 0) {
    selectedTables = dto.table_ids.map((id) => {
      const mock = MOCK_TABLES.find((t) => t.id === id);
      return {
        id,
        number: mock ? mock.number : String(id),
        merchant_id: dto.merchant_id,
        capacity: mock?.capacity,
        zone_name: mock?.zone_name || 'Main Dining Room',
      };
    });
  }

  try {
    const backendPayload = {
      merchant: dto.merchant_id,
      qrMenu: dto.qr_menu_id,
      table_ids: dto.table_ids,
      status: dto.status,
      name_prefix: dto.name_prefix || 'Table',
    };
    const json = await apiRequest<MaybeEnvelopedList<BackendQRLocation>>(
      `${QR_LOCATIONS}/bulk`,
      { method: 'POST', body: JSON.stringify(backendPayload) },
      'Failed to bulk create QR locations.',
    );
    const rawList = unwrapList(json);
    if (rawList.length > 0) {
      return rawList.map(normalizeBackendQRLocation).map(hydrateRelations);
    }
  } catch {
    // Fallback to local batch generation when bulk API is not reachable or in test environments
  }

  const items = initializeMockData();
  const createdBulk: QRLocation[] = [];
  let nextId = items.length > 0 ? Math.max(...items.map((i) => i.id)) : Date.now();
  for (const table of selectedTables) {
    nextId += 1;
    const name = dto.name_prefix
      ? `${dto.name_prefix} ${table.number}`
      : `Table #${table.number} Access`;
    const url = buildQrLandingUrl(dto.merchant_id, nextId);
    const img = generateQrAssetImage(url, name);
    const loc: QRLocation = {
      id: nextId,
      name,
      merchant_id: dto.merchant_id,
      qr_menu_id: dto.qr_menu_id,
      table_id: table.id,
      location_type: 'DINE_IN',
      status: dto.status,
      qr_code_url: url,
      qr_code_image: img,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      table,
    };
    createdBulk.push(hydrateRelations(loc));
  }
  persistMockData([...createdBulk, ...items]);
  return createdBulk;
}

/**
 * Borra (soft delete en el backend: status = 'deleted') un punto de acceso QR.
 */
export async function deleteQRLocation(id: number): Promise<void> {
  try {
    await apiRequest<void>(
      `${QR_LOCATIONS}/${id}`,
      { method: 'DELETE' },
      'Failed to delete QR Location.',
    );
  } catch {
    // Fallback for mock persistence
  }
  const items = initializeMockData();
  persistMockData(items.filter((i) => i.id !== id));
}
