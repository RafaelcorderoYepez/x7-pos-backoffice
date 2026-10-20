import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DeliveryDriversView } from './DeliveryDriversView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const realtime = vi.hoisted(() => ({
  handlers: null as null | Record<string, (() => void) | undefined>,
  close: vi.fn(),
}));
vi.mock('../../../../lib/delivery-realtime', () => ({
  connectDeliveryRealtime: vi.fn((_token: string, handlers: Record<string, () => void>) => {
    realtime.handlers = handlers;
    return { close: realtime.close };
  }),
}));

const driver = (id: number, name: string, phone: string, vehicleType: string, status: string) => ({
  id, name, phone, vehicleType, status, created_at: '2026-09-30T12:00:00Z', merchant: { id: 3, name: 'prueba1' },
});

const DRIVERS = [
  driver(1, 'Mario Lopez', '+18095551234', 'car', 'active'),
  driver(2, 'Ana Ruiz', '+18095550000', 'e_scooter', 'on_delivery'),
  driver(3, 'Luis Pena', '8095559999', 'bicycle', 'off_duty'),
  driver(4, 'Carla Diaz', '+34600111222', 'on_foot', 'inactive'),
];

const SUMMARY = { total: 4, available: 1, en_route: 1, unavailable: 2 };

type Call = { url: string; method: string; body?: Record<string, unknown> };
const calls: Call[] = [];

let listResponse: () => Promise<Response>;
let mutationResponse: (call: Call) => Promise<Response> | null;

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  } as Response);

const listCalls = () => calls.filter((c) => c.method === 'GET' && c.url.includes('/delivery-driver?'));
const params = (call: Call) => new URL(call.url, 'http://x').searchParams;

beforeEach(() => {
  calls.length = 0;
  realtime.handlers = null;
  listResponse = () => jsonResponse({ data: DRIVERS, pagination: { total: 4, page: 1, limit: 25, totalPages: 1 } });
  mutationResponse = () => null;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const call = { url, method, body };
      calls.push(call);

      if (url.includes('/delivery-driver/summary')) return jsonResponse({ data: SUMMARY });
      if (method !== 'GET') {
        return mutationResponse(call) ?? jsonResponse({ data: { ...DRIVERS[0], ...body } }, method === 'POST' ? 201 : 200);
      }
      if (url.includes('/delivery-driver?')) return listResponse();
      return jsonResponse({ data: [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DeliveryDriversView', () => {
  it('renders the fleet KPI banner from the summary endpoint', async () => {
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    await waitFor(() => expect(within(screen.getByTestId('kpi-total')).getByText('4')).toBeInTheDocument());
    expect(within(screen.getByTestId('kpi-available')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-en-route')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-unavailable')).getByText('2')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/delivery-driver/summary'))).toBe(true);
  });

  it('renders the roster with badge, tel: link, vehicle chip, merchant and status pills', async () => {
    render(<DeliveryDriversView />);
    const row = await screen.findByTestId('driver-row-1');
    expect(within(row).getByText('#DRV-1')).toBeInTheDocument();
    expect(within(row).getByText('Mario Lopez')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Call Mario Lopez' })).toHaveAttribute('href', 'tel:+18095551234');
    expect(within(row).getByTestId('driver-phone-1')).toHaveTextContent('+18095551234');
    expect(within(row).getByText('directions_car')).toBeInTheDocument();
    expect(within(row).getByText('Car')).toBeInTheDocument();
    expect(within(row).getByText('prueba1')).toBeInTheDocument();

    expect(screen.getByTestId('driver-status-1')).toHaveTextContent('Available');
    expect(screen.getByTestId('driver-status-2')).toHaveTextContent('En route');
    expect(screen.getByTestId('driver-status-3')).toHaveTextContent('Off shift');
    expect(screen.getByTestId('driver-status-4')).toHaveTextContent('Suspended');
    // The color goes in the --pill variable (the hover changes it to white background + red text).
    expect(screen.getByTestId('driver-status-1').style.getPropertyValue('--pill')).toBe('#10b981');
    expect(screen.getByTestId('driver-status-4').style.getPropertyValue('--pill')).toBe('#ef4444');
    expect(screen.getByTestId('driver-status-1')).toHaveClass('bg-[var(--pill)]', 'hover:bg-white!', 'hover:text-primary!');
    expect(within(screen.getByTestId('driver-row-2')).getByText('E-Scooter')).toBeInTheDocument();
    expect(within(screen.getByTestId('driver-row-4')).getByText('On Foot')).toBeInTheDocument();
  });

  it('sends status (multi-value) and vehicleType filters as query params', async () => {
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    expect(params(listCalls()[0]).get('status')).toBeNull();
    expect(params(listCalls()[0]).get('limit')).toBe('25');

    await user.click(screen.getByRole('checkbox', { name: /available/i }));
    await user.click(screen.getByRole('checkbox', { name: /en route/i }));
    await waitFor(() => expect(params(listCalls().at(-1)!).get('status')).toBe('active,on_delivery'));

    await user.selectOptions(screen.getByLabelText('Vehicle type'), 'e_scooter');
    await waitFor(() => expect(params(listCalls().at(-1)!).get('vehicleType')).toBe('e_scooter'));
    expect(params(listCalls().at(-1)!).get('status')).toBe('active,on_delivery');
    expect(params(listCalls().at(-1)!).get('page')).toBe('1');
  });

  it('debounces the search across name and phone into one request', async () => {
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    await user.type(screen.getByLabelText('Search drivers by name or phone'), 'mario');
    await waitFor(() => expect(listCalls().some((c) => params(c).get('search') === 'mario')).toBe(true), { timeout: 1500 });
    const searched = listCalls().filter((c) => params(c).get('search') !== null);
    expect(searched).toHaveLength(1);
  });

  it('validates name and phone lengths in the drawer and blocks the POST', async () => {
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    await user.click(screen.getByRole('button', { name: /add driver/i }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText(/full name/i);
    await user.click(name);
    await user.paste('x'.repeat(101));
    expect(within(dialog).getByTestId('driver-name-error')).toHaveTextContent('at most 100 characters');
    const phone = within(dialog).getByLabelText(/phone/i);
    await user.click(phone);
    await user.paste('1'.repeat(21));
    expect(within(dialog).getByTestId('driver-phone-error')).toHaveTextContent('at most 20 characters');
    await user.click(within(dialog).getByRole('button', { name: 'Create driver' }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('creates a driver with an explicit body (no merchant)', async () => {
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    await user.click(screen.getByRole('button', { name: /add driver/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/full name/i), '  Pedro Gil ');
    await user.type(within(dialog).getByLabelText(/phone/i), '+1 809 555 7777');
    await user.selectOptions(within(dialog).getByLabelText(/vehicle type/i), 'motorcycle');
    // on_delivery is never offered.
    expect(within(within(dialog).getByLabelText(/status/i)).queryByText('En route')).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/status/i), 'off_duty');
    await user.click(within(dialog).getByRole('button', { name: 'Create driver' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toMatch(/\/delivery-driver$/);
    expect(post.body).toEqual({ name: 'Pedro Gil', phone: '+1 809 555 7777', vehicleType: 'motorcycle', status: 'off_duty' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Refresca KPIs tras mutar.
    expect(calls.filter((c) => c.url.endsWith('/summary')).length).toBeGreaterThanOrEqual(2);
  });

  it('updates a driver with PATCH and omits status while on a delivery', async () => {
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-2');
    await user.click(screen.getByRole('button', { name: 'Edit #DRV-2' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/status/i)).toHaveValue('En route');
    expect(within(dialog).getByLabelText(/status/i)).toBeDisabled();
    const name = within(dialog).getByLabelText(/full name/i);
    await user.clear(name);
    await user.type(name, 'Ana R.');
    await user.click(within(dialog).getByRole('button', { name: 'Save driver' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/delivery-driver\/2$/);
    expect(patch.body).toEqual({ name: 'Ana R.', phone: '+18095550000', vehicleType: 'e_scooter' });
  });

  it('shows a 409 duplicate phone error inline in the drawer', async () => {
    mutationResponse = (call) =>
      call.method === 'POST'
        ? jsonResponse({ statusCode: 409, message: 'Another driver already uses phone +18095551234', error: 'Conflict' }, 409)
        : null;
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    await user.click(screen.getByRole('button', { name: /add driver/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/full name/i), 'Dup');
    await user.type(within(dialog).getByLabelText(/phone/i), '+18095551234');
    await user.selectOptions(within(dialog).getByLabelText(/vehicle type/i), 'car');
    await user.click(within(dialog).getByRole('button', { name: 'Create driver' }));
    expect(await within(dialog).findByText('Another driver already uses phone +18095551234')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('toggles the shift with one click and disables it while on_delivery or inactive', async () => {
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    const enRoute = screen.getByRole('switch', { name: 'Shift for Ana Ruiz' });
    expect(enRoute).toBeDisabled();
    expect(enRoute).toHaveAttribute('title', expect.stringMatching(/on a delivery/i));
    expect(screen.getByRole('switch', { name: 'Shift for Carla Diaz' })).toBeDisabled();

    await user.click(screen.getByRole('switch', { name: 'Shift for Mario Lopez' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/delivery-driver/1/shift'))).toBe(true));
    const shift = calls.find((c) => c.url.endsWith('/shift'))!;
    expect(shift.method).toBe('PATCH');
    expect(shift.body).toEqual({ on_shift: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Shift for Luis Pena' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/delivery-driver/3/shift'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/3/shift'))!.body).toEqual({ on_shift: true });
  });

  it('shows a backend 409 on the shift toggle as an error toast', async () => {
    mutationResponse = (call) =>
      call.url.endsWith('/shift')
        ? jsonResponse({ statusCode: 409, message: 'Delivery driver #1 is on a delivery', error: 'Conflict' }, 409)
        : null;
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    await user.click(screen.getByRole('switch', { name: 'Shift for Mario Lopez' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Delivery driver #1 is on a delivery');
  });

  it('soft-deletes after an in-page confirmation', async () => {
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-3');
    await user.click(screen.getByRole('button', { name: 'Delete #DRV-3' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete driver' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Delete driver' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/delivery-driver/3'))).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refetches list and summary on realtime driver events', async () => {
    render(<DeliveryDriversView />);
    await screen.findByTestId('driver-row-1');
    const before = listCalls().length;
    realtime.handlers?.onDriverStatusChanged?.();
    await waitFor(() => expect(listCalls().length).toBe(before + 1));
  });

  it('shows the loading skeleton, then the error state with retry', async () => {
    let fail = true;
    listResponse = () =>
      fail
        ? jsonResponse({ statusCode: 500, message: 'Database unavailable' }, 500)
        : jsonResponse({ data: DRIVERS, pagination: { total: 4, page: 1, limit: 25, totalPages: 1 } });
    const user = userEvent.setup();
    render(<DeliveryDriversView />);
    expect(screen.getByTestId('drivers-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('drivers-error')).toHaveTextContent('Database unavailable');
    fail = false;
    await user.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(await screen.findByTestId('driver-row-1')).toBeInTheDocument();
  });

  it('shows the empty state when the merchant has no drivers', async () => {
    listResponse = () => jsonResponse({ data: [], pagination: { total: 0, page: 1, limit: 25, totalPages: 0 } });
    render(<DeliveryDriversView />);
    expect(await screen.findByTestId('drivers-empty-state')).toHaveTextContent('No drivers yet');
  });
});
