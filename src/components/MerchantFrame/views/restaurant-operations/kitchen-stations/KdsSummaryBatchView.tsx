import React from 'react';
import type { AggregatedSummaryItem, PreparationStatus } from './kds-monitor-model';
import { getCourseTheme } from './kds-monitor-display';
import {
  type KDSLanguage,
  getLocalizedDishName,
  getLocalizedCourse,
  getLocalizedVariantName,
} from './kdsLocalization';

interface KdsSummaryBatchViewProps {
  batches: AggregatedSummaryItem[];
  stationName: string;
  language: KDSLanguage;
  onFireHeld: (name: string, variantName?: string) => void;
  onStartQueue: (name: string, variantName?: string) => void;
  onMarkReady: (name: string, variantName?: string) => void;
  onRevert: (name: string, variantName?: string) => void;
  onToggleTableItem: (
    tableItem: { ticketId: string; itemId: number; status: PreparationStatus },
    batchName: string,
  ) => void;
}

/** Vista SUMMARY: lotes de producción agregados por plato con sus acciones por lote. */
export const KdsSummaryBatchView: React.FC<KdsSummaryBatchViewProps> = ({
  batches,
  stationName,
  language,
  onFireHeld,
  onStartQueue,
  onMarkReady,
  onRevert,
  onToggleTableItem,
}) => (
  <div className="flex flex-col gap-5 w-full h-full pb-8">
    {/* Summary Top Banner */}
    <div className="bg-gradient-to-r from-blue-950/80 via-zinc-900 to-blue-950/80 border border-blue-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/40">
          <span className="material-symbols-outlined text-2xl">layers</span>
        </div>
        <div>
          <h4 className="text-sm font-black text-blue-300 tracking-wider uppercase flex items-center gap-2">
            PRODUCTION BATCH CONSOLIDATOR
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-500/30">
              STATION: {stationName}
            </span>
          </h4>
          <p className="text-xs text-zinc-300 mt-0.5">
            Consolidating production batches across all active tickets (Bar, Cold Line, Hot Line, Bakery).
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
        <span className="px-3 py-1.5 bg-zinc-800/90 text-zinc-200 rounded-lg border border-zinc-700">
          Batches: <strong className="text-white font-mono text-sm ml-1">{batches.length}</strong>
        </span>
        <span className="px-3 py-1.5 bg-zinc-800/90 text-zinc-300 rounded-lg border border-zinc-700">
          Queue: <strong className="text-white font-mono text-sm ml-1">
            {batches.reduce((sum, item) => sum + item.pendingQty, 0)}
          </strong>
        </span>
        <span className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg border border-blue-500/30">
          In Prep: <strong className="text-blue-200 font-mono text-sm ml-1">
            {batches.reduce((sum, item) => sum + item.inPrepQty, 0)}
          </strong>
        </span>
        <span className="px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/30">
          Held: <strong className="text-amber-200 font-mono text-sm ml-1">
            {batches.reduce((sum, item) => sum + item.heldQty, 0)}
          </strong>
        </span>
        <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/30">
          Ready: <strong className="text-emerald-200 font-mono text-sm ml-1">
            {batches.reduce((sum, item) => sum + item.readyQty, 0)}
          </strong>
        </span>
      </div>
    </div>

    {/* Batch Cards Grid */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {batches.map((batch) => {
        const totalUnready = batch.pendingQty + batch.inPrepQty + batch.heldQty;
        const isFullyReady = totalUnready === 0 && batch.totalQty > 0;
        const courseTheme = getCourseTheme(batch.course);

        return (
          <div
            key={batch.key}
            className={`rounded-xl border p-5 flex flex-col justify-between transition-all shadow-xl ${
              isFullyReady
                ? 'bg-emerald-950/20 border-emerald-500/40 shadow-emerald-950/30'
                : 'bg-[#1a1b20] border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div>
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-lg text-white leading-tight break-words" style={{ color: '#ffffff' }}>
                    {getLocalizedDishName(batch.name, language)}
                  </h3>
                  {batch.variantName && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700 inline-block mt-1">
                      {getLocalizedVariantName(batch.variantName)}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${courseTheme.badge}`}>
                  {getLocalizedCourse(batch.course, language)}
                </span>
              </div>

              {/* Stat Counters: QUEUE / [PREP VERB] / HELD / READY / TOTAL */}
              <div className="my-3 p-2.5 bg-zinc-900/90 rounded-xl border border-zinc-800 grid grid-cols-5 gap-0.5 text-center">
                <div className="p-1">
                  <p className="text-xl font-black font-mono text-zinc-300">{batch.pendingQty}</p>
                  <p className="text-[7.5px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">
                    {language === 'es' ? 'COLA' : 'QUEUE'}
                  </p>
                </div>
                <div className="p-1 border-l border-zinc-800">
                  <p className="text-xl font-black font-mono text-blue-400">{batch.inPrepQty}</p>
                  <p className="text-[7.5px] font-bold text-blue-300 uppercase tracking-wider mt-0.5">
                    {language === 'es' ? 'EN COCCIÓN' : courseTheme.prepVerb}
                  </p>
                </div>
                <div className="p-1 border-l border-zinc-800">
                  <p className="text-xl font-black font-mono text-amber-400">{batch.heldQty}</p>
                  <p className="text-[7.5px] font-bold text-amber-300 uppercase tracking-wider mt-0.5">
                    {language === 'es' ? 'RETENIDO' : 'HELD'}
                  </p>
                </div>
                <div className="p-1 border-l border-zinc-800">
                  <p className="text-xl font-black font-mono text-emerald-400">{batch.readyQty}</p>
                  <p className="text-[7.5px] font-bold text-emerald-300 uppercase tracking-wider mt-0.5">
                    {language === 'es' ? 'LISTO' : 'READY'}
                  </p>
                </div>
                <div className="p-1 border-l border-zinc-800">
                  <p className="text-xl font-black font-mono text-zinc-300">{batch.totalQty}</p>
                  <p className="text-[7.5px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">
                    {language === 'es' ? 'TOTAL' : 'TOTAL'}
                  </p>
                </div>
              </div>

              {/* Interactive Tables Breakdown */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-zinc-400">touch_app</span>
                    {language === 'es' ? 'MESAS (TOCA PARA AVANZAR):' : 'TABLES (TAP TO ADVANCE):'}
                  </p>
                  <span className="text-[10px] text-zinc-500 font-bold">
                    {batch.tables.length} {language === 'es' ? (batch.tables.length === 1 ? 'mesa' : 'mesas') : (batch.tables.length === 1 ? 'table' : 'tables')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-1.5 bg-zinc-950/40 rounded-lg border border-zinc-800/80">
                  {batch.tables.map((t, idx) => {
                    const isReady = t.status === 'READY';
                    const isHeld = t.status === 'HELD';
                    const isInPrep = t.status === 'IN_PREPARATION';

                    const chipIcon = isReady
                      ? 'check_circle'
                      : isHeld
                      ? 'lock'
                      : isInPrep
                      ? courseTheme.prepIcon
                      : 'schedule';

                    const chipStatusLabel = isReady
                      ? 'READY'
                      : isHeld
                      ? 'HELD'
                      : isInPrep
                      ? courseTheme.prepVerb
                      : 'QUEUE';

                    const chipStyle = isReady
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/60'
                      : isHeld
                      ? 'bg-amber-950/60 text-amber-300 border-amber-500/50 hover:bg-amber-900/60 animate-pulse'
                      : isInPrep
                      ? 'bg-blue-950/70 text-blue-200 border-blue-500/60 hover:bg-blue-900/70 shadow-xs'
                      : 'bg-zinc-800/90 text-zinc-300 border-zinc-700 hover:bg-zinc-700/80 hover:text-white';

                    const qtyBadgeStyle = isReady
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : isHeld
                      ? 'bg-amber-500/20 text-amber-300'
                      : isInPrep
                      ? 'bg-blue-500/20 text-blue-200'
                      : 'bg-zinc-700 text-zinc-300';

                    const tooltipText = isHeld
                      ? `HELD: Click to FIRE for ${t.table}`
                      : !isInPrep && !isReady
                      ? `QUEUE (PENDING): Click to start ${courseTheme.prepVerb.toLowerCase()} for ${t.table}`
                      : isInPrep
                      ? `IN PREPARATION: Click to mark READY for ${t.table}`
                      : `READY: Click to revert ${t.table} back to prep`;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onToggleTableItem(t, batch.name)}
                        title={tooltipText}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-xs ${chipStyle}`}
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          {chipIcon}
                        </span>
                        <span>{t.table}</span>
                        <span className={`font-mono font-black text-[10px] px-1 rounded ${qtyBadgeStyle}`}>
                          x{t.qty}
                        </span>
                        <span className="text-[8px] uppercase tracking-wider font-extrabold opacity-75">
                          {chipStatusLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aggregated Notes */}
              {batch.notes.length > 0 && (
                <div className="mb-3 p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                  <strong className="block text-[10px] text-amber-400 uppercase tracking-wider mb-1">
                    SPECIAL PREP INSTRUCTIONS:
                  </strong>
                  <ul className="list-disc list-inside space-y-0.5">
                    {batch.notes.map((note, idx) => (
                      <li key={idx} className="italic">{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 mt-2">
              {batch.heldQty > 0 && (
                <button
                  onClick={() => onFireHeld(batch.name, batch.variantName)}
                  className="w-full py-2 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-98"
                >
                  <span className="material-symbols-outlined text-sm">local_fire_department</span>
                  <span>{language === 'es' ? `A FUEGO TODOS LOS RETENIDOS (${batch.heldQty})` : `FIRE ALL HELD (${batch.heldQty})`}</span>
                </button>
              )}

              {batch.pendingQty > 0 && (
                <button
                  onClick={() => onStartQueue(batch.name, batch.variantName)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-98 border border-blue-400/50"
                >
                  <span className="material-symbols-outlined text-sm">{courseTheme.prepIcon}</span>
                  <span>{language === 'es' ? `INICIAR TODA LA COLA (${batch.pendingQty})` : `START ALL QUEUE (${batch.pendingQty})`}</span>
                </button>
              )}

              {totalUnready > 0 ? (
                <button
                  onClick={() => onMarkReady(batch.name, batch.variantName)}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-98"
                >
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  <span>{language === 'es' ? `MARCAR TODOS LISTOS (${totalUnready})` : `MARK ALL READY (${totalUnready})`}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 py-2.5 bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-inner">
                    <span className="material-symbols-outlined text-sm">task_alt</span>
                    <span>{language === 'es' ? `LOS ${batch.totalQty} ESTÁN LISTOS` : `ALL ${batch.totalQty} READY`}</span>
                  </div>
                  <button
                    onClick={() => onRevert(batch.name, batch.variantName)}
                    title="Revert batch back to preparation"
                    className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">undo</span>
                    <span className="hidden sm:inline">{language === 'es' ? 'DESHACER' : 'UNDO'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
