import React from 'react';
import type { DiningTable, FloorZone, TableShape } from '../../../../../types/dining-system';
import {
  TABLE_MAX_SIZE_PX,
  TABLE_MIN_SIZE_PX,
  TABLE_SHAPES,
  TABLE_STATUSES,
  isTableStatus,
  tableStatusLabel,
} from '../../../../../types/dining-system';
import { childTablesOf, joinedChildrenLabel, parentTableId } from '../../../../../lib/dining-tables';
import type { Outline } from '../../../../../lib/floor-geometry';
import type { UnitSystem } from '../../../../../lib/measurement-units';
import { lengthSuffix, lengthToPx, lengthValue } from '../../../../../lib/measurement-units';
import { clamp, containToOutline, footprintOf, footprintOfTable } from '../../../../../lib/floor-plan-layout';
import { COORD_STEP, inputClass, labelClass } from './editor-ui';

interface TableInspectorProps {
  table: DiningTable;
  tables: DiningTable[];
  zones: FloorZone[];
  canvasW: number;
  canvasH: number;
  outline: Outline;
  unitSystem: UnitSystem;
  isDuplicateNumber: boolean;
  /** Mesas que pueden hacer de padre de esta (sin crear ciclos). */
  parentChoices: DiningTable[];
  /** El traspaso corre en el servidor: con cambios sin guardar se desactiva. */
  hasUnsavedChanges: boolean;
  onPatch: (patch: Partial<DiningTable>) => void;
  onMove: (x: number, y: number) => void;
  onSetParent: (parentId: number | null) => void;
  onOpenTransfer: () => void;
  onRemove: () => void;
}

/** Inspector de una mesa: número, capacidad, forma, tamaño, posición, zona, uniones y traspaso. */
export const TableInspector: React.FC<TableInspectorProps> = ({
  table,
  tables,
  zones,
  canvasW,
  canvasH,
  outline,
  unitSystem,
  isDuplicateNumber,
  parentChoices,
  hasUnsavedChanges,
  onPatch,
  onMove,
  onSetParent,
  onOpenTransfer,
  onRemove,
}) => {
  // Legacy status outside standard vocabulary is retained to prevent inadvertent mutation.
  const statusOptions: string[] = isTableStatus(table.status)
    ? TABLE_STATUSES
    : [table.status, ...TABLE_STATUSES];

  return (
    <div className="p-4 flex flex-col gap-4" data-testid="floor-plan-inspector">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="insp-number" className={labelClass}>
          Table number
        </label>
        <input
          id="insp-number"
          type="text"
          value={table.number ?? ''}
          onChange={(e) => onPatch({ number: e.target.value })}
          maxLength={50}
          className={`${inputClass} font-mono`}
        />
        {isDuplicateNumber && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            Duplicate table number — numbers must be unique per merchant.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="insp-capacity" className={labelClass}>
            Capacity
          </label>
          <input
            id="insp-capacity"
            type="number"
            min={1}
            value={table.capacity}
            onChange={(e) =>
              onPatch({
                capacity: Math.max(1, Math.round(Number(e.target.value) || 1)),
              })
            }
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="insp-shape" className={labelClass}>
            Shape
          </label>
          <select
            id="insp-shape"
            value={table.shape}
            onChange={(e) => {
              const shape = e.target.value as TableShape;
              const fp = footprintOf(shape);
              // Cambiar de forma cambia la huella: reencuadramos contra el lienzo y
              // against room boundaries so table is not partially positioned outside.
              const spot = containToOutline(
                clamp(table.pos_x, 0, Math.max(0, canvasW - fp.w)),
                clamp(table.pos_y, 0, Math.max(0, canvasH - fp.h)),
                shape,
                outline,
                canvasW,
                canvasH,
              );
              onPatch({
                shape,
                pos_x: spot.x,
                pos_y: spot.y,
              });
            }}
            className={inputClass}
          >
            {TABLE_SHAPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom dimensions: allows deviation from standard shape template.
          Empty = inherits shape default. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="insp-width" className={labelClass}>
            Table width {lengthSuffix(unitSystem)}
          </label>
          <input
            id="insp-width"
            type="number"
            step={COORD_STEP}
            min={lengthValue(TABLE_MIN_SIZE_PX, unitSystem)}
            max={lengthValue(TABLE_MAX_SIZE_PX, unitSystem)}
            value={lengthValue(footprintOfTable(table).w, unitSystem)}
            onChange={(e) => {
              const px = clamp(
                lengthToPx(Number(e.target.value) || 0, unitSystem),
                TABLE_MIN_SIZE_PX,
                TABLE_MAX_SIZE_PX,
              );
              onPatch({ width: px });
            }}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="insp-height" className={labelClass}>
            Table depth {lengthSuffix(unitSystem)}
          </label>
          <input
            id="insp-height"
            type="number"
            step={COORD_STEP}
            min={lengthValue(TABLE_MIN_SIZE_PX, unitSystem)}
            max={lengthValue(TABLE_MAX_SIZE_PX, unitSystem)}
            value={lengthValue(footprintOfTable(table).h, unitSystem)}
            onChange={(e) => {
              const px = clamp(
                lengthToPx(Number(e.target.value) || 0, unitSystem),
                TABLE_MIN_SIZE_PX,
                TABLE_MAX_SIZE_PX,
              );
              onPatch({ height: px });
            }}
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

      {(table.width != null || table.height != null) && (
        <button
          type="button"
          onClick={() =>
            onPatch({ width: null, height: null })
          }
          className="text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 text-left"
        >
          Reset to default size
        </button>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="insp-rotation" className={labelClass}>
          Rotation — {table.rotation}°
        </label>
        <input
          id="insp-rotation"
          type="range"
          min={0}
          max={360}
          step={5}
          value={table.rotation}
          onChange={(e) =>
            onPatch({ rotation: Number(e.target.value) })
          }
          className="w-full accent-[#ae001a]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="insp-status" className={labelClass}>
          Status
        </label>
        <select
          id="insp-status"
          value={table.status}
          onChange={(e) => onPatch({ status: e.target.value })}
          className={inputClass}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {tableStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="insp-location" className={labelClass}>
          Location
        </label>
        <input
          id="insp-location"
          type="text"
          value={table.location}
          onChange={(e) => onPatch({ location: e.target.value })}
          placeholder="e.g., Near window"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="insp-zone" className={labelClass}>
          Floor zone
        </label>
        <select
          id="insp-zone"
          value={table.floorZone?.id ?? ''}
          onChange={(e) => {
            const zone = zones.find((z) => z.id === Number(e.target.value));
            if (!zone) return;
            onPatch({
              floorZone: { id: zone.id, name: zone.name, color: zone.color ?? null },
            });
          }}
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

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="insp-x" className={labelClass}>
            X {lengthSuffix(unitSystem)}
          </label>
          {/* User enters values in active units, converted to pixels locally
              before persistence. */}
          <input
            id="insp-x"
            type="number"
            step={COORD_STEP}
            value={lengthValue(table.pos_x, unitSystem)}
            onChange={(e) =>
              onMove(
                lengthToPx(Number(e.target.value) || 0, unitSystem),
                table.pos_y,
              )
            }
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="insp-y" className={labelClass}>
            Y {lengthSuffix(unitSystem)}
          </label>
          <input
            id="insp-y"
            type="number"
            step={COORD_STEP}
            value={lengthValue(table.pos_y, unitSystem)}
            onChange={(e) =>
              onMove(
                table.pos_x,
                lengthToPx(Number(e.target.value) || 0, unitSystem),
              )
            }
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

      {/* ---------------- Table Merging ---------------- */}
      <div className="flex flex-col gap-1.5 pt-3 border-t border-[#e8e2d8]">
        <label htmlFor="insp-parent" className={labelClass}>
          <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
            link
          </span>{' '}
          Joined to
        </label>
        <select
          id="insp-parent"
          value={parentTableId(table) ?? ''}
          onChange={(e) =>
            onSetParent(e.target.value ? Number(e.target.value) : null,)
          }
          className={inputClass}
        >
          <option value="">Not joined — standalone</option>
          {parentChoices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.number} · {t.capacity} seats{t.id < 0 ? ' · unsaved' : ''}
            </option>
          ))}
        </select>

        {parentTableId(table) != null && (
          <button
            type="button"
            onClick={() => onSetParent(null)}
            aria-label={`Unjoin table ${table.number}`}
            className="w-full flex items-center justify-center gap-2 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              link_off
            </span>
            Unjoin
          </button>
        )}

        {joinedChildrenLabel(tables, table.id) && (
          <p
            data-testid="inspector-group-summary"
            className="text-[11px] text-[#5f5e5e] leading-relaxed"
          >
            {joinedChildrenLabel(tables, table.id)} —{' '}
            {childTablesOf(tables, table.id)
              .map((c) => c.number)
              .join(', ')}
            . Combined capacity{' '}
            {table.capacity +
              childTablesOf(tables, table.id).reduce(
                (sum, c) => sum + c.capacity,
                0,
              )}
            .
          </p>
        )}

        {parentChoices.length === 0 && parentTableId(table) == null && (
          <p className="text-[11px] text-[#5f5e5e] italic">
            No other saved table on this plan can act as the parent.
          </p>
        )}
      </div>

      {/* ---------------- Guest Transfer ---------------- */}
      {table.status === 'occupied' && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onOpenTransfer}
            disabled={hasUnsavedChanges}
            aria-label={`Transfer guests from table ${table.number}`}
            title={
              hasUnsavedChanges
                ? 'Save your layout changes first — the transfer runs on the server and would fight your pending edits.'
                : 'Move this party to another table'
            }
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#1d1c17]"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              swap_horiz
            </span>
            Transfer party
          </button>
          {hasUnsavedChanges && (
            <p className="text-[11px] text-[#5f5e5e] italic">
              Save the layout to enable the transfer.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete table ${table.number}`}
        className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          delete
        </span>
        Delete table
      </button>
    </div>
  );
};
