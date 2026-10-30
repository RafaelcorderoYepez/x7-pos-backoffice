//src/components/shared/NavHubBar.test.tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavHubBar } from './NavHubBar';

describe('NavHubBar — scroll reset timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // Regression: the deferred scroll reset outlived the component and, in CI, fired after
  // jsdom was torn down ("document is not defined"), failing the whole test run.
  it('cancels the pending scroll reset when it unmounts', () => {
    const onClick = vi.fn();
    const { unmount } = render(
      <NavHubBar items={[{ id: 'orders', label: 'ORDERS', onClick }]} isSidebarCollapsed />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ORDERS' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a single pending reset when items are clicked repeatedly', () => {
    render(
      <NavHubBar items={[{ id: 'orders', label: 'ORDERS', onClick: vi.fn() }]} isSidebarCollapsed />,
    );
    const button = screen.getByRole('button', { name: 'ORDERS' });
    fireEvent.click(button);
    const afterFirstClick = vi.getTimerCount();

    fireEvent.click(button);
    fireEvent.click(button);

    expect(vi.getTimerCount()).toBe(afterFirstClick);
  });
});
