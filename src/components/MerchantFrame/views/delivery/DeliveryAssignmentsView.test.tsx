import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DeliveryAssignmentsView, TRACKING_FOCUS_KEY } from './DeliveryAssignmentsView';

vi.mock('../../../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/auth-storage')>()),
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const realtime = vi.hoisted(() => ({
  handlers: null as null | { onAssignmentChanged?: (p: unknown) => void; onReconnect?: () => void },
  close: vi.fn(),
}));
vi.mock('../../../../lib/delivery-realtime', () => ({
  connectDeliveryRealtime: vi.fn((_token: string, handlers: typeof realtime.handlers) => {
    realtime.handlers = handlers;
    return { close: realtime.close };
  }),
}));

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const row = (over: Record<string, unknown>) => ({
  order: { id: 100, order_number: '000100', delivery_address: 'Somewhere 1' },
  deliveryDriver: null,
  assignment_type: 'in_house',
  delivery_status: 'pending',
  assigned_at: null,
  picked_up_at: null,
  delivered_at: null,
  external_delivery_id: null,
  external_tracking_url: null,
  external_dsp_fee: null,
  status: 'active',
  ...over,
});

let ASSIGNMENTS: Array<Record<string, unknown>> = [];
const buildAssignments = () => [
  row({
    id: 1,
    order: { id: 101, order_number: '000101', delivery_address: 'Calle 5 #10, Centro' },
    deliveryDriver: { id: 1, name: 'Mario Lopez', status: 'on_delivery' },
    delivery_status: 'assigned',
    assigned_at: ago(12),
  }),
  row({
    id: 2,
    order: { id: 102, delivery_address: 'Av. Playa 22' },
    assignment_type: 'doordash_drive',
    delivery_status: 'picked_up',
    assigned_at: ago(20),
    picked_up_at: ago(8),
    external_delivery_id: 'dd-1',
    external_tracking_url: 'https://track.doordash.com/abc',
    external_dsp_fee: '6.50',
  }),
  row({ id: 3, order: { id: 103 }, assignment_type: 'uber_direct', delivery_status: 'pending' }),
  row({
    id: 4,
    order: { id: 104 },
    deliveryDriver: { id: 2, name: 'Ana Ruiz', status: 'active' },
    delivery_status: 'delivered',
    assigned_at: ago(40),
    picked_up_at: ago(25),
    delivered_at: ago(2),
  }),
  row({ id: 5, order: { id: 105 }, delivery_status: 'cancelled' }),
  row({ id: 6, order: { id: 106 }, delivery_status: 'pending' }),
];

let SUMMARY: Record<string, unknown> = {};
const DEFAULT_SUMMARY = {
  pending_dispatch: 3,
  pending_assignments: 2,
  in_transit: 4,
  avg_completion_minutes: 27.5,
  delayed: 1,
  delay_threshold_minutes: 45,
  live_assignments: 8,
  in_house_share_pct: 75,
  dsp_share_pct: 25,
  dsp_fee_today: 22.5,
};

const DRIVERS = [
  { id: 1, name: 'Mario Lopez', vehicleType: 'car', status: 'on_delivery' },
  { id: 2, name: 'Ana Ruiz', vehicleType: 'bicycle', status: 'active' },
  { id: 3, name: 'Luis Off', vehicleType: 'motorcycle', status: 'off_duty' },
  { id: 4, name: 'Rosa Inactive', vehicleType: 'e_scooter', status: 'inactive' },
  { id: 7, name: 'Pedro Activo', vehicleType: 'on_foot', status: 'active' },
];

const ORDERS = [
  { id: 201, orderNumber: '000201', deliveryAddress: 'Av 1 #2', kitchenStatus: 'ready', businessStatus: 'in_progress' },
  { id: 202, orderNumber: '000202', deliveryAddress: 'Av 3', kitchenStatus: 'preparing', businessStatus: 'in_progress' },
  // Ya tiene la asignación abierta #ASN-1.
  { id: 101, orderNumber: '000101', deliveryAddress: 'Calle 5', kitchenStatus: 'ready', businessStatus: 'in_progress' },
  { id: 203, orderNumber: '000203', deliveryAddress: 'Av 4', kitchenStatus: 'ready', businessStatus: 'cancelled' },
];

const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
let failList = false;
let patchError: { status: number; message: string } | null = null;

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  } as Response);

const page = (data: unknown[]) => ({ data, pagination: { total: data.length, page: 1, limit: 100, totalPages: 1 } });

beforeEach(() => {
  calls.length = 0;
  failList = false;
  patchError = null;
  ASSIGNMENTS = buildAssignments();
  SUMMARY = { ...DEFAULT_SUMMARY };
  realtime.handlers = null;
  window.sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const qs = new URLSearchParams(url.split('?')[1] ?? '');

      if (url.includes('/delivery-assignment/external-')) {
        return jsonResponse(
          {
            statusCode: 503,
            message: `Delivery provider '${body.provider}' is not configured.`,
            error: 'Service Unavailable',
          },
          503,
        );
      }
      if (url.includes('/delivery-assignment/summary')) return jsonResponse({ data: SUMMARY });
      if (method === 'PATCH') {
        if (patchError) return jsonResponse({ statusCode: patchError.status, message: patchError.message }, patchError.status);
        return jsonResponse({ data: { ...row({ id: 1 }), ...body } });
      }
      if (method === 'POST' && url.includes('/delivery-assignment')) {
        return jsonResponse({ data: { ...row({ id: 9 }), ...body, order: { id: body.order } } }, 201);
      }
      if (url.includes('/delivery-assignment?')) {
        if (failList) return jsonResponse({ message: 'Database unavailable' }, 500);
        const statuses = qs.get('delivery_status')?.split(',');
        return jsonResponse(page(statuses ? ASSIGNMENTS.filter((a) => statuses.includes(String(a.delivery_status))) : ASSIGNMENTS));
      }
      if (url.includes('/delivery-driver?')) {
        const status = qs.get('status');
        return jsonResponse(page(status ? DRIVERS.filter((d) => d.status === status) : DRIVERS));
      }
      if (url.includes('/orders?')) {
        return jsonResponse({ data: ORDERS, paginationMeta: { page: 1, limit: 100, total: 4, totalPages: 1 } });
      }
      return jsonResponse({ data: [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const listCalls = () =>
  calls.filter((c) => c.method === 'GET' && c.url.includes('/delivery-assignment?') && !c.url.includes('delivery_status=pending%2Cassigned'));
const lastListQuery = () => new URLSearchParams(listCalls().at(-1)!.url.split('?')[1]);

const renderView = async (props: Parameters<typeof DeliveryAssignmentsView>[0] = {}) => {
  const utils = render(<DeliveryAssignmentsView {...props} />);
  await screen.findByTestId('assignment-card-1');
  return utils;
};

describe('DeliveryAssignmentsView', () => {
  it('renders the dispatch KPIs from the summary endpoint', async () => {
    await renderView();
    expect(within(screen.getByTestId('kpi-pending-dispatch')).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-in-transit')).getByText('4')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-avg-completion')).getByText('27.5 min')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-delayed')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-fleet-share')).getByText('In-house 75%')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-fleet-share')).getByText('DSP 25%')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-dsp-expenses')).getByText('$22.50')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/delivery-assignment/summary'))).toBe(true);
  });

  it('highlights delayed orders as an alert with the threshold tooltip, and shows — without completions', async () => {
    SUMMARY = { ...DEFAULT_SUMMARY, avg_completion_minutes: null, in_house_share_pct: null, dsp_share_pct: null };
    await renderView();
    const delayed = screen.getByTestId('kpi-delayed');
    expect(delayed).toHaveAttribute('role', 'alert');
    expect(delayed.getAttribute('title')).toContain('45 minutes');
    expect(within(screen.getByTestId('kpi-avg-completion')).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-fleet-share')).getByText('No open assignments')).toBeInTheDocument();
  });

  it('does not flag delays when there are none', async () => {
    SUMMARY = { ...DEFAULT_SUMMARY, delayed: 0 };
    await renderView();
    expect(screen.getByTestId('kpi-delayed')).not.toHaveAttribute('role', 'alert');
  });

  it('sends multi-status and multi-type filters as comma-separated query params', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('checkbox', { name: 'Status Picked up' }));
    await user.click(screen.getByRole('checkbox', { name: 'Status In transit' }));
    await waitFor(() => expect(lastListQuery().get('delivery_status')).toBe('picked_up,in_transit'));
    await user.click(screen.getByRole('checkbox', { name: 'Fulfillment DOORDASH_DRIVE' }));
    await user.click(screen.getByRole('checkbox', { name: 'Fulfillment UBER_DIRECT' }));
    await waitFor(() => expect(lastListQuery().get('assignment_type')).toBe('doordash_drive,uber_direct'));
    expect(lastListQuery().get('limit')).toBe('100');
    await waitFor(() => expect(screen.queryByTestId('assignment-card-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('assignment-card-2')).toBeInTheDocument();
  });

  it('debounces the courier search', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.type(screen.getByLabelText('Search assignments'), 'mario');
    await waitFor(() => expect(lastListQuery().get('search')).toBe('mario'));
    const searched = listCalls().filter((c) => c.url.includes('search='));
    expect(searched).toHaveLength(1);
  });

  it('toggles between the Kanban board and the table', async () => {
    const user = userEvent.setup();
    await renderView();
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    expect(within(screen.getByTestId('kanban-column-moving')).getByTestId('assignment-card-2')).toBeInTheDocument();
    expect(within(screen.getByTestId('kanban-column-closed')).getByTestId('assignment-card-5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /table/i }));
    expect(screen.queryByTestId('kanban-board')).not.toBeInTheDocument();
    expect(screen.getByTestId('assignment-table')).toBeInTheDocument();
    expect(within(screen.getByTestId('assignment-row-1')).getByText('#ASN-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /kanban/i }));
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
  });

  it('renders badges, fleet info, DSP fee tag, pills and relative timers', async () => {
    await renderView();
    const inHouse = screen.getByTestId('assignment-card-1');
    expect(within(inHouse).getByText('#ASN-1')).toBeInTheDocument();
    expect(within(inHouse).getByText('#ORD-101')).toBeInTheDocument();
    expect(within(inHouse).getByText('Calle 5 #10, Centro')).toBeInTheDocument();
    expect(within(inHouse).getByText('Mario Lopez')).toBeInTheDocument();
    await waitFor(() => expect(within(inHouse).getByTestId('vehicle-icon')).toHaveTextContent('directions_car'));
    expect(within(inHouse).getByTestId('status-pill')).toHaveAttribute('data-color', '#3b82f6');
    expect(within(inHouse).getByText('Assigned 12 mins ago')).toBeInTheDocument();

    const dsp = screen.getByTestId('assignment-card-2');
    expect(within(dsp).getByText('DoorDash Drive')).toBeInTheDocument();
    expect(within(dsp).getByText('DSP Fee: $6.50')).toBeInTheDocument();
    expect(within(dsp).getByTestId('status-pill')).toHaveAttribute('data-color', '#8b5cf6');
    expect(within(dsp).getByText('Picked up 8 mins ago')).toBeInTheDocument();

    expect(within(screen.getByTestId('assignment-card-3')).getByText('Uber Direct')).toBeInTheDocument();
    expect(within(screen.getByTestId('assignment-card-3')).getByTestId('status-pill')).toHaveAttribute('data-color', '#64748b');
    expect(within(screen.getByTestId('assignment-card-4')).getByText('Delivered 2 mins ago')).toBeInTheDocument();
    expect(within(screen.getByTestId('assignment-card-4')).getByTestId('status-pill')).toHaveAttribute('data-color', '#10b981');
    expect(within(screen.getByTestId('assignment-card-5')).getByTestId('status-pill')).toHaveAttribute('data-color', '#ef4444');
  });

  it('ticks the relative timers live', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderView();
    expect(within(screen.getByTestId('assignment-card-1')).getByText('Assigned 12 mins ago')).toBeInTheDocument();
    // Evita que el sondeo reemplace los datos: el reloj es lo que se prueba.
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    await waitFor(() =>
      expect(within(screen.getByTestId('assignment-card-1')).getByText('Assigned 15 mins ago')).toBeInTheDocument(),
    );
  });

  it('shows only the transitions allowed from each status', async () => {
    await renderView();
    const names = (id: number) =>
      within(screen.getByTestId(`actions-${id}`))
        .getAllByRole('button')
        .map((b) => b.textContent?.replace(/two_wheeler|open_in_new|local_shipping/g, '').trim());
    expect(names(1)).toEqual(['Reassign driver', 'Mark picked up', 'Mark failed', 'Cancel', 'Live tracking']);
    expect(names(2)).toEqual(['Mark in transit', 'Mark delivered', 'Mark failed', 'Cancel', 'Live tracking']);
    // Pending DSP sin id externo: no puede pasar a assigned.
    expect(names(3)).toEqual(['Mark failed', 'Cancel']);
    expect(names(6)).toEqual(['Assign driver', 'Mark failed', 'Cancel']);
    expect(within(screen.getByTestId('actions-5')).queryAllByRole('button')).toHaveLength(0);
    expect(names(4)).toEqual(['Live tracking']);
  });

  it('PATCHes only the next delivery_status', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: 'Mark picked up #ASN-1' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/delivery-assignment\/1$/);
    expect(patch.body).toEqual({ delivery_status: 'picked_up' });
    expect(await screen.findByText('#ASN-1 → Picked up')).toBeInTheDocument();
  });

  it('confirms destructive transitions in-page before PATCHing', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: 'Cancel #ASN-2' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Cancel #ASN-2?');
    await user.click(within(dialog).getByRole('button', { name: 'Keep delivery' }));
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Mark failed #ASN-2' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, mark failed' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ delivery_status: 'failed' }));
  });

  it('shows the backend message when a transition is rejected', async () => {
    patchError = {
      status: 400,
      message: "Invalid delivery status transition: 'assigned' → 'delivered'. Allowed from 'assigned': picked_up, failed, cancelled",
    };
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: 'Mark picked up #ASN-1' }));
    expect(await screen.findByText(/Invalid delivery status transition/)).toBeInTheDocument();
  });

  it('lists only active drivers and ready orders without an open assignment, then creates an in-house assignment', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /new assignment/i }));
    const dialog = await screen.findByRole('dialog');
    const driver = within(dialog).getByRole('combobox', { name: 'Driver' });
    await waitFor(() => expect(within(driver).getAllByRole('option')).toHaveLength(3));
    const driverNames = within(driver).getAllByRole('option').map((o) => o.textContent);
    expect(driverNames.some((n) => n?.includes('Ana Ruiz'))).toBe(true);
    expect(driverNames.some((n) => n?.includes('Pedro Activo'))).toBe(true);
    expect(driverNames.some((n) => /Mario|Luis|Rosa/.test(n ?? ''))).toBe(false);
    expect(calls.some((c) => c.url.includes('/delivery-driver?') && c.url.includes('status=active'))).toBe(true);

    const order = within(dialog).getByRole('combobox', { name: 'Delivery order' });
    const orderValues = within(order).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(orderValues).toEqual(['', '201']);
    expect(calls.some((c) => c.url.includes('/orders?type=delivery'))).toBe(true);

    await user.selectOptions(order, '201');
    await user.selectOptions(driver, '2');
    await user.click(within(dialog).getByRole('button', { name: 'Create assignment' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ order: 201, assignment_type: 'in_house', deliveryDriver: 2 });
  });

  it('explains that the DSP provider is not connected on 503', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /new assignment/i }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Delivery order' }), '201');
    await user.click(within(dialog).getByRole('radio', { name: /doordash drive/i }));
    expect(within(dialog).queryByRole('combobox', { name: 'Driver' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /request quote/i }));
    expect(await within(dialog).findByTestId('provider-message')).toHaveTextContent(
      'Provider not connected yet — enter the dispatch details manually',
    );
    const quote = calls.find((c) => c.url.includes('/external-quote'))!;
    expect(quote.body).toEqual({ order_id: 201, provider: 'doordash_drive' });

    await user.click(within(dialog).getByRole('button', { name: /dispatch via provider/i }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/external-dispatch'))).toBe(true));
    expect(within(dialog).getByTestId('provider-message')).toHaveTextContent('Provider not connected yet');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('creates a manual DSP assignment with an https tracking URL and a 2-decimal fee', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /new assignment/i }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Delivery order' }), '201');
    await user.click(within(dialog).getByRole('radio', { name: /uber direct/i }));
    await user.type(within(dialog).getByLabelText(/external delivery id/i), 'ub-77');
    await user.type(within(dialog).getByLabelText(/tracking url/i), 'http://track.uber.com/ub-77');
    await user.type(within(dialog).getByLabelText(/dsp fee/i), '6.5');
    await user.tab();
    expect(within(dialog).getByLabelText(/dsp fee/i)).toHaveValue('6.50');

    await user.click(within(dialog).getByRole('button', { name: 'Create assignment' }));
    expect(within(dialog).getByText('Tracking URL must be a valid https:// link')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/delivery-assignment'))).toBe(false);

    await user.clear(within(dialog).getByLabelText(/tracking url/i));
    await user.type(within(dialog).getByLabelText(/tracking url/i), 'https://track.uber.com/ub-77');
    await user.click(within(dialog).getByRole('button', { name: 'Create assignment' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      order: 201,
      assignment_type: 'uber_direct',
      external_delivery_id: 'ub-77',
      external_tracking_url: 'https://track.uber.com/ub-77',
      external_dsp_fee: 6.5,
    });
  });

  it('rejects a DSP fee with more than 2 decimals', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: /new assignment/i }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Delivery order' }), '201');
    await user.click(within(dialog).getByRole('radio', { name: /uber direct/i }));
    await user.type(within(dialog).getByLabelText(/dsp fee/i), '6.555');
    await user.click(within(dialog).getByRole('button', { name: 'Create assignment' }));
    expect(within(dialog).getByText('DSP fee allows at most 2 decimals')).toBeInTheDocument();
  });

  it('reassigns the driver of a pending/assigned in-house delivery', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: 'Reassign driver for #ASN-1' }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByRole('combobox', { name: 'New driver' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    await user.selectOptions(select, '7');
    await user.click(within(dialog).getByRole('button', { name: 'Reassign driver' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ deliveryDriver: 7 }));
  });

  it('opens DSP tracking in a drawer iframe with an Open in new tab link', async () => {
    const user = userEvent.setup();
    await renderView();
    await user.click(screen.getByRole('button', { name: 'Live tracking #ASN-2' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTitle('Tracking for #ASN-2')).toHaveAttribute('src', 'https://track.doordash.com/abc');
    const link = within(dialog).getByRole('link', { name: /open in new tab/i });
    expect(link).toHaveAttribute('href', 'https://track.doordash.com/abc');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('navigates to the tracking view for in-house deliveries and stores the focus id', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    await renderView({ onNavigate });
    await user.click(screen.getByRole('button', { name: 'Live tracking #ASN-1' }));
    expect(window.sessionStorage.getItem(TRACKING_FOCUS_KEY)).toBe('1');
    expect(TRACKING_FOCUS_KEY).toBe('delivery-tracking:focus-assignment');
    expect(onNavigate).toHaveBeenCalledWith('delivery-tracking');
  });

  it('refetches board and summary on realtime events', async () => {
    await renderView();
    const before = calls.filter((c) => c.url.includes('/summary')).length;
    act(() => realtime.handlers?.onAssignmentChanged?.({ assignmentId: 1 }));
    await waitFor(() => expect(calls.filter((c) => c.url.includes('/summary')).length).toBe(before + 1));
  });

  it('shows the loading skeleton, then the error state with retry', async () => {
    failList = true;
    const user = userEvent.setup();
    render(<DeliveryAssignmentsView />);
    expect(screen.getByTestId('assignments-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('assignments-error')).toHaveTextContent('Database unavailable');
    failList = false;
    await user.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(await screen.findByTestId('assignment-card-1')).toBeInTheDocument();
  });

  it('shows the empty state when there are no assignments', async () => {
    ASSIGNMENTS = [];
    render(<DeliveryAssignmentsView />);
    expect(await screen.findByTestId('assignments-empty-state')).toHaveTextContent('No delivery assignment yet');
  });
});
