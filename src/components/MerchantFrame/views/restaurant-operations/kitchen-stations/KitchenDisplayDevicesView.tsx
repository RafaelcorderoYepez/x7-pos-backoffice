import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { KitchenQuickLinks } from './KitchenQuickLinks';
import { AppModal } from '../../../shared/AppModal';
import { HeaderQuickTabs } from '../../../../shared/HeaderQuickTabs';
import { TableOptionsMenu, NoColumnsEmptyState, TableEmptyState, TablePaginationFooter } from '../../../../shared/TableOptionsMenu';
import { getDensityPadding } from '../../../../shared/tableOptionsHelpers';
import { NavHubBar } from '../../../../shared/NavHubBar';
import { apiRequest, unwrapList, type MaybeEnvelopedList } from '../../../../../api/http';
import { ApiError } from '../../../../../lib/api-error';

export type KitchenDisplayDeviceStatus = 'active' | 'deleted';

export interface KitchenStationRef {
  id: number;
  name: string;
  stationNumber?: number;
  station_number?: number;
  display_order?: number;
}

export interface KitchenDisplayDevice {
  id: number;
  merchant_id: number;
  station_id: number | null;
  stationId?: number | null;
  station?: KitchenStationRef | null;
  name: string;
  device_identifier: string;
  deviceIdentifier?: string;
  ip_address: string | null;
  ipAddress?: string | null;
  is_online: boolean;
  isOnline?: boolean;
  last_sync: string | null;
  lastSync?: string | null;
  status: KitchenDisplayDeviceStatus;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
}

interface KitchenDisplayDevicesViewProps {
  onNavigate?: (view: string) => void;
}

// KDS device row as returned by GET /kitchen-display-devices (camelCase and snake_case variants).
type RawKdsDevice = {
  id: number;
  merchant_id?: number;
  merchantId?: number;
  station_id?: number;
  stationId?: number;
  station?: {
    id: number;
    name: string;
    stationNumber?: number;
    station_number?: number;
    display_order?: number;
    displayOrder?: number;
  };
  name: string;
  device_identifier?: string;
  deviceIdentifier?: string;
  ip_address?: string;
  ipAddress?: string;
  is_online?: boolean;
  isOnline?: boolean;
  last_sync?: string;
  lastSync?: string;
  status?: KitchenDisplayDeviceStatus;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

export const KitchenDisplayDevicesView: React.FC<KitchenDisplayDevicesViewProps> = ({ onNavigate }) => {
  const [devices, setDevices] = useState<KitchenDisplayDevice[]>([]);
  const [stations, setStations] = useState<KitchenStationRef[]>([]);
  const [deviceCountByStation, setDeviceCountByStation] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and view
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stationFilter, setStationFilter] = useState<string>('All');
  const [selectedConnectivityFilters, setSelectedConnectivityFilters] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  // Table: Density, Visible Columns, and Pagination
  const [visibleColumns, setVisibleColumns] = useState<{
    deviceIdentity: boolean;
    stationBinding: boolean;
    ipAddress: boolean;
    connectivity: boolean;
    lastSync: boolean;
    status: boolean;
    actions: boolean;
  }>({
    deviceIdentity: true,
    stationBinding: true,
    ipAddress: true,
    connectivity: true,
    lastSync: true,
    status: true,
    actions: true,
  });

  const [rowDensity, setRowDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset page when filters or page size change
  const [prevFilterState, setPrevFilterState] = useState({
    searchQuery,
    stationFilter,
    selectedConnectivityFilters,
    statusFilter,
    pageSize,
  });

  if (
    searchQuery !== prevFilterState.searchQuery ||
    stationFilter !== prevFilterState.stationFilter ||
    selectedConnectivityFilters !== prevFilterState.selectedConnectivityFilters ||
    statusFilter !== prevFilterState.statusFilter ||
    pageSize !== prevFilterState.pageSize
  ) {
    setPrevFilterState({
      searchQuery,
      stationFilter,
      selectedConnectivityFilters,
      statusFilter,
      pageSize,
    });
    setCurrentPage(1);
  }

  const handleToggleConnectivityFilter = (key: string) => {
    if (key === 'All') {
      setSelectedConnectivityFilters([]);
    } else {
      setSelectedConnectivityFilters((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    }
    setCurrentPage(1);
  };

  // Edit and Create Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingDevice, setEditingDevice] = useState<KitchenDisplayDevice | null>(null);

  // Form fields
  const [formName, setFormName] = useState<string>('');
  const [formDeviceIdentifier, setFormDeviceIdentifier] = useState<string>('');
  const [formIpAddress, setFormIpAddress] = useState<string>('');
  const [formStationId, setFormStationId] = useState<string>('');
  const [formIsOnline, setFormIsOnline] = useState<boolean>(true);
  const [formStatus, setFormStatus] = useState<KitchenDisplayDeviceStatus>('active');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete Modal (Soft Delete)
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deviceToDelete, setDeviceToDelete] = useState<KitchenDisplayDevice | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Resynchronization State and Feedback
  const [syncingDeviceId, setSyncingDeviceId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warning' | 'info' } | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const topRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  // Load kitchen station list for selectors and calculate counts
  const fetchStationsList = useCallback(async () => {
    try {
      // The device count per station is secondary: if it fails the station list still loads.
      const [json, devJson] = await Promise.all([
        apiRequest<
          MaybeEnvelopedList<{
            id: number;
            name: string;
            stationNumber?: number;
            station_number?: number;
            display_order?: number;
            displayOrder?: number;
          }>
        >('/kitchen-station?status=active', { method: 'GET' }, 'Failed to load kitchen stations.'),
        apiRequest<MaybeEnvelopedList<{ station_id?: number; stationId?: number; station?: { id: number } }>>(
          '/kitchen-display-devices?status=active&limit=100',
          { method: 'GET' },
          '',
        ).catch(() => null),
      ]);

      setStations(
        unwrapList(json).map(
          (s) => ({
            id: s.id,
            name: s.name,
            stationNumber: s.stationNumber ?? s.station_number ?? s.displayOrder ?? s.display_order ?? s.id,
            station_number: s.station_number ?? s.stationNumber ?? s.display_order ?? s.displayOrder ?? s.id,
            display_order: s.display_order ?? s.displayOrder,
          })
        )
      );

      if (devJson) {
        const countMap: Record<number, number> = {};
        unwrapList(devJson).forEach((d) => {
          const sId = d.station_id ?? d.stationId ?? d.station?.id;
          if (sId) {
            countMap[sId] = (countMap[sId] || 0) + 1;
          }
        });
        setDeviceCountByStation(countMap);
      }
    } catch (err) {
      console.error('Error fetching kitchen stations from database:', err);
      setStations([]);
    }
  }, []);

  // Fetch KDS devices from PostgreSQL
  const fetchDevices = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setIsRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter === 'Deleted') params.append('status', 'deleted');
      else if (statusFilter === 'Active') params.append('status', 'active');
      else if (statusFilter === 'All') params.append('status', 'all');

      params.append('limit', '100');

      const json = await apiRequest<MaybeEnvelopedList<RawKdsDevice>>(
        `/kitchen-display-devices?${params.toString()}`,
        { method: 'GET' },
        'Failed to fetch KDS display devices from backend API.',
      );
      const dataList = unwrapList(json).map((dev) => ({
        id: dev.id,
        merchant_id: dev.merchant_id ?? dev.merchantId ?? 1,
        station_id: dev.station_id ?? dev.stationId ?? dev.station?.id ?? null,
        station: dev.station
          ? {
              id: dev.station.id,
              name: dev.station.name,
              stationNumber:
                dev.station.stationNumber ??
                dev.station.station_number ??
                dev.station.displayOrder ??
                dev.station.display_order ??
                dev.station.id,
              station_number:
                dev.station.station_number ??
                dev.station.stationNumber ??
                dev.station.display_order ??
                dev.station.displayOrder ??
                dev.station.id,
              display_order: dev.station.display_order ?? dev.station.displayOrder,
            }
          : null,
        name: dev.name,
        device_identifier: dev.device_identifier ?? dev.deviceIdentifier ?? 'DEV-000',
        ip_address: dev.ip_address ?? dev.ipAddress ?? null,
        is_online: dev.is_online ?? dev.isOnline ?? false,
        last_sync: dev.last_sync ?? dev.lastSync ?? null,
        status: dev.status ?? 'active',
        created_at: dev.created_at ?? dev.createdAt ?? new Date().toISOString(),
        updated_at: dev.updated_at ?? dev.updatedAt ?? new Date().toISOString(),
      }));
      setDevices(dataList);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('API error fetching KDS devices from database:', err);
      setError('Failed to fetch KDS display devices from backend API.');
      setDevices([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchStationsList();
      fetchDevices(true);
    });
  }, [fetchStationsList, fetchDevices]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchDevices(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchDevices]);

  const FIVE_MINS_MS = 5 * 60 * 1000;
  const [currentNow] = useState(() => Date.now());

  // In-memory alphanumeric filtering
  const filteredDevices = devices.filter((dev) => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchName = dev.name.toLowerCase().includes(q);
      const matchIdentifier = dev.device_identifier.toLowerCase().includes(q);
      const matchIp = (dev.ip_address || '').toLowerCase().includes(q);
      const matchStation = (dev.station?.name || '').toLowerCase().includes(q);
      if (!matchName && !matchIdentifier && !matchIp && !matchStation) return false;
    }

    const effectiveStationId = dev.station_id ?? dev.stationId ?? dev.station?.id ?? null;
    if (stationFilter === 'Unassigned' && effectiveStationId !== null) return false;
    if (stationFilter !== 'All' && stationFilter !== 'Unassigned' && String(effectiveStationId) !== stationFilter) return false;

    if (selectedConnectivityFilters.length > 0) {
      const matchesAny = selectedConnectivityFilters.some((f) => {
        if (f === 'Online') return dev.is_online;
        if (f === 'Offline') return !dev.is_online;
        if (f === 'Unassigned') return effectiveStationId === null;
        if (f === 'SyncDelay') {
          if (!dev.last_sync) return false;
          const syncTime = new Date(dev.last_sync).getTime();
          return currentNow - syncTime > FIVE_MINS_MS;
        }
        return false;
      });
      if (!matchesAny) return false;
    }

    if (statusFilter === 'Active' && dev.status !== 'active') return false;
    if (statusFilter === 'Deleted' && dev.status !== 'deleted') return false;

    return true;
  });

  const activeColSpan = Object.values(visibleColumns).filter(Boolean).length;

  // KPI Metrics
  const activeDevices = devices.filter((d) => d.status === 'active');
  const totalActiveCount = activeDevices.length;
  const onlineCount = activeDevices.filter((d) => d.is_online).length;
  const offlineCount = activeDevices.filter((d) => !d.is_online).length;
  const unassignedCount = activeDevices.filter((d) => !d.station_id).length;

  const outOfSyncCount = activeDevices.filter((d) => {
    if (!d.last_sync) return true;
    const syncTime = new Date(d.last_sync).getTime();
    return currentNow - syncTime > FIVE_MINS_MS;
  }).length;

  const deviceCounts = useMemo(() => {
    return {
      all: totalActiveCount,
      online: onlineCount,
      offline: offlineCount,
      unassigned: unassignedCount,
      syncDelay: outOfSyncCount,
    };
  }, [totalActiveCount, onlineCount, offlineCount, unassignedCount, outOfSyncCount]);

  // Relative time calculator ("2 mins ago", "1 hr ago", etc.)
  const formatTimeAgo = (isoString: string | null) => {
    if (!isoString) return 'Never Synced';
    const date = new Date(isoString);
    const diffMs = currentNow - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Open Drawer to Create
  const handleOpenAddDrawer = () => {
    setDrawerMode('add');
    setEditingDevice(null);
    setFormName('');
    setFormDeviceIdentifier('');
    setFormIpAddress('');
    setFormStationId('');
    setFormIsOnline(true);
    setFormStatus('active');
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Open Drawer to Edit
  const handleOpenEditDrawer = (device: KitchenDisplayDevice) => {
    setDrawerMode('edit');
    setEditingDevice(device);
    setFormName(device.name);
    setFormDeviceIdentifier(device.device_identifier);
    setFormIpAddress(device.ip_address || '');
    setFormStationId(device.station_id ? String(device.station_id) : '');
    setFormIsOnline(device.is_online);
    setFormStatus(device.status);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Save Form (Create or Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Device name is required');
      return;
    }
    if (!formDeviceIdentifier.trim()) {
      setFormError('Device identifier (Serial/MAC) is required');
      return;
    }

    // 1. IPv4 validation
    if (formIpAddress.trim()) {
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipv4Regex.test(formIpAddress.trim())) {
        setFormError('Please enter a valid IPv4 address (e.g. 192.168.1.100)');
        return;
      }
    }

    // 2. Unique identifier guard per merchant
    const duplicate = devices.find(
      (d) =>
        d.device_identifier.toLowerCase().trim() === formDeviceIdentifier.toLowerCase().trim() &&
        d.id !== editingDevice?.id &&
        d.status === 'active'
    );
    if (duplicate) {
      setFormError(`A device with identifier '${formDeviceIdentifier.trim()}' is already paired in this store.`);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const isDeletedStatus = formStatus === 'deleted';

    try {
      const payload = {
        name: formName.trim(),
        deviceIdentifier: formDeviceIdentifier.trim(),
        ipAddress: formIpAddress.trim() || null,
        stationId: isDeletedStatus ? null : (formStationId ? Number(formStationId) : null),
        isOnline: isDeletedStatus ? false : formIsOnline,
        status: formStatus,
      };

      const url = drawerMode === 'add' ? '/kitchen-display-devices' : `/kitchen-display-devices/${editingDevice?.id}`;
      const method = drawerMode === 'add' ? 'POST' : 'PUT';

      await apiRequest<void>(url, { method, body: JSON.stringify(payload) }, 'Failed to save device in database');
      setIsDrawerOpen(false);
      fetchDevices(true);
      fetchStationsList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error saving device';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Real-time KDS Device Resynchronization (Ping and lastSync persistence in PostgreSQL)
  const handleResyncDevice = async (device: KitchenDisplayDevice) => {
    setSyncingDeviceId(device.id);
    const nowIso = new Date().toISOString();

    try {
      await apiRequest<void>(
        `/kitchen-display-devices/${device.id}`,
        { method: 'PUT', body: JSON.stringify({
            name: device.name,
            deviceIdentifier: device.device_identifier,
            ipAddress: device.ip_address,
            stationId: device.station_id,
            isOnline: true,
            lastSync: nowIso,
        }) },
        `Failed to resynchronize device "${device.name}".`,
      );
      await fetchDevices(true);
      setToastMessage({
        text: `Device "${device.name}" successfully resynchronized with KDS.`,
        type: 'success',
      });
    } catch (err: unknown) {
      console.error('Error resyncing device:', err);
      setToastMessage({
        text: err instanceof ApiError ? err.message : `Network error resynchronizing "${device.name}".`,
        type: 'warning',
      });
    } finally {
      setSyncingDeviceId(null);
    }
  };

  // Delete Device (Soft Delete in PostgreSQL DB)
  const handleConfirmDelete = async () => {
    if (!deviceToDelete) return;
    setIsDeleting(true);
    try {
      await apiRequest<void>(
        `/kitchen-display-devices/${deviceToDelete.id}`,
        { method: 'DELETE' },
        'Failed to delete device from database',
      );
      fetchDevices(true);
      fetchStationsList();
    } catch (err) {
      console.error('Error deleting device:', err);
      if (err instanceof ApiError && err.status !== 401) alert(err.message);
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setDeviceToDelete(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-20">
      <div ref={topRef} />

      {/* 1. Header Card Workspace */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
              desktop_windows
            </span>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
              KDS HARDWARE DEVICES & CONNECTIVITY WORKSPACE
            </h2>
          </div>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Track physical display units, monitor live online/offline network connectivity status, manage IP address assignments, and inspect hardware bindings with kitchen stations.
          </p>
        </div>
      </div>

      {/* 1.5 Real-Time Health Summary KPI Banner (Strictly 4 cards in 1 horizontal row) */}
      <div className="grid grid-cols-4 gap-4 w-full">
        {/* KPI 1: Total Registered Active Devices */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center border border-zinc-200 shrink-0">
              <span className="material-symbols-outlined text-xl">desktop_windows</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Total Registered
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {totalActiveCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-zinc-100 text-zinc-800 border border-zinc-300 shrink-0">
            ACTIVE
          </span>
        </div>

        {/* KPI 2: Online Devices Gauge */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">wifi</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Online Ratio
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {onlineCount} <span className="text-xs text-[#5f5e5e] font-normal">/ {totalActiveCount}</span>
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
            ONLINE LIVE
          </span>
        </div>

        {/* KPI 3: Unassigned Floating Devices */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <span className="material-symbols-outlined text-xl">soup_kitchen</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Floating Units
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {unassignedCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
            UNASSIGNED
          </span>
        </div>

        {/* KPI 4: Out-of-Sync Warning Gauge */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${
              outOfSyncCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              <span className="material-symbols-outlined text-xl">published_with_changes</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Sync Warnings
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {outOfSyncCount}
              </div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase border shrink-0 ${
            outOfSyncCount > 0 ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
          }`}>
            {outOfSyncCount > 0 ? '> 5M DELAY' : 'HEALTHY'}
          </span>
        </div>
      </div>

      {/* 2. Canonical Unified Filter Toolbar */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
        {/* Row 1: Search on left, Station selector, View Switcher + Reload on right */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[#5f5e5e]">
                search
              </span>
              <input
                type="text"
                placeholder="Search devices by name, identifier, IP, station..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-[34px] w-full pl-9 pr-8 text-xs rounded-lg border border-[#d5cfc4] focus:outline-none focus:border-[#ae001a] bg-[#fcfcfb] text-[#1d1c17] placeholder:text-[#8c857b] transition-colors duration-200"
                aria-label="Search KDS devices"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
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
                value={stationFilter}
                onChange={(e) => setStationFilter(e.target.value)}
                className="h-[34px] px-3 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] text-xs focus:border-[#ae001a] outline-none font-sans text-[#1d1c17] cursor-pointer max-w-[220px] transition-colors duration-200"
                aria-label="Filter by kitchen station"
              >
                <option value="All">All Stations ({totalActiveCount})</option>
                <option value="Unassigned">Unassigned / Floating Units ({unassignedCount})</option>
                {stations.map((s) => {
                  const count = deviceCountByStation[s.id] || 0;
                  return (
                    <option key={s.id} value={String(s.id)}>
                      {s.name} (#KST-{s.stationNumber ?? s.station_number ?? s.display_order ?? s.id}) {count > 0 ? `(${count})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher Toggle (Table View vs Quick-Launch Cards) */}
            <div className="flex items-center h-[34px] bg-[#f2ede5] p-0.5 rounded-lg border border-[#e8e2d8] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Switch to Table View"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'table' ? 'text-[#ae001a]' : ''}`}>table_rows</span>
                Table View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Switch to Quick-Launch Cards Grid View"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'cards' ? 'text-[#ae001a]' : ''}`}>grid_view</span>
                Quick-Launch Cards
              </button>
            </div>

            {/* Canonical Auto Refresh */}
            <div className="flex items-center h-[34px] px-2.5 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] gap-1.5 text-xs text-[#5f5e5e] shrink-0">
              <button
                type="button"
                onClick={() => fetchDevices(false)}
                disabled={isLoading || isRefreshing}
                className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
                title="Refresh devices now"
              >
                <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin text-[#ae001a]' : ''}`}>
                  sync
                </span>
              </button>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-[11px] font-semibold text-[#1d1c17] focus:outline-none cursor-pointer h-full"
              >
                <option value={0}>Auto: Off</option>
                <option value={10}>Auto: 10s</option>
                <option value={30}>Auto: 30s</option>
                <option value={60}>Auto: 60s</option>
              </select>
            </div>

            <div className="hidden sm:flex items-center h-[34px] gap-1 text-[11px] text-[#5f5e5e] pl-1 shrink-0">
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>Updated:</span>
              <span className="font-mono font-bold text-[#1d1c17]">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Row 2: STATUS Pills Strip on left, Record Status & Primary Add Button on right */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#f0ede6] min-w-0">
          {/* Left: STATUS Pills Strip */}
          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#5f5e5e] shrink-0 mr-0.5">
              Status:
            </span>

            {/* All Pill */}
            <button
              type="button"
              onClick={() => handleToggleConnectivityFilter('All')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedConnectivityFilters.length === 0
                  ? 'bg-[#1d1c17] text-white border-[#1d1c17] shadow-xs'
                  : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
              }`}
            >
              <span>All</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  selectedConnectivityFilters.length === 0 ? 'bg-white/20 text-white' : 'bg-zinc-100 text-[#5f5e5e]'
                }`}
              >
                {deviceCounts.all}
              </span>
            </button>

            {/* ONLINE Pill (Icon: wifi) */}
            <button
              type="button"
              onClick={() => handleToggleConnectivityFilter('Online')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedConnectivityFilters.includes('Online')
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">wifi</span>
              <span>ONLINE</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  selectedConnectivityFilters.includes('Online') ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {deviceCounts.online}
              </span>
            </button>

            {/* OFFLINE Pill (Icon: wifi_off) */}
            <button
              type="button"
              onClick={() => handleToggleConnectivityFilter('Offline')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedConnectivityFilters.includes('Offline')
                  ? 'bg-[#ae001a] text-white border-[#ae001a] shadow-xs'
                  : 'bg-white text-[#ae001a] border-red-200 hover:bg-red-50'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">wifi_off</span>
              <span>OFFLINE</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  selectedConnectivityFilters.includes('Offline') ? 'bg-white/20 text-white' : 'bg-red-100 text-[#ae001a]'
                }`}
              >
                {deviceCounts.offline}
              </span>
            </button>

            {/* UNASSIGNED Pill (Icon: soup_kitchen) */}
            <button
              type="button"
              onClick={() => handleToggleConnectivityFilter('Unassigned')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedConnectivityFilters.includes('Unassigned')
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">soup_kitchen</span>
              <span>UNASSIGNED</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  selectedConnectivityFilters.includes('Unassigned') ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {deviceCounts.unassigned}
              </span>
            </button>

            {/* SYNC DELAY Pill (Icon: published_with_changes) */}
            <button
              type="button"
              onClick={() => handleToggleConnectivityFilter('SyncDelay')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedConnectivityFilters.includes('SyncDelay')
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">published_with_changes</span>
              <span>SYNC DELAY</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  selectedConnectivityFilters.includes('SyncDelay') ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {deviceCounts.syncDelay}
              </span>
            </button>
          </div>

          {/* Right: Record Status Filter & Primary Add Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Record Status Filter */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e] shrink-0">
              <span className="material-symbols-outlined text-base">tune</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-[34px] px-3 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] text-xs font-semibold focus:border-[#ae001a] outline-none font-sans text-[#1d1c17] cursor-pointer"
                aria-label="Filter by record status"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Deleted">Deleted</option>
              </select>
            </div>

            {/* Primary Add Button */}
            <button
              type="button"
              onClick={handleOpenAddDrawer}
              className="h-[34px] px-4 rounded-lg bg-[#ae001a] text-white font-bold text-xs hover:bg-[#d2272f] transition-colors flex items-center gap-1.5 font-sans cursor-pointer shadow-xs whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              PAIR NEW DEVICE
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Data Workspace Grid */}
      {viewMode === 'cards' ? (
        isLoading ? (
          <div className="p-12 text-center bg-white border border-[#e8e2d8] rounded-xl shadow-sm">
            <span className="material-symbols-outlined animate-spin text-3xl text-[#ae001a] mb-2">sync</span>
            <p className="text-xs font-bold uppercase tracking-wider text-[#5f5e5e]">Hydrating KDS hardware devices inventory...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center bg-white border border-[#e8e2d8] rounded-xl shadow-sm space-y-3">
            <span className="material-symbols-outlined text-4xl text-[#ba1a1a]">error</span>
            <p className="font-bold text-[#ba1a1a]">{error}</p>
            <button
              type="button"
              onClick={() => fetchDevices()}
              className="px-4 py-2 bg-[#222222] text-white font-bold text-xs uppercase hover:bg-[#ae001a] transition-all cursor-pointer rounded-lg"
            >
              Retry Connection
            </button>
          </div>
        ) : filteredDevices.length === 0 ? (
          <TableEmptyState
            asTableRow={false}
            icon="desktop_access_disabled"
            title="No KDS Devices Found"
            description="No display hardware units match your current search criteria or filter matrix. Try resetting your search query or station filters."
          />
        ) : (
          /* Quick-Launch Cards Mode: Strictly 2 cards per horizontal row */
          <div className="grid grid-cols-2 gap-3.5">
          {filteredDevices.map((device) => {
            const isInactive = device.status === 'deleted';
            return (
              <div
                key={device.id}
                className={`bg-white border rounded p-4 transition-all shadow-xs flex flex-col justify-between ${
                  isInactive ? 'border-[#e8e2d8] opacity-70 bg-[#f8f3eb]/40' : 'border-[#e8e2d8] hover:border-[#ae001a]'
                }`}
              >
                <div>
                  {/* Header Identity */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-bold text-sm text-[#1d1c17] line-clamp-1">{device.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8] inline-block mt-0.5">
                        {device.device_identifier}
                      </span>
                    </div>

                    {/* Online Status Pill */}
                    {device.is_online ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>ONLINE</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-800 text-[10px] font-bold">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span>OFFLINE</span>
                      </div>
                    )}
                  </div>

                  {/* Station Binding & IP Address */}
                  <div className="space-y-1.5 text-xs border-t border-[#e8e2d8] pt-2.5 mt-2">
                    <div className="flex items-center justify-between text-[#5f5e5e]">
                      <span className="text-[11px] font-semibold">Mapped Station:</span>
                      {device.station ? (
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-[#1d1c17] text-xs">{device.station.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            #KST-{device.station.stationNumber ?? device.station.station_number ?? device.station.display_order ?? device.station.id}
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8]">
                          Unassigned / Floating
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[#5f5e5e]">
                      <span className="text-[11px] font-semibold">Network IP:</span>
                      <div className="flex items-center gap-1 font-mono text-xs text-[#1d1c17] font-bold">
                        <span className="material-symbols-outlined text-[15px] text-[#5f5e5e]">router</span>
                        {device.ip_address || '0.0.0.0 (DHCP)'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[#5f5e5e]">
                      <span className="text-[11px] font-semibold">Last Sync:</span>
                      <span className="text-[11px] font-medium text-[#1d1c17]">{formatTimeAgo(device.last_sync)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between border-t border-[#e8e2d8] pt-3 mt-3">
                  <button
                    type="button"
                    onClick={() => handleResyncDevice(device)}
                    disabled={isInactive || syncingDeviceId === device.id}
                    className={`py-1.5 px-3 rounded text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                      syncingDeviceId === device.id
                        ? 'bg-amber-100 border-amber-300 text-amber-900 cursor-wait'
                        : 'bg-[#fef9f1] border-amber-200 text-amber-900 hover:bg-amber-100 hover:border-amber-300'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                    title={`Force network resynchronization for ${device.name}`}
                  >
                    <span className={`material-symbols-outlined text-xs ${syncingDeviceId === device.id ? 'animate-spin text-amber-700' : 'text-amber-700'}`}>
                      {syncingDeviceId === device.id ? 'sync' : 'power'}
                    </span>
                    <span>{syncingDeviceId === device.id ? 'Resyncing...' : 'Resync'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditDrawer(device)}
                      disabled={isInactive}
                      className="p-1.5 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Edit Device"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeviceToDelete(device);
                        setDeleteModalOpen(true);
                      }}
                      disabled={isInactive}
                      className="p-1.5 text-zinc-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Soft Delete Device"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : (
        /* Table View Mode */
        <div className="bg-white border border-[#e8e2d8] rounded-xl shadow-sm relative overflow-hidden">
          <HeaderQuickTabs
            title="KITCHEN DISPLAY DEVICES INVENTORY MATRIX"
            badgeCount={
              filteredDevices.length <= pageSize
                ? `${filteredDevices.length} device${filteredDevices.length === 1 ? '' : 's'}`
                : `${Math.min(filteredDevices.length, pageSize)} / ${filteredDevices.length} devices`
            }
            tabs={[]}
            rightElement={
              <TableOptionsMenu
                onExportCSV={() => {
                  const headers = ['ID', 'Name', 'Device Identifier', 'IP Address', 'Station ID', 'Station Name', 'Is Online', 'Last Sync', 'Status'];
                  const rows = filteredDevices.map((d) => [
                    d.id,
                    `"${(d.name || '').replace(/"/g, '""')}"`,
                    d.device_identifier,
                    d.ip_address || '',
                    d.station_id || '',
                    `"${(d.station?.name || 'Unassigned').replace(/"/g, '""')}"`,
                    d.is_online ? 'Online' : 'Offline',
                    d.last_sync || '',
                    d.status,
                  ]);
                  const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
                  const link = document.createElement('a');
                  link.href = encodeURI(csv);
                  link.download = `kds_devices_${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                onPrint={() => window.print()}
                printLabel="Print Devices Directory"
                onCopySummary={() => {
                  const summaryText = `KDS Display Devices Directory Summary:\n- Total Devices: ${filteredDevices.length}\n- Online: ${filteredDevices.filter((d) => d.is_online).length}\n- Offline: ${filteredDevices.filter((d) => !d.is_online).length}\n- Unassigned Floating: ${filteredDevices.filter((d) => !d.station_id).length}`;
                  navigator.clipboard.writeText(summaryText);
                }}
                onReload={() => fetchDevices()}
                columns={[
                  { key: 'deviceIdentity', label: 'Device Identity & HW ID' },
                  { key: 'stationBinding', label: 'Mapped Kitchen Station' },
                  { key: 'ipAddress', label: 'Network IP Address' },
                  { key: 'connectivity', label: 'Live Connectivity' },
                  { key: 'lastSync', label: 'Last Sync Timestamp' },
                  { key: 'status', label: 'Lifecycle Status' },
                  { key: 'actions', label: 'Actions' },
                ]}
                visibleColumns={visibleColumns}
                onToggleColumn={(key) => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key as keyof typeof visibleColumns] }))}
                rowDensity={rowDensity}
                onChangeDensity={setRowDensity}
                totalItems={filteredDevices.length}
                pageSize={pageSize}
                onChangePageSize={setPageSize}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            }
          />

          {activeColSpan === 0 ? (
            <NoColumnsEmptyState />
          ) : (
            <>
              <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <table className="w-full table-fixed text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-[#ece8e0] text-[#5f5e5e] font-sans font-semibold text-label-caps text-xs border-b border-[#e8e2d8]">
                      {visibleColumns.deviceIdentity && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-auto min-w-[180px]`}>Device Identity & HW ID</th>}
                      {visibleColumns.stationBinding && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-44 min-w-[130px]`}>Mapped Kitchen Station</th>}
                      {visibleColumns.ipAddress && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-36 min-w-[110px]`}>Network IP Address</th>}
                      {visibleColumns.connectivity && <th className={`${getDensityPadding(rowDensity)} text-center text-[#5f5e5e] w-32 min-w-[100px]`}>Live Connectivity</th>}
                      {visibleColumns.lastSync && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-36 min-w-[110px]`}>Last Sync Timestamp</th>}
                      {visibleColumns.status && <th className={`${getDensityPadding(rowDensity)} text-center text-[#5f5e5e] w-28 min-w-[90px]`}>Lifecycle Status</th>}
                      {visibleColumns.actions && <th className={`${getDensityPadding(rowDensity)} text-center text-[#5f5e5e] w-28 min-w-[90px]`}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8] text-xs font-sans">
                    {isLoading ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                          <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                            sync
                          </span>
                          <p className="text-secondary text-body-md mt-2 font-sans">Hydrating KDS hardware devices inventory...</p>
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white">
                          <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                            error
                          </span>
                          <p className="font-bold">{error}</p>
                          <button
                            type="button"
                            onClick={() => fetchDevices()}
                            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                          >
                            Retry Connection
                          </button>
                        </td>
                      </tr>
                    ) : devices.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="desktop_access_disabled"
                        title="No KDS Devices Found"
                        description="Click 'Add KDS Device' to enroll a new display screen."
                      />
                    ) : filteredDevices.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="desktop_access_disabled"
                        title="No KDS Devices Found"
                        description="No display hardware units match your current search criteria or filter matrix. Try resetting your search query or station filters."
                      />
                    ) : (
                      (pageSize >= 9999
                        ? filteredDevices
                        : filteredDevices.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize)
                      ).map((device) => {
                      const isInactive = device.status === 'deleted';
                      const densityPadding = getDensityPadding(rowDensity);
                      return (
                        <tr
                          key={device.id}
                          className={`transition-colors ${
                            isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                          }`}
                        >
                          {/* Device Identity Block */}
                          {visibleColumns.deviceIdentity && (
                            <td className={`${densityPadding} truncate`}>
                              <div className="min-w-0 flex flex-col justify-center">
                                <span className="font-bold text-[#1d1c17] font-sans text-sm truncate" title={device.name}>
                                  {device.name}
                                </span>
                                <span className="font-mono text-[11px] font-normal text-[#5f5e5e] truncate mt-0.5">
                                  ID: {device.device_identifier}
                                </span>
                              </div>
                            </td>
                          )}

                          {/* Mapped Kitchen Station */}
                          {visibleColumns.stationBinding && (
                            <td className={densityPadding}>
                              {device.station ? (
                                <div className="flex flex-wrap items-center gap-1.5 max-w-[220px]">
                                  <span className="font-normal text-[#1d1c17] text-xs leading-snug">{device.station.name}</span>
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-normal bg-amber-50 text-amber-900 border border-amber-200 shrink-0">
                                    #KST-{device.station.stationNumber ?? device.station.station_number ?? device.station.display_order ?? device.station.id}
                                  </span>
                                </div>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-normal bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8] inline-block">
                                  Unassigned / Floating
                                </span>
                              )}
                            </td>
                          )}

                          {/* Network IP Address */}
                          {visibleColumns.ipAddress && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              <div className="flex items-center gap-1.5 font-mono text-xs text-[#1d1c17] font-normal">
                                <span className="material-symbols-outlined text-[16px] text-[#5f5e5e]">router</span>
                                {device.ip_address || '0.0.0.0 (DHCP)'}
                              </div>
                            </td>
                          )}

                          {/* Live Connectivity Status */}
                          {visibleColumns.connectivity && (
                            <td className={`${densityPadding} text-center whitespace-nowrap`}>
                              {device.is_online ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                  <span>ONLINE</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-800 text-[10px] font-bold">
                                  <span className="w-2 h-2 rounded-full bg-red-500" />
                                  <span>OFFLINE</span>
                                </div>
                              )}
                            </td>
                          )}

                          {/* Last Sync Timestamp */}
                          {visibleColumns.lastSync && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              <div>
                                <div className="font-normal text-[#1d1c17] text-xs">{formatTimeAgo(device.last_sync)}</div>
                                <div className="text-[10px] text-[#5f5e5e] font-mono">
                                  {device.last_sync ? new Date(device.last_sync).toLocaleString('en-US') : 'No sync recorded'}
                                </div>
                              </div>
                            </td>
                          )}

                          {/* Lifecycle Status */}
                          {visibleColumns.status && (
                            <td className={`${densityPadding} text-center whitespace-nowrap`}>
                              {isInactive ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-zinc-200 text-zinc-600 border border-zinc-300">
                                  DELETED
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ACTIVE
                                </span>
                              )}
                            </td>
                          )}

                          {/* Actions */}
                          {visibleColumns.actions && (
                            <td className={`${densityPadding} text-center whitespace-nowrap`}>
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleResyncDevice(device)}
                                  disabled={isInactive || syncingDeviceId === device.id}
                                  className="p-1.5 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  title={`Force network resynchronization for ${device.name} with KDS server`}
                                >
                                  <span className={`material-symbols-outlined text-[18px] ${syncingDeviceId === device.id ? 'animate-spin text-amber-700' : ''}`}>
                                    {syncingDeviceId === device.id ? 'sync' : 'power'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDrawer(device)}
                                  disabled={isInactive}
                                  className="p-1.5 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  title="Edit device"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeviceToDelete(device);
                                    setDeleteModalOpen(true);
                                  }}
                                  disabled={isInactive}
                                  className="p-1.5 text-zinc-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  title="Soft delete device"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              <TablePaginationFooter
                currentPage={currentPage}
                totalItems={filteredDevices.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      )}

      {/* 4. Standard Quick Launch Panel Component */}
      <div className="mt-6">
        <KitchenQuickLinks current="kitchen-display-devices" onNavigate={onNavigate} />
      </div>

      {/* 5. Sticky Persistent KDS Management Navigation Hub Bar */}
      <NavHubBar
        title="KDS Ecosystem Nav Hub"
        titleIcon="space_dashboard"
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
            active: true,
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
            onClick: () => onNavigate?.('kitchen-event-log'),
          },
          {
            id: 'kitchen-analytics',
            label: 'KDS ANALYTICS',
            icon: 'bar_chart',
            onClick: () => onNavigate?.('kitchen-analytics'),
          },
        ]}
      />

      {/* Slide-over Drawer to Add / Edit KDS Device */}
      {isDrawerOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsDrawerOpen(false)} />
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-[#e8e2d8] animate-slide-in">
              {/* Header Drawer (Estilo Raw Materials 1:1) */}
              <div className="bg-[#222222] p-6 text-white flex justify-between items-center shrink-0">
                <div>
                  <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest block mb-0.5">
                    KDS Hardware Device
                  </span>
                  <h3 className="font-black text-lg text-white uppercase tracking-tight font-sans">
                    {drawerMode === 'add' ? 'Pair New Device' : 'Edit Device'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Body Form */}
              <form id="kds-device-form" onSubmit={handleSubmitForm} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {formError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded font-semibold text-xs">
                      {formError}
                    </div>
                  )}

                  {/* Device Name */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Device Name <span className="text-[#ae001a]">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Main Grill Display Terminal"
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] outline-none w-full"
                      required
                    />
                  </div>

                  {/* Hardware Identifier (Serial / MAC) */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Hardware Identifier (Serial / MAC) <span className="text-[#ae001a]">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={formDeviceIdentifier}
                      onChange={(e) => setFormDeviceIdentifier(e.target.value)}
                      placeholder="e.g. DEV-001-GRILL"
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md font-mono focus:border-[#ae001a] outline-none w-full"
                      required
                    />
                  </div>

                  {/* Network IP Address */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Network IP Address Assignment
                    </label>
                    <input
                      type="text"
                      maxLength={50}
                      value={formIpAddress}
                      onChange={(e) => setFormIpAddress(e.target.value)}
                      placeholder="e.g. 192.168.1.101"
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md font-mono focus:border-[#ae001a] outline-none w-full"
                    />
                    <p className="text-[10px] text-[#5f5e5e]">Leave blank if using automatic DHCP IP assignment.</p>
                  </div>

                  {/* Mapped Kitchen Station */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Mapped Kitchen Station
                    </label>
                    <select
                      value={formStationId}
                      onChange={(e) => setFormStationId(e.target.value)}
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] outline-none w-full cursor-pointer"
                    >
                      <option value="">-- Unassigned / Floating Unit --</option>
                      {stations.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name} (#KST-{s.stationNumber ?? s.station_number ?? s.display_order ?? s.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Lifecycle Status */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Lifecycle Status <span className="text-[#ae001a]">*</span>
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as KitchenDisplayDeviceStatus)}
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] outline-none w-full cursor-pointer"
                    >
                      <option value="active">ACTIVE</option>
                      <option value="deleted">DELETED (Archived)</option>
                    </select>
                  </div>

                  {/* Initial Online Network State */}
                  <div className="flex justify-between items-center bg-[#fcfbf9] border border-[#e8e2d8] p-4 rounded-lg">
                    <div>
                      <span className="font-bold text-sm text-[#222222] block">Initial Connectivity State</span>
                      <span className="text-xs text-gray-500">Simulate network ping connectivity state</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formIsOnline}
                        onChange={(e) => setFormIsOnline(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ae001a]" />
                    </label>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-[#fcfbf9] border-t border-[#e8e2d8] p-6 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="px-5 py-2.5 bg-white border border-[#e8e2d8] rounded text-[#1d1c17] font-bold text-xs hover:bg-[#f2ede5] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 bg-[#ae001a] hover:bg-[#900015] text-white font-bold text-xs rounded transition-colors shadow disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>{drawerMode === 'add' ? 'Pair Device' : 'Save Changes'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      }

      {/* Soft Delete Confirmation Modal */}
      {deleteModalOpen && deviceToDelete && (
        <AppModal
          onClose={() => setDeleteModalOpen(false)}
          title="Archive KDS Hardware Device"
          subtitle={`Are you sure you want to archive "${deviceToDelete.name}" (${deviceToDelete.device_identifier})?`}
        >
          <div className="space-y-4 text-xs font-sans">
            <p className="text-[#5f5e5e]">
              Archiving this hardware unit will set its lifecycle status to <strong className="text-[#1d1c17]">DELETED</strong> and disable active network sync routing. Existing historical event logs will be preserved.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600">warning</span>
              <span>This record can be restored later by setting the filter status to "Deleted".</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8e2d8]">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-3.5 py-2 bg-white border border-[#e8e2d8] rounded text-[#1d1c17] font-bold hover:bg-[#fef9f1] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3.5 py-2 bg-red-700 hover:bg-red-800 text-white font-bold rounded transition-colors shadow disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    <span>Archiving...</span>
                  </>
                ) : (
                  <span>Archive Device</span>
                )}
              </button>
            </div>
          </div>
        </AppModal>
      )}

      {/* Floating Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-fade-in transition-all duration-300">
          <div
            className={`flex items-center gap-3 px-5 py-3 rounded-lg shadow-xl text-white text-sm font-semibold tracking-wide border ${
              toastMessage.type === 'success'
                ? 'bg-[#059669] border-emerald-400'
                : toastMessage.type === 'warning'
                ? 'bg-[#b91c1c] border-red-400'
                : 'bg-[#1e293b] border-slate-600'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {toastMessage.type === 'success' ? 'check_circle' : toastMessage.type === 'warning' ? 'block' : 'info'}
            </span>
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-3 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default KitchenDisplayDevicesView;
