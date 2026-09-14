// Cajón de detalle de un colaborador: con qué está enredado ahora mismo y cuánto ha movido.
//
// Los contadores llegan de un único GET /api/collaborators/:id/summary en vez de cinco
// listados distintos: el backend los cuenta en la base y devuelve además una muestra corta
// de cada relación, que es lo que cabe y lo que se lee en un panel lateral.

import React, { useState } from 'react';
import type { Collaborator, CollaboratorSummary } from '../../../../types/collaborator';
import {
  collaboratorStatusBadgeStyle,
  collaboratorStatusLabel,
  shiftRoleLabel,
} from '../../../../types/collaborator';
import {
  collaboratorEmail,
  collaboratorInitials,
  collaboratorRef,
  formatSalesVolume,
  userRef,
} from '../../../../lib/collaborators';
import { shiftHours, shiftLabel } from '../../../../lib/table-assignments';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal } from '../../shared/AppModal';

type TabKey = 'shifts' | 'tables' | 'drawers' | 'orders';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'shifts', label: 'Shift Assignments', icon: 'work' },
  { key: 'tables', label: 'Dining Tables', icon: 'table_restaurant' },
  { key: 'drawers', label: 'Cash Custody', icon: 'point_of_sale' },
  { key: 'orders', label: 'Orders', icon: 'receipt_long' },
];

interface CollaboratorDetailDrawerProps {
  collaborator: Collaborator;
  summary: CollaboratorSummary | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
}

const timeOf = (raw?: string | null): string => {
  if (!raw) return '—';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export const CollaboratorDetailDrawer: React.FC<CollaboratorDetailDrawerProps> = ({
  collaborator,
  summary,
  loading,
  error,
  onClose,
  onRetry,
}) => {
  const [tab, setTab] = useState<TabKey>('shifts');
  useModalDismiss(onClose);

  const counts = summary?.counts;

  // Contador por pestaña: se pinta en la propia pestaña para que el usuario sepa dónde hay
  // algo antes de entrar.
  const countFor = (key: TabKey): number | null => {
    if (!counts) return null;
    if (key === 'shifts') return counts.shiftAssignments;
    if (key === 'tables') return counts.tableAssignments;
    if (key === 'drawers') return counts.openedCashDrawers + counts.closedCashDrawers;
    return counts.orders;
  };

  const emptyRow = (message: string) => (
    <p className="text-sm text-[#5f5e5e] italic py-8 text-center">{message}</p>
  );

  return (
    <AppModal
      title={collaborator.name}
      subtitle="Collaborator profile"
      onClose={onClose}
      size="2xl"
      closeAriaLabel="Close collaborator profile"
    >
      <div className="flex flex-col overflow-hidden flex-1 text-left font-sans">
        {/* ---------------- Cabecera de perfil ---------------- */}
        <div className="p-6 flex items-start gap-4 border-b border-[#e8e2d8]">
          <span
            aria-hidden="true"
            className="w-14 h-14 rounded-full bg-[#ae001a] text-white flex items-center justify-center font-black text-lg shrink-0"
          >
            {collaboratorInitials(collaborator.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-lg text-[#1d1c17] truncate">{collaborator.name}</h3>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17]">
                {shiftRoleLabel(collaborator.role)}
              </span>
              <span
                data-testid="detail-status-badge"
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${collaboratorStatusBadgeStyle(
                  collaborator.status,
                )}`}
              >
                {collaboratorStatusLabel(collaborator.status)}
              </span>
            </div>
            <p className="text-xs text-[#5f5e5e] font-mono mt-1">
              {collaboratorRef(collaborator.id)} · {userRef(collaborator.user_id)}
            </p>
            <p className="text-sm text-[#5f5e5e] mt-1 truncate">
              {collaboratorEmail(collaborator) || 'No linked account email'}
            </p>
            <p className="text-xs text-[#5f5e5e] mt-1">
              {collaborator.shift
                ? `${shiftLabel(collaborator.shift)} · ${shiftHours(collaborator.shift)}`
                : 'No recurring shift assigned'}
            </p>
          </div>
        </div>

        {/* ---------------- Pestañas ---------------- */}
        <div
          role="tablist"
          aria-label="Collaborator operational bindings"
          className="flex border-b border-[#e8e2d8] overflow-x-auto"
        >
          {TABS.map((t) => {
            const count = countFor(t.key);
            const selected = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap flex items-center gap-1.5 transition-colors duration-200 ${
                  selected
                    ? 'text-[#ae001a] border-b-2 border-[#ae001a]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  {t.icon}
                </span>
                {t.label}
                {count !== null && (
                  <span className="ml-1 px-1.5 rounded-full bg-[#ece8e0] text-[#1d1c17]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ---------------- Contenido ---------------- */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 bg-[#ece8e0] rounded animate-pulse w-full" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-6">
              <p role="alert" className="text-sm text-red-700 font-medium">
                {error}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && summary && (
            <>
              {tab === 'shifts' &&
                (summary.recentShiftAssignments.length === 0
                  ? emptyRow('No shift assignments on record for this collaborator.')
                  : (
                      <ul data-testid="tab-shifts" className="divide-y divide-[#e8e2d8]">
                        {summary.recentShiftAssignments.map((a) => (
                          <li key={a.id} className="py-3 flex justify-between gap-4">
                            <span className="text-sm text-[#1d1c17]">Shift #{a.shiftId}</span>
                            <span className="text-xs text-[#5f5e5e] font-mono">
                              {timeOf(a.startTime)} → {a.endTime ? timeOf(a.endTime) : 'open'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ))}

              {tab === 'tables' &&
                (summary.recentTableAssignments.length === 0
                  ? emptyRow('This collaborator has not been assigned to any dining table yet.')
                  : (
                      <ul data-testid="tab-tables" className="divide-y divide-[#e8e2d8]">
                        {summary.recentTableAssignments.map((a) => (
                          <li key={a.id} className="py-3 flex justify-between gap-4">
                            <span className="text-sm text-[#1d1c17]">
                              <strong className="font-mono">
                                {a.tableNumber ?? `Table #${a.tableId}`}
                              </strong>
                              {a.zoneName ? ` · ${a.zoneName}` : ''}
                            </span>
                            <span className="text-xs text-[#5f5e5e] font-mono">
                              {a.releasedAt ? 'Released' : 'On duty'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ))}

              {tab === 'drawers' && (
                <>
                  <p className="text-xs text-[#5f5e5e] mb-3">
                    {counts?.openedCashDrawers ?? 0} opened · {counts?.closedCashDrawers ?? 0}{' '}
                    closed
                  </p>
                  {summary.recentCashDrawers.length === 0
                    ? emptyRow('No cash drawer sessions in this collaborator custody.')
                    : (
                        <ul data-testid="tab-drawers" className="divide-y divide-[#e8e2d8]">
                          {summary.recentCashDrawers.map((d) => (
                            <li
                              key={`${d.custody}-${d.id}`}
                              className="py-3 flex justify-between gap-4"
                            >
                              <span className="text-sm text-[#1d1c17]">
                                Drawer #{d.id}
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                                  {d.custody}
                                </span>
                              </span>
                              <span className="text-xs text-[#5f5e5e] font-mono">
                                {d.status ?? '—'} · {timeOf(d.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                </>
              )}

              {tab === 'orders' && (
                <>
                  <p data-testid="orders-volume" className="text-sm text-[#1d1c17] mb-3">
                    <strong>{counts?.orders ?? 0}</strong> orders taken ·{' '}
                    <strong>{formatSalesVolume(summary.ordersTotal)}</strong> in sales
                  </p>
                  {summary.recentOrders.length === 0
                    ? emptyRow('This collaborator has not taken any order yet.')
                    : (
                        <ul data-testid="tab-orders" className="divide-y divide-[#e8e2d8]">
                          {summary.recentOrders.map((o) => (
                            <li key={o.id} className="py-3 flex justify-between gap-4">
                              <span className="text-sm text-[#1d1c17] font-mono">
                                {o.order_number ?? `#${o.id}`}
                              </span>
                              <span className="text-xs text-[#5f5e5e] font-mono">
                                {formatSalesVolume(o.total)} · {o.status ?? '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </AppModal>
  );
};

export default CollaboratorDetailDrawer;
