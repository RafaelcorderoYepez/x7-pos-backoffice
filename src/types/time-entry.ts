// Types of transfer control: each row is a day of a collaborator, with his brand
// entry, exit (or none, if you continue working) and unpaid rest.
//
// Reflects the actual contract from /api/collaborator-time-entries: scalars in snake_case and
// the `collaborator` and `shift` relationships hydrated by the backend.

// ================= Transfer status =================

// What the grill can say about a day. It is not a column: it is DERIVED from the marks
// and of the scheduled shift (see classifyEntry in lib/time-entries.ts), because the actual state
// It depends on the time you look at it.
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

// Blue in progress, green on time, amber late, red incidence, purple overtime.
export const PUNCH_STATUS_BADGE_STYLES: Record<PunchStatus, string> = {
  on_duty: 'bg-blue-500/10 text-blue-700',
  on_time: 'bg-green-500/10 text-green-700',
  tardy: 'bg-amber-500/10 text-amber-700',
  missed_punch: 'bg-red-500/10 text-red-700',
  overtime: 'bg-purple-500/10 text-purple-700',
};

// ================= Reasons for adjustment =================

// History fixes these four; the backend field is free varchar, so the
// form also supports writing your own.
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

// The shift has no `name` column in the base: the label is made up of the role and the time of
// start, the same as in the rest of the HR module. HH.
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

// A supervisor correction. The table is only inserted: the history is not rewritten.
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

// ================= Write DTOs =================

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

// The backend updates with PUT (not PATCH) and recalculates the hours on its own: send them
// from the client would allow the payroll to be balanced without the brands supporting it.
export interface UpdateTimeEntryDto {
  clock_in?: string;
  clock_out?: string | null;
  break_minutes?: number;
  adjustment_reason?: string;
  approved?: boolean;
}
