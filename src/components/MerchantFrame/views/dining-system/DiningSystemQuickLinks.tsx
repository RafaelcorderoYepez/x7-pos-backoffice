import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type DiningSystemAnchorKey =
  | 'floor-plans'
  | 'floor-zones'
  | 'tables'
  | 'table-assignments';

interface DiningSystemQuickLinksProps {
  active: DiningSystemAnchorKey;
  onNavigate?: (view: string) => void;
}

// Each anchor maps to a featureId from Features.txt that MerchantFrame resolves via onNavigate.
// Note: zone uses 'floor-zones' key but the actual catalog featureId is 'table-zones'.
const DINING_ANCHORS: Array<{
  key: DiningSystemAnchorKey;
  label: string;
  featureId: string;
}> = [
  { key: 'floor-plans', label: 'FLOOR PLANS', featureId: 'floor-plans' },
  { key: 'floor-zones', label: 'FLOOR ZONES', featureId: 'table-zones' },
  { key: 'tables', label: 'DINING TABLES', featureId: 'tables' },
  { key: 'table-assignments', label: 'TABLE ASSIGNMENTS', featureId: 'table-assignments' },
];

// Reuses common quick-launch panel (same component as Accounts Payable and Suppliers).
// El workspace activo se renderiza destacado (aria-current="page", no navegable) en vez de
// hidden, so user always sees where they are within the module.
export const DiningSystemQuickLinks: React.FC<DiningSystemQuickLinksProps> = ({
  active,
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = DINING_ANCHORS.map((anchor) => ({
    id: anchor.featureId,
    label: anchor.label,
    active: anchor.key === active,
    onClick: () => onNavigate?.(anchor.featureId),
  }));

  return (
    <nav aria-label="Dining system workspace shortcuts">
      <QuickLaunchPanel
        title="Dining System"
        description="Jump across the dining system workspaces — floor plans, floor zones, dining tables, and table assignments."
        actions={actions}
      />
    </nav>
  );
};

export default DiningSystemQuickLinks;
