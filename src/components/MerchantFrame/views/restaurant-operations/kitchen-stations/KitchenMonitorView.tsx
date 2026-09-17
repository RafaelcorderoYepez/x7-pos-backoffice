import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  server: string;
  stationName?: string;
  priority: 'high' | 'medium' | 'normal';
  items: TicketItem[];
  isPulsing?: boolean;
  alertMessage?: string | null;
}

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


export const KitchenMonitorView: React.FC<KitchenMonitorViewProps> = ({ onBackToDashboard }) => {
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeCourseFilter, setActiveCourseFilter] = useState<'ALL' | CourseType>('ALL');
  const [selectedStationFilter, setSelectedStationFilter] = useState<string>('ALL');
  const [isPacingDrawerOpen, setIsPacingDrawerOpen] = useState<boolean>(false);
  const [mainCourseHoldDelayMins, setMainCourseHoldDelayMins] = useState<number>(10);
  const [dessertHoldDelayMins, setDessertHoldDelayMins] = useState<number>(20);
  const [autoFireEnabled, setAutoFireEnabled] = useState<boolean>(true);
  const [audioChimeEnabled, setAudioChimeEnabled] = useState<boolean>(true);
  const [activeAlertToast, setActiveAlertToast] = useState<{ id: string; message: string; type: 'fire' | 'pacing' } | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerAlert = (message: string, type: 'fire' | 'pacing' = 'fire') => {
    if (audioChimeEnabled) {
      playKitchenFireChime();
    }
    setActiveAlertToast({ id: String(Date.now()), message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setActiveAlertToast(null);
    }, 5000);
  };

  // 1-second countdown ticker for Held Items Pacing Timers
  useEffect(() => {
    const timer = setInterval(() => {
      setTickets((prevTickets) => {
        let anyAutoFired = false;
        let firedItemName = '';
        let firedTicketTable = '';

        const updated = prevTickets.map((ticket) => {
          let ticketUpdated = false;
          const updatedItems = ticket.items.map((item) => {
            if (item.preparationStatus === 'HELD' && item.holdRemainingSeconds !== undefined) {
              const nextSec = item.holdRemainingSeconds - 1;
              if (nextSec <= 0 && autoFireEnabled) {
                // Auto-fire triggered!
                anyAutoFired = true;
                firedItemName = item.name;
                firedTicketTable = ticket.table;
                ticketUpdated = true;
                return {
                  ...item,
                  preparationStatus: 'PENDING' as PreparationStatus,
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

        if (anyAutoFired) {
          triggerAlert(`⏱️ AUTO-PACING ALERT: ${firedItemName} on ${firedTicketTable} auto-fired to cook line!`, 'pacing');
          // Re-sort: Move auto-fired ticket to the top of the queue
          return [...updated].sort((a, b) => (b.isPulsing ? 1 : 0) - (a.isPulsing ? 1 : 0));
        }

        return updated;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoFireEnabled, audioChimeEnabled]);

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
  const fetchBackendOrders = async (silent = false) => {
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
          (o: any) => o.businessStatus !== 'completed' && o.businessStatus !== 'cancelled' && o.status !== 'deleted'
        );

        const mapped: KitchenTicket[] = activeOrders.map((o: any) => {
          const createdAtDate = o.createdAt ? new Date(o.createdAt).getTime() : Date.now();
          const elapsedMins = Math.max(0, Math.floor((Date.now() - createdAtDate) / 60000));
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
            server: o.order?.waiter_name || o.order?.waiter?.name || 'Kitchen Staff',
            stationName: o.station?.name || 'General Kitchen',
            priority: (o.priority ?? 0) >= 2 ? 'high' : (o.priority ?? 0) === 1 ? 'medium' : 'normal',
            items: (o.items || o.kitchenOrderItems || []).map((i: any) => {
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
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackendOrders();
    const interval = setInterval(() => {
      fetchBackendOrders(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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
                  preparationStatus: 'PENDING' as PreparationStatus,
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
                ? { ...i, preparationStatus: 'PENDING', holdRemainingSeconds: 0, firedAt: new Date().toISOString() }
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

  // Toggle single item PREP <-> READY
  const handleToggleItemReady = async (ticketId: string, itemId: number, currentStatus: PreparationStatus) => {
    const nextStatus: PreparationStatus = currentStatus === 'READY' ? 'PENDING' : 'READY';
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

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          return {
            ...t,
            items: t.items.map((i) =>
              i.id === itemId ? { ...i, preparationStatus: nextStatus } : i
            ),
          };
        }
        return t;
      })
    );
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
            ? { ...i, preparationStatus: 'PENDING', holdRemainingSeconds: 0, firedAt: new Date().toISOString() }
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
        };
      case 'MAIN_COURSE':
        return {
          title: 'MAIN COURSES',
          icon: 'lunch_dining',
          badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
          fireLabel: 'FIRE MAINS',
        };
      case 'DESSERT':
        return {
          title: 'DESSERTS',
          icon: 'cake',
          badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          fireLabel: 'FIRE DESSERTS',
        };
      case 'BEVERAGE':
        return {
          title: 'BEVERAGES',
          icon: 'local_bar',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          fireLabel: 'FIRE DRINKS',
        };
    }
  };

  // Filtered and dynamically prioritized tickets with SLA Critical Shield
  const filteredTickets = useMemo(() => {
    const matched = tickets.filter((t) => {
      const matchStation = selectedStationFilter === 'ALL' || t.stationName === selectedStationFilter;
      if (!matchStation) return false;
      if (activeCourseFilter === 'ALL') return true;
      return t.items.some((i) => i.course === activeCourseFilter);
    });

    return [...matched].sort((a, b) => {
      // 1. Pulso activo / Fired recientemente se prioriza al frente
      if (a.isPulsing !== b.isPulsing) {
        return (b.isPulsing ? 1 : 0) - (a.isPulsing ? 1 : 0);
      }

      // 2. SLA Critical Shield: órdenes con >= 15 min esperando tienen prioridad absoluta
      const isCritA = (a.timeElapsed ?? 0) >= 15;
      const isCritB = (b.timeElapsed ?? 0) >= 15;
      if (isCritA && !isCritB) return -1;
      if (!isCritA && isCritB) return 1;
      if (isCritA && isCritB) {
        return (b.timeElapsed ?? 0) - (a.timeElapsed ?? 0); // la más demorada primero
      }

      // 3. Dynamic Priority Score ponderado por edad para órdenes regulares (< 15 min):
      const prioScoreMap: Record<string, number> = { high: 20, medium: 10, normal: 0 };
      const scoreA = (prioScoreMap[a.priority] || 0) + ((a.timeElapsed ?? 0) * 1.5);
      const scoreB = (prioScoreMap[b.priority] || 0) + ((b.timeElapsed ?? 0) * 1.5);

      if (Math.abs(scoreB - scoreA) > 0.01) {
        return scoreB - scoreA;
      }

      return (b.timeElapsed ?? 0) - (a.timeElapsed ?? 0);
    });
  }, [tickets, selectedStationFilter, activeCourseFilter]);

  const uniqueStations = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach((t) => {
      if (t.stationName) set.add(t.stationName);
    });
    return Array.from(set);
  }, [tickets]);

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
              <span className="text-white font-black text-base sm:text-lg" style={{ color: '#ffffff' }}>EXPEDITER KDS DISPLAY</span>
              <span className="text-[#ae001a] font-black">/</span>
              <span className="text-zinc-200 font-extrabold text-sm sm:text-base" style={{ color: '#e4e4e7' }}>MULTI-COURSE PACING HUB</span>
            </h1>
            <p className="text-[11px] text-zinc-300 font-bold hidden sm:block" style={{ color: '#d4d4d8' }}>
              Hold/Fire Staging Engine • Automatic Target Delay Counters • Line Cook Routing
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Station Filter */}
          <div className="hidden md:flex items-center bg-zinc-800/80 rounded border border-zinc-700 px-3 py-1.5 text-xs gap-2">
            <span className="material-symbols-outlined text-sm text-zinc-400">soup_kitchen</span>
            <select
              value={selectedStationFilter}
              onChange={(e) => setSelectedStationFilter(e.target.value)}
              aria-label="Filter by kitchen station"
              className="bg-transparent text-white font-bold outline-none cursor-pointer text-xs"
            >
              <option value="ALL" className="bg-zinc-900 text-white">All Physical Stations</option>
              {uniqueStations.map((st) => (
                <option key={st} value={st} className="bg-zinc-900 text-white">
                  {st}
                </option>
              ))}
            </select>
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
      <main className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-6 items-start custom-scrollbar">
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
        ) : (
          filteredTickets.map((ticket) => {
            const pColors = getPriorityBadge(ticket.priority);
            const coursesPresent: CourseType[] = ['BEVERAGE', 'APPETIZER', 'MAIN_COURSE', 'DESSERT'];

            return (
              <div
                key={ticket.id}
                className={`w-96 bg-[#1a1b20] border-t-4 ${pColors.border} border-x border-b border-zinc-800 rounded-xl flex flex-col max-h-[92%] shadow-2xl flex-shrink-0 transition-all duration-300 ${
                  ticket.isPulsing
                    ? 'ring-4 ring-amber-500 bg-amber-950/30 animate-pulse shadow-amber-500/50'
                    : 'hover:border-zinc-700'
                }`}
              >
                {/* Ticket Header Card */}
                <div className="p-4 border-b border-zinc-800 bg-[#212228] rounded-t-lg flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-base text-white tracking-wide" style={{ color: '#ffffff' }}>{ticket.table}</h2>
                      <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${pColors.badge}`}>
                        {ticket.priority}
                      </span>
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
                  {coursesPresent.map((courseType) => {
                    const itemsInCourse = ticket.items.filter((i) => i.course === courseType);
                    if (itemsInCourse.length === 0) return null;

                    const theme = getCourseTheme(courseType);
                    const hasHeldItems = itemsInCourse.some((i) => i.preparationStatus === 'HELD');

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

                          {/* FIRE COURSE Button */}
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
                          {itemsInCourse.map((item) => {
                            const isHeld = item.preparationStatus === 'HELD';
                            const isReady = item.preparationStatus === 'READY';

                            return (
                              <div
                                key={item.id}
                                className={`group relative rounded-xl p-3 transition-all duration-200 border shadow-xs ${
                                  isHeld
                                    ? 'bg-amber-950/25 border-dashed border-amber-500/50 backdrop-blur-xs'
                                    : isReady
                                    ? 'bg-emerald-950/30 border-emerald-500/40'
                                    : 'bg-zinc-800/80 border-zinc-700/70 hover:border-zinc-500/80 hover:bg-zinc-800'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2.5">
                                  {/* Left: Quantity Badge + Dish Info */}
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    {/* Qty Badge */}
                                    <span
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-xs ${
                                        isHeld
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                          : isReady
                                          ? 'bg-emerald-500 text-white shadow-emerald-950/50'
                                          : 'bg-zinc-900 text-white border border-zinc-600/80'
                                      }`}
                                      title={`Qty: ${item.qty}`}
                                    >
                                      {item.qty}
                                    </span>

                                    {/* Dish Title, Variant & Course Tag */}
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

                                      {/* Course Tag */}
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

                                      {/* Kitchen Special Notes */}
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
                                          title="Fire item immediately"
                                          className="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-sm active:scale-95"
                                        >
                                          <span className="material-symbols-outlined text-[12px]">local_fire_department</span>
                                          FIRE
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleToggleItemReady(ticket.id, item.id, item.preparationStatus)}
                                          title={isReady ? 'Mark as PREP' : 'Mark as READY'}
                                          className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 ${
                                            isReady
                                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50'
                                              : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100 border border-zinc-600'
                                          }`}
                                        >
                                          <span className="material-symbols-outlined text-[12px]">
                                            {isReady ? 'check_circle' : 'soup_kitchen'}
                                          </span>
                                          <span>{isReady ? 'READY' : 'PREP'}</span>
                                        </button>

                                        <button
                                          onClick={() => handleHoldSingleItem(ticket.id, item.id, item.name)}
                                          title="Put back on hold"
                                          className="p-1 text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/60 rounded transition-colors cursor-pointer"
                                        >
                                          <span className="material-symbols-outlined text-sm">pause_circle</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Held Item Live Countdown Pill */}
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
                  })}
                </div>

                {/* Ticket Footer Action Button */}
                <div className="p-3 border-t border-zinc-800 bg-[#212228] rounded-b-lg">
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
          })
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
