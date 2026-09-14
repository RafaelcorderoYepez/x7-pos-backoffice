// Reglas de las asignaciones de mesa: quién cubre qué mesa en qué turno, cuándo entra de
// servicio y cuándo se le libera.
//
// La verdad operativa NO es la columna `status` sino `releasedAt`: mientras sea null el
// camarero sigue de servicio, aunque alguien haya tocado el status a mano. Todo lo que
// decide "está de servicio" pasa por isActiveDuty() para que la parrilla, el filtro y la
// guarda de conflicto no puedan discrepar entre sí.

import type { DiningTable } from '../types/dining-system';

// ================= Formas del contrato =================

export interface ShiftRef {
  id: number;
  merchantId?: number;
  name?: string;
  // `null` explícito: así los devuelve /api/collaborators para un turno sin cierre.
  startTime?: string | null;
  endTime?: string | null;
  role?: string | null;
  status?: string | null;
}

export interface CollaboratorRef {
  id: number;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  code?: string;
}

export interface TableAssignment {
  id: number;
  shiftId: number;
  tableId: number;
  collaboratorId: number;
  assignedAt?: string;
  releasedAt?: string | null;
  status: string;
  // El backend carga estas relaciones en eager, así que suelen venir hidratadas.
  shift?: ShiftRef | null;
  table?: Partial<DiningTable> | null;
  collaborator?: CollaboratorRef | null;
}

// ================= Servicio activo =================

// releasedAt === null es la definición de la historia: mientras no haya sello de salida,
// la mesa sigue cubierta.
export const isActiveDuty = (a: Pick<TableAssignment, 'releasedAt'>): boolean =>
  a.releasedAt == null;

export type DutyFilter = 'all' | 'active' | 'released';

export const DUTY_FILTER_LABELS: Record<DutyFilter, string> = {
  all: 'All Statuses',
  active: 'Active Duty',
  released: 'Released / Closed',
};

export const matchesDutyFilter = (a: TableAssignment, filter: DutyFilter): boolean =>
  filter === 'all' ? true : filter === 'active' ? isActiveDuty(a) : !isActiveDuty(a);

export const dutyBadgeLabel = (a: TableAssignment): string =>
  isActiveDuty(a) ? 'On Duty' : 'Released';

// Verde de servicio vivo, azul apagado de turno cerrado.
export const dutyBadgeStyle = (a: TableAssignment): string =>
  isActiveDuty(a) ? 'bg-green-500/10 text-green-700' : 'bg-blue-500/10 text-blue-700';

// ================= Etiquetas =================

// Sin la feature COLLABORATORS el backend devuelve 403 y sólo queda el id; la fila tiene
// que seguir siendo legible en ese caso.
export const collaboratorLabel = (a: TableAssignment): string => {
  const c = a.collaborator;
  if (!c) return `Collaborator #${a.collaboratorId}`;
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return c.name || full || `Collaborator #${a.collaboratorId}`;
};

export const collaboratorBadge = (a: TableAssignment): string => {
  const c = a.collaborator;
  return [c?.role, c?.code].filter(Boolean).join(' · ');
};

// Formato de 12 h construido a mano y no con toLocaleTimeString: el separador que mete ICU
// antes del AM/PM cambia entre versiones de Node (espacio fino U+202F), y esta cadena se
// compara en los tests y se lee en la parrilla.
const clockTime = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
};

const shortDate = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// "Lunch Shift - Jul 28", o el rol y la fecha cuando el turno no tiene nombre propio.
export const shiftLabel = (shift?: ShiftRef | null): string => {
  if (!shift) return '—';
  const date = shortDate(shift.startTime);
  const name = shift.name?.trim() || (shift.role ? `${titleCase(shift.role)} Shift` : `Shift #${shift.id}`);
  return date ? `${name} - ${date}` : name;
};

export const shiftHours = (shift?: ShiftRef | null): string => {
  const start = clockTime(shift?.startTime);
  if (!start) return '—';
  const end = clockTime(shift?.endTime);
  return end ? `${start} – ${end}` : `${start} – open`;
};

function titleCase(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Assigned: 12:30 PM | Released: 04:15 PM" / "Assigned: 12:30 PM | Duty Active".
export const formatDutyWindow = (a: TableAssignment): string => {
  const assigned = clockTime(a.assignedAt) || '—';
  return isActiveDuty(a)
    ? `Assigned: ${assigned} | Duty Active`
    : `Assigned: ${assigned} | Released: ${clockTime(a.releasedAt) || '—'}`;
};

// ================= Contexto de turno =================

// El turno abierto del comercio: activo y sin hora de cierre. Si hay varios (el backend no
// lo impide) gana el que arrancó más tarde, que es el que el operador tiene delante.
export const resolveActiveShiftId = (shifts: ShiftRef[]): string => {
  const open = shifts
    .filter((s) => (s.status ?? 'active') === 'active' && !s.endTime)
    .sort((a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime());
  return open.length > 0 ? String(open[0].id) : '';
};

export const isHistoricalShift = (shift?: ShiftRef | null): boolean =>
  !!shift && (Boolean(shift.endTime) || (shift.status ?? 'active') !== 'active');

// ================= Exclusividad mesa/turno =================

// El índice [tableId, shiftId] del backend NO es único, así que la exclusividad de la mesa
// dentro del turno se sostiene aquí: si ya hay alguien cubriéndola sin liberar, hay conflicto.
export const conflictingAssignment = (
  assignments: TableAssignment[],
  tableId: number,
  shiftId: number,
): TableAssignment | null =>
  assignments.find((a) => a.tableId === tableId && a.shiftId === shiftId && isActiveDuty(a)) ??
  null;

export const reassignConflictPrompt = (tableNumber: string, holder: string): string =>
  `Table ${tableNumber} is currently assigned to ${holder}. Reassigning will automatically release ${holder}'s duty. Proceed?`;

// Liberar a un camarero de una mesa con comandas abiertas no se bloquea — el turno se acaba
// igual — pero sí se avisa: alguien tiene que hacerse cargo de esas cuentas.
export const openOrdersReleaseWarning = (tableNumber: string): string =>
  `Table ${tableNumber} has active guest orders. Ensure open checks are transferred to another collaborator before releasing.`;

// La mesa ocupada es la señal de comanda viva que expone /api/tables hoy.
export const hasOpenChecks = (table?: Pick<DiningTable, 'status'> | null): boolean =>
  table?.status === 'occupied';

// ================= Búsqueda =================

// Nombre del colaborador, número de mesa y etiqueta de zona: los tres ejes por los que un
// supervisor busca una fila.
export const assignmentHaystack = (
  a: TableAssignment,
  table?: Partial<DiningTable> | null,
): string =>
  [
    collaboratorLabel(a),
    a.collaborator?.firstName ?? '',
    a.collaborator?.lastName ?? '',
    table?.number ?? a.table?.number ?? `#${a.tableId}`,
    table?.floorZone?.name ?? a.table?.floorZone?.name ?? '',
    shiftLabel(a.shift),
    String(a.shiftId),
  ]
    .join(' ')
    .toLowerCase();
