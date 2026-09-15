import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TipPoolFormDrawer } from './TipPoolFormDrawer';
import * as tipPoolsApi from '../../../../api/tip-pools';
import type { TipPool } from '../../../../types/tip-pools';

const MOCK_EXISTING_POOL: TipPool = {
  id: 301,
  company_id: 'cmp-01',
  merchant_id: 'mch-01',
  shift_id: 801,
  name: 'Dinner Front of House Pool',
  distribution_type: 'EQUAL',
  total_amount: 345.5,
  status: 'OPEN',
  record_status: 'ACTIVE',
  created_at: '2026-08-25T10:00:00.000Z',
  closed_at: null,
  shift_time_window: '17:00 - 23:00',
  notes: 'Active evening shift pool',
};

const MOCK_SHIFTS = [
  { id: 801, name: 'Dinner Front of House (#SFT-801)', time_window: '17:00 - 23:00', status: 'ACTIVE' as const },
  { id: 802, name: 'Bar & Lounge Shift (#SFT-802)', time_window: '16:00 - 01:00', status: 'ACTIVE' as const },
];

describe('TipPoolFormDrawer Guided Panel & State Guards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tipPoolsApi, 'fetchActiveShifts').mockResolvedValue(MOCK_SHIFTS);
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Acceptance Criteria 1: Shift Relation Binding', () => {
    it('enforces selection of a valid shift_id during pool creation', async () => {
      const createSpy = vi.spyOn(tipPoolsApi, 'createTipPool');

      render(
        <TipPoolFormDrawer
          isOpen={true}
          pool={null}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-drawer')).toBeInTheDocument();
      });

      // Fill name but omit shift_id selection
      const nameInput = screen.getByTestId('tip-pool-name-input');
      fireEvent.change(nameInput, { target: { value: 'Morning Shift Pool' } });

      const saveBtn = screen.getByTestId('tip-pool-save-button');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Shift Relation Binding Error: Selection of a valid active shift_id is required/i)
        ).toBeInTheDocument();
      });

      expect(createSpy).not.toHaveBeenCalled();
    });

    it('successfully creates pool when a valid shift_id is selected', async () => {
      const createSpy = vi.spyOn(tipPoolsApi, 'createTipPool').mockResolvedValue({
        ...MOCK_EXISTING_POOL,
        id: 999,
        name: 'Morning Shift Pool',
        shift_id: 802,
      });

      const onSavedMock = vi.fn();

      render(
        <TipPoolFormDrawer
          isOpen={true}
          pool={null}
          onClose={vi.fn()}
          onSaved={onSavedMock}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-name-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('tip-pool-name-input'), {
        target: { value: 'Morning Shift Pool' },
      });

      fireEvent.change(screen.getByTestId('tip-pool-shift-select'), {
        target: { value: '802' },
      });

      fireEvent.change(screen.getByTestId('tip-pool-distribution-select'), {
        target: { value: 'POINTS' },
      });

      fireEvent.click(screen.getByTestId('tip-pool-save-button'));

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Morning Shift Pool',
            shift_id: 802,
            distribution_type: 'POINTS',
            status: 'OPEN',
            record_status: 'ACTIVE',
          })
        );
        expect(onSavedMock).toHaveBeenCalled();
      });
    });
  });

  describe('2. Acceptance Criteria 2: Automatic Closure Timestamping', () => {
    it('automatically populates closed_at when transitioning pool status to CLOSED', async () => {
      const updateSpy = vi.spyOn(tipPoolsApi, 'updateTipPool').mockResolvedValue({
        ...MOCK_EXISTING_POOL,
        status: 'CLOSED',
        closed_at: '2026-09-03T14:00:00.000Z',
      });

      const onSavedMock = vi.fn();

      render(
        <TipPoolFormDrawer
          isOpen={true}
          pool={MOCK_EXISTING_POOL}
          onClose={vi.fn()}
          onSaved={onSavedMock}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-name-input')).toHaveValue('Dinner Front of House Pool');
      });

      // Transition status to CLOSED
      const statusSelect = screen.getByTestId('tip-pool-status-select');
      fireEvent.change(statusSelect, { target: { value: 'CLOSED' } });

      fireEvent.click(screen.getByTestId('tip-pool-save-button'));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          301,
          expect.objectContaining({
            status: 'CLOSED',
          })
        );
        expect(onSavedMock).toHaveBeenCalled();
      });
    });
  });

  describe('3. Acceptance Criteria 3: Logical Soft Delete', () => {
    it('soft-deletes pool by setting record_status = DELETED without physical row removal', async () => {
      const updateSpy = vi.spyOn(tipPoolsApi, 'updateTipPool').mockResolvedValue({
        ...MOCK_EXISTING_POOL,
        record_status: 'DELETED',
      });

      const onSavedMock = vi.fn();

      render(
        <TipPoolFormDrawer
          isOpen={true}
          pool={MOCK_EXISTING_POOL}
          onClose={vi.fn()}
          onSaved={onSavedMock}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-soft-delete-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('tip-pool-soft-delete-button'));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          301,
          expect.objectContaining({
            record_status: 'DELETED',
          })
        );
        expect(screen.getByTestId('tip-pool-drawer-success')).toHaveTextContent(
          'logically soft-deleted (record_status = DELETED)'
        );
        expect(onSavedMock).toHaveBeenCalled();
      });
    });
  });

  describe('4. Business Rule Guard: Settlement Restriction Guard', () => {
    it('prevents manual transition of status to SETTLED and displays guard error message', async () => {
      const updateSpy = vi.spyOn(tipPoolsApi, 'updateTipPool');

      render(
        <TipPoolFormDrawer
          isOpen={true}
          pool={MOCK_EXISTING_POOL}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-status-select')).toBeInTheDocument();
      });

      const statusSelect = screen.getByTestId('tip-pool-status-select');
      fireEvent.change(statusSelect, { target: { value: 'SETTLED' } });

      fireEvent.click(screen.getByTestId('tip-pool-save-button'));

      await waitFor(() => {
        expect(
          screen.getByText(
            /Settlement Guard Error: Changing status to SETTLED is restricted to automated settlement execution workflows/i
          )
        ).toBeInTheDocument();
      });

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('5. Input Specifications & Validation Guards', () => {
    it('restricts pool name to 150 characters', async () => {
      render(
        <TipPoolFormDrawer
          isOpen={true}
          pool={null}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-name-input')).toBeInTheDocument();
      });

      const longName = 'A'.repeat(151);
      fireEvent.change(screen.getByTestId('tip-pool-name-input'), {
        target: { value: longName },
      });

      fireEvent.change(screen.getByTestId('tip-pool-shift-select'), {
        target: { value: '801' },
      });

      fireEvent.click(screen.getByTestId('tip-pool-save-button'));

      await waitFor(() => {
        expect(screen.getByText(/Tip pool name cannot exceed 150 characters/i)).toBeInTheDocument();
      });
    });

    it('triggers onClose when close icon button or backdrop is clicked', async () => {
      const onCloseMock = vi.fn();

      render(
        <TipPoolFormDrawer
          isOpen={true}
          pool={null}
          onClose={onCloseMock}
          onSaved={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('tip-pool-drawer-close-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('tip-pool-drawer-close-button'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('tip-pool-drawer-backdrop'));
      expect(onCloseMock).toHaveBeenCalledTimes(2);
    });
  });
});
