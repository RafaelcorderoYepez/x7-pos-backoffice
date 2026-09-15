import React, { useEffect, useState } from 'react';
import { getAccessToken } from '../../../../../lib/auth-storage';
import type { KitchenStation } from './KitchenStationsView';
import { KitchenQuickLinks } from './KitchenQuickLinks';
import {
  StandardDashboardHub,
  type DashboardKPIItem,
  type DashboardModuleItem,
} from '../../../../shared/StandardDashboardHub';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface KitchenKDSHubViewProps {
  onNavigate?: (view: string) => void;
  onOpenLiveMonitor?: () => void;
}

export const KitchenKDSHubView: React.FC<KitchenKDSHubViewProps> = ({
  onNavigate,
  onOpenLiveMonitor,
}) => {
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [devicesCount, setDevicesCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const [stRes, devRes] = await Promise.all([
          fetch(`${API_BASE}/kitchen-station`, { headers }),
          fetch(`${API_BASE}/kitchen-display-devices`, { headers }),
        ]);

        if (stRes.ok) {
          const json = await stRes.json();
          const rawList = Array.isArray(json) ? json : json.data || [];
          setStations(
            rawList.map((st: any) => ({
              ...st,
              is_active: st.isActive ?? st.is_active ?? true,
              station_type: st.stationType ?? st.station_type ?? 'PREP',
              display_mode: st.displayMode ?? st.display_mode ?? 'AUTO',
              display_order: st.displayOrder ?? st.display_order ?? 1,
              printer_name: st.printerName ?? st.printer_name ?? null,
              status: st.status || 'active',
            }))
          );
        }

        if (devRes.ok) {
          const devJson = await devRes.json();
          const devList = Array.isArray(devJson) ? devJson : devJson.data || [];
          setDevicesCount(devList.filter((d: any) => (d.status ?? 'active') === 'active').length);
        }
      } catch (err) {
        console.error('Error loading KDS Hub metrics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Métricas calculadas en tiempo real
  const activeStations = stations.filter(s => (s.is_active ?? true) && (s.status === 'active' || !s.status));
  const boundPrintersCount = stations.filter(s => s.printer_name && s.printer_name.trim() !== '').length;
  const expoStationsCount = stations.filter(s => (s.station_type === 'EXPO' || s.station_type === 'PACKING') && (s.status === 'active' || !s.status)).length;

  const kpis: DashboardKPIItem[] = [
    {
      title: 'Active Stations',
      value: activeStations.length,
      subtitle: 'Prep & pass lines',
      icon: 'soup_kitchen',
      variant: 'red',
    },
    {
      title: 'Printers Bound',
      value: boundPrintersCount,
      subtitle: 'Hardware printers',
      icon: 'print',
      variant: 'blue',
    },
    {
      title: 'Expo / Pass',
      value: expoStationsCount,
      subtitle: 'Expo stations ready',
      icon: 'star',
      variant: 'amber',
    },
    {
      title: 'System Status',
      value: 'OPERATIONAL',
      subtitle: 'Real-time KDS',
      icon: 'check_circle',
      variant: 'emerald',
      isOperationalStatus: true,
      statusLabel: 'OPERATIONAL',
    },
  ];

  const modules: DashboardModuleItem[] = [
    {
      id: 'kitchen-stations',
      title: 'Kitchen Station Profiles',
      subtitle: 'Profiles & Display Order',
      description: 'Configure prep lines, screen modes, printer names, and display order.',
      icon: 'soup_kitchen',
      badge: `${activeStations.length} Active Stations`,
      badgeVariant: 'emerald',
      actionText: 'Manage Stations',
    },
    {
      id: 'kitchen-display-devices',
      title: 'KDS Display Devices',
      subtitle: 'Terminals & Hardware',
      description: 'Register kitchen screens, monitor hardware status, and pair bump bars.',
      icon: 'desktop_windows',
      badge: `${devicesCount || boundPrintersCount} Hardware Bound`,
      badgeVariant: 'blue',
      actionText: 'Manage Devices',
    },
    {
      id: 'kitchen-orders',
      title: 'Live Kitchen Orders',
      subtitle: 'Real-time Ticket Queue',
      description: 'Monitor active preparation tickets, auto-dispatch, and pass window status.',
      icon: 'restaurant',
      badge: 'Live Queue Active',
      badgeVariant: 'amber',
      actionText: 'View Orders Queue',
    },
    {
      id: 'kitchen-order-items',
      title: 'Order Items Tracking',
      subtitle: 'Item Prep Status',
      description: 'Track dish-level preparation progress, modifiers, and station routing.',
      icon: 'format_list_bulleted',
      badge: 'Granular Items View',
      badgeVariant: 'purple',
      actionText: 'Track Order Items',
    },
    {
      id: 'kitchen-event-log',
      title: 'KDS System Event Log',
      subtitle: 'Audit Trail & Logs',
      description: 'Inspect ticket bump history, station latency events, and audit logs.',
      icon: 'history',
      badge: 'System Audit Active',
      badgeVariant: 'zinc',
      actionText: 'View Event Log',
    },
    {
      id: 'kitchen-analytics',
      title: 'Kitchen Performance',
      subtitle: 'Metrics & Prep KPIs',
      description: 'Analyze preparation times, bottleneck charts, and throughput metrics.',
      icon: 'monitoring',
      badge: 'KPI Metrics',
      badgeVariant: 'rose',
      actionText: 'View Analytics',
    },
  ];

  return (
    <StandardDashboardHub
      breadcrumb="Kitchen Display System / Operational Hub"
      headerIcon="space_dashboard"
      title="KDS Ecosystem Command Hub"
      description="Centralized management hub for kitchen station profiles, hardware terminals, live prep queues, event logging, and preparation metrics."
      primaryAction={
        onOpenLiveMonitor
          ? {
              label: 'LAUNCH LIVE KDS DISPLAY',
              icon: 'open_in_new',
              onClick: onOpenLiveMonitor,
            }
          : undefined
      }
      kpis={kpis}
      loadingKpis={loading}
      modules={modules}
      onModuleClick={(id) => onNavigate?.(id)}
    >
      <KitchenQuickLinks current="kitchen-stations" onNavigate={onNavigate} />
    </StandardDashboardHub>
  );
};

export default KitchenKDSHubView;

