import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CashTipMovementsView } from './CashTipMovementsView';
import * as cashTipMovementsApi from '../../../../api/cash-tip-movements';

const sampleMovements: cashTipMovementsApi.CashTipMovement[] = [
  {
    id: 1001,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    cash_drawer_id: 1,
    tip_id: 701,
    movement_type: 'IN',
    amount: 25.5,
    notes: 'Shift tip collection',
    created_at: '2026-09-15T14:30:00Z',
    created_by: 88,
  },
  {
    id: 1002,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    cash_drawer_id: 2,
    tip_id: 702,
    movement_type: 'OUT',
    amount: 15.0,
    notes: 'Cash tip payout to server',
    created_at: '2026-09-15T16:00:00Z',
    created_by: 88,
  },
];

const sampleDrawers = [
  { id: 1, name: 'Drawer 1 - Main POS', status: 'OPEN', starting_cash: 200, current_balance: 150 },
  { id: 2, name: 'Drawer 2 - Bar POS', status: 'OPEN', starting_cash: 150, current_balance: 180 },
  { id: 3, name: 'Drawer 3 - Patio POS', status: 'CLOSED', starting_cash: 100, current_balance: 100 },
];

const sampleTips = [
  { id: 701, amount: 25.5, status: 'COLLECTED', date: '2026-09-15' },
  { id: 702, amount: 15.0, status: 'COLLECTED', date: '2026-09-15' },
];

describe('CashTipMovementsView — Workspace Integration & Acceptance Criteria', () => {
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cashTipMovementsApi, 'fetchCashTipMovements').mockImplementation((params) => {
      let filtered = [...sampleMovements];
      if (params?.search) {
        const s = params.search.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            `#ctm-${m.id}`.toLowerCase().includes(s) ||
            `#cdr-${m.cash_drawer_id}`.toLowerCase().includes(s) ||
            `#tip-${m.tip_id}`.toLowerCase().includes(s)
        );
      }
      if (params?.movement_type && params.movement_type !== 'ALL') {
        filtered = filtered.filter((m) => m.movement_type === params.movement_type);
      }
      if (params?.cash_drawer_id) {
        filtered = filtered.filter((m) => String(m.cash_drawer_id) === String(params.cash_drawer_id));
      }
      if (params?.tip_id) {
        filtered = filtered.filter((m) => String(m.tip_id) === String(params.tip_id));
      }
      return Promise.resolve(filtered);
    });
    vi.spyOn(cashTipMovementsApi, 'fetchOpenCashDrawers').mockResolvedValue(sampleDrawers as any);
    vi.spyOn(cashTipMovementsApi, 'fetchAvailableTips').mockResolvedValue(sampleTips as any);
    vi.spyOn(cashTipMovementsApi, 'createCashTipMovement').mockResolvedValue({
      id: 1003,
      company_id: 'cmp-01',
      merchant_id: 'mch-01',
      cash_drawer_id: 1,
      tip_id: 701,
      movement_type: 'IN',
      amount: 50.0,
      notes: 'Test cash tip entry',
      created_at: new Date().toISOString(),
      created_by: 88,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders workspace title and summary metric cards correctly with real-time net aggregation', async () => {
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    expect(screen.getByText('Cash Tip Movements Directory Workspace')).toBeInTheDocument();
    expect(screen.getByText(/Track physical cash flow entries/i)).toBeInTheDocument();

    expect(await screen.findByTestId('kpi-summary-header')).toBeInTheDocument();

    const inCard = screen.getByTestId('kpi-total-cash-in');
    expect(inCard).toHaveTextContent('Total Cash Tips Collected (IN)');
    expect(inCard).toHaveTextContent('+$25.50');

    const outCard = screen.getByTestId('kpi-total-cash-out');
    expect(outCard).toHaveTextContent('Total Cash Tips Paid Out (OUT)');
    expect(outCard).toHaveTextContent('-$15.00');

    const netCard = screen.getByTestId('kpi-net-drawer-balance');
    expect(netCard).toHaveTextContent('Net Drawer Cash Tip Balance');
    expect(netCard).toHaveTextContent('+$10.50');

    const recordsCard = screen.getByTestId('kpi-total-records');
    expect(recordsCard).toHaveTextContent('Total Movement Records');
    expect(recordsCard).toHaveTextContent('2');
  });

  it('binds grid layout data directly to CashTipMovement attributes conforming to prompt criteria', async () => {
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    const ctmRef = await screen.findAllByText('#CTM-1001');
    expect(ctmRef.length).toBeGreaterThan(0);

    expect(screen.getAllByTestId('drawer-chip-1').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('tip-chip-701').length).toBeGreaterThan(0);

    expect(screen.getAllByText('CASH IN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CASH OUT').length).toBeGreaterThan(0);

    expect(screen.getAllByText('+$25.50').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$15.00').length).toBeGreaterThan(0);
  });

  it('filters grid records via real-time alphanumeric search input (#CTM, #CDR, #TIP)', async () => {
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findAllByText('#CTM-1001');
    expect(screen.getAllByText('#CTM-1002').length).toBeGreaterThan(0);

    const searchInput = screen.getByTestId('movement-search-input');
    fireEvent.change(searchInput, { target: { value: '#CTM-1001' } });

    await waitFor(() => {
      expect(screen.getAllByText('#CTM-1001').length).toBeGreaterThan(0);
      expect(screen.queryByText('#CTM-1002')).not.toBeInTheDocument();
    });
  });

  it('filters dynamically by movement direction selector (movement_type: IN vs OUT)', async () => {
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findAllByText('#CTM-1001');

    const directionSelect = screen.getByTestId('movement-direction-select');
    fireEvent.change(directionSelect, { target: { value: 'OUT' } });

    await waitFor(() => {
      expect(screen.getAllByText('#CTM-1002').length).toBeGreaterThan(0);
      expect(screen.queryByText('#CTM-1001')).not.toBeInTheDocument();
    });
  });

  it('executes API queries supplying cash_drawer_id, created_at, and tip_id parameters for index utilization', async () => {
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findAllByText('#CTM-1001');

    const drawerInput = screen.getByTestId('cash-drawer-filter-input');
    const tipInput = screen.getByTestId('tip-filter-input');
    const dateFromInput = screen.getByTestId('date-from-input');

    fireEvent.change(drawerInput, { target: { value: '1' } });
    fireEvent.change(tipInput, { target: { value: '701' } });
    fireEvent.change(dateFromInput, { target: { value: '2026-09-01' } });

    await waitFor(() => {
      expect(cashTipMovementsApi.fetchCashTipMovements).toHaveBeenCalledWith(
        expect.objectContaining({
          cash_drawer_id: '1',
          tip_id: '701',
          date_from: '2026-09-01',
        })
      );
    });
  });

  it('triggers click-through navigation when clicking Cash Drawer chip and Tip Reference chip', async () => {
    const user = userEvent.setup();
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findAllByText('#CTM-1001');

    const drawerChip = screen.getAllByTestId('drawer-chip-1')[0];
    await user.click(drawerChip);
    expect(mockOnNavigate).toHaveBeenCalledWith('cash-drawers');

    const tipChip = screen.getAllByTestId('tip-chip-701')[0];
    await user.click(tipChip);
    expect(mockOnNavigate).toHaveBeenCalledWith('/tips/ledger');
  });

  it('opens detail audit drawer modal when clicking Audit Details button', async () => {
    const user = userEvent.setup();
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findAllByText('#CTM-1001');

    const auditBtn = screen.getByTestId('audit-btn-1001');
    await user.click(auditBtn);

    expect(await screen.findByTestId('cash-tip-movement-detail-drawer')).toBeInTheDocument();
    expect(screen.getByText('Cash Tip Movement Audit Record')).toBeInTheDocument();
    expect(screen.getByText('@Index([\'cash_drawer_id\', \'created_at\'])')).toBeInTheDocument();
  });

  it('opens register cash movement form drawer on clicking REGISTER CASH MOVEMENT button', async () => {
    const user = userEvent.setup();
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    const registerBtn = screen.getByTestId('register-cash-movement-btn');
    await user.click(registerBtn);

    expect(await screen.findByTestId('cash-tip-movement-form-drawer')).toBeInTheDocument();
    expect(screen.getAllByText('Register Cash Tip Movement').length).toBeGreaterThan(0);
  });

  it('enforces open drawer restriction guard and blocks submission on closed drawer selection', async () => {
    const user = userEvent.setup();
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await user.click(screen.getByTestId('register-cash-movement-btn'));
    await screen.findByTestId('cash-tip-movement-form-drawer');

    const drawerSelect = screen.getByTestId('form-cash-drawer-select');
    fireEvent.change(drawerSelect, { target: { value: '3' } }); // #CDR-3 is CLOSED

    await waitFor(() => {
      expect(screen.getByTestId('form-guard-error')).toBeInTheDocument();
      expect(
        screen.getByText('Cannot record cash tip movements on a closed cash drawer.')
      ).toBeInTheDocument();
    });

    const submitBtn = screen.getByTestId('submit-movement-btn');
    expect(submitBtn).toBeDisabled();
  });

  it('enforces sufficient cash balance guard and blocks submission when OUT amount exceeds available cash', async () => {
    const user = userEvent.setup();
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await user.click(screen.getByTestId('register-cash-movement-btn'));
    await screen.findByTestId('cash-tip-movement-form-drawer');

    const drawerSelect = screen.getByTestId('form-cash-drawer-select');
    const typeSelect = screen.getByTestId('form-movement-type-select');
    const amountInput = screen.getByTestId('form-amount-input');

    fireEvent.change(drawerSelect, { target: { value: '1' } }); // #CDR-1 balance is $150.00
    fireEvent.change(typeSelect, { target: { value: 'OUT' } });
    fireEvent.change(amountInput, { target: { value: '999.00' } });

    await waitFor(() => {
      expect(screen.getByTestId('form-guard-error')).toBeInTheDocument();
      expect(
        screen.getByText('Insufficient cash balance in drawer #CDR-1 for tip payout.')
      ).toBeInTheDocument();
    });

    const submitBtn = screen.getByTestId('submit-movement-btn');
    expect(submitBtn).toBeDisabled();
  });

  it('successfully registers valid cash tip movement and creates read-only audit row', async () => {
    const user = userEvent.setup();
    render(<CashTipMovementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await user.click(screen.getByTestId('register-cash-movement-btn'));
    await screen.findByTestId('cash-tip-movement-form-drawer');

    const drawerSelect = screen.getByTestId('form-cash-drawer-select');
    const tipSelect = screen.getByTestId('form-tip-select');
    const typeSelect = screen.getByTestId('form-movement-type-select');
    const amountInput = screen.getByTestId('form-amount-input');
    const notesInput = screen.getByTestId('form-notes-input');

    fireEvent.change(drawerSelect, { target: { value: '1' } });
    fireEvent.change(tipSelect, { target: { value: '701' } });
    fireEvent.change(typeSelect, { target: { value: 'IN' } });
    fireEvent.change(amountInput, { target: { value: '50.00' } });
    fireEvent.change(notesInput, { target: { value: 'Test cash tip entry' } });

    const submitBtn = screen.getByTestId('submit-movement-btn');
    expect(submitBtn).not.toBeDisabled();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('cash-tip-movement-form-drawer')).not.toBeInTheDocument();
    });
  });
});
