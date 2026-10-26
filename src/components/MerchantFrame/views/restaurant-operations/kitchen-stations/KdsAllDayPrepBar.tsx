import React from 'react';
import {
  type KDSLanguage,
  detectAllergies,
  getLocalizedDishName,
  getLocalizedVariantName,
} from './kdsLocalization';
import type { AllDayAggregatedItem } from './kds-monitor-model';

interface KdsAllDayPrepBarProps {
  summary: { items: AllDayAggregatedItem[]; totalNeededCount: number };
  expanded: boolean;
  language: KDSLanguage;
  onToggleExpanded: () => void;
  onBumpFifo: (productName: string, variantName: string | undefined, quantity: number) => void;
}

/** Barra "all-day": unidades pendientes por plato y bump FIFO por cantidad. */
export const KdsAllDayPrepBar: React.FC<KdsAllDayPrepBarProps> = ({
  summary,
  expanded,
  language,
  onToggleExpanded,
  onBumpFifo,
}) => (
  <div className="bg-[#15161b] border-b border-amber-500/30 px-4 py-1.5 shrink-0 transition-all">
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-amber-400 text-base">skillet</span>
        <span className="text-[11px] font-black tracking-wider text-white uppercase flex items-center gap-1.5">
          {language === 'es' ? 'CONSOLIDADOR DEL TURNO' : 'ALL-DAY PREP CONSOLIDATOR'}
          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {summary.totalNeededCount}{' '}
            {language === 'es'
              ? summary.totalNeededCount === 1
                ? 'unidad requerida'
                : 'unidades requeridas'
              : summary.totalNeededCount === 1
              ? 'unit required'
              : 'units required'}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-400 font-medium hidden md:inline">
          {language === 'es' ? (
            <>Pulsa <strong className="text-amber-300">+1 / +2 / +4 / TODOS</strong> para despachar FIFO</>
          ) : (
            <>Tap <strong className="text-amber-300">+1 / +2 / +4 / ALL</strong> to bump FIFO</>
          )}
        </span>
        <button
          onClick={() => onToggleExpanded()}
          className="text-zinc-400 hover:text-white flex items-center gap-0.5 text-[10px] font-bold cursor-pointer transition-colors"
          title={expanded ? (language === 'es' ? 'Colapsar barra' : 'Collapse All-Day Bar') : (language === 'es' ? 'Expandir barra' : 'Expand All-Day Bar')}
        >
          <span>{expanded ? (language === 'es' ? 'Ocultar' : 'Hide') : (language === 'es' ? 'Mostrar' : 'Show')}</span>
          <span className="material-symbols-outlined text-xs">
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      </div>
    </div>

    {expanded && (
      <div>
        {summary.items.length === 0 ? (
          <div className="py-1.5 px-3 rounded-md bg-zinc-900/60 border border-dashed border-zinc-800 text-center text-[11px] text-zinc-400 font-medium flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
            <span>
              {language === 'es'
                ? 'No hay platos pendientes para esta etapa en esta estación.'
                : 'No pending items for this course on this station.'}
            </span>
          </div>
        ) : (
          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 custom-scrollbar">
            {summary.items.map((item) => (
              <div
                key={item.key}
                className="min-w-[190px] max-w-[240px] bg-[#1a1c24] hover:bg-[#20232d] border border-zinc-700/80 hover:border-amber-500/60 rounded-lg p-2 flex flex-col justify-between transition-all shadow-xs group shrink-0"
              >
                <div>
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-black text-white leading-tight truncate" title={item.productName}>
                        {getLocalizedDishName(item.productName, language)}
                      </h4>
                      {item.variantName && (
                        <span className="inline-block mt-0.5 text-[9px] font-bold px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 truncate max-w-full">
                          {getLocalizedVariantName(item.variantName)}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-black font-mono text-amber-400 leading-none block">
                        {item.totalNeeded}x
                      </span>
                      <span className="text-[8px] uppercase tracking-wider font-bold text-zinc-400">
                        {language === 'es' ? 'PENDIENTE' : 'PENDING'}
                      </span>
                    </div>
                  </div>

                  {/* Prep Progress Bar */}
                  <div className="mt-1 text-[9px] font-bold text-zinc-400 flex items-center justify-between">
                    <span>{language === 'es' ? 'Progreso:' : 'Progress:'}</span>
                    <span>
                      <strong className="text-emerald-400">{item.totalPrepared}</strong>/{item.totalOrdered} {language === 'es' ? 'listo' : 'done'}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${item.totalOrdered > 0 ? Math.min(100, Math.round((item.totalPrepared / item.totalOrdered) * 100)) : 0}%`,
                      }}
                    />
                  </div>

                  {/* Modifiers / Special Notes Breakdown */}
                  {item.modifiers.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.modifiers.map((mod, idx) => {
                        const isAllergy = detectAllergies(mod.note, language).hasAllergy;
                        const isAdd = mod.note.startsWith('+') || mod.note.toLowerCase().includes('extra') || mod.note.toLowerCase().startsWith('add');
                        const isRem = mod.note.startsWith('-') || mod.note.toLowerCase().startsWith('no') || mod.note.toLowerCase().startsWith('sin');
                        return (
                          <span
                            key={idx}
                            className={`text-[8px] font-black px-1.5 py-0.2 rounded flex items-center gap-0.5 ${
                              isAllergy
                                ? 'bg-red-950 text-red-100 border border-red-500 animate-pulse shadow-xs'
                                : isAdd
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50'
                                : isRem
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50'
                                : 'bg-amber-950/60 text-amber-200 border border-amber-500/30'
                            }`}
                          >
                            {isAllergy && <span className="material-symbols-outlined text-[9px] text-red-400">warning</span>}
                            {mod.count}x {mod.note}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Quick Action Batch Bump Buttons */}
                <div className="mt-1.5 pt-1 border-t border-zinc-800/80 flex items-center gap-1">
                  <button
                    onClick={() => onBumpFifo(item.productName, item.variantName, 1)}
                    className="flex-1 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black font-black text-[10px] rounded border border-amber-500/40 transition-all cursor-pointer text-center active:scale-95"
                    title={`Bump 1x ${item.productName} to oldest ticket (FIFO)`}
                  >
                    +1
                  </button>

                  {item.totalNeeded >= 2 && (
                    <button
                      onClick={() => onBumpFifo(item.productName, item.variantName, 2)}
                      className="flex-1 py-1 bg-zinc-800 hover:bg-amber-500 text-zinc-200 hover:text-black font-black text-[10px] rounded border border-zinc-700 transition-all cursor-pointer text-center active:scale-95"
                      title={`Bump 2x ${item.productName} to oldest tickets (FIFO)`}
                    >
                      +2
                    </button>
                  )}

                  {item.totalNeeded >= 4 && (
                    <button
                      onClick={() => onBumpFifo(item.productName, item.variantName, 4)}
                      className="flex-1 py-1 bg-zinc-800 hover:bg-amber-500 text-zinc-200 hover:text-black font-black text-[10px] rounded border border-zinc-700 transition-all cursor-pointer text-center active:scale-95"
                      title={`Bump 4x ${item.productName} to oldest tickets (FIFO)`}
                    >
                      +4
                    </button>
                  )}

                  {item.totalNeeded > 1 && (
                    <button
                      onClick={() => onBumpFifo(item.productName, item.variantName, item.totalNeeded)}
                      className="px-1.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[9px] uppercase rounded border border-emerald-400 transition-all cursor-pointer active:scale-95"
                      title={`Bump entire batch (${item.totalNeeded}x) to oldest tickets`}
                    >
                      {language === 'es' ? 'TODOS' : 'ALL'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
);
