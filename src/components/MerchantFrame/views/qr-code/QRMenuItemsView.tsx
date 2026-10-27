import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  QRMenu,
  QRMenuItem,
  QRMenuItemProductRef,
  QRMenuItemStatus,
  QRMenuSection,
} from '../../../../types/qr-menu';
import {
  QR_MENU_ITEM_STATUS_CONFIG,
} from '../../../../types/qr-menu';
import {
  deleteQRMenuItem,
  formatItemPrice,
  getItemDisplayName,
  getPOSProducts,
  getQRMenuItems,
  toggleQRMenuItemAvailability,
} from '../../../../api/qr-menu-items';
import { getQRMenus } from '../../../../api/qr-menus';
import { getQRMenuSections } from '../../../../api/qr-menu-sections';
import { QRMenuItemDrawer } from './QRMenuItemDrawer';

interface QRMenuItemsViewProps {
  merchantId?: number;
  initialMenuId?: number;
  initialSectionId?: number;
  onNavigate?: (view: string) => void;
}

export const QRMenuItemsView: React.FC<QRMenuItemsViewProps> = ({
  merchantId = 3,
  initialMenuId,
  initialSectionId,
}) => {
  // Core Entities State
  const [items, setItems] = useState<QRMenuItem[]>([]);
  const [sections, setSections] = useState<QRMenuSection[]>([]);
  const [menus, setMenus] = useState<QRMenu[]>([]);
  const [posProducts, setPosProducts] = useState<QRMenuItemProductRef[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMenuFilter, setSelectedMenuFilter] = useState<number>(initialMenuId || 0);
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<number>(initialSectionId || 0);
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'out_of_stock'>('all');
  const [posMappingFilter, setPosMappingFilter] = useState<'all' | 'mapped' | 'standalone'>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<QRMenuItemStatus[]>([
    'active',
    'inactive',
    'archived',
  ]);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Drawer & Modal States
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<QRMenuItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<QRMenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Real-time Action In-flight State (Track which item is currently toggling)
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Data Loading
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, sectionsRes, menusRes, productsRes] = await Promise.allSettled([
        getQRMenuItems({ merchantId }),
        getQRMenuSections({ merchantId }),
        getQRMenus(merchantId),
        getPOSProducts(),
      ]);

      if (itemsRes.status === 'fulfilled') {
        setItems(itemsRes.value);
      } else {
        setError('Failed to load QR menu items.');
      }

      if (sectionsRes.status === 'fulfilled') {
        setSections(sectionsRes.value);
      }
      if (menusRes.status === 'fulfilled') {
        setMenus(menusRes.value);
      }
      if (productsRes.status === 'fulfilled') {
        setPosProducts(productsRes.value);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading QR items workspace.');
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dependent sections filtered by chosen menu
  const availableSectionsForFilter = useMemo(() => {
    if (!selectedMenuFilter) return sections;
    return sections.filter((s) => s.qr_menu_id === selectedMenuFilter);
  }, [sections, selectedMenuFilter]);

  // Reset section filter if menu changes and section is not in menu
  useEffect(() => {
    if (selectedMenuFilter && selectedSectionFilter) {
      const exists = availableSectionsForFilter.some((s) => s.id === selectedSectionFilter);
      if (!exists) {
        setSelectedSectionFilter(0);
      }
    }
  }, [selectedMenuFilter, selectedSectionFilter, availableSectionsForFilter]);

  // Status Checkbox Toggle Handler
  const toggleStatusCheckbox = (st: QRMenuItemStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
    );
  };

  // KPI Metrics Calculation
  const metrics = useMemo(() => {
    const total = items.length;
    // Active Available Items: items with status = 'active' and is_available = true
    const activeAvailable = items.filter(
      (it) => it.status === 'active' && (it.is_available ?? (it.is_visible !== false))
    ).length;
    const available = items.filter((it) => it.is_available ?? (it.is_visible !== false)).length;
    // Out of Stock (86'd): alert counter of items where is_available = false
    const outOfStock = items.filter(
      (it) => it.is_available === false || it.is_visible === false
    ).length;
    // POS Linked Ratio: Percentage calculation of QR items mapped to master POS product_id records
    const posMapped = items.filter((it) => it.product_id != null).length;
    const posRatio = total > 0 ? Math.round((posMapped / total) * 100) : 0;
    const totalPrice = items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
    const avgPrice = total > 0 ? totalPrice / total : 0;

    return {
      total,
      activeAvailable,
      available,
      outOfStock,
      posMapped,
      posRatio,
      avgPrice,
    };
  }, [items]);

  // Filtered & Sorted Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Universal search across item name (name), description (description), and price
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const itemName = getItemDisplayName(item).toLowerCase();
        const itemDesc = (item.description || item.notes || '').toLowerCase();
        const badge = `#qr-itm-${item.id}`.toLowerCase();
        const sectionName = (item.qrMenuSection?.name || '').toLowerCase();
        const prodName = (item.product?.name || item.product_name || '').toLowerCase();
        const priceRaw = item.price != null ? String(item.price).toLowerCase() : '';
        const priceFormatted = item.price != null ? formatItemPrice(item.price).toLowerCase() : '';

        const match =
          itemName.includes(query) ||
          itemDesc.includes(query) ||
          badge.includes(query) ||
          sectionName.includes(query) ||
          prodName.includes(query) ||
          priceRaw.includes(query) ||
          priceFormatted.includes(query);

        if (!match) return false;
      }

      // Parent menu filter
      if (selectedMenuFilter) {
        const sec = sections.find((s) => s.id === item.qr_menu_section_id);
        if (!sec || sec.qr_menu_id !== selectedMenuFilter) return false;
      }

      // Section filter
      if (selectedSectionFilter && item.qr_menu_section_id !== selectedSectionFilter) {
        return false;
      }

      // Kitchen Availability filter
      const isItemAvailable = item.is_available ?? (item.is_visible !== false);
      if (availabilityFilter === 'available' && !isItemAvailable) return false;
      if (availabilityFilter === 'out_of_stock' && isItemAvailable) return false;

      // POS Mapping filter
      if (posMappingFilter === 'mapped' && item.product_id == null) return false;
      if (posMappingFilter === 'standalone' && item.product_id != null) return false;

      // Status Checkboxes filter (active, inactive, archived)
      if (selectedStatuses.length < 3) {
        if (!selectedStatuses.includes(item.status as QRMenuItemStatus)) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort primarily by section ID then by display_order
      if (a.qr_menu_section_id !== b.qr_menu_section_id) {
        return a.qr_menu_section_id - b.qr_menu_section_id;
      }
      return (a.display_order || 0) - (b.display_order || 0);
    });
  }, [
    items,
    sections,
    searchTerm,
    selectedMenuFilter,
    selectedSectionFilter,
    availabilityFilter,
    posMappingFilter,
    selectedStatuses,
  ]);

  // Real-time Stock Toggle Handler (86'd vs In Stock)
  const handleToggleAvailability = async (item: QRMenuItem) => {
    const currentAvailable = item.is_available ?? (item.is_visible !== false);
    const newAvailable = !currentAvailable;

    // Optimistic UI update
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, is_available: newAvailable, is_visible: newAvailable }
          : it
      )
    );

    setTogglingItemId(item.id);
    try {
      await toggleQRMenuItemAvailability(item.id, newAvailable);
      showToast(
        newAvailable
          ? `✅ "${getItemDisplayName(item)}" marked as AVAILABLE in kitchen.`
          : `⚠️ "${getItemDisplayName(item)}" marked as 86'd / OUT OF STOCK in kitchen.`
      );
    } catch {
      // Rollback on error
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, is_available: currentAvailable, is_visible: currentAvailable }
            : it
        )
      );
      showToast(`❌ Failed to update stock status for "${getItemDisplayName(item)}".`);
    } finally {
      setTogglingItemId(null);
    }
  };

  // Open Create Drawer
  const handleOpenCreateDrawer = () => {
    setDrawerMode('create');
    setEditingItem(null);
    setIsDrawerOpen(true);
  };

  // Open Edit Drawer
  const handleOpenEditDrawer = (item: QRMenuItem) => {
    setDrawerMode('edit');
    setEditingItem(item);
    setIsDrawerOpen(true);
  };

  // Handle Saved Item Callback from Drawer
  const handleDrawerSuccess = (saved: QRMenuItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === saved.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    showToast(
      drawerMode === 'create'
        ? `🎉 Dish "${getItemDisplayName(saved)}" successfully published to QR menu!`
        : `💾 Dish "${getItemDisplayName(saved)}" updated.`
    );
  };

  // Delete Action
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await deleteQRMenuItem(itemToDelete.id);
      setItems((prev) => prev.filter((it) => it.id !== itemToDelete.id));
      showToast(`🗑️ Dish "${getItemDisplayName(itemToDelete)}" deleted.`);
      setItemToDelete(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to delete dish.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedMenuFilter(0);
    setSelectedSectionFilter(0);
    setAvailabilityFilter('all');
    setPosMappingFilter('all');
    setSelectedStatuses(['active', 'inactive', 'archived']);
  };

  return (
    <div className="min-h-screen bg-[#fcf9f5] text-[#1d1c17] flex flex-col font-poppins animate-fade-in">
      {/* Main Container */}
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Toast Notification */}
        {toastMessage && (
          <div
            role="status"
            className="fixed bottom-16 right-6 z-50 bg-[#1d1c17] text-white px-5 py-3 rounded-2xl shadow-2xl border border-[#e8e2d8]/30 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-200 font-poppins"
          >
            <span className="material-symbols-outlined text-[#ae001a] text-xl">
              check_circle
            </span>
            <span className="text-sm font-semibold">{toastMessage}</span>
          </div>
        )}

        {/* Header & Workspace Summary (Theme: Blanco, Negro, Rojo) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 font-poppins">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ae001a] text-white flex items-center justify-center shadow-md shrink-0">
              <span className="material-symbols-outlined text-2xl">fastfood</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-[#1d1c17] tracking-tight font-poppins">
                  QR Menu Items Directory
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20 font-poppins">
                  Menu Management
                </span>
                <span className="text-xs text-[#5f5e5e] font-mono font-poppins">
                  Merchant #{merchantId}
                </span>
              </div>
              <p className="text-xs text-[#5f5e5e] font-medium mt-0.5 font-poppins">
                Manage dishes, link to menu sections, map to core POS inventory, and toggle real-time kitchen availability.
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={loadData}
              className="w-10 h-10 rounded-xl bg-white border border-[#e8e2d8] flex items-center justify-center text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 shadow-xs"
              title="Refresh Items"
            >
              <span className="material-symbols-outlined text-xl">refresh</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCreateDrawer}
              className="px-4 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-colors duration-200 font-poppins active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span>Add Menu Item</span>
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Card 1: Total QR Items */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm hover:border-[#ae001a]/30 transition-colors duration-200">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Total QR Items</span>
              <span className="material-symbols-outlined text-gray-400 text-lg">fastfood</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#1d1c17] font-poppins">
              {metrics.total}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 font-poppins">
              <span className="font-semibold text-[#1d1c17]">Total Dishes</span> configured
            </p>
          </div>

          {/* Card 2: Active Available Items */}
          <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:border-emerald-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Active Available Items</span>
              <span className="material-symbols-outlined text-[#10b981] text-lg">event_available</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#10b981] font-poppins">
              {metrics.activeAvailable}
            </div>
            <p className="text-[11px] text-emerald-700 mt-0.5 font-poppins">
              <span className="font-semibold">Kitchen Available</span> (active &amp; in stock)
            </p>
          </div>

          {/* Card 3: Out of Stock (86'd) */}
          <div className="bg-white rounded-2xl p-4 border border-rose-200 bg-rose-50/20 shadow-sm hover:border-rose-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-rose-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Out of Stock (86&apos;d)</span>
              <span className="material-symbols-outlined text-[#ae001a] text-lg">block</span>
            </div>
            <div className="text-2xl font-black font-mono text-[#ae001a] font-poppins">
              {metrics.outOfStock}
            </div>
            <p className="text-[11px] text-rose-700 mt-0.5 font-poppins font-semibold">
              86&apos;d / Out of Stock alerts
            </p>
          </div>

          {/* Card 4: POS Linked Ratio */}
          <div className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm hover:border-purple-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">POS Linked Ratio</span>
              <span className="material-symbols-outlined text-purple-600 text-lg">link</span>
            </div>
            <div className="text-2xl font-black font-mono text-purple-900 font-poppins">
              {metrics.posRatio}%
            </div>
            <p className="text-[11px] text-purple-600 mt-0.5 font-poppins">
              <span className="font-semibold text-purple-900">POS Mapped</span>: {metrics.posMapped} of {metrics.total}
            </p>
          </div>

          {/* Card 5: Average Selling Price */}
          <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-sm hover:border-blue-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-blue-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">Average Price</span>
              <span className="material-symbols-outlined text-blue-600 text-lg">attach_money</span>
            </div>
            <div className="text-2xl font-black font-mono text-blue-900 font-poppins">
              {formatItemPrice(metrics.avgPrice)}
            </div>
            <p className="text-[11px] text-blue-600 mt-0.5 font-poppins">Precision: 12, scale: 2</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-5 rounded-2xl bg-white border border-[#e8e2d8] space-y-4 shadow-xs font-poppins">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Universal Search */}
            <div className="md:col-span-4 relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-lg">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search dish, #QR-ITM-id, POS SKU, section..."
                className="w-full pl-10 pr-3.5 py-2 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] placeholder-[#5f5e5e] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden font-poppins"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] hover:text-[#1d1c17] text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Parent Menu Filter */}
            <div className="md:col-span-2">
              <select
                value={selectedMenuFilter}
                onChange={(e) => setSelectedMenuFilter(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden font-poppins"
              >
                <option value={0}>All Parent Menus</option>
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Category Filter */}
            <div className="md:col-span-2">
              <select
                value={selectedSectionFilter}
                onChange={(e) => setSelectedSectionFilter(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden font-poppins"
              >
                <option value={0}>All Menu Sections</option>
                {availableSectionsForFilter.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Kitchen Availability Filter */}
            <div className="md:col-span-2">
              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value as 'all' | 'available' | 'out_of_stock')}
                className="w-full px-3 py-2 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden font-poppins"
              >
                <option value="all">All Availability</option>
                <option value="available">🟢 Available in Kitchen</option>
                <option value="out_of_stock">🔴 86&apos;d / Out of Stock</option>
              </select>
            </div>

            {/* POS Product Mapping Filter */}
            <div className="md:col-span-2">
              <select
                value={posMappingFilter}
                onChange={(e) => setPosMappingFilter(e.target.value as 'all' | 'mapped' | 'standalone')}
                className="w-full px-3 py-2 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden font-poppins"
              >
                <option value="all">All POS Bindings</option>
                <option value="mapped">🔗 POS Linked</option>
                <option value="standalone">Standalone QR</option>
              </select>
            </div>
          </div>

          {/* Sub Filters Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#e8e2d8] text-xs font-poppins">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-[#5f5e5e] font-extrabold uppercase tracking-wider text-[11px]">
                Status Filter:
              </span>
              {(['active', 'inactive', 'archived'] as const).map((st) => {
                const isChecked = selectedStatuses.includes(st);
                return (
                  <label
                    key={st}
                    htmlFor={`status-checkbox-${st}`}
                    className="inline-flex items-center gap-1.5 cursor-pointer text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 select-none font-semibold"
                  >
                    <input
                      id={`status-checkbox-${st}`}
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleStatusCheckbox(st)}
                      className="w-3.5 h-3.5 rounded border-[#e8e2d8] text-[#ae001a] focus:ring-[#ae001a] cursor-pointer"
                    />
                    <span className="capitalize">{st}</span>
                  </label>
                );
              })}

              {selectedStatuses.length < 3 && (
                <button
                  type="button"
                  onClick={() => setSelectedStatuses(['active', 'inactive', 'archived'])}
                  className="text-xs text-[#ae001a] hover:underline font-semibold ml-1"
                >
                  All Statuses
                </button>
              )}

              {(searchTerm || selectedMenuFilter || selectedSectionFilter || availabilityFilter !== 'all' || posMappingFilter !== 'all' || selectedStatuses.length < 3) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="ml-2 text-[#ae001a] hover:underline font-semibold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                  Reset Filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[#5f5e5e]">
                Showing <strong className="text-[#1d1c17] font-bold">{filteredItems.length}</strong> of {items.length} items
              </span>

              {/* View layout switch */}
              <div className="flex items-center bg-[#fef9f1] border border-[#e8e2d8] rounded-xl overflow-hidden p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${
                    viewMode === 'table'
                      ? 'bg-[#ae001a] text-white shadow-xs'
                      : 'text-[#5f5e5e] hover:text-[#ae001a]'
                  }`}
                  title="Table View"
                >
                  <span className="material-symbols-outlined text-lg">format_list_bulleted</span>
                </button>
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
              </div>
            </div>
          </div>
        </div>

        {/* Content State: Loading, Error, Empty, or Data Views */}
        {loading ? (
          <div className="p-16 rounded-2xl bg-white border border-[#e8e2d8] flex flex-col items-center justify-center text-center shadow-xs font-poppins">
            <div className="w-10 h-10 border-3 border-[#ae001a]/20 border-t-[#ae001a] rounded-full animate-spin mb-3" />
            <h3 className="text-sm font-bold text-[#1d1c17]">
              Loading QR Menu Items...
            </h3>
            <p className="text-xs text-[#5f5e5e] mt-1">
              Resolving relations for sections and inventory products.
            </p>
          </div>
        ) : error ? (
          <div className="p-8 rounded-2xl bg-rose-50 border border-rose-200 text-center font-poppins">
            <span className="material-symbols-outlined text-[#ae001a] text-4xl mb-2">
              error
            </span>
            <h3 className="text-base font-bold text-[#1d1c17]">
              Error Loading Menu Items
            </h3>
            <p className="text-sm text-rose-700 mt-1">{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-4 px-4 py-2 bg-[#ae001a] text-white rounded-xl text-xs font-bold hover:bg-[#8e0015] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-16 rounded-2xl bg-white border border-[#e8e2d8] text-center flex flex-col items-center justify-center shadow-xs font-poppins">
            <div className="w-16 h-16 rounded-2xl bg-red-50 text-[#ae001a] flex items-center justify-center mb-4 border border-red-200 shadow-inner">
              <span className="material-symbols-outlined text-3xl">fastfood</span>
            </div>
            <h3 className="text-base font-bold text-[#1d1c17]">
              No QR Menu Items Found
            </h3>
            <p className="text-xs text-[#5f5e5e] mt-1 max-w-md">
              {items.length === 0
                ? 'Get started by creating individual dishes and linking them to your menu sections.'
                : 'No items match your active search and filter parameters.'}
            </p>
            <div className="mt-6 flex items-center gap-3">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-xl border border-[#e8e2d8] text-xs font-bold text-[#5f5e5e] hover:bg-slate-50 transition-colors"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenCreateDrawer}
                className="px-5 py-2.5 rounded-xl bg-[#ae001a] text-white text-xs font-bold hover:bg-[#8e0015] shadow-md transition-colors"
              >
                Add First Menu Item
              </button>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* TABLE DIRECTORY VIEW (Theme: Blanco, Negro y Rojo) */
          <div className="bg-white rounded-2xl border border-[#e8e2d8] overflow-hidden shadow-xs font-poppins">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left text-sm text-[#1d1c17] border-collapse font-poppins">
                <thead>
                  <tr className="bg-[#fef9f1] border-b border-[#e8e2d8] text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                    <th className="py-3.5 px-4">Item &amp; Badge</th>
                    <th className="py-3.5 px-3">Photo</th>
                    <th className="py-3.5 px-4">Menu Section</th>
                    <th className="py-3.5 px-4">Selling Price</th>
                    <th className="py-3.5 px-3 text-center">Seq #</th>
                    <th className="py-3.5 px-4 text-center">Kitchen Availability</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8] text-[#1d1c17]">
                  {filteredItems.map((item) => {
                    const isAvailable = item.is_available ?? (item.is_visible !== false);
                    const statusConfig =
                      QR_MENU_ITEM_STATUS_CONFIG[item.status as QRMenuItemStatus] ||
                      QR_MENU_ITEM_STATUS_CONFIG.active;
                    const isToggling = togglingItemId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-[#fef9f1]/70 transition-colors duration-150 group"
                      >
                        {/* Item Badge & Name */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-[#fef9f1] border border-[#e8e2d8] text-[11px] font-mono font-bold text-[#ae001a] font-poppins">
                                #QR-ITM-{item.id}
                              </span>
                              <span className="font-bold text-[#1d1c17] font-poppins group-hover:text-[#ae001a] transition-colors duration-200">
                                {getItemDisplayName(item)}
                              </span>
                            </div>
                            {(item.description || item.notes) && (
                              <p className="text-xs text-[#5f5e5e] line-clamp-1 mt-0.5 max-w-xs font-poppins">
                                {item.description || item.notes}
                              </p>
                            )}
                            {item.product?.name ? (
                              <span className="sr-only">POS: {item.product.name}</span>
                            ) : (
                              <span className="sr-only">Standalone QR Item</span>
                            )}
                          </div>
                        </td>

                        {/* Image Thumbnail Frame */}
                        <td className="py-3 px-3">
                          <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#e8e2d8] bg-[#fef9f1] flex items-center justify-center shrink-0 hover:border-[#ae001a]/50 transition-colors duration-200">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={getItemDisplayName(item)}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="material-symbols-outlined text-[#5f5e5e] text-lg">
                                restaurant
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Section Reference */}
                        <td className="py-3 px-4 font-poppins">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[#5f5e5e] text-base">
                              folder_open
                            </span>
                            <span className="font-semibold text-[#1d1c17]">
                              {item.qrMenuSection?.name || `Section #${item.qr_menu_section_id}`}
                            </span>
                          </div>
                        </td>

                        {/* Selling Price Display (Monospace format) */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-sm text-[#1d1c17] bg-[#fef9f1] px-2.5 py-1 rounded-lg border border-[#e8e2d8] font-poppins">
                            {formatItemPrice(item.price)}
                          </span>
                        </td>

                        {/* Display Order Sequence */}
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#fef9f1] text-[#1d1c17] border border-[#e8e2d8] font-poppins">
                            #{item.display_order}
                          </span>
                        </td>

                        {/* Kitchen Availability Switch (86 / Available) */}
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-2 font-poppins">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isAvailable}
                              disabled={isToggling}
                              onClick={() => handleToggleAvailability(item)}
                              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                                isAvailable
                                  ? 'bg-emerald-600 hover:bg-emerald-700'
                                  : 'bg-[#ae001a] hover:bg-[#8e0015]'
                              }`}
                              title={
                                isAvailable
                                  ? 'Click to 86 this item (mark out of stock)'
                                  : 'Click to mark available in kitchen'
                              }
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  isAvailable ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border font-poppins ${
                                isAvailable
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-red-50 text-[#ae001a] border-[#ae001a]/30'
                              }`}
                            >
                              {isAvailable ? 'Available' : "86'd"}
                            </span>
                          </div>
                        </td>

                        {/* Status Pill */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border font-semibold font-poppins ${
                              item.status === 'active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : item.status === 'archived'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-100 text-[#5f5e5e] border-slate-300'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                            {statusConfig.label}
                          </span>
                        </td>

                        {/* Action Buttons */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditDrawer(item)}
                              className="p-1.5 rounded-lg text-[#5f5e5e] hover:text-[#ae001a] hover:bg-[#ae001a]/10 transition-colors duration-200"
                              title="Edit Item"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemToDelete(item)}
                              className="p-1.5 rounded-lg text-[#5f5e5e] hover:text-red-600 hover:bg-red-50 transition-colors duration-200"
                              title="Delete Item"
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
        ) : (
          /* GRID CARDS VIEW (Theme: Blanco, Negro y Rojo) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-poppins">
            {filteredItems.map((item) => {
              const isAvailable = item.is_available ?? (item.is_visible !== false);
              const statusConfig =
                QR_MENU_ITEM_STATUS_CONFIG[item.status as QRMenuItemStatus] ||
                QR_MENU_ITEM_STATUS_CONFIG.active;
              const isToggling = togglingItemId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-[#e8e2d8] shadow-xs overflow-hidden flex flex-col group hover:shadow-md hover:border-[#ae001a]/40 transition-all duration-200"
                >
                  {/* Card Image Banner */}
                  <div className="h-44 w-full bg-[#fef9f1] border-b border-[#e8e2d8] relative overflow-hidden flex items-center justify-center">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={getItemDisplayName(item)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="material-symbols-outlined text-[#5f5e5e] text-5xl">
                        restaurant
                      </span>
                    )}

                    {/* Top Floating Badges */}
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-[#1d1c17]/80 backdrop-blur-xs text-white text-[11px] font-mono font-bold font-poppins">
                        #QR-ITM-{item.id}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[11px] font-mono font-poppins">
                        Seq #{item.display_order}
                      </span>
                    </div>

                    <div className="absolute top-3 right-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-xs font-poppins ${
                          item.status === 'active'
                            ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-500/40'
                            : item.status === 'archived'
                            ? 'bg-amber-900/80 text-amber-200 border border-amber-500/40'
                            : 'bg-slate-900/80 text-slate-200 border border-slate-500/40'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                        {statusConfig.label}
                      </span>
                    </div>

                    {/* Floating Price Pill */}
                    <div className="absolute bottom-3 right-3">
                      <span className="font-mono font-extrabold text-base bg-white text-[#1d1c17] px-3 py-1 rounded-xl shadow-md border border-[#e8e2d8] font-poppins">
                        {formatItemPrice(item.price)}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      {/* Section & POS Pill */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap font-poppins">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#fef9f1] text-[#1d1c17] border border-[#e8e2d8] text-xs font-semibold">
                          <span className="material-symbols-outlined text-xs text-[#5f5e5e]">folder</span>
                          {item.qrMenuSection?.name || `Sec #${item.qr_menu_section_id}`}
                        </span>

                        {item.product ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#fef9f1] text-[#1d1c17] border border-[#e8e2d8] text-xs font-semibold">
                            <span className="material-symbols-outlined text-xs text-[#5f5e5e]">link</span>
                            {item.product.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#fef9f1] text-[#5f5e5e] border border-[#e8e2d8] text-xs font-medium">
                            Standalone QR
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-[#1d1c17] font-poppins group-hover:text-[#ae001a] transition-colors duration-200">
                        {getItemDisplayName(item)}
                      </h3>
                      {(item.description || item.notes) && (
                        <p className="text-xs text-[#5f5e5e] line-clamp-2 mt-1 font-poppins">
                          {item.description || item.notes}
                        </p>
                      )}
                    </div>

                    {/* Kitchen Availability Switch and Actions */}
                    <div className="pt-3 border-t border-[#e8e2d8] flex items-center justify-between font-poppins">
                      {/* 86 Toggle */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isAvailable}
                          disabled={isToggling}
                          onClick={() => handleToggleAvailability(item)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                            isAvailable ? 'bg-emerald-600' : 'bg-[#ae001a]'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              isAvailable ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span
                          className={`text-xs font-bold font-poppins ${
                            isAvailable ? 'text-emerald-700' : 'text-[#ae001a]'
                          }`}
                        >
                          {isAvailable ? 'Available' : "86'd"}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditDrawer(item)}
                          className="p-1.5 rounded-lg border border-[#e8e2d8] text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a]/40 transition-colors duration-200"
                          title="Edit Item"
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          className="p-1.5 rounded-lg border border-[#e8e2d8] text-[#5f5e5e] hover:text-red-600 hover:bg-red-50 transition-colors duration-200"
                          title="Delete Item"
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
        )}
      </div>

      {/* Add / Edit Drawer */}
      <QRMenuItemDrawer
        isOpen={isDrawerOpen}
        mode={drawerMode}
        item={editingItem}
        sections={sections}
        menus={menus}
        posProducts={posProducts}
        initialSectionId={selectedSectionFilter || undefined}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={handleDrawerSuccess}
      />

      {/* Delete Confirmation Modal */}
      {itemToDelete && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto"
          aria-labelledby="delete-item-title"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex min-h-screen items-center justify-center p-4 text-center">
            <div
              className="fixed inset-0 bg-[#1d1c17]/60 backdrop-blur-xs transition-opacity"
              onClick={() => !isDeleting && setItemToDelete(null)}
            />
            <div className="relative transform overflow-hidden rounded-2xl bg-white border border-[#e8e2d8] p-6 text-left shadow-2xl transition-all sm:w-full sm:max-w-md font-poppins">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#ae001a] border border-red-200 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl">delete</span>
              </div>
              <h3
                id="delete-item-title"
                className="text-lg font-bold text-[#1d1c17] font-poppins"
              >
                Delete Menu Item
              </h3>
              <p className="text-sm text-[#5f5e5e] mt-2 font-poppins">
                Are you sure you want to delete{' '}
                <strong className="text-[#1d1c17]">
                  &quot;{getItemDisplayName(itemToDelete)}&quot;
                </strong>{' '}
                (#QR-ITM-{itemToDelete.id})? This dish will be permanently removed from all customer digital QR menus.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3 font-poppins">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setItemToDelete(null)}
                  className="px-4 py-2 rounded-xl border border-[#e8e2d8] text-xs font-bold text-[#1d1c17] bg-[#fef9f1] hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-xl bg-[#ae001a] hover:bg-[#8e0015] text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                >
                  {isDeleting && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
