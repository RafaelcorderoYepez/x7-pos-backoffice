// Unión de mesas para grupos grandes: se eligen las mesas que se acercan a una mesa madre.
//
// La lista de candidatas la calcula eligibleParentTables() al revés: aquí lo que se excluye
// es la propia madre y su descendencia, para que no se pueda cerrar un ciclo (A madre de B,
// B madre de A). El backend sólo vigila el ciclo de un salto, así que este filtro es el que
// sostiene la regla en cadenas largas.

import React, { useMemo, useState } from 'react';
import type { DiningTable } from '../../../../types/dining-system';
import { tableStatusBadgeStyle, tableStatusLabel } from '../../../../types/dining-system';
import {
  descendantTableIds,
  formatSeats,
  inheritedChildStatus,
  isJoined,
  parentTableId,
} from '../../../../lib/dining-tables';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';

interface TableJoinModalProps {
  parent: DiningTable;
  tables: DiningTable[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (childIds: number[]) => void;
}

export const TableJoinModal: React.FC<TableJoinModalProps> = ({
  parent,
  tables,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [selected, setSelected] = useState<number[]>([]);
  useModalDismiss(onCancel);

  // Candidatas: ni la madre, ni su descendencia (candado circular), ni las que ya cuelgan
  // de otra mesa — esas hay que desunirlas antes para no robárselas a su grupo.
  const candidates = useMemo(() => {
    const blocked = descendantTableIds(tables, parent.id);
    return tables.filter(
      (t) => t.id !== parent.id && !blocked.has(t.id) && !isJoined(t),
    );
  }, [tables, parent]);

  const alreadyJoined = useMemo(
    () => tables.filter((t) => parentTableId(t) === parent.id),
    [tables, parent],
  );

  const inherited = inheritedChildStatus(parent.status);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const totalSeats =
    parent.capacity +
    candidates.filter((t) => selected.includes(t.id)).reduce((sum, t) => sum + t.capacity, 0);

  return (
    <AppModal
      title={`Join Tables to ${parent.number}`}
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close join tables dialog"
    >
      <div className="p-6 space-y-4 text-left font-sans overflow-y-auto flex-1">
        <p className="text-sm text-[#5f5e5e]">
          Pick the tables the party spreads onto. They stay linked to{' '}
          <strong className="font-mono text-[#1d1c17]">{parent.number}</strong> until the bill is
          settled or you unjoin them.
        </p>

        {inherited && (
          <p className="text-[11px] text-[#5f5e5e] italic">
            {parent.number} is occupied, so the tables you join inherit the Occupied status.
          </p>
        )}

        {alreadyJoined.length > 0 && (
          <p className="text-[11px] text-[#5f5e5e]">
            Already joined: {alreadyJoined.map((t) => t.number).join(', ')}
          </p>
        )}

        {candidates.length === 0 ? (
          <p className="text-sm text-[#5f5e5e] italic py-6 text-center">
            No tables available to join. Every other table is already part of a group.
          </p>
        ) : (
          <ul className="border border-[#e8e2d8] rounded divide-y divide-[#e8e2d8] max-h-72 overflow-y-auto">
            {candidates.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-3 px-4 py-3 hover:bg-[#f8f3eb] transition-colors duration-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    onChange={() => toggle(t.id)}
                    className="accent-[#ae001a] w-4 h-4"
                    aria-label={`Join table ${t.number}`}
                  />
                  <span className="font-mono font-bold text-sm text-[#1d1c17]">{t.number}</span>
                  <span className="text-xs text-[#5f5e5e]">{formatSeats(t.capacity)}</span>
                  {t.floorZone?.name && (
                    <span className="text-xs text-[#5f5e5e]">· {t.floorZone.name}</span>
                  )}
                  <span
                    className={`ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded ${tableStatusBadgeStyle(
                      t.status,
                    )}`}
                  >
                    {tableStatusLabel(t.status)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {selected.length > 0 && (
          <p className="text-sm text-[#1d1c17]">
            Combined capacity:{' '}
            <strong>
              {formatSeats(totalSeats)} across {selected.length + 1} tables
            </strong>
          </p>
        )}

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Joining…' : 'Join Tables'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={() => onSubmit(selected)}
          submitDisabled={selected.length === 0}
        />
      </div>
    </AppModal>
  );
};

export default TableJoinModal;
