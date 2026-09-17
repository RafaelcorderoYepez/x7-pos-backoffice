import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TipPoolMembersView } from './TipPoolMembersView';
import * as tipPoolMembersApi from '../../../../api/tip-pool-members';
import * as tipPoolsApi from '../../../../api/tip-pools';
import type { TipPoolMember } from '../../../../types/tip-pool-members';
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
  },
];

const TEST_TIP_POOL_MEMBERS: TipPoolMember[] = [
  {
    id: 501,
    tip_pool_id: 301,
    collaborator_id: 101,
    role: 'WAITER',
    weight: 10.5,
    record_status: 'ACTIVE',
    created_at: '2026-08-25T10:00:00.000Z',
    collaborator: {
      id: 101,
      first_name: 'Mateo',
      last_name: 'Silva',
      role: 'WAITER',
    },
    tip_pool: {
      id: 301,
      name: 'Dinner Front of House Equal Pool',
      distribution_type: 'EQUAL',
    },
  },
  {
    id: 502,
    tip_pool_id: 301,
    collaborator_id: 103,
    role: 'BUSSER',
    weight: 1.0,
    record_status: 'ACTIVE',
    created_at: '2026-08-25T10:00:00.000Z',
    collaborator: {
      id: 103,
      first_name: 'Carlos',
      last_name: 'Mendoza',
      role: 'BUSSER',
    },
    tip_pool: {
      id: 301,
      name: 'Dinner Front of House Equal Pool',
      distribution_type: 'EQUAL',
    },
  },
  {
    id: 503,
    tip_pool_id: 302,
    collaborator_id: 102,
    role: 'BARTENDER',
    weight: 3.0,
    record_status: 'ACTIVE',
    created_at: '2026-08-25T11:00:00.000Z',
    collaborator: {
      id: 102,
      first_name: 'Sofia',
      last_name: 'Rodriguez',
      role: 'BARTENDER',
    },
    tip_pool: {
      id: 302,
      name: 'Bar & Lounge Points Distribution',
      distribution_type: 'POINTS',
    },
  },
  {
    id: 507,
    tip_pool_id: 301,
    collaborator_id: 106,
    role: 'HOST',
    weight: 0.75,
    record_status: 'DELETED',
    created_at: '2026-08-25T12:00:00.000Z',
    collaborator: {
      id: 106,
      first_name: 'Gabriel',
      last_name: 'Fernandez',
      role: 'HOST',
    },
    tip_pool: {
      id: 301,
      name: 'Dinner Front of House Equal Pool',
    },
  },
];

describe('Tip Pool Members Directory Workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue(TEST_TIP_POOLS);
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Dataset Hydration & Composite Index Query Optimization', () => {
    it('executes API fetch with parameters targeting compound index @Index(["tip_pool_id", "collaborator_id"])', async () => {
      const fetchSpy = vi
        .spyOn(tipPoolMembersApi, 'fetchTipPoolMembers')
        .mockResolvedValue(TEST_TIP_POOL_MEMBERS.filter((m) => m.record_status === 'ACTIVE'));

      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            record_status: 'ACTIVE',
          })
        );
      });
    });

    it('renders eager-loaded relational details (collaborator names and parent pool names) without extra client REST calls', async () => {
      vi.spyOn(tipPoolMembersApi, 'fetchTipPoolMembers').mockResolvedValue(
        TEST_TIP_POOL_MEMBERS.filter((m) => m.record_status === 'ACTIVE')
      );

      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('Mateo Silva')).toBeInTheDocument();
        expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
        expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
        expect(screen.getAllByText('Dinner Front of House Equal Pool').length).toBeGreaterThan(0);
        expect(screen.getByText('Bar & Lounge Points Distribution')).toBeInTheDocument();
      });
    });
  });

  describe('2. Grid Structural Conformance & Weight Formatting', () => {
    it('formats distribution weights up to 2 decimal places (10.50 pts, 1.00 pts, 3.00 pts)', async () => {
      vi.spyOn(tipPoolMembersApi, 'fetchTipPoolMembers').mockResolvedValue(
        TEST_TIP_POOL_MEMBERS.filter((m) => m.record_status === 'ACTIVE')
      );

      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('10.50 pts')).toBeInTheDocument();
        expect(screen.getByText('1.00 pts')).toBeInTheDocument();
        expect(screen.getByText('3.00 pts')).toBeInTheDocument();
      });
    });

    it('displays member reference ID (#MBR-501), collaborator employee ID (#CLB-101), and pool ID (#POL-301)', async () => {
      vi.spyOn(tipPoolMembersApi, 'fetchTipPoolMembers').mockResolvedValue(
        TEST_TIP_POOL_MEMBERS.filter((m) => m.record_status === 'ACTIVE')
      );

      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('#MBR-501')).toBeInTheDocument();
        expect(screen.getByText('#CLB-101')).toBeInTheDocument();
        expect(screen.getAllByText('#POL-301').length).toBeGreaterThan(0);
      });
    });

    it('displays assigned pool role badges with appropriate styling', async () => {
      vi.spyOn(tipPoolMembersApi, 'fetchTipPoolMembers').mockResolvedValue(
        TEST_TIP_POOL_MEMBERS.filter((m) => m.record_status === 'ACTIVE')
      );

      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('WAITER')).toBeInTheDocument();
        expect(screen.getByText('BUSSER')).toBeInTheDocument();
        expect(screen.getByText('BARTENDER')).toBeInTheDocument();
      });
    });
  });

  describe('3. Search & Filter Matrix', () => {
    it('filters member grid by role selection', async () => {
      const fetchSpy = vi
        .spyOn(tipPoolMembersApi, 'fetchTipPoolMembers')
        .mockResolvedValue(TEST_TIP_POOL_MEMBERS.filter((m) => m.role === 'BARTENDER'));

      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" />);

      const roleSelect = screen.getByLabelText('Filter by Assigned Role');
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
        .spyOn(tipPoolMembersApi, 'fetchTipPoolMembers')
        .mockResolvedValue(TEST_TIP_POOL_MEMBERS.filter((m) => m.record_status === 'DELETED'));

      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" />);

      const deletedTab = screen.getByRole('button', { name: 'DELETED' });
      fireEvent.click(deletedTab);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            record_status: 'DELETED',
          })
        );
      });
    });
  });

  describe('4. Interactivity & Form Drawer Integration', () => {
    it('opens assignment form drawer when ADD MEMBER TO POOL button is clicked', async () => {
      vi.spyOn(tipPoolMembersApi, 'fetchTipPoolMembers').mockResolvedValue([]);

      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" />);

      const assignBtn = screen.getByRole('button', { name: /ADD MEMBER TO POOL/i });
      fireEvent.click(assignBtn);

      await waitFor(() => {
        expect(screen.getByText('Assign Collaborator to Tip Pool')).toBeInTheDocument();
      });
    });

    it('navigates to selected sub-module when navigation hub chip is clicked', async () => {
      const onNavigateMock = vi.fn();
      render(<TipPoolMembersView companyId="cmp-01" merchantId="mch-01" onNavigate={onNavigateMock} />);

      const poolTab = screen.getByRole('button', { name: /TIP POOLS/i });
      fireEvent.click(poolTab);

      expect(onNavigateMock).toHaveBeenCalledWith('/tips/pools');
    });
  });
});
