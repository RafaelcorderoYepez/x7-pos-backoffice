// Canal de tiempo real del dining system: el vocabulario de eventos que comparten el POS,
// el backoffice y el gateway del backend, y el transporte que los trae.
//
// El backend expone un único namespace socket.io (/realtime) y mete a cada socket en la sala
// de su comercio al autenticar, así que aquí no hay que suscribirse a nada: basta conectar
// con el token y escuchar. Si el gateway está apagado (WS_ENABLED=false) o la red se cae,
// esto queda inerte y la vista sigue funcionando con sus fetch normales.

import { io, type Socket } from 'socket.io-client';

// ================= Vocabulario de eventos =================

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
  // Se dispara al RE-conectar (nunca en la primera conexión): la tablet estuvo sin red y se
  // ha perdido eventos, así que quien escucha debe reconciliar su estado local.
  onReconnect?: (lastSeenAt: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface DiningRealtimeConnection {
  close: () => void;
}

// El gateway vive junto a la API. En dev el proxy de vite sólo cubre /api, así que
// VITE_WS_URL permite apuntar el socket al backend (http://localhost:3001) sin tocar el resto.
export const realtimeUrl = (): string => {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  const origin =
    configured?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  return `${origin.replace(/\/$/, '')}/realtime`;
};

// Conecta y devuelve el cierre. Nunca lanza: un fallo de transporte degrada a "sin tiempo
// real", que es exactamente cómo se comportaba la vista antes de existir este canal.
export const connectDiningRealtime = (
  token: string,
  handlers: DiningRealtimeHandlers,
): DiningRealtimeConnection => {
  let socket: Socket | null = null;
  // Marca de agua para la reconciliación: desde cuándo puede haberse perdido un evento.
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
      // Techo bajo a propósito: en un servicio de sala, una tablet que recupera el wifi debe
      // volver a estar sincronizada en segundos, no esperar un backoff de medio minuto.
      reconnectionDelayMax: 5000,
    });
  } catch {
    return { close: () => {} };
  }

  socket.on('connect', () => {
    handlers.onConnectionChange?.(true);
    if (hasConnected) {
      // Segunda conexión en adelante: hubo un hueco sin escuchar.
      handlers.onReconnect?.(lastSeenAt);
    }
    hasConnected = true;
    touch();
  });

  socket.on('disconnect', () => {
    handlers.onConnectionChange?.(false);
  });

  // Un error de conexión (gateway apagado, token caducado) no debe romper la vista: se
  // reporta como "desconectado" y socket.io sigue reintentando por su cuenta.
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
        // Cerrar un socket ya muerto no es un error que deba escalar a la vista.
      }
    },
  };
};
