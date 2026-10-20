import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PX_PER_METER,
  UNIT_STORAGE_KEY,
  UNIT_SYSTEMS,
  UNIT_SYSTEM_LABELS,
  UNIT_SYSTEM_SHORT,
  formatArea,
  formatDimensions,
  formatLength,
  lengthSuffix,
  lengthToPx,
  lengthValue,
  loadUnitSystem,
  saveUnitSystem,
} from './measurement-units';
import type { UnitSystem } from './measurement-units';

describe('constantes', () => {
  it('assumes editor scale: 100px = 1m', () => {
    expect(PX_PER_METER).toBe(100);
  });

  it('exposes the two systems with their labels', () => {
    expect(UNIT_SYSTEMS).toEqual(['metric', 'imperial']);
    expect(UNIT_SYSTEM_LABELS.metric).toBe('Meters');
    expect(UNIT_SYSTEM_LABELS.imperial).toBe('Feet & inches');
    expect(UNIT_SYSTEM_SHORT.metric).toBe('m');
    expect(UNIT_SYSTEM_SHORT.imperial).toBe('ft');
  });
});

describe('formatLength · metric', () => {
  it('format meters with a decimal', () => {
    expect(formatLength(850, 'metric')).toBe('8.5 m');
    expect(formatLength(1234, 'metric')).toBe('12.3 m');
  });

  it('omits decimal when zero', () => {
    expect(formatLength(1000, 'metric')).toBe('10 m');
    expect(formatLength(300, 'metric')).toBe('3 m');
    expect(formatLength(4000, 'metric')).toBe('40 m');
  });

  it('use whole centimeters below a meter', () => {
    expect(formatLength(40, 'metric')).toBe('40 cm');
    expect(formatLength(99, 'metric')).toBe('99 cm');
    expect(formatLength(0, 'metric')).toBe('0 cm');
    expect(formatLength(12.4, 'metric')).toBe('12 cm');
  });

  it('nunca anuncia "100 cm": a partir de un metro cambia de unidad', () => {
    expect(formatLength(100, 'metric')).toBe('1 m');
    expect(formatLength(99.6, 'metric')).toBe('1 m');
  });
});

describe('formatLength · imperial', () => {
  it('formatea pies y pulgadas', () => {
    expect(formatLength(850, 'imperial')).toBe('27\' 11"');
    expect(formatLength(1000, 'imperial')).toBe('32\' 10"');
    expect(formatLength(300, 'imperial')).toBe('9\' 10"');
    expect(formatLength(4000, 'imperial')).toBe('131\' 3"');
    expect(formatLength(0, 'imperial')).toBe('0\' 0"');
  });

  it('use the exact foot of 0.3048 m', () => {
    // 30.48px es un pie clavado; 304.8px son diez.
    expect(formatLength(30.48, 'imperial')).toBe('1\' 0"');
    expect(formatLength(304.8, 'imperial')).toBe('10\' 0"');
  });

  it('carries over when inches round to 12 (never shows 5\' 12")', () => {
    // 182.8px = 5' 11.97": Inch rounds to 12 and should go up to 6' 0".
    expect(formatLength(182.8, 'imperial')).toBe('6\' 0"');
    // 700px = 22' 11.59": same carry, one more foot and zero inches.
    expect(formatLength(700, 'imperial')).toBe('23\' 0"');

    for (const px of [182.8, 700, 30.47, 152.39]) {
      expect(formatLength(px, 'imperial')).not.toContain('12"');
    }
  });
});

describe('lengthValue', () => {
  it('returns meters with two decimal places', () => {
    expect(lengthValue(850, 'metric')).toBe(8.5);
    expect(lengthValue(1234, 'metric')).toBe(12.34);
    expect(lengthValue(4000, 'metric')).toBe(40);
  });

  it('returns feet to two decimal places', () => {
    expect(lengthValue(1000, 'imperial')).toBe(32.81);
    expect(lengthValue(300, 'imperial')).toBe(9.84);
    expect(lengthValue(4000, 'imperial')).toBe(131.23);
  });

  it('It does not have a symbol: it is a number ready for a <input>', () => {
    expect(typeof lengthValue(800, 'metric')).toBe('number');
    expect(typeof lengthValue(800, 'imperial')).toBe('number');
  });
});

describe('lengthToPx', () => {
  it('converts what is typed by the user to integer px', () => {
    expect(lengthToPx(10, 'metric')).toBe(1000);
    expect(lengthToPx(8.5, 'metric')).toBe(850);
    expect(lengthToPx(1, 'imperial')).toBe(30);
    expect(lengthToPx(10, 'imperial')).toBe(305);
  });

  it('always returns integers - backend saves px as int', () => {
    for (const value of [3.33, 9.84, 26.25, 131.23]) {
      expect(Number.isInteger(lengthToPx(value, 'metric'))).toBe(true);
      expect(Number.isInteger(lengthToPx(value, 'imperial'))).toBe(true);
    }
  });
});

describe('ida y vuelta px -> valor -> px', () => {
  const TYPICAL = [300, 800, 1000, 4000];

  it.each(UNIT_SYSTEMS)('preserves typical canvas dimensions in %s', (system) => {
    for (const px of TYPICAL) {
      expect(lengthToPx(lengthValue(px, system), system)).toBe(px);
    }
  });

  it('does not deviate more than 1px in the entire valid range of the canvas', () => {
    for (let px = 300; px <= 4000; px += 7) {
      for (const system of UNIT_SYSTEMS) {
        const back = lengthToPx(lengthValue(px, system), system);
        expect(Math.abs(back - px)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('lengthSuffix', () => {
  it('gives the suffix of the form tags', () => {
    expect(lengthSuffix('metric')).toBe('(m)');
    expect(lengthSuffix('imperial')).toBe('(ft)');
  });
});

describe('formatArea', () => {
  it('format m² with a decimal', () => {
    expect(formatArea(469000, 'metric')).toBe('46.9 m²');
    expect(formatArea(700000, 'metric')).toBe('70.0 m²');
    expect(formatArea(0, 'metric')).toBe('0.0 m²');
  });

  it('format ft² as integer', () => {
    expect(formatArea(469000, 'imperial')).toBe('505 ft²');
    expect(formatArea(700000, 'imperial')).toBe('753 ft²');
    expect(formatArea(0, 'imperial')).toBe('0 ft²');
  });

  it('un metro cuadrado son 10.76 ft² (pie exacto)', () => {
    expect(formatArea(10000, 'metric')).toBe('1.0 m²');
    expect(formatArea(10000, 'imperial')).toBe('11 ft²');
  });
});

describe('formatDimensions', () => {
  it('combine both axes with the × sign (U+00D7)', () => {
    expect(formatDimensions(1000, 700, 'metric')).toBe('10 m × 7 m');
    expect(formatDimensions(1000, 700, 'metric')).toContain('×');
  });

  it('applies inch carry on each axis separately', () => {
    // 700px redondea a 12" y sube: "23' 0"", nunca "22' 12"".
    expect(formatDimensions(1000, 700, 'imperial')).toBe('32\' 10" × 23\' 0"');
  });

  it('delegates to formatLength, so it inherits the centimeter rule', () => {
    expect(formatDimensions(80, 80, 'metric')).toBe('80 cm × 80 cm');
    expect(formatDimensions(120, 70, 'metric')).toBe('1.2 m × 70 cm');
  });
});

describe('preferencia persistida', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('use the agreed key', () => {
    expect(UNIT_STORAGE_KEY).toBe('x7_unit_system');
  });

  it('falls into metric when nothing is saved', () => {
    expect(loadUnitSystem()).toBe('metric');
  });

  it('read what was saved', () => {
    saveUnitSystem('imperial');
    expect(localStorage.getItem(UNIT_STORAGE_KEY)).toBe('imperial');
    expect(loadUnitSystem()).toBe('imperial');

    saveUnitSystem('metric');
    expect(loadUnitSystem()).toBe('metric');
  });

  it('drops in metric when the saved is garbage', () => {
    for (const junk of ['', 'METRIC', 'furlongs', '{"a":1}', 'null', 'undefined']) {
      localStorage.setItem(UNIT_STORAGE_KEY, junk);
      expect(loadUnitSystem()).toBe('metric');
    }
  });

  it('does not throw if storage is locked (SecurityError)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => loadUnitSystem()).not.toThrow();
    expect(loadUnitSystem()).toBe('metric');
  });

  it('save also doesn't launch with storage locked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => saveUnitSystem('imperial')).not.toThrow();
  });

  it('accepts any UnitSystem from the catalog', () => {
    for (const system of UNIT_SYSTEMS) {
      saveUnitSystem(system);
      expect(loadUnitSystem()).toBe(system);
    }
  });
});

describe('runtime type coverage', () => {
  it('formats without breaking on both systems', () => {
    const systems: UnitSystem[] = UNIT_SYSTEMS;
    for (const system of systems) {
      expect(formatLength(1000, system)).toMatch(/\d/);
      expect(formatArea(1000000, system)).toMatch(/\d/);
      expect(formatDimensions(1000, 1000, system)).toContain('×');
    }
  });
});
