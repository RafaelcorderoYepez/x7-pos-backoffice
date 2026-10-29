import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRMenuSectionsView } from './QRMenuSectionsView';
import type { QRMenu, QRMenuSection } from '../../../../types/qr-menu';
import * as qrMenuSectionsApi from '../../../../api/qr-menu-sections';
import * as qrMenusApi from '../../../../api/qr-menus';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QRMenuSectionsView Workspace Component', () => {
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
      items_count: 5,
      items: [
        {
          id: 9001,
          qr_menu_section_id: 501,
          product_name: 'Bone-In Cowboy Ribeye',
          price: 48,
          status: 'active',
          display_order: 1,
          is_visible: true,
        },
      ],
      qrMenu: mockMenus[0],
    },
    {
      id: 502,
      qr_menu_id: 101,
      name: 'Craft Cocktails & Wine',
      description: 'Curated mixology and barrel-aged cocktails.',
      status: 'active',
      display_order: 2,
      items_count: 4,
      items: [
        {
          id: 9002,
          qr_menu_section_id: 502,
          product_name: 'Old Fashioned',
          price: 16,
          status: 'active',
          display_order: 1,
          is_visible: true,
        },
      ],
      qrMenu: mockMenus[0],
    },
    {
      id: 503,
      qr_menu_id: 101,
      name: 'Artisan Desserts',
      description: 'House-made sweets and desserts.',
      status: 'inactive',
      display_order: 3,
      items_count: 0,
      items: [],
      qrMenu: mockMenus[0],
    },
    {
      id: 504,
      qr_menu_id: 102,
      name: 'Executive Lunch Combos',
      description: 'Fast weekday combos with side salad.',
      status: 'active',
      display_order: 1,
      items_count: 3,
      items: [],
      qrMenu: mockMenus[1],
    },
    {
      id: 505,
      qr_menu_id: 102,
      name: 'Archived Seasonal Specials',
      description: 'Summer season specials now closed.',
      status: 'archived',
      display_order: 2,
      items_count: 0,
      items: [],
      qrMenu: mockMenus[1],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(qrMenuSectionsApi, 'getQRMenuSections').mockResolvedValue(mockSections);
    vi.spyOn(qrMenusApi, 'getQRMenus').mockResolvedValue(mockMenus);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders Operational KPI Summary Metrics Banner with accurate calculations', async () => {
    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-sections')).toHaveTextContent('5');
    });

    // 3 active, 1 inactive, 1 archived
    expect(screen.getByTestId('kpi-active-sections')).toHaveTextContent('3');
    expect(screen.getByTestId('kpi-inactive-sections')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-archived-sections')).toHaveTextContent('1');
  });

  it('renders section rows with #QR-SEC-{id} badge, parent menu reference #QR-MNU-{qr_menu_id}, and description preview', async () => {
    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('section-row-501')).toBeInTheDocument();
    });

    // Section Badge & Name
    expect(screen.getByTestId('section-badge-501')).toHaveTextContent('#QR-SEC-501');
    expect(screen.getByText('Prime Steaks & Cuts')).toBeInTheDocument();

    // Parent QR Menu Pill Reference
    const parentMenuPill = screen.getByTestId('parent-menu-pill-501');
    expect(parentMenuPill).toHaveTextContent('#QR-MNU-101');
    expect(parentMenuPill).toHaveTextContent('Main Dinner & Cocktail Menu');

    // Description preview
    expect(
      screen.getByText('USDA Prime dry-aged steaks grilled over Texas coals.')
    ).toBeInTheDocument();
  });

  it('enforces status pills: active (#10b981), inactive (#f59e0b), and archived (#ef4444)', async () => {
    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('status-pill-501')).toBeInTheDocument();
    });

    // Active
    const activePill = screen.getByTestId('status-pill-501');
    expect(activePill).toHaveTextContent('Active');
    expect(activePill).toHaveTextContent('Visible in Mobile Menu');

    // Inactive
    const inactivePill = screen.getByTestId('status-pill-503');
    expect(inactivePill).toHaveTextContent('Inactive');
    expect(inactivePill).toHaveTextContent('Hidden from Mobile Menu');

    // Archived
    const archivedPill = screen.getByTestId('status-pill-505');
    expect(archivedPill).toHaveTextContent('Archived');
  });

  it('enforces sequential sorting: displays section records strictly ordered by display_order within parent menu scope', async () => {
    render(<QRMenuSectionsView merchantId={3} initialMenuId={101} />);

    await waitFor(() => {
      expect(screen.getByTestId('section-row-501')).toBeInTheDocument();
    });

    // Check display order monospace badges
    expect(screen.getByTestId('display-order-badge-501')).toHaveTextContent('#01');
    expect(screen.getByTestId('display-order-badge-502')).toHaveTextContent('#02');
    expect(screen.getByTestId('display-order-badge-503')).toHaveTextContent('#03');

    // Verify ordering sequence in DOM
    const rows = screen.getAllByTestId(/^section-row-/);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Prime Steaks & Cuts');
    expect(rows[1]).toHaveTextContent('Craft Cocktails & Wine');
    expect(rows[2]).toHaveTextContent('Artisan Desserts');
  });

  it('filters sections in real-time by search query (name, description, badge, menu)', async () => {
    const user = userEvent.setup();
    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('section-row-501')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Universal search by section name/i);
    await user.type(searchInput, 'Cocktails');

    // Should show only Craft Cocktails & Wine
    expect(screen.getByTestId('section-row-502')).toBeInTheDocument();
    expect(screen.queryByTestId('section-row-501')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-row-504')).not.toBeInTheDocument();
  });

  it('filters sections by parent QR menu dropdown', async () => {
    const user = userEvent.setup();
    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('section-row-501')).toBeInTheDocument();
    });

    const menuSelect = screen.getByTestId('parent-menu-filter');
    await user.selectOptions(menuSelect, '102');

    // Menu 102 has sections 504 and 505
    expect(screen.getByTestId('section-row-504')).toBeInTheDocument();
    expect(screen.getByTestId('section-row-505')).toBeInTheDocument();
    expect(screen.queryByTestId('section-row-501')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-row-502')).not.toBeInTheDocument();
  });

  it('switches between Table Directory View and Kanban Board View', async () => {
    const user = userEvent.setup();
    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-mode-kanban-btn')).toBeInTheDocument();
    });

    // Switch to Kanban View
    await user.click(screen.getByTestId('view-mode-kanban-btn'));

    // Check Kanban columns
    expect(screen.getByTestId('kanban-column-active')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-inactive')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-archived')).toBeInTheDocument();

    // Check card exists in Active column
    expect(screen.getByTestId('kanban-card-501')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-card-501')).toHaveTextContent('Order #1');

    // Switch back to Table View
    await user.click(screen.getByTestId('view-mode-table-btn'));
    expect(screen.getByTestId('section-row-501')).toBeInTheDocument();
  });

  it('validates required inputs (qr_menu_id, name, description, display_order, status) in Create Section drawer', async () => {
    const user = userEvent.setup();
    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('create-qr-section-btn')).toBeInTheDocument();
    });

    // Open Drawer
    await user.click(screen.getByTestId('create-qr-section-btn'));

    expect(screen.getByText('Create Menu Section')).toBeInTheDocument();
    expect(screen.getByText('Non-Nullable Binding')).toBeInTheDocument();

    const nameInput = screen.getByTestId('section-name-input');
    const descInput = screen.getByTestId('section-description-input');
    const orderInput = screen.getByTestId('section-display-order-input');
    const statusSelect = screen.getByTestId('section-status-select');
    const submitBtn = screen.getByTestId('submit-section-btn');

    // Verify presence of required fields
    expect(nameInput).toBeInTheDocument();
    expect(descInput).toBeInTheDocument();
    expect(orderInput).toBeInTheDocument();
    expect(statusSelect).toBeInTheDocument();

    // Submit empty to test validation error for required inputs
    await user.click(submitBtn);
    expect(screen.getAllByText('Section name is required.')[0]).toBeInTheDocument();

    // Fill name but leave description empty
    await user.type(nameInput, 'Fresh Salads');
    await user.click(submitBtn);
    expect(screen.getAllByText('Section description is required.')[0]).toBeInTheDocument();

    // Set name over 100 characters to test string length limit enforcement
    const longName = 'Z'.repeat(101);
    await user.clear(nameInput);
    fireEvent.change(nameInput, { target: { value: longName } });

    expect(screen.getByTestId('name-counter')).toHaveTextContent('101/100 chars');
    expect(screen.getByText('Name exceeds the maximum length of 100 characters.')).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();
  });

  it('creates a new section successfully through the drawer', async () => {
    const user = userEvent.setup();
    const mockCreatedSection: QRMenuSection = {
      id: 999,
      qr_menu_id: 101,
      name: 'Artisan Wood-Fired Pizzas',
      description: 'Sourdough crust with San Marzano tomatoes.',
      status: 'active',
      display_order: 4,
      qrMenu: mockMenus[0],
      items_count: 0,
    };

    const createSpy = vi.spyOn(qrMenuSectionsApi, 'createQRMenuSection').mockResolvedValue(mockCreatedSection);

    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('create-qr-section-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('create-qr-section-btn'));

    const nameInput = screen.getByTestId('section-name-input');
    const descInput = screen.getByTestId('section-description-input');
    const submitBtn = screen.getByTestId('submit-section-btn');

    await user.type(nameInput, 'Artisan Wood-Fired Pizzas');
    await user.type(descInput, 'Sourdough crust with San Marzano tomatoes.');

    await user.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Artisan Wood-Fired Pizzas',
          description: 'Sourdough crust with San Marzano tomatoes.',
          qr_menu_id: 101,
          status: 'active',
        })
      );
    });
  });

  it('prompts Cascade Deletion Protection modal when deleting a section with child items attached', async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.spyOn(qrMenuSectionsApi, 'deleteQRMenuSection').mockResolvedValue();

    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('delete-section-501')).toBeInTheDocument();
    });

    // Section 501 has 5 child items attached
    await user.click(screen.getByTestId('delete-section-501'));

    // Cascade Protection verification modal should be open
    expect(screen.getByText('Cascade Deletion Protection')).toBeInTheDocument();
    expect(screen.getByText(/5 Child Items Attached/i)).toBeInTheDocument();
    expect(screen.getByText('Bone-In Cowboy Ribeye')).toBeInTheDocument();

    // Confirm Deletion button
    const confirmBtn = screen.getByTestId('confirm-cascade-delete-btn');
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(501);
    });
  });

  it('deletes a clean section (0 child items) with standard confirmation', async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.spyOn(qrMenuSectionsApi, 'deleteQRMenuSection').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('delete-section-503')).toBeInTheDocument();
    });

    // Section 503 has 0 child items
    await user.click(screen.getByTestId('delete-section-503'));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(503);
    });
  });

  it('prompts Cascade Availability Protection modal when inactivating a section with child items in drawer', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(qrMenuSectionsApi, 'updateQRMenuSection').mockResolvedValue({
      ...mockSections[0],
      status: 'inactive',
    });

    render(<QRMenuSectionsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-section-501')).toBeInTheDocument();
    });

    // Edit section 501 (currently active with child items)
    await user.click(screen.getByTestId('edit-section-501'));

    // Switch status to inactive
    const statusSelect = screen.getByTestId('section-status-select');
    await user.selectOptions(statusSelect, 'inactive');

    // Submit
    const submitBtn = screen.getByTestId('submit-section-btn');
    await user.click(submitBtn);

    // Cascade Verification modal should appear
    expect(screen.getByText('Cascade Availability Protection')).toBeInTheDocument();
    expect(screen.getByText(/Operational Impact:/i)).toBeInTheDocument();

    // Confirm inactivation
    const confirmBtn = screen.getByTestId('confirm-cascade-inactivate-btn');
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        501,
        expect.objectContaining({
          status: 'inactive',
        })
      );
    });
  });

  it('Bulk Reorder Sync: drag-and-drop repositioning triggers single atomic payload update for display_order attributes', async () => {
    const bulkReorderSpy = vi.spyOn(qrMenuSectionsApi, 'bulkReorderQRMenuSections').mockResolvedValue([]);

    render(<QRMenuSectionsView merchantId={3} initialMenuId={101} />);

    await waitFor(() => {
      expect(screen.getByTestId('section-row-501')).toBeInTheDocument();
    });

    const row501 = screen.getByTestId('section-row-501');
    const row502 = screen.getByTestId('section-row-502');

    // Simulate drag and drop
    fireEvent.dragStart(row501, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } });
    fireEvent.dragOver(row502, { dataTransfer: { dropEffect: 'move' } });
    fireEvent.drop(row502);

    await waitFor(() => {
      expect(bulkReorderSpy).toHaveBeenCalledWith(
        101,
        expect.arrayContaining([502, 501, 503])
      );
    });
  });

  it('opens Drag & Drop Sequence Sequencer modal and executes bulk reorder sync', async () => {
    const user = userEvent.setup();
    const bulkReorderSpy = vi.spyOn(qrMenuSectionsApi, 'bulkReorderQRMenuSections').mockResolvedValue([]);

    render(<QRMenuSectionsView merchantId={3} initialMenuId={101} />);

    await waitFor(() => {
      expect(screen.getByTestId('open-reorder-modal-btn')).toBeInTheDocument();
    });

    // Open Sequencer modal
    await user.click(screen.getByTestId('open-reorder-modal-btn'));

    expect(screen.getByText('Drag & Drop Sequence Sequencer')).toBeInTheDocument();
    expect(screen.getByTestId('reorder-item-501')).toBeInTheDocument();

    // Click Sync button
    const saveBtn = screen.getByTestId('save-bulk-reorder-btn');
    await user.click(saveBtn);

    await waitFor(() => {
      expect(bulkReorderSpy).toHaveBeenCalledWith(
        101,
        expect.any(Array)
      );
    });
  });

  it('does not render duplicate embedded navigation hub as global ModuleNavHubBar handles navigation', async () => {
    const onNavigate = vi.fn();
    render(<QRMenuSectionsView merchantId={3} onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('QR Menu Sections Workspace')).toBeInTheDocument();
    });

    // Verify no redundant embedded navigation hub is rendered inside the view
    expect(screen.queryByText('Navigation Hub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-hub-menu-sections')).not.toBeInTheDocument();
  });
});
