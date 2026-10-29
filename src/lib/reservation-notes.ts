// Reservation note book rules: what is a priority note, to what category
// belongs, and how its age can be read at a glance.
//
// The classification is done by KEYWORD on the free text, not by a column: the
// entity `reservation_note` only has `note` (text). Quick Drawer Labels
// They write a standard prefix ("[ALLERGY] ...") precisely so that this reading is reliable,
// but a handwritten note with the word "allergy" also has to jump — from that
// It depends on which kitchen finds out.

import type { ReservationNote } from '../types/reservation';

// ================= Quick Tags =================

export type NoteCategory = 'allergy' | 'occasion' | 'seating' | 'vip' | 'general';

export interface QuickTag {
  category: Exclude<NoteCategory, 'general'>;
  /** Prefix that is inserted in the body of the note. */
  prefix: string;
  label: string;
  icon: string;
  placeholder: string;
}

export const QUICK_TAGS: QuickTag[] = [
  {
    category: 'allergy',
    prefix: '[ALLERGY]',
    label: 'Allergy',
    icon: 'medical_services',
    placeholder: 'Severe peanut allergy on Seat 2',
  },
  {
    category: 'occasion',
    prefix: '[OCCASION]',
    label: 'Occasion',
    icon: 'celebration',
    placeholder: 'Celebrating 10th Anniversary — bring dessert with candle',
  },
  {
    category: 'seating',
    prefix: '[SEATING]',
    label: 'Seating',
    icon: 'chair',
    placeholder: 'Prefers quiet booth near window',
  },
  {
    category: 'vip',
    prefix: '[VIP]',
    label: 'VIP',
    icon: 'workspace_premium',
    placeholder: 'Corporate executive — priority service',
  },
];

/**
 * Inserts a tag prefix at the beginning of the note.
 *
 * If the note ALREADY begins with that prefix, it is not duplicated (pressing "Allergy" twice should not
 * leave "[ALLERGY] [ALLERGY]..."), and if it begins with another known prefix, it is replaced: a
 * note is from one category, not three.
 */
export const applyQuickTag = (current: string, tag: QuickTag): string => {
  const stripped = stripKnownPrefix(current).trimStart();
  return stripped ? `${tag.prefix} ${stripped}` : `${tag.prefix} `;
};

const KNOWN_PREFIXES = QUICK_TAGS.map((t) => t.prefix);

const stripKnownPrefix = (text: string): string => {
  const trimmed = text.trimStart();
  const hit = KNOWN_PREFIXES.find((p) => trimmed.toUpperCase().startsWith(p));
  return hit ? trimmed.slice(hit.length) : trimmed;
};

// ================= Ranking =================

// Words that mark a note as criticism. They are compared in lower case over the entire text,
// so they cover both the prefix "[ALLERGY]" and a handwritten phrase.
const CATEGORY_KEYWORDS: Record<Exclude<NoteCategory, 'general'>, string[]> = {
  allergy: [
    'allergy',
    'allergic',
    'allergen',
    'intolerance',
    'coeliac',
    'celiac',
    'gluten',
    'peanut',
    'nut-free',
    'shellfish',
    'lactose',
  ],
  occasion: [
    'occasion',
    'birthday',
    'anniversary',
    'celebration',
    'celebrating',
    'engagement',
    'graduation',
  ],
  vip: ['vip', 'urgent', 'priority', 'critical'],
  seating: ['seating', 'booth', 'window', 'terrace', 'quiet', 'wheelchair', 'high chair'],
};

export const categoryOf = (note: Pick<ReservationNote, 'note'>): NoteCategory => {
  const text = (note.note ?? '').toLowerCase();
  // Order matters: a note mentioning allergy AND birthday is, first and foremost, an allergy.
  if (CATEGORY_KEYWORDS.allergy.some((k) => text.includes(k))) return 'allergy';
  if (CATEGORY_KEYWORDS.vip.some((k) => text.includes(k))) return 'vip';
  if (CATEGORY_KEYWORDS.occasion.some((k) => text.includes(k))) return 'occasion';
  if (CATEGORY_KEYWORDS.seating.some((k) => text.includes(k))) return 'seating';
  return 'general';
};

export const NOTE_CATEGORIES: NoteCategory[] = [
  'allergy',
  'occasion',
  'seating',
  'vip',
  'general',
];

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  allergy: 'Allergies',
  occasion: 'Occasions',
  seating: 'Seating',
  vip: 'VIP',
  general: 'General',
};

export const NOTE_CATEGORY_ICONS: Record<NoteCategory, string> = {
  allergy: 'medical_services',
  occasion: 'cake',
  seating: 'chair',
  vip: 'workspace_premium',
  general: 'sticky_note_2',
};

// Red danger for allergies and amber warning for the VIP, just as the story demands; the rest
// They stay in neutral tones so that the two critics really stand out. The classes are
// written integer because the Tailwind JIT reads the file as plain text: one composed in
// runtime does not generate CSS.
// Each entry comes with the FULL border (neutral outline + colored side stripe). Before the
// card put its own `border border-[#e8e2d8]` and this added `border-[#ef4444]` on top:
// two border color utilities with the SAME specificity, so who won was decided
// the order in which Tailwind emits them, not the order in which they are written to the className. The
// enhancement of an allergy cannot depend on that.
export const NOTE_CATEGORY_STYLES: Record<NoteCategory, string> = {
  allergy: 'border border-[#ef4444]/30 border-l-4 border-l-[#ef4444] bg-[#ef4444]/5',
  vip: 'border border-[#f59e0b]/30 border-l-4 border-l-[#f59e0b] bg-[#f59e0b]/5',
  occasion: 'border border-[#8b5cf6]/30 border-l-4 border-l-[#8b5cf6] bg-[#8b5cf6]/5',
  seating: 'border border-[#3b82f6]/30 border-l-4 border-l-[#3b82f6] bg-[#3b82f6]/5',
  general: 'border border-[#e8e2d8] border-l-4 border-l-[#e8e2d8] bg-white',
};

export const NOTE_CATEGORY_PILL_STYLES: Record<NoteCategory, string> = {
  allergy: 'bg-[#ef4444]/15 text-[#b91c1c] border border-[#ef4444]/40',
  vip: 'bg-[#f59e0b]/15 text-[#b45309] border border-[#f59e0b]/40',
  occasion: 'bg-[#8b5cf6]/15 text-[#6d28d9] border border-[#8b5cf6]/40',
  seating: 'bg-[#3b82f6]/15 text-[#1d4ed8] border border-[#3b82f6]/40',
  general: 'bg-[#ece8e0] text-[#5f5e5e] border border-[#e8e2d8]',
};

// Allergies and VIP/urgent are what stop a waiter from passing. The others report.
export const isPriorityNote = (note: Pick<ReservationNote, 'note'>): boolean => {
  const category = categoryOf(note);
  return category === 'allergy' || category === 'vip';
};

// ================= Validation =================

// The DTO cuts before validating, so a grade of pure spaces is a 400. It is checked
// here so that the drawer says it in your language instead of showing the raw server error.
export const noteTextError = (raw: string): string => {
  if (!raw.trim()) return 'The note cannot be empty';
  return '';
};

// ================= Presentation =================

/** "10 mins ago", "3 hours ago", "Just now". */
export const relativeTime = (iso?: string | null, now: Date = new Date()): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = now.getTime() - then;
  // An advanced tablet clock should not produce "-3 minutes ago."
  if (diffMs < 0) return 'Just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/** "04/16/2026 18:45" — day/month/year and 24-hour clock, hand-built to not depend on ICU. */
export const exactTimestamp = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "10 mins ago • 16/04/2026 18:45". */
export const noteTimestampLabel = (iso?: string | null, now: Date = new Date()): string => {
  const relative = relativeTime(iso, now);
  const exact = exactTimestamp(iso);
  if (!relative && !exact) return '—';
  return `${relative} • ${exact}`;
};

// The catalog of collaborators may not be available (403 if the plan does not include it), so
// that the signature falls to the id: "Staff #4" is still a usable attribution.
export const authorLabel = (
  createdBy?: number | null,
  staffById?: Map<number, { name?: string; role?: string }>,
): string => {
  if (createdBy == null) return 'System';
  const staff = staffById?.get(createdBy);
  if (!staff) return `Staff #${createdBy}`;
  const name = staff.name?.trim() || `Staff #${createdBy}`;
  return staff.role ? `${name} (${titleCase(staff.role)})` : name;
};

const titleCase = (raw: string): string =>
  raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ================= Feed =================

export interface NoteWithContext extends ReservationNote {
  /** Reservation to the one that hangs up, already resolved to be able to search by guest name. */
  reservationLabel: string;
  category: NoteCategory;
}

// STRICT reverse chronological order, which is what the acceptance criteria asks for. The
// backend already returns created_at DESC, but the feed mixes notes from multiple reservations (they come
// embedded in each one), so we have to reorder the whole.
export const sortNotesByRecency = <T extends { created_at?: string; id: number }>(
  notes: T[],
): T[] =>
  [...notes].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    // Two notes saved at the same second are untied by id: the last one inserted above.
    return tb - ta || b.id - a.id;
  });

export interface NoteFilters {
  search: string;
  /** Empty = unfiltered. */
  categories: NoteCategory[];
}

export const EMPTY_NOTE_FILTERS: NoteFilters = { search: '', categories: [] };

export const hasActiveNoteFilters = (f: NoteFilters): boolean =>
  f.search.trim().length > 0 || f.categories.length > 0;

export const matchesNoteFilters = (
  note: NoteWithContext,
  filters: NoteFilters,
): boolean => {
  if (filters.categories.length > 0 && !filters.categories.includes(note.category)) {
    return false;
  }
  const term = filters.search.trim().toLowerCase();
  if (!term) return true;
  return [note.note, note.reservationLabel, `#res-${note.reservation_id}`]
    .join(' ')
    .toLowerCase()
    .includes(term);
};

// ================= Shift KPIs =================

export interface NotesMetrics {
  totalNotes: number;
  allergyAlerts: number;
  specialOccasions: number;
  priorityNotes: number;
}

export const computeNotesMetrics = (notes: NoteWithContext[]): NotesMetrics => {
  let allergyAlerts = 0;
  let specialOccasions = 0;
  let priorityNotes = 0;

  for (const note of notes) {
    if (note.category === 'allergy') allergyAlerts += 1;
    if (note.category === 'occasion') specialOccasions += 1;
    if (note.category === 'allergy' || note.category === 'vip') priorityNotes += 1;
  }

  return {
    totalNotes: notes.length,
    allergyAlerts,
    specialOccasions,
    priorityNotes,
  };
};
