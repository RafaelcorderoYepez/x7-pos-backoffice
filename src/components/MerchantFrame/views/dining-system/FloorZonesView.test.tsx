import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { FloorZonesView } from './FloorZonesView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// El editor real monta un lienzo a pantalla completa: lo sustituimos por un testigo para
// assert that zone jumps to editor without dragging all machinery.
vi.mock('./FloorPlanEditor', () => ({
  FloorPlanEditor: ({ plan, onClose }: { plan: { name: string }; onClose: () => void }) => (
    <div data-testid="floor-plan-editor-stub">
      <span>{plan.name}</span>
      <button type="button" onClick={onClose}>
        close editor
      </button>
    </div>
  ),
}));

const MERCHANT = { id: 3, name: 'prueba1' };

const PLANS = [
  { id: 1, name: 'Main Floor Plan', width: 1000, height: 700, status: 'active', merchant: MERCHANT },
  { id: 2, name: 'Rooftop Terrace', width: 800, height: 600, status: 'active', merchant: MERCHANT },
];

const ZONES = [
  {
    id: 10,
    name: 'Main Dining',
    color: '#2563EB',
    status: 'active',
    merchant: MERCHANT,
    floorPlan: { id: 1, name: 'Main Floor Plan' },
  },
  {
    id: 11,
    name: 'VIP Lounge',
    color: '#D97706',
    status: 'inactive', // legacy -> se normaliza a Draft
    merchant: MERCHANT,
    floorPlan: { id: 1, name: 'Main Floor Plan' },
  },
  {
    id: 12,
    name: 'Terrace',
    color: '#16A34A',
    status: 'active',
    merchant: MERCHANT,
    floorPlan: { id: 2, name: 'Rooftop Terrace' },
  },
];

// Two tables in Main Dining, none in VIP Lounge or Terrace.
const TABLES = [
  { id: 100, number: 'T1', floorZone: { id: 10 }, floorPlan: { id: 1 } },
  { id: 101, number: 'T2', floorZone: { id: 10 }, floorPlan: { id: 1 } },
];

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function defaultFetch(zones: unknown[] = ZONES, tables: unknown[] = TABLES) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/floor-zone')) return jsonRes({ data: zones });
    if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
    if (u.includes('/tables')) return jsonRes({ data: tables });
    return jsonRes({ data: [] });
  });
}

/** Opens creation drawer from toolbar. */
async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Create Floor Zone' }));
  return screen.findByRole('dialog', { name: /create floor zone/i });
}

describe('FloorZonesView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', defaultFetch());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('hydration and grid', () => {
    it('displays literal empty state when there are no zones', async () => {
      vi.stubGlobal('fetch', defaultFetch([]));
      render(<FloorZonesView merchantId={3} />);

      const empty = await screen.findByTestId('floor-zones-empty-state');
      expect(empty).toHaveTextContent(
        "No floor zones configured. Click 'Create Floor Zone' to section your floor plans into operational areas like Main Dining, VIP, or Terrace.",
      );
    });

    it('renders id, name, parent plan, and table count', async () => {
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const grid = within(screen.getByRole('table'));
      expect(grid.getByText('#10')).toBeInTheDocument();
      expect(grid.getAllByRole('button', { name: /main floor plan/i }).length).toBeGreaterThan(0);
      expect(grid.getByText('2 Tables')).toBeInTheDocument();
      // VIP Lounge and Terrace have no tables.
      expect(grid.getAllByText('0 Tables')).toHaveLength(2);
    });

    it('renders swatch with stored color', async () => {
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const swatch = screen.getByTestId('zone-swatch-10');
      expect(swatch).toHaveStyle({ backgroundColor: '#2563EB' });
      expect(screen.getByText('#2563EB')).toBeInTheDocument();
    });

    it('falls back to default color when stored color is invalid', async () => {
      vi.stubGlobal(
        'fetch',
        defaultFetch([{ ...ZONES[0], color: 'javascript:alert(1)' }]),
      );
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      expect(screen.getByTestId('zone-swatch-10')).toHaveStyle({ backgroundColor: '#ae001a' });
    });

    it('normalizes backend legacy states to UI triad', async () => {
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('VIP Lounge');
      // Scoped to grid: status dropdown uses the same labels.
      // 'inactive' del backend se muestra como Draft.
      expect(within(screen.getByRole('table')).getByText('Draft')).toBeInTheDocument();
    });

    it('isolates zones from other merchants', async () => {
      vi.stubGlobal(
        'fetch',
        defaultFetch([...ZONES, { ...ZONES[0], id: 99, name: 'Ajena', merchant: { id: 77 } }]),
      );
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      expect(screen.queryByText('Ajena')).not.toBeInTheDocument();
    });
  });

  describe('search and filters', () => {
    it('searches by zone name', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.type(screen.getByLabelText('Search floor zones'), 'VIP');

      expect(screen.getByText('VIP Lounge')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining')).not.toBeInTheDocument();
    });

    it('searches by parent floor plan name', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.type(screen.getByLabelText('Search floor zones'), 'Rooftop');

      expect(screen.getByText('Terrace')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining')).not.toBeInTheDocument();
    });

    it('filters by parent floor plan', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.selectOptions(screen.getByLabelText('Filter by floor plan'), '2');

      expect(screen.getByText('Terrace')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining')).not.toBeInTheDocument();
    });

    it('filters by status', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.selectOptions(screen.getByLabelText('Filter by status'), 'draft');

      expect(screen.getByText('VIP Lounge')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining')).not.toBeInTheDocument();
    });

    it('offers to clear filters from empty grid', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.type(screen.getByLabelText('Search floor zones'), 'zzz-nada');

      expect(screen.getByText(/no floor zones match your active filters/i)).toBeInTheDocument();
      await user.click(
        within(screen.getByRole('table')).getByRole('button', { name: /clear filters/i }),
      );
      expect(screen.getByText('Main Dining')).toBeInTheDocument();
    });
  });

  describe('creation and validation', () => {
    it('keeps submission disabled without name and without floor plan', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      const submit = within(dialog).getByRole('button', { name: 'Create Floor Zone' });
      expect(submit).toBeDisabled();

      await user.type(within(dialog).getByLabelText(/zone name/i), 'Bar Area');
      expect(submit).toBeDisabled(); // floor plan still missing

      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');
      await waitFor(() => expect(submit).toBeEnabled());
    });

    it('blocks duplicate name in same floor plan with literal message', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.type(within(dialog).getByLabelText(/zone name/i), 'VIP Lounge');
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');

      expect(
        await within(dialog).findByText(
          "A zone named 'VIP Lounge' already exists on 'Main Floor Plan'.",
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Create Floor Zone' })).toBeDisabled();
    });

    it('permits same name in a different floor plan', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.type(within(dialog).getByLabelText(/zone name/i), 'VIP Lounge');
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '2');

      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Create Floor Zone' })).toBeEnabled(),
      );
    });

    it('warns when color is already used by another zone in same plan', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');
      const hexInput = within(dialog).getByLabelText(/zone colour value/i);
      await user.clear(hexInput);
      await user.type(hexInput, '#2563EB');

      expect(
        await within(dialog).findByText(/already uses this colour/i),
      ).toBeInTheDocument();
    });

    it('publishes zone with session merchant', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/floor-zone') && opts?.method === 'POST') {
          return jsonRes({ data: { id: 20 } }, 201);
        }
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        if (u.includes('/tables')) return jsonRes({ data: TABLES });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.type(within(dialog).getByLabelText(/zone name/i), 'Bar Area');
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');
      await user.click(within(dialog).getByRole('button', { name: 'Create Floor Zone' }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/floor-zone'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"merchant":3'),
          }),
        );
      });
      expect(await screen.findByText(/floor zone created successfully/i)).toBeInTheDocument();
    });

    it('displays backend rejection inline without closing drawer', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/floor-zone') && opts?.method === 'POST') {
          return jsonRes({ message: 'Backend rejected the zone' }, 400);
        }
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        if (u.includes('/tables')) return jsonRes({ data: TABLES });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.type(within(dialog).getByLabelText(/zone name/i), 'Bar Area');
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');
      await user.click(within(dialog).getByRole('button', { name: 'Create Floor Zone' }));

      expect(await screen.findByText('Backend rejected the zone')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: /create floor zone/i })).toBeInTheDocument();
    });
  });

  describe('editing and assigned tables guard', () => {
    it('edita con PATCH y sin reasignar el comercio', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/floor-zone/11') && opts?.method === 'PATCH') {
          return jsonRes({ data: { id: 11 } });
        }
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        if (u.includes('/tables')) return jsonRes({ data: TABLES });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('VIP Lounge');
      await user.click(screen.getByRole('button', { name: 'Edit floor zone VIP Lounge' }));

      const dialog = await screen.findByRole('dialog', { name: /edit floor zone/i });
      const nameInput = within(dialog).getByLabelText(/zone name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'VIP Room');
      await user.click(within(dialog).getByRole('button', { name: /save floor zone/i }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          (c) => String(c[0]).includes('/floor-zone/11') && (c[1] as RequestInit)?.method === 'PATCH',
        );
        expect(call).toBeTruthy();
        expect(String((call![1] as RequestInit).body)).not.toContain('merchant');
      });
    });

    it('prevents archiving a zone with assigned tables', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.click(screen.getByRole('button', { name: 'Edit floor zone Main Dining' }));

      const dialog = await screen.findByRole('dialog', { name: /edit floor zone/i });
      await user.selectOptions(within(dialog).getByLabelText(/^status$/i), 'archived');

      expect(
        await within(dialog).findByText(
          'Cannot delete or archive a zone with assigned tables. Reassign tables to another zone or remove them first.',
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /save floor zone/i })).toBeDisabled();
    });

    it('prevents deleting a zone with tables and does not open dialog', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.click(screen.getByRole('button', { name: 'Delete floor zone Main Dining' }));

      expect(
        await screen.findByText(
          'Cannot delete or archive a zone with assigned tables. Reassign tables to another zone or remove them first.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /delete floor zone/i })).not.toBeInTheDocument();
    });

    it('deletes a zone with no tables', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/floor-zone/12') && opts?.method === 'DELETE') {
          return jsonRes({ data: { id: 12 } });
        }
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        if (u.includes('/tables')) return jsonRes({ data: TABLES });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('Terrace');
      await user.click(screen.getByRole('button', { name: 'Delete floor zone Terrace' }));

      const dialog = await screen.findByRole('dialog', { name: /delete floor zone/i });
      await user.click(within(dialog).getByRole('button', { name: /delete zone/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/floor-zone/12'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
      await waitFor(() => expect(screen.queryByText('Terrace')).not.toBeInTheDocument());
    });

    it('blocks deletion when table census is not available', async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string | URL | Request) => {
          const u = String(url);
          if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
          if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
          if (u.includes('/tables')) return jsonRes({ message: 'forbidden' }, 403);
          return jsonRes({ data: [] });
        }),
      );

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('Terrace');
      await user.click(screen.getByRole('button', { name: 'Delete floor zone Terrace' }));

      expect(await screen.findByText(/assignment guard cannot be verified/i)).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /delete floor zone/i })).not.toBeInTheDocument();
    });
  });

  describe('eje del editor en vivo y hub', () => {
    it('opens parent floor plan editor from zone', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.click(screen.getByRole('button', { name: 'Open editor for Main Dining' }));

      const stub = await screen.findByTestId('floor-plan-editor-stub');
      expect(within(stub).getByText('Main Floor Plan')).toBeInTheDocument();
    });

    it('opens editor also from floor plan pill', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Terrace');
      const row = screen.getByText('Terrace').closest('tr')!;
      await user.click(within(row).getByRole('button', { name: /rooftop terrace/i }));

      expect(await screen.findByTestId('floor-plan-editor-stub')).toBeInTheDocument();
    });

    it('renderiza el hub con FLOOR ZONES activo', async () => {
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const hub = within(
        screen.getByRole('navigation', { name: /dining system workspace shortcuts/i }),
      );
      expect(hub.getByText('FLOOR ZONES', { exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(hub.getByRole('button', { name: 'FLOOR PLANS' })).toBeInTheDocument();
    });

    it('navigates to another workspace from hub', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<FloorZonesView merchantId={3} onNavigate={onNavigate} />);

      await screen.findByText('Main Dining');
      const hub = within(
        screen.getByRole('navigation', { name: /dining system workspace shortcuts/i }),
      );
      await user.click(hub.getByRole('button', { name: 'DINING TABLES' }));

      expect(onNavigate).toHaveBeenCalledWith('tables');
    });
  });
});
