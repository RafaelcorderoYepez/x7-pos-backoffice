import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getAccessToken } from '../../../../../lib/auth-storage';
import { useKdsCriticalSla } from '../../../../../lib/kds-sla-config';
import { KitchenDevResetButton } from './KitchenDevResetButton';
import { KitchenRecallTray, type BumpedOrderRecord } from './KitchenRecallTray';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export type CourseType = 'APPETIZER' | 'MAIN_COURSE' | 'DESSERT' | 'BEVERAGE';
export type PreparationStatus = 'HELD' | 'PENDING' | 'IN_PREPARATION' | 'READY';

export interface TicketItem {
  id: number;
  name: string;
  variantName?: string;
  qty: number;
  preparedQuantity?: number;
  notes?: string;
  course: CourseType;
  preparationStatus: PreparationStatus;
  holdRemainingSeconds?: number;
  firedAt?: string | null;
}

export interface KitchenTicket {
  id: string;
  backendOrderId?: number;
  table: string;
  timeElapsed: number; // minutes
  createdAtMs?: number;
  server: string;
  stationName?: string;
  stationId?: number;
  priority: 'normal' | 'high' | 'urgent' | 'vip';
  items: TicketItem[];
  orderNotes?: string | null;
  isPulsing?: boolean;
  alertMessage?: string | null;
}

export type KdsView = 'EXPO' | 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID';

interface KitchenMonitorViewProps {
  onBackToDashboard: () => void;
}

/**
 * Native Audio Chime Synthesizer using Web Audio API (Zero external audio file dependency)
 */
const playKitchenFireChime = () => {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First Harmonic Tone (880 Hz - High Bell A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Second Resonant Tone (1320 Hz - Bell E6)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1320, now + 0.08);
    gain2.gain.setValueAtTime(0.3, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.65);
  } catch (e) {
    console.warn('Audio chime playback omitted or blocked by browser user gesture policy:', e);
  }
};

export interface BackendKitchenStation {
  id: number;
  name: string;
  station_type?: string;
  stationType?: string;
  display_mode?: 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID';
  displayMode?: 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID';
  display_order?: number;
  displayOrder?: number;
  is_active?: boolean;
  isActive?: boolean;
  status?: string;
}

export type KdsCardDensity = 'compact' | 'normal' | 'spacious';

export const KitchenMonitorView: React.FC<KitchenMonitorViewProps> = ({ onBackToDashboard }) => {
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeCourseFilter, setActiveCourseFilter] = useState<'ALL' | CourseType>('ALL');
  const [selectedStationFilter, setSelectedStationFilter] = useState<string>('ALL');
  const [activeKdsView, setActiveKdsView] = useState<KdsView>('EXPO');
  const [activeDisplayMode, setActiveDisplayMode] = useState<'GRID' | 'SUMMARY' | 'MANUAL' | 'AUTO'>('GRID');
  const [kitchenStations, setKitchenStations] = useState<BackendKitchenStation[]>([]);
  const [manualActiveTicketId, setManualActiveTicketId] = useState<string | null>(null);
  const [isPacingDrawerOpen, setIsPacingDrawerOpen] = useState<boolean>(false);
  const [isRecallTrayOpen, setIsRecallTrayOpen] = useState<boolean>(false);
  const [lastBumpedOrder, setLastBumpedOrder] = useState<BumpedOrderRecord | null>(null);
  const [undoToast, setUndoToast] = useState<{ id: string; backendOrderId?: number; table: string } | null>(null);
  const [isAllDayBarExpanded, setIsAllDayBarExpanded] = useState<boolean>(true);
  const [cardDensity, setCardDensity] = useState<KdsCardDensity>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('x7_kds_card_density');
      if (saved === 'compact' || saved === 'normal' || saved === 'spacious') {
        return saved;
      }
    }
    return 'compact';
  });
  const [mainCourseHoldDelayMins, setMainCourseHoldDelayMins] = useState<number>(10);
  const [dessertHoldDelayMins, setDessertHoldDelayMins] = useState<number>(20);
  const [criticalSlaMinutes, setCriticalSlaMinutes] = useKdsCriticalSla();
  const [autoFireEnabled, setAutoFireEnabled] = useState<boolean>(true);
  const [audioChimeEnabled, setAudioChimeEnabled] = useState<boolean>(true);
  const [activeAlertToast, setActiveAlertToast] = useState<{ id: string; message: string; type: 'fire' | 'pacing' } | null>(null);

  const handleDensityChange = (density: KdsCardDensity) => {
    setCardDensity(density);
    if (typeof window !== 'undefined') {
      localStorage.setItem('x7_kds_card_density', density);
    }
  };

  // Auto-dismiss alert toast after 5 seconds
  useEffect(() => {
    if (!activeAlertToast) return;
    const timer = setTimeout(() => {
      setActiveAlertToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeAlertToast]);

  const triggerAlert = useCallback((message: string, type: 'fire' | 'pacing' = 'fire') => {
    if (audioChimeEnabled) {
      playKitchenFireChime();
    }
    setActiveAlertToast({ id: String(Date.now()), message, type });
  }, [audioChimeEnabled]);

  // Load registered kitchen stations and their configured display_mode from backend
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const res = await fetch(`${API_BASE}/kitchen-station`, { headers });
        if (res.ok) {
          const json = await res.json();
          const list: Record<string, unknown>[] = Array.isArray(json) ? json : json.data || [];
          const mapped: BackendKitchenStation[] = list.map((s) => ({
            id: Number(s.id),
            name: String(s.name || ''),
            station_type: (s.stationType || s.station_type) as string | undefined,
            stationType: (s.stationType || s.station_type) as string | undefined,
            display_mode: (s.displayMode || s.display_mode || 'GRID') as 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID',
            displayMode: (s.displayMode || s.display_mode || 'GRID') as 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID',
            display_order: Number(s.displayOrder ?? s.display_order ?? s.id),
            displayOrder: Number(s.displayOrder ?? s.display_order ?? s.id),
            is_active: (s.isActive ?? s.is_active ?? true) as boolean,
            isActive: (s.isActive ?? s.is_active ?? true) as boolean,
            status: s.status as string | undefined,
          }));
          setKitchenStations(mapped.filter((s) => s.status !== 'deleted' && s.isActive !== false));
        }
      } catch (err) {
        console.warn('Could not load kitchen stations in KDS:', err);
      }
    };
    fetchStations();
  }, []);

  // 1-second countdown ticker for Held Items Pacing Timers
  useEffect(() => {
    const timer = setInterval(() => {
      setTickets((prevTickets) => {
        let anyAutoFired = false;
        let firedItemName = '';
        const firedItems: Array<{ id: string | number; name: string; table: string }> = [];

        const updated = prevTickets.map((ticket) => {
          let ticketUpdated = false;
          const updatedItems = ticket.items.map((item) => {
            if (item.preparationStatus === 'HELD' && item.holdRemainingSeconds !== undefined) {
              const nextSec = item.holdRemainingSeconds - 1;
              if (nextSec <= 0 && autoFireEnabled) {
                // Auto-fire triggered!
                anyAutoFired = true;
                firedItemName = item.name;
                firedItems.push({ id: item.id, name: item.name, table: ticket.table });
                ticketUpdated = true;

                return {
                  ...item,
                  preparationStatus: 'IN_PREPARATION' as PreparationStatus,
                  holdRemainingSeconds: 0,
                  firedAt: new Date().toISOString(),
                };
              }
              return {
                ...item,
                holdRemainingSeconds: Math.max(0, nextSec),
              };
            }
            return item;
          });

          if (ticketUpdated) {
            return {
              ...ticket,
              items: updatedItems,
              isPulsing: true,
              alertMessage: `AUTO-FIRED: ${firedItemName}`,
            };
          }
          return {
            ...ticket,
            items: updatedItems,
          };
        });

        if (anyAutoFired && firedItems.length > 0) {
          setTimeout(() => {
            const token = getAccessToken();
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            firedItems.forEach((f) => {
              fetch(`${API_BASE}/kitchen-order-items/${f.id}/fire`, {
                method: 'POST',
                headers,
              }).catch((e) => console.warn('Auto-fire backend sync failed:', e));
              triggerAlert(`⏱️ AUTO-PACING ALERT: ${f.name} on ${f.table} auto-fired to cook line!`, 'pacing');
            });
          }, 0);

          // Re-sort: Move auto-fired ticket to the top of the queue
          return [...updated].sort((a, b) => (b.isPulsing ? 1 : 0) - (a.isPulsing ? 1 : 0));
        }

        return updated;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoFireEnabled, triggerAlert]);

  // Cleanup pulsing animations after 4.5 seconds
  useEffect(() => {
    const pulsingTickets = tickets.filter((t) => t.isPulsing);
    if (pulsingTickets.length === 0) return;

    const timeout = setTimeout(() => {
      setTickets((prev) =>
        prev.map((t) => (t.isPulsing ? { ...t, isPulsing: false, alertMessage: null } : t))
      );
    }, 4500);

    return () => clearTimeout(timeout);
  }, [tickets]);

  // Fetch real tickets from backend on mount and periodically (live KDS polling)
  const fetchBackendOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${API_BASE}/kitchen-orders?limit=100&sortBy=priority&sortOrder=DESC`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data || [];
        const activeOrders = list.filter(
          (o: { businessStatus?: string; status?: string }) => o.businessStatus !== 'completed' && o.businessStatus !== 'cancelled' && o.status !== 'deleted'
        );

        const mapped: KitchenTicket[] = activeOrders.map((o: {
          id: string | number;
          createdAt?: string;
          startedAt?: string;
          order?: { diningTable?: { name?: string }; table_number?: string; waiter_name?: string; waiter?: { name?: string } };
          notes?: string;
          station?: { name?: string };
          priority?: number;
          items?: Array<{
            id: string | number;
            product?: { name?: string };
            productName?: string;
            variant?: { name?: string };
            variantName?: string;
            quantity?: number;
            notes?: string;
            course?: string;
            preparationStatus?: string;
            holdUntil?: string;
            firedAt?: string;
            fired_at?: string;
          }>;
          kitchenOrderItems?: Array<{
            id: string | number;
            product?: { name?: string };
            productName?: string;
            variant?: { name?: string };
            variantName?: string;
            quantity?: number;
            notes?: string;
            course?: string;
            preparationStatus?: string;
            holdUntil?: string;
            firedAt?: string;
            fired_at?: string;
          }>;
        }) => {
          const customerTimeRef = o.createdAt ? new Date(o.createdAt).getTime() : Date.now();
          const elapsedMins = Math.max(0, Math.floor((Date.now() - customerTimeRef) / 60000));
          const tableName = o.order?.diningTable?.name
            ? `Table ${o.order.diningTable.name}`
            : o.order?.table_number
            ? `Table ${o.order.table_number}`
            : o.notes?.split('•')?.[0]?.trim() || o.notes?.match(/Table \d+/i)?.[0] || (o.notes && o.notes.length <= 30 ? o.notes.trim() : null) || `Ticket #KO-${o.id}`;

          return {
            id: `KO-${o.id}`,
            backendOrderId: o.id,
            table: tableName,
            orderNotes: o.notes || null,
            timeElapsed: elapsedMins,
            createdAtMs: customerTimeRef,
            server: o.order?.waiter_name || o.order?.waiter?.name || 'Kitchen Staff',
            stationName: o.station?.name || 'General Kitchen',
            stationId: o.stationId ?? o.station?.id,
            priority: (o.priority ?? 0) >= 3 ? 'vip' : (o.priority ?? 0) === 2 ? 'urgent' : (o.priority ?? 0) === 1 ? 'high' : 'normal',
            items: (o.items || o.kitchenOrderItems || []).map((i) => {
              const prepStatusUpper = (i.preparationStatus || 'pending').toUpperCase() as PreparationStatus;
              let holdSeconds: number | undefined = undefined;
              if (prepStatusUpper === 'HELD') {
                if (i.holdUntil) {
                  holdSeconds = Math.max(0, Math.floor((new Date(i.holdUntil).getTime() - Date.now()) / 1000));
                } else {
                  const prioNum = o.priority ?? 0;
                  const defaultMins = prioNum >= 3 ? 1 : prioNum === 2 ? 4 : prioNum === 1 ? 7 : 10;
                  holdSeconds = defaultMins * 60;
                }
              }

              return {
                id: i.id,
                name: i.product?.name || i.productName || 'Dish Item',
                variantName: i.variant?.name || i.variantName || undefined,
                qty: i.quantity || 1,
                preparedQuantity: i.prepared_quantity ?? i.preparedQuantity ?? 0,
                notes: i.notes || undefined,
                course: ((i.course || 'MAIN_COURSE').toUpperCase()) as CourseType,
                preparationStatus: prepStatusUpper,
                holdRemainingSeconds: holdSeconds,
                firedAt: i.firedAt || i.fired_at,
              };
            }),
          };
        });

        setTickets(mapped);
      }
    } catch (err) {
      console.warn('Backend orders sync failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchBackendOrders(false);
    });
    const interval = setInterval(() => {
      fetchBackendOrders(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchBackendOrders]);

  // Escuchar evento global de reinicio KDS
  useEffect(() => {
    const handleReset = () => {
      fetchBackendOrders(true);
    };
    window.addEventListener('x7_kds_data_reset', handleReset);
    return () => window.removeEventListener('x7_kds_data_reset', handleReset);
  }, [fetchBackendOrders]);

  // Manual FIRE of an entire Course for a Ticket
  const handleFireCourse = async (ticketId: string, course: CourseType) => {
    const targetTicket = tickets.find((t) => t.id === ticketId);
    if (!targetTicket) return;

    // Send API call if backend ID is available
    if (targetTicket.backendOrderId) {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        await fetch(
          `${API_BASE}/kitchen-order-items/order/${targetTicket.backendOrderId}/fire-course?course=${course.toLowerCase()}`,
          { method: 'POST', headers }
        );
        fetchBackendOrders(true);
      } catch (e) {
        console.warn('Backend fire-course failed:', e);
      }
    }

    // Local reactive update + audio chime + amber pulsing + queue jump
    setTickets((prev) => {
      const updated = prev.map((t) => {
        if (t.id === ticketId) {
          const updatedItems = t.items.map((item) =>
            item.course === course && item.preparationStatus === 'HELD'
              ? {
                  ...item,
                  preparationStatus: 'IN_PREPARATION' as PreparationStatus,
                  holdRemainingSeconds: 0,
                  firedAt: new Date().toISOString(),
                }
              : item
          );
          return {
            ...t,
            items: updatedItems,
            isPulsing: true,
            alertMessage: `🔥 ${course.replace('_', ' ')} FIRED!`,
          };
        }
        return t;
      });

      // Move the fired ticket to the top of the queue
      const fired = updated.find((t) => t.id === ticketId);
      const rest = updated.filter((t) => t.id !== ticketId);
      return fired ? [fired, ...rest] : updated;
    });

    triggerAlert(`🔥 ${course.replace('_', ' ')} FIRED for ${targetTicket.table}! Moved to top of cook queue.`);
  };

  // Manual FIRE for an individual line item
  const handleFireSingleItem = async (ticketId: string, itemId: number, itemName: string) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch(`${API_BASE}/kitchen-order-items/${itemId}/fire`, { method: 'POST', headers });
      fetchBackendOrders(true);
    } catch (e) {
      console.warn('Backend fire-item failed:', e);
    }

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          return {
            ...t,
            isPulsing: true,
            alertMessage: `🔥 FIRED: ${itemName}`,
            items: t.items.map((i) =>
              i.id === itemId
                ? { ...i, preparationStatus: 'IN_PREPARATION' as PreparationStatus, holdRemainingSeconds: 0, firedAt: new Date().toISOString() }
                : i
            ),
          };
        }
        return t;
      })
    );

    triggerAlert(`🔥 FIRED: "${itemName}" released to station queue!`);
  };

  // Revert item back to PENDING queue (undo accidental start)
  const handleRevertItemToPending = async (ticketId: string, itemId: number, itemName: string) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch(`${API_BASE}/kitchen-order-items/${itemId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ preparationStatus: 'pending' }),
      });
    } catch (e) {
      console.warn('Backend revert-item failed:', e);
    }

    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              items: t.items.map((i) =>
                i.id === itemId ? { ...i, preparationStatus: 'PENDING' } : i
              ),
            }
          : t
      )
    );

    triggerAlert(`↩️ REVERTED: "${itemName}" returned to queue.`, 'pacing');
  };

  // Advance single item through: PENDING -> IN_PREPARATION -> READY
  const handleToggleItemReady = async (ticketId: string, itemId: number, currentStatus: PreparationStatus) => {
    let nextStatus: PreparationStatus;
    if (currentStatus === 'PENDING') {
      nextStatus = 'IN_PREPARATION';
    } else if (currentStatus === 'IN_PREPARATION') {
      nextStatus = 'READY';
    } else if (currentStatus === 'READY') {
      nextStatus = 'IN_PREPARATION';
    } else {
      nextStatus = 'PENDING';
    }
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch(`${API_BASE}/kitchen-order-items/${itemId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ preparationStatus: nextStatus.toLowerCase() }),
      });
    } catch (e) {
      console.warn('Backend toggle-item-ready failed:', e);
    }

    setTickets((prev) => {
      let shouldAutoDispatch = false;
      let targetBackendOrderId: number | undefined = undefined;

      const updated = prev.map((t) => {
        if (t.id === ticketId) {
          const updatedItems = t.items.map((i) =>
            i.id === itemId ? { ...i, preparationStatus: nextStatus } : i
          );

          if (
            activeDisplayMode === 'AUTO' &&
            nextStatus === 'READY' &&
            updatedItems.every((i) => i.preparationStatus === 'READY')
          ) {
            shouldAutoDispatch = true;
            targetBackendOrderId = t.backendOrderId;
          }

          return {
            ...t,
            items: updatedItems,
          };
        }
        return t;
      });

      if (shouldAutoDispatch) {
        setTimeout(() => {
          handleCompleteTicket(ticketId, targetBackendOrderId);
          triggerAlert(`⚡ AUTO-DISPATCHED Ticket #${ticketId} to Pass / Expo!`, 'fire');
        }, 400);
      }

      return updated;
    });
  };

  // Mark all pending units of a batch as READY in SUMMARY view
  const handleMarkBatchReady = async (batchItemName: string, batchVariant?: string) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const targetItems: Array<{ ticketId: string; itemId: number }> = [];
    filteredTickets.forEach((t) => {
      t.items.forEach((i) => {
        if (
          i.name === batchItemName &&
          i.variantName === batchVariant &&
          i.preparationStatus !== 'READY' &&
          (activeCourseFilter === 'ALL' || i.course === activeCourseFilter)
        ) {
          targetItems.push({ ticketId: t.id, itemId: i.id });
        }
      });
    });

    for (const ti of targetItems) {
      try {
        await fetch(`${API_BASE}/kitchen-order-items/${ti.itemId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ preparationStatus: 'ready' }),
        });
      } catch (e) {
        console.warn('Failed to mark batch item ready:', e);
      }
    }

    setTickets((prev) =>
      prev.map((t) => ({
        ...t,
        items: t.items.map((i) =>
          i.name === batchItemName &&
          i.variantName === batchVariant &&
          (activeCourseFilter === 'ALL' || i.course === activeCourseFilter)
            ? { ...i, preparationStatus: 'READY' }
            : i
        ),
      }))
    );

    triggerAlert(`✓ Batch of "${batchItemName}" marked READY!`);
  };

  // Release all held units of a batch directly to prep in SUMMARY view
  const handleFireBatchHeld = async (batchItemName: string, batchVariant?: string) => {
    const targetItems: Array<{ ticketId: string; itemId: number }> = [];
    filteredTickets.forEach((t) => {
      t.items.forEach((i) => {
        if (
          i.name === batchItemName &&
          i.variantName === batchVariant &&
          i.preparationStatus === 'HELD' &&
          (activeCourseFilter === 'ALL' || i.course === activeCourseFilter)
        ) {
          targetItems.push({ ticketId: t.id, itemId: i.id });
        }
      });
    });

    for (const ti of targetItems) {
      await handleFireSingleItem(ti.ticketId, ti.itemId, batchItemName);
    }
    triggerAlert(`🔥 Fired all held units of "${batchItemName}" to preparation!`);
  };

  // Start preparation for all queued (PENDING) units of a batch in SUMMARY view
  const handleStartBatchQueue = async (batchItemName: string, batchVariant?: string) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const targetItems: Array<{ ticketId: string; itemId: number }> = [];
    filteredTickets.forEach((t) => {
      t.items.forEach((i) => {
        if (
          i.name === batchItemName &&
          i.variantName === batchVariant &&
          i.preparationStatus === 'PENDING' &&
          (activeCourseFilter === 'ALL' || i.course === activeCourseFilter)
        ) {
          targetItems.push({ ticketId: t.id, itemId: i.id });
        }
      });
    });

    for (const ti of targetItems) {
      try {
        await fetch(`${API_BASE}/kitchen-order-items/${ti.itemId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ preparationStatus: 'in_preparation' }),
        });
      } catch (e) {
        console.warn('Failed to start queued batch item:', e);
      }
    }

    setTickets((prev) =>
      prev.map((t) => ({
        ...t,
        items: t.items.map((i) =>
          i.name === batchItemName &&
          i.variantName === batchVariant &&
          i.preparationStatus === 'PENDING' &&
          (activeCourseFilter === 'ALL' || i.course === activeCourseFilter)
            ? { ...i, preparationStatus: 'IN_PREPARATION' as PreparationStatus }
            : i
        ),
      }))
    );

    triggerAlert(`⚡ Started preparation for all queued units of "${batchItemName}"!`);
  };

  // Revert a completed batch back to cooking in SUMMARY view
  const handleRevertBatch = async (batchItemName: string, batchVariant?: string) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const targetItems: Array<{ ticketId: string; itemId: number }> = [];
    filteredTickets.forEach((t) => {
      t.items.forEach((i) => {
        if (
          i.name === batchItemName &&
          i.variantName === batchVariant &&
          i.preparationStatus === 'READY' &&
          (activeCourseFilter === 'ALL' || i.course === activeCourseFilter)
        ) {
          targetItems.push({ ticketId: t.id, itemId: i.id });
        }
      });
    });

    for (const ti of targetItems) {
      try {
        await fetch(`${API_BASE}/kitchen-order-items/${ti.itemId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ preparationStatus: 'in_preparation' }),
        });
      } catch (e) {
        console.warn('Failed to revert batch item ready:', e);
      }
    }

    setTickets((prev) =>
      prev.map((t) => ({
        ...t,
        items: t.items.map((i) =>
          i.name === batchItemName &&
          i.variantName === batchVariant &&
          i.preparationStatus === 'READY' &&
          (activeCourseFilter === 'ALL' || i.course === activeCourseFilter)
            ? { ...i, preparationStatus: 'IN_PREPARATION' as PreparationStatus }
            : i
        ),
      }))
    );

    triggerAlert(`↺ Reverted batch of "${batchItemName}" back to cooking!`, 'pacing');
  };

  // Toggle individual table item in SUMMARY view (HELD -> FIRE, COOKING -> READY, READY -> COOKING)
  const handleToggleSummaryTableItem = (
    tableItem: { ticketId: string; itemId: number; status: PreparationStatus },
    batchName: string
  ) => {
    if (tableItem.status === 'HELD') {
      handleFireSingleItem(tableItem.ticketId, tableItem.itemId, batchName);
    } else {
      handleToggleItemReady(tableItem.ticketId, tableItem.itemId, tableItem.status);
    }
  };

  // Interactive Batch Bumping Engine with FIFO Allocation (Historia X7P-4208)
  const handleBatchBumpFifo = async (
    productName: string,
    variantName?: string,
    bumpQuantity: number = 1
  ) => {
    if (bumpQuantity <= 0) return;

    let remainingToAllocate = bumpQuantity;
    let autoDispatchTicketId: string | null = null;
    let autoDispatchBackendOrderId: number | undefined = undefined;

    setTickets((prev) => {
      const orderedTicketIds = filteredTickets.map((t) => t.id);
      const ticketMap = new Map(prev.map((t) => [t.id, { ...t, items: [...t.items] }]));

      // 1. Asignar primero a los tickets visibles en su orden exacto de prioridad (filteredTickets)
      for (const tid of orderedTicketIds) {
        if (remainingToAllocate <= 0) break;
        const t = ticketMap.get(tid);
        if (!t) continue;

        let ticketModified = false;
        const newItems = t.items.map((item) => {
          if (remainingToAllocate <= 0) return item;

          const isMatch =
            item.name.trim().toLowerCase() === productName.trim().toLowerCase() &&
            (variantName
              ? item.variantName?.trim().toLowerCase() === variantName.trim().toLowerCase()
              : !item.variantName || item.variantName.trim().length === 0 || true) &&
            (activeCourseFilter === 'ALL' || item.course === activeCourseFilter) &&
            (item.preparationStatus === 'PENDING' || item.preparationStatus === 'IN_PREPARATION');

          if (!isMatch) return item;

          const currentPrepared = item.preparedQuantity || 0;
          const needed = Math.max(0, item.qty - currentPrepared);
          if (needed <= 0) return item;

          const bumpForThisItem = Math.min(remainingToAllocate, needed);
          remainingToAllocate -= bumpForThisItem;
          const newPrepared = currentPrepared + bumpForThisItem;
          const isNowReady = newPrepared >= item.qty;
          ticketModified = true;

          return {
            ...item,
            preparedQuantity: newPrepared,
            preparationStatus: isNowReady ? ('READY' as PreparationStatus) : ('IN_PREPARATION' as PreparationStatus),
          };
        });

        if (ticketModified) {
          if (
            activeDisplayMode === 'AUTO' &&
            newItems.every((i) => i.preparationStatus === 'READY')
          ) {
            autoDispatchTicketId = t.id;
            autoDispatchBackendOrderId = t.backendOrderId;
          }
          ticketMap.set(tid, { ...t, items: newItems });
        }
      }

      // 2. Si todavía queda cantidad por asignar, distribuir en los demás tickets no visibles
      if (remainingToAllocate > 0) {
        for (const [tid, t] of ticketMap.entries()) {
          if (remainingToAllocate <= 0) break;
          if (orderedTicketIds.includes(tid)) continue;

          let ticketModified = false;
          const newItems = t.items.map((item) => {
            if (remainingToAllocate <= 0) return item;

            const isMatch =
              item.name.trim().toLowerCase() === productName.trim().toLowerCase() &&
              (variantName
                ? item.variantName?.trim().toLowerCase() === variantName.trim().toLowerCase()
                : !item.variantName || item.variantName.trim().length === 0 || true) &&
              (activeCourseFilter === 'ALL' || item.course === activeCourseFilter) &&
              (item.preparationStatus === 'PENDING' || item.preparationStatus === 'IN_PREPARATION');

            if (!isMatch) return item;

            const currentPrepared = item.preparedQuantity || 0;
            const needed = Math.max(0, item.qty - currentPrepared);
            if (needed <= 0) return item;

            const bumpForThisItem = Math.min(remainingToAllocate, needed);
            remainingToAllocate -= bumpForThisItem;
            const newPrepared = currentPrepared + bumpForThisItem;
            const isNowReady = newPrepared >= item.qty;
            ticketModified = true;

            return {
              ...item,
              preparedQuantity: newPrepared,
              preparationStatus: isNowReady ? ('READY' as PreparationStatus) : ('IN_PREPARATION' as PreparationStatus),
            };
          });

          if (ticketModified) {
            ticketMap.set(tid, { ...t, items: newItems });
          }
        }
      }

      return prev.map((t) => ticketMap.get(t.id) || t);
    });

    if (audioChimeEnabled) {
      playKitchenFireChime();
    }
    const displayName = `${bumpQuantity}x ${productName}${variantName ? ` (${variantName})` : ''}`;
    triggerAlert(`🍳 BATCH COOKED: +${displayName} bumped to oldest order (FIFO)!`, 'fire');

    if (autoDispatchTicketId) {
      const tid = autoDispatchTicketId;
      const bId = autoDispatchBackendOrderId;
      setTimeout(() => {
        handleCompleteTicket(tid, bId);
        triggerAlert(`⚡ AUTO-DISPATCHED Ticket #${tid} to Pass / Expo!`, 'fire');
      }, 400);
    }

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      let targetStationId: number | undefined = undefined;
      if (selectedStationFilter !== 'ALL') {
        const matched = kitchenStations.find(
          (s) => s.name.trim().toLowerCase() === selectedStationFilter.trim().toLowerCase()
        );
        if (matched) targetStationId = matched.id;
      }

      await fetch(`${API_BASE}/kitchen-order-items/batch-bump-fifo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stationId: targetStationId,
          productName,
          variantName: variantName || undefined,
          bumpQuantity,
        }),
      });

      setTimeout(() => {
        fetchBackendOrders(true);
      }, 400);
    } catch (err) {
      console.warn('Backend batch-bump-fifo call failed:', err);
    }
  };

  // Complete and bump entire ticket in backend & UI (Historia X7P-4209)
  const handleCompleteTicket = async (id: string, backendOrderId?: number) => {
    const targetTicket = tickets.find((t) => t.id === id);
    if (targetTicket && backendOrderId) {
      setLastBumpedOrder({
        id: backendOrderId,
        table: targetTicket.table,
        server: targetTicket.server,
        stationName: targetTicket.stationName,
        stationId: targetTicket.stationId,
        startedAt: targetTicket.createdAtMs ? new Date(targetTicket.createdAtMs).toISOString() : new Date().toISOString(),
        completedAt: new Date().toISOString(),
        items: targetTicket.items.map((it) => ({
          id: it.id,
          productName: it.name,
          variantName: it.variantName,
          quantity: it.qty,
          course: it.course,
          notes: it.notes,
        })),
      });
      setUndoToast({ id, backendOrderId, table: targetTicket.table });
      setTimeout(() => {
        setUndoToast((curr) => (curr?.backendOrderId === backendOrderId ? null : curr));
      }, 7000);
    }

    if (backendOrderId) {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        await fetch(`${API_BASE}/kitchen-orders/${backendOrderId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ businessStatus: 'completed' }),
        });
      } catch (e) {
        console.warn('Backend bump order failed:', e);
      }
    }
    setTickets((prev) => prev.filter((ticket) => ticket.id !== id));
    triggerAlert(`✓ Ticket #${id} BUMPED & SERVED!`);
  };

  // Immediate 1-Tap Undo Action for Accidental Bump
  const handleImmediateRecall = async (backendOrderId: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch(`${API_BASE}/kitchen-orders/${backendOrderId}/recall`, {
        method: 'POST',
        headers,
      });
      setUndoToast(null);
      triggerAlert(`↺ Ticket #${backendOrderId} RESTORED to active screen!`, 'fire');
      fetchBackendOrders(true);
    } catch (e) {
      console.warn('Immediate recall failed:', e);
    }
  };

  // Trigger immediate auto-pacing run
  const handleRunAutoPacingNow = async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch(`${API_BASE}/kitchen-order-items/auto-pacing/tick`, { method: 'POST', headers });
      fetchBackendOrders(true);
    } catch (e) {
      console.warn('Auto-pacing tick failed:', e);
    }

    // Force expire any item with <= 60s remaining for quick test/demo
    setTickets((prev) =>
      prev.map((t) => ({
        ...t,
        items: t.items.map((i) =>
          i.preparationStatus === 'HELD'
            ? { ...i, preparationStatus: 'IN_PREPARATION', holdRemainingSeconds: 0, firedAt: new Date().toISOString() }
            : i
        ),
      }))
    );

    triggerAlert('⚡ All held courses forced & released to line cook stations!');
    setIsPacingDrawerOpen(false);
  };

  const formatCountdown = (seconds?: number) => {
    if (seconds === undefined || seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getPriorityBadge = (priority: KitchenTicket['priority']) => {
    switch (priority) {
      case 'vip':
        return {
          border: 'border-fuchsia-500',
          badge: 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/50 font-black animate-pulse',
          label: 'VIP RUSH (+3)',
        };
      case 'urgent':
        return {
          border: 'border-red-500',
          badge: 'bg-red-500/20 text-red-400 border border-red-500/40 font-black',
          label: 'URGENT (+2)',
        };
      case 'high':
        return {
          border: 'border-amber-500',
          badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold',
          label: 'HIGH (+1)',
        };
      case 'normal':
      default:
        return {
          border: 'border-zinc-700',
          badge: 'bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold',
          label: 'NORMAL (0)',
        };
    }
  };

  const getCourseTheme = (course: CourseType) => {
    switch (course) {
      case 'APPETIZER':
        return {
          title: 'APPETIZERS / STARTERS',
          icon: 'restaurant',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          fireLabel: 'FIRE APPS',
          prepVerb: 'PREP',
          prepIcon: 'restaurant',
          inPrepLabel: 'TO PREP',
        };
      case 'MAIN_COURSE':
        return {
          title: 'MAIN COURSES',
          icon: 'lunch_dining',
          badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
          fireLabel: 'FIRE MAINS',
          prepVerb: 'COOK',
          prepIcon: 'skillet',
          inPrepLabel: 'TO COOK',
        };
      case 'DESSERT':
        return {
          title: 'DESSERTS',
          icon: 'cake',
          badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          fireLabel: 'FIRE DESSERTS',
          prepVerb: 'PREP',
          prepIcon: 'cake',
          inPrepLabel: 'TO PREP',
        };
      case 'BEVERAGE':
        return {
          title: 'BEVERAGES',
          icon: 'local_bar',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          fireLabel: 'FIRE DRINKS',
          prepVerb: 'POUR',
          prepIcon: 'local_bar',
          inPrepLabel: 'TO POUR',
        };
    }
  };

  const getTicketStationMode = useCallback(
    (t: KitchenTicket): 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID' => {
      const st = kitchenStations.find(
        (s) =>
          (t.stationId && s.id === t.stationId) ||
          (t.stationName && s.name && s.name.trim().toLowerCase() === t.stationName.trim().toLowerCase())
      );
      return st?.display_mode || st?.displayMode || 'GRID';
    },
    [kitchenStations]
  );

  // Effective station name for current active view mode (derived state, reactive and without cascading renders)
  const effectiveStationFilter = useMemo(() => {
    if (activeKdsView === 'EXPO') {
      return selectedStationFilter;
    }
    const matched = kitchenStations.filter(
      (s) => (s.display_mode || s.displayMode) === activeKdsView
    );
    const isMatching = matched.some(
      (s) => s.name.trim().toLowerCase() === selectedStationFilter.trim().toLowerCase()
    );
    if (!isMatching && matched.length > 0) {
      return matched[0].name;
    }
    return selectedStationFilter;
  }, [activeKdsView, kitchenStations, selectedStationFilter]);

  // Resolver estación activa para el Recall Tray garantizando aislamiento por estación
  const resolvedStation = useMemo(() => {
    if (activeKdsView === 'EXPO') {
      if (effectiveStationFilter === 'ALL') return { id: 'ALL' as const, name: 'All Stations' };
      const st = kitchenStations.find(
        (s) => s.name.trim().toLowerCase() === effectiveStationFilter.trim().toLowerCase()
      );
      return st ? { id: st.id, name: st.name } : { id: 'ALL' as const, name: 'All Stations' };
    }
    // Para vistas específicas (MANUAL, AUTO, SUMMARY, GRID):
    const stByName = kitchenStations.find(
      (s) => s.name.trim().toLowerCase() === effectiveStationFilter.trim().toLowerCase()
    );
    if (stByName) return { id: stByName.id, name: stByName.name };
    const stByMode = kitchenStations.find(
      (s) => (s.display_mode || s.displayMode) === activeKdsView
    );
    if (stByMode) return { id: stByMode.id, name: stByMode.name };
    return { id: 'ALL' as const, name: 'All Stations' };
  }, [activeKdsView, effectiveStationFilter, kitchenStations]);

  // Filtered and dynamically prioritized tickets with SLA Critical Shield
  const filteredTickets = (() => {
    const matched = tickets.filter((t) => {
      // 1. Filtrar por Estación y Vista KDS:
      if (activeKdsView === 'EXPO') {
        if (effectiveStationFilter !== 'ALL' && t.stationName !== effectiveStationFilter) {
          return false;
        }
      } else {
        if (effectiveStationFilter !== 'ALL') {
          if (t.stationName !== effectiveStationFilter) return false;
        } else {
          const stMode = getTicketStationMode(t);
          if (stMode !== activeKdsView) return false;
        }
      }

      if (activeCourseFilter === 'ALL') return true;
      return t.items.some((i) => i.course === activeCourseFilter);
    });

    // 1. Separar tickets con pulso activo (recién fired / bumped van al frente)
    const pulsing: KitchenTicket[] = [];
    const nonPulsing: KitchenTicket[] = [];

    matched.forEach((t) => {
      if (t.isPulsing) pulsing.push(t);
      else nonPulsing.push(t);
    });

    const prioScoreMap: Record<KitchenTicket['priority'], number> = {
      vip: 30,
      urgent: 20,
      high: 10,
      normal: 0,
    };

    // 2. Ordenar cronológicamente por momento de creación (orden de llegada FIFO)
    nonPulsing.sort((a, b) => {
      const timeA = a.createdAtMs ?? 0;
      const timeB = b.createdAtMs ?? 0;
      if (timeA !== timeB) return timeA - timeB;
      return (a.backendOrderId ?? 0) - (b.backendOrderId ?? 0);
    });

    // 3. Simulación de cola en tiempo real con Escudo SLA:
    // - Una orden que alcanza 15 min NO salta hacia adelante por encima de órdenes que ya estaban antes en la cola.
    // - Se queda exactamente donde está, pero activa el Escudo SLA: ninguna orden creada después de ese momento
    //   puede colocarse por delante de ella (la protege contra nuevas órdenes VIP, Urgent o High entrantes).
    const queue: KitchenTicket[] = [];

    for (const item of nonPulsing) {
      const itemTime = item.createdAtMs ?? 0;
      const isPreparingItem = item.items.some(
        (i) => i.preparationStatus === 'PENDING' || i.preparationStatus === 'IN_PREPARATION'
      );
      const itemScore = (prioScoreMap[item.priority] || 0) * 10 + (isPreparingItem ? 1 : 0);

      // Determinar la barrera mínima permitida: debe ser posterior a cualquier orden que YA tenía SLA
      // (espera >= criticalSlaMinutes) al momento en que esta nueva orden fue creada.
      let minInsertIndex = 0;
      for (let i = 0; i < queue.length; i++) {
        const qTime = queue[i].createdAtMs ?? 0;
        const waitingAtArrival = itemTime - qTime;
        if (waitingAtArrival >= criticalSlaMinutes * 60 * 1000) {
          minInsertIndex = i + 1;
        }
      }

      // Dentro del rango permitido (>= minInsertIndex), si la orden entrante tiene MAYOR prioridad
      // que la orden en esa posición, se adelanta a ella. Si tiene igual o menor prioridad, se ubica detrás (FIFO).
      let insertIndex = queue.length;
      for (let i = minInsertIndex; i < queue.length; i++) {
        const q = queue[i];
        const isPreparingQ = q.items.some(
          (it) => it.preparationStatus === 'PENDING' || it.preparationStatus === 'IN_PREPARATION'
        );
        const qScore = (prioScoreMap[q.priority] || 0) * 10 + (isPreparingQ ? 1 : 0);
        if (itemScore > qScore) {
          insertIndex = i;
          break;
        }
      }

      queue.splice(insertIndex, 0, item);
    }

    return [...pulsing, ...queue];
  })();

  const visibleStations = useMemo(() => {
    if (activeKdsView === 'EXPO') {
      const set = new Set<string>();
      kitchenStations.forEach((s) => {
        if (s.name) set.add(s.name);
      });
      tickets.forEach((t) => {
        if (t.stationName) set.add(t.stationName);
      });
      return Array.from(set);
    }

    // Filtrar estrictamente solo las estaciones configuradas en el modo de la vista activa
    const set = new Set<string>();
    kitchenStations
      .filter((s) => (s.display_mode || s.displayMode) === activeKdsView)
      .forEach((s) => {
        if (s.name) set.add(s.name);
      });

    tickets.forEach((t) => {
      if (t.stationName && getTicketStationMode(t) === activeKdsView) {
        set.add(t.stationName);
      }
    });

    return Array.from(set);
  }, [activeKdsView, kitchenStations, tickets, getTicketStationMode]);

  const handleViewSwitch = (view: KdsView) => {
    setActiveKdsView(view);
    if (view === 'EXPO') {
      setSelectedStationFilter('ALL');
      setActiveDisplayMode('GRID');
    } else {
      setActiveDisplayMode(view);
      const matchedStations = kitchenStations.filter(
        (s) => (s.display_mode || s.displayMode) === view
      );
      const isCurrentMatching = matchedStations.some(
        (s) => s.name.trim().toLowerCase() === selectedStationFilter.trim().toLowerCase()
      );
      if (!isCurrentMatching) {
        if (matchedStations.length > 0) {
          setSelectedStationFilter(matchedStations[0].name);
        } else {
          setSelectedStationFilter('ALL');
        }
      }
    }
  };

  const handleStationChange = (stationName: string) => {
    setSelectedStationFilter(stationName);
    if (stationName === 'ALL') {
      setActiveKdsView('EXPO');
      setActiveDisplayMode('GRID');
    } else {
      const matched = kitchenStations.find(
        (s) => s.name.trim().toLowerCase() === stationName.trim().toLowerCase()
      );
      const targetMode = matched?.display_mode || matched?.displayMode;
      if (targetMode) {
        setActiveKdsView(targetMode);
        setActiveDisplayMode(targetMode);
      }
    }
  };

  // Aggregated items for SUMMARY VIEW (batch preparation)
  const aggregatedSummary = (() => {
    interface AggregatedSummaryTable {
      ticketId: string;
      itemId: number;
      table: string;
      qty: number;
      status: PreparationStatus;
    }

    interface AggregatedSummaryItem {
      key: string;
      name: string;
      variantName?: string;
      course: CourseType;
      totalQty: number;
      pendingQty: number;
      inPrepQty: number;
      heldQty: number;
      readyQty: number;
      notes: string[];
      tables: AggregatedSummaryTable[];
    }
    const map = new Map<string, AggregatedSummaryItem>();

    filteredTickets.forEach((t) => {
      t.items.forEach((item) => {
        if (activeCourseFilter !== 'ALL' && item.course !== activeCourseFilter) {
          return;
        }
        const key = `${item.name.trim()}__${item.variantName?.trim() || ''}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            name: item.name,
            variantName: item.variantName,
            course: item.course,
            totalQty: 0,
            pendingQty: 0,
            inPrepQty: 0,
            heldQty: 0,
            readyQty: 0,
            notes: [],
            tables: [],
          });
        }
        const record = map.get(key)!;
        record.totalQty += item.qty;
        if (item.preparationStatus === 'READY') {
          record.readyQty += item.qty;
        } else if (item.preparationStatus === 'HELD') {
          record.heldQty += item.qty;
        } else if (item.preparationStatus === 'IN_PREPARATION') {
          record.inPrepQty += item.qty;
        } else {
          record.pendingQty += item.qty;
        }
        if (item.notes && !record.notes.includes(item.notes)) {
          record.notes.push(item.notes);
        }
        record.tables.push({
          ticketId: t.id,
          itemId: item.id,
          table: t.table,
          qty: item.qty,
          status: item.preparationStatus,
        });
      });
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        b.inPrepQty + b.pendingQty + b.heldQty - (a.inPrepQty + a.pendingQty + a.heldQty)
    );
  })();

  // Real-Time All-Day Batch Aggregation across active station tickets (Historia X7P-4208)
  const allDaySummary = (() => {
    interface AllDayAggregatedItem {
      key: string;
      productName: string;
      variantName?: string;
      course: CourseType;
      totalNeeded: number;
      totalOrdered: number;
      totalPrepared: number;
      modifiers: Array<{ note: string; count: number }>;
    }

    const map = new Map<string, AllDayAggregatedItem>();
    let totalNeededCount = 0;

    filteredTickets.forEach((ticket) => {
      ticket.items.forEach((item) => {
        if (activeCourseFilter !== 'ALL' && item.course !== activeCourseFilter) {
          return;
        }
        if (item.preparationStatus !== 'PENDING' && item.preparationStatus !== 'IN_PREPARATION') {
          return;
        }

        const currentPrepared = item.preparedQuantity || 0;
        const needed = Math.max(0, item.qty - currentPrepared);
        if (needed <= 0) return;

        totalNeededCount += needed;
        const key = `${item.name.trim().toLowerCase()}__${(item.variantName || '').trim().toLowerCase()}`;

        if (!map.has(key)) {
          map.set(key, {
            key,
            productName: item.name,
            variantName: item.variantName,
            course: item.course,
            totalNeeded: 0,
            totalOrdered: 0,
            totalPrepared: 0,
            modifiers: [],
          });
        }

        const entry = map.get(key)!;
        entry.totalNeeded += needed;
        entry.totalOrdered += item.qty;
        entry.totalPrepared += currentPrepared;

        if (item.notes && item.notes.trim().length > 0) {
          const noteText = item.notes.trim();
          const existingMod = entry.modifiers.find(
            (m) => m.note.toLowerCase() === noteText.toLowerCase()
          );
          if (existingMod) {
            existingMod.count += needed;
          } else {
            entry.modifiers.push({ note: noteText, count: needed });
          }
        }
      });
    });

    const items = Array.from(map.values()).sort((a, b) => b.totalNeeded - a.totalNeeded);
    return {
      items,
      totalNeededCount,
    };
  })();

  // Active ticket for MANUAL QUEUE view
  const activeManualTicket = (() => {
    if (manualActiveTicketId) {
      const found = filteredTickets.find((t) => t.id === manualActiveTicketId);
      if (found) return found;
    }
    return filteredTickets[0] || null;
  })();

  // Reusable Ticket Card Renderer
  const renderTicketCard = (ticket: KitchenTicket, isFullWidth: boolean = false) => {
    const pColors = getPriorityBadge(ticket.priority);
    const coursesPresent: CourseType[] = ['BEVERAGE', 'APPETIZER', 'MAIN_COURSE', 'DESSERT'];
    const isCompact = cardDensity === 'compact';
    const isSpacious = cardDensity === 'spacious';
    const cleanOrderNotes = (() => {
      if (!ticket.orderNotes) return null;
      const trimmed = ticket.orderNotes.trim();
      if (/^Table\s+\d+\s*•\s*Station\s*#/i.test(trimmed)) return null;
      if (trimmed.toLowerCase() === ticket.table.toLowerCase()) return null;
      return trimmed;
    })();

    const cardWidthClass = isFullWidth
      ? 'w-full h-full'
      : isCompact
      ? 'w-64 h-full max-h-[85vh] flex-shrink-0'
      : isSpacious
      ? 'w-80 h-full max-h-[85vh] flex-shrink-0'
      : 'w-72 h-full max-h-[85vh] flex-shrink-0';

    return (
      <div
        key={ticket.id}
        className={`${cardWidthClass} bg-[#1a1b20] border-t-4 ${pColors.border} border-x border-b border-zinc-800 rounded-xl flex flex-col shadow-2xl transition-all duration-300 ${
          ticket.isPulsing
            ? 'ring-4 ring-amber-500 bg-amber-950/30 animate-pulse shadow-amber-500/50'
            : 'hover:border-zinc-700'
        }`}
      >
        {/* Ticket Header Card */}
        <div className={`${isCompact ? 'p-2' : 'p-2.5'} border-b border-zinc-800 bg-[#212228] rounded-t-lg flex justify-between items-start shrink-0`}>
          <div className="min-w-0 flex-1 pr-2">
            <h2 className={`font-black ${isCompact ? 'text-xs' : 'text-sm'} text-white tracking-tight truncate whitespace-nowrap`} style={{ color: '#ffffff' }}>
              {ticket.table}
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className={`text-[8px] px-1.5 py-0.2 rounded font-black uppercase tracking-wider ${pColors.badge}`}>
                {pColors.label}
              </span>
              {activeDisplayMode === 'AUTO' && (
                <span className="text-[8px] px-1.5 py-0.2 rounded font-black uppercase tracking-wider bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[9px]">bolt</span>
                  AUTO
                </span>
              )}
              {ticket.timeElapsed >= criticalSlaMinutes && (
                <span className="text-[8px] px-1.5 py-0.2 rounded font-black uppercase tracking-wider bg-red-600 text-white border border-red-500 flex items-center gap-0.5 animate-pulse shadow-xs">
                  <span className="material-symbols-outlined text-[9px]">shield</span>
                  SLA
                </span>
              )}
            </div>
            <p className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} font-semibold mt-0.5 text-zinc-400 truncate`}>
              #{ticket.id} • {ticket.stationName || 'Line'}{ticket.server && ticket.server !== 'Kitchen Staff' ? ` • ${ticket.server}` : ''}
            </p>
            {cleanOrderNotes && (
              <p className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} text-amber-300 font-medium truncate mt-0.5 flex items-center gap-1`}>
                <span className="material-symbols-outlined text-[12px] text-amber-400 shrink-0">edit_note</span>
                <span className="truncate">{cleanOrderNotes}</span>
              </p>
            )}
          </div>

          <div className="text-right shrink-0">
            <p
              className={`font-mono font-black ${isCompact ? 'text-sm' : 'text-base'} leading-tight ${
                ticket.timeElapsed >= 12
                  ? 'text-red-400 animate-pulse'
                  : ticket.timeElapsed >= 8
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {ticket.timeElapsed}m
            </p>
            <p className="text-[8px] uppercase font-black tracking-wider text-zinc-500">ELAPSED</p>
          </div>
        </div>

        {/* Ticket Body: Course Sequences */}
        <div className={`flex-1 overflow-y-auto ${isCompact ? 'p-2 space-y-1.5' : 'p-2.5 space-y-2'} custom-scrollbar`}>
          {(() => {
            const availableCourses =
              activeCourseFilter === 'ALL'
                ? coursesPresent
                : coursesPresent.filter((c) => c === activeCourseFilter);

            const sortedCourses = [...availableCourses].sort((c1, c2) => {
              const items1 = ticket.items.filter((i) => i.course === c1);
              const items2 = ticket.items.filter((i) => i.course === c2);
              if (items1.length === 0 && items2.length === 0) return 0;
              if (items1.length === 0) return 1;
              if (items2.length === 0) return -1;

              const active1 = items1.some((i) => i.preparationStatus === 'PENDING' || i.preparationStatus === 'IN_PREPARATION');
              const active2 = items2.some((i) => i.preparationStatus === 'PENDING' || i.preparationStatus === 'IN_PREPARATION');
              if (active1 && !active2) return -1;
              if (!active1 && active2) return 1;

              return coursesPresent.indexOf(c1) - coursesPresent.indexOf(c2);
            });

            return sortedCourses.map((courseType) => {
              const itemsInCourse = ticket.items.filter((i) => i.course === courseType);
              if (itemsInCourse.length === 0) return null;

              const sortedItemsInCourse = [...itemsInCourse].sort((i1, i2) => {
                const rank = (s: PreparationStatus) => {
                  if (s === 'PENDING' || s === 'IN_PREPARATION') return 1;
                  if (s === 'READY') return 2;
                  if (s === 'HELD') return 3;
                  return 4;
                };
                return rank(i1.preparationStatus) - rank(i2.preparationStatus);
              });

              const theme = getCourseTheme(courseType);
              const hasHeldItems = sortedItemsInCourse.some((i) => i.preparationStatus === 'HELD');

              return (
                <div key={courseType} className={`border border-zinc-800/80 rounded-lg ${isCompact ? 'p-1.5' : 'p-2'} bg-zinc-900/40`}>
                  {/* Course Header with Quick FIRE Button */}
                  <div className={`flex items-center justify-between ${isCompact ? 'mb-1 pb-0.5' : 'mb-1.5 pb-1'} border-b border-zinc-800`}>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-xs text-zinc-400">{theme.icon}</span>
                      <span className={`${isCompact ? 'text-[8px]' : 'text-[9px]'} font-black uppercase tracking-wider px-1.5 py-0.2 rounded border ${theme.badge}`}>
                        {theme.title}
                      </span>
                    </div>

                    {hasHeldItems && (
                      <button
                        onClick={() => handleFireCourse(ticket.id, courseType)}
                        className={`px-1.5 py-0.5 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-black ${isCompact ? 'text-[8px]' : 'text-[9px]'} uppercase tracking-wider rounded transition-all flex items-center gap-0.5 cursor-pointer shadow-xs active:scale-95`}
                      >
                        <span className="material-symbols-outlined text-[10px]">local_fire_department</span>
                        <span>{theme.fireLabel}</span>
                      </button>
                    )}
                  </div>

                  {/* Items in this course */}
                  <div className={isCompact ? 'space-y-1' : 'space-y-1.5'}>
                    {sortedItemsInCourse.map((item) => {
                      const isHeld = item.preparationStatus === 'HELD';
                      const isPending = item.preparationStatus === 'PENDING';
                      const isInPrep = item.preparationStatus === 'IN_PREPARATION';
                      const isReady = item.preparationStatus === 'READY';

                      return (
                        <div
                          key={item.id}
                          className={`group relative rounded-lg ${isCompact ? 'p-1.5' : 'p-2'} transition-all duration-200 border shadow-xs ${
                            isHeld
                              ? 'bg-amber-950/25 border-dashed border-amber-500/50 backdrop-blur-xs'
                              : isReady
                              ? 'bg-emerald-950/30 border-emerald-500/40'
                              : isInPrep
                              ? 'bg-blue-950/30 border-blue-500/50 hover:border-blue-400'
                              : 'bg-zinc-800/80 border-zinc-700/70 hover:border-amber-500/50 hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            {/* Left: Quantity Badge + Dish Info */}
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <span
                                className={`${isCompact ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-[11px]'} rounded-md flex items-center justify-center font-mono font-black shrink-0 shadow-xs ${
                                  isHeld
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : isReady
                                    ? 'bg-emerald-500 text-white shadow-emerald-950/50'
                                    : isInPrep
                                    ? 'bg-blue-500 text-white shadow-blue-950/50'
                                    : 'bg-zinc-700 text-zinc-200 border border-zinc-500/80'
                                }`}
                                title={`Qty: ${item.qty}`}
                              >
                                {item.qty}
                              </span>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <span
                                    className={`${isCompact ? 'text-[11px]' : 'text-xs'} font-bold tracking-tight leading-snug break-words ${
                                      isReady ? 'text-emerald-300/60 line-through' : 'text-white'
                                    }`}
                                    style={{ color: isReady ? '#a7f3d0' : '#ffffff' }}
                                  >
                                    {item.name}
                                  </span>

                                  {item.variantName && (
                                    <span className="text-[10px] font-normal text-zinc-400">
                                      ({item.variantName})
                                    </span>
                                  )}

                                  {item.preparedQuantity !== undefined && item.preparedQuantity > 0 && !isReady && (
                                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                                      <span className="material-symbols-outlined text-[9px]">skillet</span>
                                      <span>{item.preparedQuantity}/{item.qty} PREP</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              {isHeld ? (
                                <div className="flex items-center gap-1">
                                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded text-[8px] font-black uppercase tracking-wider">
                                    <span className="material-symbols-outlined text-[9px]">lock</span>
                                    HELD
                                  </span>
                                  <button
                                    onClick={() => handleFireSingleItem(ticket.id, item.id, item.name)}
                                    title={`Fire directly to ${theme.prepVerb.toLowerCase()} (In Prep)`}
                                    className="px-2 py-0.5 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white rounded text-[8.5px] font-black uppercase tracking-wider transition-all flex items-center gap-0.5 cursor-pointer shadow-xs active:scale-95"
                                  >
                                    <span className="material-symbols-outlined text-[9px]">local_fire_department</span>
                                    FIRE
                                  </button>
                                </div>
                              ) : isPending ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleToggleItemReady(ticket.id, item.id, item.preparationStatus)}
                                    title={`Start ${theme.prepVerb.toLowerCase()} (Move to IN PREP)`}
                                    className="h-6 px-2 rounded text-[8.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50"
                                  >
                                    <span className="material-symbols-outlined text-[10px]">{theme.prepIcon}</span>
                                    <span>{theme.prepVerb}</span>
                                  </button>
                                </div>
                              ) : isInPrep ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleToggleItemReady(ticket.id, item.id, item.preparationStatus)}
                                    title="Mark as READY"
                                    className="h-6 px-2 rounded text-[8.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50"
                                  >
                                    <span className="material-symbols-outlined text-[10px]">check_circle</span>
                                    <span>READY</span>
                                  </button>
                                  <button
                                    onClick={() => handleRevertItemToPending(ticket.id, item.id, item.name)}
                                    title="Revert to Queue (Undo)"
                                    className="h-6 w-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-amber-400 border border-zinc-700/80 transition-colors cursor-pointer flex items-center justify-center shadow-xs active:scale-95"
                                  >
                                    <span className="material-symbols-outlined text-[10px]">undo</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleToggleItemReady(ticket.id, item.id, item.preparationStatus)}
                                    title="Revert back to PREP"
                                    className="h-6 px-2 rounded text-[8.5px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 bg-emerald-700/50 hover:bg-emerald-600 text-emerald-200 border border-emerald-500/40"
                                  >
                                    <span className="material-symbols-outlined text-[10px]">check_circle</span>
                                    <span>DONE</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Full-width Special Kitchen Note Callout */}
                          {item.notes && (
                            <div className="mt-1 flex items-start gap-1 text-[10px] text-amber-300 font-medium leading-tight pl-1.5 border-l-2 border-amber-500/60">
                              <span className="italic break-words">{item.notes}</span>
                            </div>
                          )}

                          {isHeld && (
                            <div className={`${isCompact ? 'mt-1 pt-1 text-[9px]' : 'mt-1.5 pt-1 text-[9.5px]'} border-t border-amber-500/20 flex items-center justify-between`}>
                              <span className="text-zinc-400 font-medium flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px] text-amber-400">schedule</span>
                                Pacing Window:
                              </span>
                              <span className="font-mono font-bold text-amber-300 text-[9px] flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                Auto-Fire: {formatCountdown(item.holdRemainingSeconds)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        {/* Ticket Footer Action Button */}
        <div className={`${isCompact ? 'p-1.5' : 'p-2'} border-t border-zinc-800 bg-[#212228] rounded-b-lg shrink-0`}>
          <button
            onClick={() => handleCompleteTicket(ticket.id, ticket.backendOrderId)}
            className={`w-full ${isCompact ? 'py-1 text-[10px]' : 'py-1.5 text-[11px]'} bg-zinc-800 hover:bg-emerald-600 text-white font-black uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-inner`}
          >
            <span className="material-symbols-outlined text-xs">done_all</span>
            <span>BUMP &amp; SERVE TICKET</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#121316] z-50 flex flex-col font-sans text-white select-none overflow-hidden">
      {/* 1. KDS Executive Header & Live Pacing Strip */}
      <header className="h-16 bg-[#1a1b20] border-b-2 border-[#ae001a] px-6 flex justify-between items-center shrink-0 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="material-symbols-outlined text-[#ae001a] text-2xl">table_restaurant</span>
          </div>
          <div>
            <h1 className="font-sans text-base sm:text-lg font-black tracking-wider flex items-center gap-2 text-white" style={{ color: '#ffffff' }}>
              <span className="text-white font-black text-base sm:text-lg" style={{ color: '#ffffff' }}>
                {activeKdsView === 'EXPO'
                  ? 'EXPEDITER KDS DISPLAY'
                  : activeDisplayMode === 'SUMMARY'
                  ? 'KDS PRODUCTION SUMMARY'
                  : activeDisplayMode === 'MANUAL'
                  ? 'KDS MANUAL QUEUE'
                  : activeDisplayMode === 'AUTO'
                  ? 'KDS AUTO-DISPATCH LINE'
                  : 'KDS GRID MATRIX'}
              </span>
            </h1>
            <p className="text-[11px] text-zinc-300 font-bold hidden sm:block" style={{ color: '#d4d4d8' }}>
              View: <strong className="text-amber-400">{activeKdsView}</strong> • Mode: <strong className="text-emerald-400">{activeDisplayMode}</strong> • Hold/Fire Staging Engine
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Station Filter - Filtered to active view mode */}
          <div className="flex items-center bg-zinc-800/90 hover:bg-zinc-800 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs gap-1.5 shadow-inner">
            <span className="material-symbols-outlined text-sm text-amber-400">soup_kitchen</span>
            <select
              value={effectiveStationFilter}
              onChange={(e) => handleStationChange(e.target.value)}
              aria-label="Filter by kitchen station"
              className="bg-transparent text-white font-bold outline-none cursor-pointer text-xs max-w-[140px] sm:max-w-[200px] truncate"
            >
              {activeKdsView === 'EXPO' && (
                <option value="ALL" className="bg-zinc-900 text-white">All Stations (Expo)</option>
              )}
              {visibleStations.map((st) => {
                const matched = kitchenStations.find((s) => s.name.trim().toLowerCase() === st.trim().toLowerCase());
                const targetMode = matched?.display_mode || matched?.displayMode;
                const modeLabel = targetMode ? ` • ${targetMode}` : '';
                return (
                  <option key={st} value={st} className="bg-zinc-900 text-white">
                    {st}{modeLabel}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 5 KDS Views Switcher: EXPO + 4 Display Modes */}
          <div className="flex items-center bg-zinc-900/90 border border-zinc-700 rounded-lg p-0.5 text-xs shadow-inner">
            {/* 1. EXPO (All Stations Master View) */}
            <button
              onClick={() => handleViewSwitch('EXPO')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-black transition-all cursor-pointer ${
                activeKdsView === 'EXPO'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Expediter Master Display: All kitchen stations unified in real-time pass"
            >
              <span className="material-symbols-outlined text-sm">room_service</span>
              <span className="hidden xl:inline">EXPO</span>
            </button>

            {/* 2. AUTO DISPATCH */}
            <button
              onClick={() => handleViewSwitch('AUTO')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-black transition-all cursor-pointer ${
                activeKdsView === 'AUTO'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Auto Dispatch Mode: Fast-track cooking line with 1-touch auto bump"
            >
              <span className="material-symbols-outlined text-sm">bolt</span>
              <span className="hidden xl:inline">AUTO</span>
            </button>

            {/* 3. MANUAL QUEUE */}
            <button
              onClick={() => handleViewSwitch('MANUAL')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-black transition-all cursor-pointer ${
                activeKdsView === 'MANUAL'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Manual Queue Mode: 1-by-1 focus card with FIFO backlog queue"
            >
              <span className="material-symbols-outlined text-sm">queue</span>
              <span className="hidden xl:inline">QUEUE</span>
            </button>

            {/* 4. SUMMARY VIEW */}
            <button
              onClick={() => handleViewSwitch('SUMMARY')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-black transition-all cursor-pointer ${
                activeKdsView === 'SUMMARY'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Summary View: Aggregated production batch quantities (Bakery / Mass Prep)"
            >
              <span className="material-symbols-outlined text-sm">summarize</span>
              <span className="hidden xl:inline">SUMMARY</span>
            </button>

            {/* 5. GRID MATRIX */}
            <button
              onClick={() => handleViewSwitch('GRID')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-black transition-all cursor-pointer ${
                activeKdsView === 'GRID'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Grid Matrix Mode: Classic multi-ticket station board with SLA timers"
            >
              <span className="material-symbols-outlined text-sm">grid_view</span>
              <span className="hidden xl:inline">GRID</span>
            </button>
          </div>

          {/* Card Density Switcher (Compact / Normal / Wide) */}
          <div className="flex items-center bg-zinc-900/90 border border-zinc-700 rounded-lg p-0.5 text-xs shadow-inner">
            <button
              type="button"
              onClick={() => handleDensityChange('compact')}
              title="Compact Cards (Fits 4-6 on screen)"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-black text-[10px] uppercase transition-all cursor-pointer ${
                cardDensity === 'compact'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">density_small</span>
              <span className="hidden lg:inline">COMPACT</span>
            </button>
            <button
              type="button"
              onClick={() => handleDensityChange('normal')}
              title="Normal Cards (Balanced)"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-black text-[10px] uppercase transition-all cursor-pointer ${
                cardDensity === 'normal'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">density_medium</span>
              <span className="hidden lg:inline">NORMAL</span>
            </button>
            <button
              type="button"
              onClick={() => handleDensityChange('spacious')}
              title="Wide Cards (Large touch display)"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-black text-[10px] uppercase transition-all cursor-pointer ${
                cardDensity === 'spacious'
                  ? 'bg-[#ae001a] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">density_large</span>
              <span className="hidden lg:inline">WIDE</span>
            </button>
          </div>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => {
              setAudioChimeEnabled(!audioChimeEnabled);
              if (!audioChimeEnabled) playKitchenFireChime();
            }}
            title={audioChimeEnabled ? 'Audio Chime Enabled' : 'Audio Chime Muted'}
            className={`w-9 h-9 rounded flex items-center justify-center border transition-all cursor-pointer ${
              audioChimeEnabled
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs'
                : 'bg-zinc-800 text-zinc-500 border-zinc-700'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {audioChimeEnabled ? 'notifications_active' : 'notifications_off'}
            </span>
          </button>

          {/* All-Day Bar Quick Switcher (Historia X7P-4208) */}
          {activeDisplayMode !== 'SUMMARY' && (
            <button
              onClick={() => setIsAllDayBarExpanded((prev) => !prev)}
              className={`px-3 py-2 rounded font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 border cursor-pointer shadow-xs ${
                isAllDayBarExpanded
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
              }`}
              title="Toggle All-Day Aggregated Prep Bar"
            >
              <span className="material-symbols-outlined text-base">skillet</span>
              <span className="hidden md:inline">ALL-DAY</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                allDaySummary.totalNeededCount > 0 ? 'bg-amber-500 text-black' : 'bg-zinc-700 text-zinc-300'
              }`}>
                {allDaySummary.totalNeededCount}
              </span>
            </button>
          )}

          {/* Pacing SLA Settings Drawer Button */}
          <button
            onClick={() => setIsPacingDrawerOpen(true)}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-all flex items-center gap-2 border border-zinc-700 cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-base text-amber-400 animate-spin-slow">timer</span>
            <span className="hidden sm:inline">Pacing Timers</span>
          </button>

          {/* Recall Tray Button (Historia X7P-4209) */}
          <button
            type="button"
            onClick={() => setIsRecallTrayOpen(true)}
            className={`px-3.5 py-2 font-bold text-xs uppercase tracking-wider rounded transition-all flex items-center gap-2 border cursor-pointer shadow-xs ${
              undoToast
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 ring-2 ring-amber-500/40 animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700'
            }`}
            title="Recent Bump Recall Tray: Restore recently bumped tickets"
          >
            <span className="material-symbols-outlined text-base text-amber-400">history</span>
            <span className="hidden sm:inline">Recall Tray</span>
          </button>

          {/* Back to Dashboard */}
          <button
            onClick={onBackToDashboard}
            className="px-4 py-2 bg-[#ae001a] hover:bg-[#900015] text-white font-black text-xs uppercase tracking-wider rounded transition-all flex items-center gap-2 cursor-pointer shadow-md"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            <span className="hidden sm:inline">EXIT MONITOR</span>
          </button>
        </div>
      </header>

      {/* Immediate Accidental Bump Undo Toast (Historia X7P-4209) */}
      {undoToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce-short">
          <div className="bg-[#1f2026] border-2 border-amber-500/60 shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 text-white backdrop-blur-md">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
              <span className="material-symbols-outlined text-xl">undo</span>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-white">
                Ticket #{undoToast.id} Bumped
              </p>
              <p className="text-[11px] text-zinc-400 font-medium">
                Table: <strong className="text-amber-300">{undoToast.table}</strong> • Accidental bump?
              </p>
            </div>
            <button
              type="button"
              onClick={() => undoToast.backendOrderId && handleImmediateRecall(undoToast.backendOrderId)}
              className="py-1.5 px-3.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">replay</span>
              <span>UNDO (RECALL)</span>
            </button>
            <button
              type="button"
              onClick={() => setUndoToast(null)}
              className="text-zinc-500 hover:text-white p-1 rounded transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Course Sequence Quick Filter Bar */}
      <div className="bg-[#18191e] border-b border-zinc-800 px-6 py-2 flex items-center justify-between gap-4 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mr-1">COURSE STAGE:</span>
          {(['ALL', 'APPETIZER', 'MAIN_COURSE', 'DESSERT', 'BEVERAGE'] as const).map((course) => {
            const isActive = activeCourseFilter === course;
            return (
              <button
                key={course}
                onClick={() => setActiveCourseFilter(course)}
                className={`px-3 py-1 rounded text-xs font-black tracking-wider uppercase transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#ae001a] text-white shadow-xs'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {course === 'ALL' ? 'ALL COURSES' : course.replace('_', ' ')}
              </button>
            );
          })}
        </div>

        {/* Global Stats Ribbon */}
        <div className="flex items-center gap-4 text-xs font-bold text-zinc-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>ACTIVE: <strong className="text-white">{tickets.length}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>HELD ITEMS: <strong className="text-amber-400">
              {tickets.reduce((sum, t) => sum + t.items.filter((i) => i.preparationStatus === 'HELD').length, 0)}
            </strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>AUTO-FIRE PACING: <strong className="text-blue-300">{autoFireEnabled ? 'ON' : 'OFF'}</strong></span>
          </div>
        </div>
      </div>

      {/* Floating Active Alert Banner */}
      {activeAlertToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-amber-600 to-red-600 text-white px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-3 font-extrabold text-sm border-2 border-amber-300 animate-bounce">
          <span className="material-symbols-outlined text-xl animate-spin">bolt</span>
          <span>{activeAlertToast.message}</span>
          <button onClick={() => setActiveAlertToast(null)} className="ml-2 hover:opacity-75 cursor-pointer">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* 3. All-Day Consolidated Batch Prep Summary Bar (Historia X7P-4208) */}
      {activeDisplayMode !== 'SUMMARY' && (
        <div className="bg-[#15161b] border-b border-amber-500/30 px-4 py-1.5 shrink-0 transition-all">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-base">skillet</span>
              <span className="text-[11px] font-black tracking-wider text-white uppercase flex items-center gap-1.5">
                ALL-DAY PREP CONSOLIDATOR
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {allDaySummary.totalNeededCount} {allDaySummary.totalNeededCount === 1 ? 'unit required' : 'units required'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 font-medium hidden md:inline">
                Tap <strong className="text-amber-300">+1 / +2 / +4 / ALL</strong> to bump FIFO
              </span>
              <button
                onClick={() => setIsAllDayBarExpanded(!isAllDayBarExpanded)}
                className="text-zinc-400 hover:text-white flex items-center gap-0.5 text-[10px] font-bold cursor-pointer transition-colors"
                title={isAllDayBarExpanded ? 'Collapse All-Day Bar' : 'Expand All-Day Bar'}
              >
                <span>{isAllDayBarExpanded ? 'Hide' : 'Show'}</span>
                <span className="material-symbols-outlined text-xs">
                  {isAllDayBarExpanded ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            </div>
          </div>

          {isAllDayBarExpanded && (
            <div>
              {allDaySummary.items.length === 0 ? (
                <div className="py-1.5 px-3 rounded-md bg-zinc-900/60 border border-dashed border-zinc-800 text-center text-[11px] text-zinc-400 font-medium flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
                  <span>No pending items for this course on this station.</span>
                </div>
              ) : (
                <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 custom-scrollbar">
                  {allDaySummary.items.map((item) => (
                    <div
                      key={item.key}
                      className="min-w-[190px] max-w-[240px] bg-[#1a1c24] hover:bg-[#20232d] border border-zinc-700/80 hover:border-amber-500/60 rounded-lg p-2 flex flex-col justify-between transition-all shadow-xs group shrink-0"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-black text-white leading-tight truncate" title={item.productName}>
                              {item.productName}
                            </h4>
                            {item.variantName && (
                              <span className="inline-block mt-0.5 text-[9px] font-bold px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 truncate max-w-full">
                                {item.variantName}
                              </span>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-base font-black font-mono text-amber-400 leading-none block">
                              {item.totalNeeded}x
                            </span>
                            <span className="text-[8px] uppercase tracking-wider font-bold text-zinc-400">
                              PENDING
                            </span>
                          </div>
                        </div>

                        {/* Prep Progress Bar */}
                        <div className="mt-1 text-[9px] font-bold text-zinc-400 flex items-center justify-between">
                          <span>Progress:</span>
                          <span>
                            <strong className="text-emerald-400">{item.totalPrepared}</strong>/{item.totalOrdered} done
                          </span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-0.5">
                          <div
                            className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${item.totalOrdered > 0 ? Math.min(100, Math.round((item.totalPrepared / item.totalOrdered) * 100)) : 0}%`,
                            }}
                          />
                        </div>

                        {/* Modifiers / Special Notes Breakdown */}
                        {item.modifiers.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.modifiers.map((mod, idx) => (
                              <span
                                key={idx}
                                className="text-[8px] font-bold px-1 py-0.2 rounded bg-amber-950/60 text-amber-200 border border-amber-500/30"
                              >
                                {mod.count}x {mod.note}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Quick Action Batch Bump Buttons */}
                      <div className="mt-1.5 pt-1 border-t border-zinc-800/80 flex items-center gap-1">
                        <button
                          onClick={() => handleBatchBumpFifo(item.productName, item.variantName, 1)}
                          className="flex-1 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black font-black text-[10px] rounded border border-amber-500/40 transition-all cursor-pointer text-center active:scale-95"
                          title={`Bump 1x ${item.productName} to oldest ticket (FIFO)`}
                        >
                          +1
                        </button>

                        {item.totalNeeded >= 2 && (
                          <button
                            onClick={() => handleBatchBumpFifo(item.productName, item.variantName, 2)}
                            className="flex-1 py-1 bg-zinc-800 hover:bg-amber-500 text-zinc-200 hover:text-black font-black text-[10px] rounded border border-zinc-700 transition-all cursor-pointer text-center active:scale-95"
                            title={`Bump 2x ${item.productName} to oldest tickets (FIFO)`}
                          >
                            +2
                          </button>
                        )}

                        {item.totalNeeded >= 4 && (
                          <button
                            onClick={() => handleBatchBumpFifo(item.productName, item.variantName, 4)}
                            className="flex-1 py-1 bg-zinc-800 hover:bg-amber-500 text-zinc-200 hover:text-black font-black text-[10px] rounded border border-zinc-700 transition-all cursor-pointer text-center active:scale-95"
                            title={`Bump 4x ${item.productName} to oldest tickets (FIFO)`}
                          >
                            +4
                          </button>
                        )}

                        {item.totalNeeded > 1 && (
                          <button
                            onClick={() => handleBatchBumpFifo(item.productName, item.variantName, item.totalNeeded)}
                            className="px-1.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[9px] uppercase rounded border border-emerald-400 transition-all cursor-pointer active:scale-95"
                            title={`Bump entire batch (${item.totalNeeded}x) to oldest tickets`}
                          >
                            ALL
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Main KDS Workspace Cards Staging Grid */}
      <main
        className={`flex-1 px-4 py-2 ${
          activeDisplayMode === 'SUMMARY'
            ? 'overflow-y-auto custom-scrollbar flex flex-col'
            : activeDisplayMode === 'MANUAL'
            ? 'overflow-hidden flex gap-4 items-stretch'
            : 'overflow-x-auto overflow-y-hidden flex flex-col custom-scrollbar'
        }`}
      >
        {loading ? (
          <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center gap-4 text-center">
            <span className="material-symbols-outlined text-amber-500 text-5xl animate-spin">progress_activity</span>
            <p className="text-zinc-300 text-sm font-bold uppercase tracking-wider">Syncing Live Kitchen Queue...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-20 h-20 rounded-full bg-zinc-800/80 border-2 border-dashed border-zinc-700 flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-emerald-400 text-4xl">done_all</span>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-wide" style={{ color: '#ffffff' }}>
                All Kitchen Tickets Cleared
              </h2>
              <p className="text-zinc-400 text-sm max-w-md mx-auto mt-2 font-medium">
                There are no active orders awaiting preparation in this station. New tickets created via POS or Online Orders will display here in real time.
              </p>
            </div>
            {(activeCourseFilter !== 'ALL' || selectedStationFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setActiveCourseFilter('ALL');
                  setSelectedStationFilter('ALL');
                }}
                className="mt-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : activeDisplayMode === 'SUMMARY' ? (
          /* ========================================================= */
          /* MODE 1: SUMMARY VIEW (Aggregated Batch Preparation)       */
          /* ========================================================= */
          <div className="flex flex-col gap-5 w-full h-full pb-8">
            {/* Summary Top Banner */}
            <div className="bg-gradient-to-r from-blue-950/80 via-zinc-900 to-blue-950/80 border border-blue-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/40">
                  <span className="material-symbols-outlined text-2xl">layers</span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-blue-300 tracking-wider uppercase flex items-center gap-2">
                    PRODUCTION BATCH CONSOLIDATOR
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-500/30">
                      STATION: {selectedStationFilter}
                    </span>
                  </h4>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    Consolidating production batches across all active tickets (Bar, Cold Line, Hot Line, Bakery).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                <span className="px-3 py-1.5 bg-zinc-800/90 text-zinc-200 rounded-lg border border-zinc-700">
                  Batches: <strong className="text-white font-mono text-sm ml-1">{aggregatedSummary.length}</strong>
                </span>
                <span className="px-3 py-1.5 bg-zinc-800/90 text-zinc-300 rounded-lg border border-zinc-700">
                  Queue: <strong className="text-white font-mono text-sm ml-1">
                    {aggregatedSummary.reduce((sum, item) => sum + item.pendingQty, 0)}
                  </strong>
                </span>
                <span className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg border border-blue-500/30">
                  In Prep: <strong className="text-blue-200 font-mono text-sm ml-1">
                    {aggregatedSummary.reduce((sum, item) => sum + item.inPrepQty, 0)}
                  </strong>
                </span>
                <span className="px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/30">
                  Held: <strong className="text-amber-200 font-mono text-sm ml-1">
                    {aggregatedSummary.reduce((sum, item) => sum + item.heldQty, 0)}
                  </strong>
                </span>
                <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/30">
                  Ready: <strong className="text-emerald-200 font-mono text-sm ml-1">
                    {aggregatedSummary.reduce((sum, item) => sum + item.readyQty, 0)}
                  </strong>
                </span>
              </div>
            </div>

            {/* Batch Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {aggregatedSummary.map((batch) => {
                const totalUnready = batch.pendingQty + batch.inPrepQty + batch.heldQty;
                const isFullyReady = totalUnready === 0 && batch.totalQty > 0;
                const courseTheme = getCourseTheme(batch.course);

                return (
                  <div
                    key={batch.key}
                    className={`rounded-xl border p-5 flex flex-col justify-between transition-all shadow-xl ${
                      isFullyReady
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-emerald-950/30'
                        : 'bg-[#1a1b20] border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-black text-lg text-white leading-tight break-words" style={{ color: '#ffffff' }}>
                            {batch.name}
                          </h3>
                          {batch.variantName && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700 inline-block mt-1">
                              {batch.variantName}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${courseTheme.badge}`}>
                          {batch.course.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Stat Counters: QUEUE / [PREP VERB] / HELD / READY / TOTAL */}
                      <div className="my-3 p-2.5 bg-zinc-900/90 rounded-xl border border-zinc-800 grid grid-cols-5 gap-0.5 text-center">
                        <div className="p-1">
                          <p className="text-xl font-black font-mono text-zinc-300">{batch.pendingQty}</p>
                          <p className="text-[7.5px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">QUEUE</p>
                        </div>
                        <div className="p-1 border-l border-zinc-800">
                          <p className="text-xl font-black font-mono text-blue-400">{batch.inPrepQty}</p>
                          <p className="text-[7.5px] font-bold text-blue-300 uppercase tracking-wider mt-0.5">{courseTheme.prepVerb}</p>
                        </div>
                        <div className="p-1 border-l border-zinc-800">
                          <p className="text-xl font-black font-mono text-amber-400">{batch.heldQty}</p>
                          <p className="text-[7.5px] font-bold text-amber-300 uppercase tracking-wider mt-0.5">HELD</p>
                        </div>
                        <div className="p-1 border-l border-zinc-800">
                          <p className="text-xl font-black font-mono text-emerald-400">{batch.readyQty}</p>
                          <p className="text-[7.5px] font-bold text-emerald-300 uppercase tracking-wider mt-0.5">READY</p>
                        </div>
                        <div className="p-1 border-l border-zinc-800">
                          <p className="text-xl font-black font-mono text-zinc-300">{batch.totalQty}</p>
                          <p className="text-[7.5px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">TOTAL</p>
                        </div>
                      </div>

                      {/* Interactive Tables Breakdown */}
                      <div className="space-y-1.5 mb-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-zinc-400">touch_app</span>
                            TABLES (TAP TO ADVANCE):
                          </p>
                          <span className="text-[10px] text-zinc-500 font-bold">
                            {batch.tables.length} table{batch.tables.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-1.5 bg-zinc-950/40 rounded-lg border border-zinc-800/80">
                          {batch.tables.map((t, idx) => {
                            const isReady = t.status === 'READY';
                            const isHeld = t.status === 'HELD';
                            const isInPrep = t.status === 'IN_PREPARATION';

                            const chipIcon = isReady
                              ? 'check_circle'
                              : isHeld
                              ? 'lock'
                              : isInPrep
                              ? courseTheme.prepIcon
                              : 'schedule';

                            const chipStatusLabel = isReady
                              ? 'READY'
                              : isHeld
                              ? 'HELD'
                              : isInPrep
                              ? courseTheme.prepVerb
                              : 'QUEUE';

                            const chipStyle = isReady
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/60'
                              : isHeld
                              ? 'bg-amber-950/60 text-amber-300 border-amber-500/50 hover:bg-amber-900/60 animate-pulse'
                              : isInPrep
                              ? 'bg-blue-950/70 text-blue-200 border-blue-500/60 hover:bg-blue-900/70 shadow-xs'
                              : 'bg-zinc-800/90 text-zinc-300 border-zinc-700 hover:bg-zinc-700/80 hover:text-white';

                            const qtyBadgeStyle = isReady
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : isHeld
                              ? 'bg-amber-500/20 text-amber-300'
                              : isInPrep
                              ? 'bg-blue-500/20 text-blue-200'
                              : 'bg-zinc-700 text-zinc-300';

                            const tooltipText = isHeld
                              ? `HELD: Click to FIRE for ${t.table}`
                              : !isInPrep && !isReady
                              ? `QUEUE (PENDING): Click to start ${courseTheme.prepVerb.toLowerCase()} for ${t.table}`
                              : isInPrep
                              ? `IN PREPARATION: Click to mark READY for ${t.table}`
                              : `READY: Click to revert ${t.table} back to prep`;

                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleToggleSummaryTableItem(t, batch.name)}
                                title={tooltipText}
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-xs ${chipStyle}`}
                              >
                                <span className="material-symbols-outlined text-[12px]">
                                  {chipIcon}
                                </span>
                                <span>{t.table}</span>
                                <span className={`font-mono font-black text-[10px] px-1 rounded ${qtyBadgeStyle}`}>
                                  x{t.qty}
                                </span>
                                <span className="text-[8px] uppercase tracking-wider font-extrabold opacity-75">
                                  {chipStatusLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Aggregated Notes */}
                      {batch.notes.length > 0 && (
                        <div className="mb-3 p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                          <strong className="block text-[10px] text-amber-400 uppercase tracking-wider mb-1">
                            SPECIAL PREP INSTRUCTIONS:
                          </strong>
                          <ul className="list-disc list-inside space-y-0.5">
                            {batch.notes.map((note, idx) => (
                              <li key={idx} className="italic">{note}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 mt-2">
                      {batch.heldQty > 0 && (
                        <button
                          onClick={() => handleFireBatchHeld(batch.name, batch.variantName)}
                          className="w-full py-2 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-98"
                        >
                          <span className="material-symbols-outlined text-sm">local_fire_department</span>
                          <span>FIRE ALL HELD ({batch.heldQty})</span>
                        </button>
                      )}

                      {batch.pendingQty > 0 && (
                        <button
                          onClick={() => handleStartBatchQueue(batch.name, batch.variantName)}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-98 border border-blue-400/50"
                        >
                          <span className="material-symbols-outlined text-sm">{courseTheme.prepIcon}</span>
                          <span>START ALL QUEUE ({batch.pendingQty})</span>
                        </button>
                      )}

                      {totalUnready > 0 ? (
                        <button
                          onClick={() => handleMarkBatchReady(batch.name, batch.variantName)}
                          className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-98"
                        >
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          <span>MARK ALL READY ({totalUnready})</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 py-2.5 bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-inner">
                            <span className="material-symbols-outlined text-sm">task_alt</span>
                            <span>ALL {batch.totalQty} READY</span>
                          </div>
                          <button
                            onClick={() => handleRevertBatch(batch.name, batch.variantName)}
                            title="Revert batch back to preparation"
                            className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">undo</span>
                            <span className="hidden sm:inline">UNDO</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeDisplayMode === 'MANUAL' ? (
          /* ========================================================= */
          /* MODE 2: MANUAL QUEUE (Split-Screen Focus + FIFO Queue)    */
          /* ========================================================= */
          <div className="flex gap-6 w-full h-full overflow-hidden">
            {/* Left Primary Focus: Active Head-of-Line Ticket */}
            <div className="flex-1 flex flex-col h-full bg-[#18191e] border border-zinc-800 rounded-2xl p-4 overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span>
                  <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                    CURRENT IN-PROGRESS TICKET (HEAD OF LINE)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const idx = filteredTickets.findIndex((t) => t.id === activeManualTicket?.id);
                      if (idx > 0) setManualActiveTicketId(filteredTickets[idx - 1].id);
                    }}
                    disabled={filteredTickets.findIndex((t) => t.id === activeManualTicket?.id) <= 0}
                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded text-xs font-bold text-zinc-300 flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">navigate_before</span>
                    PREV
                  </button>
                  <button
                    onClick={() => {
                      const idx = filteredTickets.findIndex((t) => t.id === activeManualTicket?.id);
                      if (idx >= 0 && idx < filteredTickets.length - 1) {
                        setManualActiveTicketId(filteredTickets[idx + 1].id);
                      }
                    }}
                    disabled={filteredTickets.findIndex((t) => t.id === activeManualTicket?.id) >= filteredTickets.length - 1}
                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded text-xs font-bold text-zinc-300 flex items-center gap-1 cursor-pointer"
                  >
                    NEXT
                    <span className="material-symbols-outlined text-sm">navigate_next</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto mt-3 custom-scrollbar">
                {activeManualTicket ? (
                  renderTicketCard(activeManualTicket, true)
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                    <span className="material-symbols-outlined text-5xl mb-2">inbox</span>
                    <p className="text-sm font-bold">No active tickets waiting in queue</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Secondary: Waiting FIFO Queue */}
            <div className="w-96 flex flex-col h-full bg-[#18191e] border border-zinc-800 rounded-2xl p-4 shrink-0 overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-zinc-400 text-lg">queue</span>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    WAITING QUEUE ({filteredTickets.length})
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase">FIFO PIPELINE</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 mt-3 custom-scrollbar">
                {filteredTickets.map((t, index) => {
                  const isSelected = activeManualTicket?.id === t.id;
                  const pColors = getPriorityBadge(t.priority);
                  return (
                    <div
                      key={t.id}
                      onClick={() => setManualActiveTicketId(t.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#ae001a]/20 border-[#ae001a] ring-1 ring-[#ae001a]'
                          : 'bg-zinc-900/80 hover:bg-zinc-800/80 border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-black text-zinc-300 shrink-0 border border-zinc-700">
                          #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white truncate">{t.table}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase ${pColors.badge}`}>
                              {pColors.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                            Ticket #{t.id} • {t.items.length} items • {t.server}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-2">
                        <span
                          className={`font-mono font-black text-sm ${
                            t.timeElapsed >= 12 ? 'text-red-400' : t.timeElapsed >= 8 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {t.timeElapsed}m
                        </span>
                        <p className="text-[9px] font-bold text-zinc-500 uppercase">WAIT</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* MODE 3 & 4: AUTO DISPATCH & GRID MATRIX                   */
          /* ========================================================= */
          <div className="flex flex-col gap-2.5 w-full h-full">
            {/* Auto Dispatch Banner */}
            {activeDisplayMode === 'AUTO' && (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-lg px-3 py-1 flex items-center justify-between shadow-xs shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-emerald-400">bolt</span>
                  <span className="text-[10px] font-black text-emerald-300 uppercase">
                    1-TOUCH AUTO-DISPATCH LINE:
                  </span>
                  <span className="text-[10px] text-zinc-300 hidden md:inline">
                    When the final dish is marked READY, the ticket will automatically bump and archive.
                  </span>
                </div>
                <span className="text-[8px] font-mono font-black px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  AUTO-BUMP
                </span>
              </div>
            )}

            {/* Horizontal Tickets Grid */}
            <div className={`flex-1 overflow-x-auto overflow-y-hidden flex ${cardDensity === 'compact' ? 'gap-3' : 'gap-4'} items-start custom-scrollbar pb-1`}>
              {filteredTickets.map((ticket) => renderTicketCard(ticket))}
            </div>
          </div>
        )}
      </main>

      {/* 4. Drawer: Pacing SLA & Target Window Settings */}
      {isPacingDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-fade-in font-sans">
          <div className="w-full max-w-md bg-[#1a1b20] border-l-2 border-[#ae001a] h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-5 border-b border-zinc-800 bg-[#212228] flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#ae001a] text-2xl">tune</span>
                <div>
                  <h2
                    className="text-base font-black uppercase tracking-wider text-white !text-white"
                    style={{ color: '#ffffff', fontSize: '15px', lineHeight: '1.4' }}
                  >
                    Multi-Course Pacing SLA
                  </h2>
                  <p className="text-xs text-zinc-400 font-bold" style={{ color: '#a1a1aa' }}>
                    Target Hold Delays &amp; Automated Fire Thresholds
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPacingDrawerOpen(false)}
                className="w-8 h-8 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-sm">
              {/* Card Density Setting */}
              <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3
                      className="font-black text-white !text-white text-xs uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: '#ffffff', fontSize: '12px', lineHeight: '1rem' }}
                    >
                      <span className="material-symbols-outlined text-amber-400 text-sm">view_column</span>
                      KDS Ticket Card Density
                    </h3>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                      Controls ticket width to fit more simultaneous cards on screen.
                    </p>
                  </div>
                  <span className="font-mono text-xs font-black text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40 uppercase">
                    {cardDensity}
                  </span>
                </div>
                <div className="flex gap-2">
                  {(['compact', 'normal', 'spacious'] as const).map((density) => (
                    <button
                      key={density}
                      type="button"
                      onClick={() => handleDensityChange(density)}
                      className={`flex-1 py-1.5 rounded text-xs font-bold border transition-all cursor-pointer uppercase ${
                        cardDensity === density
                          ? 'bg-[#ae001a] text-white border-[#ae001a]'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                      }`}
                    >
                      {density === 'compact' ? 'Compact (256px)' : density === 'normal' ? 'Normal (288px)' : 'Wide (320px)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Course Delay Setting */}
              <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3
                      className="font-black text-white !text-white text-xs uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: '#ffffff', fontSize: '12px', lineHeight: '1rem' }}
                    >
                      <span className="material-symbols-outlined text-blue-400 text-sm">lunch_dining</span>
                      Main Course Hold Delay
                    </h3>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                      Target window after appetizers before mains auto-fire.
                    </p>
                  </div>
                  <span className="font-mono text-base font-black text-blue-400 bg-blue-950/60 px-2.5 py-1 rounded border border-blue-500/40">
                    {mainCourseHoldDelayMins}m
                  </span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="20"
                  step="1"
                  value={mainCourseHoldDelayMins}
                  onChange={(e) => setMainCourseHoldDelayMins(Number(e.target.value))}
                  className="w-full accent-[#ae001a] cursor-pointer"
                />
                <div className="flex gap-2">
                  {[8, 10, 12, 15].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMainCourseHoldDelayMins(preset)}
                      className={`flex-1 py-1 rounded text-xs font-bold border transition-all cursor-pointer ${
                        mainCourseHoldDelayMins === preset
                          ? 'bg-[#ae001a] text-white border-[#ae001a]'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Dessert Delay Setting */}
              <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3
                      className="font-black text-white !text-white text-xs uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: '#ffffff', fontSize: '12px', lineHeight: '1rem' }}
                    >
                      <span className="material-symbols-outlined text-purple-400 text-sm">cake</span>
                      Dessert Course Hold Delay
                    </h3>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                      Target hold delay while entrees are served.
                    </p>
                  </div>
                  <span className="font-mono text-base font-black text-purple-400 bg-purple-950/60 px-2.5 py-1 rounded border border-purple-500/40">
                    {dessertHoldDelayMins}m
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="35"
                  step="5"
                  value={dessertHoldDelayMins}
                  onChange={(e) => setDessertHoldDelayMins(Number(e.target.value))}
                  className="w-full accent-[#ae001a] cursor-pointer"
                />
                <div className="flex gap-2">
                  {[15, 20, 25, 30].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDessertHoldDelayMins(preset)}
                      className={`flex-1 py-1 rounded text-xs font-bold border transition-all cursor-pointer ${
                        dessertHoldDelayMins === preset
                          ? 'bg-[#ae001a] text-white border-[#ae001a]'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Critical Kitchen SLA & Shield Setting */}
              <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3
                      className="font-black text-white !text-white text-xs uppercase tracking-wider flex items-center gap-1.5"
                      style={{ color: '#ffffff', fontSize: '12px', lineHeight: '1rem' }}
                    >
                      <span className="material-symbols-outlined text-red-500 text-sm">shield</span>
                      Critical SLA Shield Target
                    </h3>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                      Orders reaching this wait receive SLA Shield protection &amp; turn red.
                    </p>
                  </div>
                  <span className="font-mono text-base font-black text-red-400 bg-red-950/60 px-2.5 py-1 rounded border border-red-500/40">
                    {criticalSlaMinutes}m
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={criticalSlaMinutes}
                  onChange={(e) => setCriticalSlaMinutes(Number(e.target.value))}
                  className="w-full accent-[#ae001a] cursor-pointer"
                />
                <div className="flex flex-wrap gap-2">
                  {[2, 5, 10, 15, 20, 30].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCriticalSlaMinutes(preset)}
                      className={`flex-1 py-1 rounded text-xs font-bold border transition-all cursor-pointer ${
                        criticalSlaMinutes === preset
                          ? 'bg-[#ae001a] text-white border-[#ae001a]'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Automation Toggles */}
              <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="font-black text-xs text-white !text-white uppercase tracking-wider"
                      style={{ color: '#ffffff' }}
                    >
                      Automated Fire on Expiration
                    </p>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                      Release held dishes directly to cook line queues when pacing timer reaches zero.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoFireEnabled(!autoFireEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      autoFireEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        autoFireEnabled ? 'right-0.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                  <div>
                    <p
                      className="font-black text-xs text-white !text-white uppercase tracking-wider"
                      style={{ color: '#ffffff' }}
                    >
                      Kitchen Audio Chime
                    </p>
                    <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                      Sound resonant double bell when courses or items are fired.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAudioChimeEnabled(!audioChimeEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      audioChimeEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        audioChimeEnabled ? 'right-0.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Force Pacing Engine Now */}
              <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl space-y-2">
                <h4
                  className="font-black text-xs uppercase tracking-wider text-amber-300 flex items-center gap-1.5"
                  style={{ color: '#fcd34d' }}
                >
                  <span className="material-symbols-outlined text-sm">bolt</span>
                  Immediate Staging Override
                </h4>
                <p className="text-xs text-zinc-400" style={{ color: '#a1a1aa' }}>
                  Instantly releases all held courses across all active tickets without waiting for timers.
                </p>
                <button
                  type="button"
                  onClick={handleRunAutoPacingNow}
                  className="w-full mt-2 py-2 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-black text-xs uppercase tracking-wider rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <span className="material-symbols-outlined text-base">flash_on</span>
                  <span>Release All Held Courses Now</span>
                </button>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-zinc-800 bg-[#212228] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPacingDrawerOpen(false)}
                className="w-full py-2.5 bg-[#ae001a] hover:bg-[#900015] text-white font-black text-xs uppercase tracking-wider rounded transition-colors cursor-pointer shadow-md"
              >
                Save &amp; Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
      <KitchenRecallTray
        isOpen={isRecallTrayOpen}
        onClose={() => setIsRecallTrayOpen(false)}
        activeStationId={resolvedStation.id}
        activeStationName={resolvedStation.name}
        onOrderRecalled={() => {
          fetchBackendOrders(true);
          setUndoToast(null);
        }}
        lastBumpedOrder={lastBumpedOrder}
      />
      <KitchenDevResetButton onResetComplete={() => fetchBackendOrders(true)} />
    </div>
  );
};

export default KitchenMonitorView;
