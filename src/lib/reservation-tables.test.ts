import { describe, expect, it } from 'vitest';
import type { DiningTable } from '../types/dining-system';
import type { Reservation } from '../types/reservation';
import {
  activeLinks,
  assignedCapacity,
  assignedTableIds,
  assignmentLabel,
  computeSeatingMetrics,
  conflictsForTable,
  holdsItsTable,
  isAssignableTable,
  isTableFreeFor,
  isUnassigned,
  needsTable,
  reservationInZone,
  suggestTables,
  suggestionSummary,
  zoneOptions,
} from './reservation-tables';

const at = (h: number, m = 0): string => new Date(2026, 3, 16, h, m, 0).toISOString();

const table = (over: Partial<DiningTable> & { id: number; capacity: number }): DiningTable =>
  ({
    merchant_id: 1,
    number: `T${over.id}`,
    status: 'available',
    location: '',
    rotation: 0,
    shape: 'Square',
    pos_x: 0,
    pos_y: 0,
    ...over,
  }) as DiningTable;

const booking = (over: Partial<Reservation> & { id: number }): Reservation => ({
  merchant_id: 1,
  customer_id: null,
  reservation_date: at(19),
  duration_minutes: 90,
  seated_at: null,
  party_size: 4,
  status: 'confirmed',
  source: 'phone',
  special_requests: null,
  created_by: null,
  tables: [],
  ...over,
});

const link = (tableId: number, reservationId = 1, is_active = true) => ({
  reservation_id: reservationId,
  table_id: tableId,
  is_active,
});

describe('mesas asignables', () => {
  it('una mesa fuera de servicio o borrada no se ofrece', () => {
    expect(isAssignableTable(table({ id: 1, capacity: 4, status: 'available' }))).toBe(true);
    expect(isAssignableTable(table({ id: 2, capacity: 4, status: 'occupied' }))).toBe(true);
    expect(isAssignableTable(table({ id: 3, capacity: 4, status: 'out_of_service' }))).toBe(false);
    expect(isAssignableTable(table({ id: 4, capacity: 4, status: 'deleted' }))).toBe(false);
  });
});

describe('enlaces vivos', () => {
  it('ignora los enlaces desactivados', () => {
    const r = booking({ id: 1, tables: [link(10), link(11, 1, false)] });
    expect(activeLinks(r)).toHaveLength(1);
    expect(assignedTableIds(r)).toEqual([10]);
  });

  it('una reserva cuyos enlaces están todos sueltos está sin asignar', () => {
    expect(isUnassigned(booking({ id: 1, tables: [link(10, 1, false)] }))).toBe(true);
  });

  it('sólo las reservas vivas y sin mesa necesitan atención', () => {
    expect(needsTable(booking({ id: 1, status: 'confirmed', tables: [] }))).toBe(true);
    expect(needsTable(booking({ id: 2, status: 'pending', tables: [] }))).toBe(true);
    // Ya sentada: tiene mesa por definición del flujo, no es un hueco que resolver.
    expect(needsTable(booking({ id: 3, status: 'seated', tables: [] }))).toBe(false);
    expect(needsTable(booking({ id: 4, status: 'cancelled', tables: [] }))).toBe(false);
    expect(needsTable(booking({ id: 5, status: 'confirmed', tables: [link(10, 5)] }))).toBe(false);
  });
});

describe('estados que sueltan la mesa', () => {
  it('anulada, ausente y terminada liberan el sitio', () => {
    expect(holdsItsTable(booking({ id: 1, status: 'cancelled' }))).toBe(false);
    expect(holdsItsTable(booking({ id: 2, status: 'no_show' }))).toBe(false);
    expect(holdsItsTable(booking({ id: 3, status: 'completed' }))).toBe(false);
    expect(holdsItsTable(booking({ id: 4, status: 'seated' }))).toBe(true);
  });
});

describe('detección de doble reserva', () => {
  const target = booking({ id: 1, reservation_date: at(19), duration_minutes: 90 });

  it('detecta el solape de otra reserva sobre la misma mesa', () => {
    const other = booking({
      id: 2,
      reservation_date: at(20),
      duration_minutes: 90,
      tables: [link(10, 2)],
    });
    expect(conflictsForTable(10, target, [target, other])).toHaveLength(1);
    expect(isTableFreeFor(10, target, [target, other])).toBe(false);
  });

  it('dos reservas consecutivas que se tocan en el borde no chocan', () => {
    // La primera acaba a las 20:30, la segunda empieza a las 20:30.
    const other = booking({
      id: 2,
      reservation_date: at(20, 30),
      duration_minutes: 90,
      tables: [link(10, 2)],
    });
    expect(isTableFreeFor(10, target, [target, other])).toBe(true);
  });

  it('una reserva anulada no retiene la mesa', () => {
    const other = booking({
      id: 2,
      reservation_date: at(19),
      status: 'cancelled',
      tables: [link(10, 2)],
    });
    expect(isTableFreeFor(10, target, [target, other])).toBe(true);
  });

  it('una reserva ya terminada libera la mesa', () => {
    const other = booking({
      id: 2,
      reservation_date: at(19),
      status: 'completed',
      tables: [link(10, 2)],
    });
    expect(isTableFreeFor(10, target, [target, other])).toBe(true);
  });

  it('una reserva no choca consigo misma', () => {
    const self = booking({ id: 1, reservation_date: at(19), tables: [link(10)] });
    expect(isTableFreeFor(10, self, [self])).toBe(true);
  });
});

describe('aforo asignado', () => {
  const tableById = new Map([
    [10, table({ id: 10, capacity: 4 })],
    [11, table({ id: 11, capacity: 2 })],
  ]);

  it('suma el aforo de las mesas combinadas', () => {
    const r = booking({ id: 1, party_size: 6, tables: [link(10), link(11)] });
    const capacity = assignedCapacity(r, tableById);
    expect(capacity.seats).toBe(6);
    expect(capacity.tableCount).toBe(2);
    expect(capacity.sufficient).toBe(true);
    expect(capacity.shortfall).toBe(0);
  });

  it('marca la falta de aforo cuando las mesas no cubren al grupo', () => {
    const r = booking({ id: 1, party_size: 8, tables: [link(10)] });
    const capacity = assignedCapacity(r, tableById);
    expect(capacity.sufficient).toBe(false);
    expect(capacity.shortfall).toBe(4);
  });

  it('una reserva sin mesa nunca es "suficiente"', () => {
    const capacity = assignedCapacity(booking({ id: 1, party_size: 0, tables: [] }), tableById);
    expect(capacity.sufficient).toBe(false);
  });

  it('etiqueta una mesa suelta y una combinación como pide la historia', () => {
    expect(assignmentLabel(booking({ id: 1, tables: [link(10)] }), tableById)).toBe(
      'Table #T10 (Cap: 4)',
    );
    expect(assignmentLabel(booking({ id: 1, tables: [link(10), link(11)] }), tableById)).toBe(
      'Tables #T10 + #T11 (Total Cap: 6)',
    );
    expect(assignmentLabel(booking({ id: 1, tables: [] }), tableById)).toBe('No table assigned');
  });
});

describe('motor de sugerencias', () => {
  const zoneA = { id: 1, name: 'Main Dining', color: '#123456' };
  const zoneB = { id: 2, name: 'Terrace', color: '#654321' };

  const floor = [
    table({ id: 1, capacity: 2, floorZone: zoneA, pos_x: 0, pos_y: 0 }),
    table({ id: 2, capacity: 4, floorZone: zoneA, pos_x: 100, pos_y: 0 }),
    table({ id: 3, capacity: 8, floorZone: zoneA, pos_x: 800, pos_y: 0 }),
    table({ id: 4, capacity: 2, floorZone: zoneB, pos_x: 0, pos_y: 500 }),
  ];

  it('propone primero la coincidencia exacta', () => {
    const [best] = suggestTables(floor, 4);
    expect(best.kind).toBe('exact');
    expect(best.tables.map((t) => t.id)).toEqual([2]);
    expect(best.wastedSeats).toBe(0);
  });

  it('sin coincidencia exacta propone la menor que se pasa', () => {
    const [best] = suggestTables(floor, 3);
    expect(best.kind).toBe('oversize');
    // La de 4, no la de 8: sentar a 3 en una mesa de 8 inmoviliza 5 sitios.
    expect(best.tables.map((t) => t.id)).toEqual([2]);
    expect(best.wastedSeats).toBe(1);
  });

  it('combina mesas sólo cuando ninguna suelta llega', () => {
    // Nada suelto cubre a 10; 8 + 2 de la misma zona sí.
    const [best] = suggestTables(floor, 10);
    expect(best.kind).toBe('combination');
    expect(best.totalCapacity).toBeGreaterThanOrEqual(10);
    expect(best.tables.map((t) => t.id).sort()).toEqual([1, 3]);
  });

  it('no combina mesas de zonas distintas', () => {
    // 2 (terraza) + 2 (comedor) cubrirían a 4, pero el grupo quedaría partido en dos salas.
    const twoZones = [
      table({ id: 1, capacity: 2, floorZone: zoneA }),
      table({ id: 4, capacity: 2, floorZone: zoneB }),
    ];
    const combos = suggestTables(twoZones, 4).filter((s) => s.kind === 'combination');
    expect(combos).toHaveLength(0);
  });

  it('prefiere la combinación que menos plazas desperdicia', () => {
    const many = [
      table({ id: 1, capacity: 2, floorZone: zoneA }),
      table({ id: 2, capacity: 4, floorZone: zoneA }),
      table({ id: 3, capacity: 6, floorZone: zoneA }),
    ];
    const [best] = suggestTables(many, 8);
    // 2 + 6 = 8 exactos, mejor que 4 + 6 = 10.
    expect(best.totalCapacity).toBe(8);
    expect(best.wastedSeats).toBe(0);
  });

  it('ignora las mesas fuera de servicio', () => {
    const broken = [table({ id: 9, capacity: 4, status: 'out_of_service', floorZone: zoneA })];
    expect(suggestTables(broken, 4)).toHaveLength(0);
  });

  it('sin grupo no sugiere nada', () => {
    expect(suggestTables(floor, 0)).toEqual([]);
  });

  it('resume la sugerencia de forma legible', () => {
    const [best] = suggestTables(floor, 4);
    expect(suggestionSummary(best)).toBe('#T2 · 4 seats · no seats wasted');
  });
});

describe('zonas', () => {
  const zoneA = { id: 1, name: 'Main Dining', color: '#123456' };
  const tables = [
    table({ id: 1, capacity: 2, floorZone: zoneA }),
    table({ id: 2, capacity: 4, floorZone: zoneA }),
    table({ id: 3, capacity: 4, floorZone: null }),
  ];

  it('deriva las zonas del inventario y cuenta sus mesas', () => {
    const zones = zoneOptions(tables);
    expect(zones.map((z) => z.name)).toEqual(['Main Dining', 'Unzoned']);
    expect(zones[0].tableCount).toBe(2);
  });

  it('deja las mesas sin zona al final de la lista', () => {
    expect(zoneOptions(tables).at(-1)?.id).toBeNull();
  });

  it('desambigua dos zonas distintas que comparten nombre', () => {
    // El catálogo real tiene varias zonas llamadas "General"; chips idénticos no filtran nada.
    const duplicated = [
      table({ id: 1, capacity: 2, floorZone: { id: 20, name: 'General' } }),
      table({ id: 2, capacity: 4, floorZone: { id: 23, name: 'General' } }),
    ];
    expect(zoneOptions(duplicated).map((z) => z.name)).toEqual(['General #20', 'General #23']);
  });

  it('no toca el nombre cuando la zona es única', () => {
    expect(zoneOptions(tables)[0].name).toBe('Main Dining');
  });

  it('una reserva pertenece a la zona de cualquiera de sus mesas', () => {
    const byId = new Map(tables.map((t) => [t.id, t]));
    const r = booking({ id: 1, tables: [link(1), link(3)] });
    expect(reservationInZone(r, 1, byId)).toBe(true);
    expect(reservationInZone(r, null, byId)).toBe(true);
    expect(reservationInZone(r, 99, byId)).toBe(false);
  });
});

describe('KPIs de ocupación', () => {
  const tables = [
    table({ id: 10, capacity: 4 }),
    table({ id: 11, capacity: 2 }),
    table({ id: 12, capacity: 6, status: 'out_of_service' }),
  ];

  const day = [
    booking({ id: 1, status: 'confirmed', party_size: 4, tables: [link(10)] }),
    booking({ id: 2, status: 'seated', party_size: 2, tables: [link(11, 2)] }),
    booking({ id: 3, status: 'pending', party_size: 5, tables: [] }),
    booking({ id: 4, status: 'cancelled', party_size: 8, tables: [link(10, 4)] }),
  ];

  it('cuenta las mesas asignadas de las reservas que aún las retienen', () => {
    // La anulada no cuenta aunque conserve su fila.
    expect(computeSeatingMetrics(day, tables).totalTablesAssigned).toBe(2);
  });

  it('suma el aforo asignado', () => {
    expect(computeSeatingMetrics(day, tables).assignedSeatCapacity).toBe(6);
  });

  it('cuenta las reservas vivas sin mesa y sus comensales', () => {
    const m = computeSeatingMetrics(day, tables);
    expect(m.unassignedBookings).toBe(1);
    expect(m.unassignedGuests).toBe(5);
  });

  it('el aforo del salón excluye las mesas fuera de servicio', () => {
    expect(computeSeatingMetrics(day, tables).floorSeatCapacity).toBe(6);
  });
});
