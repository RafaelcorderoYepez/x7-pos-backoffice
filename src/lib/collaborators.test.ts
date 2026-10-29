import { describe, expect, it } from 'vitest';
import type { Collaborator } from '../types/collaborator';
import type { MerchantUser } from '../types/user';
import {
  availableUsersFor,
  collaboratorEmail,
  collaboratorHaystack,
  collaboratorInitials,
  collaboratorNameError,
  collaboratorRef,
  conflictMessageFor,
  DEFAULT_COLLABORATOR_FILTERS,
  defaultNameForUser,
  duplicateUserBindingError,
  filterCollaborators,
  formatRegistrationDate,
  formatSalesVolume,
  hasActiveFilters,
  isUserAlreadyLinked,
  matchesCollaboratorSearch,
  userRef,
} from './collaborators';

const collaborator = (over: Partial<Collaborator> & { id: number }): Collaborator => ({
  user_id: 100 + over.id,
  merchant_id: 3,
  name: `Employee ${over.id}`,
  role: 'waiter',
  status: 'active',
  ...over,
});

const user = (over: Partial<MerchantUser> & { id: number }): MerchantUser => ({
  username: `user${over.id}`,
  email: `user${over.id}@store.com`,
  role: 'merchant_user',
  scope: 'merchant_web',
  isActive: true,
  merchantId: 3,
  ...over,
});

describe('referencias visibles', () => {
  it('compose the codes that the grill teaches', () => {
    expect(collaboratorRef(12)).toBe('#CLB-12');
    expect(userRef(9)).toBe('#USR-9');
  });

  it('take initials of first and last name', () => {
    expect(collaboratorInitials('Juan Perez')).toBe('JP');
  });

  it('with a single name use its first two letters', () => {
    expect(collaboratorInitials('Madonna')).toBe('MA');
  });

  it('an empty name does not leave the avatar mute', () => {
    expect(collaboratorInitials('')).toBe('?');
    expect(collaboratorInitials(null)).toBe('?');
  });

  it('read the email from the field with real name', () => {
    expect(
      collaboratorEmail(collaborator({ id: 1, user: { id: 9, email: 'a@b.com' } })),
    ).toBe('a@b.com');
  });

  it('and also from the old mapping, which included the email in the surname', () => {
    expect(
      collaboratorEmail(collaborator({ id: 1, user: { id: 9, lastname: 'legacy@b.com' } })),
    ).toBe('legacy@b.com');
  });
});

describe('search', () => {
  const c = collaborator({
    id: 12,
    user_id: 9,
    name: 'Juan Perez',
    user: { id: 9, username: 'jperez', email: 'juan@store.com' },
  });

  it('find by name', () => {
    expect(matchesCollaboratorSearch(c, 'juan')).toBe(true);
  });

  it('find by collaborator reference', () => {
    expect(matchesCollaboratorSearch(c, '#CLB-12')).toBe(true);
  });

  it('find by platform account reference', () => {
    expect(matchesCollaboratorSearch(c, '#USR-9')).toBe(true);
  });

  it('find by mail', () => {
    expect(matchesCollaboratorSearch(c, 'juan@store.com')).toBe(true);
  });

  it('accepts stripped id, without prefix', () => {
    expect(collaboratorHaystack(c)).toContain('12');
    expect(matchesCollaboratorSearch(c, '12')).toBe(true);
  });

  it('an empty search discards nothing', () => {
    expect(matchesCollaboratorSearch(c, '   ')).toBe(true);
  });

  it('discards what does not fit', () => {
    expect(matchesCollaboratorSearch(c, 'zzz')).toBe(false);
  });
});

describe('unique link to account', () => {
  const existing = [collaborator({ id: 1, user_id: 9 }), collaborator({ id: 2, user_id: 10 })];

  it('detects an account already linked', () => {
    expect(isUserAlreadyLinked(existing, 9)).toBe(true);
  });

  it('when editing, the tab itself does not count as a conflict', () => {
    expect(isUserAlreadyLinked(existing, 9, 1)).toBe(false);
  });

  it('leaves already linked accounts out of the selector', () => {
    const users = [user({ id: 9 }), user({ id: 10 }), user({ id: 11 })];
    expect(availableUsersFor(users, existing).map((u) => u.id)).toEqual([11]);
  });

  it('When editing, it preserves the account that the file already has', () => {
    const users = [user({ id: 9 }), user({ id: 11 })];
    expect(availableUsersFor(users, existing, 1).map((u) => u.id)).toEqual([9, 11]);
  });

  it('write the notice with the account code', () => {
    expect(duplicateUserBindingError(9)).toBe(
      'User account #USR-9 is already registered as an active collaborator.',
    );
  });

  it('translate 409 from backend to story message', () => {
    expect(
      conflictMessageFor(9, "User with ID '9' is already a collaborator."),
    ).toBe('User account #USR-9 is already registered as an active collaborator.');
  });

  it('a 409 for another reason is displayed as the server sends it', () => {
    expect(conflictMessageFor(9, 'Collaborator is already deleted')).toBe(
      'Collaborator is already deleted',
    );
  });
});

describe('nombre visible', () => {
  it('proposes the account user', () => {
    expect(defaultNameForUser(user({ id: 9, username: 'jperez' }))).toBe('jperez');
  });

  it('without user, falls to the local part of the mail', () => {
    expect(
      defaultNameForUser(user({ id: 9, username: null, email: 'juan@store.com' })),
    ).toBe('juan');
  });

  it('exige un nombre', () => {
    expect(collaboratorNameError('   ')).toBe('A display name is required.');
  });

  it('cuts it to 150 characters, which is what the column can hold', () => {
    expect(collaboratorNameError('x'.repeat(151))).toContain('cannot exceed 150');
    expect(collaboratorNameError('x'.repeat(150))).toBe('');
  });
});

describe('filtros', () => {
  const rows = [
    collaborator({ id: 1, name: 'Ana', role: 'waiter', status: 'active', shift_id: 7 }),
    collaborator({ id: 2, name: 'Beto', role: 'cook', status: 'inactive' }),
    // Inherited data in Spanish: it has to be filtered as 'vacation'.
    collaborator({ id: 3, name: 'Cris', role: 'waiter', status: 'vacaciones' }),
  ];

  it('starts showing only the active template', () => {
    expect(DEFAULT_COLLABORATOR_FILTERS.status).toBe('active');
    expect(filterCollaborators(rows, DEFAULT_COLLABORATOR_FILTERS).map((c) => c.id)).toEqual([1]);
  });

  it('filter by role', () => {
    const out = filterCollaborators(rows, {
      ...DEFAULT_COLLABORATOR_FILTERS,
      status: '',
      role: 'waiter',
    });
    expect(out.map((c) => c.id)).toEqual([1, 3]);
  });

  it('normalizes inherited state in Spanish', () => {
    const out = filterCollaborators(rows, {
      ...DEFAULT_COLLABORATOR_FILTERS,
      status: 'vacation',
    });
    expect(out.map((c) => c.id)).toEqual([3]);
  });

  it('filter by assigned shift', () => {
    const out = filterCollaborators(rows, {
      ...DEFAULT_COLLABORATOR_FILTERS,
      status: '',
      shiftId: '7',
    });
    expect(out.map((c) => c.id)).toEqual([1]);
  });

  it('no considera "filtro activo" el estado por defecto', () => {
    expect(hasActiveFilters(DEFAULT_COLLABORATOR_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_COLLABORATOR_FILTERS, role: 'cook' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_COLLABORATOR_FILTERS, status: '' })).toBe(true);
  });
});

describe('presentation', () => {
  it('format the discharge date', () => {
    expect(formatRegistrationDate('2026-08-24T10:00:00Z')).toMatch(/^Aug \d{2}, 2026$/);
  });

  it('survives an absent or illegible date', () => {
    expect(formatRegistrationDate(null)).toBe('—');
    expect(formatRegistrationDate('ayer')).toBe('—');
  });

  it('format sales volume', () => {
    expect(formatSalesVolume(15420.5)).toBe('$15,420.50');
    expect(formatSalesVolume(0)).toBe('$0.00');
  });
});
