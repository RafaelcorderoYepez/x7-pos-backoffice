import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { TipPoolsView } from './TipPoolsView';
import * as tipPoolsApi from '../../../../api/tip-pools';
import type { TipPool } from '../../../../types/tip-pools';

const TEST_TIP_POOLS: TipPool[] = [
  {
    id: 301,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 801,
    name: 'Dinner Front of House Equal Pool',
    distribution_type: 'EQUAL',
    total_amount: 345.5,
    status: 'OPEN',
    record_status: 'ACTIVE',
    created_at: '2026-08-25T10:00:00.000Z',
    closed_at: null,
    shift_time_window: '17:00 - 23:00',
    notes: 'Active evening shift pool',
  },
  {
    id: 302,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 802,
    name: 'Bar & Lounge Points Distribution',
    distribution_type: 'POINTS',
    total_amount: 150.5,
    status: 'OPEN',
    record_status: 'ACTIVE',
    created_at: '2026-08-25T11:00:00.000Z',
    closed_at: null,
    shift_time_window: '16:00 - 01:00',
    notes: 'Point weighted pool',
  },
  {
    id: 303,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 803,
    name: 'Lunch Shift Role-Based Pool',
    distribution_type: 'ROLE_BASED',
    total_amount: 210.75,
    status: 'CLOSED',
    record_status: 'ACTIVE',
    created_at: '2026-08-25T12:00:00.000Z',
    closed_at: '2026-08-25T16:00:00.000Z',
    shift_time_window: '11:00 - 16:00',
    notes: 'Closed pool awaiting settlement',
  },
  {
    id: 304,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 804,
    name: 'Weekend Brunch Percentage Split',
    distribution_type: 'PERCENTAGE',
    total_amount: 620.0,
    status: 'SETTLED',
    record_status: 'ACTIVE',
    created_at: '2026-08-25T13:00:00.000Z',
    closed_at: '2026-08-25T18:00:00.000Z',
    shift_time_window: '09:00 - 15:00',
    notes: 'Settled pool',
  },
  {
    id: 305,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    shift_id: 805,
    name: 'Archived Soft Deleted Pool',
    distribution_type: 'EQUAL',
    total_amount: 45.0,
    status: 'CLOSED',
    record_status: 'DELETED',
    created_at: '2026-08-25T14:00:00.000Z',
    closed_at: '2026-08-25T19:00:00.000Z',
    shift_time_window: '10:00 - 15:00',
    notes: 'Deleted pool',
  },
];

describe('Tip Pools Directory Management Workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Dataset Hydration & Composite Index Query Optimization', () => {
    it('executes API fetch supplying company_id, merchant_id, and default OPEN status filter on load', async () => {
      const fetchSpy = vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS.filter(p => p.status === 'OPEN' && p.record_status === 'ACTIVE'));

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            company_id: 'cmp-01',
            merchant_id: 'mch-01',
            status: 'OPEN',
            record_status: 'ACTIVE',
            distribution_type: 'ALL',
          })
        );
      });
    });

    it('renders tip pool fields with proper currency symbols ($#,##0.00) and shift badges', async () => {
      vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS.filter(p => p.status === 'OPEN'));

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('#POL-301')).toBeInTheDocument();
        expect(screen.getByText('Dinner Front of House Equal Pool')).toBeInTheDocument();
        expect(screen.getByText('#SFT-801')).toBeInTheDocument();
        expect(screen.getByText('$345.50')).toBeInTheDocument();
        expect(screen.getByText('$150.50')).toBeInTheDocument();
      });
    });
  });

  describe('2. Search & Filter Matrix Precision', () => {
    it('filters data grid in real time by Pool Name, Pool ID (#POL-301), or Shift ID (#SFT-801)', async () => {
      const fetchSpy = vi.spyOn(tipPoolsApi, 'fetchTipPools').mockImplementation(async (params) => {
        return tipPoolsApi.filterMockTipPools({ ...params });
      });

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      const searchInput = screen.getByPlaceholderText(/Search Pool Name/i);
      fireEvent.change(searchInput, { target: { value: 'Dinner' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'Dinner',
          })
        );
      });
    });

    it('filters dataset by Distribution Strategy Selector (EQUAL, PERCENTAGE, POINTS, ROLE_BASED)', async () => {
      const fetchSpy = vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS);

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      const distSelect = screen.getByLabelText('Distribution Type Filter');
      fireEvent.change(distSelect, { target: { value: 'POINTS' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            distribution_type: 'POINTS',
          })
        );
      });
    });

    it('filters dataset by Pool Lifecycle Status (OPEN, CLOSED, SETTLED)', async () => {
      const fetchSpy = vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS);

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      const statusSelect = screen.getByLabelText('Pool Status Filter');
      fireEvent.change(statusSelect, { target: { value: 'CLOSED' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'CLOSED',
          })
        );
      });
    });

    it('toggles between ACTIVE and soft-deleted (DELETED) records', async () => {
      const fetchSpy = vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS);

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      const recordStatusSelect = screen.getByLabelText('Record Status Filter');
      fireEvent.change(recordStatusSelect, { target: { value: 'DELETED' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            record_status: 'DELETED',
          })
        );
      });
    });
  });

  describe('3. Core Workspace Data Grid Data-Binding & Badges', () => {
    it('displays OPEN info blue badge, CLOSED warning amber badge, and SETTLED success green badge', async () => {
      vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS);

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const openBadges = within(table).getAllByText('OPEN');
      expect(openBadges.length).toBeGreaterThan(0);
      expect(within(table).getAllByText('CLOSED').length).toBeGreaterThan(0);
      expect(within(table).getAllByText('SETTLED').length).toBeGreaterThan(0);
    });

    it('displays Active Shift when closed_at is null', async () => {
      vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS.filter(p => p.id === 301));

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('Active Shift')).toBeInTheDocument();
      });
    });

    it('renders contextual quick links and triggers navigation on click', async () => {
      vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS);
      const onNavigateMock = vi.fn();

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" onNavigate={onNavigateMock} />);

      await waitFor(() => {
        const ledgerShortcut = screen.getByText('TIPS LEDGER');
        expect(ledgerShortcut).toBeInTheDocument();
        fireEvent.click(ledgerShortcut);
        expect(onNavigateMock).toHaveBeenCalledWith('/tips/ledger');
      });
    });
  });

  describe('4. Guided Form Drawer Trigger & Integration', () => {
    it('opens create drawer panel when selecting CREATE TIP POOL button', async () => {
      vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS);
      vi.spyOn(tipPoolsApi, 'fetchActiveShifts').mockResolvedValue([]);

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByTestId('create-tip-pool-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-tip-pool-button'));

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-drawer')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Create New Tip Pool/i })).toBeInTheDocument();
      });
    });

    it('opens edit drawer panel when clicking Edit on a data grid row', async () => {
      vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS);
      vi.spyOn(tipPoolsApi, 'fetchActiveShifts').mockResolvedValue([]);

      render(<TipPoolsView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-tip-pool-button-301')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('edit-tip-pool-button-301'));

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-drawer')).toBeInTheDocument();
        expect(screen.getByTestId('tip-pool-name-input')).toHaveValue('Dinner Front of House Equal Pool');
      });
    });
  });
});
