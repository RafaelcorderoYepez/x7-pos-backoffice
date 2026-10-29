// Types of HR domain HH.: the collaborator is the room employee as seen by the
// trade, hooked to a platform account (user_id) and optionally to a shift.
//
// Field names reflect the actual contract in /api/collaborators: scalars in
// snake_case (user_id, merchant_id, shift_id, created_at) and relationships embedded in
// camelCase, just like the rest of the API.

// ================= Shift Role =================

// Exact mirror of the backend ShiftRole enum. The story mentions SUPERVISOR, who DOES NOT
// exists in the domain: the command level is MANAGER.
export type ShiftRole =
  | 'waiter'
  | 'cook'
  | 'bartender'
  | 'host'
  | 'cashier'
  | 'manager'
  | 'busser'
  | 'delivery';

export const SHIFT_ROLES: ShiftRole[] = [
  'waiter',
  'cook',
  'bartender',
  'host',
  'cashier',
  'manager',
  'busser',
  'delivery',
];

export const SHIFT_ROLE_LABELS: Record<ShiftRole, string> = {
  waiter: 'Waiter',
  cook: 'Cook',
  bartender: 'Bartender',
  host: 'Host',
  cashier: 'Cashier',
  manager: 'Manager',
  busser: 'Busser',
  delivery: 'Delivery',
};

export const isShiftRole = (raw?: string | null): raw is ShiftRole =>
  SHIFT_ROLES.includes((raw ?? '') as ShiftRole);

export const shiftRoleLabel = (raw?: string | null): string => {
  const value = (raw ?? '').trim().toLowerCase();
  if (isShiftRole(value)) return SHIFT_ROLE_LABELS[value];
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
};

// ================= Collaborator Status =================

// The actual backend enum is active | inactive | vacation | deleted (plus legacy in
// Spanish). The history asks for SUSPENDED and TERMINATED, which do not exist in the domain: here they are
// respect what the base knows how to persist. 'deleted' is the logical low and is not offered as
// editable option, but it is painted if it arrives, so that a deleted row is readable.
export type CollaboratorStatus = 'active' | 'inactive' | 'vacation' | 'deleted';

// Those that the form offers: the deletion is done by deleting, not by choosing 'deleted' by hand.
export const COLLABORATOR_STATUSES: CollaboratorStatus[] = [
  'active',
  'inactive',
  'vacation',
];

export const COLLABORATOR_STATUS_LABELS: Record<CollaboratorStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  vacation: 'On Vacation',
  deleted: 'Terminated',
};

// Green in template, gray for temporary leave, amber for vacation, red for permanent leave.
export const COLLABORATOR_STATUS_BADGE_STYLES: Record<CollaboratorStatus, string> = {
  active: 'bg-green-500/10 text-green-700',
  inactive: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  vacation: 'bg-amber-500/10 text-amber-700',
  deleted: 'bg-red-500/10 text-red-700',
};

// Backend drags old data in Spanish ('active', 'vacation') - it is normalized
// so that the filter and the badge do not split the template into two vocabularies.
export const normalizeCollaboratorStatus = (raw?: string | null): CollaboratorStatus => {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'inactive' || value === 'inactivo') return 'inactive';
  if (value === 'vacation' || value === 'vacaciones') return 'vacation';
  if (value === 'deleted' || value === 'eliminado') return 'deleted';
  return 'active';
};

export const collaboratorStatusLabel = (raw?: string | null): string =>
  COLLABORATOR_STATUS_LABELS[normalizeCollaboratorStatus(raw)];

export const collaboratorStatusBadgeStyle = (raw?: string | null): string =>
  COLLABORATOR_STATUS_BADGE_STYLES[normalizeCollaboratorStatus(raw)];

// ================= Entidades =================

// The shift has no `name` column in the base: the label is made up of the role and the time of
// startup (see shiftLabel in lib/table-assignments.ts, which already solves exactly this).
export interface CollaboratorShiftRef {
  id: number;
  role?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
}

export interface Collaborator {
  id: number;
  user_id: number;
  merchant_id: number;
  name: string;
  role: string;
  status: string;
  employeeId?: string | null;
  department?: string | null;
  created_at?: string;
  shift_id?: number | null;
  shift?: CollaboratorShiftRef | null;
  merchant?: { id: number; name?: string } | null;
  // `firstname`/`lastname` load username/email for compatibility with the original mapping
  // from the backend; `username`/`email` are the fields with your real name.
  user?: {
    id: number;
    firstname?: string;
    lastname?: string;
    username?: string;
    email?: string;
  } | null;
}

// ================= Write DTOs =================

export interface CreateCollaboratorDto {
  user_id: number;
  merchant_id: number;
  name: string;
  role: ShiftRole;
  status: CollaboratorStatus;
  shift_id?: number | null;
}

// The backend updates with PUT (not PATCH) and with whitelist: merchant_id and user_id are not
// They are reassigned when editing, because they would change ownership of the entire file.
export type UpdateCollaboratorDto = Partial<
  Omit<CreateCollaboratorDto, 'merchant_id' | 'user_id'>
>;

// ================= Resumen operativo =================

export interface CollaboratorSummary {
  collaborator_id: number;
  counts: {
    shiftAssignments: number;
    tableAssignments: number;
    openedCashDrawers: number;
    closedCashDrawers: number;
    orders: number;
  };
  ordersTotal: number;
  recentShiftAssignments: Array<{
    id: number;
    shiftId: number;
    startTime?: string | null;
    endTime?: string | null;
    status?: string | null;
  }>;
  recentTableAssignments: Array<{
    id: number;
    tableId: number;
    tableNumber?: string | null;
    zoneName?: string | null;
    assignedAt?: string | null;
    releasedAt?: string | null;
  }>;
  recentCashDrawers: Array<{
    id: number;
    custody: 'opened' | 'closed';
    status?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }>;
  recentOrders: Array<{
    id: number;
    order_number?: string | null;
    total: number;
    status?: string | null;
    created_at?: string | null;
  }>;
}
