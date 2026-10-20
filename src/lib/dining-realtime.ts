// Dining system real-time channel: the vocabulary of events that share the POS,
// the backoffice and the backend gateway, and the transport that brings them.
// The backend exposes a single socket.io namespace (/realtime) and puts each socket in the room
// of your business when authenticating, so there is no need to subscribe to anything here: just connect
// with the token and listen. If the gateway is powered off (WS_ENABLED=false) or the network goes down,
// This remains inert and the view continues to function with its normal fetches.

import { io, type Socket } from 'socket.io-client';

// ================= Event Vocabulary =================

export const DINING_EVENTS = {
  tableStatusChanged: 'dining:table_status_changed',
  tableTransferred: 'dining:table_transferred',
  assignmentChanged: 'dining:assignment_changed',
  floorPlanUpdated: 'dining:floor_plan_updated',
} as const;

export interface TableStatusChangedPayload {
  merchantId: number;
  tableId: number;
  status: string;
  parent_table_id?: number | null;
  emittedAt: string;
}

export interface TableTransferredPayload {
  merchantId: number;
  sourceTableId: number;
  targetTableId: number;
  orderId?: number | null;
  emittedAt: string;
}

export interface AssignmentChangedPayload {
  merchantId: number;
  assignmentId: number;
  tableId: number;
  shiftId: number;
  collaboratorId: number;
  action: 'assigned' | 'released' | 'reassigned';
  emittedAt: string;
}

export interface FloorPlanUpdatedPayload {
  merchantId: number;
  floorPlanId: number;
  emittedAt: string;
}

// ================= Transporte =================

export interface DiningRealtimeHandlers {
  onTableStatusChanged?: (p: TableStatusChangedPayload) => void;
  onTableTransferred?: (p: TableTransferredPayload) => void;
  onAssignmentChanged?: (p: AssignmentChangedPayload) => void;
  onFloorPlanUpdated?: (p: FloorPlanUpdatedPayload) => void;
  // Triggers when RE-connecting (never on the first connection): the tablet was without network and was
  // has missed events, so the listener must reconcile their local state.
  onReconnect?: (lastSeenAt: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface DiningRealtimeConnection {
  close: () => void;
}

// The gateway lives next to the API. In dev the vite proxy only covers /api, so
// VITE_WS_URL allows you to point the socket to the backend (http://localhost:3001) without touching the rest.
export const realtimeUrl = (): string => {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  const origin =
    configured?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  return `${origin.replace(/\/$/, '')}/realtime`;
};

// Connect and return closure. Never launches: a transport failure degrades to "no time"
// real", which is exactly how the view behaved before this channel existed.
export const connectDiningRealtime = (
  token: string,
  handlers: DiningRealtimeHandlers,
): DiningRealtimeConnection => {
  let socket: Socket | null = null;
  // Reconciliation watermark: how long you may have missed an event.
  let lastSeenAt = new Date().toISOString();
  let hasConnected = false;

  const touch = () => {
    lastSeenAt = new Date().toISOString();
  };

  try {
    socket = io(realtimeUrl(), {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      // Low ceiling on purpose: in a room service, a tablet that recovers Wi-Fi must
      // be synchronized again in seconds, do not wait for a backoff of half a minute.
      reconnectionDelayMax: 5000,
    });
  } catch {
    return { close: () => {} };
  }

  socket.on('connect', () => {
    handlers.onConnectionChange?.(true);
    if (hasConnected) {
      // Second connection onwards: there was a gap without listening.
      handlers.onReconnect?.(lastSeenAt);
    }
    hasConnected = true;
    touch();
  });

  socket.on('disconnect', () => {
    handlers.onConnectionChange?.(false);
  });

  // A connection error (gateway turned off, token expired) should not break the view: it
  // reports as "disconnected" and socket.io keeps retrying on its own.
  socket.on('connect_error', () => {
    handlers.onConnectionChange?.(false);
  });

  socket.on(DINING_EVENTS.tableStatusChanged, (p: TableStatusChangedPayload) => {
    touch();
    handlers.onTableStatusChanged?.(p);
  });
  socket.on(DINING_EVENTS.tableTransferred, (p: TableTransferredPayload) => {
    touch();
    handlers.onTableTransferred?.(p);
  });
  socket.on(DINING_EVENTS.assignmentChanged, (p: AssignmentChangedPayload) => {
    touch();
    handlers.onAssignmentChanged?.(p);
  });
  socket.on(DINING_EVENTS.floorPlanUpdated, (p: FloorPlanUpdatedPayload) => {
    touch();
    handlers.onFloorPlanUpdated?.(p);
  });

  return {
    close: () => {
      try {
        socket?.removeAllListeners();
        socket?.disconnect();
      } catch {
        // Closing an already dead socket is not a bug that should be escalated into view.
      }
    },
  };
};
