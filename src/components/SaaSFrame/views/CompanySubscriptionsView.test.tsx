import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanySubscriptionsView, toUpdateDto } from './CompanySubscriptionsView';
import { saasService } from '../../../services/saasService';
import type { CompanySubscription, SubscriptionPlan } from '../../../types/subscription';

vi.mock('../../../services/saasService', () => ({
  saasService: {
    listCompanySubscriptions: vi.fn(),
    getSubscriptionPlans: vi.fn(),
    updateCompanySubscription: vi.fn(),
  },
}));

const ACME: CompanySubscription = {
  id: 1,
  company: { id: 3, name: 'Acme Corp' },
  plan: { id: 2, name: 'Professional' },
  startDate: '2026-09-15',
  endDate: '2026-10-15',
  renewalDate: '2026-10-15',
  status: 'active',
  paymentMethod: 'onboarding',
  isExpired: true,
};

const GLOBEX: CompanySubscription = {
  id: 3,
  company: { id: 5, name: 'Globex' },
  plan: { id: 1, name: 'Essential' },
  startDate: '2026-10-23',
  endDate: '2026-11-23',
  renewalDate: null,
  status: 'active',
  paymentMethod: 'credit_card',
  isExpired: false,
};

const PLANS = [
  { id: 1, name: 'Essential' },
  { id: 2, name: 'Professional' },
  { id: 3, name: 'Executive' },
] as SubscriptionPlan[];

describe('CompanySubscriptionsView', () => {
  beforeEach(() => {
    vi.mocked(saasService.listCompanySubscriptions).mockResolvedValue([ACME, GLOBEX]);
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(PLANS);
    vi.mocked(saasService.updateCompanySubscription).mockResolvedValue(ACME);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists each company with its plan and flags the expired one', async () => {
    render(<CompanySubscriptionsView />);
    const table = within(await screen.findByRole('table'));

    expect(table.getByText('Acme Corp')).toBeInTheDocument();
    expect(table.getByText('Globex')).toBeInTheDocument();
    expect(table.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('2 subscriptions · 1 expired')).toBeInTheDocument();
  });

  it('filters to the expired subscriptions', async () => {
    render(<CompanySubscriptionsView />);
    await screen.findByRole('table');

    await userEvent.selectOptions(screen.getByLabelText('Status filter'), 'expired');

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('Globex')).not.toBeInTheDocument();
  });

  it('renews an expired subscription by sending only the changed fields', async () => {
    render(<CompanySubscriptionsView />);
    await screen.findByRole('table');

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit subscription of Acme Corp' }),
    );
    const endDate = screen.getByLabelText('End Date');
    await userEvent.clear(endDate);
    await userEvent.type(endDate, '2027-10-15');
    await userEvent.selectOptions(screen.getByLabelText('Plan'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(saasService.updateCompanySubscription).toHaveBeenCalledWith(1, {
        planId: 3,
        endDate: '2027-10-15',
      });
    });
    expect(saasService.listCompanySubscriptions).toHaveBeenCalledTimes(2);
  });

  it('does not save an end date before the start date', async () => {
    render(<CompanySubscriptionsView />);
    await screen.findByRole('table');

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit subscription of Globex' }),
    );
    const endDate = screen.getByLabelText('End Date');
    await userEvent.clear(endDate);
    await userEvent.type(endDate, '2026-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(
      await screen.findByText('End date cannot be before the start date'),
    ).toBeInTheDocument();
    expect(saasService.updateCompanySubscription).not.toHaveBeenCalled();
  });
});

describe('toUpdateDto', () => {
  it('turns cleared optional dates into null', () => {
    expect(
      toUpdateDto(GLOBEX, {
        planId: '1',
        status: 'active',
        startDate: '2026-10-23',
        endDate: '',
        renewalDate: '',
        paymentMethod: 'credit_card',
      }),
    ).toEqual({ endDate: null });
  });
});
