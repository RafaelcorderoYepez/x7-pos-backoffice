import { describe, expect, it } from 'vitest';
import type { DiningTable, FloorPlan } from '../types/dining-system';
import {
  activeServiceGuard,
  canReceiveTransfer,
  changesTableLayout,
  childTablesOf,
  descendantTableIds,
  duplicateTableNumberError,
  eligibleParentTables,
  eligibleTransferTargets,
  footprintClipWarning,
  formatSeats,
  formatSpatialSummary,
  inheritedChildStatus,
  isDuplicateTableNumber,
  isJoined,
  joinedChildrenLabel,
  joinedToLabel,
  parentTableId,
  positionBoundsError,
  rotationError,
  transferTargetError,
} from './dining-tables';

const table = (over: Partial<DiningTable> & { id: number }): DiningTable => ({
  merchant_id: 1,
  number: `T${over.id}`,
  capacity: 4,
  status: 'available',
  location: 'Main',
  rotation: 0,
  shape: 'Square',
  pos_x: 0,
  pos_y: 0,
  ...over,
});

const PLAN: FloorPlan = {
  id: 1,
  name: 'Main Floor Plan',
  width: 1000,
  height: 700,
  status: 'active',
};

describe('parentTableId', () => {
  it('lee el objeto embebido que devuelve /api/tables', () => {
    expect(parentTableId(table({ id: 2, parent_table: { id: 1, number: 'T-01' } }))).toBe(1);
  });

  it('lee el escalar que viaja en los DTO de escritura', () => {
    expect(parentTableId(table({ id: 2, parent_table_id: 7 }))).toBe(7);
  });

  it('una mesa suelta no tiene madre', () => {
    expect(parentTableId(table({ id: 2 }))).toBeNull();
    expect(isJoined(table({ id: 2 }))).toBe(false);
  });
});

describe('jerarquía padre-hijo', () => {
  const tables = [
    table({ id: 1, number: 'T-01' }),
    table({ id: 2, number: 'T-02', parent_table: { id: 1, number: 'T-01' } }),
    table({ id: 3, number: 'T-03', parent_table: { id: 2, number: 'T-02' } }),
    table({ id: 4, number: 'T-04' }),
  ];

  it('lista los hijos directos', () => {
    expect(childTablesOf(tables, 1).map((t) => t.id)).toEqual([2]);
  });

  it('recorre toda la descendencia, no sólo un salto', () => {
    expect([...descendantTableIds(tables, 1)]).toEqual([2, 3]);
  });

  it('etiqueta la unión con el número de la mesa madre', () => {
    expect(joinedToLabel(tables, tables[1])).toBe('Joined to T-01');
    expect(joinedToLabel(tables, tables[0])).toBe('');
  });

  it('etiqueta cuántas mesas cuelgan de una madre', () => {
    expect(joinedChildrenLabel(tables, 1)).toBe('1 table joined');
    expect(joinedChildrenLabel(tables, 4)).toBe('');
  });

  it('no se cuelga si el backend devuelve un ciclo ya persistido', () => {
    const cyclic = [
      table({ id: 1, parent_table: { id: 2 } }),
      table({ id: 2, parent_table: { id: 1 } }),
    ];
    expect([...descendantTableIds(cyclic, 1)]).toEqual([2, 1]);
  });
});

describe('candado circular', () => {
  const tables = [
    table({ id: 1, number: 'A1' }),
    table({ id: 2, number: 'A2', parent_table: { id: 1 } }),
    table({ id: 3, number: 'A3', parent_table: { id: 2 } }),
  ];

  it('excluye a la propia mesa como madre', () => {
    expect(eligibleParentTables(tables, 1).map((t) => t.id)).not.toContain(1);
  });

  it('excluye a las hijas directas', () => {
    expect(eligibleParentTables(tables, 1).map((t) => t.id)).not.toContain(2);
  });

  it('excluye a las nietas: cierra cadenas que el backend no ve', () => {
    // El backend sólo compara padre.parent_table_id === id, así que A3 le parecería válida.
    expect(eligibleParentTables(tables, 1).map((t) => t.id)).not.toContain(3);
    expect(eligibleParentTables(tables, 1)).toHaveLength(0);
  });

  it('deja pasar una mesa ajena al grupo', () => {
    const withOutsider = [...tables, table({ id: 9, number: 'B1' })];
    expect(eligibleParentTables(withOutsider, 1).map((t) => t.id)).toEqual([9]);
  });
});

describe('unicidad del número', () => {
  const tables = [table({ id: 1, number: 'A1' }), table({ id: 2, number: 'B2' })];

  it('detecta el duplicado ignorando mayúsculas y espacios', () => {
    expect(isDuplicateTableNumber(tables, ' a1 ')).toBe(true);
  });

  it('no se acusa a sí misma al editar', () => {
    expect(isDuplicateTableNumber(tables, 'A1', 1)).toBe(false);
  });

  it('redacta el mensaje que espera el operador', () => {
    expect(duplicateTableNumberError(' A1 ')).toBe(
      "Table number 'A1' already exists for this merchant.",
    );
  });
});

describe('validación espacial', () => {
  it('acepta una coordenada dentro del lienzo', () => {
    expect(positionBoundsError(100, 150, PLAN)).toBe('');
  });

  it('rechaza una coordenada negativa', () => {
    expect(positionBoundsError(-1, 150, PLAN)).toContain("must stay inside 'Main Floor Plan'");
  });

  it('rechaza una coordenada más allá del ancho del plano', () => {
    expect(positionBoundsError(1001, 150, PLAN)).toContain('X between 0 and 1000px');
  });

  it('rechaza una coordenada más allá del alto del plano', () => {
    expect(positionBoundsError(100, 701, PLAN)).toContain('Y between 0 and 700px');
  });

  it('redacta los límites en la unidad que el usuario tiene delante', () => {
    expect(positionBoundsError(1001, 150, PLAN, 'metric')).toContain('X between 0 and 10 m');
  });

  it('sin plano elegido no hay nada que validar', () => {
    expect(positionBoundsError(9999, 9999, undefined)).toBe('');
  });

  it('avisa (sin bloquear) cuando la huella sobresale del borde', () => {
    const warning = footprintClipWarning(
      { pos_x: 960, pos_y: 100, shape: 'Square', width: 80, height: 80 },
      PLAN,
    );
    expect(warning).toContain('hangs over the edge');
  });

  it('no avisa cuando la mesa entera cabe', () => {
    expect(
      footprintClipWarning({ pos_x: 100, pos_y: 100, shape: 'Square' }, PLAN),
    ).toBe('');
  });
});

describe('rotación', () => {
  it.each([0, 90, 360])('acepta %i grados', (deg) => {
    expect(rotationError(deg)).toBe('');
  });

  it.each([-1, 361, 45.5, NaN])('rechaza %s', (deg) => {
    expect(rotationError(deg)).toContain('between 0 and 360');
  });
});

describe('guarda de servicio vivo', () => {
  it('bloquea una mesa ocupada con el mensaje de la historia', () => {
    expect(activeServiceGuard(table({ id: 1, number: 'A1', status: 'occupied' }))).toBe(
      'Cannot modify or remove Table A1 while it has an active guest order or assigned server. Please close open orders first.',
    );
  });

  it('bloquea una mesa libre que aún tiene camarero asignado', () => {
    expect(
      activeServiceGuard(table({ id: 1, number: 'A1' }), { activeAssignments: 1 }),
    ).toContain('Cannot modify or remove Table A1');
  });

  it('bloquea una mesa con comandas abiertas', () => {
    expect(activeServiceGuard(table({ id: 1, number: 'A1' }), { openOrders: 2 })).toContain(
      'Please close open orders first',
    );
  });

  it('deja pasar una mesa libre y sin cobertura', () => {
    expect(activeServiceGuard(table({ id: 1, number: 'A1' }), { activeAssignments: 0 })).toBe('');
  });

  it('sólo cuenta como mudanza cambiar de plano o de zona', () => {
    const t = table({ id: 1, floorPlan: { id: 1 }, floorZone: { id: 10 } });
    expect(changesTableLayout(t, { floorPlan: 2, floorZone: 10 })).toBe(true);
    expect(changesTableLayout(t, { floorPlan: 1, floorZone: 11 })).toBe(true);
    expect(changesTableLayout(t, { floorPlan: 1, floorZone: 10 })).toBe(false);
  });
});

describe('transferencia', () => {
  const tables = [
    table({ id: 1, number: 'A1', status: 'occupied' }),
    table({ id: 2, number: 'B3', status: 'occupied' }),
    table({ id: 3, number: 'C2', status: 'available' }),
    table({ id: 4, number: 'D4', status: 'cleaning' }),
    table({ id: 5, number: 'E5', status: 'out_of_service' }),
  ];

  it('sólo una mesa disponible puede recibir comensales', () => {
    expect(canReceiveTransfer(tables[2])).toBe(true);
    expect(canReceiveTransfer(tables[1])).toBe(false);
    expect(canReceiveTransfer(tables[3])).toBe(false);
    expect(canReceiveTransfer(tables[4])).toBe(false);
  });

  it('lista como destino sólo las disponibles, excluyendo el origen', () => {
    expect(eligibleTransferTargets(tables, 1).map((t) => t.number)).toEqual(['C2']);
  });

  it('redacta el bloqueo con el número entre corchetes, como la historia', () => {
    expect(transferTargetError(tables[1])).toBe(
      'Target Table [B3] is currently occupied or unavailable for transfer.',
    );
  });
});

describe('unión y liberación de grupo', () => {
  it('una hija hereda el estado de una madre ocupada', () => {
    expect(inheritedChildStatus('occupied')).toBe('occupied');
  });

  it('con la madre libre no se hereda nada', () => {
    expect(inheritedChildStatus('available')).toBeNull();
    expect(inheritedChildStatus('reserved')).toBeNull();
  });
});

describe('presentación', () => {
  it('resume la colocación como pide la parrilla', () => {
    expect(
      formatSpatialSummary({ pos_x: 100, pos_y: 150, shape: 'Circle', rotation: 90 }),
    ).toBe('Pos: [100, 150] | Circle | 90°');
  });

  it('redondea coordenadas fraccionarias del arrastre', () => {
    expect(
      formatSpatialSummary({ pos_x: 99.6, pos_y: 150.2, shape: 'Booth', rotation: 45 }),
    ).toBe('Pos: [100, 150] | Booth | 45°');
  });

  it('singulariza el asiento', () => {
    expect(formatSeats(1)).toBe('1 Seat');
    expect(formatSeats(4)).toBe('4 Seats');
  });
});
