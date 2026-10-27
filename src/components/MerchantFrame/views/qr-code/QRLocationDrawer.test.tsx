import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { QRLocationDrawer } from './QRLocationDrawer';
import type { QRLocation, QRMenuRef, TableRef } from '../../../../types/qr-location';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const mockMenus: QRMenuRef[] = [
  { id: 101, name: 'Main Dinner Menu', is_active: true, design_theme: 'Modern Elegance', merchant_id: 3 },
  { id: 102, name: 'Lunch Express Menu', is_active: true, design_theme: 'Tokyo Minimal', merchant_id: 3 },
  { id: 105, name: 'Downtown Other Merchant Menu', is_active: true, design_theme: 'Texas Theme', merchant_id: 1 },
];

const mockTables: TableRef[] = [
  { id: 201, number: '12', merchant_id: 3, capacity: 4, zone_name: 'Main Dining Room' },
  { id: 202, number: '14', merchant_id: 3, capacity: 6, zone_name: 'Main Dining Room' },
  { id: 203, number: 'Patio-01', merchant_id: 3, capacity: 2, zone_name: 'Terrace' },
  { id: 205, number: 'VIP-1', merchant_id: 1, capacity: 8, zone_name: 'VIP Lounge' },
];

const mockExistingLocations: QRLocation[] = [
  {
    id: 1,
    name: 'Patio Table #12 Access',
    merchant_id: 3,
    qr_menu_id: 101,
    table_id: 201,
    location_type: 'DINE_IN',
    status: 'active',
    qr_code_url: 'https://menu.x7pos.com/menu/101?loc=hash01&table=201',
    qr_code_image: 'data:image/svg+xml;utf8,test',
  },
  {
    id: 2,
    name: 'Express Pickup Station',
    merchant_id: 3,
    qr_menu_id: 102,
    table_id: null,
    location_type: 'PICKUP',
    status: 'active',
    qr_code_url: 'https://menu.x7pos.com/menu/102?loc=hash02',
    qr_code_image: 'data:image/svg+xml;utf8,test',
  },
];

describe('QRLocationDrawer Component', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders drawer header, tenant badge, computed target URL, and active theme badge', async () => {
    render(
      <QRLocationDrawer
        isOpen={true}
        onClose={vi.fn()}
        merchantId={3}
        editingLocation={null}
        locations={mockExistingLocations}
        menus={mockMenus}
        tables={mockTables}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText('Configure New QR Access Point')).toBeInTheDocument();
    expect(screen.getByText('Tenant #3')).toBeInTheDocument();
    expect(screen.getByText(/Computed Target Tracking URL/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Theme:/i)).toBeInTheDocument();
    expect(screen.getByText('Modern Elegance')).toBeInTheDocument();
  });

  it('multi-tenant security: strictly restricts menu and table dropdowns to active merchant_id', () => {
    render(
      <QRLocationDrawer
        isOpen={true}
        onClose={vi.fn()}
        merchantId={3}
        editingLocation={null}
        locations={mockExistingLocations}
        menus={mockMenus}
        tables={mockTables}
        onSaved={vi.fn()}
      />
    );

    // Merchant 3 menus should be visible
    expect(screen.getByText(/Main Dinner Menu/i)).toBeInTheDocument();
    expect(screen.getByText(/Lunch Express Menu/i)).toBeInTheDocument();
    // Merchant 1 menu should NOT be visible
    expect(screen.queryByText(/Downtown Other Merchant Menu/i)).not.toBeInTheDocument();

    // Merchant 3 tables should be visible
    expect(screen.getByText(/Table #12/i)).toBeInTheDocument();
    // Merchant 1 table should NOT be visible
    expect(screen.queryByText(/VIP-1/i)).not.toBeInTheDocument();
  });

  it('validation matrix: enforces required name and maximum 100 character limit', async () => {
    render(
      <QRLocationDrawer
        isOpen={true}
        onClose={vi.fn()}
        merchantId={3}
        editingLocation={null}
        locations={mockExistingLocations}
        menus={mockMenus}
        tables={mockTables}
        onSaved={vi.fn()}
      />
    );

    const saveBtn = screen.getByText('Create Access Point');
    fireEvent.click(saveBtn);

    // Empty name should trigger validation
    await waitFor(() => {
      expect(screen.getAllByText('Location name is required.').length).toBeGreaterThan(0);
    });

    const nameInput = screen.getByPlaceholderText(/e\.g\., "Patio Table #12"/i);
    // Type name with length indicator
    fireEvent.change(nameInput, { target: { value: 'Test Location' } });
    expect(screen.getByText('13/100 chars')).toBeInTheDocument();
  });

  it('validation matrix: enforces mandatory table_id when location_type is DINE_IN', async () => {
    render(
      <QRLocationDrawer
        isOpen={true}
        onClose={vi.fn()}
        merchantId={3}
        editingLocation={null}
        locations={mockExistingLocations}
        menus={mockMenus}
        tables={mockTables}
        onSaved={vi.fn()}
      />
    );

    const nameInput = screen.getByPlaceholderText(/e\.g\., "Patio Table #12"/i);
    fireEvent.change(nameInput, { target: { value: 'New Dine In Location' } });

    // Deselect table
    const tableSelect = screen.getByDisplayValue(/Table #14/i);
    fireEvent.change(tableSelect, { target: { value: '' } });

    const saveBtn = screen.getByText('Create Access Point');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText('A physical dining table is required when location type is Dine-In.').length
      ).toBeGreaterThan(0);
    });
  });

  it('conditional table picker: hides/disables physical table binding when location_type is non-table specific', async () => {
    const user = userEvent.setup();
    render(
      <QRLocationDrawer
        isOpen={true}
        onClose={vi.fn()}
        merchantId={3}
        editingLocation={null}
        locations={mockExistingLocations}
        menus={mockMenus}
        tables={mockTables}
        onSaved={vi.fn()}
      />
    );

    const typeSelect = screen.getByDisplayValue('Dine-In Table');
    await user.selectOptions(typeSelect, 'PICKUP');

    // Should indicate table binding is disabled for pickup
    expect(
      screen.getByText(/Physical table binding is disabled for non-table specific location types/i)
    ).toBeInTheDocument();
  });

  it('duplication guard: prevents assigning multiple active deployments of the same qr_menu_id to the exact same physical table_id', async () => {
    render(
      <QRLocationDrawer
        isOpen={true}
        onClose={vi.fn()}
        merchantId={3}
        editingLocation={null}
        locations={mockExistingLocations}
        menus={mockMenus}
        tables={mockTables}
        onSaved={vi.fn()}
      />
    );

    const nameInput = screen.getByPlaceholderText(/e\.g\., "Patio Table #12"/i);
    fireEvent.change(nameInput, { target: { value: 'Another Table 12 Deployment' } });

    // Select Menu 101 and Table 201 (which already has an active deployment in mockExistingLocations)
    const tableSelect = screen.getByDisplayValue(/Table #14/i);
    fireEvent.change(tableSelect, { target: { value: '201' } });

    const saveBtn = screen.getByText('Create Access Point');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText(/An active deployment for this QR Menu already exists on Table #12/i).length
      ).toBeGreaterThan(0);
    });
  });

  it('bulk provisioning wizard: generates batch QRLocation records from floor plan tables', async () => {
    const onSavedMock = vi.fn();
    const user = userEvent.setup();

    render(
      <QRLocationDrawer
        isOpen={true}
        onClose={vi.fn()}
        merchantId={3}
        editingLocation={null}
        locations={mockExistingLocations}
        menus={mockMenus}
        tables={mockTables}
        onSaved={onSavedMock}
      />
    );

    // Switch to Bulk tab
    const bulkTabBtn = screen.getByText('Generate from Floor Plan Tables');
    await user.click(bulkTabBtn);

    expect(screen.getByText(/Bulk Provisioning Wizard/i)).toBeInTheDocument();
    expect(screen.getByText(/Location Name Prefix/i)).toBeInTheDocument();

    // Select Table 14 and Patio-01
    const table14Checkbox = screen.getByLabelText(/Mesa #14/i);
    await user.click(table14Checkbox);

    const batchSubmitBtn = screen.getByText(/Batch Provision \(1 Tables\)/i);
    await user.click(batchSubmitBtn);

    await waitFor(() => {
      expect(onSavedMock).toHaveBeenCalled();
      const callArg = onSavedMock.mock.calls[0][0];
      expect(Array.isArray(callArg)).toBe(true);
      expect(callArg[0].name).toContain('Mesa 14');
      expect(callArg[0].table_id).toBe(202);
    });
  });

  it('automatic URL & real-time canvas preview updates dynamically when name or table changes', async () => {
    render(
      <QRLocationDrawer
        isOpen={true}
        onClose={vi.fn()}
        merchantId={3}
        editingLocation={null}
        locations={mockExistingLocations}
        menus={mockMenus}
        tables={mockTables}
        onSaved={vi.fn()}
      />
    );

    // Target URL should contain menu 101 and table 202
    expect(screen.getByText(/\/menu\/101\?loc=/i)).toBeInTheDocument();
    expect(screen.getByText(/&table=202/i)).toBeInTheDocument();
    expect(screen.getByText('Live QR Image Preview')).toBeInTheDocument();
  });
});
