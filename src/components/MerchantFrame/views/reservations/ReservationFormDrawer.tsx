// Alta rápida de reserva: el drawer que la anfitriona rellena con el cliente al teléfono.
//
// Dos decisiones que condicionan todo el formulario:
//
// 1. El cliente NO es obligatorio. El CRM (`POST /api/customers`) exige rut, dirección,
//    ciudad, provincia y país — datos que nadie dicta por teléfono para reservar una mesa.
//    Por eso el camino por defecto es el "invitado ligero" (un reservation_guest con nombre y
//    contacto, que es literalmente lo que pide el criterio de aceptación), y la ficha completa
//    del CRM queda como una opción explícita para quien sí tiene los datos delante.
// 2. El aviso de aforo NO bloquea. Es un aviso para una persona que puede sacar mesas a la
//    terraza o juntar dos de cuatro; convertirlo en un error impediría reservas legítimas.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomerRef, ReservationDraft } from '../../../../types/reservation';
import {
  DEFAULT_DURATION_MINUTES,
  RESERVATION_SOURCES,
  RESERVATION_SOURCE_ICONS,
  RESERVATION_SOURCE_LABELS,
} from '../../../../types/reservation';
import {
  composeReservationDate,
  durationError,
  partySizeError,
  reservationDateError,
  searchCustomers,
  todayIsoDate,
} from '../../../../lib/reservations';
import {
  guestEmailError,
  guestNameError,
  guestPhoneError,
} from '../../../../lib/reservation-guests';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import {
  findSlot,
  hasOverrideErrors,
  slotSummary,
  type DayAvailability,
  type ManagerOverride,
} from '../../../../lib/reservation-capacity';
import { getAvailability } from '../../../../api/reservations';
import { ApiError } from '../../../../lib/api-error';
import { SlotAvailabilityMatrix } from './SlotAvailabilityMatrix';
import { ManagerOverrideFields } from './ManagerOverrideFields';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';

// Contacto ligero que se adjunta a la reserva cuando no hay ficha de CRM detrás.
export interface GuestContactDraft {
  name: string;
  email: string;
  phone: string;
}

// Ficha completa del CRM, con los cinco campos que el DTO exige además del correo.
export interface NewCustomerDraft {
  name: string;
  email: string;
  phone: string;
  rut: string;
  address: string;
  city: string;
  state: string;
  country: string;
}

export interface ReservationSubmitPayload {
  draft: ReservationDraft;
  /** Contacto suelto a colgar de la reserva recién creada. */
  guest: GuestContactDraft | null;
  /** Ficha de CRM a crear antes de la reserva, para enlazar su customer_id. */
  newCustomer: NewCustomerDraft | null;
}

interface ReservationFormDrawerProps {
  customers: CustomerRef[];
  /** Motivo por el que el directorio de clientes está vacío, si la carga falló. */
  customersError?: string;
  /**
   * Mensaje del último 409 CAPACITY_OVERRIDE_REQUIRED del servidor, si el guardado chocó con
   * el aforo (p. ej. otra anfitriona ocupó la franja entre que se pintó la matriz y se pulsó
   * guardar). Mientras exista, el drawer pide el override del encargado.
   */
  capacityConflict?: { key: string; message: string } | null;
  /** Día que el workspace tiene abierto: el drawer arranca ahí, no en "hoy". */
  defaultDate: string;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (payload: ReservationSubmitPayload) => void;
}

type LinkMode = 'guest' | 'existing' | 'new-customer';

const EMPTY_CUSTOMER: NewCustomerDraft = {
  name: '',
  email: '',
  phone: '',
  rut: '',
  address: '',
  city: '',
  state: '',
  country: '',
};

const fieldClass =
  'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md outline-none w-full focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors duration-200';

const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider font-sans';

export const ReservationFormDrawer: React.FC<ReservationFormDrawerProps> = ({
  customers,
  customersError = '',
  capacityConflict = null,
  defaultDate,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [date, setDate] = useState(defaultDate || todayIsoDate());
  // La hora sale de la matriz de franjas de los turnos, no de un campo libre: arranca vacía
  // hasta que la anfitriona pulsa una franja.
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [duration, setDuration] = useState(String(DEFAULT_DURATION_MINUTES));
  const [source, setSource] = useState<string>('phone');
  const [specialRequests, setSpecialRequests] = useState('');

  const [linkMode, setLinkMode] = useState<LinkMode>('guest');
  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRef | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [guest, setGuest] = useState<GuestContactDraft>({ name: '', email: '', phone: '' });
  const [newCustomer, setNewCustomer] = useState<NewCustomerDraft>(EMPTY_CUSTOMER);
  const [override, setOverride] = useState<ManagerOverride>({ email: '', password: '' });
  // Último resultado de disponibilidad, etiquetado con la consulta que lo produjo: si la
  // anfitriona cambia día, grupo o duración, el resultado viejo deja de valer solo (sin un
  // efecto que lo borre) y la matriz se muestra cargando hasta que llega el nuevo.
  const [availabilityResult, setAvailabilityResult] = useState<{
    key: string;
    data: DayAvailability | null;
    error: string;
  } | null>(null);
  const [touched, setTouched] = useState(false);

  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useModalDismiss(onCancel);

  // Un clic fuera cierra el desplegable de sugerencias sin cerrar el drawer entero.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) setSuggestionsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Sin hora todavía sólo se valida el día; la falta de franja la explica `timeError`.
  const dateError = time ? reservationDateError(date, time) : date ? '' : 'Reservation date is required';
  const partyError = partySizeError(partySize);
  const durError = durationError(duration);

  const suggestions = useMemo(
    () => searchCustomers(customers, customerQuery),
    [customers, customerQuery],
  );

  // Búsqueda sin resultados con algo escrito: es el momento de ofrecer crear la ficha.
  const noMatches = customerQuery.trim().length >= 2 && suggestions.length === 0;

  // Disponibilidad en vivo: el servidor evalúa cada franja del día para ESTE grupo y esta
  // duración, así el semáforo aparece ANTES de pulsar guardar y no como un error posterior.
  // Espera un instante a que se deje de teclear el tamaño del grupo.
  const availabilityKey =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && !partyError && !durError
      ? `${date}|${partySize}|${duration}`
      : '';
  useEffect(() => {
    if (!availabilityKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await getAvailability({
            date,
            partySize: Number(partySize),
            durationMinutes: Number(duration),
          });
          if (!cancelled) setAvailabilityResult({ key: availabilityKey, data, error: '' });
        } catch (err) {
          if (cancelled) return;
          setAvailabilityResult({
            key: availabilityKey,
            data: null,
            error:
              err instanceof ApiError
                ? err.message
                : 'Slot availability could not be loaded; capacity is still checked on save.',
          });
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [availabilityKey, date, partySize, duration]);

  const currentResult =
    availabilityResult && availabilityResult.key === availabilityKey ? availabilityResult : null;
  const availability = currentResult?.data ?? null;
  const selectedSlot = findSlot(availability, time);
  // Si la disponibilidad no carga, la matriz no puede pintarse y la reserva quedaría
  // imposible: sólo entonces se ofrece un campo de hora de respaldo (el servidor sigue
  // comprobando el aforo al guardar).
  const availabilityFailed = Boolean(currentResult?.error);
  // Una franja elegida deja de valer si el nuevo día, grupo o duración ya no la incluye.
  const slotPicked = availabilityFailed ? Boolean(time) : Boolean(selectedSlot);
  const timeError = slotPicked
    ? ''
    : availabilityFailed
      ? 'Reservation time is required'
      : 'Pick a time slot from the service shifts';

  // Franja llena para este grupo (o el servidor acaba de rechazar el guardado por aforo):
  // sin las credenciales del encargado no se puede reservar.
  const slotNeedsOverride = Boolean(selectedSlot && !selectedSlot.bookable);
  // El 409 del servidor sólo aplica a la franja que lo provocó (misma clave que construye el
  // padre con el borrador enviado).
  const slotKey = dateError || !time
    ? ''
    : `${composeReservationDate(date, time)}|${Number(partySize)}|${Number(duration)}`;
  const serverConflict = capacityConflict && capacityConflict.key === slotKey ? capacityConflict.message : '';
  const needsOverride = slotNeedsOverride || Boolean(serverConflict);
  const overrideReason = serverConflict
    ? serverConflict
    : selectedSlot && availability
      ? slotSummary(
          selectedSlot,
          availability.seat_capacity,
          availability.party_size,
          availability.max_covers_per_slot,
        )
      : '';

  // El contacto del invitado se valida con las MISMAS reglas que el DTO del backend
  // (@IsPhoneNumber sin región, @IsEmail, varchar(100)/varchar(20)). Se comprueba antes de
  // enviar porque el invitado se cuelga DESPUÉS de crear la reserva: un 400 a esas alturas
  // deja la mesa reservada y el contacto perdido.
  const guestErrors =
    linkMode === 'guest'
      ? {
          // El nombre puede quedar vacío: es la reserva anónima que el propio texto de
          // ayuda del formulario ofrece.
          name: guestNameError(guest.name, { required: false }),
          phone: guestPhoneError(guest.phone),
          email: guestEmailError(guest.email),
        }
      : { name: '', phone: '', email: '' };
  const guestHasError = Boolean(guestErrors.name || guestErrors.phone || guestErrors.email);

  const newCustomerMissing =
    linkMode === 'new-customer' &&
    (['name', 'email', 'rut', 'address', 'city', 'state', 'country'] as const).some(
      (k) => !newCustomer[k].trim(),
    );

  const linkError =
    linkMode === 'existing' && !selectedCustomer ? 'Pick a customer from the directory' : '';

  const blocked =
    Boolean(dateError) ||
    Boolean(timeError) ||
    Boolean(partyError) ||
    Boolean(durError) ||
    guestHasError ||
    Boolean(linkError) ||
    newCustomerMissing ||
    (needsOverride && hasOverrideErrors(override)) ||
    submitting;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (blocked) return;

    const draft: ReservationDraft = {
      reservation_date: composeReservationDate(date, time),
      party_size: Number(partySize),
      duration_minutes: Number(duration),
      source,
      special_requests: specialRequests,
    };
    if (linkMode === 'existing' && selectedCustomer) draft.customer_id = selectedCustomer.id;
    if (needsOverride) draft.manager_override = { ...override };

    onSubmit({
      draft,
      guest: linkMode === 'guest' && guest.name.trim() ? { ...guest } : null,
      newCustomer: linkMode === 'new-customer' ? { ...newCustomer } : null,
    });
  };

  const pickCustomer = (customer: CustomerRef) => {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.name);
    setSuggestionsOpen(false);
    setLinkMode('existing');
  };

  return (
    <AppModal
      title="New Reservation"
      subtitle="RESERVATION BOOK"
      onClose={onCancel}
      closeDisabled={submitting}
      size="2xl"
    >
      {/* `noValidate`: la validación del navegador se desactiva a propósito. Con ella, un
          tamaño de grupo de 0 bloquea el envío en silencio y el mensaje que explica por qué
          nunca llega a pintarse — además de que `step` descarta valores perfectamente
          legítimos. Las reglas viven en src/lib/reservations.ts, que es lo que se testea. */}
      <form
        noValidate
        onSubmit={handleSubmit}
        className="p-6 flex flex-col gap-5 overflow-y-auto font-sans"
      >
        {formError ? <ModalFormError message={formError} /> : null}

        {/* ---------- Franja horaria y tamaño del grupo ---------- */}
        <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-4">
          <legend className="sr-only">Booking slot</legend>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="res-date" className={labelClass}>
              Date
            </label>
            <input
              id="res-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="res-party" className={labelClass}>
              Party size
            </label>
            <input
              id="res-party"
              type="number"
              min={1}
              step={1}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              aria-invalid={Boolean(touched && partyError)}
              className={fieldClass}
              required
            />
            {partyError ? (
              <p className="text-body-sm text-error" role="alert">
                {partyError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="res-duration" className={labelClass}>
              Duration (min)
            </label>
            <input
              id="res-duration"
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              aria-invalid={Boolean(touched && durError)}
              className={fieldClass}
              required
            />
            {durError ? (
              <p className="text-body-sm text-error" role="alert">
                {durError}
              </p>
            ) : null}
          </div>
        </fieldset>

        {dateError ? (
          <p className="text-body-sm text-error" role="alert">
            {dateError}
          </p>
        ) : null}

        {/* ---------- Aforo de la franja ---------- */}
        <SlotAvailabilityMatrix
          availability={availability}
          loading={Boolean(availabilityKey) && !currentResult}
          error={currentResult?.error ?? ''}
          selectedTime={time}
          onSelect={setTime}
        />
        {availabilityFailed ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="res-time" className={labelClass}>
              Time
            </label>
            <input
              id="res-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
        ) : null}
        {availability && availability.shifts.length === 0 ? (
          <p className="text-body-sm text-[#5f5e5e]" role="status">
            No service shifts are configured for this day.
          </p>
        ) : null}
        {/* El botón de guardar queda desactivado sin franja: este aviso explica por qué. */}
        {timeError && (availability || availabilityFailed) ? (
          <p className="text-body-sm text-[#5f5e5e] flex items-center gap-1" role="status">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              schedule
            </span>
            {timeError}
          </p>
        ) : null}
        {needsOverride ? (
          <ManagerOverrideFields
            value={override}
            onChange={setOverride}
            reason={overrideReason}
            showErrors={touched}
            idPrefix="res"
          />
        ) : null}

        {/* ---------- Vínculo con el cliente ---------- */}
        <fieldset className="flex flex-col gap-3 border-t border-[#e8e2d8] pt-4">
          <legend className={labelClass}>Customer</legend>

          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Customer linking mode">
            {(
              [
                { id: 'guest', label: 'Guest contact only', icon: 'person' },
                { id: 'existing', label: 'Link CRM profile', icon: 'badge' },
                { id: 'new-customer', label: 'New CRM profile', icon: 'person_add' },
              ] as Array<{ id: LinkMode; label: string; icon: string }>
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={linkMode === option.id}
                onClick={() => setLinkMode(option.id)}
                className={`px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border transition-colors duration-200 cursor-pointer ${
                  linkMode === option.id
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
                }`}
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  {option.icon}
                </span>
                {option.label}
              </button>
            ))}
          </div>

          {linkMode === 'existing' ? (
            <div className="flex flex-col gap-1.5" ref={searchBoxRef}>
              <label htmlFor="res-customer" className={labelClass}>
                Search by name, phone or email
              </label>
              <div className="relative">
                <span
                  className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-lg"
                  aria-hidden="true"
                >
                  search
                </span>
                <input
                  id="res-customer"
                  type="text"
                  value={customerQuery}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={suggestionsOpen && suggestions.length > 0}
                  aria-controls="res-customer-suggestions"
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    setSelectedCustomer(null);
                    setSuggestionsOpen(true);
                  }}
                  onFocus={() => setSuggestionsOpen(true)}
                  placeholder="Start typing to search the CRM…"
                  className={`${fieldClass} pl-10`}
                />
              </div>

              {suggestionsOpen && suggestions.length > 0 ? (
                <ul
                  id="res-customer-suggestions"
                  role="listbox"
                  className="border border-[#e8e2d8] rounded bg-white divide-y divide-[#f2ede5] max-h-52 overflow-y-auto shadow-sm"
                >
                  {suggestions.map((customer) => (
                    <li key={customer.id} role="option" aria-selected={selectedCustomer?.id === customer.id}>
                      <button
                        type="button"
                        onClick={() => pickCustomer(customer)}
                        className="w-full text-left px-3 py-2 hover:bg-[#f8f3eb] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                      >
                        <span className="block text-body-md font-semibold">{customer.name}</span>
                        <span className="block text-body-sm text-[#5f5e5e]">
                          {[customer.phone, customer.email].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {selectedCustomer ? (
                <p className="text-body-sm text-[#047857] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    check_circle
                  </span>
                  Linked to {selectedCustomer.name} (customer #{selectedCustomer.id})
                </p>
              ) : null}

              {noMatches ? (
                <p className="text-body-sm text-[#5f5e5e]">
                  No CRM profile matches “{customerQuery}”.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setLinkMode('new-customer');
                      setNewCustomer((prev) => ({ ...prev, name: customerQuery }));
                    }}
                    className="text-[#ae001a] font-semibold hover:underline"
                  >
                    Create the profile
                  </button>{' '}
                  or{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setLinkMode('guest');
                      setGuest((prev) => ({ ...prev, name: customerQuery }));
                    }}
                    className="text-[#ae001a] font-semibold hover:underline"
                  >
                    book as a guest
                  </button>
                  .
                </p>
              ) : null}

              {customersError ? (
                <p className="text-body-sm text-[#5f5e5e]">{customersError}</p>
              ) : null}
              {touched && linkError ? (
                <p className="text-body-sm text-error" role="alert">
                  {linkError}
                </p>
              ) : null}
            </div>
          ) : null}

          {linkMode === 'guest' ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="guest-name" className={labelClass}>
                  Guest name
                </label>
                <input
                  id="guest-name"
                  type="text"
                  maxLength={100}
                  value={guest.name}
                  onChange={(e) => setGuest({ ...guest, name: e.target.value })}
                  placeholder="Who is the table under?"
                  className={fieldClass}
                />
                {guestErrors.name ? (
                  <p className="text-body-sm text-error" role="alert">
                    {guestErrors.name}
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
                  maxLength={20}
                  value={guest.phone}
                  onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                  placeholder="+34600123456"
                  aria-invalid={Boolean(guestErrors.phone)}
                  className={fieldClass}
                />
                {guestErrors.phone ? (
                  <p className="text-body-sm text-error" role="alert">
                    {guestErrors.phone}
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
                  maxLength={100}
                  value={guest.email}
                  onChange={(e) => setGuest({ ...guest, email: e.target.value })}
                  aria-invalid={Boolean(guestErrors.email)}
                  className={fieldClass}
                />
                {guestErrors.email ? (
                  <p className="text-body-sm text-error" role="alert">
                    {guestErrors.email}
                  </p>
                ) : null}
              </div>
              <p className="col-span-full text-body-sm text-[#5f5e5e]">
                Booked without a CRM profile — the contact is stored on the reservation's guest
                roster. Leave the name empty to book an anonymous hold.
              </p>
            </div>
          ) : null}

          {linkMode === 'new-customer' ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              {(
                [
                  { key: 'name', label: 'Full name', type: 'text', required: true },
                  { key: 'email', label: 'Email', type: 'email', required: true },
                  { key: 'phone', label: 'Phone', type: 'tel', required: false },
                  { key: 'rut', label: 'Tax ID / RUT', type: 'text', required: true },
                  { key: 'address', label: 'Address', type: 'text', required: true },
                  { key: 'city', label: 'City', type: 'text', required: true },
                  { key: 'state', label: 'State / Region', type: 'text', required: true },
                  { key: 'country', label: 'Country', type: 'text', required: true },
                ] as Array<{ key: keyof NewCustomerDraft; label: string; type: string; required: boolean }>
              ).map((field) => (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <label htmlFor={`cust-${field.key}`} className={labelClass}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </label>
                  <input
                    id={`cust-${field.key}`}
                    type={field.type}
                    value={newCustomer[field.key]}
                    onChange={(e) => setNewCustomer({ ...newCustomer, [field.key]: e.target.value })}
                    className={fieldClass}
                  />
                </div>
              ))}
              <p className="col-span-full text-body-sm text-[#5f5e5e]">
                The CRM requires the full billing identity — tax ID, address, city, state and
                country. For a phone booking with no paperwork, use “Guest contact only”.
              </p>
              {touched && newCustomerMissing ? (
                <p className="col-span-full text-body-sm text-error" role="alert">
                  Fill in every required CRM field, or switch to “Guest contact only”.
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        {/* ---------- Canal de origen y peticiones ---------- */}
        <fieldset className="flex flex-col gap-3 border-t border-[#e8e2d8] pt-4">
          <legend className={labelClass}>Booking details</legend>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="res-source" className={labelClass}>
              Booking source
            </label>
            <select
              id="res-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={fieldClass}
            >
              {RESERVATION_SOURCES.map((option) => (
                <option key={option} value={option}>
                  {RESERVATION_SOURCE_LABELS[option]}
                </option>
              ))}
            </select>
            <p className="text-body-sm text-[#5f5e5e] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {RESERVATION_SOURCE_ICONS[source as keyof typeof RESERVATION_SOURCE_ICONS] ?? 'help'}
              </span>
              How the booking reached the house.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="res-requests" className={labelClass}>
              Special requests
            </label>
            <textarea
              id="res-requests"
              rows={3}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="Window seat preferred, birthday cake at dessert, wheelchair access…"
              className={`${fieldClass} resize-y`}
            />
          </div>
        </fieldset>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={
            submitting ? 'Saving…' : needsOverride ? 'Authorize & book' : 'Book table'
          }
          isSubmitting={submitting}
          submitDisabled={blocked}
        />
      </form>
    </AppModal>
  );
};

export default ReservationFormDrawer;
