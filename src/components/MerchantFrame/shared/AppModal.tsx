import React, { useId } from 'react';
import { createPortal } from 'react-dom';

type AppModalSize = 'md' | 'lg' | '2xl';

const SIZE_CLASSES: Record<AppModalSize, string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
};

export type AppModalProps = {
  title: string;
  titleId?: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  closeAriaLabel?: string;
  size?: AppModalSize;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
};

export const AppModal: React.FC<AppModalProps> = ({
  title,
  titleId,
  subtitle,
  onClose,
  closeDisabled = false,
  closeAriaLabel = 'Close dialog',
  size = '2xl',
  children,
  closeOnBackdrop = false,
}) => {
  // Id propio por instancia: con dos modales apilados (un formulario y su confirmación
  // encima) un id fijo se duplicaba en el DOM y aria-labelledby resolvía al título del
  // primero, así que el segundo diálogo se anunciaba con el nombre del que tapa.
  const generatedTitleId = useId();
  const resolvedTitleId = titleId ?? generatedTitleId;

  const handleBackdropClick = () => {
    if (!closeOnBackdrop || closeDisabled) return;
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={closeOnBackdrop ? handleBackdropClick : undefined}
      role="presentation"
    >
      <div
        className={`bg-white border border-[#e8e2d8] rounded shadow-2xl w-full ${SIZE_CLASSES[size]} overflow-hidden animate-fade-in max-h-[90vh] flex flex-col`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={resolvedTitleId}
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center gap-4 shrink-0">
          <div className="min-w-0">
            {subtitle ? (
              <p className="text-label-caps text-white/60 tracking-widest">
                {subtitle}
              </p>
            ) : null}
            <span
              id={resolvedTitleId}
              className={`block ${
                subtitle
                  ? 'font-bold text-lg'
                  : 'font-bold text-label-caps uppercase tracking-wider'
              } ${subtitle ? 'mt-1' : ''}`}
            >
              {title}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="text-white/70 hover:text-white transition-colors disabled:opacity-50 shrink-0"
            aria-label={closeAriaLabel}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body,
  );
};

export type FormFieldProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
};

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  value,
  error,
  onChange,
  placeholder,
  required = false,
  type = 'text',
}) => {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className="text-[11px] font-bold text-[#5f5e5e] uppercase">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        className={`bg-white text-[#1d1c17] px-3 py-2 border rounded text-body-md outline-none w-full ${
          error
            ? 'border-error focus:ring-1 focus:ring-error'
            : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a]'
        }`}
      />
      {error ? (
        <p className="text-body-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export type ModalFormFooterProps = {
  onCancel: () => void;
  cancelLabel?: string;
  submitLabel: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  submitType?: 'submit' | 'button';
  onSubmit?: () => void;
  destructive?: boolean;
};

export const ModalFormFooter: React.FC<ModalFormFooterProps> = ({
  onCancel,
  cancelLabel = 'Cancel',
  submitLabel,
  isSubmitting = false,
  submitDisabled = false,
  submitType = 'submit',
  onSubmit,
  destructive = false,
}) => {
  return (
    <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e2d8]">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        className="px-5 py-2.5 border border-[#e8e2d8] rounded font-semibold text-[#1d1c17] hover:bg-[#f8f3eb] transition-colors disabled:opacity-50"
      >
        {cancelLabel}
      </button>
      <button
        type={submitType}
        onClick={onSubmit}
        disabled={isSubmitting || submitDisabled}
        className={`px-6 py-2.5 text-white font-bold text-label-caps rounded transition-colors disabled:opacity-50 ${
          destructive
            ? 'bg-[#ba1a1a] hover:opacity-90'
            : 'bg-[#ae001a] hover:bg-[#d2272f]'
        }`}
      >
        {submitLabel}
      </button>
    </div>
  );
};

export function ModalFormError({ message }: { message: string }) {
  return (
    <div
      className="p-3 border border-error/30 bg-red-50 rounded text-body-sm text-error"
      role="alert"
    >
      {message}
    </div>
  );
}
