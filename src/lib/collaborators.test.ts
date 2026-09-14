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
  it('compone los códigos que enseña la parrilla', () => {
    expect(collaboratorRef(12)).toBe('#CLB-12');
    expect(userRef(9)).toBe('#USR-9');
  });

  it('saca iniciales de nombre y apellido', () => {
    expect(collaboratorInitials('Juan Pérez')).toBe('JP');
  });

  it('con un solo nombre usa sus dos primeras letras', () => {
    expect(collaboratorInitials('Madonna')).toBe('MA');
  });

  it('un nombre vacío no deja el avatar mudo', () => {
    expect(collaboratorInitials('')).toBe('?');
    expect(collaboratorInitials(null)).toBe('?');
  });

  it('lee el correo del campo con nombre real', () => {
    expect(
      collaboratorEmail(collaborator({ id: 1, user: { id: 9, email: 'a@b.com' } })),
    ).toBe('a@b.com');
  });

  it('y también del mapeo antiguo, que metía el correo en el apellido', () => {
    expect(
      collaboratorEmail(collaborator({ id: 1, user: { id: 9, lastname: 'legacy@b.com' } })),
    ).toBe('legacy@b.com');
  });
});

describe('búsqueda', () => {
  const c = collaborator({
    id: 12,
    user_id: 9,
    name: 'Juan Pérez',
    user: { id: 9, username: 'jperez', email: 'juan@store.com' },
  });

  it('encuentra por nombre', () => {
    expect(matchesCollaboratorSearch(c, 'juan')).toBe(true);
  });

  it('encuentra por referencia de colaborador', () => {
    expect(matchesCollaboratorSearch(c, '#CLB-12')).toBe(true);
  });

  it('encuentra por referencia de cuenta de plataforma', () => {
    expect(matchesCollaboratorSearch(c, '#USR-9')).toBe(true);
  });

  it('encuentra por correo', () => {
    expect(matchesCollaboratorSearch(c, 'juan@store.com')).toBe(true);
  });

  it('acepta el id pelado, sin prefijo', () => {
    expect(collaboratorHaystack(c)).toContain('12');
    expect(matchesCollaboratorSearch(c, '12')).toBe(true);
  });

  it('una búsqueda vacía no descarta nada', () => {
    expect(matchesCollaboratorSearch(c, '   ')).toBe(true);
  });

  it('descarta lo que no casa', () => {
    expect(matchesCollaboratorSearch(c, 'zzz')).toBe(false);
  });
});

describe('vínculo único con la cuenta', () => {
  const existing = [collaborator({ id: 1, user_id: 9 }), collaborator({ id: 2, user_id: 10 })];

  it('detecta una cuenta ya enlazada', () => {
    expect(isUserAlreadyLinked(existing, 9)).toBe(true);
  });

  it('al editar, la propia ficha no cuenta como conflicto', () => {
    expect(isUserAlreadyLinked(existing, 9, 1)).toBe(false);
  });

  it('deja fuera del selector las cuentas ya enlazadas', () => {
    const users = [user({ id: 9 }), user({ id: 10 }), user({ id: 11 })];
    expect(availableUsersFor(users, existing).map((u) => u.id)).toEqual([11]);
  });

  it('al editar conserva la cuenta que la ficha ya tiene', () => {
    const users = [user({ id: 9 }), user({ id: 11 })];
    expect(availableUsersFor(users, existing, 1).map((u) => u.id)).toEqual([9, 11]);
  });

  it('redacta el aviso con el código de la cuenta', () => {
    expect(duplicateUserBindingError(9)).toBe(
      'User account #USR-9 is already registered as an active collaborator.',
    );
  });

  it('traduce el 409 del backend al mensaje de la historia', () => {
    expect(
      conflictMessageFor(9, "User with ID '9' is already a collaborator."),
    ).toBe('User account #USR-9 is already registered as an active collaborator.');
  });

  it('un 409 por otro motivo se muestra tal cual lo manda el servidor', () => {
    expect(conflictMessageFor(9, 'Collaborator is already deleted')).toBe(
      'Collaborator is already deleted',
    );
  });
});

describe('nombre visible', () => {
  it('propone el usuario de la cuenta', () => {
    expect(defaultNameForUser(user({ id: 9, username: 'jperez' }))).toBe('jperez');
  });

  it('sin usuario, cae a la parte local del correo', () => {
    expect(
      defaultNameForUser(user({ id: 9, username: null, email: 'juan@store.com' })),
    ).toBe('juan');
  });

  it('exige un nombre', () => {
    expect(collaboratorNameError('   ')).toBe('A display name is required.');
  });

  it('corta en 150 caracteres, que es lo que aguanta la columna', () => {
    expect(collaboratorNameError('x'.repeat(151))).toContain('cannot exceed 150');
    expect(collaboratorNameError('x'.repeat(150))).toBe('');
  });
});

describe('filtros', () => {
  const rows = [
    collaborator({ id: 1, name: 'Ana', role: 'waiter', status: 'active', shift_id: 7 }),
    collaborator({ id: 2, name: 'Beto', role: 'cook', status: 'inactive' }),
    // Dato heredado en español: tiene que filtrarse como 'vacation'.
    collaborator({ id: 3, name: 'Cris', role: 'waiter', status: 'vacaciones' }),
  ];

  it('arranca mostrando sólo la plantilla activa', () => {
    expect(DEFAULT_COLLABORATOR_FILTERS.status).toBe('active');
    expect(filterCollaborators(rows, DEFAULT_COLLABORATOR_FILTERS).map((c) => c.id)).toEqual([1]);
  });

  it('filtra por rol', () => {
    const out = filterCollaborators(rows, {
      ...DEFAULT_COLLABORATOR_FILTERS,
      status: '',
      role: 'waiter',
    });
    expect(out.map((c) => c.id)).toEqual([1, 3]);
  });

  it('normaliza el estado heredado en español', () => {
    const out = filterCollaborators(rows, {
      ...DEFAULT_COLLABORATOR_FILTERS,
      status: 'vacation',
    });
    expect(out.map((c) => c.id)).toEqual([3]);
  });

  it('filtra por turno asignado', () => {
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

describe('presentación', () => {
  it('formatea la fecha de alta', () => {
    expect(formatRegistrationDate('2026-08-24T10:00:00Z')).toMatch(/^Aug \d{2}, 2026$/);
  });

  it('sobrevive a una fecha ausente o ilegible', () => {
    expect(formatRegistrationDate(null)).toBe('—');
    expect(formatRegistrationDate('ayer')).toBe('—');
  });

  it('formatea el volumen de ventas', () => {
    expect(formatSalesVolume(15420.5)).toBe('$15,420.50');
    expect(formatSalesVolume(0)).toBe('$0.00');
  });
});
