import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { QRMenu, QRMenuSection } from '../../../../types/qr-menu';
import { bulkReorderQRMenuSections } from '../../../../api/qr-menu-sections';

interface QRMenuSectionReorderModalProps {
  isOpen: boolean;
  menus: QRMenu[];
  sections: QRMenuSection[];
  initialMenuId?: number;
  onClose: () => void;
  onSuccess: (menuId: number) => void;
}

export const QRMenuSectionReorderModal: React.FC<QRMenuSectionReorderModalProps> = ({
  isOpen,
  menus,
  sections,
  initialMenuId,
  onClose,
  onSuccess,
}) => {
  const [selectedMenuId, setSelectedMenuId] = useState<number>(0);
  const [orderedList, setOrderedList] = useState<QRMenuSection[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const defaultId =
      initialMenuId || (menus.length > 0 ? menus[0].id : 0);
    setSelectedMenuId(defaultId);
  }, [isOpen, initialMenuId, menus]);

  useEffect(() => {
    if (!selectedMenuId) {
      setOrderedList([]);
      return;
    }
    // Filter and sort sibling sections for selected menu
    const siblings = sections
      .filter((s) => s.qr_menu_id === selectedMenuId)
      .sort((a, b) => a.display_order - b.display_order);

    setOrderedList(siblings);
  }, [selectedMenuId, sections]);

  if (!isOpen) return null;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const nextList = [...orderedList];
    const [moved] = nextList.splice(draggedIndex, 1);
    nextList.splice(targetIndex, 0, moved);

    setOrderedList(nextList);
    setDraggedIndex(null);
  };

  const handleSaveBulkOrder = async () => {
    if (!selectedMenuId || orderedList.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const orderedIds = orderedList.map((s) => s.id);
      // Bulk Reorder Sync: atomic payload update for display_order attributes
      await bulkReorderQRMenuSections(selectedMenuId, orderedIds);
      onSuccess(selectedMenuId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save bulk display ordering.');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveStep = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= orderedList.length) return;

    const nextList = [...orderedList];
    const [moved] = nextList.splice(fromIndex, 1);
    nextList.splice(toIndex, 0, moved);
    setOrderedList(nextList);
  };

  const activeMenu = menus.find((m) => m.id === selectedMenuId);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reorder-modal-title"
      className="fixed inset-0 z-[9999] overflow-y-auto flex items-center justify-center p-4 bg-[#1d1c17]/70 backdrop-blur-xs font-poppins animate-fade-in"
    >
      <div className="relative w-full max-w-xl min-w-[320px] sm:min-w-[540px] md:max-w-2xl shrink-0 bg-white rounded-2xl shadow-2xl border border-[#e8e2d8] overflow-hidden flex flex-col max-h-[85vh] my-auto animate-fade-in">
        {/* Header */}
        <div className="p-5 border-b border-[#e8e2d8] bg-[#fef9f1] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#ae001a] text-white flex items-center justify-center shadow-xs shrink-0">
              <span className="material-symbols-outlined text-xl">
                drag_indicator
              </span>
            </div>
            <div className="min-w-0">
              <h3
                id="reorder-modal-title"
                className="text-base font-black text-[#1d1c17] tracking-tight font-poppins truncate sm:whitespace-normal"
              >
                Drag & Drop Sequence Sequencer
              </h3>
              <p className="text-xs text-[#5f5e5e] font-medium mt-0.5">
                Bulk recalculates and updates chronological layout sequences atomically.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#e8e2d8] hover:border-[#ae001a] hover:text-[#ae001a] text-[#5f5e5e] flex items-center justify-center transition-colors shrink-0 ml-3"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 font-poppins text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
              {error}
            </div>
          )}

          {/* Menu Scope Selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="reorder-menu-scope"
              className="text-xs font-extrabold text-[#1d1c17] uppercase tracking-wider"
            >
              Select Menu Scope
            </label>
            <select
              id="reorder-menu-scope"
              data-testid="reorder-menu-scope-select"
              value={selectedMenuId}
              onChange={(e) => setSelectedMenuId(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] text-xs font-bold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
            >
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  #QR-MNU-{m.id} — {m.name} ({m.qr_type})
                </option>
              ))}
            </select>
          </div>

          {activeMenu && (
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-between">
              <span className="font-bold text-blue-900">
                Sequencing {orderedList.length} sibling sections in{' '}
                <strong>{activeMenu.name}</strong>
              </span>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                Theme: {activeMenu.design_theme}
              </span>
            </div>
          )}

          {/* Interactive Drag & Drop List */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-[#5f5e5e] uppercase tracking-wider">
              <span>Section Drag List</span>
              <span>Calculated Sequence</span>
            </div>

            {orderedList.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#e8e2d8] rounded-xl text-slate-400">
                No sections found in this menu.
              </div>
            ) : (
              <div
                className="space-y-2"
                data-testid="drag-drop-reorder-container"
              >
                {orderedList.map((sec, idx) => {
                  const isDragging = draggedIndex === idx;
                  const isOver = dragOverIndex === idx;

                  return (
                    <div
                      key={sec.id}
                      draggable
                      data-testid={`reorder-item-${sec.id}`}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      className={`p-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 select-none ${
                        isDragging
                          ? 'opacity-40 bg-slate-100 border-dashed border-[#ae001a]'
                          : isOver
                            ? 'border-[#ae001a] ring-2 ring-[#ae001a]/30 bg-amber-50/50 scale-[1.01]'
                            : 'bg-white border-[#e8e2d8] hover:border-slate-400 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="material-symbols-outlined text-slate-400 cursor-grab active:cursor-grabbing hover:text-[#ae001a] text-xl"
                          data-testid={`drag-grip-${sec.id}`}
                          title="Drag to reposition"
                        >
                          drag_indicator
                        </span>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-extrabold text-[#ae001a] bg-[#ae001a]/10 px-2 py-0.5 rounded">
                              #QR-SEC-{sec.id}
                            </span>
                            <span className="font-extrabold text-[#1d1c17] text-xs">
                              {sec.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#5f5e5e] line-clamp-1 mt-0.5 max-w-sm">
                            {sec.description || 'No description'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Step Buttons */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            title="Step Up"
                            onClick={() => handleMoveStep(idx, 'up')}
                            disabled={idx === 0}
                            className="w-4 h-4 rounded text-[#5f5e5e] hover:text-[#ae001a] disabled:opacity-30 flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              keyboard_arrow_up
                            </span>
                          </button>
                          <button
                            type="button"
                            title="Step Down"
                            onClick={() => handleMoveStep(idx, 'down')}
                            disabled={idx === orderedList.length - 1}
                            className="w-4 h-4 rounded text-[#5f5e5e] hover:text-[#ae001a] disabled:opacity-30 flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              keyboard_arrow_down
                            </span>
                          </button>
                        </div>

                        {/* Calculated Order Badge */}
                        <span
                          data-testid={`calculated-order-badge-${sec.id}`}
                          className="font-mono text-xs font-black px-2.5 py-1 rounded-md bg-slate-900 text-white shadow-xs"
                        >
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#e8e2d8] bg-[#fef9f1] flex items-center justify-between">
          <p className="text-[11px] text-[#5f5e5e] font-medium">
            Atomic batch synchronization triggers single bulk payload.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#e8e2d8] text-xs font-bold text-[#5f5e5e] hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="save-bulk-reorder-btn"
              disabled={saving || orderedList.length === 0}
              onClick={handleSaveBulkOrder}
              className="px-5 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] disabled:opacity-50 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95"
            >
              {saving ? (
                <span>Syncing...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">
                    sync_alt
                  </span>
                  <span>Bulk Reorder Sync</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
