import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DeliveryTrackingView } from './DeliveryTrackingView';
import type { LocationUpdatedPayload, DeliveryRealtimeHandlers } from '../../../../lib/delivery-realtime';

vi.mock('../../../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/auth-storage')>()),
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// The socket is replaced by a double that stores the handles for hand firing.
const realtime = vi.hoisted(() => ({ handlers: null as DeliveryRealtimeHandlers | null, closed: 0 }));
vi.mock('../../../../lib/delivery-realtime', () => ({
  connectDeliveryRealtime: (_token: string, handlers: DeliveryRealtimeHandlers) => {
    realtime.handlers = handlers;
    return { close: () => (realtime.closed += 1) };
  },
}));

// Leaflet not painting in jsdom: double minimum registering markers, polylines and panes.
const leaflet = vi.hoisted(() => {
  type LatLng = { lat: number; lng: number };
  const toLatLng = (p: [number, number] | LatLng): LatLng =>
    Array.isArray(p) ? { lat: p[0], lng: p[1] } : p;
  const state = {
    markers: [] as Array<{ latlng: LatLng; html: string; title: string; moves: LatLng[]; removed: boolean; click?: () => void }>,
    polylines: [] as Array<Array<[number, number]>>,
    fits: [] as unknown[],
    views: [] as unknown[],
  };
  const layerGroup = () => ({
    addTo() {
      return this;
    },
    clearLayers: () => undefined,
    removeLayer: (m: { _rec?: { removed: boolean } }) => {
      if (m._rec) m._rec.removed = true;
    },
  });
  const chain = () => ({
    addTo() {
      return this;
    },
    bindTooltip() {
      return this;
    },
  });
  const L = {
    map: () => ({
      setView: (...args: unknown[]) => state.views.push(args),
      fitBounds: (...args: unknown[]) => state.fits.push(args),
      invalidateSize: () => undefined,
      remove: () => undefined,
      on: () => undefined,
    }),
    tileLayer: () => chain(),
    layerGroup,
    divIcon: (opts: { html: string }) => opts,
    marker: (latlng: [number, number], opts: { icon: { html: string }; title: string }) => {
      const rec = { latlng: toLatLng(latlng), html: opts.icon.html, title: opts.title, moves: [] as LatLng[], removed: false, click: undefined as undefined | (() => void) };
      state.markers.push(rec);
      return {
        _rec: rec,
        getLatLng: () => rec.latlng,
        setLatLng: (p: [number, number]) => {
          rec.latlng = toLatLng(p);
          rec.moves.push(rec.latlng);
        },
        setIcon: (icon: { html: string }) => {
          rec.html = icon.html;
        },
        setZIndexOffset: () => undefined,
        bindTooltip() {
          return this;
        },
        on: (event: string, fn: () => void) => {
          if (event === 'click') rec.click = fn;
        },
        addTo() {
          return this;
        },
      };
    },
    polyline: (latlngs: Array<[number, number]>) => {
      state.polylines.push(latlngs);
      return chain();
    },
    polygon: () => chain(),
    circleMarker: () => chain(),
    latLngBounds: (points: unknown[]) => ({ isValid: () => points.length > 0, points }),
    DomEvent: { stopPropagation: () => undefined },
  };
  return { L, state };
});
vi.mock('leaflet', () => ({ default: leaflet.L }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

const LIVE = [
  {
    delivery_assignment_id: 7,
    delivery_status: 'in_transit',
    driver: { id: 2, name: 'Ana Rider', vehicle_type: 'motorcycle' },
    tracking_id: 55,
    lat: 18.4662,
    lng: -69.9384,
    recorded_at: '2026-10-12T12:00:00.000Z',
    seconds_since_update: 5,
    telemetry_status: 'active',
    minutes_since_assigned: 12,
    on_time: true,
  },
  {
    delivery_assignment_id: 9,
    delivery_status: 'picked_up',
    driver: { id: 4, name: 'Bruno Bike', vehicle_type: 'bicycle' },
    tracking_id: 60,
    lat: 18.47,
    lng: -69.93,
    recorded_at: '2026-10-12T11:50:00.000Z',
    seconds_since_update: 240,
    telemetry_status: 'signal_lost',
    minutes_since_assigned: 50,
    on_time: false,
  },
  {
    delivery_assignment_id: 11,
    delivery_status: 'assigned',
    driver: { id: 5, name: 'Carla Car', vehicle_type: 'car' },
    tracking_id: null,
    lat: null,
    lng: null,
    recorded_at: null,
    seconds_since_update: null,
    telemetry_status: 'signal_lost',
    minutes_since_assigned: 3,
    on_time: true,
  },
];

const SUMMARY = {
  live_deliveries: 3,
  active_sessions: 1,
  signal_lost: 2,
  inactive: 0,
  signal_lost_after_seconds: 180,
  on_time_ratio_pct: 67,
  on_time_threshold_minutes: 45,
};

const ROUTE = {
  delivery_assignment_id: 7,
  delivery_status: 'in_transit',
  driver: { id: 2, name: 'Ana Rider' },
  points: [
    { id: 52, lat: 18.4612, lng: -69.9334, recorded_at: '2026-10-12T11:58:00.000Z' },
    { id: 50, lat: 18.4602, lng: -69.9324, recorded_at: '2026-10-12T11:56:00.000Z' },
    { id: 55, lat: 18.4662, lng: -69.9384, recorded_at: '2026-10-12T12:00:00.000Z' },
  ],
  truncated: false,
};

const calls: string[] = [];
let live: unknown[] = LIVE;
let summary: unknown = SUMMARY;
let liveStatus = 200;

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  } as Response);

beforeEach(() => {
  calls.length = 0;
  live = LIVE;
  summary = SUMMARY;
  liveStatus = 200;
  realtime.handlers = null;
  leaflet.state.markers.length = 0;
  leaflet.state.polylines.length = 0;
  leaflet.state.fits.length = 0;
  leaflet.state.views.length = 0;
  window.sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/delivery-tracking/live')) {
        return liveStatus >= 400
          ? jsonResponse({ statusCode: 500, message: 'Tracking service unavailable' }, liveStatus)
          : jsonResponse({ data: live });
      }
      if (url.includes('/delivery-tracking/summary')) return jsonResponse({ data: summary });
      if (url.includes('/delivery-tracking/route/')) return jsonResponse({ data: ROUTE });
      if (url.includes('/delivery-zone?')) {
        return jsonResponse({ data: [], pagination: { total: 0, page: 1, limit: 100, totalPages: 1 } });
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

const liveCalls = () => calls.filter((u) => u.includes('/delivery-tracking/live'));
const markerFor = (asn: number) =>
  leaflet.state.markers.find((m) => !m.removed && m.title.startsWith(`#ASN-${asn} `));

describe('DeliveryTrackingView', () => {
  it('renders the fleet telemetry KPIs', async () => {
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-7');
    expect(within(screen.getByTestId('kpi-active-sessions')).getByText('1')).toBeInTheDocument();
    const lost = screen.getByTestId('kpi-signal-lost');
    expect(within(lost).getByText('2')).toBeInTheDocument();
    expect(lost).toHaveAttribute('data-alert', 'true');
    expect(lost).toHaveAttribute('role', 'alert');
    const onTime = screen.getByTestId('kpi-on-time');
    expect(within(onTime).getByText('67%')).toBeInTheDocument();
    expect(within(onTime).getByText(/45-min/)).toBeInTheDocument();
  });

  it('shows a dash for a null on-time ratio and no alert without lost signals', async () => {
    summary = { ...SUMMARY, signal_lost: 0, on_time_ratio_pct: null };
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-7');
    expect(within(screen.getByTestId('kpi-on-time')).getByText('—')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-signal-lost')).toHaveAttribute('data-alert', 'false');
  });

  it('renders tracking cards with ids, coordinates, status pills and punctuality', async () => {
    render(<DeliveryTrackingView />);
    const card = await screen.findByTestId('tracking-card-7');
    expect(within(card).getByText('#TRK-55')).toBeInTheDocument();
    expect(within(card).getByText('Ana Rider')).toBeInTheDocument();
    expect(within(card).getByText('#ASN-7')).toBeInTheDocument();
    expect(screen.getByTestId('card-coords-7')).toHaveTextContent('18.466200, -69.938400');
    expect(screen.getByTestId('card-updated-7')).toHaveTextContent(/Updated \d+s ago/);
    expect(screen.getByTestId('card-status-7')).toHaveTextContent('Live GPS');
    expect(screen.getByTestId('card-status-9')).toHaveTextContent('Stale telemetry');
    expect(screen.getByTestId('card-ontime-7')).toHaveTextContent('On time');
    expect(screen.getByTestId('card-ontime-9')).toHaveTextContent('Late');
    expect(screen.getByTestId('card-trk-11')).toHaveTextContent('No signal yet');
  });

  it('draws vehicle markers styled by telemetry status', async () => {
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-7');
    const active = markerFor(7)!;
    expect(active.html).toContain('two_wheeler');
    expect(active.html).toContain('#10b981');
    expect(active.html).toContain('animate-ping');
    expect(active.html).toContain('motion-reduce:animate-none');
    const stale = markerFor(9)!;
    expect(stale.html).toContain('pedal_bike');
    expect(stale.html).toContain('#f59e0b');
    expect(stale.html).not.toContain('animate-ping');
    // Without position there is no marker.
    expect(markerFor(11)).toBeUndefined();
  });

  it('sends the telemetry status filter as a query param', async () => {
    const user = userEvent.setup();
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-7');
    expect(liveCalls()[0]).toMatch(/\/delivery-tracking\/live$/);

    await user.click(screen.getByRole('checkbox', { name: /inactive/i }));
    await waitFor(() =>
      expect(liveCalls().at(-1)).toContain('/delivery-tracking/live?telemetry_status=active,signal_lost'),
    );
    await user.click(screen.getByRole('checkbox', { name: /signal lost/i }));
    await waitFor(() => expect(liveCalls().at(-1)).toContain('telemetry_status=active'));
    expect(liveCalls().at(-1)).not.toContain('signal_lost');
  });

  it('focusing a courier fetches its route and draws the breadcrumb polyline in order', async () => {
    const user = userEvent.setup();
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-7');

    await user.selectOptions(screen.getByLabelText('Active courier filter'), 'driver:2');
    await waitFor(() => expect(calls.some((u) => u.endsWith('/delivery-tracking/route/7'))).toBe(true));
    await waitFor(() =>
      expect(leaflet.state.polylines.at(-1)).toEqual([
        [18.4602, -69.9324],
        [18.4612, -69.9334],
        [18.4662, -69.9384],
      ]),
    );
    expect(screen.queryByTestId('tracking-card-9')).not.toBeInTheDocument();
    expect(screen.getByTestId('route-stats')).toHaveTextContent('3 points');
    const fit = leaflet.state.fits.at(-1) as [{ points: unknown[] }];
    expect(fit[0].points).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: /show full fleet/i }));
    expect(await screen.findByTestId('tracking-card-9')).toBeInTheDocument();
    const fleetFit = leaflet.state.fits.at(-1) as [{ points: unknown[] }];
    expect(fleetFit[0].points).toEqual([
      [18.4662, -69.9384],
      [18.47, -69.93],
    ]);
  });

  it('flips a live marker to signal_lost after 180 s without a ping, and red after 6 min', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    live = [{ ...LIVE[0], seconds_since_update: 170 }];
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-7');
    expect(screen.getByTestId('card-status-7')).toHaveTextContent('Live GPS');

    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });
    expect(screen.getByTestId('card-status-7')).toHaveTextContent('Stale telemetry');
    expect(screen.getByTestId('card-status-7')).toHaveAttribute('data-status', 'signal_lost');
    expect(markerFor(7)!.html).toContain('#f59e0b');

    // The 15 s poll returns an age > 6 min: the marker turns red.
    live = [{ ...LIVE[0], seconds_since_update: 400 }];
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    await waitFor(() => expect(markerFor(7)!.html).toContain('#ef4444'));
  });

  it('ticks the relative timestamp every second', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-7');
    const before = Number(/Updated (\d+)s ago/.exec(screen.getByTestId('card-updated-7').textContent ?? '')![1]);
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    const after = Number(/Updated (\d+)s ago/.exec(screen.getByTestId('card-updated-7').textContent ?? '')![1]);
    expect(after - before).toBeGreaterThanOrEqual(3);
    expect(after - before).toBeLessThanOrEqual(4);
  });

  it('moves the marker and updates the card on a realtime location update', async () => {
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-9');
    act(() => realtime.handlers!.onConnectionChange?.(true));
    expect(screen.getByTestId('connection-indicator')).toHaveTextContent('Live');

    const payload: LocationUpdatedPayload = {
      merchantId: 3,
      assignmentId: 9,
      trackingId: 61,
      driverId: 4,
      lat: 18.481234,
      lng: -69.921234,
      recorded_at: new Date().toISOString(),
      status: 'active',
      emittedAt: new Date().toISOString(),
    };
    act(() => realtime.handlers!.onLocationUpdated?.(payload));

    expect(screen.getByTestId('card-coords-9')).toHaveTextContent('18.481234, -69.921234');
    expect(screen.getByTestId('card-trk-9')).toHaveTextContent('#TRK-61');
    expect(screen.getByTestId('card-status-9')).toHaveTextContent('Live GPS');
    expect(screen.getByTestId('card-updated-9')).toHaveTextContent('Updated 0s ago');
    await waitFor(() => expect(markerFor(9)!.moves.at(-1)).toEqual({ lat: 18.481234, lng: -69.921234 }));
    expect(markerFor(9)!.html).toContain('#10b981');
  });

  it('appends realtime points to the focused breadcrumb and refetches on assignment changes', async () => {
    const user = userEvent.setup();
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-7');
    await user.click(screen.getByTestId('tracking-card-7'));
    await waitFor(() => expect(leaflet.state.polylines.at(-1)).toHaveLength(3));

    act(() =>
      realtime.handlers!.onLocationUpdated?.({
        merchantId: 3,
        assignmentId: 7,
        trackingId: 56,
        driverId: 2,
        lat: 18.4672,
        lng: -69.9394,
        recorded_at: '2026-10-12T12:00:05.000Z',
        status: 'active',
        emittedAt: '2026-10-12T12:00:05.000Z',
      }),
    );
    await waitFor(() => expect(leaflet.state.polylines.at(-1)?.at(-1)).toEqual([18.4672, -69.9394]));

    const before = liveCalls().length;
    act(() =>
      realtime.handlers!.onAssignmentChanged?.({
        merchantId: 3,
        assignmentId: 7,
        delivery_status: 'delivered',
        driverId: 2,
        emittedAt: new Date().toISOString(),
      }),
    );
    await waitFor(() => expect(liveCalls().length).toBe(before + 1));
  });

  it('focuses the assignment stored in sessionStorage on mount and clears the key', async () => {
    window.sessionStorage.setItem('delivery-tracking:focus-assignment', '9');
    render(<DeliveryTrackingView />);
    await screen.findByTestId('tracking-card-9');
    expect(window.sessionStorage.getItem('delivery-tracking:focus-assignment')).toBeNull();
    expect(screen.getByLabelText('Active courier filter')).toHaveValue('assignment:9');
    expect(screen.queryByTestId('tracking-card-7')).not.toBeInTheDocument();
    await waitFor(() => expect(calls.some((u) => u.endsWith('/delivery-tracking/route/9'))).toBe(true));
  });

  it('shows the loading skeleton, then the empty state', async () => {
    live = [];
    summary = { ...SUMMARY, live_deliveries: 0, active_sessions: 0, signal_lost: 0, on_time_ratio_pct: null };
    render(<DeliveryTrackingView />);
    expect(screen.getByTestId('tracking-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('tracking-empty-state')).toHaveTextContent(/No courier is out/);
    expect(screen.getByTestId('connection-indicator')).toHaveTextContent('Polling');
  });

  it('shows the error state and retries', async () => {
    liveStatus = 500;
    render(<DeliveryTrackingView />);
    expect(await screen.findByTestId('tracking-error')).toHaveTextContent('Tracking service unavailable');
    liveStatus = 200;
    fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(await screen.findByTestId('tracking-card-7')).toBeInTheDocument();
  });
});
