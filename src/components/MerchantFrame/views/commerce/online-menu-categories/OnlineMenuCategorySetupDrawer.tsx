import React, { useState, useEffect } from 'react';
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
  existingBindings?: { menuId: number; displayOrder: number; status?: string }[];
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
  existingBindings: { menuId: number; displayOrder: number; status?: string }[];
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
    if (initialData?.menuId) return initialData.menuId;
    return 0;
  });

  const [categoryId, setCategoryId] = useState<number>(() => {
    if (initialData?.categoryId) return initialData.categoryId;
    return 0;
  });

  const [displayOrder, setDisplayOrder] = useState<number>(() => {
    if (initialData?.displayOrder !== undefined) return initialData.displayOrder;
    if (initialData?.menuId) return getNextOrderForMenu(initialData.menuId);
    return 1;
  });

  const handleMenuChange = (newMenuId: number) => {
    setMenuId(newMenuId);
    if (mode === 'create') {
      setDisplayOrder(getNextOrderForMenu(newMenuId));
    }
  };

  const [status, setStatus] = useState<'active' | 'deleted'>(() => {
    return initialData?.status || 'active';
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      setFormError('Please select an Inventory Category.');
      return;
    }

    if (displayOrder === undefined || displayOrder < 0 || isNaN(displayOrder)) {
      setFormError('Display order must be an integer greater than or equal to 0.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        id: initialData?.id,
        menuId: Number(menuId),
        categoryId: Number(categoryId),
        displayOrder: Math.floor(Number(displayOrder)),
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
  const selectedMenuObj = menus.find((m) => m.id === menuId);

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
                  : 'Configure menu category binding'}
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
                <p className="font-bold">Validation Error</p>
                <p className="mt-0.5">{formError}</p>
              </div>
            </div>
          )}

          {/* Section 1: Digital Menu Target */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-purple-600">restaurant_menu</span>
                Digital Menu Target *
              </label>
              <span className="text-[10px] font-mono text-[#5f5e5e] bg-zinc-100 px-2 py-0.5 rounded">
                {mode === 'create' ? 'Menu Assignment' : 'Menu Switcher'}
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

          {/* Section 2: Inventory Category */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-[#ae001a]">category</span>
                Inventory Category *
              </label>
              <span className="text-[10px] font-mono text-[#5f5e5e] bg-zinc-100 px-2 py-0.5 rounded">
                Catalog Binding
              </span>
            </div>

            <div>
              {categories.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-poppins flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-amber-600">warning</span>
                  <span>No inventory categories found. Make sure categories exist in Products / Inventory.</span>
                </div>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-medium focus:border-[#ae001a] focus:outline-none transition-colors font-poppins cursor-pointer"
                  required
                >
                  <option value={0} disabled>
                    Select product category to bind...
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-[#5f5e5e] mt-2 flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-sm text-[#8c857b]">storefront</span>
                Products in this category will appear in this section.
              </p>
            </div>
          </div>

          {/* Section 3: Display Order Sequence */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-1.5 font-poppins">
                <span className="material-symbols-outlined text-base text-blue-600">format_list_numbered</span>
                Display Order Sequence *
              </label>
              <span className="text-[11px] font-mono font-bold text-[#ae001a] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                #Order: {displayOrder}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Math.max(0, parseInt(e.target.value, 10) || 0))}
                disabled={isSubmitting}
                className="flex-1 px-3.5 py-2 bg-[#fcfcfb] border border-[#d5cfc4] rounded-lg text-xs text-[#1d1c17] font-mono font-bold focus:border-[#ae001a] focus:outline-none transition-colors"
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
              Categories are presented on storefront menus in strict ascending order (e.g. 1 &rarr; Starters, 2 &rarr; Mains, 3 &rarr; Desserts).
            </p>
          </div>

          {/* Section 4: Category Publication Status */}
          <div className="p-4 bg-white rounded-xl border border-[#e8e2d8] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#1d1c17] flex items-center gap-2 font-poppins">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: status === 'active' ? '#10b981' : '#64748b' }}
                  />
                  Category Publication Status
                </span>
                <p className="text-[11px] text-[#5f5e5e] mt-0.5 font-poppins">
                  Controls live section visibility on the customer-facing online ordering storefront.
                </p>
              </div>

              {/* Status Pill & Toggle Switch */}
              <div className="flex items-center gap-3">
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide uppercase shadow-2xs"
                  style={{ backgroundColor: status === 'active' ? '#10b981' : '#64748b' }}
                >
                  {status === 'active' ? 'Active' : 'Archived'}
                </span>

                <button
                  type="button"
                  role="switch"
                  aria-checked={status === 'active'}
                  onClick={() => setStatus((prev) => (prev === 'active' ? 'deleted' : 'active'))}
                  disabled={isSubmitting}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    status === 'active' ? 'bg-[#10b981]' : 'bg-[#64748b]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      status === 'active' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#fcfcfb] border border-[#e8e2d8] text-[11px] text-[#5f5e5e] flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5">verified</span>
              <div>
                <strong className="text-[#1d1c17]">Logical Lifecycle Control: </strong>
                Archiving logically hides the category without losing mapped products or sequence rankings.
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
            disabled={isSubmitting || !menuId || !categoryId}
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
