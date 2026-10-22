import React, { useEffect, useState } from 'react';
import { getAccessToken } from '../../../../lib/auth-storage';
import {
  StandardDashboardHub,
  type DashboardKPIItem,
  type DashboardModuleItem,
} from '../../../shared/StandardDashboardHub';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface OnlineStoreApiItem {
  id: string;
  is_active?: boolean;
  status?: string;
  currency?: string;
}

interface OnlineOrderingHubViewProps {
  onNavigate?: (view: string) => void;
}

export const OnlineOrderingHubView: React.FC<OnlineOrderingHubViewProps> = ({
  onNavigate,
}) => {
  const [storesCount, setStoresCount] = useState<number>(0);
  const [publishedCount, setPublishedCount] = useState<number>(0);
  const [maintenanceCount, setMaintenanceCount] = useState<number>(0);
  const [currenciesCount, setCurrenciesCount] = useState<number>(0);
  const [menusCount, setMenusCount] = useState<number>(0);
  const [publishedMenusCount, setPublishedMenusCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const [resStores, resMenus] = await Promise.all([
          fetch(`${API_BASE}/online-stores?limit=100`, { headers }),
          fetch(`${API_BASE}/online-menus?limit=100`, { headers }),
        ]);

        if (!isMounted) return;

        if (resStores.ok) {
          const json = await resStores.json();
          const list: OnlineStoreApiItem[] = Array.isArray(json) ? json : json.data || [];
          setStoresCount(list.length);

          const published = list.filter(
            (s) => Boolean(s.is_active) && (s.status?.toLowerCase() === 'active' || s.status?.toLowerCase() === 'published')
          ).length;
          setPublishedCount(published);

          const maintenance = list.filter(
            (s) => !s.is_active || s.status?.toLowerCase() === 'maintenance'
          ).length;
          setMaintenanceCount(maintenance);

          const distinctCurrencies = new Set(
            list.map((s) => s.currency?.trim().toUpperCase()).filter(Boolean)
          );
          setCurrenciesCount(distinctCurrencies.size || 1);
        }

        if (resMenus.ok) {
          const jsonMenus = await resMenus.json();
          const listMenus: Record<string, unknown>[] = Array.isArray(jsonMenus)
            ? jsonMenus
            : jsonMenus.data || [];
          setMenusCount(listMenus.length);
          const activeMenus = listMenus.filter((m) =>
            m.isActive !== undefined ? Boolean(m.isActive) : Boolean(m.is_active)
          ).length;
          setPublishedMenusCount(activeMenus);
        }
      } catch (err) {
        console.warn('Error loading online ordering hub metrics:', err);
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
      title: 'Online Stores',
      value: storesCount,
      subtitle: 'Provisioned storefronts',
      icon: 'storefront',
      variant: 'red',
      onClick: () => onNavigate?.('online-stores'),
    },
    {
      title: 'Published Stores',
      value: publishedCount,
      subtitle: maintenanceCount > 0 ? `${maintenanceCount} in maintenance` : 'Live storefront channels',
      icon: 'check_circle',
      variant: 'emerald',
      onClick: () => onNavigate?.('online-stores'),
    },
    {
      title: 'Supported Currencies',
      value: currenciesCount || 1,
      subtitle: 'Active checkout currencies',
      icon: 'payments',
      variant: 'blue',
      onClick: () => onNavigate?.('online-payments'),
    },
    {
      title: 'Delivery Logistics',
      value: 'Operational',
      isOperationalStatus: true,
      statusLabel: 'READY',
      subtitle: 'Dispatch & coverage zones',
      icon: 'local_shipping',
      variant: 'amber',
      onClick: () => onNavigate?.('online-delivery-info'),
    },
  ];

  const modules: DashboardModuleItem[] = [
    {
      id: 'online-stores',
      title: 'Online Stores Workspace',
      subtitle: 'Web Portals & Branding',
      description: 'Manage multi-storefront digital channels, subdomains, color themes, currencies, and operational statuses.',
      icon: 'storefront',
      badge: `${publishedCount} Published / ${storesCount} Total`,
      badgeVariant: 'emerald',
      actionText: 'Manage Stores',
    },
    {
      id: 'online-payments',
      title: 'Online Payments Gateway',
      subtitle: 'Digital Checkout & Processors',
      description: 'Configure online payment gateways, Stripe, PayPal, card acquiring providers, and digital checkout tender rules.',
      icon: 'payments',
      badge: 'In Development',
      badgeVariant: 'amber',
      actionText: 'Preview',
    },
    {
      id: 'online-menus',
      title: 'Online Menus Management',
      subtitle: 'Digital Catalogs & Availability',
      description: 'Create and publish specialized digital menus, meal schedules, seasonal offerings, and channel-specific menus.',
      icon: 'restaurant_menu',
      badge: menusCount > 0 ? `${publishedMenusCount} Published / ${menusCount} Total` : 'Operational',
      badgeVariant: 'emerald',
      actionText: 'Manage Menus',
    },
    {
      id: 'online-menu-categories',
      title: 'Menu Categories',
      subtitle: 'Taxonomy & Navigation',
      description: 'Structure digital menu sections, item families, display sorting order, and customer-facing browse categories.',
      icon: 'category',
      badge: 'Operational',
      badgeVariant: 'emerald',
      actionText: 'Manage Categories',
    },
    {
      id: 'online-menu-items',
      title: 'Online Menu Items',
      subtitle: 'Dishes, Pricing & Options',
      description: 'Synchronize saleable catalog dishes with online storefronts, including digital photos, tags, and modifier sets.',
      icon: 'lunch_dining',
      badge: 'Operational',
      badgeVariant: 'emerald',
      actionText: 'Manage Items',
    },
    {
      id: 'online-orders',
      title: 'Online Orders Dispatch',
      subtitle: 'Incoming Orders & Fulfillment',
      description: 'Track live incoming web and delivery orders, customer details, acceptance workflows, and fulfillment dispatch.',
      icon: 'shopping_bag',
      badge: 'Operational',
      badgeVariant: 'emerald',
      actionText: 'Dispatch Orders',
    },
    {
      id: 'online-order-items',
      title: 'Online Order Items',
      subtitle: 'Itemized Carts & Modifiers',
      description: 'Detailed breakdown of customer shopping carts, special cooking instructions, modifier choices, and price lines.',
      icon: 'receipt_long',
      badge: 'In Development',
      badgeVariant: 'amber',
      actionText: 'Preview',
    },
    {
      id: 'online-delivery-info',
      title: 'Delivery Info & Logistics',
      subtitle: 'Zones, Couriers & Coverage',
      description: 'Configure delivery radiuses, polygon coverage zones, distance-based courier fees, minimum orders, and dispatch times.',
      icon: 'local_shipping',
      badge: 'In Development',
      badgeVariant: 'amber',
      actionText: 'Preview',
    },
  ];

  return (
    <StandardDashboardHub
      breadcrumb="Commerce / Online Ordering Suite"
      headerIcon="storefront"
      title="Online Ordering Command Hub"
      description="Centralized operational hub for digital storefronts, multi-tenant web portals, menu catalogs, digital payments, live dispatch orders, and delivery logistics."
      primaryAction={{
        label: 'LAUNCH STORE WORKSPACE',
        icon: 'storefront',
        onClick: () => onNavigate?.('online-stores'),
      }}
      secondaryAction={{
        label: 'DELIVERY SETUP',
        icon: 'local_shipping',
        onClick: () => onNavigate?.('online-delivery-info'),
      }}
      kpis={kpis}
      loadingKpis={loading}
      modules={modules}
      onModuleClick={(id) => onNavigate?.(id)}
    />
  );
};

export default OnlineOrderingHubView;
