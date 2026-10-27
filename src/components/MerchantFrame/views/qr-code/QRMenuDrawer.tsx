import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type {
  CreateQRMenuDto,
  QRMenu,
  QRMenuType,
} from '../../../../types/qr-menu';
import {
  DESIGN_THEMES,
  QR_MENU_STATUSES,
  QR_MENU_STATUS_BADGES,
  QR_MENU_TYPES,
  QR_MENU_TYPE_META,
} from '../../../../types/qr-menu';
import {
  generateDuplicateMenuName,
  getThemeConfig,
  validateQRMenuPayload,
} from '../../../../lib/qr-menu';
import { createQRMenu, updateQRMenu, cloneQRMenu } from '../../../../api/qr-menus';
import { QRMenuMobilePreview } from './QRMenuMobilePreview';

export type DrawerMode = 'create' | 'edit' | 'clone';

interface QRMenuDrawerProps {
  isOpen: boolean;
  mode: DrawerMode;
  menu?: QRMenu | null;
  merchantId?: number;
  onClose: () => void;
  onSuccess: (savedMenu: QRMenu) => void;
}

export const QRMenuDrawer: React.FC<QRMenuDrawerProps> = ({
  isOpen,
  mode,
  menu,
  merchantId = 3,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<CreateQRMenuDto>({
    name: '',
    description: '',
    design_theme: 'Texas Theme',
    qr_type: 'Table',
    status: 'active',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');

  // Sync form data when drawer opens or mode/menu changes
  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setSubmitError(null);

      if (mode === 'edit' && menu) {
        setFormData({
          name: menu.name || '',
          description: menu.description || '',
          design_theme: menu.design_theme || 'Texas Theme',
          qr_type: menu.qr_type || 'Table',
          status: menu.status || 'active',
        });
      } else if (mode === 'clone' && menu) {
        setFormData({
          name: generateDuplicateMenuName(menu.name),
          description: menu.description || '',
          design_theme: menu.design_theme || 'Texas Theme',
          qr_type: menu.qr_type || 'Table',
          status: 'inactive', // New cloned variants start draft/inactive
        });
      } else {
        // Create mode defaults
        setFormData({
          name: '',
          description: '',
          design_theme: 'Texas Theme',
          qr_type: 'Table',
          status: 'active',
        });
      }
    }
  }, [isOpen, mode, menu]);

  // Keyboard navigation: Escape key closes drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentTheme = getThemeConfig(formData.design_theme);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Validate payload against required business rules
    const validation = validateQRMenuPayload(formData);
    if (!validation.isValid) {
      setFieldErrors(validation.fieldErrors);
      setSubmitError('Please correct the highlighted fields before saving.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'clone' && menu) {
        const result = await cloneQRMenu(menu.id, {
          source_menu_id: menu.id,
          name: formData.name,
          description: formData.description,
          status: formData.status,
          design_theme: formData.design_theme,
          qr_type: formData.qr_type,
          merchant_id: merchantId,
        });
        onSuccess(result.menu);
      } else if (mode === 'edit' && menu) {
        const updated = await updateQRMenu(menu.id, {
          ...formData,
          merchant: menu.merchant_id || menu.merchant?.id || merchantId,
        });
        onSuccess(updated);
      } else {
        const created = await createQRMenu(formData, merchantId);
        onSuccess(created);
      }
      onClose();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred while saving the menu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[9999] overflow-hidden flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        data-testid="qr-drawer-backdrop"
      />

      {/* Slide-out Drawer Container */}
      <div className="relative w-full max-w-5xl bg-white h-full shadow-2xl flex flex-col z-10 overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ${
                mode === 'clone'
                  ? 'bg-amber-600'
                  : mode === 'edit'
                  ? 'bg-blue-600'
                  : 'bg-emerald-600'
              }`}
            >
              <span className="material-symbols-outlined text-xl">
                {mode === 'clone' ? 'content_copy' : mode === 'edit' ? 'edit' : 'add_circle'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {mode === 'clone'
                    ? 'Clone QR Menu Pipeline'
                    : mode === 'edit'
                    ? `Edit QR Menu: ${menu?.name || ''}`
                    : 'Create New QR Menu'}
                </h2>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    mode === 'clone'
                      ? 'bg-amber-100 text-amber-800'
                      : mode === 'edit'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {mode}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {mode === 'clone'
                  ? 'Duplicate parent menu attributes and relational sections & items.'
                  : 'Configure mobile branding presentation, QR service type, and live visibility.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile View Toggle Tabs (Visible on small screens) */}
            <div className="flex xl:hidden bg-slate-200 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('form')}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === 'form' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Form Config
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Live Preview
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              data-testid="qr-drawer-close"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Cloning Info Banner */}
        {mode === 'clone' && menu && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-amber-900 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600 text-sm">hub</span>
              <span>
                Duplicating from <strong>{menu.name}</strong> •{' '}
                <strong>{menu.sections_count ?? 2} sections</strong> and{' '}
                <strong>{menu.items_count ?? 6} items</strong> will be cloned.
              </span>
            </div>
            <span className="font-semibold text-[11px] bg-amber-200/60 px-2 py-0.5 rounded text-amber-800">
              Relational Cloning
            </span>
          </div>
        )}

        {/* Drawer Body (Two-column layout on large screens) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Left Column: Form Controls */}
          <div
            className={`xl:col-span-7 space-y-6 ${
              activeTab === 'preview' ? 'hidden xl:block' : 'block'
            }`}
          >
            <form id="qr-menu-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Form Level Error Alert */}
              {submitError && (
                <div
                  role="alert"
                  className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5"
                >
                  <span className="material-symbols-outlined text-rose-500 text-base shrink-0 mt-0.5">
                    error
                  </span>
                  <div>
                    <span className="font-semibold">Validation Issue:</span> {submitError}
                  </div>
                </div>
              )}

              {/* 1. Menu Name Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="qr-menu-name" className="text-xs font-bold text-slate-700">
                    Menu Name <span className="text-rose-500">*</span>
                  </label>
                  <span
                    className={`text-[11px] ${
                      formData.name.length > 100
                        ? 'text-rose-600 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    {formData.name.length}/100
                  </span>
                </div>
                <input
                  id="qr-menu-name"
                  name="name"
                  type="text"
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, name: e.target.value }));
                    if (fieldErrors.name) {
                      setFieldErrors((prev) => ({ ...prev, name: '' }));
                    }
                  }}
                  placeholder="e.g. Summer Terrace Cocktails & Tapas"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    fieldErrors.name
                      ? 'border-rose-400 bg-rose-50/30 focus:ring-2 focus:ring-rose-200'
                      : 'border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-100'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">error</span>
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* 2. Menu Description Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="qr-menu-description" className="text-xs font-bold text-slate-700">
                    Menu Description <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Public customer overview</span>
                </div>
                <textarea
                  id="qr-menu-description"
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, description: e.target.value }));
                    if (fieldErrors.description) {
                      setFieldErrors((prev) => ({ ...prev, description: '' }));
                    }
                  }}
                  placeholder="Provide an enticing overview for guests scanning the QR code at your venue..."
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    fieldErrors.description
                      ? 'border-rose-400 bg-rose-50/30 focus:ring-2 focus:ring-rose-200'
                      : 'border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-100'
                  }`}
                />
                {fieldErrors.description && (
                  <p className="mt-1 text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">error</span>
                    {fieldErrors.description}
                  </p>
                )}
              </div>

              {/* 3. Design Theme Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="qr-menu-theme-select" className="text-xs font-bold text-slate-700">
                    Design Theme <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Selected: <strong>{currentTheme.name}</strong>
                  </span>
                </div>

                {/* Dropdown Selector */}
                <select
                  id="qr-menu-theme-select"
                  value={formData.design_theme}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, design_theme: e.target.value }));
                    if (fieldErrors.design_theme) {
                      setFieldErrors((prev) => ({ ...prev, design_theme: '' }));
                    }
                  }}
                  className={`w-full mb-3 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all ${
                    fieldErrors.design_theme
                      ? 'border-rose-400 bg-rose-50/30'
                      : 'border-slate-300 focus:border-slate-900'
                  }`}
                >
                  {DESIGN_THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name} — ({theme.category})
                    </option>
                  ))}
                </select>

                {/* Visual Theme Gallery Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50">
                  {DESIGN_THEMES.map((theme) => {
                    const isSelected = formData.design_theme.toLowerCase() === theme.id.toLowerCase();
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, design_theme: theme.id }));
                          if (fieldErrors.design_theme) {
                            setFieldErrors((prev) => ({ ...prev, design_theme: '' }));
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                          isSelected
                            ? 'border-slate-900 bg-white ring-2 ring-slate-900/10 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-400'
                        }`}
                      >
                        {/* Theme Header Swatch */}
                        <div
                          className="w-full h-7 rounded-lg mb-2 flex items-center justify-between px-2 text-white text-[10px] font-bold"
                          style={{ background: theme.headerBackground }}
                        >
                          <span>{theme.tag}</span>
                          {isSelected && (
                            <span className="material-symbols-outlined text-xs">check_circle</span>
                          )}
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-slate-900 truncate">
                            {theme.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {theme.category}
                          </div>
                        </div>

                        {/* Swatches dots */}
                        <div className="flex items-center gap-1 mt-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/10"
                            style={{ backgroundColor: theme.primaryColor }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/10"
                            style={{ backgroundColor: theme.accentColor }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/10"
                            style={{ backgroundColor: theme.backgroundColor }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.design_theme && (
                  <p className="mt-1 text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">error</span>
                    {fieldErrors.design_theme}
                  </p>
                )}
              </div>

              {/* 4. QR Type & Status (Two columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* QR Type Dropdown */}
                <div>
                  <label htmlFor="qr-menu-type" className="block text-xs font-bold text-slate-700 mb-1.5">
                    QR Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="qr-menu-type"
                    name="qr_type"
                    value={formData.qr_type}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        qr_type: e.target.value as QRMenuType,
                      }));
                      if (fieldErrors.qr_type) {
                        setFieldErrors((prev) => ({ ...prev, qr_type: '' }));
                      }
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      fieldErrors.qr_type
                        ? 'border-rose-400 bg-rose-50/30'
                        : 'border-slate-300 focus:border-slate-900'
                    }`}
                  >
                    {QR_MENU_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {QR_MENU_TYPE_META[type].label} ({type})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {QR_MENU_TYPE_META[formData.qr_type]?.description}
                  </p>
                  {fieldErrors.qr_type && (
                    <p className="mt-1 text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">error</span>
                      {fieldErrors.qr_type}
                    </p>
                  )}
                </div>

                {/* Status Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Menu Status <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {QR_MENU_STATUSES.map((statusVal) => {
                      const isSelected = formData.status === statusVal;
                      const badge = QR_MENU_STATUS_BADGES[statusVal];
                      return (
                        <button
                          key={statusVal}
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, status: statusVal }));
                            if (fieldErrors.status) {
                              setFieldErrors((prev) => ({ ...prev, status: '' }));
                            }
                          }}
                          className={`py-2 px-1.5 rounded-xl border text-center transition-all text-xs font-bold flex flex-col items-center gap-1 ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${badge.dotClass}`}
                          />
                          <span className="capitalize">{statusVal}</span>
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.status && (
                    <p className="mt-1 text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">error</span>
                      {fieldErrors.status}
                    </p>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* Right Column: Theme Live Preview Mockup */}
          <div
            className={`xl:col-span-5 flex flex-col items-center justify-center p-4 bg-slate-100/70 border border-slate-200 rounded-2xl ${
              activeTab === 'form' ? 'hidden xl:flex' : 'flex'
            }`}
          >
            <QRMenuMobilePreview
              name={formData.name}
              description={formData.description}
              design_theme={formData.design_theme}
              qr_type={formData.qr_type}
              status={formData.status}
              sectionsCount={menu?.sections_count}
              itemsCount={menu?.items_count}
            />
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {mode === 'clone'
              ? 'Creates a duplicate variant with all underlying dishes and categories.'
              : 'Changes sync immediately with customer QR access points.'}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              form="qr-menu-form"
              onClick={handleSubmit}
              disabled={isSubmitting}
              data-testid="qr-menu-save-btn"
              className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">
                    {mode === 'clone' ? 'copy_all' : 'save'}
                  </span>
                  <span>
                    {mode === 'clone'
                      ? 'Clone Menu Pipeline'
                      : mode === 'edit'
                      ? 'Save Changes'
                      : 'Create QR Menu'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
