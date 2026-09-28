import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TipSettlementsView } from './TipSettlementsView';
import * as tipSettlementsApi from '../../../../api/tip-settlements';
import type { TipSettlement } from '../../../../types/tip-settlements';

const TEST_SETTLEMENTS: TipSettlement[] = [
  {
    id: 501,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 101,
    shift_id: 401,
    order_id: 5012,
    total_amount: 150.75,
    settlement_method: 'CASH',
    status: 'SETTLED',
    settled_at: '2026-09-14T18:30:00.000Z',
    settled_by: 88,
    collaborator: { id: 101, first_name: 'Sofia', last_name: 'Rodriguez' },
    settledByUser: { id: 88, name: 'Elena Rostova' },
  },
  {
    id: 502,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 102,
    shift_id: 401,
    total_amount: 215.5,
    settlement_method: 'PAYROLL',
    status: 'SETTLED',
    settled_at: '2026-09-14T19:00:00.000Z',
    settled_by: 88,
    collaborator: { id: 102, first_name: 'Carlos', last_name: 'Mendoza' },
    settledByUser: { id: 88, name: 'Elena Rostova' },
  },
  {
    id: 503,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 101,
    shift_id: 402,
    total_amount: 88.0,
    settlement_method: 'BANK_TRANSFER',
    status: 'SETTLED',
    settled_at: '2026-09-15T10:00:00.000Z',
    settled_by: 88,
    collaborator: { id: 101, first_name: 'Sofia', last_name: 'Rodriguez' },
    settledByUser: { id: 88, name: 'Elena Rostova' },
  },
  {
    id: 504,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 103,
    total_amount: 90.0,
    settlement_method: 'CASH',
    status: 'PENDING',
    collaborator: { id: 103, first_name: 'Mateo', last_name: 'Hernandez' },
  },
];

describe('TipSettlementsView', () => {
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tipSettlementsApi, 'fetchTipSettlements').mockImplementation((params) => {
      let filtered = [...TEST_SETTLEMENTS];
      if (params?.search) {
        const s = params.search.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            `#stl-${item.id}`.toLowerCase().includes(s) ||
            `#clb-${item.collaborator_id}`.toLowerCase().includes(s) ||
            (item.shift_id && `#sft-${item.shift_id}`.toLowerCase().includes(s)) ||
            (item.order_id && `#ord-${item.order_id}`.toLowerCase().includes(s)) ||
            (item.collaborator && `${item.collaborator.first_name} ${item.collaborator.last_name}`.toLowerCase().includes(s))
        );
      }
      if (params?.settlement_method && params.settlement_method !== 'ALL') {
        filtered = filtered.filter((item) => item.settlement_method === params.settlement_method);
      }
      if (params?.status && params.status !== 'ALL') {
        filtered = filtered.filter((item) => item.status === params.status);
      }
      return Promise.resolve(filtered);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders workspace title and summary metric cards correctly', async () => {
    render(<TipSettlementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    expect(screen.getByText('Tip Settlements Workspace')).toBeInTheDocument();
    expect(screen.getByText(/Audit finalized tip payout records/i)).toBeInTheDocument();

    expect(await screen.findByText('Total Settled Amount')).toBeInTheDocument();
    expect(screen.getByText('Settled Payouts')).toBeInTheDocument();
    expect(screen.getAllByText('Pending Execution').length).toBeGreaterThan(0);
    expect(screen.getByText('Channels Breakdown')).toBeInTheDocument();
  });

  it('binds grid layout data directly to TipSettlement attributes conforming to prompt criteria', async () => {
    render(<TipSettlementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    const stlRef = await screen.findAllByText('#STL-501');
    expect(stlRef.length).toBeGreaterThan(0);

    expect(screen.getAllByText('Sofia Rodriguez').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#CLB-101').length).toBeGreaterThan(0);

    expect(screen.getAllByText('#SFT-401').length).toBeGreaterThan(0);

    expect(screen.getAllByText('$150.75').length).toBeGreaterThan(0);

    expect(screen.getAllByText('CASH').length).toBeGreaterThan(0);

    expect(screen.getAllByText('Elena Rostova').length).toBeGreaterThan(0);

    const formattedTimestamp = tipSettlementsApi.formatSettlementDateTime(TEST_SETTLEMENTS[0].settled_at);
    expect(screen.getAllByText(formattedTimestamp).length).toBeGreaterThan(0);

    expect(screen.getAllByText('#ORD-5012').length).toBeGreaterThan(0);

    expect(screen.getAllByText('Settled Payout').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending Execution').length).toBeGreaterThan(0);
  });

  it('filters grid records via real-time alphanumeric search input', async () => {
    render(<TipSettlementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findAllByText('#STL-501');
    expect(screen.getAllByText('#STL-502').length).toBeGreaterThan(0);

    const searchInput = screen.getAllByPlaceholderText(/Search Settlement ID/i)[0];
    fireEvent.change(searchInput, { target: { value: '#STL-501' } });

    await waitFor(() => {
      expect(screen.getAllByText('#STL-501').length).toBeGreaterThan(0);
      expect(screen.queryAllByText('#STL-502')).toHaveLength(0);
    });
  });

  it('filters by settlement_method selector (CASH, PAYROLL, BANK_TRANSFER)', async () => {
    render(<TipSettlementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findByText('#STL-501');

    const methodSelect = screen.getByTestId('settlement-method-select');
    fireEvent.change(methodSelect, { target: { value: 'BANK_TRANSFER' } });

    expect(await screen.findByText('#STL-503')).toBeInTheDocument();
    expect(screen.queryByText('#STL-501')).not.toBeInTheDocument();
  });

  it('filters by lifecycle status selector (PENDING, SETTLED, CANCELLED)', async () => {
    render(<TipSettlementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findByText('#STL-501');

    const statusSelect = screen.getByTestId('settlement-status-select');
    fireEvent.change(statusSelect, { target: { value: 'PENDING' } });

    expect(await screen.findByText('#STL-504')).toBeInTheDocument();
    expect(screen.queryByText('#STL-501')).not.toBeInTheDocument();
  });

  it('opens audit detail drawer on clicking Audit Details', async () => {
    const user = userEvent.setup();
    render(<TipSettlementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    await screen.findAllByText('#STL-501');

    const auditButtons = screen.getAllByRole('button', { name: /audit details/i });
    await user.click(auditButtons[0]);

    expect(await screen.findByText('Tip Settlement Audit Record')).toBeInTheDocument();
  });

  it('opens new tip settlement form drawer on clicking New Tip Settlement', async () => {
    const user = userEvent.setup();
    render(<TipSettlementsView companyId="cmp-01" merchantId="mch-01" onNavigate={mockOnNavigate} />);

    const newBtn = screen.getAllByRole('button', { name: /new tip settlement/i })[0];
    await user.click(newBtn);

    expect(await screen.findByText('Create Tip Settlement')).toBeInTheDocument();
  });
});
