import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface OnlineMenuOption {
  id: number;
  name: string;
  isActive?: boolean;
}

export interface InventoryCategoryOption {
  id: number;
  name: string;
  isActive?: boolean;
}

export interface ExistingBindingInfo {
  id?: number;
  menuId: number;
  categoryId?: number;
  displayOrder: number;
  status?: string;
}

export interface OnlineMenuCategoryFormData {
  id?: number;
  menuId: number;
  categoryId: number;
  displayOrder: number;
  status?: 'active' | 'deleted';
}

export interface OnlineMenuCategorySetupDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: OnlineMenuCategoryFormData | null;
  menus?: OnlineMenuOption[];
  categories?: InventoryCategoryOption[];
  existingBindings?: ExistingBindingInfo[];
  suggestedDisplayOrder?: number;
  onClose: () => void;
  onSubmit: (data: OnlineMenuCategoryFormData) => Promise<void>;
}

export const OnlineMenuCategorySetupDrawer: React.FC<OnlineMenuCategorySetupDrawerProps> = ({
  isOpen,
  mode,
  initialData,
  menus = [],
  categories = [],
  existingBindings = [],
  suggestedDisplayOrder = 1,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <OnlineMenuCategorySetupDrawerContent
      key={`${mode}-${initialData?.id ?? 'new'}`}
      mode={mode}
      initialData={initialData}
      menus={menus}
      categories={categories}
      existingBindings={existingBindings}
      suggestedDisplayOrder={suggestedDisplayOrder}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
};

interface ContentProps {
  mode: 'create' | 'edit';
  initialData?: OnlineMenuCategoryFormData | null;
  menus: OnlineMenuOption[];
  categories: InventoryCategoryOption[];
  existingBindings: ExistingBindingInfo[];
  suggestedDisplayOrder: number;
  onClose: () => void;
  onSubmit: (data: OnlineMenuCategoryFormData) => Promise<void>;
}

const OnlineMenuCategorySetupDrawerContent: React.FC<ContentProps> = ({
  mode,
  initialData,
  menus,
  categories,
  existingBindings,
  suggestedDisplayOrder,
  onClose,
  onSubmit,
}) => {
  // Helper to compute next sequential display order for a given menuId
  const getNextOrderForMenu = (mId: number): number => {
    if (!mId || mId <= 0 || !existingBindings || existingBindings.length === 0) return 1;
    const itemsInMenu = existingBindings.filter(
      (b) => b.menuId === mId && b.status === 'active'
    );
    return itemsInMenu.length > 0 ? Math.max(...itemsInMenu.map((b) => b.displayOrder)) + 1 : 1;
  };

  const [menuId, setMenuId] = useState<number>(() => {
    return initialData?.menuId ?? 0;
  });

  const [categoryId, setCategoryId] = useState<number>(() => {
    if (initialData?.categoryId) return initialData.categoryId;
    return 0;
  });

  // Searchable Picker state for Inventory Category
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState<boolean>(() => {
    // Open picker by default in create mode if no category selected
    return !initialData?.categoryId;
  });

  const [displayOrder, setDisplayOrder] = useState<number>(() => {
    if (initialData?.displayOrder !== undefined) return initialData.displayOrder;
    if (initialData?.menuId) return getNextOrderForMenu(initialData.menuId);
    return suggestedDisplayOrder || 1;
  });

  const [status, setStatus] = useState<'active' | 'deleted'>(() => {
    return initialData?.status || 'active';
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter active inventory categories
  const activeCategories = useMemo(() => {
    return categories.filter((c) => c.isActive !== false);
  }, [categories]);

  // Searchable picker filter
  const filteredCategories = useMemo(() => {
    const q = categorySearchQuery.toLowerCase().trim();
    if (!q) return activeCategories;
    return activeCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        `#cat-${c.id}`.toLowerCase().includes(q) ||
        String(c.id).includes(q)
    );
  }, [activeCategories, categorySearchQuery]);

  // Check duplicate mapping guardrail: same category_id + same menu_id under active status
  const isDuplicateActive = useMemo(() => {
    if (!menuId || !categoryId) return false;
    return existingBindings.some(
      (b) =>
        b.menuId === menuId &&
        b.categoryId === categoryId &&
        (b.status === 'active' || !b.status) &&
        b.id !== initialData?.id
    );
  }, [menuId, categoryId, existingBindings, initialData?.id]);

  const handleMenuChange = (newMenuId: number) => {
    setMenuId(newMenuId);
    setFormError(null);
    if (mode === 'create') {
      setDisplayOrder(getNextOrderForMenu(newMenuId));
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  // Synchronize categoryId and menuId if initialData updates in edit mode
  useEffect(() => {
    if (initialData?.categoryId) {
      setCategoryId(initialData.categoryId);
    }
    if (initialData?.menuId) {
      setMenuId(initialData.menuId);
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!menuId || menuId <= 0) {
      setFormError('Please select a target Digital Menu.');
      return;
    }

    if (!categoryId || categoryId <= 0) {
      setFormError('Please select an active Inventory Category.');
      return;
    }

    // Integer Sequence Validation
    const parsedOrder = Number(displayOrder);
    if (
      displayOrder === undefined ||
      isNaN(parsedOrder) ||
      parsedOrder < 0 ||
      !Number.isInteger(parsedOrder)
    ) {
      setFormError('Display order must be a valid positive integer (greater than or equal to 0).');
      return;
    }

    // Duplicate Mapping Guardrail validation in frontend
    if (isDuplicateActive && status === 'active') {
      setFormError(
        'Duplicate Mapping Guardrail: This category is already bound to this digital menu under active status. Re-binding throws a 409 Conflict exception.'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        id: initialData?.id,
        menuId: Number(menuId),
        categoryId: Number(categoryId),
        displayOrder: Math.floor(parsedOrder),
        status,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving menu category mapping.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCategoryObj = categories.find((c) => c.id === categoryId);

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
        aria-labelledby="category-drawer-title"
        className="fixed top-0 right-0 bottom-0 z-10 w-full max-w-lg bg-[#fcfbfa] shadow-2xl flex flex-col border-l border-[#e8e2d8] text-left overflow-hidden animate-slide-in"
      >
        {/* Drawer Header (Standard #1c1b16 theme) */}
        <div className="bg-[#1c1b16] px-6 py-5 flex items-center justify-between shrink-0 border-b border-[#32312b]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#ae001a] flex items-center justify-center text-white shadow-xs shrink-0">
              <span className="material-symbols-outlined text-2xl select-none" style={{ color: '#ffffff' }}>
                category
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="category-drawer-title"
                  style={{ color: '#ffffff' }}
                  className="text-base font-black text-white !text-white uppercase tracking-wider leading-tight font-poppins"
                >
                  {mode === 'create' ? 'Bind Category to Menu' : 'Configure Category Binding'}
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
                  ? 'Attach an inventory category to a digital menu and set display order'
                  : 'Configure menu category binding and presentation order'}
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {formError && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-[#ae001a] text-xs flex items-start gap-2.5">
              <span className="material-symbols-outlined text-lg shrink-0 mt-0.5">error</span>
              <div>
                <p className="font-bold">Validation / Conflict Notice</p>
                <p className="mt-0.5 leading-relaxed">{formError}</p>
              </div>
            </div>
          )}

          {/* Section 1: Digital Menu Target */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-purple-600">restaurant_menu</span>
                Digital Menu Selector *
              </label>
              <span className="text-[10px] font-mono text-[#5f5e5e] bg-zinc-100 px-2 py-0.5 rounded">
                {mode === 'create' ? 'Target Menu' : 'Menu Switcher'}
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
                  value={menuId}
                  onChange={(e) => handleMenuChange(Number(e.target.value))}
                  disabled={isSubmitting || menus.length === 0}
                  className="w-full px-3.5 py-2.5 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-medium focus:border-[#ae001a] focus:outline-none transition-colors font-poppins cursor-pointer"
                  required
                >
                  <option value={0} disabled>
                    Select target digital menu...
                  </option>
                  {menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (#MNU-{m.id}) {m.isActive === false ? '— [Draft]' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Section 2: Inventory Category Selector (Searchable Picker) */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-[#ae001a]">category</span>
                Inventory Category Selector *
              </label>
              <span className="text-[10px] font-mono text-[#5f5e5e] bg-zinc-100 px-2 py-0.5 rounded">
                Searchable Picker
              </span>
            </div>

            {/* Selected Category Display or Search Input */}
            {selectedCategoryObj && !isCategoryPickerOpen ? (
              <div className="p-3 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">check</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1d1c17] truncate font-poppins">
                        {selectedCategoryObj.name}
                      </span>
                      <span className="text-[10px] font-mono bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded font-semibold">
                        #CAT-{selectedCategoryObj.id}
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-600 font-medium font-poppins flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      Active inventory category selected
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCategoryPickerOpen(true)}
                  disabled={isSubmitting}
                  className="px-2.5 py-1.5 rounded-lg border border-[#d5cfc4] bg-white hover:bg-zinc-50 text-[11px] font-bold text-[#1d1c17] font-poppins flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">swap_horiz</span>
                  <span>Change</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Search Input */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-base pointer-events-none">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search active category by name or #CAT-ID..."
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-8 py-2 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-medium focus:border-[#ae001a] focus:outline-none transition-colors font-poppins"
                    autoFocus={isCategoryPickerOpen}
                  />
                  {categorySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCategorySearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filtered Categories List */}
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[#e8e2d8] divide-y divide-[#f0ede6] bg-white shadow-2xs">
                  {filteredCategories.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#5f5e5e] font-poppins">
                      <span className="material-symbols-outlined text-2xl text-zinc-300 block mb-1">
                        search_off
                      </span>
                      <span>No active inventory categories found matching your query.</span>
                    </div>
                  ) : (
                    filteredCategories.map((c) => {
                      const isSelected = c.id === categoryId;
                      const isAlreadyBound = existingBindings.some(
                        (b) =>
                          b.menuId === menuId &&
                          b.categoryId === c.id &&
                          (b.status === 'active' || !b.status) &&
                          b.id !== initialData?.id
                      );

                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCategoryId(c.id);
                            setIsCategoryPickerOpen(false);
                            setCategorySearchQuery('');
                            setFormError(null);
                          }}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#ae001a]/5 border-l-4 border-l-[#ae001a]'
                              : 'hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`material-symbols-outlined text-base ${isSelected ? 'text-[#ae001a]' : 'text-zinc-400'}`}>
                              category
                            </span>
                            <span className="text-xs font-semibold text-[#1d1c17] truncate font-poppins">
                              {c.name}
                            </span>
                            <span className="text-[10px] font-mono text-[#8c857b] bg-zinc-100 px-1.5 py-0.2 rounded">
                              #CAT-{c.id}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isAlreadyBound && (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-poppins">
                                Bound in Menu
                              </span>
                            )}
                            {isSelected && (
                              <span className="material-symbols-outlined text-base text-[#ae001a]">
                                check_circle
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {selectedCategoryObj && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsCategoryPickerOpen(false)}
                      className="text-[11px] font-bold text-zinc-600 hover:text-zinc-900 font-poppins cursor-pointer"
                    >
                      Cancel Picker
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Duplicate Guardrail Warning Notice */}
            {isDuplicateActive && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 font-poppins flex items-start gap-2">
                <span className="material-symbols-outlined text-base text-amber-600 shrink-0 mt-0.5">
                  warning
                </span>
                <div>
                  <strong className="block font-bold">Duplicate Category Guardrail Active:</strong>
                  <span>
                    This category is already assigned to this menu as Active. Re-binding will be rejected by the server with a 409 Conflict exception.
                  </span>
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#5f5e5e] font-poppins flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-[#8c857b]">info</span>
              Only active product inventory categories are available for storefront mapping.
            </p>
          </div>

          {/* Section 3: Display Order Input (Sequence Manager) */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-blue-600">format_list_numbered</span>
                Display Order Input *
              </label>
              <span className="text-[11px] font-mono font-bold text-[#ae001a] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                #Sequence: {displayOrder}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={displayOrder}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setDisplayOrder(isNaN(val) ? 0 : Math.max(0, val));
                }}
                disabled={isSubmitting}
                className="flex-1 px-3.5 py-2 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-mono font-bold focus:border-[#ae001a] focus:outline-none transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setDisplayOrder((prev) => Math.max(0, prev - 1))}
                disabled={isSubmitting || displayOrder <= 0}
                className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border border-[#d5cfc4] rounded-lg text-zinc-700 disabled:opacity-40 transition-colors cursor-pointer"
                title="Decrease order"
              >
                <span className="material-symbols-outlined text-sm select-none">remove</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayOrder((prev) => prev + 1)}
                disabled={isSubmitting}
                className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border border-[#d5cfc4] rounded-lg text-zinc-700 disabled:opacity-40 transition-colors cursor-pointer"
                title="Increase order"
              >
                <span className="material-symbols-outlined text-sm select-none">add</span>
              </button>
            </div>

            <p className="text-[11px] text-[#5f5e5e] font-poppins">
              Enforces positive integer validation. Categories are presented on customer storefronts sorted strictly ascending by display_order (e.g. 1 &rarr; Starters, 2 &rarr; Mains, 3 &rarr; Desserts).
            </p>
          </div>

          {/* Section 4: Logical Status Selector (Dropdown selecting ACTIVE or DELETED) */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-2 font-poppins">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: status === 'active' ? '#10b981' : '#64748b' }}
                  />
                  Logical Status Selector *
                </label>
              </div>

              {/* Status Indicator Pill */}
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide uppercase shadow-2xs font-poppins"
                style={{ backgroundColor: status === 'active' ? '#10b981' : '#64748b' }}
              >
                {status === 'active' ? 'ACTIVE IN MENU' : 'DELETED / ARCHIVED'}
              </span>
            </div>

            {/* Canonical Dropdown selecting ACTIVE or DELETED */}
            <div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'deleted')}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-semibold focus:border-[#ae001a] focus:outline-none transition-colors font-poppins cursor-pointer"
              >
                <option value="active">
                  ACTIVE — Visible in Storefront & Active in Menu
                </option>
                <option value="deleted">
                  DELETED — Archived Category (Hidden from Storefront)
                </option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-[#fcfcfb] border border-[#e8e2d8] text-[11px] text-[#5f5e5e] flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5">verified</span>
              <div>
                <strong className="text-[#1d1c17]">Logical Status Enforcement: </strong>
                Setting status = 'DELETED' hides the category and its items from storefront views without purging historical menu structures.
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
            disabled={isSubmitting || !menuId || !categoryId || (isDuplicateActive && status === 'active')}
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
                  {mode === 'create' ? 'add_circle' : 'save'}
                </span>
                <span>{mode === 'create' ? 'Bind Category' : 'Save Changes'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
