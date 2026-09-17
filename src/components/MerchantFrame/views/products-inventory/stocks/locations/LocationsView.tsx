import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../../lib/auth-storage';
import { StockQuickLinks } from '../StockQuickLinks';
import { EmergencySupportModal } from '../../../../modals/QuickActionModals';
import { TableOptionsMenu, TablePaginationFooter, NoColumnsEmptyState, TableEmptyState, getDensityPadding, type TableDensity } from '../../../../../shared/TableOptionsMenu';

interface StockItem {
  id: number;
  sku?: string;
  quantity: number;
  currentQty?: number;
}

interface Location {
  id: number;
  name: string;
  code?: string | null;
  address?: string;
  isMainStorage?: boolean;
  isActive: boolean;
  items?: StockItem[];
}

interface LocationsViewProps {
  onNavigate?: (view: string) => void;
}

export const LocationsView: React.FC<LocationsViewProps> = ({ onNavigate }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros locales
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Table options state
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true,
    address: true,
    isMainStorage: true,
    status: true,
    actions: true,
  });
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Estados de Cajones Laterales (Drawers)
  const [isFormDrawerOpen, setIsFormDrawerOpen] = useState<boolean>(false);
  const [formDrawerMode, setFormDrawerMode] = useState<'add' | 'edit'>('add');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState<boolean>(false);

  // Location Form Fields (Sprint 24 Story 6)
  const [formName, setFormName] = useState<string>('');
  const [formCode, setFormCode] = useState<string>('');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formIsMainStorage, setFormIsMainStorage] = useState<boolean>(false);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // Avisos y Bloqueos de Seguridad
  const [deactivationError, setDeactivationError] = useState<string | null>(null);

  // State for activation/deactivation confirmation modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmTargetLocation, setConfirmTargetLocation] = useState<Location | null>(null);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Soporte
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  const topRef = useRef<HTMLDivElement | null>(null);
  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  // Auto-scroll al inicio al montar la vista
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  // API data loading (Silent background sync)
  const fetchLocations = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const merchantId = sessionStorage.getItem('x7:branch-context') || '1';

      // 1. Intentar primero la ruta de negocio estricta
      let res = await fetch(`${API_BASE}/v1/inventory/locations?merchantId=${merchantId}`, { headers });

      // 2. Fallback a /locations
      if (!res.ok || res.status === 404 || res.status === 400) {
        const fallbackRes = await fetch(`${API_BASE}/locations`, { headers });
        if (fallbackRes.ok) {
          res = fallbackRes;
        }
      }

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error loading inventory locations');
      }

      const json = await res.json();
      let dataList: Location[] = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
      if (dataList.length > 0 && !dataList.some((l) => l.isMainStorage)) {
        dataList = dataList.map((l, idx) => (idx === 0 ? { ...l, isMainStorage: true } : l));
      }
      setLocations(dataList);
    } catch (err: any) {
      console.error(err);
      if (!silent) setError('Failed to load inventory locations. Please check if the backend is running.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  // Handle isMainStorage toggle: must always have at least one main storage location
  const handleToggleMainStorage = (checked: boolean) => {
    if (!checked) {
      const otherMain = locations.find(
        (l) => l.isMainStorage && String(l.id) !== String(selectedLocation?.id)
      );
      if (!otherMain) {
        // No other main storage location exists, force maintain true
        setFormIsMainStorage(true);
        return;
      }
    }
    setFormIsMainStorage(checked);
  };

  // Open Form Drawer for Creation
  const handleOpenAddDrawer = () => {
    setFormDrawerMode('add');
    setSelectedLocation(null);
    setFormName('');
    setFormCode('');
    setFormAddress('');
    setFormIsMainStorage(locations.length === 0 || !locations.some((l) => l.isMainStorage));
    setFormIsActive(true);
    setDeactivationError(null);
    setIsFormDrawerOpen(true);
  };

  // Open Form Drawer for Editing
  const handleOpenEditDrawer = (e: React.MouseEvent, loc: Location) => {
    e.stopPropagation(); // Evitar Detail Drawer
    setFormDrawerMode('edit');
    setSelectedLocation(loc);
    setFormName(loc.name || '');
    setFormCode(loc.code || '');
    setFormAddress(loc.address || '');
    const hasOtherMain = locations.some(
      (l) => l.isMainStorage && String(l.id) !== String(loc.id)
    );
    setFormIsMainStorage(!!loc.isMainStorage || !hasOtherMain);
    setFormIsActive(loc.isActive !== false);
    setDeactivationError(null);
    setIsFormDrawerOpen(true);
  };

  // Abrir Detail Drawer
  const handleOpenDetailDrawer = (loc: Location) => {
    setSelectedLocation(loc);
    setIsDetailDrawerOpen(true);
  };

  // Check if location possesses active stock balances (> 0)
  const locationHasActiveStock = (loc: Location): boolean => {
    if (!loc.items || loc.items.length === 0) return false;
    return loc.items.some((item) => (item.currentQty ?? item.quantity ?? 0) > 0);
  };

  // Open Confirmation Modal
  const handleOpenConfirmToggle = (e: React.MouseEvent, loc: Location) => {
    e.stopPropagation();
    // Deactivation guard against stock greater than zero (Acceptance Criteria 2)
    if (loc.isActive && locationHasActiveStock(loc)) {
      alert(
        'Cannot deactivate location with active stock balances. Please transfer or adjust remaining inventory to zero first.'
      );
      return;
    }
    setConfirmTargetLocation(loc);
    setToggleError(null);
    setIsConfirmModalOpen(true);
  };

  // Toggle location active/inactive via Modal with Safety Guard
  const executeToggleActive = async () => {
    if (!confirmTargetLocation) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const newIsActive = !confirmTargetLocation.isActive;

      // Guardia contra saldo activo
      if (!newIsActive && locationHasActiveStock(confirmTargetLocation)) {
        throw new Error(
          'Cannot deactivate location with active stock balances. Please transfer or adjust remaining inventory to zero first.'
        );
      }

      let res;
      if (!newIsActive) {
        res = await fetch(`${API_BASE}/locations/${confirmTargetLocation.id}`, {
          method: 'DELETE',
          headers
        });
      } else {
        res = await fetch(`${API_BASE}/locations/${confirmTargetLocation.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ isActive: true })
        });
      }

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error updating location status');
      }

      setLocations((prevLocations) =>
        prevLocations.map((l) =>
          l.id === confirmTargetLocation.id ? { ...l, isActive: newIsActive } : l
        )
      );
      setIsConfirmModalOpen(false);
      setConfirmTargetLocation(null);
    } catch (err: any) {
      console.error(err);
      setToggleError(err.message || 'Error updating location status');
    } finally {
      setIsToggling(false);
    }
  };

  // Submit Mutation (Create / Edit) with Single Main Storage Rule and Deactivation Guard
  const handleSubmitLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeactivationError(null);

    if (!formName.trim()) {
      alert('Location designation name is required.');
      return;
    }

    // Deactivation guard against stock greater than zero (Acceptance Criteria 2)
    if (selectedLocation && selectedLocation.isActive && !formIsActive) {
      if (locationHasActiveStock(selectedLocation)) {
        const lockMsg =
          'Cannot deactivate location with active stock balances. Please transfer or adjust remaining inventory to zero first.';
        setDeactivationError(lockMsg);
        return;
      }
    }

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const merchantId = sessionStorage.getItem('x7:branch-context') || '1';
      let res;

      // If formIsMainStorage is true, uncheck any other main storage for this merchant (Rule 2)
      if (formIsMainStorage) {
        setLocations((prev) =>
          prev.map((l) =>
            String(l.id) === String(selectedLocation?.id)
              ? { ...l, isMainStorage: true }
              : { ...l, isMainStorage: false }
          )
        );
      }

      if (formDrawerMode === 'add') {
        const payload = {
          name: formName.trim(),
          code: formCode.trim() || undefined,
          address: formAddress.trim() || undefined,
          isMainStorage: formIsMainStorage,
          isActive: formIsActive,
        };
        res = await fetch(`${API_BASE}/locations`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      } else if (selectedLocation) {
        const payload = {
          name: formName.trim(),
          code: formCode.trim() || undefined,
          address: formAddress.trim() || undefined,
          isMainStorage: formIsMainStorage,
          isActive: formIsActive
        };
        res = await fetch(`${API_BASE}/locations/${selectedLocation.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(payload)
        });
      }

      if (res && !res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error saving location');
      }
      setIsFormDrawerOpen(false);
      fetchLocations(true);
    } catch (err: any) {
      console.error(err);
      setDeactivationError(err.message || 'Error saving location');
    }
  };

  // Reactive hot filtering by name, code, or address
  const filteredLocations = locations.filter((loc) => {
    const locName = loc.name || '';
    const locCode = loc.code || '';
    const locAddress = loc.address || '';
    const matchesSearch =
      locName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      locCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      locAddress.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Active' && loc.isActive !== false) ||
      (statusFilter === 'Inactive' && loc.isActive === false);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div ref={topRef} />

      {/* 1. Header Card Workspace */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
              location_on
            </span>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            STORAGE LOCATIONS & PHYSICAL HUBS WORKSPACE
          </h2>
          </div>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Manage physical storage areas (RawMaterialLocation), set up primary storage hubs (isMainStorage), and control active operational statuses.
          </p>
        </div>
      </div>

      {/* 2. Multi-criteria Toolbar (Search + Filter + Add Location) */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Row 1: Full-width search */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            placeholder="Search locations by name, code, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter Estandarizado (All Status, Active, Inactive) */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[130px] font-sans text-secondary cursor-pointer"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Add Location Button (Story 6 Criterion 1) */}
            <button
              type="button"
              onClick={handleOpenAddDrawer}
              className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              ADD LOCATION
            </button>

          </div>
        </div>
      </div>

      {/* 3. Locations Grid / Table */}
      {(() => {
        const activeColSpan =
          (visibleColumns.name ? 1 : 0) +
          (visibleColumns.address ? 1 : 0) +
          (visibleColumns.isMainStorage ? 1 : 0) +
          (visibleColumns.status ? 1 : 0) +
          (visibleColumns.actions ? 1 : 0);

        const densityPadding = getDensityPadding(rowDensity);
        const totalPages = Math.ceil(filteredLocations.length / pageSize) || 1;
        const paginatedLocations =
          pageSize === 9999
            ? filteredLocations
            : filteredLocations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

        return (
          <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded-xl shadow-xs">
            <div className="p-4 bg-[#222222] flex justify-between items-center relative">
              <div className="flex items-center gap-3">
                <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
                  STORAGE LOCATIONS DIRECTORY
                </span>
                <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
                  {filteredLocations.length} {filteredLocations.length === 1 ? 'location' : 'locations'}
                </span>
              </div>

              <TableOptionsMenu
                columns={[
                  { key: 'name', label: 'Location Designation & Code' },
                  { key: 'address', label: 'Physical Address' },
                  { key: 'isMainStorage', label: 'Primary Storage Hub' },
                  { key: 'status', label: 'Status' },
                  { key: 'actions', label: 'Actions' },
                ]}
                visibleColumns={visibleColumns}
                onToggleColumn={(key) =>
                  setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                rowDensity={rowDensity}
                onChangeDensity={setRowDensity}
                totalItems={filteredLocations.length}
                pageSize={pageSize}
                onChangePageSize={(s) => {
                  setPageSize(s);
                  setCurrentPage(1);
                }}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onReload={() => fetchLocations()}
                onExportCSV={() => {
                  if (filteredLocations.length === 0) return;
                  const headers = ['Name', 'Code', 'Address', 'Main Storage', 'Status'];
                  const rows = filteredLocations.map((loc) => [
                    `"${(loc.name || '').replace(/"/g, '""')}"`,
                    `"${(loc.code || '').replace(/"/g, '""')}"`,
                    `"${(loc.address || '').replace(/"/g, '""')}"`,
                    loc.isMainStorage ? 'Yes' : 'No',
                    loc.isActive !== false ? 'Active' : 'Inactive'
                  ]);
                  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement('a');
                  link.setAttribute('href', encodedUri);
                  link.setAttribute('download', `storage_locations_${new Date().toISOString().slice(0, 10)}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                onPrint={() => window.print()}
                onCopySummary={() => {
                  const text = `Total Storage Locations: ${filteredLocations.length}`;
                  navigator.clipboard.writeText(text);
                }}
              />
            </div>

            {activeColSpan === 0 ? (
              <NoColumnsEmptyState />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                    <tr>
                      {visibleColumns.name && (
                        <th className={`text-left text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                          Location Designation & Code
                        </th>
                      )}
                      {visibleColumns.address && (
                        <th className={`text-left text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                          Physical Address
                        </th>
                      )}
                      {visibleColumns.isMainStorage && (
                        <th className={`text-center text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                          Primary Storage Hub
                        </th>
                      )}
                      {visibleColumns.status && (
                        <th className={`text-center text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                          Status
                        </th>
                      )}
                      {visibleColumns.actions && (
                        <th className={`text-center text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8] text-sm">
                    {isLoading ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                          <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                            sync
                          </span>
                          <p className="text-secondary text-body-md mt-2 font-sans">Loading storage locations...</p>
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
                            onClick={() => fetchLocations()}
                            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                          >
                            Retry Connection
                          </button>
                        </td>
                      </tr>
                    ) : filteredLocations.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="warehouse"
                        title="No storage locations found"
                        description={
                          searchQuery || statusFilter !== 'All'
                            ? 'No storage locations match your search criteria.'
                            : "Click 'Add Location' to set up storage hubs like Main Warehouse or Kitchen Fridge."
                        }
                      />
                    ) : (
                      paginatedLocations.map((loc) => {
                        const isInactive = loc.isActive === false;
                        return (
                          <tr
                            key={loc.id}
                            onClick={() => handleOpenDetailDrawer(loc)}
                            className={`group transition-colors cursor-pointer ${
                              isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                            }`}
                          >
                            {visibleColumns.name && (
                              <td className={`${densityPadding} flex items-center gap-3`}>
                                <div className={`w-1 h-8 rounded-full ${loc.isMainStorage ? 'bg-amber-500' : 'bg-[#ae001a]'}`} />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className={`font-bold text-[#1d1c17] ${isInactive ? 'line-through' : ''}`}>{loc.name}</p>
                                    {loc.code && (
                                      <span className="font-mono text-[10px] font-bold bg-[#f2ede5] text-[#5f5e5e] px-1.5 py-0.5 rounded border border-[#e8e2d8]">
                                        {loc.code}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            )}
                            {visibleColumns.address && (
                              <td className={`${densityPadding} text-secondary`}>
                                {loc.address || 'N/A'}
                              </td>
                            )}
                            {visibleColumns.isMainStorage && (
                              <td className={`${densityPadding} text-center`}>
                                {loc.isMainStorage ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full border border-amber-300">
                                    ⭐ Main Storage
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-zinc-400 font-mono italic">Secondary</span>
                                )}
                              </td>
                            )}
                            {visibleColumns.status && (
                              <td className={`${densityPadding} text-center`}>
                                <span
                                  className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase ${
                                    loc.isActive !== false
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-zinc-200 text-[#5f5e5e]'
                                  }`}
                                >
                                  {loc.isActive !== false ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            )}
                            {visibleColumns.actions && (
                              <td className={`${densityPadding} text-center`}>
                                <div className="flex justify-center gap-3">
                                  <button
                                    type="button"
                                    onClick={(e) => handleOpenEditDrawer(e, loc)}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                                    title="Edit Location"
                                  >
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleLocationActive(e, loc)}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                                    title={loc.isActive !== false ? 'Deactivate Location' : 'Activate Location'}
                                  >
                                    <span className="material-symbols-outlined text-[20px]">
                                      {loc.isActive !== false ? 'block' : 'check_circle'}
                                    </span>
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

            <TablePaginationFooter
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredLocations.length}
              onPageChange={setCurrentPage}
              onChangePageSize={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* Floating Action Button (FAB) */}
      <button
        type="button"
        onClick={handleOpenAddDrawer}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#d2272f] transition-all transform hover:scale-110 z-50 cursor-pointer"
        title="Add Location"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      {/* Quick Launch Panel (Persistente Sprint 25 Story 4114) */}
      <div className="mt-8">
        <StockQuickLinks current="locations" onNavigate={onNavigate} />
      </div>

      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {/* Portal: Form Drawer (Location Creation and Editing - Story 6 Criterion 1) */}
      {isFormDrawerOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm font-sans">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
              <span className="font-bold text-label-caps uppercase tracking-wider">
                {formDrawerMode === 'add' ? 'Add Storage Location' : 'Edit Storage Location'}
              </span>
              <button
                type="button"
                onClick={() => setIsFormDrawerOpen(false)}
                className="text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmitLocation} className="flex-1 flex flex-col min-h-0">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
                {/* Block alert for deactivation with active stock */}
                {deactivationError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-bold flex items-center gap-2 animate-shake">
                    <span className="material-symbols-outlined text-sm block">lock</span>
                    <span>{deactivationError}</span>
                  </div>
                )}

                {/* Campo Mandatory: Location Designation Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Location Designation Name <span className="text-[#ae001a]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                    placeholder="e.g. Main Warehouse"
                  />
                </div>

                {/* Campo Opcional: Code */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Location Code (SKU/Ref)
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono uppercase"
                    placeholder="e.g. MAIN-01"
                  />
                </div>

                {/* Campo Opcional: Physical Street Address */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Physical Street Address
                  </label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                    placeholder="e.g. 123 Storage Way, Dock 4"
                  />
                </div>

                {/* Single Main Storage Hub Constraint Toggle (Story 6 Criterio 2) */}
                <div className="p-3 bg-[#fef9f1] border border-[#e8e2d8] rounded-lg space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formIsMainStorage}
                      onChange={(e) => handleToggleMainStorage(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
                    <div>
                      <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider block">
                        ⭐ Set as Primary Storage Hub (isMainStorage)
                      </span>
                      <span className="text-[10px] text-secondary leading-tight block">
                        Only one location per merchant can serve as the primary inventory hub.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Status Configuration with Deactivation Guard */}
                <div className="flex flex-col gap-1.5 pt-2">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase mb-1">
                    Status Configuration
                  </label>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-body-md font-bold text-[#1c1b16] cursor-pointer">
                      <input
                        type="radio"
                        name="isActive"
                        checked={formIsActive === true}
                        onChange={() => setFormIsActive(true)}
                        className="text-[#ae001a] focus:ring-[#ae001a] cursor-pointer"
                      />
                      Active Hub
                    </label>
                    <label className="flex items-center gap-2 text-body-md font-bold text-[#1c1b16] cursor-pointer">
                      <input
                        type="radio"
                        name="isActive"
                        checked={formIsActive === false}
                        onChange={() => setFormIsActive(false)}
                        className="text-[#ae001a] focus:ring-[#ae001a] cursor-pointer"
                      />
                      Inactive / Disabled
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-6 pt-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0 bg-[#fefbf6]">
                <button
                  type="button"
                  onClick={() => setIsFormDrawerOpen(false)}
                  className="px-4 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-zinc-100 transition-colors font-sans cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-colors font-sans cursor-pointer"
                >
                  SAVE LOCATION
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}


      {/* Portal: Detail Drawer (Data inspection) */}
      {isDetailDrawerOpen && selectedLocation && createPortal(
        <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 transition-opacity duration-300 animate-fade-in"
            onClick={() => setIsDetailDrawerOpen(false)}
          />

          {/* Drawer Body */}
          <div className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col justify-between border-l border-[#e8e2d8] animate-slide-in">
            {/* Header */}
            <div className="bg-[#222222] px-6 py-5 flex items-center justify-between border-b border-[#333333]">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-xl">store</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-white">
                  LOCATION INSPECTOR
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailDrawerOpen(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Info Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <h2 className="text-xl font-black text-[#1c1b16] tracking-tight">{selectedLocation.name}</h2>
                <span
                  className={`text-[9px] px-2.5 py-0.5 font-bold rounded uppercase inline-block mt-2 ${
                    selectedLocation.isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-zinc-200 text-[#5f5e5e]'
                  }`}
                >
                  {selectedLocation.isActive ? 'Active Node' : 'Inactive / Muted'}
                </span>
              </div>

              <div className="border-t border-[#e8e2d8] pt-5 space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">Physical Address</h4>
                <div className="flex gap-3 items-start">
                  <span className="material-symbols-outlined text-base text-[#5f5e5e] mt-0.5">location_on</span>
                  <span className="text-xs text-[#1c1b16] leading-relaxed">{selectedLocation.address}</span>
                </div>
              </div>

              <div className="border-t border-[#e8e2d8] pt-5 space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">Connected Stock Items</h4>
                <div className="bg-[#222222] p-4 flex justify-between items-center text-white">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#ae001a] text-2xl">box</span>
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-white/50">Stock Balances</span>
                      <span className="text-md font-black">
                        {selectedLocation.items?.length || 0} items configured
                      </span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-white/20 text-3xl">storefront</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-[#f5efe6] border-t border-[#e8e2d8] px-6 py-4 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDetailDrawerOpen(false)}
                className="px-5 py-2.5 bg-[#ece8e0] text-[#1c1b16] font-bold text-label-caps hover:bg-[#dcd7cd] transition-colors font-sans cursor-pointer"
              >
                CLOSE INSPECTOR
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}


    {/* Activation / Deactivation Confirmation Modal */}
      {isConfirmModalOpen && confirmTargetLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-[#e8e2d8] rounded-xl max-w-sm w-full p-6 shadow-2xl animate-scale-up text-left">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl text-white ${
                confirmTargetLocation.isActive ? 'bg-[#ba1a1a]' : 'bg-emerald-600'
              }`}>
                <span className="material-symbols-outlined text-2xl block">
                  {confirmTargetLocation.isActive ? 'power_settings_new' : 'check_circle'}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  {confirmTargetLocation.isActive ? 'Confirm Deactivation' : 'Confirm Activation'}
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to {confirmTargetLocation.isActive ? 'deactivate' : 'activate'} this location? This action will set the status to {confirmTargetLocation.isActive ? 'inactive' : 'active'}.
                </p>
              </div>
            </div>

            {toggleError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-body-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm block">error</span>
                <span>{toggleError}</span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setConfirmTargetLocation(null);
                }}
                className="px-4 py-2 text-body-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all duration-200 cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeToggleActive}
                disabled={isToggling}
                className={`px-4 py-2 text-white text-body-xs font-bold rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-sans ${
                  confirmTargetLocation.isActive
                    ? 'bg-red-600 hover:bg-[#ae001a]'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isToggling ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin block">sync</span>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{confirmTargetLocation.isActive ? 'Deactivate' : 'Activate'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default LocationsView;
