import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleNavHubBar } from './ModuleNavHubBar';
import { navHubById } from '../../../lib/module-nav-hubs';

afterEach(cleanup);

describe('ModuleNavHubBar', () => {
  const hr = navHubById('hr-hub')!;

  it('renders every 3rd-level option and marks the active view', () => {
    render(<ModuleNavHubBar hub={hr} currentFeatureId="collaborators-contracts" onNavigate={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: /hr module navigation/i });

    for (const label of ['COLLABORATORS', 'COLLABORATORS CONTRACTS', 'COLLABORATORS TIME ENTRIES']) {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('button', { name: 'COLLABORATORS CONTRACTS' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'COLLABORATORS' })).not.toHaveAttribute('aria-current');
  });

  it('returns to the module Command Hub from the left button', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ModuleNavHubBar hub={hr} currentFeatureId="collaborators" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'HR COMMAND HUB' }));
    expect(onNavigate).toHaveBeenCalledWith('hr-hub');
  });

  it('navigates to the featureId of the clicked option', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ModuleNavHubBar hub={hr} currentFeatureId="collaborators" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'COLLABORATORS TIME ENTRIES' }));
    expect(onNavigate).toHaveBeenCalledWith('collaborators-time-entries');
  });

  it('is a fixed bottom bar', () => {
    render(<ModuleNavHubBar hub={hr} currentFeatureId="collaborators" onNavigate={vi.fn()} />);
    expect(
      screen.getByRole('navigation', { name: /hr module navigation/i }).querySelector('.fixed.bottom-0'),
    ).not.toBeNull();
  });
});
