import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { QRMenu, QRMenuStatus } from '../../../../types/qr-menu';
import {
  DESIGN_THEMES,
  QR_MENU_STATUSES,
  QR_MENU_STATUS_BADGES,
  QR_MENU_TYPES,
  QR_MENU_TYPE_META,
} from '../../../../types/qr-menu';
import type { QRLocation } from '../../../../types/qr-location';
import { getQRMenus, deleteQRMenu } from '../../../../api/qr-menus';
import { getQRMenuSections } from '../../../../api/qr-menu-sections';
import { getQRMenuItems } from '../../../../api/qr-menu-items';
import { getQRLocations } from '../../../../api/qr-locations';
import { getThemeConfig } from '../../../../lib/qr-menu';
import { QRMenuDrawer, type DrawerMode } from './QRMenuDrawer';
import { QRMenuCloneModal } from './QRMenuCloneModal';
import { QRMenuMobilePreview } from './QRMenuMobilePreview';

interface QRMenusViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

export const QRMenusView: React.FC<QRMenusViewProps> = ({
  onNavigate,
  merchantId = 3,
}) => {
  const [menus, setMenus] = useState<QRMenu[]>([]);
  const [locations, setLocations] = useState<QRLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & View State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [themeFilter, setThemeFilter] = useState<string>('ALL');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<QRMenuStatus>>(
    new Set(['active', 'inactive', 'archived'])
  );
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create');
  const [selectedMenu, setSelectedMenu] = useState<QRMenu | null>(null);

  // Quick Clone Modal State
  const [cloneModalMenu, setCloneModalMenu] = useState<QRMenu | null>(null);

  // Full Screen Live Phone Preview Modal
  const [previewModalMenu, setPreviewModalMenu] = useState<QRMenu | null>(null);

  // Notification Banner
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menusData, locsData, sectionsData, itemsData] = await Promise.allSettled([
        getQRMenus(merchantId),
        getQRLocations(merchantId),
        getQRMenuSections({ merchantId }),
        getQRMenuItems({ merchantId }),
      ]);

      if (menusData.status === 'fulfilled') {
        const rawMenus = menusData.value;
        const liveSections = sectionsData.status === 'fulfilled' ? sectionsData.value : [];
        const liveItems = itemsData.status === 'fulfilled' ? itemsData.value : [];

        const enrichedMenus = rawMenus.map((menu) => {
          const menuSections = liveSections.filter((s) => Number(s.qr_menu_id) === Number(menu.id));
          const sectionIds = new Set(menuSections.map((s) => s.id));
          const menuItems = liveItems.filter((i) => sectionIds.has(i.qr_menu_section_id));

          return {
            ...menu,
            sections: menuSections,
            sections_count: menuSections.length > 0 ? menuSections.length : (menu.sections_count ?? 0),
            items_count: menuItems.length > 0 ? menuItems.length : (menu.items_count ?? 0),
          };
        });

        setMenus(enrichedMenus);
      } else {
        setError(menusData.reason?.message || 'Failed to load QR menus.');
      }

      if (locsData.status === 'fulfilled') {
        setLocations(locsData.value);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load QR menus.');
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Close full screen mobile preview on Escape key
  useEffect(() => {
    if (!previewModalMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewModalMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewModalMenu]);

  const showToast = (message: string) => {
    setSuccessToast(message);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Operational KPI Summary Metrics Calculation
  const metrics = useMemo(() => {
    const total = menus.length;
    const active = menus.filter((m) => m.status === 'active').length;
    const inactive = menus.filter((m) => m.status === 'inactive').length;
    const archived = menus.filter((m) => m.status === 'archived').length;

    // Service Type Breakdown (Table/Dine-In, Pickup, Delivery)
    const dineInCount = menus.filter((m) => m.qr_type === 'Table').length;
    const pickupCount = menus.filter((m) => m.qr_type === 'Pickup').length;
    const deliveryCount = menus.filter((m) => m.qr_type === 'Delivery').length;

    // Linked Locations: Count of active QRLocation records using registered menus
    const menuIdSet = new Set(menus.map((m) => m.id));
    const linkedActiveLocations = locations.filter(
      (loc) => loc.status === 'active' && menuIdSet.has(loc.qr_menu_id)
    ).length;

    return {
      total,
      active,
      inactive,
      archived,
      dineInCount,
      pickupCount,
      deliveryCount,
      linkedActiveLocations,
    };
  }, [menus, locations]);

  // Filtered List
  const filteredMenus = useMemo(() => {
    return menus.filter((menu) => {
      // Universal Search Bar: Real-time search across menu name and description
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = menu.name.toLowerCase().includes(query);
        const matchDesc = menu.description.toLowerCase().includes(query);
        const matchTheme = menu.design_theme.toLowerCase().includes(query);
        if (!matchName && !matchDesc && !matchTheme) return false;
      }

      // QR Type Dropdown Filter
      if (typeFilter !== 'ALL' && menu.qr_type !== typeFilter) {
        return false;
      }

      // Design Theme Selector Filter
      if (themeFilter !== 'ALL' && menu.design_theme !== themeFilter) {
        return false;
      }

      // Status Checkboxes Filter
      if (!selectedStatuses.has(menu.status)) {
        return false;
      }

      return true;
    });
  }, [menus, searchTerm, typeFilter, themeFilter, selectedStatuses]);

  // Status Checkbox Toggle Handler
  const handleStatusCheckboxChange = (status: QRMenuStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size > 1) {
          next.delete(status);
        }
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const handleCreateNew = () => {
    setSelectedMenu(null);
    setDrawerMode('create');
    setIsDrawerOpen(true);
  };

  const handleEdit = (menu: QRMenu) => {
    setSelectedMenu(menu);
    setDrawerMode('edit');
    setIsDrawerOpen(true);
  };

  const handleQuickClone = (menu: QRMenu) => {
    setCloneModalMenu(menu);
  };

  const handleDelete = async (menu: QRMenu) => {
    if (!window.confirm(`Are you sure you want to remove QR Menu "${menu.name}"?`)) {
      return;
    }
    try {
      await deleteQRMenu(menu.id);
      setMenus((prev) => prev.filter((m) => String(m.id) !== String(menu.id)));
      showToast(`Menu "${menu.name}" has been removed.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete menu.');
    }
  };

  const handleDrawerSuccess = (saved: QRMenu) => {
    setMenus((prev) => {
      const idx = prev.findIndex((m) => String(m.id) === String(saved.id));
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...saved };
        return next;
      }
      return [saved, ...prev];
    });
    loadData();
    if (drawerMode === 'clone') {
      showToast(`Menu variant "${saved.name}" successfully created with duplicated sections and items!`);
    } else if (drawerMode === 'edit') {
      showToast(`Menu "${saved.name}" updated successfully.`);
    } else {
      showToast(`New QR Menu "${saved.name}" created successfully.`);
    }
  };

  const handleCloneModalSuccess = (cloned: QRMenu) => {
    setMenus((prev) => {
      const idx = prev.findIndex((m) => String(m.id) === String(cloned.id));
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...cloned };
        return next;
      }
      return [cloned, ...prev];
    });
    loadData();
    showToast(`Pipeline executed! Cloned variant "${cloned.name}" is now ready.`);
  };

  return (
    <div className="min-h-screen bg-[#fcf9f5] text-[#1d1c17] flex flex-col font-poppins animate-fade-in">
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Toast Notification */}
        {successToast && (
          <div
            role="status"
            className="fixed bottom-20 right-6 z-50 p-4 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-semibold animate-in slide-in-from-bottom duration-300 border border-slate-700 font-poppins"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#ae001a] animate-ping" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Header Section (Theme: Black, White, Red #ae001a, Poppins Font) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 font-poppins">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ae001a] text-white flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-2xl">restaurant_menu</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-[#1d1c17] tracking-tight font-poppins">
                  QR Menus Directory
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20 font-poppins">
                  Live Operations
                </span>
              </div>
              <p className="text-xs text-[#5f5e5e] font-medium mt-0.5 font-poppins">
                Configure digital presentation themes, service routing, and cloning pipelines.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={loadData}
              className="w-10 h-10 rounded-xl bg-white border border-[#e8e2d8] flex items-center justify-center text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 shadow-xs"
              title="Refresh Directory"
            >
              <span className="material-symbols-outlined text-xl">refresh</span>
            </button>

            <button
              onClick={handleCreateNew}
              data-testid="create-qr-menu-btn"
              className="px-4 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-colors duration-200 font-poppins active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add_circle</span>
              <span>Create QR Menu</span>
            </button>
          </div>
        </div>

        {/* 1. QR Menu Operational KPI Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Digital Menus */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm hover:border-[#ae001a]/30 transition-colors duration-200">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Total Digital Menus
              </span>
              <span className="material-symbols-outlined text-gray-400 text-lg">menu_book</span>
            </div>
            <div
              data-testid="kpi-total-menus"
              className="text-2xl font-black font-mono text-[#1d1c17] font-poppins"
            >
              {metrics.total}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-poppins">Aggregate registered QR menus</div>
          </div>

          {/* Active Menus */}
          <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:border-emerald-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Active Menus
              </span>
              <span className="material-symbols-outlined text-[#10b981] text-lg">verified</span>
            </div>
            <div
              data-testid="kpi-active-menus"
              className="text-2xl font-black font-mono text-[#10b981] font-poppins"
            >
              {metrics.active}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-poppins">Status = &apos;active&apos; menus</div>
          </div>

          {/* Service Type Breakdown (DINE_IN, PICKUP, DELIVERY) */}
          <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-sm hover:border-blue-300 transition-colors duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between text-blue-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Service Type Breakdown
              </span>
              <span className="material-symbols-outlined text-blue-600 text-lg">tune</span>
            </div>
            <div className="grid grid-cols-3 gap-1 mt-1 text-center">
              <div className="bg-blue-50/80 border border-blue-200/60 rounded-lg p-1.5">
                <span className="material-symbols-outlined text-xs text-blue-700 block">table_bar</span>
                <span className="text-sm font-black font-mono text-blue-900 font-poppins">{metrics.dineInCount}</span>
                <span className="block text-[9px] font-bold text-blue-600 uppercase tracking-tighter">Dine-In</span>
              </div>
              <div className="bg-amber-50/80 border border-amber-200/60 rounded-lg p-1.5">
                <span className="material-symbols-outlined text-xs text-amber-700 block">takeout_dining</span>
                <span className="text-sm font-black font-mono text-amber-900 font-poppins">{metrics.pickupCount}</span>
                <span className="block text-[9px] font-bold text-amber-600 uppercase tracking-tighter">Pickup</span>
              </div>
              <div className="bg-emerald-50/80 border border-emerald-200/60 rounded-lg p-1.5">
                <span className="material-symbols-outlined text-xs text-emerald-700 block">local_shipping</span>
                <span className="text-sm font-black font-mono text-emerald-900 font-poppins">{metrics.deliveryCount}</span>
                <span className="block text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">Delivery</span>
              </div>
            </div>
          </div>

          {/* Linked Locations */}
          <div className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm hover:border-purple-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Linked Locations
              </span>
              <span className="material-symbols-outlined text-purple-600 text-lg">qr_code_2</span>
            </div>
            <div
              data-testid="kpi-linked-locations"
              className="text-2xl font-black font-mono text-purple-900 font-poppins"
            >
              {metrics.linkedActiveLocations}
            </div>
            <div className="text-[11px] text-purple-700 mt-0.5 font-poppins">Active QR locations bound</div>
          </div>
        </div>

        {/* 2. Dynamic Search & Multi-Filter Bar */}
        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Universal Search Bar */}
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-lg">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Universal search across menu name and description..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] text-xs font-medium text-[#1d1c17] placeholder-[#5f5e5e] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-none transition-colors duration-200 font-poppins"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] hover:text-[#ae001a]"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* QR Type Dropdown Filter */}
              <div className="flex items-center gap-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3 py-2 text-xs font-poppins">
                <span className="material-symbols-outlined text-base text-[#ae001a]">table_bar</span>
                <span className="text-[#5f5e5e] font-semibold text-[11px]">Type:</span>
                <select
                  aria-label="Filter by QR Type"
                  data-testid="qr-type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-transparent font-bold text-[#1d1c17] focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All QR Types</option>
                  {QR_MENU_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Design Theme Selector Filter */}
              <div className="flex items-center gap-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3 py-2 text-xs font-poppins">
                <span className="material-symbols-outlined text-base text-[#ae001a]">palette</span>
                <span className="text-[#5f5e5e] font-semibold text-[11px]">Theme:</span>
                <select
                  aria-label="Filter by Design Theme"
                  data-testid="theme-filter"
                  value={themeFilter}
                  onChange={(e) => setThemeFilter(e.target.value)}
                  className="bg-transparent font-bold text-[#1d1c17] focus:outline-none cursor-pointer max-w-[150px] truncate"
                >
                  <option value="ALL">All Themes</option>
                  {DESIGN_THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Grid vs Table View Mode Switch */}
              <div className="flex items-center bg-[#fef9f1] p-1 rounded-xl border border-[#e8e2d8]">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${
                    viewMode === 'grid'
                      ? 'bg-[#ae001a] text-white shadow-xs'
                      : 'text-[#5f5e5e] hover:text-[#ae001a]'
                  }`}
                  title="Grid Cards View"
                >
                  <span className="material-symbols-outlined text-lg">grid_view</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${
                    viewMode === 'table'
                      ? 'bg-[#ae001a] text-white shadow-xs'
                      : 'text-[#5f5e5e] hover:text-[#ae001a]'
                  }`}
                  title="Table Directory View"
                >
                  <span className="material-symbols-outlined text-lg">table_rows</span>
                </button>
              </div>
            </div>
          </div>

          {/* Status Checkboxes Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-[#e8e2d8] flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] font-poppins">
                Status Checkboxes:
              </span>
              {QR_MENU_STATUSES.map((status) => {
                const isChecked = selectedStatuses.has(status);
                const badgeMeta = QR_MENU_STATUS_BADGES[status];
                return (
                  <label
                    key={status}
                    className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1d1c17] select-none hover:text-[#ae001a] transition-colors duration-200 font-poppins"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleStatusCheckboxChange(status)}
                      className="w-4 h-4 rounded text-[#ae001a] focus:ring-[#ae001a] cursor-pointer"
                    />
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${badgeMeta.dotClass}`} />
                      <span className="capitalize">{status}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="text-xs font-semibold text-[#5f5e5e] font-poppins">
              Showing <strong className="text-[#1d1c17]">{filteredMenus.length}</strong> of{' '}
              <strong className="text-[#1d1c17]">{menus.length}</strong> menus
            </div>
          </div>
        </div>

        {/* Content Rendering: Loading / Error / Empty / Grid / Table */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-[#5f5e5e] gap-3 bg-white rounded-2xl border border-[#e8e2d8]">
            <div className="w-9 h-9 border-3 border-[#e8e2d8] border-t-[#ae001a] rounded-full animate-spin" />
            <span className="text-xs font-bold font-poppins">Loading QR Menus directory...</span>
          </div>
        ) : error ? (
          <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center text-rose-700 space-y-2 font-poppins">
            <p className="font-bold text-sm">Failed to Load Menus</p>
            <p className="text-xs">{error}</p>
            <button
              onClick={loadData}
              className="mt-2 px-4 py-1.5 rounded-xl bg-[#ae001a] text-white text-xs font-bold hover:bg-[#900015] transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredMenus.length === 0 ? (
          <div className="py-16 text-center bg-white border border-[#e8e2d8] rounded-2xl p-8 space-y-3 font-poppins">
            <div className="w-14 h-14 rounded-2xl bg-[#fef9f1] border border-[#e8e2d8] text-[#5f5e5e] flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">restaurant_menu</span>
            </div>
            <h3 className="text-base font-bold text-[#1d1c17]">No QR Menus Match Filters</h3>
            <p className="text-xs text-[#5f5e5e] max-w-sm mx-auto">
              Adjust your search keywords, service type, or status checkboxes to view matching menus.
            </p>
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 rounded-xl bg-[#ae001a] text-white text-xs font-bold hover:bg-[#900015] transition-colors"
            >
              Create New QR Menu
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid Cards View with Strict Poppins Typography & Red Hover Micro-Interactions */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMenus.map((menu) => {
              const theme = getThemeConfig(menu.design_theme);
              const typeMeta = QR_MENU_TYPE_META[menu.qr_type] || QR_MENU_TYPE_META.Table;
              const statusBadge = QR_MENU_STATUS_BADGES[menu.status] || QR_MENU_STATUS_BADGES.active;

              return (
                <div
                  key={menu.id}
                  className="bg-white rounded-2xl border border-[#e8e2d8] shadow-xs hover:border-[#ae001a]/50 hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group font-poppins"
                >
                  {/* Theme Header Visual Strip */}
                  <div
                    className="p-4 text-white relative overflow-hidden flex items-center justify-between"
                    style={{ background: theme.headerBackground }}
                  >
                    <div className="flex items-center gap-2 z-10">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/35 backdrop-blur-sm border border-white/20 font-poppins">
                        {theme.tag}
                      </span>
                      <span className="text-xs font-bold text-white drop-shadow-sm font-poppins">
                        {theme.name}
                      </span>
                    </div>

                    <span
                      className={`z-10 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm font-poppins ${
                        menu.status === 'active'
                          ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/40'
                          : menu.status === 'inactive'
                          ? 'bg-amber-500/30 text-amber-100 border border-amber-400/40'
                          : 'bg-rose-500/30 text-rose-100 border border-rose-400/40'
                      }`}
                    >
                      {statusBadge.label}
                    </span>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      {/* Menu ID Badge (#QR-MNU-{id}) */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-extrabold text-[#ae001a] tracking-wider uppercase font-poppins">
                          #QR-MNU-{menu.id}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 font-poppins ${typeMeta.badgeColor}`}
                        >
                          {typeMeta.label}
                        </span>
                      </div>

                      {/* Menu Title with Red Hover Transition */}
                      <h3 className="text-sm font-extrabold text-[#1d1c17] group-hover:text-[#ae001a] transition-colors duration-200 line-clamp-1 font-poppins">
                        {menu.name}
                      </h3>

                      <p className="text-xs text-[#5f5e5e] line-clamp-2 leading-relaxed mt-1">
                        {menu.description}
                      </p>
                    </div>

                    {/* Relational Stats Pills */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#e8e2d8] text-xs text-[#5f5e5e] font-semibold">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onNavigate?.('qr-code-menu-sections')}
                          className="flex items-center gap-1 hover:text-[#ae001a] transition-colors cursor-pointer"
                          title="View and Manage Sections for this menu"
                        >
                          <span className="material-symbols-outlined text-sm text-[#ae001a]">
                            view_headline
                          </span>
                          <span>{menu.sections_count ?? 0} Sections</span>
                        </button>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-[#ae001a]">
                            fastfood
                          </span>
                          <span>{menu.items_count ?? 0} Items</span>
                        </span>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="pt-2 flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setPreviewModalMenu(menu)}
                          className="px-2.5 py-1.5 rounded-lg border border-[#e8e2d8] hover:border-[#ae001a] hover:text-[#ae001a] text-xs font-bold text-[#5f5e5e] flex items-center gap-1 transition-colors duration-200 font-poppins"
                          title="Live Mobile Mockup"
                        >
                          <span className="material-symbols-outlined text-sm">smartphone</span>
                          <span>Preview</span>
                        </button>

                        <button
                          onClick={() => handleQuickClone(menu)}
                          data-testid={`clone-menu-${menu.id}`}
                          className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/60 hover:bg-amber-100 hover:text-[#ae001a] text-amber-800 text-xs font-bold flex items-center gap-1 transition-colors duration-200 font-poppins"
                          title="Duplicate Menu Pipeline"
                        >
                          <span className="material-symbols-outlined text-sm">content_copy</span>
                          <span>Clone</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(menu)}
                          className="w-8 h-8 rounded-lg border border-[#e8e2d8] hover:border-[#ae001a] hover:text-[#ae001a] text-[#5f5e5e] flex items-center justify-center transition-colors duration-200"
                          title="Edit Menu Drawer"
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(menu)}
                          className="w-8 h-8 rounded-lg border border-[#e8e2d8] hover:bg-rose-50 hover:border-rose-300 text-rose-500 flex items-center justify-center transition-colors duration-200"
                          title="Delete Menu"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Tabular Directory View with Strict Poppins Typography & Hover Micro-Interactions */
          <div className="bg-white rounded-2xl border border-[#e8e2d8] shadow-xs overflow-hidden font-poppins">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#fef9f1] border-b border-[#e8e2d8] text-[#5f5e5e] uppercase tracking-wider font-extrabold font-poppins">
                  <tr>
                    <th className="py-3.5 px-4">Menu ID & Title</th>
                    <th className="py-3.5 px-4">Design Theme</th>
                    <th className="py-3.5 px-4">QR Type</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Sections</th>
                    <th className="py-3.5 px-4">Items</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8]/60">
                  {filteredMenus.map((menu) => {
                    const theme = getThemeConfig(menu.design_theme);
                    const typeMeta = QR_MENU_TYPE_META[menu.qr_type] || QR_MENU_TYPE_META.Table;
                    const statusBadge = QR_MENU_STATUS_BADGES[menu.status] || QR_MENU_STATUS_BADGES.active;

                    return (
                      <tr
                        key={menu.id}
                        className="hover:bg-[#ae001a]/5 transition-colors duration-200 group"
                      >
                        <td className="py-3.5 px-4">
                          <span className="text-[10px] font-extrabold text-[#ae001a] uppercase font-poppins block">
                            #QR-MNU-{menu.id}
                          </span>
                          <div className="font-extrabold text-[#1d1c17] text-xs group-hover:text-[#ae001a] transition-colors duration-200 font-poppins">
                            {menu.name}
                          </div>
                          <div className="text-[11px] text-[#5f5e5e] line-clamp-1 max-w-xs">
                            {menu.description}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-poppins">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                              style={{ backgroundColor: theme.primaryColor }}
                            />
                            <span className="font-bold text-[#1d1c17]">{theme.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md border font-bold font-poppins ${typeMeta.badgeColor}`}
                          >
                            {typeMeta.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold font-poppins ${statusBadge.badgeClass}`}
                          >
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-[#1d1c17] font-poppins">
                          <button
                            type="button"
                            onClick={() => onNavigate?.('qr-code-menu-sections')}
                            className="hover:text-[#ae001a] transition-colors"
                            title="Manage Sections"
                          >
                            {menu.sections_count ?? 0}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-[#1d1c17] font-poppins">
                          {menu.items_count ?? 0}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setPreviewModalMenu(menu)}
                              className="p-1.5 rounded-lg text-[#5f5e5e] hover:text-[#ae001a] hover:bg-[#ae001a]/10 transition-colors duration-200"
                              title="Live Preview"
                            >
                              <span className="material-symbols-outlined text-base">smartphone</span>
                            </button>
                            <button
                              onClick={() => handleQuickClone(menu)}
                              className="p-1.5 rounded-lg text-amber-600 hover:text-[#ae001a] hover:bg-amber-100 transition-colors duration-200"
                              title="Clone Pipeline"
                            >
                              <span className="material-symbols-outlined text-base">content_copy</span>
                            </button>
                            <button
                              onClick={() => handleEdit(menu)}
                              className="p-1.5 rounded-lg text-blue-600 hover:text-[#ae001a] hover:bg-blue-100 transition-colors duration-200"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(menu)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-100 transition-colors duration-200"
                              title="Delete"
                            >
                              <span className="material-symbols-outlined text-base">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Side Drawer Modal (Add / Edit / Clone) */}
        <QRMenuDrawer
          isOpen={isDrawerOpen}
          mode={drawerMode}
          menu={selectedMenu}
          merchantId={merchantId}
          onClose={() => setIsDrawerOpen(false)}
          onSuccess={handleDrawerSuccess}
        />

        {/* Quick Clone Pipeline Modal */}
        <QRMenuCloneModal
          isOpen={!!cloneModalMenu}
          sourceMenu={cloneModalMenu}
          merchantId={merchantId}
          onClose={() => setCloneModalMenu(null)}
          onSuccess={handleCloneModalSuccess}
        />

        {/* Interactive Mobile Live Preview Modal */}
        {previewModalMenu && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed inset-0 z-[9999] overflow-y-auto flex items-center justify-center p-4 bg-[#1d1c17]/80 backdrop-blur-sm font-poppins cursor-pointer"
            role="dialog"
            aria-modal="true"
            onClick={() => setPreviewModalMenu(null)}
          >
            {/* Fixed Floating Close Button in top right */}
            <button
              type="button"
              onClick={() => setPreviewModalMenu(null)}
              data-testid="close-preview-modal-btn"
              className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-slate-800 shadow-2xl font-bold text-xs uppercase tracking-wider hover:text-[#ae001a] hover:bg-slate-100 transition-all cursor-pointer border border-slate-200"
              title="Cerrar vista previa (Esc)"
            >
              <span className="material-symbols-outlined text-base font-bold">close</span>
              <span>Cerrar</span>
              <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded border border-slate-300">ESC</kbd>
            </button>

            <div
              className="relative bg-transparent p-2 md:p-4 flex flex-col items-center animate-in zoom-in-95 duration-200 cursor-default my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <QRMenuMobilePreview
                name={previewModalMenu.name}
                description={previewModalMenu.description}
                design_theme={previewModalMenu.design_theme}
                qr_type={previewModalMenu.qr_type}
                status={previewModalMenu.status}
                sectionsCount={previewModalMenu.sections_count}
                itemsCount={previewModalMenu.items_count}
              />

              {/* Bottom helper button to dismiss */}
              <button
                type="button"
                onClick={() => setPreviewModalMenu(null)}
                className="mt-3 text-xs font-semibold text-white/80 hover:text-white flex items-center gap-1.5 py-1.5 px-4 rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span>Volver a Menús (Cerrar)</span>
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};
