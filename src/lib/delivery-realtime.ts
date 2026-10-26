// Canal de tiempo real de Delivery Management: posiciones de los repartidores y cambios de
// asignaciones y de estado de la flota, empujados por el backend.
//
// Mismo gateway que el dining system (namespace /realtime, sala del comercio al autenticar):
// basta conectar con el token y escuchar. Si el gateway está apagado o la red se cae, esto
// queda inerte y las vistas siguen con su sondeo periódico.

import { io, type Socket } from 'socket.io-client';
import { realtimeUrl } from './dining-realtime';

// ================= Vocabulario de eventos =================

export const DELIVERY_EVENTS = {
  locationUpdated: 'delivery:location_updated',
  assignmentChanged: 'delivery:assignment_changed',
  driverStatusChanged: 'delivery:driver_status_changed',
} as const;

export interface LocationUpdatedPayload {
  merchantId: number;
  assignmentId: number;
  trackingId: number;
  driverId: number | null;
  lat: number;
  lng: number;
  recorded_at: string;
  status: string;
  emittedAt: string;
}

export interface DeliveryAssignmentChangedPayload {
  merchantId: number;
  assignmentId: number;
  delivery_status: string;
  driverId: number | null;
  emittedAt: string;
}

export interface DriverStatusChangedPayload {
  merchantId: number;
  driverId: number;
  status: string;
  emittedAt: string;
}

// ================= Transporte =================

export interface DeliveryRealtimeHandlers {
  onLocationUpdated?: (p: LocationUpdatedPayload) => void;
  onAssignmentChanged?: (p: DeliveryAssignmentChangedPayload) => void;
  onDriverStatusChanged?: (p: DriverStatusChangedPayload) => void;
  // Al RE-conectar (nunca en la primera conexión): pudo perderse algún evento, así que la
  // vista debe volver a pedir su estado.
  onReconnect?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface DeliveryRealtimeConnection {
  close: () => void;
}

// Nunca lanza: un fallo de transporte degrada a "sin tiempo real" (sondeo normal).
export const connectDeliveryRealtime = (
  token: string,
  handlers: DeliveryRealtimeHandlers,
): DeliveryRealtimeConnection => {
  let socket: Socket | null = null;
  let hasConnected = false;

  try {
    socket = io(realtimeUrl(), {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  } catch {
    return { close: () => {} };
  }

  socket.on('connect', () => {
    handlers.onConnectionChange?.(true);
    if (hasConnected) handlers.onReconnect?.();
    hasConnected = true;
  });
  socket.on('disconnect', () => handlers.onConnectionChange?.(false));
  socket.on('connect_error', () => handlers.onConnectionChange?.(false));

  socket.on(DELIVERY_EVENTS.locationUpdated, (p: LocationUpdatedPayload) =>
    handlers.onLocationUpdated?.(p),
  );
  socket.on(DELIVERY_EVENTS.assignmentChanged, (p: DeliveryAssignmentChangedPayload) =>
    handlers.onAssignmentChanged?.(p),
  );
  socket.on(DELIVERY_EVENTS.driverStatusChanged, (p: DriverStatusChangedPayload) =>
    handlers.onDriverStatusChanged?.(p),
  );

  return {
    close: () => {
      try {
        socket?.removeAllListeners();
        socket?.disconnect();
      } catch {
        // Cerrar un socket ya muerto no debe escalar a la vista.
      }
    },
  };
};
