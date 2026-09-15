import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TipPoolMemberFormDrawer } from './TipPoolMemberFormDrawer';
import * as tipPoolMembersApi from '../../../../api/tip-pool-members';
import * as tipPoolsApi from '../../../../api/tip-pools';
import type { TipPoolMember } from '../../../../types/tip-pool-members';

const TEST_MEMBER: TipPoolMember = {
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
  },
};

describe('TipPoolMemberFormDrawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tipPoolsApi, 'fetchTipPools').mockResolvedValue([
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
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders form drawer fields correctly when isOpen is true', async () => {
    render(
      <TipPoolMemberFormDrawer
        isOpen={true}
        member={null}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Assign Collaborator to Tip Pool')).toBeInTheDocument();
      expect(document.getElementById('tip_pool_id')).toBeInTheDocument();
      expect(document.getElementById('collaborator_id')).toBeInTheDocument();
      expect(document.getElementById('weight')).toBeInTheDocument();
    });
  });

  it('populates existing member details when editing', async () => {
    render(
      <TipPoolMemberFormDrawer
        isOpen={true}
        member={TEST_MEMBER}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Edit Member Assignment \(#MBR-501\)/i)).toBeInTheDocument();
      expect((document.getElementById('weight') as HTMLInputElement).value).toBe('10.5');
    });
  });

  it('validates negative weight factor on submission', async () => {
    render(
      <TipPoolMemberFormDrawer
        isOpen={true}
        member={null}
        defaultTipPoolId={301}
        onClose={vi.fn()}
      />
    );

    await screen.findByRole('option', { name: /Dinner Front of House/i });

    const collabSelect = document.getElementById('collaborator_id') as HTMLSelectElement;
    fireEvent.change(collabSelect, { target: { value: '102' } });

    const weightInput = document.getElementById('weight') as HTMLInputElement;
    fireEvent.change(weightInput, { target: { value: '' } });

    const submitBtn = screen.getByRole('button', { name: /Assign Member/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/non-negative number/i)).toBeInTheDocument();
  });

  it('blocks duplicate member-pool assignment with exact error message', async () => {
    vi.spyOn(tipPoolMembersApi, 'fetchTipPoolMembers').mockResolvedValue([TEST_MEMBER]);

    render(
      <TipPoolMemberFormDrawer
        isOpen={true}
        member={null}
        onClose={vi.fn()}
        existingMembers={[TEST_MEMBER]}
      />
    );

    await waitFor(() => {
      expect(document.getElementById('tip_pool_id')).toBeInTheDocument();
    });

    const poolSelect = document.getElementById('tip_pool_id') as HTMLSelectElement;
    fireEvent.change(poolSelect, { target: { value: '301' } });

    const collabSelect = document.getElementById('collaborator_id') as HTMLSelectElement;
    fireEvent.change(collabSelect, { target: { value: '101' } });

    const submitBtn = screen.getByRole('button', { name: /Assign Member/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText('Collaborator #CLB-101 is already assigned to Tip Pool #POL-301.')
    ).toBeInTheDocument();
  });

  it('validates weight factor exceeding precision 5, scale 2 (max 999.99)', async () => {
    render(
      <TipPoolMemberFormDrawer
        isOpen={true}
        member={null}
        defaultTipPoolId={301}
        onClose={vi.fn()}
      />
    );

    await screen.findByRole('option', { name: /Dinner Front of House/i });

    const collabSelect = document.getElementById('collaborator_id') as HTMLSelectElement;
    fireEvent.change(collabSelect, { target: { value: '102' } });

    const weightInput = document.getElementById('weight') as HTMLInputElement;
    fireEvent.change(weightInput, { target: { value: '1050.00' } });

    await waitFor(() => {
      expect((document.getElementById('weight') as HTMLInputElement).value).toBe('1050.00');
    });

    const submitBtn = screen.getByRole('button', { name: /Assign Member/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/exceeds maximum precision/i)).toBeInTheDocument();
  });

  it('calls createTipPoolMember on valid submission', async () => {
    vi.spyOn(tipPoolMembersApi, 'fetchTipPoolMembers').mockResolvedValue([]);
    const createSpy = vi
      .spyOn(tipPoolMembersApi, 'createTipPoolMember')
      .mockResolvedValue(TEST_MEMBER);

    const onSavedMock = vi.fn();

    render(
      <TipPoolMemberFormDrawer
        isOpen={true}
        member={null}
        onClose={vi.fn()}
        onSaved={onSavedMock}
      />
    );

    await waitFor(() => {
      expect(document.getElementById('tip_pool_id')).toBeInTheDocument();
    });

    const poolSelect = document.getElementById('tip_pool_id') as HTMLSelectElement;
    fireEvent.change(poolSelect, { target: { value: '301' } });

    const collabSelect = document.getElementById('collaborator_id') as HTMLSelectElement;
    fireEvent.change(collabSelect, { target: { value: '101' } });

    const weightInput = document.getElementById('weight') as HTMLInputElement;
    fireEvent.change(weightInput, { target: { value: '2.50' } });

    const submitBtn = screen.getByRole('button', { name: /Assign Member/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tip_pool_id: 301,
          collaborator_id: '101',
          weight: 2.5,
        })
      );
    });
  });
});
