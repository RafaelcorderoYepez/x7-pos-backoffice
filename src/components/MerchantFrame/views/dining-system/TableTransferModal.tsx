// Traslado de comensales en vivo: la cuenta abierta se muda de una mesa a otra sin cerrarla.
//
// Sólo se ofrecen mesas disponibles. Una mesa ocupada duplicaría comandas y una en limpieza
// o fuera de servicio no debería recibir a nadie, así que el destino se elige de una lista
// ya filtrada y la razón del bloqueo se explica cuando esa lista sale vacía.

import React, { useState } from 'react';
import type { DiningTable } from '../../../../types/dining-system';
import { formatSeats, transferTargetError } from '../../../../lib/dining-tables';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';

interface TableTransferModalProps {
  source: DiningTable;
  // Ya filtradas a las que pueden recibir (status 'available').
  targets: DiningTable[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (target: DiningTable) => void;
}

export const TableTransferModal: React.FC<TableTransferModalProps> = ({
  source,
  targets,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [targetId, setTargetId] = useState('');
  useModalDismiss(onCancel);

  const target = targets.find((t) => String(t.id) === targetId);
  // Una mesa más pequeña no invalida el traslado —el encargado sabrá si caben— pero avisar
  // evita mudar a seis comensales a una mesa de dos por descuido.
  const capacityWarning =
    target && target.capacity < source.capacity
      ? `${target.number} seats ${target.capacity}, fewer than the ${source.capacity} at ${source.number}.`
      : '';

  return (
    <AppModal
      title={`Transfer Table ${source.number}`}
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close transfer dialog"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#5f5e5e]">
          Move the seated party and its open check from{' '}
          <strong className="font-mono text-[#1d1c17]">{source.number}</strong> to another table.
          The check stays open and the server keeps the table.
        </p>

        {targets.length === 0 ? (
          <p
            role="alert"
            className="text-sm text-[#ae001a] font-semibold bg-[#ae001a]/5 border border-[#ae001a]/20 rounded px-3 py-2"
          >
            No available table can take this party right now. Free up a table — occupied,
            reserved, cleaning and out-of-service tables cannot receive a transfer.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="transfer-target"
              className="text-[11px] font-bold text-[#5f5e5e] uppercase"
            >
              Target table <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="transfer-target"
              autoFocus
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
            >
              <option value="">Select an available table…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.number} · {formatSeats(t.capacity)}
                  {t.floorZone?.name ? ` · ${t.floorZone.name}` : ''}
                </option>
              ))}
            </select>
            {capacityWarning && (
              <p className="text-[11px] text-[#5f5e5e] italic">{capacityWarning}</p>
            )}
          </div>
        )}

        {/* Cinturón por si la lista llegara con una mesa que dejó de estar libre mientras
            el diálogo estaba abierto: el backend lo rechazaría igual, pero el operador
            merece leer el motivo antes de pulsar. */}
        {target && target.status !== 'available' && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {transferTargetError(target)}
          </p>
        )}

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Transferring…' : 'Transfer Party'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={() => target && onSubmit(target)}
          submitDisabled={!target || target.status !== 'available'}
        />
      </div>
    </AppModal>
  );
};

export default TableTransferModal;
