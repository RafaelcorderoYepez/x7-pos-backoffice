import React, { useState, useEffect, useCallback } from 'react';
import { getAccessToken } from '../../../../../lib/auth-storage';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export interface BumpedOrderItemRecord {
  id: number;
  productName: string;
  variantName?: string | null;
  quantity: number;
  course?: string;
  notes?: string | null;
}

export interface BumpedOrderRecord {
  id: number;
  orderId?: number | null;
  table?: string;
  server?: string;
  stationId?: number | null;
  stationName?: string | null;
  priority?: string | number;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  items: BumpedOrderItemRecord[];
}

interface KitchenRecallTrayProps {
  isOpen: boolean;
  onClose: () => void;
  activeStationId?: number | 'ALL';
  activeStationName?: string;
  onOrderRecalled?: (orderId: number) => void;
  lastBumpedOrder?: BumpedOrderRecord | null;
}

export const KitchenRecallTray: React.FC<KitchenRecallTrayProps> = ({
  isOpen,
  onClose,
  activeStationId,
  activeStationName,
  onOrderRecalled,
  lastBumpedOrder,
}) => {
  const [completedOrders, setCompletedOrders] = useState<BumpedOrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [recallingId, setRecallingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ id: number; message: string; type: 'success' | 'error' } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Timer para refrescar timestamps de forma pura
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch last 10 completed orders for this station / shift
  const fetchRecentBumps = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params = new URLSearchParams({
        businessStatus: 'completed',
        limit: '10',
        sortBy: 'completedAt',
        sortOrder: 'DESC',
      });

      if (activeStationId && activeStationId !== 'ALL') {
        params.append('stationId', String(activeStationId));
      }

      const res = await fetch(`${API_BASE}/kitchen-orders?${params.toString()}`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data || [];
        const mapped: BumpedOrderRecord[] = list.map((o: {
          id: number;
          order_id?: number;
          orderId?: number;
          order?: { diningTable?: { name?: string }; table_number?: string; waiter?: { name?: string }; waiter_name?: string };
          station?: { name?: string; id?: number };
          station_id?: number;
          stationId?: number;
          stationName?: string;
          priority?: number;
          started_at?: string;
          startedAt?: string;
          completed_at?: string;
          completedAt?: string;
          created_at?: string;
          createdAt?: string;
          items?: Array<{
            id: number;
            product?: { name?: string };
            productName?: string;
            variant?: { name?: string };
            variantName?: string;
            quantity?: number;
            course?: string;
            notes?: string;
          }>;
          kitchenOrderItems?: Array<{
            id: number;
            product?: { name?: string };
            productName?: string;
            variant?: { name?: string };
            variantName?: string;
            quantity?: number;
            course?: string;
            notes?: string;
          }>;
        }) => ({
          id: o.id,
          orderId: o.orderId ?? o.order_id,
          table: o.order?.diningTable?.name || o.order?.table_number || 'Takeout',
          server: o.order?.waiter?.name || o.order?.waiter_name || 'Counter Staff',
          stationId: o.stationId ?? o.station_id ?? o.station?.id,
          stationName: o.stationName || o.station?.name || 'General Kitchen',
          priority: o.priority,
          startedAt: o.startedAt || o.started_at,
          completedAt: o.completedAt || o.completed_at,
          createdAt: o.createdAt || o.created_at,
          items: (o.items || o.kitchenOrderItems || []).map((i) => ({
            id: i.id,
            productName: i.product?.name || i.productName || 'Dish Item',
            variantName: i.variant?.name || i.variantName,
            quantity: i.quantity || 1,
            course: i.course,
            notes: i.notes,
          })),
        }));

        setCompletedOrders(mapped);
      }
    } catch (err) {
      console.warn('Failed to fetch recent bumped orders:', err);
    } finally {
      setLoading(false);
    }
  }, [activeStationId]);

  // Cargar al abrir o cambiar de estación
  useEffect(() => {
    if (isOpen) {
      void Promise.resolve().then(() => {
        void fetchRecentBumps();
      });
    }
  }, [isOpen, fetchRecentBumps]);

  // Combinar órdenes completadas del backend con la última bumpeada localmente
  const displayOrders = React.useMemo(() => {
    let list = completedOrders;

    // Filtrar estrictamente por estación si no es 'ALL'
    if (activeStationId && activeStationId !== 'ALL') {
      list = list.filter((o) => (o.stationId || o.station?.id) === activeStationId);
    }

    if (!lastBumpedOrder) return list;

    // Solo anexar lastBumpedOrder si pertenece a la estación actual
    if (activeStationId && activeStationId !== 'ALL') {
      if (lastBumpedOrder.stationId && lastBumpedOrder.stationId !== activeStationId) {
        return list;
      }
      if (
        lastBumpedOrder.stationName &&
        activeStationName &&
        lastBumpedOrder.stationName.trim().toLowerCase() !== activeStationName.trim().toLowerCase()
      ) {
        return list;
      }
    }

    const exists = list.some((o) => o.id === lastBumpedOrder.id);
    if (exists) return list;
    return [lastBumpedOrder, ...list.slice(0, 9)];
  }, [completedOrders, lastBumpedOrder, activeStationId, activeStationName]);

  // One-Tap "RECALL ORDER" Action
  const handleRecallOrder = async (orderId: number) => {
    setRecallingId(orderId);
    setFeedback(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/kitchen-orders/${orderId}/recall`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || 'Error al restaurar la comanda');
      }

      setFeedback({
        id: orderId,
        message: '¡Comanda restaurada con éxito a la pantalla activa!',
        type: 'success',
      });

      // Notificar a KDS de la restauración
      window.dispatchEvent(new CustomEvent('x7_kds_data_reset', { detail: { action: 'recall', orderId } }));

      if (onOrderRecalled) {
        onOrderRecalled(orderId);
      }

      // Remover de la lista de recientes completadas
      setTimeout(() => {
        setCompletedOrders((prev) => prev.filter((o) => o.id !== orderId));
        setFeedback(null);
      }, 900);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al restaurar';
      setFeedback({ id: orderId, message: msg, type: 'error' });
    } finally {
      setRecallingId(null);
    }
  };

  const calculateSosDuration = (startedAt?: string | null, completedAt?: string | null) => {
    if (!startedAt || !completedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const calculateCompletedAgo = (completedAt: string | null | undefined, currentNow: number) => {
    if (!completedAt) return 'Reciente';
    const diffSec = Math.max(0, Math.floor((currentNow - new Date(completedAt).getTime()) / 1000));
    if (diffSec < 60) return `Hace ${diffSec}s`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `Hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    return `Hace ${hours}h`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in font-sans">
      {/* Backdrop click */}
      <div className="flex-1" onClick={onClose} aria-hidden="true" />

      {/* Slide-out Tray Drawer */}
      <div className="w-full max-w-md bg-[#16171a] border-l border-zinc-700/80 shadow-2xl flex flex-col h-full text-white transform transition-transform duration-300">
        {/* Drawer Header */}
        <div className="pt-3 pb-3 px-3.5 bg-[#1f2026] border-b border-zinc-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <span className="material-symbols-outlined text-lg">history</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-black uppercase tracking-wide text-white whitespace-nowrap" style={{ color: '#ffffff' }}>
                Recent Bump Recall Tray
              </h3>
              <p className="text-[10.5px] text-zinc-400 mt-0.5 leading-tight" style={{ color: '#a1a1aa' }}>
                Restore accidentally bumped tickets without losing elapsed time
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={fetchRecentBumps}
                disabled={loading}
                className="w-7 h-7 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-amber-400 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh recall tray"
              >
                <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin text-amber-400' : ''}`}>
                  refresh
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Close tray"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <span
              className="text-[9.5px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-mono font-bold shrink-0"
              style={{ color: '#fcd34d' }}
            >
              HISTORY ({displayOrders.length}/10)
            </span>
          </div>
        </div>

        {/* Buffer Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
          {loading && displayOrders.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center px-4">
              <span className="material-symbols-outlined text-3xl animate-spin text-amber-500">progress_activity</span>
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-zinc-400" style={{ color: '#a1a1aa' }}>
                Loading completed tickets...
              </p>
            </div>
          ) : displayOrders.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center text-zinc-400 mb-3 shadow-inner">
                <span className="material-symbols-outlined text-3xl text-zinc-400">inbox</span>
              </div>
              <div className="text-base font-bold text-center" style={{ color: '#f4f4f5' }}>
                Recall Tray is Empty
              </div>
              <p className="mt-1.5 text-xs text-zinc-400 text-center max-w-xs mx-auto leading-relaxed" style={{ color: '#a1a1aa' }}>
                No recently completed tickets for this station in the current shift.
              </p>
            </div>
          ) : (
            displayOrders.map((order, idx) => {
              const sosTime = calculateSosDuration(order.startedAt, order.completedAt);
              const completedAgo = calculateCompletedAgo(order.completedAt, nowMs);
              const isRecalling = recallingId === order.id;
              const cardFeedback = feedback?.id === order.id ? feedback : null;

              return (
                <div
                  key={order.id}
                  className="bg-[#1f2026] border border-zinc-750 hover:border-zinc-600 rounded-xl p-3.5 transition-all shadow-md group relative overflow-hidden"
                >
                  {/* Accent border top for position in buffer */}
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 via-amber-600 to-transparent" />

                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-white" style={{ color: '#ffffff' }}>
                        #KO-{order.id}
                      </span>
                      <span className="text-[11px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-1.5 py-0.5 rounded">
                        {order.table}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-zinc-400 block">
                        {completedAgo}
                      </span>
                      {sosTime && (
                        <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                          SOS: {sosTime}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Server & Station Meta */}
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 py-1.5">
                    <span className="truncate flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-zinc-500">person</span>
                      {order.server}
                    </span>
                    <span className="text-zinc-500 text-[10px] uppercase font-bold truncate">
                      {order.stationName}
                    </span>
                  </div>

                  {/* Dish Items summary */}
                  <div className="mt-1 space-y-1 bg-[#18191e] rounded-lg p-2 border border-zinc-800/60 max-h-32 overflow-y-auto custom-scrollbar">
                    {order.items.map((it) => (
                      <div key={it.id} className="flex items-start justify-between text-xs gap-2">
                        <span className="text-zinc-200 font-medium truncate">
                          <strong className="text-amber-400 font-mono mr-1.5">{it.quantity}x</strong>
                          {it.productName}
                          {it.variantName && (
                            <span className="text-zinc-400 text-[11px] ml-1">({it.variantName})</span>
                          )}
                        </span>
                        {it.course && (
                          <span className="text-[9px] uppercase font-black text-zinc-400 bg-zinc-800 px-1 py-0.2 rounded shrink-0">
                            {it.course}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Feedback Banner */}
                  {cardFeedback && (
                    <div
                      className={`mt-2.5 p-2 rounded-lg text-xs font-bold flex items-center gap-1.5 animate-fade-in ${
                        cardFeedback.type === 'success'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50'
                          : 'bg-red-950/80 text-red-300 border border-red-500/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {cardFeedback.type === 'success' ? 'check_circle' : 'error'}
                      </span>
                      <span>{cardFeedback.message}</span>
                    </div>
                  )}

                  {/* One-Tap RECALL ORDER Action Button */}
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={isRecalling}
                      onClick={() => handleRecallOrder(order.id)}
                      className="w-full py-2.5 px-3 bg-gradient-to-r from-[#ae001a] to-[#8d0015] hover:from-[#c2001d] hover:to-[#ae001a] disabled:opacity-50 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer active:scale-98"
                    >
                      <span className={`material-symbols-outlined text-base ${isRecalling ? 'animate-spin' : ''}`}>
                        {isRecalling ? 'progress_activity' : 'replay'}
                      </span>
                      <span>{isRecalling ? 'Restoring...' : 'RECALL ORDER'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3.5 bg-[#1a1b20] border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            FIFO Buffer (Max 10 tickets)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase rounded transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default KitchenRecallTray;
