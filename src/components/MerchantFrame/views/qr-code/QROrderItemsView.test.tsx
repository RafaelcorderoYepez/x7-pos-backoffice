import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QROrderItemsView } from './QROrderItemsView';
import {
  SEED_QR_ORDER_ITEMS,
  STORAGE_ITEMS_KEY,
} from '../../../../api/qr-order-items';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QROrderItemsView Component (US-QR-ORI-01)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(SEED_QR_ORDER_ITEMS));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders clean empty state with 0 metrics when no order items exist (mock-free live state)', async () => {
    localStorage.clear();
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('No QR Order Line Items Found')).toBeInTheDocument();
    });

    expect(
      screen.getByText('No line items have been registered or submitted for QR orders yet.')
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.textContent?.trim() === 'Showing 0 of 0 line items')
    ).toBeInTheDocument();
    expect(screen.getByTestId('create-line-item-empty-btn')).toBeInTheDocument();
  });

  it('renders workspace header, US badge and top operational & financial metric cards', async () => {
    render(<QROrderItemsView merchantId={3} onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('QR Order Item Line-Item Breakdown')).toBeInTheDocument();
    });

    expect(screen.getByText('US-QR-ORI-01')).toBeInTheDocument();
    expect(
      screen.getByText(/Kitchen Expeditor • POS Cashier • Financial Auditor Workspace/i)
    ).toBeInTheDocument();

    // KPI Cards
    expect(screen.getByText('Total Line Items')).toBeInTheDocument();
    expect(screen.getByText('Valid Line Items')).toBeInTheDocument();
    expect(screen.getAllByText('Voided / On Hold').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Removed / Archived').length).toBeGreaterThan(0);
    expect(screen.getByText('Total Portions')).toBeInTheDocument();
    expect(screen.getByText('Active Gross Volume')).toBeInTheDocument();
  });

  it('AC1 Relational Integrity: binds QROrder (#QR-ORD), QRMenuItem (dish name), and OrderItem (#POS-ORI)', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-1')).toBeInTheDocument();
    });

    // #QR-ORI-{id} line item badge
    expect(screen.getByTestId('badge-line-item-1')).toHaveTextContent('#QR-ORI-1');
    expect(screen.getByTestId('badge-line-item-2')).toHaveTextContent('#QR-ORI-2');

    // Bound to parent #QR-ORD-{qr_order_id}
    expect(screen.getByTestId('parent-badge-1')).toHaveTextContent('#QR-ORD-1');
    expect(screen.getByTestId('parent-badge-2')).toHaveTextContent('#QR-ORD-2');

    // Bound to QRMenuItem name
    expect(screen.getByText('Bone-In Cowboy Ribeye (18oz)')).toBeInTheDocument();
    expect(screen.getAllByText('Smoked Brisket Platter').length).toBeGreaterThan(0);

    // Bound to master POS OrderItem #POS-ORI-{order_item_id}
    expect(screen.getByTestId('pos-line-tag-1')).toHaveTextContent('#POS-ORI-101');
    expect(screen.getByTestId('pos-line-tag-2')).toHaveTextContent('#POS-ORI-102');
  });

  it('AC2 Subtotal Calculation: strictly equals quantity * unit_price with precision (12, 2)', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-1')).toBeInTheDocument();
    });

    // Item 1: quantity 1, unit_price 48.00 => subtotal $48.00
    expect(screen.getByText('$48.00 each')).toBeInTheDocument();
    expect(screen.getByText('1 × $48.00')).toBeInTheDocument();

    // Item 2: quantity 2, unit_price 29.50 => subtotal $59.00
    expect(screen.getAllByText('$29.50 each').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$59.00').length).toBeGreaterThan(0);
    expect(screen.getByText('2 × $29.50')).toBeInTheDocument();
  });

  it('displays monospace count indicator for quantity (e.g. "x2")', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('quantity-badge-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('quantity-badge-1')).toHaveTextContent('x1');
    expect(screen.getByTestId('quantity-badge-2')).toHaveTextContent('x2');
  });

  it('AC3 Item Note Rendering: prominently presents dish-level instructions (notes) in table view', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('notes-box-1')).toBeInTheDocument();
    });

    // Notes highlight box in row 1
    expect(screen.getByTestId('notes-box-1')).toHaveTextContent(
      'Medium rare, extra charred, roasted garlic butter on the side.'
    );

    // Severe allergy note in row 2
    expect(screen.getByTestId('notes-box-2')).toHaveTextContent(
      'Severe peanut allergy! Please prepare using sanitized cookware.'
    );
  });

  it('renders status pills with compliant colors and labels (active #10b981, inactive #f59e0b, archived #ef4444)', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('status-pill-1')).toBeInTheDocument();
    });

    // Active status pill
    const activePill = screen.getByTestId('status-pill-1');
    expect(activePill).toHaveTextContent('Valid Line Item');
    expect(activePill.className).toContain('text-[#10b981]');

    // Inactive status pill (Item 8)
    const inactivePill = screen.getByTestId('status-pill-8');
    expect(inactivePill).toHaveTextContent('Voided / On Hold');
    expect(inactivePill.className).toContain('text-[#f59e0b]');

    // Archived status pill (Item 7)
    const archivedPill = screen.getByTestId('status-pill-7');
    expect(archivedPill).toHaveTextContent('Removed');
    expect(archivedPill.className).toContain('text-[#ef4444]');
  });

  it('opens Kitchen Expeditor Ticket & Receipt modal with high prominence on dish-level notes', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-chit-btn-2')).toBeInTheDocument();
    });

    // Click Chit ticket button on Item 2 (peanut allergy)
    fireEvent.click(screen.getByTestId('view-chit-btn-2'));

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText('Kitchen Expeditor Ticket & Receipt')).toBeInTheDocument();
    });

    expect(screen.getByText('Kitchen Station Line Breakdown Chit')).toBeInTheDocument();
    expect(screen.getByText('LINE ITEM: #QR-ORI-2')).toBeInTheDocument();
    expect(screen.getByText('PARENT: #QR-ORD-2')).toBeInTheDocument();
    expect(screen.getByText('MASTER POS LINE:')).toBeInTheDocument();

    // High prominence dish-level instructions box in receipt
    const specialNotesBox = screen.getByTestId('chit-special-notes-box');
    expect(specialNotesBox).toBeInTheDocument();
    expect(specialNotesBox).toHaveTextContent('*** DISH-LEVEL INSTRUCTIONS & NOTES ***');
    expect(specialNotesBox).toHaveTextContent('Severe peanut allergy! Please prepare using sanitized cookware.');

    // Subtotal verification in chit
    expect(screen.getByText('SUBTOTAL PRICE:')).toBeInTheDocument();
    expect(screen.getAllByText('$59.00').length).toBeGreaterThanOrEqual(1);

    // Close chit
    fireEvent.click(screen.getByTestId('close-chit-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('chit-modal-overlay')).not.toBeInTheDocument();
    });
  });

  it('switches to KDS cards view mode and renders prominent expeditor instruction badges', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('KDS')).toBeInTheDocument();
    });

    // Click KDS button
    fireEvent.click(screen.getByText('KDS'));

    await waitFor(() => {
      expect(screen.getByTestId('kds-card-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('kds-notes-1')).toHaveTextContent('*** EXPEDITOR SPECIAL INSTRUCTION ***');
    expect(screen.getByTestId('kds-notes-1')).toHaveTextContent(
      'Medium rare, extra charred, roasted garlic butter on the side.'
    );
  });

  it('filters items in real time via search bar', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search dish name, notes/i);
    fireEvent.change(searchInput, { target: { value: 'salmon' } });

    await waitFor(() => {
      expect(screen.getByText('Wood-Grilled Cedar Plank Salmon')).toBeInTheDocument();
      expect(screen.queryByText('Bone-In Cowboy Ribeye (18oz)')).not.toBeInTheDocument();
    });
  });

  it('filters items by parent QR order dropdown', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-1')).toBeInTheDocument();
    });

    const parentSelect = screen.getByDisplayValue('All Parent QR Orders');
    fireEvent.change(parentSelect, { target: { value: '2' } });

    await waitFor(() => {
      // Order 2 items are Smoked Brisket (#QR-ORI-2) and Bourbon (#QR-ORI-3)
      expect(screen.getByTestId('badge-line-item-2')).toBeInTheDocument();
      expect(screen.getByTestId('badge-line-item-3')).toBeInTheDocument();
      expect(screen.queryByTestId('badge-line-item-1')).not.toBeInTheDocument();
    });
  });

  it('opens create modal, dynamically calculates subtotal, and creates new line item', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('create-line-item-btn')).toBeInTheDocument();
    });

    // Open create modal
    fireEvent.click(screen.getByTestId('create-line-item-btn'));

    expect(screen.getByText('Create QR Order Line Item')).toBeInTheDocument();

    // Verify subtotal calculation in form
    expect(screen.getByTestId('form-computed-subtotal')).toBeInTheDocument();

    // Type special notes
    const notesInput = screen.getByPlaceholderText(/No onions, extra dressing/i);
    fireEvent.change(notesInput, { target: { value: 'Extra sauce and no jalapeños please.' } });

    // Submit form
    fireEvent.click(screen.getByTestId('submit-line-item-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('success-toast')).toBeInTheDocument();
      expect(screen.getByText(/Created line item #QR-ORI/i)).toBeInTheDocument();
    });
  });

  it('allows editing an existing line item', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-btn-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-btn-1'));

    expect(screen.getByText('Edit Line Item #QR-ORI-1')).toBeInTheDocument();

    const notesInput = screen.getByPlaceholderText(/No onions, extra dressing/i);
    fireEvent.change(notesInput, { target: { value: 'Updated special prep note.' } });

    fireEvent.click(screen.getByTestId('submit-line-item-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('success-toast')).toBeInTheDocument();
      expect(screen.getByText(/"Updated special prep note."/i)).toBeInTheDocument();
    });
  });

  it('AC1 KPI Summary Accuracy: accurately tallies total lines, total quantity sold, average items per order, and instructions ratio', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('operational-kpi-banner')).toBeInTheDocument();
    });

    // Total Line Items Processed: 8 lines in seed data
    const totalLinesCard = screen.getByTestId('kpi-total-lines-processed');
    expect(totalLinesCard).toHaveTextContent('8');
    expect(totalLinesCard).toHaveTextContent('Total Line Items Processed');

    // Total Items Sold: sum of quantity across active lines (1+2+2+2+1+1 = 9 items sold)
    const totalItemsSoldCard = screen.getByTestId('kpi-total-items-sold');
    expect(totalItemsSoldCard).toHaveTextContent('9');
    expect(totalItemsSoldCard).toHaveTextContent('Total Portions: 11');

    // Average Items per Order: 8 line items across 5 parent orders = 1.6
    const avgItemsCard = screen.getByTestId('kpi-average-items-per-order');
    expect(avgItemsCard).toHaveTextContent('1.6');
    expect(avgItemsCard).toHaveTextContent('Average Items per Order');

    // Special Instructions Ratio: All 8 lines contain custom notes = 100%
    const notesRatioCard = screen.getByTestId('kpi-special-instructions-ratio');
    expect(notesRatioCard).toHaveTextContent('100%');
    expect(notesRatioCard).toHaveTextContent('Special Instructions Ratio');
  });

  it('AC2 Dynamic Multi-Filtering: filters by menu item, status checkboxes, and order instantly without page reloads', async () => {
    render(<QROrderItemsView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-1')).toBeInTheDocument();
    });

    // 1. Menu Item Filter: Select Smoked Brisket Platter (ID 9002)
    const menuItemSelect = screen.getByTestId('menu-item-filter');
    fireEvent.change(menuItemSelect, { target: { value: '9002' } });

    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-2')).toBeInTheDocument();
      expect(screen.queryByTestId('badge-line-item-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('badge-line-item-3')).not.toBeInTheDocument();
    });

    // Reset Menu Item filter to ALL
    fireEvent.change(menuItemSelect, { target: { value: 'ALL' } });
    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-1')).toBeInTheDocument();
    });

    // 2. Status Checkboxes: Uncheck 'active' to isolate inactive and archived line items
    const activeCheckbox = screen.getByTestId('status-checkbox-active');
    expect(activeCheckbox).toBeChecked();
    fireEvent.click(activeCheckbox);
    expect(activeCheckbox).not.toBeChecked();

    await waitFor(() => {
      // Active items (1 to 6) are hidden
      expect(screen.queryByTestId('badge-line-item-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('badge-line-item-2')).not.toBeInTheDocument();
      // Inactive item 8 and archived item 7 are visible
      expect(screen.getByTestId('badge-line-item-7')).toBeInTheDocument();
      expect(screen.getByTestId('badge-line-item-8')).toBeInTheDocument();
    });

    // Click Clear Filters button
    const clearBtn = screen.getByTestId('reset-filters-btn');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('status-checkbox-active')).toBeChecked();
    });
  });

  it('AC3 Complete Navigation Hub: does not render duplicate embedded navigation hub bar as persistent frame hub handles it', async () => {
    const onNavigateMock = vi.fn();
    render(<QROrderItemsView merchantId={3} onNavigate={onNavigateMock} />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-line-item-1')).toBeInTheDocument();
    });

    // Verify duplicate embedded navigation hub is not rendered (handled by global ModuleNavHubBar in MerchantFrame)
    expect(screen.queryByRole('navigation', { name: /QR Code System Sub-Modules/i })).not.toBeInTheDocument();
  });
});
