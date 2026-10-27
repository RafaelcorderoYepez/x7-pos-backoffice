import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  getQRMenus,
  getQRMenuById,
  createQRMenu,
  updateQRMenu,
  deleteQRMenu,
} from './qr-menus';

vi.mock('../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => null), // Test local fallback store behavior
  clearAuthSession: vi.fn(),
}));

describe('qr-menus API store and mutation resilience', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('updates title, description, theme, type, and status reliably and persists to storage', async () => {
    const menus = await getQRMenus();
    expect(menus.length).toBeGreaterThan(0);
    const targetMenu = menus[0];

    const updated = await updateQRMenu(targetMenu.id, {
      name: 'Midnight Bistro Signature Menu',
      description: 'Exclusive late night cocktails and dry-aged cuts.',
      design_theme: 'Midnight Bistro',
      qr_type: 'Pickup',
      status: 'inactive',
    });

    expect(updated.name).toBe('Midnight Bistro Signature Menu');
    expect(updated.description).toBe('Exclusive late night cocktails and dry-aged cuts.');
    expect(updated.design_theme).toBe('Midnight Bistro');
    expect(updated.qr_type).toBe('Pickup');
    expect(updated.status).toBe('inactive');

    // Retrieve again to ensure persistence
    const reloaded = await getQRMenus();
    const found = reloaded.find((m) => m.id === targetMenu.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Midnight Bistro Signature Menu');
    expect(found?.description).toBe('Exclusive late night cocktails and dry-aged cuts.');
    expect(found?.design_theme).toBe('Midnight Bistro');
    expect(found?.qr_type).toBe('Pickup');
    expect(found?.status).toBe('inactive');
  });

  it('preserves relational section and item counts when updating', async () => {
    const menus = await getQRMenus();
    const targetMenu = menus[0];
    const initialSections = targetMenu.sections_count;
    const initialItems = targetMenu.items_count;

    const updated = await updateQRMenu(targetMenu.id, {
      name: 'Renamed Menu With Relations',
      design_theme: 'Modern Elegance',
    });

    expect(updated.sections_count).toBe(initialSections);
    expect(updated.items_count).toBe(initialItems);
  });

  it('creates and fetches menu by id, and deletes menu successfully', async () => {
    const created = await createQRMenu({
      name: 'Freshly Created Tasting Menu',
      description: 'Chef tasting special.',
      design_theme: 'Emerald Garden',
      qr_type: 'Table',
      status: 'active',
    });

    expect(created.name).toBe('Freshly Created Tasting Menu');

    const fetched = await getQRMenuById(created.id);
    expect(fetched.menu.id).toBe(created.id);
    expect(fetched.menu.name).toBe('Freshly Created Tasting Menu');

    await deleteQRMenu(created.id);
    const menusAfterDelete = await getQRMenus();
    expect(menusAfterDelete.some((m) => m.id === created.id)).toBe(false);
  });
});
