// Alta y enmienda de un contrato de colaborador.
//
// El formulario pide un único importe (`wage_rate`) y el periodo que cubre: el reparto
// entre tarifa por hora y sueldo base lo hace el backend, porque es un detalle del motor de
// nómina y no algo que RR. HH. deba decidir campo a campo.

import React, { useMemo, useRef, useState } from 'react';
import type {
  CollaboratorContract,
  EmploymentType,
  PayFrequency,
} from '../../../../types/contract';
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABELS,
  normalizeEmploymentType,
  normalizePayFrequency,
} from '../../../../types/contract';
import type { Collaborator } from '../../../../types/collaborator';
import { shiftRoleLabel } from '../../../../types/collaborator';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  blockingActiveContract,
  contractCollaboratorRef,
  dateRangeError,
  documentError,
  formatFileSize,
  overlapWarning,
  toDateOnly,
  todayIso,
  wageRateError,
  weeklyHoursError,
} from '../../../../lib/contracts';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';

export interface ContractDraft {
  collaborator_id: number;
  employment_type: EmploymentType;
  pay_frequency: PayFrequency;
  wage_rate: number;
  working_hours_per_week: number;
  start_date: string;
  end_date: string | null;
  active: boolean;
  document: File | null;
}

interface ContractFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: CollaboratorContract;
  collaborators: Collaborator[];
  collaboratorsError?: string;
  contracts: CollaboratorContract[];
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (draft: ContractDraft) => void;
}

export const ContractFormDrawer: React.FC<ContractFormDrawerProps> = ({
  mode,
  initial,
  collaborators,
  collaboratorsError = '',
  contracts,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [collaboratorId, setCollaboratorId] = useState<string>(
    initial ? String(initial.collaborator_id) : '',
  );
  const [collaboratorQuery, setCollaboratorQuery] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    normalizeEmploymentType(initial?.employment_type),
  );
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(
    initial ? normalizePayFrequency(initial.pay_frequency) : 'hourly',
  );
  const [wageRate, setWageRate] = useState<string>(
    initial ? String(initial.wage_rate ?? '') : '',
  );
  const [weeklyHours, setWeeklyHours] = useState<string>(
    initial ? String(initial.working_hours_per_week ?? 40) : '40',
  );
  const [startDate, setStartDate] = useState<string>(
    initial ? toDateOnly(initial.start_date) : todayIso(),
  );
  const [endDate, setEndDate] = useState<string>(
    initial ? toDateOnly(initial.end_date) : '',
  );
  const [active, setActive] = useState<boolean>(initial?.active ?? true);
  const [document, setDocument] = useState<File | null>(null);
  const [documentIssue, setDocumentIssue] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useModalDismiss(onCancel);

  const visibleCollaborators = useMemo(() => {
    const term = collaboratorQuery.trim().toLowerCase();
    if (!term) return collaborators;
    return collaborators.filter((c) =>
      [c.name, contractCollaboratorRef(c.id), String(c.id), c.role]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [collaborators, collaboratorQuery]);

  // El solape se avisa antes de enviar, con el contrato concreto que estorba, en vez de
  // dejar que el usuario descubra el 409 después de rellenar todo el formulario.
  const blocking = useMemo(() => {
    if (!collaboratorId) return null;
    if (!active) return null;
    return blockingActiveContract(
      contracts,
      Number(collaboratorId),
      initial?.id ?? null,
    );
  }, [contracts, collaboratorId, initial, active]);

  const rangeError = dateRangeError(startDate, endDate);
  const wageError = wageRateError(wageRate);
  const hoursError = weeklyHoursError(weeklyHours);

  const canSubmit =
    collaboratorId.length > 0 &&
    startDate.length > 0 &&
    !rangeError &&
    !wageError &&
    !hoursError &&
    !documentIssue &&
    !blocking &&
    !submitting;

  const acceptFile = (file: File | null) => {
    if (!file) {
      setDocument(null);
      setDocumentIssue('');
      return;
    }
    const issue = documentError(file);
    setDocumentIssue(issue);
    setDocument(issue ? null : file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      collaborator_id: Number(collaboratorId),
      employment_type: employmentType,
      pay_frequency: payFrequency,
      wage_rate: Number(wageRate),
      working_hours_per_week: Number(weeklyHours),
      start_date: startDate,
      end_date: endDate ? endDate : null,
      active,
      document,
    });
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';
  const errorClass = 'text-[11px] font-semibold text-[#ae001a]';

  return (
    <AppModal
      title={mode === 'create' ? 'Register Contract' : 'Amend Contract'}
      subtitle="Human Resources"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close contract form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ctr-collaborator" className={labelClass}>
            <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
              assignment_ind
            </span>{' '}
            Collaborator <span className="text-[#ae001a]">*</span>
          </label>
          <input
            type="text"
            value={collaboratorQuery}
            onChange={(e) => setCollaboratorQuery(e.target.value)}
            placeholder="Filter collaborators by name, role or #CLB-id…"
            className={`${inputClass} text-[13px]`}
            aria-label="Filter collaborators"
          />
          <select
            id="ctr-collaborator"
            autoFocus
            value={collaboratorId}
            onChange={(e) => setCollaboratorId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a collaborator…</option>
            {visibleCollaborators.map((c) => (
              <option key={c.id} value={c.id}>
                {contractCollaboratorRef(c.id)} · {c.name} ({shiftRoleLabel(c.role)})
              </option>
            ))}
          </select>
          {collaboratorsError ? (
            <p role="alert" className={errorClass}>
              {collaboratorsError} Without them there is nobody to bind the agreement to.
            </p>
          ) : (
            collaborators.length === 0 && (
              <p className="text-[11px] text-[#5f5e5e] italic">
                This merchant has no collaborators yet. Register one in the collaborators
                database first.
              </p>
            )
          )}
          {blocking && (
            <p role="alert" className={errorClass}>
              {overlapWarning(blocking)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ctr-type" className={labelClass}>
              <span
                className="material-symbols-outlined text-[13px] align-middle"
                aria-hidden="true"
              >
                description
              </span>{' '}
              Contract type <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="ctr-type"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
              className={inputClass}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ctr-status" className={labelClass}>
              Agreement status <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="ctr-status"
              value={active ? 'active' : 'terminated'}
              onChange={(e) => setActive(e.target.value === 'active')}
              className={inputClass}
            >
              <option value="active">Active</option>
              <option value="terminated">Terminated</option>
            </select>
            <p className="text-[11px] text-[#5f5e5e]">
              Terminating frees the collaborator for a new agreement.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ctr-start" className={labelClass}>
              Start date <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="ctr-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ctr-end" className={labelClass}>
              <span
                className="material-symbols-outlined text-[13px] align-middle"
                aria-hidden="true"
              >
                event_busy
              </span>{' '}
              End date
            </label>
            <input
              id="ctr-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-invalid={Boolean(rangeError)}
              className={inputClass}
            />
            <p className="text-[11px] text-[#5f5e5e]">
              Leave empty for an indefinite agreement.
            </p>
          </div>
        </div>
        {rangeError && (
          <p role="alert" className={errorClass}>
            {rangeError}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ctr-wage" className={labelClass}>
              <span
                className="material-symbols-outlined text-[13px] align-middle"
                aria-hidden="true"
              >
                payments
              </span>{' '}
              Wage rate <span className="text-[#ae001a]">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#5f5e5e]">
                $
              </span>
              <input
                id="ctr-wage"
                type="number"
                min="0"
                step="0.01"
                value={wageRate}
                onChange={(e) => setWageRate(e.target.value)}
                aria-invalid={Boolean(wageError)}
                className={`${inputClass} pl-7`}
                placeholder="22.50"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ctr-frequency" className={labelClass}>
              Pay frequency <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="ctr-frequency"
              value={payFrequency}
              onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}
              className={inputClass}
            >
              {PAY_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {PAY_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ctr-hours" className={labelClass}>
              Hours / week <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="ctr-hours"
              type="number"
              min="0"
              step="0.5"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              aria-invalid={Boolean(hoursError)}
              className={inputClass}
            />
          </div>
        </div>
        {(wageError || hoursError) && (
          <p role="alert" className={errorClass}>
            {wageError || hoursError}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>
            <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
              upload_file
            </span>{' '}
            Signed document
          </span>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              acceptFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`border-2 border-dashed rounded p-4 text-center transition-colors ${
              dragging ? 'border-[#ae001a] bg-[#ae001a]/5' : 'border-[#e8e2d8] bg-[#fef9f1]'
            }`}
          >
            <input
              ref={fileInputRef}
              id="ctr-document"
              type="file"
              accept={ALLOWED_DOCUMENT_EXTENSIONS.join(',')}
              className="sr-only"
              aria-label="Signed contract document"
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[#ae001a] text-sm font-semibold hover:underline transition-colors duration-200"
            >
              Choose a PDF or Word file
            </button>
            <p className="text-[11px] text-[#5f5e5e] mt-1">
              or drop it here — up to 10MB.
            </p>
            {document && (
              <p className="text-xs text-[#1d1c17] mt-2 font-mono">
                {document.name} · {formatFileSize(document.size)}
              </p>
            )}
            {!document && initial?.document_name && (
              <p className="text-[11px] text-[#5f5e5e] mt-2 italic">
                Currently attached: {initial.document_name}. Choosing a new file replaces it.
              </p>
            )}
          </div>
          {documentIssue && (
            <p role="alert" className={errorClass}>
              {documentIssue}
            </p>
          )}
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={
            submitting
              ? 'Saving…'
              : mode === 'create'
                ? 'Register Contract'
                : 'Save Amendment'
          }
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

export default ContractFormDrawer;
