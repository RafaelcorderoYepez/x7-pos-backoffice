// Side drawer (docked to the right) with the same header as AppModal.
//
// AppModal is a centered dialog up to max-w-2xl: insufficient for large forms that
// He has a map at his side. Portal to document.body for the same reason as AppModal (the <main>
// of MerchantFrame is `fixed` and creates its own stacking context).

import React, { useId } from 'react';
import { createPortal } from 'react-dom';

interface SideDrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  /** Maximum drawer width in px. */
  maxWidth?: number;
  children: React.ReactNode;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  title,
  subtitle,
  onClose,
  closeDisabled = false,
  maxWidth = 640,
  children,
}) => {
  const titleId = useId();

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end bg-black/50 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="h-full w-full bg-white shadow-2xl flex flex-col overflow-hidden animate-fade-in font-sans"
        style={{ maxWidth }}
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center gap-4 shrink-0">
          <div className="min-w-0">
            {subtitle ? (
              <p className="text-label-caps text-white/60 tracking-widest">{subtitle}</p>
            ) : null}
            <span id={titleId} className={`block font-bold text-lg truncate ${subtitle ? 'mt-1' : ''}`}>
              {title}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close drawer"
            className="text-white/70 hover:text-white transition-colors duration-200 disabled:opacity-50 shrink-0"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default SideDrawer;
