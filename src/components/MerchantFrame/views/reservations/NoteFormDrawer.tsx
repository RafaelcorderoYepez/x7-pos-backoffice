// Quick entry of reservation notes.

// It's designed for easy communication with the customer on the phone: quick tags add the standard prefix with a single tap, and the preview shows how the note will appear on the ticket before saving it—because an allergy that isn't noticed in time is the only flaw in this module that truly causes problems.

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Reservation, ReservationNote } from '../../../../types/reservation';
import {
  NOTE_CATEGORY_ICONS,
  NOTE_CATEGORY_LABELS,
  NOTE_CATEGORY_PILL_STYLES,
  NOTE_CATEGORY_STYLES,
  QUICK_TAGS,
  applyQuickTag,
  categoryOf,
  isPriorityNote,
  noteTextError,
} from '../../../../lib/reservation-notes';
import { clockTime, reservationCode } from '../../../../lib/reservations';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';

interface NoteFormDrawerProps {
  /** Reservations to which the note can be attached (those of the current day). */
  reservations: Reservation[];
  /** Pre-selected reservation when opening from a specific card. */
  initialReservationId?: number;
  /** Existing note when the drawer edits instead of creating. */
  initial?: ReservationNote;
  guestNameOf: (reservation: Reservation) => string;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (reservationId: number, note: string) => void;
}

const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider';

export const NoteFormDrawer: React.FC<NoteFormDrawerProps> = ({
  reservations,
  initialReservationId,
  initial,
  guestNameOf,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const isEdit = Boolean(initial);
  const [reservationId, setReservationId] = useState<string>(
    String(initial?.reservation_id ?? initialReservationId ?? reservations[0]?.id ?? ''),
  );
  const [text, setText] = useState(initial?.note ?? '');
  const [touched, setTouched] = useState(false);

  useModalDismiss(onCancel);

  const textError = noteTextError(text);
  const linkError = reservationId ? '' : 'Pick the reservation this note belongs to';
  const blocked = Boolean(textError) || Boolean(linkError) || submitting;

  const category = useMemo(() => categoryOf({ note: text }), [text]);
  const priority = useMemo(() => isPriorityNote({ note: text }), [text]);

// The textarea is referenced to return focus after inserting a label: the host presses the chip and continues typing without touching the mouse again.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const caretToEndRef = useRef(false);

  const insertTag = (tag: (typeof QUICK_TAGS)[number]) => {
    caretToEndRef.current = true;
    setText(applyQuickTag(text, tag));
  };

/**
* Moves the cursor to the end AFTER inserting a tag.
*
* With `requestAnimationFrame` this corrupted the note: the callback was programmed with the
length of the text at the time of the click and executed one frame later, when the
host had already started typing — it returned the cursor to the end of the PREFIX and the
rest of the sentence was inserted there. A real note came out as
* "[OCCASION] rthday cake at 21:30 Surprise bi".
*
* `useLayoutEffect` runs synchronously after confirming the DOM and before rendering, so
there's no space to type in between, and the position is read from the CURRENT value.
*/
  useLayoutEffect(() => {
    if (!caretToEndRef.current) return;
    caretToEndRef.current = false;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [text]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (blocked) return;
    onSubmit(Number(reservationId), text);
  };

  const selected = reservations.find((r) => String(r.id) === reservationId);

  return (
    <AppModal
      title={isEdit ? 'Edit note' : 'Add reservation note'}
      subtitle="RESERVATION NOTES"
      onClose={onCancel}
      closeDisabled={submitting}
      size="2xl"
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        className="p-6 flex flex-col gap-5 overflow-y-auto font-sans"
      >
        {formError ? <ModalFormError message={formError} /> : null}

        {/* ---------- Destination booking ---------- */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="note-reservation" className={labelClass}>
            Reservation
          </label>
          <select
            id="note-reservation"
            value={reservationId}
            disabled={isEdit}
            onChange={(e) => setReservationId(e.target.value)}
            className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md outline-none w-full focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors duration-200 disabled:opacity-60"
          >
            {reservations.length === 0 ? <option value="">No booking in the book today</option> : null}
            {reservations.map((reservation) => (
              <option key={reservation.id} value={reservation.id}>
                {reservationCode(reservation.id)} · {clockTime(reservation.reservation_date)} ·{' '}
                {guestNameOf(reservation)} (party of {reservation.party_size})
              </option>
            ))}
          </select>
          {isEdit ? (
            <p className="text-body-sm text-[#5f5e5e]">
              A note stays with the booking it was written for — create a new one to move it.
            </p>
          ) : null}
          {touched && linkError ? (
            <p className="text-body-sm text-error" role="alert">
              {linkError}
            </p>
          ) : null}
        </div>

        {/* ---------- Quick tags ---------- */}
        <div className="flex flex-col gap-2">
          <span className={labelClass}>Quick tags</span>
          <div className="flex flex-wrap gap-2">
            {QUICK_TAGS.map((tag) => {
              const applied = text.trimStart().toUpperCase().startsWith(tag.prefix);
              return (
                <button
                  key={tag.prefix}
                  type="button"
                  onClick={() => insertTag(tag)}
                  aria-pressed={applied}
                  className={`px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border transition-colors duration-200 cursor-pointer ${
                    applied
                      ? 'bg-[#ae001a] text-white border-[#ae001a]'
                      : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    {tag.icon}
                  </span>
                  {tag.label}
                </button>
              );
            })}
          </div>
          <p className="text-body-sm text-[#5f5e5e]">
            A tag replaces the previous one — a note belongs to one category.
          </p>
        </div>

        {/* ---------- Body ---------- */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="note-body" className={labelClass}>
            Note
          </label>
          <textarea
            id="note-body"
            ref={textareaRef}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={QUICK_TAGS[0].placeholder}
            aria-invalid={Boolean(touched && textError)}
            className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md outline-none w-full focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors duration-200 resize-y"
          />
          {touched && textError ? (
            <p className="text-body-sm text-error" role="alert">
              {textError}
            </p>
          ) : null}
        </div>

        {/* ---------- Preview of the highlight ---------- */}
        {text.trim() ? (
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Preview on the service screens</span>
            <div
              data-testid="note-preview"
              className={`p-3 rounded ${NOTE_CATEGORY_STYLES[category]}`}
            >
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${NOTE_CATEGORY_PILL_STYLES[category]}`}
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  {NOTE_CATEGORY_ICONS[category]}
                </span>
                {NOTE_CATEGORY_LABELS[category]}
                {priority ? ' · priority' : ''}
              </span>
              <p className="mt-2 text-body-md whitespace-pre-wrap break-words">{text}</p>
            </div>
            {priority ? (
              <p className="text-body-sm text-[#b91c1c] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  priority_high
                </span>
                This note will be flagged to the kitchen and floor teams.
              </p>
            ) : null}
          </div>
        ) : null}

        {selected?.special_requests?.trim() ? (
          <p className="text-body-sm text-[#5f5e5e] border-t border-[#e8e2d8] pt-3">
            <span className="font-semibold">Booking request on file:</span>{' '}
            {selected.special_requests}
          </p>
        ) : null}

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : isEdit ? 'Save note' : 'Add note'}
          isSubmitting={submitting}
        />
      </form>
    </AppModal>
  );
};

export default NoteFormDrawer;
