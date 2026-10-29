import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DeliveryFeesView } from './DeliveryFeesView';

vi.mock('../../../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/auth-storage')>()),
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const zone = (id: number, name: string, status = 'active') => ({
  id, name, description: null, geojson: null, status,
  created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:00:00Z', merchant: { id: 3, name: 'prueba1' },
});

const ZONES = [zone(1, 'Centro, Zona Norte'), zone(2, 'Sur'), zone(3, 'Playa', 'maintenance')];

// Postgres sends decimals as a string: the client has to normalize them.
const FEES = [
  {
    id: 1, deliveryZone: { id: 1, name: 'Centro, Zona Norte', status: 'active' },
    base_fee: '5.99', per_km_fee: '1.50', min_order_amount: '10.99', free_above: '50.00',
    status: 'active', created_at: '2026-09-30T12:00:00Z',
  },
  {
    id: 2, deliveryZone: { id: 3, name: 'Playa', status: 'maintenance' },
    base_fee: '3.00', per_km_fee: null, min_order_amount: null, free_above: null,
    status: 'inactive', created_at: '2026-09-30T12:00:00Z',
  },
];

// `GET /delivery-fee/summary`; null = endpoint fails (500) and view computes on client.
let summary: Record<string, unknown> | null = null;
let createStatus = 201;

const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  } as Response);

beforeEach(() => {
  calls.length = 0;
  summary = null;
  createStatus = 201;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });

      if (url.includes('/delivery-fee/quote')) {
        const blocked = Number(body.subtotal) < 10.99;
        const free = Number(body.subtotal) >= 50;
        return jsonResponse({
          data: {
            delivery_zone_id: 1, zone_name: 'Centro, Zona Norte', zone_status: 'active', delivery_fee_id: 1,
            subtotal: body.subtotal, eligible: !blocked, shortfall: blocked ? 2.99 : 0, free_delivery: free,
            base_fee: 5.99, per_km_fee: 1.5, distance_km: body.distance_km ?? 0, distance_charge: free ? 0 : 4.5, fee: free ? 0 : 10.49,
            min_order_amount: 10.99, free_above: 50, reason: blocked ? 'below_min_order' : null,
            message: blocked ? 'Add $2.99 more to reach the $10.99 minimum order for delivery.' : 'Delivery fee: $10.49.',
          },
        });
      }
      if (url.includes('/delivery-fee/summary')) {
        return summary
          ? jsonResponse({ statusCode: 200, data: summary })
          : jsonResponse({ statusCode: 500, message: 'Internal server error' }, 500);
      }
      if (method === 'POST' && createStatus === 409) {
        return jsonResponse(
          { statusCode: 409, message: 'Delivery zone 2 already has an active fee schedule (#FEE-7). Deactivate it first.' },
          409,
        );
      }
      if (method === 'POST' || method === 'PATCH') {
        return jsonResponse({ data: { id: 9, deliveryZone: ZONES[1], created_at: '', ...body } }, method === 'POST' ? 201 : 200);
      }
      if (url.includes('/delivery-fee?')) {
        return jsonResponse({ data: FEES, pagination: { total: 2, page: 1, limit: 100, totalPages: 1 } });
      }
      if (url.includes('/delivery-zone?')) {
        return jsonResponse({ data: ZONES, pagination: { total: 3, page: 1, limit: 100, totalPages: 1 } });
      }
      return jsonResponse({ data: [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DeliveryFeesView', () => {
  it('renders the fee KPIs and flags active zones without a fee', async () => {
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    expect(within(screen.getByTestId('kpi-average-base-fee')).getByText('$5.99')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-free-shipping-zones')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-zones-lacking-fees')).getByText('1')).toBeInTheDocument();
    const alert = screen.getByTestId('missing-fee-alert');
    expect(alert).toHaveTextContent('1 active zone has no active fee');
    expect(within(alert).getByRole('button', { name: /#ZON-2 Sur/ })).toBeInTheDocument();
    // The area under maintenance does not count as "no tariff".
    expect(within(alert).queryByText(/Playa/)).not.toBeInTheDocument();
  });

  it('renders the fee matrix with currency formatting', async () => {
    render(<DeliveryFeesView />);
    const row = await screen.findByTestId('fee-row-1');
    expect(within(row).getByText('#FEE-1')).toBeInTheDocument();
    expect(within(row).getByText('Centro, Zona Norte')).toBeInTheDocument();
    expect(within(row).getByText('$5.99')).toBeInTheDocument();
    expect(within(row).getByText('+$1.50/km')).toBeInTheDocument();
    expect(within(row).getByText('Min: $10.99')).toBeInTheDocument();
    expect(within(row).getByText('Free over $50.00')).toBeInTheDocument();
    expect(within(screen.getByTestId('fee-row-2')).getByText('flat')).toBeInTheDocument();
  });

  it('filters by zone name and status without refetching', async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    const fetches = calls.length;
    await user.type(screen.getByLabelText('Search fees by zone name'), 'playa');
    expect(screen.queryByTestId('fee-row-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('fee-row-2')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search fees by zone name'));
    await user.click(screen.getByRole('checkbox', { name: /^inactive$/i }));
    expect(screen.queryByTestId('fee-row-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('fee-row-2')).toBeInTheDocument();
    expect(calls.length).toBe(fetches);
  });

  it('creates a fee from the missing-fee alert with 2-decimal amounts', async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    await user.click(within(screen.getByTestId('missing-fee-alert')).getByRole('button', { name: /Sur/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/delivery zone/i)).toHaveValue('2');

    await user.type(within(dialog).getByLabelText(/base fee/i), '4.5');
    await user.tab();
    expect(within(dialog).getByLabelText(/base fee/i)).toHaveValue('4.50');
    await user.type(within(dialog).getByLabelText(/per km rate/i), '1');
    await user.type(within(dialog).getByLabelText(/minimum order/i), '12');
    await user.type(within(dialog).getByLabelText(/free above/i), '40');
    await user.click(within(dialog).getByRole('button', { name: 'Create fee' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      deliveryZone: 2,
      base_fee: 4.5,
      per_km_fee: 1,
      min_order_amount: 12,
      free_above: 40,
      status: 'active',
    });
  });

  it('rejects free_above not greater than the minimum order', async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    await user.click(screen.getByRole('button', { name: /new fee schedule/i }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/delivery zone/i), '2');
    await user.type(within(dialog).getByLabelText(/base fee/i), '4');
    await user.type(within(dialog).getByLabelText(/minimum order/i), '20');
    await user.type(within(dialog).getByLabelText(/free above/i), '15');
    expect(within(dialog).getByText(/must be greater than the minimum order/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Create fee' }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('prevents a second active fee on the same zone', async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    await user.click(screen.getByRole('button', { name: /new fee schedule/i }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/delivery zone/i), '1');
    expect(within(dialog).getByTestId('single-active-error')).toHaveTextContent('#FEE-1 is already the active fee');
    // It only lists active zones (the maintenance zone is not offered for a new rate).
    expect(within(within(dialog).getByLabelText(/delivery zone/i)).queryByText(/Playa/)).not.toBeInTheDocument();
  });

  it('quotes a checkout and shows when the minimum order blocks it', async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    const form = screen.getByRole('form', { name: /delivery fee calculator/i });
    await user.selectOptions(within(form).getByLabelText('Zone'), '1');
    await user.type(within(form).getByLabelText(/order subtotal/i), '20');
    await user.type(within(form).getByLabelText(/distance/i), '3');
    await user.click(within(form).getByRole('button', { name: /calculate fee/i }));
    expect(await screen.findByTestId('quote-result')).toHaveTextContent('Delivery fee: $10.49');
    expect(calls.find((c) => c.url.includes('/quote'))!.body).toEqual({ delivery_zone_id: 1, subtotal: 20, distance_km: 3 });

    await user.clear(within(form).getByLabelText(/order subtotal/i));
    await user.type(within(form).getByLabelText(/order subtotal/i), '8');
    await user.click(within(form).getByRole('button', { name: /calculate fee/i }));
    expect(await screen.findByText('Checkout blocked')).toBeInTheDocument();
    expect(screen.getByTestId('quote-result')).toHaveTextContent('Add $2.99 more');
    expect(screen.getByTestId('quote-shortfall')).toHaveTextContent('Missing $2.99 to reach the $10.99 minimum order');

    await user.clear(within(form).getByLabelText(/order subtotal/i));
    await user.type(within(form).getByLabelText(/order subtotal/i), '60');
    await user.click(within(form).getByRole('button', { name: /calculate fee/i }));
    await waitFor(() => expect(screen.getByTestId('quote-result')).toHaveTextContent('Delivery fee: $0.00'));
    expect(screen.getByTestId('quote-result')).toHaveTextContent('Free delivery — subtotal reaches the $50.00 threshold');
  });

  it('toggles a fee status from its pill', async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    await user.click(screen.getByRole('button', { name: 'Deactivate #FEE-1' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ status: 'inactive' });
  });

  it('prefers the server KPI summary and lets each unpriced zone open the drawer', async () => {
    summary = {
      active_zones: 3, active_fees: 2, avg_base_fee: 7.25, free_shipping_zones: 2,
      zones_without_fee_count: 2, zones_without_fee: [{ id: 2, name: 'Sur' }, { id: 4, name: 'Oeste' }],
    };
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    await waitFor(() =>
      expect(within(screen.getByTestId('kpi-average-base-fee')).getByText('$7.25')).toBeInTheDocument(),
    );
    expect(within(screen.getByTestId('kpi-free-shipping-zones')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-zones-lacking-fees')).getByText('2')).toBeInTheDocument();
    const alert = screen.getByTestId('missing-fee-alert');
    expect(alert).toHaveTextContent('2 active zones have no active fee');
    expect(calls.some((c) => c.url.endsWith('/delivery-fee/summary'))).toBe(true);

    await user.click(within(alert).getByRole('button', { name: /#ZON-2 Sur/ }));
    expect(within(await screen.findByRole('dialog')).getByLabelText(/delivery zone/i)).toHaveValue('2');
  });

  it('refreshes the summary after toggling a fee', async () => {
    summary = {
      active_zones: 2, active_fees: 1, avg_base_fee: 5.99, free_shipping_zones: 1,
      zones_without_fee_count: 1, zones_without_fee: [{ id: 2, name: 'Sur' }],
    };
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    const before = calls.filter((c) => c.url.endsWith('/delivery-fee/summary')).length;
    await user.click(screen.getByRole('button', { name: 'Deactivate #FEE-1' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.url.endsWith('/delivery-fee/summary')).length).toBe(before + 1),
    );
  });

  it('shows the backend 409 inside the drawer when the zone already has an active fee', async () => {
    createStatus = 409;
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    await user.click(within(screen.getByTestId('missing-fee-alert')).getByRole('button', { name: /Sur/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/base fee/i), '4');
    await user.click(within(dialog).getByRole('button', { name: 'Create fee' }));
    expect(await within(dialog).findByText(/already has an active fee schedule \(#FEE-7\)/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('rejects amounts with more than 2 decimals and does not post them', async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    await user.click(screen.getByRole('button', { name: /new fee schedule/i }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/delivery zone/i), '2');
    await user.type(within(dialog).getByLabelText(/base fee/i), '4.999');
    await user.click(within(dialog).getByRole('button', { name: 'Create fee' }));
    expect(within(dialog).getByText('Base fee allows at most 2 decimals')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('renders status pills with the corporate colours', async () => {
    render(<DeliveryFeesView />);
    await screen.findByTestId('fee-row-1');
    expect(screen.getByRole('button', { name: 'Deactivate #FEE-1' })).toHaveClass('bg-[#10b981]', 'hover:bg-white!', 'hover:text-primary!');
    expect(screen.getByRole('button', { name: 'Activate #FEE-2' })).toHaveClass('bg-[#64748b]');
  });
});
