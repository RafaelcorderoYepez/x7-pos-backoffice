import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QRMenuDrawer } from './QRMenuDrawer';
import type { QRMenu } from '../../../../types/qr-menu';
import * as qrMenusApi from '../../../../api/qr-menus';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QRMenuDrawer Component', () => {
  const mockMenu: QRMenu = {
    id: 101,
    merchant_id: 3,
    name: 'Main Dinner & Cocktail Menu',
    description: 'Prime dry-aged steaks and crafted cocktail selection.',
    status: 'active',
    design_theme: 'Texas Theme',
    qr_type: 'Table',
    sections_count: 3,
    items_count: 8,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <QRMenuDrawer
        isOpen={false}
        mode="create"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly in create mode with default fields', () => {
    render(
      <QRMenuDrawer
        isOpen={true}
        mode="create"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('Create New QR Menu')).toBeInTheDocument();
    expect(screen.getByLabelText(/Menu Name/i)).toHaveValue('');
    expect(screen.getByLabelText(/Menu Description/i)).toHaveValue('');
    expect(screen.getByText(/Live Customer Mobile Preview/i)).toBeInTheDocument();
  });

  it('validates required fields and displays validation errors when submitted empty', async () => {
    const user = userEvent.setup();
    render(
      <QRMenuDrawer
        isOpen={true}
        mode="create"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const saveButton = screen.getByTestId('qr-menu-save-btn');
    await user.click(saveButton);

    expect(screen.getByText('Menu name is required.')).toBeInTheDocument();
    expect(screen.getByText('Menu description is required.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('updates character count and clears errors as user types', async () => {
    const user = userEvent.setup();
    render(
      <QRMenuDrawer
        isOpen={true}
        mode="create"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const saveButton = screen.getByTestId('qr-menu-save-btn');
    await user.click(saveButton);
    expect(screen.getByText('Menu name is required.')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Menu Name/i);
    await user.type(nameInput, 'Summer Special');

    expect(screen.getByText('14/100')).toBeInTheDocument();
    expect(screen.queryByText('Menu name is required.')).not.toBeInTheDocument();
  });

  it('updates the Mobile Frame Mockup in real-time when changing design theme and name', async () => {
    const user = userEvent.setup();
    render(
      <QRMenuDrawer
        isOpen={true}
        mode="create"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const nameInput = screen.getByLabelText(/Menu Name/i);
    await user.type(nameInput, 'Midnight Speakeasy Cocktails');

    // Live preview updates title
    expect(screen.getByText('Midnight Speakeasy Cocktails')).toBeInTheDocument();

    // Select "Midnight Bistro" theme
    const themeSelect = screen.getByLabelText(/Design Theme/i) as HTMLSelectElement;
    await user.selectOptions(themeSelect, 'Midnight Bistro');

    // Live preview updates theme label
    expect(screen.getByText(/Live Customer Mobile Preview \(Midnight Bistro\)/i)).toBeInTheDocument();
  });

  it('prefills fields and updates menu in edit mode', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(qrMenusApi, 'updateQRMenu').mockResolvedValue({
      ...mockMenu,
      name: 'Updated Dinner Menu',
    });
    const onSuccess = vi.fn();

    render(
      <QRMenuDrawer
        isOpen={true}
        mode="edit"
        menu={mockMenu}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText(/Edit QR Menu: Main Dinner & Cocktail Menu/i)).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/Menu Name/i);
    expect(nameInput).toHaveValue('Main Dinner & Cocktail Menu');

    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Dinner Menu');

    const saveButton = screen.getByTestId('qr-menu-save-btn');
    await user.click(saveButton);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        101,
        expect.objectContaining({ name: 'Updated Dinner Menu' })
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('shows duplication info and triggers clone pipeline in clone mode', async () => {
    const user = userEvent.setup();
    const cloneSpy = vi.spyOn(qrMenusApi, 'cloneQRMenu').mockResolvedValue({
      menu: {
        ...mockMenu,
        id: 999,
        name: 'Main Dinner & Cocktail Menu (Copy)',
      },
      sections: [],
      items: [],
    });
    const onSuccess = vi.fn();

    render(
      <QRMenuDrawer
        isOpen={true}
        mode="clone"
        menu={mockMenu}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('Clone QR Menu Pipeline')).toBeInTheDocument();
    expect(screen.getByText(/Duplicating from/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Menu Name/i)).toHaveValue('Main Dinner & Cocktail Menu (Copy)');

    const saveButton = screen.getByTestId('qr-menu-save-btn');
    await user.click(saveButton);

    await waitFor(() => {
      expect(cloneSpy).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          source_menu_id: 101,
          name: 'Main Dinner & Cocktail Menu (Copy)',
        })
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('closes on Escape key press or backdrop click', () => {
    const onClose = vi.fn();
    render(
      <QRMenuDrawer
        isOpen={true}
        mode="create"
        onClose={onClose}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = screen.getByTestId('qr-drawer-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
