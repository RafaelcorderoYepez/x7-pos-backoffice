import { describe, expect, it } from 'vitest';
import type { ShiftRef, TableAssignment } from './table-assignments';
import {
  assignmentHaystack,
  collaboratorBadge,
  collaboratorLabel,
  conflictingAssignment,
  dutyBadgeLabel,
  dutyBadgeStyle,
  formatDutyWindow,
  hasOpenChecks,
  isActiveDuty,
  isHistoricalShift,
  matchesDutyFilter,
  openOrdersReleaseWarning,
  reassignConflictPrompt,
  resolveActiveShiftId,
  shiftHours,
  shiftLabel,
} from './table-assignments';

// Las horas se construyen en local para que el formateador de 12 h lea lo mismo que el
// operador tiene en su reloj, con independencia de la zona en la que corran los tests.
const at = (h: number, m = 0): string => {
  const d = new Date(2026, 6, 28, h, m, 0);
  return d.toISOString();
};

const assignment = (over: Partial<TableAssignment> & { id: number }): TableAssignment => ({
  shiftId: 1,
  tableId: 10,
  collaboratorId: 5,
  assignedAt: at(12, 30),
  releasedAt: null,
  status: 'active',
  ...over,
});

describe('servicio activo', () => {
  it('sin releasedAt el camarero sigue de servicio', () => {
    expect(isActiveDuty(assignment({ id: 1 }))).toBe(true);
  });

  it('con releasedAt la cobertura está cerrada', () => {
    expect(isActiveDuty(assignment({ id: 1, releasedAt: at(16, 15) }))).toBe(false);
  });

  it('releasedAt manda sobre un status incoherente', () => {
    // Fila real posible: alguien tocó el status pero la marca de salida ya está puesta.
    const closed = assignment({ id: 1, status: 'active', releasedAt: at(16, 15) });
    expect(isActiveDuty(closed)).toBe(false);
    expect(dutyBadgeLabel(closed)).toBe('Released');
  });

  it('el badge distingue servicio de cierre', () => {
    expect(dutyBadgeStyle(assignment({ id: 1 }))).toContain('green');
    expect(dutyBadgeStyle(assignment({ id: 1, releasedAt: at(16) }))).toContain('blue');
  });
});

describe('filtro de cobertura', () => {
  const live = assignment({ id: 1 });
  const closed = assignment({ id: 2, releasedAt: at(16, 15) });

  it('"all" no descarta nada', () => {
    expect(matchesDutyFilter(live, 'all')).toBe(true);
    expect(matchesDutyFilter(closed, 'all')).toBe(true);
  });

  it('"active" deja sólo las vivas', () => {
    expect(matchesDutyFilter(live, 'active')).toBe(true);
    expect(matchesDutyFilter(closed, 'active')).toBe(false);
  });

  it('"released" deja sólo las cerradas', () => {
    expect(matchesDutyFilter(live, 'released')).toBe(false);
    expect(matchesDutyFilter(closed, 'released')).toBe(true);
  });
});

describe('etiquetas de colaborador', () => {
  it('prefiere el nombre completo del catálogo', () => {
    expect(
      collaboratorLabel(assignment({ id: 1, collaborator: { id: 5, name: 'John Doe' } })),
    ).toBe('John Doe');
  });

  it('compone nombre y apellido cuando no hay `name`', () => {
    expect(
      collaboratorLabel(
        assignment({ id: 1, collaborator: { id: 5, firstName: 'Ana', lastName: 'Ruiz' } }),
      ),
    ).toBe('Ana Ruiz');
  });

  it('cae al id cuando la feature de colaboradores no está concedida', () => {
    expect(collaboratorLabel(assignment({ id: 1, collaboratorId: 9 }))).toBe('Collaborator #9');
  });

  it('compone el badge de rol y código', () => {
    expect(
      collaboratorBadge(
        assignment({ id: 1, collaborator: { id: 5, role: 'waiter', code: 'W-12' } }),
      ),
    ).toBe('waiter · W-12');
  });
});

describe('ventana de servicio', () => {
  it('marca la cobertura viva como activa', () => {
    expect(formatDutyWindow(assignment({ id: 1 }))).toBe('Assigned: 12:30 PM | Duty Active');
  });

  it('muestra ambas marcas cuando ya se liberó', () => {
    expect(formatDutyWindow(assignment({ id: 1, releasedAt: at(16, 15) }))).toBe(
      'Assigned: 12:30 PM | Released: 04:15 PM',
    );
  });

  it('sobrevive a una marca ausente', () => {
    expect(formatDutyWindow(assignment({ id: 1, assignedAt: undefined }))).toBe(
      'Assigned: — | Duty Active',
    );
  });
});

describe('turnos', () => {
  const open: ShiftRef = { id: 7, startTime: at(11), status: 'active' };
  const closed: ShiftRef = { id: 6, startTime: at(8), endTime: at(11), status: 'closed' };

  it('resuelve el turno abierto', () => {
    expect(resolveActiveShiftId([closed, open])).toBe('7');
  });

  it('con varios abiertos gana el más reciente', () => {
    const older: ShiftRef = { id: 5, startTime: at(9), status: 'active' };
    expect(resolveActiveShiftId([older, open])).toBe('7');
  });

  it('sin turno abierto no impone ninguno', () => {
    expect(resolveActiveShiftId([closed])).toBe('');
    expect(resolveActiveShiftId([])).toBe('');
  });

  it('distingue el turno histórico', () => {
    expect(isHistoricalShift(closed)).toBe(true);
    expect(isHistoricalShift(open)).toBe(false);
  });

  it('nombra el turno con su fecha', () => {
    expect(shiftLabel({ id: 7, name: 'Lunch Shift', startTime: at(11) })).toBe(
      'Lunch Shift - Jul 28',
    );
  });

  it('deriva el nombre del rol cuando el turno no tiene uno', () => {
    expect(shiftLabel({ id: 7, role: 'waiter', startTime: at(11) })).toBe('Waiter Shift - Jul 28');
  });

  it('marca como abierto el turno sin hora de cierre', () => {
    expect(shiftHours(open)).toBe('11:00 AM – open');
    expect(shiftHours(closed)).toBe('08:00 AM – 11:00 AM');
  });
});

describe('exclusividad mesa/turno', () => {
  const live = assignment({ id: 1, tableId: 10, shiftId: 1, collaborator: { id: 5, name: 'John Doe' } });
  const released = assignment({ id: 2, tableId: 10, shiftId: 1, releasedAt: at(15) });

  it('encuentra al camarero que ya cubre la mesa en ese turno', () => {
    expect(conflictingAssignment([released, live], 10, 1)?.id).toBe(1);
  });

  it('una cobertura liberada no genera conflicto', () => {
    expect(conflictingAssignment([released], 10, 1)).toBeNull();
  });

  it('la misma mesa en otro turno no colisiona', () => {
    expect(conflictingAssignment([live], 10, 2)).toBeNull();
  });

  it('redacta el aviso de traspaso con el nombre del titular', () => {
    expect(reassignConflictPrompt('A1', 'John Doe')).toBe(
      "Table A1 is currently assigned to John Doe. Reassigning will automatically release John Doe's duty. Proceed?",
    );
  });
});

describe('aviso de cuentas abiertas al liberar', () => {
  it('una mesa ocupada tiene cuentas vivas', () => {
    expect(hasOpenChecks({ status: 'occupied' })).toBe(true);
    expect(hasOpenChecks({ status: 'available' })).toBe(false);
    expect(hasOpenChecks(null)).toBe(false);
  });

  it('redacta el aviso de la historia', () => {
    expect(openOrdersReleaseWarning('A1')).toBe(
      'Table A1 has active guest orders. Ensure open checks are transferred to another collaborator before releasing.',
    );
  });
});

describe('búsqueda', () => {
  const a = assignment({
    id: 1,
    collaborator: { id: 5, firstName: 'Ana', lastName: 'Ruiz' },
  });
  const t = { id: 10, number: 'A1', floorZone: { id: 3, name: 'VIP Lounge' } };

  it('busca por nombre de colaborador', () => {
    expect(assignmentHaystack(a, t)).toContain('ana ruiz');
  });

  it('busca por número de mesa', () => {
    expect(assignmentHaystack(a, t)).toContain('a1');
  });

  it('busca por zona', () => {
    expect(assignmentHaystack(a, t)).toContain('vip lounge');
  });
});
