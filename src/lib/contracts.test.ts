import { describe, it, expect } from 'vitest';
import type { CollaboratorContract, ContractRevision } from '../types/contract';
import {
  DATE_SEQUENCE_ERROR,
  DEFAULT_CONTRACT_FILTERS,
  EXPIRY_WARNING_DAYS,
  blockingActiveContract,
  collaboratorOptions,
  conflictMessageFor,
  contractRef,
  contractStatus,
  contractStatusLabel,
  daysUntilExpiry,
  dateRangeError,
  describeRevision,
  documentError,
  expiryNotice,
  filterContracts,
  formatCompensation,
  formatContractDate,
  formatFileSize,
  formatRevisionValue,
  formatValidityPeriod,
  formatWeeklyHours,
  hasActiveFilters,
  isPreviewableDocument,
  matchesContractSearch,
  matchesExpiryWindow,
  matchesStatusFilter,
  overlapWarning,
  revisionFieldLabel,
  todayIso,
  wageRateError,
  weeklyHoursError,
} from './contracts';

// Reloj fijo: las reglas de caducidad se miden contra este día, no contra el de la máquina.
const NOW = new Date('2026-06-15T10:00:00');

const contract = (
  overrides: Partial<CollaboratorContract> = {},
): CollaboratorContract => ({
  id: 12,
  company_id: 1,
  merchant_id: 1,
  collaborator_id: 4,
  contract_type: 'hourly',
  employment_type: 'full_time',
  pay_frequency: 'hourly',
  wage_rate: 22.5,
  working_hours_per_week: 40,
  document_url: null,
  document_name: null,
  base_salary: 0,
  hourly_rate: 22.5,
  overtime_multiplier: 1.5,
  double_overtime_multiplier: 2,
  tips_included_in_payroll: false,
  active: true,
  start_date: '2026-01-01',
  end_date: null,
  created_at: '2026-01-01T09:00:00.000Z',
  updated_at: '2026-01-01T09:00:00.000Z',
  collaborator: { id: 4, name: 'Juan Pérez', role: 'waiter' },
  ...overrides,
});

describe('contract references', () => {
  it('prints the document id the grid shows', () => {
    expect(contractRef(12)).toBe('#CTR-12');
  });
});

describe('todayIso', () => {
  // toISOString() en husos negativos devuelve el día siguiente a partir de media tarde y
  // adelantaría un día todas las caducidades.
  it('uses the local calendar day, not UTC', () => {
    expect(todayIso(new Date(2026, 5, 15, 23, 30))).toBe('2026-06-15');
    expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('daysUntilExpiry', () => {
  it('counts calendar days ahead', () => {
    expect(daysUntilExpiry(contract({ end_date: '2026-07-15' }), NOW)).toBe(30);
  });

  it('goes negative once the date has passed', () => {
    expect(daysUntilExpiry(contract({ end_date: '2026-06-10' }), NOW)).toBe(-5);
  });

  it('returns null for an open-ended agreement', () => {
    expect(daysUntilExpiry(contract({ end_date: null }), NOW)).toBeNull();
  });

  it('tolerates a full timestamp', () => {
    expect(
      daysUntilExpiry(contract({ end_date: '2026-06-20T00:00:00.000Z' }), NOW),
    ).toBe(5);
  });
});

describe('contractStatus', () => {
  it('is active for an open-ended agreement', () => {
    expect(contractStatus(contract({ end_date: null }), NOW)).toBe('active');
  });

  it('is active while the end date is comfortably ahead', () => {
    expect(contractStatus(contract({ end_date: '2026-12-31' }), NOW)).toBe('active');
  });

  it('warns inside the renewal window', () => {
    expect(contractStatus(contract({ end_date: '2026-07-01' }), NOW)).toBe(
      'pending_renewal',
    );
  });

  it('warns exactly on the threshold day', () => {
    const end = new Date(NOW);
    end.setDate(end.getDate() + EXPIRY_WARNING_DAYS);
    expect(
      contractStatus(contract({ end_date: todayIso(end) }), NOW),
    ).toBe('pending_renewal');
  });

  it('is expired the day after the end date', () => {
    expect(contractStatus(contract({ end_date: '2026-06-14' }), NOW)).toBe('expired');
  });

  it('still warns on the very last day', () => {
    expect(contractStatus(contract({ end_date: '2026-06-15' }), NOW)).toBe(
      'pending_renewal',
    );
  });

  // Rescindir gana sobre la fecha: da igual que la vigencia siguiera abierta.
  it('reports a terminated agreement regardless of dates', () => {
    expect(
      contractStatus(contract({ active: false, end_date: '2027-01-01' }), NOW),
    ).toBe('terminated');
  });

  it('labels each state for the badge', () => {
    expect(contractStatusLabel(contract({ end_date: '2026-07-01' }), NOW)).toBe(
      'Expiring Soon',
    );
    expect(contractStatusLabel(contract({ end_date: '2026-01-01' }), NOW)).toBe(
      'Expired',
    );
  });
});

describe('expiryNotice', () => {
  it('counts down', () => {
    expect(expiryNotice(contract({ end_date: '2026-06-20' }), NOW)).toBe(
      'Expires in 5 days',
    );
  });

  it('uses the singular for one day', () => {
    expect(expiryNotice(contract({ end_date: '2026-06-16' }), NOW)).toBe(
      'Expires in 1 day',
    );
  });

  it('calls out the last day', () => {
    expect(expiryNotice(contract({ end_date: '2026-06-15' }), NOW)).toBe(
      'Expires today',
    );
  });

  it('counts up once overdue', () => {
    expect(expiryNotice(contract({ end_date: '2026-06-13' }), NOW)).toBe(
      'Expired 2 days ago',
    );
  });

  it('says so when there is no end date', () => {
    expect(expiryNotice(contract({ end_date: null }), NOW)).toBe(
      'No expiration date',
    );
  });

  it('says so when the agreement was terminated', () => {
    expect(expiryNotice(contract({ active: false }), NOW)).toBe(
      'Agreement terminated',
    );
  });
});

describe('presentation', () => {
  it('formats an hourly wage', () => {
    expect(formatCompensation(contract())).toBe('$22.50 / hr');
  });

  it('formats a monthly salary with thousands separators', () => {
    expect(
      formatCompensation(contract({ pay_frequency: 'monthly', wage_rate: 3500 })),
    ).toBe('$3,500.00 / month');
  });

  it('formats biweekly pay', () => {
    expect(
      formatCompensation(contract({ pay_frequency: 'biweekly', wage_rate: 1200 })),
    ).toBe('$1,200.00 / biweekly');
  });

  it('announces an open-ended agreement as indefinite', () => {
    expect(formatContractDate(null)).toBe('Indefinite');
    expect(formatValidityPeriod(contract())).toBe('Jan 01, 2026 → Indefinite');
  });

  it('renders a bounded validity period', () => {
    expect(
      formatValidityPeriod(contract({ end_date: '2026-12-31' })),
    ).toBe('Jan 01, 2026 → Dec 31, 2026');
  });

  it('drops the decimal on whole weekly hours', () => {
    expect(formatWeeklyHours(40)).toBe('40 hrs / week');
    expect(formatWeeklyHours(37.5)).toBe('37.5 hrs / week');
  });
});

describe('search', () => {
  it('matches the collaborator name', () => {
    expect(matchesContractSearch(contract(), 'juan')).toBe(true);
  });

  it('matches the contract document id', () => {
    expect(matchesContractSearch(contract(), '#CTR-12')).toBe(true);
  });

  it('matches the employee id', () => {
    expect(matchesContractSearch(contract(), '#clb-4')).toBe(true);
  });

  it('matches a bare id typed without the prefix', () => {
    expect(matchesContractSearch(contract(), '12')).toBe(true);
  });

  it('rejects an unrelated term', () => {
    expect(matchesContractSearch(contract(), 'zzz')).toBe(false);
  });

  it('matches everything when the box is empty', () => {
    expect(matchesContractSearch(contract(), '   ')).toBe(true);
  });
});

describe('status filter', () => {
  // Si "Active" excluyera los que caducan pronto, el filtro por defecto escondería
  // justamente las filas que hay que renovar.
  it('keeps expiring agreements inside Active', () => {
    expect(matchesStatusFilter('pending_renewal', 'active')).toBe(true);
    expect(matchesStatusFilter('active', 'active')).toBe(true);
  });

  it('excludes expired and terminated from Active', () => {
    expect(matchesStatusFilter('expired', 'active')).toBe(false);
    expect(matchesStatusFilter('terminated', 'active')).toBe(false);
  });

  it('narrows to just the expiring ones when asked', () => {
    expect(matchesStatusFilter('pending_renewal', 'pending_renewal')).toBe(true);
    expect(matchesStatusFilter('active', 'pending_renewal')).toBe(false);
  });

  it('lets everything through with no filter', () => {
    expect(matchesStatusFilter('terminated', '')).toBe(true);
  });
});

describe('expiry window', () => {
  it('keeps a contract inside the window', () => {
    expect(matchesExpiryWindow(contract({ end_date: '2026-07-01' }), '30', NOW)).toBe(
      true,
    );
  });

  it('drops one beyond the window', () => {
    expect(matchesExpiryWindow(contract({ end_date: '2026-09-01' }), '30', NOW)).toBe(
      false,
    );
  });

  it('drops an already expired contract', () => {
    expect(matchesExpiryWindow(contract({ end_date: '2026-06-01' }), '30', NOW)).toBe(
      false,
    );
  });

  it('drops open-ended contracts, which never expire', () => {
    expect(matchesExpiryWindow(contract({ end_date: null }), '60', NOW)).toBe(false);
  });

  it('keeps everything when no window is selected', () => {
    expect(matchesExpiryWindow(contract({ end_date: null }), '', NOW)).toBe(true);
  });
});

describe('filterContracts', () => {
  const roster = [
    contract({ id: 1, collaborator_id: 1, end_date: null }),
    contract({
      id: 2,
      collaborator_id: 2,
      end_date: '2026-07-01',
      collaborator: { id: 2, name: 'Ana Ruiz', role: 'cook' },
    }),
    contract({
      id: 3,
      collaborator_id: 3,
      end_date: '2026-05-01',
      employment_type: 'part_time',
      collaborator: { id: 3, name: 'Luis Soto', role: 'host' },
    }),
    contract({ id: 4, collaborator_id: 4, active: false }),
  ];

  it('opens on the agreements in force', () => {
    const visible = filterContracts(roster, DEFAULT_CONTRACT_FILTERS, NOW);
    expect(visible.map((c) => c.id)).toEqual([1, 2]);
  });

  it('narrows by employment type', () => {
    const visible = filterContracts(
      roster,
      { ...DEFAULT_CONTRACT_FILTERS, status: '', employmentType: 'part_time' },
      NOW,
    );
    expect(visible.map((c) => c.id)).toEqual([3]);
  });

  it('surfaces the expired ones on demand', () => {
    const visible = filterContracts(
      roster,
      { ...DEFAULT_CONTRACT_FILTERS, status: 'expired' },
      NOW,
    );
    expect(visible.map((c) => c.id)).toEqual([3]);
  });

  it('surfaces the terminated ones on demand', () => {
    const visible = filterContracts(
      roster,
      { ...DEFAULT_CONTRACT_FILTERS, status: 'terminated' },
      NOW,
    );
    expect(visible.map((c) => c.id)).toEqual([4]);
  });

  it('combines the expiry window with the search box', () => {
    const visible = filterContracts(
      roster,
      { ...DEFAULT_CONTRACT_FILTERS, expiringWithin: '30', search: 'ana' },
      NOW,
    );
    expect(visible.map((c) => c.id)).toEqual([2]);
  });
});

describe('hasActiveFilters', () => {
  it('ignores the default status so the clear button stays hidden', () => {
    expect(hasActiveFilters(DEFAULT_CONTRACT_FILTERS)).toBe(false);
  });

  it('notices a widened status', () => {
    expect(hasActiveFilters({ ...DEFAULT_CONTRACT_FILTERS, status: '' })).toBe(true);
  });

  it('notices a search term', () => {
    expect(hasActiveFilters({ ...DEFAULT_CONTRACT_FILTERS, search: 'ana' })).toBe(true);
  });

  it('ignores whitespace typed into the search box', () => {
    expect(hasActiveFilters({ ...DEFAULT_CONTRACT_FILTERS, search: '  ' })).toBe(false);
  });
});

describe('date sequence guard', () => {
  it('rejects an end date before the start', () => {
    expect(dateRangeError('2026-05-01', '2026-04-01')).toBe(DATE_SEQUENCE_ERROR);
  });

  it('rejects a zero-day contract', () => {
    expect(dateRangeError('2026-05-01', '2026-05-01')).toBe(DATE_SEQUENCE_ERROR);
  });

  it('accepts a proper range', () => {
    expect(dateRangeError('2026-05-01', '2026-05-02')).toBe('');
  });

  it('accepts an open-ended contract', () => {
    expect(dateRangeError('2026-05-01', null)).toBe('');
    expect(dateRangeError('2026-05-01', '')).toBe('');
  });
});

describe('overlap guard', () => {
  const inForce = contract({ id: 1, collaborator_id: 4, end_date: '2026-12-31' });
  const expired = contract({ id: 2, collaborator_id: 5, end_date: '2026-01-31' });
  const terminated = contract({ id: 3, collaborator_id: 6, active: false });

  it('blocks a second agreement while one is in force', () => {
    expect(blockingActiveContract([inForce], 4, null, NOW)?.id).toBe(1);
  });

  it('blocks when the current one is merely expiring soon', () => {
    const soon = contract({ id: 7, collaborator_id: 4, end_date: '2026-07-01' });
    expect(blockingActiveContract([soon], 4, null, NOW)?.id).toBe(7);
  });

  // La renovación es justo el caso en el que hace falta registrar el siguiente.
  it('lets a renewal through once the previous one expired', () => {
    expect(blockingActiveContract([expired], 5, null, NOW)).toBeNull();
  });

  it('lets a replacement through once the previous one was terminated', () => {
    expect(blockingActiveContract([terminated], 6, null, NOW)).toBeNull();
  });

  it('ignores the contract being amended', () => {
    expect(blockingActiveContract([inForce], 4, 1, NOW)).toBeNull();
  });

  it('ignores contracts of other collaborators', () => {
    expect(blockingActiveContract([inForce], 99, null, NOW)).toBeNull();
  });

  it('names the blocking agreement in the warning', () => {
    expect(overlapWarning(inForce)).toContain('#CTR-1');
    expect(overlapWarning(inForce)).toContain('Juan Pérez');
    expect(overlapWarning(inForce)).toContain('Dec 31, 2026');
  });

  it('translates the backend conflict into the concrete warning', () => {
    expect(conflictMessageFor([inForce], 4, 'Conflict', NOW)).toContain('#CTR-1');
  });

  it('falls back to the backend message when no local match explains it', () => {
    expect(conflictMessageFor([], 4, 'Server said no', NOW)).toBe('Server said no');
  });
});

describe('collaboratorOptions', () => {
  it('marks who already has an agreement in force', () => {
    const options = collaboratorOptions(
      [
        { id: 4, name: 'Juan Pérez', role: 'waiter' },
        { id: 5, name: 'Ana Ruiz', role: 'cook' },
      ],
      [contract({ id: 1, collaborator_id: 4 })],
      null,
      NOW,
    );
    expect(options.find((o) => o.id === 4)?.blocked).toBe(true);
    expect(options.find((o) => o.id === 5)?.blocked).toBe(false);
  });

  it('unblocks the collaborator of the contract being amended', () => {
    const options = collaboratorOptions(
      [{ id: 4, name: 'Juan Pérez', role: 'waiter' }],
      [contract({ id: 1, collaborator_id: 4 })],
      1,
      NOW,
    );
    expect(options[0].blocked).toBe(false);
  });
});

describe('numeric guards', () => {
  it('requires a wage rate', () => {
    expect(wageRateError('')).toBe('Wage rate is required.');
  });

  it('rejects a negative wage', () => {
    expect(wageRateError('-1')).toBe('Wage rate cannot be negative.');
  });

  it('accepts a decimal wage', () => {
    expect(wageRateError('22.50')).toBe('');
  });

  it('rejects zero weekly hours', () => {
    expect(weeklyHoursError('0')).toBe('Working hours must be greater than zero.');
  });

  it('rejects more hours than a week holds', () => {
    expect(weeklyHoursError('200')).toContain('168');
  });

  it('accepts a part-time week', () => {
    expect(weeklyHoursError('20')).toBe('');
  });
});

describe('signed document', () => {
  const file = (
    name: string,
    size: number,
    type = 'application/pdf',
  ): Pick<File, 'name' | 'size' | 'type'> => ({ name, size, type });

  it('accepts a PDF within the limit', () => {
    expect(documentError(file('contrato.pdf', 1024))).toBe('');
  });

  it('accepts a DOCX by extension even with an odd mime type', () => {
    expect(documentError(file('contrato.docx', 1024, 'application/octet-stream'))).toBe(
      '',
    );
  });

  it('rejects an image', () => {
    expect(documentError(file('foto.png', 1024, 'image/png'))).toBe(
      'The signed contract must be a PDF or Word document.',
    );
  });

  it('rejects a file over 10MB', () => {
    expect(documentError(file('contrato.pdf', 11 * 1024 * 1024))).toBe(
      'The signed contract must be 10MB or smaller.',
    );
  });

  it('formats readable sizes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('only embeds PDFs inline', () => {
    expect(isPreviewableDocument('/uploads/contracts/a.pdf')).toBe(true);
    expect(isPreviewableDocument('/uploads/contracts/a.docx')).toBe(false);
    expect(isPreviewableDocument(null)).toBe(false);
  });
});

describe('amendment log', () => {
  const revision = (
    overrides: Partial<ContractRevision> = {},
  ): ContractRevision => ({
    id: 1,
    contract_id: 12,
    field: 'hourly_rate',
    previous_value: '22.5',
    new_value: '25',
    changed_by_user_id: 7,
    created_at: '2026-06-01T10:00:00.000Z',
    ...overrides,
  });

  it('labels the audited fields in plain words', () => {
    expect(revisionFieldLabel('working_hours_per_week')).toBe('Weekly hours');
    expect(revisionFieldLabel('employment_type')).toBe('Contract type');
  });

  it('falls back to a readable label for an unknown field', () => {
    expect(revisionFieldLabel('some_new_column')).toBe('Some New Column');
  });

  it('formats money changes as money', () => {
    expect(formatRevisionValue('hourly_rate', '22.5')).toBe('$22.50');
  });

  it('formats the vocabulary fields with their labels', () => {
    expect(formatRevisionValue('employment_type', 'part_time')).toBe('Part-Time');
    expect(formatRevisionValue('active', 'false')).toBe('Terminated');
  });

  it('renders a missing value as a dash', () => {
    expect(formatRevisionValue('end_date', null)).toBe('—');
  });

  it('summarises an amendment in one line', () => {
    expect(describeRevision(revision())).toBe('Hourly rate · $22.50 → $25.00');
  });
});
