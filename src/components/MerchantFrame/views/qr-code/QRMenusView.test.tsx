import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRMenusView } from './QRMenusView';
import type { QRMenu } from '../../../../types/qr-menu';
import type { QRLocation } from '../../../../types/qr-location';
import * as qrMenusApi from '../../../../api/qr-menus';
import * as qrLocationsApi from '../../../../api/qr-locations';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QRMenusView Component', () => {
  const mockMenus: QRMenu[] = [
    {
      id: 101,
      merchant_id: 3,
      name: 'Main Dinner & Cocktail Menu',
      description: 'Prime dry-aged steaks and crafted cocktail selection.',
      status: 'active',
      design_theme: 'Texas Theme',
      qr_type: 'Table',
      sections_count: 3,
      items_count: 8,
    },
    {
      id: 102,
      merchant_id: 3,
      name: 'Lunch Express Menu',
      description: 'Executive weekday lunch combos and express bowls.',
      status: 'active',
      design_theme: 'Modern Elegance',
      qr_type: 'Table',
      sections_count: 2,
      items_count: 5,
    },
    {
      id: 103,
      merchant_id: 3,
      name: 'Takeout & Delivery Specials',
      description: 'Curbside packages and delivery combos.',
      status: 'inactive',
      design_theme: 'Emerald Garden',
      qr_type: 'Delivery',
      sections_count: 2,
      items_count: 4,
    },
  ];

  const mockLocations: QRLocation[] = [
    {
      id: 1,
      name: 'Patio Table #12 Access',
      merchant_id: 3,
      qr_menu_id: 101,
      location_type: 'DINE_IN',
      status: 'active',
      qr_code_url: 'https://menu.x7pos.com/m/3/loc/1',
      qr_code_image: '',
    },
    {
      id: 2,
      name: 'Curbside Pickup Point',
      merchant_id: 3,
      qr_menu_id: 103,
      location_type: 'PICKUP',
      status: 'active',
      qr_code_url: 'https://menu.x7pos.com/m/3/loc/2',
      qr_code_image: '',
    },
    {
      id: 3,
      name: 'Inactive Station',
      merchant_id: 3,
      qr_menu_id: 101,
      location_type: 'DINE_IN',
      status: 'inactive',
      qr_code_url: 'https://menu.x7pos.com/m/3/loc/3',
      qr_code_image: '',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(qrMenusApi, 'getQRMenus').mockResolvedValue(mockMenus);
    vi.spyOn(qrLocationsApi, 'getQRLocations').mockResolvedValue(mockLocations);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders QR Menu Operational KPI Summary Banner with accurate metrics', async () => {
    render(<QRMenusView merchantId={3} />);

    expect(screen.getByText('Loading QR Menus directory...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('QR Menus Directory')).toBeInTheDocument();
      // Total Digital Menus
      expect(screen.getByText('Total Digital Menus')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-total-menus')).toHaveTextContent('3');

      // Active Menus
      expect(screen.getByText('Active Menus')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-active-menus')).toHaveTextContent('2');

      // Service Type Breakdown
      expect(screen.getByText('Service Type Breakdown')).toBeInTheDocument();
      expect(screen.getAllByText('Dine-In').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Delivery').length).toBeGreaterThan(0);

      // Linked Locations: 2 active bindings
      expect(screen.getByText('Linked Locations')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-linked-locations')).toHaveTextContent('2');
    });
  });

  it('renders all menu cards with #QR-MNU-{id} badges, theme tags, and Poppins font styles', async () => {
    render(<QRMenusView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Main Dinner & Cocktail Menu')).toBeInTheDocument();
      expect(screen.getByText('Lunch Express Menu')).toBeInTheDocument();
      expect(screen.getByText('Takeout & Delivery Specials')).toBeInTheDocument();
    });

    // Check menu ID badges
    expect(screen.getByText('#QR-MNU-101')).toBeInTheDocument();
    expect(screen.getByText('#QR-MNU-102')).toBeInTheDocument();
    expect(screen.getByText('#QR-MNU-103')).toBeInTheDocument();

    // Check relational counts
    expect(screen.getByText('3 Sections')).toBeInTheDocument();
    expect(screen.getByText('8 Items')).toBeInTheDocument();
  });

  it('filters menus dynamically by service type dropdown', async () => {
    const user = userEvent.setup();
    render(<QRMenusView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Main Dinner & Cocktail Menu')).toBeInTheDocument();
    });

    const typeSelect = screen.getByTestId('qr-type-filter');
    // Filter by Delivery
    await user.selectOptions(typeSelect, 'Delivery');

    expect(screen.getByText('Takeout & Delivery Specials')).toBeInTheDocument();
    expect(screen.queryByText('Main Dinner & Cocktail Menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Lunch Express Menu')).not.toBeInTheDocument();
  });

  it('filters menus dynamically by status checkboxes', async () => {
    const user = userEvent.setup();
    render(<QRMenusView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Takeout & Delivery Specials')).toBeInTheDocument();
    });

    // Uncheck "inactive" checkbox
    const inactiveCheckbox = screen.getByRole('checkbox', { name: /inactive/i });
    await user.click(inactiveCheckbox);

    // Inactive menu should be filtered out
    expect(screen.queryByText('Takeout & Delivery Specials')).not.toBeInTheDocument();
    expect(screen.getByText('Main Dinner & Cocktail Menu')).toBeInTheDocument();
    expect(screen.getByText('Lunch Express Menu')).toBeInTheDocument();
  });

  it('performs universal real-time text search across menu name and description', async () => {
    const user = userEvent.setup();
    render(<QRMenusView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Main Dinner & Cocktail Menu')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Universal search across menu name/i);
    // Search by text in description: "dry-aged"
    await user.type(searchInput, 'dry-aged');

    expect(screen.getByText('Main Dinner & Cocktail Menu')).toBeInTheDocument();
    expect(screen.queryByText('Lunch Express Menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Takeout & Delivery Specials')).not.toBeInTheDocument();
  });

  it('does not render duplicate embedded navigation hub as global ModuleNavHubBar handles navigation', async () => {
    const onNavigate = vi.fn();
    render(<QRMenusView merchantId={3} onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('QR Menus Directory')).toBeInTheDocument();
    });

    // Verify no redundant embedded navigation hub is rendered inside the view
    expect(screen.queryByText('Navigation Hub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-hub-qr-menus')).not.toBeInTheDocument();
  });

  it('opens the QRMenuDrawer when clicking "+ Create QR Menu"', async () => {
    const user = userEvent.setup();
    render(<QRMenusView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('create-qr-menu-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('create-qr-menu-btn'));
    expect(screen.getByText('Create New QR Menu')).toBeInTheDocument();
  });

  it('opens the Quick Clone Pipeline Modal when clicking "Clone"', async () => {
    const user = userEvent.setup();
    render(<QRMenusView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('clone-menu-101')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('clone-menu-101'));
    expect(screen.getByText('Menu Cloning & Duplication Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Execute Duplication Pipeline')).toBeInTheDocument();
  });

  it('switches between Grid Cards View and Table Rows View with #QR-MNU IDs', async () => {
    const user = userEvent.setup();
    render(<QRMenusView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Main Dinner & Cocktail Menu')).toBeInTheDocument();
    });

    const tableViewBtn = screen.getByTitle('Table Directory View');
    await user.click(tableViewBtn);

    expect(screen.getByText('Menu ID & Title')).toBeInTheDocument();
    expect(screen.getByText('Design Theme')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getAllByText('#QR-MNU-101').length).toBeGreaterThan(0);
  });
});
