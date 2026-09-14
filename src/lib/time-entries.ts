// Reglas del control de fichajes: horas netas, clasificación de la jornada, guardas del
// formulario y armado del export de nómina.
//
// Todo esto vive fuera de React porque es aritmética con dinero detrás: son las horas que
// se pagan. El backend calcula las suyas al persistir; aquí se recalcula para pintar y para
// exportar, con la MISMA definición (intervalo bruto − descanso no retribuido).

import type { PunchStatus, TimeEntry } from '../types/time-entry';

// ================= Umbrales =================

// Jornada estándar a partir de la cual las horas cuentan como extra. Debe coincidir con
// DAILY_OVERTIME_THRESHOLD_HOURS del backend; el dueño natural del número es el módulo
// merchant-overtime-rule, que aún no está enganchado a los fichajes.
export const DAILY_OVERTIME_THRESHOLD_HOURS = 8;

// Margen de cortesía antes de considerar tarde una entrada. Sin él, fichar a las 08:00:12
// saldría en rojo y la parrilla se volvería inútil de tanto ruido.
export const TARDY_GRACE_MINUTES = 5;

// ================= Referencias visibles =================

export const timeEntryRef = (id: number): string => `#TME-${id}`;
export const collaboratorRefOf = (collaboratorId: number): string => `#CLB-${collaboratorId}`;

// ================= Horas =================

const MS_PER_HOUR = 3_600_000;

/** Horas de reloj entre las dos marcas. Una jornada abierta todavía no mide nada. */
export const rawHours = (entry: Pick<TimeEntry, 'clock_in' | 'clock_out'>): number => {
  if (!entry.clock_out) return 0;
  const start = new Date(entry.clock_in).getTime();
  const end = new Date(entry.clock_out).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return (end - start) / MS_PER_HOUR;
};

/**
 * Horas pagables: el intervalo bruto menos el descanso no retribuido.
 *
 * Nunca baja de cero por mucho descanso que se teclee: un neto negativo no significa nada
 * en una nómina y arrastraría el error hasta el total exportado.
 */
export const netHours = (entry: Pick<TimeEntry, 'clock_in' | 'clock_out' | 'break_minutes'>): number => {
  const raw = rawHours(entry);
  if (raw === 0) return 0;
  const net = raw - Math.max(0, entry.break_minutes ?? 0) / 60;
  return Number(Math.max(0, net).toFixed(2));
};

export const regularHours = (entry: Pick<TimeEntry, 'clock_in' | 'clock_out' | 'break_minutes'>): number =>
  Number(Math.min(netHours(entry), DAILY_OVERTIME_THRESHOLD_HOURS).toFixed(2));

export const overtimeHours = (entry: Pick<TimeEntry, 'clock_in' | 'clock_out' | 'break_minutes'>): number =>
  Number(Math.max(0, netHours(entry) - DAILY_OVERTIME_THRESHOLD_HOURS).toFixed(2));

export const formatHours = (hours: number): string => `${hours.toFixed(2)} hrs`;

export const formatBreak = (minutes: number): string =>
  minutes > 0 ? `${minutes} min` : '—';

// ================= Estado de la jornada =================

/** Minutos de retraso respecto al turno programado. Sin turno no hay con qué comparar. */
export const tardyMinutes = (entry: TimeEntry): number => {
  const scheduled = entry.shift?.startTime;
  if (!scheduled) return 0;
  const start = new Date(scheduled).getTime();
  const actual = new Date(entry.clock_in).getTime();
  if (Number.isNaN(start) || Number.isNaN(actual)) return 0;
  return Math.max(0, Math.round((actual - start) / 60_000));
};

/**
 * Estado de una jornada, en orden de gravedad.
 *
 * `now` se inyecta en vez de leer el reloj dentro: una jornada abierta es normal a media
 * tarde e incidencia al cerrar el día, y esa diferencia hay que poder probarla.
 */
export const classifyEntry = (entry: TimeEntry, now: Date = new Date()): PunchStatus => {
  if (!entry.clock_out) {
    // Sin salida: sigue trabajando mientras sea el mismo día; a partir de ahí, incidencia.
    const startedOn = new Date(entry.clock_in);
    const sameDay =
      startedOn.getFullYear() === now.getFullYear() &&
      startedOn.getMonth() === now.getMonth() &&
      startedOn.getDate() === now.getDate();
    return sameDay ? 'on_duty' : 'missed_punch';
  }
  if (overtimeHours(entry) > 0) return 'overtime';
  if (tardyMinutes(entry) > TARDY_GRACE_MINUTES) return 'tardy';
  return 'on_time';
};

export const isOnDuty = (entry: TimeEntry): boolean => !entry.clock_out;

/** "+15m Late" — el detalle que acompaña al badge ámbar. */
export const tardyLabel = (entry: TimeEntry): string => {
  const late = tardyMinutes(entry);
  return late > TARDY_GRACE_MINUTES ? `+${late}m Late` : '';
};

// ================= Presentación de marcas =================

// Formato de 12 h construido a mano: el separador que ICU mete antes del AM/PM cambia entre
// versiones de Node y esta cadena se compara en los tests.
export const clockTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = d.getHours();
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const entryDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
};

/** Clave YYYY-MM-DD en horario LOCAL: toISOString() desplazaría el día según la zona. */
export const dateKey = (value: Date | string): string => {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ================= Filtros =================

export interface TimeEntryFilters {
  search: string;
  from: string;
  to: string;
  role: string;
  status: string;
}

/** Semana en curso (lunes a domingo), que es el periodo con el que se revisa a diario. */
export const currentWeekRange = (today: Date = new Date()): { from: string; to: string } => {
  const day = today.getDay();
  // getDay() da 0 para domingo: se retrocede 6 días para que la semana empiece en lunes.
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: dateKey(monday), to: dateKey(sunday) };
};

export const defaultTimeEntryFilters = (today: Date = new Date()): TimeEntryFilters => ({
  search: '',
  ...currentWeekRange(today),
  role: '',
  status: '',
});

// Nombre del colaborador, #CLB-{id} y #TME-{id}: los tres ejes de búsqueda de la historia.
export const timeEntryHaystack = (entry: TimeEntry): string =>
  [
    entry.collaborator?.name ?? '',
    timeEntryRef(entry.id),
    String(entry.id),
    collaboratorRefOf(entry.collaborator_id),
    String(entry.collaborator_id),
    entry.collaborator?.role ?? '',
  ]
    .join(' ')
    .toLowerCase();

export const filterTimeEntries = (
  entries: TimeEntry[],
  filters: TimeEntryFilters,
  now: Date = new Date(),
): TimeEntry[] => {
  const term = filters.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (term && !timeEntryHaystack(e).includes(term)) return false;
    if (filters.role && (e.collaborator?.role ?? '').toLowerCase() !== filters.role) {
      return false;
    }
    if (filters.status && classifyEntry(e, now) !== filters.status) return false;
    // El rango se compara por día local, no por instante: un fichaje de las 23:50 pertenece
    // a su día, no al siguiente.
    const key = dateKey(e.clock_in);
    if (filters.from && key < filters.from) return false;
    if (filters.to && key > filters.to) return false;
    return true;
  });
};

export const hasActiveTimeFilters = (
  filters: TimeEntryFilters,
  today: Date = new Date(),
): boolean => {
  const base = defaultTimeEntryFilters(today);
  return (
    filters.search.trim().length > 0 ||
    filters.role.length > 0 ||
    filters.status.length > 0 ||
    filters.from !== base.from ||
    filters.to !== base.to
  );
};

// ================= Guardas del formulario =================

export const CHRONOLOGY_ERROR = 'Clock-Out timestamp must be after Clock-In timestamp.';
export const REASON_REQUIRED_ERROR = 'An adjustment reason is required.';

export const chronologyError = (clockIn: string, clockOut: string): string => {
  if (!clockIn || !clockOut) return '';
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '';
  return end <= start ? CHRONOLOGY_ERROR : '';
};

/**
 * Solapamiento con otro fichaje del mismo colaborador.
 *
 * Una jornada abierta se trata como "hasta el infinito": mientras no se cierre, cualquier
 * fichaje posterior choca con ella — que es justamente la incidencia a resolver. Misma
 * definición que la guarda del backend, para que el formulario no prometa lo que la API
 * va a rechazar.
 */
export const overlappingEntry = (
  entries: TimeEntry[],
  collaboratorId: number,
  clockIn: string,
  clockOut: string | null,
  excludeId?: number,
): TimeEntry | null => {
  const start = new Date(clockIn).getTime();
  if (Number.isNaN(start)) return null;
  const end = clockOut ? new Date(clockOut).getTime() : Number.POSITIVE_INFINITY;
  return (
    entries.find((other) => {
      if (other.id === excludeId) return false;
      if (other.collaborator_id !== collaboratorId) return false;
      const otherStart = new Date(other.clock_in).getTime();
      const otherEnd = other.clock_out
        ? new Date(other.clock_out).getTime()
        : Number.POSITIVE_INFINITY;
      return start < otherEnd && otherStart < end;
    }) ?? null
  );
};

export const overlapError = (clash: TimeEntry): string =>
  `This time range overlaps time entry ${timeEntryRef(clash.id)} for the same collaborator.`;

// ================= Export de nómina =================

export interface TimesheetRow {
  collaboratorId: number;
  collaboratorName: string;
  role: string;
  entries: number;
  regularHours: number;
  overtimeHours: number;
  breakMinutes: number;
  missedPunches: number;
}

/**
 * Agrega por colaborador lo que la nómina necesita.
 *
 * Las horas se suman desde las marcas, no desde las columnas persistidas: si alguien
 * corrigió un fichaje, el total exportado tiene que reflejar la corrección aunque la fila
 * guardada se hubiera quedado atrás.
 */
export const buildTimesheet = (
  entries: TimeEntry[],
  now: Date = new Date(),
): TimesheetRow[] => {
  const byCollaborator = new Map<number, TimesheetRow>();
  for (const e of entries) {
    const row = byCollaborator.get(e.collaborator_id) ?? {
      collaboratorId: e.collaborator_id,
      collaboratorName: e.collaborator?.name ?? `Collaborator #${e.collaborator_id}`,
      role: e.collaborator?.role ?? '',
      entries: 0,
      regularHours: 0,
      overtimeHours: 0,
      breakMinutes: 0,
      missedPunches: 0,
    };
    row.entries += 1;
    row.regularHours += regularHours(e);
    row.overtimeHours += overtimeHours(e);
    row.breakMinutes += Math.max(0, e.break_minutes ?? 0);
    if (classifyEntry(e, now) === 'missed_punch') row.missedPunches += 1;
    byCollaborator.set(e.collaborator_id, row);
  }
  return Array.from(byCollaborator.values())
    .map((r) => ({
      ...r,
      regularHours: Number(r.regularHours.toFixed(2)),
      overtimeHours: Number(r.overtimeHours.toFixed(2)),
    }))
    .sort((a, b) => a.collaboratorName.localeCompare(b.collaboratorName));
};

export const TIMESHEET_HEADERS = [
  'Collaborator ID',
  'Collaborator',
  'Role',
  'Entries',
  'Regular Hours',
  'Overtime Hours',
  'Break Minutes',
  'Missed Punches',
];

// Un campo con coma, comilla o salto de línea rompe el CSV si va crudo: se entrecomilla y
// se duplican las comillas internas, que es lo que Excel espera.
const csvCell = (value: string | number): string => {
  const raw = String(value ?? '');
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export const buildTimesheetCsv = (rows: TimesheetRow[]): string =>
  [
    TIMESHEET_HEADERS.join(','),
    ...rows.map((r) =>
      [
        collaboratorRefOf(r.collaboratorId),
        r.collaboratorName,
        r.role,
        r.entries,
        r.regularHours.toFixed(2),
        r.overtimeHours.toFixed(2),
        r.breakMinutes,
        r.missedPunches,
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');

export const timesheetFilename = (from: string, to: string): string =>
  `timesheet-${from}_${to}.csv`;
