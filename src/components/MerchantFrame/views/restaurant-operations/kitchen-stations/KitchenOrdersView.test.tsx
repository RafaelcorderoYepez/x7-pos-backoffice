// Offline-resilience rules for KDS actions: only failures where the server never answered
// (no network, timeout, 5xx) fall back to the offline queue; a 4xx is shown to the cook.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenOrdersView } from './KitchenOrdersView';
import { calledRoutes, fakeBackend, jsonResponse } from '../../../../../test/fetch';
import { enqueueOfflineAction, flushOfflineQueue, getQueuedActions } from '../../../../../lib/kds-offline-sync';

vi.mock('../../../../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/auth-storage')>()),
  getAccessToken: vi.fn(() => 'mock-token'),
  getStoredUser: vi.fn(() => ({ id: 1, role: 'merchant_admin', merchant: { id: 3 } })),
}));

// jsdom has no IndexedDB: stub the queue, keep the real error classifier.
vi.mock('../../../../../lib/kds-offline-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/kds-offline-sync')>()),
  enqueueOfflineAction: vi.fn(async (a) => ({ ...a, clientTimestamp: new Date().toISOString() })),
  getQueuedActions: vi.fn(async () => []),
  flushOfflineQueue: vi.fn(async () => ({ success: true, syncedCount: 0, ignored: [], errors: [] })),
}));

const ORDER = {
  id: 501,
  merchantId: 3,
  orderId: 77,
  stationId: 1,
  station: { id: 1, name: 'Grill' },
  priority: 0,
  businessStatus: 'started',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  kitchenOrderItems: [
    { id: 9001, productName: 'Burger', quantity: 1, preparedQuantity: 0, preparationStatus: 'in_preparation', course: 'main_course' },
  ],
};

const baseRoutes = {
  '/kitchen-station': { data: [{ id: 1, name: 'Grill', stationType: 'HOT' }] },
  '/products': { data: [] },
  '/variants': { data: [] },
  '/kitchen-orders': { data: [ORDER] },
  '/kitchen-event-logs/ping': { status: 'ok' },
  'POST /kitchen-station/ALL/heartbeat': {},
};

const renderView = () =>
  render(
    <MemoryRouter>
      <KitchenOrdersView />
    </MemoryRouter>,
  );

let fetchMock: ReturnType<typeof fakeBackend>;
const stub = (extra: Parameters<typeof fakeBackend>[0]) => {
  fetchMock = fakeBackend({ ...baseRoutes, ...extra });
  vi.stubGlobal('fetch', fetchMock);
};

beforeEach(() => {
  vi.mocked(enqueueOfflineAction).mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KitchenOrdersView — bump', () => {
  it('bumps through PUT /kitchen-orders/:id when the server accepts it', async () => {
    stub({ 'PUT /kitchen-orders/501': { data: { ...ORDER, businessStatus: 'completed' } } });
    renderView();

    await userEvent.click((await screen.findAllByRole('button', { name: 'Bump' }))[0]);

    expect(await screen.findByText('Order #KO-501 bumped')).toBeInTheDocument();
    expect(calledRoutes(fetchMock)).toContain('PUT /kitchen-orders/501');
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it('shows the rejection and does not queue it when the server refuses the bump (4xx)', async () => {
    stub({ 'PUT /kitchen-orders/501': () => jsonResponse({ message: 'Order already cancelled' }, 409) });
    renderView();

    await userEvent.click((await screen.findAllByRole('button', { name: 'Bump' }))[0]);

    expect(await screen.findByText('Order already cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Order #KO-501 bumped')).not.toBeInTheDocument();
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it('queues the bump offline when the server is unreachable (5xx)', async () => {
    stub({ 'PUT /kitchen-orders/501': () => jsonResponse({ message: 'Bad gateway' }, 502) });
    renderView();

    await userEvent.click((await screen.findAllByRole('button', { name: 'Bump' }))[0]);

    await waitFor(() =>
      expect(enqueueOfflineAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'BUMP_ORDER', kitchenOrderId: 501 }),
      ),
    );
    expect(await screen.findByText('Order #KO-501 bumped')).toBeInTheDocument();
  });
});

describe('KitchenOrdersView — offline sync', () => {
  it('reports actions the server ignored during sync and reloads the orders', async () => {
    stub({});
    vi.mocked(getQueuedActions).mockResolvedValueOnce([]).mockResolvedValue([
      { id: 1, actionType: 'BUMP_ORDER', kitchenOrderId: 501, clientTimestamp: new Date().toISOString() },
    ]);
    vi.mocked(flushOfflineQueue).mockResolvedValueOnce({
      success: true,
      syncedCount: 0,
      ignored: [{ actionType: 'BUMP_ORDER', detail: 'Order already cancelled' }],
      errors: [],
    });
    renderView();
    await screen.findAllByRole('button', { name: 'Bump' });
    const loadsBefore = calledRoutes(fetchMock).filter((r) => r === 'GET /kitchen-orders').length;

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(
      await screen.findByText('1 offline action(s) were rejected by the server and have been reverted'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calledRoutes(fetchMock).filter((r) => r === 'GET /kitchen-orders').length).toBeGreaterThan(loadsBefore),
    );
  });
});
