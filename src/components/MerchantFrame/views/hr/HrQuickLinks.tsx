import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type HrAnchorKey = 'collaborators' | 'contracts' | 'time-entries';

interface HrQuickLinksProps {
  active: HrAnchorKey;
  onNavigate?: (view: string) => void;
}

// Cada anchor mapea a un featureId de Features.txt que MerchantFrame resuelve vía onNavigate.
const HR_ANCHORS: Array<{ key: HrAnchorKey; label: string; featureId: string }> = [
  { key: 'collaborators', label: 'COLLABORATORS DATABASE', featureId: 'collaborators' },
  {
    key: 'contracts',
    label: 'COLLABORATOR CONTRACTS',
    featureId: 'collaborators-contracts',
  },
  {
    key: 'time-entries',
    label: 'TIME ENTRIES CONTROL',
    featureId: 'collaborators-time-entries',
  },
];

// Mismo panel compartido que usan Dining System y Accounts Payable: el workspace activo se
// muestra destacado y no navegable, para que el usuario siempre sepa dónde está.
export const HrQuickLinks: React.FC<HrQuickLinksProps> = ({ active, onNavigate }) => {
  const actions: QuickLaunchAction[] = HR_ANCHORS.map((anchor) => ({
    id: anchor.featureId,
    label: anchor.label,
    active: anchor.key === active,
    onClick: () => onNavigate?.(anchor.featureId),
  }));

  return (
    <nav aria-label="Human resources workspace shortcuts">
      <QuickLaunchPanel
        title="Human Resources"
        description="Jump across the HR workspaces — the collaborator database, their contracts, and time entry control."
        actions={actions}
      />
    </nav>
  );
};

export default HrQuickLinks;
