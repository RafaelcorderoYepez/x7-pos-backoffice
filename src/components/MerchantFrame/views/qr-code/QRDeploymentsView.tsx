import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  QRLocation,
  QRLocationStatus,
  QRMenuRef,
  QRMenuType,
  TableRef,
} from '../../../../types/qr-location';
import {
  QR_LOCATION_STATUSES,
  QR_LOCATION_TYPE_LABELS,
  QR_LOCATION_TYPES,
  QR_STATUS_BADGE_STYLES,
} from '../../../../types/qr-location';
import {
  deleteQRLocation,
  fetchAvailableQRMenus,
  fetchAvailableTables,
  getQRLocations,
} from '../../../../api/qr-locations';
import {
  convertSvgToHighResPngDataUrl,
  getLocationTypeIcon,
} from '../../../../lib/qr-location';
import { QRLocationDrawer } from './QRLocationDrawer';
import { QRCodeNavHubBar } from './QRCodeNavHubBar';

interface QRDeploymentsViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

export const QRDeploymentsView: React.FC<QRDeploymentsViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const [locations, setLocations] = useState<QRLocation[]>([]);
  const [menus, setMenus] = useState<QRMenuRef[]>([]);
  const [tables, setTables] = useState<TableRef[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Multi-Tier Filter Controls
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [menuFilter, setMenuFilter] = useState<string>('ALL');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [selectedTypeFilters, setSelectedTypeFilters] = useState<Set<QRMenuType>>(new Set());
  const [selectedStatusSet, setSelectedStatusSet] = useState<Set<QRLocationStatus>>(
    new Set(['active', 'inactive', 'suspended', 'archived'])
  );
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Side Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingLocation, setEditingLocation] = useState<QRLocation | null>(null);

  // Interactive Lightbox state
  const [lightboxLocation, setLightboxLocation] = useState<QRLocation | null>(null);

  // Export Modal & Print Template State
  const [exportModalLocation, setExportModalLocation] = useState<QRLocation | null>(null);
  const [isBatchExportOpen, setIsBatchExportOpen] = useState<boolean>(false);
  const [printTemplate, setPrintTemplate] = useState<'acrylic' | 'sticker' | 'tentCard'>('acrylic');
  const [copiedUrlId, setCopiedUrlId] = useState<number | null>(null);
  const [copiedToast, setCopiedToast] = useState<{ message: string; url: string } | null>(null);

  const activeMerchantId = merchantId || 3;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [locsRes, menusRes, tablesRes] = await Promise.allSettled([
        getQRLocations(activeMerchantId),
        fetchAvailableQRMenus(activeMerchantId),
        fetchAvailableTables(activeMerchantId),
      ]);
      if (locsRes.status === 'fulfilled') {
        // Enforce tenant scoping
        setLocations(locsRes.value.filter((l) => l.merchant_id === activeMerchantId));
      }
      if (menusRes.status === 'fulfilled') {
        setMenus(menusRes.value.filter((m) => !m.merchant_id || m.merchant_id === activeMerchantId));
      }
      if (tablesRes.status === 'fulfilled') {
        setTables(tablesRes.value.filter((t) => t.merchant_id === activeMerchantId));
      }

      if (locsRes.status === 'rejected') {
        setError(locsRes.reason?.message || 'Failed to load QR Deployments.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load QR Deployments.');
    } finally {
      setLoading(false);
    }
  }, [activeMerchantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Map of tableId -> TableRef for quick lookup of zone_name
  const tableMap = useMemo(() => {
    const map = new Map<number, TableRef>();
    for (const t of tables) {
      map.set(t.id, t);
    }
    return map;
  }, [tables]);

  // Available Dining Zones for filtering
  const availableZones = useMemo(() => {
    const zoneSet = new Set<string>();
    for (const t of tables) {
      if (t.zone_name) zoneSet.add(t.zone_name);
    }
    for (const l of locations) {
      if (l.table?.zone_name) zoneSet.add(l.table.zone_name);
    }
    return Array.from(zoneSet).sort();
  }, [tables, locations]);

  // Operational KPI Summary Metrics Banner (Real-Time Accuracy)
  const metrics = useMemo(() => {
    // Tenant-scoped calculations
    const total = locations.length;
    const active = locations.filter((l) => l.status === 'active').length;

    // Table Coverage Index: (Active Deployed Tables / Total Physical Merchant Tables) * 100
    // Only takes into account active physical tables of the logged-in tenant
    const activeDeployedTableIds = new Set<number>();
    for (const l of locations) {
      if (l.status === 'active' && l.table_id && l.table_id > 0) {
        activeDeployedTableIds.add(l.table_id);
      }
    }
    const activeDeployedTablesCount = activeDeployedTableIds.size;
    const totalPhysicalTables = tables.length;
    const coverageIndex =
      totalPhysicalTables > 0
        ? Math.round((activeDeployedTablesCount / totalPhysicalTables) * 100)
        : 0;

    // Top Menu Distribution: QRMenu with highest volume of bound live locations
    const menuCounts = new Map<number, number>();
    for (const l of locations) {
      if (l.status === 'active' && l.qr_menu_id) {
        menuCounts.set(l.qr_menu_id, (menuCounts.get(l.qr_menu_id) || 0) + 1);
      }
    }

    let topMenuId: number | null = null;
    let maxMenuCount = 0;
    menuCounts.forEach((count, menuId) => {
      if (count > maxMenuCount) {
        maxMenuCount = count;
        topMenuId = menuId;
      }
    });

    const topMenuRef = topMenuId ? menus.find((m) => m.id === topMenuId) : null;
    const topMenuName = topMenuRef ? topMenuRef.name : (topMenuId ? `Menu #${topMenuId}` : 'None');

    return {
      total,
      active,
      activeDeployedTablesCount,
      totalPhysicalTables,
      coverageIndex,
      topMenuName,
      topMenuCount: maxMenuCount,
    };
  }, [locations, tables, menus]);

  // Location Type Pill Filter Toggle
  const toggleTypeFilter = (type: QRMenuType) => {
    setSelectedTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const clearTypeFilters = () => {
    setSelectedTypeFilters(new Set());
  };

  // Status Checkbox Filter Toggle
  const toggleStatusCheckbox = (st: QRLocationStatus) => {
    setSelectedStatusSet((prev) => {
      const next = new Set(prev);
      if (next.has(st)) {
        if (next.size > 1) {
          next.delete(st);
        }
      } else {
        next.add(st);
      }
      return next;
    });
  };

  // Multi-Filtered Deployments
  const filteredDeployments = useMemo(() => {
    return locations.filter((loc) => {
      // 1. Universal Search (name, table number, destination qr_code_url, #QR-LOC-id)
      const query = searchTerm.trim().toLowerCase();
      const matchSearch =
        query === '' ||
        loc.name.toLowerCase().includes(query) ||
        `#qr-loc-${loc.id}`.includes(query) ||
        (loc.qr_code_url && loc.qr_code_url.toLowerCase().includes(query)) ||
        (loc.qrMenu?.name && loc.qrMenu.name.toLowerCase().includes(query)) ||
        (loc.table?.number && loc.table.number.toLowerCase().includes(query));

      // 2. QR Menu Filter
      const matchMenu = menuFilter === 'ALL' || loc.qr_menu_id === parseInt(menuFilter, 10);

      // 3. Location Type Filter (Multi-select pills)
      const matchType =
        selectedTypeFilters.size === 0 || selectedTypeFilters.has(loc.location_type as QRMenuType);

      // 4. Table Zone Filter
      let matchZone = true;
      if (zoneFilter !== 'ALL') {
        const tableZone = loc.table?.zone_name || (loc.table_id ? tableMap.get(loc.table_id)?.zone_name : undefined);
        matchZone = tableZone === zoneFilter;
      }

      // 5. Status Checkbox Filter
      const matchStatus = selectedStatusSet.has(loc.status);

      return matchSearch && matchMenu && matchType && matchZone && matchStatus;
    });
  }, [locations, searchTerm, menuFilter, selectedTypeFilters, zoneFilter, selectedStatusSet, tableMap]);

  // Batch Selection Handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDeployments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDeployments.map((l) => l.id)));
    }
  };

  const toggleSelectId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleOpenCreateDrawer = () => {
    setEditingLocation(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEditDrawer = (loc: QRLocation) => {
    setEditingLocation(loc);
    setIsDrawerOpen(true);
  };

  const handleSavedLocation = (result: QRLocation | QRLocation[]) => {
    if (Array.isArray(result)) {
      setLocations((prev) => {
        const resultIds = new Set(result.map((r) => r.id));
        const filtered = prev.filter((p) => !resultIds.has(p.id));
        return [...result, ...filtered];
      });
    } else {
      setLocations((prev) => {
        const index = prev.findIndex((l) => l.id === result.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = result;
          return updated;
        }
        return [result, ...prev];
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm(`Are you sure you want to archive / remove deployment #QR-LOC-${id}?`)) {
      try {
        await deleteQRLocation(id);
        await loadData();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to delete deployment.');
      }
    }
  };

  const handleCopyUrl = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedUrlId(id);
    setCopiedToast({ message: 'URL copied to clipboard!', url });
    setTimeout(() => setCopiedUrlId(null), 2500);
    setTimeout(() => setCopiedToast(null), 3000);
  };

  const handleDownloadPng = async (loc: QRLocation) => {
    try {
      const pngDataUrl = await convertSvgToHighResPngDataUrl(loc.qr_code_image, 1000, 1000);
      const link = document.createElement('a');
      link.href = pngDataUrl;
      link.download = `QR-LOC-${loc.id}-${loc.name.replace(/\s+/g, '_')}_HighRes.png`;
      link.click();
    } catch {
      alert('Failed to generate PNG export.');
    }
  };

  // Selected locations for batch export
  const selectedLocationsList = useMemo(() => {
    return locations.filter((l) => selectedIds.has(l.id));
  }, [locations, selectedIds]);

  return (
    <div className="min-h-screen bg-[#fcf9f5] text-[#1d1c17] flex flex-col font-poppins animate-fade-in pb-16">
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Main Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 font-poppins">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ae001a] text-white flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-2xl">rocket_launch</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-[#1d1c17] tracking-tight font-poppins">
                  QR Deployments Workspace
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20 font-poppins flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">qr_code_scanner</span>
                  <span>Operational Footprint</span>
                </span>
              </div>
              <p className="text-xs text-[#5f5e5e] font-medium mt-0.5 font-poppins">
                Audit dining room footprint coverage, inspect table linkages, and monitor live contactless ordering access points.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setIsBatchExportOpen(true)}
                className="px-3.5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl shadow-md transition-colors duration-200 flex items-center gap-2 text-xs font-poppins"
              >
                <span className="material-symbols-outlined text-base">print</span>
                <span>Export Selected ({selectedIds.size})</span>
              </button>
            )}

            <button
              type="button"
              onClick={loadData}
              className="w-10 h-10 rounded-xl bg-white border border-[#e8e2d8] flex items-center justify-center text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 shadow-xs"
              title="Refresh Deployments"
            >
              <span className="material-symbols-outlined text-xl">refresh</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCreateDrawer}
              className="px-4 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-colors duration-200 font-poppins active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">rocket_launch</span>
              <span>Deploy QR Location</span>
            </button>
          </div>
        </div>

        {/* QR Menus Deployment Operational KPI Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-poppins">
          {/* 1. Total Deployed Locations */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm hover:border-[#ae001a]/30 transition-colors duration-200">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Total Deployed Locations
              </span>
              <span className="material-symbols-outlined text-gray-400 text-lg">rocket_launch</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#1d1c17] font-poppins">
              {metrics.total}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-poppins">
              Aggregate registered under merchant
            </div>
          </div>

          {/* 2. Live / Active QR Points */}
          <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:border-emerald-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Live / Active QR Points
              </span>
              <span className="material-symbols-outlined text-[#10b981] text-lg">check_circle</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#10b981] font-poppins">
              {metrics.active}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-poppins">
              Status = &apos;active&apos; deployments
            </div>
          </div>

          {/* 3. Table Coverage Index */}
          <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm hover:border-amber-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Table Coverage Index
              </span>
              <span className="material-symbols-outlined text-[#f59e0b] text-lg">table_restaurant</span>
            </div>
            <div className="text-2xl font-black font-mono text-amber-600 font-poppins">
              {metrics.coverageIndex}%
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-poppins">
              {metrics.activeDeployedTablesCount} of {metrics.totalPhysicalTables} Physical Tables
            </div>
          </div>

          {/* 4. Top Menu Distribution */}
          <div className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm hover:border-purple-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Top Menu Distribution
              </span>
              <span className="material-symbols-outlined text-purple-600 text-lg">restaurant_menu</span>
            </div>
            <div className="text-lg xl:text-xl font-black font-mono text-purple-900 font-poppins truncate" title={metrics.topMenuName}>
              {metrics.topMenuName}
            </div>
            <div className="text-[11px] text-purple-600 mt-0.5 font-poppins truncate">
              {metrics.topMenuCount > 0
                ? `${metrics.topMenuCount} bound live location(s)`
                : 'No active bound menus'}
            </div>
          </div>
        </div>

        {/* Dynamic Multi-Tier Filtering & Universal Search Controls */}
        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-4 shadow-sm flex flex-col gap-4 font-poppins">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Universal Search & Select All */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#1d1c17] bg-[#fef9f1] px-3 py-2 rounded-xl border border-[#e8e2d8]">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredDeployments.length && filteredDeployments.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded text-[#ae001a] focus:ring-[#ae001a]"
                />
                <span className="font-poppins">Select All ({selectedIds.size})</span>
              </label>

              <div className="relative flex-1 md:w-80">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#5f5e5e] text-xl">search</span>
                <input
                  type="text"
                  placeholder="Search name, table, URL or #QR-LOC..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm text-[#1d1c17] placeholder-[#5f5e5e] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] font-poppins"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              {/* QR Menu Filter Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#5f5e5e] flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">restaurant_menu</span>
                  <span>Menu:</span>
                </span>
                <select
                  value={menuFilter}
                  onChange={(e) => setMenuFilter(e.target.value)}
                  aria-label="Filter by QR Menu"
                  className="bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3 py-1.5 text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a] font-poppins"
                >
                  <option value="ALL">All QR Menus</option>
                  {menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Table Zone Filter Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#5f5e5e] flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">layers</span>
                  <span>Zone:</span>
                </span>
                <select
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  aria-label="Filter by Dining Zone"
                  className="bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3 py-1.5 text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a] font-poppins"
                >
                  <option value="ALL">All Dining Zones</option>
                  {availableZones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Mode Switch */}
              <div className="flex items-center bg-[#fef9f1] p-1 rounded-xl border border-[#e8e2d8]">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${
                    viewMode === 'grid' ? 'bg-[#ae001a] text-white' : 'text-[#5f5e5e] hover:text-[#ae001a]'
                  }`}
                  title="Grid View"
                  aria-label="Grid View"
                >
                  <span className="material-symbols-outlined text-lg">grid_view</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${
                    viewMode === 'table' ? 'bg-[#ae001a] text-white' : 'text-[#5f5e5e] hover:text-[#ae001a]'
                  }`}
                  title="Table Directory View"
                  aria-label="Table Directory View"
                >
                  <span className="material-symbols-outlined text-lg">view_list</span>
                </button>
              </div>
            </div>
          </div>

          {/* Location Type Filter: Multi-select pills */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[#e8e2d8]/60 text-xs">
            <span className="font-bold text-[#5f5e5e] shrink-0 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">place</span>
              <span>Location Type:</span>
            </span>
            <button
              type="button"
              onClick={clearTypeFilters}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors duration-200 border ${
                selectedTypeFilters.size === 0
                  ? 'bg-[#ae001a] text-white border-[#ae001a]'
                  : 'bg-[#fef9f1] text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a]'
              }`}
            >
              All Types
            </button>
            {QR_LOCATION_TYPES.map((t) => {
              const isSelected = selectedTypeFilters.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTypeFilter(t)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors duration-200 border ${
                    isSelected
                      ? 'bg-[#ae001a] text-white border-[#ae001a] shadow-xs'
                      : 'bg-[#fef9f1] text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a]'
                  }`}
                >
                  <span className="material-symbols-outlined text-xs">{getLocationTypeIcon(t)}</span>
                  <span>{QR_LOCATION_TYPE_LABELS[t]}</span>
                </button>
              );
            })}
          </div>

          {/* Status Multi-Filter Checkboxes Row */}
          <div className="flex items-center gap-4 pt-2 border-t border-[#e8e2d8]/60 text-xs">
            <span className="font-bold text-[#5f5e5e] flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">toggle_on</span>
              <span>Filter Status:</span>
            </span>
            <div className="flex items-center gap-4 flex-wrap">
              {QR_LOCATION_STATUSES.map((st) => (
                <label key={st} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedStatusSet.has(st)}
                    onChange={() => toggleStatusCheckbox(st)}
                    aria-label={`Status filter ${st}`}
                    className="w-3.5 h-3.5 rounded text-[#ae001a] focus:ring-[#ae001a]"
                  />
                  <span
                    className={`font-bold capitalize px-2 py-0.5 rounded-full text-[11px] border ${
                      st === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : st === 'inactive'
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : st === 'suspended'
                        ? 'bg-orange-50 text-orange-700 border-orange-300'
                        : 'bg-red-50 text-red-700 border-red-300'
                    }`}
                  >
                    {st}
                  </span>
                </label>
              ))}
            </div>
            <span className="text-[11px] text-[#5f5e5e] ml-auto">
              Showing {filteredDeployments.length} of {locations.length} deployments
            </span>
          </div>
        </div>

        {/* Content Body: Loading / Error / Empty / Deployments Grid or Table */}
        {loading ? (
          <div className="bg-white border border-[#e8e2d8] rounded-2xl p-12 text-center text-[#5f5e5e] shadow-sm">
            <span className="material-symbols-outlined text-4xl animate-spin text-[#ae001a]">progress_activity</span>
            <p className="mt-2 text-sm font-semibold">Loading QR Deployments...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-800 flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-red-600">error</span>
            <div className="flex-1">
              <h3 className="font-bold text-sm">Failed to Load QR Deployments</h3>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : filteredDeployments.length === 0 ? (
          <div className="bg-white border border-[#e8e2d8] rounded-2xl p-12 text-center text-[#5f5e5e] shadow-sm">
            <span className="material-symbols-outlined text-5xl text-[#ae001a]/40">search_off</span>
            <h3 className="text-base font-bold text-[#1d1c17] mt-3">No QR Deployments Found</h3>
            <p className="text-xs text-[#5f5e5e] max-w-md mx-auto mt-1">
              No deployments match your current search and multi-tier filter combination. Try adjusting your menu, zone, or status filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setMenuFilter('ALL');
                setZoneFilter('ALL');
                clearTypeFilters();
                setSelectedStatusSet(new Set(['active', 'inactive', 'suspended', 'archived']));
              }}
              className="mt-4 px-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] text-xs font-bold text-[#ae001a] rounded-xl hover:bg-[#ae001a] hover:text-white transition-colors"
            >
              Reset All Filters
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View Mode */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDeployments.map((loc) => {
              const isSelected = selectedIds.has(loc.id);
              const assignedTable = loc.table_id ? tableMap.get(loc.table_id) || loc.table : loc.table;
              const statusBadgeStyle = QR_STATUS_BADGE_STYLES[loc.status] || 'bg-zinc-100 text-zinc-700 border-zinc-200';

              return (
                <div
                  key={loc.id}
                  className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between p-5 relative font-poppins ${
                    isSelected ? 'border-[#ae001a] ring-1 ring-[#ae001a]' : 'border-[#e8e2d8] hover:border-[#ae001a]/40'
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectId(loc.id)}
                          className="w-4 h-4 rounded text-[#ae001a] focus:ring-[#ae001a] cursor-pointer"
                        />
                        <span className="font-mono text-[11px] font-bold text-[#5f5e5e] bg-slate-100 px-2 py-0.5 rounded border border-[#e8e2d8]">
                          #QR-LOC-{loc.id}
                        </span>
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border capitalize ${statusBadgeStyle}`}>
                        {loc.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-[#1d1c17] mt-3 hover:text-[#ae001a] transition-colors duration-200">
                      {loc.name}
                    </h3>

                    {/* QR Code Graphic Thumbnail & Relational Badges */}
                    <div className="flex items-center gap-4 mt-3 p-3 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl">
                      <button
                        type="button"
                        onClick={() => setLightboxLocation(loc)}
                        className="w-14 h-14 bg-white p-1 rounded-lg border border-[#e8e2d8] shadow-xs flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                        title="Click to view QR Lightbox preview"
                      >
                        <div
                          className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                          dangerouslySetInnerHTML={{ __html: loc.qr_code_image }}
                        />
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1d1c17] truncate">
                          <span className="material-symbols-outlined text-sm text-[#ae001a]">restaurant_menu</span>
                          <span className="truncate">{loc.qrMenu?.name || `Menu #${loc.qr_menu_id}`}</span>
                        </div>
                        {loc.qrMenu?.design_theme && (
                          <div className="text-[10px] text-[#5f5e5e] font-medium truncate">
                            🎨 {loc.qrMenu.design_theme}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[11px] text-[#5f5e5e]">
                          <span className="material-symbols-outlined text-sm text-[#ae001a]">table_restaurant</span>
                          <span>
                            {assignedTable
                              ? `Table #${assignedTable.number}${assignedTable.zone_name ? ` (${assignedTable.zone_name})` : ''}`
                              : 'Non-table / Global'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Destination URL Copy Snippet */}
                    <div className="mt-3 flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                      <span className="truncate text-[11px] text-[#5f5e5e] font-mono select-all">
                        {loc.qr_code_url}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(loc.qr_code_url, loc.id)}
                        className="text-[#5f5e5e] hover:text-[#ae001a] p-1 transition-colors"
                        title="Copy Destination URL"
                      >
                        <span className="material-symbols-outlined text-base">
                          {copiedUrlId === loc.id ? 'check' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-[#e8e2d8] flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setExportModalLocation(loc)}
                        className="px-2.5 py-1.5 bg-[#fef9f1] hover:bg-[#ae001a] hover:text-white text-[#1d1c17] rounded-lg border border-[#e8e2d8] transition-colors duration-200 flex items-center gap-1"
                        title="Print Collateral Assets"
                      >
                        <span className="material-symbols-outlined text-sm">print</span>
                        <span>Print</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPng(loc)}
                        className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] rounded-lg hover:bg-[#fef9f1] transition-colors"
                        title="Download High-Res PNG"
                      >
                        <span className="material-symbols-outlined text-base">download_for_offline</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditDrawer(loc)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#1d1c17] rounded-lg transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(loc.id)}
                        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Deployment"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table Directory View Mode */
          <div className="bg-white border border-[#e8e2d8] rounded-2xl shadow-sm overflow-hidden font-poppins">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#fef9f1] border-b border-[#e8e2d8] text-[#5f5e5e] uppercase text-[10px] font-bold tracking-wider">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredDeployments.length && filteredDeployments.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded text-[#ae001a]"
                      />
                    </th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Deployment Name</th>
                    <th className="py-3 px-4">Menu Association</th>
                    <th className="py-3 px-4">Physical Table & Zone</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Destination URL</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8]/60">
                  {filteredDeployments.map((loc) => {
                    const isSelected = selectedIds.has(loc.id);
                    const assignedTable = loc.table_id ? tableMap.get(loc.table_id) || loc.table : loc.table;
                    const statusBadgeStyle = QR_STATUS_BADGE_STYLES[loc.status] || 'bg-zinc-100 text-zinc-700 border-zinc-200';

                    return (
                      <tr
                        key={loc.id}
                        className={`hover:bg-[#fcf9f5] transition-colors duration-200 ${
                          isSelected ? 'bg-red-50/30' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectId(loc.id)}
                            className="w-4 h-4 rounded text-[#ae001a]"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-[#5f5e5e]">
                          #QR-LOC-{loc.id}
                        </td>
                        <td className="py-3 px-4 font-bold text-[#1d1c17] flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLightboxLocation(loc)}
                            className="w-8 h-8 rounded border border-[#e8e2d8] bg-white p-0.5 shrink-0 hover:scale-110 transition-transform"
                            title="Preview QR Code"
                          >
                            <div
                              className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                              dangerouslySetInnerHTML={{ __html: loc.qr_code_image }}
                            />
                          </button>
                          <span>{loc.name}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#1d1c17]">{loc.qrMenu?.name || `#QRM-${loc.qr_menu_id}`}</div>
                          {loc.qrMenu?.design_theme && (
                            <div className="text-[10px] text-[#5f5e5e]">🎨 {loc.qrMenu.design_theme}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {assignedTable ? (
                            <div>
                              <span className="font-bold text-[#1d1c17]">Table #{assignedTable.number}</span>
                              {assignedTable.zone_name && (
                                <span className="block text-[10px] text-[#5f5e5e]">{assignedTable.zone_name}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#5f5e5e] italic">Non-table / Global</span>
                          )}
                        </td>
                        <td className="py-3 px-4 capitalize text-[#5f5e5e]">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">{getLocationTypeIcon(loc.location_type)}</span>
                            <span>{QR_LOCATION_TYPE_LABELS[loc.location_type as QRMenuType] || loc.location_type}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${statusBadgeStyle}`}>
                            {loc.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#5f5e5e] max-w-[200px] truncate">
                          <button
                            type="button"
                            onClick={() => handleCopyUrl(loc.qr_code_url, loc.id)}
                            className="flex items-center gap-1 hover:text-[#ae001a] text-left truncate w-full"
                            title="Copy URL"
                          >
                            <span className="material-symbols-outlined text-xs">
                              {copiedUrlId === loc.id ? 'check' : 'content_copy'}
                            </span>
                            <span className="truncate">{loc.qr_code_url}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setExportModalLocation(loc)}
                              className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] rounded hover:bg-[#fef9f1]"
                              title="Print Collateral"
                            >
                              <span className="material-symbols-outlined text-base">print</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPng(loc)}
                              className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] rounded hover:bg-[#fef9f1]"
                              title="Download PNG"
                            >
                              <span className="material-symbols-outlined text-base">download_for_offline</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditDrawer(loc)}
                              className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] rounded hover:bg-[#fef9f1]"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(loc.id)}
                              className="p-1.5 text-red-600 hover:text-red-800 rounded hover:bg-red-50"
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
      </div>

      {/* Side Drawer Modal: Deployment Creation & Modification */}
      <QRLocationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        editingLocation={editingLocation}
        merchantId={activeMerchantId}
        locations={locations}
        menus={menus}
        tables={tables}
        onSaved={handleSavedLocation}
      />

      {/* Lightbox Preview Modal */}
      {lightboxLocation &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setLightboxLocation(null)}
          >
            <div
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative flex flex-col items-center text-center font-poppins"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="QR Code Lightbox Preview"
            >
              <button
                type="button"
                onClick={() => setLightboxLocation(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 p-1"
                title="Close Lightbox"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>

              <div className="w-12 h-12 rounded-2xl bg-[#ae001a]/10 text-[#ae001a] flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-2xl">qr_code_2</span>
              </div>

              <h3 className="font-bold text-lg text-[#1d1c17]">{lightboxLocation.name}</h3>
              <p className="text-xs text-[#5f5e5e] font-mono mt-0.5">#QR-LOC-{lightboxLocation.id}</p>

              <div className="w-64 h-64 my-4 p-3 bg-white rounded-2xl border-2 border-[#e8e2d8] shadow-inner flex items-center justify-center">
                <div
                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: lightboxLocation.qr_code_image }}
                />
              </div>

              <p className="text-[11px] font-mono text-[#5f5e5e] bg-slate-100 p-2 rounded-xl break-all w-full border border-slate-200">
                {lightboxLocation.qr_code_url}
              </p>

              <div className="flex items-center gap-2 w-full mt-4">
                <button
                  type="button"
                  onClick={() => handleCopyUrl(lightboxLocation.qr_code_url, lightboxLocation.id)}
                  className="flex-1 py-2.5 bg-[#fef9f1] hover:bg-[#ae001a] hover:text-white border border-[#e8e2d8] rounded-xl text-xs font-bold text-[#1d1c17] transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  <span>Copy URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPng(lightboxLocation)}
                  className="flex-1 py-2.5 bg-[#ae001a] hover:bg-[#900015] text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">download_for_offline</span>
                  <span>Save PNG</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Print Collateral Modal for Single Location */}
      {exportModalLocation &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-poppins"
            onClick={() => setExportModalLocation(null)}
          >
            <div
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl relative font-poppins"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Print Asset Controller"
            >
              <div className="flex items-center justify-between border-b border-[#e8e2d8] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ae001a] text-xl">print</span>
                  <h3 className="font-bold text-base text-[#1d1c17]">Print & Asset Export Controller</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setExportModalLocation(null)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-[#5f5e5e] uppercase">Target Template</label>
                  <div className="grid grid-cols-3 gap-2 mt-1.5">
                    {(['acrylic', 'sticker', 'tentCard'] as const).map((tmpl) => (
                      <button
                        key={tmpl}
                        type="button"
                        onClick={() => setPrintTemplate(tmpl)}
                        className={`py-2 px-2 text-center rounded-xl text-xs font-bold border transition-colors ${
                          printTemplate === tmpl
                            ? 'bg-[#ae001a] text-white border-[#ae001a]'
                            : 'bg-[#fef9f1] text-[#5f5e5e] border-[#e8e2d8]'
                        }`}
                      >
                        {tmpl === 'acrylic' ? 'Table Acrylic (4" x 6")' : tmpl === 'sticker' ? 'Table Sticker (8x8cm)' : 'Tent Card (A6)'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-[#fef9f1] border border-[#e8e2d8] rounded-2xl flex flex-col items-center text-center">
                  <div className="w-36 h-36 bg-white p-2 rounded-xl border border-[#e8e2d8] shadow-xs flex items-center justify-center">
                    <div
                      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                      dangerouslySetInnerHTML={{ __html: exportModalLocation.qr_code_image }}
                    />
                  </div>
                  <h4 className="font-bold text-sm text-[#1d1c17] mt-3">{exportModalLocation.name}</h4>
                  <p className="text-[11px] text-[#5f5e5e]">
                    {exportModalLocation.qrMenu?.name || 'Assigned QR Menu'}
                  </p>
                  <p className="text-[10px] text-[#ae001a] font-bold mt-1 uppercase tracking-wider">
                    Escanea para ordenar
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadPng(exportModalLocation)}
                    className="flex-1 py-2.5 bg-[#ae001a] hover:bg-[#900015] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">download_for_offline</span>
                    <span>High-Res PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([exportModalLocation.qr_code_image], { type: 'image/svg+xml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `QR-LOC-${exportModalLocation.id}-Vector.svg`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">code</span>
                    <span>Vector SVG</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Batch Export Package Modal */}
      {isBatchExportOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-poppins"
            onClick={() => setIsBatchExportOpen(false)}
          >
            <div
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl relative font-poppins"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Batch Asset Controller"
            >
              <div className="flex items-center justify-between border-b border-[#e8e2d8] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-700 text-2xl">print</span>
                  <div>
                    <h3 className="font-bold text-base text-[#1d1c17]">Batch Print & Asset Export Package</h3>
                    <p className="text-xs text-[#5f5e5e]">{selectedLocationsList.length} items ready for bulk generation</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBatchExportOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {selectedLocationsList.map((l) => (
                  <div key={l.id} className="p-2.5 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-bold">#QR-LOC-{l.id}</span>
                      <span className="font-bold text-[#1d1c17]">{l.name}</span>
                    </div>
                    <span className="text-[10px] text-[#ae001a] font-bold">Escanea para ordenar</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    alert(`Starting batch export for ${selectedLocationsList.length} cards...`);
                    setIsBatchExportOpen(false);
                  }}
                  className="flex-1 py-3 bg-[#ae001a] hover:bg-[#900015] text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">print</span>
                  <span>Print All Cards</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Instant Toast Notification on Copy */}
      {copiedToast &&
        createPortal(
          <div className="fixed top-6 right-6 z-50 bg-[#222222] text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-poppins border border-emerald-500/30 animate-fade-in">
            <span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
            <div>
              <p className="font-bold">{copiedToast.message}</p>
              <p className="text-[10px] text-zinc-400 font-mono truncate max-w-xs">{copiedToast.url}</p>
            </div>
          </div>,
          document.body
        )}

      {/* Persistent QR Code System Navigation Hub Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <QRCodeNavHubBar
          activeModule="deployments"
          onNavigate={(target) => {
            if (onNavigate) {
              onNavigate(target);
            }
          }}
        />
      </div>
    </div>
  );
};

export default QRDeploymentsView;
