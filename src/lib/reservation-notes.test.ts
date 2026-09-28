import { describe, expect, it } from 'vitest';
import {
  EMPTY_NOTE_FILTERS,
  QUICK_TAGS,
  applyQuickTag,
  authorLabel,
  categoryOf,
  computeNotesMetrics,
  exactTimestamp,
  hasActiveNoteFilters,
  isPriorityNote,
  matchesNoteFilters,
  noteTextError,
  noteTimestampLabel,
  relativeTime,
  sortNotesByRecency,
  type NoteWithContext,
} from './reservation-notes';

const tagBy = (label: string) => QUICK_TAGS.find((t) => t.label === label)!;

const note = (over: Partial<NoteWithContext> & { id: number; note: string }): NoteWithContext => ({
  reservation_id: 1,
  is_active: true,
  created_by: 4,
  created_at: new Date(2026, 3, 16, 18, 45, 0).toISOString(),
  reservationLabel: 'Carlos Mendoza',
  category: categoryOf({ note: over.note }),
  ...over,
});

describe('etiquetas rápidas', () => {
  it('inserta el prefijo delante de una nota vacía', () => {
    expect(applyQuickTag('', tagBy('Allergy'))).toBe('[ALLERGY] ');
  });

  it('conserva el texto ya escrito', () => {
    expect(applyQuickTag('Peanut allergy on seat 2', tagBy('Allergy'))).toBe(
      '[ALLERGY] Peanut allergy on seat 2',
    );
  });

  it('no duplica el prefijo al pulsar dos veces la misma etiqueta', () => {
    const once = applyQuickTag('Quiet booth', tagBy('Seating'));
    expect(applyQuickTag(once, tagBy('Seating'))).toBe(once);
  });

  it('sustituye la etiqueta anterior: una nota tiene una sola categoría', () => {
    const allergy = applyQuickTag('Table by the window', tagBy('Allergy'));
    expect(applyQuickTag(allergy, tagBy('Seating'))).toBe('[SEATING] Table by the window');
  });

  it('ofrece las cuatro categorías de la historia', () => {
    expect(QUICK_TAGS.map((t) => t.prefix)).toEqual([
      '[ALLERGY]',
      '[OCCASION]',
      '[SEATING]',
      '[VIP]',
    ]);
  });
});

describe('clasificación de la nota', () => {
  it('reconoce el prefijo de la etiqueta rápida', () => {
    expect(categoryOf({ note: '[ALLERGY] peanut' })).toBe('allergy');
    expect(categoryOf({ note: '[OCCASION] 10th anniversary' })).toBe('occasion');
    expect(categoryOf({ note: '[SEATING] quiet booth' })).toBe('seating');
    expect(categoryOf({ note: '[VIP] corporate exec' })).toBe('vip');
  });

  it('reconoce también una nota escrita a mano', () => {
    // Nadie escribe siempre el prefijo; la palabra tiene que bastar para que salte el aviso.
    expect(categoryOf({ note: 'Guest is coeliac, no gluten please' })).toBe('allergy');
    expect(categoryOf({ note: "It's her birthday, bring a candle" })).toBe('occasion');
  });

  it('una nota corriente cae en general', () => {
    expect(categoryOf({ note: 'Paying by company card' })).toBe('general');
  });

  it('una alergia gana a cualquier otra categoría en la misma nota', () => {
    expect(categoryOf({ note: 'Birthday dinner, severe nut allergy on seat 3' })).toBe('allergy');
  });

  it('sólo alergia y VIP/urgente son de prioridad', () => {
    expect(isPriorityNote({ note: '[ALLERGY] shellfish' })).toBe(true);
    expect(isPriorityNote({ note: '[VIP] priority service' })).toBe(true);
    expect(isPriorityNote({ note: 'URGENT: table must be ready at 8' })).toBe(true);
    expect(isPriorityNote({ note: '[SEATING] window' })).toBe(false);
    expect(isPriorityNote({ note: '[OCCASION] birthday' })).toBe(false);
  });
});

describe('validación', () => {
  it('rechaza una nota vacía', () => {
    expect(noteTextError('')).toBe('The note cannot be empty');
  });

  it('rechaza una nota de puros espacios', () => {
    // @IsNotEmpty por sí solo la daría por buena; el DTO recorta antes justamente por esto.
    expect(noteTextError('    \n\t  ')).toBe('The note cannot be empty');
  });

  it('acepta cualquier nota con contenido', () => {
    expect(noteTextError('  ok  ')).toBe('');
  });
});

describe('sellos de tiempo', () => {
  const base = new Date(2026, 3, 16, 18, 45, 0);

  it('dice "Just now" en el primer minuto', () => {
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 16, 18, 45, 30))).toBe('Just now');
  });

  it('cuenta minutos, horas y días', () => {
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 16, 18, 55))).toBe('10 mins ago');
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 16, 19, 45))).toBe('1 hour ago');
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 18, 18, 45))).toBe('2 days ago');
  });

  it('un reloj adelantado no produce tiempos negativos', () => {
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 16, 18, 40))).toBe('Just now');
  });

  it('formatea el sello exacto en día/mes/año y 24 h', () => {
    expect(exactTimestamp(base.toISOString())).toBe('16/04/2026 18:45');
  });

  it('compone la etiqueta que pide la historia', () => {
    expect(noteTimestampLabel(base.toISOString(), new Date(2026, 3, 16, 18, 55))).toBe(
      '10 mins ago • 16/04/2026 18:45',
    );
  });

  it('sin fecha no inventa nada', () => {
    expect(noteTimestampLabel(null)).toBe('—');
  });
});

describe('firma del autor', () => {
  it('usa el nombre y el rol del colaborador cuando se conoce', () => {
    const staff = new Map([[4, { name: 'Ana Ruiz', role: 'host' }]]);
    expect(authorLabel(4, staff)).toBe('Ana Ruiz (Host)');
  });

  it('cae al id cuando el catálogo de personal no está disponible', () => {
    // 403 si el plan no incluye colaboradores: la nota sigue atribuida.
    expect(authorLabel(4, new Map())).toBe('Staff #4');
    expect(authorLabel(4)).toBe('Staff #4');
  });

  it('una nota sin autor se atribuye al sistema', () => {
    expect(authorLabel(null)).toBe('System');
  });
});

describe('orden del feed', () => {
  it('ordena en cronológico inverso estricto', () => {
    const rows = [
      note({ id: 1, note: 'first', created_at: new Date(2026, 3, 16, 18, 0).toISOString() }),
      note({ id: 2, note: 'third', created_at: new Date(2026, 3, 16, 20, 0).toISOString() }),
      note({ id: 3, note: 'second', created_at: new Date(2026, 3, 16, 19, 0).toISOString() }),
    ];
    expect(sortNotesByRecency(rows).map((n) => n.id)).toEqual([2, 3, 1]);
  });

  it('desempata por id cuando dos notas comparten sello', () => {
    const stamp = new Date(2026, 3, 16, 18, 0).toISOString();
    const rows = [
      note({ id: 5, note: 'a', created_at: stamp }),
      note({ id: 9, note: 'b', created_at: stamp }),
    ];
    expect(sortNotesByRecency(rows).map((n) => n.id)).toEqual([9, 5]);
  });

  it('no muta el array original', () => {
    const rows = [note({ id: 1, note: 'a' }), note({ id: 2, note: 'b' })];
    sortNotesByRecency(rows);
    expect(rows.map((n) => n.id)).toEqual([1, 2]);
  });
});

describe('filtros del feed', () => {
  const allergy = note({ id: 1, note: '[ALLERGY] peanut on seat 2' });
  const seating = note({
    id: 2,
    note: '[SEATING] quiet booth',
    reservationLabel: 'Lucía Prat',
    reservation_id: 7,
  });

  it('sin filtros no esconde nada', () => {
    expect(hasActiveNoteFilters(EMPTY_NOTE_FILTERS)).toBe(false);
    expect(matchesNoteFilters(allergy, EMPTY_NOTE_FILTERS)).toBe(true);
  });

  it('filtra por categoría', () => {
    const filters = { ...EMPTY_NOTE_FILTERS, categories: ['allergy' as const] };
    expect(matchesNoteFilters(allergy, filters)).toBe(true);
    expect(matchesNoteFilters(seating, filters)).toBe(false);
  });

  it('busca en el cuerpo de la nota', () => {
    expect(matchesNoteFilters(allergy, { ...EMPTY_NOTE_FILTERS, search: 'peanut' })).toBe(true);
  });

  it('busca por nombre del comensal', () => {
    expect(matchesNoteFilters(seating, { ...EMPTY_NOTE_FILTERS, search: 'lucía' })).toBe(true);
  });

  it('busca por código de reserva', () => {
    expect(matchesNoteFilters(seating, { ...EMPTY_NOTE_FILTERS, search: '#res-7' })).toBe(true);
  });
});

describe('KPIs del turno', () => {
  const shift = [
    note({ id: 1, note: '[ALLERGY] peanut' }),
    note({ id: 2, note: '[ALLERGY] gluten' }),
    note({ id: 3, note: '[OCCASION] birthday' }),
    note({ id: 4, note: '[VIP] corporate' }),
    note({ id: 5, note: 'Paying by card' }),
  ];

  it('agrega el total, las alergias y las ocasiones', () => {
    const m = computeNotesMetrics(shift);
    expect(m.totalNotes).toBe(5);
    expect(m.allergyAlerts).toBe(2);
    expect(m.specialOccasions).toBe(1);
  });

  it('cuenta como prioritarias las alergias y los VIP', () => {
    expect(computeNotesMetrics(shift).priorityNotes).toBe(3);
  });

  it('un turno sin notas da ceros', () => {
    expect(computeNotesMetrics([])).toEqual({
      totalNotes: 0,
      allergyAlerts: 0,
      specialOccasions: 0,
      priorityNotes: 0,
    });
  });
});
