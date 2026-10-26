import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRMenuItemsView } from './QRMenuItemsView';
import type { QRMenu, QRMenuItem, QRMenuItemProductRef, QRMenuSection } from '../../../../types/qr-menu';
import * as qrMenuItemsApi from '../../../../api/qr-menu-items';
import * as qrMenuSectionsApi from '../../../../api/qr-menu-sections';
import * as qrMenusApi from '../../../../api/qr-menus';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QRMenuItemsView Workspace Component', () => {
  const mockMenus: QRMenu[] = [
    {
      id: 101,
      merchant_id: 3,
      name: 'Main Dinner & Cocktail Menu',
      description: 'Prime steaks & craft drinks',
      status: 'active',
      design_theme: 'Texas Theme',
      qr_type: 'Table',
    },
    {
      id: 102,
      merchant_id: 3,
      name: 'Lunch Express Menu',
      description: 'Business combos and light bites',
      status: 'active',
      design_theme: 'Modern Elegance',
      qr_type: 'Table',
    },
  ];

  const mockSections: QRMenuSection[] = [
    {
      id: 501,
      qr_menu_id: 101,
      name: 'Prime Steaks & Cuts',
      description: 'USDA Prime dry-aged steaks grilled over Texas coals.',
      status: 'active',
      display_order: 1,
      qrMenu: mockMenus[0],
    },
    {
      id: 502,
      qr_menu_id: 101,
      name: 'Craft Cocktails & Wine',
      description: 'Signature mixology.',
      status: 'active',
      display_order: 2,
      qrMenu: mockMenus[0],
    },
    {
      id: 504,
      qr_menu_id: 102,
      name: 'Executive Lunch Combos',
      description: 'Combos with drink.',
      status: 'active',
      display_order: 1,
      qrMenu: mockMenus[1],
    },
  ];

  const mockPOSProducts: QRMenuItemProductRef[] = [
    { id: 1, name: 'Bone-In Cowboy Ribeye (18oz)', sku: 'POS-STEAK-001', basePrice: 48.0, price: 48.0 },
    { id: 4, name: 'Smoked Bourbon Old Fashioned', sku: 'POS-BAR-004', basePrice: 16.0, price: 16.0 },
    { id: 7, name: 'Wagyu Smash Burger Combo', sku: 'POS-BURGER-007', basePrice: 17.5, price: 17.5 },
  ];

  const mockItems: QRMenuItem[] = [
    {
      id: 9001,
      merchant_id: 3,
      qr_menu_section_id: 501,
      product_id: 1,
      product_name: 'Bone-In Cowboy Ribeye (18oz)',
      name: 'Bone-In Cowboy Ribeye (18oz)',
      description: '18oz USDA Prime cut served with charred marrow butter.',
      image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947',
      price: 48.0,
      display_order: 1,
      is_available: true,
      is_visible: true,
      status: 'active',
      qrMenuSection: mockSections[0],
      product: mockPOSProducts[0],
    },
    {
      id: 9003,
      merchant_id: 3,
      qr_menu_section_id: 501,
      product_id: null, // Standalone item
      name: 'Wood-Grilled Cedar Plank Salmon',
      description: 'Atlantic salmon roasted over cedar.',
      image_url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288',
      price: 32.0,
      display_order: 2,
      is_available: false, // 86'd out of stock
      is_visible: true,
      status: 'inactive',
      qrMenuSection: mockSections[0],
      product: null,
    },
    {
      id: 9004,
      merchant_id: 3,
      qr_menu_section_id: 502,
      product_id: 4,
      product_name: 'Smoked Bourbon Old Fashioned',
      name: 'Smoked Bourbon Old Fashioned',
      description: 'Small batch bourbon infused with cherrywood smoke.',
      image_url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b',
      price: 16.0,
      display_order: 1,
      is_available: true,
      is_visible: true,
      status: 'archived',
      qrMenuSection: mockSections[1],
      product: mockPOSProducts[1],
    },
  ];

  beforeEach(() => {
    vi.spyOn(qrMenuItemsApi, 'getQRMenuItems').mockResolvedValue(mockItems);
    vi.spyOn(qrMenuItemsApi, 'getPOSProducts').mockResolvedValue(mockPOSProducts);
    vi.spyOn(qrMenuSectionsApi, 'getQRMenuSections').mockResolvedValue(mockSections);
    vi.spyOn(qrMenusApi, 'getQRMenus').mockResolvedValue(mockMenus);
    vi.spyOn(qrMenuItemsApi, 'toggleQRMenuItemAvailability').mockImplementation(async (id, isAvailable) => {
      const it = mockItems.find((i) => i.id === id);
      return { ...it!, is_available: isAvailable, is_visible: isAvailable };
    });
    vi.spyOn(qrMenuItemsApi, 'deleteQRMenuItem').mockResolvedValue({ success: true, id: 9003 });
    vi.spyOn(qrMenuItemsApi, 'createQRMenuItem').mockImplementation(async (dto) => {
      return {
        id: 9099,
        merchant_id: 3,
        qr_menu_section_id: dto.qr_menu_section_id,
        name: dto.name,
        price: dto.price,
        display_order: dto.display_order || 1,
        is_available: dto.is_available ?? true,
        status: dto.status || 'active',
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders workspace title, KPI metrics banner, and item directory view', async () => {
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('QR Menu Items Directory')).toBeInTheDocument();
    });

    // Check KPI metrics
    expect(screen.getByText('Total Dishes')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Available')).toBeInTheDocument();
    expect(screen.getAllByText(/86'd \/ Out of Stock/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('POS Mapped')).toBeInTheDocument();
    expect(screen.getByText('Average Price')).toBeInTheDocument();

    // Verify item badges and names rendered in table
    expect(screen.getByText('#QR-ITM-9001')).toBeInTheDocument();
    expect(screen.getAllByText('Bone-In Cowboy Ribeye (18oz)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('#QR-ITM-9003')).toBeInTheDocument();
    expect(screen.getByText('Wood-Grilled Cedar Plank Salmon')).toBeInTheDocument();

    // Verify price formatting in monospace
    expect(screen.getByText('$48.00')).toBeInTheDocument();
    expect(screen.getAllByText('$32.00').length).toBeGreaterThanOrEqual(1);

    // Verify section name
    expect(screen.getAllByText('Prime Steaks & Cuts').length).toBeGreaterThan(0);

    // Verify POS product reference vs Standalone QR Item
    expect(screen.getAllByText(/Bone-In Cowboy Ribeye \(18oz\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Standalone QR Item')).toBeInTheDocument();

    // Verify status pills
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('filters items correctly using universal search', async () => {
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ITM-9001')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search dish/i);
    fireEvent.change(searchInput, { target: { value: 'Salmon' } });

    expect(screen.getByText('Wood-Grilled Cedar Plank Salmon')).toBeInTheDocument();
    expect(screen.queryByText('#QR-ITM-9001')).not.toBeInTheDocument();
  });

  it('filters items by kitchen availability (Available vs 86d)', async () => {
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ITM-9001')).toBeInTheDocument();
    });

    // Select "86'd / Out of Stock"
    const selects = screen.getAllByRole('combobox');
    const availabilitySelect = selects.find((sel) => sel.innerHTML.includes('All Availability'));
    expect(availabilitySelect).toBeDefined();

    fireEvent.change(availabilitySelect!, { target: { value: 'out_of_stock' } });

    expect(screen.getByText('Wood-Grilled Cedar Plank Salmon')).toBeInTheDocument();
    expect(screen.queryByText('#QR-ITM-9001')).not.toBeInTheDocument();
  });

  it('toggles kitchen availability in real time and triggers instant stock update', async () => {
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ITM-9001')).toBeInTheDocument();
    });

    // Find the toggle button for item 9001
    const toggleButtons = screen.getAllByRole('switch');
    expect(toggleButtons.length).toBeGreaterThan(0);

    // Toggle 9001 from available (true) to 86'd (false)
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(qrMenuItemsApi.toggleQRMenuItemAvailability).toHaveBeenCalledWith(9001, false);
      expect(screen.getByText(/marked as 86'd/i)).toBeInTheDocument();
    });
  });

  it('switches between Table view and Grid cards view', async () => {
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ITM-9001')).toBeInTheDocument();
    });

    const gridViewBtn = screen.getByTitle('Grid Cards View');
    fireEvent.click(gridViewBtn);

    // In grid view, sequence badge format "Seq #1" is rendered
    expect(screen.getAllByText('Seq #1').length).toBeGreaterThanOrEqual(1);

    const tableViewBtn = screen.getByTitle('Table View');
    fireEvent.click(tableViewBtn);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('opens create drawer when Add Menu Item button is clicked', async () => {
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Add Menu Item')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Menu Item'));

    expect(screen.getByRole('heading', { name: 'Create QR Menu Item' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Dish Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Selling Price/i)).toBeInTheDocument();
  });

  it('deletes an item with confirmation modal', async () => {
    const user = userEvent.setup();
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Wood-Grilled Cedar Plank Salmon')).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle('Delete Item');
    await user.click(deleteBtns[1]); // Delete Salmon

    expect(screen.getByText('Delete Menu Item')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();

    const confirmBtn = screen.getByText('Confirm Delete');
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(qrMenuItemsApi.deleteQRMenuItem).toHaveBeenCalledWith(9003);
    });
  });

  it('accurately computes and displays KPI Summary banner metrics (total, active available, 86d, POS ratio)', async () => {
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Total QR Items')).toBeInTheDocument();
    });

    // Total dishes: 3
    const totalCard = screen.getByText('Total QR Items').closest('.rounded-2xl');
    expect(totalCard).toHaveTextContent('3');

    // Active available: 1 (only 9001 has status 'active' and is_available true; 9003 is inactive, 9004 is archived)
    const activeCard = screen.getByText('Active Available Items').closest('.rounded-2xl');
    expect(activeCard).toHaveTextContent('1');

    // Out of Stock: 1 (9003 has is_available: false)
    const outOfStockCard = screen.getByText("Out of Stock (86'd)").closest('.rounded-2xl');
    expect(outOfStockCard).toHaveTextContent('1');

    // POS Linked Ratio: 67% (2 out of 3 items mapped to product_id)
    const posRatioCard = screen.getByText('POS Linked Ratio').closest('.rounded-2xl');
    expect(posRatioCard).toHaveTextContent('67%');
  });

  it('dynamically multi-filters by section, status checkboxes, and price without page reloads', async () => {
    render(<QRMenuItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getAllByText('Bone-In Cowboy Ribeye (18oz)').length).toBeGreaterThanOrEqual(1);
    });

    // 1. Filter by Section dropdown (Select Craft Cocktails & Wine - ID 502)
    const selects = screen.getAllByRole('combobox');
    const sectionSelect = selects.find((sel) => sel.innerHTML.includes('All Menu Sections'));
    expect(sectionSelect).toBeDefined();

    fireEvent.change(sectionSelect!, { target: { value: '502' } });

    // Only cocktail should be visible
    expect(screen.getAllByText('Smoked Bourbon Old Fashioned').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('#QR-ITM-9001')).not.toBeInTheDocument();
    expect(screen.queryByText('Wood-Grilled Cedar Plank Salmon')).not.toBeInTheDocument();

    // Reset section filter back to All
    fireEvent.change(sectionSelect!, { target: { value: '0' } });
    expect(screen.getAllByText('Bone-In Cowboy Ribeye (18oz)').length).toBeGreaterThanOrEqual(1);

    // 2. Filter using Universal Search by price: "48.00"
    const searchInput = screen.getByPlaceholderText(/Search dish/i);
    fireEvent.change(searchInput, { target: { value: '48.00' } });

    expect(screen.getAllByText('Bone-In Cowboy Ribeye (18oz)').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Smoked Bourbon Old Fashioned')).not.toBeInTheDocument();
    expect(screen.queryByText('Wood-Grilled Cedar Plank Salmon')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });

    // 3. Status Checkbox filtering: uncheck 'archived'
    const archivedCheckbox = screen.getByLabelText(/archived/i);
    expect(archivedCheckbox).toBeChecked();
    fireEvent.click(archivedCheckbox); // Uncheck archived

    // Archived item (Old Fashioned) should be hidden
    expect(screen.queryByText('Smoked Bourbon Old Fashioned')).not.toBeInTheDocument();
    expect(screen.getAllByText('Bone-In Cowboy Ribeye (18oz)').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render duplicate embedded navigation hub as global ModuleNavHubBar handles navigation', async () => {
    const onNavigate = vi.fn();
    render(<QRMenuItemsView merchantId={3} onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('QR Menu Items Directory')).toBeInTheDocument();
    });

    // Verify no redundant embedded Navigation Hub is rendered inside the view
    expect(screen.queryByText('Navigation Hub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-hub-menu-items')).not.toBeInTheDocument();
  });
});
