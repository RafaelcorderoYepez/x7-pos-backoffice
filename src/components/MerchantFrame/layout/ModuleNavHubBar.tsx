// Barra persistente de un módulo: el NavHubBar estándar alimentado por module-nav-hubs.ts.
// La monta MerchantFrame una sola vez para el featureId activo, así cubre la vista, sus
// estados de error y los stubs "In Development" de las opciones que aún no tienen vista.

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
}) => (
  <nav aria-label={`${hub.title.replace(/ Command Hub$/, '')} module navigation`}>
    <NavHubBar
      title={hub.title}
      titleIcon="space_dashboard"
      onBackToDashboard={() => onNavigate(hub.hubId)}
      backToDashboardLabel={hub.hubLabel}
      items={hub.items.map((item) => ({
        id: item.featureId,
        label: item.label,
        icon: item.icon,
        active: item.featureId === currentFeatureId,
        onClick: () => onNavigate(item.featureId),
      }))}
    />
  </nav>
);

export default ModuleNavHubBar;
