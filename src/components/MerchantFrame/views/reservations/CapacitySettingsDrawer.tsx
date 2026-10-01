// Store capacity and flow adjustments: total capacity, slot size, arrival limit per slot, and service shifts. Only the manager (MERCHANT_ADMIN) saves; the server requires it again.

import React, { useEffect, useState } from 'react';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import {
  draftToSettingsPayload,
  hasSettingsErrors,
  settingsErrors,
  settingsToDraft,
  type CapacitySettings,
  type SettingsDraft,
} from '../../../../lib/reservation-capacity';
import { getCapacitySettings, updateCapacitySettings } from '../../../../api/reservations';
import { ApiError } from '../../../../lib/api-error';

interface CapacitySettingsDrawerProps {
  onCancel: () => void;
  onSaved: (settings: CapacitySettings) => void;
}

const fieldClass =
  'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md font-sans outline-none w-full focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:border-[#ae001a] transition-colors duration-200';
const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider font-sans';

export const CapacitySettingsDrawer: React.FC<CapacitySettingsDrawerProps> = ({
  onCancel,
  onSaved,
}) => {
  const [loaded, setLoaded] = useState<CapacitySettings | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  useModalDismiss(onCancel);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getCapacitySettings();
        if (cancelled) return;
        setLoaded(settings);
        setDraft(settingsToDraft(settings));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Failed to load the capacity settings.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const errors = draft ? settingsErrors(draft) : null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!draft || !errors || hasSettingsErrors(errors)) return;
    setSaving(true);
    setSaveError('');
    try {
      onSaved(await updateCapacitySettings(draftToSettingsPayload(draft)));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save the capacity settings.');
    } finally {
      setSaving(false);
    }
  };

  const updateShift = (index: number, patch: Partial<SettingsDraft['shifts'][number]>) =>
    draft &&
    setDraft({
      ...draft,
      shifts: draft.shifts.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });

  return (
    <AppModal
      title="Capacity & Shifts"
      subtitle="RESERVATION PACING"
      onClose={onCancel}
      closeDisabled={saving}
      size="2xl"
    >
      {loadError ? (
        <div className="p-6">
          <ModalFormError message={loadError} />
        </div>
      ) : !draft || !errors || !loaded ? (
        <div className="p-6">
          <div className="h-32 bg-[#ece8e0] rounded animate-pulse" aria-label="Loading settings" />
        </div>
      ) : (
        <form noValidate onSubmit={(e) => void save(e)} className="p-6 flex flex-col gap-5 font-sans">
          <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
            <legend className="sr-only">Capacity and pacing</legend>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cap-seats" className={`${labelClass} flex items-center gap-1`}>
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  group
                </span>
                Total seat capacity
              </label>
              <input
                id="cap-seats"
                inputMode="numeric"
                value={draft.seatCapacity}
                placeholder={
                  loaded.capacity_source === 'tables'
                    ? `${loaded.effective_seat_capacity} (from tables)`
                    : 'From active tables'
                }
                onChange={(e) => setDraft({ ...draft, seatCapacity: e.target.value })}
                className={fieldClass}
              />
              <span className="text-body-sm text-[#5f5e5e]">
                Leave empty to use the seats of your active tables.
              </span>
              {touched && errors.seatCapacity ? (
                <span className="text-body-sm text-[#b91c1c]" role="alert">
                  {errors.seatCapacity}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cap-interval" className={labelClass}>
                Slot interval
              </label>
              <select
                id="cap-interval"
                value={draft.slotInterval}
                onChange={(e) =>
                  setDraft({ ...draft, slotInterval: e.target.value === '30' ? '30' : '15' })
                }
                className={fieldClass}
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cap-throttle" className={labelClass}>
                Max guests arriving per slot
              </label>
              <input
                id="cap-throttle"
                inputMode="numeric"
                value={draft.maxCoversPerSlot}
                placeholder="No limit"
                onChange={(e) => setDraft({ ...draft, maxCoversPerSlot: e.target.value })}
                className={fieldClass}
              />
              <span className="text-body-sm text-[#5f5e5e]">
                Paces arrivals so the door and kitchen are not flooded at one time.
              </span>
              {touched && errors.maxCoversPerSlot ? (
                <span className="text-body-sm text-[#b91c1c]" role="alert">
                  {errors.maxCoversPerSlot}
                </span>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-[#e8e2d8] pt-4">
            <legend className={`${labelClass} flex items-center gap-1`}>
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                schedule
              </span>
              Service shifts
            </legend>
            {draft.shifts.map((shift, index) => (
              <div
                key={index}
                data-testid={`shift-row-${index}`}
                className="grid grid-cols-[minmax(120px,2fr)_minmax(90px,1fr)_minmax(90px,1fr)_auto] gap-2 items-start"
              >
                <input
                  aria-label={`Shift ${index + 1} name`}
                  value={shift.name}
                  onChange={(e) => updateShift(index, { name: e.target.value })}
                  className={fieldClass}
                />
                <input
                  aria-label={`Shift ${index + 1} start`}
                  type="time"
                  value={shift.start}
                  onChange={(e) => updateShift(index, { start: e.target.value })}
                  className={fieldClass}
                />
                <input
                  aria-label={`Shift ${index + 1} end`}
                  type="time"
                  value={shift.end}
                  onChange={(e) => updateShift(index, { end: e.target.value })}
                  className={fieldClass}
                />
                <button
                  type="button"
                  aria-label={`Remove shift ${index + 1}`}
                  disabled={draft.shifts.length === 1}
                  onClick={() =>
                    setDraft({ ...draft, shifts: draft.shifts.filter((_, i) => i !== index) })
                  }
                  className="px-2 py-2 text-[#5f5e5e] hover:text-primary transition-colors duration-200 disabled:opacity-40 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    delete
                  </span>
                </button>
                {touched && errors.shifts[index] ? (
                  <span className="col-span-full text-body-sm text-[#b91c1c]" role="alert">
                    {errors.shifts[index]}
                  </span>
                ) : null}
              </div>
            ))}
            <p className="text-body-sm text-[#5f5e5e]">
              An end earlier than the start crosses midnight (e.g. 22:00–01:00).
            </p>
            {errors.form ? (
              <span className="text-body-sm text-[#b91c1c]" role="alert">
                {errors.form}
              </span>
            ) : null}
            <button
              type="button"
              disabled={draft.shifts.length >= 6}
              onClick={() =>
                setDraft({
                  ...draft,
                  shifts: [...draft.shifts, { name: '', start: '12:00', end: '16:00' }],
                })
              }
              className="self-start px-3 py-1.5 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-wider rounded hover:text-primary hover:border-[#ae001a] transition-colors duration-200 disabled:opacity-40 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                add
              </span>
              Add shift
            </button>
          </fieldset>

          {saveError ? <ModalFormError message={saveError} /> : null}
          <ModalFormFooter
            onCancel={onCancel}
            submitLabel={saving ? 'Saving…' : 'Save settings'}
            isSubmitting={saving}
            submitDisabled={saving || (touched && hasSettingsErrors(errors))}
          />
        </form>
      )}
    </AppModal>
  );
};

export default CapacitySettingsDrawer;
