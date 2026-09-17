// Alta y edición de un miembro del roster.
//
// La decisión que gobierna el formulario es el interruptor de contacto principal: activarlo
// degrada al principal anterior de esa reserva, y eso lo hace el SERVIDOR dentro de la misma
// transacción. El drawer se limita a avisar de a quién va a desplazar, porque una anfitriona
// que cambia el contacto de una mesa tiene que saber a quién deja de llamar el local.

import React, { useMemo, useState } from 'react';
import type { Reservation, ReservationGuest } from '../../../../types/reservation';
import {
  GUEST_EMAIL_MAX,
  GUEST_NAME_MAX,
  GUEST_PHONE_MAX,
  activeGuests,
  guestCode,
  guestEmailError,
  guestNameError,
  guestPhoneError,
  nextCompanionName,
  primaryGuest,
  rosterCount,
  rosterCountLabel,
} from '../../../../lib/reservation-guests';
import { clockTime, reservationCode } from '../../../../lib/reservations';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';

export interface GuestSubmitPayload {
  reservationId: number;
  name: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

interface GuestFormDrawerProps {
  reservations: Reservation[];
  /** Ficha existente cuando el drawer edita en vez de dar de alta. */
  initial?: ReservationGuest;
  initialReservationId?: number;
  guestNameOf: (reservation: Reservation) => string;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (payload: GuestSubmitPayload) => void;
  /** Alta rápida de acompañantes genéricos sin cerrar el drawer. */
  onQuickAdd?: (reservationId: number, name: string) => void;
  quickAdding?: boolean;
}

const fieldClass =
  'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md outline-none w-full focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors duration-200';
const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider';

export const GuestFormDrawer: React.FC<GuestFormDrawerProps> = ({
  reservations,
  initial,
  initialReservationId,
  guestNameOf,
  submitting,
  formError,
  onCancel,
  onSubmit,
  onQuickAdd,
  quickAdding = false,
}) => {
  const isEdit = Boolean(initial);
  const [reservationId, setReservationId] = useState<string>(
    String(initial?.reservation_id ?? initialReservationId ?? reservations[0]?.id ?? ''),
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [isPrimary, setIsPrimary] = useState(initial?.is_primary ?? false);
  const [touched, setTouched] = useState(false);

  useModalDismiss(onCancel);

  const selected = reservations.find((r) => String(r.id) === reservationId) ?? null;
  const roster = useMemo(() => activeGuests(selected?.guests ?? []), [selected]);
  const currentPrimary = useMemo(() => primaryGuest(roster), [roster]);

  // El recuento cuenta la ficha que se está creando: enseñar "3 de 4" mientras se teclea la
  // cuarta es lo que le dice a la anfitriona que ya puede parar.
  const count = useMemo(
    () => rosterCount(roster, selected?.party_size ?? 0),
    [roster, selected],
  );
  const projected = isEdit ? count.registered : count.registered + (name.trim() ? 1 : 0);

  const nameError = guestNameError(name);
  const emailError = guestEmailError(email);
  const phoneError = guestPhoneError(phone);
  const linkError = reservationId ? '' : 'Pick the reservation this guest belongs to';

  const blocked =
    Boolean(nameError) ||
    Boolean(emailError) ||
    Boolean(phoneError) ||
    Boolean(linkError) ||
    submitting;

  // A quién desplaza el interruptor. Nulo cuando no hay principal todavía, o cuando el que se
  // está editando YA es el principal.
  const displaced =
    isPrimary && currentPrimary && currentPrimary.id !== initial?.id ? currentPrimary : null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (blocked) return;
    onSubmit({
      reservationId: Number(reservationId),
      name,
      email,
      phone,
      isPrimary,
    });
  };

  return (
    <AppModal
      title={isEdit ? `Edit ${initial?.name}` : 'Add guest to roster'}
      subtitle={isEdit ? guestCode(initial!.id) : 'GUEST ROSTER'}
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

        {/* ---------- Reserva padre ---------- */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="guest-reservation" className={labelClass}>
            Reservation
          </label>
          <select
            id="guest-reservation"
            value={reservationId}
            disabled={isEdit}
            onChange={(e) => setReservationId(e.target.value)}
            className={`${fieldClass} disabled:opacity-60`}
          >
            {reservations.length === 0 ? (
              <option value="">No booking in the book today</option>
            ) : null}
            {reservations.map((reservation) => (
              <option key={reservation.id} value={reservation.id}>
                {reservationCode(reservation.id)} · {clockTime(reservation.reservation_date)} ·{' '}
                {guestNameOf(reservation)} (party of {reservation.party_size})
              </option>
            ))}
          </select>
          {isEdit ? (
            <p className="text-body-sm text-[#5f5e5e]">
              A guest stays on the booking they were registered for.
            </p>
          ) : null}
          {touched && linkError ? (
            <p className="text-body-sm text-error" role="alert">
              {linkError}
            </p>
          ) : null}
        </div>

        {/* ---------- Recuento frente al tamaño del grupo ---------- */}
        {selected ? (
          <div
            data-testid="roster-counter"
            role="status"
            className={`p-3 rounded border flex flex-wrap items-center gap-2 text-body-sm ${
              projected >= count.partySize
                ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#047857]'
                : 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#92400e]'
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {projected >= count.partySize ? 'how_to_reg' : 'group_add'}
            </span>
            <span className="font-medium">
              {rosterCountLabel({ ...count, registered: projected })}
            </span>
            {projected > count.partySize ? (
              <span>— more guests than the booked party size</span>
            ) : null}
            {onQuickAdd && !isEdit && projected < count.partySize ? (
              <button
                type="button"
                disabled={quickAdding}
                onClick={() => onQuickAdd(Number(reservationId), nextCompanionName(roster))}
                className="ml-auto px-3 py-1 rounded border border-current text-[11px] font-bold uppercase tracking-wider hover:bg-white transition-colors duration-200 disabled:opacity-50 cursor-pointer"
              >
                {quickAdding ? 'Adding…' : `Quick add "${nextCompanionName(roster)}"`}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* ---------- Identidad y contacto ---------- */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest-name" className={labelClass}>
              Guest name *
            </label>
            <input
              id="guest-name"
              type="text"
              maxLength={GUEST_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Carlos Mendoza"
              aria-invalid={Boolean(touched && nameError)}
              className={fieldClass}
            />
            {touched && nameError ? (
              <p className="text-body-sm text-error" role="alert">
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest-phone" className={labelClass}>
              Phone
            </label>
            <input
              id="guest-phone"
              type="tel"
              maxLength={GUEST_PHONE_MAX}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34600123456"
              aria-invalid={Boolean(phoneError)}
              className={fieldClass}
            />
            {phoneError ? (
              <p className="text-body-sm text-error" role="alert">
                {phoneError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest-email" className={labelClass}>
              Email
            </label>
            <input
              id="guest-email"
              type="email"
              maxLength={GUEST_EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="carlos@example.com"
              aria-invalid={Boolean(emailError)}
              className={fieldClass}
            />
            {emailError ? (
              <p className="text-body-sm text-error" role="alert">
                {emailError}
              </p>
            ) : null}
          </div>
        </div>

        {/* ---------- Contacto principal ---------- */}
        <div className="flex flex-col gap-2 border-t border-[#e8e2d8] pt-4">
          <label className="inline-flex items-center gap-3 cursor-pointer group w-fit">
            <input
              type="checkbox"
              role="switch"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="accent-[#ae001a] w-4 h-4"
            />
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] group-hover:text-[#ae001a] transition-colors duration-200">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                star
              </span>
              Primary contact for this booking
            </span>
          </label>

          {displaced ? (
            <p
              data-testid="primary-handover"
              className="text-body-sm text-[#92400e] bg-[#f59e0b]/10 border border-[#f59e0b]/40 rounded p-2 flex items-start gap-2"
            >
              <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">
                swap_horiz
              </span>
              <span>
                {displaced.name} is the primary contact right now — saving this will move that
                badge over, and the house will call this guest instead.
              </span>
            </p>
          ) : null}

          {!isPrimary && roster.length === 0 && !isEdit ? (
            <p className="text-body-sm text-[#5f5e5e]">
              First guest on the booking — they become the primary contact automatically.
            </p>
          ) : null}
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : isEdit ? 'Save guest' : 'Add guest'}
          isSubmitting={submitting}
        />
      </form>
    </AppModal>
  );
};

export default GuestFormDrawer;
