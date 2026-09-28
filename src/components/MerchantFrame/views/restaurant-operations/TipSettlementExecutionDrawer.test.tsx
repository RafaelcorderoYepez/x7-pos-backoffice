import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TipSettlementExecutionDrawer } from './TipSettlementExecutionDrawer';
import type { TipSettlement } from '../../../../types/tip-settlements';

describe('TipSettlementExecutionDrawer', () => {
  afterEach(() => {
    cleanup();
  });

  const mockSettlement: TipSettlement = {
    id: 504,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    collaborator_id: 104,
    shift_id: 403,
    order_id: null,
    total_amount: 142.25,
    settlement_method: 'CASH',
    status: 'PENDING',
    settled_by: null,
    settled_at: null,
    notes: 'Pending cash settlement',
    created_at: '2026-09-15T10:00:00.000Z',
    collaborator: {
      id: 104,
      first_name: 'Carlos',
      last_name: 'Mendoza',
      email: 'carlos.mendoza@example.com',
      role: 'BUSSER',
    },
    settledByUser: null,
    order: null,
  };

  it('renders read-only target staff member, shift, and total amount when open', () => {
    render(
      <TipSettlementExecutionDrawer
        isOpen={true}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        targetSettlement={mockSettlement}
      />
    );

    expect(screen.getByText('Execute Settlement Payout')).toBeInTheDocument();
    expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(screen.getByText('#CLB-104')).toBeInTheDocument();
    expect(screen.getByText('#SFT-403')).toBeInTheDocument();
    expect(screen.getByText('$142.25')).toBeInTheDocument();
    expect(screen.getAllByText(/READ-ONLY/i).length).toBeGreaterThan(0);
  });

  it('allows selecting payout channel methods (CASH, PAYROLL, BANK_TRANSFER)', () => {
    render(
      <TipSettlementExecutionDrawer
        isOpen={true}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        targetSettlement={mockSettlement}
      />
    );

    const payrollBtn = screen.getByRole('button', { name: /PAYROLL/i });
    fireEvent.click(payrollBtn);
    expect(payrollBtn.className).toContain('bg-[#ae001a]');
  });

  it('submits execution payload with automatic audit stamp (settled_by and settled_at)', async () => {
    const handleExecute = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <TipSettlementExecutionDrawer
        isOpen={true}
        onClose={handleClose}
        onExecute={handleExecute}
        targetSettlement={mockSettlement}
        currentUserId={88}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /EXECUTE SETTLEMENT/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleExecute).toHaveBeenCalledTimes(1);
      expect(handleExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          collaborator_id: 104,
          shift_id: 403,
          total_amount: 142.25,
          settlement_method: 'CASH',
          status: 'SETTLED',
          settled_by: 88,
          settled_at: expect.any(String),
        })
      );
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <TipSettlementExecutionDrawer
        isOpen={false}
        onClose={vi.fn()}
        onExecute={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
