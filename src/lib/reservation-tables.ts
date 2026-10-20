// Table assignment board rules: which table is free in a strip, which
// combination is suitable for a group, and if the assigned capacity covers the group.
//
// The module is pure (without fetch or React) because it is where the part that really needs to live lives.
// test: the suggestion engine and overlap detection. The DEFINITIVE guard against
// double fallback lives in the backend (409); here is to not even offer a table that
// the server is going to reject.

import type { DiningTable } from '../types/dining-system';
import type { Reservation, ReservationTableLink } from '../types/reservation';
import { reservationEnd, reservationStart, windowsOverlap } from './reservations';

// States in which the reservation is NO LONGER holding your table. exact mirror of
// TABLE_RELEASING_STATUSES in the backend: if the two lists diverge, the dashboard shows how
// free a table that the server considers occupied (or vice versa).
export const TABLE_RELEASING_STATUSES = new Set(['cancelled', 'no_show', 'completed']);

export const holdsItsTable = (reservation: Pick<Reservation, 'status'>): boolean =>
  !TABLE_RELEASING_STATUSES.has(reservation.status);

// Tables that can receive a group. A cleared or out of service table is not offered for
// much that is "free": no one can sit on it.
const ASSIGNABLE_TABLE_STATUSES = new Set([
  'available',
  'occupied',
  'reserved',
  'cleaning',
]);

export const isAssignableTable = (table: Pick<DiningTable, 'status'>): boolean =>
  ASSIGNABLE_TABLE_STATUSES.has((table.status ?? '').toLowerCase());

// ================= Asignaciones vivas =================

export const activeLinks = (reservation: Reservation): ReservationTableLink[] =>
  (reservation.tables ?? []).filter((t) => t.is_active);

export const assignedTableIds = (reservation: Reservation): number[] =>
  activeLinks(reservation).map((t) => t.table_id);

export const isUnassigned = (reservation: Reservation): boolean =>
  activeLinks(reservation).length === 0;

// A booking that the room has yet to resolve: it's still alive, it's going to arrive, and it doesn't have
// where to sit It is what feeds the header alert.
export const needsTable = (reservation: Reservation): boolean =>
  (reservation.status === 'pending' || reservation.status === 'confirmed') &&
  isUnassigned(reservation);

// ================= Occupation of a table in a strip =================

/**
 * Reservations that occupy `tableId` during the `target` window, excluding its own.
 *
 * Play the backend save so you can warn BEFORE sending: same exclusions from
 * status and same semi-open overlap, so a table marked as free here is not going to return
 * a 409 when saving.
 */
export const conflictsForTable = (
  tableId: number,
  target: Reservation,
  book: Reservation[],
): Reservation[] => {
  const start = reservationStart(target);
  const end = reservationEnd(target);

  return book
    .filter((r) => r.id !== target.id)
    .filter(holdsItsTable)
    .filter((r) => assignedTableIds(r).includes(tableId))
    .filter((r) => windowsOverlap(start, end, reservationStart(r), reservationEnd(r)));
};

export const isTableFreeFor = (
  tableId: number,
  target: Reservation,
  book: Reservation[],
): boolean => conflictsForTable(tableId, target, book).length === 0;

export const conflictMessage = (tableLabel: string, holder: Reservation): string =>
  `Table ${tableLabel} is already booked by #RES-${holder.id} during this window.`;

// ================= Aforo asignado =================

export interface AssignedCapacity {
  seats: number;
  tableCount: number;
  /** The assigned capacity covers the group. */
  sufficient: boolean;
  /** Spaces left to cover it (0 if there is excess). */
  shortfall: number;
}

export const assignedCapacity = (
  reservation: Reservation,
  tableById: Map<number, DiningTable>,
): AssignedCapacity => {
  const links = activeLinks(reservation);
  const seats = links.reduce((sum, link) => {
    // The link embedded in the reservation does NOT include capacity; the one in /api/reservation-table does. If
    // prefers the inventory, which is the live source, and drops to the link when the table is no longer
    // is in the loaded catalog.
    const fromInventory = tableById.get(link.table_id)?.capacity;
    return sum + (Number(fromInventory ?? link.capacity ?? 0) || 0);
  }, 0);

  const party = Number(reservation.party_size) || 0;
  return {
    seats,
    tableCount: links.length,
    // A reservation without a table is not "sufficient": it is unresolved, and painting it green
    // It would hide just from whoever has to seat it.
    sufficient: links.length > 0 && seats >= party,
    shortfall: Math.max(0, party - seats),
  };
};

// "Table #12 (Cap: 4)" / "Tables #12 + #13 (Total Cap: 8)".
export const assignmentLabel = (
  reservation: Reservation,
  tableById: Map<number, DiningTable>,
): string => {
  const links = activeLinks(reservation);
  if (links.length === 0) return 'No table assigned';

  const numbers = links.map(
    (l) => `#${tableById.get(l.table_id)?.number ?? l.table_number ?? l.table_id}`,
  );
  const { seats } = assignedCapacity(reservation, tableById);

  return links.length === 1
    ? `Table ${numbers[0]} (Cap: ${seats})`
    : `Tables ${numbers.join(' + ')} (Total Cap: ${seats})`;
};

// ================= Suggestion Engine =================

export type SuggestionKind = 'exact' | 'oversize' | 'combination';

export interface TableSuggestion {
  tables: DiningTable[];
  totalCapacity: number;
  /** Extra seats that become immobilized when accepting this suggestion. */
  wastedSeats: number;
  kind: SuggestionKind;
  zoneName: string | null;
}

const zoneOf = (table: DiningTable): number | null => table.floorZone?.id ?? null;

const distanceBetween = (a: DiningTable, b: DiningTable): number =>
  Math.hypot((a.pos_x ?? 0) - (b.pos_x ?? 0), (a.pos_y ?? 0) - (b.pos_y ?? 0));

// Dispersion of a group of tables: the maximum distance between any two. Serves for
// prefer two tables pushed together in front of two at opposite ends of the dining room.
const spread = (tables: DiningTable[]): number => {
  let max = 0;
  for (let i = 0; i < tables.length; i += 1) {
    for (let j = i + 1; j < tables.length; j += 1) {
      max = Math.max(max, distanceBetween(tables[i], tables[j]));
    }
  }
  return max;
};

/**
 * Tables that can be joined together.
 *
 * "Adjacent" is resolved by ZONE, not by fine geometry: join a terrace table with
 * one at the bar is not a combination, it is a group divided into two rooms. Within the area, the
 * distance between tables breaks ties (see `spread`).
 */
const sameZone = (a: DiningTable, b: DiningTable): boolean => zoneOf(a) === zoneOf(b);

export const MAX_TABLES_PER_COMBINATION = 3;

/**
 * Table suggestions sorted by convenience for a `partySize` group.
 *
 * The order is that of the story: first the exact match, then the smallest table
 * let it pass, and only if no loose ones work, combinations. Within each family the
 * waste: seating 2 people at a table of 8 makes 6 seats unusable for the rest of the service.
 */
export const suggestTables = (
  freeTables: DiningTable[],
  partySize: number,
  limit = 5,
): TableSuggestion[] => {
  if (partySize <= 0) return [];

  const usable = freeTables.filter(isAssignableTable);
  const singles = [...usable].sort((a, b) => a.capacity - b.capacity);

  const suggestions: TableSuggestion[] = [];

  const toSuggestion = (tables: DiningTable[], kind: SuggestionKind): TableSuggestion => {
    const totalCapacity = tables.reduce((sum, t) => sum + (Number(t.capacity) || 0), 0);
    return {
      tables,
      totalCapacity,
      wastedSeats: totalCapacity - partySize,
      kind,
      zoneName: tables[0]?.floorZone?.name ?? null,
    };
  };

  // 1. Exact match: the table fits just right and does not immobilize a single place.
  singles
    .filter((t) => t.capacity === partySize)
    .forEach((t) => suggestions.push(toSuggestion([t], 'exact')));

  // 2. The least of those that are passed.
  singles
    .filter((t) => t.capacity > partySize)
    .forEach((t) => suggestions.push(toSuggestion([t], 'oversize')));

  // 3. Combinations, only if no loose table arrives. They are limited to MAX_TABLES_PER_COMBINATION
  //    because putting together four tables is no longer a table, it is a banquet that is set up by hand.
  const anySingleFits = singles.some((t) => t.capacity >= partySize);
  if (!anySingleFits) {
    const combos: DiningTable[][] = [];

    const build = (start: number, picked: DiningTable[], capacity: number) => {
      if (picked.length > 0 && capacity >= partySize) {
        combos.push([...picked]);
        return; // Adding another table to one that already covers party size only adds waste.
      }
      if (picked.length >= MAX_TABLES_PER_COMBINATION) return;

      for (let i = start; i < singles.length; i += 1) {
        const candidate = singles[i];
        if (picked.length > 0 && !sameZone(picked[0], candidate)) continue;
        build(i + 1, [...picked, candidate], capacity + (Number(candidate.capacity) || 0));
      }
    };
    build(0, [], 0);

    combos
      .sort((a, b) => {
        const capA = a.reduce((s, t) => s + t.capacity, 0);
        const capB = b.reduce((s, t) => s + t.capacity, 0);
        // Less waste, then fewer tables, then more gatherings.
        return capA - capB || a.length - b.length || spread(a) - spread(b);
      })
      .forEach((combo) => suggestions.push(toSuggestion(combo, 'combination')));
  }

  return suggestions
    .sort((a, b) => {
      const rank: Record<SuggestionKind, number> = { exact: 0, oversize: 1, combination: 2 };
      return (
        rank[a.kind] - rank[b.kind] ||
        a.wastedSeats - b.wastedSeats ||
        a.tables.length - b.tables.length
      );
    })
    .slice(0, limit);
};

export const SUGGESTION_LABELS: Record<SuggestionKind, string> = {
  exact: 'Exact fit',
  oversize: 'Smallest that fits',
  combination: 'Combine tables',
};

export const suggestionSummary = (suggestion: TableSuggestion): string => {
  const numbers = suggestion.tables.map((t) => `#${t.number}`).join(' + ');
  const waste =
    suggestion.wastedSeats === 0
      ? 'no seats wasted'
      : `${suggestion.wastedSeats} seat${suggestion.wastedSeats === 1 ? '' : 's'} spare`;
  return `${numbers} · ${suggestion.totalCapacity} seats · ${waste}`;
};

// ================= Zonas =================

export interface ZoneOption {
  id: number | null;
  name: string;
  color: string | null;
  tableCount: number;
}

export const UNZONED_LABEL = 'Unzoned';

// Zones derived from INVENTORY, not from a separate /api/floor-zone: offer in the filter a
// area without tables just leads to an empty board with no explanation.
export const zoneOptions = (tables: DiningTable[]): ZoneOption[] => {
  const byId = new Map<number | null, ZoneOption>();

  tables.forEach((table) => {
    const id = zoneOf(table);
    const existing = byId.get(id);
    if (existing) {
      existing.tableCount += 1;
      return;
    }
    byId.set(id, {
      id,
      name: table.floorZone?.name ?? UNZONED_LABEL,
      color: table.floorZone?.color ?? null,
      tableCount: 1,
    });
  });

  const zones = [...byId.values()].sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.name.localeCompare(b.name) || (a.id ?? 0) - (b.id ?? 0);
  });

  // Two DIFFERENT zones can share a name (the actual catalog has seven "General"), and
  // seven identical chips are not a filter. It is grouped by id because membership is decided
  // by id, so what is disambiguated is the label.
  const timesSeen = new Map<string, number>();
  zones.forEach((z) => timesSeen.set(z.name, (timesSeen.get(z.name) ?? 0) + 1));

  return zones.map((zone) =>
    (timesSeen.get(zone.name) ?? 0) > 1 && zone.id !== null
      ? { ...zone, name: `${zone.name} #${zone.id}` }
      : zone,
  );
};

// A reservation belongs to a zone if ANY of its tables are there: a combination to
// horse between two zones has to appear when filtering for both, or it would disappear from the
// board just when you need to see it most.
export const reservationInZone = (
  reservation: Reservation,
  zoneId: number | null,
  tableById: Map<number, DiningTable>,
): boolean =>
  activeLinks(reservation).some(
    (link) => zoneOf(tableById.get(link.table_id) ?? ({} as DiningTable)) === zoneId,
  );

// ================= Occupancy KPIs =================

export interface SeatingMetrics {
  /** Active ReservationTable rows for the day's reservations. */
  totalTablesAssigned: number;
  /** Sum of the capacity of all assigned tables. */
  assignedSeatCapacity: number;
  /** Live reservations (pending/confirmed) still without a table. */
  unassignedBookings: number;
  /** Diners expected for those reservations without a table. */
  unassignedGuests: number;
  /** Total capacity of the room, to read the occupancy in context. */
  floorSeatCapacity: number;
}

export const computeSeatingMetrics = (
  reservations: Reservation[],
  tables: DiningTable[],
): SeatingMetrics => {
  const tableById = new Map(tables.map((t) => [t.id, t]));

  let totalTablesAssigned = 0;
  let assignedSeatCapacity = 0;
  let unassignedBookings = 0;
  let unassignedGuests = 0;

  for (const reservation of reservations) {
    // A canceled or absent reservation no longer retains a table: counting it would inflate the occupancy.
    if (holdsItsTable(reservation)) {
      const links = activeLinks(reservation);
      totalTablesAssigned += links.length;
      assignedSeatCapacity += assignedCapacity(reservation, tableById).seats;
    }
    if (needsTable(reservation)) {
      unassignedBookings += 1;
      unassignedGuests += Number(reservation.party_size) || 0;
    }
  }

  return {
    totalTablesAssigned,
    assignedSeatCapacity,
    unassignedBookings,
    unassignedGuests,
    floorSeatCapacity: tables
      .filter(isAssignableTable)
      .reduce((sum, t) => sum + (Number(t.capacity) || 0), 0),
  };
};
