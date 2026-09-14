// Alta y edición de la ficha de un colaborador.
//
// La cuenta de plataforma sólo se elige al dar de alta: el índice único de user_id hace que
// reasignarla equivalga a cambiar de persona la ficha entera, con su histórico de comandas
// y cajas detrás. Por eso al editar el selector queda bloqueado.

import React, { useMemo, useState } from 'react';
import type {
  Collaborator,
  CollaboratorStatus,
  ShiftRole,
} from '../../../../types/collaborator';
import {
  COLLABORATOR_STATUSES,
  COLLABORATOR_STATUS_LABELS,
  SHIFT_ROLES,
  SHIFT_ROLE_LABELS,
  normalizeCollaboratorStatus,
} from '../../../../types/collaborator';
import type { MerchantUser } from '../../../../types/user';
import {
  MAX_COLLABORATOR_NAME,
  availableUsersFor,
  collaboratorNameError,
  defaultNameForUser,
  duplicateUserBindingError,
  isUserAlreadyLinked,
} from '../../../../lib/collaborators';
import { shiftHours, shiftLabel, type ShiftRef } from '../../../../lib/table-assignments';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';

export interface CollaboratorDraft {
  user_id: number;
  name: string;
  role: ShiftRole;
  status: CollaboratorStatus;
  shift_id: number | null;
}

interface CollaboratorFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: Collaborator;
  users: MerchantUser[];
  // Motivo por el que no hay cuentas, si la carga falló. Vacío = la carga fue bien.
  usersError?: string;
  collaborators: Collaborator[];
  shifts: ShiftRef[];
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (draft: CollaboratorDraft) => void;
}

export const CollaboratorFormDrawer: React.FC<CollaboratorFormDrawerProps> = ({
  mode,
  initial,
  users,
  usersError = '',
  collaborators,
  shifts,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [userId, setUserId] = useState<string>(initial ? String(initial.user_id) : '');
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<ShiftRole>((initial?.role as ShiftRole) ?? 'waiter');
  const [status, setStatus] = useState<CollaboratorStatus>(
    initial ? normalizeCollaboratorStatus(initial.status) : 'active',
  );
  const [shiftId, setShiftId] = useState<string>(
    initial?.shift_id != null ? String(initial.shift_id) : '',
  );
  // El nombre por defecto sólo se propone mientras el usuario no lo haya tocado: una vez
  // escrito un nombre de sala, cambiar de cuenta no debe pisárselo.
  const [nameTouched, setNameTouched] = useState(mode === 'edit');
  const [userQuery, setUserQuery] = useState('');

  useModalDismiss(onCancel);

  // Sólo cuentas sin ficha. Al editar se conserva la propia, o el select se quedaría sin la
  // opción que ya tiene seleccionada.
  const selectableUsers = useMemo(
    () => availableUsersFor(users, collaborators, initial?.id),
    [users, collaborators, initial],
  );

  const visibleUsers = useMemo(() => {
    const term = userQuery.trim().toLowerCase();
    if (!term) return selectableUsers;
    return selectableUsers.filter((u) =>
      [u.username ?? '', u.email, String(u.id)].join(' ').toLowerCase().includes(term),
    );
  }, [selectableUsers, userQuery]);

  const selectedUser = users.find((u) => String(u.id) === userId) ?? null;

  const duplicateBinding =
    mode === 'create' &&
    userId.length > 0 &&
    isUserAlreadyLinked(collaborators, Number(userId), initial?.id);

  const nameError = collaboratorNameError(name);

  const canSubmit =
    userId.length > 0 && !duplicateBinding && !nameError && !submitting;

  const handleUserChange = (value: string) => {
    setUserId(value);
    if (!nameTouched) {
      const user = users.find((u) => String(u.id) === value) ?? null;
      setName(defaultNameForUser(user));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      user_id: Number(userId),
      name: name.trim(),
      role,
      status,
      shift_id: shiftId ? Number(shiftId) : null,
    });
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';

  return (
    <AppModal
      title={mode === 'create' ? 'Register Collaborator' : 'Edit Profile'}
      subtitle="Human Resources"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close collaborator form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="clb-user" className={labelClass}>
            <span className="material-symbols-outlined text-[13px] align-middle" aria-hidden="true">
              person_add
            </span>{' '}
            Platform account <span className="text-[#ae001a]">*</span>
          </label>
          {mode === 'create' ? (
            <>
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Filter accounts by username, email or id…"
                className={`${inputClass} text-[13px]`}
                aria-label="Filter platform accounts"
              />
              <select
                id="clb-user"
                autoFocus
                value={userId}
                onChange={(e) => handleUserChange(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a platform account…</option>
                {visibleUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    #USR-{u.id} · {u.username || u.email}
                  </option>
                ))}
              </select>
              {usersError ? (
                <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                  {usersError} Without them there is no account to link, so the form cannot be
                  submitted.
                </p>
              ) : (
                selectableUsers.length === 0 && (
                  <p className="text-[11px] text-[#5f5e5e] italic">
                    {users.length === 0
                      ? 'This merchant has no platform accounts yet. Create a user first.'
                      : 'Every platform account already has a collaborator profile. Create a user first.'}
                  </p>
                )
              )}
            </>
          ) : (
            <>
              {/* Reasignar la cuenta cambiaría de persona una ficha con histórico detrás. */}
              <input
                id="clb-user"
                type="text"
                readOnly
                value={`#USR-${initial?.user_id ?? ''} · ${
                  selectedUser?.username || selectedUser?.email || 'linked account'
                }`}
                className={`${inputClass} bg-[#f2ede5] cursor-not-allowed font-mono`}
              />
              <p className="text-[11px] text-[#5f5e5e]">
                The linked platform account cannot be changed. Delete the profile and register
                a new one to bind a different account.
              </p>
            </>
          )}
          {duplicateBinding && (
            <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
              {duplicateUserBindingError(Number(userId))}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="clb-name" className={labelClass}>
            Display name <span className="text-[#ae001a]">*</span>
          </label>
          <input
            id="clb-name"
            type="text"
            value={name}
            maxLength={MAX_COLLABORATOR_NAME}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
            aria-invalid={Boolean(nameError)}
            className={inputClass}
            placeholder="e.g., Juan (sala)"
          />
          <p className="text-[11px] text-[#5f5e5e]">
            Defaults to the account username, but the store can call them whatever the floor
            calls them.
          </p>
          {nameError && name.length > 0 && (
            <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
              {nameError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clb-role" className={labelClass}>
              <span
                className="material-symbols-outlined text-[13px] align-middle"
                aria-hidden="true"
              >
                work
              </span>{' '}
              Role <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="clb-role"
              value={role}
              onChange={(e) => setRole(e.target.value as ShiftRole)}
              className={inputClass}
            >
              {SHIFT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {SHIFT_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clb-status" className={labelClass}>
              Status <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="clb-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CollaboratorStatus)}
              className={inputClass}
            >
              {COLLABORATOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COLLABORATOR_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="clb-shift" className={labelClass}>
            Recurring shift
          </label>
          <select
            id="clb-shift"
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftLabel(s)} · {shiftHours(s)}
              </option>
            ))}
          </select>
          {shifts.length === 0 && (
            <p className="text-[11px] text-[#5f5e5e] italic">
              No shifts available yet — the collaborator can be attached to one later.
            </p>
          )}
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={
            submitting
              ? 'Saving…'
              : mode === 'create'
                ? 'Register Collaborator'
                : 'Save Profile'
          }
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

export default CollaboratorFormDrawer;
