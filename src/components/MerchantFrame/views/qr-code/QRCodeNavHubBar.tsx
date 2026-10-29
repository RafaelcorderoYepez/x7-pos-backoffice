import React from 'react';

export type QRCodeSubModuleId =
  | 'qr-locations'
  | 'qr-menus'
  | 'menu-sections'
  | 'menu-items'
  | 'deployments'
  | 'qr-orders'
  | 'order-items';

export interface QRCodeNavHubItem {
  id: QRCodeSubModuleId;
  label: string;
  path: string;
  featureId: string;
  icon: string;
}

const QR_CODE_NAV_MODULES: QRCodeNavHubItem[] = [
  {
    id: 'qr-locations',
    label: 'QR LOCATIONS',
    path: '/qr-code/locations',
    featureId: 'qr-code-locations',
    icon: 'location_on',
  },
  {
    id: 'qr-menus',
    label: 'QR MENUS',
    path: '/qr-code/menus',
    featureId: 'qr-code-menus',
    icon: 'restaurant_menu',
  },
  {
    id: 'menu-sections',
    label: 'MENU SECTIONS',
    path: '/qr-code/menu-sections',
    featureId: 'qr-code-menu-sections',
    icon: 'view_headline',
  },
  {
    id: 'menu-items',
    label: 'MENU ITEMS',
    path: '/qr-code/menu-items',
    featureId: 'qr-code-menu-items',
    icon: 'fastfood',
  },
  {
    id: 'deployments',
    label: 'DEPLOYMENTS',
    path: '/qr-code/deployments',
    featureId: 'qr-code-deployments',
    icon: 'rocket_launch',
  },
  {
    id: 'qr-orders',
    label: 'QR ORDERS',
    path: '/qr-code/orders',
    featureId: 'qr-code-orders',
    icon: 'qr_code_scanner',
  },
  {
    id: 'order-items',
    label: 'ORDER ITEMS',
    path: '/qr-code/order-items',
    featureId: 'qr-order-items',
    icon: 'receipt_long',
  },
];

interface QRCodeNavHubBarProps {
  activeModule?: QRCodeSubModuleId;
  onNavigate?: (featureIdOrPath: string) => void;
}

export const QRCodeNavHubBar: React.FC<QRCodeNavHubBarProps> = ({
  activeModule = 'qr-menus',
  onNavigate,
}) => {
  const handleItemClick = (item: QRCodeNavHubItem) => {
    if (onNavigate) {
      // Prioritize featureId which MerchantFrame tabs use, or path
      onNavigate(item.featureId);
    }
  };

  return (
    <nav
      aria-label="QR Code System Sub-Modules"
      className="sticky bottom-0 z-30 w-full bg-white/95 backdrop-blur-md border-t border-[#e8e2d8] shadow-lg py-2.5 px-4"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
        {/* Hub Title Badge */}
        <div className="hidden lg:flex items-center gap-2 pl-1 pr-3 border-r border-[#e8e2d8] shrink-0">
          <span className="material-symbols-outlined text-[#ae001a] text-xl">space_dashboard</span>
          <div className="leading-tight">
            <span className="text-[10px] font-bold tracking-wider text-[#5f5e5e] uppercase font-poppins">
              QR System
            </span>
            <span className="block text-xs font-bold text-[#1d1c17] font-poppins">
              Navigation Hub
            </span>
          </div>
        </div>

        {/* 7 Sub-Module Navigation Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 justify-start lg:justify-center overflow-x-auto no-scrollbar py-0.5">
          {QR_CODE_NAV_MODULES.map((item) => {
            const isActive = activeModule === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                data-testid={`nav-hub-${item.id}`}
                data-path={item.path}
                data-feature-id={item.featureId}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors duration-200 font-poppins shrink-0 border ${
                  isActive
                    ? 'bg-[#ae001a] text-white border-[#ae001a] shadow-sm'
                    : 'bg-[#fef9f1] text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]/40'
                }`}
                aria-current={isActive ? 'page' : undefined}
                title={`Navigate to ${item.label} (${item.path})`}
              >
                <span className="material-symbols-outlined text-base">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Status Indicator */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0 text-[11px] text-[#5f5e5e] font-poppins font-semibold pr-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>7 Modules Active</span>
        </div>
      </div>
    </nav>
  );
};
