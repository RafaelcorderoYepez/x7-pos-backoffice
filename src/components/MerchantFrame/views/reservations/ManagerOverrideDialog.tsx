// Diálogo de override para una transición de estado (confirmar una PENDING en una franja
// llena). Se abre cuando el servidor responde 409 CAPACITY_OVERRIDE_REQUIRED; reintenta la
// MISMA transición con las credenciales del encargado.

import React, { useState } from 'react';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { hasOverrideErrors, type ManagerOverride } from '../../../../lib/reservation-capacity';
import { ManagerOverrideFields } from './ManagerOverrideFields';

interface ManagerOverrideDialogProps {
  title: string;
  reason: string;
  submitLabel: string;
  submitting: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (override: ManagerOverride) => void;
}

export const ManagerOverrideDialog: React.FC<ManagerOverrideDialogProps> = ({
  title,
  reason,
  submitLabel,
  submitting,
  error,
  onCancel,
  onSubmit,
}) => {
  const [override, setOverride] = useState<ManagerOverride>({ email: '', password: '' });
  const [touched, setTouched] = useState(false);
  useModalDismiss(onCancel);

  return (
    <AppModal
      title={title}
      subtitle="MANAGER OVERRIDE"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
    >
      <form
        noValidate
        className="p-6 flex flex-col gap-4 font-sans"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (hasOverrideErrors(override) || submitting) return;
          onSubmit(override);
        }}
      >
        <ManagerOverrideFields
          value={override}
          onChange={setOverride}
          reason={reason}
          showErrors={touched}
          idPrefix="transition"
        />
        {error ? <ModalFormError message={error} /> : null}
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Authorizing…' : submitLabel}
          isSubmitting={submitting}
          submitDisabled={submitting || hasOverrideErrors(override)}
        />
      </form>
    </AppModal>
  );
};

export default ManagerOverrideDialog;
