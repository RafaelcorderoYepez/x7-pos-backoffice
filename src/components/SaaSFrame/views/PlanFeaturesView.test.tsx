//src/components/SaaSDashboard/PlanFeaturesView.test.tsx
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanFeaturesView } from './PlanFeaturesView';
import { saasService } from '../../../services/saasService';
import type { PlanFeature, SubscriptionPlan, PlatformFeature } from '../../../types/subscription';

vi.mock('../../../services/saasService', () => ({
  saasService: {
    getSubscriptionPlans: vi.fn(),
    getPlanFeatures: vi.fn(),
    getFeatures: vi.fn(),
    createPlanFeature: vi.fn(),
    updatePlanFeature: vi.fn(),
  },
}));

const MOCK_PLAN: SubscriptionPlan = {
  id: 3,
  name: 'Gold Plan',
  description: 'Full-featured tier.',
  price: 99.99,
  billingCycle: 'monthly',
  status: 'active',
};

const MOCK_PLAN_FEATURES: PlanFeature[] = [
  {
    id: 1,
    subscriptionPlan: { id: 3, name: 'Gold Plan' },
    feature: { id: 10, name: 'Max Users', unit: 'user', description: 'Maximum concurrent users allowed' },
    limit_value: 10,
    status: 'active',
  },
  {
    id: 2,
    subscriptionPlan: { id: 3, name: 'Gold Plan' },
    feature: { id: 11, name: 'Storage Cap', unit: 'gb', description: 'Total storage capacity in gigabytes' },
    limit_value: 500,
    status: 'inactive',
  },
];

const MOCK_CATALOG_FEATURES: PlatformFeature[] = [
  { id: 10, name: 'Max Users', description: 'User cap', Unit: 'user', status: 'active' },
  { id: 11, name: 'Storage Cap', description: 'Storage cap', Unit: 'gb', status: 'active' },
  { id: 12, name: 'API Calls', description: 'API call cap', Unit: 'unit', status: 'active' },
];
// ids 10 and 11 are already in MOCK_PLAN_FEATURES; only id 12 should appear in the Map Feature dropdown

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Desde la NavHubBar se llega sin plan elegido: la vista carga los planes y ofrece un selector.
describe('PlanFeaturesView — without a chosen plan', () => {
  const EXECUTIVE: SubscriptionPlan = {
    id: 7,
    name: 'Executive',
    description: 'Custom terms.',
    price: null,
    priceLabel: 'Contact sales',
    billingCycle: 'annual',
    status: 'active',
  };

  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue([MOCK_PLAN, EXECUTIVE]);
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens on the first plan and lists its features', async () => {
    render(<PlanFeaturesView />);
    await waitFor(() => {
      expect(saasService.getPlanFeatures).toHaveBeenCalledWith(3);
    });
    expect(
      screen.getByText('FEATURE ENTITLEMENTS BOUND TO PLAN: Gold Plan'),
    ).toBeInTheDocument();
  });

  it('reloads the features when another plan is selected', async () => {
    render(<PlanFeaturesView />);
    const select = await screen.findByLabelText('Select Plan');

    await userEvent.selectOptions(select, '7');

    await waitFor(() => {
      expect(saasService.getPlanFeatures).toHaveBeenCalledWith(7);
    });
    expect(screen.getByRole('option', { name: 'Executive (Contact sales)' })).toBeInTheDocument();
  });

  it('shows no selector when the plan comes from Subscription Plans', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(saasService.getPlanFeatures).toHaveBeenCalledWith(3);
    });
    expect(screen.queryByLabelText('Select Plan')).not.toBeInTheDocument();
    expect(saasService.getSubscriptionPlans).not.toHaveBeenCalled();
  });
});

describe('PlanFeaturesView — loading state', () => {
  it('shows skeleton rows while data is loading', () => {
    vi.mocked(saasService.getPlanFeatures).mockReturnValue(new Promise(() => {}));
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('PlanFeaturesView — title banner (AC2)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
  });

  it('shows the dark title banner with plan name', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(
        screen.getByText(/FEATURE ENTITLEMENTS BOUND TO PLAN: Gold Plan/i),
      ).toBeInTheDocument();
    });
  });
});

describe('PlanFeaturesView — table rendering (AC3)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
  });

  it('renders one row per plan feature', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('Max Users')).toBeInTheDocument();
      expect(screen.getByText('Storage Cap')).toBeInTheDocument();
    });
  });

  it('shows the feature ID as a monospace badge below the name', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });

  it('renders the measurement unit in brackets', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('[user]')).toBeInTheDocument();
      expect(screen.getByText('[gb]')).toBeInTheDocument();
    });
  });

  it('formats the assigned cap to exactly two decimals', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('10.00')).toBeInTheDocument();
      expect(screen.getByText('500.00')).toBeInTheDocument();
    });
  });

  it('renders active status badge with emerald styling', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      const badge = screen.getAllByText(/^active$/i)[0];
      expect(badge.className).toContain('text-green-600');
    });
  });

  it('renders inactive status badge with grey styling', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      const badge = screen.getByText(/^inactive$/i);
      expect(badge.className).toContain('text-[#5f5e5e]');
    });
  });
});

describe('PlanFeaturesView — empty state (AC4)', () => {
  it('hides the table and shows the empty state block with the exact message', async () => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue([]);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(
        screen.getByText(
          /This subscription plan currently has no features or limits mapped\. Click 'Map Feature' to establish your first entitlement rule\./i,
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('PlanFeaturesView — search and status filter', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
  });

  it('filters rows by feature name in real time', async () => {
    const user = userEvent.setup();
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'Max');

    expect(screen.getByText('Max Users')).toBeInTheDocument();
    expect(screen.queryByText('Storage Cap')).not.toBeInTheDocument();
  });

  it('shows only inactive rows when "inactive" is selected in the status filter', async () => {
    const user = userEvent.setup();
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByRole('combobox', { name: /entitlement status/i }),
      'inactive',
    );

    expect(screen.getByText('Storage Cap')).toBeInTheDocument();
    expect(screen.queryByText('Max Users')).not.toBeInTheDocument();
  });

  it('fuzzy-matches a non-contiguous subsequence of the feature name', async () => {
    const user = userEvent.setup();
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'MxUsr');

    expect(screen.getByText('Max Users')).toBeInTheDocument();
    expect(screen.queryByText('Storage Cap')).not.toBeInTheDocument();
  });

  it('matches by typing the feature id (feature code)', async () => {
    const user = userEvent.setup();
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), '11');

    expect(screen.getByText('Storage Cap')).toBeInTheDocument();
    expect(screen.queryByText('Max Users')).not.toBeInTheDocument();
  });

  it('matches by typing a substring of the feature description', async () => {
    const user = userEvent.setup();
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'gigabytes');

    expect(screen.getByText('Storage Cap')).toBeInTheDocument();
    expect(screen.queryByText('Max Users')).not.toBeInTheDocument();
  });

  it('shows the exact filtered-empty message when no row matches (AC4)', async () => {
    const user = userEvent.setup();
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'zzz-no-match');

    expect(
      screen.getByText('No feature entitlements match your active filtering parameters'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('PlanFeaturesView — Map Feature happy path', () => {
  it('excludes already-mapped features, submits, and prepends the new row', async () => {
    const user = userEvent.setup();
    const newPF: PlanFeature = {
      id: 99,
      subscriptionPlan: { id: 3, name: 'Gold Plan' },
      feature: { id: 12, name: 'API Calls', unit: 'unit', description: 'API call quota' },
      limit_value: 1000,
      status: 'active',
    };
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_CATALOG_FEATURES);
    vi.mocked(saasService.createPlanFeature).mockResolvedValue(newPF);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /map feature/i }));
    await waitFor(() => expect(screen.getByText('API Calls (unit)')).toBeInTheDocument());

    expect(screen.queryByText('Max Users (user)')).not.toBeInTheDocument();
    expect(screen.queryByText('Storage Cap (gb)')).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole('combobox', { name: /^feature$/i }),
      String(12),
    );
    await user.type(screen.getByLabelText(/assigned cap/i), '1000');
    await user.click(screen.getByRole('button', { name: /^map$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.getByText('Feature mapped successfully')).toBeInTheDocument();
      expect(screen.getByText('API Calls')).toBeInTheDocument();
    });
  });

  it('shows the correct measurement unit for a newly mapped feature even if the create response omits it', async () => {
    const user = userEvent.setup();
    const newPFMissingUnit = {
      id: 99,
      subscriptionPlan: { id: 3, name: 'Gold Plan' },
      feature: { id: 12, name: 'API Calls', unit: undefined as unknown as string, description: 'API call quota' },
      limit_value: 1000,
      status: 'active',
    };
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_CATALOG_FEATURES);
    vi.mocked(saasService.createPlanFeature).mockResolvedValue(newPFMissingUnit);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /map feature/i }));
    await waitFor(() => expect(screen.getByText('API Calls (unit)')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByRole('combobox', { name: /^feature$/i }),
      String(12),
    );
    await user.type(screen.getByLabelText(/assigned cap/i), '1000');
    await user.click(screen.getByRole('button', { name: /^map$/i }));

    await waitFor(() => {
      expect(screen.getByText('API Calls')).toBeInTheDocument();
      expect(screen.getByText('[unit]')).toBeInTheDocument();
    });
  });
});

describe('PlanFeaturesView — Edit happy path', () => {
  it('pre-fills the modal, saves changes, and updates the row', async () => {
    const user = userEvent.setup();
    const updatedPF: PlanFeature = {
      ...MOCK_PLAN_FEATURES[0],
      limit_value: 20,
      status: 'inactive',
    };
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    vi.mocked(saasService.updatePlanFeature).mockResolvedValue(updatedPF);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit max users/i }));
    await waitFor(() => expect(screen.getByDisplayValue('10')).toBeInTheDocument());

    await user.clear(screen.getByDisplayValue('10'));
    await user.type(screen.getByLabelText(/assigned cap/i), '20');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.getByText('Plan-feature updated successfully')).toBeInTheDocument();
      expect(screen.getByText('20.00')).toBeInTheDocument();
    });
  });
});

describe('PlanFeaturesView — Edit no longer touches status', () => {
  it('does not render a Feature Status field in the Edit dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit max users/i }));

    expect(screen.queryByLabelText('Feature Status')).not.toBeInTheDocument();
  });
});

describe('PlanFeaturesView — status toggle', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
  });

  it('renders a Deactivate button for an active row and an Activate button for an inactive row', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Deactivate Max Users' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate Storage Cap' })).toBeInTheDocument();
  });

  it('confirms, PATCHes status to inactive, and keeps the row in the grid', async () => {
    const user = userEvent.setup();
    const deactivated: PlanFeature = { ...MOCK_PLAN_FEATURES[0], status: 'inactive' };
    vi.mocked(saasService.updatePlanFeature).mockResolvedValue(deactivated);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate Max Users' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(saasService.updatePlanFeature).toHaveBeenCalledWith(1, { status: 'inactive' });
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(
        screen.getByText('Feature entitlement deactivated successfully'),
      ).toBeInTheDocument();
      expect(screen.getByText('Max Users')).toBeInTheDocument();
    });
  });

  it('activates an inactive plan-feature after confirming', async () => {
    const user = userEvent.setup();
    vi.mocked(saasService.updatePlanFeature).mockResolvedValue({
      id: 2,
      subscriptionPlan: { id: 3, name: 'Gold Plan' },
      feature: { id: 11, name: 'Storage Cap', unit: 'gb', description: 'Total storage capacity in gigabytes' },
      limit_value: 500,
      status: 'active',
    });
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Storage Cap')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Activate Storage Cap' }));
    await user.click(screen.getByRole('button', { name: /^activate$/i }));
    await waitFor(() =>
      expect(saasService.updatePlanFeature).toHaveBeenCalledWith(2, { status: 'active' }),
    );
  });

  it('applies opacity-75 to inactive rows but not active rows', async () => {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Storage Cap')).toBeInTheDocument());

    const inactiveRow = screen.getByText('Storage Cap').closest('tr');
    const activeRow = screen.getByText('Max Users').closest('tr');

    expect(inactiveRow?.className).toContain('opacity-75');
    expect(activeRow?.className).not.toContain('opacity-75');
  });

  it('shows an error toast and leaves the row unchanged when the PATCH fails', async () => {
    const user = userEvent.setup();
    vi.mocked(saasService.updatePlanFeature).mockRejectedValue(
      new Error('Failed to deactivate'),
    );
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate Max Users' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to deactivate')).toBeInTheDocument();
    });
    const row = screen.getByText('Max Users').closest('tr');
    expect(row?.className).not.toContain('opacity-75');
  });
});

describe('PlanFeaturesView — Edit Plan-Feature limit value validation', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
  });

  async function openEditDialog(user: ReturnType<typeof userEvent.setup>) {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit max users/i }));
    await waitFor(() => expect(screen.getByDisplayValue('10')).toBeInTheDocument());
  }

  it('keeps SAVE CHANGES disabled and shows an inline error when the limit value is zero', async () => {
    const user = userEvent.setup();
    await openEditDialog(user);

    await user.clear(screen.getByLabelText(/assigned cap/i));
    await user.type(screen.getByLabelText(/assigned cap/i), '0');

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(
      screen.getByText(/Enter a positive number with up to two decimal places\./i),
    ).toBeInTheDocument();
  });

  it('keeps SAVE CHANGES disabled and shows an inline error when the limit value has more than two decimals', async () => {
    const user = userEvent.setup();
    await openEditDialog(user);

    await user.clear(screen.getByLabelText(/assigned cap/i));
    await user.type(screen.getByLabelText(/assigned cap/i), '1.234');

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(
      screen.getByText(/Enter a positive number with up to two decimal places\./i),
    ).toBeInTheDocument();
  });

  it('enables SAVE CHANGES and shows no inline error for a valid positive value with two decimals', async () => {
    const user = userEvent.setup();
    await openEditDialog(user);

    await user.clear(screen.getByLabelText(/assigned cap/i));
    await user.type(screen.getByLabelText(/assigned cap/i), '10.55');

    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled();
    expect(
      screen.queryByText(/Enter a positive number with up to two decimal places\./i),
    ).not.toBeInTheDocument();
  });
});

describe('PlanFeaturesView — Map Feature limit value validation', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_CATALOG_FEATURES);
  });

  async function openMapDialogWithFeatureSelected(user: ReturnType<typeof userEvent.setup>) {
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /map feature/i }));
    await waitFor(() => expect(screen.getByText('API Calls (unit)')).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox', { name: /^feature$/i }), String(12));
  }

  it('shows no inline error when the limit value field is empty', async () => {
    const user = userEvent.setup();
    await openMapDialogWithFeatureSelected(user);

    expect(
      screen.queryByText(/Enter a positive number with up to two decimal places\./i),
    ).not.toBeInTheDocument();
  });

  it('keeps MAP disabled and shows an inline error when the limit value is zero', async () => {
    const user = userEvent.setup();
    await openMapDialogWithFeatureSelected(user);

    await user.type(screen.getByLabelText(/assigned cap/i), '0');

    expect(screen.getByRole('button', { name: /^map$/i })).toBeDisabled();
    expect(
      screen.getByText(/Enter a positive number with up to two decimal places\./i),
    ).toBeInTheDocument();
  });

  it('keeps MAP disabled and shows an inline error when the limit value has more than two decimals', async () => {
    const user = userEvent.setup();
    await openMapDialogWithFeatureSelected(user);

    await user.type(screen.getByLabelText(/assigned cap/i), '1.234');

    expect(screen.getByRole('button', { name: /^map$/i })).toBeDisabled();
    expect(
      screen.getByText(/Enter a positive number with up to two decimal places\./i),
    ).toBeInTheDocument();
  });

  it('enables MAP and shows no inline error for a valid positive value with two decimals', async () => {
    const user = userEvent.setup();
    await openMapDialogWithFeatureSelected(user);

    await user.type(screen.getByLabelText(/assigned cap/i), '10.55');

    expect(screen.getByRole('button', { name: /^map$/i })).not.toBeDisabled();
    expect(
      screen.queryByText(/Enter a positive number with up to two decimal places\./i),
    ).not.toBeInTheDocument();
  });
});

describe('PlanFeaturesView — error handling', () => {
  it('shows error toast when the initial load fails', async () => {
    vi.mocked(saasService.getPlanFeatures).mockRejectedValue(new Error('Network failure'));
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });

  it('shows session-expired toast on SESSION_EXPIRED error', async () => {
    vi.mocked(saasService.getPlanFeatures).mockRejectedValue(new Error('SESSION_EXPIRED'));
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
    });
  });
});

describe('PlanFeaturesView — Quick Launch panel', () => {
  it('shows the Quick Launch heading when plan features are loaded', async () => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    expect(screen.getByText('Quick Launch')).toBeInTheDocument();
  });

  it('shows the Quick Launch heading in the empty state too', async () => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue([]);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

    expect(screen.getByText('Quick Launch')).toBeInTheDocument();
  });

  it('renders all four Quick Launch buttons with the correct labels', async () => {
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    render(<PlanFeaturesView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'SUBSCRIPTION PLANS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PLATFORM APPLICATIONS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FEATURE CATALOG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EMERGENCY SUPPORT' })).toBeInTheDocument();
  });

  it('navigates to subscription plans when SUBSCRIPTION PLANS is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    render(<PlanFeaturesView plan={MOCK_PLAN} onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'SUBSCRIPTION PLANS' }));

    expect(onNavigate).toHaveBeenCalledWith('subscription');
  });

  it('navigates to platform applications when PLATFORM APPLICATIONS is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    render(<PlanFeaturesView plan={MOCK_PLAN} onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'PLATFORM APPLICATIONS' }));

    expect(onNavigate).toHaveBeenCalledWith('subscription-applications');
  });

  it('navigates to the feature catalog when FEATURE CATALOG is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    render(<PlanFeaturesView plan={MOCK_PLAN} onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'FEATURE CATALOG' }));

    expect(onNavigate).toHaveBeenCalledWith('subscription-features');
  });

  it('does not navigate when EMERGENCY SUPPORT is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    vi.mocked(saasService.getPlanFeatures).mockResolvedValue(MOCK_PLAN_FEATURES);
    render(<PlanFeaturesView plan={MOCK_PLAN} onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByText('Max Users')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'EMERGENCY SUPPORT' }));

    expect(onNavigate).not.toHaveBeenCalled();
  });
});
