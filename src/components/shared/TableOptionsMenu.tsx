import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type TableDensity = 'compact' | 'comfortable' | 'spacious';

export interface ColumnOption {
  key: string;
  label: string;
}

export interface CustomActionOption {
  icon: string;
  label: string;
  onClick: () => void;
  colorClass?: string;
}

export const DEFAULT_PAGE_SIZE = 5;

export interface TableOptionsMenuProps {
  // Pestaña Acciones
  onExportCSV?: () => void;
  exportCSVLabel?: string;
  onPrint?: () => void;
  printLabel?: string;
  onCopySummary?: () => void;
  copySummaryLabel?: string;
  onReload?: () => void;
  customActions?: CustomActionOption[];

  // Pestaña Columnas
  columns?: ColumnOption[];
  visibleColumns?: Record<string, boolean>;
  onToggleColumn?: (columnKey: string) => void;

  // Pestaña Vista & Densidad
  rowDensity?: TableDensity;
  onChangeDensity?: (density: TableDensity) => void;

  // Paginación y Límites
  totalItems?: number;
  pageSize?: number;
  onChangePageSize?: (size: number) => void;
  pageSizeOptions?: number[];
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

export const TableOptionsMenu: React.FC<TableOptionsMenuProps> = ({
  onExportCSV,
  exportCSVLabel = 'Export Directory to CSV',
  onPrint,
  printLabel = 'Print Directory',
  onCopySummary,
  copySummaryLabel = 'Copy Summary to Clipboard',
  onReload,
  customActions = [],
  columns = [],
  visibleColumns = {},
  onToggleColumn,
  rowDensity = 'comfortable',
  onChangeDensity,
  totalItems,
  pageSize: propPageSize,
  onChangePageSize,
  pageSizeOptions = [5, 10, 15, 20, 25, 50, 100],
  currentPage: propCurrentPage,
  onPageChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [menuCoords, setMenuCoords] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
  }>({ right: 16, maxHeight: 450 });

  const updateMenuPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsOpen(false);
      return;
    }
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const right = Math.max(8, window.innerWidth - rect.right);

    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      setMenuCoords({
        bottom: window.innerHeight - rect.top + 6,
        right,
        maxHeight: Math.min(480, spaceAbove),
      });
    } else {
      setMenuCoords({
        top: rect.bottom + 6,
        right,
        maxHeight: Math.min(480, spaceBelow),
      });
    }
  };

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updateMenuPosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handleScrollOrResize = () => {
      updateMenuPosition();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  // Estado interno para paginación por defecto si no es controlada externamente
  const [internalPageSize, setInternalPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [internalCurrentPage, setInternalCurrentPage] = useState<number>(1);

  const pageSize = propPageSize !== undefined ? propPageSize : internalPageSize;
  const currentPage = propCurrentPage !== undefined ? propCurrentPage : internalCurrentPage;

  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
    } else {
      setInternalCurrentPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (onChangePageSize) {
      onChangePageSize(newSize);
    } else {
      setInternalPageSize(newSize);
    }
    handlePageChange(1);
  };

  // Determinar pestañas disponibles
  const hasActionsTab = !!(onExportCSV || onPrint || onCopySummary || onReload || customActions.length > 0);
  const hasColumnsTab = columns.length > 0 && !!onToggleColumn;
  const hasDensityTab = !!(onChangeDensity || onChangePageSize);

  const [activeTab, setActiveTab] = useState<'tools' | 'columns' | 'density'>(
    hasActionsTab ? 'tools' : hasColumnsTab ? 'columns' : 'density'
  );

  // Cerrar el menú al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Paginación automática en el DOM en caso de que la tabla del contenedor tenga más de 5 filas
  // y la vista padre no haya implementado el slicing manualmente en React
  useEffect(() => {
    if (onPageChange) return;
    const container = menuRef.current?.closest('div.bg-white, .rounded, [class*="border"]');
    if (!container) return;
    const tbody = container.querySelector('table tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr')).filter(
      (tr) => !tr.querySelector('td[colspan]')
    );

    if (rows.length > pageSize && pageSize < 9999) {
      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;
      rows.forEach((row, idx) => {
        (row as HTMLElement).style.display = idx >= start && idx < end ? '' : 'none';
      });
    } else if (pageSize >= 9999) {
      rows.forEach((row) => {
        (row as HTMLElement).style.display = '';
      });
    }
  }, [currentPage, pageSize, totalItems, onPageChange]);

  const itemsCount = totalItems !== undefined ? totalItems : 9999;
  const filteredLimits = pageSizeOptions.filter((limit, idx) => {
    if (limit <= itemsCount) return true;
    const prev = pageSizeOptions[idx - 1];
    return !prev || prev < itemsCount;
  });

  const totalPages = pageSize && pageSize < 9999 && totalItems ? Math.ceil(totalItems / pageSize) : 1;

  return (
    <div className="relative inline-flex items-center gap-1.5 text-left font-sans" ref={menuRef}>
      {/* Controles de paginación de cabecera si hay más de 1 página */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1 bg-[#1a1a1a] px-2 py-1 rounded border border-white/10 text-white select-none">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
            className="p-0.5 rounded hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center transition-colors"
            title="Previous Page"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          <span className="text-[10px] font-mono font-bold text-zinc-300 px-1">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
            className="p-0.5 rounded hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center transition-colors"
            title="Next Page"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer outline-none"
        title="Table Directory Options"
      >
        <span className="material-symbols-outlined text-base">more_vert</span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: menuCoords.top !== undefined ? `${menuCoords.top}px` : undefined,
              bottom: menuCoords.bottom !== undefined ? `${menuCoords.bottom}px` : undefined,
              right: `${menuCoords.right}px`,
              maxHeight: `${menuCoords.maxHeight}px`,
              zIndex: 99999,
            }}
            className="w-72 bg-white border border-[#e8e2d8] rounded-lg shadow-2xl text-left font-sans text-xs animate-fade-in flex flex-col overflow-hidden"
          >
            {/* Tabs de Selección Superior */}
            <div className="flex border-b border-[#e8e2d8] bg-[#f8f3eb] shrink-0">
              {hasActionsTab && (
                <button
                  type="button"
                  onClick={() => setActiveTab('tools')}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                    activeTab === 'tools'
                      ? 'bg-white text-[#ae001a] border-b-2 border-[#ae001a]'
                      : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">build</span>
                  Actions
                </button>
              )}
              {hasColumnsTab && (
                <button
                  type="button"
                  onClick={() => setActiveTab('columns')}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                    activeTab === 'columns'
                      ? 'bg-white text-[#ae001a] border-b-2 border-[#ae001a]'
                      : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">view_column</span>
                  Columns
                </button>
              )}
              {hasDensityTab && (
                <button
                  type="button"
                  onClick={() => setActiveTab('density')}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                    activeTab === 'density'
                      ? 'bg-white text-[#ae001a] border-b-2 border-[#ae001a]'
                      : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">tune</span>
                  View & Density
                </button>
              )}
            </div>

            {/* Tab 1: Acciones & Herramientas */}
            {activeTab === 'tools' && hasActionsTab && (
              <div className="py-2 overflow-y-auto flex-1 overscroll-contain">
                {onExportCSV && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onExportCSV();
                    }}
                    className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base text-[#ae001a]">download</span>
                    <span>{exportCSVLabel}</span>
                  </button>
                )}

                {onPrint && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onPrint();
                    }}
                    className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base text-zinc-600">print</span>
                    <span>{printLabel}</span>
                  </button>
                )}

                {onCopySummary && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onCopySummary();
                    }}
                    className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base text-amber-700">content_copy</span>
                    <span>{copySummaryLabel}</span>
                  </button>
                )}

                {customActions.map((action, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      action.onClick();
                    }}
                    className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <span className={`material-symbols-outlined text-base ${action.colorClass || 'text-zinc-600'}`}>
                      {action.icon}
                    </span>
                    <span>{action.label}</span>
                  </button>
                ))}

                {onReload && (
                  <>
                    <div className="border-t border-[#e8e2d8] my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onReload();
                      }}
                      className="w-full px-4 py-2.5 hover:bg-[#fef9f1] text-[#1c1b16] font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base text-emerald-700">refresh</span>
                      <span>Reload Catalog Data</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Tab 2: Personalizar Columnas */}
            {activeTab === 'columns' && hasColumnsTab && (
              <div className="p-3 space-y-2 overflow-y-auto flex-1 overscroll-contain pb-4">
                <div className="flex items-center justify-between text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">
                  <span>Show / Hide Columns</span>
                  <span className="text-[9px] text-zinc-400 font-normal">Min 1 visible</span>
                </div>
                {columns.map((col) => {
                  const isChecked = visibleColumns[col.key] !== false;
                  const activeCount = columns.filter((c) => visibleColumns[c.key] !== false).length;
                  const isOnlyOneActive = isChecked && activeCount <= 1;

                  return (
                    <label
                      key={col.key}
                      className={`flex items-center justify-between p-2 rounded text-[#1c1b16] font-bold select-none transition-colors ${
                        isOnlyOneActive
                          ? 'opacity-50 cursor-not-allowed bg-zinc-50'
                          : 'hover:bg-[#fef9f1] cursor-pointer'
                      }`}
                      title={isOnlyOneActive ? 'At least 1 column must remain visible' : undefined}
                    >
                      <span className="text-[12px] pr-2">{col.label}</span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isOnlyOneActive}
                        onChange={() => !isOnlyOneActive && onToggleColumn && onToggleColumn(col.key)}
                        className="accent-[#ae001a] cursor-pointer disabled:cursor-not-allowed w-4 h-4 shrink-0"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {/* Tab 3: Densidad & Filas por Página */}
            {activeTab === 'density' && hasDensityTab && (
              <div className="p-3 space-y-4 overflow-y-auto flex-1 overscroll-contain pb-4">
                {/* Densidad de Fila */}
                {onChangeDensity && (
                  <div>
                    <div className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">
                      Row Density (Padding)
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-[#f2ede5] p-1 rounded">
                      {[
                        { key: 'compact', label: 'Compact' },
                        { key: 'comfortable', label: 'Comfortable' },
                        { key: 'spacious', label: 'Spacious' },
                      ].map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => onChangeDensity(d.key as any)}
                          className={`py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            rowDensity === d.key
                              ? 'bg-white text-[#ae001a] shadow-xs'
                              : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cantidad de Registros por Página */}
                {onChangePageSize && (
                  <div>
                    <div className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">
                      Visible Rows per Page
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {filteredLimits.map((limit) => (
                        <button
                          key={limit}
                          type="button"
                          onClick={() => onChangePageSize(limit)}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                            pageSize === limit
                              ? 'bg-[#ae001a] text-white border-[#ae001a]'
                              : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-[#fef9f1]'
                          }`}
                        >
                          {limit}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onChangePageSize(9999)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                          !pageSize || pageSize >= 9999
                            ? 'bg-[#ae001a] text-white border-[#ae001a]'
                            : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:bg-[#fef9f1]'
                        }`}
                      >
                        All
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export const NoColumnsEmptyState: React.FC = () => (
  <div className="p-12 text-center bg-[#fef9f1] border-t border-[#e8e2d8] flex flex-col items-center justify-center gap-2 font-sans select-none">
    <span className="material-symbols-outlined text-4xl text-[#5f5e5e]">
      view_column
    </span>
    <p className="text-body-md font-bold text-[#1d1c17]">No Columns Selected</p>
    <p className="text-body-sm text-[#5f5e5e] max-w-sm">
      All table columns are currently hidden. Open the 3-dots menu (⋮) to toggle visible columns.
    </p>
  </div>
);

export interface TableEmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  colSpan?: number;
  asTableRow?: boolean;
}

export const TableEmptyState: React.FC<TableEmptyStateProps> = ({
  icon = 'search_off',
  title,
  description,
  colSpan = 1,
  asTableRow = true,
}) => {
  const content = (
    <>
      <span className="material-symbols-outlined text-secondary text-5xl block mb-2 mx-auto select-none">
        {icon}
      </span>
      <p className="font-bold text-[#222222] uppercase text-sm">{title}</p>
      {description && <p className="text-xs text-[#666666] mt-1">{description}</p>}
    </>
  );

  if (!asTableRow) {
    return (
      <div className="py-12 px-6 text-center text-secondary font-sans bg-white border border-[#e8e2d8] rounded">
        {content}
      </div>
    );
  }

  return (
    <tr>
      <td colSpan={colSpan} className="py-12 px-6 text-center text-secondary font-sans bg-white">
        {content}
      </td>
    </tr>
  );
};

export interface TablePaginationFooterProps {
  currentPage?: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  totalPages?: number;
  onPageSizeChange?: (size: number) => void;
}

export const TablePaginationFooter: React.FC<TablePaginationFooterProps> = ({
  currentPage = 1,
  totalItems,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  totalPages: propTotalPages,
}) => {
  if (!pageSize || pageSize >= 9999 || totalItems === 0) {
    return null;
  }

  const totalPages = propTotalPages ?? Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1 && totalItems <= 5) {
    return null;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#f8f3eb]/60 border-t border-[#e8e2d8] text-xs font-sans select-none">
      <div className="text-[#5f5e5e] font-semibold text-[11px]">
        Showing <span className="font-bold text-[#1d1c17]">{startItem}</span> - <span className="font-bold text-[#1d1c17]">{endItem}</span> of <span className="font-bold text-[#1d1c17]">{totalItems}</span> items
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="px-2.5 py-1 bg-white border border-[#e8e2d8] rounded text-[#1d1c17] font-bold hover:bg-[#fef9f1] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
          <span>Previous</span>
        </button>

        <span className="px-2 text-[11px] font-mono font-bold text-[#5f5e5e]">
          Page {currentPage} of {totalPages}
        </span>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="px-2.5 py-1 bg-white border border-[#e8e2d8] rounded text-[#1d1c17] font-bold hover:bg-[#fef9f1] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer"
        >
          <span>Next</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>
    </div>
  );
};

export const getDensityPadding = (rowDensity: TableDensity = 'comfortable'): string => {
  switch (rowDensity) {
    case 'compact':
      return 'py-2 px-3';
    case 'spacious':
      return 'py-5 px-6';
    case 'comfortable':
    default:
      return 'py-3.5 px-4';
  }
};

export function useTablePagination<T>(items: T[], initialPageSize: number = DEFAULT_PAGE_SIZE) {
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalItems = items.length;
  const totalPages = pageSize >= 9999 || pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedItems = React.useMemo(() => {
    if (!pageSize || pageSize >= 9999) return items;
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems,
    paginatedItems,
  };
}
