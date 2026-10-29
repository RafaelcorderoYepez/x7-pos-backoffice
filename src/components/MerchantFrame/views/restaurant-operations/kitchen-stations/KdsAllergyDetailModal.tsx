import React from 'react';
import type { KDSLanguage } from './kdsLocalization';

export interface AllergyDetail {
  ticketId: string;
  table: string;
  itemName: string;
  alertBannerText: string;
  allergyTags: string[];
  rawNotes?: string;
  severity: 'critical' | 'warning';
}

interface KdsAllergyDetailModalProps {
  detail: AllergyDetail;
  language: KDSLanguage;
  onClose: () => void;
}

/** Detalle de una alerta de alergia de un ítem, con el protocolo de seguridad. */
export const KdsAllergyDetailModal: React.FC<KdsAllergyDetailModalProps> = ({
  detail,
  language,
  onClose,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
    onClick={() => onClose()}
  >
    <div
      className="relative w-full max-w-md bg-[#18191e] border-2 border-red-500/80 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.4)] overflow-hidden flex flex-col my-auto max-h-[90vh] animate-scale-up"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-red-950 via-red-900 to-zinc-900 border-b border-red-500/40">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-red-400 text-2xl animate-bounce">
            emergency
          </span>
          <div>
            <div className="text-sm font-black uppercase tracking-wider text-red-100 flex items-center gap-1.5">
              {language === 'es' ? 'PROTOCOLO DE ALERGIA CRÍTICA' : 'CRITICAL ALLERGY PROTOCOL'}
            </div>
            <p className="text-[10px] text-red-300/80 font-medium">
              {language === 'es' ? detail.table.replace(/^Table\s+/i, 'Mesa ') : detail.table} • #{detail.ticketId}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onClose()}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4 overflow-y-auto">
        {/* Target Item Name */}
        <div className="bg-zinc-900/90 border border-zinc-800 p-3 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400" style={{ color: '#a1a1aa' }}>
              {language === 'es' ? 'PLATO / ÍTEM AFECTADO:' : 'TARGET DISH / ITEM:'}
            </span>
            <div
              className="text-base sm:text-lg font-black text-white !text-white mt-0.5 tracking-tight"
              style={{ color: '#ffffff' }}
            >
              {detail.itemName}
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-black uppercase bg-red-600/30 text-red-300 border border-red-500/50">
            {language === 'es' ? detail.table.replace(/^Table\s+/i, 'Mesa ') : detail.table}
          </span>
        </div>

        {/* Detected Allergens list */}
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1 mb-1.5">
            <span className="material-symbols-outlined text-xs">warning</span>
            {language === 'es' ? 'ALÉRGENOS DETECTADOS:' : 'DETECTED ALLERGENS:'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {detail.allergyTags.map((tag, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded-lg text-xs font-black uppercase bg-red-950 text-red-200 border-2 border-red-500 shadow-sm flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs text-red-400">report_problem</span>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Full Notes & Special Instructions (descartando si solo coincide con la referencia de ticket o mesa) */}
        {Boolean(
          detail.rawNotes &&
          detail.rawNotes.trim().toLowerCase() !== detail.table.trim().toLowerCase() &&
          detail.rawNotes.trim().toLowerCase().replace(/^(?:table|mesa)\s+/i, '') !== detail.table.trim().toLowerCase().replace(/^(?:table|mesa)\s+/i, '')
        ) && (
          <div className="bg-zinc-900/80 border border-amber-500/30 p-3 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1 mb-1">
              <span className="material-symbols-outlined text-xs">edit_note</span>
              {language === 'es' ? 'INSTRUCCIÓN COMPLETA DE COCINA:' : 'FULL KITCHEN INSTRUCTION:'}
            </span>
            <p className="text-xs text-zinc-200 font-medium whitespace-pre-wrap break-words leading-relaxed pl-2 border-l-2 border-amber-500/70">
              {language === 'es'
                ? detail.rawNotes!.replace(/\bTable\s+(\d+)/gi, 'Mesa $1')
                : detail.rawNotes}
            </p>
          </div>
        )}

        {/* Kitchen Safety Cross-Contamination Notice */}
        <div className="bg-red-950/40 border border-red-500/30 p-3 rounded-xl flex items-start gap-2.5">
          <span className="material-symbols-outlined text-base text-red-400 shrink-0 mt-0.5">
            sanitizer
          </span>
          <div className="text-[10.5px] text-red-200/90 leading-snug">
            <strong className="block text-red-300 font-bold mb-0.5">
              {language === 'es' ? 'Medidas de Seguridad de Cocina:' : 'Kitchen Safety Notice:'}
            </strong>
            {language === 'es'
              ? 'Lavar y desinfectar superficies y utensilios. Cambiar guantes antes de manipular este pedido. Utilizar aceite y recipientes separados para evitar contacto cruzado.'
              : 'Wash and sanitize hands, surfaces, and cookware. Change gloves before prepping this order. Use separate oil and utensils to prevent cross-contact.'}
          </div>
        </div>
      </div>

      {/* Footer Action */}
      <div className="p-3.5 bg-zinc-900 border-t border-zinc-800 flex items-center justify-end">
        <button
          type="button"
          onClick={() => onClose()}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer active:scale-95 shadow-lg flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">check</span>
          <span>{language === 'es' ? 'Cerrar' : 'Close'}</span>
        </button>
      </div>
    </div>
  </div>
);
