/** The canvas is measured in px; This is the physical scale that the editor assumes. */
export const PX_PER_METER = 100;

/** 1 foot = 0.3048 m by international definition (exact, not an approximation). */
const METERS_PER_FOOT = 0.3048;
const INCHES_PER_FOOT = 12;
const PX_PER_FOOT = PX_PER_METER * METERS_PER_FOOT;
const SQ_METERS_PER_SQ_FOOT = METERS_PER_FOOT * METERS_PER_FOOT;

export type UnitSystem = 'metric' | 'imperial';

export const UNIT_SYSTEMS: UnitSystem[] = ['metric', 'imperial'];

export const UNIT_SYSTEM_LABELS: Record<UnitSystem, string> = {
  metric: 'Meters',
  imperial: 'Feet & inches',
};

export const UNIT_SYSTEM_SHORT: Record<UnitSystem, string> = {
  metric: 'm',
  imperial: 'ft',
};

/**
 * Feet and inches already rounded and normalized. Normalization is the delicate point:
 * 11.96" rounds to 12", which is NOT a valid measurement — it is 1' 0". Without this carry the
 * editor would show `5' 12"`, which to a room manager (rightly) seems like an error.
 */
function toFeetAndInches(px: number): { feet: number; inches: number } {
  const totalInches = (px / PX_PER_FOOT) * INCHES_PER_FOOT;
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = Math.round(totalInches - feet * INCHES_PER_FOOT);

  if (inches >= INCHES_PER_FOOT) {
    return { feet: feet + 1, inches: 0 };
  }

  return { feet, inches };
}

/** Length: px -> chosen unit, already formatted and with its symbol. */
export const formatLength = (px: number, system: UnitSystem): string => {
  if (system === 'imperial') {
    const { feet, inches } = toFeetAndInches(px);
    return `${feet}' ${inches}"`;
  }

  // At 100px = 1m, 1px = 1cm exactly. It is compared on the cm ALREADY rounded so that
  // 99.6px is not advertised as "100 cm" (which is a meter written in the worst way).
  const cm = Math.round(px);
  if (Math.abs(cm) < 100) {
    return `${cm} cm`;
  }

  // A decimal, but without the `.0` hanging: the default canvas is round meters
  // and "10 m" reads much better than "10.0 m."
  return `${(px / PX_PER_METER).toFixed(1).replace(/\.0$/, '')} m`;
};

/** The same but WITHOUT a symbol, to put it in a <numeric input>. */
export const lengthValue = (px: number, system: UnitSystem): number => {
  const raw = system === 'imperial' ? px / PX_PER_FOOT : px / PX_PER_METER;
  return Number(raw.toFixed(2));
};

/** Inverse of lengthValue: the number the user types -> px integers. */
export const lengthToPx = (value: number, system: UnitSystem): number =>
  Math.round(value * (system === 'imperial' ? PX_PER_FOOT : PX_PER_METER));

/** Suffix for form tags: '(m)' | '(ft)'. */
export const lengthSuffix = (system: UnitSystem): string =>
  `(${UNIT_SYSTEM_SHORT[system]})`;

/** Area: px² -> formatted surface. */
export const formatArea = (pxSquared: number, system: UnitSystem): string => {
  const squareMeters = pxSquared / (PX_PER_METER * PX_PER_METER);

  if (system === 'imperial') {
    return `${Math.round(squareMeters / SQ_METERS_PER_SQ_FOOT)} ft²`;
  }

  return `${squareMeters.toFixed(1)} m²`;
};

/** Dimensions of a canvas or footprint, already combined. */
export const formatDimensions = (
  wPx: number,
  hPx: number,
  system: UnitSystem,
): string => `${formatLength(wPx, system)} × ${formatLength(hPx, system)}`;

/** Persistent preference in localStorage (key 'x7_unit_system'). */
export const UNIT_STORAGE_KEY = 'x7_unit_system';

function isUnitSystem(value: unknown): value is UnitSystem {
  return UNIT_SYSTEMS.includes(value as UnitSystem);
}

export const loadUnitSystem = (): UnitSystem => {
  // In SSR `localStorage` does not exist and with third-party cookies blocked mere access
  // throws SecurityError. A unit preference should never overwhelm the editor: before
  // any failure falls to the metric system.
  try {
    const stored = localStorage.getItem(UNIT_STORAGE_KEY);
    return isUnitSystem(stored) ? stored : 'metric';
  } catch {
    return 'metric';
  }
};

export const saveUnitSystem = (s: UnitSystem): void => {
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, s);
  } catch {
    // Saving is best-effort: if storage is locked the user keeps their
    // choice during the session and only loses persistence.
  }
};
