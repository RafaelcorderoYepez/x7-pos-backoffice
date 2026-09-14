import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Testigo del socket: guardamos los manejadores que registra el cliente para poder
// disparar los eventos del gateway a mano.
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

  it('apunta al namespace del gateway con el token en el handshake', () => {
    connectDiningRealtime('jwt-123', {});

    expect(ioMock).toHaveBeenCalledWith(
      realtimeUrl(),
      expect.objectContaining({ auth: { token: 'jwt-123' }, reconnection: true }),
    );
    expect(realtimeUrl()).toMatch(/\/realtime$/);
  });

  it('entrega cada evento de sala a su manejador', () => {
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

  it('reporta la conexión y la caída', () => {
    const onConnectionChange = vi.fn();
    connectDiningRealtime('jwt', { onConnectionChange });

    fire('connect');
    expect(onConnectionChange).toHaveBeenLastCalledWith(true);

    fire('disconnect');
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
  });

  it('un error de transporte se reporta como desconexión, no revienta la vista', () => {
    const onConnectionChange = vi.fn();
    connectDiningRealtime('jwt', { onConnectionChange });

    expect(() => fire('connect_error')).not.toThrow();
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
  });

  it('no pide reconciliar en la primera conexión', () => {
    const onReconnect = vi.fn();
    connectDiningRealtime('jwt', { onReconnect });

    fire('connect');

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('pide reconciliar al volver de una caída, con la marca del último evento visto', () => {
    const onReconnect = vi.fn();
    connectDiningRealtime('jwt', { onReconnect });

    fire('connect');
    fire('disconnect');
    fire('connect');

    expect(onReconnect).toHaveBeenCalledTimes(1);
    // La marca es un instante ISO anterior a la reconexión.
    const since = onReconnect.mock.calls[0][0] as string;
    expect(Number.isNaN(Date.parse(since))).toBe(false);
  });

  it('cierra el socket y suelta los manejadores', () => {
    const connection = connectDiningRealtime('jwt', {});

    connection.close();

    expect(socket.removeAllListeners).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('si el transporte no arranca, degrada a sin tiempo real en vez de propagar', () => {
    ioMock.mockImplementationOnce(() => {
      throw new Error('no transport');
    });

    expect(() => connectDiningRealtime('jwt', {}).close()).not.toThrow();
  });
});
