import React from 'react';
import type { FloorZone } from '../../../../../types/dining-system';
import type { Outline } from '../../../../../lib/floor-geometry';
import { polygonArea } from '../../../../../lib/floor-geometry';
import type { UnitSystem } from '../../../../../lib/measurement-units';
import { formatArea } from '../../../../../lib/measurement-units';
import { inputClass } from './editor-ui';

interface ZoneAreaPanelProps {
  zones: FloorZone[];
  activeZoneId: number | null;
  zoneColor: string;
  /** Área dibujada de la zona activa, si tiene una. */
  zoneArea: Outline | undefined;
  unitSystem: UnitSystem;
  onSelectZone: (zoneId: number | null) => void;
  onDrawArea: () => void;
  onClearArea: () => void;
}

/** Inspector del modo "zonas": elegir zona y dibujar o quitar su área. */
export const ZoneAreaPanel: React.FC<ZoneAreaPanelProps> = ({
  zones,
  activeZoneId,
  zoneColor,
  zoneArea,
  unitSystem,
  onSelectZone,
  onDrawArea,
  onClearArea,
}) => (
  <div className="p-4 space-y-4">
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        style={{ backgroundColor: zoneColor }}
        className="inline-block w-6 h-6 rounded border border-[#e8e2d8] shrink-0"
      />
      <select
        value={activeZoneId ?? ''}
        onChange={(e) => onSelectZone(e.target.value ? Number(e.target.value) : null)}
        aria-label="Zone being edited"
        className={inputClass}
      >
        {zones.length === 0 && <option value="">No zones yet</option>}
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
    </div>

    {activeZoneId != null && zoneArea ? (
      <>
        <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
          Drag the square corners to reshape this zone. Tables dropped inside it are
          assigned to it automatically.
        </p>
        <p className="text-[11px] font-mono text-[#1d1c17]">
          {zoneArea!.length} corners ·{' '}
          {formatArea(polygonArea(zoneArea!), unitSystem)}
        </p>
        <button
          type="button"
          onClick={onClearArea}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            delete
          </span>
          Remove area
        </button>
      </>
    ) : (
      <>
        <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
          This zone has no area drawn yet, so it only colours its tables. Draw one to
          mark which part of the room belongs to it.
        </p>
        <button
          type="button"
          onClick={onDrawArea}
          disabled={activeZoneId == null}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            draw
          </span>
          Draw area
        </button>
      </>
    )}
  </div>
);
