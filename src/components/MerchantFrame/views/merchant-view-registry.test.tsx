import { isValidElement } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderMerchantView, REGISTERED_VIEW_TABS } from './merchant-view-registry';
import type { MerchantViewContext } from './merchant-view-registry';
import { TimeEntriesView as RestaurantTimeEntriesView } from './restaurant-operations/TimeEntriesView';
import { TimeEntriesView as HrTimeEntriesView } from './hr/TimeEntriesView';
import { ShiftAssignmentView } from './restaurant-operations/ShiftAssignmentView';
import { PlanFeaturesView } from '../../SaaSFrame/views/PlanFeaturesView';
import { PlanFeaturesPickPlanView } from './PlaceholderViews';
import { resolveStaffTarget } from '../merchant-routes';
import type { SubscriptionPlan } from '../../../types/subscription';

function context(overrides: Partial<MerchantViewContext> = {}): MerchantViewContext {
  return {
    activeCategory: 'core',
    profile: null,
    selectedPlan: null,
    refreshTrigger: 0,
    onNavigate: vi.fn(),
    onStaffNavigate: vi.fn(),
    onSaasNavigate: vi.fn(),
    navigateToFeature: vi.fn(),
    setActiveTab: vi.fn(),
    goToDashboard: vi.fn(),
    openLiveMonitor: vi.fn(),
    linesEntryFilter: null,
    setLinesEntryFilter: vi.fn(),
    itemsPaymentFilter: null,
    setItemsPaymentFilter: vi.fn(),
    allocationsContext: null,
    setAllocationsContext: vi.fn(),
    ...overrides,
  };
}

function viewFor(tab: string, ctx = context()): ReactElement<{ initialViewMode?: string }> {
  const node = renderMerchantView(tab, ctx);
  if (!isValidElement<{ initialViewMode?: string }>(node)) throw new Error(`No view for ${tab}`);
  return node;
}

describe('merchant view registry', () => {
  it('renders an element for every registered tab', () => {
    for (const tab of REGISTERED_VIEW_TABS) {
      expect(isValidElement(renderMerchantView(tab, context())), tab).toBe(true);
    }
  });

  it('returns undefined for tabs without a view (hubs and features in development)', () => {
    expect(renderMerchantView('dashboard', context())).toBeUndefined();
    expect(renderMerchantView('some-future-feature', context())).toBeUndefined();
  });

  it('opens the operations attendance ledger or the HR time entries depending on the category', () => {
    expect(viewFor('collaborators-time-entries', context({ activeCategory: 'restaurant-operations' })).type).toBe(
      RestaurantTimeEntriesView,
    );
    expect(viewFor('collaborators-time-entries', context({ activeCategory: 'hr' })).type).toBe(HrTimeEntriesView);
    expect(viewFor('ledger').type).toBe(RestaurantTimeEntriesView);
  });

  it('asks for a plan before mapping plan features', () => {
    expect(viewFor('plan-features-mapping').type).toBe(PlanFeaturesPickPlanView);
    const plan = { id: 1, name: 'Pro' } as SubscriptionPlan;
    expect(viewFor('plan-features-mapping', context({ selectedPlan: plan })).type).toBe(PlanFeaturesView);
  });

  it('keeps the shift scheduler modes per tab', () => {
    expect(viewFor('daily-timeline').props.initialViewMode).toBe('daily');
    expect(viewFor('scheduler').props.initialViewMode).toBe('weekly');
    expect(viewFor('roster').props.initialViewMode).toBe('monthly');
    expect(viewFor('swaps').type).toBe(ShiftAssignmentView);
  });
});

describe('resolveStaffTarget', () => {
  it('maps tab ids, short aliases and URLs to the same destination', () => {
    const expected = { tab: 'staff-roster', path: '/staff-management/schedule/roster' };
    expect(resolveStaffTarget('roster')).toEqual(expected);
    expect(resolveStaffTarget('staff-roster')).toEqual(expected);
    expect(resolveStaffTarget('/staff-management/schedule/roster')).toEqual(expected);
  });

  it('sets the operations category only for tips destinations', () => {
    expect(resolveStaffTarget('tip-settlements')).toEqual({
      tab: 'tips-settlements',
      path: '/tips/settlements',
      category: 'restaurant-operations',
    });
    expect(resolveStaffTarget('kiosk')?.category).toBeUndefined();
  });

  it('returns null for targets outside staff and tips', () => {
    expect(resolveStaffTarget('products')).toBeNull();
  });
});
