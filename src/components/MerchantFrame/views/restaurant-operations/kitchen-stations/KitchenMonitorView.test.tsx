// Characterization tests for the live KDS monitor: what it loads, how it renders tickets, and
// how bump and the SUMMARY batch actions talk to the server. They pin current behaviour so the
// view can be split into smaller pieces without changing it.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenMonitorView } from './KitchenMonitorView';
import { calledRoutes, fakeBackend, jsonResponse } from '../../../../../test/fetch';
import { enqueueOfflineAction } from '../../../../../lib/kds-offline-sync';

vi.mock('../../../../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/auth-storage')>()),
  getAccessToken: vi.fn(() => 'mock-token'),
  getStoredUser: vi.fn(() => ({ id: 1, role: 'merchant_admin', merchant: { id: 3 } })),
}));

// jsdom has no IndexedDB: stub the queue and the ticket cache, keep the real error classifier.
vi.mock('../../../../../lib/kds-offline-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/kds-offline-sync')>()),
  enqueueOfflineAction: vi.fn(async (a) => ({ ...a, clientTimestamp: new Date().toISOString() })),
  getQueuedActions: vi.fn(async () => []),
  flushOfflineQueue: vi.fn(async () => ({ success: true, syncedCount: 0, ignored: [], errors: [] })),
  cacheTicketsLocally: vi.fn(async () => undefined),
  getCachedTicketsLocally: vi.fn(async () => []),
  clearOfflineData: vi.fn(async () => undefined),
}));

const order = (id: number, table: string, items: Array<Record<string, unknown>>) => ({
  id,
  stationId: 1,
  station: { id: 1, name: 'Grill' },
  priority: 0,
  businessStatus: 'started',
  status: 'active',
  createdAt: new Date().toISOString(),
  notes: table,
  kitchenOrderItems: items,
});

const burger = (id: number, preparationStatus = 'in_preparation') => ({
  id,
  productName: 'Burger',
  quantity: 1,
  preparedQuantity: 0,
  preparationStatus,
  course: 'main_course',
});

const ORDERS = [
  order(501, 'Table 4', [burger(9001)]),
  order(502, 'Table 7', [burger(9002)]),
];

const baseRoutes = {
  '/kitchen-station': { data: [{ id: 1, name: 'Grill', stationType: 'HOT' }] },
  '/kitchen-station/rerouting-status': [],
  '/kitchen-orders': { data: ORDERS },
  '/kitchen-event-logs/ping': { status: 'ok' },
  'POST /kitchen-station/ALL/heartbeat': {},
  'POST /kitchen-station/1/heartbeat': {},
};

let fetchMock: ReturnType<typeof fakeBackend>;
const stub = (extra: Parameters<typeof fakeBackend>[0] = {}) => {
  fetchMock = fakeBackend({ ...baseRoutes, ...extra });
  vi.stubGlobal('fetch', fetchMock);
};

const renderMonitor = () => render(<KitchenMonitorView onBackToDashboard={vi.fn()} />);

beforeEach(() => {
  localStorage.clear();
  vi.mocked(enqueueOfflineAction).mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KitchenMonitorView — loading', () => {
  it('loads stations and orders and renders one ticket per active order', async () => {
    stub();
    renderMonitor();

    expect(await screen.findByText('Table 4')).toBeInTheDocument();
    expect(screen.getByText('Table 7')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /BUMP & SERVE TICKET/i })).toHaveLength(2);
    expect(calledRoutes(fetchMock)).toEqual(
      expect.arrayContaining(['GET /kitchen-station', 'GET /kitchen-orders']),
    );
  });

  it('leaves out completed and cancelled orders', async () => {
    stub({
      '/kitchen-orders': {
        data: [...ORDERS, { ...order(503, 'Table 9', [burger(9003)]), businessStatus: 'completed' }],
      },
    });
    renderMonitor();

    await screen.findByText('Table 4');
    expect(screen.queryByText('Table 9')).not.toBeInTheDocument();
  });
});

describe('KitchenMonitorView — bump', () => {
  // The view debounces a bumped ticket id for 2.5s in module state, so each test bumps its own order.
  const stubBump = (orderId: number, put: Parameters<typeof fakeBackend>[0][string]) =>
    stub({
      '/kitchen-orders': { data: [order(orderId, 'Table 4', [burger(orderId * 10)])] },
      [`PUT /kitchen-orders/${orderId}`]: put,
    });

  const bumpTicket = async () => {
    await screen.findByText('Table 4');
    await userEvent.click(screen.getByRole('button', { name: /BUMP & SERVE TICKET/i }));
  };

  it('completes the order on the server and removes the ticket', async () => {
    stubBump(601, {});
    renderMonitor();
    await bumpTicket();

    await waitFor(() => expect(calledRoutes(fetchMock)).toContain('PUT /kitchen-orders/601'));
    const put = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/kitchen-orders/601') && init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ businessStatus: 'completed' });
    expect(screen.queryByText('Table 4')).not.toBeInTheDocument();
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it('shows the rejection and does not queue the bump when the server answers 4xx', async () => {
    stubBump(602, () => jsonResponse({ message: 'Order already completed' }, 409));
    renderMonitor();
    await bumpTicket();

    expect(await screen.findByText('Rejected: Order already completed')).toBeInTheDocument();
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it('queues the bump offline when the server is unreachable (5xx)', async () => {
    stubBump(603, () => jsonResponse({ message: 'Bad gateway' }, 502));
    renderMonitor();
    await bumpTicket();

    await waitFor(() =>
      expect(enqueueOfflineAction).toHaveBeenCalledWith({ actionType: 'BUMP_ORDER', kitchenOrderId: 603 }),
    );
  });
});

describe('KitchenMonitorView — SUMMARY batch actions', () => {
  // SUMMARY only lists tickets of stations configured with that display mode.
  const summaryStation = { '/kitchen-station': { data: [{ id: 1, name: 'Grill', displayMode: 'SUMMARY' }] } };

  const openSummary = async () => {
    await screen.findByText('Table 4');
    await userEvent.click(screen.getByRole('button', { name: /SUMMARY/ }));
  };

  const putBodies = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([url, init]) => [String(url).replace(/^\/api/, ''), JSON.parse(String(init?.body))]);

  it('marks every unit of the batch ready, one PUT per item', async () => {
    stub({ ...summaryStation, 'PUT /kitchen-order-items/9001': {}, 'PUT /kitchen-order-items/9002': {} });
    renderMonitor();
    await openSummary();

    await userEvent.click(await screen.findByRole('button', { name: /MARK ALL READY \(2\)/ }));

    expect(await screen.findByText('ALL 2 READY')).toBeInTheDocument();
    expect(putBodies()).toEqual([
      ['/kitchen-order-items/9001', { preparationStatus: 'ready' }],
      ['/kitchen-order-items/9002', { preparationStatus: 'ready' }],
    ]);
  });

  it('only moves on screen the units the server accepted', async () => {
    stub({
      ...summaryStation,
      'PUT /kitchen-order-items/9001': {},
      'PUT /kitchen-order-items/9002': () => jsonResponse({ message: 'Item locked' }, 409),
    });
    renderMonitor();
    await openSummary();

    await userEvent.click(await screen.findByRole('button', { name: /MARK ALL READY \(2\)/ }));

    expect(await screen.findByText('1 item(s) of Burger not updated: Item locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MARK ALL READY \(1\)/ })).toBeInTheDocument();
  });

  it('starts every queued unit of the batch', async () => {
    stub({
      ...summaryStation,
      '/kitchen-orders': {
        data: [order(501, 'Table 4', [burger(9001, 'pending')]), order(502, 'Table 7', [burger(9002, 'pending')])],
      },
      'PUT /kitchen-order-items/9001': {},
      'PUT /kitchen-order-items/9002': {},
    });
    renderMonitor();
    await openSummary();

    await userEvent.click(await screen.findByRole('button', { name: /START ALL QUEUE \(2\)/ }));

    await waitFor(() =>
      expect(putBodies()).toEqual([
        ['/kitchen-order-items/9001', { preparationStatus: 'in_preparation' }],
        ['/kitchen-order-items/9002', { preparationStatus: 'in_preparation' }],
      ]),
    );
    expect(screen.queryByRole('button', { name: /START ALL QUEUE/ })).not.toBeInTheDocument();
  });

  it('reverts a ready batch back to preparation', async () => {
    stub({
      ...summaryStation,
      '/kitchen-orders': {
        data: [order(501, 'Table 4', [burger(9001, 'ready')]), order(502, 'Table 7', [burger(9002, 'ready')])],
      },
      'PUT /kitchen-order-items/9001': {},
      'PUT /kitchen-order-items/9002': {},
    });
    renderMonitor();
    await openSummary();

    const ready = await screen.findByText('ALL 2 READY');
    await userEvent.click(within(ready.closest('div')!.parentElement!).getByTitle('Revert batch back to preparation'));

    expect(await screen.findByRole('button', { name: /MARK ALL READY \(2\)/ })).toBeInTheDocument();
    expect(putBodies().map(([, body]) => body)).toEqual([
      { preparationStatus: 'in_preparation' },
      { preparationStatus: 'in_preparation' },
    ]);
  });
});
