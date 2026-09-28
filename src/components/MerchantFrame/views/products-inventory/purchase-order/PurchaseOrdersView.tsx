import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { StockQuickLinks } from '../stocks/StockQuickLinks';
import { EmergencySupportModal } from '../../../modals/QuickActionModals';
import { TableOptionsMenu, TablePaginationFooter, NoColumnsEmptyState, TableEmptyState, type TableDensity } from '../../../../shared/TableOptionsMenu';
import { getDensityPadding } from '../../../../shared/tableOptionsHelpers';

interface Supplier {
  id: number;
  name: string;
}

interface Supply {
  id: number;
  name: string;
  code: string;
  sku?: string | null;
  unit: string;
  consumption_unit?: string | null;
  cost_per_unit?: number | null;
  isActive: boolean;
}

interface PurchaseOrderItem {
  id?: number;
  productId?: number | null;
  variantId?: number | null;
  rawMaterialId?: number | null;
  purchaseUnit?: string | null;
  quantityOrdered?: number | null;
  unitCost?: number | null;
  taxAmount?: number | null;
  quantity: number;
  receivedQuantity?: number;
  unitPrice: number;
  totalPrice: number;
  product?: { name: string; sku?: string } | null;
  variant?: { name: string } | null;
  rawMaterial?: { id: number; name: string; sku?: string } | null;
  location?: { name: string };
}

interface PurchaseOrder {
  id: number;
  orderDate: string;
  status: string;
  totalAmount: number;
  supplier: { id: number; name: string } | null;
  purchaseOrderItems?: PurchaseOrderItem[];
}

interface PurchaseOrdersViewProps {
  onNavigate?: (view: string) => void;
}

// Raw materials grid row
interface OrderItemRow {
  localId: string;
  id?: number;
  rawMaterialId: number | '';
  purchaseUnit: string;
  quantityOrdered: number;
  unitCost: number;
  taxAmount: number;
  locationId: number | '';
  subtotal: number;
}


export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({ onNavigate }) => {
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [locations, setLocations] = useState<{ id: number; name: string; isActive?: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de listado
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [supplierFilter, setSupplierFilter] = useState<string>('All');

  // Table options state
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    orderCode: true,
    supplier: true,
    orderDate: true,
    totalAmount: true,
    progress: true,
    status: true,
    actions: true,
  });
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Master creation/editing fields
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  const [orderStatus, setOrderStatus] = useState<string>('DRAFT');


  // Detail raw materials items grid
  const [itemRows, setItemRows] = useState<OrderItemRow[]>([]);

  // Inspection details
  const [selectedOrderForInspect, setSelectedOrderForInspect] = useState<PurchaseOrder | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState<boolean>(false);
  const [inspectorStatus, setInspectorStatus] = useState<string>('');
  const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({});

  // Soporte
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  // Estados para modal de soft-delete
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [selectedOrderForDelete, setSelectedOrderForDelete] = useState<PurchaseOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const topRef = useRef<HTMLDivElement | null>(null);
  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  // Auto-scroll al inicio
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, [mode]);

  // Cargar datos
  const fetchPurchaseOrders = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`${API_BASE}/v1/purchase-orders?limit=100`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.assign('/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Error loading purchase orders');
      }

      const json = await res.json();
      const data = json.data || json || [];
      setPurchaseOrders(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error(err);
      if (!silent) setError('Failed to load purchase orders. Please verify your backend server connection.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [API_BASE]);

  const handleOpenDeleteConfirm = (po: PurchaseOrder) => {
    setSelectedOrderForDelete(po);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedOrderForDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      // Soft-delete: PATCH para marcar como inactiva
      const res = await fetch(`${API_BASE}/v1/purchase-orders/${selectedOrderForDelete.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive: false })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || 'Failed to delete purchase order.');
      }

      // Update DOM immediately by removing from list
      setPurchaseOrders(prev => prev.filter(p => p.id !== selectedOrderForDelete.id));
      setIsDeleteModalOpen(false);
      setSelectedOrderForDelete(null);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Error deleting purchase order.';
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchSuppliersAndSupplies = useCallback(async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      // Load active suppliers
      const suppliersRes = await fetch(`${API_BASE}/v1/inventory/suppliers?limit=100`, { headers });

      // Load active raw materials (supplies)
      let suppliesRes = await fetch(`${API_BASE}/v1/inventory/raw-materials?status=active&limit=500`, { headers });
      if (!suppliesRes.ok) {
        suppliesRes = await fetch(`${API_BASE}/supplies?status=active&limit=500`, { headers });
      }

      // Cargar ubicaciones
      let locationsRes = await fetch(`${API_BASE}/v1/inventory/locations`, { headers });
      if (!locationsRes.ok || locationsRes.status === 404 || locationsRes.status === 400) {
        const fallbackLocations = await fetch(`${API_BASE}/locations`, { headers });
        if (fallbackLocations.ok) locationsRes = fallbackLocations;
      }

      if (suppliersRes.ok) {
        const json = await suppliersRes.json();
        const data = json.items || json.data || json || [];
        const activeSuppliers = (Array.isArray(data) ? data : []).filter((s: { isActive?: boolean }) => s.isActive !== false);
        setSuppliers(activeSuppliers);
      }
      if (suppliesRes.ok) {
        const json = await suppliesRes.json();
        const data = json.items || json.data || json || [];
        const activeSupplies = (Array.isArray(data) ? data : []).filter((s: { isActive?: boolean }) => s.isActive !== false);
        setSupplies(activeSupplies);
      }

      if (locationsRes.ok) {
        const json = await locationsRes.json();
        const data = json.data || json || [];
        const activeLocations = (Array.isArray(data) ? data : []).filter((l: { isActive?: boolean }) => l.isActive !== false);
        setLocations(activeLocations);
      }
    } catch (err) {
      console.error('Error fetching catalog data', err);
    }
  }, [API_BASE]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchPurchaseOrders();
      fetchSuppliersAndSupplies();
    });
  }, [fetchPurchaseOrders, fetchSuppliersAndSupplies]);

  // ── Supplies grid handlers ──────────────────────────────────────────

  const handleAddRow = () => {
    const defaultLocationId = locations.length > 0 ? locations[0].id : '';
    const newRow: OrderItemRow = {
      localId: Math.random().toString(36).substring(2, 9),
      rawMaterialId: '',
      purchaseUnit: 'KG',
      quantityOrdered: 1,
      unitCost: 0,
      taxAmount: 0,
      locationId: defaultLocationId,
      subtotal: 0
    };
    setItemRows([...itemRows, newRow]);
  };

  const handleRemoveRow = (localId: string) => {
    setItemRows(itemRows.filter(row => row.localId !== localId));
  };

  const recalcSubtotal = (qty: number, cost: number, tax: number) =>
    Math.max(0, qty * cost + tax);

  const handleSupplyChange = (localId: string, supplyId: number) => {
    const supply = supplies.find(s => s.id === supplyId);
    const cost = supply ? Number(supply.cost_per_unit || 0) : 0;
    const unit = supply?.unit || 'KG';
    setItemRows(itemRows.map(row => {
      if (row.localId !== localId) return row;
      return {
        ...row,
        rawMaterialId: supplyId,
        purchaseUnit: unit,
        unitCost: cost,
        subtotal: recalcSubtotal(row.quantityOrdered, cost, row.taxAmount)
      };
    }));
  };

  const handlePurchaseUnitChange = (localId: string, unit: string) => {
    setItemRows(itemRows.map(row =>
      row.localId === localId ? { ...row, purchaseUnit: unit } : row
    ));
  };

  const handleQuantityOrderedChange = (localId: string, qty: number) => {
    setItemRows(itemRows.map(row => {
      if (row.localId !== localId) return row;
      const q = Math.max(0.0001, qty);
      return { ...row, quantityOrdered: q, subtotal: recalcSubtotal(q, row.unitCost, row.taxAmount) };
    }));
  };

  const handleUnitCostChange = (localId: string, cost: number) => {
    setItemRows(itemRows.map(row => {
      if (row.localId !== localId) return row;
      const c = Math.max(0, cost);
      return { ...row, unitCost: c, subtotal: recalcSubtotal(row.quantityOrdered, c, row.taxAmount) };
    }));
  };

  const handleTaxChange = (localId: string, tax: number) => {
    setItemRows(itemRows.map(row => {
      if (row.localId !== localId) return row;
      const t = Math.max(0, tax);
      return { ...row, taxAmount: t, subtotal: recalcSubtotal(row.quantityOrdered, row.unitCost, t) };
    }));
  };

  const handleLocationChange = (localId: string, locationId: number) => {
    setItemRows(itemRows.map(row =>
      row.localId === localId ? { ...row, locationId } : row
    ));
  };

  // Calcular Gran Total
  const grandTotal = itemRows.reduce((acc, row) => acc + row.subtotal, 0);

  // Initialize creation form
  const handleOpenCreateMode = () => {
    setEditingOrderId(null);
    setSelectedSupplierId('');
    setOrderStatus('DRAFT');
    setItemRows([]);
    setMode('create');
  };

  // Initialize edit form (PO in DRAFT or SENT state)
  const handleOpenEditMode = async (po: PurchaseOrder) => {
    let fullOrder = po;
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const detailRes = await fetch(`${API_BASE}/v1/purchase-orders/${po.id}`, { headers });
      if (detailRes.ok) {
        const body = await detailRes.json();
        fullOrder = body.data || body;
      }
    } catch (e) {
      console.error('Failed to load full PO details for edit', e);
    }

    setEditingOrderId(fullOrder.id);
    setSelectedSupplierId(fullOrder.supplier?.id || '');
    setOrderStatus(fullOrder.status || 'DRAFT');

    const defaultLocationId = locations.length > 0 ? locations[0].id : '';

    const mappedRows: OrderItemRow[] = (fullOrder.purchaseOrderItems || []).map((item, idx) => {
      const qty = Number(item.quantityOrdered ?? item.quantity) || 1;
      const cost = Number(item.unitCost ?? item.unitPrice) || 0;
      const tax = Number(item.taxAmount) || 0;
      return {
        localId: `edit-${item.id || idx}-${Math.random().toString(36).substring(2, 7)}`,
        id: item.id,
        rawMaterialId: item.rawMaterialId || (item.rawMaterial?.id ? Number(item.rawMaterial.id) : ''),
        purchaseUnit: item.purchaseUnit || 'KG',
        quantityOrdered: qty,
        unitCost: cost,
        taxAmount: tax,
        locationId: item.location?.name ? (locations.find(l => l.name === item.location?.name)?.id || defaultLocationId) : defaultLocationId,
        subtotal: recalcSubtotal(qty, cost, tax)
      };
    });

    setItemRows(mappedRows);
    setIsDetailDrawerOpen(false);
    setMode('create');
  };

  // Validations and Save (Creation or PUT edit)
  const handleSavePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSupplierId) {
      alert('A supplier must be selected.');
      return;
    }

    if (itemRows.length === 0) {
      alert('The purchase order must contain at least one line item.');
      return;
    }

    const hasInvalidRow = itemRows.some(row =>
      row.rawMaterialId === '' ||
      row.quantityOrdered < 0.0001 ||
      row.locationId === ''
    );

    if (hasInvalidRow) {
      alert('Please check all rows. Raw Material, Quantity Ordered, and Destination Location are mandatory fields.');
      return;
    }

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const isEdit = editingOrderId !== null;
      const url = isEdit
        ? `${API_BASE}/v1/purchase-orders/${editingOrderId}`
        : `${API_BASE}/v1/purchase-orders`;
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        supplierId: Number(selectedSupplierId),
        status: orderStatus,
        totalAmount: grandTotal,
        items: itemRows.map(row => ({
          ...(row.id ? { id: row.id } : {}),
          rawMaterialId: Number(row.rawMaterialId),
          purchaseUnit: row.purchaseUnit,
          quantityOrdered: Number(row.quantityOrdered),
          unitCost: Number(row.unitCost),
          taxAmount: Number(row.taxAmount),
          locationId: Number(row.locationId)
        }))
      };


      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error saving the purchase order');
      }

      setEditingOrderId(null);
      setMode('list');
      fetchPurchaseOrders(true);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Error saving the purchase order';
      alert(message);
    }
  };



  // Open Inspection Drawer
  const handleInspectOrder = async (po: PurchaseOrder) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const detailRes = await fetch(`${API_BASE}/v1/purchase-orders/${po.id}`, { headers });

      if (detailRes.ok) {
        const body = await detailRes.json();
        const orderData = body.data || body;
        setSelectedOrderForInspect(orderData);
        setInspectorStatus(orderData.status);

        // Inicializar cantidades recibidas de cada item
        const initialQtys: Record<number, number> = {};
        if (orderData.purchaseOrderItems) {
          orderData.purchaseOrderItems.forEach((item: { id: number; receivedQuantity?: number }) => {
            initialQtys[item.id] = item.receivedQuantity || 0;
          });
        }
        setReceivedQuantities(initialQtys);
      } else {
        setSelectedOrderForInspect(po);
        setInspectorStatus(po.status);
        setReceivedQuantities({});
      }
    } catch (e) {
      console.error('Failed to load purchase order details', e);
      setSelectedOrderForInspect(po);
      setInspectorStatus(po.status);
      setReceivedQuantities({});
    }
    setIsDetailDrawerOpen(true);
  };

  // Save inspector changes (Fulfillment State and Partial Receivals via POST /receive)
  const handleSaveInspectorChanges = async () => {
    if (!selectedOrderForInspect) return;
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      // 1. Check for additional received quantities to submit via /receive
      const receiveItemsPayload: { id: number; receivedQuantity: number }[] = [];
      if (selectedOrderForInspect.purchaseOrderItems) {
        selectedOrderForInspect.purchaseOrderItems.forEach(item => {
          if (item.id) {
            const oldRec = Number(item.receivedQuantity) || 0;
            const totalOrdered = Number(item.quantityOrdered ?? item.quantity) || 0;
            const newRec = (inspectorStatus === 'RECEIVED' || inspectorStatus === 'COMPLETED')
              ? totalOrdered
              : Number(receivedQuantities[item.id] ?? oldRec);
            const delta = newRec - oldRec;
            if (delta !== 0) {
              receiveItemsPayload.push({
                id: item.id,
                receivedQuantity: delta
              });
            }
          }
        });
      }

      // If items pending receipt, call specialized POST /v1/purchase-orders/:id/receive endpoint
      if (receiveItemsPayload.length > 0) {
        const receiveRes = await fetch(`${API_BASE}/v1/purchase-orders/${selectedOrderForInspect.id}/receive`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ items: receiveItemsPayload })
        });

        if (!receiveRes.ok) {
          const errorData = await receiveRes.json().catch(() => ({}));
          const errMsg = Array.isArray(errorData.message) ? errorData.message.join(', ') : (errorData.message || 'Error receiving items');
          throw new Error(errMsg);
        }
      }

      // 2. If status was explicitly changed in dropdown to another non-derived value, update via PATCH /status
      if (inspectorStatus !== selectedOrderForInspect.status && receiveItemsPayload.length === 0) {
        const statusRes = await fetch(`${API_BASE}/v1/purchase-orders/${selectedOrderForInspect.id}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: inspectorStatus })
        });

        if (!statusRes.ok) {
          const errorData = await statusRes.json().catch(() => ({}));
          const errMsg = Array.isArray(errorData.message) ? errorData.message.join(', ') : (errorData.message || 'Error updating status');
          throw new Error(errMsg);
        }
      }

      setIsDetailDrawerOpen(false);
      fetchPurchaseOrders(true);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Error updating order fulfillment';
      alert(message);
    }
  };


  // Helper to retrieve valid lifecycle transitions
  const getAllowedNextStatuses = (currentStatus: string) => {
    const norm = (currentStatus || 'DRAFT').toUpperCase();
    switch (norm) {
      case 'DRAFT':
        return [
          { value: 'DRAFT', label: 'DRAFT' },
          { value: 'SENT', label: 'SENT' },
          { value: 'CANCELLED', label: 'CANCELLED' }
        ];
      case 'SENT':
        return [
          { value: 'SENT', label: 'SENT' },
          { value: 'DRAFT', label: 'DRAFT' },
          { value: 'PARTIALLY_RECEIVED', label: 'PARTIALLY RECEIVED' },
          { value: 'RECEIVED', label: 'RECEIVED' },
          { value: 'CANCELLED', label: 'CANCELLED' }
        ];
      case 'PARTIALLY_RECEIVED':
        return [
          { value: 'PARTIALLY_RECEIVED', label: 'PARTIALLY RECEIVED' },
          { value: 'RECEIVED', label: 'RECEIVED' },
          { value: 'CANCELLED', label: 'CANCELLED' }
        ];
      case 'RECEIVED':
        return [
          { value: 'RECEIVED', label: 'RECEIVED (COMPLETED)' }
        ];
      case 'CANCELLED':
        return [
          { value: 'CANCELLED', label: 'CANCELLED' }
        ];
      default:
        return [
          { value: 'DRAFT', label: 'DRAFT' },
          { value: 'SENT', label: 'SENT' },
          { value: 'PARTIALLY_RECEIVED', label: 'PARTIALLY RECEIVED' },
          { value: 'RECEIVED', label: 'RECEIVED' },
          { value: 'CANCELLED', label: 'CANCELLED' }
        ];
    }
  };

  // Calculate total pending items for inspector and total received cost

  let totalPendingItemsCount = 0;
  let totalReceivedAmount = 0;
  if (selectedOrderForInspect?.purchaseOrderItems) {
    selectedOrderForInspect.purchaseOrderItems.forEach(item => {
      // For raw materials use quantityOrdered; fallback to quantity for compatibility
      const requested = Number(item.quantityOrdered ?? item.quantity) || 0;
      const price = Number(item.unitCost ?? item.unitPrice) || 0;
      let received: number;
      if (inspectorStatus === 'RECEIVED' || inspectorStatus === 'COMPLETED') {
        received = requested;
      } else if (inspectorStatus === 'PARTIALLY_RECEIVED') {
        received = item.id ? (receivedQuantities[item.id] ?? 0) : 0;
      } else if (inspectorStatus === 'DRAFT' || inspectorStatus === 'SENT' || inspectorStatus === 'PENDING' || inspectorStatus === 'CANCELLED') {
        received = 0;
      } else {
        received = Number(item.receivedQuantity) || 0;
      }
      const diff = requested - received;
      if (diff > 0) {
        totalPendingItemsCount += diff;
      }
      totalReceivedAmount += received * price;
    });
  }

  // Filtrado de listado
  const filteredOrders = purchaseOrders.filter(po => {
    const supplierName = po.supplier?.name || '';
    const formattedId = `PO-#${String(po.id).padStart(4, '0')}`;
    const matchesSearch =
      supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      formattedId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(po.id).includes(searchQuery);

    const matchesStatus =
      statusFilter === 'All' ||
      po.status.toUpperCase() === statusFilter.toUpperCase();

    const matchesSupplier =
      supplierFilter === 'All' ||
      (po.supplier && String(po.supplier.id) === supplierFilter);

    return matchesSearch && matchesStatus && matchesSupplier;
  });

  // Inspection drawer portal
  const drawerPortal = (isDetailDrawerOpen && selectedOrderForInspect)
    ? createPortal(
        <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 transition-opacity duration-300 animate-fade-in"
            onClick={() => setIsDetailDrawerOpen(false)}
          />

          {/* Drawer Body */}
          <div className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col justify-between border-l border-[#e8e2d8] animate-slide-in">
            {/* Header */}
            <div className="bg-[#222222] px-6 py-5 flex items-center justify-between border-b border-[#333333]">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-xl">receipt_long</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-white">
                  PURCHASE ORDER INSPECTOR
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailDrawerOpen(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Info Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Pending items banner */}
              {inspectorStatus === 'PARTIALLY_RECEIVED' && totalPendingItemsCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5 rounded">
                  <span className="material-symbols-outlined text-amber-600 text-lg">warning</span>
                  <div className="text-xs font-sans text-amber-800">
                    <p className="font-bold">Awaiting Items from Supplier</p>
                    <p className="mt-0.5">There are still <strong>{totalPendingItemsCount} items</strong> pending delivery from {selectedOrderForInspect.supplier?.name || 'this supplier'}.</p>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-black text-[#1c1b16] tracking-tight">
                    {selectedOrderForInspect.supplier?.name || 'Unknown Supplier'}
                  </h2>
                  <div className="flex gap-2 items-center mt-2">
                    <span className="text-[9px] px-2 py-0.5 bg-zinc-100 border border-zinc-200 font-bold rounded uppercase inline-block text-secondary">
                      Order ID: #{selectedOrderForInspect.id}
                    </span>
                    <span className="text-[9px] px-2 py-0.5 bg-amber-50 border border-amber-200 font-bold rounded uppercase inline-block text-amber-700">
                      Status: {selectedOrderForInspect.status}
                    </span>
                  </div>
                </div>

                {/* Quick status update selector */}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#5f5e5e]">Fulfillment State</span>
                  <select
                    value={inspectorStatus}
                    onChange={(e) => setInspectorStatus(e.target.value)}
                    disabled={selectedOrderForInspect.status === 'RECEIVED' || selectedOrderForInspect.status === 'CANCELLED'}
                    className="px-2 py-1 bg-[#fef9f1] border border-[#e8e2d8] rounded text-[11px] font-bold outline-none focus:border-[#ae001a] cursor-pointer text-[#1c1b16] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {getAllowedNextStatuses(selectedOrderForInspect.status).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                </div>
              </div>

              {/* Edit button if order is in DRAFT or SENT status */}
              {(selectedOrderForInspect.status === 'DRAFT' || selectedOrderForInspect.status === 'SENT') && (
                <button
                  type="button"
                  onClick={() => handleOpenEditMode(selectedOrderForInspect)}
                  className="w-full py-2 bg-[#ae001a] text-white font-bold text-xs uppercase tracking-wider rounded hover:bg-[#8e0015] transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  <span>Edit Order Items & Quantities</span>
                </button>
              )}


              <div className="border-t border-[#e8e2d8] pt-5 space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">Order Metadata</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#f5efe6] p-2.5 border border-[#e8e2d8]">
                    <span className="block text-[8px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1">Order Date</span>
                    <span className="text-[11px] font-semibold text-[#1c1b16] whitespace-nowrap">
                      {selectedOrderForInspect.orderDate ? new Date(selectedOrderForInspect.orderDate).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div className="bg-[#f5efe6] p-2.5 border border-[#e8e2d8]">
                    <span className="block text-[8px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1">Total (Req)</span>
                    <span className="text-[11px] font-bold text-[#ae001a] font-mono">
                      ${Number(selectedOrderForInspect.totalAmount).toFixed(2)}
                    </span>
                  </div>
                  <div className={`p-2.5 border ${
                    Math.abs(totalReceivedAmount - Number(selectedOrderForInspect.totalAmount)) < 0.01
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : totalReceivedAmount > 0
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-[#f5efe6] border-[#e8e2d8] text-secondary'
                  }`}>
                    <span className="block text-[8px] font-bold uppercase tracking-wider text-secondary mb-1">Total (Rec)</span>
                    <span className="text-[11px] font-bold font-mono">
                      ${totalReceivedAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items vinculados */}
              <div className="border-t border-[#e8e2d8] pt-5 space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
                  Purchase Order Line Items
                </h4>
                {selectedOrderForInspect.purchaseOrderItems && selectedOrderForInspect.purchaseOrderItems.length > 0 ? (
                  <div className="space-y-3">
                    {selectedOrderForInspect.purchaseOrderItems.map((item, idx) => (
                      <div key={item.id || idx} className="p-3 border border-[#e8e2d8] rounded bg-white flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-[#5f5e5e] text-lg">box</span>
                          <div>
                            {/* Name: prioritize rawMaterial, then product */}
                            <span className="block text-xs font-bold text-[#1c1b16]">
                              {item.rawMaterial?.name ||
                                item.product?.name ||
                                (item.rawMaterialId ? `Supply #${item.rawMaterialId}` : `Product #${item.productId}`)}
                            </span>
                            {item.rawMaterial && (
                              <span className="block text-[10px] text-emerald-700 font-bold uppercase">Raw Material</span>
                            )}
                            {item.variant && (
                              <span className="block text-[10px] text-secondary">Variant: {item.variant.name}</span>
                            )}
                            {item.location && (
                              <span className="block text-[10px] text-zinc-500 font-bold">Dest: {item.location.name}</span>
                            )}
                            {/* Display supply fields if applicable */}
                            {item.rawMaterialId ? (
                              <span className="block text-[10px] text-[#ae001a] font-mono">
                                Qty: {Number(item.quantityOrdered ?? item.quantity).toFixed(2)} {item.purchaseUnit || ''} × ${Number(item.unitCost ?? item.unitPrice).toFixed(2)}
                                {item.taxAmount && Number(item.taxAmount) > 0 ? ` + $${Number(item.taxAmount).toFixed(2)} tax` : ''}
                              </span>
                            ) : (
                              <span className="block text-[10px] text-[#ae001a] font-mono">Qty: {item.quantity} × ${Number(item.unitPrice).toFixed(2)}</span>
                            )}

                            {/* Control editable si es PARTIALLY_RECEIVED */}
                            {inspectorStatus === 'PARTIALLY_RECEIVED' ? (
                              <div className="flex items-center gap-1.5 mt-2 bg-[#fdfaf5] p-1 border border-[#e8e2d8] rounded w-fit">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-secondary">Received:</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  max={Number(item.quantityOrdered ?? item.quantity)}
                                  value={item.id ? (receivedQuantities[item.id] ?? 0) : 0}
                                  onChange={(e) => {
                                    if (item.id) {
                                      const maxVal = Number(item.quantityOrdered ?? item.quantity);
                                      const val = Math.max(0, Math.min(maxVal, Number(e.target.value) || 0));
                                      setReceivedQuantities(prev => ({
                                        ...prev,
                                        [item.id!]: val
                                      }));
                                    }
                                  }}
                                  className="w-16 px-1 py-0.5 text-xs font-bold text-center border border-[#e8e2d8] rounded outline-none focus:border-[#ae001a] text-[#1c1b16]"
                                />
                                <span className="text-[10px] text-secondary font-mono">/ {Number(item.quantityOrdered ?? item.quantity).toFixed(2)}</span>
                                {Number(item.quantityOrdered ?? item.quantity) - (receivedQuantities[item.id!] ?? 0) > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 font-bold rounded">
                                    {(Number(item.quantityOrdered ?? item.quantity) - (receivedQuantities[item.id!] ?? 0)).toFixed(2)} pending
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="block text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-1.5">
                                <span>Received: {(inspectorStatus === 'RECEIVED' || inspectorStatus === 'COMPLETED') ? Number(item.quantityOrdered ?? item.quantity).toFixed(2) : Number(item.receivedQuantity || 0).toFixed(2)} / {Number(item.quantityOrdered ?? item.quantity).toFixed(2)}</span>
                                {inspectorStatus !== 'COMPLETED' && inspectorStatus !== 'RECEIVED' && Number(item.quantityOrdered ?? item.quantity) - (item.receivedQuantity || 0) > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 font-bold rounded">
                                    {(Number(item.quantityOrdered ?? item.quantity) - (item.receivedQuantity || 0)).toFixed(2)} pending
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex flex-col justify-center items-end">
                          <span className="text-xs font-bold font-mono text-[#1c1b16]">
                            ${Number(item.totalPrice).toFixed(2)}
                          </span>
                          {(() => {
                            const req = Number(item.quantity) || 0;
                            const rec = inspectorStatus === 'COMPLETED'
                              ? req
                              : (inspectorStatus === 'PARTIALLY_RECEIVED'
                                  ? (item.id ? (receivedQuantities[item.id] ?? 0) : 0)
                                  : (item.receivedQuantity || 0));
                            const itemPrice = Number(item.unitPrice) || 0;
                            if (rec > 0 && rec < req) {
                              return (
                                <span className="text-[9px] text-amber-600 font-bold font-mono mt-0.5 whitespace-nowrap">
                                  Rec: ${(rec * itemPrice).toFixed(2)}
                                </span>
                              );
                            }
                            if (rec === req) {
                              return (
                                <span className="text-[9px] text-emerald-600 font-bold font-mono mt-0.5 whitespace-nowrap">
                                  Rec: ${(req * itemPrice).toFixed(2)}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-secondary italic">No line items linked to this order.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-[#f5efe6] border-t border-[#e8e2d8] px-6 py-4 flex justify-between gap-4">
              <button
                type="button"
                onClick={() => setIsDetailDrawerOpen(false)}
                className="px-5 py-2.5 bg-[#ece8e0] text-[#1c1b16] font-bold text-label-caps hover:bg-[#dcd7cd] transition-colors font-sans cursor-pointer"
              >
                CLOSE INSPECTOR
              </button>
              {(inspectorStatus !== selectedOrderForInspect.status || inspectorStatus === 'PARTIALLY_RECEIVED') && (
                <button
                  type="button"
                  onClick={handleSaveInspectorChanges}
                  className="px-5 py-2.5 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-colors font-sans cursor-pointer flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  {inspectorStatus === 'PARTIALLY_RECEIVED' && totalPendingItemsCount > 0
                    ? `SAVE (${totalPendingItemsCount} PENDING)`
                    : 'SAVE FULFILLMENT'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans relative">
      <div ref={topRef} />

      {/* Section Title */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#ae001a] text-2xl">
            receipt_long
          </span>
          <div>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
              Procurement & Purchase Orders
            </h2>
            <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
              Create, track, and fulfill replenishment purchase orders, distribute stock to multiple warehouses, and verify supplier invoices.
            </p>
          </div>
        </div>
      </div>

      {mode === 'list' ? (
        <>
          {/* Search Bar and Filters */}
          <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
            {/* Row 1: Full-width search */}
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
                search
              </span>
              <input
                type="text"
                placeholder="Search by PO code or supplier name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
              />
            </div>

            {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Filter by Supplier */}
                <select
                  value={supplierFilter}
                  onChange={(e) => {
                    setSupplierFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[150px] font-sans text-secondary cursor-pointer"
                >
                  <option value="All">All Suppliers</option>
                  {suppliers.map(sup => (
                    <option key={sup.id} value={String(sup.id)}>{sup.name}</option>
                  ))}
                </select>

                {/* Filtro por Estado */}
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[130px] font-sans text-secondary cursor-pointer"
                >
                  <option value="All">All Status</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SENT">Sent</option>
                  <option value="PARTIALLY_RECEIVED">Partially Received</option>
                  <option value="RECEIVED">Received</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleOpenCreateMode}
                  className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  ADD PURCHASE ORDER
                </button>

              </div>
            </div>
          </div>

          {/* Purchase Orders Directory */}
          {(() => {
            const activeColSpan =
              (visibleColumns.orderCode ? 1 : 0) +
              (visibleColumns.supplier ? 1 : 0) +
              (visibleColumns.orderDate ? 1 : 0) +
              (visibleColumns.totalAmount ? 1 : 0) +
              (visibleColumns.progress ? 1 : 0) +
              (visibleColumns.status ? 1 : 0) +
              (visibleColumns.actions ? 1 : 0);

            const densityPadding = getDensityPadding(rowDensity);
            const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
            const paginatedOrders =
              pageSize === 9999
                ? filteredOrders
                : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

            return (
              <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
                <div className="p-4 bg-[#222222] flex justify-between items-center relative">
                  <div className="flex items-center gap-3">
                    <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
                      PURCHASE ORDERS DIRECTORY
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
                      {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
                    </span>
                  </div>

                  <TableOptionsMenu
                    columns={[
                      { key: 'orderCode', label: 'Order Reference Code' },
                      { key: 'supplier', label: 'Supplier Entity' },
                      { key: 'orderDate', label: 'Order Date' },
                      { key: 'totalAmount', label: 'Total Gross Amount' },
                      { key: 'progress', label: 'Fulfillment Progress' },
                      { key: 'status', label: 'Fulfillment Status' },
                      { key: 'actions', label: 'Actions' },
                    ]}
                    visibleColumns={visibleColumns}
                    onToggleColumn={(key) =>
                      setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    rowDensity={rowDensity}
                    onChangeDensity={setRowDensity}
                    totalItems={filteredOrders.length}
                    pageSize={pageSize}
                    onChangePageSize={(s) => {
                      setPageSize(s);
                      setCurrentPage(1);
                    }}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    onReload={fetchPurchaseOrders}
                    onExportCSV={() => {
                      if (filteredOrders.length === 0) return;
                      const headers = ['Order Code', 'Supplier', 'Order Date', 'Total Amount', 'Status'];
                      const rows = filteredOrders.map((po) => [
                        `PO-#${String(po.id).padStart(4, '0')}`,
                        `"${(po.supplier?.name || '').replace(/"/g, '""')}"`,
                        po.orderDate || '',
                        po.totalAmount,
                        po.status
                      ]);
                      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement('a');
                      link.setAttribute('href', encodedUri);
                      link.setAttribute('download', `purchase_orders_${new Date().toISOString().slice(0, 10)}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    onPrint={() => window.print()}
                    onCopySummary={() => {
                      const text = `Total Purchase Orders: ${filteredOrders.length}`;
                      navigator.clipboard.writeText(text);
                    }}
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                      <tr>
                        {visibleColumns.orderCode && (
                          <th className={`${densityPadding} text-label-caps font-bold text-[#5f5e5e]`}>
                            Order Reference Code
                          </th>
                        )}
                        {visibleColumns.supplier && (
                          <th className={`${densityPadding} text-label-caps font-bold text-[#5f5e5e]`}>
                            Supplier Entity
                          </th>
                        )}
                        {visibleColumns.orderDate && (
                          <th className={`${densityPadding} text-label-caps font-bold text-[#5f5e5e]`}>
                            Creation Date
                          </th>
                        )}
                        {visibleColumns.totalAmount && (
                          <th className={`${densityPadding} text-right text-label-caps font-bold text-[#5f5e5e] w-32`}>
                            Total Gross Amount
                          </th>
                        )}
                        {visibleColumns.progress && (
                          <th className={`${densityPadding} text-center text-label-caps font-bold text-[#5f5e5e] w-40`}>
                            Fulfillment Progress
                          </th>
                        )}
                        {visibleColumns.status && (
                          <th className={`${densityPadding} text-center text-label-caps font-bold text-[#5f5e5e] w-36`}>
                            Fulfillment Status
                          </th>
                        )}
                        {visibleColumns.actions && (
                          <th className={`${densityPadding} text-center text-label-caps font-bold text-[#5f5e5e] w-24`}>
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#e8e2d8]">
                      {activeColSpan === 0 ? (
                        <NoColumnsEmptyState colSpan={7} />
                      ) : isLoading ? (
                        <tr>
                          <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                            <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                              sync
                            </span>
                            <p className="text-secondary text-body-md mt-2 font-sans">Loading purchase orders...</p>
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
                              onClick={() => fetchPurchaseOrders()}
                              className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                            >
                              Retry Connection
                            </button>
                          </td>
                        </tr>
                      ) : filteredOrders.length === 0 ? (
                        <TableEmptyState
                          colSpan={activeColSpan}
                          icon="receipt_long"
                          title="No purchase orders found"
                          description={
                            searchQuery || statusFilter !== 'All' || supplierFilter !== 'All'
                              ? 'No purchase orders match your current filter criteria.'
                              : 'No purchase orders recorded yet for this merchant context.'
                          }
                        />
                      ) : (
                        paginatedOrders.map((po) => {
                          const formattedId = `PO-#${String(po.id).padStart(4, '0')}`;
                          const dateObj = po.orderDate ? new Date(po.orderDate) : null;
                          const formattedDate = (dateObj && !isNaN(dateObj.getTime()))
                            ? dateObj.toISOString().split('T')[0]
                            : 'N/A';
                          const formattedAmount = new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD'
                          }).format(po.totalAmount);

                          // Map styles per specification
                          const uStatus = po.status.toUpperCase();
                          let badgeStyle = 'bg-blue-100 text-blue-800 border border-blue-200';
                          if (uStatus === 'DRAFT') {
                            badgeStyle = 'bg-zinc-100 text-zinc-700 border border-zinc-300';
                          } else if (uStatus === 'SENT') {
                            badgeStyle = 'bg-blue-100 text-blue-800 border border-blue-200';
                          } else if (uStatus === 'PENDING') {
                            badgeStyle = 'bg-amber-100 text-amber-800 border border-amber-200';
                          } else if (uStatus === 'APPROVED' || uStatus === 'COMPLETED' || uStatus === 'RECEIVED') {
                            badgeStyle = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                          } else if (uStatus === 'CANCELLED') {
                            badgeStyle = 'bg-red-100 text-red-800 border border-red-200';
                          } else if (uStatus === 'PARTIALLY_RECEIVED') {
                            badgeStyle = 'bg-indigo-100 text-indigo-800 border border-indigo-200';
                          }

                          // Calculate receiving progress
                          let fulfillmentText = '0%';
                          let totalQtyRequested = 0;
                          let totalQtyReceived = 0;
                          if (po.purchaseOrderItems && po.purchaseOrderItems.length > 0) {
                            po.purchaseOrderItems.forEach(item => {
                              totalQtyRequested += Number(item.quantityOrdered ?? item.quantity) || 0;
                              totalQtyReceived += Number(item.receivedQuantity) || 0;
                            });
                          }

                          if (po.status === 'RECEIVED' || po.status === 'COMPLETED') {
                            fulfillmentText = '100% (Completed)';
                          } else if (po.status === 'DRAFT') {
                            fulfillmentText = 'Draft';
                          } else if (po.status === 'SENT') {
                            fulfillmentText = '0% (Sent)';
                          } else if (po.status === 'PENDING') {
                            fulfillmentText = '0% (Awaiting)';
                          } else if (po.status === 'CANCELLED') {
                            fulfillmentText = 'Cancelled';
                          } else if (totalQtyRequested > 0) {
                            const pct = Math.round((totalQtyReceived / totalQtyRequested) * 100);
                            const pending = (totalQtyRequested - totalQtyReceived).toFixed(2);
                            fulfillmentText = `${pct}% (${pending} pending)`;
                          }

                          return (
                            <tr
                              key={po.id}
                              onClick={() => handleInspectOrder(po)}
                              className="category-row group transition-colors hover:bg-[#f8f3eb] cursor-pointer"
                            >
                              {visibleColumns.orderCode && (
                                <td className={densityPadding}>
                                  <div className="flex items-center gap-3">
                                    <div className="w-1 h-8 bg-[#ae001a] rounded-full"></div>
                                    <div>
                                      <p className="font-bold text-[#1d1c17] font-mono">
                                        {formattedId}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                              )}
                              {visibleColumns.supplier && (
                                <td className={`${densityPadding} text-[#1d1c17] font-semibold`}>
                                  {po.supplier?.name || 'Unassigned Supplier'}
                                </td>
                              )}
                              {visibleColumns.orderDate && (
                                <td className={`${densityPadding} font-sans text-secondary text-sm`}>
                                  {formattedDate}
                                </td>
                              )}
                              {visibleColumns.totalAmount && (
                                <td className={`${densityPadding} text-right font-mono font-bold text-[#ae001a]`}>
                                  {formattedAmount}
                                </td>
                              )}
                              {visibleColumns.progress && (
                                <td className={`${densityPadding} text-center font-sans text-xs font-bold text-secondary`}>
                                  {fulfillmentText}
                                </td>
                              )}
                              {visibleColumns.status && (
                                <td className={`${densityPadding} text-center`}>
                                  <span
                                    className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase tracking-wider ${badgeStyle}`}
                                  >
                                    {po.status}
                                  </span>
                                </td>
                              )}
                              {visibleColumns.actions && (
                                <td className={`${densityPadding} text-center`} onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => handleInspectOrder(po)}
                                      className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                                      title="Inspect order details"
                                    >
                                      <span className="material-symbols-outlined text-[20px]">visibility</span>
                                    </button>

                                    <button
                                      onClick={() => handleOpenDeleteConfirm(po)}
                                      className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-all duration-200 cursor-pointer"
                                      title="Delete purchase order"
                                    >
                                      <span className="material-symbols-outlined text-[20px]">delete</span>
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <TablePaginationFooter
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredOrders.length}
                  onPageChange={setCurrentPage}
                  onChangePageSize={(s) => {
                    setPageSize(s);
                    setCurrentPage(1);
                  }}
                />
              </div>
            );
          })()}

          {/* Floating Action Button (FAB) */}
          <button
            onClick={handleOpenCreateMode}
            className="fixed bottom-6 right-6 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#d2272f] transition-all transform hover:scale-110 z-50 cursor-pointer"
            title="Add Purchase Order"
          >
            <span className="material-symbols-outlined text-[28px]">add</span>
          </button>
        </>
      ) : (
        /* Master-Detail Creation Form */
        <form onSubmit={handleSavePurchaseOrder} className="space-y-6">
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="text-secondary hover:text-[#ae001a] flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to Directory
            </button>
            <span className="text-[10px] bg-zinc-100 border border-zinc-200 px-3 py-1 font-bold text-[#5f5e5e] uppercase tracking-wider rounded">
              Purchase Order / Master-Detail Form
            </span>
          </div>

          <div className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 space-y-6">
            <h2 className="text-lg font-black text-[#1c1b16] tracking-tight uppercase border-b border-[#e8e2d8] pb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ae001a]">receipt_long</span>
              {editingOrderId ? `Edit Purchase Order #${editingOrderId}` : 'Create Purchase Order'}
            </h2>


            {/* Cabecera (Master Form) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Active Vendor / Supplier *
                </label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-2.5 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md font-sans text-[#1c1b16] cursor-pointer"
                >
                  <option value="">Select a vendor...</option>
                  {suppliers.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Initial Order Status
                </label>
                <select
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md font-sans text-[#1c1b16] cursor-pointer"
                >
                  <option value="DRAFT">Draft (in preparation)</option>
                  <option value="SENT">Sent to Supplier</option>
                  <option value="PARTIALLY_RECEIVED">Partially Received</option>
                  <option value="RECEIVED">Received</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Detail Grid Items */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-t border-[#e8e2d8] pt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#ae001a]">
                  Line Items Grid
                </h3>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-4 py-2 bg-[#222222] text-white hover:bg-[#ae001a] text-xs font-bold text-label-caps transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Add Row
                </button>
              </div>

              {itemRows.length === 0 ? (
                <div className="border border-dashed border-[#e8e2d8] p-8 text-center bg-zinc-50/50">
                  <span className="material-symbols-outlined text-[#5f5e5e]/40 text-4xl">
                    playlist_add
                  </span>
                  <p className="text-xs text-[#5f5e5e] mt-2">
                    Click 'Add Row' to append items to this procurement document.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#e8e2d8] rounded">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                      <tr>
                        <th className="px-3 py-3 text-label-caps font-bold text-[#5f5e5e] w-[22%]">Raw Material / Supply</th>
                        <th className="px-3 py-3 text-label-caps font-bold text-[#5f5e5e] w-[10%]">Purchase Unit</th>
                        <th className="px-3 py-3 text-label-caps font-bold text-[#5f5e5e] text-center w-[10%]">Qty Ordered</th>
                        <th className="px-3 py-3 text-label-caps font-bold text-[#5f5e5e] text-right w-[12%]">Unit Cost $</th>
                        <th className="px-3 py-3 text-label-caps font-bold text-[#5f5e5e] text-right w-[10%]">Tax $</th>
                        <th className="px-3 py-3 text-label-caps font-bold text-[#5f5e5e] text-right w-[12%]">Subtotal</th>
                        <th className="px-3 py-3 text-label-caps font-bold text-[#5f5e5e] w-[16%]">Dest. Location</th>
                        <th className="px-3 py-3 text-label-caps font-bold text-[#5f5e5e] text-center w-[8%]">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e2d8] bg-white">
                      {itemRows.map((row) => (
                        <tr key={row.localId} className="hover:bg-zinc-50/50">
                          {/* Supply Selector */}
                          <td className="px-3 py-2">
                            <select
                              required
                              value={row.rawMaterialId}
                              onChange={(e) => handleSupplyChange(row.localId, Number(e.target.value))}
                              className="w-full px-2 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-sans outline-none focus:border-[#ae001a] cursor-pointer"
                            >
                              <option value="">Select supply...</option>
                              {supplies.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code || s.sku || ''})</option>
                              ))}
                            </select>
                          </td>
                          {/* Purchase Unit */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.purchaseUnit}
                              onChange={(e) => handlePurchaseUnitChange(row.localId, e.target.value.toUpperCase())}
                              placeholder="KG"
                              className="w-full px-2 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-bold font-sans outline-none focus:border-[#ae001a] uppercase"
                            />
                          </td>
                          {/* Qty Ordered */}
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              required
                              min="0.0001"
                              step="any"
                              value={row.quantityOrdered}
                              onChange={(e) => handleQuantityOrderedChange(row.localId, parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-center text-xs font-sans outline-none focus:border-[#ae001a]"
                            />
                          </td>
                          {/* Unit Cost */}
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              required
                              min="0"
                              step="0.0001"
                              value={row.unitCost}
                              onChange={(e) => handleUnitCostChange(row.localId, parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-right text-xs font-sans outline-none focus:border-[#ae001a]"
                            />
                          </td>
                          {/* Tax Amount */}
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.taxAmount}
                              onChange={(e) => handleTaxChange(row.localId, parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-right text-xs font-sans outline-none focus:border-[#ae001a]"
                            />
                          </td>
                          {/* Subtotal */}
                          <td className="px-3 py-2 text-right font-mono text-xs font-bold text-[#ae001a]">
                            ${row.subtotal.toFixed(2)}
                          </td>
                          {/* Destination Location */}
                          <td className="px-3 py-2">
                            <select
                              required
                              value={row.locationId}
                              onChange={(e) => handleLocationChange(row.localId, Number(e.target.value))}
                              className="w-full px-2 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-sans outline-none focus:border-[#ae001a] cursor-pointer"
                            >
                              <option value="">Location...</option>
                              {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                              ))}
                            </select>
                          </td>
                          {/* Delete Row */}
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.localId)}
                              className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                              title="Delete row"
                            >
                              <span className="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Macroscopic Master Order Total */}
            <div className="border-t border-[#e8e2d8] pt-6 flex justify-between items-center bg-[#f8f3eb]/40 p-4 border rounded">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#5f5e5e]">
                Estimated Order Grand Total
              </span>
              <span className="text-2xl font-black text-[#ae001a] font-mono">
                ${grandTotal.toFixed(2)}
              </span>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 border-t border-[#e8e2d8] pt-6">
              <button
                type="button"
                onClick={() => setMode('list')}
                className="px-6 py-2.5 bg-[#ece8e0] text-[#1c1b16] font-bold text-label-caps hover:bg-[#dcd7cd] transition-colors font-sans cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={selectedSupplierId === '' || itemRows.length === 0}
                className="px-6 py-2.5 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors font-sans cursor-pointer"
              >
                SAVE PURCHASE ORDER
              </button>
            </div>
          </div>
        </form>
      )}



      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {/* Deletion confirmation modal (Soft-Delete) */}
      {isDeleteModalOpen && selectedOrderForDelete && (
        <div className="fixed inset-0 z-[10000] overflow-y-auto flex items-center justify-center p-4 font-sans">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsDeleteModalOpen(false)}
          />

          {/* Caja del Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 animate-scale-in">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-[#ae001a] shrink-0">
                <span className="material-symbols-outlined text-2xl block">delete</span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  Confirm Deletion
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to delete this purchase order? This action will set the order status to inactive.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-body-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm block">error</span>
                <span>{deleteError}</span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-body-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all duration-200 cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-[#ae001a] text-white text-body-xs font-bold rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-sans"
              >
                {isDeleting ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin block">sync</span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Order</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Quick Links Hub */}
      <StockQuickLinks current="purchase-orders" onNavigate={onNavigate} />

      {/* Portal: Detail Drawer (Order inspection) */}
      {drawerPortal}
    </div>
  );
};

export default PurchaseOrdersView;

