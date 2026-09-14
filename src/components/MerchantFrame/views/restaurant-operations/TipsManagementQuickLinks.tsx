import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type TipsManagementModuleKey =
  | 'tips-ledger'
  | 'tips-pools'
  | 'tips-pool-members'
  | 'tips-allocations'
  | 'tips-settlements'
  | 'tips-cash-movements'
  | '/tips/ledger'
  | '/tips/pools'
  | '/tips/pool-members'
  | '/tips/allocations'
  | '/tips/settlements'
  | '/tips/cash-movements'
  | string;

interface TipsManagementQuickLinksProps {
  activeModule?: TipsManagementModuleKey;
  onNavigate?: (viewOrRoute: string) => void;
}

export interface TipShortcutAnchor {
  key: string;
  route: string;
  label: string;
  icon: string;
}

export const TIP_SHORTCUT_ANCHORS: TipShortcutAnchor[] = [
  {
    key: 'tips-ledger',
    route: '/tips/ledger',
    label: 'TIPS LEDGER',
    icon: 'payments',
  },
  {
    key: 'tips-pools',
    route: '/tips/pools',
    label: 'TIP POOLS',
    icon: 'groups',
  },
  {
    key: 'tips-pool-members',
    route: '/tips/pool-members',
    label: 'POOL MEMBERS',
    icon: 'person_add',
  },
  {
    key: 'tips-allocations',
    route: '/tips/allocations',
    label: 'TIP ALLOCATIONS',
    icon: 'pie_chart',
  },
  {
    key: 'tips-settlements',
    route: '/tips/settlements',
    label: 'TIP SETTLEMENTS',
    icon: 'account_balance_wallet',
  },
  {
    key: 'tips-cash-movements',
    route: '/tips/cash-movements',
    label: 'CASH TIP MOVEMENTS',
    icon: 'point_of_sale',
  },
];

export const TipsManagementQuickLinks: React.FC<TipsManagementQuickLinksProps> = ({
  activeModule = 'tips-ledger',
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = TIP_SHORTCUT_ANCHORS.map((anchor) => {
    const isActive =
      activeModule === anchor.key ||
      activeModule === anchor.route ||
      (activeModule === 'tips-ledger' && anchor.key === 'tips-ledger') ||
      ((activeModule === 'merchant-tips-rules' || activeModule === 'tips-rules') && anchor.key === 'tips-pools');

    return {
      id: anchor.key,
      label: anchor.label,
      icon: anchor.icon,
      active: isActive,
      onClick: () => {
        onNavigate?.(anchor.route);
      },
    };
  });

  return (
    <nav
      aria-label="Tips management navigation hub bar"
      className="sticky bottom-0 z-40 w-full bg-white/95 backdrop-blur-md border-t border-[#e8e2d8] shadow-lg py-3 px-6 font-poppins transition-all"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#8a7a68] uppercase tracking-wider font-poppins">
          <span className="material-symbols-outlined text-base text-[#ae001a]">payments</span>
          <span>Tips Navigation Hub</span>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-2">
          {TIP_SHORTCUT_ANCHORS.map((anchor) => {
            const isActive =
              activeModule === anchor.key ||
              activeModule === anchor.route ||
              (activeModule === 'tips-ledger' && anchor.key === 'tips-ledger') ||
              ((activeModule === 'merchant-tips-rules' || activeModule === 'tips-rules') && anchor.key === 'tips-pools');

            return (
              <button
                key={anchor.key}
                type="button"
                onClick={() => onNavigate?.(anchor.route)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold font-poppins transition-colors duration-200 ${
                  isActive
                    ? 'bg-[#ae001a] text-white shadow-sm'
                    : 'bg-[#fbf9f5] border border-[#e8e2d8] text-[#1c1b1f] hover:text-[#ae001a] hover:bg-[#f3eee7]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{anchor.icon}</span>
                <span>{anchor.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default TipsManagementQuickLinks;
