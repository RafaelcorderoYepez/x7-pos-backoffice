// Contributor directory rules: visible identity, unique link to account
// of platform and search by the four axes with which RR. HH. locate someone.
//
// Live out of sight so you can test yourself without setting up React: these are the rules that
// stories require proof (single link save, search by #CLB/#USR/email).

import type { Collaborator } from '../types/collaborator';
import { normalizeCollaboratorStatus } from '../types/collaborator';
import type { MerchantUser } from '../types/user';

// ================= Referencias visibles =================

// The codes that the grid shows and by which you can search as is.
export const collaboratorRef = (id: number): string => `#CLB-${id}`;
export const userRef = (userId: number): string => `#USR-${userId}`;

// Initials for the avatar. They are taken from the first two words of the visible name; a
// empty name drops to '?' instead of leaving the silent circle.
export const collaboratorInitials = (name?: string | null): string => {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

// The email of the linked account. The backend serves it as `email`, but the original mapping
// I put it in `lastname`: both are read so that the token works against both versions.
export const collaboratorEmail = (c: Collaborator): string =>
  c.user?.email ?? c.user?.lastname ?? '';

export const collaboratorUsername = (c: Collaborator): string =>
  c.user?.username ?? c.user?.firstname ?? '';

// ================= Search =================

// The four axes of the story: name, #CLB-id, #USR-user_id and account email.
// The stripped id is also indexed so that typing "12" finds #CLB-12 without the prefix.
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

// ================= Unique link to account =================

// @Index(['user_id'], { unique: true }): a platform account can only have ONE
// collaborator file. The form should not even offer those already linked.
export const isUserAlreadyLinked = (
  collaborators: Collaborator[],
  userId: number,
  currentCollaboratorId?: number,
): boolean =>
  collaborators.some(
    (c) => c.user_id === userId && c.id !== currentCollaboratorId,
  );

// Accounts that can still become a contributor. When editing, one preserves one's own, or the
// select would be left without the option that is already selected.
export const availableUsersFor = (
  users: MerchantUser[],
  collaborators: Collaborator[],
  currentCollaboratorId?: number,
): MerchantUser[] =>
  users.filter((u) => !isUserAlreadyLinked(collaborators, u.id, currentCollaboratorId));

export const duplicateUserBindingError = (userId: number): string =>
  `User account ${userRef(userId)} is already registered as an active collaborator.`;

// The backend responds 409 with its own text; For the operator, the message of the
// story, which names the specific account. Only the single link conflict is translated:
// Any other 409 is shown as it arrives, which is what the server sends it for.
export const conflictMessageFor = (userId: number, apiMessage?: string): string => {
  const raw = (apiMessage ?? '').toLowerCase();
  return raw.includes('already a collaborator') || raw.includes('user_id')
    ? duplicateUserBindingError(userId)
    : apiMessage || duplicateUserBindingError(userId);
};

// ================= Nombre visible =================

export const MAX_COLLABORATOR_NAME = 150;

// The default name leaves the account, but the merchant can overwrite it: in room
// People are called by their first name, not by their platform username.
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
  // '' = all. The story asks that it start in ACTIVE.
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

// ================= Presentation =================

// "Aug 24, 2026" — the registration date requested by the grid. It is built by hand and not with
// toLocaleDateString so that it does not depend on the locale of the machine that paints it.
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
