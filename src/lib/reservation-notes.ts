// Reglas del cuaderno de notas de reserva: qué es una nota de prioridad, a qué categoría
// pertenece, y cómo se lee su antigüedad de un vistazo.
//
// La clasificación se hace por PALABRA CLAVE sobre el texto libre, no por una columna: la
// entidad `reservation_note` sólo tiene `note` (text). Las etiquetas rápidas del drawer
// escriben un prefijo estándar ("[ALLERGY] ...") justamente para que esa lectura sea fiable,
// pero una nota escrita a mano con la palabra "allergy" también tiene que saltar — de eso
// depende que cocina se entere.

import type { ReservationNote } from '../types/reservation';

// ================= Etiquetas rápidas =================

export type NoteCategory = 'allergy' | 'occasion' | 'seating' | 'vip' | 'general';

export interface QuickTag {
  category: Exclude<NoteCategory, 'general'>;
  /** Prefijo que se inserta en el cuerpo de la nota. */
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
 * Inserta el prefijo de una etiqueta al principio de la nota.
 *
 * Si la nota YA empieza por ese prefijo no se duplica (pulsar dos veces "Allergy" no debe
 * dejar "[ALLERGY] [ALLERGY] ..."), y si empieza por otro prefijo conocido se sustituye: una
 * nota es de una categoría, no de tres.
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

// ================= Clasificación =================

// Palabras que marcan una nota como crítica. Se comparan en minúsculas sobre el texto entero,
// así que cubren tanto el prefijo "[ALLERGY]" como una frase escrita a mano.
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
    'alergia',
  ],
  occasion: [
    'occasion',
    'birthday',
    'anniversary',
    'celebration',
    'celebrating',
    'engagement',
    'graduation',
    'cumpleaños',
    'aniversario',
  ],
  vip: ['vip', 'urgent', 'priority', 'critical'],
  seating: ['seating', 'booth', 'window', 'terrace', 'quiet', 'wheelchair', 'high chair'],
};

export const categoryOf = (note: Pick<ReservationNote, 'note'>): NoteCategory => {
  const text = (note.note ?? '').toLowerCase();
  // El orden importa: una nota que menciona alergia Y cumpleaños es, ante todo, una alergia.
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

// Rojo peligro para la alergia y ámbar aviso para el VIP, tal como pide la historia; el resto
// se quedan en tonos neutros para que los dos críticos destaquen de verdad. Las clases están
// escritas enteras porque el JIT de Tailwind lee el fichero como texto plano: una compuesta en
// tiempo de ejecución no genera CSS.
// Cada entrada trae el borde COMPLETO (contorno neutro + franja lateral de color). Antes la
// tarjeta ponía su propio `border border-[#e8e2d8]` y esto añadía `border-[#ef4444]` encima:
// dos utilidades de color de borde con la MISMA especificidad, así que quién ganaba lo decidía
// el orden en que Tailwind las emite, no el orden en que se escriben en el className. El
// realce de una alergia no puede depender de eso.
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

// Alergias y VIP/urgente son las que paran a un camarero en el pase. Las demás informan.
export const isPriorityNote = (note: Pick<ReservationNote, 'note'>): boolean => {
  const category = categoryOf(note);
  return category === 'allergy' || category === 'vip';
};

// ================= Validación =================

// El DTO recorta antes de validar, así que una nota de puros espacios es un 400. Se comprueba
// aquí para que el drawer lo diga en su idioma en vez de enseñar el error crudo del servidor.
export const noteTextError = (raw: string): string => {
  if (!raw.trim()) return 'The note cannot be empty';
  return '';
};

// ================= Presentación =================

/** "10 mins ago", "3 hours ago", "Just now". */
export const relativeTime = (iso?: string | null, now: Date = new Date()): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = now.getTime() - then;
  // Un reloj de tablet adelantado no debe producir "hace -3 minutos".
  if (diffMs < 0) return 'Just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/** "16/04/2026 18:45" — día/mes/año y reloj de 24 h, construido a mano para no depender de ICU. */
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

// El catálogo de colaboradores puede no estar disponible (403 si el plan no lo incluye), así
// que la firma cae al id: "Staff #4" sigue siendo una atribución utilizable.
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
  /** Reserva a la que cuelga, ya resuelta para poder buscar por nombre de invitado. */
  reservationLabel: string;
  category: NoteCategory;
}

// Orden cronológico inverso ESTRICTO, que es lo que pide el criterio de aceptación. El
// backend ya devuelve created_at DESC, pero el feed mezcla notas de varias reservas (vienen
// embebidas en cada una), así que hay que reordenar el conjunto.
export const sortNotesByRecency = <T extends { created_at?: string; id: number }>(
  notes: T[],
): T[] =>
  [...notes].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    // Dos notas guardadas en el mismo segundo se desempatan por id: la última insertada arriba.
    return tb - ta || b.id - a.id;
  });

export interface NoteFilters {
  search: string;
  /** Vacío = sin filtrar. */
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

// ================= KPIs del turno =================

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
