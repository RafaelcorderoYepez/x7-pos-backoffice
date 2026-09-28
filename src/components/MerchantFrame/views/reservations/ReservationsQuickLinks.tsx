// Panel de accesos rápidos del épico de Reservas.
//
// Usa QuickLaunchPanel, que es el componente estándar de quick actions del backoffice (el
// mismo de Accounts Payable, Dining System, HR, Kitchen…). Es la ÚNICA navegación del épico:
// hubo una barra anclada al pie y se retiró, porque repetía estos mismos cinco accesos y
// tapaba el pie real de la aplicación.
//
// Las anclas salen de `reservation-navigation.ts`, el mismo mapa que alimenta la barra
// inferior y la resolución de URLs en MerchantFrame: un sub-módulo nuevo se añade una sola vez.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  QuickLaunchPanel,
  type QuickLaunchAction,
} from '../../shared/QuickLaunchPanel';
import {
  RESERVATION_ANCHORS,
  type ReservationsAnchorKey,
} from '../../../../lib/reservation-navigation';

interface ReservationsQuickLinksProps {
  current: ReservationsAnchorKey;
  onNavigate?: (view: string) => void;
}

export const ReservationsQuickLinks: React.FC<ReservationsQuickLinksProps> = ({
  current,
  onNavigate,
}) => {
  const navigate = useNavigate();

  const actions: QuickLaunchAction[] = RESERVATION_ANCHORS.map((anchor) => ({
    id: anchor.key,
    label: anchor.label,
    icon: anchor.icon,
    active: anchor.key === current,
    // Dentro de MerchantFrame la navegación es por featureId; fuera (o en una pantalla
    // montada suelta) se cae a la URL pública del sub-módulo.
    onClick: () => {
      if (onNavigate) {
        onNavigate(anchor.key);
      } else {
        navigate(anchor.path);
      }
    },
  }));

  return (
    <nav aria-label="Reservations workspace shortcuts">
      <QuickLaunchPanel
        title="Reservations Shortcuts"
        description="Jump across the reservations workspaces — the booking calendar, guest rosters, table assignments, service notes and status history."
        actions={actions}
      />
    </nav>
  );
};

export default ReservationsQuickLinks;
