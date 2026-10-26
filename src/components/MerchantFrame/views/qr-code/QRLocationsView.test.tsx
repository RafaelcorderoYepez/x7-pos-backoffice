import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { QRLocationsView } from './QRLocationsView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QRLocationsView Component', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders the workspace header and summary metric cards', async () => {
    render(<QRLocationsView merchantId={3} onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('QR Location Management')).toBeInTheDocument();
    });

    expect(screen.getByText('Total QR Locations')).toBeInTheDocument();
    expect(screen.getByText('Active QR Access Points')).toBeInTheDocument();
    expect(screen.getByText('Table-Linked Locations')).toBeInTheDocument();
    expect(screen.getByText('Virtual Access Points')).toBeInTheDocument();
  });

  it('displays location items with #QR-LOC-{id} badges, menu names, and status pills', async () => {
    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    // Check location ID badge
    expect(screen.getByText('#QR-LOC-1')).toBeInTheDocument();

    // Check menu name
    expect(screen.getAllByText('Main Dinner & Cocktail Menu').length).toBeGreaterThan(0);

    // Check table tag
    expect(screen.getByText('Table #12')).toBeInTheDocument();

    // Check status badge
    expect(screen.getAllByText('Active Access').length).toBeGreaterThan(0);
  });

  it('filters locations by search term', async () => {
    const user = userEvent.setup();
    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search location name or table number/i);
    await user.type(searchInput, 'Curbside');

    expect(screen.getByText('Curbside Pickup Point')).toBeInTheDocument();
    expect(screen.queryByText('Patio Table #12 Access')).not.toBeInTheDocument();
  });

  it('filters locations by status checkbox selection', async () => {
    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    // Uncheck "Active Access" checkbox
    const activeCheckbox = screen.getByRole('checkbox', { name: /Active Access/i });
    fireEvent.click(activeCheckbox);

    // Active locations should no longer be visible
    expect(screen.queryByText('Patio Table #12 Access')).not.toBeInTheDocument();
    // Inactive & Archived locations remain visible
    expect(screen.getByText('Terrace Table #Patio-01')).toBeInTheDocument();
  });

  it('opens side drawer modal and enforces unique location naming validation', async () => {
    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const configureBtn = screen.getByText('Configure QR Location');
    fireEvent.click(configureBtn);

    expect(screen.getByText('Configure New QR Access Point')).toBeInTheDocument();

    // Fill duplicate location name
    const nameInput = screen.getByPlaceholderText(/e\.g\., "Patio Table #12"/i);
    fireEvent.change(nameInput, { target: { value: 'Patio Table #12 Access' } });

    // Submit form -> expects duplicate name validation error
    const saveBtn = screen.getByText('Create Access Point');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/already exists for this merchant/i).length).toBeGreaterThan(0);
    });

    // Change to unique name
    fireEvent.change(nameInput, { target: { value: 'Rooftop Lounge Spot' } });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Rooftop Lounge Spot')).toBeInTheDocument();
    });
  });

  it('opens Print & Asset Export controller with template selectors and high-res PNG download', async () => {
    const user = userEvent.setup();
    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const printBtns = screen.getAllByText(/Print \/ Asset/i);
    await user.click(printBtns[0]);

    expect(screen.getByText('Print & Asset Export Controller')).toBeInTheDocument();
    expect(screen.getByText('Table Acrylic (4" x 6")')).toBeInTheDocument();
    expect(screen.getByText('Table Sticker (8x8cm)')).toBeInTheDocument();
    expect(screen.getByText('Tent Card (A6)')).toBeInTheDocument();
    expect(screen.getByText('High-Res PNG')).toBeInTheDocument();
    expect(screen.getByText('Vector SVG')).toBeInTheDocument();
    expect(screen.getByText('Escanea para ordenar')).toBeInTheDocument();
    expect(screen.getAllByText(/prueba1/i).length).toBeGreaterThan(0);
  });

  it('supports batch selecting multiple QR locations and opening batch print package controller', async () => {
    const user = userEvent.setup();
    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const selectAllBtn = screen.getByText(/Select All/i);
    await user.click(selectAllBtn);

    const exportSelectedBtn = screen.getByText(/Export Selected/i);
    await user.click(exportSelectedBtn);

    expect(screen.getByText('Batch Print & Asset Export Package')).toBeInTheDocument();
    expect(screen.getByText('Print All Cards')).toBeInTheDocument();
    expect(screen.getAllByText('Escanea para ordenar').length).toBeGreaterThan(0);
  });

  it('displays relational bindings accurately: anchor badge, table badge, menu pill with theme, and suspended status', async () => {
    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    // Anchor badge #QR-LOC-1
    expect(screen.getByText('#QR-LOC-1')).toBeInTheDocument();

    // Table association badge #TBL-12 and zone
    expect(screen.getByText('#TBL-12')).toBeInTheDocument();

    // Assigned Menu with Theme Pill
    expect(screen.getAllByText('#QRM-101').length).toBeGreaterThan(0);
    expect(screen.getAllByText('🎨 Modern Elegance').length).toBeGreaterThan(0);

    // Non-table / Global for Curbside
    expect(screen.getAllByText('Non-table / Global').length).toBeGreaterThan(0);

    // Suspended status badge (#QR-LOC-5)
    expect(screen.getAllByText('Suspended').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Revoked \/ Archived/i).length).toBeGreaterThan(0);
  });

  it('triggers instant toast notification upon copying target destination URL', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });

    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const copyBtn = screen.getAllByTitle('Copy Target URL')[0];
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByText('URL copied to clipboard!')).toBeInTheDocument();
  });

  it('opens interactive lightbox preview when clicking 48x48px QR thumbnail', async () => {
    const user = userEvent.setup();
    render(<QRLocationsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Patio Table #12 Access')).toBeInTheDocument();
    });

    const qrThumbs = screen.getAllByTitle(/Click to expand QR Lightbox preview/i);
    await user.click(qrThumbs[0]);

    expect(screen.getByLabelText('QR Code Lightbox Preview')).toBeInTheDocument();
    expect(screen.getByText('Destination Dispatch URL')).toBeInTheDocument();
    expect(screen.getByText('Lightbox Preview')).toBeInTheDocument();

    const closeLightboxBtn = screen.getByTitle('Close Lightbox');
    await user.click(closeLightboxBtn);

    expect(screen.queryByLabelText('QR Code Lightbox Preview')).not.toBeInTheDocument();
  });
});


