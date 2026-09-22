import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getAccessToken } from '../../../../../lib/auth-storage';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export type CourseType = 'APPETIZER' | 'MAIN_COURSE' | 'DESSERT' | 'BEVERAGE';
export type PreparationStatus = 'HELD' | 'PENDING' | 'IN_PREPARATION' | 'READY';

export interface TicketItem {
  id: number;
  name: string;
  variantName?: string;
  qty: number;
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
  priority: 'high' | 'medium' | 'normal';
  items: TicketItem[];
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
  const [mainCourseHoldDelayMins, setMainCourseHoldDelayMins] = useState<number>(10);
  const [dessertHoldDelayMins, setDessertHoldDelayMins] = useState<number>(20);
  const [autoFireEnabled, setAutoFireEnabled] = useState<boolean>(true);
  const [audioChimeEnabled, setAudioChimeEnabled] = useState<boolean>(true);
  const [activeAlertToast, setActiveAlertToast] = useState<{ id: string; message: string; type: 'fire' | 'pacing' } | null>(null);

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
            : o.notes?.match(/Table \d+/i)?.[0] || `Ticket #KO-${o.id}`;

          return {
            id: `KO-${o.id}`,
            backendOrderId: o.id,
            table: tableName,
            timeElapsed: elapsedMins,
            createdAtMs: customerTimeRef,
            server: o.order?.waiter_name || o.order?.waiter?.name || 'Kitchen Staff',
            stationName: o.station?.name || 'General Kitchen',
            stationId: o.stationId ?? o.station?.id,
            priority: (o.priority ?? 0) >= 2 ? 'high' : (o.priority ?? 0) === 1 ? 'medium' : 'normal',
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

  // Put item back on hold
  const handleHoldSingleItem = async (ticketId: string, itemId: number, itemName: string) => {
    const targetTicket = tickets.find((t) => t.id === ticketId);
    const holdMins = targetTicket?.priority === 'high' ? 4 : targetTicket?.priority === 'medium' ? 7 : 10;
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch(`${API_BASE}/kitchen-order-items/${itemId}/hold?holdMinutes=${holdMins}`, { method: 'POST', headers });
    } catch (e) {
      console.warn('Backend hold-item failed:', e);
    }

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          return {
            ...t,
            items: t.items.map((i) =>
              i.id === itemId
                ? { ...i, preparationStatus: 'HELD', holdRemainingSeconds: holdMins * 60 }
                : i
            ),
          };
        }
        return t;
      })
    );

    triggerAlert(`⏸️ HELD: "${itemName}" placed on ${holdMins}m pacing hold.`, 'pacing');
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

  // Complete and bump entire ticket in backend & UI
  const handleCompleteTicket = async (id: string, backendOrderId?: number) => {
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
      case 'high':
        return { border: 'border-red-500', badge: 'bg-red-500/20 text-red-400 border border-red-500/40' };
      case 'medium':
        return { border: 'border-amber-500', badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/40' };
      case 'normal':
      default:
        return { border: 'border-zinc-700', badge: 'bg-zinc-800 text-zinc-300 border border-zinc-700' };
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

  // Filtered and dynamically prioritized tickets with SLA Critical Shield
  const filteredTickets = (() => {
    const matched = tickets.filter((t) => {
      // 1. Filtrar por Estación y Vista KDS:
      if (activeKdsView === 'EXPO') {
        if (selectedStationFilter !== 'ALL' && t.stationName !== selectedStationFilter) {
          return false;
        }
      } else {
        if (selectedStationFilter !== 'ALL') {
          if (t.stationName !== selectedStationFilter) return false;
        } else {
          const stMode = getTicketStationMode(t);
          if (stMode !== activeKdsView) return false;
        }
      }

      if (activeCourseFilter === 'ALL') return true;
      return t.items.some((i) => i.course === activeCourseFilter);
    });

    return [...matched].sort((a, b) => {
      // 1. Pulso activo / Fired recientemente se prioriza al frente
      if (a.isPulsing !== b.isPulsing) {
        return (b.isPulsing ? 1 : 0) - (a.isPulsing ? 1 : 0);
      }

      // 2. Prioridad operativa inmediata: Tickets con platos en preparación activa (PREP / IN_PREPARATION / PENDING)
      // se colocan al frente del KDS antes que tickets donde todos sus platos están retenidos (HELD) o listos (READY).
      const isPreparingA = a.items.some((i) => i.preparationStatus === 'PENDING' || i.preparationStatus === 'IN_PREPARATION');
      const isPreparingB = b.items.some((i) => i.preparationStatus === 'PENDING' || i.preparationStatus === 'IN_PREPARATION');
      if (isPreparingA && !isPreparingB) return -1;
      if (!isPreparingA && isPreparingB) return 1;

      // 3. SLA Critical Shield: órdenes con >= 15 min esperando tienen prioridad absoluta
      const isCritA = (a.timeElapsed ?? 0) >= 15;
      const isCritB = (b.timeElapsed ?? 0) >= 15;
      if (isCritA && !isCritB) return -1;
      if (!isCritA && isCritB) return 1;
      if (isCritA && isCritB) {
        return (b.timeElapsed ?? 0) - (a.timeElapsed ?? 0); // la más demorada primero
      }

      // 4. Prioridad de comanda asignada (High / Medium / Normal):
      const prioScoreMap: Record<string, number> = { high: 20, medium: 10, normal: 0 };
      const prioDiff = (prioScoreMap[b.priority] || 0) - (prioScoreMap[a.priority] || 0);
      if (prioDiff !== 0) return prioDiff;

      // 5. Orden de llegada estricto y determinista (FIFO: el más viejo primero):
      const timeA = a.createdAtMs ?? 0;
      const timeB = b.createdAtMs ?? 0;
      if (timeA !== timeB) return timeA - timeB;

      return (a.backendOrderId ?? 0) - (b.backendOrderId ?? 0);
    });
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

    return (
      <div
        key={ticket.id}
        className={`${
          isFullWidth ? 'w-full h-full' : 'w-96 max-h-[92%] flex-shrink-0'
        } bg-[#1a1b20] border-t-4 ${pColors.border} border-x border-b border-zinc-800 rounded-xl flex flex-col shadow-2xl transition-all duration-300 ${
          ticket.isPulsing
            ? 'ring-4 ring-amber-500 bg-amber-950/30 animate-pulse shadow-amber-500/50'
            : 'hover:border-zinc-700'
        }`}
      >
        {/* Ticket Header Card */}
        <div className="p-4 border-b border-zinc-800 bg-[#212228] rounded-t-lg flex justify-between items-start shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-base text-white tracking-wide" style={{ color: '#ffffff' }}>
                {ticket.table}
              </h2>
              <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${pColors.badge}`}>
                {ticket.priority}
              </span>
              {activeDisplayMode === 'AUTO' && (
                <span className="text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[10px]">bolt</span>
                  AUTO-DISPATCH
                </span>
              )}
              {ticket.timeElapsed >= 15 && (
                <span className="text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider bg-red-600 text-white border border-red-500 flex items-center gap-0.5 animate-pulse shadow-xs">
                  <span className="material-symbols-outlined text-[11px]">shield</span>
                  SLA SHIELD
                </span>
              )}
            </div>
            <p className="text-xs font-bold mt-1 text-zinc-400">
              Ticket #{ticket.id} • {ticket.stationName || 'Line Station'} • {ticket.server}
            </p>
          </div>

          <div className="text-right">
            <p
              className={`font-mono font-black text-lg ${
                ticket.timeElapsed >= 12
                  ? 'text-red-400 animate-pulse'
                  : ticket.timeElapsed >= 8
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {ticket.timeElapsed}m
            </p>
            <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500">ELAPSED</p>
          </div>
        </div>

        {/* Ticket Body: Course Sequences */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {(() => {
            const sortedCourses = [...coursesPresent].sort((c1, c2) => {
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
                <div key={courseType} className="border border-zinc-800/80 rounded-lg p-3 bg-zinc-900/40">
                  {/* Course Header with Quick FIRE Button */}
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-zinc-400">{theme.icon}</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${theme.badge}`}>
                        {theme.title}
                      </span>
                    </div>

                    {hasHeldItems && (
                      <button
                        onClick={() => handleFireCourse(ticket.id, courseType)}
                        className="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-black text-[10px] uppercase tracking-wider rounded transition-all flex items-center gap-1 cursor-pointer shadow-sm active:scale-95"
                      >
                        <span className="material-symbols-outlined text-xs">local_fire_department</span>
                        <span>{theme.fireLabel}</span>
                      </button>
                    )}
                  </div>

                  {/* Items in this course */}
                  <div className="space-y-2.5">
                    {sortedItemsInCourse.map((item) => {
                      const isHeld = item.preparationStatus === 'HELD';
                      const isPending = item.preparationStatus === 'PENDING';
                      const isInPrep = item.preparationStatus === 'IN_PREPARATION';
                      const isReady = item.preparationStatus === 'READY';

                      return (
                        <div
                          key={item.id}
                          className={`group relative rounded-xl p-3 transition-all duration-200 border shadow-xs ${
                            isHeld
                              ? 'bg-amber-950/25 border-dashed border-amber-500/50 backdrop-blur-xs'
                              : isReady
                              ? 'bg-emerald-950/30 border-emerald-500/40'
                              : isInPrep
                              ? 'bg-blue-950/30 border-blue-500/50 hover:border-blue-400'
                              : 'bg-zinc-800/80 border-zinc-700/70 hover:border-amber-500/50 hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            {/* Left: Quantity Badge + Dish Info */}
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <span
                                className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-xs ${
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
                                    className={`text-sm font-black tracking-tight leading-snug break-words ${
                                      isReady ? 'text-emerald-200 line-through/40' : 'text-white'
                                    }`}
                                    style={{ color: isReady ? '#a7f3d0' : '#ffffff' }}
                                  >
                                    {item.name}
                                  </span>

                                  {item.variantName && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-700/80 text-zinc-200 border border-zinc-600/50">
                                      {item.variantName}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 border ${
                                      item.course === 'BEVERAGE'
                                        ? 'bg-sky-950/50 text-sky-300 border-sky-500/40'
                                        : item.course === 'APPETIZER'
                                        ? 'bg-teal-950/50 text-teal-300 border-teal-500/40'
                                        : item.course === 'DESSERT'
                                        ? 'bg-purple-950/50 text-purple-300 border-purple-500/40'
                                        : 'bg-amber-950/50 text-amber-300 border-amber-500/40'
                                    }`}
                                  >
                                    <span>
                                      {item.course === 'BEVERAGE'
                                        ? '🍹'
                                        : item.course === 'APPETIZER'
                                        ? '🥗'
                                        : item.course === 'DESSERT'
                                        ? '🍰'
                                        : '🍔'}
                                    </span>
                                    <span>{item.course.replace('_', ' ')}</span>
                                  </span>
                                </div>

                                {item.notes && (
                                  <div className="mt-2 text-[11px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40 rounded-lg px-2 py-1 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[13px] text-amber-400 shrink-0">edit_note</span>
                                    <span className="italic">{item.notes}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              {isHeld ? (
                                <div className="flex items-center gap-1">
                                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-black uppercase tracking-wider">
                                    <span className="material-symbols-outlined text-[11px]">lock</span>
                                    HELD
                                  </span>
                                  <button
                                    onClick={() => handleFireSingleItem(ticket.id, item.id, item.name)}
                                    title={`Fire directly to ${theme.prepVerb.toLowerCase()} (In Prep)`}
                                    className="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-sm active:scale-95"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">local_fire_department</span>
                                    FIRE
                                  </button>
                                </div>
                              ) : isPending ? (
                                <div className="flex items-center gap-1">
                                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-stone-500/20 text-stone-300 border border-stone-500/40 rounded text-[9px] font-bold uppercase tracking-wider">
                                    <span className="material-symbols-outlined text-[11px]">schedule</span>
                                    QUEUE
                                  </span>
                                  <button
                                    onClick={() => handleToggleItemReady(ticket.id, item.id, item.preparationStatus)}
                                    title={`Start ${theme.prepVerb.toLowerCase()} (Move to IN PREP)`}
                                    className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">{theme.prepIcon}</span>
                                    <span>{theme.prepVerb}</span>
                                  </button>
                                  <button
                                    onClick={() => handleHoldSingleItem(ticket.id, item.id, item.name)}
                                    title="Put back on hold"
                                    className="p-1 text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/60 rounded transition-colors cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-sm">pause_circle</span>
                                  </button>
                                </div>
                              ) : isInPrep ? (
                                <div className="flex items-center gap-1">
                                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded text-[9px] font-black uppercase tracking-wider animate-pulse">
                                    <span className="material-symbols-outlined text-[11px]">{theme.prepIcon}</span>
                                    {theme.prepVerb}
                                  </span>
                                  <button
                                    onClick={() => handleToggleItemReady(ticket.id, item.id, item.preparationStatus)}
                                    title="Mark as READY"
                                    className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                    <span>READY</span>
                                  </button>
                                  <button
                                    onClick={() => handleHoldSingleItem(ticket.id, item.id, item.name)}
                                    title="Put back on hold"
                                    className="p-1 text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/60 rounded transition-colors cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-sm">pause_circle</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleToggleItemReady(ticket.id, item.id, item.preparationStatus)}
                                    title="Revert back to PREP"
                                    className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 bg-emerald-600/80 hover:bg-emerald-600 text-white border border-emerald-400/50"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                    <span>READY</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {isHeld && (
                            <div className="mt-2 pt-1.5 border-t border-amber-500/20 flex items-center justify-between text-[10px]">
                              <span className="text-zinc-400 font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs text-amber-400">schedule</span>
                                Pacing Target Window:
                              </span>
                              <span className="font-mono font-black text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
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
        <div className="p-3 border-t border-zinc-800 bg-[#212228] rounded-b-lg shrink-0">
          <button
            onClick={() => handleCompleteTicket(ticket.id, ticket.backendOrderId)}
            className="w-full py-2.5 bg-zinc-800 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-inner"
          >
            <span className="material-symbols-outlined text-sm">done_all</span>
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
              value={selectedStationFilter}
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

          {/* Pacing SLA Settings Drawer Button */}
          <button
            onClick={() => setIsPacingDrawerOpen(true)}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-all flex items-center gap-2 border border-zinc-700 cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-base text-amber-400 animate-spin-slow">timer</span>
            <span className="hidden sm:inline">Pacing Timers</span>
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

      {/* 3. Main KDS Workspace Cards Staging Grid */}
      <main
        className={`flex-1 p-6 ${
          activeDisplayMode === 'SUMMARY'
            ? 'overflow-y-auto custom-scrollbar flex flex-col'
            : activeDisplayMode === 'MANUAL'
            ? 'overflow-hidden flex gap-6 items-stretch'
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
                              {t.priority}
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
          <div className="flex flex-col gap-4 w-full h-full">
            {/* Auto Dispatch Banner */}
            {activeDisplayMode === 'AUTO' && (
              <div className="bg-gradient-to-r from-emerald-950/80 via-zinc-900 to-emerald-950/80 border border-emerald-500/50 rounded-xl p-3 flex items-center justify-between shadow-lg shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                    <span className="material-symbols-outlined text-lg animate-pulse">bolt</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-emerald-300 tracking-wider uppercase">
                      1-TOUCH AUTO-DISPATCH LINE ACTIVE
                    </h4>
                    <p className="text-[11px] text-zinc-300">
                      When the final dish on any ticket is marked READY, the system will automatically bump and archive the ticket.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-black px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30">
                  AUTO-BUMP ACTIVE
                </span>
              </div>
            )}

            {/* Horizontal Tickets Grid */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden flex gap-6 items-start custom-scrollbar pb-2">
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
    </div>
  );
};

export default KitchenMonitorView;
