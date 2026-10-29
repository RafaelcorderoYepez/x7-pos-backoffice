import React from 'react';
import { createPortal } from 'react-dom';
import type { QRMenuItem, QRMenuSection, QRMenuSectionStatus } from '../../../../types/qr-menu';

interface CascadeVerificationModalProps {
  isOpen: boolean;
  type: 'delete' | 'inactivate';
  section: QRMenuSection | null;
  items?: QRMenuItem[];
  targetStatus?: QRMenuSectionStatus;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CascadeVerificationModal: React.FC<CascadeVerificationModalProps> = ({
  isOpen,
  type,
  section,
  items = [],
  targetStatus = 'inactive',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !section) return null;

  const childItems = items.length > 0 ? items : section.items || [];
  const itemsCount =
    section.items_count !== undefined && section.items_count > childItems.length
      ? section.items_count
      : childItems.length;

  const isDelete = type === 'delete';

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cascade-modal-title"
      className="fixed inset-0 z-[10000] overflow-y-auto flex items-center justify-center p-4 bg-[#1d1c17]/70 backdrop-blur-xs font-poppins animate-fade-in"
    >
      <div className="relative w-full max-w-lg min-w-[320px] sm:min-w-[480px] shrink-0 bg-white rounded-2xl shadow-2xl border border-[#e8e2d8] overflow-hidden my-auto animate-fade-in">
        {/* Header */}
        <div
          className={`p-5 border-b border-[#e8e2d8] flex items-center gap-3.5 ${
            isDelete ? 'bg-rose-50/70' : 'bg-amber-50/70'
          }`}
        >
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
              isDelete
                ? 'bg-rose-600 text-white'
                : 'bg-amber-500 text-white'
            }`}
          >
            <span className="material-symbols-outlined text-2xl">
              {isDelete ? 'delete_forever' : 'warning'}
            </span>
          </div>
          <div>
            <h3
              id="cascade-modal-title"
              className="text-base font-black text-[#1d1c17] tracking-tight font-poppins"
            >
              {isDelete
                ? 'Cascade Deletion Protection'
                : 'Cascade Availability Protection'}
            </h3>
            <p className="text-xs text-[#5f5e5e] font-medium mt-0.5">
              Child menu items detected. Review attached items before proceeding.
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs font-poppins">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-[#ae001a] bg-[#ae001a]/10 px-2 py-0.5 rounded font-poppins">
                #QR-SEC-{section.id}
              </span>
              <span className="font-bold text-[#5f5e5e] text-[11px]">
                {itemsCount} Child Items Attached
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-[#1d1c17]">
              {section.name}
            </h4>
            <p className="text-[11px] text-[#5f5e5e]">
              Parent Menu: #{section.qr_menu_id} ({section.qrMenu?.name || 'Assigned Menu'})
            </p>
          </div>

          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
              isDelete
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {isDelete ? (
              <p>
                <strong>Warning:</strong> Deleting this section will detach or
                orphan <strong>{itemsCount} attached menu items</strong>. These items
                will no longer be accessible through category navigation on digital QR
                menus.
              </p>
            ) : (
              <p>
                <strong>Operational Impact:</strong> Changing status to{' '}
                <strong className="capitalize">{targetStatus}</strong> will
                automatically hide all{' '}
                <strong>{itemsCount} attached menu items</strong> from customer mobile
                QR menus.
              </p>
            )}
          </div>

          {/* Attached Child Items List */}
          {itemsCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-extrabold text-[#5f5e5e] uppercase tracking-wider">
                <span>Attached Menu Items ({itemsCount})</span>
                <span>Category Scope</span>
              </div>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-[#e8e2d8] divide-y divide-[#e8e2d8]/60 bg-white p-1">
                {childItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 flex items-center justify-between hover:bg-slate-50 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-[#ae001a]">
                        restaurant
                      </span>
                      <span className="font-bold text-[#1d1c17]">
                        {item.product_name || `Item #${item.id}`}
                      </span>
                    </div>
                    {item.price !== undefined && (
                      <span className="font-mono text-[11px] font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        ${Number(item.price).toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#e8e2d8] bg-[#fef9f1] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            data-testid="cancel-cascade-btn"
            className="px-4 py-2 rounded-xl border border-[#e8e2d8] text-xs font-bold text-[#5f5e5e] hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid={isDelete ? 'confirm-cascade-delete-btn' : 'confirm-cascade-inactivate-btn'}
            className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95 ${
              isDelete
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {isDelete ? 'delete_forever' : 'check_circle'}
            </span>
            <span>
              {isDelete ? 'Confirm Deletion & Detach' : 'Confirm Inactivation'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
