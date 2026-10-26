import React from 'react';
import type { Outline, Point } from '../../../../../lib/floor-geometry';
import {
  MIN_OUTLINE_VERTICES,
  OUTLINE_PRESETS,
  outlineWarning,
  rectangleOutline,
} from '../../../../../lib/floor-geometry';
import type { UnitSystem } from '../../../../../lib/measurement-units';
import { formatArea, lengthSuffix, lengthToPx, lengthValue } from '../../../../../lib/measurement-units';
import { COORD_STEP, inputClass, labelClass } from './editor-ui';

export interface PendingPreset {
  label: string;
  outline: Outline;
  warning: string;
}

interface RoomShapePanelProps {
  canvasW: number;
  canvasH: number;
  outline: Outline;
  roomAreaPx2: number;
  tableCount: number;
  outsideCount: number;
  unitSystem: UnitSystem;
  /** Plantilla que dejaría mesas fuera y espera confirmación. */
  pendingPreset: PendingPreset | null;
  selectedVertex: number | null;
  selectedVertexPoint: Point | null;
  onRequestOutline: (label: string, outline: Outline) => void;
  onConfirmPreset: () => void;
  onCancelPreset: () => void;
  onMoveVertex: (index: number, x: number, y: number) => void;
  onDeleteVertex: (index: number) => void;
  onBringTablesInside: () => void;
}

/** Inspector del modo "forma de la sala": plantillas, esquinas y mesas fuera de la sala. */
export const RoomShapePanel: React.FC<RoomShapePanelProps> = ({
  canvasW,
  canvasH,
  outline,
  roomAreaPx2,
  tableCount,
  outsideCount,
  unitSystem,
  pendingPreset,
  selectedVertex,
  selectedVertexPoint,
  onRequestOutline,
  onConfirmPreset,
  onCancelPreset,
  onMoveVertex,
  onDeleteVertex,
  onBringTablesInside,
}) => (
  <div className="p-4 flex flex-col gap-4" data-testid="floor-plan-room-panel">
    <div>
      <p className={labelClass}>Room presets</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {OUTLINE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() =>
              onRequestOutline(preset.label, preset.build(canvasW, canvasH))
            }
            aria-label={`Apply ${preset.label} room preset`}
            className="px-2 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 rounded"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onRequestOutline('Rectangle', rectangleOutline(canvasW, canvasH))}
        aria-label="Reset room shape to the full canvas"
        className="mt-2 w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          restart_alt
        </span>
        Reset to full canvas
      </button>
    </div>

    {/* Warning: applying preset places existing tables out of bounds. */}
    {pendingPreset && (
      <div
        data-testid="outline-preset-confirm"
        className="border border-[#ae001a] bg-[#f5efe6] p-3 rounded flex flex-col gap-2"
      >
        <p className="text-[11px] text-[#1d1c17] leading-relaxed">
          <strong>{pendingPreset.label}:</strong> {pendingPreset.warning}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onConfirmPreset}
            className="flex-1 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
          >
            Apply anyway
          </button>
          <button
            type="button"
            onClick={onCancelPreset}
            className="flex-1 py-2 border border-[#e8e2d8] bg-white text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    )}

    <div className="border-t border-[#e8e2d8] pt-4 flex flex-col gap-3">
      <p className="text-[11px] text-[#5f5e5e] font-mono">
        {outline.length} corners · {formatArea(roomAreaPx2, unitSystem)} ·{' '}
        {tableCount} {tableCount === 1 ? 'table' : 'tables'}
      </p>

      {selectedVertexPoint ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="insp-corner-x" className={labelClass}>
              Corner X {lengthSuffix(unitSystem)}
            </label>
            <input
              id="insp-corner-x"
              type="number"
              step={COORD_STEP}
              value={lengthValue(selectedVertexPoint.x, unitSystem)}
              onChange={(e) =>
                onMoveVertex(
                  selectedVertex as number,
                  lengthToPx(Number(e.target.value) || 0, unitSystem),
                  selectedVertexPoint.y,
                )
              }
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="insp-corner-y" className={labelClass}>
              Corner Y {lengthSuffix(unitSystem)}
            </label>
            <input
              id="insp-corner-y"
              type="number"
              step={COORD_STEP}
              value={lengthValue(selectedVertexPoint.y, unitSystem)}
              onChange={(e) =>
                onMoveVertex(
                  selectedVertex as number,
                  selectedVertexPoint.x,
                  lengthToPx(Number(e.target.value) || 0, unitSystem),
                )
              }
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
          Select a corner on the canvas to nudge or delete it.
        </p>
      )}

      <button
        type="button"
        onClick={() => onDeleteVertex(selectedVertex as number)}
        disabled={selectedVertex === null || outline.length <= MIN_OUTLINE_VERTICES}
        aria-label="Delete selected room corner"
        title={
          outline.length <= MIN_OUTLINE_VERTICES
            ? `A room needs at least ${MIN_OUTLINE_VERTICES} corners — add one before deleting another.`
            : selectedVertex === null
              ? 'Select a corner on the canvas first.'
              : undefined
        }
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#ae001a]"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          delete
        </span>
        Delete corner
      </button>
    </div>

    <div className="border-t border-[#e8e2d8] pt-4 flex flex-col gap-2">
      <p className={labelClass}>Tables outside the room</p>
      <p className="text-2xl font-black text-[#1d1c17] tabular-nums leading-none">
        {outsideCount}
      </p>
      {outsideCount > 0 && (
        <>
          <p
            data-testid="outline-warning"
            role="alert"
            className="text-[11px] font-semibold text-[#ae001a] leading-relaxed"
          >
            {outlineWarning(outsideCount)}
          </p>
          <button
            type="button"
            onClick={onBringTablesInside}
            aria-label="Bring every table inside the room"
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              move_selection_down
            </span>
            Bring all inside
          </button>
        </>
      )}
    </div>
  </div>
);
