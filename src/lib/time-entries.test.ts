import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../types/time-entry';
import {
  buildTimesheet,
  buildTimesheetCsv,
  chronologyError,
  classifyEntry,
  clockTime,
  collaboratorRefOf,
  currentWeekRange,
  dateKey,
  defaultTimeEntryFilters,
  entryDate,
  filterTimeEntries,
  formatBreak,
  formatHours,
  hasActiveTimeFilters,
  isOnDuty,
  netHours,
  overlapError,
  overlappingEntry,
  overtimeHours,
  rawHours,
  regularHours,
  tardyLabel,
  tardyMinutes,
  timeEntryHaystack,
  timeEntryRef,
  TIMESHEET_HEADERS,
} from './time-entries';

// Fechas locales: el módulo compara días en horario local a propósito.
const at = (day: number, h: number, m = 0): string =>
  new Date(2026, 7, day, h, m, 0).toISOString();

const entry = (over: Partial<TimeEntry> & { id: number }): TimeEntry => ({
  company_id: 1,
  merchant_id: 3,
  collaborator_id: 4,
  shift_id: null,
  clock_in: at(30, 8),
  clock_out: at(30, 16),
  break_minutes: 30,
  adjustment_reason: null,
  is_edited: false,
  edited_by_user_id: null,
  edited_at: null,
  regular_hours: 7.5,
  overtime_hours: 0,
  double_overtime_hours: 0,
  approved: false,
  created_at: at(30, 8),
  collaborator: { id: 4, name: 'Juan Pérez', role: 'waiter' },
  ...over,
});

describe('horas', () => {
  it('mide el intervalo bruto', () => {
    expect(rawHours(entry({ id: 1 }))).toBe(8);
  });

  it('una jornada abierta todavía no mide nada', () => {
    expect(rawHours(entry({ id: 1, clock_out: null }))).toBe(0);
    expect(netHours(entry({ id: 1, clock_out: null }))).toBe(0);
  });

  it('descuenta el descanso no retribuido', () => {
    expect(netHours(entry({ id: 1 }))).toBe(7.5);
  });

  it('un descanso desproporcionado no deja el neto en negativo', () => {
    expect(netHours(entry({ id: 1, break_minutes: 600 }))).toBe(0);
  });

  it('parte las horas por el umbral diario', () => {
    const long = entry({ id: 1, clock_out: at(30, 19), break_minutes: 0 });
    expect(regularHours(long)).toBe(8);
    expect(overtimeHours(long)).toBe(3);
  });

  it('sin exceso no hay horas extra', () => {
    expect(overtimeHours(entry({ id: 1 }))).toBe(0);
  });

  it('ignora marcas invertidas en vez de devolver horas negativas', () => {
    expect(rawHours(entry({ id: 1, clock_in: at(30, 16), clock_out: at(30, 8) }))).toBe(0);
  });

  it('formatea horas y descanso para la parrilla', () => {
    expect(formatHours(7.5)).toBe('7.50 hrs');
    expect(formatBreak(45)).toBe('45 min');
    expect(formatBreak(0)).toBe('—');
  });
});

describe('clasificación de la jornada', () => {
  const now = new Date(2026, 7, 30, 14, 0, 0);

  it('sin salida y el mismo día, sigue en curso', () => {
    const open = entry({ id: 1, clock_out: null });
    expect(classifyEntry(open, now)).toBe('on_duty');
    expect(isOnDuty(open)).toBe(true);
  });

  it('sin salida y con el día ya cerrado, es una incidencia', () => {
    const stale = entry({ id: 1, clock_in: at(28, 8), clock_out: null });
    expect(classifyEntry(stale, now)).toBe('missed_punch');
  });

  it('marca horas extra cuando supera el umbral', () => {
    expect(
      classifyEntry(entry({ id: 1, clock_out: at(30, 19), break_minutes: 0 }), now),
    ).toBe('overtime');
  });

  it('marca tarde cuando entra fuera del margen de cortesía', () => {
    const late = entry({
      id: 1,
      clock_in: at(30, 8, 15),
      shift: { id: 7, startTime: at(30, 8) },
    });
    expect(classifyEntry(late, now)).toBe('tardy');
    expect(tardyMinutes(late)).toBe(15);
    expect(tardyLabel(late)).toBe('+15m Late');
  });

  it('dentro del margen de cortesía sigue siendo puntual', () => {
    const slightly = entry({
      id: 1,
      clock_in: at(30, 8, 3),
      shift: { id: 7, startTime: at(30, 8) },
    });
    expect(classifyEntry(slightly, now)).toBe('on_time');
    expect(tardyLabel(slightly)).toBe('');
  });

  it('sin turno programado no hay con qué comparar el retraso', () => {
    expect(tardyMinutes(entry({ id: 1, shift: null }))).toBe(0);
    expect(classifyEntry(entry({ id: 1 }), now)).toBe('on_time');
  });

  it('la hora extra pesa más que el retraso', () => {
    const both = entry({
      id: 1,
      clock_in: at(30, 8, 30),
      clock_out: at(30, 20),
      break_minutes: 0,
      shift: { id: 7, startTime: at(30, 8) },
    });
    expect(classifyEntry(both, now)).toBe('overtime');
  });
});

describe('presentación', () => {
  it('formatea la marca en 12 horas', () => {
    expect(clockTime(at(30, 8, 3))).toBe('08:03 AM');
    expect(clockTime(at(30, 16, 15))).toBe('04:15 PM');
    expect(clockTime(null)).toBe('—');
  });

  it('formatea la fecha de la jornada', () => {
    expect(entryDate(at(30, 8))).toBe('Aug 30, 2026');
  });

  it('compone las referencias de la historia', () => {
    expect(timeEntryRef(42)).toBe('#TME-42');
    expect(collaboratorRefOf(4)).toBe('#CLB-4');
  });

  it('la clave de día es local, no UTC', () => {
    // 23:50 pertenece a su propio día aunque en UTC ya sea el siguiente.
    expect(dateKey(new Date(2026, 7, 30, 23, 50))).toBe('2026-08-30');
  });
});

describe('filtros', () => {
  const now = new Date(2026, 7, 30, 14, 0, 0);
  const rows = [
    entry({ id: 1, collaborator: { id: 4, name: 'Juan Pérez', role: 'waiter' } }),
    entry({
      id: 2,
      collaborator_id: 5,
      collaborator: { id: 5, name: 'Ana Rivas', role: 'cook' },
      clock_in: at(29, 8),
      clock_out: at(29, 16),
    }),
  ];

  it('arranca en la semana en curso', () => {
    // 30 de agosto de 2026 es domingo: la semana va del lunes 24 al domingo 30.
    expect(currentWeekRange(new Date(2026, 7, 30))).toEqual({
      from: '2026-08-24',
      to: '2026-08-30',
    });
  });

  it('busca por nombre, #TME y #CLB', () => {
    expect(timeEntryHaystack(rows[0])).toContain('juan pérez');
    expect(timeEntryHaystack(rows[0])).toContain('#tme-1');
    expect(timeEntryHaystack(rows[0])).toContain('#clb-4');
  });

  it('filtra por rol', () => {
    const out = filterTimeEntries(
      rows,
      { ...defaultTimeEntryFilters(now), role: 'cook' },
      now,
    );
    expect(out.map((e) => e.id)).toEqual([2]);
  });

  it('filtra por estado derivado', () => {
    const open = entry({ id: 3, clock_out: null });
    const out = filterTimeEntries(
      [...rows, open],
      { ...defaultTimeEntryFilters(now), status: 'on_duty' },
      now,
    );
    expect(out.map((e) => e.id)).toEqual([3]);
  });

  it('filtra por rango de fechas', () => {
    const out = filterTimeEntries(
      rows,
      { ...defaultTimeEntryFilters(now), from: '2026-08-30', to: '2026-08-30' },
      now,
    );
    expect(out.map((e) => e.id)).toEqual([1]);
  });

  it('el rango por defecto no cuenta como filtro activo', () => {
    expect(hasActiveTimeFilters(defaultTimeEntryFilters(now), now)).toBe(false);
    expect(
      hasActiveTimeFilters({ ...defaultTimeEntryFilters(now), role: 'cook' }, now),
    ).toBe(true);
  });
});

describe('guardas del formulario', () => {
  it('rechaza una salida anterior o igual a la entrada', () => {
    expect(chronologyError(at(30, 16), at(30, 8))).toContain('must be after');
    expect(chronologyError(at(30, 8), at(30, 8))).toContain('must be after');
  });

  it('acepta un intervalo correcto', () => {
    expect(chronologyError(at(30, 8), at(30, 16))).toBe('');
  });

  it('sin salida no hay cronología que validar', () => {
    expect(chronologyError(at(30, 8), '')).toBe('');
  });

  it('detecta el solapamiento con otro fichaje del mismo colaborador', () => {
    const existing = [entry({ id: 9, clock_in: at(30, 7), clock_out: at(30, 12) })];
    const clash = overlappingEntry(existing, 4, at(30, 8), at(30, 16));
    expect(clash?.id).toBe(9);
    expect(overlapError(clash!)).toContain('#TME-9');
  });

  it('una jornada abierta bloquea cualquier fichaje posterior', () => {
    const existing = [entry({ id: 9, clock_in: at(30, 6), clock_out: null })];
    expect(overlappingEntry(existing, 4, at(30, 20), at(30, 22))?.id).toBe(9);
  });

  it('no colisiona con fichajes de otro colaborador', () => {
    const existing = [entry({ id: 9, collaborator_id: 99, clock_in: at(30, 7), clock_out: at(30, 12) })];
    expect(overlappingEntry(existing, 4, at(30, 8), at(30, 16))).toBeNull();
  });

  it('al editar, el propio fichaje no cuenta como solapamiento', () => {
    const existing = [entry({ id: 9 })];
    expect(overlappingEntry(existing, 4, at(30, 8), at(30, 16), 9)).toBeNull();
  });

  it('intervalos que sólo se tocan en el extremo no solapan', () => {
    const existing = [entry({ id: 9, clock_in: at(30, 16), clock_out: at(30, 20) })];
    expect(overlappingEntry(existing, 4, at(30, 8), at(30, 16))).toBeNull();
  });
});

describe('export de nómina', () => {
  const now = new Date(2026, 7, 30, 14, 0, 0);
  const rows = [
    entry({ id: 1, clock_out: at(30, 19), break_minutes: 60 }), // 10 netas: 8 + 2 extra
    entry({ id: 2, clock_in: at(29, 8), clock_out: at(29, 16), break_minutes: 30 }), // 7,5
    entry({
      id: 3,
      collaborator_id: 5,
      collaborator: { id: 5, name: 'Ana Rivas', role: 'cook' },
      clock_in: at(28, 8),
      clock_out: null,
    }),
  ];

  it('agrega por colaborador sumando ordinarias y extra', () => {
    const sheet = buildTimesheet(rows, now);
    const juan = sheet.find((r) => r.collaboratorId === 4);
    expect(juan).toMatchObject({
      entries: 2,
      regularHours: 15.5, // 8 + 7,5
      overtimeHours: 2,
      breakMinutes: 90,
    });
  });

  it('cuenta las incidencias de fichaje sin cerrar', () => {
    const ana = buildTimesheet(rows, now).find((r) => r.collaboratorId === 5);
    expect(ana?.missedPunches).toBe(1);
  });

  it('ordena por nombre para que el CSV sea comparable entre semanas', () => {
    expect(buildTimesheet(rows, now).map((r) => r.collaboratorName)).toEqual([
      'Ana Rivas',
      'Juan Pérez',
    ]);
  });

  it('genera un CSV con cabecera y totales', () => {
    const csv = buildTimesheetCsv(buildTimesheet(rows, now));
    const lines = csv.split('\n');
    expect(lines[0]).toBe(TIMESHEET_HEADERS.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('#CLB-4');
    expect(lines[2]).toContain('15.50');
    expect(lines[2]).toContain('2.00');
  });

  it('entrecomilla los campos con coma para no romper la tabla', () => {
    const csv = buildTimesheetCsv(
      buildTimesheet([entry({ id: 1, collaborator: { id: 4, name: 'Pérez, Juan', role: 'waiter' } })], now),
    );
    expect(csv).toContain('"Pérez, Juan"');
  });
});
