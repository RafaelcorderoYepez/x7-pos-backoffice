import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  OnlineMenuSetupDrawer,
  type OnlineMenuFormData,
  type OnlineStoreOption,
} from './OnlineMenuSetupDrawer';
import {
  TableOptionsMenu,
  TablePaginationFooter,
  TableEmptyState,
  NoColumnsEmptyState,
  type TableDensity,
} from '../../../../shared/TableOptionsMenu';
import { getDensityPadding } from '../../../../shared/tableOptionsHelpers';
import { apiRequest, unwrapList, type MaybeEnvelopedList } from '../../../../../api/http';

export interface OnlineMenuItem {
  id: number;
  storeId: number;
  store_id?: number;
  name: string;
  description: string | null;
  isActive: boolean;
  is_active?: boolean;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
  store?: {
    id: number;
    subdomain: string;
  };
}

interface OnlineMenusViewProps {
  onNavigate?: (view: string) => void;
}

export const OnlineMenusView: React.FC<OnlineMenusViewProps> = () => {
  const [menus, setMenus] = useState<OnlineMenuItem[]>([]);
  const [stores, setStores] = useState<OnlineStoreOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Views
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Table options & pagination
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    menuId: true,
    store: true,
    description: true,
    status: true,
    timestamps: true,
    actions: true,
  });
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Drawer (Create / Edit) State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingMenu, setEditingMenu] = useState<OnlineMenuFormData | null>(null);

  // Delete Confirmation Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [menuToDelete, setMenuToDelete] = useState<OnlineMenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Auto-refresh state (identical to OnlineStoresView)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  // 1. Fetch Online Stores (for dropdown filter & drawer binding)
  const fetchStores = useCallback(async () => {
    try {
      const json = await apiRequest<MaybeEnvelopedList<Record<string, unknown>>>(
        '/online-stores?limit=100',
        { method: 'GET' },
        'Failed to load online stores.',
      );
      const rawStores = unwrapList(json);
      const mappedStores: OnlineStoreOption[] = rawStores.map((s) => ({
        id: Number(s.id),
        subdomain: String(s.subdomain || ''),
        is_active: Boolean(s.is_active ?? s.isActive ?? true),
        status: String(s.status || 'active'),
      }));
      setStores(mappedStores);
    } catch (err) {
      console.warn('Error fetching stores for menu binding:', err);
    }
  }, []);

  // 2. Fetch Online Menus
  const fetchMenus = useCallback(
    async (silent: boolean = false) => {
      try {
        if (!silent) setIsLoading(true);
        setIsRefreshing(true);
        setError(null);
        const json = await apiRequest<MaybeEnvelopedList<Record<string, unknown>>>(
          '/online-menus?limit=100&sortBy=createdAt&sortOrder=DESC',
          { method: 'GET' },
          'Failed to load online menus.',
        );
        const rawMenus = unwrapList(json);

        const list: OnlineMenuItem[] = rawMenus.map((item) => {
          const storeObj = item.store as { id?: number; subdomain?: string } | undefined;
          const activeFlag =
            item.isActive !== undefined
              ? Boolean(item.isActive)
              : item.is_active !== undefined
              ? Boolean(item.is_active)
              : true;

          return {
            id: Number(item.id),
            storeId: Number(item.storeId ?? item.store_id ?? storeObj?.id ?? 0),
            store_id: Number(item.store_id ?? item.storeId ?? storeObj?.id ?? 0),
            name: String(item.name || ''),
            description: item.description ? String(item.description) : null,
            isActive: activeFlag,
            is_active: activeFlag,
            createdAt: String(item.createdAt || item.created_at || ''),
            created_at: String(item.created_at || item.createdAt || ''),
            updatedAt: String(item.updatedAt || item.updated_at || ''),
            updated_at: String(item.updated_at || item.updatedAt || ''),
            store: storeObj
              ? {
                  id: Number(storeObj.id ?? 0),
                  subdomain: String(storeObj.subdomain || ''),
                }
              : undefined,
          };
        });

        setMenus(list);
        setLastUpdated(new Date());
      } catch (err: unknown) {
        console.warn('Error fetching online menus:', err);
        const msg = err instanceof Error ? err.message : 'Error fetching online menus';
        setError(msg);
        if (!silent) showToast(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetchStores();
      void fetchMenus();
    });
  }, [fetchStores, fetchMenus]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      void fetchMenus(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchMenus]);

  // Save Menu (Create or Edit)
  const handleSaveMenu = async (formData: OnlineMenuFormData) => {
    if (drawerMode === 'create') {
      await apiRequest<void>(
        '/online-menus',
        {
          method: 'POST',
          body: JSON.stringify({
            storeId: formData.storeId,
            name: formData.name,
            description: formData.description || undefined,
            isActive: formData.isActive,
          }),
        },
        'Failed to create menu.',
      );

      showToast(`Menu "${formData.name}" created successfully!`);
      await fetchMenus(true);
    } else if (drawerMode === 'edit' && formData.id) {
      await apiRequest<void>(
        `/online-menus/${formData.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            storeId: formData.storeId,
            name: formData.name,
            description: formData.description || undefined,
            isActive: formData.isActive,
          }),
        },
        'Failed to update menu.',
      );
      showToast(`Menu #${formData.id} updated successfully!`);
      await fetchMenus(true);
    }
  };

  // Toggle Publication Availability (is_active) directly from table or card
  const handleTogglePublication = async (menu: OnlineMenuItem) => {
    const newActive = !menu.isActive;
    const previousMenus = [...menus];

    // Optimistic UI update
    setMenus((prev) =>
      prev.map((m) =>
        m.id === menu.id ? { ...m, isActive: newActive, is_active: newActive } : m
      )
    );

    try {
      await apiRequest<void>(
        `/online-menus/${menu.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            isActive: newActive,
          }),
        },
        'Failed to toggle menu status.',
      );
      showToast(
        `Menu #${menu.id} is now ${newActive ? 'Published' : 'Draft / Inactive'}`
      );
    } catch (err: unknown) {
      setMenus(previousMenus);
      const msg = err instanceof Error ? err.message : 'Error toggling publication state';
      showToast(msg);
    }
  };

  // Delete Menu Confirmation
  const handleDeleteMenu = async () => {
    if (!menuToDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await apiRequest<void>(
        `/online-menus/${menuToDelete.id}`,
        { method: 'DELETE' },
        'Failed to delete menu.',
      );
      showToast(`Menu #${menuToDelete.id} (${menuToDelete.name}) permanently removed.`);
      setIsDeleteModalOpen(false);
      setMenuToDelete(null);
      await fetchMenus(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting menu';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper for Store Subdomain resolution
  const getStoreSubdomain = useCallback(
    (item: OnlineMenuItem): string => {
      if (item.store?.subdomain) return item.store.subdomain;
      const found = stores.find((s) => s.id === item.storeId);
      if (found?.subdomain) return found.subdomain;
      return `store-${item.storeId}`;
    },
    [stores]
  );

  // Filtered & Searched Data
  const filteredMenus = useMemo(() => {
    return menus.filter((menu) => {
      // Store filter
      if (selectedStoreFilter !== 'all' && String(menu.storeId) !== selectedStoreFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'Published' && !menu.isActive) {
        return false;
      }
      if (statusFilter === 'Draft' && menu.isActive) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = menu.name.toLowerCase().includes(q);
        const descMatch = (menu.description || '').toLowerCase().includes(q);
        const idMatch = `#mnu-${menu.id}`.toLowerCase().includes(q) || String(menu.id) === q;
        const storeMatch = getStoreSubdomain(menu).toLowerCase().includes(q);
        if (!nameMatch && !descMatch && !idMatch && !storeMatch) {
          return false;
        }
      }

      return true;
    });
  }, [menus, selectedStoreFilter, statusFilter, searchQuery, getStoreSubdomain]);

  // Pagination Slice
  const totalItems = filteredMenus.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedMenus = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMenus.slice(start, start + pageSize);
  }, [filteredMenus, currentPage, pageSize]);

  // Reset to the first page when filters shrink the result set (adjusting state during render)
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }

  // KPI Computations (Story 4299)
  const totalMenus = menus.length;
  const publishedMenusCount = menus.filter((m) => m.isActive).length;
  const draftMenusCount = menus.filter((m) => !m.isActive).length;
  const storesWithActiveMenusCount = new Set(
    menus.filter((m) => m.isActive).map((m) => m.storeId)
  ).size;

  // Action menu handlers for TableOptionsMenu
  const handleExportCSV = () => {
    if (!filteredMenus || filteredMenus.length === 0) return;
    const headers = ['ID', 'Menu Name', 'Bound Store', 'Description', 'Status', 'Created At', 'Updated At'];
    const rows = filteredMenus.map((m) => [
      m.id,
      `"${m.name.replace(/"/g, '""')}"`,
      `"${getStoreSubdomain(m)}.x7pos.com"`,
      `"${(m.description || '').replace(/"/g, '""')}"`,
      m.isActive ? 'Published' : 'Draft / Inactive',
      m.createdAt,
      m.updatedAt,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `online_menus_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintTable = () => {
    window.print();
  };

  const handleCopySummary = () => {
    if (!filteredMenus || filteredMenus.length === 0) return;
    const text = filteredMenus
      .map(
        (m) =>
          `#MNU-${m.id} ${m.name} -> Store: ${getStoreSubdomain(m)}.x7pos.com [${
            m.isActive ? 'PUBLISHED' : 'DRAFT'
          }]`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    showToast('Menu directory list copied to clipboard!');
  };

  const densityPadding = getDensityPadding(rowDensity);
  const dataColumnsCount =
    (visibleColumns.menuId ? 1 : 0) +
    (visibleColumns.store ? 1 : 0) +
    (visibleColumns.description ? 1 : 0) +
    (visibleColumns.status ? 1 : 0) +
    (visibleColumns.timestamps ? 1 : 0) +
    (visibleColumns.actions ? 1 : 0);
  const activeColSpan = Math.max(1, dataColumnsCount);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-24">
      {/* Toast Notification (Exact OnlineStoresView design) */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-[#1d1c17] text-white rounded-xl shadow-2xl border border-zinc-700 flex items-center gap-3 text-xs font-semibold animate-slide-in">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Card Workspace (KDS standard layout) */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
              restaurant_menu
            </span>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
              ONLINE MENUS WORKSPACE
            </h2>
          </div>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Construct and organize digital catalogs bound to specific online stores, manage menu titles and descriptive copy, and toggle publication availability.
          </p>
        </div>
      </div>

      {/* 2. Hero KPIs Strip (4 Cards strictly in 1 single horizontal row, dark #222222) */}
      <div className="grid grid-cols-4 gap-3 w-full">
        {/* KPI 1: Total Digital Menus */}
        <div className="bg-[#222222] hover:bg-[#2c2b25] text-white p-3.5 rounded-lg border-t-4 border-t-blue-500 shadow-xs flex flex-col justify-between h-28 group transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-white transition-colors font-poppins">
              Total Digital Menus
            </span>
            <div className="w-7 h-7 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">restaurant_menu</span>
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-white leading-none font-poppins">
              {isLoading ? '...' : totalMenus}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1 font-medium truncate font-poppins">
              Configured digital catalogs
            </p>
          </div>
        </div>

        {/* KPI 2: Published Menus */}
        <div className="bg-[#222222] hover:bg-[#2c2b25] text-white p-3.5 rounded-lg border-t-4 border-t-emerald-500 shadow-xs flex flex-col justify-between h-28 group transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-white transition-colors font-poppins">
              Published Menus
            </span>
            <div className="w-7 h-7 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">check_circle</span>
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400 leading-none font-poppins">
              {isLoading ? '...' : publishedMenusCount}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1 font-medium truncate font-poppins">
              Live & visible to customers
            </p>
          </div>
        </div>

        {/* KPI 3: Draft / Inactive Menus */}
        <div className="bg-[#222222] hover:bg-[#2c2b25] text-white p-3.5 rounded-lg border-t-4 border-t-slate-500 shadow-xs flex flex-col justify-between h-28 group transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-white transition-colors font-poppins">
              Draft / Inactive Menus
            </span>
            <div className="w-7 h-7 rounded bg-slate-500/20 text-slate-300 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">pause_circle</span>
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-slate-300 leading-none font-poppins">
              {isLoading ? '...' : draftMenusCount}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1 font-medium truncate font-poppins">
              Hidden from storefront
            </p>
          </div>
        </div>

        {/* KPI 4: Stores with Active Menus (Story 4299) */}
        <div className="bg-[#222222] hover:bg-[#2c2b25] text-white p-3.5 rounded-lg border-t-4 border-t-purple-500 shadow-xs flex flex-col justify-between h-28 group transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-white transition-colors font-poppins">
              Stores with Active Menus
            </span>
            <div className="w-7 h-7 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">storefront</span>
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-white leading-none font-poppins">
              {isLoading ? '...' : storesWithActiveMenusCount}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1 font-medium truncate font-poppins">
              Channels with live catalogs
            </p>
          </div>
        </div>
      </div>

      {/* 3. Unified Multi-Dimensional Filter Bar Controls (Exact OnlineStoresView standard pattern) */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-3.5">
        {/* ROW 1: Search, Store Filter, View Mode Switcher, Auto-Refresh & Updated Timestamp */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[260px] max-w-lg">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[#5f5e5e]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search menus (#MNU-id, title, store subdomain, copy)..."
                className="h-[34px] w-full pl-9 pr-8 text-xs rounded-lg border border-[#d5cfc4] focus:outline-none focus:border-[#ae001a] bg-[#fcfcfb] text-[#1d1c17] placeholder:text-[#8c857b] transition-colors duration-200 font-poppins"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Store Association Dropdown Selector (Exact KDS / kdevices design) */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="material-symbols-outlined text-base">storefront</span>
              <select
                value={selectedStoreFilter}
                onChange={(e) => {
                  setSelectedStoreFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-[34px] px-3 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] text-xs focus:border-[#ae001a] outline-none font-poppins text-[#1d1c17] cursor-pointer max-w-[220px] transition-colors duration-200"
                aria-label="Filter by online store"
              >
                <option value="all">All Stores ({stores.length})</option>
                {stores.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.subdomain}.x7pos.com (#{s.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right Toolbar: View Mode Switcher, Auto-Refresh Widget & Updated */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Switcher Toggle */}
            <div className="flex items-center h-[34px] bg-[#f2ede5] p-0.5 rounded-lg border border-[#e8e2d8] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer font-poppins ${
                  viewMode === 'table'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Table View"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'table' ? 'text-[#ae001a]' : ''}`}>table_rows</span>
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer font-poppins ${
                  viewMode === 'cards'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Card Grid View"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'cards' ? 'text-[#ae001a]' : ''}`}>grid_view</span>
                Cards
              </button>
            </div>

            {/* Auto-Refresh Widget */}
            <div className="flex items-center h-[34px] px-2.5 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] gap-1.5 text-xs text-[#5f5e5e] shrink-0 font-poppins">
              <button
                type="button"
                onClick={() => void fetchMenus(false)}
                disabled={isLoading || isRefreshing}
                className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
                title="Sync now"
              >
                <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin text-[#ae001a]' : ''}`}>
                  sync
                </span>
              </button>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-[11px] font-semibold text-[#1d1c17] focus:outline-none cursor-pointer h-full font-poppins"
              >
                <option value={0}>Auto: Off</option>
                <option value={5}>Auto: 5s</option>
                <option value={10}>Auto: 10s</option>
                <option value={30}>Auto: 30s</option>
                <option value={60}>Auto: 60s</option>
              </select>
            </div>

            {/* Last Updated Timestamp */}
            <div className="hidden sm:flex items-center h-[34px] gap-1 text-[11px] text-[#5f5e5e] pl-1 shrink-0 font-poppins">
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>Updated:</span>
              <span className="font-mono font-bold text-[#1d1c17]">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* ROW 2: STATUS Multi-Select Pills & Create Digital Menu Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#f0ede6]">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#5f5e5e] shrink-0 mr-0.5 font-poppins">
              Status:
            </span>

            {/* All Pill */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('All');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-poppins transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                statusFilter === 'All'
                  ? 'bg-[#1d1c17] text-white border-[#1d1c17] shadow-xs'
                  : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
              }`}
            >
              <span>All</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold font-poppins ${
                  statusFilter === 'All' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-[#5f5e5e]'
                }`}
              >
                {totalMenus}
              </span>
            </button>

            {/* Published Pill (Icon: check_circle, #10b981) */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'Published' ? 'All' : 'Published');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-poppins transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                statusFilter === 'Published'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-emerald-50/50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/50 hover:text-emerald-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">check_circle</span>
              <span>PUBLISHED</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold font-poppins ${
                  statusFilter === 'Published' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {publishedMenusCount}
              </span>
            </button>

            {/* Draft Pill (Icon: pause_circle, #64748b) */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'Draft' ? 'All' : 'Draft');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-poppins transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                statusFilter === 'Draft'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200/60 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">pause_circle</span>
              <span>DRAFT / INACTIVE</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold font-poppins ${
                  statusFilter === 'Draft' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {draftMenusCount}
              </span>
            </button>
          </div>

          {/* Primary Action Button: Create Digital Menu (at status row level, exact x7POS standard) */}
          <button
            type="button"
            onClick={() => {
              setDrawerMode('create');
              setEditingMenu(null);
              setIsDrawerOpen(true);
            }}
            className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer shrink-0 ml-auto"
            title="Create new digital menu"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            CREATE DIGITAL MENU
          </button>
        </div>
      </div>

      {/* Main Content Area (Table View vs Cards Grid View) */}
      {viewMode === 'table' ? (
        /* TABLE VIEW (Standard layout based on ProductsView & OnlineStoresView) */
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          {/* Dark Header #222222 with Full Options Dropdown Menu */}
          <div className="p-4 bg-[#222222] flex justify-between items-center relative">
            <div className="flex items-center gap-3">
              <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
                DIGITAL MENU DIRECTORY
              </span>
              <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
                {paginatedMenus.length === filteredMenus.length
                  ? `${filteredMenus.length} menu${filteredMenus.length === 1 ? '' : 's'}`
                  : `${paginatedMenus.length} / ${filteredMenus.length} menus`}
              </span>
            </div>

            <TableOptionsMenu
              onExportCSV={handleExportCSV}
              onPrint={handlePrintTable}
              onCopySummary={handleCopySummary}
              onReload={() => void fetchMenus()}
              columns={[
                { key: 'menuId', label: 'Menu Badge & Title' },
                { key: 'store', label: 'Bound Store Subdomain' },
                { key: 'description', label: 'Description Preview' },
                { key: 'status', label: 'Publication Status' },
                { key: 'timestamps', label: 'Timestamps' },
                { key: 'actions', label: 'Actions' },
              ]}
              visibleColumns={visibleColumns}
              onToggleColumn={(key) =>
                setVisibleColumns((prev) => ({
                  ...prev,
                  [key]: !prev[key],
                }))
              }
              rowDensity={rowDensity}
              onChangeDensity={setRowDensity}
              totalItems={filteredMenus.length}
              pageSize={pageSize}
              onChangePageSize={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>

          {dataColumnsCount === 0 ? (
            <NoColumnsEmptyState />
          ) : (
            <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full table-fixed border-collapse font-sans text-xs">
                <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                  <tr>
                    {visibleColumns.menuId && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-52`}>
                        Menu Badge & Title
                      </th>
                    )}
                    {visibleColumns.store && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-44`}>
                        Bound Store
                      </th>
                    )}
                    {visibleColumns.description && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-auto`}>
                        Description Preview
                      </th>
                    )}
                    {visibleColumns.status && (
                      <th className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-44`}>
                        Publication Status
                      </th>
                    )}
                    {visibleColumns.timestamps && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-40`}>
                        Timestamps
                      </th>
                    )}
                    {visibleColumns.actions && (
                      <th className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-28 min-w-[90px]`}>
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8] text-xs text-[#1d1c17]">
                  {isLoading ? (
                    <tr>
                      <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                        <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                          sync
                        </span>
                        <p className="text-secondary text-body-md mt-2 font-sans">Loading digital menus...</p>
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
                          onClick={() => void fetchMenus()}
                          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                        >
                          Retry Connection
                        </button>
                      </td>
                    </tr>
                  ) : menus.length === 0 ? (
                    <TableEmptyState
                      colSpan={activeColSpan}
                      icon="restaurant_menu"
                      title="No digital menus found"
                      description="Click 'Create Digital Menu' to configure your first online catalog."
                    />
                  ) : filteredMenus.length === 0 ? (
                    <TableEmptyState
                      colSpan={activeColSpan}
                      icon="restaurant_menu"
                      title="No matching menus"
                      description="No digital menus match your selected filter criteria."
                    />
                  ) : (
                    paginatedMenus.map((menu) => {
                      const storeSub = getStoreSubdomain(menu);

                      return (
                        <tr
                          key={menu.id}
                          className="hover:bg-[#f8f3eb] transition-colors duration-200 group cursor-pointer"
                        >
                          {/* Column 1: Menu Badge & Title */}
                          {visibleColumns.menuId && (
                            <td className={`${densityPadding} font-sans`}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-[#ae001a] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded shrink-0 font-poppins">
                                  #MNU-{menu.id}
                                </span>
                                <span className="font-bold text-[#1d1c17] truncate group-hover:text-[#ae001a] transition-colors duration-200 font-poppins" title={menu.name}>
                                  {menu.name}
                                </span>
                              </div>
                            </td>
                          )}

                          {/* Column 2: Bound Store Subdomain */}
                          {visibleColumns.store && (
                            <td className={`${densityPadding} font-sans`}>
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="material-symbols-outlined text-base text-blue-600 shrink-0">
                                  storefront
                                </span>
                                <span className="font-mono font-medium text-[#1d1c17] truncate font-poppins" title={`${storeSub}.x7pos.com`}>
                                  {storeSub}.x7pos.com
                                </span>
                              </div>
                              <span className="text-[10px] text-[#5f5e5e] font-mono block pl-5 font-poppins">
                                Store #{menu.storeId}
                              </span>
                            </td>
                          )}

                          {/* Column 3: Description Preview (Graceful null handling) */}
                          {visibleColumns.description && (
                            <td className={`${densityPadding} font-sans max-w-xs`}>
                              {menu.description ? (
                                <p className="text-[#5f5e5e] line-clamp-2 text-xs font-poppins" title={menu.description}>
                                  {menu.description}
                                </p>
                              ) : (
                                <span className="text-[#8c857b] italic text-[11px] flex items-center gap-1 font-poppins">
                                  <span className="material-symbols-outlined text-[13px] text-[#8c857b]">notes</span>
                                  No description provided
                                </span>
                              )}
                            </td>
                          )}

                          {/* Column 4: Publication Status Pill & Switch */}
                          {visibleColumns.status && (
                            <td className={`${densityPadding} text-center font-sans`}>
                              <div className="inline-flex items-center justify-center gap-2">
                                {menu.isActive ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-2xs tracking-wide uppercase font-poppins"
                                    style={{ backgroundColor: '#10b981' }}
                                  >
                                    <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                    Published
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-2xs tracking-wide uppercase font-poppins"
                                    style={{ backgroundColor: '#64748b' }}
                                  >
                                    <span className="material-symbols-outlined text-[12px]">pause_circle</span>
                                    Draft
                                  </span>
                                )}

                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={menu.isActive}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleTogglePublication(menu);
                                  }}
                                  title={menu.isActive ? 'Click to set as Draft' : 'Click to Publish'}
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    menu.isActive ? 'bg-[#10b981]' : 'bg-[#64748b]'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                      menu.isActive ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            </td>
                          )}

                          {/* Column 5: Timestamps (Created & Updated separated vertically, dates on single line) */}
                          {visibleColumns.timestamps && (
                            <td className={`${densityPadding} text-xs font-sans whitespace-nowrap`}>
                              <div className="flex flex-col gap-0.5 leading-tight">
                                <div className="text-[11px] text-[#1d1c17] flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="text-[#8c857b] font-normal text-[10px]">Created:</span>
                                  <span className="text-[#1d1c17] text-[10.5px]">
                                    {formatDate(menu.createdAt)}
                                  </span>
                                </div>
                                {menu.updatedAt && menu.updatedAt !== menu.createdAt && (
                                  <div className="text-[11px] text-[#1d1c17] flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="text-[#8c857b] font-normal text-[10px]">Updated:</span>
                                    <span className="text-[#1d1c17] text-[10.5px]">
                                      {formatDate(menu.updatedAt)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Column: Actions */}
                          {visibleColumns.actions && (
                            <td className={`text-center whitespace-nowrap ${densityPadding}`}>
                              <div className="flex justify-center gap-3">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawerMode('edit');
                                    setEditingMenu({
                                      id: menu.id,
                                      storeId: menu.storeId,
                                      name: menu.name,
                                      description: menu.description,
                                      isActive: menu.isActive,
                                    });
                                    setIsDrawerOpen(true);
                                  }}
                                  className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                                  title="Edit Menu"
                                >
                                  <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuToDelete(menu);
                                    setDeleteError(null);
                                    setIsDeleteModalOpen(true);
                                  }}
                                  className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                                  title="Delete Menu"
                                >
                                  <span className="material-symbols-outlined text-[20px]">block</span>
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
          )}

          {/* Table Pagination Footer (Identical to OnlineStoresView) */}
          <TablePaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredMenus.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </div>
      ) : filteredMenus.length === 0 ? (
        <div
          style={{ textAlign: 'center' }}
          className="bg-white rounded-xl border border-[#e8e2d8] p-12 flex flex-col items-center justify-center text-center shadow-sm w-full mx-auto"
        >
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-400 flex items-center justify-center mx-auto mb-3 shrink-0">
            <span className="material-symbols-outlined text-2xl">restaurant_menu</span>
          </div>
          <h3
            style={{ textAlign: 'center' }}
            className="text-sm font-bold text-[#1d1c17] uppercase tracking-wide text-center w-full font-poppins"
          >
            No Digital Menus Found
          </h3>
          <p
            style={{ textAlign: 'center', margin: '0.25rem auto 0 auto' }}
            className="text-xs text-[#5f5e5e] max-w-md mx-auto text-center leading-relaxed w-full font-poppins"
          >
            {searchQuery || selectedStoreFilter !== 'all' || statusFilter !== 'All'
              ? 'No digital menus match your current filter criteria. Clear filters to see all catalogs.'
              : 'Construct your first digital catalog bound to an online store to manage items and availability.'}
          </p>
        </div>
      ) : (
        /* CARDS GRID VIEW (Standard layout based on OnlineStoresView) */
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedMenus.map((menu) => {
              const storeSub = getStoreSubdomain(menu);

              return (
                <div
                  key={menu.id}
                  className="bg-white border border-[#e8e2d8] rounded p-5 shadow-xs hover:border-[#ae001a] transition-all duration-200 flex flex-col justify-between group"
                >
                  <div>
                    {/* Header: Badge & Status */}
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#f0ede6]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-[#ae001a] bg-red-50 border border-red-200 px-2 py-0.5 rounded font-poppins">
                          #MNU-{menu.id}
                        </span>
                        <span className="font-mono text-[11px] text-[#5f5e5e] font-poppins">
                          Store #{menu.storeId}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {menu.isActive ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-poppins text-white shadow-2xs tracking-wide uppercase"
                            style={{ backgroundColor: '#10b981' }}
                          >
                            <span className="material-symbols-outlined text-[12px]">check_circle</span>
                            Published
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-poppins text-white shadow-2xs tracking-wide uppercase"
                            style={{ backgroundColor: '#64748b' }}
                          >
                            <span className="material-symbols-outlined text-[12px]">pause_circle</span>
                            Draft
                          </span>
                        )}

                        <button
                          type="button"
                          role="switch"
                          aria-checked={menu.isActive}
                          onClick={() => void handleTogglePublication(menu)}
                          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            menu.isActive ? 'bg-[#10b981]' : 'bg-[#64748b]'
                          }`}
                          title="Toggle publication"
                        >
                          <span
                            className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                              menu.isActive ? 'translate-x-3' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Menu Title */}
                    <h3 className="font-black text-lg text-[#1d1c17] mt-3 group-hover:text-[#ae001a] transition-colors font-poppins">
                      {menu.name}
                    </h3>

                    {/* Bound Store Context */}
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-[#5f5e5e] bg-[#fcfcfb] p-2 rounded border border-[#e8e2d8]">
                      <span className="material-symbols-outlined text-base text-blue-600">storefront</span>
                      <span className="font-mono font-bold text-[#1d1c17] font-poppins">
                        {storeSub}.x7pos.com
                      </span>
                    </div>

                    {/* Description preview */}
                    <div className="mt-3">
                      {menu.description ? (
                        <p className="text-xs text-[#5f5e5e] line-clamp-3 leading-relaxed">
                          {menu.description}
                        </p>
                      ) : (
                        <p className="text-xs text-[#8c857b] italic">
                          No description provided for this menu.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-4 pt-3 border-t border-[#f0ede6] flex items-center justify-between text-xs text-[#5f5e5e]">
                    <span className="text-[11px] text-[#8c857b]">
                      Created: {formatDate(menu.createdAt)}
                    </span>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerMode('edit');
                          setEditingMenu({
                            id: menu.id,
                            storeId: menu.storeId,
                            name: menu.name,
                            description: menu.description,
                            isActive: menu.isActive,
                          });
                          setIsDrawerOpen(true);
                        }}
                        className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                        title="Edit Menu"
                      >
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMenuToDelete(menu);
                          setDeleteError(null);
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                        title="Delete Menu"
                      >
                        <span className="material-symbols-outlined text-[20px]">block</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cards Pagination */}
          <div className="bg-white border border-[#e8e2d8] rounded shadow-xs overflow-hidden">
            <TablePaginationFooter
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredMenus.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      )}

      {/* Drawer Component for Menu Creation & Editing */}
      <OnlineMenuSetupDrawer
        isOpen={isDrawerOpen}
        mode={drawerMode}
        initialData={editingMenu}
        stores={stores}
        onClose={() => {
          setIsDrawerOpen(false);
          setEditingMenu(null);
        }}
        onSubmit={handleSaveMenu}
      />

      {/* Delete / Soft-Delete Confirmation Modal (Agreed standard pattern) */}
      {isDeleteModalOpen && menuToDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] overflow-y-auto flex items-center justify-center p-4 font-sans" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => !isDeleting && setIsDeleteModalOpen(false)}
          />

          {/* Modal Box */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 animate-scale-in text-left">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-50 border border-red-100 text-[#ae001a]">
                <span className="material-symbols-outlined text-2xl block select-none">
                  delete_forever
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  Confirm Digital Menu Deletion
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to delete digital menu{' '}
                  <strong className="text-zinc-800">"{menuToDelete.name}"</strong> (#MNU-
                  {menuToDelete.id})? Customers will immediately lose access to this digital catalog on storefront{' '}
                  <span className="font-semibold text-zinc-700">{getStoreSubdomain(menuToDelete)}.x7pos.com</span>.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-body-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm block">error</span>
                <span>{deleteError}</span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setMenuToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-body-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all duration-200 cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteMenu()}
                disabled={isDeleting}
                className="px-4 py-2 text-white text-body-xs font-bold rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-sans bg-red-600 hover:bg-[#ae001a]"
              >
                {isDeleting ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin block">sync</span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Menu</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
