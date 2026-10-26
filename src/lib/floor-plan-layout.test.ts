import { describe, expect, it } from 'vitest';
import type { DiningTable } from '../types/dining-system';
import { OUTLINE_PRESETS, rectangleOutline, tableInsideOutline } from './floor-geometry';
import type { Outline } from './floor-geometry';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  containToOutline,
  findFreeSpot,
  fitZoom,
  nextTableNumber,
  resolveParentId,
  snap,
} from './floor-plan-layout';

const ROOM = rectangleOutline(1000, 1000);

// Planta en L de 1000x1000: la muesca superior derecha queda fuera de la sala.
const L_SHAPE: Outline = OUTLINE_PRESETS.find((p) => p.id === 'l-shape')!.build(1000, 1000);

describe('floor-plan-layout — snap', () => {
  it('redondea a la media celda de 10px', () => {
    expect(snap(14)).toBe(10);
    expect(snap(15)).toBe(20);
  });
});

describe('floor-plan-layout — fitZoom', () => {
  it('elige el mayor paso de zoom con el que cabe el lienzo entero', () => {
    expect(fitZoom(800, 600, 1000, 1000)).toBe(0.5);
    expect(fitZoom(1000, 1000, 1000, 1000)).toBe(1);
    expect(fitZoom(5000, 5000, 1000, 1000)).toBe(MAX_ZOOM);
  });

  it('no baja del zoom mínimo aunque el lienzo no quepa', () => {
    expect(fitZoom(100, 100, 5000, 5000)).toBe(MIN_ZOOM);
  });

  it('vuelve a 1 mientras el viewport o el lienzo no tienen tamaño', () => {
    expect(fitZoom(0, 600, 1000, 1000)).toBe(1);
    expect(fitZoom(800, 600, 0, 1000)).toBe(1);
  });
});

describe('floor-plan-layout — containToOutline', () => {
  it('deja como está una mesa que ya cabe en la sala', () => {
    expect(containToOutline(100, 100, 'Square', ROOM, 1000, 1000)).toEqual({ x: 100, y: 100 });
  });

  it('mete dentro una mesa que se sale por el borde del lienzo', () => {
    expect(containToOutline(-50, -50, 'Square', ROOM, 1000, 1000)).toEqual({ x: 0, y: 0 });
    expect(containToOutline(990, 990, 'Square', ROOM, 1000, 1000)).toEqual({ x: 920, y: 920 });
  });

  it('saca una mesa de la muesca de una planta en L', () => {
    const placed = containToOutline(700, 100, 'Square', L_SHAPE, 1000, 1000);
    expect(tableInsideOutline({ pos_x: placed.x, pos_y: placed.y, shape: 'Square' }, L_SHAPE)).toBe(true);
  });
});

describe('floor-plan-layout — findFreeSpot', () => {
  const table = (pos_x: number, pos_y: number): Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape'> => ({
    pos_x,
    pos_y,
    shape: 'Square',
  });

  it('coloca la primera mesa en el centro de la sala, ajustada a la rejilla', () => {
    expect(findFreeSpot('Square', [], 1000, 1000, ROOM)).toEqual({ x: 460, y: 460 });
  });

  it('no apila una mesa nueva encima de otra', () => {
    const existing = [table(460, 460)];
    const spot = findFreeSpot('Square', existing, 1000, 1000, ROOM);
    const overlaps = spot.x < 540 && spot.x + 80 > 460 && spot.y < 540 && spot.y + 80 > 460;
    expect(overlaps).toBe(false);
  });

  it('en una planta en L busca un hueco dentro de la sala aunque el centro caiga fuera', () => {
    const spot = findFreeSpot('Square', [], 1000, 1000, L_SHAPE);
    expect(tableInsideOutline({ pos_x: spot.x, pos_y: spot.y, shape: 'Square' }, L_SHAPE)).toBe(true);
  });
});

describe('floor-plan-layout — resolveParentId', () => {
  const created = [{ tempId: -2, row: { id: 57 } as DiningTable }];

  it('mantiene ids reales y deja null a las mesas sin unir', () => {
    expect(resolveParentId(12, created)).toBe(12);
    expect(resolveParentId(null, created)).toBeNull();
  });

  it('traduce el id temporal de una mesa recién creada al id del backend', () => {
    expect(resolveParentId(-2, created)).toBe(57);
  });

  it('devuelve null si la mesa padre no llegó a crearse', () => {
    expect(resolveParentId(-9, created)).toBeNull();
  });
});

describe('floor-plan-layout — nextTableNumber', () => {
  it('devuelve el primer T{n} libre sin distinguir mayúsculas', () => {
    expect(nextTableNumber(new Set())).toBe('T1');
    expect(nextTableNumber(new Set(['t1', 't2', 't4']))).toBe('T3');
  });
});
