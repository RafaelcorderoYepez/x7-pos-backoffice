import React, { useEffect, useState } from 'react';
import { StockQuickLinks } from './stocks/StockQuickLinks';
import {
  StandardDashboardHub,
  type DashboardKPIItem,
  type DashboardModuleItem,
} from '../../../shared/StandardDashboardHub';
import { apiRequest, unwrapList, type MaybeEnvelopedList } from '../../../../api/http';

interface RawMaterialsHubViewProps {
  onNavigate?: (view: string) => void;
}

export const RawMaterialsHubView: React.FC<RawMaterialsHubViewProps> = ({
  onNavigate,
}) => {
  const [rawMaterialsCount, setRawMaterialsCount] = useState<number>(0);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [purchaseOrdersCount, setPurchaseOrdersCount] = useState<number>(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(0);
  const [stockItemsCount, setStockItemsCount] = useState<number>(0);
  const [locationsCount, setLocationsCount] = useState<number>(0);
  const [categoriesCount, setCategoriesCount] = useState<number>(0);
  const [movementsCount, setMovementsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const fetchMetrics = async () => {
      try {
        setLoading(true);
        // Each KPI is independent: a failing endpoint leaves its card at zero instead of blanking the hub.
        const optionalList = <T,>(path: string) =>
          apiRequest<MaybeEnvelopedList<T>>(path, { method: 'GET' }, '')
            .then((json) => unwrapList(json))
            .catch(() => null);

        type StockLevels = { currentQty?: number; currentStock?: number; minimumQty?: number; minimumStock?: number };
        const [rawMaterials, purchaseOrders, locations, categories, stockItems, movements] = await Promise.all([
          optionalList<StockLevels>('/v1/inventory/raw-materials?limit=200&status=all'),
          optionalList<{ status?: string }>('/v1/purchase-orders?limit=100'),
          optionalList<unknown>('/locations'),
          optionalList<unknown>('/v1/raw-material-categories?status=all'),
          optionalList<StockLevels>('/v1/raw-material-stock/items?limit=100'),
          optionalList<unknown>('/v1/raw-material-stock/movements?limit=100'),
        ]);

        if (!isMounted) return;

        const isLow = (m: StockLevels) => {
          const current = Number(m.currentQty ?? m.currentStock ?? 0);
          const min = Number(m.minimumQty ?? m.minimumStock ?? 0);
          return min > 0 && current <= min;
        };
        let detectedLowStock = 0;

        if (rawMaterials) {
          setRawMaterialsCount(rawMaterials.length);
          detectedLowStock = Math.max(detectedLowStock, rawMaterials.filter(isLow).length);
        }

        if (purchaseOrders) {
          setPurchaseOrdersCount(purchaseOrders.length);
          const openCount = purchaseOrders.filter((po) => {
            const st = (po.status || '').toUpperCase();
            return st && !['RECEIVED', 'COMPLETED', 'CANCELLED'].includes(st);
          }).length;
          setPendingOrdersCount(openCount);
        }

        if (locations) setLocationsCount(locations.length);
        if (categories) setCategoriesCount(categories.length);

        if (stockItems) {
          setStockItemsCount(stockItems.length);
          detectedLowStock = Math.max(detectedLowStock, stockItems.filter(isLow).length);
        }

        if (movements) setMovementsCount(movements.length);

        setLowStockCount(detectedLowStock);
      } catch (err) {
        console.warn('Error loading raw materials dashboard metrics:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchMetrics();

    return () => {
      isMounted = false;
    };
  }, []);

  const kpis: DashboardKPIItem[] = [
    {
      title: 'Raw Materials',
      value: rawMaterialsCount,
      subtitle: 'Active base supplies',
      icon: 'inventory_2',
      variant: 'blue',
      onClick: () => onNavigate?.('raw-materials'),
    },
    {
      title: 'Low Stock Alerts',
      value: lowStockCount,
      subtitle: lowStockCount > 0 ? `${lowStockCount} items need restock` : 'All inventory levels healthy',
      icon: lowStockCount > 0 ? 'warning' : 'verified',
      variant: lowStockCount > 0 ? 'red' : 'emerald',
      onClick: () => onNavigate?.('stock-movements'),
    },
    {
      title: 'Inbound Orders',
      value: pendingOrdersCount > 0 ? pendingOrdersCount : purchaseOrdersCount,
      subtitle:
        pendingOrdersCount > 0
          ? `${pendingOrdersCount} open / ${purchaseOrdersCount} total`
          : `${purchaseOrdersCount} completed orders`,
      icon: 'receipt_long',
      variant: pendingOrdersCount > 0 ? 'amber' : 'zinc',
      onClick: () => onNavigate?.('purchase-orders'),
    },
    {
      title: 'Live Stock Items',
      value: stockItemsCount || rawMaterialsCount,
      subtitle: 'Real-time inventory balances',
      icon: 'table_rows',
      variant: 'purple',
      onClick: () => onNavigate?.('stock-movements'),
    },
  ];

  const modules: DashboardModuleItem[] = [
    {
      id: 'raw-material-categories',
      title: 'Raw Material Categories',
      subtitle: 'Supplies Taxonomy & Grouping',
      description: 'Organize raw ingredients into families, temperature zones, and supplier departments.',
      icon: 'category',
      badge: `${categoriesCount || 'Live'} Categories`,
      badgeVariant: 'emerald',
      actionText: 'Manage RM Categories',
    },
    {
      id: 'raw-materials',
      title: 'Raw Materials Workspace',
      subtitle: 'Master Ingredients & Supplies',
      description: 'Manage raw ingredients, base goods, units of measurement, yields, and cost benchmarks.',
      icon: 'inventory_2',
      badge: `${rawMaterialsCount || 'Live'} Items`,
      badgeVariant: 'blue',
      actionText: 'Manage Raw Materials',
    },
    {
      id: 'purchase-orders',
      title: 'Purchase Orders Management',
      subtitle: 'Procurement & Inbound Shipments',
      description: 'Create purchase orders, receive supplier shipments, verify bills, and replenish warehouse stock.',
      icon: 'receipt_long',
      badge: `${purchaseOrdersCount || 'Live'} Orders${pendingOrdersCount > 0 ? ` (${pendingOrdersCount} Open)` : ''}`,
      badgeVariant: 'amber',
      actionText: 'Manage Purchase Orders',
    },
    {
      id: 'stock-movements',
      title: 'Stock Levels & Balances',
      subtitle: 'Live Inventory Balances & Thresholds',
      description: 'Track real-time inventory balances, stock counts by location, par levels, and low-stock alerts.',
      icon: 'table_rows',
      badge: lowStockCount > 0 ? `${lowStockCount} Low Stock` : 'Stock Healthy',
      badgeVariant: lowStockCount > 0 ? 'rose' : 'emerald',
      actionText: 'Manage Stock Levels',
    },
    {
      id: 'movements',
      title: 'Stock Movements & Audit',
      subtitle: 'Audit Trail & Transfer Logs',
      description: 'Record manual adjustments, internal warehouse transfers, waste logging, and audit history.',
      icon: 'swap_vert',
      badge: movementsCount > 0 ? `${movementsCount} Movements` : 'Audit Active',
      badgeVariant: 'purple',
      actionText: 'Manage Movements',
    },
    {
      id: 'locations',
      title: 'Inventory Locations',
      subtitle: 'Storage Sites & Pantries',
      description: 'Manage warehouse zones, walk-in coolers, dry storage shelves, and prep station caches.',
      icon: 'warehouse',
      badge: `${locationsCount || 'Registered'} Sites`,
      badgeVariant: 'zinc',
      actionText: 'Manage Locations',
    },
  ];

  return (
    <StandardDashboardHub
      breadcrumb="Inventory / Raw Materials & Supply Chain"
      headerIcon="space_dashboard"
      title="Raw Materials Command Hub"
      description="Centralized operational hub for raw material inventory, inbound purchase orders, real-time stock balances, warehouse locations, and ingredient categories."
      kpis={kpis}
      loadingKpis={loading}
      modules={modules}
      onModuleClick={(id) => onNavigate?.(id)}
    >
      <StockQuickLinks current="raw-materials" onNavigate={onNavigate} />
    </StandardDashboardHub>
  );
};

export default RawMaterialsHubView;
