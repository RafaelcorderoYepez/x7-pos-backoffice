// Reglas del directorio de contratos: vigencia, aviso de caducidad, retribución legible y
// las dos guardas que el formulario tiene que demostrar (orden de fechas y solape de
// contratos activos).
//
// Vive fuera de la vista para poder probarse sin montar React, y toma `now` por parámetro
// en todo lo que depende de la fecha: un test que dependa del reloj de la máquina falla
// solo el día que cruza un umbral.

import type {
  CollaboratorContract,
  ContractRevision,
  ContractStatus,
  EmploymentType,
  PayFrequency,
} from '../types/contract';
import {
  CONTRACT_STATUS_BADGE_STYLES,
  CONTRACT_STATUS_LABELS,
  PAY_FREQUENCY_SUFFIXES,
  employmentTypeLabel,
  normalizeEmploymentType,
  normalizePayFrequency,
  payFrequencyLabel,
} from '../types/contract';

// ================= Referencias visibles =================

export const contractRef = (id: number): string => `#CTR-${id}`;
export const contractCollaboratorRef = (collaboratorId: number): string =>
  `#CLB-${collaboratorId}`;

// ================= Fechas =================

// Umbral de la alerta ámbar: por debajo de esto el contrato entra en renovación.
export const EXPIRY_WARNING_DAYS = 30;

// Ventanas que ofrece el selector de caducidad.
export const EXPIRY_WINDOWS = [30, 60, 90] as const;

/** Recorta un ISO a su parte de día. La API sirve `date`, pero un timestamp no rompe nada. */
export const toDateOnly = (value?: string | null): string =>
  (value ?? '').slice(0, 10);

/**
 * Hoy en el calendario del usuario.
 *
 * Se compone de las partes locales en lugar de `toISOString()`: en husos negativos ese
 * atajo devuelve el día siguiente a partir de media tarde y adelantaría las caducidades.
 */
export const todayIso = (now: Date = new Date()): string => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDay = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
};

/** Días de calendario entre dos días ISO. Negativo si el segundo ya pasó. */
export const daysBetween = (fromIso: string, toIso: string): number => {
  const from = parseDay(fromIso);
  const to = parseDay(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN;
  return Math.round((to - from) / 86_400_000);
};

/** Días que le quedan al contrato. `null` cuando es indefinido. */
export const daysUntilExpiry = (
  contract: Pick<CollaboratorContract, 'end_date'>,
  now: Date = new Date(),
): number | null => {
  const end = toDateOnly(contract.end_date);
  if (!end) return null;
  const days = daysBetween(todayIso(now), end);
  return Number.isNaN(days) ? null : days;
};

// ================= Estado de cumplimiento =================

/**
 * Estado real del acuerdo.
 *
 * `active` en la base sólo dice que nadie lo ha rescindido; la caducidad la marca la fecha.
 * Por eso un contrato marcado como activo cuya fecha de fin ya pasó sale como `expired` y
 * no como vigente: es justo la fila sobre la que Legal tiene que actuar.
 */
export const contractStatus = (
  contract: Pick<CollaboratorContract, 'active' | 'end_date'>,
  now: Date = new Date(),
): ContractStatus => {
  if (!contract.active) return 'terminated';
  const days = daysUntilExpiry(contract, now);
  if (days === null) return 'active';
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARNING_DAYS) return 'pending_renewal';
  return 'active';
};

export const contractStatusLabel = (
  contract: Pick<CollaboratorContract, 'active' | 'end_date'>,
  now: Date = new Date(),
): string => CONTRACT_STATUS_LABELS[contractStatus(contract, now)];

export const contractStatusBadgeStyle = (
  contract: Pick<CollaboratorContract, 'active' | 'end_date'>,
  now: Date = new Date(),
): string => CONTRACT_STATUS_BADGE_STYLES[contractStatus(contract, now)];

/** Texto del aviso bajo la píldora: cuánto queda o cuánto hace que venció. */
export const expiryNotice = (
  contract: Pick<CollaboratorContract, 'active' | 'end_date'>,
  now: Date = new Date(),
): string => {
  if (!contract.active) return 'Agreement terminated';
  const days = daysUntilExpiry(contract, now);
  if (days === null) return 'No expiration date';
  if (days < 0) {
    const overdue = Math.abs(days);
    return `Expired ${overdue} ${overdue === 1 ? 'day' : 'days'} ago`;
  }
  if (days === 0) return 'Expires today';
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
};

// ================= Presentación =================

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatMoney = (amount: number): string =>
  currency.format(Number.isFinite(amount) ? amount : 0);

/** La retribución tal y como se lee en la parrilla: "$22.50 / hr", "$3,500.00 / month". */
export const formatCompensation = (
  contract: Pick<CollaboratorContract, 'wage_rate' | 'pay_frequency'>,
): string =>
  `${formatMoney(Number(contract.wage_rate ?? 0))} / ${
    PAY_FREQUENCY_SUFFIXES[normalizePayFrequency(contract.pay_frequency)]
  }`;

export const formatWeeklyHours = (hours: number): string =>
  `${Number(hours ?? 0).toFixed(hours % 1 === 0 ? 0 : 1)} hrs / week`;

/** Un día ISO en formato legible. Los contratos abiertos se anuncian como indefinidos. */
export const formatContractDate = (value?: string | null): string => {
  const iso = toDateOnly(value);
  if (!iso) return 'Indefinite';
  const ms = parseDay(iso);
  if (Number.isNaN(ms)) return 'Indefinite';
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
};

export const formatValidityPeriod = (
  contract: Pick<CollaboratorContract, 'start_date' | 'end_date'>,
): string =>
  `${formatContractDate(contract.start_date)} → ${formatContractDate(contract.end_date)}`;

export const contractCollaboratorName = (contract: CollaboratorContract): string =>
  contract.collaborator?.name?.trim() ||
  `Collaborator ${contractCollaboratorRef(contract.collaborator_id)}`;

// ================= Búsqueda y filtros =================

// Los tres ejes que pide la historia: nombre, #CTR-id y #CLB-collaborator_id. Se indexan
// también los ids pelados para que teclear "12" encuentre a #CTR-12 sin el prefijo.
export const contractHaystack = (contract: CollaboratorContract): string =>
  [
    contract.collaborator?.name ?? '',
    contract.collaborator?.role ?? '',
    contractRef(contract.id),
    String(contract.id),
    contractCollaboratorRef(contract.collaborator_id),
    String(contract.collaborator_id),
  ]
    .join(' ')
    .toLowerCase();

export const matchesContractSearch = (
  contract: CollaboratorContract,
  term: string,
): boolean => {
  const value = term.trim().toLowerCase();
  if (!value) return true;
  return contractHaystack(contract).includes(value);
};

export interface ContractFilters {
  search: string;
  employmentType: string;
  status: string;
  expiringWithin: string;
}

// El estado arranca en ACTIVE, como pide la historia: el directorio se abre sobre los
// acuerdos en vigor y el resto se pide a propósito.
export const DEFAULT_CONTRACT_FILTERS: ContractFilters = {
  search: '',
  employmentType: '',
  status: 'active',
  expiringWithin: '',
};

/**
 * "Active" agrupa todo lo que sigue en vigor, próximo a vencer incluido.
 *
 * Si excluyera a los que caducan pronto, el filtro por defecto escondería justamente las
 * filas que hay que renovar. La píldora ámbar los distingue dentro de la lista, y quien
 * quiera verlos solos elige "Expiring Soon".
 */
export const matchesStatusFilter = (
  status: ContractStatus,
  filter: string,
): boolean => {
  if (!filter) return true;
  if (filter === 'active') return status === 'active' || status === 'pending_renewal';
  return status === filter;
};

export const matchesExpiryWindow = (
  contract: Pick<CollaboratorContract, 'end_date'>,
  windowDays: string,
  now: Date = new Date(),
): boolean => {
  if (!windowDays) return true;
  const limit = Number(windowDays);
  if (!Number.isFinite(limit)) return true;
  const days = daysUntilExpiry(contract, now);
  if (days === null) return false;
  return days >= 0 && days <= limit;
};

export const filterContracts = (
  contracts: CollaboratorContract[],
  filters: ContractFilters,
  now: Date = new Date(),
): CollaboratorContract[] =>
  contracts.filter((c) => {
    if (!matchesContractSearch(c, filters.search)) return false;
    if (
      filters.employmentType &&
      normalizeEmploymentType(c.employment_type) !== filters.employmentType
    ) {
      return false;
    }
    if (!matchesStatusFilter(contractStatus(c, now), filters.status)) return false;
    if (!matchesExpiryWindow(c, filters.expiringWithin, now)) return false;
    return true;
  });

// El estado por defecto no cuenta como filtro activo: el botón de limpiar sólo aparece
// cuando el usuario ha estrechado la vista a mano.
export const hasActiveFilters = (filters: ContractFilters): boolean =>
  filters.search.trim().length > 0 ||
  filters.employmentType.length > 0 ||
  filters.expiringWithin.length > 0 ||
  filters.status !== DEFAULT_CONTRACT_FILTERS.status;

// ================= Guardas del formulario =================

export const DATE_SEQUENCE_ERROR =
  'Contract End Date must be later than Start Date.';

/** El fin tiene que ser posterior al inicio; iguales tampoco valen (contrato de cero días). */
export const dateRangeError = (
  startDate: string,
  endDate?: string | null,
): string => {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  if (!start || !end) return '';
  const days = daysBetween(start, end);
  if (Number.isNaN(days)) return '';
  return days <= 0 ? DATE_SEQUENCE_ERROR : '';
};

/**
 * Contrato que impediría abrir otro para el mismo colaborador.
 *
 * Sólo estorba el que sigue en vigor. Uno rescindido o ya caducado no bloquea: la
 * renovación es precisamente el caso en el que RR. HH. necesita registrar el siguiente.
 */
export const blockingActiveContract = (
  contracts: CollaboratorContract[],
  collaboratorId: number,
  excludeContractId: number | null = null,
  now: Date = new Date(),
): CollaboratorContract | null =>
  contracts.find((c) => {
    if (c.collaborator_id !== collaboratorId) return false;
    if (excludeContractId != null && c.id === excludeContractId) return false;
    const status = contractStatus(c, now);
    return status === 'active' || status === 'pending_renewal';
  }) ?? null;

export const overlapWarning = (contract: CollaboratorContract): string =>
  `${contractCollaboratorName(contract)} already has an active agreement (${contractRef(
    contract.id,
  )}, valid until ${formatContractDate(contract.end_date)}). Terminate it or wait for it to expire before registering a new one.`;

/** Traduce el 409 del backend al aviso que nombra el contrato concreto. */
export const conflictMessageFor = (
  contracts: CollaboratorContract[],
  collaboratorId: number,
  fallback?: string,
  now: Date = new Date(),
): string => {
  const blocking = blockingActiveContract(contracts, collaboratorId, null, now);
  if (blocking) return overlapWarning(blocking);
  return (
    fallback ||
    'This collaborator already has an active contract. Terminate it before registering a new one.'
  );
};

export const wageRateError = (raw: string): string => {
  if (raw.trim().length === 0) return 'Wage rate is required.';
  const value = Number(raw);
  if (!Number.isFinite(value)) return 'Wage rate must be a number.';
  if (value < 0) return 'Wage rate cannot be negative.';
  return '';
};

export const MAX_WEEKLY_HOURS = 168;

export const weeklyHoursError = (raw: string): string => {
  if (raw.trim().length === 0) return 'Working hours per week is required.';
  const value = Number(raw);
  if (!Number.isFinite(value)) return 'Working hours must be a number.';
  if (value <= 0) return 'Working hours must be greater than zero.';
  if (value > MAX_WEEKLY_HOURS)
    return `Working hours cannot exceed ${MAX_WEEKLY_HOURS} per week.`;
  return '';
};

// ================= Documento firmado =================

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx'];

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Valida el adjunto antes de gastar una subida que el backend rechazaría igual. */
export const documentError = (
  file: Pick<File, 'name' | 'size' | 'type'>,
): string => {
  const name = (file.name ?? '').toLowerCase();
  const extensionOk = ALLOWED_DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext));
  const mimeOk = ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type);
  if (!extensionOk && !mimeOk) {
    return 'The signed contract must be a PDF or Word document.';
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return 'The signed contract must be 10MB or smaller.';
  }
  return '';
};

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Sólo un PDF se puede incrustar; un .docx se ofrece para descargar. */
export const isPreviewableDocument = (url?: string | null): boolean =>
  (url ?? '').toLowerCase().split('?')[0].endsWith('.pdf');

// ================= Bitácora de enmiendas =================

const REVISION_FIELD_LABELS: Record<string, string> = {
  employment_type: 'Contract type',
  contract_type: 'Payroll model',
  pay_frequency: 'Pay frequency',
  base_salary: 'Base salary',
  hourly_rate: 'Hourly rate',
  working_hours_per_week: 'Weekly hours',
  overtime_multiplier: 'Overtime multiplier',
  double_overtime_multiplier: 'Double overtime multiplier',
  tips_included_in_payroll: 'Tips in payroll',
  active: 'Agreement status',
  start_date: 'Start date',
  end_date: 'End date',
  document_url: 'Signed document',
};

export const revisionFieldLabel = (field: string): string =>
  REVISION_FIELD_LABELS[field] ??
  field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Pinta el valor guardado con el vocabulario de su campo, no como cadena cruda. */
export const formatRevisionValue = (
  field: string,
  value: string | null,
): string => {
  if (value === null || value === '') return '—';
  switch (field) {
    case 'employment_type':
      return employmentTypeLabel(value);
    case 'pay_frequency':
      return payFrequencyLabel(value);
    case 'base_salary':
    case 'hourly_rate':
      return formatMoney(Number(value));
    case 'start_date':
    case 'end_date':
      return formatContractDate(value);
    case 'active':
      return value === 'true' ? 'Active' : 'Terminated';
    case 'tips_included_in_payroll':
      return value === 'true' ? 'Included' : 'Excluded';
    case 'document_url':
      return 'Document attached';
    default:
      return value;
  }
};

export const formatRevisionTimestamp = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Resume una enmienda en una línea: "Hourly rate · $22.50 → $25.00". */
export const describeRevision = (revision: ContractRevision): string =>
  `${revisionFieldLabel(revision.field)} · ${formatRevisionValue(
    revision.field,
    revision.previous_value,
  )} → ${formatRevisionValue(revision.field, revision.new_value)}`;

// ================= Composición del alta =================

/** Opciones del selector de colaborador, marcando quién ya tiene un acuerdo en vigor. */
export interface CollaboratorOption {
  id: number;
  name: string;
  role: string;
  blocked: boolean;
}

export const collaboratorOptions = (
  collaborators: Array<{ id: number; name: string; role: string }>,
  contracts: CollaboratorContract[],
  excludeContractId: number | null = null,
  now: Date = new Date(),
): CollaboratorOption[] =>
  collaborators.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    blocked:
      blockingActiveContract(contracts, c.id, excludeContractId, now) !== null,
  }));

export type { EmploymentType, PayFrequency };
