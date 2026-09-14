import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken } from '../../../../../lib/auth-storage';
import { getMerchantUsers } from '../../../../../api/users';
import type { MerchantUser } from '../../../../../types/user';
import { NavHubBar } from '../../../../shared/NavHubBar';
import { HeaderQuickTabs } from '../../../../shared/HeaderQuickTabs';
import {
  TableOptionsMenu,
  NoColumnsEmptyState,
  TableEmptyState,
  TablePaginationFooter,
  getDensityPadding,
} from '../../../../shared/TableOptionsMenu';
import { KitchenQuickLinks } from './KitchenQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export type KitchenEventType = 'inicio' | 'listo' | 'servido' | 'cancelado';

export interface KitchenEventLogUser {
  id: number;
  email?: string;
  name?: string;
  username?: string | null;
  role?: string;
}

export interface KitchenEventLogStation {
  id: number;
  name: string;
  colorHex?: string | null;
}

export interface KitchenEventLogOrder {
  id: number;
  orderId?: number | null;
  businessStatus?: string;
  priority?: number;
  stationId?: number | null;
  notes?: string | null;
}

export interface KitchenEventLogOrderItem {
  id: number;
  kitchenOrderId?: number;
  productId?: number;
  variantId?: number | null;
  productName?: string | null;
  variantName?: string | null;
  quantity?: number;
  preparedQuantity?: number;
  preparationStatus?: string;
}

export interface KitchenEventLogRecord {
  id: number;
  kitchenOrderId?: number | null;
  kitchenOrderItemId?: number | null;
  stationId?: number | null;
  userId?: number | null;
  eventType: KitchenEventType;
  eventTime: string;
  message?: string | null;
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
  user?: KitchenEventLogUser | null;
  station?: KitchenEventLogStation | null;
  kitchenOrder?: KitchenEventLogOrder | null;
  kitchenOrderItem?: KitchenEventLogOrderItem | null;
}

interface StationOption {
  id: number;
  name: string;
  code?: string;
}

interface GroupedOrderEvents {
  orderId: number | null;
  orderKey: string;
  orderRef: string;
  firstEventTime: string;
  lastEventTime: string;
  stationName: string;
  stationId: number | null;
  events: KitchenEventLogRecord[];
  hasCancellation: boolean;
  isCompleted: boolean;
  totalEvents: number;
}

interface KitchenEventLogViewProps {
  onNavigate?: (view: string) => void;
}

export const KitchenEventLogView: React.FC<KitchenEventLogViewProps> = ({ onNavigate }) => {
  const [logs, setLogs] = useState<KitchenEventLogRecord[]>([]);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [staffUsers, setStaffUsers] = useState<MerchantUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Multi-dimensional Filter Bar State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStationId, setSelectedStationId] = useState<number | 'ALL'>('ALL');
  const [selectedUserId, setSelectedUserId] = useState<number | 'ALL'>('ALL');
  const [selectedEventTypes, setSelectedEventTypes] = useState<KitchenEventType[]>([]);
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'last24h' | 'last7d' | 'custom'>('all');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');

  // Table options (Standard canonical X7POS table props)
  const [rowDensity, setRowDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    eventTime: true,
    eventType: true,
    orderRef: true,
    station: true,
    actor: true,
    message: true,
    actions: true,
  });

  // Slide-Over Inspector Drawer
  const [inspectingRecord, setInspectingRecord] = useState<KitchenEventLogRecord | null>(null);
  const [copySuccessJson, setCopySuccessJson] = useState<boolean>(false);
  const [copySuccessMsg, setCopySuccessMsg] = useState<boolean>(false);

  // Toast alert
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Keyboard shortcut to close drawer on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inspectingRecord) {
        setInspectingRecord(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingRecord]);

  // 1. Fetch stations for dropdown filter
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const res = await fetch(`${API_BASE}/kitchen-station?status=active&limit=100`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        const rawList = data.data || data || [];
        setStations(rawList.map((st: any) => ({ id: st.id, name: st.name, code: st.code })));
      } catch (e) {
        console.error('Failed to load stations', e);
      }
    };
    fetchStations();
  }, []);

  // 2. Fetch staff/merchant users for staff dropdown filter
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const users = await getMerchantUsers();
        if (Array.isArray(users)) {
          setStaffUsers(users);
        }
      } catch (e) {
        console.error('Failed to load merchant staff users', e);
      }
    };
    fetchStaff();
  }, []);

  // 3. Handle Date Presets
  const handlePresetChange = (preset: 'all' | 'today' | 'last24h' | 'last7d' | 'custom') => {
    setDatePreset(preset);
    setCurrentPage(1);
    const now = new Date();

    if (preset === 'all') {
      setStartTime('');
      setEndTime('');
    } else if (preset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const toISOStringWithTZ = (d: Date) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
      };
      setStartTime(toISOStringWithTZ(start));
      setEndTime(toISOStringWithTZ(now));
    } else if (preset === 'last24h') {
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const toISOStringWithTZ = (d: Date) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
      };
      setStartTime(toISOStringWithTZ(start));
      setEndTime(toISOStringWithTZ(now));
    } else if (preset === 'last7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const toISOStringWithTZ = (d: Date) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
      };
      setStartTime(toISOStringWithTZ(start));
      setEndTime(toISOStringWithTZ(now));
    }
  };

  // 4. Toggle Event Type Multi-Select
  const toggleEventType = (type: KitchenEventType) => {
    setSelectedEventTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      } else {
        return [...prev, type];
      }
    });
    setCurrentPage(1);
  };

  const selectAllEventTypes = () => {
    setSelectedEventTypes([]);
    setCurrentPage(1);
  };

  // 5. Fetch Event Logs from Backend
  const fetchEventLogs = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params = new URLSearchParams({
        limit: '100',
        sortBy: 'eventTime',
        sortOrder: 'DESC',
      });

      if (selectedStationId !== 'ALL') {
        params.append('stationId', selectedStationId.toString());
      }
      if (selectedUserId !== 'ALL') {
        params.append('userId', selectedUserId.toString());
      }
      if (selectedEventTypes.length > 0 && selectedEventTypes.length < 4) {
        params.append('eventTypes', selectedEventTypes.join(','));
      }
      if (startTime) {
        params.append('startTime', new Date(startTime).toISOString());
      }
      if (endTime) {
        params.append('endTime', new Date(endTime).toISOString());
      }

      // Entity ID detection in search query (#KO-11, #ITM-5, #KEL-4, or numbers)
      const numMatch = searchQuery.match(/\d+/);
      if (numMatch && (searchQuery.includes('#') || searchQuery.trim().length <= 5)) {
        params.append('searchId', numMatch[0]);
      }

      const res = await fetch(`${API_BASE}/kitchen-event-logs?${params.toString()}`, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const detailMsg =
          (Array.isArray(errJson?.errors) ? errJson.errors.join(', ') : errJson?.message) ||
          `Server returned HTTP ${res.status}`;
        throw new Error(detailMsg);
      }
      const json = await res.json();
      const records: KitchenEventLogRecord[] = Array.isArray(json.data) ? json.data : [];
      setLogs(records);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Failed to fetch kitchen event logs', err);
      if (!silent) {
        showToast(`Error syncing event logs: ${err.message || 'Network error'}`, 'warning');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEventLogs();
  }, [selectedStationId, selectedUserId, selectedEventTypes, startTime, endTime]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchEventLogs(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, selectedStationId, selectedUserId, selectedEventTypes, startTime, endTime]);

  // Client-side instant search filtering
  const filteredLogs = useMemo(() => {
    let result = [...logs];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((item) => {
        const orderMatch = item.kitchenOrderId
          ? `#ko-${item.kitchenOrderId}`.includes(q) || item.kitchenOrderId.toString().includes(q)
          : false;
        const itemMatch = item.kitchenOrderItemId
          ? `#itm-${item.kitchenOrderItemId}`.includes(q) || item.kitchenOrderItemId.toString().includes(q)
          : false;
        const logIdMatch = `#kel-${item.id}`.includes(q) || item.id.toString().includes(q);
        const typeMatch = item.eventType.toLowerCase().includes(q);
        const msgMatch = item.message ? item.message.toLowerCase().includes(q) : false;
        const stationMatch = item.station?.name ? item.station.name.toLowerCase().includes(q) : false;
        const userMatch = item.user?.username
          ? item.user.username.toLowerCase().includes(q)
          : item.user?.name
          ? item.user.name.toLowerCase().includes(q)
          : item.user?.email
          ? item.user.email.toLowerCase().includes(q)
          : false;
        const productMatch = item.kitchenOrderItem?.productName
          ? item.kitchenOrderItem.productName.toLowerCase().includes(q)
          : false;
        const orderNotesMatch = item.kitchenOrder?.notes
          ? item.kitchenOrder.notes.toLowerCase().includes(q)
          : false;

        return (
          orderMatch ||
          itemMatch ||
          logIdMatch ||
          typeMatch ||
          msgMatch ||
          stationMatch ||
          userMatch ||
          productMatch ||
          orderNotesMatch
        );
      });
    }
    return result;
  }, [logs, searchQuery]);

  // Agrupamiento por orden (patrón estilo stock)
  const groupedOrders = useMemo(() => {
    const groupMap = new Map<string, GroupedOrderEvents>();

    filteredLogs.forEach((log) => {
      const orderId = log.kitchenOrderId ?? null;
      const key = orderId ? `order-${orderId}` : 'unassigned';

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          orderId,
          orderKey: key,
          orderRef: orderId ? `#KO-${orderId}` : 'No Order',
          firstEventTime: log.eventTime,
          lastEventTime: log.eventTime,
          stationName: log.station?.name || 'Global / Unassigned',
          stationId: log.station?.id || null,
          events: [],
          hasCancellation: false,
          isCompleted: false,
          totalEvents: 0,
        });
      }

      const grp = groupMap.get(key)!;
      grp.events.push(log);
      grp.totalEvents += 1;
      if (log.eventType === 'cancelado') grp.hasCancellation = true;
      if (log.eventType === 'servido') grp.isCompleted = true;
      if (new Date(log.eventTime).getTime() < new Date(grp.firstEventTime).getTime()) {
        grp.firstEventTime = log.eventTime;
      }
      if (new Date(log.eventTime).getTime() > new Date(grp.lastEventTime).getTime()) {
        grp.lastEventTime = log.eventTime;
      }
    });

    const groups = Array.from(groupMap.values());

    // 1. Dentro de cada grupo de orden, ordenar eventos estrictamente en el orden en que ocurrieron (cronológico)
    groups.forEach((grp) => {
      grp.events.sort((a, b) => {
        const timeA = new Date(a.eventTime).getTime();
        const timeB = new Date(b.eventTime).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.id ?? 0) - (b.id ?? 0);
      });
    });

    // 2. Orden de la tabla: Órdenes con eventos más recientes primero
    groups.sort((a, b) => {
      if (!a.orderId) return 1;
      if (!b.orderId) return -1;
      return new Date(b.lastEventTime).getTime() - new Date(a.lastEventTime).getTime();
    });

    return groups;
  }, [filteredLogs]);

  // Estado de grupos expandidos (por defecto todas las órdenes cerradas/contraídas)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAllGroups = () => {
    setExpandedGroups(new Set(groupedOrders.map((g) => g.orderKey)));
  };

  const collapseAllGroups = () => {
    setExpandedGroups(new Set());
  };

  // Grupos paginados
  const paginatedGroups = useMemo(() => {
    if (pageSize >= 9999) return groupedOrders;
    const start = (currentPage - 1) * pageSize;
    return groupedOrders.slice(start, start + pageSize);
  }, [groupedOrders, currentPage, pageSize]);

  const activeColSpan = Object.values(visibleColumns).filter(Boolean).length;

  // Story 4203: Real-Time Event Metrics Velocity KPI Bar Calculations
  const velocityMetrics = useMemo(() => {
    const isToday = (dateStr: string) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    };

    // If user explicitly filtered by datePreset === 'today', use today's subset; otherwise evaluate all loaded logs
    const activeSet = datePreset === 'today' ? logs.filter((l) => isToday(l.eventTime)) : logs;

    const totalToday = activeSet.length;
    const inicioToday = activeSet.filter((l) => l.eventType === 'inicio').length;
    const listoToday = activeSet.filter((l) => l.eventType === 'listo').length;
    const servidoToday = activeSet.filter((l) => l.eventType === 'servido').length;
    const canceladoToday = activeSet.filter((l) => l.eventType === 'cancelado').length;

    // Cancellation Rate: Percentage of cancellations out of total events
    const cancellationRate = totalToday > 0 ? (canceladoToday / totalToday) * 100 : 0;
    // Incident threshold: triggers dynamic warning if cancellation rate > 5%
    const isSpikeAlert = totalToday > 0 && cancellationRate > 5.0;

    // Operational Velocity: events recorded per hour in current service day
    const currentHour = Math.max(1, new Date().getHours());
    const velocityPerHour = totalToday > 0 ? (totalToday / currentHour).toFixed(1) : '0.0';

    return {
      totalToday,
      inicioToday,
      listoToday,
      servidoToday,
      canceladoToday,
      cancellationRate,
      isSpikeAlert,
      velocityPerHour,
      isShowingTodaySubset: datePreset === 'today',
    };
  }, [logs, datePreset]);

  // Real-time counts across current loaded dataset for filter pills
  const typeCounts = useMemo(() => {
    return {
      total: logs.length,
      inicio: logs.filter((l) => l.eventType === 'inicio').length,
      listo: logs.filter((l) => l.eventType === 'listo').length,
      servido: logs.filter((l) => l.eventType === 'servido').length,
      cancelado: logs.filter((l) => l.eventType === 'cancelado').length,
    };
  }, [logs]);

  // Formatter helpers
  const formatTimestamp = (dateStr: string) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`;
  };

  const formatTimeOnly = (dateStr: string) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Story 4203: Strict Material Symbols Outlined Icon Engine Compliance
  const getEventTypeBadge = (type: KitchenEventType, size: 'sm' | 'md' = 'sm') => {
    const pad = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[10px]';
    switch (type) {
      case 'inicio':
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 ${pad}`}>
            <span className="material-symbols-outlined text-[13px] text-blue-600">play_circle</span>
            STARTED
          </span>
        );
      case 'listo':
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 ${pad}`}>
            <span className="material-symbols-outlined text-[13px] text-emerald-600">check_circle</span>
            READY
          </span>
        );
      case 'servido':
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider bg-zinc-100 text-zinc-700 border border-zinc-300 ${pad}`}>
            <span className="material-symbols-outlined text-[13px] text-zinc-600">local_shipping</span>
            SERVED
          </span>
        );
      case 'cancelado':
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider bg-red-50 text-[#ae001a] border border-red-200 ${pad}`}>
            <span className="material-symbols-outlined text-[13px] text-[#ae001a]">cancel</span>
            CANCELLED
          </span>
        );
      default:
        return (
          <span className={`rounded font-bold uppercase bg-zinc-100 text-zinc-700 border border-zinc-300 ${pad}`}>
            {type}
          </span>
        );
    }
  };

  const handleCopyPayload = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopySuccessJson(true);
    setTimeout(() => setCopySuccessJson(false), 2000);
  };

  const handleCopyMessage = (msg: string) => {
    navigator.clipboard.writeText(msg);
    setCopySuccessMsg(true);
    setTimeout(() => setCopySuccessMsg(false), 2000);
  };

  // Export to CSV Engine
  const exportToCSV = () => {
    if (filteredLogs.length === 0) {
      showToast('No records to export', 'warning');
      return;
    }
    const headers = [
      'Log ID',
      'Event Type',
      'Date / Time',
      'Kitchen Order ID',
      'Master POS Ref',
      'Order Item ID',
      'Product',
      'Variant',
      'Station ID',
      'Station Name',
      'User ID',
      'Username',
      'User Email',
      'Audit Message',
    ];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.eventType,
      l.eventTime,
      l.kitchenOrderId || '',
      l.kitchenOrder?.orderId ? `#ORD-${l.kitchenOrder.orderId}` : '',
      l.kitchenOrderItemId || '',
      `"${(l.kitchenOrderItem?.productName || '').replace(/"/g, '""')}"`,
      `"${(l.kitchenOrderItem?.variantName || '').replace(/"/g, '""')}"`,
      l.stationId || '',
      `"${(l.station?.name || 'Unassigned').replace(/"/g, '""')}"`,
      l.userId || '',
      `"${(l.user?.username || l.user?.name || '').replace(/"/g, '""')}"`,
      `"${(l.user?.email || '').replace(/"/g, '""')}"`,
      `"${(l.message || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `kitchen_event_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Event logs exported to CSV successfully', 'success');
  };

  // Export to JSON Engine
  const exportToJSON = () => {
    if (filteredLogs.length === 0) {
      showToast('No records to export', 'warning');
      return;
    }
    const jsonStr = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `kitchen_event_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Event logs exported to JSON successfully', 'success');
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-24">
      <div ref={topRef} />

      {/* FLOATING TOAST ALERT */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 transition-all duration-300">
          <div
            className={`flex items-center gap-3 px-5 py-3.5 rounded-lg shadow-xl border text-sm font-semibold tracking-wide ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : toastMessage.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {toastMessage.type === 'success' ? 'check_circle' : toastMessage.type === 'warning' ? 'warning' : 'info'}
            </span>
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-3 text-[#5f5e5e] hover:text-[#1d1c17] transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 1. Header Card Workspace */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            KITCHEN EVENT AUDIT LOG &amp; TIMELINE INSPECTOR
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Real-time operational event stream, actor tracking, station telemetry &amp; forensic state change audit trail.
          </p>
        </div>
      </div>

      {/* 1.5 Story 4203: Real-Time Event Metrics Velocity KPI Bar (4 Cuadrados idénticos en fila estática con Detección de Incidentes) */}
      <div className="grid grid-cols-4 gap-4 w-full">
        {/* KPI 1: Total Events Today */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0 transition-all duration-200 hover:border-[#d5cfc4]">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-zinc-100 text-zinc-800 border border-zinc-300 shrink-0 whitespace-nowrap">
            {velocityMetrics.isShowingTodaySubset ? 'TODAY' : 'SERVICE SHIFT'}
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center border border-zinc-200 shrink-0">
              <span className="material-symbols-outlined text-xl">history</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-14 sm:pr-16">
                Total Events Today
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none">
                  {loading ? '...' : velocityMetrics.totalToday}
                </span>
                <span className="text-[10px] text-[#5f5e5e] font-semibold whitespace-nowrap hidden xl:inline">
                  ~{velocityMetrics.velocityPerHour} evt/hr
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 2: Order Starts (STARTED) */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0 transition-all duration-200 hover:border-blue-200">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 shrink-0 whitespace-nowrap">
            STARTED
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shrink-0">
              <span className="material-symbols-outlined text-xl">play_circle</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-16 sm:pr-20">
                Order Starts
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : velocityMetrics.inicioToday}{' '}
                <span className="text-xs sm:text-sm text-[#5f5e5e] font-normal">/ {velocityMetrics.totalToday}</span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Orders Completed (READY) */}
        <div className="relative bg-white border border-[#e8e2d8] p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0 transition-all duration-200 hover:border-emerald-200">
          <span className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
            READY
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">check_circle</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-16 sm:pr-20">
                Orders Completed
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : velocityMetrics.listoToday}{' '}
                <span className="text-xs sm:text-sm text-[#5f5e5e] font-normal">/ {velocityMetrics.totalToday}</span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 4: Kitchen Cancellations (CANCELADO) with Dynamic Spike Warning Threshold Alert (>5%) */}
        <div
          className={`relative p-3.5 sm:p-4 rounded-xl shadow-xs min-w-0 transition-all duration-200 ${
            velocityMetrics.isSpikeAlert
              ? 'bg-red-50/40 border-2 border-red-300 ring-1 ring-red-200'
              : 'bg-white border border-[#e8e2d8] hover:border-red-200'
          }`}
        >
          <span
            className={`absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase shrink-0 whitespace-nowrap ${
              velocityMetrics.isSpikeAlert
                ? 'bg-red-100 text-[#ae001a] border border-red-300 animate-pulse font-extrabold'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
            title={
              velocityMetrics.isSpikeAlert
                ? `Cancellation rate (${velocityMetrics.cancellationRate.toFixed(1)}%) breaches 5% threshold`
                : `Cancellation rate (${velocityMetrics.cancellationRate.toFixed(1)}%) within safe threshold`
            }
          >
            {velocityMetrics.isSpikeAlert
              ? `⚠️ SPIKE (${velocityMetrics.cancellationRate.toFixed(1)}%)`
              : `OPTIMAL (${velocityMetrics.cancellationRate.toFixed(1)}%)`}
          </span>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${
                velocityMetrics.isSpikeAlert
                  ? 'bg-red-100 text-[#ae001a] border-red-300'
                  : 'bg-red-50 text-[#ae001a] border-red-200'
              }`}
            >
              <span className="material-symbols-outlined text-xl">cancel</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider whitespace-nowrap pr-24 sm:pr-28">
                Cancellations
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#1d1c17] whitespace-nowrap leading-none mt-1">
                {loading ? '...' : velocityMetrics.canceladoToday}{' '}
                <span className="text-xs sm:text-sm text-[#5f5e5e] font-normal">/ {velocityMetrics.totalToday}</span>
              </div>
              {velocityMetrics.isSpikeAlert && (
                <div className="text-[10px] text-[#ae001a] font-bold mt-1 tracking-tight flex items-center gap-1">
                  <span>Breaches 5% alert threshold</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Unified Multi-Dimensional Filter Bar Controls */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
        {/* ROW 1: Search, Station Selector, Staff Selector, Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Entity ID / General Search Input */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[#5f5e5e]">
                search
              </span>
              <input
                type="text"
                placeholder="Search #KO, #ITM, #KEL, Station, Staff..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-[#d5cfc4] focus:outline-none focus:border-[#ae001a] bg-[#fcfcfb] text-[#1d1c17] placeholder:text-[#8c857b] transition-colors duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Station Dropdown Selector (Using 'soup_kitchen' icon) */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="material-symbols-outlined text-base">soup_kitchen</span>
              <select
                value={selectedStationId}
                onChange={(e) => {
                  setSelectedStationId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-2 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] text-[#1d1c17] focus:outline-none focus:border-[#ae001a] text-xs cursor-pointer max-w-[180px] transition-colors duration-200"
              >
                <option value="ALL">All Stations ({stations.length})</option>
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} {st.code ? `(${st.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Staff / Personnel Selector (Using 'account_circle' icon) */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="material-symbols-outlined text-base">account_circle</span>
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-2 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] text-[#1d1c17] focus:outline-none focus:border-[#ae001a] text-xs cursor-pointer max-w-[180px] transition-colors duration-200"
              >
                <option value="ALL">All Staff ({staffUsers.length})</option>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.username || u.email.split('@')[0]} (ID #{u.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right Toolbar: Auto-refresh */}
          <div className="flex items-center gap-1 text-xs text-[#5f5e5e]">
            <span className="material-symbols-outlined text-sm">sync</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="px-2 py-1.5 rounded border border-[#d5cfc4] bg-[#fcfcfb] text-[#1d1c17] text-[11px] focus:outline-none focus:border-[#ae001a] cursor-pointer transition-colors duration-200"
            >
              <option value={0}>Auto: Off</option>
              <option value={10}>Auto: 10s</option>
              <option value={30}>Auto: 30s</option>
              <option value={60}>Auto: 60s</option>
            </select>
          </div>
        </div>

        {/* ROW 2: Date & Time Range Controls + Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#f0ede6]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] shrink-0 mr-1">
              Date Range:
            </span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'last24h', label: 'Last 24h' },
              { id: 'last7d', label: 'Last 7 Days' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => {
              const isActive = datePreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePresetChange(p.id as any)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                    isActive
                      ? 'bg-[#1d1c17] text-white border-[#1d1c17]'
                      : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date & Time Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="text-[11px] font-medium">From:</span>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setDatePreset('custom');
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded border border-[#d5cfc4] bg-[#fcfcfb] text-[#1d1c17] text-xs focus:outline-none focus:border-[#ae001a] cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="text-[11px] font-medium">To:</span>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setDatePreset('custom');
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded border border-[#d5cfc4] bg-[#fcfcfb] text-[#1d1c17] text-xs focus:outline-none focus:border-[#ae001a] cursor-pointer"
              />
            </div>
            {(startTime || endTime) && (
              <button
                onClick={() => {
                  setStartTime('');
                  setEndTime('');
                  setDatePreset('all');
                  setCurrentPage(1);
                }}
                className="text-[11px] text-[#ae001a] hover:underline font-semibold cursor-pointer ml-1 transition-colors duration-200"
                title="Clear date filter"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ROW 3: Event Type Multi-Select Pills */}
        <div className="flex items-center gap-2 pt-3 border-t border-[#f0ede6] overflow-x-auto">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] shrink-0 mr-1">
            Event Types:
          </span>

          {/* All Types Pill */}
          <button
            onClick={selectAllEventTypes}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap border ${
              selectedEventTypes.length === 0
                ? 'bg-[#1d1c17] text-white border-[#1d1c17] shadow-xs'
                : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
            }`}
          >
            <span>All Types</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedEventTypes.length === 0 ? 'bg-white/20 text-white' : 'bg-zinc-100 text-[#5f5e5e]'
              }`}
            >
              {typeCounts.total}
            </span>
          </button>

          {/* STARTED Pill (Icon: play_circle) */}
          <button
            onClick={() => toggleEventType('inicio')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap border ${
              selectedEventTypes.includes('inicio')
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-blue-50/50 text-blue-800 border-blue-200 hover:bg-blue-100/50 hover:text-blue-900'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">play_circle</span>
            <span>STARTED</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedEventTypes.includes('inicio') ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {typeCounts.inicio}
            </span>
          </button>

          {/* READY Pill (Icon: check_circle) */}
          <button
            onClick={() => toggleEventType('listo')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap border ${
              selectedEventTypes.includes('listo')
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-50/50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/50 hover:text-emerald-900'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            <span>READY</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedEventTypes.includes('listo') ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {typeCounts.listo}
            </span>
          </button>

          {/* SERVED Pill (Icon: local_shipping) */}
          <button
            onClick={() => toggleEventType('servido')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap border ${
              selectedEventTypes.includes('servido')
                ? 'bg-zinc-700 text-white border-zinc-700 shadow-xs'
                : 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200 hover:text-zinc-900'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">local_shipping</span>
            <span>SERVED</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedEventTypes.includes('servido') ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-800'
              }`}
            >
              {typeCounts.servido}
            </span>
          </button>

          {/* CANCELLED Pill (Icon: cancel) */}
          <button
            onClick={() => toggleEventType('cancelado')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap border ${
              selectedEventTypes.includes('cancelado')
                ? 'bg-[#ae001a] text-white border-[#ae001a] shadow-xs'
                : 'bg-red-50 text-[#ae001a] border-red-200 hover:bg-red-100/60 hover:text-[#900015]'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">cancel</span>
            <span>CANCELLED</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedEventTypes.includes('cancelado') ? 'bg-white/20 text-white' : 'bg-red-100 text-[#ae001a]'
              }`}
            >
              {typeCounts.cancelado}
            </span>
          </button>

          {selectedEventTypes.length > 0 && (
            <span className="text-[11px] text-[#5f5e5e] italic ml-2">
              (Multi-filter active: {selectedEventTypes.length} selected)
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={expandAllGroups}
              className="text-xs text-[#5f5e5e] hover:text-[#ae001a] px-2.5 py-1 rounded border border-[#e8e2d8] hover:bg-[#f8f3eb] transition-colors cursor-pointer font-medium flex items-center gap-1"
              title="Expand all orders"
            >
              <span className="material-symbols-outlined text-[15px]">unfold_more</span>
              <span>Expand All</span>
            </button>
            <button
              onClick={collapseAllGroups}
              className="text-xs text-[#5f5e5e] hover:text-[#ae001a] px-2.5 py-1 rounded border border-[#e8e2d8] hover:bg-[#f8f3eb] transition-colors cursor-pointer font-medium flex items-center gap-1"
              title="Collapse all orders"
            >
              <span className="material-symbols-outlined text-[15px]">unfold_less</span>
              <span>Collapse All</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Standard Canonical Table Container */}
      <div className="bg-white border border-[#e8e2d8] rounded shadow-sm relative overflow-hidden">
        {/* HeaderQuickTabs con Título Oficial, Badge de Conteo y TableOptionsMenu */}
        <HeaderQuickTabs
          title="KITCHEN EVENT LOG AUDIT DIRECTORY"
          badgeCount={
            paginatedGroups.length === groupedOrders.length
              ? `${groupedOrders.length} order${groupedOrders.length === 1 ? '' : 's'} (${filteredLogs.length} events)`
              : `${paginatedGroups.length} / ${groupedOrders.length} orders (${filteredLogs.length} events)`
          }
          tabs={[]}
          rightElement={
            <TableOptionsMenu
              onExportCSV={exportToCSV}
              exportCSVLabel="Export Logs to CSV"
              customActions={[
                {
                  icon: 'data_object',
                  label: 'Export Logs to JSON',
                  onClick: exportToJSON,
                  colorClass: 'text-amber-700',
                },
              ]}
              onPrint={() => window.print()}
              printLabel="Print Event Log Directory"
              onCopySummary={() => {
                const summaryText = `Kitchen Event Log Audit Summary:\n- Total Orders: ${groupedOrders.length}\n- Total Events Today: ${velocityMetrics.totalToday}\n- Order Starts (INICIO): ${velocityMetrics.inicioToday}\n- Orders Completed (LISTO): ${velocityMetrics.listoToday}\n- Servido: ${velocityMetrics.servidoToday}\n- Cancellations: ${velocityMetrics.canceladoToday} (${velocityMetrics.cancellationRate.toFixed(1)}%)`;
                navigator.clipboard.writeText(summaryText);
                showToast('Summary copied to clipboard', 'info');
              }}
              onReload={() => fetchEventLogs(false)}
              columns={[
                { key: 'eventTime', label: 'Event Timestamp' },
                { key: 'eventType', label: 'Event Type' },
                { key: 'orderRef', label: 'Order / Item Ref' },
                { key: 'station', label: 'Station Binding' },
                { key: 'actor', label: 'Triggering Actor' },
                { key: 'message', label: 'Audit Message' },
                { key: 'actions', label: 'Actions' },
              ]}
              visibleColumns={visibleColumns}
              onToggleColumn={(key) =>
                setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
              }
              rowDensity={rowDensity}
              onChangeDensity={setRowDensity}
              totalItems={groupedOrders.length}
              pageSize={pageSize}
              onChangePageSize={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          }
        />

        {!Object.values(visibleColumns).some(Boolean) ? (
          <NoColumnsEmptyState />
        ) : (
          <>
            <div className="w-full overflow-x-hidden">
              <table className="w-full table-fixed text-left border-collapse text-xs font-sans">
                <colgroup>
                  {visibleColumns.eventTime && <col style={{ width: '20%' }} />}
                  {visibleColumns.eventType && <col style={{ width: '13%' }} />}
                  {visibleColumns.orderRef && <col style={{ width: '15%' }} />}
                  {visibleColumns.station && <col style={{ width: '14%' }} />}
                  {visibleColumns.actor && <col style={{ width: '12%' }} />}
                  {visibleColumns.message && <col />}
                  {visibleColumns.actions && <col style={{ width: '95px' }} />}
                </colgroup>
                <thead>
                  <tr className="bg-[#ece8e0] text-[#5f5e5e] uppercase text-[11px] tracking-wider font-bold border-b border-[#e8e2d8]">
                    {visibleColumns.eventTime && (
                      <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e]`}>Event Timestamp</th>
                    )}
                    {visibleColumns.eventType && (
                      <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e]`}>Event Type</th>
                    )}
                    {visibleColumns.orderRef && (
                      <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e]`}>Order / Item Ref</th>
                    )}
                    {visibleColumns.station && (
                      <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e]`}>Station</th>
                    )}
                    {visibleColumns.actor && (
                      <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e]`}>Actor</th>
                    )}
                    {visibleColumns.message && (
                      <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e]`}>Notes / Message</th>
                    )}
                    {visibleColumns.actions && (
                      <th className={`${getDensityPadding(rowDensity)} text-right text-[#5f5e5e] whitespace-nowrap`}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8]">
                  {loading ? (
                    <tr>
                      <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                        <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                          sync
                        </span>
                        <p className="text-secondary text-body-md mt-2 font-sans">Loading audit event log records...</p>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <TableEmptyState
                      colSpan={activeColSpan}
                      icon="history"
                      title="No kitchen events logged"
                      description="No kitchen operational events have been recorded in the system yet."
                    />
                  ) : filteredLogs.length === 0 || paginatedGroups.length === 0 ? (
                    <TableEmptyState
                      colSpan={activeColSpan}
                      icon="history"
                      title="No kitchen events matched"
                      description="Try adjusting your filter matrix, date range, or staff selection."
                    />
                  ) : (
                    paginatedGroups.map((group) => {
                      const densityPadding = getDensityPadding(rowDensity);
                      const isExpanded = expandedGroups.has(group.orderKey);

                      return (
                        <React.Fragment key={group.orderKey}>
                          {/* Fila Principal de la Orden (Cabecera de Grupo estilo Stock) */}
                          <tr
                            onClick={() => toggleGroup(group.orderKey)}
                            className={`group transition-colors duration-150 cursor-pointer border-t-2 border-[#e8e2d8] ${
                              isExpanded ? 'bg-[#fef9f1]' : 'hover:bg-[#f8f3eb] bg-white'
                            }`}
                          >
                            {/* Columna 1: Timestamp de llegada con Chevron */}
                            {visibleColumns.eventTime && (
                              <td className={`${densityPadding} truncate`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`material-symbols-outlined text-[18px] text-[#5f5e5e] shrink-0 transition-transform duration-200 ${
                                      isExpanded ? 'rotate-90 text-[#ae001a]' : ''
                                    }`}
                                  >
                                    chevron_right
                                  </span>
                                  <div className="min-w-0 truncate">
                                    <div className="font-bold text-[#1d1c17] text-xs truncate group-hover:text-[#ae001a] transition-colors duration-200">
                                      {formatTimestamp(group.lastEventTime)}
                                    </div>
                                    <div className="text-[10px] text-[#5f5e5e] font-mono truncate mt-0.5">
                                      {group.lastEventTime !== group.firstEventTime ? (
                                        <span>Active {formatRelativeTime(group.lastEventTime)} • Recv: {formatTimeOnly(group.firstEventTime)}</span>
                                      ) : (
                                        <span>Received: {formatTimeOnly(group.firstEventTime)}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            )}

                            {/* Columna 2: Estado general de la comanda */}
                            {visibleColumns.eventType && (
                              <td className={`${densityPadding} truncate`}>
                                {group.hasCancellation ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-[#ae001a] border border-red-200 whitespace-nowrap">
                                    <span className="material-symbols-outlined text-[13px]">cancel</span>
                                    CANCELLED
                                  </span>
                                ) : group.isCompleted ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                    SERVED
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">
                                    <span className="material-symbols-outlined text-[13px]">pending</span>
                                    IN PREP
                                  </span>
                                )}
                              </td>
                            )}

                            {/* Columna 3: Order Ref y conteo de eventos */}
                            {visibleColumns.orderRef && (
                              <td className={`${densityPadding} truncate`}>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {group.orderId ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onNavigate?.('kitchen-orders');
                                      }}
                                      className="px-2 py-0.5 rounded text-xs font-mono font-black bg-[#f2ede5] hover:bg-[#ae001a] hover:text-white text-[#1d1c17] border border-[#d5cfc4] transition-colors duration-200 cursor-pointer shadow-2xs shrink-0"
                                      title="View Order in Kitchen Orders"
                                    >
                                      {group.orderRef}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-[#5f5e5e] italic shrink-0">{group.orderRef}</span>
                                  )}
                                  <span className="text-[10px] font-bold text-[#5f5e5e] bg-stone-100 px-1.5 py-0.5 rounded-full border border-stone-200 shrink-0">
                                    {group.totalEvents} evt
                                  </span>
                                </div>
                              </td>
                            )}

                            {/* Columna 4: Estación */}
                            {visibleColumns.station && (
                              <td className={`${densityPadding} truncate`}>
                                <div className="truncate text-xs font-bold text-[#1d1c17]" title={group.stationName}>
                                  {group.stationName}
                                </div>
                              </td>
                            )}

                            {/* Columna 5: Actor */}
                            {visibleColumns.actor && (
                              <td className={`${densityPadding} text-center`}>
                                <span className="text-[#8c857b] text-xs">—</span>
                              </td>
                            )}

                            {/* Columna 6: Audit Message */}
                            {visibleColumns.message && (
                              <td className={`${densityPadding} text-center`}>
                                <span className="text-[#8c857b] text-xs">—</span>
                              </td>
                            )}

                            {/* Columna 7: Actions */}
                            {visibleColumns.actions && (
                              <td className={`${densityPadding} text-right whitespace-nowrap`}>
                                <span
                                  className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-[#ece8e0] text-[#5f5e5e] transition-colors"
                                  title={isExpanded ? 'Collapse' : 'Expand'}
                                >
                                  <span className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                    keyboard_arrow_down
                                  </span>
                                </span>
                              </td>
                            )}
                          </tr>

                          {/* Subfilas con los eventos individuales desglosados */}
                          {isExpanded &&
                            group.events.map((record) => (
                              <tr
                                key={record.id}
                                onClick={() => setInspectingRecord(record)}
                                className="transition-colors duration-150 hover:bg-[#fef9f1] bg-[#fcfaf7]/70 cursor-pointer group/sub"
                              >
                                {/* Event Timestamp con indentación */}
                                {visibleColumns.eventTime && (
                                  <td className={`${densityPadding} pl-6 truncate relative`}>
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#ae001a]/40" />
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="material-symbols-outlined text-[15px] text-[#ae001a]/60 shrink-0">
                                        subdirectory_arrow_right
                                      </span>
                                      <div className="min-w-0 truncate">
                                        <div className="font-semibold text-[#1d1c17] text-xs group-hover/sub:text-[#ae001a] transition-colors duration-200 truncate">
                                          {formatTimestamp(record.eventTime)}
                                        </div>
                                        <div className="text-[10px] text-[#5f5e5e] font-mono truncate mt-0.5">
                                          {formatTimeOnly(record.eventTime)} • {formatRelativeTime(record.eventTime)}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                )}

                                {/* Event Type Badge */}
                                {visibleColumns.eventType && (
                                  <td className={`${densityPadding} truncate`}>
                                    {getEventTypeBadge(record.eventType)}
                                  </td>
                                )}

                                {/* Order / Item Ref */}
                                {visibleColumns.orderRef && (
                                  <td className={`${densityPadding} truncate`}>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {record.kitchenOrderItemId ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onNavigate?.('kitchen-order-items');
                                          }}
                                          className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-800 border border-blue-200 transition-colors duration-200 cursor-pointer shrink-0"
                                          title="View Kitchen Order Item"
                                        >
                                          #ITM-{record.kitchenOrderItemId}
                                        </button>
                                      ) : (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-stone-100 text-stone-600 border border-stone-200 shrink-0">
                                          Order
                                        </span>
                                      )}
                                      {record.kitchenOrderItem?.productName && (
                                        <span
                                          className="text-[11px] font-semibold text-[#1d1c17] truncate"
                                          title={record.kitchenOrderItem.productName}
                                        >
                                          {record.kitchenOrderItem.productName}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                )}

                                {/* Station Binding */}
                                {visibleColumns.station && (
                                  <td className={`${densityPadding} truncate`}>
                                    <div
                                      className="truncate font-medium text-[#1d1c17] text-xs"
                                      title={record.station ? record.station.name : 'Global / Unassigned'}
                                    >
                                      {record.station ? record.station.name : (
                                        <span className="text-[#8c857b] italic">Global</span>
                                      )}
                                    </div>
                                  </td>
                                )}

                                {/* Triggering Actor */}
                                {visibleColumns.actor && (
                                  <td className={`${densityPadding} truncate`}>
                                    {record.user ? (
                                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                                        <div className="w-5 h-5 rounded-full bg-[#f2ede5] border border-[#e8e2d8] text-[#5f5e5e] flex items-center justify-center shrink-0 font-bold text-[9px]">
                                          {(record.user.username || record.user.email || 'U')[0].toUpperCase()}
                                        </div>
                                        <span className="font-medium text-[#1d1c17] text-xs truncate" title={record.user.username || record.user.name || record.user.email}>
                                          {record.user.username || record.user.name || record.user.email?.split('@')[0]}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8]">
                                        <span className="material-symbols-outlined text-[12px]">smart_toy</span>
                                        <span>System</span>
                                      </div>
                                    )}
                                  </td>
                                )}

                                {/* Audit Message / Notes */}
                                {visibleColumns.message && (
                                  <td className={`${densityPadding} truncate`}>
                                    <div
                                      className="text-xs text-[#1d1c17] truncate font-normal"
                                      title={record.message || ''}
                                    >
                                      {record.message || <span className="text-[#8c857b] italic">—</span>}
                                    </div>
                                  </td>
                                )}

                                {/* Actions: solo el icono */}
                                {visibleColumns.actions && (
                                  <td className={`${densityPadding} text-right whitespace-nowrap`}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setInspectingRecord(record);
                                      }}
                                      className="inline-flex items-center justify-center w-7 h-7 rounded border border-[#d5cfc4] bg-white hover:bg-[#ae001a] hover:text-white hover:border-[#ae001a] text-[#1d1c17] transition-all duration-150 shadow-2xs cursor-pointer group/btn"
                                      title="Inspect Event"
                                    >
                                      <span className="material-symbols-outlined text-[16px] text-[#ae001a] group-hover/btn:text-white transition-colors duration-150">
                                        dock_to_left
                                      </span>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Standard Canonical TablePaginationFooter */}
              <TablePaginationFooter
                currentPage={currentPage}
                totalItems={groupedOrders.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
          </>
        )}
      </div>

      {/* 4. SLIDE-OVER STAFF ACTIVITY & EVENT INSPECTION DRAWER */}
      {inspectingRecord &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 z-[9999] flex justify-end items-stretch backdrop-blur-xs font-sans"
            onClick={() => setInspectingRecord(null)}
          >
            {/* Slide-over Drawer Panel (Identical size to Devices Drawer: max-w-md) */}
            <div
              className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-[#e8e2d8] overflow-hidden"
              style={{ transform: 'none' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-4 sm:p-5 border-b border-[#e8e2d8] flex items-center justify-between bg-[#fcfcfb] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-red-50 text-[#ae001a] border border-red-200 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">manage_search</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[#1d1c17] text-sm truncate">
                      Event Forensic Inspector
                    </h3>
                    <span className="font-mono text-[11px] font-bold text-[#5f5e5e] bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                      #KEL-{inspectingRecord.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {getEventTypeBadge(inspectingRecord.eventType, 'sm')}
                    <span className="text-[11px] text-[#5f5e5e] font-mono">
                      {formatRelativeTime(inspectingRecord.eventTime)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setInspectingRecord(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5f5e5e] hover:bg-zinc-100 hover:text-[#ae001a] transition-colors duration-200 cursor-pointer shrink-0 border border-transparent hover:border-[#d5cfc4]"
                title="Close Drawer (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Drawer Content Body (Scrollable) */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-xs font-sans">
              {/* 1. Event Chronology & Telemetry Section (Icon: history) */}
              <div className="bg-[#fcfcfb] border border-[#e8e2d8] rounded-xl p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] border-b border-[#f0ede6] pb-2 mb-3">
                  <span className="material-symbols-outlined text-base text-[#ae001a]">history</span>
                  <span>Event Chronology &amp; Database Timestamps</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#5f5e5e] block">
                      Execution Time (event_time):
                    </span>
                    <span className="font-mono font-bold text-xs text-[#1d1c17] block mt-0.5">
                      {formatTimestamp(inspectingRecord.eventTime)} {formatTimeOnly(inspectingRecord.eventTime)}
                    </span>
                    <span className="text-[10px] font-mono text-[#5f5e5e] block">
                      ISO: {inspectingRecord.eventTime}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#5f5e5e] block">
                      Record Created At (created_at):
                    </span>
                    <span className="font-mono text-xs text-[#1d1c17] block mt-0.5">
                      {formatTimestamp(inspectingRecord.createdAt)} {formatTimeOnly(inspectingRecord.createdAt)}
                    </span>
                    <span className="text-[10px] font-mono text-[#5f5e5e] block">
                      Updated: {formatTimestamp(inspectingRecord.updatedAt)} {formatTimeOnly(inspectingRecord.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Parent Kitchen Order Context */}
              <div className="bg-[#fcfcfb] border border-[#e8e2d8] rounded-xl p-4">
                <div className="flex items-center justify-between border-b border-[#f0ede6] pb-2 mb-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                    <span className="material-symbols-outlined text-base text-[#ae001a]">receipt_long</span>
                    <span>Parent Kitchen Order Context</span>
                  </div>
                  {inspectingRecord.kitchenOrderId && (
                    <button
                      onClick={() => onNavigate?.('kitchen-orders')}
                      className="text-[11px] text-[#ae001a] font-bold hover:underline cursor-pointer flex items-center gap-1 transition-colors duration-200"
                    >
                      <span>Go to Orders</span>
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </button>
                  )}
                </div>

                {inspectingRecord.kitchenOrderId ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-2.5 bg-white rounded-lg border border-[#e8e2d8]">
                        <span className="text-[9px] uppercase font-bold text-[#5f5e5e] block">Kitchen Order</span>
                        <span className="font-mono font-extrabold text-sm text-[#ae001a] block mt-0.5">
                          #KO-{inspectingRecord.kitchenOrderId}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-[#e8e2d8]">
                        <span className="text-[9px] uppercase font-bold text-[#5f5e5e] block">POS Master Ref</span>
                        <span className="font-mono font-bold text-xs text-[#1d1c17] block mt-0.5">
                          {inspectingRecord.kitchenOrder?.orderId ? `#ORD-${inspectingRecord.kitchenOrder.orderId}` : 'N/A'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-[#e8e2d8]">
                        <span className="text-[9px] uppercase font-bold text-[#5f5e5e] block">Order Status</span>
                        <span className="font-bold text-xs uppercase text-blue-700 block mt-0.5">
                          {inspectingRecord.kitchenOrder?.businessStatus || 'Active'}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-[#e8e2d8]">
                        <span className="text-[9px] uppercase font-bold text-[#5f5e5e] block">Priority</span>
                        <span className="font-bold text-xs text-[#1d1c17] block mt-0.5">
                          Tier {inspectingRecord.kitchenOrder?.priority ?? 1}
                        </span>
                      </div>
                    </div>

                    {/* Order Notes / Allergy Alert */}
                    {inspectingRecord.kitchenOrder?.notes ? (
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-base text-amber-800 shrink-0 mt-0.5">
                          notification_important
                        </span>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-amber-900 block">
                            Order &amp; Customer Special Instructions:
                          </span>
                          <p className="text-xs text-amber-950 font-medium mt-0.5">
                            {inspectingRecord.kitchenOrder.notes}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#5f5e5e] italic">No special order notes recorded.</p>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-[#5f5e5e] italic">
                    This log was triggered as a system or station-level event (no parent order ID attached).
                  </div>
                )}
              </div>

              {/* 3. Line Item Context Section */}
              <div className="bg-[#fcfcfb] border border-[#e8e2d8] rounded-xl p-4">
                <div className="flex items-center justify-between border-b border-[#f0ede6] pb-2 mb-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                    <span className="material-symbols-outlined text-base text-blue-700">lunch_dining</span>
                    <span>Line Item Context</span>
                  </div>
                  {inspectingRecord.kitchenOrderItemId && (
                    <button
                      onClick={() => onNavigate?.('kitchen-order-items')}
                      className="text-[11px] text-blue-700 font-bold hover:underline cursor-pointer flex items-center gap-1 transition-colors duration-200"
                    >
                      <span>Go to Items</span>
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </button>
                  )}
                </div>

                {inspectingRecord.kitchenOrderItemId ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            #ITM-{inspectingRecord.kitchenOrderItemId}
                          </span>
                          <span className="font-bold text-[#1d1c17] text-sm">
                            {inspectingRecord.kitchenOrderItem?.productName || 'Recipe Item'}
                          </span>
                        </div>
                        {inspectingRecord.kitchenOrderItem?.variantName && (
                          <div className="text-xs text-[#5f5e5e] mt-1 ml-1">
                            Variant: <span className="font-semibold text-[#1d1c17]">{inspectingRecord.kitchenOrderItem.variantName}</span>
                          </div>
                        )}
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-100 text-zinc-700 border border-zinc-200">
                        {inspectingRecord.kitchenOrderItem?.preparationStatus || 'Queued'}
                      </span>
                    </div>

                    {/* Progress Bar for Prepared vs Quantity */}
                    {inspectingRecord.kitchenOrderItem && (
                      <div className="p-3 bg-white rounded-lg border border-[#e8e2d8]">
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="font-semibold text-[#5f5e5e]">Item Preparation Progress:</span>
                          <span className="font-bold text-[#1d1c17] font-mono">
                            {inspectingRecord.kitchenOrderItem.preparedQuantity ?? 0} / {inspectingRecord.kitchenOrderItem.quantity ?? 1} units
                          </span>
                        </div>
                        <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden border border-zinc-200">
                          <div
                            className="bg-emerald-600 h-full transition-all duration-300"
                            style={{
                              width: `${Math.min(
                                100,
                                (((inspectingRecord.kitchenOrderItem.preparedQuantity ?? 0) /
                                  Math.max(1, inspectingRecord.kitchenOrderItem.quantity ?? 1)) *
                                  100)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-[#5f5e5e] italic">
                    General Order Event (not tied to an individual line item dish).
                  </div>
                )}
              </div>

              {/* 4. Station Binding & Actor Attribution (Icons: soup_kitchen & account_circle) */}
              <div className="grid grid-cols-1 gap-3">
                {/* Station Binding (Icon: soup_kitchen) */}
                <div className="bg-[#fcfcfb] border border-[#e8e2d8] rounded-xl p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] border-b border-[#f0ede6] pb-2 mb-3">
                    <span className="material-symbols-outlined text-base text-amber-700">soup_kitchen</span>
                    <span>Kitchen Station</span>
                  </div>
                  {inspectingRecord.station ? (
                    <div>
                      <div className="font-bold text-[#1d1c17] text-sm">
                        {inspectingRecord.station.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          #KST-{inspectingRecord.station.id}
                        </span>
                        {inspectingRecord.station.colorHex && (
                          <div className="flex items-center gap-1 text-[11px] text-[#5f5e5e]">
                            <span
                              className="w-3 h-3 rounded-full border border-black/10"
                              style={{ backgroundColor: inspectingRecord.station.colorHex }}
                            />
                            <span>{inspectingRecord.station.colorHex}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[#5f5e5e] italic">
                      Global Dispatch / Unassigned Station
                    </div>
                  )}
                </div>

                {/* Actor Attribution (Icon: account_circle) */}
                <div className="bg-[#fcfcfb] border border-[#e8e2d8] rounded-xl p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] border-b border-[#f0ede6] pb-2 mb-3">
                    <span className="material-symbols-outlined text-base text-purple-700">account_circle</span>
                    <span>Triggering Actor</span>
                  </div>
                  {inspectingRecord.user ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-800 font-bold text-xs flex items-center justify-center border border-purple-200 shrink-0">
                          {(inspectingRecord.user.username || inspectingRecord.user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[#1d1c17] text-xs truncate">
                            {inspectingRecord.user.username || inspectingRecord.user.name || inspectingRecord.user.email}
                          </div>
                          <div className="text-[10px] text-[#5f5e5e] font-mono truncate">
                            ID: #{inspectingRecord.user.id} {inspectingRecord.user.role ? `• ${inspectingRecord.user.role}` : ''}
                          </div>
                        </div>
                      </div>
                      {inspectingRecord.user.email && (
                        <div className="text-[10px] text-[#5f5e5e] font-mono mt-1 truncate">
                          {inspectingRecord.user.email}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-zinc-100 text-[#5f5e5e] flex items-center justify-center border border-zinc-200">
                        <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                      </div>
                      <span className="font-semibold text-xs text-[#5f5e5e]">System Automation Daemon</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Full Audit Message Section */}
              <div className="bg-[#fcfcfb] border border-[#e8e2d8] rounded-xl p-4">
                <div className="flex items-center justify-between border-b border-[#f0ede6] pb-2 mb-2">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                    <span className="material-symbols-outlined text-base text-[#ae001a]">chat</span>
                    <span>Full Audit Message &amp; Remarks</span>
                  </div>
                  {inspectingRecord.message && (
                    <button
                      onClick={() => handleCopyMessage(inspectingRecord.message || '')}
                      className="text-[11px] text-[#ae001a] font-semibold hover:underline cursor-pointer flex items-center gap-1 transition-colors duration-200"
                    >
                      <span className="material-symbols-outlined text-xs">
                        {copySuccessMsg ? 'check' : 'content_copy'}
                      </span>
                      <span>{copySuccessMsg ? 'Copied!' : 'Copy Text'}</span>
                    </button>
                  )}
                </div>
                <div className="p-3 bg-white rounded-lg border border-[#e8e2d8] text-xs font-mono text-[#1d1c17] leading-relaxed break-words">
                  {inspectingRecord.message || <span className="text-[#5f5e5e] italic">No message recorded.</span>}
                </div>
              </div>

              {/* 6. Raw Event Entity Payload (PostgreSQL DB Record) */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1d1c17] uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-[#5f5e5e]">data_object</span>
                    <span>Raw Event Entity Payload (PostgreSQL DB Record)</span>
                  </span>
                  <button
                    onClick={() => handleCopyPayload(inspectingRecord)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-[#ae001a] hover:underline cursor-pointer transition-colors duration-200"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {copySuccessJson ? 'check' : 'content_copy'}
                    </span>
                    <span>{copySuccessJson ? 'Copied JSON!' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="p-2.5 rounded-lg bg-[#1e293b] text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-40 border border-slate-700">
                  {JSON.stringify(inspectingRecord, null, 2)}
                </pre>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-3 sm:p-4 border-t border-[#e8e2d8] bg-[#fcfcfb] flex items-center justify-between shrink-0">
              <span className="text-[10px] text-[#5f5e5e]">
                DB: <code className="font-mono text-[#1d1c17]">kitchen_event_log</code>
              </span>
              <button
                onClick={() => setInspectingRecord(null)}
                className="px-3 py-1.5 rounded-lg border border-[#d5cfc4] bg-white hover:bg-zinc-100 hover:text-[#ae001a] text-[#1d1c17] font-semibold text-xs cursor-pointer transition-colors duration-200"
              >
                Close Panel
              </button>
            </div>
            </div>
          </div>,
          document.body
        )}

      {/* QUICK LINKS BANNER */}
      <div className="w-full">
        <KitchenQuickLinks activeTab="kitchen-event-log" onNavigate={onNavigate} />
      </div>

      {/* PERSISTENT BOTTOM NAVIGATION HUB BAR (Story 4203: 6 Sub-Modules Suite Navigation) */}
      <NavHubBar
        title="KDS EVENT LOG WORKSPACE"
        titleIcon="space_dashboard"
        subtitle="Real-Time Audit Trail & Timeline Inspector"
        activeModuleId="kitchen-event-log"
        onBackToDashboard={() => onNavigate?.('kitchen-kds-hub')}
        backToDashboardLabel="KDS COMMAND HUB"
        items={[
          {
            id: 'kitchen-stations',
            label: 'KITCHEN STATIONS',
            icon: 'soup_kitchen',
            onClick: () => onNavigate?.('kitchen-stations'),
          },
          {
            id: 'kitchen-display-devices',
            label: 'KDS DEVICES',
            icon: 'desktop_windows',
            onClick: () => onNavigate?.('kitchen-display-devices'),
          },
          {
            id: 'kitchen-orders',
            label: 'KITCHEN ORDERS',
            icon: 'receipt_long',
            onClick: () => onNavigate?.('kitchen-orders'),
          },
          {
            id: 'kitchen-order-items',
            label: 'ORDER ITEMS',
            icon: 'lunch_dining',
            onClick: () => onNavigate?.('kitchen-order-items'),
          },
          {
            id: 'kitchen-event-log',
            label: 'KDS EVENT LOG',
            icon: 'history',
            active: true,
            onClick: () => {},
          },
          {
            id: 'kitchen-analytics',
            label: 'KDS ANALYTICS',
            icon: 'bar_chart',
            onClick: () => onNavigate?.('kitchen-analytics'),
          },
        ]}
      />
    </div>
  );
};

export default KitchenEventLogView;
