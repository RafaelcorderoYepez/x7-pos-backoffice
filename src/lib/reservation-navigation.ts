// Mapa de los 5 sub-módulos del épico de Reservas.
//
// Vive fuera del componente de la barra porque lo consumen dos sitios: la propia barra (que
// pinta los anclajes) y MerchantFrame (que traduce la URL pública a un featureId). Tenerlo por
// duplicado era la vía rápida a que una ruta nueva funcionase en un sitio y en el otro no.

// El `key` es el featureId real de Features.txt, que es lo que MerchantFrame resuelve.
export type ReservationsAnchorKey =
  | 'reservations'
  | 'reservation-guests'
  | 'reservation-tables'
  | 'reservation-notes'
  | 'reservation-status-history';

export interface ReservationAnchor {
  key: ReservationsAnchorKey;
  label: string;
  /** Símbolo de Material Symbols Outlined que la historia asigna al sub-módulo. */
  icon: string;
  /** URL pública del sub-módulo. */
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

// Una URL desconocida bajo /reservations cae en el libro de reservas, que es la portada del
// épico, en vez de dejar el workspace en blanco.
export const featureIdForReservationPath = (path: string): ReservationsAnchorKey =>
  RESERVATION_ANCHORS.find((anchor) => anchor.path === path)?.key ?? 'reservations';
