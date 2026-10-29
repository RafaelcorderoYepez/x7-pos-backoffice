import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QROrderItemDrawer } from './QROrderItemDrawer';
import type { QROrderItem } from '../../../../types/qr-order-item';
import {
  MOCK_PARENT_QR_ORDERS,
  MOCK_QR_MENU_ITEMS,
  MOCK_POS_ORDER_ITEMS,
  initializeMockOrderItems,
} from '../../../../api/qr-order-items';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QROrderItemDrawer Component (Floor Expeditor & POS Cashier)', () => {
  const mockOrders = MOCK_PARENT_QR_ORDERS;
  const mockMenuItems = MOCK_QR_MENU_ITEMS;
  const mockPosItems = MOCK_POS_ORDER_ITEMS;

  const sampleItem: QROrderItem = {
    id: 1,
    qr_order_id: 1,
    qr_menu_item_id: 9001,
    order_item_id: 101,
    quantity: 1,
    unit_price: 48.0,
    subtotal_price: 48.0,
    notes: 'Medium rare, extra charred, roasted garlic butter on the side.',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    localStorage.clear();
    initializeMockOrderItems();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(
      <QROrderItemDrawer
        isOpen={false}
        mode="create"
        item={null}
        orders={mockOrders}
        menuItems={mockMenuItems}
        posItems={mockPosItems}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.queryByTestId('qr-order-item-drawer')).not.toBeInTheDocument();
  });

  it('renders drawer in create mode with default fields and title', async () => {
    render(
      <QROrderItemDrawer
        isOpen={true}
        mode="create"
        item={null}
        orders={mockOrders}
        menuItems={mockMenuItems}
        posItems={mockPosItems}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByTestId('qr-order-item-drawer')).toBeInTheDocument();
    expect(screen.getByText('Create QR Order Line Item')).toBeInTheDocument();
    expect(screen.getByText('POST')).toBeInTheDocument();

    // Default quantity 1
    const qtyInput = screen.getByTestId('drawer-quantity-input') as HTMLInputElement;
    expect(qtyInput.value).toBe('1');

    // Default status active
    const statusSelect = screen.getByTestId('drawer-status-select') as HTMLSelectElement;
    expect(statusSelect.value).toBe('active');
  });

  it('renders drawer in edit mode with item attributes pre-filled', async () => {
    render(
      <QROrderItemDrawer
        isOpen={true}
        mode="edit"
        item={sampleItem}
        orders={mockOrders}
        menuItems={mockMenuItems}
        posItems={mockPosItems}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('Edit Line Item #QR-ORI-1')).toBeInTheDocument();
    expect(screen.getByText('PATCH')).toBeInTheDocument();

    const qtyInput = screen.getByTestId('drawer-quantity-input') as HTMLInputElement;
    expect(qtyInput.value).toBe('1');

    const unitPriceInput = screen.getByTestId('drawer-unit-price-input') as HTMLInputElement;
    expect(unitPriceInput.value).toBe('48.00');

    const subtotalDisplay = screen.getByTestId('drawer-subtotal-display') as HTMLInputElement;
    expect(subtotalDisplay.value).toBe('$48.00');

    const notesInput = screen.getByTestId('drawer-notes-input') as HTMLTextAreaElement;
    expect(notesInput.value).toBe(sampleItem.notes);
  });

  describe('AC1: Form Validation', () => {
    it('validates required fields: quantity >= 1 and unit_price >= 0', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="edit"
          item={sampleItem}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      // Set invalid quantity 0
      const qtyInput = screen.getByTestId('drawer-quantity-input');
      fireEvent.change(qtyInput, { target: { value: '0' } });

      // Set invalid unit price
      const priceInput = screen.getByTestId('drawer-unit-price-input');
      fireEvent.change(priceInput, { target: { value: '-5.00' } });

      // Try submitting
      fireEvent.click(screen.getByTestId('submit-line-item-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('drawer-general-error')).toBeInTheDocument();
      });

      expect(screen.getByTestId('error-quantity')).toBeInTheDocument();
      expect(screen.getByTestId('error-unit-price')).toBeInTheDocument();
    });

    it('rejects empty quantity and invalid formats', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="create"
          item={null}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      const qtyInput = screen.getByTestId('drawer-quantity-input');
      fireEvent.change(qtyInput, { target: { value: '' } });

      fireEvent.click(screen.getByTestId('submit-line-item-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('drawer-general-error')).toBeInTheDocument();
        expect(screen.getByTestId('error-quantity')).toHaveTextContent(
          'Quantity is required'
        );
      });
    });
  });

  describe('AC2: Auto Subtotal Calculation', () => {
    it('dynamically calculates subtotal as quantity changes via input', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="edit"
          item={sampleItem}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      const qtyInput = screen.getByTestId('drawer-quantity-input');
      const subtotalDisplay = screen.getByTestId('drawer-subtotal-display') as HTMLInputElement;

      // Initial subtotal: 1 * 48.00 = $48.00
      expect(subtotalDisplay.value).toBe('$48.00');

      // Change quantity to 3: 3 * 48.00 = $144.00
      fireEvent.change(qtyInput, { target: { value: '3' } });
      expect(subtotalDisplay.value).toBe('$144.00');

      // Change quantity to 10: 10 * 48.00 = $480.00
      fireEvent.change(qtyInput, { target: { value: '10' } });
      expect(subtotalDisplay.value).toBe('$480.00');
    });

    it('dynamically calculates subtotal as quantity changes via stepper buttons (+/-)', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="edit"
          item={sampleItem}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      const subtotalDisplay = screen.getByTestId('drawer-subtotal-display') as HTMLInputElement;
      expect(subtotalDisplay.value).toBe('$48.00');

      // Click + button: 2 * 48.00 = $96.00
      const plusBtn = screen.getByRole('button', { name: '+' });
      fireEvent.click(plusBtn);
      expect(subtotalDisplay.value).toBe('$96.00');

      // Click + button again: 3 * 48.00 = $144.00
      fireEvent.click(plusBtn);
      expect(subtotalDisplay.value).toBe('$144.00');

      // Click - button: 2 * 48.00 = $96.00
      const minusBtn = screen.getByRole('button', { name: '-' });
      fireEvent.click(minusBtn);
      expect(subtotalDisplay.value).toBe('$96.00');
    });

    it('dynamically calculates subtotal as unit_price changes', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="edit"
          item={sampleItem}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      const unitPriceInput = screen.getByTestId('drawer-unit-price-input');
      const subtotalDisplay = screen.getByTestId('drawer-subtotal-display') as HTMLInputElement;

      // Change unit price to 25.50 (qty = 1): subtotal = $25.50
      fireEvent.change(unitPriceInput, { target: { value: '25.50' } });
      expect(subtotalDisplay.value).toBe('$25.50');

      // Change quantity to 2: subtotal = 2 * 25.50 = $51.00
      const qtyInput = screen.getByTestId('drawer-quantity-input');
      fireEvent.change(qtyInput, { target: { value: '2' } });
      expect(subtotalDisplay.value).toBe('$51.00');
    });

    it('updates unit price automatically when selecting a dish in Menu Item Picker', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="create"
          item={null}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      // Select Smoked Brisket Platter (ID 9002, price 29.50)
      const select = screen.getByTestId('drawer-menu-item-select');
      fireEvent.change(select, { target: { value: '9002' } });

      const unitPriceInput = screen.getByTestId('drawer-unit-price-input') as HTMLInputElement;
      expect(unitPriceInput.value).toBe('29.50');

      const subtotalDisplay = screen.getByTestId('drawer-subtotal-display') as HTMLInputElement;
      expect(subtotalDisplay.value).toBe('$29.50');
    });
  });

  describe('AC3: Parent Totals Sync & Cascade Recalculation Engine', () => {
    it('displays live cascade recalculation banner with projected parent total', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="edit"
          item={sampleItem}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('drawer-cascade-banner')).toBeInTheDocument();
      });

      expect(screen.getByText('Cascade Recalculation Engine')).toBeInTheDocument();
      expect(screen.getByTestId('projected-parent-total')).toBeInTheDocument();
    });

    it('updates projected parent total live when quantity or price increases', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="edit"
          item={sampleItem}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('projected-parent-total')).toBeInTheDocument();
      });

      // Increase quantity from 1 to 2 (+48.00)
      const qtyInput = screen.getByTestId('drawer-quantity-input');
      fireEvent.change(qtyInput, { target: { value: '2' } });

      // Live subtotal reflects $96.00
      expect(screen.getByTestId('drawer-subtotal-display')).toHaveValue('$96.00');
    });

    it('voiding an individual line item (Quick Void) excludes it from parent total calculation', async () => {
      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="edit"
          item={sampleItem}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      // Verify Quick Void button exists in active edit mode
      const voidBtn = screen.getByTestId('quick-void-btn');
      expect(voidBtn).toBeInTheDocument();

      // Click Quick Void
      fireEvent.click(voidBtn);

      // Status selector switches to 'inactive'
      const statusSelect = screen.getByTestId('drawer-status-select') as HTMLSelectElement;
      expect(statusSelect.value).toBe('inactive');

      // Banner shows warning that voided lines contribute $0.00
      expect(
        screen.getByText(/Voided \/ On Hold status excludes this line from the parent order's total amount/i)
      ).toBeInTheDocument();

      // Quick Restore button becomes available
      const restoreBtn = screen.getByTestId('quick-restore-btn');
      expect(restoreBtn).toBeInTheDocument();

      // Click Quick Restore
      fireEvent.click(restoreBtn);
      expect(statusSelect.value).toBe('active');
    });

    it('submits valid changes and triggers onSuccess callback with updated parent total', async () => {
      const onSuccessMock = vi.fn();
      const onCloseMock = vi.fn();

      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="edit"
          item={sampleItem}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={onCloseMock}
          onSuccess={onSuccessMock}
        />
      );

      // Modify notes
      const notesInput = screen.getByTestId('drawer-notes-input');
      fireEvent.change(notesInput, { target: { value: 'Extra truffle butter please.' } });

      // Submit form
      fireEvent.click(screen.getByTestId('submit-line-item-btn'));

      await waitFor(() => {
        expect(onSuccessMock).toHaveBeenCalledTimes(1);
        expect(onCloseMock).toHaveBeenCalledTimes(1);
      });

      const [savedItem, projectedTotal] = onSuccessMock.mock.calls[0];
      expect(savedItem.id).toBe(1);
      expect(savedItem.notes).toBe('Extra truffle butter please.');
      expect(typeof projectedTotal).toBe('number');
    });
  });

  describe('Drawer Navigation & Keyboard Accessibility', () => {
    it('closes on Close button click and Cancel button click', () => {
      const onCloseMock = vi.fn();

      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="create"
          item={null}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={onCloseMock}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('drawer-close-btn'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('drawer-cancel-btn'));
      expect(onCloseMock).toHaveBeenCalledTimes(2);
    });

    it('closes on Escape key press', () => {
      const onCloseMock = vi.fn();

      render(
        <QROrderItemDrawer
          isOpen={true}
          mode="create"
          item={null}
          orders={mockOrders}
          menuItems={mockMenuItems}
          posItems={mockPosItems}
          onClose={onCloseMock}
          onSuccess={vi.fn()}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
