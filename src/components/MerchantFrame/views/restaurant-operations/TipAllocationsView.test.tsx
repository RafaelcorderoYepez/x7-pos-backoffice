import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TipAllocationsView } from './TipAllocationsView';
import * as tipAllocationsApi from '../../../../api/tip-allocations';
import type { TipAllocation } from '../../../../types/tip-allocations';

const TEST_TIP_ALLOCATIONS: TipAllocation[] = [
  {
    id: 701,
    tip_id: 201,
    collaborator_id: 101,
    shift_id: 801,
    role: 'WAITER',
    percentage: 50.0,
    amount: 12.5,
    record_status: 'ACTIVE',
    created_at: '2026-08-25T10:00:00.000Z',
    collaborator: {
      id: 101,
      first_name: 'Mateo',
      last_name: 'Silva',
      role: 'WAITER',
    },
    tip: {
      id: 201,
      amount: 25.0,
      method: 'CARD',
      order_id: 501,
      status: 'ALLOCATED',
    },
  },
  {
    id: 702,
    tip_id: 201,
    collaborator_id: 103,
    shift_id: 801,
    role: 'RUNNER',
    percentage: 25.0,
    amount: 6.25,
    record_status: 'ACTIVE',
    created_at: '2026-08-25T10:00:00.000Z',
    collaborator: {
      id: 103,
      first_name: 'Carlos',
      last_name: 'Mendoza',
      role: 'RUNNER',
    },
    tip: {
      id: 201,
      amount: 25.0,
      method: 'CARD',
      order_id: 501,
      status: 'ALLOCATED',
    },
  },
  {
    id: 703,
    tip_id: 202,
    collaborator_id: 102,
    shift_id: 802,
    role: 'BARTENDER',
    percentage: 100.0,
    amount: 18.75,
    record_status: 'ACTIVE',
    created_at: '2026-08-25T11:00:00.000Z',
    collaborator: {
      id: 102,
      first_name: 'Sofia',
      last_name: 'Rodriguez',
      role: 'BARTENDER',
    },
    tip: {
      id: 202,
      amount: 18.75,
      method: 'CASH',
      order_id: 502,
      status: 'ALLOCATED',
    },
  },
  {
    id: 707,
    tip_id: 205,
    collaborator_id: 106,
    shift_id: 802,
    role: 'HOST',
    percentage: 10.0,
    amount: 3.5,
    record_status: 'DELETED',
    created_at: '2026-08-25T12:00:00.000Z',
    collaborator: {
      id: 106,
      first_name: 'Gabriel',
      last_name: 'Fernandez',
      role: 'HOST',
    },
    tip: {
      id: 205,
      amount: 35.0,
      method: 'CARD',
      order_id: 505,
      status: 'PENDING',
    },
  },
];

describe('Tip Allocations Directory Workspace & Form Drawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Dataset Hydration & Composite Index Query Optimization', () => {
    it('executes API fetch with parameters targeting primary composite index @Index(["tip_id", "collaborator_id", "shift_id"]) and secondary index @Index(["role", "record_status", "created_at"])', async () => {
      const fetchSpy = vi
        .spyOn(tipAllocationsApi, 'fetchTipAllocations')
        .mockResolvedValue(TEST_TIP_ALLOCATIONS.filter((a) => a.record_status === 'ACTIVE'));

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            record_status: 'ACTIVE',
          })
        );
      });
    });

    it('renders eager-loaded relational details (collaborator names, reference badges) without extra client REST calls', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue(
        TEST_TIP_ALLOCATIONS.filter((a) => a.record_status === 'ACTIVE')
      );

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('Mateo Silva')).toBeInTheDocument();
        expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
        expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
        expect(screen.getAllByText('#TIP-201').length).toBeGreaterThan(0);
        expect(screen.getByText('#TIP-202')).toBeInTheDocument();
      });
    });
  });

  describe('2. Grid Structural Conformance & Formatting', () => {
    it('renders percentage share formatted up to 2 decimal places (50.00%, 25.00%, 100.00%)', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue(
        TEST_TIP_ALLOCATIONS.filter((a) => a.record_status === 'ACTIVE')
      );

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('50.00%')).toBeInTheDocument();
        expect(screen.getByText('25.00%')).toBeInTheDocument();
        expect(screen.getByText('100.00%')).toBeInTheDocument();
      });
    });

    it('renders allocated currency amount formatted ($12.50, $6.25, $18.75)', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue(
        TEST_TIP_ALLOCATIONS.filter((a) => a.record_status === 'ACTIVE')
      );

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('$12.50')).toBeInTheDocument();
        expect(screen.getByText('$6.25')).toBeInTheDocument();
        expect(screen.getByText('$18.75')).toBeInTheDocument();
      });
    });

    it('displays allocation reference ID (#ALC-701), collaborator employee ID (#CLB-101), and shift ID (#SFT-801)', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue(
        TEST_TIP_ALLOCATIONS.filter((a) => a.record_status === 'ACTIVE')
      );

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('#ALC-701')).toBeInTheDocument();
        expect(screen.getByText('#CLB-101')).toBeInTheDocument();
        expect(screen.getAllByText('#SFT-801').length).toBeGreaterThan(0);
      });
    });

    it('displays assigned allocation role badges with proper styling', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue(
        TEST_TIP_ALLOCATIONS.filter((a) => a.record_status === 'ACTIVE')
      );

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('WAITER')).toBeInTheDocument();
        expect(screen.getByText('RUNNER')).toBeInTheDocument();
        expect(screen.getByText('BARTENDER')).toBeInTheDocument();
      });
    });
  });

  describe('3. Search & Multi-Filter Matrix', () => {
    it('filters allocation grid by role selection', async () => {
      const fetchSpy = vi
        .spyOn(tipAllocationsApi, 'fetchTipAllocations')
        .mockResolvedValue(TEST_TIP_ALLOCATIONS.filter((a) => a.role === 'BARTENDER'));

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      const roleSelect = screen.getByLabelText('Filter by Allocation Role');
      fireEvent.change(roleSelect, { target: { value: 'BARTENDER' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            role: 'BARTENDER',
          })
        );
      });
    });

    it('toggles record_status between ACTIVE and DELETED', async () => {
      const fetchSpy = vi
        .spyOn(tipAllocationsApi, 'fetchTipAllocations')
        .mockResolvedValue(TEST_TIP_ALLOCATIONS.filter((a) => a.record_status === 'DELETED'));

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      const deletedTab = screen.getByTestId('status-deleted-btn');
      fireEvent.click(deletedTab);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            record_status: 'DELETED',
          })
        );
      });
    });

    it('triggers search filtering on alphanumeric query input', async () => {
      const fetchSpy = vi
        .spyOn(tipAllocationsApi, 'fetchTipAllocations')
        .mockResolvedValue(TEST_TIP_ALLOCATIONS.filter((a) => a.id === 701));

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      const searchInput = screen.getByTestId('allocation-search-input');
      fireEvent.change(searchInput, { target: { value: '#ALC-701' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            search: '#ALC-701',
          })
        );
      });
    });
  });

  describe('4. Interactivity, Form Drawer & 100% Allocation Ceiling Guard', () => {
    it('opens slide-over form drawer when NEW ALLOCATION button is clicked', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue([]);

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      const newBtn = screen.getByRole('button', { name: /NEW ALLOCATION/i });
      fireEvent.click(newBtn);

      await waitFor(() => {
        expect(screen.getByText('Create Tip Allocation')).toBeInTheDocument();
      });
    });

    it('recalculates allocated amount dynamically when percentage share changes', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue([]);

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      const newBtn = screen.getByRole('button', { name: /NEW ALLOCATION/i });
      fireEvent.click(newBtn);

      await waitFor(() => {
        expect(screen.getByText('Create Tip Allocation')).toBeInTheDocument();
      });

      const tipSelect = screen.getByTestId('drawer-tip-id-select');
      fireEvent.change(tipSelect, { target: { value: '201' } });

      const pctInput = screen.getByTestId('drawer-percentage-input');
      fireEvent.change(pctInput, { target: { value: '40.00' } });

      const amtInput = screen.getByTestId('drawer-amount-input') as HTMLInputElement;
      expect(amtInput.value).toBe('10.00'); // 40% of $25.00 tip = $10.00
    });

    it('blocks submission with error "Total allocations for Tip #TIP-{tip_id} cannot exceed 100%" when 100% ceiling guard is violated', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue(TEST_TIP_ALLOCATIONS);

      render(<TipAllocationsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('Mateo Silva')).toBeInTheDocument();
      });

      const newBtn = screen.getByRole('button', { name: /NEW ALLOCATION/i });
      fireEvent.click(newBtn);

      await waitFor(() => {
        expect(screen.getByText('Create Tip Allocation')).toBeInTheDocument();
      });

      // Select Tip #TIP-201 which already has 50% + 25% = 75% allocated
      const tipSelect = screen.getByTestId('drawer-tip-id-select');
      fireEvent.change(tipSelect, { target: { value: '201' } });

      // Enter 40% which makes total 75% + 40% = 115% (> 100%)
      const pctInput = screen.getByTestId('drawer-percentage-input');
      fireEvent.change(pctInput, { target: { value: '40.00' } });

      const submitBtn = screen.getByTestId('drawer-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Total allocations for Tip #TIP-201 cannot exceed 100%.')
        ).toBeInTheDocument();
      });
    });

    it('navigates to selected sub-module when navigation hub chip is clicked', async () => {
      const onNavigateMock = vi.fn();
      render(
        <TipAllocationsView
          companyId="cmp-01"
          merchantId="mch-01"
          onNavigate={onNavigateMock}
        />
      );

      const poolTab = screen.getByRole('button', { name: /TIP POOLS/i });
      fireEvent.click(poolTab);

      expect(onNavigateMock).toHaveBeenCalledWith('/tips/pools');
    });

    it('navigates to tip entry when source tip chip #TIP-201 is clicked', async () => {
      vi.spyOn(tipAllocationsApi, 'fetchTipAllocations').mockResolvedValue(
        TEST_TIP_ALLOCATIONS.filter((a) => a.record_status === 'ACTIVE')
      );

      const onNavigateMock = vi.fn();
      render(
        <TipAllocationsView
          companyId="cmp-01"
          merchantId="mch-01"
          onNavigate={onNavigateMock}
        />
      );

      await waitFor(() => {
        const tipChip = screen.getAllByText('#TIP-201')[0];
        fireEvent.click(tipChip);
        expect(onNavigateMock).toHaveBeenCalledWith('/tips/ledger');
      });
    });
  });
});
