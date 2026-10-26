import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type {
  CreateQROrderItemDto,
  POSOrderItemRef,
  QRMenuItemRef,
  QROrderItem,
  QROrderItemStatus,
  QROrderRef,
  UpdateQROrderItemDto,
} from '../../../../types/qr-order-item';
import {
  QR_ORDER_ITEM_STATUS_CONFIG,
  QR_ORDER_ITEM_STATUSES,
} from '../../../../types/qr-order-item';
import {
  calculateParentOrderTotal,
  calculateSubtotalPrice,
  formatCurrency,
  formatPOSOrderItemBadge,
  formatQROrderBadge,
  formatQROrderItemBadge,
  validateQROrderItemPayload,
} from '../../../../lib/qr-order-item';
import {
  createQROrderItem,
  getQROrderItems,
  updateQROrderItem,
} from '../../../../api/qr-order-items';

export type QROrderItemDrawerMode = 'create' | 'edit';

export interface QROrderItemDrawerProps {
  isOpen: boolean;
  mode: QROrderItemDrawerMode;
  item: QROrderItem | null;
  orders: QROrderRef[];
  menuItems: QRMenuItemRef[];
  posItems: POSOrderItemRef[];
  initialOrderId?: number;
  onClose: () => void;
  onSuccess: (saved: QROrderItem, newParentTotal?: number) => void;
}

export const QROrderItemDrawer: React.FC<QROrderItemDrawerProps> = ({
  isOpen,
  mode,
  item,
  orders,
  menuItems,
  posItems,
  initialOrderId,
  onClose,
  onSuccess,
}) => {
  // Form State
  const [qrOrderId, setQrOrderId] = useState<number>(orders[0]?.id || 0);
  const [qrMenuItemId, setQrMenuItemId] = useState<number>(menuItems[0]?.id || 0);
  const [orderItemId, setOrderItemId] = useState<number>(posItems[0]?.id || 0);
  const [quantity, setQuantity] = useState<string>('1');
  const [unitPrice, setUnitPrice] = useState<string>('0.00');
  const [notes, setNotes] = useState<string>('');
  const [status, setStatus] = useState<QROrderItemStatus>('active');

  // Search filter for Menu Item Picker
  const [menuSearchQuery, setMenuSearchQuery] = useState<string>('');

  // Form submission and validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Live brother line items for cascade recalculation projection
  const [orderBrotherItems, setOrderBrotherItems] = useState<QROrderItem[]>([]);

  const drawerRef = useRef<HTMLDivElement>(null);

  // Load existing brother line items for the selected order to calculate live projection
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    getQROrderItems(undefined, qrOrderId)
      .then((items) => {
        if (isMounted) setOrderBrotherItems(items);
      })
      .catch(() => {
        if (isMounted) setOrderBrotherItems([]);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, qrOrderId]);

  // Synchronize initial form data when drawer opens or mode/item changes
  useEffect(() => {
    if (!isOpen) return;

    setFieldErrors({});
    setGeneralError(null);
    setMenuSearchQuery('');

    if (mode === 'edit' && item) {
      setQrOrderId(item.qr_order_id);
      setQrMenuItemId(item.qr_menu_item_id);
      setOrderItemId(item.order_item_id || (posItems.length > 0 ? posItems[0].id : 101));
      setQuantity(String(item.quantity));
      setUnitPrice(Number(item.unit_price).toFixed(2));
      setNotes(item.notes || '');
      setStatus((item.status as QROrderItemStatus) || 'active');
    } else {
      const defaultOrder = initialOrderId
        ? orders.find((o) => o.id === initialOrderId) || orders[0]
        : orders[0];
      const defaultOrderId = defaultOrder ? defaultOrder.id : (orders.length > 0 ? orders[0].id : 0);
      const defaultMenu = menuItems.length > 0 ? menuItems[0] : null;
      const defaultPos = posItems.length > 0 ? posItems[0] : null;

      setQrOrderId(defaultOrderId);
      setQrMenuItemId(defaultMenu ? defaultMenu.id : 0);
      setOrderItemId(defaultPos ? defaultPos.id : 0);
      setQuantity('1');
      setUnitPrice(defaultMenu && defaultMenu.price !== undefined ? defaultMenu.price.toFixed(2) : '0.00');
      setNotes('');
      setStatus('active');
    }
  }, [isOpen, mode, item, orders, menuItems, posItems, initialOrderId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto Subtotal Calculation: Dynamically strictly updates as quantity or unit_price changes
  const autoCalculatedSubtotal = useMemo(() => {
    const qty = parseInt(quantity, 10);
    const price = parseFloat(unitPrice);
    if (isNaN(qty) || isNaN(price) || qty < 1 || price < 0) return 0;
    return calculateSubtotalPrice(qty, price);
  }, [quantity, unitPrice]);

  // Currently selected Menu Item catalog reference
  const selectedMenuItem = useMemo(() => {
    return menuItems.find((m) => m.id === qrMenuItemId);
  }, [menuItems, qrMenuItemId]);

  // Currently selected Parent QR Order
  const selectedParentOrder = useMemo(() => {
    return orders.find((o) => o.id === qrOrderId);
  }, [orders, qrOrderId]);

  // Filtered menu items for the searchable dropdown
  const filteredMenuItems = useMemo(() => {
    if (!menuSearchQuery.trim()) return menuItems;
    const q = menuSearchQuery.toLowerCase();
    return menuItems.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        String(m.id).includes(q)
    );
  }, [menuItems, menuSearchQuery]);

  // Cascade Recalculation Engine: Live Parent Order Total Projection
  const cascadeProjection = useMemo(() => {
    const currentParentTotal = selectedParentOrder?.total_amount || 0;

    // Simulate brothers with this updated line item
    const simulatedLine: QROrderItem = {
      id: item ? item.id : 999999,
      qr_order_id: qrOrderId,
      qr_menu_item_id: qrMenuItemId,
      order_item_id: orderItemId,
      quantity: parseInt(quantity, 10) || 1,
      unit_price: parseFloat(unitPrice) || 0,
      subtotal_price: autoCalculatedSubtotal,
      notes,
      status,
    };

    const simulatedList = mode === 'edit' && item
      ? orderBrotherItems.map((b) => (b.id === item.id ? simulatedLine : b))
      : [simulatedLine, ...orderBrotherItems];

    const projectedTotal = calculateParentOrderTotal(qrOrderId, simulatedList);
    const delta = Number((projectedTotal - currentParentTotal).toFixed(2));

    return {
      currentParentTotal,
      projectedTotal,
      delta,
      isVoided: status === 'inactive',
    };
  }, [
    selectedParentOrder,
    item,
    qrOrderId,
    qrMenuItemId,
    orderItemId,
    quantity,
    unitPrice,
    autoCalculatedSubtotal,
    notes,
    status,
    mode,
    orderBrotherItems,
  ]);

  // Handle Menu Item Selection (Auto-populates catalog unit price)
  const handleSelectMenuItem = (id: number) => {
    setQrMenuItemId(id);
    const dish = menuItems.find((m) => m.id === id);
    if (dish && dish.price !== undefined) {
      setUnitPrice(dish.price.toFixed(2));
    }
  };

  // Quick Action: Void individual order line
  const handleQuickVoid = () => {
    setStatus('inactive');
  };

  // Quick Action: Restore line item
  const handleQuickRestore = () => {
    setStatus('active');
  };

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    const trimmedQty = quantity.trim();
    const qty = trimmedQty === '' ? undefined : parseInt(trimmedQty, 10);

    const trimmedPrice = unitPrice.trim();
    const price = trimmedPrice === '' ? undefined : parseFloat(trimmedPrice);
    const subtotal = autoCalculatedSubtotal;

    const dtoPayload: Partial<CreateQROrderItemDto> = {
      qr_order_id: Number(qrOrderId),
      qr_menu_item_id: Number(qrMenuItemId),
      order_item_id: Number(orderItemId),
      quantity: isNaN(qty as number) && trimmedQty !== '' ? (trimmedQty as unknown as number) : qty,
      unit_price: isNaN(price as number) && trimmedPrice !== '' ? (trimmedPrice as unknown as number) : price,
      subtotal_price: subtotal,
      notes: notes.trim() || null,
      status,
    };

    // Validates required fields: qr_order_id, qr_menu_item_id, order_item_id, quantity, unit_price, subtotal_price, status
    const validation = validateQROrderItemPayload(dtoPayload);
    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setGeneralError(validation.error || 'Please fill in all required fields accurately.');
      return;
    }

    try {
      setIsSubmitting(true);
      let savedItem: QROrderItem;

      if (mode === 'edit' && item) {
        savedItem = await updateQROrderItem(item.id, dtoPayload as UpdateQROrderItemDto);
      } else {
        savedItem = await createQROrderItem(dtoPayload as CreateQROrderItemDto);
      }

      onSuccess(savedItem, cascadeProjection.projectedTotal);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save line item.';
      setGeneralError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="qr-order-item-drawer-overlay"
      className="fixed inset-0 z-[9999] font-poppins"
    >
      {/* Clickable Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Slide-out Drawer Panel Pinned to the Right */}
      <div
        ref={drawerRef}
        data-testid="qr-order-item-drawer"
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[560px] max-w-full bg-white shadow-2xl z-10 flex flex-col justify-between overflow-y-auto border-l border-[#e8e2d8] font-poppins"
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-[#1d1c17] text-white px-6 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ae001a] text-white flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-xl">
                {mode === 'edit' ? 'edit_note' : 'add_circle'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  data-testid="drawer-title"
                  className="font-black text-sm uppercase tracking-wider text-white"
                >
                  {mode === 'edit' && item
                    ? `Edit Line Item ${formatQROrderItemBadge(item.id)}`
                    : 'Create QR Order Line Item'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-amber-300 border border-white/20 font-mono">
                  {mode === 'edit' ? 'PATCH' : 'POST'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Floor Expeditor & POS Cashier Workspace • Detail Drawer Modal
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="drawer-close-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          id="qr-order-item-form"
          noValidate
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col justify-between overflow-y-auto"
        >
          <div className="p-6 space-y-6 text-xs text-[#1d1c17] flex-1">
          {/* General Error Banner */}
          {generalError && (
            <div
              data-testid="drawer-general-error"
              className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-rose-800 text-xs font-semibold flex items-start gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-rose-600 text-base shrink-0 mt-0.5">
                error
              </span>
              <span>{generalError}</span>
            </div>
          )}

          {/* SECTION 1: RELATIONAL BINDINGS */}
          <div className="space-y-4 bg-[#fcfaf7] p-4 rounded-2xl border border-[#e8e2d8]">
            <div className="flex items-center justify-between border-b border-[#e8e2d8] pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#ae001a]">hub</span>
                <span>TypeORM Relational Bindings</span>
              </span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase">
                Required Constraints
              </span>
            </div>

            {/* Parent QR Order Selector (qr_order_id) */}
            <div>
              <label
                htmlFor="drawer-parent-order"
                className="block font-bold text-gray-800 mb-1"
              >
                Parent Order Selector (qr_order_id) <span className="text-rose-500">*</span>
              </label>
              <select
                id="drawer-parent-order"
                data-testid="drawer-parent-order-select"
                value={qrOrderId}
                onChange={(e) => setQrOrderId(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 focus:border-[#ae001a]"
              >
                {orders.length === 0 ? (
                  <option value={0} disabled>
                    No registered QR orders available
                  </option>
                ) : (
                  orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {formatQROrderBadge(o.id)} • Order #{o.order_id} • (
                      {o.table?.number ? `Table #${o.table.number}` : 'No Table'} • Total:{' '}
                      {formatCurrency(o.total_amount)})
                    </option>
                  ))
                )}
              </select>
              {fieldErrors.qr_order_id && (
                <p data-testid="error-qr-order-id" className="text-rose-600 text-[11px] mt-1 font-semibold">
                  {fieldErrors.qr_order_id}
                </p>
              )}
            </div>

            {/* Menu Item Picker (qr_menu_item_id) with Search & Preview */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="drawer-menu-item"
                  className="font-bold text-gray-800"
                >
                  Menu Item Picker (qr_menu_item_id) <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-gray-500">Auto-sets unit price</span>
              </div>

              {/* Searchable input for menu items */}
              <div className="relative mb-2">
                <span className="material-symbols-outlined absolute left-2.5 top-2 text-gray-400 text-sm">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Filter catalog items..."
                  value={menuSearchQuery}
                  onChange={(e) => setMenuSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                />
              </div>

              <select
                id="drawer-menu-item"
                data-testid="drawer-menu-item-select"
                value={qrMenuItemId}
                onChange={(e) => handleSelectMenuItem(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 focus:border-[#ae001a]"
              >
                {filteredMenuItems.length === 0 ? (
                  <option value={0} disabled>
                    No catalog menu items available
                  </option>
                ) : (
                  filteredMenuItems.map((m) => (
                    <option key={m.id} value={m.id} data-testid={`menu-item-option-${m.id}`}>
                      #{m.id} - {m.name} ({formatCurrency(m.price)})
                    </option>
                  ))
                )}
              </select>
              {fieldErrors.qr_menu_item_id && (
                <p data-testid="error-qr-menu-item-id" className="text-rose-600 text-[11px] mt-1 font-semibold">
                  {fieldErrors.qr_menu_item_id}
                </p>
              )}

              {/* Selected dish visual card preview */}
              {selectedMenuItem && (
                <div className="mt-2.5 p-2.5 bg-white rounded-xl border border-gray-200 flex items-center gap-3 shadow-2xs">
                  <img
                    src={
                      selectedMenuItem.image_url ||
                      'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80'
                    }
                    alt={selectedMenuItem.name}
                    className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="font-bold text-gray-900 truncate">
                      {selectedMenuItem.name}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {selectedMenuItem.description || 'Catalog menu selection'}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-700 font-bold">
                      Base Price: {formatCurrency(selectedMenuItem.price)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* POS Order Item Selector (order_item_id) */}
            <div>
              <label
                htmlFor="drawer-pos-item"
                className="block font-bold text-gray-800 mb-1"
              >
                POS Order Item Selector (order_item_id) <span className="text-rose-500">*</span>
              </label>
              <select
                id="drawer-pos-item"
                data-testid="drawer-pos-item-select"
                value={orderItemId}
                onChange={(e) => setOrderItemId(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 focus:border-[#ae001a]"
              >
                {posItems.length === 0 ? (
                  <option value={0} disabled>
                    No POS order items available
                  </option>
                ) : (
                  posItems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatPOSOrderItemBadge(p.id)} • {p.product_name}
                    </option>
                  ))
                )}
              </select>
              {fieldErrors.order_item_id && (
                <p data-testid="error-order-item-id" className="text-rose-600 text-[11px] mt-1 font-semibold">
                  {fieldErrors.order_item_id}
                </p>
              )}
            </div>
          </div>

          {/* SECTION 2: QUANTITY, PRICING & AUTO-CALCULATED SUBTOTAL */}
          <div className="space-y-4 bg-white p-4 rounded-2xl border border-[#e8e2d8] shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-emerald-600">
                  calculate
                </span>
                <span>Financial Precision & Calculations (12, 2)</span>
              </span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase">
                quantity × unit_price
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {/* Quantity Input (quantity >= 1) */}
              <div>
                <label
                  htmlFor="drawer-quantity"
                  className="block font-bold text-gray-800 mb-1"
                >
                  Quantity Input (quantity) <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#ae001a]/20 focus-within:border-[#ae001a]">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseInt(quantity, 10) || 1;
                      if (cur > 1) setQuantity(String(cur - 1));
                    }}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition"
                  >
                    -
                  </button>
                  <input
                    id="drawer-quantity"
                    type="number"
                    min="1"
                    step="1"
                    data-testid="drawer-quantity-input"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full text-center py-2 text-xs font-mono font-black text-gray-900 focus:outline-none"
                    placeholder="1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseInt(quantity, 10) || 0;
                      setQuantity(String(cur + 1));
                    }}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition"
                  >
                    +
                  </button>
                </div>
                {fieldErrors.quantity && (
                  <p data-testid="error-quantity" className="text-rose-600 text-[11px] mt-1 font-semibold">
                    {fieldErrors.quantity}
                  </p>
                )}
              </div>

              {/* Unit Price Input (precision: 12, scale: 2) */}
              <div>
                <label
                  htmlFor="drawer-unit-price"
                  className="block font-bold text-gray-800 mb-1"
                >
                  Unit Price Input (unit_price) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 font-bold">$</span>
                  <input
                    id="drawer-unit-price"
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="drawer-unit-price-input"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-xl text-xs font-mono font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 focus:border-[#ae001a]"
                    placeholder="0.00"
                  />
                </div>
                {fieldErrors.unit_price && (
                  <p data-testid="error-unit-price" className="text-rose-600 text-[11px] mt-1 font-semibold">
                    {fieldErrors.unit_price}
                  </p>
                )}
              </div>
            </div>

            {/* Subtotal Price Display (Auto-calculated read-only field) */}
            <div className="p-3.5 bg-gradient-to-r from-amber-50/60 to-white rounded-xl border border-amber-200 flex items-center justify-between">
              <div>
                <span className="block font-bold text-gray-800 text-[11px] uppercase tracking-wider">
                  Subtotal Price Display (subtotal_price)
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  Auto-calculated: {quantity || '0'} × ${parseFloat(unitPrice || '0').toFixed(2)}
                </span>
              </div>
              <div className="text-right" data-testid="form-computed-subtotal">
                <input
                  type="text"
                  readOnly
                  data-testid="drawer-subtotal-display"
                  value={formatCurrency(autoCalculatedSubtotal)}
                  className="bg-transparent text-right font-mono text-lg font-black text-[#ae001a] focus:outline-none cursor-default w-32"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: INSTRUCTIONS & STATUS */}
          <div className="space-y-4 bg-white p-4 rounded-2xl border border-[#e8e2d8] shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-amber-600">
                  assignment
                </span>
                <span>Special Instructions & Operational Status</span>
              </span>
            </div>

            {/* Special Instructions Input (notes) */}
            <div>
              <label
                htmlFor="drawer-notes"
                className="block font-bold text-gray-800 mb-1"
              >
                Special Instructions Input (notes)
              </label>
              <textarea
                id="drawer-notes"
                rows={3}
                data-testid="drawer-notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. No onions, extra dressing, peanut allergy alert"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 focus:border-[#ae001a]"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Rendered with high prominence on KDS expeditor displays and printed tickets.
              </p>
            </div>

            {/* Status Selector Dropdown */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="drawer-status"
                  className="font-bold text-gray-800"
                >
                  Status Selector <span className="text-rose-500">*</span>
                </label>
                {mode === 'edit' && status === 'active' && (
                  <button
                    type="button"
                    data-testid="quick-void-btn"
                    onClick={handleQuickVoid}
                    className="text-[11px] text-[#f59e0b] hover:text-amber-700 font-bold flex items-center gap-1 transition"
                  >
                    <span className="material-symbols-outlined text-xs">pause_circle</span>
                    <span>Quick Void (Hold)</span>
                  </button>
                )}
                {mode === 'edit' && status === 'inactive' && (
                  <button
                    type="button"
                    data-testid="quick-restore-btn"
                    onClick={handleQuickRestore}
                    className="text-[11px] text-[#10b981] hover:text-emerald-700 font-bold flex items-center gap-1 transition"
                  >
                    <span className="material-symbols-outlined text-xs">check_circle</span>
                    <span>Restore Active Line</span>
                  </button>
                )}
              </div>

              <select
                id="drawer-status"
                data-testid="drawer-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as QROrderItemStatus)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#ae001a]/20 focus:border-[#ae001a]"
              >
                {QR_ORDER_ITEM_STATUSES.map((st) => {
                  const cfg = QR_ORDER_ITEM_STATUS_CONFIG[st];
                  return (
                    <option key={st} value={st}>
                      {cfg.label} ({cfg.subLabel})
                    </option>
                  );
                })}
              </select>
              {fieldErrors.status && (
                <p data-testid="error-status" className="text-rose-600 text-[11px] mt-1 font-semibold">
                  {fieldErrors.status}
                </p>
              )}
            </div>
          </div>

          {/* SECTION 4: CASCADE RECALCULATION ENGINE LIVE BANNER */}
          <div
            data-testid="drawer-cascade-banner"
            className={`p-4 rounded-2xl border transition ${
              cascadeProjection.isVoided
                ? 'bg-amber-50/80 border-amber-300'
                : 'bg-emerald-50/70 border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 text-gray-800">
                <span className="material-symbols-outlined text-sm text-[#ae001a]">
                  sync_alt
                </span>
                <span>Cascade Recalculation Engine</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200">
                Parent: {formatQROrderBadge(qrOrderId)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div className="space-y-0.5">
                <span className="text-gray-500 block text-[11px]">Current Parent Order Total:</span>
                <span className="font-mono font-bold text-gray-800">
                  {formatCurrency(cascadeProjection.currentParentTotal)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-gray-400 text-sm">
                  arrow_forward
                </span>
              </div>

              <div className="space-y-0.5 text-right">
                <span className="text-gray-500 block text-[11px]">Projected Parent Total:</span>
                <span
                  data-testid="projected-parent-total"
                  className="font-mono text-sm font-black text-[#ae001a]"
                >
                  {formatCurrency(cascadeProjection.projectedTotal)}
                </span>
              </div>
            </div>

            {cascadeProjection.isVoided ? (
              <div className="mt-2.5 pt-2 border-t border-amber-200/80 text-[11px] text-amber-900 font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-amber-600 text-sm">warning</span>
                <span>
                  Voided / On Hold status excludes this line from the parent order's total amount ($0.00 contribution).
                </span>
              </div>
            ) : (
              <div className="mt-2.5 pt-2 border-t border-emerald-200/80 text-[11px] text-emerald-800 font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-600 text-sm">check_circle</span>
                <span>
                  Subtotal price of {formatCurrency(autoCalculatedSubtotal)} is included in the parent order total.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-20 bg-white border-t border-[#e8e2d8] px-6 py-4 flex items-center justify-between gap-3 shadow-lg">
          <button
            type="button"
            data-testid="drawer-cancel-btn"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition"
          >
            Cancel
          </button>

          <button
            type="submit"
            data-testid="submit-line-item-btn"
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#8e0015] text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition disabled:opacity-50"
          >
            <span data-testid="drawer-submit-btn" className="contents">
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                  <span>Synchronizing...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>
                    {mode === 'edit'
                      ? 'Save & Synchronize Order'
                      : 'Create Line Item & Sync'}
                  </span>
                </>
              )}
            </span>
          </button>
        </div>
      </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
