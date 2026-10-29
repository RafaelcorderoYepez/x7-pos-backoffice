import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type {
  CreateQRMenuSectionDto,
  QRMenu,
  QRMenuSection,
  QRMenuSectionStatus,
  UpdateQRMenuSectionDto,
} from '../../../../types/qr-menu';
import {
  QR_MENU_SECTION_STATUSES,
  QR_MENU_SECTION_STATUS_CONFIG,
} from '../../../../types/qr-menu';
import {
  createQRMenuSection,
  updateQRMenuSection,
  validateSectionConstraints,
} from '../../../../api/qr-menu-sections';
import { CascadeVerificationModal } from './CascadeVerificationModal';

export type SectionDrawerMode = 'create' | 'edit';

interface QRMenuSectionDrawerProps {
  isOpen: boolean;
  mode: SectionDrawerMode;
  section: QRMenuSection | null;
  menus: QRMenu[];
  initialMenuId?: number;
  onClose: () => void;
  onSuccess: (saved: QRMenuSection) => void;
}

export const QRMenuSectionDrawer: React.FC<QRMenuSectionDrawerProps> = ({
  isOpen,
  mode,
  section,
  menus,
  initialMenuId,
  onClose,
  onSuccess,
}) => {
  const [selectedMenuId, setSelectedMenuId] = useState<number>(0);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [status, setStatus] = useState<QRMenuSectionStatus>('active');
  const [displayOrder, setDisplayOrder] = useState<number>(1);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Cascade Protection State (when inactivating a section with child items)
  const [showCascadeModal, setShowCascadeModal] = useState<boolean>(false);

  // Reset or populate fields when opening drawer
  useEffect(() => {
    if (!isOpen) {
      setFormError(null);
      setFieldErrors({});
      setShowCascadeModal(false);
      return;
    }

    if (mode === 'edit' && section) {
      setSelectedMenuId(section.qr_menu_id);
      setName(section.name);
      setDescription(section.description || '');
      setStatus((section.status as QRMenuSectionStatus) || 'active');
      setDisplayOrder(section.display_order || 1);
    } else {
      // Create mode
      const defaultMenuId =
        initialMenuId || (menus.length > 0 ? menus[0].id : 0);
      setSelectedMenuId(defaultMenuId);
      setName('');
      setDescription('');
      setStatus('active');

      // Calculate next display order for this menu
      const currentMenu = menus.find((m) => m.id === defaultMenuId);
      const existingSections = currentMenu?.sections || [];
      const nextOrder =
        existingSections.reduce(
          (max, s) => (s.display_order > max ? s.display_order : max),
          0
        ) + 1;
      setDisplayOrder(nextOrder || 1);
    }
  }, [isOpen, mode, section, menus, initialMenuId]);

  // Recalculate default display order when switching selected menu in Create mode
  const handleMenuChange = (newMenuId: number) => {
    setSelectedMenuId(newMenuId);
    if (mode === 'create') {
      const currentMenu = menus.find((m) => m.id === newMenuId);
      const existingSections = currentMenu?.sections || [];
      const nextOrder =
        existingSections.reduce(
          (max, s) => (s.display_order > max ? s.display_order : max),
          0
        ) + 1;
      setDisplayOrder(nextOrder || 1);
    }
  };

  const selectedMenu = useMemo(() => {
    return menus.find((m) => m.id === selectedMenuId);
  }, [menus, selectedMenuId]);

  // Real-time character counts & constraints
  const nameCharCount = name.length;
  const isNameOverLimit = nameCharCount > 100;

  const executeSave = async () => {
    setShowCascadeModal(false);
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const dto: CreateQRMenuSectionDto = {
          qr_menu_id: selectedMenuId,
          name: name.trim(),
          description: description.trim(),
          status,
          display_order: displayOrder,
        };
        const created = await createQRMenuSection(dto);
        onSuccess(created);
        onClose();
      } else if (mode === 'edit' && section) {
        const dto: UpdateQRMenuSectionDto = {
          qr_menu_id: selectedMenuId,
          name: name.trim(),
          description: description.trim(),
          status,
          display_order: displayOrder,
        };
        const updated = await updateQRMenuSection(section.id, dto);
        onSuccess(updated);
        onClose();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save QR menu section.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    // Validate using domain validator (validates qr_menu_id, name, description, display_order, status)
    const validation = validateSectionConstraints(
      {
        name,
        description,
        status,
        qr_menu_id: selectedMenuId,
        display_order: displayOrder,
      },
      menus
    );

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setFormError(Object.values(validation.errors)[0]);
      return;
    }

    // Cascade Protection Check:
    // If editing a section, changing from 'active' to 'inactive' or 'archived',
    // and there are attached child items, prompt verification first.
    const attachedItems = section?.items || [];
    const hasChildItems =
      (section?.items_count ?? 0) > 0 || attachedItems.length > 0;
    const isInactivating =
      mode === 'edit' &&
      section?.status === 'active' &&
      status !== 'active' &&
      hasChildItems;

    if (isInactivating) {
      setShowCascadeModal(true);
      return;
    }

    await executeSave();
  };

  if (!isOpen) return null;

  const currentStatusConfig =
    QR_MENU_SECTION_STATUS_CONFIG[status] ||
    QR_MENU_SECTION_STATUS_CONFIG.active;

  const content = (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-drawer-title"
        className="fixed inset-0 z-[9999] overflow-hidden flex justify-end font-poppins"
      >
        {/* Backdrop */}
        <div
          onClick={onClose}
          className="fixed inset-0 bg-[#1d1c17]/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        />

        {/* Drawer Container */}
        <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300 border-l border-[#e8e2d8] z-10 font-poppins">
          {/* Header */}
            <div className="p-6 border-b border-[#e8e2d8] flex items-center justify-between bg-[#fef9f1]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ae001a] text-white flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-xl">
                    {mode === 'create' ? 'post_add' : 'edit_document'}
                  </span>
                </div>
                <div>
                  <h2
                    id="section-drawer-title"
                    className="text-base font-black text-[#1d1c17] tracking-tight font-poppins"
                  >
                    {mode === 'create'
                      ? 'Create Menu Section'
                      : `Edit Section #QR-SEC-${section?.id}`}
                  </h2>
                  <p className="text-xs text-[#5f5e5e] font-medium">
                    {mode === 'create'
                      ? 'Bind category to parent QR menu with display sequencing.'
                      : 'Update section metadata, display ordering, and visibility.'}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                data-testid="close-section-drawer-btn"
                className="w-8 h-8 rounded-lg border border-[#e8e2d8] hover:border-[#ae001a] hover:text-[#ae001a] text-[#5f5e5e] flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Form Content */}
            <form
              id="qr-menu-section-form"
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto p-6 space-y-5"
            >
              {formError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in"
                >
                  <span className="material-symbols-outlined text-base shrink-0">
                    error
                  </span>
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Parent QR Menu Binding (Relational Integrity) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="section-parent-menu"
                    className="text-xs font-extrabold text-[#1d1c17] uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <span>Parent QR Menu</span>
                    <span className="text-[#ae001a]">*</span>
                  </label>
                  <span className="text-[10px] font-bold text-[#5f5e5e] bg-slate-100 px-2 py-0.5 rounded">
                    Non-Nullable Binding
                  </span>
                </div>

                <select
                  id="section-parent-menu"
                  data-testid="section-parent-menu-select"
                  value={selectedMenuId}
                  onChange={(e) => handleMenuChange(Number(e.target.value))}
                  className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-xs font-bold text-[#1d1c17] focus:outline-none focus:ring-1 focus:ring-[#ae001a] ${
                    fieldErrors.qr_menu_id
                      ? 'border-rose-400 focus:border-rose-500'
                      : 'border-[#e8e2d8] focus:border-[#ae001a]'
                  }`}
                >
                  <option value={0} disabled>
                    -- Select Parent QR Menu --
                  </option>
                  {menus.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      #QR-MNU-{menu.id} — {menu.name} ({menu.qr_type})
                    </option>
                  ))}
                </select>

                {fieldErrors.qr_menu_id && (
                  <p className="text-[11px] font-bold text-rose-600 mt-1">
                    {fieldErrors.qr_menu_id}
                  </p>
                )}

                {selectedMenu && (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-[#ae001a] bg-[#ae001a]/10 px-2 py-0.5 rounded">
                        #QR-MNU-{selectedMenu.id}
                      </span>
                      <span className="font-bold text-[#1d1c17] truncate max-w-[200px]">
                        {selectedMenu.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-[#5f5e5e] uppercase">
                      Theme: {selectedMenu.design_theme}
                    </span>
                  </div>
                )}
              </div>

              {/* 2. Section Name & Field Length Limits (<= 100 chars) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="section-name"
                    className="text-xs font-extrabold text-[#1d1c17] uppercase tracking-wider flex items-center gap-1"
                  >
                    <span>Section Title</span>
                    <span className="text-[#ae001a]">*</span>
                  </label>
                  <span
                    data-testid="name-counter"
                    className={`text-[11px] font-mono font-bold ${
                      isNameOverLimit ? 'text-rose-600' : 'text-[#5f5e5e]'
                    }`}
                  >
                    {nameCharCount}/100 chars
                  </span>
                </div>

                <input
                  id="section-name"
                  data-testid="section-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120} // Allow typing a bit over to demonstrate limit indicator
                  placeholder="e.g., Prime Steaks, Craft Cocktails, Appetizers"
                  className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-xs font-bold text-[#1d1c17] placeholder-[#5f5e5e] focus:outline-none focus:ring-1 ${
                    isNameOverLimit || fieldErrors.name
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-400'
                      : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
                  }`}
                />

                {fieldErrors.name && (
                  <p className="text-[11px] font-bold text-rose-600">
                    {fieldErrors.name}
                  </p>
                )}
                {isNameOverLimit && !fieldErrors.name && (
                  <p className="text-[11px] font-bold text-rose-600">
                    Name exceeds the maximum length of 100 characters.
                  </p>
                )}
              </div>

              {/* 3. Section Description (Required) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="section-description"
                    className="text-xs font-extrabold text-[#1d1c17] uppercase tracking-wider flex items-center gap-1"
                  >
                    <span>Description / Subtitle</span>
                    <span className="text-[#ae001a]">*</span>
                  </label>
                  <span className="text-[10px] font-medium text-[#5f5e5e]">
                    Customer Heading Notes
                  </span>
                </div>

                <textarea
                  id="section-description"
                  data-testid="section-description-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Brief category summary or promotional notes shown to diners in mobile menus..."
                  className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-xs font-medium text-[#1d1c17] placeholder-[#5f5e5e] focus:outline-none focus:ring-1 ${
                    fieldErrors.description
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-400'
                      : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
                  }`}
                />

                {fieldErrors.description && (
                  <p className="text-[11px] font-bold text-rose-600">
                    {fieldErrors.description}
                  </p>
                )}
              </div>

              {/* 4. Display Order (Explicit Sequencing) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="section-display-order"
                    className="text-xs font-extrabold text-[#1d1c17] uppercase tracking-wider flex items-center gap-1"
                  >
                    <span>Display Ordering Sequence</span>
                    <span className="text-[#ae001a]">*</span>
                  </label>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                    #{String(displayOrder).padStart(2, '0')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="section-display-order"
                    data-testid="section-display-order-input"
                    type="number"
                    min={1}
                    step={1}
                    value={displayOrder}
                    onChange={(e) =>
                      setDisplayOrder(parseInt(e.target.value, 10) || 1)
                    }
                    className={`w-32 px-3.5 py-2.5 rounded-xl border bg-[#fef9f1] text-xs font-mono font-bold text-[#1d1c17] focus:outline-none focus:ring-1 ${
                      fieldErrors.display_order
                        ? 'border-rose-400 focus:border-rose-500'
                        : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
                    }`}
                  />
                  <p className="text-[11px] text-[#5f5e5e]">
                    Explicit sorting position within parent menu.
                  </p>
                </div>

                {fieldErrors.display_order && (
                  <p className="text-[11px] font-bold text-rose-600">
                    {fieldErrors.display_order}
                  </p>
                )}
              </div>

              {/* 5. Status Selector: Dropdown & Visual Segmented Cards */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="section-status-select"
                    className="text-xs font-extrabold text-[#1d1c17] uppercase tracking-wider flex items-center gap-1"
                  >
                    <span>Operational Status</span>
                    <span className="text-[#ae001a]">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-[#5f5e5e]">
                    max 50 chars
                  </span>
                </div>

                {/* Status Dropdown */}
                <select
                  id="section-status-select"
                  data-testid="section-status-select"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as QRMenuSectionStatus)
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#e8e2d8] bg-[#fef9f1] text-xs font-bold text-[#1d1c17] focus:outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a]"
                >
                  {QR_MENU_SECTION_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {QR_MENU_SECTION_STATUS_CONFIG[st]?.label} —{' '}
                      {QR_MENU_SECTION_STATUS_CONFIG[st]?.description}
                    </option>
                  ))}
                </select>

                {/* Segmented Status Option Cards */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {QR_MENU_SECTION_STATUSES.map((st) => {
                    const cfg = QR_MENU_SECTION_STATUS_CONFIG[st];
                    const isSelected = status === st;

                    return (
                      <button
                        key={st}
                        type="button"
                        data-testid={`status-option-${st}`}
                        onClick={() => setStatus(st)}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all duration-200 ${
                          isSelected
                            ? `${cfg.badgeClass} ring-2 ring-offset-1`
                            : 'bg-white border-[#e8e2d8] hover:bg-slate-50 text-[#5f5e5e]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold capitalize">
                            {cfg.label}
                          </span>
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: cfg.pillHex }}
                          />
                        </div>
                        <span className="text-[10px] mt-1 line-clamp-1 opacity-80">
                          {cfg.description}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {fieldErrors.status && (
                  <p className="text-[11px] font-bold text-rose-600">
                    {fieldErrors.status}
                  </p>
                )}
              </div>

              {/* 6. Real-time Live Presentation Preview */}
              <div className="pt-2">
                <label className="text-[11px] font-extrabold text-[#5f5e5e] uppercase tracking-wider block mb-2">
                  Live Card Presentation Preview
                </label>

                <div className="p-4 rounded-2xl bg-white border border-[#e8e2d8] shadow-xs space-y-2 font-poppins">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-extrabold text-[#ae001a] px-2 py-0.5 rounded-md bg-[#ae001a]/10 border border-[#ae001a]/20">
                        #QR-SEC-{section?.id || 'NEW'}
                      </span>
                      <span className="font-mono text-[10px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                        #{String(displayOrder).padStart(2, '0')}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${currentStatusConfig.badgeClass} flex items-center gap-1`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: currentStatusConfig.pillHex }}
                      />
                      <span>{currentStatusConfig.label}</span>
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-extrabold text-[#1d1c17]">
                      {name.trim() || 'Untitled Section'}
                    </h4>
                    <p className="text-xs text-[#5f5e5e] line-clamp-2 mt-0.5">
                      {description.trim() || 'No section description provided yet.'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#e8e2d8]/60 flex items-center justify-between text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                      #QR-MNU-{selectedMenuId || '—'}{' '}
                      {selectedMenu?.name || 'No Menu'}
                    </span>
                    <span className="text-[#5f5e5e] font-medium">
                      {section?.items_count ?? 0} items
                    </span>
                  </div>
                </div>
              </div>
            </form>

            {/* Footer Actions */}
            <div className="p-5 border-t border-[#e8e2d8] bg-[#fef9f1] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-[#e8e2d8] text-xs font-bold text-[#5f5e5e] hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="qr-menu-section-form"
                data-testid="submit-section-btn"
                disabled={submitting || isNameOverLimit}
                className="px-5 py-2.5 rounded-xl bg-[#ae001a] hover:bg-[#900015] disabled:opacity-50 text-white text-xs font-bold shadow-md flex items-center gap-2 transition-all active:scale-95"
              >
                {submitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">
                      check
                    </span>
                    <span>
                      {mode === 'create' ? 'Create Section' : 'Save Changes'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

      {/* Cascade Protection Verification Modal (Inactivating Section) */}
      <CascadeVerificationModal
        isOpen={showCascadeModal}
        type="inactivate"
        section={section}
        items={section?.items || []}
        targetStatus={status}
        onConfirm={executeSave}
        onCancel={() => setShowCascadeModal(false)}
      />
    </>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
