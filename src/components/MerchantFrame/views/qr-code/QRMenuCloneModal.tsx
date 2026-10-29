import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { QRMenu, QRMenuStatus } from '../../../../types/qr-menu';
import { generateDuplicateMenuName, getThemeConfig } from '../../../../lib/qr-menu';
import { cloneQRMenu } from '../../../../api/qr-menus';
import { QR_MENU_STATUSES, QR_MENU_TYPE_META } from '../../../../types/qr-menu';

interface QRMenuCloneModalProps {
  isOpen: boolean;
  sourceMenu: QRMenu | null;
  merchantId?: number;
  onClose: () => void;
  onSuccess: (clonedMenu: QRMenu) => void;
}

export const QRMenuCloneModal: React.FC<QRMenuCloneModalProps> = ({
  isOpen,
  sourceMenu,
  merchantId = 3,
  onClose,
  onSuccess,
}) => {
  const [newName, setNewName] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<QRMenuStatus>('inactive');
  const [pipelineState, setPipelineState] = useState<
    'idle' | 'cloning_parent' | 'cloning_sections' | 'cloning_items' | 'completed' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (sourceMenu && isOpen) {
      setNewName(generateDuplicateMenuName(sourceMenu.name));
      setTargetStatus('inactive');
      setPipelineState('idle');
      setErrorMessage(null);
    }
  }, [sourceMenu, isOpen]);

  if (!isOpen || !sourceMenu) return null;

  const theme = getThemeConfig(sourceMenu.design_theme);
  const typeMeta = QR_MENU_TYPE_META[sourceMenu.qr_type] || QR_MENU_TYPE_META.Table;

  const handleRunPipeline = async () => {
    if (!newName.trim()) {
      setErrorMessage('Please provide a name for the duplicated menu.');
      return;
    }
    if (newName.length > 100) {
      setErrorMessage('Menu name cannot exceed 100 characters.');
      return;
    }

    setErrorMessage(null);
    setPipelineState('cloning_parent');

    try {
      // Step-by-step progress simulation for clear pipeline feedback
      await new Promise((r) => setTimeout(r, 200));
      setPipelineState('cloning_sections');
      await new Promise((r) => setTimeout(r, 200));
      setPipelineState('cloning_items');

      const result = await cloneQRMenu(sourceMenu.id, {
        source_menu_id: sourceMenu.id,
        name: newName.trim(),
        description: sourceMenu.description,
        status: targetStatus,
        design_theme: sourceMenu.design_theme,
        qr_type: sourceMenu.qr_type,
        merchant_id: merchantId,
      });

      setPipelineState('completed');
      await new Promise((r) => setTimeout(r, 300));
      onSuccess(result.menu);
      onClose();
    } catch (err: unknown) {
      setPipelineState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to complete menu duplication pipeline.');
    }
  };

  const content = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto flex items-center justify-center p-3 sm:p-4 bg-[#1d1c17]/70 backdrop-blur-xs font-poppins animate-fade-in"
      onClick={() => {
        if (pipelineState === 'idle' || pipelineState === 'error') {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] my-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <span className="material-symbols-outlined text-xl">content_copy</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Menu Cloning & Duplication Pipeline
              </h3>
              <p className="text-xs text-slate-500">
                Relational duplication for sections & items
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={pipelineState !== 'idle' && pipelineState !== 'error'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Scrollable Body with vertical scrollbar */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
          {/* Source Menu Summary Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
            <span
              className="w-3 h-3 rounded-full mt-1 shrink-0"
              style={{ backgroundColor: theme.primaryColor }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  {sourceMenu.name}
                </h4>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {typeMeta.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                {sourceMenu.description}
              </p>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-600 font-medium">
                <span>🎨 {theme.name}</span>
                <span>📑 {sourceMenu.sections_count ?? 2} Sections</span>
                <span>🍽️ {sourceMenu.items_count ?? 6} Items</span>
              </div>
            </div>
          </div>

          {/* New Variant Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              New Menu Variant Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Happy Hour & Late Night Menu"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:border-slate-900 focus:ring-2 focus:ring-slate-100 transition-all"
            />
            <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
              <span>Must be unique and descriptive</span>
              <span>{newName.length}/100</span>
            </div>
          </div>

          {/* Target Status */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Initial Lifecycle State
            </label>
            <div className="grid grid-cols-3 gap-2">
              {QR_MENU_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setTargetStatus(status)}
                  className={`py-2 px-2 rounded-xl border text-center text-xs font-bold capitalize transition-all ${targetStatus === status
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Duplication Pipeline Checklist */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Pipeline Operations
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-sm ${pipelineState !== 'idle' ? 'text-emerald-500' : 'text-slate-400'
                    }`}
                >
                  {pipelineState !== 'idle' ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span className={pipelineState !== 'idle' ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                  1. Clone parent menu parameters & design theme
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-sm ${['cloning_sections', 'cloning_items', 'completed'].includes(pipelineState)
                      ? 'text-emerald-500'
                      : 'text-slate-400'
                    }`}
                >
                  {['cloning_sections', 'cloning_items', 'completed'].includes(pipelineState)
                    ? 'check_circle'
                    : 'radio_button_unchecked'}
                </span>
                <span
                  className={
                    ['cloning_sections', 'cloning_items', 'completed'].includes(pipelineState)
                      ? 'text-slate-800 font-medium'
                      : 'text-slate-500'
                  }
                >
                  2. Duplicate underlying sections (qr_menu_section)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-sm ${['cloning_items', 'completed'].includes(pipelineState)
                      ? 'text-emerald-500'
                      : 'text-slate-400'
                    }`}
                >
                  {['cloning_items', 'completed'].includes(pipelineState)
                    ? 'check_circle'
                    : 'radio_button_unchecked'}
                </span>
                <span
                  className={
                    ['cloning_items', 'completed'].includes(pipelineState)
                      ? 'text-slate-800 font-medium'
                      : 'text-slate-500'
                  }
                >
                  3. Duplicate menu items & relink to new sections (qr_menu_item)
                </span>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer (pinned / sticky) */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={pipelineState !== 'idle' && pipelineState !== 'error'}
            className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRunPipeline}
            disabled={pipelineState !== 'idle' && pipelineState !== 'error'}
            data-testid="confirm-clone-btn"
            className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {pipelineState !== 'idle' && pipelineState !== 'completed' && pipelineState !== 'error' ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Duplicating...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">copy_all</span>
                <span>Execute Duplication Pipeline</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
