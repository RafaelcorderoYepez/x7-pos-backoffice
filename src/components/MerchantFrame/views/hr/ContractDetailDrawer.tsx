// Cajón de inspección de un contrato: los términos pactados, el documento firmado y la
// bitácora de enmiendas.
//
// El visor incrusta el PDF en un iframe en lugar de abrir una pestaña: un auditor compara
// las cláusulas con el panel de términos que tiene al lado, y perder el contexto del
// workspace para eso es justo lo que la historia quiere evitar. Un .docx no se puede
// incrustar, así que en ese caso se ofrece la descarga.

import React, { useRef, useState } from 'react';
import type {
  CollaboratorContract,
  ContractRevision,
} from '../../../../types/contract';
import {
  PAYROLL_MODEL_LABELS,
  employmentTypeBadgeStyle,
  employmentTypeLabel,
  payFrequencyLabel,
} from '../../../../types/contract';
import { shiftRoleLabel } from '../../../../types/collaborator';
import {
  contractCollaboratorName,
  contractCollaboratorRef,
  contractRef,
  contractStatusBadgeStyle,
  contractStatusLabel,
  expiryNotice,
  formatCompensation,
  formatContractDate,
  formatMoney,
  formatRevisionTimestamp,
  formatRevisionValue,
  formatWeeklyHours,
  isPreviewableDocument,
  revisionFieldLabel,
} from '../../../../lib/contracts';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal } from '../../shared/AppModal';

type TabKey = 'terms' | 'document' | 'history';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'terms', label: 'Terms Summary', icon: 'description' },
  { key: 'document', label: 'Signed Document', icon: 'visibility' },
  { key: 'history', label: 'Amendment History', icon: 'history' },
];

interface ContractDetailDrawerProps {
  contract: CollaboratorContract;
  revisions: ContractRevision[];
  loading: boolean;
  error: string;
  documentBase: string;
  onClose: () => void;
  onRetry: () => void;
  onAmend: () => void;
}

const Term: React.FC<{ label: string; value: React.ReactNode; icon?: string }> = ({
  label,
  value,
  icon,
}) => (
  <div className="bg-[#fef9f1] border border-[#e8e2d8] rounded p-3">
    <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-1">
      {icon && (
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </p>
    <p className="text-sm text-[#1d1c17] font-semibold mt-1">{value}</p>
  </div>
);

export const ContractDetailDrawer: React.FC<ContractDetailDrawerProps> = ({
  contract,
  revisions,
  loading,
  error,
  documentBase,
  onClose,
  onRetry,
  onAmend,
}) => {
  const [tab, setTab] = useState<TabKey>('terms');
  const frameRef = useRef<HTMLIFrameElement>(null);
  useModalDismiss(onClose);

  // El backend devuelve una ruta relativa servida por el propio API.
  const documentHref = contract.document_url
    ? `${documentBase}${contract.document_url}`
    : '';
  const previewable = isPreviewableDocument(contract.document_url);

  /**
   * Imprime el documento incrustado.
   *
   * Se intenta primero sobre el propio iframe para no sacar al auditor del workspace; si el
   * navegador lo bloquea por origen, se cae a abrirlo en una pestaña, que siempre funciona.
   */
  const handlePrint = () => {
    try {
      const frame = frameRef.current;
      if (frame?.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      }
    } catch {
      // Origen distinto: no se puede pilotar el iframe.
    }
    window.open(documentHref, '_blank', 'noopener');
  };

  return (
    <AppModal
      title={contractRef(contract.id)}
      subtitle="Contract inspection"
      onClose={onClose}
      size="2xl"
      closeAriaLabel="Close contract inspection"
    >
      <div className="flex flex-col overflow-hidden flex-1 text-left font-sans">
        {/* ---------------- Cabecera ---------------- */}
        <div className="p-6 flex items-start justify-between gap-4 border-b border-[#e8e2d8]">
          <div className="min-w-0">
            <p className="font-bold text-[#1d1c17] text-lg truncate">
              {contractCollaboratorName(contract)}
            </p>
            <p className="text-xs text-[#5f5e5e] font-mono mt-0.5">
              {contractCollaboratorRef(contract.collaborator_id)}
              {contract.collaborator?.role
                ? ` · ${shiftRoleLabel(contract.collaborator.role)}`
                : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                data-testid="contract-detail-status"
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${contractStatusBadgeStyle(
                  contract,
                )}`}
              >
                {contractStatusLabel(contract)}
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${employmentTypeBadgeStyle(
                  contract.employment_type,
                )}`}
              >
                {employmentTypeLabel(contract.employment_type)}
              </span>
              <span className="text-[11px] text-[#5f5e5e]">
                {expiryNotice(contract)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onAmend}
            className="px-4 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              edit_document
            </span>
            Amend Contract
          </button>
        </div>

        {/* ---------------- Pestañas ---------------- */}
        <div className="flex border-b border-[#e8e2d8] bg-[#f8f3eb]" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors duration-200 ${
                tab === t.key
                  ? 'text-[#ae001a] border-b-2 border-[#ae001a] bg-white'
                  : 'text-[#5f5e5e] hover:text-[#ae001a]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {tab === 'terms' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Term
                  label="Start date"
                  value={formatContractDate(contract.start_date)}
                />
                <Term
                  label="End date"
                  icon="event_busy"
                  value={formatContractDate(contract.end_date)}
                />
                <Term
                  label="Compensation"
                  icon="payments"
                  value={formatCompensation(contract)}
                />
                <Term
                  label="Pay frequency"
                  value={payFrequencyLabel(contract.pay_frequency)}
                />
                <Term
                  label="Weekly hours"
                  value={formatWeeklyHours(contract.working_hours_per_week)}
                />
                <Term
                  label="Payroll model"
                  value={PAYROLL_MODEL_LABELS[contract.contract_type] ?? '—'}
                />
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">
                  Payroll multipliers
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Term
                    label="Overtime"
                    value={`${Number(contract.overtime_multiplier).toFixed(2)}×`}
                  />
                  <Term
                    label="Double overtime"
                    value={`${Number(contract.double_overtime_multiplier).toFixed(2)}×`}
                  />
                  <Term
                    label="Tips in payroll"
                    value={contract.tips_included_in_payroll ? 'Included' : 'Excluded'}
                  />
                </div>
              </div>

              {contract.contract_type === 'mixed' && (
                <div className="grid grid-cols-2 gap-3">
                  <Term label="Base salary" value={formatMoney(contract.base_salary)} />
                  <Term label="Hourly rate" value={formatMoney(contract.hourly_rate)} />
                </div>
              )}
            </div>
          )}

          {tab === 'document' && (
            <div className="space-y-3">
              {!contract.document_url ? (
                <div className="py-16 flex flex-col items-center text-center">
                  <span
                    className="material-symbols-outlined text-[#5f5e5e] text-5xl"
                    aria-hidden="true"
                  >
                    upload_file
                  </span>
                  <p className="text-sm text-[#5f5e5e] mt-3 max-w-sm">
                    No signed document attached yet. Amend the contract to upload the
                    scanned agreement.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm text-[#1d1c17] font-mono truncate">
                      {contract.document_name ?? 'Signed agreement'}
                    </p>
                    <div className="flex gap-2">
                      <a
                        href={documentHref}
                        download={contract.document_name ?? undefined}
                        className="px-3 py-1.5 border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200 flex items-center gap-1.5"
                      >
                        <span
                          className="material-symbols-outlined text-[16px]"
                          aria-hidden="true"
                        >
                          download
                        </span>
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={handlePrint}
                        className="px-3 py-1.5 border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200 flex items-center gap-1.5"
                      >
                        <span
                          className="material-symbols-outlined text-[16px]"
                          aria-hidden="true"
                        >
                          print
                        </span>
                        Print
                      </button>
                    </div>
                  </div>
                  {previewable ? (
                    <iframe
                      ref={frameRef}
                      src={documentHref}
                      title={`Signed contract ${contractRef(contract.id)}`}
                      data-testid="contract-document-frame"
                      className="w-full h-[420px] border border-[#e8e2d8] rounded bg-white"
                    />
                  ) : (
                    <p className="text-sm text-[#5f5e5e] italic py-8 text-center">
                      Word documents cannot be previewed inline — download the file to read
                      it.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              {loading && (
                <p className="text-sm text-[#5f5e5e] italic py-8 text-center">
                  Loading amendment history…
                </p>
              )}
              {!loading && error && (
                <div className="py-8 flex flex-col items-center text-center gap-3">
                  <p role="alert" className="text-sm text-[#ae001a] font-semibold">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="text-[#ae001a] text-sm font-semibold hover:underline"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!loading && !error && revisions.length === 0 && (
                <p className="text-sm text-[#5f5e5e] italic py-8 text-center">
                  No amendments recorded — the agreement stands as originally registered.
                </p>
              )}
              {!loading &&
                !error &&
                revisions.map((r) => (
                  <div
                    key={r.id}
                    data-testid={`contract-revision-${r.id}`}
                    className="border border-[#e8e2d8] rounded p-3 bg-[#fef9f1]"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-[#1d1c17]">
                        {revisionFieldLabel(r.field)}
                      </p>
                      <p className="text-[11px] text-[#5f5e5e] font-mono">
                        {formatRevisionTimestamp(r.created_at)}
                      </p>
                    </div>
                    <p className="text-sm text-[#1d1c17] mt-1">
                      <span className="text-[#5f5e5e] line-through">
                        {formatRevisionValue(r.field, r.previous_value)}
                      </span>
                      <span className="mx-2" aria-hidden="true">
                        →
                      </span>
                      <span className="font-semibold">
                        {formatRevisionValue(r.field, r.new_value)}
                      </span>
                    </p>
                    {r.changed_by_user_id != null && (
                      <p className="text-[11px] text-[#5f5e5e] mt-1 font-mono">
                        by #USR-{r.changed_by_user_id}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </AppModal>
  );
};

export default ContractDetailDrawer;
