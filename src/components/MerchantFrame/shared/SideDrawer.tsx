// Drawer lateral (anclado a la derecha) con la misma cabecera que AppModal.
//
// AppModal es un diálogo centrado de hasta max-w-2xl: se queda corto para un formulario que
// lleva un mapa al lado. Portal a document.body por el mismo motivo que AppModal (el <main>
// de MerchantFrame es `fixed` y crea su propio contexto de apilamiento).

import React, { useId } from 'react';
import { createPortal } from 'react-dom';

interface SideDrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  /** Ancho máximo del panel en px. */
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
        className="h-full w-full bg-white shadow-2xl flex flex-col animate-fade-in font-sans"
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
