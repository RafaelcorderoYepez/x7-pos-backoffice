import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  QRMenu,
  QRMenuSection,
  QRMenuSectionStatus,
} from '../../../../types/qr-menu';
import {
  QR_MENU_SECTION_STATUSES,
  QR_MENU_SECTION_STATUS_CONFIG,
} from '../../../../types/qr-menu';
import {
  bulkReorderQRMenuSections,
  deleteQRMenuSection,
  getQRMenuSections,
} from '../../../../api/qr-menu-sections';
import { getQRMenus } from '../../../../api/qr-menus';
import {
  QRMenuSectionDrawer,
  type SectionDrawerMode,
} from './QRMenuSectionDrawer';
import { QRMenuSectionReorderModal } from './QRMenuSectionReorderModal';
import { CascadeVerificationModal } from './CascadeVerificationModal';

interface QRMenuSectionsViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
  initialMenuId?: number;
}

export const QRMenuSectionsView: React.FC<QRMenuSectionsViewProps> = ({
  merchantId = 3,
  initialMenuId,
}) => {
  const [sections, setSections] = useState<QRMenuSection[]>([]);
  const [menus, setMenus] = useState<QRMenu[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & View State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMenuFilter, setSelectedMenuFilter] = useState<number | 'ALL'>(
    initialMenuId ?? 'ALL'
  );
  const [selectedStatuses, setSelectedStatuses] = useState<
    Set<QRMenuSectionStatus>
  >(new Set(['active', 'inactive', 'archived']));
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  // Drawer State (Add / Edit)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<SectionDrawerMode>('create');
  const [selectedSection, setSelectedSection] = useState<QRMenuSection | null>(
    null
  );

  // Dedicated Drag-and-Drop Sequencer Controller Modal State
  const [isReorderModalOpen, setIsReorderModalOpen] = useState<boolean>(false);

  // Cascade Deletion Verification Modal State
  const [sectionToDelete, setSectionToDelete] = useState<QRMenuSection | null>(
    null
  );
  const [showDeleteCascadeModal, setShowDeleteCascadeModal] =
    useState<boolean>(false);

  // Direct Table/Kanban Drag-and-Drop State
  const [draggedSectionId, setDraggedSectionId] = useState<number | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<number | null>(
    null
  );

  // Success Toast Notification
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setSuccessToast(message);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sectionsData, menusData] = await Promise.allSettled([
        getQRMenuSections({ merchantId }),
        getQRMenus(merchantId),
      ]);

      if (sectionsData.status === 'fulfilled') {
        setSections(sectionsData.value);
      } else {
        setError(
          sectionsData.reason?.message || 'Failed to load QR menu sections.'
        );
      }

      if (menusData.status === 'fulfilled') {
        setMenus(menusData.value);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load QR menu sections.');
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // KPI Metrics Calculation
  const metrics = useMemo(() => {
    const total = sections.length;
    const active = sections.filter((s) => s.status === 'active').length;
    const inactive = sections.filter((s) => s.status === 'inactive').length;
    const archived = sections.filter((s) => s.status === 'archived').length;

    // Distinct parent menus covered by sections
    const coveredMenuIds = new Set(sections.map((s) => s.qr_menu_id));
    const parentMenusCount = coveredMenuIds.size;

    return {
      total,
      active,
      inactive,
      archived,
      parentMenusCount,
    };
  }, [sections]);

  // Filtered Sections strictly ordered by display_order within parent menu scope
  const filteredSections = useMemo(() => {
    return sections
      .filter((section) => {
        // Universal Search: section name, description, badge #QR-SEC-{id}, parent menu title
        if (searchTerm.trim()) {
          const query = searchTerm.toLowerCase();
          const matchName = section.name.toLowerCase().includes(query);
          const matchDesc = section.description.toLowerCase().includes(query);
          const matchBadge = `#qr-sec-${section.id}`.includes(query);
          const matchMenu = section.qrMenu?.name.toLowerCase().includes(query);
          const matchMenuBadge = `#qr-mnu-${section.qr_menu_id}`.includes(query);

          if (
            !matchName &&
            !matchDesc &&
            !matchBadge &&
            !matchMenu &&
            !matchMenuBadge
          ) {
            return false;
          }
        }

        // Parent Menu Filter
        if (
          selectedMenuFilter !== 'ALL' &&
          section.qr_menu_id !== selectedMenuFilter
        ) {
          return false;
        }

        // Status Checkbox Filter
        if (
          !selectedStatuses.has(
            (section.status as QRMenuSectionStatus) || 'active'
          )
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sequential Sorting: strictly ordered by display_order within parent menu scope
        if (a.qr_menu_id !== b.qr_menu_id) {
          return a.qr_menu_id - b.qr_menu_id;
        }
        return a.display_order - b.display_order;
      });
  }, [sections, searchTerm, selectedMenuFilter, selectedStatuses]);

  // Status Filter Checkbox Toggle
  const handleStatusToggle = (status: QRMenuSectionStatus) => {
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
    setSelectedSection(null);
    setDrawerMode('create');
    setIsDrawerOpen(true);
  };

  const handleEdit = (section: QRMenuSection) => {
    setSelectedSection(section);
    setDrawerMode('edit');
    setIsDrawerOpen(true);
  };

  // Cascade Protection on Deletion
  const handleDeleteClick = (section: QRMenuSection) => {
    const childItems = section.items || [];
    const hasChildren = (section.items_count ?? 0) > 0 || childItems.length > 0;

    if (hasChildren) {
      // Show Cascade Protection Verification Modal
      setSectionToDelete(section);
      setShowDeleteCascadeModal(true);
      return;
    }

    // Clean section without attached items
    if (
      !window.confirm(
        `Are you sure you want to remove QR Menu Section "${section.name}" (#QR-SEC-${section.id})?`
      )
    ) {
      return;
    }

    executeDelete(section);
  };

  const executeDelete = async (section: QRMenuSection) => {
    setShowDeleteCascadeModal(false);
    try {
      await deleteQRMenuSection(section.id);
      setSections((prev) => prev.filter((s) => s.id !== section.id));
      showToast(`Section "${section.name}" has been removed.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete section.');
    }
  };

  const handleDrawerSuccess = (saved: QRMenuSection) => {
    loadData();
    if (drawerMode === 'create') {
      showToast(
        `Section "${saved.name}" successfully created and bound to #QR-MNU-${saved.qr_menu_id}!`
      );
    } else {
      showToast(`Section "${saved.name}" updated successfully.`);
    }
  };

  // Drag-and-Drop Sequence Reordering Engine
  const handleDragStart = (e: React.DragEvent, section: QRMenuSection) => {
    setDraggedSectionId(section.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(section.id));
  };

  const handleDragOver = (e: React.DragEvent, targetSection: QRMenuSection) => {
    e.preventDefault();
    if (draggedSectionId === targetSection.id) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverSectionId(targetSection.id);
  };

  const handleDragLeave = () => {
    setDragOverSectionId(null);
  };

  const handleDragEnd = () => {
    setDraggedSectionId(null);
    setDragOverSectionId(null);
  };

  const handleDrop = async (
    e: React.DragEvent,
    targetSection: QRMenuSection
  ) => {
    e.preventDefault();
    setDragOverSectionId(null);
    const sourceId = draggedSectionId;
    setDraggedSectionId(null);

    if (!sourceId || sourceId === targetSection.id) return;

    const sourceSection = sections.find((s) => s.id === sourceId);
    if (!sourceSection) return;

    // Sibling constraint: can only reorder sibling sections within the same parent QR Menu
    if (sourceSection.qr_menu_id !== targetSection.qr_menu_id) {
      alert(
        'Drag-and-drop sequencing can only reorder sibling sections within the same parent QR Menu.'
      );
      return;
    }

    // Get sibling sections strictly sorted by display_order
    const siblingSections = sections
      .filter((s) => s.qr_menu_id === targetSection.qr_menu_id)
      .sort((a, b) => a.display_order - b.display_order);

    const fromIndex = siblingSections.findIndex((s) => s.id === sourceId);
    const toIndex = siblingSections.findIndex((s) => s.id === targetSection.id);

    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...siblingSections];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const orderedIds = reordered.map((s) => s.id);

    try {
      // Bulk Reorder Sync: single atomic payload update for display_order attributes
      await bulkReorderQRMenuSections(targetSection.qr_menu_id, orderedIds);
      await loadData();
      showToast(
        `Bulk reorder synced! Updated sequence positions for menu #QR-MNU-${targetSection.qr_menu_id}.`
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to bulk reorder sections.');
    }
  };

  // Step button reordering (fallback / accessibility)
  const handleMoveOrder = async (
    section: QRMenuSection,
    direction: 'up' | 'down'
  ) => {
    const siblingSections = sections
      .filter((s) => s.qr_menu_id === section.qr_menu_id)
      .sort((a, b) => a.display_order - b.display_order);

    const currentIndex = siblingSections.findIndex((s) => s.id === section.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblingSections.length) return;

    const reorderedList = [...siblingSections];
    const [moved] = reorderedList.splice(currentIndex, 1);
    reorderedList.splice(targetIndex, 0, moved);

    const orderedIds = reorderedList.map((s) => s.id);

    try {
      await bulkReorderQRMenuSections(section.qr_menu_id, orderedIds);
      await loadData();
      showToast(
        `Section "${section.name}" moved to sequential position #${targetIndex + 1}.`
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reorder sections.');
    }
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
              <span className="material-symbols-outlined text-2xl">
                view_headline
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-[#1d1c17] tracking-tight font-poppins">
                  QR Menu Sections Workspace
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20 font-poppins">
                  Category Flow Architecture
                </span>
              </div>
              <p className="text-xs text-[#5f5e5e] font-medium mt-0.5 font-poppins">
                Organize digital QR menus into logical categories, enforce display
                ordering, and control customer availability.
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

            {/* Drag & Drop Sequencer Controller Modal Trigger */}
            <button
              type="button"
              onClick={() => setIsReorderModalOpen(true)}
              data-testid="open-reorder-modal-btn"
              className="px-4 py-2.5 rounded-xl bg-white border border-[#e8e2d8] hover:border-[#ae001a]/50 text-[#1d1c17] hover:text-[#ae001a] text-xs font-bold shadow-xs flex items-center gap-2 transition-colors duration-200 font-poppins"
              title="Open Visual Drag & Drop Reordering Controller"
            >
              <span className="material-symbols-outlined text-lg text-[#ae001a]">
                drag_indicator
              </span>
              <span>Reorder Sequencer</span>
            </button>

            <button
              onClick={handleCreateNew}
              data-testid="create-qr-section-btn"
              className="px-4 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] text-white text-xs font-bold shadow-md flex items-center gap-2 transition-colors duration-200 font-poppins active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">
                add_circle
              </span>
              <span>Create Section</span>
            </button>
          </div>
        </div>

        {/* 1. Operational KPI Summary Metrics Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Registered Sections */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e2d8] shadow-sm hover:border-[#ae001a]/30 transition-colors duration-200">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Total Sections
              </span>
              <span className="material-symbols-outlined text-[#ae001a] text-lg">category</span>
            </div>
            <div
              data-testid="kpi-total-sections"
              className="text-2xl font-black font-mono text-[#1d1c17] font-poppins"
            >
              {metrics.total}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-poppins">
              Across {metrics.parentMenusCount} QR menus
            </div>
          </div>

          {/* Active Sections (Success Green pill #10b981) */}
          <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:border-emerald-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Active Sections
              </span>
              <span className="material-symbols-outlined text-[#10b981] text-lg">visibility</span>
            </div>
            <div
              data-testid="kpi-active-sections"
              className="text-2xl font-black font-mono text-[#10b981] font-poppins"
            >
              {metrics.active}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-poppins">
              Visible in Mobile Menu
            </div>
          </div>

          {/* Inactive Sections (Warning Amber pill #f59e0b) */}
          <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm hover:border-amber-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Inactive Sections
              </span>
              <span className="material-symbols-outlined text-[#f59e0b] text-lg">visibility_off</span>
            </div>
            <div
              data-testid="kpi-inactive-sections"
              className="text-2xl font-black font-mono text-[#f59e0b] font-poppins"
            >
              {metrics.inactive}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-poppins">
              Hidden from Mobile Menu
            </div>
          </div>

          {/* Archived Sections (Danger Red pill #ef4444) */}
          <div className="bg-white rounded-2xl p-4 border border-rose-200 shadow-sm hover:border-rose-300 transition-colors duration-200">
            <div className="flex items-center justify-between text-rose-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider font-poppins">
                Archived Sections
              </span>
              <span className="material-symbols-outlined text-[#ef4444] text-lg">archive</span>
            </div>
            <div
              data-testid="kpi-archived-sections"
              className="text-2xl font-black font-mono text-[#ef4444] font-poppins"
            >
              {metrics.archived}
            </div>
            <div className="text-[11px] text-rose-700 mt-0.5 font-poppins">Archived Sections</div>
          </div>
        </div>

        {/* 2. Filter & Multi-Criteria Search Bar */}
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
                placeholder="Universal search by section name, #QR-SEC, description..."
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
              {/* Parent QR Menu Filter */}
              <div className="flex items-center gap-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3 py-2 text-xs font-poppins">
                <span className="material-symbols-outlined text-base text-[#ae001a]">
                  restaurant_menu
                </span>
                <span className="text-[#5f5e5e] font-semibold text-[11px]">
                  Parent Menu:
                </span>
                <select
                  aria-label="Filter by Parent QR Menu"
                  data-testid="parent-menu-filter"
                  value={selectedMenuFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedMenuFilter(val === 'ALL' ? 'ALL' : Number(val));
                  }}
                  className="bg-transparent font-bold text-[#1d1c17] focus:outline-none cursor-pointer max-w-[200px] truncate"
                >
                  <option value="ALL">All Parent Menus</option>
                  {menus.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      #QR-MNU-{menu.id} — {menu.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Mode Switcher (Table vs Kanban) */}
              <div className="flex items-center bg-[#fef9f1] p-1 rounded-xl border border-[#e8e2d8]">
                <button
                  type="button"
                  data-testid="view-mode-table-btn"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${
                    viewMode === 'table'
                      ? 'bg-[#ae001a] text-white shadow-xs'
                      : 'text-[#5f5e5e] hover:text-[#ae001a]'
                  }`}
                  title="Directory Table View"
                >
                  <span className="material-symbols-outlined text-lg">
                    table_rows
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="view-mode-kanban-btn"
                  onClick={() => setViewMode('kanban')}
                  className={`p-1.5 rounded-lg transition-colors duration-200 ${
                    viewMode === 'kanban'
                      ? 'bg-[#ae001a] text-white shadow-xs'
                      : 'text-[#5f5e5e] hover:text-[#ae001a]'
                  }`}
                  title="Status Kanban Board View"
                >
                  <span className="material-symbols-outlined text-lg">
                    view_kanban
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Status Checkbox Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-[#e8e2d8] flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[11px] font-extrabold uppercase text-[#5f5e5e] tracking-wider font-poppins">
                Availability Filters:
              </span>
              {QR_MENU_SECTION_STATUSES.map((status) => {
                const isChecked = selectedStatuses.has(status);
                const cfg = QR_MENU_SECTION_STATUS_CONFIG[status];
                return (
                  <label
                    key={status}
                    className="flex items-center gap-2 cursor-pointer select-none group"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleStatusToggle(status)}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-[#ae001a] border-[#ae001a] text-white'
                          : 'border-[#e8e2d8] bg-white group-hover:border-[#ae001a]'
                      }`}
                    >
                      {isChecked && (
                        <span className="material-symbols-outlined text-xs font-bold leading-none">
                          check
                        </span>
                      )}
                    </div>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cfg.pillHex }}
                    />
                    <span className="text-xs font-bold text-[#1d1c17] group-hover:text-[#ae001a] transition-colors font-poppins capitalize">
                      {cfg.label}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="text-xs text-[#5f5e5e] font-semibold">
              Showing{' '}
              <span className="text-[#ae001a] font-black">
                {filteredSections.length}
              </span>{' '}
              of {sections.length} sections
            </div>
          </div>
        </div>

        {/* 3. Main Workspace Presentation: Table or Kanban with Drag-and-Drop */}
        {loading ? (
          <div className="p-16 text-center bg-white rounded-2xl border border-[#e8e2d8] shadow-xs">
            <div className="w-10 h-10 border-3 border-[#ae001a]/20 border-t-[#ae001a] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-bold text-[#5f5e5e]">
              Loading QR Menu Sections workspace...
            </p>
          </div>
        ) : error ? (
          <div className="p-8 text-center bg-rose-50 rounded-2xl border border-rose-200 text-rose-700">
            <span className="material-symbols-outlined text-3xl mb-2">
              error
            </span>
            <p className="text-xs font-bold">{error}</p>
            <button
              onClick={loadData}
              className="mt-3 px-4 py-2 bg-[#ae001a] text-white text-xs font-bold rounded-xl"
            >
              Retry Loading
            </button>
          </div>
        ) : filteredSections.length === 0 ? (
          <div className="p-16 text-center bg-white rounded-2xl border border-[#e8e2d8] shadow-xs space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-[#ae001a] flex items-center justify-center mx-auto shadow-inner">
              <span className="material-symbols-outlined text-3xl">
                layers_clear
              </span>
            </div>
            <h3 className="text-sm font-extrabold text-[#1d1c17]">
              No QR Menu Sections Found
            </h3>
            <p className="text-xs text-[#5f5e5e] max-w-md mx-auto">
              No section matched your active search query or filter criteria. Create
              a new section or clear your filters to view all menu categories.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedMenuFilter('ALL');
                  setSelectedStatuses(
                    new Set(['active', 'inactive', 'archived'])
                  );
                }}
                className="px-4 py-2 rounded-xl border border-[#e8e2d8] text-xs font-bold text-[#5f5e5e] hover:bg-slate-50 transition-colors"
              >
                Clear Filters
              </button>
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 rounded-xl bg-[#ae001a] text-white text-xs font-bold hover:bg-[#900015] shadow-xs flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Create Section</span>
              </button>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* Table View: strictly ordered by display_order within parent menu scope */
          <div className="bg-white rounded-2xl border border-[#e8e2d8] shadow-xs overflow-hidden font-poppins">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#fef9f1] border-b border-[#e8e2d8] text-[#5f5e5e] uppercase tracking-wider font-extrabold font-poppins text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4 w-28 text-center whitespace-nowrap">
                      Seq. Order
                    </th>
                    <th className="py-3.5 px-4 whitespace-nowrap">
                      Section Badge & Name
                    </th>
                    <th className="py-3.5 px-4 whitespace-nowrap">
                      Parent QR Menu Reference
                    </th>
                    <th className="py-3.5 px-4 whitespace-nowrap">
                      Status
                    </th>
                    <th className="py-3.5 px-4 w-20 text-center whitespace-nowrap">
                      Items
                    </th>
                    <th className="py-3.5 px-4 w-24 text-right whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8]/60">
                  {filteredSections.map((section) => {
                    const statusConfig =
                      QR_MENU_SECTION_STATUS_CONFIG[
                        (section.status as QRMenuSectionStatus) || 'active'
                      ] || QR_MENU_SECTION_STATUS_CONFIG.active;

                    const isDragged = draggedSectionId === section.id;
                    const isOver = dragOverSectionId === section.id;

                    return (
                      <tr
                        key={section.id}
                        draggable
                        data-testid={`section-row-${section.id}`}
                        onDragStart={(e) => handleDragStart(e, section)}
                        onDragOver={(e) => handleDragOver(e, section)}
                        onDragLeave={handleDragLeave}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, section)}
                        className={`transition-all duration-200 group ${
                          isDragged
                            ? 'opacity-40 bg-slate-100 border-dashed border-[#ae001a]'
                            : isOver
                              ? 'bg-amber-100/70 border-t-2 border-[#ae001a]'
                              : 'hover:bg-[#ae001a]/5'
                        }`}
                      >
                        {/* Drag Handle & Display Order Badge */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <span
                              className="material-symbols-outlined text-slate-400 hover:text-[#ae001a] cursor-grab active:cursor-grabbing text-base shrink-0 select-none"
                              data-testid={`drag-handle-${section.id}`}
                              title="Drag to reposition sequence"
                            >
                              drag_indicator
                            </span>

                            <span
                              data-testid={`display-order-badge-${section.id}`}
                              className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200 shrink-0"
                            >
                              #{String(section.display_order).padStart(2, '0')}
                            </span>

                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                type="button"
                                title="Move Up in Sequence"
                                onClick={() => handleMoveOrder(section, 'up')}
                                className="w-4 h-4 rounded text-[#5f5e5e] hover:text-[#ae001a] hover:bg-[#ae001a]/10 flex items-center justify-center transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  keyboard_arrow_up
                                </span>
                              </button>
                              <button
                                type="button"
                                title="Move Down in Sequence"
                                onClick={() => handleMoveOrder(section, 'down')}
                                className="w-4 h-4 rounded text-[#5f5e5e] hover:text-[#ae001a] hover:bg-[#ae001a]/10 flex items-center justify-center transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  keyboard_arrow_down
                                </span>
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Section Badge & Name */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <span
                              data-testid={`section-badge-${section.id}`}
                              title={`#QR-SEC-${section.id}`}
                              className="text-[10px] font-extrabold text-[#ae001a] bg-[#ae001a]/10 border border-[#ae001a]/20 px-2 py-0.5 rounded-md font-poppins shrink-0 font-mono tracking-tight"
                            >
                              #QR-SEC-{String(section.id).length > 7 ? `...${String(section.id).slice(-4)}` : section.id}
                            </span>
                            <span
                              className="font-extrabold text-[#1d1c17] text-xs group-hover:text-[#ae001a] transition-colors font-poppins"
                              title={section.name}
                            >
                              {section.name}
                            </span>
                            {section.description && (
                              <span className="sr-only">{section.description}</span>
                            )}
                          </div>
                        </td>

                        {/* Parent Menu Reference: #QR-MNU-{qr_menu_id} linked pill */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedMenuFilter(section.qr_menu_id)
                            }
                            data-testid={`parent-menu-pill-${section.id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-800 transition-colors duration-200 text-xs font-bold whitespace-nowrap"
                            title={`Click to filter by parent menu: ${section.qrMenu?.name || 'Menu'}`}
                          >
                            <span className="material-symbols-outlined text-sm text-blue-600 shrink-0">
                              restaurant_menu
                            </span>
                            <span className="font-extrabold shrink-0">
                              #QR-MNU-{section.qr_menu_id}
                            </span>
                            <span className="font-medium text-blue-900 max-w-[160px] truncate">
                              ({section.qrMenu?.name || 'Menu'})
                            </span>
                          </button>
                        </td>

                        {/* Status Pill: active (#10b981), inactive (#f59e0b), archived (#ef4444) */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            data-testid={`status-pill-${section.id}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold font-poppins whitespace-nowrap shadow-xs ${statusConfig.badgeClass}`}
                            title={`${statusConfig.label} — ${statusConfig.description}`}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: statusConfig.pillHex }}
                            />
                            <span>{statusConfig.label}</span>
                            <span className="sr-only">
                              — {statusConfig.description}
                            </span>
                          </span>
                        </td>

                        {/* Linked Items Count */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="font-extrabold text-[#1d1c17] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-[11px] inline-block min-w-[24px]">
                            {section.items_count ?? 0}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEdit(section)}
                              data-testid={`edit-section-${section.id}`}
                              className="w-8 h-8 rounded-lg border border-[#e8e2d8] hover:border-[#ae001a] hover:text-[#ae001a] text-[#5f5e5e] flex items-center justify-center transition-colors"
                              title="Edit Section"
                            >
                              <span className="material-symbols-outlined text-base">
                                edit
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(section)}
                              data-testid={`delete-section-${section.id}`}
                              className="w-8 h-8 rounded-lg border border-[#e8e2d8] hover:bg-rose-50 hover:border-rose-300 text-rose-500 flex items-center justify-center transition-colors"
                              title="Delete Section"
                            >
                              <span className="material-symbols-outlined text-base">
                                delete
                              </span>
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
          /* Kanban View: Columns for Active, Inactive, Archived */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {QR_MENU_SECTION_STATUSES.map((statusKey) => {
              const cfg = QR_MENU_SECTION_STATUS_CONFIG[statusKey];
              const columnSections = filteredSections.filter(
                (s) => (s.status as QRMenuSectionStatus) === statusKey
              );

              return (
                <div
                  key={statusKey}
                  data-testid={`kanban-column-${statusKey}`}
                  className="bg-white rounded-2xl border border-[#e8e2d8] p-4 flex flex-col shadow-xs"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#e8e2d8] mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cfg.pillHex }}
                      />
                      <h3 className="text-xs font-black uppercase tracking-wider text-[#1d1c17]">
                        {cfg.label}
                      </h3>
                    </div>
                    <span
                      className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${cfg.badgeClass}`}
                    >
                      {columnSections.length}
                    </span>
                  </div>

                  {/* Cards List strictly ordered by display_order with drag and drop */}
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1">
                    {columnSections.length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-[#e8e2d8] rounded-xl text-slate-400 text-xs">
                        No {cfg.label.toLowerCase()} sections
                      </div>
                    ) : (
                      columnSections.map((sec) => {
                        const isDragged = draggedSectionId === sec.id;
                        const isOver = dragOverSectionId === sec.id;

                        return (
                          <div
                            key={sec.id}
                            draggable
                            data-testid={`kanban-card-${sec.id}`}
                            onDragStart={(e) => handleDragStart(e, sec)}
                            onDragOver={(e) => handleDragOver(e, sec)}
                            onDragLeave={handleDragLeave}
                            onDragEnd={handleDragEnd}
                            onDrop={(e) => handleDrop(e, sec)}
                            className={`p-4 rounded-xl border transition-all duration-200 shadow-xs space-y-2 group select-none ${
                              isDragged
                                ? 'opacity-40 bg-slate-100 border-dashed border-[#ae001a]'
                                : isOver
                                  ? 'border-[#ae001a] ring-2 ring-[#ae001a]/30 bg-amber-50/50 scale-[1.01]'
                                  : 'border-[#e8e2d8] hover:border-[#ae001a]/40 bg-[#fef9f1]/40 hover:bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="material-symbols-outlined text-slate-400 hover:text-[#ae001a] cursor-grab active:cursor-grabbing text-sm"
                                  title="Drag to reorder"
                                >
                                  drag_indicator
                                </span>
                                <span
                                  title={`#QR-SEC-${sec.id}`}
                                  className="text-[10px] font-extrabold text-[#ae001a] bg-[#ae001a]/10 border border-[#ae001a]/20 px-2 py-0.5 rounded-md font-mono shrink-0"
                                >
                                  #QR-SEC-{String(sec.id).length > 7 ? `...${String(sec.id).slice(-4)}` : sec.id}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                                Order #{sec.display_order}
                              </span>
                            </div>

                            <div>
                              <h4 className="text-xs font-black text-[#1d1c17] group-hover:text-[#ae001a] transition-colors">
                                {sec.name}
                              </h4>
                              <p className="text-[11px] text-[#5f5e5e] line-clamp-2 mt-0.5">
                                {sec.description || 'No description provided.'}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-[#e8e2d8]/60 flex items-center justify-between text-[10px]">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedMenuFilter(sec.qr_menu_id)
                                }
                                className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200 truncate max-w-[170px]"
                                title={`Parent: ${sec.qrMenu?.name || 'Menu'}`}
                              >
                                #QR-MNU-{sec.qr_menu_id} {sec.qrMenu?.name}
                              </button>
                              <span className="font-bold text-[#5f5e5e]">
                                {sec.items_count ?? 0} items
                              </span>
                            </div>

                            {/* Card Actions Footer */}
                            <div className="pt-2 flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  title="Move Up"
                                  onClick={() => handleMoveOrder(sec, 'up')}
                                  className="w-6 h-6 rounded border border-[#e8e2d8] text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] flex items-center justify-center text-xs"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    arrow_upward
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  title="Move Down"
                                  onClick={() => handleMoveOrder(sec, 'down')}
                                  className="w-6 h-6 rounded border border-[#e8e2d8] text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] flex items-center justify-center text-xs"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    arrow_downward
                                  </span>
                                </button>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleEdit(sec)}
                                  className="w-7 h-7 rounded border border-[#e8e2d8] hover:border-[#ae001a] hover:text-[#ae001a] text-[#5f5e5e] flex items-center justify-center transition-colors"
                                  title="Edit Section"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    edit
                                  </span>
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(sec)}
                                  className="w-7 h-7 rounded border border-[#e8e2d8] hover:bg-rose-50 text-rose-500 flex items-center justify-center transition-colors"
                                  title="Delete Section"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    delete
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Section Drawer Modal (Create / Edit) */}
        <QRMenuSectionDrawer
          isOpen={isDrawerOpen}
          mode={drawerMode}
          section={selectedSection}
          menus={menus}
          initialMenuId={
            selectedMenuFilter !== 'ALL' ? selectedMenuFilter : undefined
          }
          onClose={() => setIsDrawerOpen(false)}
          onSuccess={handleDrawerSuccess}
        />

        {/* Dedicated Drag-and-Drop Sequence Sequencer Controller Modal */}
        <QRMenuSectionReorderModal
          isOpen={isReorderModalOpen}
          menus={menus}
          sections={sections}
          initialMenuId={
            selectedMenuFilter !== 'ALL' ? selectedMenuFilter : undefined
          }
          onClose={() => setIsReorderModalOpen(false)}
          onSuccess={(menuId) => {
            loadData();
            showToast(
              `Bulk reorder synchronized! Updated sequences in parent menu #${menuId}.`
            );
          }}
        />

        {/* Cascade Deletion Protection Verification Modal */}
        <CascadeVerificationModal
          isOpen={showDeleteCascadeModal}
          type="delete"
          section={sectionToDelete}
          items={sectionToDelete?.items || []}
          onConfirm={() => {
            if (sectionToDelete) executeDelete(sectionToDelete);
          }}
          onCancel={() => {
            setShowDeleteCascadeModal(false);
            setSectionToDelete(null);
          }}
        />
      </div>
    </div>
  );
};
