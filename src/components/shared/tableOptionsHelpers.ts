import { useState, useMemo } from 'react';
import type { TableDensity } from './TableOptionsMenu';

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

export function useTablePagination<T>(items: T[], initialPageSize: number = 10) {
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalItems = items.length;
  const totalPages = pageSize >= 9999 || pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));

  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }

  const paginatedItems = useMemo(() => {
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
