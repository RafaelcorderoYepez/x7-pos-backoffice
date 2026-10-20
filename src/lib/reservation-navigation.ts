// Map of the 5 sub-modules of the Epic of Reservations.
//
// It lives outside of the bar component because it is consumed by two places: the bar itself (which
// paints the anchors) and MerchantFrame (which translates the public URL to a featureId). have it for
// Duplication was the quick way for a new route to work in one place and not in the other.

// The `key` is the actual featureId from Features.txt, which is what MerchantFrame resolves to.
export type ReservationsAnchorKey =
  | 'reservations'
  | 'reservation-guests'
  | 'reservation-tables'
  | 'reservation-notes'
  | 'reservation-status-history';

export interface ReservationAnchor {
  key: ReservationsAnchorKey;
  label: string;
  /** Material Symbols Outlined symbol that the story assigns to the sub-module. */
  icon: string;
  /** Public URL of the sub-module. */
  path: string;
}

export const RESERVATION_ANCHORS: ReservationAnchor[] = [
  {
    key: 'reservations',
    label: 'RESERVATIONS',
    icon: 'calendar_today',
    path: '/reservations/list',
  },
  { key: 'reservation-guests', label: 'GUESTS', icon: 'group', path: '/reservations/guests' },
  {
    key: 'reservation-tables',
    label: 'TABLE ASSIGNMENTS',
    icon: 'table_restaurant',
    path: '/reservations/tables',
  },
  {
    key: 'reservation-notes',
    label: 'RESERVATION NOTES',
    icon: 'event_note',
    path: '/reservations/notes',
  },
  {
    key: 'reservation-status-history',
    label: 'STATUS HISTORY',
    icon: 'history',
    path: '/reservations/status-history',
  },
];

// An unknown URL under /reservations falls into the reservations book, which is the front page of the
// epic, instead of leaving the workspace blank.
export const featureIdForReservationPath = (path: string): ReservationsAnchorKey =>
  RESERVATION_ANCHORS.find((anchor) => anchor.path === path)?.key ?? 'reservations';
