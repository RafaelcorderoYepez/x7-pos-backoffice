import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import {
  OnlineMenuItemSetupDrawer,
  type OnlineMenuItemFormData,
  type OnlineMenuOption,
  type InventoryProductOption,
  type InventoryVariantOption,
} from './OnlineMenuItemSetupDrawer';
import {
  TableOptionsMenu,
  TablePaginationFooter,
  TableEmptyState,
  NoColumnsEmptyState,
  type TableDensity,
} from '../../../../shared/TableOptionsMenu';
import { getDensityPadding } from '../../../../shared/tableOptionsHelpers';

export interface OnlineMenuItem {
  id: number;
  menuId: number;
  productId: number;
  variantId: number | null;
  isAvailable: boolean;
  priceOverride: number | null;
  displayOrder: number;
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
  menu?: {
    id: number;
    name: string;
  };
  product?: {
    id: number;
    name: string;
    sku?: string;
    basePrice: number;
  };
  variant?: {
    id: number;
    name: string;
    price: number;
    sku?: string;
  } | null;
}

export interface DigitalMenuGroup {
  menuId: number;
  menuName: string;
  items: OnlineMenuItem[];
  activeCount: number;
  totalCount: number;
}

const SESSION_EXPANDED_MENU_KEY = 'x7pos_menu_items_expanded_menu';

interface OnlineMenuItemsViewProps {
  onNavigate?: (view: string) => void;
}

export const OnlineMenuItemsView: React.FC<OnlineMenuItemsViewProps> = ({ onNavigate }) => {
  const [menuItems, setMenuItems] = useState<OnlineMenuItem[]>([]);
  const [menus, setMenus] = useState<OnlineMenuOption[]>([]);
  const [products, setProducts] = useState<InventoryProductOption[]>([]);
  const [variants, setVariants] = useState<InventoryVariantOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active expanded Digital Menu ID (persisted across auto-refresh & page reloads)
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

  // Filters & Views
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMenuFilter, setSelectedMenuFilter] = useState<string>('all');
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const handleToggleStatusFilter = (statusKey: string) => {
    if (statusKey === 'All') {
      setSelectedStatusFilters([]);
      setCurrentPage(1);
      return;
    }
    setSelectedStatusFilters((prev) => {
      const exists = prev.includes(statusKey);
      if (exists) {
        return prev.filter((s) => s !== statusKey);
      } else {
        return [...prev, statusKey];
      }
    });
    setCurrentPage(1);
  };

  // Table options & pagination
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    item: true,
    menu: true,
    sequence: true,
    pricing: true,
    availability: true,
    timestamps: true,
    actions: true,
  });
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Drawer (Create / Edit) State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<OnlineMenuItemFormData | null>(null);

  // Archive / Delete Confirmation Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<OnlineMenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Restore Confirmation Modal
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [itemToRestore, setItemToRestore] = useState<OnlineMenuItem | null>(null);
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
      if (!res.ok) return;
      const data = await res.json();
      const raw = data.data || [];
      const mapped: OnlineMenuOption[] = raw.map((m: { id: number; name: string }) => ({
        id: m.id,
        name: m.name,
      }));
      mapped.sort((a, b) => a.id - b.id);
      setMenus(mapped);
    } catch (err) {
      console.error('Error loading menus:', err);
    }
  }, [API_BASE]);

  // 2. Fetch Catalog Products & Variants
  const fetchCatalogData = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const [prodRes, varRes] = await Promise.all([
        fetch(`${API_BASE}/products?limit=100`, { headers }),
        fetch(`${API_BASE}/variants?limit=100`, { headers }).catch(() => null),
      ]);

      if (prodRes.ok) {
        const prodData = await prodRes.json();
        const rawProds = prodData.data || [];
        setProducts(
          rawProds.map((p: { id: number; name: string; sku?: string; basePrice?: number | string }) => ({
            id: p.id,
            name: p.name,
            sku: p.sku || '',
            basePrice: parseFloat(String(p.basePrice || 0)),
          }))
        );
      }

      if (varRes && varRes.ok) {
        const varData = await varRes.json();
        const rawVars = varData.data || [];
        setVariants(
          rawVars.map((v: { id: number; productId?: number; product?: { id: number }; name: string; sku?: string; price?: number | string }) => ({
            id: v.id,
            productId: v.productId || v.product?.id || 0,
            name: v.name,
            sku: v.sku || '',
            price: parseFloat(String(v.price || 0)),
          }))
        );
      }
    } catch (err) {
      console.error('Error loading catalog products/variants:', err);
    }
  }, [API_BASE]);

  // 3. Fetch Online Menu Items (all status)
  const fetchMenuItems = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);
        setError(null);

        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const res = await fetch(`${API_BASE}/online-menu-items?limit=100&status=all`, { headers });
        if (res.status === 401) {
          clearAuthSession();
          window.location.assign('/login');
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load online menu items (${res.status})`);
        }

        const data = await res.json();
        const raw = data.data || [];
        const mapped: OnlineMenuItem[] = raw.map((item: {
          id: number;
          menuId: number;
          productId: number;
          variantId?: number | null;
          isAvailable: boolean;
          priceOverride?: number | string | null;
          displayOrder: number;
          status: string;
          createdAt: string;
          updatedAt: string;
          menu?: { id: number; name: string };
          product?: { id: number; name: string; sku?: string; basePrice?: number | string };
          variant?: { id: number; name: string; price?: number | string; sku?: string } | null;
        }) => ({
          id: item.id,
          menuId: item.menuId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          isAvailable: item.isAvailable ?? true,
          priceOverride:
            item.priceOverride !== null && item.priceOverride !== undefined
              ? parseFloat(String(item.priceOverride))
              : null,
          displayOrder: item.displayOrder ?? 1,
          status: (item.status?.toLowerCase() === 'deleted' ? 'deleted' : 'active') as 'active' | 'deleted',
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          menu: item.menu,
          product: item.product
            ? {
                ...item.product,
                basePrice: parseFloat(String(item.product.basePrice || 0)),
              }
            : undefined,
          variant: item.variant
            ? {
                ...item.variant,
                price: parseFloat(String(item.variant.price || 0)),
              }
            : null,
        }));

        // Auto-heal duplicate or non-sequential displayOrder per digital menu for active items
        const menuBuckets = new Map<number, OnlineMenuItem[]>();
        for (const it of mapped) {
          if (it.status === 'active') {
            const list = menuBuckets.get(it.menuId) || [];
            list.push(it);
            menuBuckets.set(it.menuId, list);
          }
        }

        const itemsToHeal: { id: number; displayOrder: number }[] = [];
        for (const [, items] of menuBuckets) {
          items.sort((a, b) => {
            if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
            return a.id - b.id;
          });
          items.forEach((it, idx) => {
            const expectedOrder = idx + 1;
            if (it.displayOrder !== expectedOrder) {
              itemsToHeal.push({ id: it.id, displayOrder: expectedOrder });
              it.displayOrder = expectedOrder;
            }
          });
        }

        setMenuItems(mapped);
        setLastUpdated(new Date());

        // Background sync to backend if any duplicate or misaligned displayOrder was healed
        if (itemsToHeal.length > 0) {
          void (async () => {
            try {
              await Promise.all(
                itemsToHeal.map((it) =>
                  fetch(`${API_BASE}/online-menu-items/${it.id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ displayOrder: it.displayOrder }),
                  })
                )
              );
            } catch (e) {
              console.warn('Auto-healing display orders failed:', e);
            }
          })();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error fetching online menu items';
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
    fetchCatalogData();
    fetchMenuItems();
  }, [fetchMenus, fetchCatalogData, fetchMenuItems]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval === 0) return;
    const intervalId = setInterval(() => {
      fetchMenuItems(true);
    }, autoRefreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, fetchMenuItems]);

  // KPIs Calculations
  const kpiTotal = menuItems.length;
  const kpiAvailable = menuItems.filter((i) => i.status === 'active' && i.isAvailable).length;
  const kpiOutOfStock = menuItems.filter((i) => i.status === 'active' && !i.isAvailable).length;
  const kpiOverrides = menuItems.filter((i) => i.status === 'active' && i.priceOverride !== null).length;

  // Status Filter Pill Counts
  const countAll = menuItems.length;
  const countAvailable = kpiAvailable;
  const countOutOfStock = kpiOutOfStock;
  const countArchived = menuItems.filter((i) => i.status === 'deleted').length;

  // Filtered Items logic
  const filteredItems = useMemo(() => {
    return menuItems
      .filter((item) => {
        // Menu filter
        if (selectedMenuFilter !== 'all' && String(item.menuId) !== selectedMenuFilter) {
          return false;
        }

        // Status pill multi-select filter
        if (selectedStatusFilters.length > 0) {
          const matchesAny = selectedStatusFilters.some((statusKey) => {
            if (statusKey === 'available') {
              return item.status === 'active' && item.isAvailable;
            }
            if (statusKey === 'out_of_stock') {
              return item.status === 'active' && !item.isAvailable;
            }
            if (statusKey === 'overrides') {
              return item.status === 'active' && item.priceOverride !== null && item.priceOverride !== undefined;
            }
            if (statusKey === 'deleted') {
              return item.status === 'deleted';
            }
            return false;
          });
          if (!matchesAny) return false;
        }

        // Search Query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const productName = item.product?.name?.toLowerCase() || '';
          const variantName = item.variant?.name?.toLowerCase() || '';
          const productSku = item.product?.sku?.toLowerCase() || '';
          const menuName = item.menu?.name?.toLowerCase() || '';
          const codeId = `#itm-${item.id}`;
          const rawId = String(item.id);

          const matches =
            productName.includes(q) ||
            variantName.includes(q) ||
            productSku.includes(q) ||
            menuName.includes(q) ||
            codeId.includes(q) ||
            rawId.includes(q);

          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // 1. Group by digital menu first so items of the same menu stay together
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
  }, [menuItems, selectedMenuFilter, selectedStatusFilters, searchQuery]);

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

  // Quick Availability Toggle Handler
  const handleToggleAvailability = async (item: OnlineMenuItem) => {
    const newAvailability = !item.isAvailable;

    // Optimistic Update
    setMenuItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isAvailable: newAvailability } : i))
    );

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/online-menu-items/${item.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isAvailable: newAvailability }),
      });

      if (!res.ok) {
        // Fallback PUT
        await fetch(`${API_BASE}/online-menu-items/${item.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ isAvailable: newAvailability }),
        });
      }

      showToast(
        `"${item.product?.name || 'Item'}" marked as ${
          newAvailability ? 'Available (In Stock)' : 'Out of Stock (Sold Out)'
        }`
      );
    } catch (err) {
      console.error('Error toggling availability:', err);
      // Revert on error
      fetchMenuItems(true);
    }
  };

  // Strict 1-based sequential position for each item within its digital menu
  const itemSequenceMap = useMemo(() => {
    const map = new Map<number, number>();
    const menuBuckets = new Map<number, OnlineMenuItem[]>();

    for (const item of menuItems) {
      if (item.status === 'active') {
        const list = menuBuckets.get(item.menuId) || [];
        list.push(item);
        menuBuckets.set(item.menuId, list);
      }
    }

    for (const [, items] of menuBuckets) {
      items.sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.id - b.id;
      });
      items.forEach((it, idx) => {
        map.set(it.id, idx + 1);
      });
    }

    return map;
  }, [menuItems]);

  // Helper to check if an item can move up/down within its menu sequence
  const getMoveOrderAvailability = useCallback(
    (item: OnlineMenuItem) => {
      const sameMenuItems = menuItems
        .filter((i) => i.menuId === item.menuId && i.status === 'active')
        .sort((a, b) => {
          if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
          return a.id - b.id;
        });
      const index = sameMenuItems.findIndex((i) => i.id === item.id);
      return {
        canMoveUp: index > 0,
        canMoveDown: index !== -1 && index < sameMenuItems.length - 1,
      };
    },
    [menuItems]
  );

  // Reorder Item Sequence (Move Up / Down with Swap)
  const handleMoveSequence = async (item: OnlineMenuItem, direction: 'up' | 'down') => {
    // 1. Get all active items for the same menu ordered by displayOrder
    const sameMenuItems = menuItems
      .filter((i) => i.menuId === item.menuId && i.status === 'active')
      .sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.id - b.id;
      });

    const currentIndex = sameMenuItems.findIndex((i) => i.id === item.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sameMenuItems.length) return;

    // Reorder array by moving the item to targetIndex
    const reordered = [...sameMenuItems];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Build map of new strict 1-based display orders
    const orderMap = new Map<number, number>();
    reordered.forEach((c, idx) => {
      orderMap.set(c.id, idx + 1);
    });

    // 2. Optimistic Update (all items in the menu updated cleanly)
    setMenuItems((prev) =>
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

      // Collect all items in this menu whose displayOrder changed and persist them all
      const itemsToUpdate = reordered.filter((c) => {
        const newOrder = orderMap.get(c.id);
        const originalItem = sameMenuItems.find((orig) => orig.id === c.id);
        return newOrder !== undefined && originalItem?.displayOrder !== newOrder;
      });

      await Promise.all(
        itemsToUpdate.map(async (c) => {
          const newOrder = orderMap.get(c.id)!;
          const res = await fetch(`${API_BASE}/online-menu-items/${c.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ displayOrder: newOrder }),
          });
          if (!res.ok) {
            await fetch(`${API_BASE}/online-menu-items/${c.id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ displayOrder: newOrder }),
            });
          }
        })
      );

      showToast(`Updated order: ${item.product?.name || 'Item'} moved ${direction}`);
      fetchMenuItems(true);
    } catch (err) {
      console.error('Error updating order:', err);
      fetchMenuItems(true);
    }
  };

  // Drag and Drop State for Sequence Reordering
  const [draggedItem, setDraggedItem] = useState<OnlineMenuItem | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, item: OnlineMenuItem) => {
    if (item.status !== 'active') return;
    setDraggedItem(item);
    e.dataTransfer.setData('text/plain', String(item.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetItem: OnlineMenuItem) => {
    if (!draggedItem || draggedItem.id === targetItem.id) return;
    if (draggedItem.menuId !== targetItem.menuId) return;
    if (targetItem.status !== 'active') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverItemId !== targetItem.id) {
      setDragOverItemId(targetItem.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverItemId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetItem: OnlineMenuItem) => {
    e.preventDefault();
    setDragOverItemId(null);

    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null);
      return;
    }

    if (draggedItem.menuId !== targetItem.menuId || targetItem.status !== 'active') {
      setDraggedItem(null);
      return;
    }

    const sameMenuItems = menuItems
      .filter((i) => i.menuId === draggedItem.menuId && i.status === 'active')
      .sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.id - b.id;
      });

    const sourceIndex = sameMenuItems.findIndex((i) => i.id === draggedItem.id);
    const targetIndex = sameMenuItems.findIndex((i) => i.id === targetItem.id);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggedItem(null);
      return;
    }

    // Reorder array by moving draggedItem to targetIndex
    const reordered = [...sameMenuItems];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Build map of new strict 1-based display orders
    const orderMap = new Map<number, number>();
    reordered.forEach((c, idx) => {
      orderMap.set(c.id, idx + 1);
    });

    // Optimistic Update
    setMenuItems((prev) =>
      prev
        .map((c) => {
          if (orderMap.has(c.id)) {
            return { ...c, displayOrder: orderMap.get(c.id)! };
          }
          return c;
        })
        .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
    );

    const movedItemName = draggedItem.product?.name || 'Item';
    setDraggedItem(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Collect all items whose displayOrder changed and persist them
      const itemsToUpdate = reordered.filter((c) => {
        const newOrder = orderMap.get(c.id);
        const originalItem = sameMenuItems.find((orig) => orig.id === c.id);
        return newOrder !== undefined && originalItem?.displayOrder !== newOrder;
      });

      await Promise.all(
        itemsToUpdate.map(async (c) => {
          const newOrder = orderMap.get(c.id)!;
          const res = await fetch(`${API_BASE}/online-menu-items/${c.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ displayOrder: newOrder }),
          });
          if (!res.ok) {
            await fetch(`${API_BASE}/online-menu-items/${c.id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ displayOrder: newOrder }),
            });
          }
        })
      );

      showToast(`Reordered "${movedItemName}" to sequence #${targetIndex + 1}`);
      fetchMenuItems(true);
    } catch (err) {
      console.error('Error reordering via drag-and-drop:', err);
      fetchMenuItems(true);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItemId(null);
  };

  // Soft-Delete / Archive Handler
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

      const res = await fetch(`${API_BASE}/online-menu-items/${itemToDelete.id}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to archive item (${res.status})`);
      }

      showToast(`Item "${itemToDelete.product?.name || 'Item'}" archived successfully`);
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      await fetchMenuItems(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error archiving item';
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

      const res = await fetch(`${API_BASE}/online-menu-items/${itemToRestore.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'active' }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to restore item (${res.status})`);
      }

      showToast(`Item "${itemToRestore.product?.name || 'Item'}" restored to active in menu!`);
      setIsRestoreModalOpen(false);
      setItemToRestore(null);
      await fetchMenuItems(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error restoring item';
      console.error('Error restoring item:', err);
      showToast(msg);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenCreateDrawer = () => {
    if (products.length === 0 || variants.length === 0) fetchCatalogData();
    if (menus.length === 0) fetchMenus();
    setDrawerMode('create');
    setEditingItem(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEditDrawer = (item: OnlineMenuItem) => {
    if (products.length === 0 || variants.length === 0) fetchCatalogData();
    if (menus.length === 0) fetchMenus();
    setDrawerMode('edit');
    setEditingItem({
      id: item.id,
      menuId: item.menuId,
      productId: item.productId,
      variantId: item.variantId,
      isAvailable: item.isAvailable,
      priceOverride: item.priceOverride,
      displayOrder: item.displayOrder,
      status: item.status,
    });
    setIsDrawerOpen(true);
  };

  // Helper: compute active price & base price
  const getItemPricingInfo = (item: OnlineMenuItem) => {
    const basePrice = item.variant?.price ?? item.product?.basePrice ?? 0;
    const hasOverride = item.priceOverride !== null && item.priceOverride !== undefined;
    const activePrice = hasOverride ? item.priceOverride! : basePrice;

    return {
      basePrice,
      hasOverride,
      activePrice,
    };
  };

  // Action menu handlers for TableOptionsMenu
  const handleExportCSV = () => {
    if (!filteredItems || filteredItems.length === 0) return;
    const headers = [
      'ID',
      'Item Code',
      'Product Name',
      'Variant',
      'SKU',
      'Menu ID',
      'Menu Name',
      'Active Online Price',
      'Base Catalog Price',
      'Pricing Mode',
      'Availability',
      'Sequence Order',
      'Status',
      'Created At',
      'Updated At',
    ];
    const rows = filteredItems.map((item) => {
      const { basePrice, hasOverride, activePrice } = getItemPricingInfo(item);
      return [
        item.id,
        `#ITM-${item.id}`,
        `"${(item.product?.name || `Product #${item.productId}`).replace(/"/g, '""')}"`,
        `"${(item.variant?.name || 'Base Product').replace(/"/g, '""')}"`,
        `"${item.variant?.sku || item.product?.sku || 'N/A'}"`,
        item.menuId,
        `"${(item.menu?.name || `Menu #${item.menuId}`).replace(/"/g, '""')}"`,
        activePrice.toFixed(2),
        basePrice.toFixed(2),
        hasOverride ? 'Override' : 'Inherited',
        item.isAvailable ? 'Available' : 'Out of Stock',
        item.displayOrder,
        item.status === 'active' ? 'Active' : 'Archived',
        item.createdAt,
        item.updatedAt,
      ];
    });
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `online_menu_items_${new Date().toISOString().slice(0, 10)}.csv`);
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
      .map((item) => {
        const { basePrice, hasOverride, activePrice } = getItemPricingInfo(item);
        return `#ITM-${item.id} ${item.product?.name || 'Product'} [${item.variant?.name || 'Base'}] -> ${
          item.menu?.name || 'Menu'
        } | Online: $${activePrice.toFixed(2)} (${hasOverride ? 'Override' : 'Inherited'} from $${basePrice.toFixed(2)}) | [${
          item.isAvailable ? 'AVAILABLE' : 'SOLD OUT'
        }] | Order: #${item.displayOrder}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text);
    showToast('Menu items catalog copied to clipboard!');
  };

  const densityPadding = getDensityPadding(rowDensity);
  const dataColumnsCount =
    (visibleColumns.item ? 1 : 0) +
    (visibleColumns.menu ? 1 : 0) +
    (visibleColumns.sequence ? 1 : 0) +
    (visibleColumns.pricing ? 1 : 0) +
    (visibleColumns.availability ? 1 : 0) +
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

      {/* 1. Header Card Workspace (Canonical KDS layout) */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
            lunch_dining
          </span>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            ONLINE MENU ITEMS WORKSPACE
          </h2>
        </div>
        <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
          Bind catalog products and specific variants to digital menus, toggle real-time availability, apply web-exclusive price overrides, and configure sequence presentation.
        </p>
      </div>

      {/* 2. Hero KPIs Strip (Strict 4 columns layout: grid grid-cols-4 gap-4 w-full) */}
      <div className="grid grid-cols-4 gap-4 w-full">
        {/* KPI 1: Total Digital Items */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shrink-0">
              <span className="material-symbols-outlined text-xl">restaurant</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans">
                Total Digital Items
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17] font-sans">
                {isLoading ? '...' : kpiTotal}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 shrink-0 font-sans">
            TOTAL
          </span>
        </div>

        {/* KPI 2: In-Stock Online Items */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">check_circle</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans">
                In-Stock Online Items
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17] font-sans">
                {isLoading ? '...' : kpiAvailable}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 font-sans">
            AVAILABLE
          </span>
        </div>

        {/* KPI 3: Out-of-Stock Items */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <span className="material-symbols-outlined text-xl">block</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans">
                Out-of-Stock Items
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17] font-sans">
                {isLoading ? '...' : kpiOutOfStock}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 shrink-0 font-sans">
            SOLD OUT
          </span>
        </div>

        {/* KPI 4: Items with Price Overrides */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0 cursor-default">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200 shrink-0">
              <span className="material-symbols-outlined text-xl">sell</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate font-sans">
                Price Overrides
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17] font-sans">
                {isLoading ? '...' : kpiOverrides}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 shrink-0 font-sans">
            OVERRIDES
          </span>
        </div>
      </div>

      {/* 3. Canonical Unified Filter Toolbar (Standard KDS layout) */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
        {/* Row 1: Search on left, Digital Menu selector, View Switcher + Reload on right */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[#5f5e5e]">
                search
              </span>
              <input
                type="text"
                placeholder="Search items by product, variant, SKU, code..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-[34px] w-full pl-9 pr-8 text-xs rounded-lg border border-[#d5cfc4] focus:outline-none focus:border-[#ae001a] bg-[#fcfcfb] text-[#1d1c17] placeholder:text-[#8c857b] transition-colors duration-200 font-sans"
                aria-label="Search menu items"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Digital Menu Dropdown Selector */}
            <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e]">
              <span className="material-symbols-outlined text-base">restaurant_menu</span>
              <select
                value={selectedMenuFilter}
                onChange={(e) => {
                  setSelectedMenuFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-[34px] px-3 bg-[#fcfcfb] rounded-lg border border-[#d5cfc4] text-xs focus:border-[#ae001a] outline-none font-sans text-[#1d1c17] cursor-pointer max-w-[220px] transition-colors duration-200"
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

          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher Toggle (Table View vs Cards) */}
            <div className="flex items-center h-[34px] bg-[#f2ede5] p-0.5 rounded-lg border border-[#e8e2d8] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer font-sans ${
                  viewMode === 'table'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Table View"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'table' ? 'text-[#ae001a]' : ''}`}>
                  table_rows
                </span>
                Table View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`h-full px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer font-sans ${
                  viewMode === 'cards'
                    ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
                title="Cards View"
              >
                <span className={`material-symbols-outlined text-[16px] ${viewMode === 'cards' ? 'text-[#ae001a]' : ''}`}>
                  grid_view
                </span>
                Cards
              </button>
            </div>

            {/* Canonical Auto Refresh */}
            <div className="flex items-center h-[34px] px-2.5 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] gap-1.5 text-xs text-[#5f5e5e] shrink-0 font-sans">
              <button
                type="button"
                onClick={() => void fetchMenuItems(true)}
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
                className="bg-transparent text-[11px] font-semibold text-[#1d1c17] focus:outline-none cursor-pointer h-full font-sans"
              >
                <option value={0}>Auto: Off</option>
                <option value={5}>Auto: 5s</option>
                <option value={10}>Auto: 10s</option>
                <option value={30}>Auto: 30s</option>
                <option value={60}>Auto: 60s</option>
              </select>
            </div>

            <div className="hidden sm:flex items-center h-[34px] gap-1 text-[11px] text-[#5f5e5e] pl-1 shrink-0 font-sans">
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>Updated:</span>
              <span className="font-mono font-bold text-[#1d1c17]">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Row 2: STATUS Pills Strip on left, Primary Add Button on right (Canonical KDS layout) */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#f0ede6] min-w-0">
          {/* Left: STATUS Pills Strip */}
          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#5f5e5e] shrink-0 mr-1 font-sans">
              Status:
            </span>

            {/* All Pill */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('All')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedStatusFilters.length === 0
                  ? 'bg-[#1d1c17] text-white border-[#1d1c17] shadow-xs'
                  : 'bg-white text-[#5f5e5e] border-[#d5cfc4] hover:bg-[#fcfcfb] hover:text-[#ae001a]'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">done_all</span>
              <span>All</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedStatusFilters.length === 0 ? 'bg-white/20 text-white' : 'bg-[#e8e2d8] text-[#5f5e5e]'
                }`}
              >
                {countAll}
              </span>
            </button>

            {/* Available Pill */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('available')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedStatusFilters.includes('available')
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">check_circle</span>
              <span>Available</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedStatusFilters.includes('available') ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {countAvailable}
              </span>
            </button>

            {/* Out of Stock Pill */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('out_of_stock')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedStatusFilters.includes('out_of_stock')
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">block</span>
              <span>Out of Stock</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedStatusFilters.includes('out_of_stock') ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {countOutOfStock}
              </span>
            </button>

            {/* Price Overrides Pill */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('overrides')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedStatusFilters.includes('overrides')
                  ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                  : 'bg-white text-purple-800 border-purple-200 hover:bg-purple-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">sell</span>
              <span>Price Overrides</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedStatusFilters.includes('overrides') ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'
                }`}
              >
                {kpiOverrides}
              </span>
            </button>

            {/* Archived Pill */}
            <button
              type="button"
              onClick={() => handleToggleStatusFilter('deleted')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 border ${
                selectedStatusFilters.includes('deleted')
                  ? 'bg-red-700 text-white border-red-700 shadow-xs'
                  : 'bg-white text-red-800 border-red-200 hover:bg-red-50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">pause_circle</span>
              <span>Archived</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  selectedStatusFilters.includes('deleted') ? 'bg-white/20 text-white' : 'bg-red-100 text-red-800'
                }`}
              >
                {countArchived}
              </span>
            </button>
          </div>

          {/* Right: Primary Action Button (Standard KDS) */}
          <button
            type="button"
            onClick={handleOpenCreateDrawer}
            className="h-[34px] px-4 rounded-lg bg-[#ae001a] text-white font-bold text-xs hover:bg-[#d2272f] transition-colors flex items-center gap-1.5 font-sans cursor-pointer shadow-xs whitespace-nowrap shrink-0"
            title="Bind new item to digital menu"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>BIND MENU ITEM</span>
          </button>
        </div>
      </div>

      {/* 4. Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-lg text-red-600">error</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchMenuItems()}
            className="px-3 py-1 rounded-md bg-red-100 hover:bg-red-200 font-bold uppercase tracking-wider text-[10px] text-red-800 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 5. Main Content: Table View vs Cards View */}
      {viewMode === 'table' ? (
        <div className="bg-white border border-[#e8e2d8] rounded overflow-hidden shadow-sm flex flex-col">
          {/* Dark Header #222222 with Full Options Dropdown Menu (Standard KDS / Categories) */}
          <div className="p-4 bg-[#222222] flex justify-between items-center relative">
            <div className="flex items-center gap-3">
              <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
                MENU ITEM DIRECTORY
              </span>
              <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
                {filteredItems.length === menuItems.length
                  ? `${menuItems.length} item${menuItems.length === 1 ? '' : 's'}`
                  : `${filteredItems.length} / ${menuItems.length} items`}
              </span>
            </div>

            <TableOptionsMenu
              onExportCSV={handleExportCSV}
              onPrint={handlePrintTable}
              onCopySummary={handleCopySummary}
              onReload={() => void fetchMenuItems(true)}
              columns={[
                { key: 'item', label: 'Item & Catalog Product' },
                { key: 'menu', label: 'Digital Menu Context' },
                { key: 'sequence', label: 'Display Sequence' },
                { key: 'pricing', label: 'Pricing Engine' },
                { key: 'availability', label: 'Availability & Status' },
                { key: 'timestamps', label: 'Last Updated' },
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
              totalItems={filteredItems.length}
              pageSize={pageSize}
              onChangePageSize={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              totalPages={totalPages}
            />
          </div>

          {dataColumnsCount === 0 ? (
            <NoColumnsEmptyState />
          ) : (
            <>
              <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full table-fixed border-collapse font-sans text-xs">
                <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                  <tr>
                    {visibleColumns.item && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-48`}>
                        Item & Product
                      </th>
                    )}
                    {visibleColumns.menu && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-36`}>
                        Digital Menu
                      </th>
                    )}
                    {visibleColumns.sequence && (
                      <th className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-44`}>
                        Display Sequence
                      </th>
                    )}
                    {visibleColumns.pricing && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-36`}>
                        Pricing
                      </th>
                    )}
                    {visibleColumns.availability && (
                      <th className={`text-center text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-40`}>
                        Availability
                      </th>
                    )}
                    {visibleColumns.timestamps && (
                      <th className={`text-left text-label-caps font-semibold text-[#5f5e5e] font-sans text-xs ${densityPadding} whitespace-nowrap w-28`}>
                        Updated
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
                        <p className="text-secondary text-body-md mt-2 font-sans">Loading digital menu items catalog...</p>
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
                          onClick={() => void fetchMenuItems()}
                          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                        >
                          Retry Connection
                        </button>
                      </td>
                    </tr>
                  ) : menuItems.length === 0 ? (
                    <TableEmptyState
                      colSpan={activeColSpan}
                      icon="lunch_dining"
                      title="No Menu Items Found"
                      description="Click '+ BIND MENU ITEM' to link catalog products or variants to digital menus."
                    />
                  ) : filteredItems.length === 0 ? (
                    <TableEmptyState
                      colSpan={activeColSpan}
                      icon="search_off"
                      title="No Matching Menu Items"
                      description="No digital menu items match your search query or selected status filters."
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
                                  {group.activeCount} Active {group.activeCount === 1 ? 'Item' : 'Items'}
                                </span>
                                <span className="text-[10px] font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] px-2 py-0.5 rounded font-poppins">
                                  {group.totalCount} Total {group.totalCount === 1 ? 'Item' : 'Items'}
                                </span>
                                <span className="text-[10px] text-[#5f5e5e] font-bold uppercase tracking-wider ml-1 group-hover/menu:text-[#ae001a] transition-colors">
                                  {isExpanded ? 'Collapse' : 'Expand'}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {isExpanded &&
                          group.items.map((item) => {
                            const { basePrice, hasOverride, activePrice } = getItemPricingInfo(item);
                            const isArchived = item.status === 'deleted';

                            return (
                              <tr
                                key={item.id}
                                draggable={item.status === 'active'}
                                onDragStart={(e) => handleDragStart(e, item)}
                                onDragOver={(e) => handleDragOver(e, item)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, item)}
                                onDragEnd={handleDragEnd}
                                className={`transition-all duration-200 group border-l-4 border-l-purple-500/20 ${
                                  dragOverItemId === item.id
                                    ? 'bg-amber-100/80 ring-2 ring-[#ae001a]/70'
                                    : isArchived
                                    ? 'bg-zinc-50/70 text-zinc-400'
                                    : 'hover:bg-[#f8f3eb]'
                                } ${draggedItem?.id === item.id ? 'opacity-30' : ''}`}
                              >
                                {/* Column 1: Item & Product */}
                                {visibleColumns.item && (
                                  <td className={`${densityPadding} font-sans pl-8`}>
                                    <div className="flex items-center gap-2">
                                      {item.status === 'active' && (
                                        <span
                                          className="material-symbols-outlined text-[16px] text-zinc-300 group-hover:text-[#ae001a] cursor-grab active:cursor-grabbing select-none shrink-0 transition-colors duration-200"
                                          title="Drag to reorder sequence"
                                        >
                                          drag_indicator
                                        </span>
                                      )}
                                      <span className="material-symbols-outlined text-[14px] text-[#8c857b] shrink-0">
                                        subdirectory_arrow_right
                                      </span>
                                      <div className="min-w-0">
                                        <div
                                          className={`font-bold text-xs truncate ${
                                            isArchived ? 'line-through text-zinc-500' : 'text-[#1d1c17]'
                                          }`}
                                          title={item.product?.name}
                                        >
                                          {item.product?.name || `Product #${item.productId}`}
                                        </div>
                                        {item.variant && (
                                          <div className="mt-1">
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                              <span className="material-symbols-outlined text-[12px]">style</span>
                                              {item.variant.name}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                )}

                                {/* Column 2: Digital Menu */}
                                {visibleColumns.menu && (
                                  <td className={`py-3 px-4 ${densityPadding}`}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="material-symbols-outlined text-[#ae001a] text-sm shrink-0">
                                        restaurant_menu
                                      </span>
                                      <span className="font-semibold text-[#1d1c17] truncate" title={item.menu?.name}>
                                        {item.menu?.name || `Menu #${item.menuId}`}
                                      </span>
                                    </div>
                                  </td>
                                )}

                                {/* Column 3: Display Sequence */}
                                {visibleColumns.sequence && (
                                  <td className={`${densityPadding} text-center font-sans`}>
                                    <div className="flex items-center justify-center gap-1.5">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20">
                                        #{itemSequenceMap.get(item.id) ?? item.displayOrder}
                                      </span>
                                      {!isArchived && (() => {
                                        const { canMoveUp, canMoveDown } = getMoveOrderAvailability(item);
                                        return (
                                          <div className="flex items-center gap-0.5 ml-1">
                                            <button
                                              type="button"
                                              onClick={() => handleMoveSequence(item, 'up')}
                                              disabled={!canMoveUp}
                                              className="p-0.5 text-[#5f5e5e] hover:text-[#ae001a] disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                              title={canMoveUp ? "Move Up in Sequence" : "Already at top of menu"}
                                            >
                                              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleMoveSequence(item, 'down')}
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

                                {/* Column 4: Pricing Engine */}
                                {visibleColumns.pricing && (
                                  <td className={`py-3 px-4 ${densityPadding}`}>
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-extrabold text-sm text-[#1d1c17]">
                                          ${activePrice.toFixed(2)}
                                        </span>
                                        {hasOverride ? (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                                            Override
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-600 border border-zinc-200">
                                            Inherited
                                          </span>
                                        )}
                                      </div>
                                      {hasOverride && (
                                        <span className="text-[10px] text-[#8c857b] line-through font-mono">
                                          Base: ${basePrice.toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                )}

                                {/* Column 5: Availability & Status Pills */}
                                {visibleColumns.availability && (
                                  <td className={`py-3 px-4 ${densityPadding}`}>
                                    {isArchived ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                        Archived
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleAvailability(item)}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                                          item.isAvailable
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                            : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                        }`}
                                        title={`Click to toggle availability: currently ${item.isAvailable ? 'Available' : 'Out of Stock'}`}
                                      >
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full ${
                                            item.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
                                          }`}
                                        />
                                        <span>{item.isAvailable ? 'Available' : 'Out of Stock'}</span>
                                        <span className="material-symbols-outlined text-[12px] opacity-70">
                                          sync_alt
                                        </span>
                                      </button>
                                    )}
                                  </td>
                                )}

                                {/* Column 6: Timestamps */}
                                {visibleColumns.timestamps && (
                                  <td className={`py-3 px-4 text-[#5f5e5e] text-[11px] ${densityPadding}`}>
                                    <div>{formatDate(item.updatedAt || item.createdAt)}</div>
                                  </td>
                                )}

                                {/* Column 7: Actions */}
                                {visibleColumns.actions && (
                                  <td className={`py-3 px-4 text-right ${densityPadding}`}>
                                    <div className="flex items-center justify-end gap-1.5">
                                      {/* Edit Button */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditDrawer(item)}
                                        className="p-1 rounded-md text-[#5f5e5e] hover:text-[#ae001a] hover:bg-[#f2ede5] transition-colors cursor-pointer"
                                        title="Edit item configuration"
                                      >
                                        <span className="material-symbols-outlined text-[18px]">tune</span>
                                      </button>

                                      {/* Archive or Restore Button */}
                                      {isArchived ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setItemToRestore(item);
                                            setIsRestoreModalOpen(true);
                                          }}
                                          className="p-1 rounded-md text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors cursor-pointer"
                                          title="Restore item to active"
                                        >
                                          <span className="material-symbols-outlined text-[18px]">
                                            settings_backup_restore
                                          </span>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setItemToDelete(item);
                                            setIsDeleteModalOpen(true);
                                          }}
                                          className="p-1 rounded-md text-[#5f5e5e] hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                                          title="Archive menu item"
                                        >
                                          <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

            <TablePaginationFooter
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={menuGroups.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10, 20, 50]}
            />
          </>
        )}
        </div>
      ) : (
        /* Cards View */
        <div className="space-y-4">
          {isLoading ? (
            <div className="p-12 text-center text-secondary bg-white border border-[#e8e2d8] rounded shadow-sm">
              <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                sync
              </span>
              <p className="text-secondary text-body-md mt-2 font-sans">Loading digital menu items catalog...</p>
            </div>
          ) : menuItems.length === 0 ? (
            <TableEmptyState
              asTableRow={false}
              icon="lunch_dining"
              title="No Menu Items Found"
              description="Click '+ BIND MENU ITEM' to link catalog products or variants to digital menus."
            />
          ) : filteredItems.length === 0 ? (
            <TableEmptyState
              asTableRow={false}
              icon="search_off"
              title="No Matching Menu Items"
              description="No digital menu items match your search query or selected status filters."
            />
          ) : (
            <>
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
                          {group.totalCount} {group.totalCount === 1 ? 'Item' : 'Items'}
                        </span>
                        <span className="text-[10px] text-[#5f5e5e] font-bold uppercase tracking-wider ml-1 group-hover/menu:text-[#ae001a] transition-colors">
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pl-4 border-l-2 border-purple-200">
                        {group.items.map((item) => {
                          const { basePrice, hasOverride, activePrice } = getItemPricingInfo(item);
                          const isArchived = item.status === 'deleted';

                          return (
                            <div
                              key={item.id}
                              draggable={item.status === 'active'}
                              onDragStart={(e) => handleDragStart(e, item)}
                              onDragOver={(e) => handleDragOver(e, item)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, item)}
                              onDragEnd={handleDragEnd}
                              className={`bg-white border rounded-xl p-4 shadow-xs flex flex-col justify-between transition-all duration-200 group ${
                                dragOverItemId === item.id
                                  ? 'border-2 border-[#ae001a] bg-amber-50/50 scale-[1.01]'
                                  : isArchived
                                  ? 'border-red-200 bg-red-50/20'
                                  : item.isAvailable
                                  ? 'border-[#e8e2d8] hover:border-[#ae001a]'
                                  : 'border-amber-200 bg-amber-50/20 hover:border-[#ae001a]'
                              } ${draggedItem?.id === item.id ? 'opacity-30' : ''}`}
                            >
                              {/* Card Top */}
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-1.5">
                                    {item.status === 'active' && (
                                      <span
                                        className="material-symbols-outlined text-[18px] text-zinc-300 group-hover:text-[#ae001a] cursor-grab active:cursor-grabbing select-none shrink-0 transition-colors duration-200"
                                        title="Drag to reorder sequence"
                                      >
                                        drag_indicator
                                      </span>
                                    )}
                                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20">
                                      #{itemSequenceMap.get(item.id) ?? item.displayOrder}
                                    </span>
                                  </div>

                                  {/* Availability Pill */}
                                  {isArchived ? (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
                                      Archived
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleAvailability(item)}
                                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border cursor-pointer ${
                                        item.isAvailable
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                          : 'bg-amber-100 text-amber-800 border-amber-200'
                                      }`}
                                    >
                                      {item.isAvailable ? 'Available' : 'Out of Stock'}
                                    </button>
                                  )}
                                </div>

                                <h4
                                  className={`text-sm font-bold mt-1 ${
                                    isArchived ? 'line-through text-zinc-400' : 'text-[#1d1c17]'
                                  }`}
                                >
                                  {item.product?.name || `Product #${item.productId}`}
                                </h4>

                                {item.variant && (
                                  <div className="flex items-center gap-2 text-xs text-[#5f5e5e] mt-1">
                                    <span className="inline-flex items-center gap-0.5 font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                      <span className="material-symbols-outlined text-[13px]">style</span>
                                      {item.variant.name}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Card Pricing and Action Footer */}
                              <div className="mt-4 pt-3 border-t border-[#f0ede6] flex items-center justify-between">
                                <div>
                                  <div className="text-[9px] uppercase font-bold text-[#8c857b] tracking-wider">
                                    Active Online Price
                                  </div>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="font-mono text-lg font-extrabold text-[#1d1c17]">
                                      ${activePrice.toFixed(2)}
                                    </span>
                                    {hasOverride ? (
                                      <span className="text-[9px] font-bold text-purple-700 uppercase">
                                        [Override]
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold text-zinc-500 uppercase">
                                        [Inherited]
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDrawer(item)}
                                    className="p-1.5 rounded-lg border border-[#d5cfc4] text-[#5f5e5e] hover:text-[#ae001a] hover:bg-[#fcfcfb] cursor-pointer"
                                    title="Configure item"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">tune</span>
                                  </button>
                                  {isArchived ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setItemToRestore(item);
                                        setIsRestoreModalOpen(true);
                                      }}
                                      className="p-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                      title="Restore item"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">
                                        settings_backup_restore
                                      </span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setItemToDelete(item);
                                        setIsDeleteModalOpen(true);
                                      }}
                                      className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                                      title="Archive item"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">delete</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Cards Pagination Footer */}
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
          </>
        )}
        </div>
      )}

      {/* 6. Setup Drawer (Bind / Configure Item) */}
      <OnlineMenuItemSetupDrawer
        isOpen={isDrawerOpen}
        mode={drawerMode}
        initialData={editingItem}
        menus={menus}
        products={products}
        variants={variants}
        existingItems={menuItems}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={(_, message) => {
          showToast(message);
          fetchMenuItems(true);
        }}
      />

      {/* 7. Archive / Delete Confirmation Modal */}
      {isDeleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 z-50 overflow-hidden font-sans flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
            onClick={() => !isDeleting && setIsDeleteModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl border border-[#e8e2d8] max-w-md w-full p-6 text-left animate-scale-up">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h3 className="text-base font-bold text-[#1d1c17] uppercase tracking-wide">
                Archive Menu Item
              </h3>
            </div>
            <p className="text-xs text-[#5f5e5e] leading-relaxed mb-4">
              Are you sure you want to archive{' '}
              <strong className="text-[#1d1c17]">
                {itemToDelete.product?.name || `Item #${itemToDelete.id}`}
              </strong>{' '}
              from the menu{' '}
              <strong className="text-[#1d1c17]">
                {itemToDelete.menu?.name || `#MNU-${itemToDelete.menuId}`}
              </strong>
              ? This marks its logical lifecycle status as <span className="font-bold text-red-600">DELETED</span>. It will be hidden from the storefront, but can be restored anytime.
            </p>

            {deleteError && (
              <div className="p-3 mb-4 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#f0ede6]">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-[#5f5e5e] hover:text-[#1d1c17] rounded-lg border border-[#d5cfc4] hover:bg-white cursor-pointer uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm cursor-pointer flex items-center gap-2 uppercase tracking-wider"
              >
                {isDeleting ? 'Archiving...' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Restore Confirmation Modal */}
      {isRestoreModalOpen && itemToRestore && (
        <div className="fixed inset-0 z-50 overflow-hidden font-sans flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
            onClick={() => !isRestoring && setIsRestoreModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl border border-[#e8e2d8] max-w-md w-full p-6 text-left animate-scale-up">
            <div className="flex items-center gap-3 text-emerald-600 mb-3">
              <span className="material-symbols-outlined text-2xl">settings_backup_restore</span>
              <h3 className="text-base font-bold text-[#1d1c17] uppercase tracking-wide">
                Restore Menu Item
              </h3>
            </div>
            <p className="text-xs text-[#5f5e5e] leading-relaxed mb-4">
              Restore{' '}
              <strong className="text-[#1d1c17]">
                {itemToRestore.product?.name || `Item #${itemToRestore.id}`}
              </strong>{' '}
              back to the digital menu{' '}
              <strong className="text-[#1d1c17]">
                {itemToRestore.menu?.name || `#MNU-${itemToRestore.menuId}`}
              </strong>
              ? Its logical status will be restored to <span className="font-bold text-emerald-600">ACTIVE</span>.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#f0ede6]">
              <button
                type="button"
                onClick={() => setIsRestoreModalOpen(false)}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-bold text-[#5f5e5e] hover:text-[#1d1c17] rounded-lg border border-[#d5cfc4] hover:bg-white cursor-pointer uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm cursor-pointer flex items-center gap-2 uppercase tracking-wider"
              >
                {isRestoring ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
