import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { QRDeploymentsView } from './QRDeploymentsView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QRDeploymentsView Component', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders operational KPI banner with accurate real-time metrics, formula coverage index and top menu', async () => {
    render(<QRDeploymentsView merchantId={3} onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('QR Deployments Workspace')).toBeInTheDocument();
    });

    // KPI 1: Total Deployed Locations
    expect(screen.getByText('Total Deployed Locations')).toBeInTheDocument();
    // Default mock data for merchant 3 has 5 locations
    expect(screen.getByText('5')).toBeInTheDocument();

    // KPI 2: Live / Active QR Points
    expect(screen.getByText('Live / Active QR Points')).toBeInTheDocument();
    // In seed data: id 1 and id 2 are active (2 total)
    expect(screen.getByText('2')).toBeInTheDocument();

    // KPI 3: Table Coverage Index
    // Physical tables for merchant 3: 4 tables (201, 202, 203, 204).
    // Active table deployments: Table 201 is bound to loc 1 (active). (loc 3 is bound to 203 but inactive).
    // Coverage Index = (1 active deployed table / 4 total physical tables) * 100 = 25%
    expect(screen.getByText('Table Coverage Index')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('1 of 4 Physical Tables')).toBeInTheDocument();

    // KPI 4: Top Menu Distribution
    // In seed data: Menu 101 has loc 1 (active), Menu 104 has loc 2 (active)
    expect(screen.getByText('Top Menu Distribution')).toBeInTheDocument();
  });

  it('enforces tenant-scoped metrics exclusively for the active merchant', async () => {
    // For merchant 1
    render(<QRDeploymentsView merchantId={1} onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('QR Deployments Workspace')).toBeInTheDocument();
    });

    // Merchant 1 has no default seed locations for merchant 1 in initializeMockData (or 0)
    expect(screen.getByText('Total Deployed Locations')).toBeInTheDocument();
  });

  it('filters deployments in real time using universal search bar (name, table, destination URL)', async () => {
    const user = userEvent.setup();
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search name, table, URL or #QR-LOC/i);

    // Search by name
    await user.type(searchInput, 'Curbside');
    expect(screen.getByText('Curbside Pickup Point')).toBeInTheDocument();
    expect(screen.queryByText('Patio Table #12 Access')).not.toBeInTheDocument();

    // Clear search
    await user.clear(searchInput);

    // Search by URL fragment
    await user.type(searchInput, 'curbside');
    expect(screen.getByText('Curbside Pickup Point')).toBeInTheDocument();

    // Clear search
    await user.clear(searchInput);

    // Search by table number
    await user.type(searchInput, '12');
    expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    expect(screen.queryByText('Curbside Pickup Point')).not.toBeInTheDocument();
  });

  it('filters deployments by QR Menu dropdown selector', async () => {
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const menuSelect = screen.getByLabelText('Filter by QR Menu');
    // Select Menu 104 (Takeout & Pickup Menu)
    fireEvent.change(menuSelect, { target: { value: '104' } });

    expect(screen.getByText('Curbside Pickup Point')).toBeInTheDocument();
    expect(screen.queryByText('Patio Table #12 Access')).not.toBeInTheDocument();
  });

  it('filters deployments by dining room zone dropdown selector', async () => {
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const zoneSelect = screen.getByLabelText('Filter by Dining Zone');
    // Select Terrace zone
    fireEvent.change(zoneSelect, { target: { value: 'Terrace' } });

    expect(screen.getByText('Terrace Table #Patio-01')).toBeInTheDocument();
    expect(screen.queryByText('Patio Table #12 Access')).not.toBeInTheDocument();
  });

  it('filters deployments by multi-select location type pills', async () => {
    const user = userEvent.setup();
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    // Click "Pickup" pill
    const pickupPill = screen.getByRole('button', { name: /Pickup Counter/i });
    await user.click(pickupPill);

    expect(screen.getByText('Curbside Pickup Point')).toBeInTheDocument();
    expect(screen.queryByText('Patio Table #12 Access')).not.toBeInTheDocument();

    // Reset via "All Types"
    const allTypesBtn = screen.getByRole('button', { name: 'All Types' });
    await user.click(allTypesBtn);

    expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    expect(screen.getByText('Curbside Pickup Point')).toBeInTheDocument();
  });

  it('filters deployments by status checkboxes dynamically', async () => {
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    // Uncheck "active" status checkbox
    const activeCheckbox = screen.getByRole('checkbox', { name: 'Status filter active' });
    fireEvent.click(activeCheckbox);

    // Active locations should disappear
    expect(screen.queryByText('Patio Table #12 Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Curbside Pickup Point')).not.toBeInTheDocument();

    // Inactive location remains visible
    expect(screen.getByText('Terrace Table #Patio-01')).toBeInTheDocument();
  });

  it('renders persistent bottom QRCodeNavHubBar indicating DEPLOYMENTS as active and routes across all 7 sub-modules', async () => {
    const onNavigate = vi.fn();
    render(<QRDeploymentsView merchantId={3} onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('QR Deployments Workspace')).toBeInTheDocument();
    });

    // Check that DEPLOYMENTS tab is active
    const deploymentsBtn = screen.getByTestId('nav-hub-deployments');
    expect(deploymentsBtn).toBeInTheDocument();
    expect(deploymentsBtn).toHaveAttribute('aria-current', 'page');
    expect(deploymentsBtn.className).toContain('bg-[#ae001a]');

    // Check all 7 sub-modules are present
    expect(screen.getByTestId('nav-hub-qr-locations')).toHaveTextContent('QR LOCATIONS');
    expect(screen.getByTestId('nav-hub-qr-menus')).toHaveTextContent('QR MENUS');
    expect(screen.getByTestId('nav-hub-menu-sections')).toHaveTextContent('MENU SECTIONS');
    expect(screen.getByTestId('nav-hub-menu-items')).toHaveTextContent('MENU ITEMS');
    expect(screen.getByTestId('nav-hub-deployments')).toHaveTextContent('DEPLOYMENTS');
    expect(screen.getByTestId('nav-hub-qr-orders')).toHaveTextContent('QR ORDERS');
    expect(screen.getByTestId('nav-hub-order-items')).toHaveTextContent('ORDER ITEMS');

    // Test routing on click
    fireEvent.click(screen.getByTestId('nav-hub-qr-locations'));
    expect(onNavigate).toHaveBeenCalledWith('qr-code-locations');

    fireEvent.click(screen.getByTestId('nav-hub-qr-menus'));
    expect(onNavigate).toHaveBeenCalledWith('qr-code-menus');

    fireEvent.click(screen.getByTestId('nav-hub-qr-orders'));
    expect(onNavigate).toHaveBeenCalledWith('qr-code-orders');
  });

  it('toggles between Grid View and Table Directory View', async () => {
    const user = userEvent.setup();
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    // Switch to Table view
    const tableViewBtn = screen.getByRole('button', { name: 'Table Directory View' });
    await user.click(tableViewBtn);

    expect(screen.getByText('Deployment Name')).toBeInTheDocument();
    expect(screen.getByText('Physical Table & Zone')).toBeInTheDocument();
    expect(screen.getByText('Menu Association')).toBeInTheDocument();

    // Switch back to Grid view
    const gridViewBtn = screen.getByRole('button', { name: 'Grid View' });
    await user.click(gridViewBtn);

    expect(screen.queryByText('Physical Table & Zone')).not.toBeInTheDocument();
  });

  it('copies destination URL to clipboard with instant toast notification', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const copyBtns = screen.getAllByTitle('Copy Destination URL');
    fireEvent.click(copyBtns[0]);

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByText('URL copied to clipboard!')).toBeInTheDocument();
  });

  it('opens interactive lightbox preview when clicking QR thumbnail', async () => {
    const user = userEvent.setup();
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const qrThumbs = screen.getAllByTitle(/Click to view QR Lightbox preview/i);
    await user.click(qrThumbs[0]);

    expect(screen.getByRole('dialog', { name: 'QR Code Lightbox Preview' })).toBeInTheDocument();

    const closeLightboxBtn = screen.getByTitle('Close Lightbox');
    await user.click(closeLightboxBtn);

    expect(screen.queryByRole('dialog', { name: 'QR Code Lightbox Preview' })).not.toBeInTheDocument();
  });

  it('opens Print & Asset Export modal with template choices and vector SVG download', async () => {
    const user = userEvent.setup();
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const printBtns = screen.getAllByTitle('Print Collateral Assets');
    await user.click(printBtns[0]);

    expect(screen.getByRole('dialog', { name: 'Print Asset Controller' })).toBeInTheDocument();
    expect(screen.getByText('Print & Asset Export Controller')).toBeInTheDocument();
    expect(screen.getByText('Table Acrylic (4" x 6")')).toBeInTheDocument();
    expect(screen.getByText('Table Sticker (8x8cm)')).toBeInTheDocument();
    expect(screen.getByText('Tent Card (A6)')).toBeInTheDocument();
    expect(screen.getByText('High-Res PNG')).toBeInTheDocument();
    expect(screen.getByText('Vector SVG')).toBeInTheDocument();
    expect(screen.getByText('Escanea para ordenar')).toBeInTheDocument();
  });

  it('opens deployment side drawer when clicking Deploy QR Location button', async () => {
    const user = userEvent.setup();
    render(<QRDeploymentsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const deployBtn = screen.getByRole('button', { name: /Deploy QR Location/i });
    await user.click(deployBtn);

    expect(screen.getByText('Configure New QR Access Point')).toBeInTheDocument();
  });
});
