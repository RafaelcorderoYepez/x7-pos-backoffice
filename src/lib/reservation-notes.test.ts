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

describe('quick tags', () => {
  it('insert the prefix in front of an empty note', () => {
    expect(applyQuickTag('', tagBy('Allergy'))).toBe('[ALLERGY] ');
  });

  it('preserves the already written text', () => {
    expect(applyQuickTag('Peanut allergy on seat 2', tagBy('Allergy'))).toBe(
      '[ALLERGY] Peanut allergy on seat 2',
    );
  });

  it('does not duplicate the prefix when clicking the same label twice', () => {
    const once = applyQuickTag('Quiet booth', tagBy('Seating'));
    expect(applyQuickTag(once, tagBy('Seating'))).toBe(once);
  });

  it('replaces the previous tag: a note has only one category', () => {
    const allergy = applyQuickTag('Table by the window', tagBy('Allergy'));
    expect(applyQuickTag(allergy, tagBy('Seating'))).toBe('[SEATING] Table by the window');
  });

  it('offers the four categories of history', () => {
    expect(QUICK_TAGS.map((t) => t.prefix)).toEqual([
      '[ALLERGY]',
      '[OCCASION]',
      '[SEATING]',
      '[VIP]',
    ]);
  });
});

describe('note classification', () => {
  it('recognize quick tag prefix', () => {
    expect(categoryOf({ note: '[ALLERGY] peanut' })).toBe('allergy');
    expect(categoryOf({ note: '[OCCASION] 10th anniversary' })).toBe('occasion');
    expect(categoryOf({ note: '[SEATING] quiet booth' })).toBe('seating');
    expect(categoryOf({ note: '[VIP] corporate exec' })).toBe('vip');
  });

  it('also recognizes a handwritten note', () => {
    // Nobody always writes the prefix; The word has to be enough for the warning to go off.
    expect(categoryOf({ note: 'Guest is coeliac, no gluten please' })).toBe('allergy');
    expect(categoryOf({ note: "It's her birthday, bring a candle" })).toBe('occasion');
  });

  it('an ordinary note generally falls', () => {
    expect(categoryOf({ note: 'Paying by company card' })).toBe('general');
  });

  it('an allergy beats any other category on the same score', () => {
    expect(categoryOf({ note: 'Birthday dinner, severe nut allergy on seat 3' })).toBe('allergy');
  });

  it('only allergy and VIP/urgent are priority', () => {
    expect(isPriorityNote({ note: '[ALLERGY] shellfish' })).toBe(true);
    expect(isPriorityNote({ note: '[VIP] priority service' })).toBe(true);
    expect(isPriorityNote({ note: 'URGENT: table must be ready at 8' })).toBe(true);
    expect(isPriorityNote({ note: '[SEATING] window' })).toBe(false);
    expect(isPriorityNote({ note: '[OCCASION] birthday' })).toBe(false);
  });
});

describe('validation', () => {
  it('reject an empty note', () => {
    expect(noteTextError('')).toBe('The note cannot be empty');
  });

  it('rejects a note of pure spaces', () => {
    // @IsNotEmpty by itself I would consider it good; The DTO cuts earlier precisely for this.
    expect(noteTextError('    \n\t  ')).toBe('The note cannot be empty');
  });

  it('accept any note with content', () => {
    expect(noteTextError('  ok  ')).toBe('');
  });
});

describe('time stamps', () => {
  const base = new Date(2026, 3, 16, 18, 45, 0);

  it('dice "Just now" en el primer minuto', () => {
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 16, 18, 45, 30))).toBe('Just now');
  });

  it('counts minutes, hours and days', () => {
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 16, 18, 55))).toBe('10 mins ago');
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 16, 19, 45))).toBe('1 hour ago');
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 18, 18, 45))).toBe('2 days ago');
  });

  it('un reloj adelantado no produce tiempos negativos', () => {
    expect(relativeTime(base.toISOString(), new Date(2026, 3, 16, 18, 40))).toBe('Just now');
  });

  it('formats the exact stamp in day/month/year and 24 hours', () => {
    expect(exactTimestamp(base.toISOString())).toBe('16/04/2026 18:45');
  });

  it('compose the label that history asks for', () => {
    expect(noteTimestampLabel(base.toISOString(), new Date(2026, 3, 16, 18, 55))).toBe(
      '10 mins ago • 16/04/2026 18:45',
    );
  });

  it('without a date it does not invent anything', () => {
    expect(noteTimestampLabel(null)).toBe('—');
  });
});

describe('author signature', () => {
  it('uses the collaborator name and role when known', () => {
    const staff = new Map([[4, { name: 'Ana Ruiz', role: 'host' }]]);
    expect(authorLabel(4, staff)).toBe('Ana Ruiz (Host)');
  });

  it('drops to id when staff catalog is not available', () => {
    // 403 if the plan does not include collaborators: the grade remains attributed.
    expect(authorLabel(4, new Map())).toBe('Staff #4');
    expect(authorLabel(4)).toBe('Staff #4');
  });

  it('a note without an author is attributed to the system', () => {
    expect(authorLabel(null)).toBe('System');
  });
});

describe('feed order', () => {
  it('arranged in strict reverse chronological order', () => {
    const rows = [
      note({ id: 1, note: 'first', created_at: new Date(2026, 3, 16, 18, 0).toISOString() }),
      note({ id: 2, note: 'third', created_at: new Date(2026, 3, 16, 20, 0).toISOString() }),
      note({ id: 3, note: 'second', created_at: new Date(2026, 3, 16, 19, 0).toISOString() }),
    ];
    expect(sortNotesByRecency(rows).map((n) => n.id)).toEqual([2, 3, 1]);
  });

  it('break ties by id when two notes share a stamp', () => {
    const stamp = new Date(2026, 3, 16, 18, 0).toISOString();
    const rows = [
      note({ id: 5, note: 'a', created_at: stamp }),
      note({ id: 9, note: 'b', created_at: stamp }),
    ];
    expect(sortNotesByRecency(rows).map((n) => n.id)).toEqual([9, 5]);
  });

  it('does not mutate the original array', () => {
    const rows = [note({ id: 1, note: 'a' }), note({ id: 2, note: 'b' })];
    sortNotesByRecency(rows);
    expect(rows.map((n) => n.id)).toEqual([1, 2]);
  });
});

describe('feed filters', () => {
  const allergy = note({ id: 1, note: '[ALLERGY] peanut on seat 2' });
  const seating = note({
    id: 2,
    note: '[SEATING] quiet booth',
    reservationLabel: 'Lucia Prat',
    reservation_id: 7,
  });

  it('without filters it hides nothing', () => {
    expect(hasActiveNoteFilters(EMPTY_NOTE_FILTERS)).toBe(false);
    expect(matchesNoteFilters(allergy, EMPTY_NOTE_FILTERS)).toBe(true);
  });

  it('filter by category', () => {
    const filters = { ...EMPTY_NOTE_FILTERS, categories: ['allergy' as const] };
    expect(matchesNoteFilters(allergy, filters)).toBe(true);
    expect(matchesNoteFilters(seating, filters)).toBe(false);
  });

  it('search in the body of the note', () => {
    expect(matchesNoteFilters(allergy, { ...EMPTY_NOTE_FILTERS, search: 'peanut' })).toBe(true);
  });

  it('search by diner name', () => {
    expect(matchesNoteFilters(seating, { ...EMPTY_NOTE_FILTERS, search: 'lucia' })).toBe(true);
  });

  it('search by reservation code', () => {
    expect(matchesNoteFilters(seating, { ...EMPTY_NOTE_FILTERS, search: '#res-7' })).toBe(true);
  });
});

describe('Shift KPIs', () => {
  const shift = [
    note({ id: 1, note: '[ALLERGY] peanut' }),
    note({ id: 2, note: '[ALLERGY] gluten' }),
    note({ id: 3, note: '[OCCASION] birthday' }),
    note({ id: 4, note: '[VIP] corporate' }),
    note({ id: 5, note: 'Paying by card' }),
  ];

  it('add the total, allergies and occasions', () => {
    const m = computeNotesMetrics(shift);
    expect(m.totalNotes).toBe(5);
    expect(m.allergyAlerts).toBe(2);
    expect(m.specialOccasions).toBe(1);
  });

  it('Allergies and VIPs count as priorities', () => {
    expect(computeNotesMetrics(shift).priorityNotes).toBe(3);
  });

  it('a turn without marks gives zeros', () => {
    expect(computeNotesMetrics([])).toEqual({
      totalNotes: 0,
      allergyAlerts: 0,
      specialOccasions: 0,
      priorityNotes: 0,
    });
  });
});
