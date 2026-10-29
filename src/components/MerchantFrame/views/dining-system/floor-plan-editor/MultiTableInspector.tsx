import React from 'react';
import type { DiningTable } from '../../../../../types/dining-system';
import { inputClass, labelClass } from './editor-ui';

interface MultiTableInspectorProps {
  selectedCount: number;
  selectedTables: DiningTable[];
  /** Mesa que hará de padre al unirlas (la elegida o la primera de la selección). */
  joinParentId: number | null;
  onChangeJoinParent: (tableId: number) => void;
  onJoin: (parentId: number) => void;
  onUnjoin: () => void;
  onClearSelection: () => void;
}

/** Inspector con varias mesas seleccionadas: unirlas o separarlas. */
export const MultiTableInspector: React.FC<MultiTableInspectorProps> = ({
  selectedCount,
  selectedTables,
  joinParentId,
  onChangeJoinParent,
  onJoin,
  onUnjoin,
  onClearSelection,
}) => (
  <div className="p-4 flex flex-col gap-4" data-testid="floor-plan-multi-inspector">
    <div>
      <p className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider">
        Selection
      </p>
      <p className="text-sm text-[#1d1c17] mt-1">
        <strong>{selectedCount} tables</strong> selected ·{' '}
        {selectedTables.reduce((sum, t) => sum + t.capacity, 0)} seats combined
      </p>
      <p className="text-[11px] text-[#5f5e5e] mt-1 font-mono">
        {selectedTables.map((t) => t.number).join(', ')}
      </p>
    </div>

    <div className="flex flex-col gap-1.5">
      <label htmlFor="multi-parent" className={labelClass}>
        <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
          link
        </span>{' '}
        Join them under
      </label>
      <select
        id="multi-parent"
        value={joinParentId ?? ''}
        onChange={(e) => onChangeJoinParent(Number(e.target.value))}
        className={inputClass}
      >
        {selectedTables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.number} · {t.capacity} seats{t.id < 0 ? ' · unsaved' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() =>
          joinParentId != null && onJoin(joinParentId)
        }
        aria-label={`Join ${selectedCount} selected tables`}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          link
        </span>
        Join {selectedCount} tables
      </button>
      <button
        type="button"
        onClick={onUnjoin}
        aria-label="Unjoin the selected tables"
        className="w-full flex items-center justify-center gap-2 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          link_off
        </span>
        Unjoin selected
      </button>
    </div>

    <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
      Ctrl/Cmd-click adds or removes a table. Drag on empty floor to box-select. The
      parent keeps the group together; the rest hang from it.
    </p>

    <button
      type="button"
      onClick={onClearSelection}
      className="w-full py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[10px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
    >
      Clear selection
    </button>
  </div>
);
