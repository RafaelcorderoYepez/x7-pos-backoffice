// Tipos del dominio de RR. HH.: el colaborador es el empleado de sala tal y como lo ve el
// comercio, enganchado a una cuenta de plataforma (user_id) y opcionalmente a un turno.
//
// Los nombres de campo reflejan el contrato real de /api/collaborators: escalares en
// snake_case (user_id, merchant_id, shift_id, created_at) y relaciones embebidas en
// camelCase, igual que el resto de la API.

// ================= Rol de turno =================

// Espejo exacto del enum ShiftRole del backend. La historia menciona SUPERVISOR, que NO
// existe en el dominio: el escalón de mando es MANAGER.
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

// ================= Estado del colaborador =================

// El enum real del backend es active | inactive | vacation | deleted (más los legacy en
// español). La historia pide SUSPENDED y TERMINATED, que no existen en el dominio: aquí se
// respeta lo que la base sabe persistir. 'deleted' es la baja lógica y no se ofrece como
// opción editable, pero sí se pinta si llega, para que una fila dada de baja sea legible.
export type CollaboratorStatus = 'active' | 'inactive' | 'vacation' | 'deleted';

// Las que el formulario ofrece: la baja se hace borrando, no eligiendo 'deleted' a mano.
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

// Verde en plantilla, gris de baja temporal, ámbar de vacaciones, rojo de baja definitiva.
export const COLLABORATOR_STATUS_BADGE_STYLES: Record<CollaboratorStatus, string> = {
  active: 'bg-green-500/10 text-green-700',
  inactive: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  vacation: 'bg-amber-500/10 text-amber-700',
  deleted: 'bg-red-500/10 text-red-700',
};

// El backend arrastra datos antiguos en español ('activo', 'vacaciones'): se normalizan
// para que el filtro y el badge no partan la plantilla en dos vocabularios.
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

// El turno no tiene columna `name` en la base: la etiqueta se compone del rol y la hora de
// inicio (ver shiftLabel en lib/table-assignments.ts, que ya resuelve exactamente esto).
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
  // `firstname`/`lastname` cargan username/email por compatibilidad con el mapeo original
  // del backend; `username`/`email` son los campos con su nombre real.
  user?: {
    id: number;
    firstname?: string;
    lastname?: string;
    username?: string;
    email?: string;
  } | null;
}

// ================= DTOs de escritura =================

export interface CreateCollaboratorDto {
  user_id: number;
  merchant_id: number;
  name: string;
  role: ShiftRole;
  status: CollaboratorStatus;
  shift_id?: number | null;
}

// El backend actualiza con PUT (no PATCH) y con whitelist: merchant_id y user_id no se
// reasignan al editar, porque cambiarían de dueño la ficha entera.
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
