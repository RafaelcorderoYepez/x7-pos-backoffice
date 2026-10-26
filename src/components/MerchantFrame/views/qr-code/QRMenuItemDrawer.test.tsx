import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QRMenuItemDrawer } from './QRMenuItemDrawer';
import type { QRMenu, QRMenuItem, QRMenuItemProductRef, QRMenuSection } from '../../../../types/qr-menu';
import * as qrMenuItemsApi from '../../../../api/qr-menu-items';

describe('QRMenuItemDrawer Component & POS Sync Suite', () => {
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
  ];

  const mockSections: QRMenuSection[] = [
    {
      id: 501,
      qr_menu_id: 101,
      name: 'Prime Steaks & Cuts',
      description: 'USDA Prime dry-aged steaks',
      status: 'active',
      display_order: 1,
      qrMenu: mockMenus[0],
    },
    {
      id: 502,
      qr_menu_id: 101,
      name: 'Craft Cocktails & Wine',
      description: 'Signature mixology',
      status: 'active',
      display_order: 2,
      qrMenu: mockMenus[0],
    },
  ];

  const mockPOSProducts: QRMenuItemProductRef[] = [
    {
      id: 1,
      name: 'Bone-In Cowboy Ribeye (18oz)',
      sku: 'POS-STEAK-001',
      basePrice: 48.0,
      price: 48.0,
      description: 'USDA Prime dry-aged bone-in ribeye cut, seasoned with house smoked sea salt.',
    },
    {
      id: 4,
      name: 'Smoked Bourbon Old Fashioned',
      sku: 'POS-BAR-004',
      basePrice: 16.0,
      price: 16.0,
      description: 'Artisan craft cocktail smoked with natural cherrywood chips.',
    },
  ];

  const mockExistingItem: QRMenuItem = {
    id: 9001,
    merchant_id: 3,
    qr_menu_section_id: 501,
    product_id: 1,
    name: 'Bone-In Cowboy Ribeye (18oz)',
    description: '18oz USDA Prime cut served with charred marrow butter.',
    image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947.jpg',
    price: 48.0,
    display_order: 1,
    is_available: true,
    status: 'active',
  };

  beforeEach(() => {
    vi.spyOn(qrMenuItemsApi, 'createQRMenuItem').mockImplementation(async (dto) => ({
      id: 9099,
      merchant_id: 3,
      qr_menu_section_id: dto.qr_menu_section_id,
      name: dto.name,
      description: dto.description,
      image_url: dto.image_url,
      price: dto.price,
      display_order: dto.display_order || 1,
      is_available: dto.is_available ?? true,
      status: dto.status || 'active',
    }));

    vi.spyOn(qrMenuItemsApi, 'updateQRMenuItem').mockImplementation(async (id, dto) => ({
      ...mockExistingItem,
      id,
      ...dto,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders drawer with all required fields in create mode', () => {
    render(
      <QRMenuItemDrawer
        isOpen={true}
        mode="create"
        item={null}
        sections={mockSections}
        menus={mockMenus}
        posProducts={mockPOSProducts}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Create QR Menu Item' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Target Menu Section/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dish Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description, Ingredients & Allergens/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Selling Price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Display Order/i)).toBeInTheDocument();
    expect(screen.getByText(/Kitchen Availability/i)).toBeInTheDocument();
    expect(screen.getByText(/Menu Item Status/i)).toBeInTheDocument();
  });

  it('validates required fields on empty submit', async () => {
    const onSuccess = vi.fn();
    render(
      <QRMenuItemDrawer
        isOpen={true}
        mode="create"
        item={null}
        sections={mockSections}
        menus={mockMenus}
        posProducts={mockPOSProducts}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    // Click submit with empty title and description
    const submitBtn = screen.getByRole('button', { name: 'Create QR Menu Item' });
    fireEvent.click(submitBtn);

    const errorMessages = await screen.findAllByText(/Dish title is required/i);
    expect(errorMessages.length).toBeGreaterThan(0);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('POS Catalog Sync Pipeline: selecting a POS product auto-populates title, description, and price', async () => {
    render(
      <QRMenuItemDrawer
        isOpen={true}
        mode="create"
        item={null}
        sections={mockSections}
        menus={mockMenus}
        posProducts={mockPOSProducts}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const posSelect = screen.getByLabelText(/POS Product Catalog Selector/i);
    // Select product ID 1 (Ribeye)
    fireEvent.change(posSelect, { target: { value: '1' } });

    // Verify auto-populated values
    expect(screen.getByDisplayValue('Bone-In Cowboy Ribeye (18oz)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('48.00')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/USDA Prime dry-aged bone-in ribeye cut/i)
    ).toBeInTheDocument();

    // Verify sync feedback banner is rendered
    expect(screen.getByText(/Catalog Synced:/i)).toBeInTheDocument();
  });

  it('validates image formats and URLs for image_url (Media Validation)', async () => {
    render(
      <QRMenuItemDrawer
        isOpen={true}
        mode="create"
        item={null}
        sections={mockSections}
        menus={mockMenus}
        posProducts={mockPOSProducts}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Switch to Direct URL mode
    fireEvent.click(screen.getByText('Direct URL'));

    const urlInput = screen.getByPlaceholderText(/https:\/\/images\.unsplash\.com/i);
    fireEvent.change(urlInput, { target: { value: 'https://example.com/unsupported-file.pdf' } });

    // Populate required fields
    fireEvent.change(screen.getByLabelText(/Dish Title/i), { target: { value: 'Test Burger' } });
    fireEvent.change(screen.getByLabelText(/Description, Ingredients & Allergens/i), {
      target: { value: 'Tasty burger description.' },
    });
    fireEvent.change(screen.getByLabelText(/Selling Price/i), { target: { value: '15.00' } });

    const submitBtn = screen.getByRole('button', { name: 'Create QR Menu Item' });
    fireEvent.click(submitBtn);

    const errorMessages = await screen.findAllByText(/Unsupported image format "\.pdf"/i);
    expect(errorMessages.length).toBeGreaterThan(0);
  });

  it('accepts valid image URL and creates item successfully', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <QRMenuItemDrawer
        isOpen={true}
        mode="create"
        item={null}
        sections={mockSections}
        menus={mockMenus}
        posProducts={mockPOSProducts}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Fill valid form
    fireEvent.change(screen.getByLabelText(/Dish Title/i), { target: { value: 'Wagyu Burger' } });
    fireEvent.change(screen.getByLabelText(/Description, Ingredients & Allergens/i), {
      target: { value: 'Double Wagyu patty with house sauce.' },
    });
    fireEvent.change(screen.getByLabelText(/Selling Price/i), { target: { value: '18.50' } });

    // Switch to direct URL and set valid URL
    fireEvent.click(screen.getByText('Direct URL'));
    const urlInput = screen.getByPlaceholderText(/https:\/\/images\.unsplash\.com/i);
    fireEvent.change(urlInput, { target: { value: 'https://example.com/burger.webp' } });

    const submitBtn = screen.getByRole('button', { name: 'Create QR Menu Item' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(qrMenuItemsApi.createQRMenuItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Wagyu Burger',
          description: 'Double Wagyu patty with house sauce.',
          price: 18.5,
          image_url: 'https://example.com/burger.webp',
        }),
        mockSections
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('pre-fills existing item attributes in edit mode and updates successfully', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <QRMenuItemDrawer
        isOpen={true}
        mode="edit"
        item={mockExistingItem}
        sections={mockSections}
        menus={mockMenus}
        posProducts={mockPOSProducts}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByRole('heading', { name: 'Edit QR Menu Item' })).toBeInTheDocument();
    expect(screen.getByText('#QR-ITM-9001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bone-In Cowboy Ribeye (18oz)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('48.00')).toBeInTheDocument();

    // Modify price
    const priceInput = screen.getByLabelText(/Selling Price/i);
    fireEvent.change(priceInput, { target: { value: '52.00' } });

    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(qrMenuItemsApi.updateQRMenuItem).toHaveBeenCalledWith(
        9001,
        expect.objectContaining({
          price: 52.0,
        }),
        mockSections
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
