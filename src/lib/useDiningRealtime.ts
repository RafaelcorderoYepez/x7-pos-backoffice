// Suscripción de una vista al canal de tiempo real del dining system.
//
// Los manejadores viven en una ref para que el socket se abra UNA vez por montaje: si el
// efecto dependiera de ellos, cada render de la vista (y hay uno por tecla del buscador)
// tiraría la conexión y abriría otra.

import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from './auth-storage';
import { connectDiningRealtime, type DiningRealtimeHandlers } from './dining-realtime';

export interface UseDiningRealtimeOptions extends DiningRealtimeHandlers {
  // Permite apagar el canal sin desmontar la vista (por ejemplo mientras carga la sesión).
  enabled?: boolean;
}

export const useDiningRealtime = ({
  enabled = true,
  ...handlers
}: UseDiningRealtimeOptions): { connected: boolean } => {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<DiningRealtimeHandlers>(handlers);

  // Se sincroniza tras cada render, no durante: escribir una ref mientras se pinta es
  // justo lo que React no garantiza en modo concurrente.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    // Sin sesión no hay sala a la que entrar: el gateway rechazaría el handshake.
    const token = getAccessToken();
    if (!token) return;

    const connection = connectDiningRealtime(token, {
      onTableStatusChanged: (p) => handlersRef.current.onTableStatusChanged?.(p),
      onTableTransferred: (p) => handlersRef.current.onTableTransferred?.(p),
      onAssignmentChanged: (p) => handlersRef.current.onAssignmentChanged?.(p),
      onFloorPlanUpdated: (p) => handlersRef.current.onFloorPlanUpdated?.(p),
      onReconnect: (since) => handlersRef.current.onReconnect?.(since),
      onConnectionChange: (isConnected) => {
        setConnected(isConnected);
        handlersRef.current.onConnectionChange?.(isConnected);
      },
    });

    return () => connection.close();
  }, [enabled]);

  return { connected };
};

export default useDiningRealtime;
