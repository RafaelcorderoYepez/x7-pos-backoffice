import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { TimeEntriesView } from './TimeEntriesView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// Fixed clock: shift state depends on current time, so test runs against constant timestamp.
const NOW = new Date(2026, 7, 30, 14, 0, 0);
const at = (day: number, h: number, m = 0): string =>
  new Date(2026, 7, day, h, m, 0).toISOString();

const COLLABORATORS = [
  { id: 4, user_id: 9, merchant_id: 3, name: 'Juan Perez', role: 'waiter', status: 'active' },
  { id: 5, user_id: 10, merchant_id: 3, name: 'Ana Rivas', role: 'cook', status: 'active' },
];

const ENTRIES = [
  {
    id: 101,
    company_id: 1,
    merchant_id: 3,
    collaborator_id: 4,
    shift_id: 7,
    clock_in: at(30, 8, 3),
    clock_out: at(30, 16),
    break_minutes: 45,
    adjustment_reason: null,
    is_edited: false,
    edited_by_user_id: null,
    edited_at: null,
    regular_hours: 7.25,
    overtime_hours: 0,
    double_overtime_hours: 0,
    approved: false,
    created_at: at(30, 8),
    collaborator: { id: 4, name: 'Juan Perez', role: 'waiter' },
    shift: { id: 7, role: 'waiter', startTime: at(30, 8), endTime: at(30, 16) },
  },
  {
    // Open shift for the day: in progress.
    id: 102,
    company_id: 1,
    merchant_id: 3,
    collaborator_id: 5,
    shift_id: null,
    clock_in: at(30, 9),
    clock_out: null,
    break_minutes: 0,
    adjustment_reason: null,
    is_edited: false,
    edited_by_user_id: null,
    edited_at: null,
    regular_hours: 0,
    overtime_hours: 0,
    double_overtime_hours: 0,
    approved: false,
    created_at: at(30, 9),
    collaborator: { id: 5, name: 'Ana Rivas', role: 'cook' },
    shift: null,
  },
  {
    // Clocked in 20 min late; row was corrected by supervisor.
    id: 103,
    company_id: 1,
    merchant_id: 3,
    collaborator_id: 4,
    shift_id: 7,
    clock_in: at(29, 8, 20),
    clock_out: at(29, 16),
    break_minutes: 0,
    adjustment_reason: 'Forgot Badge',
    is_edited: true,
    edited_by_user_id: 7,
    edited_at: at(29, 18),
    regular_hours: 7.67,
    overtime_hours: 0,
    double_overtime_hours: 0,
    approved: false,
    created_at: at(29, 8),
    collaborator: { id: 4, name: 'Juan Perez', role: 'waiter' },
    shift: { id: 7, role: 'waiter', startTime: at(29, 8), endTime: at(29, 16) },
  },
];

const REVISIONS = [
  {
    id: 1,
    time_entry_id: 103,
    edited_by_user_id: 7,
    adjustment_reason: 'Forgot Badge',
    previous_clock_in: at(29, 9),
    previous_clock_out: at(29, 16),
    previous_break_minutes: 30,
    new_clock_in: at(29, 8, 20),
    new_clock_out: at(29, 16),
    new_break_minutes: 0,
    created_at: at(29, 18),
  },
];

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

interface Overrides {
  entries?: unknown[];
  createStatus?: number;
  createBody?: unknown;
  revisionsStatus?: number;
}

function backend({ entries = ENTRIES, createStatus = 201, createBody, revisionsStatus = 200 }: Overrides = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes('/revisions')) {
      return revisionsStatus === 200
        ? jsonRes({ data: REVISIONS })
        : jsonRes({ message: 'Time entry not found' }, revisionsStatus);
    }
    if (url.includes('/collaborator-time-entries')) {
      if (method === 'POST') return jsonRes(createBody ?? { data: { id: 999 } }, createStatus);
      if (method === 'PUT') return jsonRes({ data: { id: 103 } });
      return jsonRes({ data: entries });
    }
    if (url.includes('/collaborators')) return jsonRes({ data: COLLABORATORS });
    return jsonRes({ data: [] });
  });
}

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

function callsTo(method: string, fragment: string) {
  return fetchMock()
    .mock.calls.filter(
      ([url, init]) =>
        String(url).includes(fragment) && (init as RequestInit | undefined)?.method === method,
    )
    .map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String((init as RequestInit).body ?? '{}')),
    }));
}

async function renderView(over: Overrides = {}) {
  vi.stubGlobal('fetch', backend(over));
  render(<TimeEntriesView merchantId={3} />);
  await screen.findByText('#TME-101');
}

describe('TimeEntriesView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.stubGlobal('fetch', backend());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('parrilla', () => {
    it('renders empty state when no time entries exist', async () => {
      vi.stubGlobal('fetch', backend({ entries: [] }));
      render(<TimeEntriesView merchantId={3} />);

      expect(await screen.findByTestId('time-entries-empty-state')).toHaveTextContent(
        'No time entries recorded.',
      );
    });

    it('pinta la marca real junto a la programada', async () => {
      await renderView();

      expect(screen.getByTestId('entry-in-101')).toHaveTextContent('08:03 AM');
      // Otra fila tiene el mismo turno programado: hay que mirar dentro de ESTA.
      const row = screen.getByText('#TME-101').closest('tr') as HTMLElement;
      expect(within(row).getByText('sched 08:00 AM')).toBeInTheDocument();
    });

    it('calcula las horas netas descontando el descanso', async () => {
      await renderView();

      // 08:03→16:00 son 7,95 h; menos 45 min de descanso = 7,20.
      expect(screen.getByTestId('entry-net-101')).toHaveTextContent('7.20 hrs');
    });

    it('marks shift without clock-out as in progress', async () => {
      await renderView();

      expect(screen.getByTestId('entry-in-progress-102')).toHaveTextContent('In Progress');
      expect(screen.getByTestId('entry-status-102')).toHaveTextContent('In Progress');
      expect(screen.getByTestId('entry-status-102').className).toContain('blue');
    });

    it('marks late arrival outside grace period', async () => {
      await renderView();

      expect(screen.getByTestId('entry-status-103')).toHaveTextContent('Tardy');
      expect(screen.getByText('+20m Late')).toBeInTheDocument();
    });

    it('un retraso dentro del margen sigue siendo puntual', async () => {
      await renderView();

      // 08:03 with 08:00 shift is within 5 min grace window.
      expect(screen.getByTestId('entry-status-101')).toHaveTextContent('On Time');
    });

    it('flags rows corrected by supervisor', async () => {
      await renderView();

      expect(screen.getByTestId('entry-edited-103')).toHaveTextContent('Adjusted');
      expect(screen.queryByTestId('entry-edited-101')).not.toBeInTheDocument();
    });

    it('counts how many staff members remain clocked in', async () => {
      await renderView();

      expect(screen.getByTestId('on-duty-counter')).toHaveTextContent('1 on duty now');
    });
  });

  describe('filtros', () => {
    it('starts in current week', async () => {
      await renderView();

      // 30 de agosto de 2026 es domingo: la semana va del lunes 24 al domingo 30.
      expect(screen.getByLabelText('From date')).toHaveValue('2026-08-24');
      expect(screen.getByLabelText('To date')).toHaveValue('2026-08-30');
    });

    it('filters by shift status', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.selectOptions(screen.getByLabelText('Filter by punch status'), 'tardy');

      expect(screen.getByText('#TME-103')).toBeInTheDocument();
      expect(screen.queryByText('#TME-101')).not.toBeInTheDocument();
    });

    it('filtra por rol', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.selectOptions(screen.getByLabelText('Filter by role'), 'cook');

      expect(screen.getByText('#TME-102')).toBeInTheDocument();
      expect(screen.queryByText('#TME-101')).not.toBeInTheDocument();
    });

    it('searches by entry reference', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.type(screen.getByLabelText('Search time entries'), '#TME-102');

      await waitFor(() => expect(screen.queryByText('#TME-101')).not.toBeInTheDocument());
      expect(screen.getByText('#TME-102')).toBeInTheDocument();
    });

    it('acota por rango de fechas', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.clear(screen.getByLabelText('From date'));
      await user.type(screen.getByLabelText('From date'), '2026-08-30');

      await waitFor(() => expect(screen.queryByText('#TME-103')).not.toBeInTheDocument());
      expect(screen.getByText('#TME-101')).toBeInTheDocument();
    });
  });

  describe('manual creation', () => {
    // Browser datepicker fills date leaving time `--:--`: field appears filled
    // but value is empty. Starting with complete value preserves time when date changes.
    it('opens with clock-in populated, avoiding half-empty datetime', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Log Manual Time Entry' }));
      const dialog = await screen.findByRole('dialog', { name: /log manual time entry/i });

      const clockIn = within(dialog).getByLabelText(/clock-in/i) as HTMLInputElement;
      expect(clockIn.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(
        within(dialog).queryByText('Clock-in needs both a date and a time.'),
      ).toBeNull();
    });

    it('explains why save is blocked when clock-in lacks time', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Log Manual Time Entry' }));
      const dialog = await screen.findByRole('dialog', { name: /log manual time entry/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /collaborator/i }),
        '4',
      );
      // Incomplete datetime-local returns empty string, same as blank.
      await user.clear(within(dialog).getByLabelText(/clock-in/i));

      expect(
        within(dialog).getByText('Clock-in needs both a date and a time.'),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: /^log time entry$/i }),
      ).toBeDisabled();
      // "In progress" describes an open shift, not a form missing clock-in.
      expect(within(dialog).getByTestId('net-preview')).toHaveTextContent('—');
    });

    it('blocks clock-out before clock-in', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Log Manual Time Entry' }));
      const dialog = await screen.findByRole('dialog', { name: /log manual time entry/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /collaborator/i }),
        '4',
      );
      await user.clear(within(dialog).getByLabelText(/clock-in/i));
      await user.type(within(dialog).getByLabelText(/clock-in/i), '2026-08-31T16:00');
      await user.clear(within(dialog).getByLabelText(/clock-out/i));
      await user.type(within(dialog).getByLabelText(/clock-out/i), '2026-08-31T08:00');

      expect(
        within(dialog).getByText('Clock-Out timestamp must be after Clock-In timestamp.'),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: /^log time entry$/i }),
      ).toBeDisabled();
    });

    it('blocks an interval that overlaps with another shift for same collaborator', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Log Manual Time Entry' }));
      const dialog = await screen.findByRole('dialog', { name: /log manual time entry/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /collaborator/i }),
        '4',
      );
      // Falls within shift 101 (08:03-16:00 on day 30).
      await user.clear(within(dialog).getByLabelText(/clock-in/i));
      await user.type(within(dialog).getByLabelText(/clock-in/i), '2026-08-30T10:00');
      await user.clear(within(dialog).getByLabelText(/clock-out/i));
      await user.type(within(dialog).getByLabelText(/clock-out/i), '2026-08-30T12:00');

      expect(within(dialog).getByText(/overlaps time entry #TME-101/i)).toBeInTheDocument();
    });

    it('displays net hours before saving', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Log Manual Time Entry' }));
      const dialog = await screen.findByRole('dialog', { name: /log manual time entry/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /collaborator/i }),
        '4',
      );
      await user.clear(within(dialog).getByLabelText(/clock-in/i));
      await user.type(within(dialog).getByLabelText(/clock-in/i), '2026-08-31T08:00');
      await user.clear(within(dialog).getByLabelText(/clock-out/i));
      await user.type(within(dialog).getByLabelText(/clock-out/i), '2026-08-31T17:00');
      const breakField = within(dialog).getByLabelText(/unpaid break/i);
      await user.clear(breakField);
      await user.type(breakField, '60');

      expect(within(dialog).getByTestId('net-preview')).toHaveTextContent('8.00 hrs');
    });

    it('submits entry with reason justification', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Log Manual Time Entry' }));
      const dialog = await screen.findByRole('dialog', { name: /log manual time entry/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /collaborator/i }),
        '4',
      );
      await user.clear(within(dialog).getByLabelText(/clock-in/i));
      await user.type(within(dialog).getByLabelText(/clock-in/i), '2026-08-31T08:00');
      await user.clear(within(dialog).getByLabelText(/clock-out/i));
      await user.type(within(dialog).getByLabelText(/clock-out/i), '2026-08-31T16:00');
      await user.selectOptions(
        within(dialog).getByLabelText(/adjustment reason/i),
        'System Outage',
      );
      await user.click(within(dialog).getByRole('button', { name: /^log time entry$/i }));

      await waitFor(() =>
        expect(callsTo('POST', '/collaborator-time-entries')).toHaveLength(1),
      );
      const body = callsTo('POST', '/collaborator-time-entries')[0].body;
      expect(body).toMatchObject({
        collaborator_id: 4,
        merchant_id: 3,
        break_minutes: 0,
        adjustment_reason: 'System Outage',
      });
    });

    it('exige un motivo escrito cuando se elige "otro"', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Log Manual Time Entry' }));
      const dialog = await screen.findByRole('dialog', { name: /log manual time entry/i });
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /collaborator/i }),
        '4',
      );
      await user.clear(within(dialog).getByLabelText(/clock-in/i));
      await user.type(within(dialog).getByLabelText(/clock-in/i), '2026-08-31T08:00');
      await user.selectOptions(
        within(dialog).getByLabelText(/adjustment reason/i),
        '__custom__',
      );

      expect(
        within(dialog).getByRole('button', { name: /^log time entry$/i }),
      ).toBeDisabled();

      await user.type(
        within(dialog).getByLabelText(/custom adjustment reason/i),
        'Reloj averiado',
      );
      expect(
        within(dialog).getByRole('button', { name: /^log time entry$/i }),
      ).toBeEnabled();
    });
  });

  describe('correction', () => {
    it('does not send hours: server recalculates from timestamps', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Adjust punch #TME-101' }));
      const dialog = await screen.findByRole('dialog', { name: /adjust punch/i });
      const breakField = within(dialog).getByLabelText(/unpaid break/i);
      await user.clear(breakField);
      await user.type(breakField, '30');
      await user.click(within(dialog).getByRole('button', { name: /save adjustment/i }));

      await waitFor(() =>
        expect(callsTo('PUT', '/collaborator-time-entries/101')).toHaveLength(1),
      );
      const body = callsTo('PUT', '/collaborator-time-entries/101')[0].body;
      expect(body.break_minutes).toBe(30);
      expect(body.adjustment_reason).toBeTruthy();
      expect(body.regular_hours).toBeUndefined();
      expect(body.overtime_hours).toBeUndefined();
    });

    it('prevents reassigning entry to another collaborator', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Adjust punch #TME-101' }));
      const dialog = await screen.findByRole('dialog', { name: /adjust punch/i });

      expect(within(dialog).getByLabelText(/collaborator/i)).toHaveAttribute('readonly');
    });
  });

  describe('inspector', () => {
    it('breaks down hours and draws timeline', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Inspect time entry #TME-101' }));

      expect(await screen.findByTestId('entry-timeline')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-worked')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-scheduled')).toBeInTheDocument();
      expect(screen.getByTestId('detail-net')).toHaveTextContent('7.20 hrs');
      expect(screen.getByTestId('detail-punch-status')).toHaveTextContent('On Time');
    });

    it('renders corrections history with before and after states', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: 'Inspect time entry #TME-103' }));

      const list = await screen.findByTestId('revision-list');
      expect(list).toHaveTextContent('Forgot Badge');
      // 09:00 con 30 min de descanso ⟹ 08:20 sin descanso.
      expect(list).toHaveTextContent('09:00 AM');
      expect(list).toHaveTextContent('08:20 AM');
    });

    it('explicitly states when an entry was never corrected', async () => {
      const user = userEvent.setup();
      vi.stubGlobal('fetch', backend());
      const original = fetchMock();
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
          String(input).includes('/revisions')
            ? jsonRes({ data: [] })
            : (original as unknown as typeof fetch)(input, init),
        ),
      );
      render(<TimeEntriesView merchantId={3} />);
      await screen.findByText('#TME-101');

      await user.click(screen.getByRole('button', { name: 'Inspect time entry #TME-101' }));

      expect(await screen.findByText(/has never been corrected/i)).toBeInTheDocument();
    });

    it('allows retry if history fetch fails', async () => {
      const user = userEvent.setup();
      await renderView({ revisionsStatus: 500 });

      await user.click(screen.getByRole('button', { name: 'Inspect time entry #TME-101' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Time entry not found');
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe('payroll export', () => {
    it('resume lo que va a exportar antes de descargar', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: /export timesheets/i }));
      const dialog = await screen.findByRole('dialog', { name: /export timesheets/i });

      // Current week includes entries from days 29 and 30.
      expect(within(dialog).getByTestId('export-preview')).toHaveTextContent('2 collaborators');
      expect(within(dialog).getByTestId('export-preview')).toHaveTextContent('3 entries');
    });

    it('clarifies that department does not filter export yet', async () => {
      const user = userEvent.setup();
      await renderView();

      await user.click(screen.getByRole('button', { name: /export timesheets/i }));
      const dialog = await screen.findByRole('dialog', { name: /export timesheets/i });

      expect(
        within(dialog).getByText(/department is not carried by the time entry payload/i),
      ).toBeInTheDocument();
    });

    it('downloads CSV named after date range', async () => {
      const user = userEvent.setup();
      await renderView();
      const createUrl = vi.fn(() => 'blob:mock');
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: createUrl,
        revokeObjectURL: vi.fn(),
      });
      const clicked: string[] = [];
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'a') {
          Object.defineProperty(el, 'click', {
            value: () => clicked.push((el as HTMLAnchorElement).download),
          });
        }
        return el;
      });

      await user.click(screen.getByRole('button', { name: /export timesheets/i }));
      const dialog = await screen.findByRole('dialog', { name: /export timesheets/i });
      await user.click(within(dialog).getByRole('button', { name: /download csv/i }));

      expect(createUrl).toHaveBeenCalled();
      expect(clicked[0]).toBe('timesheet-2026-08-24_2026-08-30.csv');
    });
  });

  describe('HR navigation', () => {
    it('marca el workspace activo y navega a los otros', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      vi.stubGlobal('fetch', backend());
      render(<TimeEntriesView merchantId={3} onNavigate={onNavigate} />);
      await screen.findByText('#TME-101');

      const nav = within(
        screen.getByRole('navigation', { name: /human resources workspace shortcuts/i }),
      );
      expect(nav.getByText('TIME ENTRIES CONTROL')).toHaveAttribute('aria-current', 'page');

      await user.click(nav.getByRole('button', { name: 'COLLABORATORS DATABASE' }));
      expect(onNavigate).toHaveBeenCalledWith('collaborators');
    });
  });
});
