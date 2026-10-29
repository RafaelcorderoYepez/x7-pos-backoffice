// Generic Command Hub for a module: target of its NavHubBar back button.
// Uses standard StandardDashboardHub (same as KDS) with one card per 3rd-level option.
//
// KPIs reflect structural module metrics (workspace counts and availability),
// not synthetic business metrics: each module has its own backend and a generic hub
// does not guess unverified figures.

import React from 'react';
import {
  StandardDashboardHub,
  type DashboardKPIItem,
  type DashboardModuleItem,
} from '../../shared/StandardDashboardHub';
import type { ModuleNavHub } from '../../../lib/module-nav-hubs';

interface ModuleCommandHubViewProps {
  hub: ModuleNavHub;
  onNavigate: (featureId: string) => void;
}

export const ModuleCommandHubView: React.FC<ModuleCommandHubViewProps> = ({ hub, onNavigate }) => {
  const live = hub.items.filter((item) => item.live).length;
  const pending = hub.items.length - live;

  const kpis: DashboardKPIItem[] = [
    {
      title: 'Workspaces',
      value: hub.items.length,
      subtitle: 'Third-level options',
      icon: 'space_dashboard',
      variant: 'red',
    },
    {
      title: 'Available',
      value: live,
      subtitle: 'Ready to use',
      icon: 'check_circle',
      variant: 'emerald',
    },
    {
      title: 'In Development',
      value: pending,
      subtitle: pending ? 'Coming in a next release' : 'Nothing pending',
      icon: 'construction',
      variant: 'amber',
    },
    {
      title: 'Category',
      value: hub.category,
      subtitle: 'Menu section',
      icon: hub.icon,
      variant: 'zinc',
    },
  ];

  const modules: DashboardModuleItem[] = hub.items.map((item) => ({
    id: item.featureId,
    title: item.label,
    subtitle: item.live ? 'Workspace' : 'In development',
    description: item.description,
    icon: item.icon,
    badge: item.live ? 'Available' : 'In Development',
    badgeVariant: item.live ? 'emerald' : 'amber',
    actionText: item.live ? 'Open' : 'Preview',
  }));

  return (
    <StandardDashboardHub
      breadcrumb={`${hub.category} / ${hub.title}`}
      headerIcon="space_dashboard"
      title={hub.title}
      description={hub.description}
      kpis={kpis}
      modules={modules}
      onModuleClick={onNavigate}
    />
  );
};

export default ModuleCommandHubView;
