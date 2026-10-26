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

const SAVE_FALLBACK = 'Error saving kitchen station.';

export type KitchenStationType = 'HOT' | 'COLD' | 'BAR' | 'DESSERT' | 'PREP' | 'PACKING' | 'EXPO';
export type KitchenDisplayMode = 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID';
export type KitchenStationStatus = 'active' | 'deleted';

export interface KitchenStation {
  id: number;
  merchant_id: number;
  merchantId?: number;
  name: string;
  station_type: KitchenStationType;
  stationType?: KitchenStationType;
  display_mode: KitchenDisplayMode;
  displayMode?: KitchenDisplayMode;
  display_order: number;
  displayOrder?: number;
  station_number?: number;
  stationNumber?: number;
  printer_name: string | null;
  printerName?: string | null;
  is_active: boolean;
  isActive?: boolean;
  status: KitchenStationStatus;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
}

const getStationCode = (station: {
  id: number;
  station_number?: number;
  stationNumber?: number;
  display_order?: number;
}): string => {
  const num =
    station.stationNumber ??
    station.station_number ??
    station.display_order ??
    station.id;
  return `#KST-${num}`;
};

interface KitchenStationsViewProps {
  onNavigate?: (view: string) => void;
}



export const KitchenStationsView: React.FC<KitchenStationsViewProps> = ({ onNavigate }) => {
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and view
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stationTypeFilter, setStationTypeFilter] = useState<string>('All');
  const [displayModeFilter, setDisplayModeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  // States for Customizing Columns, Density, and Pagination in Table
  const [visibleColumns, setVisibleColumns] = useState<{
    refDate: boolean;
    nameSequence: boolean;
    stationType: boolean;
    displayMode: boolean;
    printer: boolean;
    activeRouting: boolean;
    status: boolean;
    actions: boolean;
  }>({
    refDate: true,
    nameSequence: true,
    stationType: true,
    displayMode: true,
    printer: true,
    activeRouting: true,
    status: true,
    actions: true,
  });
  const [rowDensity, setRowDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [prevFilterState, setPrevFilterState] = useState({
    searchQuery,
    stationTypeFilter,
    displayModeFilter,
    statusFilter,
    pageSize,
  });

  if (
    searchQuery !== prevFilterState.searchQuery ||
    stationTypeFilter !== prevFilterState.stationTypeFilter ||
    displayModeFilter !== prevFilterState.displayModeFilter ||
    statusFilter !== prevFilterState.statusFilter ||
    pageSize !== prevFilterState.pageSize
  ) {
    setPrevFilterState({
      searchQuery,
      stationTypeFilter,
      displayModeFilter,
      statusFilter,
      pageSize,
    });
    setCurrentPage(1);
  }

  // Edit and Create Drawer / Modal States
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingStation, setEditingStation] = useState<KitchenStation | null>(null);

  // Form fields
  const [formName, setFormName] = useState<string>('');
  const [formStationType, setFormStationType] = useState<KitchenStationType>('HOT');
  const [formDisplayMode, setFormDisplayMode] = useState<KitchenDisplayMode>('AUTO');
  const [formDisplayOrder, setFormDisplayOrder] = useState<number>(1);
  const [formPrinterName, setFormPrinterName] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formStatus, setFormStatus] = useState<KitchenStationStatus>('active');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete Modal State (Soft Delete)
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [stationToDelete, setStationToDelete] = useState<KitchenStation | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const topRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  const fetchStations = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setIsRefreshing(true);
    setError(null);
    try {
      const statusQuery = statusFilter === 'Deleted' ? 'deleted' : statusFilter === 'Active' ? 'active' : '';
      const params = new URLSearchParams();
      if (statusQuery) params.append('status', statusQuery);
      if (displayModeFilter !== 'All') params.append('displayMode', displayModeFilter);
      params.append('sortBy', 'displayOrder');
      params.append('sortOrder', 'ASC');

      const json = await apiRequest<MaybeEnvelopedList<Record<string, unknown>>>(
        `/kitchen-station?${params.toString()}`,
        { method: 'GET' },
        'Failed to fetch kitchen stations from backend API.',
      );
      const rawList = unwrapList(json);
      const dataList: KitchenStation[] = rawList.map((st) => ({
        id: Number(st.id ?? 0),
        merchant_id: Number(st.merchant_id ?? st.merchantId ?? 0),
        merchantId: Number(st.merchant_id ?? st.merchantId ?? 0),
        name: String(st.name ?? ''),
        is_active: Boolean(st.isActive ?? st.is_active ?? true),
        isActive: Boolean(st.isActive ?? st.is_active ?? true),
        station_type: (st.stationType ?? st.station_type ?? 'PREP') as KitchenStationType,
        stationType: (st.stationType ?? st.station_type ?? 'PREP') as KitchenStationType,
        display_mode: (st.displayMode ?? st.display_mode ?? 'AUTO') as KitchenDisplayMode,
        displayMode: (st.displayMode ?? st.display_mode ?? 'AUTO') as KitchenDisplayMode,
        display_order: Number(st.displayOrder ?? st.display_order ?? 1),
        displayOrder: Number(st.displayOrder ?? st.display_order ?? 1),
        printer_name: (st.printerName ?? st.printer_name ?? null) as string | null,
        printerName: (st.printerName ?? st.printer_name ?? null) as string | null,
        created_at: String(st.createdAt ?? st.created_at ?? new Date().toISOString()),
        createdAt: String(st.createdAt ?? st.created_at ?? new Date().toISOString()),
        updated_at: String(st.updatedAt ?? st.updated_at ?? new Date().toISOString()),
        updatedAt: String(st.updatedAt ?? st.updated_at ?? new Date().toISOString()),
        status: (st.status ?? 'active') as KitchenStationStatus,
      }));
      setStations(dataList);
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('API error fetching kitchen stations:', err);
      setError('Failed to fetch kitchen stations from backend API.');
      setStations([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, displayModeFilter]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchStations(true);
    });
  }, [fetchStations]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchStations(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchStations]);

  // Real-time counts across current loaded dataset for filter pills
  const stationTypeCounts = useMemo(() => {
    return {
      all: stations.length,
      hot: stations.filter((s) => (s.station_type || s.stationType)?.toUpperCase() === 'HOT').length,
      cold: stations.filter((s) => (s.station_type || s.stationType)?.toUpperCase() === 'COLD').length,
      expo: stations.filter((s) => (s.station_type || s.stationType)?.toUpperCase() === 'EXPO').length,
      bar: stations.filter((s) => (s.station_type || s.stationType)?.toUpperCase() === 'BAR').length,
      dessert: stations.filter((s) => (s.station_type || s.stationType)?.toUpperCase() === 'DESSERT').length,
      prep: stations.filter((s) => (s.station_type || s.stationType)?.toUpperCase() === 'PREP').length,
    };
  }, [stations]);

  // Client-side alphanumeric filtering for ultra-fast response
  const filteredStations = stations.filter((station) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getStationCode(station).toLowerCase().includes(searchQuery.toLowerCase()) ||
      `#kst-${station.id}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (station.printer_name && station.printer_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType =
      stationTypeFilter === 'All' ||
      (station.station_type || station.stationType)?.toUpperCase() === stationTypeFilter.toUpperCase();
    const matchesMode = displayModeFilter === 'All' || station.display_mode === displayModeFilter;
    const matchesStatus =
      statusFilter === 'Deleted'
        ? station.status === 'deleted'
        : station.status === 'active';

    return matchesSearch && matchesType && matchesMode && matchesStatus;
  });

  const activeColSpan = Object.values(visibleColumns).filter(Boolean).length;

  // Instant interactive is_active toggle (Real-Time Toggle)
  const handleToggleActive = async (station: KitchenStation) => {
    const currentActive = station.isActive ?? station.is_active ?? true;
    const nextActive = !currentActive;

    // Optimistic client update
    setStations((prev) =>
      prev.map((item) => (item.id === station.id ? { ...item, is_active: nextActive, isActive: nextActive } : item))
    );

    try {
      await apiRequest<void>(
        `/kitchen-station/${station.id}`,
        { method: 'PUT', body: JSON.stringify({ isActive: nextActive }) },
        'Failed to update station status',
      );
    } catch (err) {
      // Rollback the optimistic toggle to the server state.
      console.error('Error toggling kitchen station status:', err);
      fetchStations(true);
    }
  };

  // Open create Drawer
  const handleOpenAddDrawer = () => {
    setDrawerMode('add');
    setEditingStation(null);
    setFormName('');
    setFormStationType('HOT');
    setFormDisplayMode('AUTO');
    setFormDisplayOrder(stations.length + 1);
    setFormPrinterName('');
    setFormIsActive(true);
    setFormStatus('active');
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Open edit Drawer
  const handleOpenEditDrawer = (station: KitchenStation) => {
    setDrawerMode('edit');
    setEditingStation(station);
    setFormName(station.name);
    setFormStationType(station.station_type);
    setFormDisplayMode(station.display_mode);
    setFormDisplayOrder(station.display_order);
    setFormPrinterName(station.printer_name || '');
    setFormIsActive(station.is_active);
    setFormStatus(station.status || 'active');
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Submit form (Create / Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Station name is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (drawerMode === 'add') {
        const createPayload = {
          name: formName.trim(),
          stationType: formStationType,
          displayMode: formDisplayMode,
          displayOrder: Number(formDisplayOrder),
          ...(formPrinterName.trim() ? { printerName: formPrinterName.trim() } : {}),
        };
        await apiRequest<void>('/kitchen-station', { method: 'POST', body: JSON.stringify(createPayload) }, SAVE_FALLBACK);
      } else {
        const isDeleted = formStatus === 'deleted';
        const updatePayload = {
          name: formName.trim(),
          stationType: formStationType,
          displayMode: formDisplayMode,
          displayOrder: Number(formDisplayOrder),
          ...(formPrinterName.trim() ? { printerName: formPrinterName.trim() } : {}),
          isActive: isDeleted ? false : formIsActive,
          status: formStatus,
        };
        await apiRequest<void>(
          `/kitchen-station/${editingStation?.id}`,
          { method: 'PUT', body: JSON.stringify(updatePayload) },
          SAVE_FALLBACK,
        );
      }

      setIsDrawerOpen(false);
      fetchStations(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Network error connecting to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm deletion (Soft Delete)
  const handleConfirmDelete = async () => {
    if (!stationToDelete) return;
    setIsDeleting(true);
    try {
      await apiRequest<void>(
        `/kitchen-station/${stationToDelete.id}`,
        { method: 'DELETE' },
        'Failed to delete kitchen station',
      );
      setStations((prev) => prev.filter((s) => s.id !== stationToDelete.id));
    } catch (err) {
      // 404: already gone on the server, so drop it from the list too. Any other failure keeps
      // the row (it still exists) and tells the user why.
      if (err instanceof ApiError && err.status === 404) {
        setStations((prev) => prev.filter((s) => s.id !== stationToDelete.id));
      } else if (!(err instanceof ApiError && err.status === 401)) {
        alert(err instanceof Error ? err.message : 'Failed to delete kitchen station');
      }
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setStationToDelete(null);
    }
  };

  // Helper for station type badges
  const getStationTypeBadge = (type: KitchenStationType) => {
    switch (type) {
      case 'HOT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <span className="material-symbols-outlined text-[14px]">local_fire_department</span>
            HOT LINE
          </span>
        );
      case 'COLD':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
            <span className="material-symbols-outlined text-[14px]">ac_unit</span>
            COLD PREP
          </span>
        );
      case 'BAR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="material-symbols-outlined text-[14px]">local_bar</span>
            BAR & DRINKS
          </span>
        );
      case 'DESSERT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-pink-100 text-pink-800 border border-pink-200">
            <span className="material-symbols-outlined text-[14px]">cake</span>
            DESSERTS
          </span>
        );
      case 'EXPO':
      case 'PACKING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            EXPO / PASS
          </span>
        );
      case 'PREP':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="material-symbols-outlined text-[14px]">flatware</span>
            PREP KITCHEN
          </span>
        );
    }
  };

  // Helper for KDS mode
  const getDisplayModePill = (mode: KitchenDisplayMode) => {
    switch (mode) {
      case 'AUTO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            AUTO DISPATCH
          </span>
        );
      case 'MANUAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            MANUAL QUEUE
          </span>
        );
      case 'SUMMARY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            SUMMARY VIEW
          </span>
        );
      case 'GRID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            GRID MATRIX
          </span>
        );
      default:
        return null;
    }
  };

  // Real-time KPI metrics
  const totalActiveCount = stations.filter(
    (s) => (s.is_active ?? s.isActive) && s.status === 'active'
  ).length;
  const printersBoundCount = stations.filter(
    (s) => s.printer_name && s.printer_name.trim() !== ''
  ).length;
  const expoStationsCount = stations.filter(
    (s) => (s.station_type === 'EXPO' || s.station_type === 'PACKING') && s.status === 'active'
  ).length;

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-20">
      <div ref={topRef} />

      {/* 1. Header Card Workspace */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
              soup_kitchen
            </span>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
              KITCHEN STATIONS & PREP ROUTING WORKSPACE
            </h2>
          </div>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Configure physical prep stations, assign backup hardware printers, customize KDS screen display modes, and optimize high-speed ticket dispatch across prep lines.
          </p>
        </div>
      </div>

      {/* 1.5 Real-Time Station KPI Health Header Strip (3 cards aligned in 1 horizontal row) */}
      <div className="grid grid-cols-3 gap-4 w-full">
        {/* KPI 1: Active Stations */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">soup_kitchen</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Total Active Stations
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {totalActiveCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
            OPERATIONAL
          </span>
        </div>

        {/* KPI 2: Printers Bound */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shrink-0">
              <span className="material-symbols-outlined text-xl">print</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Hardware Printers
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {printersBoundCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
            HARDWARE BOUND
          </span>
        </div>

        {/* KPI 3: Expo / Pass Stations */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200 shrink-0">
              <span className="material-symbols-outlined text-xl">check_circle</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Expo / Pass Stations
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {expoStationsCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
            EXPO READY
          </span>
        </div>
      </div>

      {/* 2. Canonical Unified Filter Toolbar */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
        {/* Row 1: Search on left, Display Mode selector, View Switcher + Reload on right */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[#5f5e5e]">
                search
              </span>
              <input
                type="text"
                placeholder="Search stations by name, ID (#KST-101), printer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-[34px] w-full pl-9 pr-8 text-xs rounded-lg border border-[#d5cfc4] focus:outline-none focus:border-[#ae001a] bg-[#fcfcfb] text-[#1d1c17] placeholder:text-[#8c857b] transition-colors duration-200"
                aria-label="Search kitchen stations"
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

            {/* Display Mode Dropdown Selector */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="material-symbols-outlined text-base">desktop_windows</span>
              <select
                value={displayModeFilter}
                onChange={(e) => setDisplayModeFilter(e.target.value)}
                className="h-[34px] px-3 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] text-xs focus:border-[#ae001a] outline-none font-sans text-[#1d1c17] cursor-pointer max-w-[180px] transition-colors duration-200"
                aria-label="Filter by display mode"
              >
                <option value="All">All Display Modes</option>
                <option value="AUTO">AUTO DISPATCH</option>
                <option value="MANUAL">MANUAL QUEUE</option>
                <option value="SUMMARY">SUMMARY VIEW</option>
                <option value="GRID">GRID MATRIX</option>
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
                onClick={() => fetchStations(false)}
                disabled={isLoading || isRefreshing}
                className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
                title="Refresh stations now"
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
                <option value={5}>Auto: 5s</option>
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

        {/* Row 2: TYPES Pills Strip on left, Status & Primary Add Button on right */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#f0ede6] min-w-0">
          {/* Left: TYPES Pills Strip */}
          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#5f5e5e] shrink-0 mr-0.5">
              Types:
            </span>

            {/* All Pill */}
            <button
              type="button"
              onClick={() => setStationTypeFilter('All')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                stationTypeFilter === 'All'
                  ? 'bg-[#1d1c17] text-white border-[#1d1c17] shadow-xs'
                  : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
              }`}
            >
              <span>All</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  stationTypeFilter === 'All' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-[#5f5e5e]'
                }`}
              >
                {stationTypeCounts.all}
              </span>
            </button>

            {/* HOT LINE Pill (Icon: local_fire_department) */}
            <button
              type="button"
              onClick={() => setStationTypeFilter('HOT')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                stationTypeFilter === 'HOT'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50/50 text-amber-800 border-amber-200 hover:bg-amber-100/50 hover:text-amber-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">local_fire_department</span>
              <span>HOT LINE</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  stationTypeFilter === 'HOT' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {stationTypeCounts.hot}
              </span>
            </button>

            {/* COLD PREP Pill (Icon: ac_unit) */}
            <button
              type="button"
              onClick={() => setStationTypeFilter('COLD')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                stationTypeFilter === 'COLD'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-blue-50/50 text-blue-800 border-blue-200 hover:bg-blue-100/50 hover:text-blue-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">ac_unit</span>
              <span>COLD PREP</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  stationTypeFilter === 'COLD' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
                }`}
              >
                {stationTypeCounts.cold}
              </span>
            </button>

            {/* EXPO / PASS Pill (Icon: check_circle) */}
            <button
              type="button"
              onClick={() => setStationTypeFilter('EXPO')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                stationTypeFilter === 'EXPO'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-emerald-50/50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/50 hover:text-emerald-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">check_circle</span>
              <span>EXPO / PASS</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  stationTypeFilter === 'EXPO' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {stationTypeCounts.expo}
              </span>
            </button>

            {/* BAR & DRINKS Pill (Icon: local_bar) */}
            <button
              type="button"
              onClick={() => setStationTypeFilter('BAR')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                stationTypeFilter === 'BAR'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100/60 hover:text-purple-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">local_bar</span>
              <span>BAR & DRINKS</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  stationTypeFilter === 'BAR' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'
                }`}
              >
                {stationTypeCounts.bar}
              </span>
            </button>

            {/* DESSERTS Pill (Icon: cake) */}
            <button
              type="button"
              onClick={() => setStationTypeFilter('DESSERT')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                stationTypeFilter === 'DESSERT'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100/60 hover:text-rose-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">cake</span>
              <span>DESSERTS</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold ${
                  stationTypeFilter === 'DESSERT' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {stationTypeCounts.dessert}
              </span>
            </button>
          </div>

          {/* Right: Status Filter & Primary Add Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Status Filter Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e] shrink-0">
              <span className="material-symbols-outlined text-base">tune</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-[34px] px-3 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] text-xs font-semibold focus:border-[#ae001a] outline-none font-sans text-[#1d1c17] cursor-pointer"
                aria-label="Filter by status"
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
              ADD STATION
            </button>
          </div>
        </div>
      </div>

      {/* 3. Core Workspace Grid (Table View vs Quick-Launch Cards Grid View) */}
      {viewMode === 'cards' ? (
        isLoading ? (
          <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded-xl shadow-sm">
            <span className="material-symbols-outlined text-[#ae001a] animate-spin text-4xl mb-2">
              sync
            </span>
            <p className="text-xs font-bold uppercase tracking-wider text-[#5f5e5e]">
              Loading Kitchen Stations Directory...
            </p>
          </div>
        ) : error ? (
          <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded-xl shadow-sm space-y-3">
            <span className="material-symbols-outlined text-4xl text-[#ba1a1a]">error</span>
            <p className="font-bold text-[#ba1a1a]">{error}</p>
            <button
              type="button"
              onClick={() => fetchStations()}
              className="px-4 py-2 bg-[#222222] text-white font-bold text-xs uppercase hover:bg-[#ae001a] transition-all cursor-pointer rounded-lg"
            >
              Retry Connection
            </button>
          </div>
        ) : filteredStations.length === 0 ? (
          <TableEmptyState
            asTableRow={false}
            icon="soup_kitchen"
            title="No kitchen stations found"
            description="No physical kitchen prep stations matched your search criteria. Try resetting your active search filters or click 'Add Kitchen Station' to define new prep routing targets."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
          {filteredStations.map((station) => {
            const isInactive = !station.is_active;
            const isDeleted = station.status === 'deleted';
            return (
              <div
                key={station.id}
                className={`bg-white border border-[#e8e2d8] rounded-lg p-4 shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:border-[#ae001a]/40 ${
                  isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : ''
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2 border-b border-[#e8e2d8] pb-2.5">
                    <div>
                      <div className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider font-sans">
                        {getStationCode(station)}
                      </div>
                      <h3
                        className={`text-sm font-bold text-[#1d1c17] font-sans ${
                          isInactive ? 'line-through' : ''
                        }`}
                      >
                        {station.name}
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#f2ede5] text-[#1d1c17] border border-[#e8e2d8] shrink-0 font-sans">
                      Order #{station.display_order}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {getStationTypeBadge(station.station_type)}
                    {getDisplayModePill(station.display_mode)}
                  </div>

                  <div className="pt-0.5 flex items-center justify-between text-xs font-sans">
                    <div className="flex items-center gap-1.5 text-zinc-600">
                      <span className="material-symbols-outlined text-[15px] text-zinc-500">
                        print
                      </span>
                      <span className="font-semibold text-[11px] truncate max-w-[160px]">
                        {station.printer_name || 'No Printer Assigned'}
                      </span>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        disabled={isDeleted}
                        checked={station.is_active}
                        onChange={() => handleToggleActive(station)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#ae001a] disabled:opacity-40 disabled:cursor-not-allowed" />
                    </label>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-[#e8e2d8] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigate) {
                        onNavigate('kitchen-display-devices');
                      }
                    }}
                    className="flex-1 py-1.5 px-2.5 bg-[#ae001a] hover:bg-[#930015] text-white font-bold text-[11px] uppercase tracking-wider rounded transition-colors duration-200 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer font-sans"
                  >
                    <span className="material-symbols-outlined text-[15px]">monitor</span>
                    LAUNCH KDS DISPLAY
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditDrawer(station)}
                    disabled={isDeleted}
                    className="p-1.5 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] border border-[#e8e2d8] rounded transition-colors disabled:opacity-30 cursor-pointer"
                    title="Edit Station"
                  >
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : (
        <div className="bg-white border border-[#e8e2d8] rounded-xl shadow-sm relative overflow-hidden">
          <HeaderQuickTabs
            title="KITCHEN STATIONS & PREP ROUTING DIRECTORY"
            badgeCount={filteredStations.length <= pageSize ? `${filteredStations.length} station${filteredStations.length === 1 ? '' : 's'}` : `${Math.min(filteredStations.length, pageSize)} / ${filteredStations.length} stations`}
            tabs={[]}
            rightElement={
              <TableOptionsMenu
                onExportCSV={() => {
                  const headers = ['ID', 'Name', 'Station Type', 'Display Mode', 'Printer', 'Status'];
                  const rows = filteredStations.map((s) => [
                    s.id,
                    `"${(s.name || '').replace(/"/g, '""')}"`,
                    s.station_type,
                    s.display_mode,
                    `"${(s.printer_name || '').replace(/"/g, '""')}"`,
                    s.is_active ? 'Active' : 'Inactive',
                  ]);
                  const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
                  const link = document.createElement('a');
                  link.href = encodeURI(csv);
                  link.download = `kitchen_stations_${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                onPrint={() => window.print()}
                printLabel="Print Kitchen Stations Directory"
                onCopySummary={() => {
                  const summaryText = `Kitchen Stations Directory Summary:\n- Total Stations: ${filteredStations.length}\n- Active Stations: ${filteredStations.filter((s) => s.is_active).length}\n- Inactive/Deleted: ${filteredStations.filter((s) => !s.is_active || s.status === 'deleted').length}`;
                  navigator.clipboard.writeText(summaryText);
                }}
                onReload={fetchStations}
                columns={[
                  { key: 'refDate', label: 'Station Ref & Date' },
                  { key: 'nameSequence', label: 'Station Name & Sequence' },
                  { key: 'stationType', label: 'Station Type Role' },
                  { key: 'displayMode', label: 'KDS Display Mode' },
                  { key: 'printer', label: 'Hardware Printer Binding' },
                  { key: 'activeRouting', label: 'Active Routing' },
                  { key: 'status', label: 'Lifecycle Status' },
                  { key: 'actions', label: 'Actions' },
                ]}
                visibleColumns={visibleColumns}
                onToggleColumn={(key) =>
                  setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key as keyof typeof visibleColumns] }))
                }
                rowDensity={rowDensity}
                onChangeDensity={setRowDensity}
                totalItems={filteredStations.length}
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
                      {visibleColumns.refDate && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-32 min-w-[110px]`}>Station Ref & Date</th>}
                      {visibleColumns.nameSequence && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-auto min-w-[180px]`}>Station Name & Sequence</th>}
                      {visibleColumns.stationType && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-36 min-w-[110px]`}>Station Type Role</th>}
                      {visibleColumns.displayMode && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-32 min-w-[100px]`}>KDS Display Mode</th>}
                      {visibleColumns.printer && <th className={`${getDensityPadding(rowDensity)} text-[#5f5e5e] w-40 min-w-[120px]`}>Hardware Printer Binding</th>}
                      {visibleColumns.activeRouting && <th className={`${getDensityPadding(rowDensity)} text-center text-[#5f5e5e] w-28 min-w-[90px]`}>Active Routing</th>}
                      {visibleColumns.status && <th className={`${getDensityPadding(rowDensity)} text-center text-[#5f5e5e] w-28 min-w-[90px]`}>Lifecycle Status</th>}
                      {visibleColumns.actions && <th className={`${getDensityPadding(rowDensity)} text-right text-[#5f5e5e] w-28 min-w-[90px]`}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8] text-xs font-sans">
                    {isLoading ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                          <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                            sync
                          </span>
                          <p className="text-secondary text-body-md mt-2 font-sans">Loading kitchen stations directory...</p>
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
                            onClick={() => fetchStations()}
                            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                          >
                            Retry Connection
                          </button>
                        </td>
                      </tr>
                    ) : stations.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="soup_kitchen"
                        title="No kitchen stations defined"
                        description="Click 'Add Kitchen Station' to define new prep routing targets."
                      />
                    ) : filteredStations.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="soup_kitchen"
                        title="No kitchen stations found"
                        description="No physical kitchen prep stations matched your search criteria. Try resetting your active search filters."
                      />
                    ) : (
                      (pageSize >= 9999
                        ? filteredStations
                        : filteredStations.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize)
                      ).map((station) => {
                      const isInactive = !station.is_active;
                      const isDeleted = station.status === 'deleted';
                      const densityPadding = getDensityPadding(rowDensity);
                      return (
                        <tr
                          key={station.id}
                          className={`transition-colors ${
                            isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                          }`}
                        >
                          {/* Reference ID & Date */}
                          {visibleColumns.refDate && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              <div className="font-mono font-normal text-xs text-[#1d1c17]">{getStationCode(station)}</div>
                              <div className="text-[11px] font-normal text-[#5f5e5e] mt-0.5">
                                {new Date(station.created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            </td>
                          )}

                          {/* Station Name & Order Badge */}
                          {visibleColumns.nameSequence && (
                            <td className={densityPadding}>
                              <div className="min-w-0 flex flex-col justify-center">
                                <span
                                  className={`font-bold text-sm text-[#1d1c17] truncate ${
                                    isInactive ? 'line-through opacity-75' : ''
                                  }`}
                                >
                                  {station.name}
                                </span>
                                <span className="font-mono text-[11px] font-normal text-[#5f5e5e] truncate mt-0.5">
                                  Order #{station.display_order}
                                </span>
                              </div>
                            </td>
                          )}

                          {/* Station Type Badge */}
                          {visibleColumns.stationType && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              {getStationTypeBadge(station.station_type)}
                            </td>
                          )}

                          {/* Display Mode Pill */}
                          {visibleColumns.displayMode && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              {getDisplayModePill(station.display_mode)}
                            </td>
                          )}

                          {/* Printer Hardware Link */}
                          {visibleColumns.printer && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              {station.printer_name ? (
                                <div className="flex items-center gap-1.5 text-xs font-normal text-zinc-700">
                                  <span className="material-symbols-outlined text-[16px] text-zinc-500">
                                    print
                                  </span>
                                  {station.printer_name}
                                </div>
                              ) : (
                                <span className="text-xs italic text-zinc-400">No Printer Assigned</span>
                              )}
                            </td>
                          )}

                          {/* Active Status Switch */}
                          {visibleColumns.activeRouting && (
                            <td className={`${densityPadding} text-center whitespace-nowrap`}>
                              <label className="relative inline-flex items-center cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  disabled={isDeleted}
                                  checked={station.is_active}
                                  onChange={() => handleToggleActive(station)}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ae001a] disabled:opacity-40 disabled:cursor-not-allowed" />
                              </label>
                            </td>
                          )}

                          {/* Record Lifecycle Badge */}
                          {visibleColumns.status && (
                            <td className={`${densityPadding} text-center whitespace-nowrap`}>
                              {isDeleted ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-zinc-200 text-zinc-600">
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
                            <td className={`${densityPadding} text-right whitespace-nowrap`}>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDrawer(station)}
                                  disabled={isDeleted}
                                  className="p-1.5 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Edit station"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStationToDelete(station);
                                    setDeleteModalOpen(true);
                                  }}
                                  disabled={isDeleted}
                                  className="p-1.5 text-zinc-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Soft delete station"
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

              {/* Pagination footer with Previous / Next controls */}
              <TablePaginationFooter
                currentPage={currentPage}
                totalItems={filteredStations.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      )}

      {/* 4. Standard Quick Launch Panel Component (QuickLaunchPanel) */}
      <div className="mt-6">
        <KitchenQuickLinks current="kitchen-stations" onNavigate={onNavigate} />
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
            active: true,
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

      {/* Portal: Drawer Modal (Create and Edit KDS Station) */}
      {isDrawerOpen &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-6 md:pb-12 backdrop-blur-sm font-sans">
            <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md min-w-[320px] sm:min-w-[450px] overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
              {/* Drawer Header */}
              <div className="p-4 bg-[#222222] text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ae001a] text-xl">
                    soup_kitchen
                  </span>
                  <h3 className="font-bold text-sm tracking-wider uppercase !text-white text-white">
                    {drawerMode === 'add' ? 'Configure New Kitchen Station' : 'Edit Kitchen Station'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Drawer Form Body */}
              <form onSubmit={handleSubmitForm} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 font-medium">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                    Station Name <span className="text-[#ae001a]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hot Line & Grill Station"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      Station Role Type
                    </label>
                    <select
                      value={formStationType}
                      onChange={(e) => setFormStationType(e.target.value as KitchenStationType)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs cursor-pointer"
                    >
                      <option value="HOT">HOT LINE</option>
                      <option value="COLD">COLD PREP</option>
                      <option value="EXPO">EXPO / PASS</option>
                      <option value="BAR">BAR & DRINKS</option>
                      <option value="DESSERT">DESSERTS</option>
                      <option value="PREP">PREP KITCHEN</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      KDS Display Mode
                    </label>
                    <select
                      value={formDisplayMode}
                      onChange={(e) => setFormDisplayMode(e.target.value as KitchenDisplayMode)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs cursor-pointer"
                    >
                      <option value="AUTO">AUTO DISPATCH</option>
                      <option value="MANUAL">MANUAL QUEUE</option>
                      <option value="SUMMARY">SUMMARY VIEW</option>
                      <option value="GRID">GRID MATRIX</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      Display Order Sequence
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formDisplayOrder}
                      onChange={(e) => setFormDisplayOrder(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      Backup Hardware Printer
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Kitchen Printer 1"
                      value={formPrinterName}
                      onChange={(e) => setFormPrinterName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs"
                    />
                  </div>
                </div>

                {drawerMode === 'edit' && (
                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      Lifecycle Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as KitchenStationStatus)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs cursor-pointer"
                    >
                      <option value="active">ACTIVE</option>
                      <option value="deleted">DELETED</option>
                    </select>
                  </div>
                )}

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-[#e8e2d8] text-[#ae001a] focus:ring-[#ae001a]"
                    />
                    <span className="text-xs font-bold text-[#1d1c17] uppercase tracking-wider">
                      Enable Active Station Routing
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#e8e2d8]">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] font-bold uppercase text-xs hover:bg-[#f2ede5] transition-colors rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-[#ae001a] text-white font-bold uppercase text-xs hover:bg-[#930015] transition-colors rounded flex items-center gap-2"
                  >
                    {isSubmitting && (
                      <span className="material-symbols-outlined text-sm animate-spin">
                        progress_activity
                      </span>
                    )}
                    {drawerMode === 'add' ? 'Save Station' : 'Update Station'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Soft Delete Confirmation Modal */}
      {deleteModalOpen && (
        <AppModal
          onClose={() => setDeleteModalOpen(false)}
          title="Soft Delete Kitchen Station"
          size="md"
        >
          <div className="p-6 space-y-4 text-xs font-sans text-[#1d1c17]">
            <p>
              Are you sure you want to soft-delete kitchen station{' '}
              <strong className="text-[#ae001a]">{stationToDelete?.name}</strong>?
            </p>
            <p className="text-[#5f5e5e]">
              Deactivating or soft-deleting this station will flag its status as DELETED and disable real-time order item routing to associated KDS screens.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#e8e2d8]">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] font-bold uppercase text-xs hover:bg-[#f2ede5] transition-colors rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-[#ae001a] text-white font-bold uppercase text-xs hover:bg-[#930015] transition-colors rounded cursor-pointer flex items-center gap-2"
              >
                {isDeleting && (
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                )}
                Confirm Delete
              </button>
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
};

export default KitchenStationsView;
