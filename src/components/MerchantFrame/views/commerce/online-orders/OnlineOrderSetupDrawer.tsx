import React, { useState, useEffect, useMemo } from 'react';
import { SideDrawer } from '../../../shared/SideDrawer';
import { ModalFormError } from '../../../shared/AppModal';
import type {
  OnlineStoreOption,
  ProductOption,
  OnlineMenuOption,
  OnlineMenuItemOption,
} from './OnlineOrdersView';
import type {
  OnlineOrderDetailData,
  KitchenStationOption,
} from './OnlineOrderDetailsDrawer';

export interface CustomerOption {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  merchantId?: number;
}

export interface OrderItemDraft {
  id?: number;
  productId: number;
  productName: string;
  variantId?: number | null;
  variantName?: string | null;
  unitPrice: number;
  quantity: number;
  notes?: string | null;
}

export interface OnlineOrderFormData {
  id?: number;
  storeId: number;
  customerId: number;
  type: 'delivery' | 'pickup' | 'dine_in';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  fulfillmentStatus?: 'received' | 'accepted' | 'in_preparation' | 'ready' | 'completed' | 'cancelled';
  scheduledAt?: string | null;
  notes?: string | null;
  items?: OrderItemDraft[];
  stationId?: number | null;
}

export interface OnlineOrderSetupDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: OnlineOrderDetailData | null;
  stores: OnlineStoreOption[];
  customers?: CustomerOption[];
  products?: ProductOption[];
  onlineMenus?: OnlineMenuOption[];
  onlineMenuItems?: OnlineMenuItemOption[];
  kitchenStations?: KitchenStationOption[];
  onClose: () => void;
  onSubmit: (data: OnlineOrderFormData, mode: 'create' | 'edit') => Promise<void>;
}

export interface ItemSelectOption {
  key: string;
  productId: number;
  productName: string;
  variantId: number | null;
  variantName: string | null;
  unitPrice: number;
  menuName?: string;
  isFromStoreMenu: boolean;
}

export const OnlineOrderSetupDrawer: React.FC<OnlineOrderSetupDrawerProps> = ({
  isOpen,
  mode,
  initialData,
  stores,
  customers = [],
  products = [],
  onlineMenus = [],
  onlineMenuItems = [],
  kitchenStations = [],
  onClose,
  onSubmit,
}) => {
  const [storeId, setStoreId] = useState<number | ''>('');
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [type, setType] = useState<'delivery' | 'pickup' | 'dine_in' | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'failed' | 'refunded' | ''>('');
  const [fulfillmentStatus, setFulfillmentStatus] = useState<
    'received' | 'accepted' | 'in_preparation' | 'ready' | 'completed' | 'cancelled' | ''
  >('');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);

  // Order Line Items State
  const [items, setItems] = useState<OrderItemDraft[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState<string>('');
  const [, setItemDraftProductId] = useState<number | ''>('');
  const [, setItemDraftVariantId] = useState<number | ''>('');
  const [itemDraftQty, setItemDraftQty] = useState<number>(1);
  const [itemDraftNotes, setItemDraftNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedMenuId, setSelectedMenuId] = useState<number | ''>('');

  // 1. Menus that belong to the selected storefront
  const storeMenus = useMemo(() => {
    if (!storeId) return [];
    return (onlineMenus || []).filter(
      (m) => Number(m.storeId) === Number(storeId) && m.isActive !== false
    );
  }, [onlineMenus, storeId]);

  // Auto-selection: if store has 1 menu, preselect it; if store changes, reset or re-preselect
  useEffect(() => {
    if (!storeId || storeMenus.length === 0) {
      setSelectedMenuId('');
      setSelectedItemKey('');
      setItemDraftProductId('');
      setItemDraftVariantId('');
      return;
    }

    // Exactly 1 menu -> auto preselect
    if (storeMenus.length === 1) {
      setSelectedMenuId(storeMenus[0].id);
    } else {
      // Multiple menus: if currently selected menu is not in this store, reset to empty
      if (selectedMenuId && !storeMenus.some((m) => m.id === selectedMenuId)) {
        setSelectedMenuId('');
        setSelectedItemKey('');
        setItemDraftProductId('');
        setItemDraftVariantId('');
      }
    }
  }, [storeId, storeMenus]);

  // 2. Active items in the selected digital menu ONLY
  const menuAvailableItems = useMemo(() => {
    if (!storeId || !selectedMenuId) return [];
    return (onlineMenuItems || []).filter(
      (mi) =>
        Number(mi.menuId) === Number(selectedMenuId) &&
        mi.status !== 'deleted' &&
        mi.isAvailable !== false
    );
  }, [storeId, selectedMenuId, onlineMenuItems]);

  // 3. Selection item options (Strictly from the selected digital menu - NO general catalog fallback)
  const itemSelectOptions: ItemSelectOption[] = useMemo(() => {
    if (!storeId || !selectedMenuId) return [];

    return menuAvailableItems.map((mi) => {
      const prod = products.find((p) => p.id === mi.productId);
      const prodName = mi.product?.name || prod?.name || `Product #${mi.productId}`;
      const varName = mi.variant?.name || null;
      const menuObj = storeMenus.find((m) => m.id === mi.menuId);

      let unitPrice = 0;
      if (mi.priceOverride !== null && mi.priceOverride !== undefined && !isNaN(Number(mi.priceOverride))) {
        unitPrice = Number(mi.priceOverride);
      } else if (mi.variant?.price !== undefined && mi.variant?.price !== null && !isNaN(Number(mi.variant.price))) {
        unitPrice = Number(mi.variant.price);
      } else if (mi.product?.basePrice !== undefined && mi.product?.basePrice !== null && !isNaN(Number(mi.product.basePrice))) {
        unitPrice = Number(mi.product.basePrice);
      } else if (prod?.basePrice !== undefined && prod?.basePrice !== null && !isNaN(Number(prod.basePrice))) {
        unitPrice = Number(prod.basePrice);
      } else if (prod?.price !== undefined && prod?.price !== null && !isNaN(Number(prod.price))) {
        unitPrice = Number(prod.price);
      }

      return {
        key: `menu_item_${mi.id}`,
        productId: mi.productId,
        productName: prodName,
        variantId: mi.variantId || null,
        variantName: varName,
        unitPrice,
        menuName: menuObj?.name || mi.menu?.name,
        isFromStoreMenu: true,
      };
    });
  }, [storeId, selectedMenuId, menuAvailableItems, products, storeMenus]);

  const selectedItemOption = useMemo(
    () => itemSelectOptions.find((o) => o.key === selectedItemKey),
    [itemSelectOptions, selectedItemKey]
  );

  // Live item total
  const totalEstimatedAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [items]);

  const handleAddItem = () => {
    if (!selectedItemOption) return;

    const newItem: OrderItemDraft = {
      productId: selectedItemOption.productId,
      productName: selectedItemOption.productName,
      variantId: selectedItemOption.variantId,
      variantName: selectedItemOption.variantName,
      unitPrice: selectedItemOption.unitPrice,
      quantity: Math.max(1, itemDraftQty),
      notes: itemDraftNotes.trim() ? itemDraftNotes.trim() : null,
    };

    setItems((prev) => [...prev, newItem]);

    // Reset draft fields
    setSelectedItemKey('');
    setItemDraftProductId('');
    setItemDraftVariantId('');
    setItemDraftQty(1);
    setItemDraftNotes('');
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Filter out stores in maintenance mode (directamente no deben salir si están en mantenimiento)
  const selectableStores = useMemo(() => {
    return stores.filter((s) => {
      if (mode === 'edit' && initialData?.storeId === s.id) {
        return true; // Keep current store when editing
      }
      const isInactive =
        s.isActive === false ||
        s.is_active === false ||
        s.status === 'maintenance' ||
        s.status === 'inactive';
      return !isInactive;
    });
  }, [stores, mode, initialData]);

  // Sync state when drawer opens or initialData changes
  useEffect(() => {
    if (!isOpen) {
      setFormError(null);
      return;
    }

    if (mode === 'edit' && initialData) {
      const editStoreId = initialData.storeId ?? '';
      setStoreId(editStoreId);
      setCustomerId(initialData.customerId ?? '');
      setType(initialData.type ?? '');
      setPaymentStatus(initialData.paymentStatus ?? '');
      setFulfillmentStatus(
        (initialData.fulfillmentStatus === 'in_kitchen'
          ? 'in_preparation'
          : initialData.fulfillmentStatus === 'ready_for_pickup' || initialData.fulfillmentStatus === 'out_for_delivery'
          ? 'ready'
          : initialData.fulfillmentStatus) ?? ''
      );
      setScheduledAt(
        initialData.scheduledAt ? new Date(initialData.scheduledAt).toISOString().slice(0, 16) : ''
      );
      setNotes(initialData.notes || '');

      const editStoreMenus = (onlineMenus || []).filter(
        (m) => Number(m.storeId) === Number(editStoreId) && m.isActive !== false
      );
      if (editStoreMenus.length === 1) {
        setSelectedMenuId(editStoreMenus[0].id);
      } else {
        setSelectedMenuId('');
      }

      // Populate existing items
      if (initialData.items && initialData.items.length > 0) {
        setItems(
          initialData.items.map((it) => ({
            id: it.id,
            productId: it.productId,
            productName: it.product?.name || `Product #${it.productId}`,
            variantId: it.variantId || null,
            variantName: it.variant?.name || null,
            unitPrice: Number(it.unitPrice || 0),
            quantity: it.quantity || 1,
            notes: it.notes || null,
          }))
        );
      } else {
        setItems([]);
      }

      // Station preselection for Edit
      const currentStation =
        initialData.kitchenOrders?.[0]?.stationId ??
        (initialData as unknown as { stationId?: number })?.stationId ??
        null;
      if (currentStation) {
        setSelectedStationId(currentStation);
      } else if (kitchenStations && kitchenStations.length > 0) {
        setSelectedStationId(kitchenStations[0].id);
      } else {
        setSelectedStationId(null);
      }
    } else {
      // In create mode: no field comes pre-selected except default kitchen station!
      setStoreId('');
      setSelectedMenuId('');
      setCustomerId('');
      setType('');
      setPaymentStatus('');
      setFulfillmentStatus('');
      setScheduledAt('');
      setNotes('');
      setItems([]);
      setSelectedItemKey('');
      setItemDraftProductId('');
      setItemDraftVariantId('');
      setItemDraftQty(1);
      setItemDraftNotes('');
      if (kitchenStations && kitchenStations.length > 0) {
        setSelectedStationId(kitchenStations[0].id);
      } else {
        setSelectedStationId(null);
      }
    }
    setFormError(null);
  }, [isOpen, mode, initialData, onlineMenus, kitchenStations]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!storeId || Number(storeId) <= 0) {
      setFormError('Please select a storefront.');
      return;
    }

    if (!selectedMenuId && storeMenus.length > 0) {
      setFormError('Please select a digital menu for this storefront.');
      return;
    }

    if (!customerId || Number(customerId) <= 0) {
      setFormError('Please select or specify a customer profile.');
      return;
    }

    if (!type) {
      setFormError('Please select an order type (Delivery, Pickup, or Dine-In).');
      return;
    }

    if (!paymentStatus) {
      setFormError('Please select a payment status.');
      return;
    }

    if (!fulfillmentStatus) {
      setFormError('Please select an initial fulfillment status.');
      return;
    }

    // Auto-include currently drafted product if user selected one in the dropdown but didn't click "Add Item"
    const finalItems = [...items];
    if (selectedItemOption) {
      finalItems.push({
        productId: selectedItemOption.productId,
        productName: selectedItemOption.productName,
        variantId: selectedItemOption.variantId,
        variantName: selectedItemOption.variantName,
        unitPrice: selectedItemOption.unitPrice,
        quantity: Math.max(1, itemDraftQty),
        notes: itemDraftNotes.trim() ? itemDraftNotes.trim() : null,
      });
    }

    if (finalItems.length === 0) {
      setFormError('Please select and add at least one product item to the order before saving.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: OnlineOrderFormData = {
        id: initialData?.id,
        storeId: Number(storeId),
        customerId: Number(customerId),
        type,
        paymentStatus,
        fulfillmentStatus,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        notes: notes.trim() ? notes.trim() : null,
        items: finalItems,
        stationId: selectedStationId,
      };

      await onSubmit(payload, mode);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save online order configuration';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEdit = mode === 'edit';

  return (
    <SideDrawer
      title={isEdit ? `Edit Online Order #ONL-${initialData?.id}` : 'Create New Online Order'}
      subtitle={
        isEdit
          ? 'Update storefront binding, order type, payment, fulfillment lifecycle, and kitchen notes'
          : 'Provision a new customer web order with automatic dispatch binding'
      }
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth={640}
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 bg-[#faf8f5] font-sans">
        {/* Error Banner */}
        {formError && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <ModalFormError message={formError} />
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
          {/* Section 1: Storefront, Digital Menu & Customer */}
          <div className="bg-white p-5 rounded-xl border border-[#e8e2d8] shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#8c857b] uppercase tracking-wider border-b border-[#f2ede5] pb-2">
              <span className="material-symbols-outlined text-[#ae001a] text-base">storefront</span>
              <span>Storefront, Digital Menu & Customer</span>
            </div>

            {/* Row 1: Target Storefront & Digital Menu (Single line: 2 columns) */}
            <div className="grid grid-cols-2 gap-3">
              {/* Storefront Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                  Target Storefront <span className="text-[#ae001a]">*</span>
                </label>
                <select
                  value={storeId}
                  onChange={(e) => {
                    const nextStore = e.target.value ? Number(e.target.value) : '';
                    setStoreId(nextStore);
                    setSelectedItemKey('');
                    setItemDraftProductId('');
                    setItemDraftVariantId('');
                  }}
                  disabled={isSubmitting}
                  className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors cursor-pointer"
                  required
                >
                  <option value="" disabled>
                    Select storefront...
                  </option>
                  {selectableStores.length === 0 ? (
                    <option value="" disabled>
                      No active storefronts available
                    </option>
                  ) : (
                    selectableStores.map((s) => (
                      <option key={s.id} value={s.id}>
                        Store #{s.id} — {s.subdomain}.x7pos.com
                      </option>
                    ))
                  )}
                </select>
                <p className="text-[10px] text-[#8c857b] mt-1">
                  Tenant domain where customer placed this order.
                </p>
              </div>

              {/* Digital Menu Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                  Digital Menu <span className="text-[#ae001a]">*</span>
                </label>
                <select
                  value={selectedMenuId}
                  onChange={(e) => {
                    const newMenuId = e.target.value ? Number(e.target.value) : '';
                    setSelectedMenuId(newMenuId);
                    setSelectedItemKey('');
                    setItemDraftProductId('');
                    setItemDraftVariantId('');
                  }}
                  disabled={isSubmitting || !storeId || storeMenus.length === 0}
                  className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors cursor-pointer disabled:opacity-60 disabled:bg-[#fbf9f6] disabled:cursor-not-allowed"
                  required
                >
                  <option value="" disabled={storeMenus.length > 0}>
                    {!storeId
                      ? 'Select storefront first...'
                      : storeMenus.length === 0
                      ? 'No digital menus for this store'
                      : storeMenus.length === 1
                      ? `${storeMenus[0].name} (Preselected)`
                      : 'Select digital menu...'}
                  </option>
                  {storeMenus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} #{m.id}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#8c857b] mt-1">
                  {storeMenus.length === 1
                    ? 'Only 1 active menu — auto-preselected.'
                    : storeMenus.length > 1
                    ? `${storeMenus.length} menus available — select target menu.`
                    : 'Digital menu catalog binding.'}
                </p>
              </div>
            </div>

            {/* Row 2: Customer Profile (Single line: 2 columns) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                  Customer Profile <span className="text-[#ae001a]">*</span>
                </label>
                {customers.length > 0 ? (
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                    disabled={isSubmitting}
                    className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors cursor-pointer"
                    required
                  >
                    <option value="" disabled>
                      Select customer profile...
                    </option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.id} {c.name} {c.email ? `(${c.email})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                    disabled={isSubmitting}
                    placeholder="Enter Customer ID"
                    className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors"
                    required
                  />
                )}
                <p className="text-[10px] text-[#8c857b] mt-1">
                  Primary customer identity mapped in POS CRM.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8c857b] mb-1.5 uppercase tracking-wider">
                  Customer Contact Note
                </label>
                <div className="h-10 px-3 bg-[#faf8f5] border border-[#e8e2d8] rounded-lg text-xs text-[#5f5e5e] flex items-center">
                  {customerId ? (
                    (() => {
                      const c = customers.find((cust) => cust.id === customerId);
                      return c?.phone ? `Phone: ${c.phone}` : c?.email ? `Email: ${c.email}` : `ID: #${customerId}`;
                    })()
                  ) : (
                    <span className="text-[#8c857b]">Customer details will appear here</span>
                  )}
                </div>
                <p className="text-[10px] text-[#8c857b] mt-1">
                  Verified contact channel for dispatch notifications.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Order Type & Payment Status (Single line: 2 columns) */}
          <div className="bg-white p-5 rounded-xl border border-[#e8e2d8] shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#8c857b] uppercase tracking-wider border-b border-[#f2ede5] pb-2">
              <span className="material-symbols-outlined text-[#ae001a] text-base">payments</span>
              <span>Type & Payment Parameters</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Order Type Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                  Order Type <span className="text-[#ae001a]">*</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setType('delivery')}
                    className={`h-10 rounded-lg text-[11px] font-bold uppercase transition-all flex flex-col items-center justify-center border cursor-pointer ${
                      type === 'delivery'
                        ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                        : 'bg-white border-[#d5cfc4] text-[#5f5e5e] hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none mb-0.5">
                      local_shipping
                    </span>
                    <span>Delivery</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('pickup')}
                    className={`h-10 rounded-lg text-[11px] font-bold uppercase transition-all flex flex-col items-center justify-center border cursor-pointer ${
                      type === 'pickup'
                        ? 'bg-amber-50 border-amber-600 text-amber-800 shadow-xs'
                        : 'bg-white border-[#d5cfc4] text-[#5f5e5e] hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none mb-0.5">
                      takeout_dining
                    </span>
                    <span>Pickup</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('dine_in')}
                    className={`h-10 rounded-lg text-[11px] font-bold uppercase transition-all flex flex-col items-center justify-center border cursor-pointer ${
                      type === 'dine_in'
                        ? 'bg-purple-50 border-purple-600 text-purple-800 shadow-xs'
                        : 'bg-white border-[#d5cfc4] text-[#5f5e5e] hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none mb-0.5">
                      restaurant
                    </span>
                    <span>Dine-In</span>
                  </button>
                </div>
                <p className="text-[10px] text-[#8c857b] mt-1">
                  Online order fulfillment channel.
                </p>
              </div>

              {/* Payment Status Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                  Payment Status <span className="text-[#ae001a]">*</span>
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) =>
                    setPaymentStatus(
                      e.target.value as 'pending' | 'paid' | 'failed' | 'refunded' | ''
                    )
                  }
                  disabled={isSubmitting}
                  className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors cursor-pointer"
                  required
                >
                  <option value="" disabled>
                    Select payment status...
                  </option>
                  <option value="paid">PAID (Settled via Gateway)</option>
                  <option value="pending">PENDING (Pay at Counter / Delivery)</option>
                  <option value="failed">FAILED (Gateway Card Decline)</option>
                  <option value="refunded">REFUNDED (Reversed Transaction)</option>
                </select>
                <p className="text-[10px] text-[#8c857b] mt-1">
                  Financial gateway balance state.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Fulfillment Status & Scheduled Time (Single line: 2 columns) */}
          <div className="bg-white p-5 rounded-xl border border-[#e8e2d8] shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#8c857b] uppercase tracking-wider border-b border-[#f2ede5] pb-2">
              <span className="material-symbols-outlined text-[#ae001a] text-base">timeline</span>
              <span>Fulfillment Lifecycle & Scheduling</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Fulfillment Status Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                  Fulfillment Status <span className="text-[#ae001a]">*</span>
                </label>
                <select
                  value={fulfillmentStatus}
                  onChange={(e) =>
                    setFulfillmentStatus(
                      e.target.value as
                        | 'received'
                        | 'accepted'
                        | 'in_preparation'
                        | 'ready'
                        | 'completed'
                        | 'cancelled'
                        | ''
                    )
                  }
                  disabled={isSubmitting}
                  className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors cursor-pointer"
                  required
                >
                  <option value="" disabled>
                    Select fulfillment status...
                  </option>
                  <option value="received">RECEIVED (Awaiting Dispatcher Accept)</option>
                  <option value="accepted">ACCEPTED (Inject to POS & Push to KDS)</option>
                  <option value="in_preparation">IN_PREPARATION (Cooking in Kitchen)</option>
                  <option value="ready">READY (Packaged for Courier / Pickup)</option>
                  <option value="completed">COMPLETED (Handed Over / Fulfilled)</option>
                  <option value="cancelled">CANCELLED (Void / Rejected)</option>
                </select>
                {fulfillmentStatus === 'accepted' ? (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    <span className="material-symbols-outlined text-[13px]">hub</span>
                    <span>Triggers automatic POS Core and KDS creation!</span>
                  </div>
                ) : (
                  <p className="text-[10px] text-[#8c857b] mt-1">
                    Current stage in order workflow.
                  </p>
                )}
              </div>

              {/* Scheduled Time (Pre-orders) */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                  Scheduled Time (Pre-order Only)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors cursor-pointer"
                />
                <p className="text-[10px] text-[#8c857b] mt-1">
                  Leave empty if order is for immediate preparation.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3b: Kitchen Station Routing (KDS) */}
          <div className="bg-white p-5 rounded-xl border border-[#e8e2d8] shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#8c857b] uppercase tracking-wider border-b border-[#f2ede5] pb-2">
              <span className="material-symbols-outlined text-[#ae001a] text-base">soup_kitchen</span>
              <span>Kitchen Station Routing (KDS)</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                Select Prep Kitchen Station
              </label>
              {kitchenStations && kitchenStations.length > 0 ? (
                <select
                  value={selectedStationId ?? ''}
                  onChange={(e) =>
                    setSelectedStationId(e.target.value ? Number(e.target.value) : null)
                  }
                  disabled={isSubmitting}
                  className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors cursor-pointer"
                >
                  {kitchenStations.map((station, index) => (
                    <option key={station.id} value={station.id}>
                      {station.name} {index === 0 ? '(Default)' : ''}
                      {station.stationType ? ` — [${station.stationType.toUpperCase()}]` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-[#8c857b] bg-[#fbf9f6] p-2.5 rounded-lg border border-[#e8e2d8]">
                  No kitchen stations configured. Order will route to the default kitchen line.
                </div>
              )}
              <p className="text-[10px] text-[#8c857b] mt-1.5">
                When this order is accepted or moved to preparation, the kitchen order ticket will be dispatched directly to this station.
              </p>
            </div>
          </div>

          {/* Section 4: Order Line Items (Products & Preparation) */}
          <div className="bg-white p-5 rounded-xl border border-[#e8e2d8] shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#f2ede5] pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#8c857b] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[#ae001a] text-base">lunch_dining</span>
                <span>Order Items & Products</span>
              </div>
              {items.length > 0 && (
                <span className="text-xs font-mono font-bold text-[#ae001a]">
                  {items.length} {items.length === 1 ? 'item' : 'items'} • ${totalEstimatedAmount.toFixed(2)}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                Select Product & Quantity
              </label>

              <div className="flex items-center gap-2 w-full">
                {/* Product Dropdown */}
                <div className="flex-1 min-w-0">
                  <select
                    value={selectedItemKey}
                    onChange={(e) => {
                      const key = e.target.value;
                      setSelectedItemKey(key);
                      const opt = itemSelectOptions.find((o) => o.key === key);
                      if (opt) {
                        setItemDraftProductId(opt.productId);
                        setItemDraftVariantId(opt.variantId ? opt.variantId : '');
                      } else {
                        setItemDraftProductId('');
                        setItemDraftVariantId('');
                      }
                    }}
                    disabled={isSubmitting || !storeId || !selectedMenuId || itemSelectOptions.length === 0}
                    className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors cursor-pointer truncate disabled:opacity-60 disabled:bg-[#fbf9f6] disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {!storeId
                        ? 'Select storefront first to view menu products...'
                        : storeMenus.length === 0
                        ? 'Storefront has no active digital menus'
                        : !selectedMenuId
                        ? 'Select a digital menu in Section 1 to view products...'
                        : itemSelectOptions.length === 0
                        ? 'No products available in this menu'
                        : 'Choose a product from this menu...'}
                    </option>
                    {itemSelectOptions.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.productName}
                        {item.variantName ? ` (${item.variantName})` : ''} — ${item.unitPrice.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div className="w-20 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={itemDraftQty}
                    onChange={(e) => setItemDraftQty(Math.max(1, Number(e.target.value) || 1))}
                    disabled={isSubmitting || !selectedItemKey}
                    className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-bold text-center text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors disabled:opacity-60 disabled:bg-[#fbf9f6]"
                    placeholder="Qty"
                  />
                </div>

                {/* Add Item Button */}
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={isSubmitting || !selectedItemOption}
                    className="h-10 px-4 rounded-lg bg-[#ae001a] hover:bg-[#d2272f] disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                    title="Add item to list"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                    <span>Add Item</span>
                  </button>
                </div>
              </div>

              {/* Line Item Notes Input */}
              {selectedItemKey ? (
                <div className="mt-2">
                  <input
                    type="text"
                    value={itemDraftNotes}
                    onChange={(e) => setItemDraftNotes(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Item preparation note (e.g., Extra spicy, dressing on side, no onions)..."
                    className="w-full h-10 px-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] placeholder:text-[#8c857b] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors"
                  />
                </div>
              ) : null}

              {/* Informative Helper Note */}
              <div className="mt-1.5">
                {!storeId ? (
                  <p className="text-[10px] text-amber-800 flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[13px]">info</span>
                    <span>Please select a storefront in Section 1 to load its digital menu products.</span>
                  </p>
                ) : !selectedMenuId ? (
                  <p className="text-[10px] text-amber-800 flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[13px]">info</span>
                    <span>Please select a digital menu in Section 1 to view its products and prices.</span>
                  </p>
                ) : itemSelectOptions.length > 0 ? (
                  <p className="text-[10px] text-emerald-800 flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[13px]">restaurant_menu</span>
                    <span>
                      Showing {itemSelectOptions.length} products with prices from the selected menu.
                    </span>
                  </p>
                ) : (
                  <p className="text-[10px] text-[#8c857b]">
                    This digital menu currently has no active items.
                  </p>
                )}
              </div>
            </div>

            {/* List of current line items */}
            {items.length > 0 && (
              <div className="divide-y divide-[#f2ede5] border border-[#e8e2d8] rounded-lg overflow-hidden bg-white">
                {items.map((item, idx) => {
                  const lineTotal = item.quantity * item.unitPrice;
                  return (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded bg-[#222222] text-white font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                          {item.quantity}×
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-[#1d1c17] truncate">
                            {item.productName}
                          </div>
                          {item.variantName && (
                            <div className="text-[10px] text-purple-700 font-medium">
                              Variant: {item.variantName}
                            </div>
                          )}
                          {item.notes && (
                            <div className="text-[10px] text-amber-800 italic">
                              Note: {item.notes}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-mono">
                        <div className="text-right">
                          <div className="font-bold text-[#1d1c17]">
                            ${lineTotal.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-[#8c857b]">
                            ${item.unitPrice.toFixed(2)} ea
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={isSubmitting}
                          className="w-7 h-7 rounded text-red-600 hover:bg-red-50 hover:text-red-800 transition-colors flex items-center justify-center cursor-pointer"
                          title="Remove item"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Subtotal Footer */}
                <div className="p-3 bg-[#fcfcfb] flex items-center justify-between text-xs font-bold border-t border-[#e8e2d8]">
                  <span className="text-[#5f5e5e] uppercase tracking-wider text-[11px]">
                    Items Subtotal ({items.reduce((acc, it) => acc + it.quantity, 0)} units)
                  </span>
                  <span className="text-sm font-mono text-[#1d1c17]">
                    ${totalEstimatedAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Customer Special Notes / Instructions */}
          <div className="bg-white p-5 rounded-xl border border-[#e8e2d8] shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#f2ede5] pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#8c857b] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[#ae001a] text-base">speaker_notes</span>
                <span>Special Instructions & Kitchen Notes</span>
              </div>
              <span className="text-[10px] font-mono text-[#8c857b]">
                {notes.length}/5000
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1d1c17] mb-1.5 uppercase tracking-wider">
                Kitchen Notes & Delivery Instructions
              </label>
              <textarea
                rows={3}
                value={notes}
                maxLength={5000}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g., Gate code #4521, dressings on the side, extreme peanut allergy, ring bell twice..."
                className="w-full p-3 bg-white border border-[#d5cfc4] rounded-lg text-xs font-medium text-[#1d1c17] placeholder:text-[#8c857b] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors"
              />
              <p className="text-[10px] text-[#8c857b] mt-1">
                Notes are highlighted prominently in dispatch modals, KDS tickets, and printed receipts.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white p-4 border-t border-[#e8e2d8] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-10 px-4 border border-[#e8e2d8] rounded-lg font-semibold text-xs text-[#1d1c17] hover:bg-[#f8f5ee] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-10 px-6 rounded-lg text-white text-xs font-bold uppercase tracking-wider bg-[#ae001a] hover:bg-[#d2272f] transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">
              {isEdit ? 'save' : 'add'}
            </span>
            <span>{isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Order'}</span>
          </button>
        </div>
      </form>
    </SideDrawer>
  );
};
