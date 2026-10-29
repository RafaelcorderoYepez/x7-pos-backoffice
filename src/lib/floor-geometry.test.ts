import { describe, expect, it } from 'vitest';
import {
  MIN_OUTLINE_VERTICES,
  OUTLINE_PRESETS,
  clampPointToPolygon,
  insertVertex,
  outlinePath,
  outlineWarning,
  parseOutline,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  rectangleOutline,
  removeVertex,
  serializeOutline,
  tableInsideOutline,
  tablesOutsideOutline,
  validateOutline,
} from './floor-geometry';
import type { Outline } from './floor-geometry';

const preset = (id: string) => {
  const found = OUTLINE_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`preset ${id} missing`);
  return found;
};

// 1000x1000 L-shaped plan: left vertical bar (0..450) + lower horizontal bar
// (and 600..1000). The top right notch is inside the surround box but OUTSIDE
// of the room: it is the case that distinguishes a real point-in-polygon from a bounds check.
const L: Outline = preset('l-shape').build(1000, 1000);

describe('floor-geometry — rectangleOutline', () => {
  it('returns the 4 corners in order from the origin', () => {
    expect(rectangleOutline(800, 600)).toEqual([
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 600 },
      { x: 0, y: 600 },
    ]);
  });

  it('is a valid polygon and its area matches w*h', () => {
    expect(validateOutline(rectangleOutline(800, 600))).toBe('');
    expect(polygonArea(rectangleOutline(800, 600))).toBe(480000);
  });
});

describe('floor-geometry — presets', () => {
  it('exposes exactly the four ids of the contract, in order', () => {
    expect(OUTLINE_PRESETS.map((p) => p.id)).toEqual([
      'rectangle',
      'l-shape',
      'u-shape',
      'cut-corner',
    ]);
    expect(OUTLINE_PRESETS.map((p) => p.label)).toEqual([
      'Rectangle',
      'L-Shape',
      'U-Shape',
      'Cut Corner',
    ]);
  });

  it('all produce valid polygons with integer coordinates within the canvas', () => {
    for (const p of OUTLINE_PRESETS) {
      const outline = p.build(1000, 800);
      expect(validateOutline(outline), p.id).toBe('');
      for (const v of outline) {
        expect(Number.isInteger(v.x), `${p.id} x`).toBe(true);
        expect(Number.isInteger(v.y), `${p.id} y`).toBe(true);
        expect(v.x).toBeGreaterThanOrEqual(0);
        expect(v.y).toBeGreaterThanOrEqual(0);
        expect(v.x).toBeLessThanOrEqual(1000);
        expect(v.y).toBeLessThanOrEqual(800);
      }
    }
  });

  it("'rectangle' is the complete rectangle", () => {
    expect(preset('rectangle').build(500, 400)).toEqual(rectangleOutline(500, 400));
    expect(polygonArea(preset('rectangle').build(500, 400))).toBe(200000);
  });

  it("'l-shape' has 6 vertices and trims top right notch", () => {
    expect(L).toHaveLength(6);
    // Area = entire canvas minus the notch (550 x 600).
    expect(polygonArea(L)).toBe(1000 * 1000 - 550 * 600);
    // Even if a corner is missing, the enveloping box is still the complete canvas.
    expect(polygonBounds(L)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 1000,
      width: 1000,
      height: 1000,
    });
  });

  it("'u-shape' has 8 vertices and opens top center notch", () => {
    const u = preset('u-shape').build(1000, 1000);
    expect(u).toHaveLength(8);
    expect(pointInPolygon({ x: 500, y: 200 }, u)).toBe(false); // hueco central
    expect(pointInPolygon({ x: 150, y: 300 }, u)).toBe(true); // pata izquierda
    expect(pointInPolygon({ x: 850, y: 300 }, u)).toBe(true); // pata derecha
    expect(pointInPolygon({ x: 500, y: 800 }, u)).toBe(true); // barra inferior
    expect(polygonArea(u)).toBe(1000 * 1000 - 400 * 600);
  });

  it("'cut-corner' achaflana la esquina superior derecha", () => {
    const c = preset('cut-corner').build(1000, 800);
    expect(c).toHaveLength(5);
    // Chamfer = 25% of short side (800) = 200 -> 200x200 triangle.
    expect(polygonArea(c)).toBe(1000 * 800 - (200 * 200) / 2);
    expect(pointInPolygon({ x: 960, y: 20 }, c)).toBe(false); // inside the cut chamfer
    expect(pointInPolygon({ x: 960, y: 400 }, c)).toBe(true);
  });
});

describe('floor-geometry — pointInPolygon with L-shaped plan', () => {
  it('a point in the notch is OUT even if it is inside the bounding box', () => {
    const notch = { x: 800, y: 200 };
    const bounds = polygonBounds(L);
    // Proof that the bounding box is not enough: the point satisfies it and yet it is outside.
    expect(notch.x).toBeLessThan(bounds.maxX);
    expect(notch.y).toBeLessThan(bounds.maxY);
    expect(pointInPolygon(notch, L)).toBe(false);
  });

  it('accepts points from the vertical bar and the horizontal bar', () => {
    expect(pointInPolygon({ x: 200, y: 200 }, L)).toBe(true); // barra vertical
    expect(pointInPolygon({ x: 200, y: 900 }, L)).toBe(true); // barra horizontal
    expect(pointInPolygon({ x: 800, y: 900 }, L)).toBe(true); // ala derecha inferior
  });

  it('the edge counts as inside: vertices, edges and the edge of the hole', () => {
    for (const v of L) expect(pointInPolygon(v, L)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 500 }, L)).toBe(true); // pared izquierda
    expect(pointInPolygon({ x: 700, y: 600 }, L)).toBe(true); // interior wall of the hole
    expect(pointInPolygon({ x: 450, y: 300 }, L)).toBe(true); // vertical hole wall
  });

  it('rejects off-canvas points and degenerate polygons', () => {
    expect(pointInPolygon({ x: -5, y: 500 }, L)).toBe(false);
    expect(pointInPolygon({ x: 500, y: 1200 }, L)).toBe(false);
    expect(pointInPolygon({ x: 10, y: 10 }, [])).toBe(false);
    expect(pointInPolygon({ x: 10, y: 10 }, [{ x: 0, y: 0 }, { x: 20, y: 20 }])).toBe(false);
  });
});

describe('floor-geometry — parseOutline', () => {
  it('falls to rectangle with null, undefined and empty string', () => {
    expect(parseOutline(null, 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline(undefined, 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('', 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('   ', 800, 600)).toEqual(rectangleOutline(800, 600));
  });

  it('falls to rectangle with invalid JSON without throwing', () => {
    expect(() => parseOutline('{no soy json', 800, 600)).not.toThrow();
    expect(parseOutline('{no soy json', 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('[{"x":0,"y":', 800, 600)).toEqual(rectangleOutline(800, 600));
  });

  it('falls to rectangle with types that are not an array of points', () => {
    expect(parseOutline(42, 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline({ x: 1, y: 2 }, 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('"soy un string json"', 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('null', 800, 600)).toEqual(rectangleOutline(800, 600));
  });

  it('falls into rectangle with garbage array or corrupt vertices', () => {
    expect(parseOutline('[1,2,3]', 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline([null, 'x', 7], 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(
      parseOutline([{ x: 0, y: 0 }, { x: 10, y: 'diez' }, { x: 0, y: 10 }], 800, 600),
    ).toEqual(rectangleOutline(800, 600));
    expect(
      parseOutline([{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 0, y: 10 }], 800, 600),
    ).toEqual(rectangleOutline(800, 600));
  });

  it('falls into the rectangle with useless polygons (few vertices or zero area)', () => {
    expect(parseOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }], 800, 600)).toEqual(
      rectangleOutline(800, 600),
    );
    // Three collinear vertices: without a surface, it is not a room.
    expect(
      parseOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }], 800, 600),
    ).toEqual(rectangleOutline(800, 600));
  });

  it('accepts a valid JSON string (what the backend returns)', () => {
    const raw = '[{"x":0,"y":0},{"x":800,"y":0},{"x":800,"y":600},{"x":0,"y":600}]';
    expect(parseOutline(raw, 999, 999)).toEqual(rectangleOutline(800, 600));
  });

  it('acepta un array ya parseado y descarta claves extra', () => {
    const parsed = parseOutline(L, 1000, 1000);
    expect(parsed).toEqual(L);
    expect(parsed).not.toBe(L); // defensive copy: editor can mutate its own state
    expect(
      parseOutline([
        { x: 0, y: 0, id: 'a' },
        { x: 10, y: 0, id: 'b' },
        { x: 10, y: 10, id: 'c' },
      ], 800, 600),
    ).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });
});

describe('floor-geometry — serializeOutline', () => {
  it('redondea a enteros', () => {
    expect(serializeOutline([{ x: 0.4, y: 0.6 }, { x: 99.5, y: 10.2 }, { x: 0, y: 20 }])).toBe(
      '[{"x":0,"y":1},{"x":100,"y":10},{"x":0,"y":20}]',
    );
  });

  it('round trip serialize -> parse preserves the polygon', () => {
    for (const p of OUTLINE_PRESETS) {
      const original = p.build(1200, 900);
      expect(parseOutline(serializeOutline(original), 1200, 900), p.id).toEqual(original);
    }
  });

  it('round trip with decimals: the parse recovers the already rounded polygon', () => {
    const messy: Outline = [
      { x: 0.2, y: 0.7 },
      { x: 300.49, y: 1.1 },
      { x: 299.51, y: 200.4 },
      { x: 1.4, y: 199.6 },
    ];
    expect(parseOutline(serializeOutline(messy), 800, 600)).toEqual([
      { x: 0, y: 1 },
      { x: 300, y: 1 },
      { x: 300, y: 200 },
      { x: 1, y: 200 },
    ]);
  });
});

describe('floor-geometry — polygonBounds y polygonArea', () => {
  it('calculates the envelope box of a displaced polygon', () => {
    expect(
      polygonBounds([{ x: 40, y: 10 }, { x: 240, y: 10 }, { x: 240, y: 110 }, { x: 40, y: 110 }]),
    ).toEqual({ minX: 40, minY: 10, maxX: 240, maxY: 110, width: 200, height: 100 });
  });

  it('returns a degenerate box at the origin if the contour is empty', () => {
    expect(polygonBounds([])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    });
  });

  it('The area is absolute: it does not depend on the direction of rotation', () => {
    const cw = rectangleOutline(300, 200);
    const ccw = [...cw].reverse();
    expect(polygonArea(cw)).toBe(60000);
    expect(polygonArea(ccw)).toBe(60000);
  });

  it('the area of a triangle and degenerate figures', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 50 }])).toBe(2500);
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }])).toBe(0);
  });
});

describe('floor-geometry — outlinePath', () => {
  it('genera un path SVG cerrado', () => {
    expect(outlinePath(rectangleOutline(800, 600))).toBe(
      'M 0 0 L 800 0 L 800 600 L 0 600 Z',
    );
  });

  it('returns empty string with no vertices', () => {
    expect(outlinePath([])).toBe('');
  });
});

describe('floor-geometry — clampPointToPolygon', () => {
  const rect = rectangleOutline(800, 600);

  it('returns the point as is if it is already inside', () => {
    expect(clampPointToPolygon({ x: 400, y: 300 }, rect)).toEqual({ x: 400, y: 300 });
  });

  it('inserts a point that left the rectangle inside', () => {
    const clamped = clampPointToPolygon({ x: 950, y: 300 }, rect);
    expect(clamped).toEqual({ x: 799, y: 300 });
    expect(pointInPolygon(clamped, rect)).toBe(true);
  });

  it('bounded by the four walls', () => {
    expect(clampPointToPolygon({ x: -50, y: 300 }, rect)).toEqual({ x: 1, y: 300 });
    expect(clampPointToPolygon({ x: 400, y: -50 }, rect)).toEqual({ x: 400, y: 1 });
    expect(clampPointToPolygon({ x: 400, y: 999 }, rect)).toEqual({ x: 400, y: 599 });
  });

  it('a dot in the L notch sticks to the REAL wall, not the box', () => {
    // (500, 100) is in the gap; The closest wall is the vertical one x=450.
    const clamped = clampPointToPolygon({ x: 500, y: 100 }, L);
    expect(pointInPolygon(clamped, L)).toBe(true);
    expect(clamped).toEqual({ x: 449, y: 100 });
  });

  it('a point deep in the notch keeps falling into the room', () => {
    const clamped = clampPointToPolygon({ x: 900, y: 100 }, L);
    expect(pointInPolygon(clamped, L)).toBe(true);
  });

  it('returns the untouched point if the polygon is not usable', () => {
    expect(clampPointToPolygon({ x: 5, y: 5 }, [])).toEqual({ x: 5, y: 5 });
    expect(clampPointToPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual({
      x: 5,
      y: 5,
    });
  });
});

describe('floor-geometry — tableInsideOutline', () => {
  const rect = rectangleOutline(800, 600);

  it('an entire table inside passes', () => {
    expect(tableInsideOutline({ pos_x: 100, pos_y: 100, shape: 'Square' }, rect)).toBe(true);
    expect(tableInsideOutline({ pos_x: 100, pos_y: 100, shape: 'Circle' }, rect)).toBe(true);
    expect(tableInsideOutline({ pos_x: 100, pos_y: 100, shape: 'Rectangle' }, rect)).toBe(true);
  });

  it('a table straddling the edge DOES NOT pass: the 4 corners are checked', () => {
    // Origin inside, right corner at 840 > 800.
    expect(tableInsideOutline({ pos_x: 760, pos_y: 100, shape: 'Square' }, rect)).toBe(false);
    // Just attached to the wall (edge included) it does pass.
    expect(tableInsideOutline({ pos_x: 720, pos_y: 100, shape: 'Square' }, rect)).toBe(true);
    // Rectangle is 120x70: it measures differently than Square in the same place.
    expect(tableInsideOutline({ pos_x: 700, pos_y: 100, shape: 'Rectangle' }, rect)).toBe(false);
    expect(tableInsideOutline({ pos_x: 680, pos_y: 100, shape: 'Rectangle' }, rect)).toBe(true);
  });

  it('an unknown shape falls into Square footprint', () => {
    expect(tableInsideOutline({ pos_x: 720, pos_y: 100, shape: 'Hexagon' }, rect)).toBe(true);
    expect(tableInsideOutline({ pos_x: 760, pos_y: 100, shape: 'Hexagon' }, rect)).toBe(false);
  });

  it('in the L, a table inside the notch is outside the room', () => {
    expect(tableInsideOutline({ pos_x: 600, pos_y: 100, shape: 'Square' }, L)).toBe(false);
    // And one that shows the corner into the hole too: the bounding box would consider it good.
    expect(tableInsideOutline({ pos_x: 400, pos_y: 100, shape: 'Square' }, L)).toBe(false);
    expect(tableInsideOutline({ pos_x: 350, pos_y: 100, shape: 'Square' }, L)).toBe(true);
  });
});

describe('floor-geometry — tablesOutsideOutline y outlineWarning', () => {
  const rect = rectangleOutline(800, 600);

  it('count only the tables that leave', () => {
    const tables = [
      { pos_x: 10, pos_y: 10, shape: 'Square' },
      { pos_x: 780, pos_y: 10, shape: 'Square' },
      { pos_x: 10, pos_y: 580, shape: 'Circle' },
      { pos_x: 200, pos_y: 200, shape: 'Rectangle' },
    ];
    expect(tablesOutsideOutline(tables, rect)).toBe(2);
    expect(tablesOutsideOutline([], rect)).toBe(0);
  });

  it('the same layout loses more tables when moving to an L-shaped plan', () => {
    const tables = [
      { pos_x: 100, pos_y: 100, shape: 'Square' }, // barra vertical
      { pos_x: 700, pos_y: 100, shape: 'Square' }, // falls into the notch
      { pos_x: 700, pos_y: 800, shape: 'Square' }, // barra horizontal
    ];
    expect(tablesOutsideOutline(tables, rectangleOutline(1000, 1000))).toBe(0);
    expect(tablesOutsideOutline(tables, L)).toBe(1);
  });

  it('the notice uses the exact text of the contract and always plural', () => {
    expect(outlineWarning(0)).toBe('');
    expect(outlineWarning(-1)).toBe('');
    expect(outlineWarning(1)).toBe(
      'The new room shape leaves 1 tables outside its boundary. Move them inside before saving.',
    );
    expect(outlineWarning(7)).toBe(
      'The new room shape leaves 7 tables outside its boundary. Move them inside before saving.',
    );
  });
});

describe('floor-geometry — insertVertex', () => {
  const rect = rectangleOutline(800, 600);

  it('insert the midpoint just behind the edge', () => {
    const next = insertVertex(rect, 0);
    expect(next).toHaveLength(5);
    expect(next[1]).toEqual({ x: 400, y: 0 });
    expect(next[0]).toEqual({ x: 0, y: 0 });
    expect(next[2]).toEqual({ x: 800, y: 0 });
  });

  it('the last edge closes the polygon (n-1 -> 0)', () => {
    const next = insertVertex(rect, 3);
    expect(next).toHaveLength(5);
    expect(next[4]).toEqual({ x: 0, y: 300 });
  });

  it('does not mutate the original and returns a new array', () => {
    const next = insertVertex(rect, 1);
    expect(rect).toHaveLength(4);
    expect(next).not.toBe(rect);
  });

  it('with invalid index returns an intact copy', () => {
    for (const bad of [-1, 4, 99, 1.5, Number.NaN]) {
      const next = insertVertex(rect, bad);
      expect(next).toEqual(rect);
      expect(next).not.toBe(rect);
    }
  });

  it('the resulting polygon is still valid and with the same area', () => {
    const next = insertVertex(L, 2);
    expect(validateOutline(next)).toBe('');
    expect(polygonArea(next)).toBe(polygonArea(L)); // a midpoint does not change the surface
  });
});

describe('floor-geometry — removeVertex', () => {
  it('remove the indicated vertex', () => {
    const pentagon = insertVertex(rectangleOutline(800, 600), 0);
    const next = removeVertex(pentagon, 1);
    expect(next).toHaveLength(4);
    expect(next).toEqual(rectangleOutline(800, 600));
  });

  it('the original does not mutate', () => {
    const hex = [...L];
    const next = removeVertex(hex, 0);
    expect(hex).toHaveLength(6);
    expect(next).toHaveLength(5);
  });

  it('respects the ground of MIN_OUTLINE_VERTICES: a triangle cannot be reduced', () => {
    const triangle: Outline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(MIN_OUTLINE_VERTICES).toBe(3);
    expect(removeVertex(triangle, 0)).toBe(triangle);
    expect(removeVertex(triangle, 2)).toBe(triangle);
    expect(triangle).toHaveLength(3);
  });

  it('a quadrilateral does go down to a triangle, but only once', () => {
    const quad = rectangleOutline(800, 600);
    const tri = removeVertex(quad, 3);
    expect(tri).toHaveLength(3);
    expect(removeVertex(tri, 0)).toBe(tri);
  });

  it('with invalid index returns the original untouched', () => {
    const rect = rectangleOutline(800, 600);
    for (const bad of [-1, 4, 99, 0.5, Number.NaN]) {
      expect(removeVertex(rect, bad)).toBe(rect);
    }
  });
});

describe('floor-geometry — validateOutline', () => {
  it('accepts usable polygons', () => {
    expect(validateOutline(rectangleOutline(300, 300))).toBe('');
    expect(validateOutline(L)).toBe('');
    expect(validateOutline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toBe('');
  });

  it('requires at least 3 corners', () => {
    expect(validateOutline([])).toBe('A room outline needs at least 3 corners.');
    expect(validateOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe(
      'A room outline needs at least 3 corners.',
    );
  });

  it('rejects coordinates that are not finite numbers', () => {
    expect(
      validateOutline([{ x: 0, y: 0 }, { x: Number.NaN, y: 10 }, { x: 10, y: 10 }]),
    ).toBe('Room outline corners must be valid numbers.');
    expect(
      validateOutline([{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 10 }, { x: 10, y: 10 }]),
    ).toBe('Room outline corners must be valid numbers.');
    expect(
      validateOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }, { y: 20 }] as unknown as Outline),
    ).toBe('Room outline corners must be valid numbers.');
  });

  it('rejects polygons without surface', () => {
    expect(
      validateOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }]),
    ).toBe('Room outline must enclose an area.');
    expect(
      validateOutline([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]),
    ).toBe('Room outline must enclose an area.');
  });
});
