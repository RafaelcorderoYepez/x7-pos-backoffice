import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DeliveryZonesView } from './DeliveryZonesView';
import { circlePolygon } from '../../../../lib/delivery-zones';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// Leaflet does not paint in jsdom: the map is replaced by a double that counts its mounts and leaves
// simulate clicks on the map.
const mapMounts = { count: 0 };
vi.mock('./ZoneMap', async () => {
  const React = await import('react');
  return {
    ZoneMap: (props: {
      ariaLabel: string;
      zones: Array<{ id: number }>;
      onMapClick?: (p: { lat: number; lng: number }) => void;
      onReady?: (h: unknown) => void;
    }) => {
      React.useEffect(() => {
        mapMounts.count += 1;
        props.onReady?.({ center: () => ({ lat: 18.4662, lng: -69.9384 }), focus: () => undefined });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <div data-testid={`map-${props.ariaLabel}`} data-zones={props.zones.map((z) => z.id).join(',')}>
          <button type="button" onClick={() => props.onMapClick?.({ lat: 18.4662, lng: -69.9384 })}>
            click map
          </button>
        </div>
      );
    },
  };
});

const SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [-69.94, 18.45],
      [-69.92, 18.45],
      [-69.92, 18.47],
      [-69.94, 18.47],
      [-69.94, 18.45],
    ],
  ],
};

const ZONES = [
  {
    id: 1, name: 'Centro, Zona Norte', description: 'Downtown blocks', geojson: SQUARE, status: 'active',
    created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:00:00Z', merchant: { id: 3, name: 'prueba1' },
  },
  {
    id: 2, name: 'Sur', description: null, geojson: null, status: 'maintenance',
    created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:00:00Z', merchant: { id: 3, name: 'prueba1' },
  },
];

const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  } as Response);

let createStatus = 201;
let radiusStatus = 200;
let locateData: Record<string, unknown> = {
  lat: 18.46, lng: -69.93, covered: true, zones: [{ id: 1, name: 'Centro, Zona Norte', status: 'active' }], blocked_zones: [],
};

beforeEach(() => {
  calls.length = 0;
  mapMounts.count = 0;
  createStatus = 201;
  radiusStatus = 200;
  locateData = {
    lat: 18.46, lng: -69.93, covered: true, zones: [{ id: 1, name: 'Centro, Zona Norte', status: 'active' }], blocked_zones: [],
  };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });

      if (url.includes('/delivery-zone/coverage')) {
        return jsonResponse({ data: { delivery_orders: 8, matched_orders: 6, coverage_pct: 75 } });
      }
      if (url.includes('/delivery-zone/locate')) {
        return jsonResponse({ data: locateData });
      }
      if (url.includes('/delivery-zone/radius-polygon')) {
        if (radiusStatus >= 400) {
          return jsonResponse({ statusCode: 400, message: 'radius_km must not be greater than 100' }, 400);
        }
        const q = new URL(url, 'http://x').searchParams;
        const geojson = circlePolygon(
          { lat: Number(q.get('lat')), lng: Number(q.get('lng')) },
          Number(q.get('radius_km')),
          Number(q.get('segments') ?? 64),
        );
        return jsonResponse({
          data: { center: { lat: Number(q.get('lat')), lng: Number(q.get('lng')) }, radius_km: Number(q.get('radius_km')), vertex_count: 64, geojson },
        });
      }
      if (url.includes('nominatim.openstreetmap.org')) {
        return jsonResponse([{ display_name: 'Av. Winston Churchill, Santo Domingo', lat: '18.4720', lon: '-69.9400' }]);
      }
      if (method === 'PATCH') {
        return jsonResponse({ data: { ...ZONES[0], ...body, updated_at: '2026-09-30T13:00:00Z' } });
      }
      if (method === 'POST') {
        return createStatus >= 400
          ? jsonResponse({ statusCode: 400, message: 'Invalid geojson: Polygon outer ring is not closed' }, 400)
          : jsonResponse({ data: { id: 3, ...body } }, 201);
      }
      if (url.includes('/delivery-zone?')) {
        return jsonResponse({ data: ZONES, pagination: { total: 2, page: 1, limit: 100, totalPages: 1 } });
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

const gets = () => calls.filter((c) => c.method === 'GET' && c.url.includes('/delivery-zone?'));

describe('DeliveryZonesView', () => {
  it('renders the coverage KPIs', async () => {
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    expect(within(screen.getByTestId('kpi-active-zones')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-coverage')).getByText('75%')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-coverage')).getByText(/6 of 8 delivery orders/)).toBeInTheDocument();
    const unassigned = screen.getByTestId('kpi-unassigned');
    expect(within(unassigned).getByText('1')).toBeInTheDocument();
    expect(within(unassigned).getByText(/No boundary: Sur/)).toBeInTheDocument();
  });

  it('renders the zone header, merchant badge, boundary chip and status pill', async () => {
    render(<DeliveryZonesView />);
    const row = await screen.findByTestId('zone-row-1');
    expect(within(row).getByText('#ZON-1')).toBeInTheDocument();
    expect(within(row).getByText('Centro, Zona Norte')).toBeInTheDocument();
    expect(within(row).getByText('prueba1')).toBeInTheDocument();
    expect(screen.getByTestId('zone-boundary-1')).toHaveTextContent('Polygon defined · 4 vertices');
    expect(screen.getByTestId('zone-boundary-2')).toHaveTextContent('No boundary set');
    expect(screen.getByTestId('zone-status-1')).toHaveClass('bg-[#10b981]');
    expect(screen.getByTestId('zone-status-2')).toHaveClass('bg-[#f59e0b]');
  });

  it('filters instantly without refetching or remounting the map', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    const fetches = gets().length;

    await user.type(screen.getByLabelText('Search zones'), 'downtown');
    expect(screen.queryByTestId('zone-row-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('zone-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('map-Delivery zones map')).toHaveAttribute('data-zones', '1');

    await user.clear(screen.getByLabelText('Search zones'));
    await user.click(screen.getByRole('checkbox', { name: /maintenance/i }));
    expect(screen.queryByTestId('zone-row-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('zone-row-2')).toBeInTheDocument();

    expect(gets().length).toBe(fetches);
    expect(mapMounts.count).toBe(1);
  });

  it('switches a zone status in place with a PATCH', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.selectOptions(screen.getByLabelText('Status of Centro, Zona Norte'), 'inactive');
    await waitFor(() => expect(screen.getByTestId('zone-status-1')).toHaveTextContent('Inactive'));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toMatch(/\/delivery-zone\/1$/);
    expect(patch?.body).toEqual({ status: 'inactive' });
    expect(await screen.findByText(/new orders are blocked/)).toBeInTheDocument();
  });

  it('checks a coordinate pair against the zone polygons', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.type(screen.getByLabelText('Address or coordinates to check'), '18.46, -69.93');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByTestId('lookup-result')).toHaveTextContent('Inside #ZON-1 Centro, Zona Norte');
    expect(calls.some((c) => c.url.includes('/delivery-zone/locate?lat=18.46&lng=-69.93'))).toBe(true);
  });

  it('creates a zone from the radius template as a closed GeoJSON ring', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.click(screen.getByRole('button', { name: /new zone/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByTestId('drawer-merchant')).toHaveTextContent('prueba1');
    await user.type(within(dialog).getByLabelText(/zone name/i), 'Radio 3 km');
    await user.click(within(dialog).getByRole('tab', { name: /radius template/i }));
    await user.click(within(dialog).getByRole('button', { name: /use map center/i }));
    await user.click(within(dialog).getByRole('button', { name: /generate 3 km zone/i }));
    await waitFor(() =>
      expect(within(dialog).getByTestId('boundary-summary')).toHaveTextContent('Polygon defined · 64 vertices'),
    );
    const radiusCall = calls.find((c) => c.url.includes('/delivery-zone/radius-polygon'))!;
    expect(radiusCall.url).toContain('lat=18.4662&lng=-69.9384&radius_km=3&segments=64');

    await user.click(within(dialog).getByRole('button', { name: 'Create zone' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const body = calls.find((c) => c.method === 'POST')!.body!;
    expect(body).toMatchObject({ name: 'Radio 3 km', status: 'active', description: null });
    const ring = (body.geojson as { coordinates: number[][][] }).coordinates[0];
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    expect(body).not.toHaveProperty('merchant');
  });

  it('offers only the map and radius tools (no raw GeoJSON input)', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.click(screen.getByRole('button', { name: /new zone/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('tab')).toHaveLength(2);
    expect(within(dialog).getByRole('tab', { name: /draw on map/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /radius template/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: /raw geojson/i })).toBeNull();
    expect(within(dialog).queryByRole('textbox', { name: /geojson/i })).toBeNull();
  });

  it('draws vertices on the map and blocks saving with fewer than 3', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.click(screen.getByRole('button', { name: /new zone/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/zone name/i), 'Dibujada');
    await user.click(within(dialog).getByRole('button', { name: 'click map' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create zone' }));
    expect(within(dialog).getByText(/at least 3 vertices/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('caps the name and description lengths', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.click(screen.getByRole('button', { name: /new zone/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/zone name/i)).toHaveAttribute('maxLength', '200');
    expect(within(dialog).getByLabelText(/description/i)).toHaveAttribute('maxLength', '500');
  });

  it('shows the server error inside the drawer', async () => {
    createStatus = 400;
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.click(screen.getByRole('button', { name: /new zone/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/zone name/i), 'Otra');
    await user.click(within(dialog).getByRole('button', { name: 'Create zone' }));
    expect(await within(dialog).findByText(/outer ring is not closed/)).toBeInTheDocument();
  });

  it('toggles a zone off in one click and explains that ordering stops immediately', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    expect(screen.getByTestId('zone-status-hint')).toHaveTextContent(/blocks new delivery orders there immediately/);
    const toggle = screen.getByRole('switch', { name: 'Accepting orders in Centro, Zona Norte' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    await waitFor(() => expect(screen.getByTestId('zone-status-1')).toHaveTextContent('Inactive'));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'inactive' });
    expect(screen.getByTestId('zone-switch-1')).toHaveAttribute('aria-checked', 'false');
  });

  it('lists the blocked zones a checked point falls into', async () => {
    locateData = {
      lat: 18.46, lng: -69.93, covered: false, zones: [],
      blocked_zones: [{ id: 2, name: 'Sur', status: 'maintenance' }],
    };
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.type(screen.getByLabelText('Address or coordinates to check'), '18.46, -69.93');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByTestId('lookup-result')).toHaveTextContent('Outside every active delivery zone');
    expect(screen.getByTestId('lookup-blocked')).toHaveTextContent('Inside #ZON-2 Sur (Maintenance) — not accepting orders.');
  });

  it('centres the radius tool on a looked-up address', async () => {
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.click(screen.getByRole('button', { name: /new zone/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('tab', { name: /radius template/i }));
    await user.type(within(dialog).getByLabelText('Center address'), 'Winston Churchill');
    await user.click(within(dialog).getByRole('button', { name: 'Find address' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Center lat')).toHaveValue('18.47200'));
    expect(within(dialog).getByLabelText('Center lng')).toHaveValue('-69.94000');
    expect(within(dialog).getByTestId('radius-address-hit')).toHaveTextContent('Santo Domingo');

    await user.clear(within(dialog).getByLabelText(/radius \(km\)/i));
    await user.type(within(dialog).getByLabelText(/radius \(km\)/i), '2.5');
    await user.click(within(dialog).getByRole('button', { name: /generate 2.5 km zone/i }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes('radius-polygon?lat=18.472&lng=-69.94&radius_km=2.5'))).toBe(true),
    );
  });

  it('shows the server error when the radius polygon cannot be generated', async () => {
    radiusStatus = 400;
    const user = userEvent.setup();
    render(<DeliveryZonesView />);
    await screen.findByTestId('zone-row-1');
    await user.click(screen.getByRole('button', { name: /new zone/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('tab', { name: /radius template/i }));
    await user.click(within(dialog).getByRole('button', { name: 'click map' }));
    await user.click(within(dialog).getByRole('button', { name: /generate 3 km zone/i }));
    expect(await within(dialog).findByTestId('radius-error')).toHaveTextContent('must not be greater than 100');
    expect(within(dialog).getByTestId('boundary-summary')).toHaveTextContent('No boundary set');
  });
});
