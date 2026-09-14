// Reglas operativas de las mesas: unión padre-hijo, guardas de mutación con servicio vivo,
// validación espacial contra el lienzo y elegibilidad de transferencia.
//
// Vive fuera de la vista a propósito: son las reglas que las historias exigen demostrar
// (unicidad, límites del plano, bloqueo circular, guarda de orden activa) y aquí se pueden
// probar sin montar React ni simular fetch.

import type { DiningTable, FloorPlan, TableStatus } from '../types/dining-system';
import { tableFootprint } from '../types/dining-system';
import type { UnitSystem } from './measurement-units';
import { formatLength } from './measurement-units';

// ================= Jerarquía padre-hijo =================

// La respuesta de /api/tables embebe `parent_table: {id, number}` y los DTO de escritura
// hablan de `parent_table_id`. Leer siempre por aquí evita que media UI vea la unión y la
// otra mitad no, según de qué endpoint venga la fila.
export const parentTableId = (t: Pick<DiningTable, 'parent_table' | 'parent_table_id'>): number | null =>
  t.parent_table?.id ?? t.parent_table_id ?? null;

export const isJoined = (t: DiningTable): boolean => parentTableId(t) != null;

export const childTablesOf = (tables: DiningTable[], parentId: number): DiningTable[] =>
  tables.filter((t) => parentTableId(t) === parentId);

// Toda la descendencia de una mesa, no sólo sus hijos directos: es lo que hace falta para
// cerrar el candado circular en cadenas de tres o más (A -> B -> C -> A).
// El `seen` corta el recorrido si los datos ya vienen con un ciclo del backend, para no
// colgar la UI en un bucle infinito mientras se pinta un select.
export const descendantTableIds = (tables: DiningTable[], rootId: number): Set<number> => {
  const found = new Set<number>();
  const queue: number[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    for (const t of tables) {
      if (parentTableId(t) !== current || found.has(t.id)) continue;
      found.add(t.id);
      queue.push(t.id);
    }
  }
  return found;
};

export const CIRCULAR_PARENT_ERROR =
  'A table cannot be joined to itself or to one of its own child tables.';

// El backend sólo comprueba el ciclo de un salto (padre.parent_table_id === id), así que
// las cadenas largas se bloquean aquí antes de llegar a persistirse.
export const wouldCreateCycle = (
  tables: DiningTable[],
  tableId: number,
  candidateParentId: number,
): boolean =>
  candidateParentId === tableId || descendantTableIds(tables, tableId).has(candidateParentId);

// Candidatas a mesa madre: todas menos ella misma y su propia descendencia.
export const eligibleParentTables = (tables: DiningTable[], tableId: number): DiningTable[] => {
  const blocked = descendantTableIds(tables, tableId);
  return tables.filter((t) => t.id !== tableId && !blocked.has(t.id));
};

// Etiqueta del badge de unión de una fila hija: "Joined to T-01".
export const joinedToLabel = (
  tables: DiningTable[],
  table: DiningTable,
): string => {
  const parentId = parentTableId(table);
  if (parentId == null) return '';
  const parent = tables.find((t) => t.id === parentId);
  return `Joined to ${parent?.number ?? table.parent_table?.number ?? `#${parentId}`}`;
};

// Etiqueta del badge de una fila madre: "2 tables joined".
export const joinedChildrenLabel = (tables: DiningTable[], parentId: number): string => {
  const n = childTablesOf(tables, parentId).length;
  if (n === 0) return '';
  return `${n} ${n === 1 ? 'table' : 'tables'} joined`;
};

// ================= Unicidad del número =================

export const duplicateTableNumberError = (number: string): string =>
  `Table number '${number.trim()}' already exists for this merchant.`;

// Compara sin distinguir mayúsculas ni espacios sobrantes: el índice único de base es
// sensible a esas diferencias, pero para el operador 'a1' y 'A1' son la misma mesa y
// dejarle guardar ambas convierte la parrilla en un campo de minas.
export const isDuplicateTableNumber = (
  tables: DiningTable[],
  candidate: string,
  currentTableId?: number,
): boolean => {
  const value = candidate.trim().toLowerCase();
  if (!value) return false;
  return tables.some(
    (t) => t.id !== currentTableId && (t.number ?? '').trim().toLowerCase() === value,
  );
};

// ================= Validación espacial contra el lienzo =================

// pos_x/pos_y son la esquina superior izquierda de la mesa, en píxeles del lienzo. Fuera
// de [0, width] × [0, height] la mesa desaparece del plano aunque la fila exista.
export const positionBoundsError = (
  pos_x: number,
  pos_y: number,
  plan: Pick<FloorPlan, 'name' | 'width' | 'height'> | undefined,
  system?: UnitSystem,
): string => {
  if (!plan) return '';
  const insideX = Number.isFinite(pos_x) && pos_x >= 0 && pos_x <= plan.width;
  const insideY = Number.isFinite(pos_y) && pos_y >= 0 && pos_y <= plan.height;
  if (insideX && insideY) return '';
  const w = system ? formatLength(plan.width, system) : `${plan.width}px`;
  const h = system ? formatLength(plan.height, system) : `${plan.height}px`;
  return `Table position must stay inside '${plan.name}': X between 0 and ${w}, Y between 0 and ${h}.`;
};

// Aviso blando: la coordenada cae dentro, pero la huella de la mesa sobresale por el borde.
// No bloquea el guardado — la mesa sigue siendo alcanzable y recolocable en el editor.
export const footprintClipWarning = (
  table: Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape'> & {
    width?: number | null;
    height?: number | null;
  },
  plan: Pick<FloorPlan, 'width' | 'height'> | undefined,
): string => {
  if (!plan) return '';
  const { w, h } = tableFootprint(table);
  const overflowsX = table.pos_x >= 0 && table.pos_x + w > plan.width;
  const overflowsY = table.pos_y >= 0 && table.pos_y + h > plan.height;
  if (!overflowsX && !overflowsY) return '';
  return 'The table fits inside the canvas but part of its footprint hangs over the edge. Drag it in the editor to tidy the layout.';
};

export const rotationError = (rotation: number): string =>
  Number.isInteger(rotation) && rotation >= 0 && rotation <= 360
    ? ''
    : 'Rotation must be a whole number of degrees between 0 and 360.';

// ================= Guarda de servicio vivo =================

export interface ActiveServiceContext {
  // Asignaciones sin releasedAt sobre esta mesa: hay un camarero con la mesa a su cargo.
  activeAssignments?: number;
  // Comandas abiertas sobre la mesa. El backend aún no las expone en /api/tables, así que
  // por defecto es 0 y el estado 'occupied' es la señal que sí tenemos.
  openOrders?: number;
}

// Una mesa ocupada (o con camarero/comanda viva) no se borra ni se muda de plano o zona:
// el POS perdería de vista una comanda abierta.
export const activeServiceGuard = (
  table: Pick<DiningTable, 'number' | 'status'>,
  ctx: ActiveServiceContext = {},
): string => {
  const busy =
    table.status === 'occupied' ||
    (ctx.activeAssignments ?? 0) > 0 ||
    (ctx.openOrders ?? 0) > 0;
  return busy
    ? `Cannot modify or remove Table ${table.number} while it has an active guest order or assigned server. Please close open orders first.`
    : '';
};

// Qué cambios cuentan como "mover la mesa de sitio" y por tanto quedan bajo la guarda.
// Renombrar, resituar en el lienzo o cambiar de forma sigue permitido con la mesa ocupada:
// no rompe la relación con la comanda.
export const changesTableLayout = (
  table: DiningTable,
  next: { floorPlan?: number | null; floorZone?: number | null },
): boolean => {
  const planChanged =
    next.floorPlan != null && next.floorPlan !== (table.floorPlan?.id ?? null);
  const zoneChanged =
    next.floorZone != null && next.floorZone !== (table.floorZone?.id ?? null);
  return planChanged || zoneChanged;
};

// ================= Transferencia de comensales =================

// Sólo una mesa libre puede recibir una transferencia: ocupada duplicaría comandas y
// fuera de servicio o en limpieza no debería sentar a nadie.
export const canReceiveTransfer = (t: Pick<DiningTable, 'status'>): boolean =>
  t.status === 'available';

export const transferTargetError = (target: Pick<DiningTable, 'number'>): string =>
  `Target Table [${target.number}] is currently occupied or unavailable for transfer.`;

export const transferSourceError = (source: Pick<DiningTable, 'number'>): string =>
  `Table ${source.number} has no seated party to transfer.`;

// El origen tiene que estar ocupado (hay comensales que mover) y el destino libre.
export const eligibleTransferTargets = (
  tables: DiningTable[],
  sourceId: number,
): DiningTable[] => tables.filter((t) => t.id !== sourceId && canReceiveTransfer(t));

// ================= Liberación del grupo unido =================

// Al cerrar la cuenta, la mesa madre y sus hijas vuelven a limpieza: nadie se sienta en
// una mesa que aún no ha pasado el trapo, y así ninguna queda 'occupied' huérfana.
export const GROUP_RELEASE_STATUS: TableStatus = 'cleaning';

// Estado que hereda una hija al unirse a una madre ocupada (historia 7).
export const inheritedChildStatus = (parentStatus: string): TableStatus | null =>
  parentStatus === 'occupied' ? 'occupied' : null;

// ================= Presentación espacial =================

// "Pos: [100, 150] | Circle | 90°" — la lectura compacta que pide la parrilla.
export const formatSpatialSummary = (
  t: Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape' | 'rotation'>,
): string => {
  const x = Math.round(t.pos_x ?? 0);
  const y = Math.round(t.pos_y ?? 0);
  return `Pos: [${x}, ${y}] | ${t.shape ?? 'Square'} | ${Math.round(t.rotation ?? 0)}°`;
};

export const formatSeats = (capacity: number): string =>
  `${capacity} ${capacity === 1 ? 'Seat' : 'Seats'}`;
