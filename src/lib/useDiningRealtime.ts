// Subscription of a view to the real-time channel of the dining system.
//
// The handlers live in a ref so that the socket is opened ONCE per mount: if the
// effect depended on them, each render of the view (and there is one per browser key)
// I would throw away the connection and open another one.

import { useEffect, useRef, useState } from 'react';
import { getAccessToken } from './auth-storage';
import { connectDiningRealtime, type DiningRealtimeHandlers } from './dining-realtime';

export interface UseDiningRealtimeOptions extends DiningRealtimeHandlers {
  // Allows you to turn off the channel without unmounting the view (for example while loading the session).
  enabled?: boolean;
}

export const useDiningRealtime = ({
  enabled = true,
  ...handlers
}: UseDiningRealtimeOptions): { connected: boolean } => {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<DiningRealtimeHandlers>(handlers);

  // It is synchronized after each render, not during: writing a ref while painting is
  // just what React does not guarantee in concurrent mode.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    // Without a session there is no room to enter: the gateway would reject the handshake.
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
