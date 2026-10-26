import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  BulkCreateQRLocationsDto,
  CreateQRLocationDto,
  QRLocation,
  QRLocationStatus,
  QRMenuRef,
  QRMenuType,
  TableRef,
  UpdateQRLocationDto,
} from '../../../../types/qr-location';
import {
  QR_LOCATION_STATUSES,
  QR_LOCATION_TYPE_LABELS,
  QR_LOCATION_TYPES,
  QR_STATUS_BADGE_STYLES,
} from '../../../../types/qr-location';
import {
  buildQrTargetUrl,
  generateLocHash,
  generateQrAssetImage,
  renderQrCodeToCanvas,
  validateQRLocationPayload,
  validateTableMerchantContext,
  validateUniqueLocationName,
  validateDuplicateActiveTableDeployment,
  syncLocationTypeWithTable,
} from '../../../../lib/qr-location';
import { createQRLocation, updateQRLocation, bulkCreateQRLocations } from '../../../../api/qr-locations';

export interface QRLocationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  merchantId: number;
  editingLocation: QRLocation | null;
  locations: QRLocation[];
  menus: QRMenuRef[];
  tables: TableRef[];
  onSaved: (result: QRLocation | QRLocation[]) => void;
}

export const QRLocationDrawer: React.FC<QRLocationDrawerProps> = ({
  isOpen,
  onClose,
  merchantId,
  editingLocation,
  locations,
  menus,
  tables,
  onSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Canvas ref for real-time QR bitmap / data URI rendering
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [liveQrDataUrl, setLiveQrDataUrl] = useState<string>('');

  // Filter menus and tables strictly by active tenant (merchantId)
  const tenantMenus = useMemo(() => {
    return menus.filter((m) => !m.merchant_id || Number(m.merchant_id) === Number(merchantId));
  }, [menus, merchantId]);

  const tenantTables = useMemo(() => {
    return tables.filter((t) => !t.merchant_id || Number(t.merchant_id) === Number(merchantId));
  }, [tables, merchantId]);

  // Search filter for tables picker
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');

  // Single Deployment Form State
  const [formData, setFormData] = useState<{
    name: string;
    qr_menu_id: number;
    table_id: number | null;
    location_type: QRMenuType;
    status: QRLocationStatus;
  }>({
    name: '',
    qr_menu_id: 0,
    table_id: null,
    location_type: 'DINE_IN',
    status: 'active',
  });

  // Bulk Provisioning Wizard State ("Generate from Floor Plan Tables")
  const [bulkZoneFilter, setBulkZoneFilter] = useState<string>('ALL');
  const [bulkMenuId, setBulkMenuId] = useState<number>(0);
  const [bulkSelectedTableIds, setBulkSelectedTableIds] = useState<Set<number>>(new Set());
  const [bulkNamePrefix, setBulkNamePrefix] = useState<string>('Mesa');
  const [bulkStatus, setBulkStatus] = useState<QRLocationStatus>('active');

  // Extract unique zones from tenant tables
  const availableZones = useMemo(() => {
    const set = new Set<string>();
    tenantTables.forEach((t) => {
      if (t.zone_name) set.add(t.zone_name);
    });
    return Array.from(set);
  }, [tenantTables]);

  // Initialize or reset form when drawer opens or editing target changes
  useEffect(() => {
    if (!isOpen) return;

    const defaultMenuId = tenantMenus.length > 0 ? tenantMenus[0].id : 0;

    if (editingLocation) {
      setActiveTab('single');
      setFormData({
        name: editingLocation.name,
        qr_menu_id: editingLocation.qr_menu_id,
        table_id: editingLocation.table_id || null,
        location_type: editingLocation.location_type,
        status: editingLocation.status,
      });
    } else {
      setActiveTab('single');
      const defaultTable = tenantTables.find(
        (t) => !locations.some((l) => l.status === 'active' && l.qr_menu_id === defaultMenuId && l.table_id === t.id)
      ) || (tenantTables.length > 0 ? tenantTables[0] : null);

      setFormData({
        name: '',
        qr_menu_id: defaultMenuId,
        table_id: defaultTable ? defaultTable.id : null,
        location_type: 'DINE_IN',
        status: 'active',
      });
    }

    setBulkMenuId(defaultMenuId);
    setBulkSelectedTableIds(new Set());
    setBulkZoneFilter('ALL');
    setBulkNamePrefix('Mesa');
    setBulkStatus('active');
    setFieldErrors({});
    setFormError(null);
  }, [isOpen, editingLocation, tenantMenus, tenantTables, locations]);

  // Derived Target URL Generator:
  // Target URL = base_tenant_domain + "/menu/" + qr_menu_id + "?loc=" + loc_hash + "&table=" + table_id
  const targetLocHash = useMemo(() => {
    const seed = editingLocation?.id ?? 'preview';
    return generateLocHash(formData.name || 'new-location', seed);
  }, [formData.name, editingLocation]);

  const previewUrl = useMemo(() => {
    const menuId = formData.qr_menu_id || 101;
    return buildQrTargetUrl({
      qrMenuId: menuId,
      locHash: targetLocHash,
      tableId: formData.table_id,
    });
  }, [formData.qr_menu_id, targetLocHash, formData.table_id]);

  const renderLiveQr = useCallback(() => {
    if (previewUrl) {
      try {
        let dataUrl = '';
        if (canvasRef.current && typeof canvasRef.current.getContext === 'function') {
          // Check if getContext returns a valid 2D context before calling renderQrCodeToCanvas
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            dataUrl = renderQrCodeToCanvas(
              canvasRef.current,
              previewUrl,
              formData.name || 'SCAN FOR MENU'
            );
          }
        }
        if (!dataUrl) {
          dataUrl = generateQrAssetImage(previewUrl, formData.name || 'SCAN FOR MENU');
        }
        setLiveQrDataUrl(dataUrl);
      } catch {
        const fallback = generateQrAssetImage(previewUrl, formData.name || 'SCAN FOR MENU');
        setLiveQrDataUrl(fallback);
      }
    }
  }, [previewUrl, formData.name]);

  useEffect(() => {
    if (isOpen && activeTab === 'single') {
      renderLiveQr();
    }
  }, [isOpen, activeTab, renderLiveQr]);

  // Filtered tables for single selector
  const filteredSingleTables = useMemo(() => {
    if (!tableSearchQuery.trim()) return tenantTables;
    const q = tableSearchQuery.toLowerCase();
    return tenantTables.filter(
      (t) =>
        t.number.toLowerCase().includes(q) ||
        (t.zone_name && t.zone_name.toLowerCase().includes(q))
    );
  }, [tenantTables, tableSearchQuery]);

  // Filtered tables for bulk generator
  const bulkAvailableTables = useMemo(() => {
    if (bulkZoneFilter === 'ALL') return tenantTables;
    return tenantTables.filter((t) => t.zone_name === bulkZoneFilter);
  }, [tenantTables, bulkZoneFilter]);

  // Location Name Change with real-time uniqueness validation
  const handleNameChange = (val: string) => {
    const truncated = val.slice(0, 100);
    setFormData((prev) => ({ ...prev, name: truncated }));

    const uniqueCheck = validateUniqueLocationName(
      truncated,
      merchantId,
      locations,
      editingLocation?.id
    );

    if (!uniqueCheck.valid) {
      setFieldErrors((prev) => ({ ...prev, name: uniqueCheck.error! }));
    } else {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy.name;
        return copy;
      });
    }
  };

  // Location Type Change Handler:
  // When switching away from DINE_IN, clear table_id.
  // When switching to DINE_IN, re-populate table_id if available.
  const handleLocationTypeChange = (newType: QRMenuType) => {
    setFormData((prev) => {
      const isDineIn = newType === 'DINE_IN';
      const updatedTable = isDineIn ? (prev.table_id || (tenantTables.length > 0 ? tenantTables[0].id : null)) : null;
      return {
        ...prev,
        location_type: newType,
        table_id: updatedTable,
      };
    });

    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.table_id;
      return copy;
    });
  };

  // Physical Table Picker Change Handler
  const handleTableChange = (rawId: string) => {
    const tableIdNum = rawId === '' ? null : parseInt(rawId, 10);
    const updatedType = syncLocationTypeWithTable(tableIdNum, formData.location_type);

    setFormData((prev) => ({
      ...prev,
      table_id: tableIdNum,
      location_type: updatedType,
    }));

    // Live validation against merchant context
    const validation = validateTableMerchantContext(tableIdNum, merchantId, tenantTables);
    if (!validation.valid) {
      setFieldErrors((prev) => ({ ...prev, table_id: validation.error || 'Invalid table selection.' }));
      return;
    }

    // Live duplication guard check
    if (tableIdNum && formData.qr_menu_id && formData.status === 'active') {
      const dupCheck = validateDuplicateActiveTableDeployment(
        { qr_menu_id: formData.qr_menu_id, table_id: tableIdNum, status: formData.status },
        locations,
        editingLocation?.id
      );
      if (!dupCheck.valid) {
        setFieldErrors((prev) => ({ ...prev, table_id: dupCheck.error! }));
        return;
      }
    }

    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.table_id;
      return copy;
    });
  };

  // QR Menu change handler
  const handleMenuChange = (rawMenuId: string) => {
    const mId = parseInt(rawMenuId, 10);
    setFormData((prev) => ({ ...prev, qr_menu_id: mId }));

    // Duplication guard re-validation
    if (formData.table_id && mId && formData.status === 'active') {
      const dupCheck = validateDuplicateActiveTableDeployment(
        { qr_menu_id: mId, table_id: formData.table_id, status: formData.status },
        locations,
        editingLocation?.id
      );
      if (!dupCheck.valid) {
        setFieldErrors((prev) => ({ ...prev, table_id: dupCheck.error! }));
        return;
      }
    }

    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.qr_menu_id;
      delete copy.table_id;
      return copy;
    });
  };

  // Status Change handler
  const handleStatusChange = (st: QRLocationStatus) => {
    setFormData((prev) => ({ ...prev, status: st }));

    // If setting to active, check duplication guard
    if (st === 'active' && formData.table_id && formData.qr_menu_id) {
      const dupCheck = validateDuplicateActiveTableDeployment(
        { qr_menu_id: formData.qr_menu_id, table_id: formData.table_id, status: st },
        locations,
        editingLocation?.id
      );
      if (!dupCheck.valid) {
        setFieldErrors((prev) => ({ ...prev, table_id: dupCheck.error! }));
        return;
      }
    }

    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.table_id;
      return copy;
    });
  };

  // Submit Single Deployment Form
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation Matrix check
    const payloadCheck = validateQRLocationPayload(
      formData,
      merchantId,
      locations,
      tenantTables,
      editingLocation?.id
    );

    if (!payloadCheck.valid) {
      setFieldErrors(payloadCheck.fieldErrors);
      setFormError(payloadCheck.error || 'Please correct the highlighted form errors.');
      return;
    }

    // Capture canvas bitmap data URI
    let finalImage = liveQrDataUrl;
    if (canvasRef.current) {
      try {
        finalImage = renderQrCodeToCanvas(
          canvasRef.current,
          previewUrl,
          formData.name
        );
      } catch {
        // Keep existing
      }
    }

    setIsSubmitting(true);
    try {
      if (editingLocation) {
        const dto: UpdateQRLocationDto = {
          name: formData.name.trim(),
          merchant_id: merchantId,
          qr_menu_id: formData.qr_menu_id,
          table_id: formData.table_id,
          location_type: formData.location_type,
          status: formData.status,
          qr_code_url: previewUrl,
          qr_code_image: finalImage || undefined,
        };
        const updated = await updateQRLocation(editingLocation.id, dto);
        onSaved(updated);
      } else {
        const dto: CreateQRLocationDto = {
          name: formData.name.trim(),
          merchant_id: merchantId,
          qr_menu_id: formData.qr_menu_id,
          table_id: formData.table_id,
          location_type: formData.location_type,
          status: formData.status,
          qr_code_url: previewUrl,
          qr_code_image: finalImage || undefined,
        };
        const created = await createQRLocation(dto);
        onSaved(created);
      }
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save QR Location deployment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Bulk Provisioning Table Selection Handlers
  const toggleBulkTable = (id: number) => {
    setBulkSelectedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllBulkTables = () => {
    if (bulkSelectedTableIds.size === bulkAvailableTables.length) {
      setBulkSelectedTableIds(new Set());
    } else {
      setBulkSelectedTableIds(new Set(bulkAvailableTables.map((t) => t.id)));
    }
  };

  // Submit Bulk Provisioning Wizard Form
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (bulkSelectedTableIds.size === 0) {
      setFormError('Please select at least one physical table for batch provisioning.');
      return;
    }

    if (!bulkMenuId || bulkMenuId <= 0) {
      setFormError('A target QR menu must be selected.');
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: BulkCreateQRLocationsDto = {
        merchant_id: merchantId,
        qr_menu_id: bulkMenuId,
        table_ids: Array.from(bulkSelectedTableIds),
        name_prefix: bulkNamePrefix.trim() || 'Mesa',
        status: bulkStatus,
      };

      const results = await bulkCreateQRLocations(dto);
      onSaved(results);
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Bulk table deployment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] font-poppins"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-drawer-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container Pinned to Right */}
      <div
        className="fixed top-0 right-0 bottom-0 z-10 w-full sm:w-[560px] md:w-[600px] max-w-full bg-white border-l border-[#e8e2d8] shadow-2xl flex flex-col h-full animate-slide-in text-[#1d1c17] font-poppins"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Pinned Top) */}
        <div className="px-6 py-4 bg-[#fef9f1] border-b border-[#e8e2d8] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20 flex items-center justify-center font-bold shrink-0">
              <span className="material-symbols-outlined text-2xl">
                {editingLocation ? 'edit_location' : 'add_location_alt'}
              </span>
            </div>
            <div>
              <h2 id="qr-drawer-title" className="text-lg font-black text-[#1d1c17] tracking-tight">
                {editingLocation
                  ? `Edit QR Location #QR-LOC-${editingLocation.id}`
                  : 'Configure New QR Access Point'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-[#5f5e5e] font-mono">
                <span>{editingLocation ? 'PATCH' : 'POST'} /api/qr-locations</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#ae001a]"></span>
                <span className="text-[#ae001a] font-semibold">Tenant #{merchantId}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#5f5e5e] hover:text-[#ae001a] p-1.5 rounded-lg transition-colors duration-200 hover:bg-slate-200"
            title="Close Drawer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Tab Navigation (Only shown when creating new deployment) */}
        {!editingLocation && (
          <div className="flex border-b border-[#e8e2d8] bg-[#fef9f1]/60 px-6 shrink-0 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'single'
                  ? 'border-[#ae001a] text-[#ae001a] bg-white rounded-t-lg'
                  : 'border-transparent text-[#5f5e5e] hover:text-[#1d1c17]'
              }`}
            >
              <span className="material-symbols-outlined text-base">pin_drop</span>
              <span>Single Deployment</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bulk')}
              className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'bulk'
                  ? 'border-[#ae001a] text-[#ae001a] bg-white rounded-t-lg'
                  : 'border-transparent text-[#5f5e5e] hover:text-[#1d1c17]'
              }`}
            >
              <span className="material-symbols-outlined text-base">grid_view</span>
              <span>Generate from Floor Plan Tables</span>
            </button>
          </div>
        )}

        {/* Drawer Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-white">
          {formError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-red-700 text-xs font-semibold flex items-start gap-2.5">
              <span className="material-symbols-outlined text-lg shrink-0 mt-0.5">error</span>
              <div>
                <p className="font-bold">Deployment Validation Guard</p>
                <p className="text-[11px] mt-0.5">{formError}</p>
              </div>
            </div>
          )}

          {activeTab === 'single' ? (
            /* SINGLE DEPLOYMENT FORM */
            <form id="qr-drawer-single-form" onSubmit={handleSingleSubmit} noValidate className="space-y-5">
              {/* Location Name Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#1d1c17]">
                    Location Name / Label <span className="text-[#ae001a]">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-[#5f5e5e]">
                    {formData.name.length}/100 chars
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder='e.g., "Patio Table #12", "Mesa Terraza 04"'
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={`w-full bg-[#fef9f1] border rounded-xl px-3.5 py-2.5 text-sm text-[#1d1c17] placeholder-[#5f5e5e] focus:outline-none font-poppins ${
                    fieldErrors.name
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a]'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">error</span>
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* Target QR Menu Selector (Searchable & with Theme Badge) */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1">
                  Target QR Menu <span className="text-[#ae001a]">*</span>
                </label>
                <select
                  value={formData.qr_menu_id || ''}
                  onChange={(e) => handleMenuChange(e.target.value)}
                  className={`w-full bg-[#fef9f1] border rounded-xl px-3.5 py-2.5 text-sm text-[#1d1c17] focus:outline-none font-poppins ${
                    fieldErrors.qr_menu_id
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-[#e8e2d8] focus:border-[#ae001a]'
                  }`}
                >
                  {tenantMenus.length === 0 ? (
                    <option value="" disabled>
                      No active QR menus found for merchant #{merchantId}
                    </option>
                  ) : (
                    tenantMenus.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} [{m.design_theme || 'Standard Theme'}]
                      </option>
                    ))
                  )}
                </select>

                {/* Selected Menu Badge Preview */}
                {formData.qr_menu_id > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-[#5f5e5e] font-medium">Active Theme:</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#ae001a]/10 text-[#ae001a] border border-[#ae001a]/20">
                      {tenantMenus.find((m) => m.id === formData.qr_menu_id)?.design_theme || 'Modern Elegance'}
                    </span>
                  </div>
                )}

                {fieldErrors.qr_menu_id && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">{fieldErrors.qr_menu_id}</p>
                )}
              </div>

              {/* Location Type Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1">
                  Location Type Selector <span className="text-[#ae001a]">*</span>
                </label>
                <select
                  value={formData.location_type}
                  onChange={(e) => handleLocationTypeChange(e.target.value as QRMenuType)}
                  className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3.5 py-2.5 text-sm text-[#1d1c17] focus:outline-none focus:border-[#ae001a] font-poppins"
                >
                  {QR_LOCATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QR_LOCATION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#5f5e5e] mt-1">
                  {formData.location_type === 'DINE_IN'
                    ? 'Dine-In mode enables table-side ordering and requires binding to a physical dining table.'
                    : 'Non-table location suitable for express pickup or window counters.'}
                </p>
              </div>

              {/* Dining Table Picker (Conditional) */}
              {formData.location_type === 'DINE_IN' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[#1d1c17]">
                      Physical Dining Table <span className="text-[#ae001a]">* (Mandatory for Dine-In)</span>
                    </label>
                    <span className="text-[11px] text-[#ae001a] font-semibold">Table Bound</span>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-[#5f5e5e] text-base">search</span>
                      <input
                        type="text"
                        placeholder="Search table by number or zone..."
                        value={tableSearchQuery}
                        onChange={(e) => setTableSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#e8e2d8] rounded-lg text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a] font-poppins"
                      />
                    </div>
                    <select
                      value={formData.table_id ?? ''}
                      onChange={(e) => handleTableChange(e.target.value)}
                      className={`w-full bg-[#fef9f1] border rounded-xl px-3.5 py-2.5 text-sm text-[#1d1c17] focus:outline-none font-poppins ${
                        fieldErrors.table_id
                          ? 'border-red-500 ring-1 ring-red-500'
                          : 'border-[#e8e2d8] focus:border-[#ae001a]'
                      }`}
                    >
                      <option value="">-- Select a physical dining table --</option>
                      {filteredSingleTables.map((t) => (
                        <option key={t.id} value={t.id}>
                          Table #{t.number} ({t.zone_name || 'Floor Plan'}) - Cap: {t.capacity || 4}
                        </option>
                      ))}
                    </select>
                  </div>
                  {fieldErrors.table_id && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">error</span>
                      {fieldErrors.table_id}
                    </p>
                  )}
                </div>
              ) : (
                /* Disabled / Hidden indicator when location_type is non-table specific */
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-[#5f5e5e] flex items-center gap-2">
                  <span className="material-symbols-outlined text-slate-400 text-lg">info</span>
                  <span>Physical table binding is disabled for non-table specific location types ({QR_LOCATION_TYPE_LABELS[formData.location_type]}).</span>
                </div>
              )}

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1">
                  Deployment Status <span className="text-[#ae001a]">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {QR_LOCATION_STATUSES.filter((s) => s !== 'archived').map((st) => {
                    const style = QR_STATUS_BADGE_STYLES[st];
                    const isSelected = formData.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleStatusChange(st)}
                        className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                          isSelected
                            ? `${style.bg} ring-2 ring-[#ae001a]/30`
                            : 'bg-[#fef9f1] border-[#e8e2d8] text-[#5f5e5e] hover:text-[#1d1c17]'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: style.hex }}
                        ></span>
                        <span>{st === 'active' ? 'Active Access' : 'Inactive / Disabled'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target URL Generator Preview */}
              <div className="p-4 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1d1c17] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-[#ae001a]">link</span>
                    Computed Target Tracking URL
                  </span>
                  <span className="text-[10px] font-mono text-[#5f5e5e]">Auto-generated</span>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-[#e8e2d8] font-mono text-[11px] text-[#1d1c17] break-all select-all">
                  {previewUrl}
                </div>
                <p className="text-[10px] text-[#5f5e5e]">
                  Formula: <code className="font-mono">base_domain/menu/&#123;menu_id&#125;?loc=&#123;hash&#125;&amp;table=&#123;table_id&#125;</code>
                </p>
              </div>

              {/* QR Image Generation Trigger: Real-Time Canvas Render */}
              <div className="p-4 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl flex items-center gap-4">
                <div className="bg-white p-2 rounded-xl border border-[#e8e2d8] shadow-xs shrink-0 flex items-center justify-center">
                  <canvas ref={canvasRef} className="w-24 h-24 object-contain" />
                </div>
                <div className="space-y-1 text-xs">
                  <span className="px-2 py-0.5 rounded bg-[#10b981]/10 text-[#10b981] font-bold border border-[#10b981]/30">
                    Real-time Canvas Render
                  </span>
                  <h4 className="font-bold text-[#1d1c17] text-sm font-poppins">Live QR Image Preview</h4>
                  <p className="text-[11px] text-[#5f5e5e]">
                    Bitmap &amp; data URI dynamically recomputed as tracking URL dependencies update.
                  </p>
                </div>
              </div>
            </form>
          ) : (
            /* BULK PROVISIONING WIZARD FORM ("Generate from Floor Plan Tables") */
            <form id="qr-drawer-bulk-form" onSubmit={handleBulkSubmit} noValidate className="space-y-5">
              <div className="p-3.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-900 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700 text-lg">auto_awesome</span>
                <span>
                  Bulk Provisioning Wizard: Select multiple physical tables from your floor plan to generate batch QR Location deployments in a single transactional payload.
                </span>
              </div>

              {/* Target QR Menu for Batch */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1">
                  Target QR Menu for All Selected Tables <span className="text-[#ae001a]">*</span>
                </label>
                <select
                  value={bulkMenuId}
                  onChange={(e) => setBulkMenuId(parseInt(e.target.value, 10))}
                  className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3.5 py-2.5 text-sm text-[#1d1c17] focus:outline-none focus:border-[#ae001a] font-poppins"
                >
                  {tenantMenus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} [{m.design_theme || 'Standard Theme'}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Name Prefix */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1">
                  Location Name Prefix <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  type="text"
                  value={bulkNamePrefix}
                  onChange={(e) => setBulkNamePrefix(e.target.value)}
                  placeholder="e.g., Mesa, Table, Salon"
                  className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3.5 py-2 text-sm text-[#1d1c17] focus:outline-none focus:border-[#ae001a] font-poppins"
                />
                <p className="text-[11px] text-[#5f5e5e] mt-1">
                  Resulting location names will look like: <strong>"{bulkNamePrefix || 'Mesa'} 12"</strong>
                </p>
              </div>

              {/* Dining Zone Filter */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#1d1c17]">Filter by Dining Zone</label>
                  <button
                    type="button"
                    onClick={selectAllBulkTables}
                    className="text-xs text-[#ae001a] font-bold hover:underline"
                  >
                    {bulkSelectedTableIds.size === bulkAvailableTables.length
                      ? 'Deselect All'
                      : `Select All in Zone (${bulkAvailableTables.length})`}
                  </button>
                </div>
                <select
                  value={bulkZoneFilter}
                  onChange={(e) => {
                    setBulkZoneFilter(e.target.value);
                    setBulkSelectedTableIds(new Set());
                  }}
                  className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded-xl px-3.5 py-2 text-sm text-[#1d1c17] focus:outline-none focus:border-[#ae001a] font-poppins"
                >
                  <option value="ALL">All Zones ({tenantTables.length} tables)</option>
                  {availableZones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>

              {/* Multi-Select Tables Grid */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#1d1c17]">
                  Select Tables ({bulkSelectedTableIds.size} selected)
                </label>
                <div className="max-h-56 overflow-y-auto border border-[#e8e2d8] rounded-xl p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 bg-[#fef9f1]/50">
                  {bulkAvailableTables.map((t) => {
                    const isChecked = bulkSelectedTableIds.has(t.id);
                    // Check if table already has an active deployment of this menu
                    const hasActiveDup = locations.some(
                      (l) => l.status === 'active' && l.qr_menu_id === bulkMenuId && l.table_id === t.id
                    );

                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition ${
                          isChecked
                            ? 'bg-[#ae001a]/10 border-[#ae001a] text-[#ae001a] font-bold'
                            : 'bg-white border-[#e8e2d8] text-[#1d1c17]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleBulkTable(t.id)}
                          className="w-4 h-4 rounded text-[#ae001a] focus:ring-[#ae001a]"
                        />
                        <div className="truncate">
                          <span className="block truncate">Mesa #{t.number}</span>
                          <span className="text-[10px] text-[#5f5e5e] block truncate">
                            {t.zone_name || 'Floor'}
                          </span>
                          {hasActiveDup && (
                            <span className="text-[9px] text-amber-600 block">Existing Active</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Status Selector for Batch */}
              <div>
                <label className="block text-xs font-bold text-[#1d1c17] mb-1">Batch Initial Status</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBulkStatus('active')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      bulkStatus === 'active'
                        ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981] ring-2 ring-[#10b981]/30'
                        : 'bg-[#fef9f1] border-[#e8e2d8] text-[#5f5e5e]'
                    }`}
                  >
                    Active Access
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkStatus('inactive')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      bulkStatus === 'inactive'
                        ? 'bg-[#f59e0b]/10 border-[#f59e0b] text-[#f59e0b] ring-2 ring-[#f59e0b]/30'
                        : 'bg-[#fef9f1] border-[#e8e2d8] text-[#5f5e5e]'
                    }`}
                  >
                    Disabled
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer (Pinned Bottom) */}
        <div className="px-6 py-4 bg-[#fef9f1] border-t border-[#e8e2d8] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-[#1d1c17] font-semibold rounded-xl text-sm border border-[#e8e2d8] transition-colors duration-200"
          >
            Cancel
          </button>

          {activeTab === 'single' ? (
            <button
              type="submit"
              form="qr-drawer-single-form"
              onClick={() => {
                const f = document.getElementById('qr-drawer-single-form') as HTMLFormElement | null;
                if (f) {
                  f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
              }}
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#900015] text-white font-bold rounded-xl text-sm shadow-md transition-colors duration-200 flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving Deployment...</span>
                </>
              ) : (
                <span>{editingLocation ? 'Save Changes' : 'Create Access Point'}</span>
              )}
            </button>
          ) : (
            <button
              type="submit"
              form="qr-drawer-bulk-form"
              onClick={() => {
                const f = document.getElementById('qr-drawer-bulk-form') as HTMLFormElement | null;
                if (f) {
                  f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
              }}
              disabled={isSubmitting || bulkSelectedTableIds.size === 0}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#900015] text-white font-bold rounded-xl text-sm shadow-md transition-colors duration-200 flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Batch Generating...</span>
                </>
              ) : (
                <span>Batch Provision ({bulkSelectedTableIds.size} Tables)</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
