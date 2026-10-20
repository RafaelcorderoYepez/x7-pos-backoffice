import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken } from '../../../../../lib/auth-storage';

export interface OnlineMenuOption {
  id: number;
  name: string;
}

export interface InventoryProductOption {
  id: number;
  name: string;
  sku?: string;
  basePrice: number;
}

export interface InventoryVariantOption {
  id: number;
  productId: number;
  name: string;
  sku?: string;
  price: number;
}

export interface OnlineMenuItemFormData {
  id?: number;
  menuId: number;
  productId: number;
  variantId?: number | null;
  isAvailable: boolean;
  priceOverride?: number | null;
  displayOrder: number;
  status: 'active' | 'deleted';
}

export interface OnlineMenuItemSetupDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: OnlineMenuItemFormData | null;
  menus: OnlineMenuOption[];
  products: InventoryProductOption[];
  variants: InventoryVariantOption[];
  existingItems: {
    id: number;
    menuId: number;
    productId: number;
    variantId?: number | null;
    status: string;
    displayOrder?: number;
  }[];
  onClose: () => void;
  onSuccess: (savedItem: unknown, message: string) => void;
}

export const OnlineMenuItemSetupDrawer: React.FC<OnlineMenuItemSetupDrawerProps> = ({
  isOpen,
  mode,
  initialData,
  menus,
  products,
  variants,
  existingItems,
  onClose,
  onSuccess,
}) => {
  if (!isOpen) return null;

  return (
    <OnlineMenuItemSetupDrawerContent
      key={`${mode}-${initialData?.id ?? 'new'}`}
      mode={mode}
      initialData={initialData}
      menus={menus}
      products={products}
      variants={variants}
      existingItems={existingItems}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
};

interface ContentProps {
  mode: 'create' | 'edit';
  initialData?: OnlineMenuItemFormData | null;
  menus: OnlineMenuOption[];
  products: InventoryProductOption[];
  variants: InventoryVariantOption[];
  existingItems: {
    id: number;
    menuId: number;
    productId: number;
    variantId?: number | null;
    status: string;
    displayOrder?: number;
  }[];
  onClose: () => void;
  onSuccess: (savedItem: unknown, message: string) => void;
}

const OnlineMenuItemSetupDrawerContent: React.FC<ContentProps> = ({
  mode,
  initialData,
  menus,
  products,
  variants,
  existingItems,
  onClose,
  onSuccess,
}) => {
  // Menus sorted strictly by ID ascending so the first menu (#1) is always first
  const sortedMenus = useMemo(() => {
    return [...menus].sort((a, b) => a.id - b.id);
  }, [menus]);

  const [selectedMenuId, setSelectedMenuId] = useState<number | ''>(() => {
    return initialData?.menuId ?? '';
  });

  const [selectedProductId, setSelectedProductId] = useState<number | ''>(() => {
    return initialData?.productId || '';
  });

  const [selectedVariantId, setSelectedVariantId] = useState<number | 'none'>(() => {
    if (initialData?.variantId !== null && initialData?.variantId !== undefined) {
      return initialData.variantId;
    }
    return 'none';
  });

  const [isAvailable, setIsAvailable] = useState<boolean>(() => {
    return initialData?.isAvailable ?? true;
  });

  const [priceOverrideStr, setPriceOverrideStr] = useState<string>(() => {
    if (initialData?.priceOverride !== null && initialData?.priceOverride !== undefined) {
      return String(initialData.priceOverride);
    }
    return '';
  });

  // Calculate next available display sequence strictly for the target menu
  const getNextDisplayOrder = useCallback(
    (targetMenuId: number | '') => {
      if (!targetMenuId) return 1;
      const sameMenu = existingItems.filter(
        (i) => i.menuId === Number(targetMenuId) && i.status === 'active'
      );
      if (sameMenu.length === 0) return 1;
      const maxOrder = Math.max(0, ...sameMenu.map((i) => i.displayOrder ?? 0));
      return Math.max(maxOrder + 1, sameMenu.length + 1);
    },
    [existingItems]
  );

  const [displayOrder, setDisplayOrder] = useState<number>(() => {
    if (initialData?.displayOrder !== undefined) return initialData.displayOrder;
    if (initialData?.menuId) return getNextDisplayOrder(initialData.menuId);
    return 1;
  });

  const [status, setStatus] = useState<'active' | 'deleted'>(() => {
    return initialData?.status ?? 'active';
  });

  // Product search filter for picker
  const [productSearch, setProductSearch] = useState<string>('');
  const [isProductPickerOpen, setIsProductPickerOpen] = useState<boolean>(() => {
    return mode === 'create' && !initialData?.productId;
  });

  // Submission feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  // Recalculate next display order when selectedMenuId changes in Create mode
  const handleMenuChange = (newMenuId: number) => {
    setSelectedMenuId(newMenuId);
    if (mode === 'create') {
      setDisplayOrder(getNextDisplayOrder(newMenuId));
    }
  };

  // Filtered products based on search term
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const term = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        String(p.id).includes(term)
    );
  }, [products, productSearch]);

  // Selected product object
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return products.find((p) => p.id === Number(selectedProductId)) || null;
  }, [products, selectedProductId]);

  // Available variants for selected product
  const availableVariants = useMemo(() => {
    if (!selectedProductId) return [];
    return variants.filter((v) => v.productId === Number(selectedProductId));
  }, [variants, selectedProductId]);

  // Selected variant object
  const selectedVariant = useMemo(() => {
    if (selectedVariantId === 'none' || !selectedVariantId) return null;
    return variants.find((v) => v.id === Number(selectedVariantId)) || null;
  }, [variants, selectedVariantId]);

  // Base inherited catalog price
  const inheritedBasePrice = useMemo(() => {
    if (selectedVariant && selectedVariant.price !== undefined) {
      return Number(selectedVariant.price);
    }
    if (selectedProduct && selectedProduct.basePrice !== undefined) {
      return Number(selectedProduct.basePrice);
    }
    return 0;
  }, [selectedProduct, selectedVariant]);

  // Price override parsing
  const activeOverrideValue = useMemo(() => {
    if (!priceOverrideStr.trim()) return null;
    const val = parseFloat(priceOverrideStr);
    return isNaN(val) ? null : val;
  }, [priceOverrideStr]);

  // Price difference calculation
  const priceDiff = useMemo(() => {
    if (activeOverrideValue === null) return null;
    const diff = activeOverrideValue - inheritedBasePrice;
    return {
      diff,
      isHigher: diff > 0,
      isLower: diff < 0,
      percent: inheritedBasePrice > 0 ? (diff / inheritedBasePrice) * 100 : 0,
    };
  }, [activeOverrideValue, inheritedBasePrice]);

  // Check duplicate binding
  const duplicateConflict = useMemo(() => {
    if (!selectedMenuId || !selectedProductId) return null;
    return (
      existingItems.find((item) => {
        if (mode === 'edit' && item.id === initialData?.id) return false;
        const sameMenu = item.menuId === Number(selectedMenuId);
        const sameProduct = item.productId === Number(selectedProductId);
        const targetVarId = selectedVariantId === 'none' ? null : Number(selectedVariantId);
        const sameVariant =
          (item.variantId === null || item.variantId === undefined ? null : Number(item.variantId)) ===
          targetVarId;
        return sameMenu && sameProduct && sameVariant;
      }) || null
    );
  }, [existingItems, selectedMenuId, selectedProductId, selectedVariantId, mode, initialData]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (!selectedMenuId) {
      setErrorMessage('Please select a target digital menu.');
      return;
    }
    if (!selectedProductId) {
      setErrorMessage('Please select a catalog product from inventory.');
      return;
    }
    if (displayOrder < 1) {
      setErrorMessage('Display order must be at least 1.');
      return;
    }

    if (activeOverrideValue !== null) {
      if (activeOverrideValue < 0) {
        setErrorMessage('Price override cannot be negative.');
        return;
      }
      if (priceOverrideStr.trim()) {
        const parts = priceOverrideStr.trim().split('.');
        if (parts.length > 1 && parts[1].length > 2) {
          setErrorMessage('Price override must have at most 2 decimal places (e.g. 15.99).');
          return;
        }
      }
    }

    if (duplicateConflict && duplicateConflict.status === 'active' && status === 'active') {
      setErrorMessage(
        'This product/variant is already active in the selected menu. Adjust its configuration or select another.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const payload: Record<string, any> = {
        menuId: Number(selectedMenuId),
        productId: Number(selectedProductId),
        variantId: selectedVariantId === 'none' ? null : Number(selectedVariantId),
        isAvailable,
        priceOverride: activeOverrideValue,
        displayOrder: Number(displayOrder),
      };

      if (mode === 'edit' || (status && status !== 'active')) {
        payload.status = status;
      }

      let res: Response;
      if (mode === 'create') {
        res = await fetch(`${API_BASE}/online-menu-items`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/online-menu-items/${initialData?.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          res = await fetch(`${API_BASE}/online-menu-items/${initialData?.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload),
          });
        }
      }

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        const rawMsg = errorJson.message || errorJson.error;
        const formattedMsg = Array.isArray(rawMsg)
          ? rawMsg.join(', ')
          : rawMsg || `Failed to ${mode === 'create' ? 'create' : 'update'} menu item (${res.status})`;
        throw new Error(formattedMsg);
      }

      const responseJson = await res.json();
      const savedData = responseJson.data || responseJson;

      const successMsg =
        mode === 'create'
          ? `Product "${selectedProduct?.name || 'Item'}" successfully bound to menu!`
          : `Menu item configuration updated successfully!`;

      onSuccess(savedData, successMsg);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while saving the menu item.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-hidden font-sans">
      {/* Dimmed Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Side Drawer Container (Pinned flush to right edge) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-drawer-title"
        className="fixed top-0 right-0 bottom-0 z-10 w-full max-w-lg bg-[#fcfbfa] shadow-2xl flex flex-col border-l border-[#e8e2d8] text-left overflow-hidden animate-slide-in"
      >
        {/* Drawer Header (Standard #1c1b16 theme) */}
        <div className="bg-[#1c1b16] px-6 py-5 flex items-center justify-between shrink-0 border-b border-[#32312b]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#ae001a] flex items-center justify-center text-white shadow-xs shrink-0">
              <span className="material-symbols-outlined text-2xl select-none" style={{ color: '#ffffff' }}>
                restaurant_menu
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="menu-item-drawer-title"
                  style={{ color: '#ffffff' }}
                  className="text-base font-black text-white !text-white uppercase tracking-wider leading-tight font-poppins"
                >
                  {mode === 'create' ? 'Bind Catalog Item to Menu' : 'Configure Menu Item'}
                </h2>
                <span
                  style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold whitespace-nowrap"
                >
                  {mode === 'create' ? 'NEW BINDING' : 'EDIT BINDING'}
                </span>
              </div>
              <p style={{ color: '#a1a1aa' }} className="text-xs text-zinc-400 mt-0.5 truncate font-poppins">
                {mode === 'create'
                  ? 'Map inventory catalog items with custom online pricing and sequence'
                  : `Editing item #${initialData?.id} binding configuration`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <span className="material-symbols-outlined text-xl select-none">close</span>
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Validation Notice */}
          {errorMessage && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-[#ae001a] text-xs flex items-start gap-2.5">
              <span className="material-symbols-outlined text-lg shrink-0 mt-0.5">error</span>
              <div>
                <p className="font-bold">Validation / Notice</p>
                <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Duplicate Conflict Notice */}
          {duplicateConflict && (
            <div
              className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                duplicateConflict.status === 'deleted'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <span className="material-symbols-outlined text-base shrink-0 mt-0.5">
                {duplicateConflict.status === 'deleted' ? 'history' : 'warning'}
              </span>
              <div>
                <div className="font-bold">
                  {duplicateConflict.status === 'deleted'
                    ? 'Archived Binding Found'
                    : 'Active Binding Exists'}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed">
                  {duplicateConflict.status === 'deleted'
                    ? 'This item was previously archived in this menu. Submitting will restore and update it.'
                    : 'This product/variant is already assigned to this menu. Duplicate active bindings are prevented.'}
                </div>
              </div>
            </div>
          )}

          {/* Section 1: Digital Menu Selection */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-purple-600">restaurant_menu</span>
                Target Digital Menu *
              </label>
              <span className="text-[10px] font-mono text-[#5f5e5e] bg-zinc-100 px-2 py-0.5 rounded">
                {mode === 'create' ? 'Target Menu' : 'Menu Channel'}
              </span>
            </div>

            <div>
              {menus.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-poppins flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-amber-600">warning</span>
                  <span>No digital menus available. Please configure menus in the Menus Workspace first.</span>
                </div>
              ) : (
                <select
                  value={selectedMenuId}
                  onChange={(e) => handleMenuChange(Number(e.target.value))}
                  disabled={mode === 'edit' || isSubmitting}
                  className={`w-full px-3.5 py-2.5 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-medium focus:border-[#ae001a] focus:outline-none transition-colors font-poppins cursor-pointer ${
                    mode === 'edit' ? 'bg-[#f0ede6] text-[#5f5e5e] cursor-not-allowed' : ''
                  }`}
                  required
                >
                  <option value="" disabled>
                    Select digital menu...
                  </option>
                  {sortedMenus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (#{m.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-[11px] text-[#5f5e5e]">
              The digital storefront channel where this item will be presented.
            </p>
          </div>

          {/* Section 2: Catalog Product Selector */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-[#ae001a]">inventory_2</span>
                Catalog Product *
              </label>
              <span className="text-[10px] font-mono text-[#5f5e5e] bg-zinc-100 px-2 py-0.5 rounded">
                Searchable Picker
              </span>
            </div>

            {selectedProduct && !isProductPickerOpen ? (
              <div className="p-3 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">check</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1d1c17] truncate font-poppins">
                        {selectedProduct.name}
                      </span>
                      <span className="text-[10px] font-mono bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded font-semibold">
                        #PRD-{selectedProduct.id}
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-600 font-medium font-poppins flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      Catalog Price: ${Number(selectedProduct.basePrice || 0).toFixed(2)}
                      {selectedProduct.sku ? ` • SKU: ${selectedProduct.sku}` : ''}
                    </span>
                  </div>
                </div>

                {mode === 'create' && (
                  <button
                    type="button"
                    onClick={() => setIsProductPickerOpen(true)}
                    disabled={isSubmitting}
                    className="px-2.5 py-1.5 rounded-lg border border-[#d5cfc4] bg-white hover:bg-zinc-50 text-[11px] font-bold text-[#1d1c17] font-poppins flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">swap_horiz</span>
                    <span>Change</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-base pointer-events-none">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search product by name or SKU..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setIsProductPickerOpen(true);
                    }}
                    onFocus={() => setIsProductPickerOpen(true)}
                    disabled={mode === 'edit' || isSubmitting}
                    className="w-full pl-9 pr-8 py-2 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-medium focus:border-[#ae001a] focus:outline-none transition-colors font-poppins"
                    autoFocus={isProductPickerOpen}
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => setProductSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filtered Products Dropdown */}
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[#e8e2d8] divide-y divide-[#f0ede6] bg-white shadow-2xs">
                  {filteredProducts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#5f5e5e] font-poppins">
                      <span className="material-symbols-outlined text-2xl text-zinc-300 block mb-1">
                        search_off
                      </span>
                      <span>No active inventory products found matching your query.</span>
                    </div>
                  ) : (
                    filteredProducts.map((p) => {
                      const isSelected = selectedProductId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(p.id);
                            setSelectedVariantId('none');
                            setIsProductPickerOpen(false);
                            setProductSearch('');
                            setErrorMessage(null);
                          }}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#ae001a]/5 border-l-4 border-l-[#ae001a]'
                              : 'hover:bg-zinc-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#1d1c17] truncate font-poppins">
                              {p.name}
                            </div>
                            <div className="text-[10px] text-[#5f5e5e] font-mono">
                              SKU: {p.sku || 'N/A'} • ID: #{p.id}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-[#ae001a] shrink-0 ml-2">
                            ${Number(p.basePrice || 0).toFixed(2)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Product Variant Selector */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-blue-600">style</span>
                Product Variant (Optional)
              </label>
              <span className="text-[10px] font-mono text-[#5f5e5e] bg-zinc-100 px-2 py-0.5 rounded">
                SKU Variant
              </span>
            </div>

            {availableVariants.length === 0 ? (
              <div className="p-3 rounded-lg bg-[#fcfcfb] border border-[#e8e2d8] text-[#5f5e5e] text-xs flex items-center gap-2 font-poppins">
                <span className="material-symbols-outlined text-base text-zinc-400">info</span>
                <span>This product has no specific variants. Base catalog pricing applies.</span>
              </div>
            ) : (
              <select
                value={selectedVariantId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedVariantId(val === 'none' ? 'none' : Number(val));
                }}
                disabled={mode === 'edit' || isSubmitting}
                className={`w-full px-3.5 py-2.5 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-medium focus:border-[#ae001a] focus:outline-none transition-colors font-poppins cursor-pointer ${
                  mode === 'edit' ? 'bg-[#f0ede6] text-[#5f5e5e] cursor-not-allowed' : ''
                }`}
              >
                <option value="none">
                  Base Product (No Variant) — ${Number(selectedProduct?.basePrice || 0).toFixed(2)}
                </option>
                {availableVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — ${Number(v.price || 0).toFixed(2)} (SKU: {v.sku || 'N/A'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Section 4: Dynamic Price Override Engine */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-purple-600">sell</span>
                Dynamic Price Override Engine
              </label>
              {activeOverrideValue !== null && (
                <button
                  type="button"
                  onClick={() => setPriceOverrideStr('')}
                  className="text-[10px] font-bold text-purple-700 hover:text-purple-900 underline uppercase tracking-wider cursor-pointer"
                >
                  Clear Override
                </button>
              )}
            </div>

            <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
              Set a web-exclusive price for this menu. If left blank, the item automatically inherits the catalog base price (${inheritedBasePrice.toFixed(2)}).
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="block text-[10px] font-bold uppercase text-[#5f5e5e] tracking-wider mb-1">
                  Inherited Base Price
                </span>
                <div className="h-10 px-3 rounded-lg bg-[#fcfcfb] border border-[#d5cfc4] flex items-center justify-between font-mono font-bold text-xs text-[#1d1c17]">
                  <span>${inheritedBasePrice.toFixed(2)}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 uppercase font-sans">
                    Catalog
                  </span>
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-bold uppercase text-[#5f5e5e] tracking-wider mb-1">
                  Web Override Price ($)
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-[#5f5e5e]">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Inherit base"
                    value={priceOverrideStr}
                    onChange={(e) => setPriceOverrideStr(e.target.value)}
                    className="w-full h-10 pl-7 pr-3 rounded-lg border border-[#d5cfc4] bg-[#fcfcfb] text-xs font-mono font-bold text-[#1d1c17] focus:outline-none focus:border-[#ae001a] transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Storefront Active Online Price Preview */}
            <div className="p-3 rounded-lg bg-[#fcfcfb] border border-[#e8e2d8] flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-[#5f5e5e] tracking-wider">
                  Storefront Active Price
                </div>
                <div className="text-lg font-extrabold text-[#1d1c17] font-mono mt-0.5">
                  ${(activeOverrideValue ?? inheritedBasePrice).toFixed(2)}
                </div>
              </div>

              <div className="text-right">
                {activeOverrideValue !== null ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                    Override Active
                    {priceDiff && priceDiff.diff !== 0 && (
                      <span className="font-mono ml-0.5">
                        ({priceDiff.diff > 0 ? '+' : ''}${priceDiff.diff.toFixed(2)})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    Inheriting Base
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Availability Switch */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-emerald-600">toggle_on</span>
                Real-Time Storefront Availability
              </label>
            </div>

            <div
              onClick={() => setIsAvailable(!isAvailable)}
              className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                isAvailable ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-2xl ${
                    isAvailable ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {isAvailable ? 'check_circle' : 'remove_shopping_cart'}
                </span>
                <div>
                  <div
                    className={`text-xs font-bold uppercase tracking-wider ${
                      isAvailable ? 'text-emerald-900' : 'text-amber-900'
                    }`}
                  >
                    {isAvailable ? 'Available (In Stock)' : 'Out of Stock (Sold Out)'}
                  </div>
                  <div className="text-[11px] text-[#5f5e5e] mt-0.5">
                    {isAvailable
                      ? 'Customers can browse and place orders for this item.'
                      : 'Badged as Sold Out on storefront while retaining menu binding.'}
                  </div>
                </div>
              </div>

              {/* Toggle switch */}
              <div
                className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out shrink-0 ${
                  isAvailable ? 'bg-emerald-600' : 'bg-zinc-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${
                    isAvailable ? 'translate-x-5' : ''
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 6: Presentation Sequence & Logical Status */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins mb-1.5">
                  <span className="material-symbols-outlined text-base text-zinc-600">format_list_numbered</span>
                  Sequence Order *
                </label>
                <input
                  type="number"
                  min="1"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3.5 py-2.5 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs font-mono font-bold text-[#1d1c17] focus:border-[#ae001a] focus:outline-none transition-colors font-poppins"
                  required
                />
                <p className="text-[10px] text-[#5f5e5e] mt-1">Presentation index.</p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins mb-1.5">
                  <span className="material-symbols-outlined text-base text-zinc-600">verified</span>
                  Logical Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'active' | 'deleted')}
                  className="w-full px-3.5 py-2.5 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs font-semibold text-[#1d1c17] focus:border-[#ae001a] focus:outline-none transition-colors font-poppins cursor-pointer"
                >
                  <option value="active">ACTIVE</option>
                  <option value="deleted">DELETED (Archived)</option>
                </select>
                <p className="text-[10px] text-[#5f5e5e] mt-1">Catalog lifecycle.</p>
              </div>
            </div>
          </div>
        </form>

        {/* Drawer Fixed Footer */}
        <div className="bg-white px-6 py-4 border-t border-[#e8e2d8] flex items-center justify-between shrink-0 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-lg border border-[#e8e2d8] text-xs font-bold uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer font-poppins"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !selectedMenuId ||
              !selectedProductId ||
              Boolean(duplicateConflict && duplicateConflict.status === 'active' && status === 'active')
            }
            className="px-6 py-2.5 rounded-lg bg-[#ae001a] hover:bg-[#d2272f] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2 shadow-xs shrink-0 disabled:opacity-50 font-poppins"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">
                  {mode === 'create' ? 'add' : 'save'}
                </span>
                <span>{mode === 'create' ? 'Bind Menu Item' : 'Save Changes'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
