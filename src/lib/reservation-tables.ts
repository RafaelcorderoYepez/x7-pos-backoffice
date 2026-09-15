// Reglas del tablero de asignación de mesas: qué mesa está libre en una franja, qué
// combinación conviene para un grupo, y si el aforo asignado cubre al grupo.
//
// El módulo es puro (sin fetch ni React) porque es donde vive la parte que de verdad hay que
// testear: el motor de sugerencias y la detección de solapes. La guarda DEFINITIVA contra la
// doble reserva vive en el backend (409); lo de aquí es para no ofrecer siquiera una mesa que
// el servidor vaya a rechazar.

import type { DiningTable } from '../types/dining-system';
import type { Reservation, ReservationTableLink } from '../types/reservation';
import { reservationEnd, reservationStart, windowsOverlap } from './reservations';

// Estados en los que la reserva YA NO retiene su mesa. Espejo exacto de
// TABLE_RELEASING_STATUSES en el backend: si las dos listas divergen, el tablero enseña como
// libre una mesa que el servidor considera ocupada (o al revés).
export const TABLE_RELEASING_STATUSES = new Set(['cancelled', 'no_show', 'completed']);

export const holdsItsTable = (reservation: Pick<Reservation, 'status'>): boolean =>
  !TABLE_RELEASING_STATUSES.has(reservation.status);

// Mesas que pueden recibir un grupo. Una mesa borrada o fuera de servicio no se ofrece por
// mucho que esté "libre": nadie puede sentarse en ella.
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

// Un booking que la sala todavía tiene que resolver: sigue vivo, va a llegar, y no tiene
// dónde sentarse. Es lo que alimenta la alerta del cabecero.
export const needsTable = (reservation: Reservation): boolean =>
  (reservation.status === 'pending' || reservation.status === 'confirmed') &&
  isUnassigned(reservation);

// ================= Ocupación de una mesa en una franja =================

/**
 * Reservas que ocupan `tableId` durante la ventana de `target`, excluyendo la propia.
 *
 * Reproduce la guarda del backend para poder avisar ANTES de enviar: mismas exclusiones de
 * estado y mismo solape semiabierto, así que una mesa marcada como libre aquí no va a devolver
 * un 409 al guardar.
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
  /** El aforo asignado cubre al grupo. */
  sufficient: boolean;
  /** Plazas que faltan para cubrirlo (0 si sobra). */
  shortfall: number;
}

export const assignedCapacity = (
  reservation: Reservation,
  tableById: Map<number, DiningTable>,
): AssignedCapacity => {
  const links = activeLinks(reservation);
  const seats = links.reduce((sum, link) => {
    // El enlace embebido en la reserva NO trae aforo; el de /api/reservation-table sí. Se
    // prefiere el inventario, que es la fuente viva, y se cae al enlace cuando la mesa ya no
    // está en el catálogo cargado.
    const fromInventory = tableById.get(link.table_id)?.capacity;
    return sum + (Number(fromInventory ?? link.capacity ?? 0) || 0);
  }, 0);

  const party = Number(reservation.party_size) || 0;
  return {
    seats,
    tableCount: links.length,
    // Una reserva sin mesa no es "suficiente": está sin resolver, y pintarla en verde la
    // escondería justo de quien tiene que sentarla.
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

// ================= Motor de sugerencias =================

export type SuggestionKind = 'exact' | 'oversize' | 'combination';

export interface TableSuggestion {
  tables: DiningTable[];
  totalCapacity: number;
  /** Plazas de más que se inmovilizan al aceptar esta sugerencia. */
  wastedSeats: number;
  kind: SuggestionKind;
  zoneName: string | null;
}

const zoneOf = (table: DiningTable): number | null => table.floorZone?.id ?? null;

const distanceBetween = (a: DiningTable, b: DiningTable): number =>
  Math.hypot((a.pos_x ?? 0) - (b.pos_x ?? 0), (a.pos_y ?? 0) - (b.pos_y ?? 0));

// Dispersión de un grupo de mesas: la distancia máxima entre dos cualesquiera. Sirve para
// preferir dos mesas pegadas frente a dos en extremos opuestos del comedor.
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
 * Mesas que se pueden juntar entre sí.
 *
 * "Adyacente" se resuelve por ZONA, no por geometría fina: juntar una mesa de la terraza con
 * una del bar no es una combinación, es un grupo partido en dos salas. Dentro de la zona, la
 * distancia entre mesas desempata (ver `spread`).
 */
const sameZone = (a: DiningTable, b: DiningTable): boolean => zoneOf(a) === zoneOf(b);

export const MAX_TABLES_PER_COMBINATION = 3;

/**
 * Sugerencias de mesa ordenadas por conveniencia para un grupo de `partySize`.
 *
 * El orden es el de la historia: primero la coincidencia exacta, después la mesa más pequeña
 * que se pase, y sólo si ninguna suelta sirve, combinaciones. Dentro de cada familia manda el
 * desperdicio: sentar a 2 personas en una mesa de 8 inutiliza 6 sitios el resto del servicio.
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

  // 1. Coincidencia exacta: la mesa cabe justa y no inmoviliza ni un sitio.
  singles
    .filter((t) => t.capacity === partySize)
    .forEach((t) => suggestions.push(toSuggestion([t], 'exact')));

  // 2. La menor de las que se pasan.
  singles
    .filter((t) => t.capacity > partySize)
    .forEach((t) => suggestions.push(toSuggestion([t], 'oversize')));

  // 3. Combinaciones, sólo si ninguna mesa suelta llega. Se limitan a MAX_TABLES_PER_COMBINATION
  //    porque juntar cuatro mesas ya no es una mesa, es un banquete que se monta a mano.
  const anySingleFits = singles.some((t) => t.capacity >= partySize);
  if (!anySingleFits) {
    const combos: DiningTable[][] = [];

    const build = (start: number, picked: DiningTable[], capacity: number) => {
      if (picked.length > 0 && capacity >= partySize) {
        combos.push([...picked]);
        return; // Añadir otra mesa a algo que ya cubre sólo añade desperdicio.
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
        // Menos desperdicio, luego menos mesas, luego más juntas.
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

// Zonas derivadas del INVENTARIO, no de un /api/floor-zone aparte: ofrecer en el filtro una
// zona sin mesas sólo lleva a un tablero vacío sin explicación.
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

  // Dos zonas DISTINTAS pueden compartir nombre (el catálogo real tiene siete "General"), y
  // siete chips idénticos no son un filtro. Se agrupa por id porque la pertenencia se decide
  // por id, así que lo que se desambigua es la etiqueta.
  const timesSeen = new Map<string, number>();
  zones.forEach((z) => timesSeen.set(z.name, (timesSeen.get(z.name) ?? 0) + 1));

  return zones.map((zone) =>
    (timesSeen.get(zone.name) ?? 0) > 1 && zone.id !== null
      ? { ...zone, name: `${zone.name} #${zone.id}` }
      : zone,
  );
};

// Una reserva pertenece a una zona si CUALQUIERA de sus mesas está allí: una combinación a
// caballo entre dos zonas tiene que aparecer al filtrar por las dos, o desaparecería del
// tablero justo cuando más falta hace verla.
export const reservationInZone = (
  reservation: Reservation,
  zoneId: number | null,
  tableById: Map<number, DiningTable>,
): boolean =>
  activeLinks(reservation).some(
    (link) => zoneOf(tableById.get(link.table_id) ?? ({} as DiningTable)) === zoneId,
  );

// ================= KPIs de ocupación =================

export interface SeatingMetrics {
  /** Filas ReservationTable activas de las reservas del día. */
  totalTablesAssigned: number;
  /** Suma del aforo de todas las mesas asignadas. */
  assignedSeatCapacity: number;
  /** Reservas vivas (pending/confirmed) todavía sin mesa. */
  unassignedBookings: number;
  /** Comensales esperados por esas reservas sin mesa. */
  unassignedGuests: number;
  /** Aforo total del salón, para leer la ocupación en contexto. */
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
    // Una reserva anulada o ausente ya no retiene mesa: contarla inflaría la ocupación.
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
