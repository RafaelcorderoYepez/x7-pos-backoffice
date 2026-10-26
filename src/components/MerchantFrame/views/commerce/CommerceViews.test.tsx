// Carga básica de las vistas de comercio online contra un backend falso: qué endpoints se piden,
// que los datos llegan a la pantalla y cómo se comporta cada vista cuando una petición falla.
import { cleanup, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineStoresView } from './online-stores/OnlineStoresView';
import { OnlineMenusView } from './online-menus/OnlineMenusView';
import { OnlineOrderingHubView } from './OnlineOrderingHubView';
import { calledRoutes, fakeBackend, jsonResponse } from '../../../../test/fetch';

// Some shared components (quick links, nav hubs) navigate with react-router.
const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

vi.mock('../../../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/auth-storage')>()),
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const STORES = [
  { id: 1, subdomain: 'pizza-roma', theme: 'default', currency: 'USD', timezone: 'UTC', is_active: true, status: 'active' },
  { id: 2, subdomain: 'sushi-go', theme: 'default', currency: 'EUR', timezone: 'UTC', is_active: false, status: 'active' },
];
const MENUS = [
  { id: 7, name: 'Dinner Menu', storeId: 1, isActive: true, store: { id: 1, subdomain: 'pizza-roma' } },
];

const stub = (routes: Parameters<typeof fakeBackend>[0]) => {
  const fetchMock = fakeBackend(routes);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OnlineStoresView', () => {
  it('loads active and archived stores from /online-stores', async () => {
    const fetchMock = stub({
      '/online-stores': (_init: RequestInit | undefined, url: string) =>
        jsonResponse({ data: url.includes('status=deleted') ? [] : STORES }),
    });
    render(<OnlineStoresView />);

    expect(await screen.findByText('pizza-roma')).toBeInTheDocument();
    expect(calledRoutes(fetchMock).filter((r) => r === 'GET /online-stores')).toHaveLength(2);
  });

  it('still renders active stores when the archived list fails', async () => {
    stub({
      '/online-stores': (_init: RequestInit | undefined, url: string) =>
        url.includes('status=deleted')
          ? jsonResponse({ message: 'boom' }, 500)
          : jsonResponse({ data: STORES }),
    });
    render(<OnlineStoresView />);

    expect(await screen.findByText('pizza-roma')).toBeInTheDocument();
  });

  it('shows the error state when the active list fails', async () => {
    stub({ '/online-stores': () => jsonResponse({ message: 'Stores service down' }, 500) });
    render(<OnlineStoresView />);

    expect((await screen.findAllByText('Stores service down')).length).toBeGreaterThan(0);
  });

  it('sends the publish toggle to PUT /online-stores/:id with the auth header', async () => {
    const fetchMock = stub({
      '/online-stores': (_init: RequestInit | undefined, url: string) =>
        jsonResponse({ data: url.includes('status=deleted') ? [] : STORES }),
      'PUT /online-stores/1': () => jsonResponse({ data: { ...STORES[0], is_active: false } }),
    });
    render(<OnlineStoresView />);
    await screen.findByText('pizza-roma');

    await userEvent.click(screen.getAllByTitle('Published & live. Click to set Maintenance mode')[0]);

    await waitFor(() => expect(calledRoutes(fetchMock)).toContain('PUT /online-stores/1'));
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')!;
    expect(JSON.parse(String(init?.body))).toEqual({ isActive: false });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer mock-token');
  });

  it('redirects to login on a 401', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };
    stub({ '/online-stores': () => jsonResponse({}, 401) });
    render(<OnlineStoresView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));
    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });
});

describe('OnlineMenusView', () => {
  it('loads menus and the stores used to bind them', async () => {
    const fetchMock = stub({ '/online-menus': { data: MENUS }, '/online-stores': { data: STORES } });
    render(<OnlineMenusView />);

    expect(await screen.findByText('Dinner Menu')).toBeInTheDocument();
    expect(calledRoutes(fetchMock)).toEqual(
      expect.arrayContaining(['GET /online-menus', 'GET /online-stores']),
    );
  });

  it('shows the error state when the menus request fails', async () => {
    stub({
      '/online-menus': () => jsonResponse({ message: 'Menus service down' }, 500),
      '/online-stores': { data: STORES },
    });
    render(<OnlineMenusView />);

    expect((await screen.findAllByText('Menus service down')).length).toBeGreaterThan(0);
  });
});

describe('OnlineOrderingHubView', () => {
  it('counts stores and published stores from the backend', async () => {
    const fetchMock = stub({ '/online-stores': { data: STORES }, '/online-menus': { data: MENUS } });
    render(<OnlineOrderingHubView />);

    expect(await screen.findByText('1 in maintenance')).toBeInTheDocument();
    expect(calledRoutes(fetchMock)).toEqual(
      expect.arrayContaining(['GET /online-stores', 'GET /online-menus']),
    );
  });

  it('keeps the store KPIs when the menus request fails', async () => {
    stub({
      '/online-stores': { data: STORES },
      '/online-menus': () => jsonResponse({ message: 'down' }, 500),
    });
    render(<OnlineOrderingHubView />);

    expect(await screen.findByText('1 in maintenance')).toBeInTheDocument();
  });
});
