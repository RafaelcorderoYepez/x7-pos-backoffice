import { apiRequest } from '../api/http';

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
    await apiRequest<void>(
      `/kitchen-station/${stationId}/heartbeat`,
      { method: 'POST' },
      'Failed to send station keepalive heartbeat',
    );
  } catch (err) {
    console.warn('Failed to send station keepalive heartbeat:', err);
  }
}
