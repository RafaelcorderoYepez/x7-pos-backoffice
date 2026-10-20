// Delivery Management real-time channel: positions of delivery people and changes of
// assignments and fleet status, pushed by the backend.
//
// Same gateway as the dining system (namespace /realtime, retail room when authenticating):
// Just connect with the token and listen. If the gateway is turned off or the network goes down, this
// It remains inert and the views continue with their periodic survey.

import { io, type Socket } from 'socket.io-client';
import { realtimeUrl } from './dining-realtime';

// ================= Event Vocabulary =================

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
  // When RE-connecting (never on the first connection): some event could have been missed, so the
  // view must ask for its status again.
  onReconnect?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface DeliveryRealtimeConnection {
  close: () => void;
}

// Never launches: A transport failure degrades to "non-realtime" (normal polling).
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
        // Closing an already dead socket should not escalate into view.
      }
    },
  };
};
