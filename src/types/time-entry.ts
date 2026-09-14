// Tipos del control de fichajes: cada fila es una jornada de un colaborador, con su marca
// de entrada, la de salida (o ninguna, si sigue trabajando) y el descanso no retribuido.
//
// Refleja el contrato real de /api/collaborator-time-entries: escalares en snake_case y
// las relaciones `collaborator` y `shift` hidratadas por el backend.

// ================= Estado del fichaje =================

// Lo que la parrilla puede decir de una jornada. No es una columna: se DERIVA de las marcas
// y del turno programado (ver classifyEntry en lib/time-entries.ts), porque el estado real
// depende de la hora a la que se mire.
export type PunchStatus =
  | 'on_duty'
  | 'on_time'
  | 'tardy'
  | 'missed_punch'
  | 'overtime';

export const PUNCH_STATUSES: PunchStatus[] = [
  'on_duty',
  'on_time',
  'tardy',
  'missed_punch',
  'overtime',
];

export const PUNCH_STATUS_LABELS: Record<PunchStatus, string> = {
  on_duty: 'In Progress',
  on_time: 'On Time',
  tardy: 'Tardy',
  missed_punch: 'Missed Punch',
  overtime: 'Overtime',
};

// Azul en curso, verde a tiempo, ámbar tarde, rojo incidencia, morado horas extra.
export const PUNCH_STATUS_BADGE_STYLES: Record<PunchStatus, string> = {
  on_duty: 'bg-blue-500/10 text-blue-700',
  on_time: 'bg-green-500/10 text-green-700',
  tardy: 'bg-amber-500/10 text-amber-700',
  missed_punch: 'bg-red-500/10 text-red-700',
  overtime: 'bg-purple-500/10 text-purple-700',
};

// ================= Motivos de ajuste =================

// La historia fija estos cuatro; el campo del backend es varchar libre, así que el
// formulario también admite escribir uno propio.
export const ADJUSTMENT_REASONS = [
  'Missed Punch',
  'System Outage',
  'Forgot Badge',
  'Supervisor Authorization',
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number] | string;

// ================= Entidades =================

export interface TimeEntryCollaboratorRef {
  id: number;
  name: string;
  role: string;
}

// El turno no tiene columna `name` en la base: la etiqueta se compone del rol y la hora de
// inicio, igual que en el resto del módulo de RR. HH.
export interface TimeEntryShiftRef {
  id: number;
  role?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface TimeEntry {
  id: number;
  company_id: number;
  merchant_id: number;
  collaborator_id: number;
  shift_id: number | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  adjustment_reason: string | null;
  is_edited: boolean;
  edited_by_user_id: number | null;
  edited_at: string | null;
  regular_hours: number;
  overtime_hours: number;
  double_overtime_hours: number;
  approved: boolean;
  created_at: string;
  collaborator?: TimeEntryCollaboratorRef | null;
  shift?: TimeEntryShiftRef | null;
}

// Una corrección de supervisor. La tabla sólo se inserta: el histórico no se reescribe.
export interface TimeEntryRevision {
  id: number;
  time_entry_id: number;
  edited_by_user_id: number;
  adjustment_reason: string;
  previous_clock_in: string | null;
  previous_clock_out: string | null;
  previous_break_minutes: number | null;
  new_clock_in: string | null;
  new_clock_out: string | null;
  new_break_minutes: number | null;
  created_at: string;
}

// ================= DTOs de escritura =================

export interface CreateTimeEntryDto {
  company_id: number;
  merchant_id: number;
  collaborator_id: number;
  shift_id?: number | null;
  clock_in: string;
  clock_out?: string | null;
  break_minutes?: number;
  adjustment_reason?: string;
}

// El backend actualiza con PUT (no PATCH) y recalcula las horas por su cuenta: mandarlas
// desde el cliente permitiría cuadrar la nómina sin que las marcas lo respalden.
export interface UpdateTimeEntryDto {
  clock_in?: string;
  clock_out?: string | null;
  break_minutes?: number;
  adjustment_reason?: string;
  approved?: boolean;
}
