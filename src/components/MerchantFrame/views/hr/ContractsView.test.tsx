import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ContractsView } from './ContractsView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// Reloj fijo: las píldoras de caducidad se miden contra este día. Sin esto, la fila que hoy
// caduca en 16 días saldría vencida dentro de tres semanas y el test moriría solo.
const NOW = new Date(2026, 5, 15, 10, 0, 0);

const COLLABORATORS = [
  { id: 4, user_id: 9, merchant_id: 3, name: 'Juan Pérez', role: 'waiter', status: 'active' },
  { id: 5, user_id: 10, merchant_id: 3, name: 'Ana Rivas', role: 'cook', status: 'active' },
  { id: 6, user_id: 11, merchant_id: 3, name: 'Luis Soto', role: 'host', status: 'active' },
  { id: 7, user_id: 12, merchant_id: 3, name: 'Marta Gil', role: 'cashier', status: 'active' },
];

const base = {
  company_id: 5,
  merchant_id: 3,
  contract_type: 'hourly' as const,
  overtime_multiplier: 1.5,
  double_overtime_multiplier: 2,
  tips_included_in_payroll: false,
  document_url: null,
  document_name: null,
  created_at: '2026-01-01T09:00:00.000Z',
  updated_at: '2026-01-01T09:00:00.000Z',
};

const CONTRACTS = [
  {
    ...base,
    id: 12,
    collaborator_id: 4,
    employment_type: 'full_time' as const,
    pay_frequency: 'hourly' as const,
    wage_rate: 22.5,
    hourly_rate: 22.5,
    base_salary: 0,
    working_hours_per_week: 40,
    active: true,
    start_date: '2026-01-01',
    end_date: null,
    collaborator: { id: 4, name: 'Juan Pérez', role: 'waiter' },
  },
  {
    ...base,
    id: 13,
    collaborator_id: 5,
    contract_type: 'salary' as const,
    employment_type: 'part_time' as const,
    pay_frequency: 'monthly' as const,
    wage_rate: 3500,
    hourly_rate: 0,
    base_salary: 3500,
    working_hours_per_week: 20,
    active: true,
    start_date: '2026-01-01',
    // Dentro de la ventana de renovación respecto a NOW.
    end_date: '2026-07-01',
    collaborator: { id: 5, name: 'Ana Rivas', role: 'cook' },
  },
  {
    ...base,
    id: 14,
    collaborator_id: 6,
    employment_type: 'temporary' as const,
    pay_frequency: 'hourly' as const,
    wage_rate: 18,
    hourly_rate: 18,
    base_salary: 0,
    working_hours_per_week: 30,
    active: true,
    // Ya vencido: sigue marcado activo en base, que es justo la fila a renovar.
    start_date: '2025-11-01',
    end_date: '2026-05-01',
    document_url: '/uploads/contracts/contract-14.pdf',
    document_name: 'soto-firmado.pdf',
    collaborator: { id: 6, name: 'Luis Soto', role: 'host' },
  },
  {
    ...base,
    id: 15,
    collaborator_id: 7,
    employment_type: 'freelance' as const,
    pay_frequency: 'weekly' as const,
    wage_rate: 600,
    hourly_rate: 0,
    base_salary: 600,
    working_hours_per_week: 15,
    active: false,
    start_date: '2025-01-01',
    end_date: null,
    collaborator: { id: 7, name: 'Marta Gil', role: 'cashier' },
  },
];

const REVISIONS = [
  {
    id: 2,
    contract_id: 12,
    field: 'hourly_rate',
    previous_value: '20',
    new_value: '22.5',
    changed_by_user_id: 9,
    created_at: '2026-03-01T10:00:00.000Z',
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
  contracts?: unknown[];
  createStatus?: number;
  createBody?: unknown;
  revisions?: unknown[];
  revisionsStatus?: number;
  uploadStatus?: number;
}

function backend({
  contracts = CONTRACTS,
  createStatus = 201,
  createBody,
  revisions = REVISIONS,
  revisionsStatus = 200,
  uploadStatus = 200,
}: Overrides = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes('/revisions')) {
      return revisionsStatus === 200
        ? jsonRes({ data: revisions })
        : jsonRes({ message: 'Contract not found' }, revisionsStatus);
    }
    if (url.includes('/document')) {
      return uploadStatus === 200
        ? jsonRes({ data: { id: 99, document_url: '/uploads/contracts/c-99.pdf' } })
        : jsonRes({ message: 'Only PDF or Word documents are accepted' }, uploadStatus);
    }
    if (url.includes('/collaborator-contracts')) {
      if (method === 'POST') return jsonRes(createBody ?? { data: { id: 99 } }, createStatus);
      if (method === 'PUT') return jsonRes({ data: { id: 12 } });
      if (method === 'DELETE') return jsonRes({ data: { id: 12 } });
      return jsonRes({ data: contracts });
    }
    if (url.includes('/collaborators')) return jsonRes({ data: COLLABORATORS });
    if (url.includes('/merchants/')) return jsonRes({ data: { id: 3, company_id: 5 } });
    return jsonRes({ data: [] });
  });
}

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

function callsTo(method: string, fragment: string) {
  return fetchMock().mock.calls.filter(
    ([url, init]) =>
      String(url).includes(fragment) &&
      ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === method,
  );
}

const renderView = async (overrides: Overrides = {}) => {
  globalThis.fetch = backend(overrides) as unknown as typeof fetch;
  render(<ContractsView merchantId={3} />);
  await waitFor(() =>
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument(),
  );
};

// Un input[type=date] no se teclea de forma portable: el orden de los campos depende del
// idioma del navegador. Se fija el valor y se emite el change, que es lo que React escucha.
const fireDate = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });

const rowOf = (ref: string) => screen.getByText(ref).closest('tr') as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe('ContractsView — directory grid', () => {
  it('renders the contract reference, collaborator and role for every visible row', async () => {
    await renderView();

    const row = rowOf('#CTR-12');
    expect(within(row).getByText('Juan Pérez')).toBeInTheDocument();
    expect(within(row).getByText('Waiter')).toBeInTheDocument();
    expect(within(row).getByText('#CLB-4')).toBeInTheDocument();
  });

  it('shows the agreement type pill', async () => {
    await renderView();

    expect(screen.getByTestId('contract-type-12')).toHaveTextContent('Full-Time');
    expect(screen.getByTestId('contract-type-13')).toHaveTextContent('Part-Time');
  });

  it('announces an open-ended agreement as indefinite', async () => {
    await renderView();

    expect(within(rowOf('#CTR-12')).getByText('→ Indefinite')).toBeInTheDocument();
  });

  it('renders the compensation with its pay period', async () => {
    await renderView();

    expect(within(rowOf('#CTR-12')).getByText('$22.50 / hr')).toBeInTheDocument();
    expect(within(rowOf('#CTR-13')).getByText('$3,500.00 / month')).toBeInTheDocument();
  });

  it('flags an agreement inside the renewal window in amber', async () => {
    await renderView();

    const badge = screen.getByTestId('contract-status-13');
    expect(badge).toHaveTextContent('Expiring Soon');
    expect(badge.className).toContain('amber');
    expect(within(rowOf('#CTR-13')).getByText('Expires in 16 days')).toBeInTheDocument();
  });

  it('opens on the agreements in force and hides the rest', async () => {
    await renderView();

    expect(screen.getByText('#CTR-12')).toBeInTheDocument();
    expect(screen.getByText('#CTR-13')).toBeInTheDocument();
    // Vencido y rescindido quedan fuera del filtro por defecto.
    expect(screen.queryByText('#CTR-14')).not.toBeInTheDocument();
    expect(screen.queryByText('#CTR-15')).not.toBeInTheDocument();
  });

  it('marks an overdue agreement in red when asked for it', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.selectOptions(
      screen.getByLabelText('Filter by compliance status'),
      'expired',
    );

    const badge = screen.getByTestId('contract-status-14');
    expect(badge).toHaveTextContent('Expired');
    expect(badge.className).toContain('red');
    expect(within(rowOf('#CTR-14')).getByText('Expired 45 days ago')).toBeInTheDocument();
  });

  it('surfaces terminated agreements on demand', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.selectOptions(
      screen.getByLabelText('Filter by compliance status'),
      'terminated',
    );

    expect(screen.getByTestId('contract-status-15')).toHaveTextContent('Terminated');
  });

  it('shows a dedicated empty state when nothing is registered', async () => {
    await renderView({ contracts: [] });

    expect(screen.getByTestId('contracts-empty-state')).toBeInTheDocument();
  });
});

describe('ContractsView — search and filters', () => {
  it('finds a contract by its document id', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByLabelText('Search contracts'), '#CTR-13');

    expect(screen.getByText('#CTR-13')).toBeInTheDocument();
    expect(screen.queryByText('#CTR-12')).not.toBeInTheDocument();
  });

  it('finds a contract by employee id', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByLabelText('Search contracts'), '#CLB-5');

    expect(screen.getByText('#CTR-13')).toBeInTheDocument();
    expect(screen.queryByText('#CTR-12')).not.toBeInTheDocument();
  });

  it('finds a contract by collaborator name', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByLabelText('Search contracts'), 'ana');

    expect(screen.getByText('#CTR-13')).toBeInTheDocument();
    expect(screen.queryByText('#CTR-12')).not.toBeInTheDocument();
  });

  it('narrows by contract type', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.selectOptions(
      screen.getByLabelText('Filter by contract type'),
      'part_time',
    );

    expect(screen.getByText('#CTR-13')).toBeInTheDocument();
    expect(screen.queryByText('#CTR-12')).not.toBeInTheDocument();
  });

  it('narrows to the agreements expiring inside the chosen window', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.selectOptions(
      screen.getByLabelText('Filter by expiration window'),
      '30',
    );

    // El indefinido no caduca nunca, así que sale de la lista.
    expect(screen.getByText('#CTR-13')).toBeInTheDocument();
    expect(screen.queryByText('#CTR-12')).not.toBeInTheDocument();
  });

  it('explains an empty result and offers to clear the filters', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.type(screen.getByLabelText('Search contracts'), 'zzz');

    expect(screen.getByText('No contracts match your active filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('#CTR-12')).toBeInTheDocument();
  });
});

describe('ContractsView — form drawer', () => {
  const openCreate = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /create new contract/i }));
    return screen.getByRole('dialog');
  };

  it('registers a contract with the terms the form collected', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await openCreate(user);
    await user.selectOptions(within(dialog).getByLabelText(/Collaborator \*/), '6');
    await user.selectOptions(within(dialog).getByLabelText(/Contract type \*/), 'temporary');
    await user.clear(within(dialog).getByLabelText(/Wage rate \*/));
    await user.type(within(dialog).getByLabelText(/Wage rate \*/), '25.5');
    await user.selectOptions(within(dialog).getByLabelText(/Pay frequency \*/), 'weekly');
    await user.clear(within(dialog).getByLabelText(/^Hours \/ week/));
    await user.type(within(dialog).getByLabelText(/^Hours \/ week/), '32');

    await user.click(within(dialog).getByRole('button', { name: 'Register Contract' }));

    await waitFor(() => expect(callsTo('POST', '/collaborator-contracts')).toHaveLength(1));
    const body = JSON.parse(
      (callsTo('POST', '/collaborator-contracts')[0][1] as RequestInit).body as string,
    );
    expect(body).toMatchObject({
      collaborator_id: 6,
      merchant_id: 3,
      company_id: 5,
      employment_type: 'temporary',
      pay_frequency: 'weekly',
      wage_rate: 25.5,
      working_hours_per_week: 32,
      end_date: null,
      active: true,
    });
  });

  it('blocks an end date that is not after the start date', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await openCreate(user);
    await user.selectOptions(within(dialog).getByLabelText(/Collaborator \*/), '6');
    await user.type(within(dialog).getByLabelText(/Wage rate \*/), '20');
    fireDate(within(dialog).getByLabelText(/Start date \*/), '2026-05-01');
    fireDate(within(dialog).getByLabelText('End date', { exact: false }), '2026-04-01');

    expect(
      await within(dialog).findByText('Contract End Date must be later than Start Date.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Register Contract' }),
    ).toBeDisabled();
  });

  // Este es el guard que impide un segundo acuerdo en vigor para la misma persona.
  it('warns before submitting when the collaborator is already under contract', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await openCreate(user);
    await user.selectOptions(within(dialog).getByLabelText(/Collaborator \*/), '4');

    expect(
      await within(dialog).findByText(/already has an active agreement \(#CTR-12/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Register Contract' }),
    ).toBeDisabled();
  });

  it('lets a renewal through once the previous agreement expired', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await openCreate(user);
    // #CTR-14 sigue marcado activo pero venció: no debe estorbar a su renovación.
    await user.selectOptions(within(dialog).getByLabelText(/Collaborator \*/), '6');
    await user.type(within(dialog).getByLabelText(/Wage rate \*/), '20');

    expect(within(dialog).queryByText(/already has an active agreement/)).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Register Contract' }),
    ).toBeEnabled();
  });

  it('rejects a document that is not a PDF or Word file', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await openCreate(user);
    // `accept` filtra el PNG en el diálogo del sistema, así que la única vía real es
    // arrastrarlo: se emite el change directamente sobre el input.
    fireEvent.change(within(dialog).getByLabelText('Signed contract document'), {
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] },
    });

    expect(
      await within(dialog).findByText(
        'The signed contract must be a PDF or Word document.',
      ),
    ).toBeInTheDocument();
  });

  it('uploads the signed document once the contract exists', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await openCreate(user);
    await user.selectOptions(within(dialog).getByLabelText(/Collaborator \*/), '6');
    await user.type(within(dialog).getByLabelText(/Wage rate \*/), '20');
    await user.upload(
      within(dialog).getByLabelText('Signed contract document'),
      new File(['%PDF-1.4'], 'firmado.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Register Contract' }));

    await waitFor(() =>
      expect(callsTo('POST', '/collaborator-contracts/99/document')).toHaveLength(1),
    );
    const init = callsTo('POST', '/document')[0][1] as RequestInit;
    // El boundary lo pone el navegador: fijar Content-Type a mano rompería la subida.
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('translates the backend conflict into the contract that blocks it', async () => {
    const user = userEvent.setup();
    await renderView({
      createStatus: 409,
      createBody: { message: 'Collaborator with ID 6 already has an active contract.' },
    });

    const dialog = await openCreate(user);
    await user.selectOptions(within(dialog).getByLabelText(/Collaborator \*/), '6');
    await user.type(within(dialog).getByLabelText(/Wage rate \*/), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Register Contract' }));

    expect(
      await within(dialog).findByText(
        /already has an active contract|already has an active agreement/,
      ),
    ).toBeInTheDocument();
  });

  it('amends an existing contract with PUT', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: 'Amend contract #CTR-12' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText(/^Hours \/ week/));
    await user.type(within(dialog).getByLabelText(/^Hours \/ week/), '35');
    await user.click(within(dialog).getByRole('button', { name: 'Save Amendment' }));

    await waitFor(() =>
      expect(callsTo('PUT', '/collaborator-contracts/12')).toHaveLength(1),
    );
    const body = JSON.parse(
      (callsTo('PUT', '/collaborator-contracts/12')[0][1] as RequestInit).body as string,
    );
    expect(body.working_hours_per_week).toBe(35);
  });

  it('lets the amendment terminate the agreement', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: 'Amend contract #CTR-12' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText(/Agreement status \*/),
      'terminated',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save Amendment' }));

    await waitFor(() =>
      expect(callsTo('PUT', '/collaborator-contracts/12')).toHaveLength(1),
    );
    const body = JSON.parse(
      (callsTo('PUT', '/collaborator-contracts/12')[0][1] as RequestInit).body as string,
    );
    expect(body.active).toBe(false);
  });
});

describe('ContractsView — inspection drawer', () => {
  const inspect = async (user: ReturnType<typeof userEvent.setup>, ref: string) => {
    await user.click(screen.getByRole('button', { name: `Inspect contract ${ref}` }));
    return screen.getByRole('dialog');
  };

  it('shows the terms summary with the collaborator and the status', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await inspect(user, '#CTR-13');

    expect(within(dialog).getByText('Ana Rivas')).toBeInTheDocument();
    expect(within(dialog).getByTestId('contract-detail-status')).toHaveTextContent(
      'Expiring Soon',
    );
    expect(within(dialog).getByText('$3,500.00 / month')).toBeInTheDocument();
    expect(within(dialog).getByText('20 hrs / week')).toBeInTheDocument();
    expect(within(dialog).getByText('Jul 01, 2026')).toBeInTheDocument();
  });

  it('embeds the signed PDF with download and print controls', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.selectOptions(
      screen.getByLabelText('Filter by compliance status'),
      'expired',
    );
    const dialog = await inspect(user, '#CTR-14');
    await user.click(within(dialog).getByRole('tab', { name: /signed document/i }));

    const frame = within(dialog).getByTestId('contract-document-frame');
    expect(frame).toHaveAttribute('src', '/uploads/contracts/contract-14.pdf');
    expect(within(dialog).getByRole('link', { name: /download/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('says so when no document has been attached', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await inspect(user, '#CTR-12');
    await user.click(within(dialog).getByRole('tab', { name: /signed document/i }));

    expect(
      within(dialog).getByText(/No signed document attached yet/),
    ).toBeInTheDocument();
  });

  it('lists the amendment history', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await inspect(user, '#CTR-12');
    await user.click(within(dialog).getByRole('tab', { name: /amendment history/i }));

    await waitFor(() =>
      expect(within(dialog).getByTestId('contract-revision-2')).toBeInTheDocument(),
    );
    const revision = within(dialog).getByTestId('contract-revision-2');
    expect(within(revision).getByText('Hourly rate')).toBeInTheDocument();
    expect(within(revision).getByText('$20.00')).toBeInTheDocument();
    expect(within(revision).getByText('$22.50')).toBeInTheDocument();
  });

  it('reports an untouched agreement instead of an empty panel', async () => {
    const user = userEvent.setup();
    await renderView({ revisions: [] });

    const dialog = await inspect(user, '#CTR-12');
    await user.click(within(dialog).getByRole('tab', { name: /amendment history/i }));

    expect(
      await within(dialog).findByText(/No amendments recorded/),
    ).toBeInTheDocument();
  });

  it('offers a retry when the history fails to load', async () => {
    const user = userEvent.setup();
    await renderView({ revisionsStatus: 404 });

    const dialog = await inspect(user, '#CTR-12');
    await user.click(within(dialog).getByRole('tab', { name: /amendment history/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Contract not found',
    );
    expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('jumps from inspection straight into the amendment form', async () => {
    const user = userEvent.setup();
    await renderView();

    const dialog = await inspect(user, '#CTR-12');
    await user.click(within(dialog).getByRole('button', { name: /amend contract/i }));

    expect(
      screen.getByRole('button', { name: 'Save Amendment' }),
    ).toBeInTheDocument();
  });
});

describe('ContractsView — deletion and navigation', () => {
  it('deletes a contract after confirmation', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: 'Delete contract #CTR-12' }));
    await user.click(screen.getByRole('button', { name: 'Delete Contract' }));

    await waitFor(() =>
      expect(callsTo('DELETE', '/collaborator-contracts/12')).toHaveLength(1),
    );
    expect(screen.queryByText('#CTR-12')).not.toBeInTheDocument();
  });

  it('keeps the contract when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(screen.getByRole('button', { name: 'Delete contract #CTR-12' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(callsTo('DELETE', '/collaborator-contracts/12')).toHaveLength(0);
    expect(screen.getByText('#CTR-12')).toBeInTheDocument();
  });

  it('routes to the sibling HR workspaces from the shortcut bar', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    globalThis.fetch = backend() as unknown as typeof fetch;
    render(<ContractsView merchantId={3} onNavigate={onNavigate} />);
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /collaborators database/i }));
    expect(onNavigate).toHaveBeenCalledWith('collaborators');

    await user.click(screen.getByRole('button', { name: /time entries control/i }));
    expect(onNavigate).toHaveBeenCalledWith('collaborators-time-entries');
  });
});
