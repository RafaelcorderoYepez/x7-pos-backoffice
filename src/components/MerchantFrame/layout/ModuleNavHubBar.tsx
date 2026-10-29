// Persistent module bar: standard NavHubBar populated by module-nav-hubs.ts.
// Mounted by MerchantFrame once for the active featureId, covering the view, error
// states, and "In Development" stubs for options without a dedicated view yet.

import React from 'react';
import { NavHubBar } from '../../shared/NavHubBar';
import type { ModuleNavHub } from '../../../lib/module-nav-hubs';

interface ModuleNavHubBarProps {
  hub: ModuleNavHub;
  currentFeatureId: string;
  onNavigate: (featureId: string) => void;
}

export const ModuleNavHubBar: React.FC<ModuleNavHubBarProps> = ({
  hub,
  currentFeatureId,
  onNavigate,
}) => {
  if (!hub || !hub.title) return null;

  return (
    <nav aria-label={`${hub.title.replace(/ Command Hub$/, '')} module navigation`}>
      <NavHubBar
        title={hub.title}
        titleIcon="space_dashboard"
        onBackToDashboard={() => onNavigate(hub.hubId)}
        backToDashboardLabel={hub.hubLabel}
        items={(hub.items || []).map((item) => ({
          id: item.featureId,
          label: item.label,
          icon: item.icon,
          active: item.featureId === currentFeatureId,
          onClick: () => onNavigate(item.featureId),
        }))}
      />
    </nav>
  );
};

export default ModuleNavHubBar;
