// Domain logic and business rules for QR Location management.
import type { CreateQRLocationDto, QRLocation, QRLocationStatus, QRMenuType, TableRef } from '../types/qr-location';
import { generateQrMatrix, generateQrSvgDataUrl } from './qr-generator';

export const BASE_QR_SCAN_URL = 'https://menu.x7pos.com';

/**
 * Generates a compact deterministic/time-based location hash for URL tracking.
 */
export function generateLocHash(name: string, seed?: number | string): string {
  const str = `${name}_${seed ?? Date.now()}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).padStart(6, '0').slice(-6);
}

/**
 * Target URL Generator formula:
 * Target URL = base_tenant_domain + "/menu/" + qr_menu_id + "?loc=" + loc_hash + "&table=" + table_id
 */
export function buildQrTargetUrl(params: {
  baseDomain?: string;
  qrMenuId: number | string;
  locHash: string;
  tableId?: number | null;
}): string {
  const base = params.baseDomain || BASE_QR_SCAN_URL;
  const encodedLoc = encodeURIComponent(params.locHash);
  let url = `${base}/menu/${encodeURIComponent(String(params.qrMenuId))}?loc=${encodedLoc}`;
  if (params.tableId !== null && params.tableId !== undefined && Number(params.tableId) > 0) {
    url += `&table=${encodeURIComponent(String(params.tableId))}`;
  }
  return url;
}

/**
 * Dispatch web URI formula:
 * https://order.x7pos.com/{merchant_slug}/t/{table_id}?menu={qr_menu_id}
 */
export function buildDispatchOrderUrl(params: {
  merchantSlug?: string;
  tableId?: number | null;
  qrMenuId: number | string;
  locHash?: string;
}): string {
  const slug = encodeURIComponent(params.merchantSlug || 'menu');
  const tablePart = params.tableId ? `/t/${encodeURIComponent(String(params.tableId))}` : '';
  let url = `https://order.x7pos.com/${slug}${tablePart}?menu=${encodeURIComponent(String(params.qrMenuId))}`;
  if (params.locHash) {
    url += `&loc=${encodeURIComponent(params.locHash)}`;
  }
  return url;
}

/**
 * Returns Google Material Symbol name for a given location type.
 */
export function getLocationTypeIcon(type: QRMenuType): string {
  switch (type) {
    case 'DINE_IN':
      return 'table_restaurant';
    case 'PICKUP':
      return 'storefront';
    case 'DELIVERY':
      return 'local_shipping';
    case 'ROOM_SERVICE':
      return 'room_service';
    default:
      return 'qr_code_2';
  }
}

/**
 * Builds target landing URL stored in qr_code_url:
 * e.g., https://menu.x7pos.com/m/{merchant_id}/loc/{id}
 */
export function buildQrLandingUrl(merchantId: number, locationId: number | string): string {
  return `${BASE_QR_SCAN_URL}/m/${merchantId}/loc/${locationId}`;
}

/**
 * Unique Location Naming Validation: Prevents duplicate location names under the same merchant.
 */
export function validateUniqueLocationName(
  name: string,
  merchantId: number,
  locations: QRLocation[],
  currentId?: number
): { valid: boolean; error?: string } {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, error: 'Location name is required.' };
  }

  const duplicate = locations.find(
    (loc) =>
      loc.merchant_id === merchantId &&
      loc.id !== currentId &&
      loc.name.trim().toLowerCase() === trimmed
  );

  if (duplicate) {
    return {
      valid: false,
      error: `A QR location with name "${name.trim()}" already exists for this merchant (#QR-LOC-${duplicate.id}). Location names must be unique.`,
    };
  }

  return { valid: true };
}

/**
 * Duplication Guard: Prevents assigning multiple active deployments of the same qr_menu_id to the exact same physical table_id.
 */
export function validateDuplicateActiveTableDeployment(
  dto: { qr_menu_id: number; table_id?: number | null; status?: QRLocationStatus },
  locations: QRLocation[],
  currentId?: number,
  tables?: TableRef[]
): { valid: boolean; error?: string } {
  if (dto.status !== 'active') {
    return { valid: true };
  }
  if (!dto.table_id || Number(dto.table_id) <= 0) {
    return { valid: true };
  }
  const duplicate = locations.find(
    (loc) =>
      loc.id !== currentId &&
      loc.status === 'active' &&
      Number(loc.qr_menu_id) === Number(dto.qr_menu_id) &&
      Number(loc.table_id) === Number(dto.table_id)
  );
  if (duplicate) {
    const tableNum =
      duplicate.table?.number ||
      tables?.find((t) => t.id === duplicate.table_id)?.number ||
      duplicate.table_id;
    return {
      valid: false,
      error: `An active deployment for this QR Menu already exists on Table #${tableNum} (Deployment #QR-LOC-${duplicate.id}). A physical table cannot have multiple active deployments of the same menu.`,
    };
  }
  return { valid: true };
}

/**
 * Table Validation: Ensures table_id belongs to the same merchant_id context.
 */
export function validateTableMerchantContext(
  tableId: number | null | undefined,
  merchantId: number,
  tables: TableRef[]
): { valid: boolean; error?: string } {
  if (tableId === null || tableId === undefined || tableId === 0) {
    return { valid: true };
  }

  const table = tables.find((t) => t.id === tableId);
  if (!table) {
    return { valid: false, error: `Table #${tableId} was not found.` };
  }

  if (table.merchant_id !== merchantId) {
    return {
      valid: false,
      error: `Table #${table.number} (ID ${table.id}) belongs to merchant #${table.merchant_id}, which does not match active merchant #${merchantId}.`,
    };
  }

  return { valid: true };
}

/**
 * Full Form Payload Validation Matrix:
 * Enforces required fields (name, qr_menu_id, location_type, status),
 * validates that table_id is supplied if location_type = 'DINE_IN' (or 'dine_in'),
 * name length <= 100 characters, table merchant context, and duplication guard.
 */
export function validateQRLocationPayload(
  dto: Partial<CreateQRLocationDto>,
  merchantId: number,
  locations: QRLocation[],
  tables: TableRef[],
  currentId?: number
): { valid: boolean; error?: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  // Name validation
  if (!dto.name || !dto.name.trim()) {
    fieldErrors.name = 'Location name is required.';
  } else if (dto.name.length > 100) {
    fieldErrors.name = 'Location name cannot exceed 100 characters.';
  } else {
    const uniqueCheck = validateUniqueLocationName(dto.name, merchantId, locations, currentId);
    if (!uniqueCheck.valid) {
      fieldErrors.name = uniqueCheck.error!;
    }
  }

  // QR Menu validation
  if (!dto.qr_menu_id || dto.qr_menu_id <= 0) {
    fieldErrors.qr_menu_id = 'A valid QR Menu must be assigned.';
  }

  // Location Type validation
  if (!dto.location_type) {
    fieldErrors.location_type = 'Location type classification is required.';
  }

  // Status validation
  if (!dto.status) {
    fieldErrors.status = 'Operational status is required.';
  }

  // Conditional Dining Table Validation: Mandatory when location_type = 'DINE_IN' / 'dine_in'
  const isDineIn = dto.location_type === 'DINE_IN' || String(dto.location_type || '').toLowerCase() === 'dine_in';
  if (isDineIn) {
    if (dto.table_id === null || dto.table_id === undefined || Number(dto.table_id) <= 0) {
      fieldErrors.table_id = 'A physical dining table is required when location type is Dine-In.';
    }
  }

  // Table merchant context validation
  if (dto.table_id && Number(dto.table_id) > 0) {
    const tableCheck = validateTableMerchantContext(dto.table_id, merchantId, tables);
    if (!tableCheck.valid) {
      fieldErrors.table_id = tableCheck.error!;
    }
  }

  // Duplication Guard: Prevents assigning multiple active deployments of the same qr_menu_id to the exact same physical table_id
  if (dto.qr_menu_id && dto.table_id && dto.status) {
    const dupCheck = validateDuplicateActiveTableDeployment(
      {
        qr_menu_id: Number(dto.qr_menu_id),
        table_id: Number(dto.table_id),
        status: dto.status,
      },
      locations,
      currentId,
      tables
    );
    if (!dupCheck.valid) {
      fieldErrors.table_id = dupCheck.error!;
    }
  }

  const firstError = Object.values(fieldErrors)[0];
  return {
    valid: Object.keys(fieldErrors).length === 0,
    error: firstError,
    fieldErrors,
  };
}

/**
 * Table Association Sync: Linking a table_id automatically sets location_type context to DINE_IN
 * for dine-in auto-ordering.
 */
export function syncLocationTypeWithTable(
  tableId: number | null | undefined,
  currentType: QRMenuType
): QRMenuType {
  if (tableId !== null && tableId !== undefined && tableId > 0) {
    return 'DINE_IN';
  }
  return currentType;
}

/**
 * Real-time canvas render that generates QR bitmap / data URI (qr_code_image) whenever URL dependencies change.
 */
export function renderQrCodeToCanvas(
  canvas: HTMLCanvasElement,
  url: string,
  title?: string,
  options?: { size?: number; color?: string; bgColor?: string }
): string {
  const size = options?.size || 300;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const bgColor = options?.bgColor || '#ffffff';
  const color = options?.color || '#0f172a';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  const matrix = generateQrMatrix(url, 25);
  const padding = 20;
  const qrAreaSize = size - padding * 2;
  const cellSize = qrAreaSize / 25;

  ctx.fillStyle = color;
  for (let r = 0; r < 25; r++) {
    for (let c = 0; c < 25; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(
          padding + c * cellSize,
          padding + r * cellSize,
          cellSize + 0.1,
          cellSize + 0.1
        );
      }
    }
  }

  if (title) {
    ctx.fillStyle = color;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title.toUpperCase(), size / 2, size - 8);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Generates hosted SVG data stream or SVG string for qr_code_image.
 */
export function generateQrAssetImage(url: string, name?: string): string {
  return generateQrSvgDataUrl(url, {
    title: name ? name.toUpperCase() : 'SCAN FOR MENU',
    size: 300,
  });
}

/**
 * Converts SVG Data URL to high-resolution PNG Data URL using Canvas for high-DPI export.
 */
export function convertSvgToHighResPngDataUrl(
  svgDataUrl: string,
  width = 600,
  height = 600
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => reject(err);
    img.src = svgDataUrl;
  });
}
