import React, { useState, useEffect, useCallback } from 'react';
import { StockQuickLinks } from '../StockQuickLinks';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession, getStoredUser } from '../../../../../../lib/auth-storage';
import { TableOptionsMenu, TablePaginationFooter, NoColumnsEmptyState, TableEmptyState, type TableDensity } from '../../../../../shared/TableOptionsMenu';
import { getDensityPadding } from '../../../../../shared/tableOptionsHelpers';

interface StockItemOption {
  id: number;
  currentQty: number;
  product?: { name: string; sku?: string } | null;
  supply?: { id: number; name: string; code?: string } | null;
  location?: { id: number; name: string } | null;
  weightedAverageUnitCost?: string | number | null;
}

interface Movement {
  id: number;
  item: {
    id: number;
    currentQty: number;
    product?: { name: string } | null;
    supply?: { name: string } | null;
    location?: { id: number; name: string } | null;
  } | null;
  quantity: number;
  type: string;
  movementType?: string | null;
  unitCost?: string | number | null;
  reference: string;
  reason: string;
  createdBy?: string | null;
  sourceLocationId?: number | null;
  sourceLocationName?: string | null;
  destinationLocationId?: number | null;
  destinationLocationName?: string | null;
  createdAt: string;
}

interface MovementsViewProps {
  onNavigate?: (view: string) => void;
}

export const MovementsView: React.FC<MovementsViewProps> = ({ onNavigate }) => {

  const [movements, setMovements] = useState<Movement[]>([]);
  const [stockItemOptions, setStockItemOptions] = useState<StockItemOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Table options, pagination, and filters
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    id: true,
    dateTime: true,
    type: true,
    material: true,
    sourceLoc: true,
    destLoc: true,
    quantity: true,
    unitCost: true,
    totalValue: true,
    operator: true,
  });
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [itemNameFilter, setItemNameFilter] = useState<string>('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('ALL');
  const [itemIdFilter, setItemIdFilter] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('itemId') || '';
  });

  // Modal Record Movement
  const [isRecordOpen, setIsRecordOpen] = useState<boolean>(false);
  const [formSupplyId, setFormSupplyId] = useState<string>('');
  const [formLocationId, setFormLocationId] = useState<string>('');
  const [formDestinationLocationId, setFormDestinationLocationId] = useState<string>('');
  const [formMovementType, setFormMovementType] = useState<string>('PURCHASE_RECEIPT');
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formActualCount, setFormActualCount] = useState<string>('');
  const [formUnitCost, setFormUnitCost] = useState<string>('');
  const [formReference, setFormReference] = useState<string>('');
  const [formReason, setFormReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentUser = getStoredUser();
  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  // Unique list of raw materials by name and ID
  const uniqueSuppliesMap = new Map<number, { id: number; name: string }>();
  stockItemOptions.forEach(item => {
    if (item.supply?.id && item.supply?.name) {
      uniqueSuppliesMap.set(item.supply.id, { id: item.supply.id, name: item.supply.name });
    } else if (item.product?.name) {
      uniqueSuppliesMap.set(item.id, { id: item.id, name: item.product.name });
    }
  });
  const uniqueSupplies = Array.from(uniqueSuppliesMap.values());

  // Available locations for selected raw material
  const availableStockItems = stockItemOptions.filter(item => {
    if (!formSupplyId) return false;
    if (item.supply?.id) return String(item.supply.id) === formSupplyId;
    return String(item.id) === formSupplyId;
  });

  // Unique list of global locations for transfer
  const uniqueLocationsMap = new Map<number, string>();
  stockItemOptions.forEach(item => {
    if (item.location?.id && item.location?.name) {
      uniqueLocationsMap.set(item.location.id, item.location.name);
    }
  });
  const uniqueLocations = Array.from(uniqueLocationsMap.entries()).map(([id, name]) => ({ id, name }));

  const fetchStockItems = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      let res = await fetch(`${API_BASE}/v1/raw-material-stock/items?limit=100`, { headers });
      if (!res.ok) {
        res = await fetch(`${API_BASE}/items?limit=100`, { headers });
      }
      if (res.ok) {
        const json = await res.json();
        const data = json.items || json.data || json || [];
        setStockItemOptions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error loading stock items options', e);
    }
  }, [API_BASE]);

  const fetchMovements = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const limitParam = pageSize === 9999 ? 500 : pageSize;
      let url = `${API_BASE}/v1/raw-material-stock/movements?page=${page}&limit=${limitParam}`;
      if (itemIdFilter) {
        url += `&itemId=${encodeURIComponent(itemIdFilter)}`;
      } else if (itemNameFilter.trim()) {
        url += `&itemName=${encodeURIComponent(itemNameFilter)}`;
      }
      if (movementTypeFilter !== 'ALL') {
        url += `&movementType=${encodeURIComponent(movementTypeFilter)}`;
      }

      let res = await fetch(url, { headers });
      if (!res.ok || res.status === 404) {
        url = `${API_BASE}/movements?page=${page}&limit=${limitParam}`;
        if (itemIdFilter) url += `&itemId=${encodeURIComponent(itemIdFilter)}`;
        else if (itemNameFilter.trim()) url += `&itemName=${encodeURIComponent(itemNameFilter)}`;
        res = await fetch(url, { headers });
      }

      if (res.status === 401) {
        clearAuthSession();
        window.location.assign('/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Error loading stock movements log');
      }

      const json = await res.json();
      const items = Array.isArray(json)
        ? json
        : Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.data?.data)
        ? json.data.data
        : [];
      setMovements(items);

      const totalCount =
        typeof json.total === 'number'
          ? json.total
          : typeof json.data?.total === 'number'
          ? json.data.total
          : typeof json.count === 'number'
          ? json.count
          : items.length;
      setTotalItems(totalCount);

      const pages =
        typeof json.totalPages === 'number'
          ? json.totalPages
          : typeof json.data?.totalPages === 'number'
          ? json.data.totalPages
          : Math.max(1, Math.ceil(totalCount / limitParam));
      setTotalPages(pages);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error loading stock movements.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, itemNameFilter, itemIdFilter, movementTypeFilter, API_BASE]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchMovements(true);
      fetchStockItems();
    });
  }, [fetchMovements, fetchStockItems]);

  const handleRecordMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!formSupplyId || !formLocationId) {
      setSubmitError('Please select both a Raw Material and a Storage Location.');
      return;
    }

    // ADJUSTMENT: validate actual count is provided
    if (formMovementType === 'ADJUSTMENT' && formActualCount === '') {
      setSubmitError('Please enter the new actual physical count for this adjustment.');
      return;
    }

    const selectedStockItem = availableStockItems.find(i => String(i.location?.id) === formLocationId);
    if (!selectedStockItem) {
      setSubmitError('Stock item record not found for the selected location.');
      return;
    }

    const sourceLocationName = selectedStockItem.location?.name || 'Source Location';

    // 1. Validation guard for Transfers
    if (formMovementType === 'TRANSFER') {
      if (!formDestinationLocationId) {
        setSubmitError('Please select a destination storage location.');
        return;
      }
      if (formLocationId === formDestinationLocationId) {
        setSubmitError('Source and destination locations must be different.');
        return;
      }
    }

    // 2. Insufficient Stock Guard for Transfers, Waste, and Outflows
    const isDecrement = formMovementType === 'TRANSFER' || formMovementType === 'WASTE' || formMovementType === 'POS_DEPLETION';
    const currentStockQty = Number(selectedStockItem.currentQty || 0);

    // For ADJUSTMENT, calculate delta from actual count
    let adjustmentDelta = 0;
    if (formMovementType === 'ADJUSTMENT') {
      const actualCount = Number(formActualCount);
      adjustmentDelta = actualCount - currentStockQty;
      if (adjustmentDelta < 0 && Math.abs(adjustmentDelta) > currentStockQty) {
        setSubmitError(`Insufficient stock in [${sourceLocationName}]. Available: ${currentStockQty}, Requested adjustment would set to: ${actualCount}.`);
        return;
      }
    }

    if (isDecrement) {
      if (currentStockQty < Number(formQuantity)) {
        setSubmitError(`Insufficient stock in [${sourceLocationName}]. Available: ${currentStockQty}, Requested: ${formQuantity}.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const isEntry = ['PURCHASE_RECEIPT', 'IN', 'RETURN'].includes(formMovementType);

      // For ADJUSTMENT, send the absolute delta and direction
      let finalQuantity = Number(formQuantity);
      let finalType: string = isEntry ? 'IN' : 'OUT';

      if (formMovementType === 'ADJUSTMENT') {
        finalQuantity = Math.abs(adjustmentDelta);
        finalType = adjustmentDelta >= 0 ? 'IN' : 'OUT';
      }

      // For PURCHASE_RECEIPT, the location is the destination (where stock arrives)
      const sourceLocId = formMovementType === 'PURCHASE_RECEIPT'
        ? null
        : Number(formLocationId);
      const destLocId = formMovementType === 'PURCHASE_RECEIPT'
        ? Number(formLocationId)
        : (formMovementType === 'TRANSFER' && formDestinationLocationId ? Number(formDestinationLocationId) : null);

      const payload = {
        stockItemId: selectedStockItem.id,
        supplyId: Number(formSupplyId),
        quantity: finalQuantity,
        type: finalType,
        movementType: formMovementType,
        unitCost: formUnitCost ? Number(formUnitCost) : undefined,
        reference: formReference || `MANUAL-${new Date().getTime()}`,
        reason: formReason || (formMovementType === 'ADJUSTMENT'
          ? `Physical count adjustment: ${currentStockQty} -> ${formActualCount} (delta: ${adjustmentDelta >= 0 ? '+' : ''}${adjustmentDelta})`
          : 'Manual inventory operation log'),
        sourceLocationId: sourceLocId,
        destinationLocationId: destLocId,
        createdBy: currentUser?.email || 'Inventory Clerk'
      };

      const res = await fetch(`${API_BASE}/v1/raw-material-stock/movements`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to record stock movement');
      }

      setIsRecordOpen(false);
      setFormSupplyId('');
      setFormLocationId('');
      setFormDestinationLocationId('');
      setFormQuantity(1);
      setFormActualCount('');
      setFormUnitCost('');
      setFormReference('');
      setFormReason('');
      await Promise.all([
        fetchMovements(),
        fetchStockItems()
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating movement record';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-24">
      {/* Section Title */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
              swap_horiz
            </span>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
          STOCK MOVEMENTS LOG
        </h2>
          </div>
        <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
          Audit trail of all inventory entries, exits, transfers, sales depletions, and adjustments across all active storage locations.
        </p>
      </div>

      {/* Search panel and actions */}
      <div className="bg-white border border-[#e8e2d8] rounded p-6 shadow-sm space-y-4">
        {/* Fila 1: Buscador a ancho completo */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            placeholder="Search stock movements by raw material name..."
            value={itemNameFilter}
            onChange={(e) => {
              setItemNameFilter(e.target.value);
              setPage(1);
            }}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-md font-sans outline-none focus:border-[#ae001a]"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* Movement Type Filter */}
            <select
              value={movementTypeFilter}
              onChange={(e) => {
                setMovementTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-sm font-sans outline-none focus:border-[#ae001a] text-secondary cursor-pointer font-bold"
            >
              <option value="ALL">All Movement Types</option>
              <option value="PURCHASE_RECEIPT">PURCHASE_RECEIPT</option>
              <option value="POS_DEPLETION">POS_DEPLETION</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="WASTE">WASTE</option>
              <option value="TRANSFER">TRANSFER</option>
            </select>

            {itemIdFilter && (
              <div className="flex items-center gap-2 bg-[#fef9f1] border border-[#ae001a]/30 px-3 py-2 rounded text-xs font-bold text-[#ae001a] whitespace-nowrap">
                <span>Filtered by Item #{itemIdFilter}</span>
                <button
                  onClick={() => {
                    setItemIdFilter('');
                    window.history.pushState({}, '', '/inventory/movements');
                    setPage(1);
                  }}
                  className="text-zinc-500 hover:text-[#ae001a] font-bold cursor-pointer ml-1 text-sm"
                  title="Clear item filter"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsRecordOpen(true)}
              className="px-5 py-2.5 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#8e0015] transition-all duration-200 cursor-pointer text-xs rounded flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>NEW MOVEMENT / ADJUSTMENT</span>
            </button>


            <button
              onClick={() => {
                window.history.pushState({}, '', '/inventory/stocks');
                if (onNavigate) onNavigate('stock-movements');
              }}
              className="px-4 py-2.5 bg-[#ece8e0] text-[#1c1b16] font-bold text-label-caps hover:bg-[#dcd7cd] transition-all duration-200 cursor-pointer text-xs rounded border border-[#e8e2d8]"
            >
              Back to Stock Ledger
            </button>
          </div>
        </div>
      </div>



      {/* Tabla Audit Trail Grid */}
      {(() => {
        const activeColSpan =
          (visibleColumns.id ? 1 : 0) +
          (visibleColumns.dateTime ? 1 : 0) +
          (visibleColumns.type ? 1 : 0) +
          (visibleColumns.material ? 1 : 0) +
          (visibleColumns.sourceLoc ? 1 : 0) +
          (visibleColumns.destLoc ? 1 : 0) +
          (visibleColumns.quantity ? 1 : 0) +
          (visibleColumns.unitCost ? 1 : 0) +
          (visibleColumns.totalValue ? 1 : 0) +
          (visibleColumns.operator ? 1 : 0);

        const densityPadding = getDensityPadding(rowDensity);

        return (
          <div className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden">
            <div className="p-4 bg-[#222222] flex justify-between items-center relative">
              <div className="flex items-center gap-3">
                <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
                  STOCK MOVEMENTS LEDGER AUDIT TRAIL
                </span>
                <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
                  {totalItems > 0 ? totalItems : movements.length} {(totalItems || movements.length) === 1 ? 'record' : 'records'}
                </span>
              </div>

              <TableOptionsMenu
                columns={[
                  { key: 'id', label: 'Movement ID' },
                  { key: 'dateTime', label: 'Date & Time' },
                  { key: 'type', label: 'Movement Type' },
                  { key: 'material', label: 'Raw Material' },
                  { key: 'sourceLoc', label: 'Source Location' },
                  { key: 'destLoc', label: 'Destination Location' },
                  { key: 'quantity', label: 'Quantity' },
                  { key: 'unitCost', label: 'Unit Cost' },
                  { key: 'totalValue', label: 'Total Value' },
                  { key: 'operator', label: 'Operator' },
                ]}
                visibleColumns={visibleColumns}
                onToggleColumn={(key) =>
                  setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                rowDensity={rowDensity}
                onChangeDensity={setRowDensity}
                totalItems={totalItems > 0 ? totalItems : movements.length}
                pageSize={pageSize}
                onChangePageSize={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                currentPage={page}
                onPageChange={setPage}
                onReload={() => fetchMovements()}
                onExportCSV={() => {
                  if (movements.length === 0) return;
                  const headers = ['ID', 'Date', 'Type', 'Material', 'Source', 'Destination', 'Quantity', 'Unit Cost', 'Total Value', 'Operator'];
                  const rows = movements.map((mv) => [
                    `MV-#${mv.id}`,
                    new Date(mv.createdAt).toISOString(),
                    mv.movementType || mv.type,
                    `"${(mv.item?.supply?.name || mv.item?.product?.name || '').replace(/"/g, '""')}"`,
                    `"${(mv.sourceLocationName || mv.item?.location?.name || '').replace(/"/g, '""')}"`,
                    `"${(mv.destinationLocationName || '').replace(/"/g, '""')}"`,
                    mv.quantity,
                    mv.unitCost || 0,
                    (Number(mv.unitCost || 0) * Number(mv.quantity || 0)).toFixed(2),
                    `"${(mv.createdBy || '').replace(/"/g, '""')}"`
                  ]);
                  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement('a');
                  link.setAttribute('href', encodedUri);
                  link.setAttribute('download', `stock_movements_${new Date().toISOString().slice(0, 10)}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                onPrint={() => window.print()}
                onCopySummary={() => {
                  const text = `Total Stock Movements: ${movements.length}`;
                  navigator.clipboard.writeText(text);
                }}
              />
            </div>

            {activeColSpan === 0 ? (
              <NoColumnsEmptyState />
            ) : (
              <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <table className="w-full border-collapse text-left text-xs font-sans">
                  <thead className="bg-[#ece8e0] border-b border-[#e8e2d8] text-[#5f5e5e]">
                    <tr>
                      {visibleColumns.id && (
                        <th className={`text-label-caps font-bold ${densityPadding}`}>Movement ID</th>
                      )}
                      {visibleColumns.dateTime && (
                        <th className={`text-label-caps font-bold ${densityPadding}`}>Date & Time</th>
                      )}
                      {visibleColumns.type && (
                        <th className={`text-label-caps font-bold text-center ${densityPadding}`}>Movement Type</th>
                      )}
                      {visibleColumns.material && (
                        <th className={`text-label-caps font-bold ${densityPadding}`}>Raw Material</th>
                      )}
                      {visibleColumns.sourceLoc && (
                        <th className={`text-label-caps font-bold ${densityPadding}`}>Source Loc</th>
                      )}
                      {visibleColumns.destLoc && (
                        <th className={`text-label-caps font-bold ${densityPadding}`}>Dest Loc</th>
                      )}
                      {visibleColumns.quantity && (
                        <th className={`text-label-caps font-bold text-right ${densityPadding}`}>Qty</th>
                      )}
                      {visibleColumns.unitCost && (
                        <th className={`text-label-caps font-bold text-right ${densityPadding}`}>Unit Cost</th>
                      )}
                      {visibleColumns.totalValue && (
                        <th className={`text-label-caps font-bold text-right ${densityPadding}`}>Total Value</th>
                      )}
                      {visibleColumns.operator && (
                        <th className={`text-label-caps font-bold ${densityPadding}`}>Operator</th>
                      )}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#e8e2d8]">
                    {isLoading ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                          <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                            sync
                          </span>
                          <p className="text-secondary text-body-md mt-2 font-sans">Loading stock movements ledger...</p>
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan={activeColSpan} className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white">
                          <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                            error
                          </span>
                          <p className="font-bold">{error}</p>
                          <button
                            onClick={() => fetchMovements()}
                            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                          >
                            Retry Connection
                          </button>
                        </td>
                      </tr>
                    ) : movements.length === 0 ? (
                      <TableEmptyState
                        colSpan={activeColSpan}
                        icon="swap_horiz"
                        title="No stock movements found"
                        description={
                          itemNameFilter || movementTypeFilter !== 'ALL' || itemIdFilter
                            ? 'No stock movements match your search filters.'
                            : 'No stock movements recorded in the ledger yet.'
                        }
                      />
                    ) : (
                      movements.map((mv) => {
                        const typeCode = mv.movementType || mv.type;
                        const isEntry = mv.type === 'IN' || ['PURCHASE_RECEIPT', 'RETURN', 'PURCHASE_ENTRY'].includes(mv.movementType || '');
                        const materialName = mv.item?.supply?.name || mv.item?.product?.name || 'Raw Material';
                        const srcLocName = mv.sourceLocationName || mv.item?.location?.name || '—';
                        const destLocName = mv.destinationLocationName || '—';
                        const costVal = Number(mv.unitCost || 0);
                        const totalVal = costVal * Number(mv.quantity || 0);

                        return (
                          <tr key={mv.id} className="hover:bg-[#f8f3eb] transition-colors">
                            {visibleColumns.id && (
                              <td className={`${densityPadding} font-mono font-bold text-zinc-900`}>
                                MV-#{mv.id}
                              </td>
                            )}
                            {visibleColumns.dateTime && (
                              <td className={`${densityPadding} text-zinc-700 whitespace-nowrap`}>
                                <div className="flex flex-col leading-tight">
                                  <span className="font-bold text-zinc-900">{new Date(mv.createdAt).toLocaleDateString()}</span>
                                  <span className="text-[10px] text-zinc-500 font-medium">{new Date(mv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </td>
                            )}
                            {visibleColumns.type && (
                              <td className={`${densityPadding} text-center whitespace-nowrap`}>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                  typeCode === 'ADJUSTMENT' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                                  typeCode === 'TRANSFER' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                                  typeCode === 'WASTE' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                  typeCode === 'POS_DEPLETION' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
                                  isEntry ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 
                                  'bg-red-100 text-red-800 border border-red-300'
                                }`}>
                                  {typeCode}
                                </span>
                              </td>
                            )}
                            {visibleColumns.material && (
                              <td className={`${densityPadding} font-semibold text-zinc-900`}>
                                {materialName}
                              </td>
                            )}
                            {visibleColumns.sourceLoc && (
                              <td className={`${densityPadding} text-zinc-700`}>
                                {srcLocName}
                              </td>
                            )}
                            {visibleColumns.destLoc && (
                              <td className={`${densityPadding} text-zinc-700`}>
                                {destLocName}
                              </td>
                            )}
                            {visibleColumns.quantity && (
                              <td className={`${densityPadding} font-mono font-bold text-right ${
                                isEntry ? 'text-emerald-700' : 'text-red-700'
                              }`}>
                                {isEntry ? '+' : '-'}{mv.quantity}
                              </td>
                            )}
                            {visibleColumns.unitCost && (
                              <td className={`${densityPadding} font-mono text-right text-zinc-700`}>
                                {costVal > 0 ? `$${costVal.toFixed(2)}` : '—'}
                              </td>
                            )}
                            {visibleColumns.totalValue && (
                              <td className={`${densityPadding} font-mono font-bold text-right text-zinc-900`}>
                                {totalVal > 0 ? `$${totalVal.toFixed(2)}` : '—'}
                              </td>
                            )}
                            {visibleColumns.operator && (
                              <td className={`${densityPadding} text-zinc-600 font-medium`}>
                                {mv.createdBy || 'System'}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
          )}

            <TablePaginationFooter
              currentPage={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems > 0 ? totalItems : movements.length}
              onPageChange={setPage}
              onChangePageSize={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </div>
        );
      })()}

      {/* Portal Modal + RECORD MOVEMENT */}
      {isRecordOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-hidden flex justify-end font-sans">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsRecordOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-zinc-200">
            <div className="p-6 border-b border-zinc-200 bg-white flex justify-between items-center">
              <div>
                <h3 className="text-heading-md font-bold text-[#ae001a] uppercase tracking-wider font-sans">
                  New Movement / Adjustment
                </h3>
                <p className="text-secondary text-body-xs mt-1 font-sans">
                  Record stock receipts, transfers, waste, or physical audit adjustments
                </p>
              </div>
              <button onClick={() => setIsRecordOpen(false)} className="p-1.5 text-secondary hover:text-[#ae001a]">
                <span className="material-symbols-outlined block text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleRecordMovementSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Seleccionar Materia Prima */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Select Raw Material *</label>
                <select
                  value={formSupplyId}
                  onChange={(e) => {
                    setFormSupplyId(e.target.value);
                    setFormLocationId('');
                  }}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                  required
                >
                  <option value="" disabled>Select a raw material...</option>
                  {uniqueSupplies.map(s => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Source Location / Warehouse */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">
                  {formMovementType === 'TRANSFER' ? 'Source Storage Location *'
                    : formMovementType === 'PURCHASE_RECEIPT' ? 'Destination Storage Location *'
                    : 'Storage Location *'}
                </label>
                <select
                  value={formLocationId}
                  onChange={(e) => setFormLocationId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                  disabled={!formSupplyId}
                  required
                >
                  <option value="" disabled>
                    {!formSupplyId ? 'First select a raw material above...' : 'Select storage location...'}
                  </option>
                  {availableStockItems.map(i => (
                    <option key={i.id} value={String(i.location?.id)}>
                      {i.location?.name || 'Unassigned'} — Current Stock: {i.currentQty}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Location if TRANSFER */}
              {formMovementType === 'TRANSFER' && (
                <div className="space-y-1.5">
                  <label className="block text-body-xs font-bold text-zinc-700">Destination Storage Location *</label>
                  <select
                    value={formDestinationLocationId}
                    onChange={(e) => setFormDestinationLocationId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                    required
                  >
                    <option value="" disabled>Select destination location...</option>
                    {uniqueLocations.filter(loc => String(loc.id) !== formLocationId).map(loc => (
                      <option key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Movement Type */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Movement Type *</label>
                <select
                  value={formMovementType}
                  onChange={(e) => setFormMovementType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                >
                  <option value="PURCHASE_RECEIPT">PURCHASE_RECEIPT (Entrada por Compra)</option>
                  <option value="WASTE">WASTE (Mermas / Desperdicio)</option>
                  <option value="TRANSFER">TRANSFER (Warehouse Transfer)</option>
                  <option value="ADJUSTMENT">ADJUSTMENT (Physical Inventory Adjustment)</option>
                  <option value="POS_DEPLETION">POS_DEPLETION (Salida por Venta POS)</option>
                </select>
              </div>

              {/* Unit Cost */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">
                  Unit Cost ($ USD) {formMovementType === 'PURCHASE_RECEIPT' ? '*' : '(Optional)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 12.50"
                  value={formUnitCost}
                  onChange={(e) => setFormUnitCost(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                  required={formMovementType === 'PURCHASE_RECEIPT'}
                />
              </div>

              {/* Quantity / Actual Count (conditional on ADJUSTMENT) */}
              {formMovementType === 'ADJUSTMENT' ? (
                <div className="space-y-1.5">
                  <label className="block text-body-xs font-bold text-zinc-700">New Actual Physical Count *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Enter the counted quantity..."
                    value={formActualCount}
                    onChange={(e) => setFormActualCount(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                    required
                  />
                  {formActualCount !== '' && formLocationId && (() => {
                    const si = availableStockItems.find(i => String(i.location?.id) === formLocationId);
                    const cur = Number(si?.currentQty || 0);
                    const actual = Number(formActualCount);
                    const delta = actual - cur;
                    return (
                      <div className={`p-2 rounded text-body-xs font-bold border ${
                        delta === 0 ? 'bg-zinc-50 text-zinc-500 border-zinc-200'
                          : delta > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        Current System Stock: {cur} &rarr; New Count: {actual}
                        {' '}(Delta: {delta >= 0 ? '+' : ''}{delta})
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-body-xs font-bold text-zinc-700">Quantity Units *</label>
                  <input
                    type="number"
                    min="1"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                    required
                  />
                </div>
              )}

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Reference (e.g. Invoice / PO / Ticket #)</label>
                <input
                  type="text"
                  placeholder="e.g. PO-2026-88"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                />
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Reason / Operation Notes *</label>
                <textarea
                  placeholder="Enter reason for this movement..."
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="w-full p-3 bg-white border border-zinc-200 rounded h-20 text-body-sm outline-none focus:border-[#ae001a] resize-none"
                  required
                />
              </div>

              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-body-xs rounded font-bold">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsRecordOpen(false)}
                  className="flex-1 py-2 border border-zinc-200 rounded text-zinc-700 text-body-sm font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 bg-[#ae001a] text-white rounded text-body-sm font-bold hover:bg-[#8e0015] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : 'Submit Movement'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Links Hub Persistente (Sprint 25 Story 4114) */}
      <StockQuickLinks current="movements" onNavigate={onNavigate} />
    </div>
  );
};
