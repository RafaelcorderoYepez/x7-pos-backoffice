import React, { useEffect, useState } from 'react';

export interface NavHubItem {
  id: string;
  label: string;
  icon?: string;
  active?: boolean;
  onClick: () => void;
}

export interface NavHubBarProps {
  title?: string;
  titleIcon?: string;
  subtitle?: string;
  activeModuleId?: string;
  items: NavHubItem[];
  className?: string;
  isSidebarCollapsed?: boolean;
  onBackToDashboard?: () => void;
  onBack?: () => void;
  backToDashboardLabel?: string;
}

export const NavHubBar: React.FC<NavHubBarProps> = ({
  title,
  titleIcon,
  activeModuleId,
  items = [],
  className = '',
  isSidebarCollapsed: propIsSidebarCollapsed,
  onBackToDashboard,
  onBack,
  backToDashboardLabel,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const handleBack = onBackToDashboard || onBack;

  useEffect(() => {
    if (propIsSidebarCollapsed !== undefined) {
      void Promise.resolve().then(() => {
        setCollapsed(propIsSidebarCollapsed);
      });
      return;
    }

    const checkSidebar = () => {
      const aside = document.querySelector('aside');
      if (aside) {
        setCollapsed(aside.classList.contains('-translate-x-full'));
      }
    };

    void Promise.resolve().then(() => {
      checkSidebar();
    });
    const aside = document.querySelector('aside');
    if (!aside) return;

    const observer = new MutationObserver(checkSidebar);
    observer.observe(aside, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [propIsSidebarCollapsed]);

  // Mismo desplazamiento que el <main> de MerchantFrame (`left-64` sin prefijo): las
  // variantes responsive (`md:`) no generan CSS en esta app, así que `md:left-64` dejaba la
  // barra siempre en left-0, metida bajo el menú lateral.
  const leftOffsetClass = collapsed ? 'left-0' : 'left-64';

  return (
    <div
      className={`fixed bottom-0 ${leftOffsetClass} right-0 z-40 bg-[#222222] border-t-2 border-[#ae001a] text-white py-2 px-4 shadow-2xl font-sans transition-all duration-300 ease-in-out ${className}`}
    >
      <div className="w-full flex items-center justify-center relative min-h-[36px]">
        {/* Back Button on the left (Compact Arrow Only) */}
        {handleBack ? (
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              handleBack();
            }}
            className="flex items-center justify-center w-8 h-8 bg-[#ae001a] hover:bg-[#900015] text-white rounded transition-all shadow-xs cursor-pointer absolute left-2 sm:left-4 select-none shrink-0"
            title={backToDashboardLabel || 'Return to Main Dashboard'}
            aria-label={backToDashboardLabel || 'Return to Main Dashboard'}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_back</span>
          </button>
        ) : title ? (
          <div className="hidden lg:flex items-center gap-2 text-xs font-bold tracking-wider text-[#e8e2d8] uppercase absolute left-4">
            {titleIcon && (
              <span className="material-symbols-outlined text-[#ae001a] text-lg" aria-hidden="true">
                {titleIcon}
              </span>
            )}
            <span>{title}</span>
          </div>
        ) : null}

        {/* Navigation Buttons Array PERFECTLY CENTERED */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {items.map((item) => {
            const isActive = item.active || (activeModuleId ? item.id === activeModuleId : false);
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors duration-200 flex items-center gap-1.5 cursor-pointer font-sans select-none whitespace-nowrap ${
                  isActive
                    ? 'bg-[#ae001a] text-white shadow-xs'
                    : 'text-zinc-300 hover:text-[#ae001a] hover:bg-zinc-800'
                }`}
              >
                {item.icon && (
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">{item.icon}</span>
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
