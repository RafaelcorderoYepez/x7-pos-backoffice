import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import App from '../../App';
import { getNavFromPath, MERCHANT_ROUTE_PATHS } from './merchant-routes';

vi.mock('../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/auth-storage')>()),
  isAuthenticated: vi.fn(() => true),
}));

vi.mock('./MerchantFrame', () => ({
  MerchantFrame: () => <div data-testid="merchant-frame">{useLocation().pathname}</div>,
}));

vi.mock('../../pages/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page" />,
}));

// Rutas que App.tsx registraba una a una antes de generarlas desde merchant-routes.
const PREVIOUSLY_ROUTED = [
  '/dashboard', '/dashboard/products', '/dashboard/categories', '/dashboard/company-configurations',
  '/dashboard/online-stores', '/dashboard/online-ordering', '/commerce/online-stores', '/online-ordering',
  '/online-ordering/stores', '/dashboard/raw-materials', '/inventory/raw-materials',
  '/dashboard/raw-material-categories', '/dashboard/recipes', '/inventory/recipes', '/inventory/stocks',
  '/inventory/movements', '/inventory/journal-entries', '/dashboard/company-profile', '/dashboard/merchants',
  '/dashboard/users', '/legal/privacy-policy', '/legal/terms-of-service', '/support/help-center',
  '/staff-management/schedule/roster', '/staff-management/schedule/me', '/staff-management/attendance/kiosk',
  '/reservations/guests', '/delivery/zones', '/store-operations/tips-ledger', '/tips/ledger',
  '/tips/settlements', '/tips/cash-movements', '/store-operations/anything', '/tips/anything',
];

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('merchant routes', () => {
  it.each(PREVIOUSLY_ROUTED)('%s still opens MerchantFrame', (path) => {
    renderAt(path);
    expect(screen.getByTestId('merchant-frame')).toHaveTextContent(path);
  });

  // MerchantFrame las resolvía, pero App.tsx no las registraba y redirigían al login.
  it.each(['/qr-code/locations', '/inventory/dashboard', '/online-stores', '/dashboard/online-menus'])(
    '%s opens MerchantFrame instead of redirecting to login',
    (path) => {
      renderAt(path);
      expect(screen.getByTestId('merchant-frame')).toHaveTextContent(path);
    },
  );

  it('sends unknown URLs to login', () => {
    renderAt('/no-such-page');
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('every exact route resolves to a tab', () => {
    for (const path of MERCHANT_ROUTE_PATHS.filter((p) => !p.endsWith('/*'))) {
      expect(getNavFromPath(path), path).not.toBeNull();
    }
  });
});

describe('getNavFromPath', () => {
  it('opens cash tip movements from /tips/cash-movements', () => {
    expect(getNavFromPath('/tips/cash-movements')).toEqual({
      category: 'restaurant-operations',
      tab: 'tips-cash-movements',
    });
  });

  it('resolves reservation and delivery sub-paths', () => {
    expect(getNavFromPath('/delivery/fees')).toEqual({ category: 'commerce', tab: 'delivery-fees' });
    expect(getNavFromPath('/reservations/guests')?.category).toBe('restaurant-operations');
  });

  it('uses the navigation state on /dashboard, falling back per field', () => {
    expect(getNavFromPath('/dashboard')).toEqual({ category: 'core', tab: 'dashboard' });
    expect(getNavFromPath('/dashboard', null, 'SaaS Owner')).toEqual({ category: 'saas', tab: 'saas-dashboard' });
    expect(getNavFromPath('/dashboard', { activeTab: 'kds-dashboard', activeCategory: 'kitchen' })).toEqual({
      category: 'kitchen',
      tab: 'kds-dashboard',
    });
    expect(getNavFromPath('/dashboard', { activeTab: 'shifts-hub' })).toEqual({ category: 'core', tab: 'shifts-hub' });
  });

  it('returns null for section URLs without a specific tab', () => {
    expect(getNavFromPath('/tips/unknown')).toBeNull();
  });
});
