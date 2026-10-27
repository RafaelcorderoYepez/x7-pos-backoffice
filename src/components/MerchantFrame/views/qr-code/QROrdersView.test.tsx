import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { QROrdersView } from './QROrdersView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

describe('QROrdersView Component (US-QR-ORD-01)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders workspace header, US badge and top operational metric cards', async () => {
    render(<QROrdersView merchantId={3} onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('QR Order Management Workspace')).toBeInTheDocument();
    });

    expect(screen.getByText('US-QR-ORD-01')).toBeInTheDocument();
    expect(screen.getByText('Total QR Orders')).toBeInTheDocument();
    expect(screen.getByText('Pending Acceptance')).toBeInTheDocument();
    expect(screen.getByText('Cooking / In-Flight')).toBeInTheDocument();
    expect(screen.getByText('Served / Delivered')).toBeInTheDocument();
    expect(screen.getByText('Total QR Volume')).toBeInTheDocument();
  });

  it('displays QR Order badge (#QR-ORD-{id}) alongside master POS order reference (#ORD-{order_id})', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    // Master POS order reference binding
    expect(screen.getByText('#ORD-5001')).toBeInTheDocument();
    expect(screen.getByText('#QR-ORD-2')).toBeInTheDocument();
    expect(screen.getByText('#ORD-5002')).toBeInTheDocument();
  });

  it('displays location name, dining table number, customer name, and Guest Scan fallback', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Sofia Ramirez')).toBeInTheDocument();
    });

    // Check customer name
    expect(screen.getByText('Sofia Ramirez')).toBeInTheDocument();
    expect(screen.getByText('Carlos Santana')).toBeInTheDocument();

    // Check "Guest Scan" for orders without customer_id
    const guestScans = screen.getAllByText('Guest Scan');
    expect(guestScans.length).toBeGreaterThanOrEqual(1);

    // Check dining table numbers
    expect(screen.getAllByText(/Table #12/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Table #Patio-01/i).length).toBeGreaterThan(0);
  });

  it('renders formatted currency for total_amount and highlights customer special notes', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('$48.50')).toBeInTheDocument();
    });

    // Precision 12,2 currency formatting
    expect(screen.getByText('$112.75')).toBeInTheDocument();
    expect(screen.getByText('$64.00')).toBeInTheDocument();

    // Customer notes preview callouts
    expect(
      screen.getByText(/Extra lime on grilled salmon, salad dressing on the side please\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Severe peanut allergy! Please prepare using sanitized cookware\./i)
    ).toBeInTheDocument();
  });

  it('renders QR Order Status pills with compliant labels', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    // PENDING status label
    expect(screen.getAllByText('Awaiting Staff Acceptance').length).toBeGreaterThan(0);

    // CONFIRMED / IN_PREPARATION status labels
    expect(screen.getAllByText('Cooking').length).toBeGreaterThan(0);

    // DELIVERED status label
    expect(screen.getAllByText('Served to Table').length).toBeGreaterThan(0);

    // CANCELLED status label
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);
  });

  it('filters QR orders by search query across customer, notes, or order badges', async () => {
    const user = userEvent.setup();
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Sofia Ramirez')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Universal Search Bar');

    // Search by note keyword
    await user.type(searchInput, 'peanut');
    expect(screen.getByText('Carlos Santana')).toBeInTheDocument();
    expect(screen.queryByText('Sofia Ramirez')).not.toBeInTheDocument();

    // Clear and search by POS order badge
    await user.clear(searchInput);
    await user.type(searchInput, '#ORD-5004');
    expect(screen.getByText('Valentina Mendoza')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Santana')).not.toBeInTheDocument();
  });

  it('calculates KPI banner metrics accurately (Total QR Orders, Total QR Sales Volume, Pending Acceptance, Active Kitchen Orders)', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByTestId('qr-kpi-summary-banner')).toBeInTheDocument();
    });

    // 1. Total QR Orders (6 seed orders)
    expect(screen.getByText('Total QR Orders')).toBeInTheDocument();
    expect(screen.getByText('Processed today')).toBeInTheDocument();

    // 2. Total QR Sales Volume across active orders
    expect(screen.getByText('Total QR Sales Volume')).toBeInTheDocument();
    expect(screen.getByText('Sum across active orders')).toBeInTheDocument();

    // 3. Pending Acceptance (2 pending orders)
    expect(screen.getByText('Pending Acceptance')).toBeInTheDocument();
    expect(screen.getByText('Awaiting staff approval')).toBeInTheDocument();

    // 4. Active Kitchen Orders (orders in CONFIRMED or IN_PREPARATION)
    expect(screen.getByText('Active Kitchen Orders')).toBeInTheDocument();
    expect(screen.getByText('Cooking / In-Flight')).toBeInTheDocument();
  });

  it('dynamically filters orders by QR Location dropdown and updates board instantly without reload', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Sofia Ramirez')).toBeInTheDocument();
    });

    const locationSelect = screen.getByTestId('qr-location-filter');

    // Select Curbside Pickup Point (id 2)
    fireEvent.change(locationSelect, { target: { value: '2' } });

    // Order 4 (Curbside) should be visible
    expect(screen.getByText('Valentina Mendoza')).toBeInTheDocument();
    // Order 1 (Patio) should be filtered out
    expect(screen.queryByText('Sofia Ramirez')).not.toBeInTheDocument();

    // Reset to ALL locations
    fireEvent.change(locationSelect, { target: { value: 'ALL' } });
    expect(screen.getByText('Sofia Ramirez')).toBeInTheDocument();
  });

  it('filters orders by Status Checkboxes (active, inactive, archived) dynamically', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('Sofia Ramirez')).toBeInTheDocument();
    });

    // Order 5 is 'archived' (Customer cancelled checkout)
    const archivedCheckbox = screen.getByLabelText(/Filter by Archived status/i);
    expect(archivedCheckbox).toBeChecked();

    // Uncheck Archived checkbox -> Order 5 (#QR-ORD-5) should disappear
    fireEvent.click(archivedCheckbox);
    expect(archivedCheckbox).not.toBeChecked();
    expect(screen.queryByText(/Customer changed mind and walked out/i)).not.toBeInTheDocument();
    expect(screen.queryByText('#QR-ORD-5')).not.toBeInTheDocument();

    // Re-check Archived checkbox -> Order 5 reappears
    fireEvent.click(archivedCheckbox);
    expect(archivedCheckbox).toBeChecked();
    expect(screen.getByText(/Customer changed mind and walked out/i)).toBeInTheDocument();
    expect(screen.getByText('#QR-ORD-5')).toBeInTheDocument();
  });

  it('does not render duplicate embedded navigation hub as global ModuleNavHubBar handles navigation', async () => {
    const onNavigateMock = vi.fn();
    render(<QROrdersView merchantId={3} onNavigate={onNavigateMock} />);

    await waitFor(() => {
      expect(screen.getByText('QR Order Management Workspace')).toBeInTheDocument();
    });

    // Verify no redundant embedded navigation hub is rendered inside the view
    expect(screen.queryByText('Navigation Hub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-hub-qr-orders')).not.toBeInTheDocument();
  });

  it('toggles between Table Directory View and Kanban Dispatch Board View', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    // Switch to Kanban View
    const kanbanToggle = screen.getByTestId('toggle-kanban-view');
    fireEvent.click(kanbanToggle);

    // Verify Kanban column headers
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In Preparation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);

    // Verify kanban card
    expect(screen.getByTestId('kanban-card-1')).toBeInTheDocument();

    // Switch back to Table View
    const tableToggle = screen.getByTestId('toggle-table-view');
    fireEvent.click(tableToggle);

    expect(screen.getByTestId('qr-order-row-1')).toBeInTheDocument();
  });

  it('opens side drawer to view full relational bindings and customer notes', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    const viewDetailsButtons = screen.getAllByTitle('View Full Order Details');
    fireEvent.click(viewDetailsButtons[0]);

    // Drawer should open
    expect(screen.getByText('QR scan transactional header & POS linkage')).toBeInTheDocument();
    expect(screen.getByText('Current Lifecycle Status')).toBeInTheDocument();
    expect(screen.getByText(/precision: 12, scale: 2/i)).toBeInTheDocument();
    expect(screen.getByText('Special Customer Request Notes')).toBeInTheDocument();
    expect(screen.getByText('Relational Bindings')).toBeInTheDocument();
  });

  it('opens Inject QR Order modal, enforces precision 12,2 validation and creates order', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    const createBtn = screen.getByTestId('create-qr-order-btn');
    fireEvent.click(createBtn);

    expect(screen.getByText('Inject New QR Order')).toBeInTheDocument();

    // Try submitting with invalid amount precision (3 decimals)
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '45.999' } });

    const submitBtn = screen.getByTestId('submit-qr-order-btn');
    fireEvent.click(submitBtn);

    // Should show scale 2 precision error
    await waitFor(() => {
      expect(screen.getByText(/maximum 2 decimal places allowed \(scale: 2\)/i)).toBeInTheDocument();
    });

    // Fix amount to valid 2 decimals and inject order
    fireEvent.change(amountInput, { target: { value: '75.50' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Order #QR-ORD-7 injected into master POS.')).toBeInTheDocument();
    });

    expect(screen.getByText('$75.50')).toBeInTheDocument();
  });

  it('triggers quick lifecycle advance action from table view', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    // Order 1 is PENDING, so first transition is "Accept Order"
    const acceptBtn = screen.getAllByTitle('Accept Order')[0];
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/automatically routed to Kitchen Display System \(KDS\)/i)
      ).toBeInTheDocument();
    });
  });

  it('renders KDS Kitchen Dispatch Automation banner and prominent customer preparation notes in Detail Drawer', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    // Order 1 has special customer notes: "Extra lime on grilled salmon, salad dressing on the side please."
    const viewButtons = screen.getAllByTitle('View Full Order Details');
    fireEvent.click(viewButtons[0]);

    // Detail drawer open
    expect(screen.getByTestId('qr-order-detail-drawer')).toBeInTheDocument();

    // Notes prominence: special notes callout box
    const notesBox = screen.getByTestId('drawer-customer-notes-callout');
    expect(notesBox).toBeInTheDocument();
    expect(notesBox).toHaveTextContent(/Special Preparation & Allergy Instruction/i);
    expect(notesBox).toHaveTextContent(/Extra lime on grilled salmon/i);
    expect(screen.getByText('Expeditor Priority Flag')).toBeInTheDocument();

    // Click "Accept Order" from inside drawer -> triggers KDS automated dispatch
    const drawerAcceptBtn = screen.getByTestId('drawer-accept-order-btn');
    fireEvent.click(drawerAcceptBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/routed to Kitchen Display System \(KDS\) screens/i)
      ).toBeInTheDocument();
    });

    // After confirmation, KDS active prep routing banner is visible
    expect(screen.getByTestId('kds-routing-banner')).toBeInTheDocument();
    expect(screen.getByText(/Routed to KDS Kitchen Stations/i)).toBeInTheDocument();
  });

  it('restricts invalid status transitions (cannot transition directly from DELIVERED back to PENDING)', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-4')).toBeInTheDocument();
    });

    // Order 4 is in DELIVERED status
    const viewButtons = screen.getAllByTitle('View Full Order Details');
    // Find view button for Order 4
    fireEvent.click(viewButtons[3]);

    expect(screen.getByText('Completed / Terminal')).toBeInTheDocument();

    // Check PENDING status button in drawer: must be disabled
    const pendingBtn = screen.getByTestId('drawer-status-btn-pending');
    expect(pendingBtn).toBeDisabled();
    expect(pendingBtn).toHaveAttribute(
      'title',
      expect.stringContaining('Cannot transition directly from DELIVERED back to PENDING')
    );

    // Also CONFIRMED button must be disabled
    const confirmedBtn = screen.getByTestId('drawer-status-btn-confirmed');
    expect(confirmedBtn).toBeDisabled();

    // Check terminal explanation banner
    expect(
      screen.getByText(/Lifecycle status cannot be reverted directly to PENDING/i)
    ).toBeInTheDocument();
  });

  it('opens Kitchen Expeditor Ticket preview with high prominence on special prep notes and chit printout', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-2')).toBeInTheDocument();
    });

    // Open detail drawer for Order 2 (peanut allergy)
    const viewButtons = screen.getAllByTitle('View Full Order Details');
    fireEvent.click(viewButtons[1]);

    const printTicketBtn = screen.getByTestId('print-kitchen-ticket-btn');
    fireEvent.click(printTicketBtn);

    // Kitchen Expeditor Ticket Modal should be visible
    expect(screen.getByTestId('kitchen-expeditor-ticket-modal')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Station Dispatch Chit')).toBeInTheDocument();

    // Special preparation notes box in chit
    const ticketNotesBox = screen.getByTestId('ticket-special-notes-box');
    expect(ticketNotesBox).toBeInTheDocument();
    expect(ticketNotesBox).toHaveTextContent(/Severe peanut allergy/i);

    // Close modal
    fireEvent.click(screen.getByTestId('close-ticket-modal-btn'));
    expect(screen.queryByTestId('kitchen-expeditor-ticket-modal')).not.toBeInTheDocument();
  });

  it('adjusts table binding directly from Detail Drawer', async () => {
    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    const viewButtons = screen.getAllByTitle('View Full Order Details');
    fireEvent.click(viewButtons[0]);

    const tableSelector = screen.getByTestId('drawer-table-selector');
    // Change table to Table #14 (id 202)
    fireEvent.change(tableSelector, { target: { value: '202' } });

    const saveTableBtn = screen.getByTestId('drawer-update-table-btn');
    fireEvent.click(saveTableBtn);

    await waitFor(() => {
      expect(screen.getByText(/dining table updated to Table #14/i)).toBeInTheDocument();
    });
  });

  it('handles cancellation and refund from Detail Drawer', async () => {
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<QROrdersView merchantId={3} />);

    await waitFor(() => {
      expect(screen.getByText('#QR-ORD-1')).toBeInTheDocument();
    });

    const viewButtons = screen.getAllByTitle('View Full Order Details');
    fireEvent.click(viewButtons[0]);

    const cancelRefundBtn = screen.getByTestId('drawer-cancel-refund-btn');
    fireEvent.click(cancelRefundBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/successfully cancelled and marked for refund/i)
      ).toBeInTheDocument();
    });
  });
});
