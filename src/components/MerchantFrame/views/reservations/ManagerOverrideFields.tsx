// Manager's override block: their credentials (not those of the logged-in user) authorize forcing a full slot. The server verifies them, requires that they be an active MERCHANT_ADMIN from the same location, and records who authorized it; it never saves them.

import React from 'react';
import { overrideErrors, type ManagerOverride } from '../../../../lib/reservation-capacity';

interface ManagerOverrideFieldsProps {
  value: ManagerOverride;
  onChange: (next: ManagerOverride) => void;
  /** Why it's needed (the alert of the slot or the message of the 409). */
  reason: string;
  showErrors: boolean;
  idPrefix: string;
}

const fieldClass =
  'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md font-sans outline-none w-full focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors duration-200';

export const ManagerOverrideFields: React.FC<ManagerOverrideFieldsProps> = ({
  value,
  onChange,
  reason,
  showErrors,
  idPrefix,
}) => {
  const errors = overrideErrors(value);
  return (
    <fieldset
      data-testid="manager-override"
      className="flex flex-col gap-3 p-3 rounded border border-[#ef4444]/40 bg-[#ef4444]/5 font-sans"
    >
      <legend className="sr-only">Manager override</legend>
      <p className="text-body-sm text-[#b91c1c] flex items-start gap-2" role="alert">
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          event_busy
        </span>
        <span>{reason}</span>
      </p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1">
        <span className="material-symbols-outlined text-base text-[#ae001a]" aria-hidden="true">
          key
        </span>
        Manager override — a manager signs in to authorize this booking
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${idPrefix}-override-email`}
            className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider"
          >
            Manager email
          </label>
          <input
            id={`${idPrefix}-override-email`}
            type="email"
            autoComplete="off"
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            className={fieldClass}
          />
          {showErrors && errors.email ? (
            <span className="text-body-sm text-[#b91c1c]">{errors.email}</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${idPrefix}-override-password`}
            className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider"
          >
            Manager password
          </label>
          <input
            id={`${idPrefix}-override-password`}
            type="password"
            autoComplete="new-password"
            value={value.password}
            onChange={(e) => onChange({ ...value, password: e.target.value })}
            className={fieldClass}
          />
          {showErrors && errors.password ? (
            <span className="text-body-sm text-[#b91c1c]">{errors.password}</span>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
};

export default ManagerOverrideFields;
