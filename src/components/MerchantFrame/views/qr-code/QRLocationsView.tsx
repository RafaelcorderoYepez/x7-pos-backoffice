import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  QRLocation,
  QRLocationStatus,
  QRMenuRef,
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

interface QRLocationsViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

export const QRLocationsView: React.FC<QRLocationsViewProps> = ({
  merchantId,
}) => {
  const [locations, setLocations] = useState<QRLocation[]>([]);
  const [menus, setMenus] = useState<QRMenuRef[]>([]);
  const [tables, setTables] = useState<TableRef[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search, Multi-Filter & View Controls
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [menuFilter, setMenuFilter] = useState<string>('ALL');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
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
      if (locsRes.status === 'fulfilled') setLocations(locsRes.value);
      if (menusRes.status === 'fulfilled') setMenus(menusRes.value);
      if (tablesRes.status === 'fulfilled') setTables(tablesRes.value);

      if (locsRes.status === 'rejected') {
        setError(locsRes.reason?.message || 'Failed to load QR Locations directory.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load QR Locations directory.');
    } finally {
      setLoading(false);
    }
  }, [activeMerchantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open side drawer for creation
  const handleOpenCreateDrawer = () => {
    setEditingLocation(null);
    setIsDrawerOpen(true);
  };

  // Open side drawer for editing
  const handleOpenEditDrawer = (loc: QRLocation) => {
    setEditingLocation(loc);
    setIsDrawerOpen(true);
  };

  // State synchronization upon saving from drawer (single or batch)
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
    if (confirm(`Are you sure you want to archive / remove QR Location #QR-LOC-${id}?`)) {
      try {
        await deleteQRLocation(id);
        await loadData();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to delete QR Location.');
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

  // Batch Selection Handlers
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

  // Map of tableId -> TableRef for quick lookup of zone_name
  const tableMap = useMemo(() => {
    const map = new Map<number, TableRef>();
    for (const t of tables) map.set(t.id, t);
    return map;
  }, [tables]);

  const availableZones = useMemo(() => {
    const zoneSet = new Set<string>();
    for (const t of tables) if (t.zone_name) zoneSet.add(t.zone_name);
    for (const l of locations) if (l.table?.zone_name) zoneSet.add(l.table.zone_name);
    return Array.from(zoneSet).sort();
  }, [tables, locations]);

  // Multi-Filtered locations list (Search across name, ID, menu name, physical table number)
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      // Universal Search (location name, #QR-LOC-id, menu name, table number)
      const query = searchTerm.trim().toLowerCase();
      const table = (loc.table_id ? tableMap.get(loc.table_id) : undefined) || loc.table;
      const tableNum = loc.table?.number || table?.number;
      const matchSearch =
        query === '' ||
        loc.name.toLowerCase().includes(query) ||
        `#qr-loc-${loc.id}`.includes(query) ||
        (loc.qrMenu?.name && loc.qrMenu.name.toLowerCase().includes(query)) ||
        (tableNum && tableNum.toLowerCase().includes(query));

      // QR Menu Filter
      const matchMenu = menuFilter === 'ALL' || loc.qr_menu_id === parseInt(menuFilter, 10);

      // Location Type Filter
      const matchType = typeFilter === 'ALL' || loc.location_type === typeFilter;

      // Table Zone Filter
      let matchZone = true;
      if (zoneFilter !== 'ALL') {
        const tableZone = loc.table?.zone_name || (loc.table_id ? tableMap.get(loc.table_id)?.zone_name : undefined);
        matchZone = tableZone === zoneFilter;
      }

      // Status Checkboxes Filter
      const matchStatus = selectedStatusSet.has(loc.status);

      return matchSearch && matchMenu && matchType && matchZone && matchStatus;
    });
  }, [locations, searchTerm, menuFilter, typeFilter, zoneFilter, selectedStatusSet, tableMap]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLocations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLocations.map((l) => l.id)));
    }
  };

  // Selected locations for batch export
  const selectedLocationsList = useMemo(() => {
    return locations.filter((l) => selectedIds.has(l.id));
  }, [locations, selectedIds]);

  // Operational KPI Summary Metrics (Live Header Tallies & Deployment Coverage)
  const metrics = useMemo(() => {
    const total = locations.length;
    const active = locations.filter((l) => l.status === 'active').length;
    const tableLinked = locations.filter((l) => l.table_id !== null && l.table_id !== undefined && l.table_id > 0).length;
    const virtualPts = locations.filter((l) => l.table_id === null || l.table_id === undefined || l.table_id === 0).length;

    // Table Coverage Index: (Active Deployed Tables / Total Physical Merchant Tables) * 100
    const activeDeployedTableIds = new Set<number>();
    for (const l of locations) {
      if (l.status === 'active' && l.table_id && l.table_id > 0) {
        activeDeployedTableIds.add(l.table_id);
      }
    }
    const activeDeployedTables = activeDeployedTableIds.size;
    const totalPhysicalTables = tables.length;
    const coverageIndex =
      totalPhysicalTables > 0 ? Math.round((activeDeployedTables / totalPhysicalTables) * 100) : 0;

    // Top Menu Distribution: QRMenu with highest volume of bound live locations
    const menuCounts = new Map<number, number>();
    for (const l of locations) {
      if (l.status === 'active' && l.qr_menu_id) {
        menuCounts.set(l.qr_menu_id, (menuCounts.get(l.qr_menu_id) || 0) + 1);
      }
    }
    let topMenuId: number | null = null;
    let topMenuCount = 0;
    menuCounts.forEach((count, mId) => {
      if (count > topMenuCount) {
        topMenuCount = count;
        topMenuId = mId;
      }
    });
    const topMenuRef = topMenuId ? menus.find((m) => m.id === topMenuId) : null;
    const topMenuName = topMenuRef ? topMenuRef.name : (topMenuId ? `Menu #${topMenuId}` : 'None');

    return {
      total,
      active,
      tableLinked,
      virtualPts,
      activeDeployedTables,
      totalPhysicalTables,
      coverageIndex,
      topMenuName,
      topMenuCount,
    };
  }, [locations, tables, menus]);

  // PNG High-Res Exporter
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

  return (
    <div className="min-h-screen bg-[#fcf9f5] text-[#1d1c17] flex flex-col font-poppins animate-fade-in">
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Main Workspace Header (Theme: Black, White, Red #ae001a, Poppins Font) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 font-poppins">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ae001a] text-white flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-2xl">qr_code_2</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-[#1d1c17] tracking-tight font-poppins">
                  QR Location Management
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20 font-poppins">
                  Live Deployment Engine
                </span>
              </div>
              <p className="text-xs text-[#5f5e5e] font-medium mt-0.5 font-poppins">
                Monitor active QR deployment points, filter locations by menu or table assignment, and export high-res print assets.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {selectedIds.size > 0 && (
              <button
                onClick={() => setIsBatchExportOpen(true)}
                className="px-3.5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl shadow-md transition-colors duration-200 flex items-center gap-2 text-xs font-poppins"
              >
                <span className="material-symbols-outlined text-base">print</span>
                <span>Export Selected ({selectedIds.size})</span>
              </button>
            )}

            <button
              onClick={loadData}
              className="w-10 h-10 rounded-xl bg-white border border-[#e8e2d8] flex items-center justify-center text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 shadow-xs"
              title="Refresh Directory"
            >
              <span className="material-symbols-outlined text-xl">refresh</span>
            </button>
            <button
              onClick={handleOpenCreateDrawer}
              className="px-4 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-colors duration-200 font-poppins active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add_location_alt</span>
              <span>Configure QR Location</span>
            </button>
          </div>
        </div>

        {/* QR Location Operational KPI Summary Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Card 1: Total QR Locations */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm hover:border-[#ae001a]/30 transition-colors duration-200">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Total QR Locations</span>
              <span className="material-symbols-outlined text-gray-400 text-lg">qr_code_2</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#1d1c17] font-poppins">{metrics.total}</div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-poppins">Total Deployed Locations</div>
          </div>

          {/* Card 2: Active QR Access Points */}
          <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:border-emerald-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Active QR Points</span>
              <span className="material-symbols-outlined text-[#10b981] text-lg">check_circle</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#10b981] font-poppins">{metrics.active}</div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-poppins">Active QR Access Points</div>
          </div>

          {/* Card 3: Table Coverage Index */}
          <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm hover:border-amber-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Coverage Index</span>
              <span className="material-symbols-outlined text-[#f59e0b] text-lg">table_restaurant</span>
            </div>
            <div className="text-2xl font-black font-mono text-amber-600 font-poppins">{metrics.coverageIndex}%</div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-poppins">
              {metrics.activeDeployedTables} of {metrics.totalPhysicalTables} Tables
            </div>
          </div>

          {/* Card 4: Top Menu Distribution */}
          <div className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm hover:border-purple-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Top Menu Dist.</span>
              <span className="material-symbols-outlined text-purple-600 text-lg">restaurant_menu</span>
            </div>
            <div className="text-lg font-black font-mono text-purple-900 font-poppins truncate" title={metrics.topMenuName}>
              {metrics.topMenuName}
            </div>
            <div className="text-[11px] text-purple-600 mt-0.5 font-poppins truncate" title={metrics.topMenuCount > 0 ? `${metrics.topMenuCount} bound live location(s)` : 'No active bound menus'}>
              {metrics.topMenuCount > 0 ? `${metrics.topMenuCount} bound live location(s)` : 'No active bound menus'}
            </div>
          </div>

          {/* Card 5: Table-Linked Locations */}
          <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-sm hover:border-blue-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-blue-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Table-Linked</span>
              <span className="material-symbols-outlined text-blue-600 text-lg">pin_drop</span>
            </div>
            <div className="text-2xl font-black font-mono text-blue-900 font-poppins">{metrics.tableLinked}</div>
            <div className="text-[11px] text-blue-600 mt-0.5 font-poppins">Table-Linked Locations</div>
          </div>

          {/* Card 6: Virtual Access Points */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm bg-gradient-to-br from-white to-amber-50/30 hover:border-[#ae001a]/30 transition-colors duration-200">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Virtual Access</span>
              <span className="material-symbols-outlined text-amber-600 text-lg">devices</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#ae001a] font-poppins">{metrics.virtualPts}</div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-poppins">Virtual Access Points</div>
          </div>
        </div>

        {/* Dynamic Multi-Filter Bar & Search Controls */}
        <div className="bg-white border border-[#e8e2d8] rounded-2xl p-4 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Universal Search & Select All */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#1d1c17] bg-[#fef9f1] px-3 py-2 rounded-xl border border-[#e8e2d8]">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredLocations.length && filteredLocations.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded text-[#ae001a] focus:ring-[#ae001a]"
                />
                <span className="font-poppins">Select All ({selectedIds.size})</span>
              </label>

              <div className="relative flex-1 md:w-80">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#5f5e5e] text-xl">search</span>
                <input
                  type="text"
                  placeholder="Search location name or table number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm text-[#1d1c17] placeholder-[#5f5e5e] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] font-poppins"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              {/* QR Menu Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#5f5e5e]">QR Menu:</span>
                <select
                  value={menuFilter}
                  onChange={(e) => setMenuFilter(e.target.value)}
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

              {/* Table Zone Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#5f5e5e]">Zone:</span>
                <select
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
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

              {/* Location Type Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#5f5e5e]">Type:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3 py-1.5 text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a] font-poppins"
                >
                  <option value="ALL">All Types</option>
                  {QR_LOCATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QR_LOCATION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Mode Switch */}
              <div className="flex items-center bg-[#fef9f1] p-1 rounded-xl border border-[#e8e2d8]">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${viewMode === 'grid' ? 'bg-[#ae001a] text-white' : 'text-[#5f5e5e] hover:text-[#ae001a]'
                    }`}
                  title="Grid View"
                >
                  <span className="material-symbols-outlined text-lg">grid_view</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${viewMode === 'table' ? 'bg-[#ae001a] text-white' : 'text-[#5f5e5e] hover:text-[#ae001a]'
                    }`}
                  title="Table Directory View"
                >
                  <span className="material-symbols-outlined text-lg">view_list</span>
                </button>
              </div>
            </div>
          </div>

          {/* Status Checkboxes Row */}
          <div className="flex items-center gap-4 pt-2 border-t border-[#e8e2d8]/60 text-xs">
            <span className="font-bold text-[#5f5e5e]">Filter Status:</span>
            <div className="flex items-center gap-4 flex-wrap">
              {QR_LOCATION_STATUSES.map((st) => {
                const checked = selectedStatusSet.has(st);
                const style = QR_STATUS_BADGE_STYLES[st];
                return (
                  <label key={st} className="flex items-center gap-1.5 cursor-pointer font-semibold select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStatusCheckbox(st)}
                      className="w-3.5 h-3.5 rounded text-[#ae001a] focus:ring-[#ae001a]"
                    />
                    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${style.bg}`}>
                      {style.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        {loading ? (
          <div className="py-20 text-center space-y-3 bg-white border border-[#e8e2d8] rounded-2xl">
            <div className="inline-block w-10 h-10 border-4 border-[#ae001a] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[#5f5e5e] text-sm font-medium">Loading QR Locations & relational entities...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-red-600">error</span>
            <p className="text-red-700 font-semibold">{error}</p>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-800 rounded-xl text-sm font-medium border border-red-600/40"
            >
              Retry Loading
            </button>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="bg-white border border-[#e8e2d8] rounded-2xl p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#fef9f1] border border-[#e8e2d8] flex items-center justify-center mx-auto text-[#5f5e5e]">
              <span className="material-symbols-outlined text-3xl">qr_code_scanner</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1d1c17] font-poppins">No QR Locations Found</h3>
              <p className="text-[#5f5e5e] text-sm max-w-md mx-auto mt-1">
                No QR location access points match your current search terms or filter selection.
              </p>
            </div>
            <button
              onClick={handleOpenCreateDrawer}
              className="px-4 py-2.5 bg-[#ae001a] text-white font-bold rounded-xl text-sm shadow-md hover:bg-[#900015] transition-colors duration-200"
            >
              Configure New Access Point
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLocations.map((loc) => {
              const statusConfig = QR_STATUS_BADGE_STYLES[loc.status];
              const isSelected = selectedIds.has(loc.id);

              return (
                <div
                  key={loc.id}
                  className={`bg-white border rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all duration-200 group relative ${isSelected ? 'border-[#ae001a] ring-2 ring-[#ae001a]/20 bg-red-50/10' : 'border-[#e8e2d8] hover:border-[#ae001a]/50'
                    }`}
                >
                  <div>
                    {/* Top Bar: Checkbox, Anchor Badge & Status Pill */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectId(loc.id)}
                          className="w-4 h-4 rounded text-[#ae001a] focus:ring-[#ae001a] cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenEditDrawer(loc)}
                          className="px-2.5 py-1 bg-[#fef9f1] border border-[#e8e2d8] rounded-lg text-xs font-mono font-bold text-[#ae001a] hover:bg-[#ae001a]/10 hover:border-[#ae001a] transition-colors cursor-pointer"
                          title="Open Configuration Drawer"
                        >
                          #QR-LOC-{loc.id}
                        </button>
                      </div>

                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${statusConfig.bg} flex items-center gap-1.5`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusConfig.hex }} />
                        <span>{statusConfig.text}</span>
                        <span className="text-[10px] opacity-75 font-normal">({statusConfig.subtext})</span>
                      </span>
                    </div>

                    {/* Location Identity (Name + Type Icon) */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="material-symbols-outlined text-[#ae001a] text-xl shrink-0">
                        {getLocationTypeIcon(loc.location_type)}
                      </span>
                      <h3
                        onClick={() => handleOpenEditDrawer(loc)}
                        className="text-lg font-bold text-[#1d1c17] group-hover:text-[#ae001a] transition-colors duration-200 font-poppins cursor-pointer truncate"
                        title={loc.name}
                      >
                        {loc.name}
                      </h3>
                    </div>

                    {/* Location Type Pill & Table Association */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-700 text-xs font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">
                          {getLocationTypeIcon(loc.location_type)}
                        </span>
                        {QR_LOCATION_TYPE_LABELS[loc.location_type]}
                      </span>

                      {(() => {
                        const table = (loc.table_id ? tableMap.get(loc.table_id) : undefined) || loc.table;
                        const tableNum = loc.table?.number || table?.number;
                        const tableZone = loc.table?.zone_name || table?.zone_name;

                        return tableNum ? (
                          <span className="px-2.5 py-0.5 rounded-md bg-[#fef9f1] text-[#1d1c17] text-xs font-semibold flex items-center gap-1.5 border border-[#e8e2d8] font-poppins">
                            <span className="material-symbols-outlined text-sm text-[#ae001a]">table_restaurant</span>
                            <span className="font-mono font-bold text-[#ae001a]">#TBL-{tableNum}</span>
                            <span>Table #{tableNum}</span>
                            {tableZone && (
                              <span className="text-[11px] text-[#5f5e5e]">({tableZone})</span>
                            )}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-[#5f5e5e] text-xs font-semibold flex items-center gap-1 border border-slate-200 font-poppins">
                            <span className="material-symbols-outlined text-sm">devices</span>
                            Non-table / Global
                          </span>
                        );
                      })()}
                    </div>

                    {/* Assigned Menu Pill with Theme Indicator */}
                    <div className="mt-4 pt-3 border-t border-[#e8e2d8] flex items-center justify-between text-xs text-[#5f5e5e] gap-2 flex-wrap">
                      <span className="font-semibold shrink-0">Assigned Menu:</span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className="font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 text-[11px]">
                          #QRM-{loc.qr_menu_id}
                        </span>
                        <span className="text-[#1d1c17] font-bold font-poppins">
                          {loc.qrMenu?.name || `Menu #${loc.qr_menu_id}`}
                        </span>
                        {loc.qrMenu?.design_theme && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                            🎨 {loc.qrMenu.design_theme}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Interactive QR Preview Thumbnail (48x48) & Target URL Action */}
                    <div className="mt-4 bg-[#fef9f1] border border-[#e8e2d8] p-3 rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setLightboxLocation(loc)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setLightboxLocation(loc);
                          }}
                          className="w-12 h-12 min-w-[48px] min-h-[48px] bg-white p-1 rounded-lg border border-[#e8e2d8] cursor-pointer hover:ring-2 hover:ring-[#ae001a] transition-all flex items-center justify-center shrink-0 shadow-xs relative group/qrthumb"
                          title="Click to expand QR Lightbox preview"
                        >
                          <img
                            src={loc.qr_code_image}
                            alt={loc.name}
                            className="w-full h-full object-contain"
                          />
                          <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover/qrthumb:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="material-symbols-outlined text-white text-base">zoom_in</span>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-[#5f5e5e] tracking-wider block">Target URL</span>
                          <span className="text-xs font-mono text-[#1d1c17] truncate block max-w-[190px]" title={loc.qr_code_url}>
                            {loc.qr_code_url}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyUrl(loc.qr_code_url, loc.id)}
                          className="p-1.5 rounded-lg bg-white border border-[#e8e2d8] text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors shadow-2xs"
                          title="Copy Target URL"
                        >
                          <span className="material-symbols-outlined text-base">
                            {copiedUrlId === loc.id ? 'check' : 'content_copy'}
                          </span>
                        </button>
                        <a
                          href={loc.qr_code_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-white border border-[#e8e2d8] text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors shadow-2xs"
                          title="Open Test URL in new tab"
                        >
                          <span className="material-symbols-outlined text-base">open_in_new</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-5 pt-3 border-t border-[#e8e2d8] flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleCopyUrl(loc.qr_code_url, loc.id)}
                      className="text-xs text-[#5f5e5e] hover:text-[#ae001a] flex items-center gap-1 font-mono transition-colors duration-200 font-semibold"
                      title="Copy Dynamic QR Link"
                    >
                      <span className="material-symbols-outlined text-base">
                        {copiedUrlId === loc.id ? 'check' : 'link'}
                      </span>
                      {copiedUrlId === loc.id ? 'Copied!' : 'Copy Link'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExportModalLocation(loc)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[#1d1c17] hover:text-[#ae001a] text-xs font-semibold rounded-lg border border-[#e8e2d8] transition-colors duration-200 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-base">print</span>
                        Print / Asset
                      </button>
                      <button
                        onClick={() => handleOpenEditDrawer(loc)}
                        className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] bg-[#fef9f1] hover:bg-slate-100 rounded-lg transition-colors duration-200 border border-[#e8e2d8]"
                        title="Configure / Edit Location"
                      >
                        <span className="material-symbols-outlined text-base">edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(loc.id)}
                        className="p-1.5 text-[#5f5e5e] hover:text-red-600 bg-[#fef9f1] hover:bg-red-50 rounded-lg transition-colors duration-200 border border-[#e8e2d8]"
                        title="Delete / Archive"
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
          /* TABLE DIRECTORY VIEW */
          <div className="bg-white border border-[#e8e2d8] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[#1d1c17] font-poppins">
                <thead className="bg-[#fef9f1] text-xs uppercase tracking-wider text-[#5f5e5e] border-b border-[#e8e2d8]">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold w-10">Select</th>
                    <th className="py-3.5 px-4 font-semibold">Location Badge & Name</th>
                    <th className="py-3.5 px-4 font-semibold">Assigned Menu</th>
                    <th className="py-3.5 px-4 font-semibold">Table Context</th>
                    <th className="py-3.5 px-4 font-semibold">Location Type</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">QR Code & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8]">
                  {filteredLocations.map((loc) => {
                    const statusConfig = QR_STATUS_BADGE_STYLES[loc.status];
                    const isSelected = selectedIds.has(loc.id);

                    return (
                      <tr key={loc.id} className={`hover:bg-[#fef9f1]/60 transition-colors duration-200 ${isSelected ? 'bg-red-50/20' : ''}`}>
                        <td className="py-4 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectId(loc.id)}
                            className="w-4 h-4 rounded text-[#ae001a] focus:ring-[#ae001a] cursor-pointer"
                          />
                        </td>

                        {/* Location Badge & Name */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleOpenEditDrawer(loc)}
                              className="px-2 py-1 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-mono font-bold text-[#ae001a] hover:bg-[#ae001a]/10 hover:border-[#ae001a] transition-colors cursor-pointer shrink-0"
                              title="Open Location Details"
                            >
                              #QR-LOC-{loc.id}
                            </button>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[#ae001a] text-base shrink-0">
                                  {getLocationTypeIcon(loc.location_type)}
                                </span>
                                <span
                                  onClick={() => handleOpenEditDrawer(loc)}
                                  className="font-bold text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 block font-poppins cursor-pointer"
                                >
                                  {loc.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-[#5f5e5e] font-mono truncate max-w-[200px]" title={loc.qr_code_url}>
                                  {loc.qr_code_url}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyUrl(loc.qr_code_url, loc.id)}
                                  className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors p-0.5"
                                  title="Copy Target URL"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    {copiedUrlId === loc.id ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                                <a
                                  href={loc.qr_code_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors p-0.5"
                                  title="Open Test URL in new tab"
                                >
                                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                                </a>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Assigned Menu with Theme Indicator */}
                        <td className="py-4 px-4 font-semibold text-[#1d1c17]">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                #QRM-{loc.qr_menu_id}
                              </span>
                              <span className="text-xs font-bold text-[#1d1c17]">{loc.qrMenu?.name || `Menu #${loc.qr_menu_id}`}</span>
                            </div>
                            {loc.qrMenu?.design_theme && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-medium w-fit">
                                <span>🎨 {loc.qrMenu.design_theme}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Table Context Tag */}
                        <td className="py-4 px-4">
                          {(() => {
                            const table = (loc.table_id ? tableMap.get(loc.table_id) : undefined) || loc.table;
                            const tableNum = loc.table?.number || table?.number;
                            const tableZone = loc.table?.zone_name || table?.zone_name;

                            return tableNum ? (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-xs text-[#ae001a]">#TBL-{tableNum}</span>
                                  <span className="text-xs font-semibold text-[#1d1c17]">Table #{tableNum}</span>
                                </div>
                                {tableZone && (
                                  <span className="text-[10px] text-[#5f5e5e] font-medium">{tableZone}</span>
                                )}
                              </div>
                            ) : (
                              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-[#5f5e5e] text-xs font-semibold border border-slate-200">
                                Non-table / Global
                              </span>
                            );
                          })()}
                        </td>

                        {/* Location Type Pill */}
                        <td className="py-4 px-4">
                          <span className="px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-700 text-xs font-semibold flex items-center gap-1 w-fit">
                            <span className="material-symbols-outlined text-sm">
                              {getLocationTypeIcon(loc.location_type)}
                            </span>
                            {QR_LOCATION_TYPE_LABELS[loc.location_type]}
                          </span>
                        </td>

                        {/* Status Pill */}
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusConfig.bg} flex items-center gap-1.5 w-fit`}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusConfig.hex }} />
                            <span>{statusConfig.text}</span>
                            <span className="text-[10px] opacity-75 font-normal">({statusConfig.subtext})</span>
                          </span>
                        </td>

                        {/* Actions & Interactive 48x48 QR Thumbnail */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setLightboxLocation(loc)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') setLightboxLocation(loc);
                              }}
                              className="w-12 h-12 min-w-[48px] min-h-[48px] bg-white p-1 rounded-lg border border-[#e8e2d8] cursor-pointer hover:ring-2 hover:ring-[#ae001a] transition-all flex items-center justify-center shrink-0 shadow-xs relative group/tableqr"
                              title="Click to preview QR Lightbox"
                            >
                              <img
                                src={loc.qr_code_image}
                                alt={loc.name}
                                className="w-full h-full object-contain"
                              />
                              <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover/tableqr:opacity-100 flex items-center justify-center transition-opacity">
                                <span className="material-symbols-outlined text-white text-base">zoom_in</span>
                              </div>
                            </div>
                            <button
                              onClick={() => setExportModalLocation(loc)}
                              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[#1d1c17] hover:text-[#ae001a] text-xs font-semibold rounded-lg border border-[#e8e2d8] transition-colors duration-200 flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-base">print</span>
                              Print / Asset
                            </button>
                            <button
                              onClick={() => handleOpenEditDrawer(loc)}
                              className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] bg-[#fef9f1] rounded-lg transition-colors duration-200 border border-[#e8e2d8]"
                              title="Configure Location"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(loc.id)}
                              className="p-1.5 text-[#5f5e5e] hover:text-red-600 bg-[#fef9f1] rounded-lg transition-colors duration-200 border border-[#e8e2d8]"
                              title="Delete Location"
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

      {/* ADD / EDIT DEDICATED LOCATION DRAWER MODAL (POST / PATCH /api/v1/qr-locations) */}
      <QRLocationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        merchantId={activeMerchantId}
        editingLocation={editingLocation}
        locations={locations}
        menus={menus}
        tables={tables}
        onSaved={handleSavedLocation}
      />

      {/* SINGLE PRINT & ASSET EXPORT CONTROLLER MODAL (PNG, SVG, PDF Templates: Acrylic Stand, Table Sticker, Tent Card) */}
      {exportModalLocation && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="bg-white border border-[#e8e2d8] rounded-2xl w-full max-w-lg min-w-[320px] sm:min-w-[480px] shrink-0 shadow-2xl overflow-hidden p-6 space-y-5 text-center my-auto max-h-[90vh] flex flex-col text-[#1d1c17] font-poppins animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e2d8] shrink-0">
              <div className="text-left">
                <h3 className="text-lg font-bold text-[#1d1c17]">Print & Asset Export Controller</h3>
                <p className="text-xs text-[#5f5e5e]">High-Res SVG, PNG & Printable Template Sizes</p>
              </div>
              <button
                onClick={() => setExportModalLocation(null)}
                className="text-[#5f5e5e] hover:text-[#ae001a] p-1 rounded-lg transition-colors duration-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Template Selector */}
            <div className="flex items-center justify-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPrintTemplate('acrylic')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors duration-200 cursor-pointer ${printTemplate === 'acrylic'
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-[#fef9f1] text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a]'
                  }`}
              >
                Table Acrylic (4" x 6")
              </button>
              <button
                type="button"
                onClick={() => setPrintTemplate('sticker')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors duration-200 cursor-pointer ${printTemplate === 'sticker'
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-[#fef9f1] text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a]'
                  }`}
              >
                Table Sticker (8x8cm)
              </button>
              <button
                type="button"
                onClick={() => setPrintTemplate('tentCard')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors duration-200 cursor-pointer ${printTemplate === 'tentCard'
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-[#fef9f1] text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a]'
                  }`}
              >
                Tent Card (A6)
              </button>
            </div>

            {/* Print Card Container */}
            <div className="overflow-y-auto space-y-4 flex-1">
              <div
                id="qr-print-card-single"
                className={`bg-white rounded-2xl text-slate-950 space-y-4 shadow-xl border border-slate-200 mx-auto transition-all duration-200 ${printTemplate === 'sticker'
                    ? 'p-4 max-w-[280px]'
                    : printTemplate === 'tentCard'
                      ? 'p-6 max-w-[360px]'
                      : 'p-6 max-w-[320px]'
                  }`}
              >
                {/* Brand Logo & Name */}
                <div className="flex items-center justify-between border-b pb-3 border-slate-200">
                  <div className="flex items-center gap-2">
                    {exportModalLocation.merchant?.logo_url ? (
                      <img
                        src={exportModalLocation.merchant.logo_url}
                        alt={exportModalLocation.merchant.name}
                        className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#ae001a] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {exportModalLocation.merchant?.name?.charAt(0) || 'X'}
                      </div>
                    )}
                    <span className="text-xs font-bold tracking-widest text-[#ae001a] uppercase truncate max-w-[170px]">
                      {exportModalLocation.merchant?.name || 'X7 POS RESTAURANT'}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono font-bold text-slate-700 shrink-0">
                    #QR-LOC-{exportModalLocation.id}
                  </span>
                </div>

                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 font-poppins">{exportModalLocation.name}</h2>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    {exportModalLocation.table?.number ? (
                      <span className="px-2.5 py-0.5 bg-red-50 text-[#ae001a] border border-red-200 rounded-md text-xs font-mono font-bold">
                        #TBL-{exportModalLocation.table.number} · Dine-In Table #{exportModalLocation.table.number}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium">
                        {QR_LOCATION_TYPE_LABELS[exportModalLocation.location_type]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200">
                  <img
                    src={exportModalLocation.qr_code_image}
                    alt={exportModalLocation.name}
                    className="w-48 h-48 object-contain"
                  />
                </div>

                <div className="text-[11px] text-slate-600 space-y-1">
                  <p className="text-sm font-extrabold text-[#ae001a] uppercase tracking-wide font-poppins">
                    Escanea para ordenar
                  </p>
                  <p className="font-semibold text-slate-800">Scan to View Digital Menu & Order</p>
                  <p className="font-mono text-[10px] text-slate-500 break-all">
                    {exportModalLocation.qr_code_url}
                  </p>
                </div>
              </div>
            </div>

            {/* Export Actions */}
            <div className="grid grid-cols-3 gap-2 pt-2 shrink-0">
              <button
                onClick={() => window.print()}
                className="px-3 py-2.5 bg-[#ae001a] hover:bg-[#900015] text-white font-bold rounded-xl text-xs shadow transition-colors duration-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">print</span>
                Print PDF
              </button>
              <button
                onClick={() => handleDownloadPng(exportModalLocation)}
                className="px-3 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs shadow transition-colors duration-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">image</span>
                High-Res PNG
              </button>
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = exportModalLocation.qr_code_image;
                  link.download = `QR-LOC-${exportModalLocation.id}-${exportModalLocation.name.replace(/\s+/g, '_')}.svg`;
                  link.click();
                }}
                className="px-3 py-2.5 bg-white hover:bg-slate-50 text-[#1d1c17] hover:text-[#ae001a] font-bold rounded-xl text-xs border border-[#e8e2d8] transition-colors duration-200 flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">download</span>
                Vector SVG
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* BATCH EXPORT & PRINT CONTROLLER MODAL */}
      {isBatchExportOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="bg-white border border-[#e8e2d8] rounded-2xl w-full max-w-4xl min-w-[320px] sm:min-w-[640px] shrink-0 shadow-2xl overflow-hidden p-6 space-y-5 my-auto max-h-[90vh] flex flex-col text-[#1d1c17] font-poppins animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e2d8] shrink-0">
              <div>
                <h3 className="text-lg font-bold text-[#1d1c17]">Batch Print & Asset Export Package</h3>
                <p className="text-xs text-[#5f5e5e]">
                  Generating printable layout for {selectedLocationsList.length} selected QR Locations
                </p>
              </div>
              <button
                onClick={() => setIsBatchExportOpen(false)}
                className="text-[#5f5e5e] hover:text-[#ae001a] p-1 rounded-lg transition-colors duration-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Batch Cards Grid Container (Print Layout) */}
            <div className="overflow-y-auto flex-1 p-4 bg-slate-100 rounded-xl space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedLocationsList.map((loc) => (
                  <div
                    key={loc.id}
                    className="bg-white p-4 rounded-xl border border-slate-300 shadow text-center space-y-2 font-poppins"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold border-b pb-1">
                      <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                        {loc.merchant?.logo_url ? (
                          <img
                            src={loc.merchant.logo_url}
                            alt={loc.merchant.name}
                            className="w-4 h-4 rounded-full object-cover inline"
                          />
                        ) : null}
                        <span className="text-[#ae001a] font-bold uppercase truncate">{loc.merchant?.name || 'X7 POS'}</span>
                      </div>
                      <span className="font-mono">#QR-LOC-{loc.id}</span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm truncate">{loc.name}</h4>
                    <p className="text-[11px] font-semibold text-[#ae001a]">
                      {(() => {
                        const table = (loc.table_id ? tableMap.get(loc.table_id) : undefined) || loc.table;
                        const tableNum = loc.table?.number || table?.number;
                        return tableNum ? `#TBL-${tableNum} (Mesa #${tableNum})` : 'Global Access Point';
                      })()}
                    </p>
                    <img src={loc.qr_code_image} alt={loc.name} className="w-32 h-32 mx-auto object-contain" />
                    <p className="text-xs font-bold text-[#ae001a]">Escanea para ordenar</p>
                    <p className="text-[10px] font-mono text-slate-500 truncate">{loc.qr_code_url}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Batch Actions */}
            <div className="flex items-center justify-between pt-2 shrink-0 border-t border-[#e8e2d8]">
              <span className="text-xs text-[#5f5e5e] font-semibold">
                Ready for acrylic stands, stickers & tent cards
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsBatchExportOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-[#1d1c17] hover:text-[#ae001a] font-semibold rounded-xl text-sm border border-[#e8e2d8] transition-colors duration-200 cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-[#ae001a] hover:bg-[#900015] text-white font-bold rounded-xl text-sm shadow-md flex items-center gap-2 transition-colors duration-200 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">print</span>
                  Print All Cards
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* INTERACTIVE QR LIGHTBOX PREVIEW MODAL */}
      {lightboxLocation && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="QR Code Lightbox Preview"
        >
          <div className="bg-white border border-[#e8e2d8] rounded-2xl w-full max-w-md shrink-0 shadow-2xl overflow-hidden p-6 space-y-4 my-auto flex flex-col text-[#1d1c17] font-poppins animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e2d8]">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-[#fef9f1] border border-[#e8e2d8] rounded-lg text-xs font-mono font-bold text-[#ae001a]">
                  #QR-LOC-{lightboxLocation.id}
                </span>
                <span className="text-xs font-bold text-[#5f5e5e] uppercase tracking-wider">Lightbox Preview</span>
              </div>
              <button
                onClick={() => setLightboxLocation(null)}
                className="text-[#5f5e5e] hover:text-[#ae001a] p-1 rounded-lg transition-colors cursor-pointer"
                title="Close Lightbox"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-[#1d1c17]">{lightboxLocation.name}</h3>
              <p className="text-xs text-[#5f5e5e] flex items-center justify-center gap-1.5 flex-wrap">
                <span className="material-symbols-outlined text-sm text-[#ae001a]">
                  {getLocationTypeIcon(lightboxLocation.location_type)}
                </span>
                <span>{QR_LOCATION_TYPE_LABELS[lightboxLocation.location_type]}</span>
                {lightboxLocation.table?.number && (
                  <span className="font-semibold text-slate-700">· Table #{lightboxLocation.table.number} (#TBL-{lightboxLocation.table.number})</span>
                )}
              </p>
            </div>

            {/* Render QR code */}
            <div className="bg-[#fef9f1] p-6 rounded-2xl border border-[#e8e2d8] flex flex-col items-center justify-center space-y-3">
              <img
                src={lightboxLocation.qr_code_image}
                alt={lightboxLocation.name}
                className="w-56 h-56 object-contain drop-shadow-sm bg-white p-2 rounded-xl border border-[#e8e2d8]"
              />
              <div className="text-center space-y-0.5">
                <p className="text-xs font-bold text-[#ae001a] tracking-wide uppercase">
                  {lightboxLocation.merchant?.name || 'X7 POS RESTAURANT'}
                </p>
                <p className="text-[11px] font-semibold text-slate-700">Escanea para ordenar</p>
              </div>
            </div>

            {/* Destination URL Box with 1-click Copy and Test link */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-left">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>Destination Dispatch URL</span>
                <a
                  href={lightboxLocation.qr_code_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ae001a] hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>Test Link</span>
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                </a>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={lightboxLocation.qr_code_url}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-700 select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopyUrl(lightboxLocation.qr_code_url, lightboxLocation.id)}
                  className="px-3 py-1.5 bg-[#ae001a] text-white rounded-lg text-xs font-bold hover:bg-[#900015] transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">
                    {copiedUrlId === lightboxLocation.id ? 'check' : 'content_copy'}
                  </span>
                  <span>{copiedUrlId === lightboxLocation.id ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setExportModalLocation(lightboxLocation);
                  setLightboxLocation(null);
                }}
                className="px-3 py-2 bg-[#ae001a] hover:bg-[#900015] text-white font-bold rounded-xl text-xs shadow flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">print</span>
                Collateral
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPng(lightboxLocation)}
                className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs shadow flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">image</span>
                PNG
              </button>
              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = lightboxLocation.qr_code_image;
                  link.download = `QR-LOC-${lightboxLocation.id}-${lightboxLocation.name.replace(/\s+/g, '_')}.svg`;
                  link.click();
                }}
                className="px-3 py-2 bg-white hover:bg-slate-50 text-[#1d1c17] hover:text-[#ae001a] font-bold rounded-xl text-xs border border-[#e8e2d8] flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">download</span>
                SVG
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* TOAST NOTIFICATION PORTAL */}
      {copiedToast && typeof document !== 'undefined' && createPortal(
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-[10000] bg-[#1d1c17] text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10 animate-fade-in font-poppins"
        >
          <div className="w-8 h-8 rounded-xl bg-[#10b981] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-white text-lg">check</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white">URL copied to clipboard!</p>
            <p className="text-[10px] text-gray-300 font-mono truncate max-w-[280px]">{copiedToast.url}</p>
          </div>
          <button
            type="button"
            onClick={() => setCopiedToast(null)}
            className="text-gray-400 hover:text-white ml-2 p-1 rounded-lg cursor-pointer"
            title="Dismiss notification"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};
