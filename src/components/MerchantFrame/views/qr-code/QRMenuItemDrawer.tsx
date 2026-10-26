import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type {
  CreateQRMenuItemDto,
  QRMenu,
  QRMenuItem,
  QRMenuItemProductRef,
  QRMenuItemStatus,
  QRMenuSection,
  UpdateQRMenuItemDto,
} from '../../../../types/qr-menu';
import {
  QR_MENU_ITEM_STATUSES,
  QR_MENU_ITEM_STATUS_CONFIG,
} from '../../../../types/qr-menu';
import {
  createQRMenuItem,
  updateQRMenuItem,
  validateImageUrl,
  validateItemPricePrecision,
} from '../../../../api/qr-menu-items';

export type ItemDrawerMode = 'create' | 'edit';

interface QRMenuItemDrawerProps {
  isOpen: boolean;
  mode: ItemDrawerMode;
  item: QRMenuItem | null;
  sections: QRMenuSection[];
  menus: QRMenu[];
  posProducts: QRMenuItemProductRef[];
  initialSectionId?: number;
  onClose: () => void;
  onSuccess: (saved: QRMenuItem) => void;
}

const PRESET_IMAGES = [
  { label: '🍔 Burger', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80' },
  { label: '🥩 Steak', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80' },
  { label: '🐟 Salmon', url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80' },
  { label: '🍸 Cocktail', url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80' },
  { label: '🍷 Wine', url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80' },
  { label: '🍰 Dessert', url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80' },
  { label: '🍟 Fries', url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80' },
  { label: '🥪 Panini', url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80' },
];

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'];

export const QRMenuItemDrawer: React.FC<QRMenuItemDrawerProps> = ({
  isOpen,
  mode,
  item,
  sections,
  menus,
  posProducts,
  initialSectionId,
  onClose,
  onSuccess,
}) => {
  // Form State
  const [selectedSectionId, setSelectedSectionId] = useState<number>(0);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [price, setPrice] = useState<string>('0.00');
  const [displayOrder, setDisplayOrder] = useState<number>(1);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [status, setStatus] = useState<QRMenuItemStatus>('active');

  // Media Tab & Upload State
  const [mediaMode, setMediaMode] = useState<'upload' | 'url' | 'presets'>('upload');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // POS Product Search / Filter State
  const [posSearchQuery, setPosSearchQuery] = useState<string>('');
  const [syncedProduct, setSyncedProduct] = useState<QRMenuItemProductRef | null>(null);

  // Submitting & Errors State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState<boolean>(false);

  // Map sections by parent QR menu for organized optgroups
  const sectionsByMenu = useMemo(() => {
    const map = new Map<number, { menu: QRMenu; sections: QRMenuSection[] }>();
    menus.forEach((menu) => {
      map.set(menu.id, { menu, sections: [] });
    });

    sections.forEach((sec) => {
      const entry = map.get(sec.qr_menu_id);
      if (entry) {
        entry.sections.push(sec);
      } else {
        map.set(sec.qr_menu_id, {
          menu: {
            id: sec.qr_menu_id,
            merchant_id: 3,
            name: `Menu #${sec.qr_menu_id}`,
            description: '',
            status: 'active',
            design_theme: 'Texas Theme',
            qr_type: 'Table',
          },
          sections: [sec],
        });
      }
    });

    return Array.from(map.values()).filter((group) => group.sections.length > 0);
  }, [sections, menus]);

  // Filtered POS products based on search query
  const filteredPOSProducts = useMemo(() => {
    if (!posSearchQuery.trim()) return posProducts;
    const query = posSearchQuery.toLowerCase();
    return posProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.sku && p.sku.toLowerCase().includes(query)) ||
        String(p.id) === query
    );
  }, [posProducts, posSearchQuery]);

  // Reset or populate fields when opening drawer
  useEffect(() => {
    if (!isOpen) {
      setFormError(null);
      setFieldErrors({});
      setImageError(false);
      setUploadedFileName(null);
      setPosSearchQuery('');
      setSyncedProduct(null);
      return;
    }

    if (mode === 'edit' && item) {
      setSelectedSectionId(item.qr_menu_section_id);
      setSelectedProductId(item.product_id ? String(item.product_id) : '');
      setName(item.name || item.product_name || '');
      setDescription(item.description || item.notes || '');
      setImageUrl(item.image_url || '');
      setPrice(item.price !== undefined ? Number(item.price).toFixed(2) : '0.00');
      setDisplayOrder(item.display_order || 1);
      setIsAvailable(item.is_available ?? (item.is_visible !== false));
      setStatus((item.status as QRMenuItemStatus) || 'active');

      if (item.product_id) {
        const found = posProducts.find((p) => p.id === item.product_id) || null;
        setSyncedProduct(found);
      } else {
        setSyncedProduct(null);
      }
    } else {
      // Create mode
      const defaultSectionId =
        initialSectionId || (sections.length > 0 ? sections[0].id : 0);
      setSelectedSectionId(defaultSectionId);
      setSelectedProductId('');
      setName('');
      setDescription('');
      setImageUrl('');
      setPrice('0.00');
      setIsAvailable(true);
      setStatus('active');
      setDisplayOrder(1);
      setSyncedProduct(null);
    }
  }, [isOpen, mode, item, sections, initialSectionId, posProducts]);

  // POS Catalog Sync Pipeline: auto-populates name, description, and price from POS product
  const syncWithPOSProduct = (product: QRMenuItemProductRef) => {
    setSelectedProductId(String(product.id));
    setSyncedProduct(product);

    // Auto-populate name from POS
    setName(product.name);

    // Auto-populate price from POS basePrice or price
    const baseP = Number(product.basePrice ?? product.price ?? 0);
    if (!isNaN(baseP)) {
      setPrice(baseP.toFixed(2));
    }

    // Auto-populate description if present in POS product
    if (product.description && product.description.trim().length > 0) {
      setDescription(product.description.trim());
    }

    // Clear any previous field errors on these fields
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.name;
      delete next.price;
      delete next.description;
      return next;
    });
  };

  const handleProductSelectChange = (productIdStr: string) => {
    setSelectedProductId(productIdStr);
    if (!productIdStr) {
      setSyncedProduct(null);
      return;
    }
    const found = posProducts.find((p) => p.id === Number(productIdStr));
    if (found) {
      syncWithPOSProduct(found);
    }
  };

  const handleUnlinkPOSProduct = () => {
    setSelectedProductId('');
    setSyncedProduct(null);
  };

  // Media File Handling (File Uploader / Dropzone)
  const processUploadedFile = (file: File) => {
    setImageError(false);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.image_url;
      return next;
    });

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFieldErrors((prev) => ({
        ...prev,
        image_url: 'Unsupported image format. Allowed formats: PNG, JPG, WebP, AVIF, GIF, SVG.',
      }));
      return;
    }

    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors((prev) => ({
        ...prev,
        image_url: 'Image file size exceeds maximum limit of 5MB.',
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageUrl(result);
      setUploadedFileName(`${file.name} (${Math.round(file.size / 1024)} KB)`);
    };
    reader.onerror = () => {
      setFieldErrors((prev) => ({
        ...prev,
        image_url: 'Failed to read uploaded image file.',
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFile(e.target.files[0]);
    }
  };

  // Live Price validation helper
  const priceValidation = useMemo<{
    valid: boolean;
    error?: string;
    normalizedPrice?: number;
  }>(() => {
    if (!price.trim()) {
      return { valid: false, error: 'Price is required.' };
    }
    return validateItemPricePrecision(price);
  }, [price]);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsedPrice = parseFloat(price.trim());
    const productIdValue = selectedProductId.trim() ? Number(selectedProductId) : null;

    // Strict Acceptance Criteria validation for required fields
    const errors: Record<string, string> = {};

    if (!selectedSectionId || selectedSectionId <= 0) {
      errors.qr_menu_section_id = 'Menu Section is required. Please select a valid section.';
    }

    if (!name.trim()) {
      errors.name = 'Dish title is required.';
    } else if (name.trim().length > 100) {
      errors.name = `Dish title must not exceed 100 characters (current: ${name.trim().length}).`;
    }

    if (!description.trim()) {
      errors.description = 'Description is required (ingredients, allergens, or culinary notes).';
    }

    if (!price.trim()) {
      errors.price = 'Selling price is required.';
    } else if (!priceValidation.valid) {
      errors.price = priceValidation.error || 'Price must adhere to precision: 12, scale: 2.';
    }

    if (!displayOrder || displayOrder < 1 || !Number.isInteger(displayOrder)) {
      errors.display_order = 'Display order is required and must be an integer >= 1.';
    }

    if (!status || !QR_MENU_ITEM_STATUSES.includes(status)) {
      errors.status = 'Status is required and must be active, inactive, or archived.';
    }

    // Media validation for image_url
    if (imageUrl && imageUrl.trim().length > 0) {
      const mediaValidation = validateImageUrl(imageUrl);
      if (!mediaValidation.valid) {
        errors.image_url = mediaValidation.error || 'Invalid image format or URL.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstErr = Object.values(errors)[0];
      setFormError(firstErr);
      return;
    }

    setSubmitting(true);
    try {
      const normalizedPrice = priceValidation.normalizedPrice ?? parsedPrice;

      if (mode === 'create') {
        const payload: CreateQRMenuItemDto = {
          qr_menu_section_id: selectedSectionId,
          product_id: productIdValue,
          name: name.trim(),
          description: description.trim(),
          image_url: imageUrl.trim(),
          price: normalizedPrice,
          display_order: displayOrder,
          is_available: isAvailable,
          status,
        };
        const created = await createQRMenuItem(payload, sections);
        onSuccess(created);
        onClose();
      } else if (mode === 'edit' && item) {
        const payload: UpdateQRMenuItemDto = {
          qr_menu_section_id: selectedSectionId,
          product_id: productIdValue,
          name: name.trim(),
          description: description.trim(),
          image_url: imageUrl.trim(),
          price: normalizedPrice,
          display_order: displayOrder,
          is_available: isAvailable,
          status,
        };
        const updated = await updateQRMenuItem(item.id, payload, sections);
        onSuccess(updated);
        onClose();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save QR menu item.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden flex justify-end font-poppins"
      aria-labelledby="qr-item-drawer-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#1d1c17]/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Slide-out Drawer Container */}
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col z-10 border-l border-[#e8e2d8] font-poppins">
        {/* Header */}
        <div className="px-6 py-5 bg-[#fef9f1] border-b border-[#e8e2d8] flex items-center justify-between shrink-0 font-poppins">
          <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ae001a] text-white flex items-center justify-center font-bold shadow-sm shadow-[#ae001a]/20">
                <span className="material-symbols-outlined text-2xl">fastfood</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    id="qr-item-drawer-title"
                    className="text-lg font-bold text-[#1d1c17] font-poppins"
                  >
                    {mode === 'create' ? 'Create QR Menu Item' : 'Edit QR Menu Item'}
                  </h2>
                  {item && (
                    <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-[#fef9f1] border border-[#e8e2d8] text-[#ae001a]">
                      #QR-ITM-{item.id}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5f5e5e] font-poppins">
                  {mode === 'create'
                    ? 'Publish a rich dish profile, link POS products, upload images, and control availability.'
                    : 'Modify dish details, adjust prices, synchronize with POS catalog, or toggle availability.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-[#5f5e5e] hover:text-[#ae001a] hover:bg-[#ae001a]/10 transition-colors"
              aria-label="Close drawer"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 font-poppins">
            {/* Global Error Banner */}
            {formError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-[#ae001a] text-sm flex items-start gap-3">
                <span className="material-symbols-outlined text-[#ae001a] text-xl shrink-0 mt-0.5">
                  error
                </span>
                <div className="flex-1">
                  <span className="font-semibold block">Configuration Error</span>
                  {formError}
                </div>
              </div>
            )}

            {/* Section Category Selector */}
            <div>
              <label
                htmlFor="item-section-selector"
                className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17] mb-1.5"
              >
                Target Menu Section <span className="text-[#ae001a]">*</span>
              </label>
              <select
                id="item-section-selector"
                value={selectedSectionId}
                onChange={(e) => {
                  setSelectedSectionId(Number(e.target.value));
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.qr_menu_section_id;
                    return next;
                  });
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-[#1d1c17] text-sm font-medium focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden transition-all ${
                  fieldErrors.qr_menu_section_id
                    ? 'border-red-500 focus:ring-red-400'
                    : 'border-[#e8e2d8]'
                }`}
                required
              >
                <option value={0} disabled>
                  -- Select target menu section --
                </option>
                {sectionsByMenu.map(({ menu, sections: groupSections }) => (
                  <optgroup key={menu.id} label={`📖 ${menu.name} (${menu.qr_type})`}>
                    {groupSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name} (#{sec.display_order})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {fieldErrors.qr_menu_section_id && (
                <p className="mt-1 text-xs text-[#ae001a]">{fieldErrors.qr_menu_section_id}</p>
              )}
              <p className="mt-1 text-xs text-[#5f5e5e]">
                Organizes this item under its parent menu section in the customer digital QR view.
              </p>
            </div>

            {/* POS Catalog Sync Pipeline (Searchable Picker & Auto-Fill) */}
            <div className="p-4 rounded-xl bg-[#fef9f1] border border-[#e8e2d8] space-y-3">
              <div className="flex items-center justify-between">
                <span className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17]">
                  POS Product Catalog Sync (Optional Mapping)
                </span>
                {syncedProduct && (
                  <button
                    type="button"
                    onClick={handleUnlinkPOSProduct}
                    className="text-xs text-[#ae001a] hover:underline font-semibold"
                  >
                    Unlink POS
                  </button>
                )}
              </div>

              {/* Quick Search inside POS products */}
              <div className="relative">
                <label htmlFor="pos-product-search" className="sr-only">
                  Search POS catalog
                </label>
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-sm">
                  search
                </span>
                <input
                  id="pos-product-search"
                  type="text"
                  value={posSearchQuery}
                  onChange={(e) => setPosSearchQuery(e.target.value)}
                  placeholder="Search POS catalog by dish name or SKU..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#e8e2d8] bg-white text-xs text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden"
                />
              </div>

              {/* Searchable Picker Dropdown */}
              <div>
                <label htmlFor="item-pos-product-selector" className="sr-only">
                  POS Product Catalog Selector
                </label>
                <select
                  id="item-pos-product-selector"
                  aria-label="POS Product Catalog Selector"
                  value={selectedProductId}
                  onChange={(e) => handleProductSelectChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#e8e2d8] bg-white text-[#1d1c17] text-sm font-medium focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden"
                >
                  <option value="">Standalone QR Item (No Core POS Link)</option>
                  {filteredPOSProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku ? `[${p.sku}]` : ''} - ${(Number(p.basePrice ?? p.price ?? 0)).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sync Pipeline Feedback Banner */}
              {syncedProduct ? (
                <div className="p-3 rounded-lg bg-white border border-[#e8e2d8] flex items-center justify-between text-xs text-[#1d1c17]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#ae001a] text-base">
                      sync
                    </span>
                    <span>
                      <strong>Catalog Synced:</strong> {syncedProduct.name}
                      {syncedProduct.sku ? ` (${syncedProduct.sku})` : ''} — Base: ${(Number(syncedProduct.basePrice ?? syncedProduct.price ?? 0)).toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => syncWithPOSProduct(syncedProduct)}
                    className="font-bold underline text-[#ae001a] hover:text-[#8e0015]"
                    title="Pull latest name, description, and price from POS"
                  >
                    Re-pull
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[#5f5e5e]">
                  Selecting a POS product automatically pulls dish title, description, and base selling price.
                </p>
              )}
            </div>

            {/* Dish / Item Name */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label
                  htmlFor="item-name-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17]"
                >
                  Dish Name (Dish Title) <span className="text-[#ae001a]">*</span>
                </label>
                <span
                  className={`text-xs ${
                    name.length > 90 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'
                  }`}
                >
                  {name.length}/100
                </span>
              </div>
              <input
                id="item-name-input"
                type="text"
                maxLength={100}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.name;
                    return next;
                  });
                }}
                placeholder="e.g. Truffle Smash Burger"
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-[#1d1c17] text-sm font-medium focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden transition-all ${
                  fieldErrors.name
                    ? 'border-red-500 focus:ring-red-400'
                    : 'border-[#e8e2d8]'
                }`}
                required
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-[#ae001a]">{fieldErrors.name}</p>
              )}
            </div>

            {/* Description & Preparation Notes (Required) */}
            <div>
              <label
                htmlFor="item-description-input"
                className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17] mb-1.5"
              >
                Description, Ingredients &amp; Allergens <span className="text-[#ae001a]">*</span>
              </label>
              <textarea
                id="item-description-input"
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.description;
                    return next;
                  });
                }}
                placeholder="Detailed ingredients, culinary preparation style, allergens, and flavor notes..."
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-[#1d1c17] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden resize-none transition-all ${
                  fieldErrors.description
                    ? 'border-red-500 focus:ring-red-400'
                    : 'border-[#e8e2d8]'
                }`}
                required
              />
              {fieldErrors.description && (
                <p className="mt-1 text-xs text-[#ae001a]">{fieldErrors.description}</p>
              )}
            </div>

            {/* Media Asset Manager (Image URL / File Uploader Dropzone / Presets) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17]">
                  Presentation Image Asset
                </label>
                {/* Media Mode Tabs */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#fef9f1] border border-[#e8e2d8] text-xs">
                  <button
                    type="button"
                    onClick={() => setMediaMode('upload')}
                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                      mediaMode === 'upload'
                        ? 'bg-[#ae001a] text-white shadow-xs'
                        : 'text-[#5f5e5e] hover:text-[#1d1c17]'
                    }`}
                  >
                    File Dropzone
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaMode('url')}
                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                      mediaMode === 'url'
                        ? 'bg-[#ae001a] text-white shadow-xs'
                        : 'text-[#5f5e5e] hover:text-[#1d1c17]'
                    }`}
                  >
                    Direct URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaMode('presets')}
                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                      mediaMode === 'presets'
                        ? 'bg-[#ae001a] text-white shadow-xs'
                        : 'text-[#5f5e5e] hover:text-[#1d1c17]'
                    }`}
                  >
                    Presets
                  </button>
                </div>
              </div>

              {/* Mode 1: File Uploader / Dropzone */}
              {mediaMode === 'upload' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-[#ae001a] bg-[#ae001a]/10'
                      : 'border-[#e8e2d8] hover:border-[#ae001a] bg-[#fef9f1]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/avif,image/gif,image/svg+xml"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <span className="material-symbols-outlined text-3xl text-[#ae001a] mb-2">
                    cloud_upload
                  </span>
                  <p className="text-sm font-semibold text-[#1d1c17]">
                    Click to browse or drag and drop image here
                  </p>
                  <p className="text-xs text-[#5f5e5e] mt-1">
                    Supports PNG, JPG, WebP, AVIF, GIF, SVG (up to 5MB)
                  </p>
                  {uploadedFileName && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#e8e2d8] text-[#1d1c17] text-xs font-medium">
                      <span className="material-symbols-outlined text-sm text-[#ae001a]">image</span>
                      {uploadedFileName}
                    </div>
                  )}
                </div>
              )}

              {/* Mode 2: Direct URL Input */}
              {mediaMode === 'url' && (
                <div>
                  <input
                    id="item-image-url-input"
                    type="url"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setImageError(false);
                      setUploadedFileName(null);
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.image_url;
                        return next;
                      });
                    }}
                    placeholder="https://images.unsplash.com/... or https://example.com/dish.webp"
                    className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-[#1d1c17] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden ${
                      fieldErrors.image_url ? 'border-red-500' : 'border-[#e8e2d8]'
                    }`}
                  />
                </div>
              )}

              {/* Mode 3: Presets */}
              {mediaMode === 'presets' && (
                <div className="p-3 rounded-xl bg-[#fef9f1] border border-[#e8e2d8]">
                  <span className="text-xs text-[#5f5e5e] block mb-2 font-medium">
                    Select a curated high-resolution culinary preset:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_IMAGES.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setImageUrl(preset.url);
                          setImageError(false);
                          setUploadedFileName(preset.label);
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.image_url;
                            return next;
                          });
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white hover:border-[#ae001a] hover:text-[#ae001a] text-[#1d1c17] border border-[#e8e2d8] transition-colors shadow-2xs"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Media Error message */}
              {fieldErrors.image_url && (
                <p className="text-xs text-[#ae001a] flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  {fieldErrors.image_url}
                </p>
              )}

              {/* Image Preview Box with Clear Action */}
              {imageUrl && !imageError && (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-[#e8e2d8] bg-[#fef9f1]">
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-[#e8e2d8] bg-white shrink-0">
                    <img
                      src={imageUrl}
                      alt={name || 'Dish preview'}
                      className="w-full h-full object-cover"
                      onError={() => setImageError(true)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-[#1d1c17] block truncate">
                      Image Loaded Successfully
                    </span>
                    <span className="text-[11px] text-[#5f5e5e] block truncate">
                      {uploadedFileName || imageUrl}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl('');
                      setUploadedFileName(null);
                    }}
                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] rounded-lg hover:bg-white"
                    title="Remove Image"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
              )}
            </div>

            {/* Base Selling Price (Financial Precision: 12, scale: 2) & Display Order */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="item-price-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17] mb-1.5"
                >
                  Selling Price <span className="text-[#ae001a]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5f5e5e] font-bold font-mono">
                    $
                  </span>
                  <input
                    id="item-price-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.price;
                        return next;
                      });
                    }}
                    className={`w-full pl-8 pr-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-[#1d1c17] font-mono font-bold text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden transition-all ${
                      fieldErrors.price || !priceValidation.valid
                        ? 'border-red-500 focus:ring-red-400'
                        : 'border-[#e8e2d8]'
                    }`}
                    required
                  />
                </div>
                {fieldErrors.price ? (
                  <p className="mt-1 text-xs text-[#ae001a]">{fieldErrors.price}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-[#5f5e5e] font-mono">
                    Precision: 12 digits, Scale: 2 decimals.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="item-display-order-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17] mb-1.5"
                >
                  Display Order <span className="text-[#ae001a]">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="item-display-order-input"
                    type="number"
                    min="1"
                    step="1"
                    value={displayOrder}
                    onChange={(e) => {
                      setDisplayOrder(parseInt(e.target.value, 10) || 1);
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.display_order;
                        return next;
                      });
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-[#1d1c17] font-mono text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] focus:outline-hidden ${
                      fieldErrors.display_order
                        ? 'border-red-500'
                        : 'border-[#e8e2d8]'
                    }`}
                    required
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setDisplayOrder((v) => v + 1)}
                      className="px-2 py-1 rounded-md bg-[#fef9f1] border border-[#e8e2d8] hover:border-[#ae001a] text-[#1d1c17] text-xs"
                      title="Increment order"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayOrder((v) => Math.max(1, v - 1))}
                      className="px-2 py-1 rounded-md bg-[#fef9f1] border border-[#e8e2d8] hover:border-[#ae001a] text-[#1d1c17] text-xs"
                      title="Decrement order"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                {fieldErrors.display_order ? (
                  <p className="mt-1 text-xs text-[#ae001a]">{fieldErrors.display_order}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-[#5f5e5e]">
                    Sorting sequence within section.
                  </p>
                )}
              </div>
            </div>

            {/* Real-time Kitchen Availability Toggle (86'd / In Stock) */}
            <div className="p-4 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#1d1c17]">
                    Kitchen Availability
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                      isAvailable
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-red-50 text-[#ae001a] border-[#ae001a]/30'
                    }`}
                  >
                    {isAvailable ? 'Available' : "86'd / Out of Stock"}
                  </span>
                </div>
                <p className="text-xs text-[#5f5e5e] mt-1">
                  Controls whether this item is currently available for ordering in the digital QR view.
                </p>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isAvailable}
                onClick={() => setIsAvailable(!isAvailable)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  isAvailable ? 'bg-emerald-600' : 'bg-[#ae001a]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    isAvailable ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Overall Record Status (Active, Inactive, Archived) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1d1c17] mb-2">
                Menu Item Status <span className="text-[#ae001a]">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {QR_MENU_ITEM_STATUSES.map((s) => {
                  const config = QR_MENU_ITEM_STATUS_CONFIG[s];
                  const isSelected = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? `border-[#ae001a] ring-2 ring-[#ae001a]/30 bg-white shadow-xs`
                          : 'border-[#e8e2d8] bg-white text-[#5f5e5e] hover:border-[#ae001a]/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
                        <span className="text-xs font-bold text-[#1d1c17]">{config.label}</span>
                      </div>
                      <span className="text-[11px] text-[#5f5e5e] block line-clamp-1">
                        {config.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              {fieldErrors.status && (
                <p className="mt-1 text-xs text-[#ae001a]">{fieldErrors.status}</p>
              )}
            </div>
          </form>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-[#fef9f1] border-t border-[#e8e2d8] flex items-center justify-end gap-3 shrink-0 font-poppins">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-[#e8e2d8] bg-white text-[#1d1c17] hover:bg-slate-50 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#8e0015] text-white text-sm font-bold shadow-md shadow-[#ae001a]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              {submitting && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {mode === 'create' ? 'Create QR Menu Item' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
