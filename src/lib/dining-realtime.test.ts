import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Socket witness: we save the handlers that the client registers so that we can
// trigger gateway events by hand.
const { ioMock, socket, listeners } = vi.hoisted(() => {
  const listeners = new Map<string, (payload?: unknown) => void>();
  const socket = {
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      listeners.set(event, handler);
    }),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  };
  return { ioMock: vi.fn(() => socket), socket, listeners };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));

const { connectDiningRealtime, DINING_EVENTS, realtimeUrl } = await import('./dining-realtime');

const fire = (event: string, payload?: unknown) => listeners.get(event)?.(payload);

describe('connectDiningRealtime', () => {
  beforeEach(() => {
    listeners.clear();
    ioMock.mockClear();
    socket.on.mockClear();
    socket.disconnect.mockClear();
    socket.removeAllListeners.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('points to the gateway namespace with the token in the handshake', () => {
    connectDiningRealtime('jwt-123', {});

    expect(ioMock).toHaveBeenCalledWith(
      realtimeUrl(),
      expect.objectContaining({ auth: { token: 'jwt-123' }, reconnection: true }),
    );
    expect(realtimeUrl()).toMatch(/\/realtime$/);
  });

  it('delivers each room event to its handler', () => {
    const onTableStatusChanged = vi.fn();
    const onTableTransferred = vi.fn();
    const onAssignmentChanged = vi.fn();
    const onFloorPlanUpdated = vi.fn();
    connectDiningRealtime('jwt', {
      onTableStatusChanged,
      onTableTransferred,
      onAssignmentChanged,
      onFloorPlanUpdated,
    });

    fire(DINING_EVENTS.tableStatusChanged, { tableId: 1 });
    fire(DINING_EVENTS.tableTransferred, { sourceTableId: 1 });
    fire(DINING_EVENTS.assignmentChanged, { assignmentId: 2 });
    fire(DINING_EVENTS.floorPlanUpdated, { floorPlanId: 3 });

    expect(onTableStatusChanged).toHaveBeenCalledWith({ tableId: 1 });
    expect(onTableTransferred).toHaveBeenCalledWith({ sourceTableId: 1 });
    expect(onAssignmentChanged).toHaveBeenCalledWith({ assignmentId: 2 });
    expect(onFloorPlanUpdated).toHaveBeenCalledWith({ floorPlanId: 3 });
  });

  it('reports the connection and the drop', () => {
    const onConnectionChange = vi.fn();
    connectDiningRealtime('jwt', { onConnectionChange });

    fire('connect');
    expect(onConnectionChange).toHaveBeenLastCalledWith(true);

    fire('disconnect');
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
  });

  it('a transport error is reported as a disconnection, it does not burst the view', () => {
    const onConnectionChange = vi.fn();
    connectDiningRealtime('jwt', { onConnectionChange });

    expect(() => fire('connect_error')).not.toThrow();
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
  });

  it('does not ask to reconcile on first connection', () => {
    const onReconnect = vi.fn();
    connectDiningRealtime('jwt', { onReconnect });

    fire('connect');

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('asks to reconcile when returning from a fall, with the mark of the last event seen', () => {
    const onReconnect = vi.fn();
    connectDiningRealtime('jwt', { onReconnect });

    fire('connect');
    fire('disconnect');
    fire('connect');

    expect(onReconnect).toHaveBeenCalledTimes(1);
    // The mark is an ISO instant prior to reconnection.
    const since = onReconnect.mock.calls[0][0] as string;
    expect(Number.isNaN(Date.parse(since))).toBe(false);
  });

  it('close the socket and release the handlers', () => {
    const connection = connectDiningRealtime('jwt', {});

    connection.close();

    expect(socket.removeAllListeners).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('if the transport does not start, it degrades to non-realtime instead of propagating', () => {
    ioMock.mockImplementationOnce(() => {
      throw new Error('no transport');
    });

    expect(() => connectDiningRealtime('jwt', {}).close()).not.toThrow();
  });
});
