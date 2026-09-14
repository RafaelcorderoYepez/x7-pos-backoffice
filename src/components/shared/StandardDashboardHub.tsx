import React, { useState } from 'react';

export type DashboardKPIVariant = 'red' | 'blue' | 'amber' | 'emerald' | 'purple' | 'zinc';
export type DashboardBadgeVariant = 'emerald' | 'blue' | 'amber' | 'purple' | 'zinc' | 'rose';

export interface DashboardKPIItem {
  id?: string;
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  variant?: DashboardKPIVariant;
  isOperationalStatus?: boolean;
  statusLabel?: string;
  onClick?: () => void;
}

export interface DashboardModuleItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  badge?: string;
  badgeVariant?: DashboardBadgeVariant;
  customBadgeColor?: string;
  actionText?: string;
  onClick?: () => void;
}

export interface StandardDashboardHubProps {
  /** Subtítulo o categoría en el encabezado (ej. "Kitchen Display System / Operational Hub") */
  breadcrumb?: string;
  /** Icono Material Symbol del encabezado (ej. "space_dashboard") */
  headerIcon?: string;
  /** Título principal en mayúsculas (ej. "KDS Ecosystem Command Hub") */
  title: string;
  /** Descripción del hub */
  description: string;
  /** Acción principal opcional a la derecha (ej. "LAUNCH LIVE KDS DISPLAY") */
  primaryAction?: {
    label: string;
    icon?: string;
    onClick: () => void;
  };
  /** Acción secundaria opcional a la derecha */
  secondaryAction?: {
    label: string;
    icon?: string;
    onClick: () => void;
  };
  /** Los 4 KPI cards de la tira horizontal de estado */
  kpis: DashboardKPIItem[];
  /** Indica si los KPIs están cargando métricas */
  loadingKpis?: boolean;
  /** Lista de tarjetas de submódulos (grilla de 3 columnas) */
  modules: DashboardModuleItem[];
  /** Callback global de navegación al hacer clic en un submódulo */
  onModuleClick?: (id: string) => void;
  /** Contenido adicional o barra de navegación inferior (ej. QuickLinks / NavHubBar) */
  children?: React.ReactNode;
}

const KPI_VARIANT_MAP: Record<DashboardKPIVariant, { border: string; borderHover: string; badgeBg: string; badgeBgHover: string; iconColor: string }> = {
  red: {
    border: 'border-red-500',
    borderHover: 'hover:border-red-400',
    badgeBg: 'bg-red-500/20',
    badgeBgHover: 'group-hover:bg-red-500',
    iconColor: 'text-red-400 group-hover:text-white',
  },
  blue: {
    border: 'border-blue-500',
    borderHover: 'hover:border-blue-300',
    badgeBg: 'bg-blue-500/20',
    badgeBgHover: 'group-hover:bg-blue-500',
    iconColor: 'text-blue-400 group-hover:text-white',
  },
  amber: {
    border: 'border-amber-500',
    borderHover: 'hover:border-amber-300',
    badgeBg: 'bg-amber-500/20',
    badgeBgHover: 'group-hover:bg-amber-500',
    iconColor: 'text-amber-400 group-hover:text-white',
  },
  emerald: {
    border: 'border-emerald-500',
    borderHover: 'hover:border-emerald-300',
    badgeBg: 'bg-emerald-500/20',
    badgeBgHover: 'group-hover:bg-emerald-500',
    iconColor: 'text-emerald-400 group-hover:text-white',
  },
  purple: {
    border: 'border-purple-500',
    borderHover: 'hover:border-purple-300',
    badgeBg: 'bg-purple-500/20',
    badgeBgHover: 'group-hover:bg-purple-500',
    iconColor: 'text-purple-400 group-hover:text-white',
  },
  zinc: {
    border: 'border-zinc-500',
    borderHover: 'hover:border-zinc-300',
    badgeBg: 'bg-zinc-500/20',
    badgeBgHover: 'group-hover:bg-zinc-500',
    iconColor: 'text-zinc-400 group-hover:text-white',
  },
};

const BADGE_COLOR_MAP: Record<DashboardBadgeVariant, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  amber: 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]',
  purple: 'bg-purple-100 text-purple-800 border-purple-300',
  zinc: 'bg-zinc-100 text-zinc-800 border-zinc-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
};

/**
 * Componente Reutilizable Estándar para Dashboards y Command Hubs de x7POS.
 * Incluye:
 * 1. Tarjeta Header Corporativa con Icono, Título y Botón de Acción.
 * 2. Tira de 4 KPIs Horizontales oscuros (grid-cols-4) con bordes de color y micro-animaciones.
 * 3. Grilla de Tarjetas de Módulos (grid-cols-3) con badges, iconos y enlaces directos con flecha.
 * 4. Slot inferior para enlaces rápidos o NavHubBar.
 */
export const StandardDashboardHub: React.FC<StandardDashboardHubProps> = ({
  breadcrumb,
  headerIcon = 'space_dashboard',
  title,
  description,
  primaryAction,
  secondaryAction,
  kpis,
  loadingKpis = false,
  modules,
  onModuleClick,
  children,
}) => {
  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-12 w-full">
      {/* 1. Header Card Hub */}
      <div className="bg-white border border-[#e8e2d8] p-6 shadow-xs rounded">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            {breadcrumb && (
              <div className="flex items-center gap-2 text-xs font-bold text-[#ae001a] tracking-wider uppercase mb-1">
                <span className="material-symbols-outlined text-lg">{headerIcon}</span>
                <span>{breadcrumb}</span>
              </div>
            )}
            <h1 className="text-2xl font-black text-[#1d1c17] tracking-tight uppercase">
              {title}
            </h1>
            <p className="text-body-sm text-[#5f5e5e] mt-1 max-w-3xl">
              {description}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs uppercase tracking-wider rounded border border-zinc-300 transition-all flex items-center gap-2 cursor-pointer"
              >
                {secondaryAction.icon && (
                  <span className="material-symbols-outlined text-base">{secondaryAction.icon}</span>
                )}
                <span>{secondaryAction.label}</span>
              </button>
            )}

            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white font-bold text-xs uppercase tracking-wider rounded shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                {primaryAction.icon && (
                  <span className="material-symbols-outlined text-lg">{primaryAction.icon}</span>
                )}
                <span>{primaryAction.label}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Hero KPI Health Strip (4 Cuadrados pequeños obligatoriamente en 1 sola línea horizontal) */}
      <div className="grid grid-cols-4 gap-3 w-full">
        {kpis.slice(0, 4).map((kpi, idx) => {
          const defaultVariant: DashboardKPIVariant =
            kpi.variant || (idx === 0 ? 'red' : idx === 1 ? 'blue' : idx === 2 ? 'amber' : 'emerald');
          const styling = KPI_VARIANT_MAP[defaultVariant] || KPI_VARIANT_MAP.red;

          return (
            <div
              key={kpi.id || kpi.title || idx}
              onClick={kpi.onClick}
              className={`bg-[#222222] hover:bg-[#2c2b25] text-white p-3.5 rounded-lg border-t-4 ${styling.border} ${styling.borderHover} shadow-sm flex flex-col justify-between h-32 group hover:-translate-y-0.5 transition-all duration-200 min-w-0 ${
                kpi.onClick ? 'cursor-pointer' : ''
              }`}
            >
              <div className="flex items-center justify-between w-full min-w-0 gap-1">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 group-hover:text-white transition-colors truncate">
                  {kpi.title}
                </span>
                <div className={`w-7 h-7 rounded ${styling.badgeBg} ${styling.badgeBgHover} flex items-center justify-center transition-all shrink-0`}>
                  <span className={`material-symbols-outlined text-base ${styling.iconColor} transition-colors`}>
                    {kpi.icon}
                  </span>
                </div>
              </div>

              <div>
                {kpi.isOperationalStatus ? (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <p className="text-xs sm:text-sm font-black text-emerald-400 uppercase tracking-wider truncate">
                      {kpi.statusLabel || String(kpi.value)}
                    </p>
                  </div>
                ) : (
                  <p className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
                    {loadingKpis ? '...' : kpi.value}
                  </p>
                )}
                <p className="text-[9px] text-zinc-400 group-hover:text-zinc-300 font-medium mt-1 truncate">
                  {kpi.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Sub-Module Command Cards Grid (3 Cuadrados por línea = 2 filas de 3) */}
      <div className="grid grid-cols-3 gap-4 mt-2 w-full">
        {modules.map((mod) => (
          <StandardDashboardModuleCard
            key={mod.id}
            mod={mod}
            onClick={() => {
              if (mod.onClick) mod.onClick();
              else if (onModuleClick) onModuleClick(mod.id);
            }}
          />
        ))}
      </div>

      {/* 4. Slot inferior para enlaces rápidos o NavHubBar */}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};

interface StandardDashboardModuleCardProps {
  mod: DashboardModuleItem;
  onClick?: () => void;
}

const StandardDashboardModuleCard: React.FC<StandardDashboardModuleCardProps> = ({ mod, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  const badgeClass =
    mod.customBadgeColor ||
    (mod.badgeVariant ? BADGE_COLOR_MAP[mod.badgeVariant] : BADGE_COLOR_MAP.zinc);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-white border rounded-xl p-5 pb-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between min-w-0 h-[220px] ${
        isHovered ? 'border-[#ae001a]' : 'border-[#e8e2d8]'
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-3 min-w-0 gap-2">
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all duration-200 shrink-0 ${
              isHovered ? 'bg-[#ae001a] border-[#ae001a]' : 'bg-[#fef9f1] border-[#e8e2d8]'
            }`}
          >
            <span
              className="material-symbols-outlined text-xl transition-colors duration-200"
              style={{ color: isHovered ? '#ffffff' : '#ae001a' }}
            >
              {mod.icon}
            </span>
          </div>

          {mod.badge && (
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${badgeClass}`}>
              {mod.badge}
            </span>
          )}
        </div>

        <h3
          className={`font-bold text-xs sm:text-sm transition-colors duration-200 leading-tight ${
            isHovered ? 'text-[#ae001a]' : 'text-[#1d1c17]'
          }`}
        >
          {mod.title}
        </h3>

        <p className="text-[9px] font-semibold text-[#8a8880] uppercase tracking-wider mt-1 mb-2">
          {mod.subtitle}
        </p>

        <p className="text-[11px] text-[#5f5e5e] leading-snug line-clamp-3">
          {mod.description}
        </p>
      </div>

      <div
        className={`mt-3 pt-3 border-t border-[#e8e2d8] flex items-center justify-between text-xs font-bold text-[#ae001a] transition-transform duration-200 ${
          isHovered ? 'translate-x-1' : ''
        }`}
      >
        <span className="truncate">{mod.actionText || 'Explore Module'}</span>
        <span className="material-symbols-outlined text-base shrink-0">arrow_forward</span>
      </div>
    </div>
  );
};

export default StandardDashboardHub;
