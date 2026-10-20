import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import {
  OnlineMenuCategorySetupDrawer,
  type OnlineMenuCategoryFormData,
  type OnlineMenuOption,
  type InventoryCategoryOption,
} from './OnlineMenuCategorySetupDrawer';
import {
  TableOptionsMenu,
  TablePaginationFooter,
  TableEmptyState,
  NoColumnsEmptyState,
  type TableDensity,
} from '../../../../shared/TableOptionsMenu';
import { getDensityPadding } from '../../../../shared/tableOptionsHelpers';

export interface OnlineMenuCategoryItem {
  id: number;
  menuId: number;
  categoryId: number;
  displayOrder: number;
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
  menu?: {
    id: number;
    name: string;
  };
  category?: {
    id: number;
    name: string;
  };
}

export interface DigitalMenuGroup {
  menuId: number;
  menuName: string;
  items: OnlineMenuCategoryItem[];
  activeCount: number;
  totalCount: number;
}

const SESSION_EXPANDED_MENU_KEY = 'x7_online_menu_expanded_id';

interface OnlineMenuCategoriesViewProps {
  onNavigate?: (view: string) => void;
}

export const OnlineMenuCategoriesView: React.FC<OnlineMenuCategoriesViewProps> = ({ onNavigate }) => {
  const [categoriesBound, setCategoriesBound] = useState<OnlineMenuCategoryItem[]>([]);
  const [menus, setMenus] = useState<OnlineMenuOption[]>([]);
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Views
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMenuFilter, setSelectedMenuFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Table options & pagination
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    category: true,
    menu: true,
    sequence: true,
    status: true,
    timestamps: true,
    actions: true,
  });
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Drawer (Create / Edit) State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<OnlineMenuCategoryFormData | null>(null);

  // Archive / Delete Confirmation Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<OnlineMenuCategoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Restore Confirmation Modal
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [itemToRestore, setItemToRestore] = useState<OnlineMenuCategoryItem | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Auto-refresh state
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  // 1. Fetch Digital Menus
  const fetchMenus = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/online-menus?limit=100`, { headers });
      if (res.status === 401) {
        clearAuthSession();
        window.location.assign('/login');
        return;
      }
      if (res.ok) {
        const json = await res.json();
        const rawMenus: Record<string, unknown>[] = Array.isArray(json)
          ? json
          : json.data || json.items || [];
        const mappedMenus: OnlineMenuOption[] = rawMenus.map((m) => ({
          id: Number(m.id),
          name: String(m.name || `Menu #${m.id}`),
          isActive: Boolean(m.is_active ?? m.isActive ?? true),
        }));
        setMenus(mappedMenus);
      }
    } catch (err) {
      console.warn('Error fetching digital menus:', err);
    }
  }, [API_BASE]);

  // 2. Fetch Base Inventory Categories
  const fetchInventoryCategories = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // NestJS backend route is @Controller('category')
      let res = await fetch(`${API_BASE}/category?limit=100`, { headers });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${API_BASE}/categories?limit=100`, { headers });
      }

      if (res.status === 401) {
        clearAuthSession();
        window.location.assign('/login');
        return;
      }
      if (res.ok) {
        const json = await res.json();
        const rawCats: Record<string, unknown>[] = Array.isArray(json)
          ? json
          : Array.isArray(json.data)
          ? json.data
          : Array.isArray(json.items)
          ? json.items
          : [];
        const mappedCats: InventoryCategoryOption[] = rawCats.map((c) => ({
          id: Number(c.id),
          name: String(c.name || `Category #${c.id}`),
          isActive: Boolean(c.isActive ?? true),
        }));
        setInventoryCategories(mappedCats);
      }
    } catch (err) {
      console.warn('Error fetching inventory categories:', err);
    }
  }, [API_BASE]);

  // 3. Fetch Online Menu Categories
  const fetchMenuCategories = useCallback(
    async (silent: boolean = false) => {
      try {
        if (!silent) setIsLoading(true);
        setIsRefreshing(true);
        setError(null);
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const res = await fetch(
          `${API_BASE}/online-menu-categories?limit=100&sortBy=displayOrder&sortOrder=ASC&status=ALL`,
          { headers }
        );

        if (res.status === 401) {
          clearAuthSession();
          window.location.assign('/login');
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load menu categories (${res.status})`);
        }

        const json = await res.json();
        const rawItems: Record<string, unknown>[] = Array.isArray(json)
          ? json
          : json.data || json.items || [];

        const mappedItems: OnlineMenuCategoryItem[] = rawItems.map((raw) => {
          const menuObj = raw.menu as { id: number; name: string } | undefined;
          const catObj = raw.category as { id: number; name: string } | undefined;

          return {
            id: Number(raw.id),
            menuId: Number(raw.menuId ?? raw.menu_id),
            categoryId: Number(raw.categoryId ?? raw.category_id),
            displayOrder: Number(raw.displayOrder ?? raw.display_order ?? 0),
            status: String(raw.status || 'active').toLowerCase() === 'deleted' ? 'deleted' : 'active',
            createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
            updatedAt: String(raw.updatedAt || raw.updated_at || new Date().toISOString()),
            menu: menuObj ? { id: Number(menuObj.id), name: String(menuObj.name) } : undefined,
            category: catObj ? { id: Number(catObj.id), name: String(catObj.name) } : undefined,
          };
        });

        // Strict sorting by displayOrder ascending
        mappedItems.sort((a, b) => a.displayOrder - b.displayOrder);
        setCategoriesBound(mappedItems);
        setLastUpdated(new Date());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error fetching menu categories';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [API_BASE]
  );

  useEffect(() => {
    fetchMenus();
    fetchInventoryCategories();
    fetchMenuCategories();
  }, [fetchMenus, fetchInventoryCategories, fetchMenuCategories]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const intervalId = setInterval(() => {
      fetchMenuCategories(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, fetchMenuCategories]);

  // KPIs
  const kpiTotal = categoriesBound.length;
  const kpiActive = categoriesBound.filter((c) => c.status === 'active').length;
  const kpiArchived = categoriesBound.filter((c) => c.status === 'deleted').length;
  const kpiDistinctMenus = useMemo(() => {
    return new Set(categoriesBound.filter((c) => c.status === 'active').map((c) => c.menuId)).size;
  }, [categoriesBound]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return categoriesBound.filter((item) => {
      // Menu filter
      if (selectedMenuFilter !== 'all' && item.menuId !== Number(selectedMenuFilter)) {
        return false;
      }

      // Status filter
      if (statusFilter === 'ACTIVE' && item.status !== 'active') return false;
      if (statusFilter === 'ARCHIVED' && item.status !== 'deleted') return false;

      // Universal search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const catName = item.category?.name?.toLowerCase() || '';
        const menuName = item.menu?.name?.toLowerCase() || '';
        const catBadge = `#cat-${item.categoryId}`.toLowerCase();
        const menuBadge = `#mnu-${item.menuId}`.toLowerCase();
        const idBadge = `#${item.id}`;

        const matches =
          catName.includes(q) ||
          menuName.includes(q) ||
          catBadge.includes(q) ||
          menuBadge.includes(q) ||
          idBadge.includes(q);

        if (!matches) return false;
      }

      return true;
    })
    .sort((a, b) => {
      // 1. Group by digital menu first so categories of the same menu stay together
      if (a.menuId !== b.menuId) {
        return a.menuId - b.menuId;
      }
      // 2. Active bindings first, Archived bindings last
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1;
      }
      // 3. Sequential display order
      return a.displayOrder - b.displayOrder || a.id - b.id;
    });
  }, [categoriesBound, selectedMenuFilter, statusFilter, searchQuery]);

  // Group filtered items by digital menu
  const menuGroups = useMemo<DigitalMenuGroup[]>(() => {
    const map = new Map<number, DigitalMenuGroup>();
    const groups: DigitalMenuGroup[] = [];

    for (const item of filteredItems) {
      let grp = map.get(item.menuId);
      if (!grp) {
        grp = {
          menuId: item.menuId,
          menuName: item.menu?.name || `Digital Menu #${item.menuId}`,
          items: [],
          activeCount: 0,
          totalCount: 0,
        };
        map.set(item.menuId, grp);
        groups.push(grp);
      }
      grp.items.push(item);
      grp.totalCount += 1;
      if (item.status === 'active') {
        grp.activeCount += 1;
      }
    }

    return groups;
  }, [filteredItems]);

  // Active expanded Digital Menu ID (persisted across auto-refresh & page reloads; null by default)
  const [expandedMenuId, setExpandedMenuId] = useState<number | null>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_EXPANDED_MENU_KEY);
      return saved !== null && !isNaN(Number(saved)) ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  const toggleMenuCollapse = (menuId: number) => {
    setExpandedMenuId((prev) => {
      const next = prev === menuId ? null : menuId;
      try {
        if (next !== null) {
          sessionStorage.setItem(SESSION_EXPANDED_MENU_KEY, String(next));
        } else {
          sessionStorage.removeItem(SESSION_EXPANDED_MENU_KEY);
        }
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Paginated Menu Groups
  const totalPages = Math.max(1, Math.ceil(menuGroups.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedGroups = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return menuGroups.slice(start, start + pageSize);
  }, [menuGroups, safeCurrentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  // Helper to check if an item can move up/down within its menu sequence
  const getMoveOrderAvailability = useCallback(
    (item: OnlineMenuCategoryItem) => {
      const sameMenuCategories = categoriesBound
        .filter((c) => c.menuId === item.menuId && c.status === 'active')
        .sort((a, b) => {
          if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
          return a.id - b.id;
        });
      const index = sameMenuCategories.findIndex((c) => c.id === item.id);
      return {
        canMoveUp: index > 0,
        canMoveDown: index !== -1 && index < sameMenuCategories.length - 1,
      };
    },
    [categoriesBound]
  );

  // Reorder Handler (Move Up / Down with Swap)
  const handleMoveOrder = async (item: OnlineMenuCategoryItem, direction: 'up' | 'down') => {
    // 1. Get all active categories for the same menu ordered by displayOrder
    const sameMenuCategories = categoriesBound
      .filter((c) => c.menuId === item.menuId && c.status === 'active')
      .sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.id - b.id;
      });

    const currentIndex = sameMenuCategories.findIndex((c) => c.id === item.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sameMenuCategories.length) return;

    // Reorder array by moving the item to targetIndex
    const reordered = [...sameMenuCategories];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Build map of new strict 1-based display orders
    const orderMap = new Map<number, number>();
    reordered.forEach((c, idx) => {
      orderMap.set(c.id, idx + 1);
    });

    // 2. Optimistic Update (all items in the menu updated cleanly)
    setCategoriesBound((prev) =>
      prev
        .map((c) => {
          if (orderMap.has(c.id)) {
            return { ...c, displayOrder: orderMap.get(c.id)! };
          }
          return c;
        })
        .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
    );

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/online-menu-categories/${item.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ displayOrder: targetIndex + 1 }),
      });
      if (!res.ok) {
        await fetch(`${API_BASE}/online-menu-categories/${item.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ displayOrder: targetIndex + 1 }),
        });
      }

      showToast(`Updated order: ${item.category?.name || 'Category'} moved ${direction}`);
      fetchMenuCategories(true);
    } catch (err) {
      console.error('Error updating order:', err);
      fetchMenuCategories(true);
    }
  };

  // Submit Drawer (Create / Update)
  const handleSaveDrawer = async (data: OnlineMenuCategoryFormData) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    if (drawerMode === 'create') {
      const res = await fetch(`${API_BASE}/online-menu-categories`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          menuId: data.menuId,
          categoryId: data.categoryId,
          displayOrder: data.displayOrder,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to bind category (${res.status})`);
      }
      showToast('Category successfully bound to digital menu!');
    } else if (drawerMode === 'edit' && data.id) {
      const res = await fetch(`${API_BASE}/online-menu-categories/${data.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          menuId: data.menuId,
          categoryId: data.categoryId,
          displayOrder: data.displayOrder,
          status: data.status,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to update category binding (${res.status})`);
      }
      showToast('Category binding updated successfully!');
    }

    await fetchMenuCategories(true);
  };

  // Soft Delete / Archive Handler
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/online-menu-categories/${itemToDelete.id}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to archive category (${res.status})`);
      }

      showToast(`Category "${itemToDelete.category?.name || 'Category'}" archived successfully`);
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      await fetchMenuCategories(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error archiving category';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Restore Handler
  const handleConfirmRestore = async () => {
    if (!itemToRestore) return;
    try {
      setIsRestoring(true);
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/online-menu-categories/${itemToRestore.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'active' }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to restore category (${res.status})`);
      }

      showToast(`Category "${itemToRestore.category?.name || 'Category'}" restored to active in menu!`);
      setIsRestoreModalOpen(false);
      setItemToRestore(null);
      await fetchMenuCategories(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error restoring category';
      console.error('Error restoring category:', err);
      showToast(msg);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenCreateDrawer = () => {
    if (inventoryCategories.length === 0) fetchInventoryCategories();
    if (menus.length === 0) fetchMenus();
    setDrawerMode('create');
    setEditingItem(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEditDrawer = (item: OnlineMenuCategoryItem) => {
    if (inventoryCategories.length === 0) fetchInventoryCategories();
    if (menus.length === 0) fetchMenus();
    setDrawerMode('edit');
    setEditingItem({
      id: item.id,
      menuId: item.menuId,
      categoryId: item.categoryId,
      displayOrder: item.displayOrder,
      status: item.status,
    });
    setIsDrawerOpen(true);
  };

  // Action menu handlers for TableOptionsMenu
  const handleExportCSV = () => {
    if (!filteredItems || filteredItems.length === 0) return;
    const headers = ['ID', 'Category ID', 'Category Name', 'Menu ID', 'Menu Name', 'Display Sequence', 'Status', 'Created At', 'Updated At'];
    const rows = filteredItems.map((item) => [
      item.id,
      item.categoryId,
      `"${(item.category?.name || `Category #${item.categoryId}`).replace(/"/g, '""')}"`,
      item.menuId,
      `"${(item.menu?.name || `Menu #${item.menuId}`).replace(/"/g, '""')}"`,
      item.displayOrder,
      item.status === 'active' ? 'Active' : 'Archived',
      item.createdAt,
      item.updatedAt,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `online_menu_categories_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintTable = () => {
    window.print();
  };

  const handleCopySummary = () => {
    if (!filteredItems || filteredItems.length === 0) return;
    const text = filteredItems
      .map(
        (item) =>
          `#${item.id} #CAT-${item.categoryId} ${item.category?.name || 'Category'} -> #MNU-${item.menuId} ${
            item.menu?.name || 'Menu'
          } [Order: ${item.displayOrder}] [${item.status === 'active' ? 'ACTIVE' : 'ARCHIVED'}]`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    showToast('Category directory list copied to clipboard!');
  };

  const densityPadding = getDensityPadding(rowDensity);
  const dataColumnsCount =
    (visibleColumns.category ? 1 : 0) +
    (visibleColumns.menu ? 1 : 0) +
    (visibleColumns.sequence ? 1 : 0) +
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
      {/* Toast Notification */}
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
              category
            </span>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
              ONLINE MENU CATEGORIES WORKSPACE
            </h2>
          </div>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Bind product inventory categories to online digital menus, organize display sequence for customer storefronts, and manage operational lifecycles.
          </p>
        </div>
      </div>

      {/* 2. Hero KPIs Strip (KDS KitchenDisplayDevices layout: flex items-center justify-between) */}
      <div className="grid grid-cols-4 gap-4 w-full">
        {/* KPI 1: Total Bound Categories */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shrink-0">
              <span className="material-symbols-outlined text-xl">category</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Total Bound
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {isLoading ? '...' : kpiTotal}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
            CATEGORIES
          </span>
        </div>

        {/* KPI 2: Active in Menu */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">check_circle</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Active
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {isLoading ? '...' : kpiActive}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
            ACTIVE
          </span>
        </div>

        {/* KPI 3: Archived / Deleted */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200 shrink-0">
              <span className="material-symbols-outlined text-xl">pause_circle</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Archived / Deleted
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {isLoading ? '...' : kpiArchived}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
            ARCHIVED
          </span>
        </div>

        {/* KPI 4: Covered Menus */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200 shrink-0">
              <span className="material-symbols-outlined text-xl">restaurant_menu</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Covered Menus
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {isLoading ? '...' : kpiDistinctMenus}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
            MENUS
          </span>
        </div>
      </div>

      {/* 3. Unified Multi-Dimensional Filter Bar Controls (Standard layout) */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-3.5">
        {/* ROW 1: Search, Menu Filter, View Mode Switcher, Auto-Refresh & Updated Timestamp */}
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
                placeholder="Search categories by name, menu..."
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

            {/* Menu Association Dropdown Selector */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="material-symbols-outlined text-base">restaurant_menu</span>
              <select
                value={selectedMenuFilter}
                onChange={(e) => {
                  setSelectedMenuFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-[34px] px-3 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] text-xs focus:border-[#ae001a] outline-none font-poppins text-[#1d1c17] cursor-pointer max-w-[220px] transition-colors duration-200"
                aria-label="Filter by digital menu"
              >
                <option value="all">All Digital Menus ({menus.length})</option>
                {menus.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name} (#{m.id})
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
                onClick={() => void fetchMenuCategories(true)}
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

        {/* ROW 1.5: Menu Context Quick Tabs */}
        {menus.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-2.5 border-t border-[#f0ede6] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#5f5e5e] shrink-0 mr-1 font-poppins">
              Menu Context:
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedMenuFilter('all');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold font-poppins transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedMenuFilter === 'all'
                  ? 'bg-[#1d1c17] text-white border-[#1d1c17] shadow-xs font-bold'
                  : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
              }`}
            >
              <span>All Menus</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                  selectedMenuFilter === 'all' ? 'bg-white/20 text-white' : 'bg-[#e8e2d8] text-[#5f5e5e]'
                }`}
              >
                {categoriesBound.length}
              </span>
            </button>
            {menus.map((m) => {
              const count = categoriesBound.filter((c) => c.menuId === m.id).length;
              const isSelected = selectedMenuFilter === String(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMenuFilter(isSelected ? 'all' : String(m.id));
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold font-poppins transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                    isSelected
                      ? 'bg-purple-800 text-white border-purple-800 shadow-xs font-bold'
                      : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100 hover:text-purple-950'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">restaurant_menu</span>
                  <span>{m.name}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ROW 2: STATUS Multi-Select Pills & Bind Category Action */}
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
                {kpiTotal}
              </span>
            </button>

            {/* Active Pill (Icon: check_circle, #10b981) */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'ACTIVE' ? 'All' : 'ACTIVE');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-poppins transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70 hover:text-emerald-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">check_circle</span>
              <span>ACTIVE</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold font-poppins ${
                  statusFilter === 'ACTIVE' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {kpiActive}
              </span>
            </button>

            {/* Archived Pill (Icon: pause_circle, #64748b) */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'ARCHIVED' ? 'All' : 'ARCHIVED');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-poppins transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                statusFilter === 'ARCHIVED'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200/60 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">pause_circle</span>
              <span>ARCHIVED</span>
              <span
                className={`text-[8.5px] px-1 py-0 rounded-full font-bold font-poppins ${
                  statusFilter === 'ARCHIVED' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {kpiArchived}
              </span>
            </button>
          </div>

          {/* Primary Action Button: BIND CATEGORY */}
          <button
            type="button"
            onClick={handleOpenCreateDrawer}
            className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer shrink-0 ml-auto"
            title="Bind new category to digital menu"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            BIND CATEGORY
          </button>
        </div>
      </div>

      {/* Main Content Area (Table View vs Cards Grid View) */}
      {viewMode === 'table' ? (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          {/* Dark Header #222222 with Full Options Dropdown Menu */}
          <div className="p-4 bg-[#222222] flex justify-between items-center relative">
            <div className="flex items-center gap-3">
              <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
                MENU CATEGORY DIRECTORY
              </span>
              <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
                {paginatedGroups.length === menuGroups.length
                  ? `${menuGroups.length} menu${menuGroups.length === 1 ? '' : 's'} (${filteredItems.length} categories)`
                  : `${paginatedGroups.length} / ${menuGroups.length} menus (${filteredItems.length} categories)`}
              </span>
            </div>

            <TableOptionsMenu
              onExportCSV={handleExportCSV}
              onPrint={handlePrintTable}
              onCopySummary={handleCopySummary}
              onReload={() => void fetchMenuCategories(true)}
              columns={[
                { key: 'category', label: 'Category & ID' },
                { key: 'menu', label: 'Digital Menu Context' },
                { key: 'sequence', label: 'Display Sequence' },
                { key: 'status', label: 'Status' },
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
              totalItems={menuGroups.length}
              pageSize={pageSize}
              onChangePageSize={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              currentPage={safeCurrentPage}
              onPageChange={setCurrentPage}
              totalPages={totalPages}
            />
          </div>

          {dataColumnsCount === 0 ? (
            <NoColumnsEmptyState />
          ) : (
            <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full table-fixed border-collapse font-sans text-xs">
                <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                  <tr>
                    {visibleColumns.category && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-52`}>
                        Category Name
                      </th>
                    )}
                    {visibleColumns.menu && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-48`}>
                        Menu Context
                      </th>
                    )}
                    {visibleColumns.sequence && (
                      <th className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-44`}>
                        Display Sequence
                      </th>
                    )}
                    {visibleColumns.status && (
                      <th className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-40`}>
                        Status
                      </th>
                    )}
                    {visibleColumns.timestamps && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-44`}>
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
                        <p className="text-secondary text-body-md mt-2 font-sans">Loading category bindings...</p>
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
                          onClick={() => void fetchMenuCategories()}
                          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                        >
                          Retry Connection
                        </button>
                      </td>
                    </tr>
                  ) : categoriesBound.length === 0 ? (
                    <TableEmptyState
                      colSpan={activeColSpan}
                      icon="category"
                      title="No category bindings found"
                      description="Click 'Bind Category' to link an inventory category to a digital menu."
                    />
                  ) : filteredItems.length === 0 ? (
                    <TableEmptyState
                      colSpan={activeColSpan}
                      icon="category"
                      title="No matching categories"
                      description="No menu category bindings match your selected filter criteria."
                    />
                  ) : (
                    paginatedGroups.map((group) => {
                      const isExpanded = expandedMenuId === group.menuId;

                      return (
                        <React.Fragment key={group.menuId}>
                          <tr
                            className="bg-[#f7f4ee] hover:bg-[#efe9de] border-y-2 border-[#e2dcd2] cursor-pointer transition-colors select-none group/menu"
                            onClick={() => toggleMenuCollapse(group.menuId)}
                            title={isExpanded ? `Click to collapse ${group.menuName}` : `Click to expand ${group.menuName}`}
                          >
                            <td colSpan={activeColSpan} className="py-2.5 px-4 font-sans">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className={`material-symbols-outlined text-[18px] text-[#5f5e5e] group-hover/menu:text-[#ae001a] transition-transform duration-200 ${
                                      isExpanded ? 'rotate-90' : ''
                                    }`}
                                  >
                                    chevron_right
                                  </span>
                                  <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center border border-purple-200 shrink-0">
                                    <span className="material-symbols-outlined text-[15px]">restaurant_menu</span>
                                  </div>
                                  <span className="font-bold text-xs text-[#1d1c17] uppercase tracking-wide font-poppins">
                                    {group.menuName}
                                  </span>
                                  <span className="text-[10px] text-[#8c857b] font-mono font-bold bg-[#ece8e0] px-1.5 py-0.5 rounded">
                                    #MNU-{group.menuId}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded font-poppins">
                                    {group.activeCount} Active {group.activeCount === 1 ? 'Section' : 'Sections'}
                                  </span>
                                  <span className="text-[10px] font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] px-2 py-0.5 rounded font-poppins">
                                    {group.totalCount} Total {group.totalCount === 1 ? 'Category' : 'Categories'}
                                  </span>
                                  <span className="text-[10px] text-[#5f5e5e] font-bold uppercase tracking-wider ml-1 group-hover/menu:text-[#ae001a] transition-colors">
                                    {isExpanded ? 'Collapse' : 'Expand'}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {isExpanded &&
                            group.items.map((item) => (
                              <tr
                                key={item.id}
                                className="hover:bg-[#f8f3eb] transition-colors duration-200 group border-l-4 border-l-purple-500/20"
                              >
                                {/* Column 1: Category Name */}
                                {visibleColumns.category && (
                                  <td className={`${densityPadding} font-sans pl-8`}>
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-[14px] text-[#8c857b] shrink-0">
                                        subdirectory_arrow_right
                                      </span>
                                      <span className="font-bold text-xs text-[#1d1c17] truncate group-hover:text-[#ae001a] transition-colors duration-200 font-poppins" title={item.category?.name}>
                                        {item.category?.name || `Category #${item.categoryId}`}
                                      </span>
                                    </div>
                                  </td>
                                )}

                        {/* Column 2: Digital Menu Context */}
                        {visibleColumns.menu && (
                          <td className={`${densityPadding} font-sans`}>
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="material-symbols-outlined text-base text-purple-600 shrink-0">
                                restaurant_menu
                              </span>
                              <span className="font-medium text-[#1d1c17] truncate font-poppins" title={item.menu?.name}>
                                {item.menu?.name || `Menu #${item.menuId}`}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#5f5e5e] font-mono block pl-5 font-poppins">
                              #MNU-{item.menuId}
                            </span>
                          </td>
                        )}

                        {/* Column 3: Display Sequence */}
                        {visibleColumns.sequence && (
                          <td className={`${densityPadding} text-center font-sans`}>
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20">
                                #{item.displayOrder}
                              </span>
                              {item.status === 'active' && (() => {
                                const { canMoveUp, canMoveDown } = getMoveOrderAvailability(item);
                                return (
                                  <div className="flex items-center gap-0.5 ml-1">
                                    <button
                                      type="button"
                                      onClick={() => handleMoveOrder(item, 'up')}
                                      disabled={!canMoveUp}
                                      className="p-0.5 text-[#5f5e5e] hover:text-[#ae001a] disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                      title={canMoveUp ? "Move Up in Sequence" : "Already at top of menu"}
                                    >
                                      <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveOrder(item, 'down')}
                                      disabled={!canMoveDown}
                                      className="p-0.5 text-[#5f5e5e] hover:text-[#ae001a] disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                      title={canMoveDown ? "Move Down in Sequence" : "Already at bottom of menu"}
                                    >
                                      <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                        )}

                        {/* Column 4: Status */}
                        {visibleColumns.status && (
                          <td className={`${densityPadding} text-center font-sans`}>
                            {item.status === 'active' ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-2xs tracking-wide uppercase font-poppins"
                                style={{ backgroundColor: '#10b981' }}
                              >
                                <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                Active
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-2xs tracking-wide uppercase font-poppins"
                                style={{ backgroundColor: '#64748b' }}
                              >
                                <span className="material-symbols-outlined text-[12px]">pause_circle</span>
                                Archived
                              </span>
                            )}
                          </td>
                        )}

                        {/* Column 5: Timestamps */}
                        {visibleColumns.timestamps && (
                          <td className={`${densityPadding} text-xs font-sans whitespace-nowrap`}>
                            <div className="flex flex-col gap-0.5 leading-tight">
                              <div className="text-[11px] text-[#1d1c17] flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-[#8c857b] font-normal text-[10px]">Created:</span>
                                <span className="text-[#1d1c17] text-[10.5px]">
                                  {formatDate(item.createdAt)}
                                </span>
                              </div>
                              {item.updatedAt && item.updatedAt !== item.createdAt && (
                                <div className="text-[11px] text-[#1d1c17] flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="text-[#8c857b] font-normal text-[10px]">Updated:</span>
                                  <span className="text-[#1d1c17] text-[10.5px]">
                                    {formatDate(item.updatedAt)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Column 6: Actions */}
                        {visibleColumns.actions && (
                          <td className={`text-center whitespace-nowrap ${densityPadding}`}>
                            <div className="flex justify-center gap-3">
                              {item.status === 'active' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDrawer(item)}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                                    title="Edit Category Binding"
                                  >
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setItemToDelete(item);
                                      setIsDeleteModalOpen(true);
                                    }}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                                    title="Archive Category"
                                  >
                                    <span className="material-symbols-outlined text-[20px]">block</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setItemToRestore(item);
                                    setIsRestoreModalOpen(true);
                                  }}
                                  className="p-1 text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                                  title="Restore Category"
                                >
                                  <span className="material-symbols-outlined text-[18px]">settings_backup_restore</span>
                                  <span>Restore</span>
                                </button>
                              )}
                            </div>
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
          )}

          {/* Table Pagination Footer */}
          <TablePaginationFooter
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={menuGroups.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[5, 10, 20, 50]}
          />
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          style={{ textAlign: 'center' }}
          className="bg-white rounded-xl border border-[#e8e2d8] p-12 flex flex-col items-center justify-center text-center shadow-sm w-full mx-auto"
        >
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-400 flex items-center justify-center mx-auto mb-3 shrink-0">
            <span className="material-symbols-outlined text-2xl">category</span>
          </div>
          <h3
            style={{ textAlign: 'center' }}
            className="text-sm font-bold text-[#1d1c17] uppercase tracking-wide text-center w-full font-poppins"
          >
            No Category Bindings Found
          </h3>
          <p
            style={{ textAlign: 'center', margin: '0.25rem auto 0 auto' }}
            className="text-xs text-[#5f5e5e] max-w-md mx-auto text-center leading-relaxed w-full font-poppins"
          >
            {searchQuery || selectedMenuFilter !== 'all' || statusFilter !== 'All'
              ? 'No menu category bindings match your current filter criteria. Clear filters to see all categories.'
              : 'Bind your first inventory category to a digital menu to sequence customer storefront sections.'}
          </p>
        </div>
      ) : (
        /* CARDS GRID VIEW */
        <div className="flex flex-col gap-6">
          {paginatedGroups.map((group) => {
            const isExpanded = expandedMenuId === group.menuId;

            return (
              <div key={group.menuId} className="flex flex-col gap-3">
                {/* Section Header for Menu (Collapsible Accordion) */}
                <div
                  className="flex items-center justify-between bg-[#fcfaf7] hover:bg-[#f6f2ea] border border-[#e8e2d8] px-4 py-2.5 rounded-xl shadow-2xs cursor-pointer select-none transition-colors group/menu"
                  onClick={() => toggleMenuCollapse(group.menuId)}
                  title={isExpanded ? `Click to collapse ${group.menuName}` : `Click to expand ${group.menuName}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`material-symbols-outlined text-[18px] text-[#5f5e5e] group-hover/menu:text-[#ae001a] transition-transform duration-200 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    >
                      chevron_right
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center border border-purple-200 shrink-0">
                      <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
                    </div>
                    <span className="font-bold text-xs text-[#1d1c17] uppercase tracking-wide font-poppins">
                      {group.menuName}
                    </span>
                    <span className="text-[10px] text-[#8c857b] font-mono font-bold bg-[#ece8e0] px-1.5 py-0.5 rounded">
                      #MNU-{group.menuId}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded font-poppins">
                      {group.activeCount} Active
                    </span>
                    <span className="text-[10px] font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] px-2 py-0.5 rounded font-poppins">
                      {group.totalCount} {group.totalCount === 1 ? 'Category' : 'Categories'}
                    </span>
                    <span className="text-[10px] text-[#5f5e5e] font-bold uppercase tracking-wider ml-1 group-hover/menu:text-[#ae001a] transition-colors">
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </span>
                  </div>
                </div>

                {/* Cards in this Menu (only if expanded) */}
                {isExpanded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border border-[#e8e2d8] rounded p-5 shadow-xs hover:border-[#ae001a] transition-all duration-200 flex flex-col justify-between group"
                      >
                        <div>
                          {/* Header: Title & Status */}
                          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#f0ede6]">
                            <h3 className="font-bold text-sm text-[#1d1c17] group-hover:text-[#ae001a] transition-colors font-poppins truncate" title={item.category?.name}>
                              {item.category?.name || `Category #${item.categoryId}`}
                            </h3>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.status === 'active' ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-poppins text-white shadow-2xs tracking-wide uppercase"
                                  style={{ backgroundColor: '#10b981' }}
                                >
                                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                  Active
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-poppins text-white shadow-2xs tracking-wide uppercase"
                                  style={{ backgroundColor: '#64748b' }}
                                >
                                  <span className="material-symbols-outlined text-[12px]">pause_circle</span>
                                  Archived
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Bound Menu Context */}
                          <div className="flex items-center justify-between gap-1.5 mt-2 text-xs text-[#5f5e5e] bg-[#fcfcfb] p-2 rounded border border-[#e8e2d8]">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="material-symbols-outlined text-base text-purple-600">restaurant_menu</span>
                              <span className="font-medium text-[#1d1c17] truncate font-poppins">
                                {item.menu?.name || `Menu #${item.menuId}`}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] font-bold text-[#ae001a] bg-red-50 px-2 py-0.5 rounded border border-red-200 shrink-0">
                              #Order: {item.displayOrder}
                            </span>
                          </div>
                        </div>

                        {/* Card Footer */}
                        <div className="mt-4 pt-3 border-t border-[#f0ede6] flex items-center justify-between text-xs text-[#5f5e5e]">
                          <span className="text-[11px] text-[#8c857b]">
                            Created: {formatDate(item.createdAt)}
                          </span>

                          <div className="flex items-center gap-3">
                            {item.status === 'active' ? (() => {
                              const { canMoveUp, canMoveDown } = getMoveOrderAvailability(item);
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveOrder(item, 'up')}
                                    disabled={!canMoveUp}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    title={canMoveUp ? "Move Up" : "Already at top"}
                                  >
                                    <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveOrder(item, 'down')}
                                    disabled={!canMoveDown}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    title={canMoveDown ? "Move Down" : "Already at bottom"}
                                  >
                                    <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDrawer(item)}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                                    title="Edit Binding"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setItemToDelete(item);
                                      setIsDeleteModalOpen(true);
                                    }}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                                    title="Archive Binding"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">block</span>
                                  </button>
                                </>
                              );
                            })() : (
                              <button
                                type="button"
                                onClick={() => {
                                  setItemToRestore(item);
                                  setIsRestoreModalOpen(true);
                                }}
                                className="p-1 text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                                title="Restore Binding"
                              >
                                <span className="material-symbols-outlined text-[18px]">settings_backup_restore</span>
                                <span>Restore</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Cards Pagination */}
          <div className="bg-white border border-[#e8e2d8] rounded shadow-xs overflow-hidden">
            <TablePaginationFooter
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={menuGroups.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10, 20, 50]}
            />
          </div>
        </div>
      )}

      {/* Drawer Component for Category Binding Creation & Editing */}
      <OnlineMenuCategorySetupDrawer
        isOpen={isDrawerOpen}
        mode={drawerMode}
        initialData={editingItem}
        menus={menus}
        categories={inventoryCategories}
        existingBindings={categoriesBound}
        onClose={() => setIsDrawerOpen(false)}
        onSubmit={handleSaveDrawer}
      />

      {/* Archive / Delete Confirmation Modal */}
      {isDeleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 z-[10000] overflow-y-auto flex items-center justify-center p-4 font-sans">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => !isDeleting && setIsDeleteModalOpen(false)}
          />

          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 animate-scale-in text-left">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-50 border border-red-100 text-[#ae001a]">
                <span className="material-symbols-outlined text-2xl block select-none">
                  delete_forever
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  Confirm Category Archiving
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to archive{' '}
                  <strong className="text-zinc-800">
                    "{itemToDelete.category?.name || `Category #${itemToDelete.categoryId}`}"
                  </strong>{' '}
                  from digital menu{' '}
                  <span className="font-semibold text-zinc-700">
                    "{itemToDelete.menu?.name || `Menu #${itemToDelete.menuId}`}"
                  </span>
                  ? This performs a logical soft-delete and hides this section from the customer storefront.
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
                  setItemToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-body-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all duration-200 cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
                className="px-4 py-2 text-white text-body-xs font-bold rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-sans bg-red-600 hover:bg-[#ae001a]"
              >
                {isDeleting ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin block">sync</span>
                    <span>Archiving...</span>
                  </>
                ) : (
                  <span>Archive Category</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {isRestoreModalOpen && itemToRestore && (
        <div className="fixed inset-0 z-[10000] overflow-y-auto flex items-center justify-center p-4 font-sans">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => !isRestoring && setIsRestoreModalOpen(false)}
          />

          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 animate-scale-in text-left">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-emerald-50 border border-emerald-100 text-emerald-600">
                <span className="material-symbols-outlined text-2xl block select-none">
                  settings_backup_restore
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  Confirm Category Restoration
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Restore{' '}
                  <strong className="text-zinc-800">
                    "{itemToRestore.category?.name || `Category #${itemToRestore.categoryId}`}"
                  </strong>{' '}
                  to active status in digital menu{' '}
                  <span className="font-semibold text-zinc-700">
                    "{itemToRestore.menu?.name || `Menu #${itemToRestore.menuId}`}"
                  </span>
                  ? This category section will immediately become visible to customers again.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setItemToRestore(null);
                }}
                disabled={isRestoring}
                className="px-4 py-2 text-body-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all duration-200 cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRestore()}
                disabled={isRestoring}
                className="px-4 py-2 text-white text-body-xs font-bold rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-sans bg-emerald-600 hover:bg-emerald-700"
              >
                {isRestoring ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin block">sync</span>
                    <span>Restoring...</span>
                  </>
                ) : (
                  <span>Restore Category</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
