import { describe, expect, it } from 'vitest';
import {
  buildQrLandingUrl,
  generateQrAssetImage,
  syncLocationTypeWithTable,
  validateQRLocationPayload,
  validateTableMerchantContext,
  validateUniqueLocationName,
} from './qr-location';
import type { QRLocation, TableRef } from '../types/qr-location';

describe('QR Location Domain Rules & Helpers', () => {
  const mockTables: TableRef[] = [
    { id: 10, number: '12', merchant_id: 3, capacity: 4 },
    { id: 20, number: 'Patio-01', merchant_id: 3, capacity: 2 },
    { id: 30, number: 'VIP-1', merchant_id: 1, capacity: 8 },
  ];

  const mockLocations: QRLocation[] = [
    {
      id: 1,
      name: 'Patio Table #12 Access',
      merchant_id: 3,
      qr_menu_id: 101,
      table_id: 10,
      location_type: 'DINE_IN',
      status: 'active',
      qr_code_url: 'https://menu.x7pos.com/m/3/loc/1',
      qr_code_image: 'data:image/svg+xml;utf8,<svg></svg>',
    },
    {
      id: 2,
      name: 'Curbside Pickup Point',
      merchant_id: 3,
      qr_menu_id: 104,
      table_id: null,
      location_type: 'PICKUP',
      status: 'active',
      qr_code_url: 'https://menu.x7pos.com/m/3/loc/2',
      qr_code_image: 'data:image/svg+xml;utf8,<svg></svg>',
    },
  ];

  it('builds public target landing scanning URL correctly', () => {
    const url = buildQrLandingUrl(3, 42);
    expect(url).toBe('https://menu.x7pos.com/m/3/loc/42');
  });

  it('validates table merchant context successfully when table belongs to merchant', () => {
    const result = validateTableMerchantContext(10, 3, mockTables);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('fails table validation when table belongs to a different merchant context', () => {
    const result = validateTableMerchantContext(30, 3, mockTables);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('belongs to merchant #1, which does not match active merchant #3');
  });

  it('allows null or undefined table_id for virtual access points', () => {
    expect(validateTableMerchantContext(null, 3, mockTables).valid).toBe(true);
    expect(validateTableMerchantContext(undefined, 3, mockTables).valid).toBe(true);
  });

  it('automatically sets location_type to DINE_IN when a physical table_id is linked', () => {
    expect(syncLocationTypeWithTable(10, 'PICKUP')).toBe('DINE_IN');
    expect(syncLocationTypeWithTable(10, 'DELIVERY')).toBe('DINE_IN');
  });

  it('preserves existing location_type when no physical table_id is linked', () => {
    expect(syncLocationTypeWithTable(null, 'PICKUP')).toBe('PICKUP');
    expect(syncLocationTypeWithTable(undefined, 'ROOM_SERVICE')).toBe('ROOM_SERVICE');
  });

  it('prevents duplicate location names under the same merchant', () => {
    const checkDuplicate = validateUniqueLocationName('Patio Table #12 Access', 3, mockLocations);
    expect(checkDuplicate.valid).toBe(false);
    expect(checkDuplicate.error).toContain('already exists for this merchant');

    const checkNew = validateUniqueLocationName('Terrace Sunset Bar', 3, mockLocations);
    expect(checkNew.valid).toBe(true);
  });

  it('enforces required fields (name, qr_menu_id, location_type, status) and max 100 chars name limit', () => {
    const invalidEmpty = validateQRLocationPayload({}, 3, mockLocations, mockTables);
    expect(invalidEmpty.valid).toBe(false);
    expect(invalidEmpty.fieldErrors.name).toBe('Location name is required.');
    expect(invalidEmpty.fieldErrors.qr_menu_id).toBe('A valid QR Menu must be assigned.');

    const invalidTooLong = validateQRLocationPayload(
      {
        name: 'a'.repeat(105),
        qr_menu_id: 101,
        location_type: 'DINE_IN',
        status: 'active',
      },
      3,
      mockLocations,
      mockTables
    );
    expect(invalidTooLong.valid).toBe(false);
    expect(invalidTooLong.fieldErrors.name).toContain('cannot exceed 100 characters');

    const validPayload = validateQRLocationPayload(
      {
        name: 'Unique Spot Name',
        qr_menu_id: 101,
        table_id: 20,
        location_type: 'DINE_IN',
        status: 'active',
      },
      3,
      mockLocations,
      mockTables
    );
    expect(validPayload.valid).toBe(true);
  });

  it('generates a valid SVG data URI asset for qr_code_image', () => {
    const url = 'https://menu.x7pos.com/m/3/loc/100';
    const svgDataUrl = generateQrAssetImage(url, 'Patio Table #12');
    expect(svgDataUrl).toContain('data:image/svg+xml');
    expect(svgDataUrl).toContain('%3Csvg');
  });
});
