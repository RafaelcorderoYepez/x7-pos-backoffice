import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleCommandHubView } from './ModuleCommandHubView';
import { navHubById } from '../../../lib/module-nav-hubs';

afterEach(cleanup);

describe('ModuleCommandHubView', () => {
  it('lists every workspace of the module and opens the clicked one', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ModuleCommandHubView hub={navHubById('pos-hub')!} onNavigate={onNavigate} />);

    expect(screen.getByText('POS Command Hub')).toBeInTheDocument();
    for (const label of ['ORDER DISCOUNTS', 'ORDER ITEMS', 'ORDER ITEM MODIFIERS', 'ORDER PAYMENTS', 'ORDER TAXES', 'ORDERS']) {
      expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    }

    await user.click(screen.getByText('ORDER PAYMENTS', { exact: true }));
    expect(onNavigate).toHaveBeenCalledWith('order-payments');
  });

  it('reports how many workspaces are available and how many are still in development', () => {
    render(<ModuleCommandHubView hub={navHubById('business-partners-hub')!} onNavigate={vi.fn()} />);
    expect(screen.getAllByText('Available').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In Development').length).toBeGreaterThan(0);
  });
});
