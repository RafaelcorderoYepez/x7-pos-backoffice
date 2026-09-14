// Reglas del directorio de colaboradores: identidad visible, vínculo único con la cuenta
// de plataforma y búsqueda por los cuatro ejes con los que RR. HH. localiza a alguien.
//
// Vive fuera de la vista para poder probarse sin montar React: son las reglas que las
// historias exigen demostrar (guarda de vínculo único, búsqueda por #CLB/#USR/email).

import type { Collaborator } from '../types/collaborator';
import { normalizeCollaboratorStatus } from '../types/collaborator';
import type { MerchantUser } from '../types/user';

// ================= Referencias visibles =================

// Los códigos que la parrilla enseña y por los que se puede buscar tal cual.
export const collaboratorRef = (id: number): string => `#CLB-${id}`;
export const userRef = (userId: number): string => `#USR-${userId}`;

// Iniciales para el avatar. Se toman de las dos primeras palabras del nombre visible; un
// nombre vacío cae a '?' en vez de dejar el círculo mudo.
export const collaboratorInitials = (name?: string | null): string => {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

// El correo de la cuenta enlazada. El backend lo sirve como `email`, pero el mapeo original
// lo metía en `lastname`: se leen ambos para que la ficha funcione contra las dos versiones.
export const collaboratorEmail = (c: Collaborator): string =>
  c.user?.email ?? c.user?.lastname ?? '';

export const collaboratorUsername = (c: Collaborator): string =>
  c.user?.username ?? c.user?.firstname ?? '';

// ================= Búsqueda =================

// Los cuatro ejes de la historia: nombre, #CLB-id, #USR-user_id y correo de la cuenta.
// Se indexa también el id pelado para que teclear "12" encuentre a #CLB-12 sin el prefijo.
export const collaboratorHaystack = (c: Collaborator): string =>
  [
    c.name ?? '',
    collaboratorRef(c.id),
    String(c.id),
    userRef(c.user_id),
    String(c.user_id),
    collaboratorEmail(c),
    collaboratorUsername(c),
  ]
    .join(' ')
    .toLowerCase();

export const matchesCollaboratorSearch = (c: Collaborator, term: string): boolean => {
  const value = term.trim().toLowerCase();
  if (!value) return true;
  return collaboratorHaystack(c).includes(value);
};

// ================= Vínculo único con la cuenta =================

// @Index(['user_id'], { unique: true }): una cuenta de plataforma sólo puede tener UNA
// ficha de colaborador. El formulario no debe ofrecer siquiera las ya enlazadas.
export const isUserAlreadyLinked = (
  collaborators: Collaborator[],
  userId: number,
  currentCollaboratorId?: number,
): boolean =>
  collaborators.some(
    (c) => c.user_id === userId && c.id !== currentCollaboratorId,
  );

// Cuentas que aún pueden convertirse en colaborador. Al editar se conserva la propia, o el
// select se quedaría sin la opción que ya tiene seleccionada.
export const availableUsersFor = (
  users: MerchantUser[],
  collaborators: Collaborator[],
  currentCollaboratorId?: number,
): MerchantUser[] =>
  users.filter((u) => !isUserAlreadyLinked(collaborators, u.id, currentCollaboratorId));

export const duplicateUserBindingError = (userId: number): string =>
  `User account ${userRef(userId)} is already registered as an active collaborator.`;

// El backend responde 409 con su propio texto; para el operador vale más el mensaje de la
// historia, que nombra la cuenta concreta. Sólo se traduce el conflicto de vínculo único:
// cualquier otro 409 se muestra tal cual llega, que para eso lo manda el servidor.
export const conflictMessageFor = (userId: number, apiMessage?: string): string => {
  const raw = (apiMessage ?? '').toLowerCase();
  return raw.includes('already a collaborator') || raw.includes('user_id')
    ? duplicateUserBindingError(userId)
    : apiMessage || duplicateUserBindingError(userId);
};

// ================= Nombre visible =================

export const MAX_COLLABORATOR_NAME = 150;

// El nombre por defecto sale de la cuenta, pero el comercio puede sobreescribirlo: en sala
// se llama a la gente por su nombre de pila, no por su usuario de plataforma.
export const defaultNameForUser = (user?: MerchantUser | null): string =>
  user?.username?.trim() || user?.email?.split('@')[0] || '';

export const collaboratorNameError = (name: string): string => {
  const value = name.trim();
  if (value.length === 0) return 'A display name is required.';
  if (value.length > MAX_COLLABORATOR_NAME) {
    return `The display name cannot exceed ${MAX_COLLABORATOR_NAME} characters.`;
  }
  return '';
};

// ================= Filtros =================

export interface CollaboratorFilters {
  search: string;
  role: string;
  // '' = todos. La historia pide que arranque en ACTIVE.
  status: string;
  shiftId: string;
}

export const DEFAULT_COLLABORATOR_FILTERS: CollaboratorFilters = {
  search: '',
  role: '',
  status: 'active',
  shiftId: '',
};

export const filterCollaborators = (
  collaborators: Collaborator[],
  filters: CollaboratorFilters,
): Collaborator[] =>
  collaborators.filter((c) => {
    if (!matchesCollaboratorSearch(c, filters.search)) return false;
    if (filters.role && (c.role ?? '').toLowerCase() !== filters.role) return false;
    if (
      filters.status &&
      normalizeCollaboratorStatus(c.status) !== normalizeCollaboratorStatus(filters.status)
    ) {
      return false;
    }
    if (filters.shiftId && String(c.shift_id ?? c.shift?.id ?? '') !== filters.shiftId) {
      return false;
    }
    return true;
  });

export const hasActiveFilters = (filters: CollaboratorFilters): boolean =>
  filters.search.trim().length > 0 ||
  filters.role.length > 0 ||
  filters.shiftId.length > 0 ||
  filters.status !== DEFAULT_COLLABORATOR_FILTERS.status;

// ================= Presentación =================

// "Aug 24, 2026" — la fecha de alta que pide la parrilla. Se construye a mano y no con
// toLocaleDateString para que no dependa del locale de la máquina que lo pinte.
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const formatRegistrationDate = (raw?: string | null): string => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
};

export const formatSalesVolume = (total: number): string =>
  `$${(Number.isFinite(total) ? total : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
