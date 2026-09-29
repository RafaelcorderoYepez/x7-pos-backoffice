import { getAccessToken } from './auth-storage';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Sends a station keepalive heartbeat to ensure kitchen stations and display devices
 * remain marked as active and online in the backend, preventing premature contingency reroutes.
 * Defaults to 'ALL' to keep all stations of the authenticated merchant online.
 */
export async function sendStationKeepaliveHeartbeat(
  stationId: number | string = 'ALL',
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const token = getAccessToken();
    await fetch(`${API_BASE}/kitchen-station/${stationId}/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (err) {
    console.warn('Failed to send station keepalive heartbeat:', err);
  }
}
