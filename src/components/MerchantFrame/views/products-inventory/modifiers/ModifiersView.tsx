import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { QuickLaunchPanel } from '../../../shared/QuickLaunchPanel';
import { CatalogQuickLinks } from '../CatalogQuickLinks';
import { EmergencySupportModal } from '../../../modals/QuickActionModals';
import { TableOptionsMenu, TablePaginationFooter, NoColumnsEmptyState, TableEmptyState, getDensityPadding, type TableDensity } from '../../../../shared/TableOptionsMenu';

interface Product {
  id: number;
  name: string;
}

interface Modifier {
  id: number;
  name: string;
  priceDelta: number | string;
  isActive: boolean;
  product: Product | null;
}

interface ModifiersViewProps {
  onNavigate?: (view: string) => void;
}

export const ModifiersView: React.FC<ModifiersViewProps> = ({ onNavigate }) => {
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros locales
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [productFilter, setProductFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All Status');

  // Table options state
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true,
    product: true,
    priceDelta: true,
    status: true,
    actions: true,
  });
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingModifierId, setEditingModifierId] = useState<number | null>(null);

  // Modal Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formPriceDelta, setFormPriceDelta] = useState<string>('');
  const [formProduct, setFormProduct] = useState<string>('NULL');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  // State for activation/deactivation confirmation modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmTargetModifier, setConfirmTargetModifier] = useState<Modifier | null>(null);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const topRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al inicio al montar la vista
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  const fetchAllData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const [modifiersRes, productsRes] = await Promise.all([
        fetch(`${API_BASE}/modifiers?limit=100`, { headers }),
        fetch(`${API_BASE}/products?limit=100`, { headers })
      ]);

      if (modifiersRes.status === 401 || productsRes.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!modifiersRes.ok || !productsRes.ok) {
        throw new Error('Error loading data from server');
      }

      const modifiersJson = await modifiersRes.json();
      const productsJson = await productsRes.json();

      const modifiersData = Array.isArray(modifiersJson)
        ? modifiersJson
        : (modifiersJson.data || modifiersJson.items || []);
      const productsData = Array.isArray(productsJson)
        ? productsJson
        : (productsJson.data || productsJson.items || []);

      // Map modifiers
      const mappedModifiers = modifiersData.map((m: any) => ({
        id: m.id,
        name: m.name,
        priceDelta: m.priceDelta,
        isActive: m.isActive !== undefined ? m.isActive : true,
        product: m.product ? { id: m.product.id, name: m.product.name } : null
      }));

      // Mapear productos
      const mappedProducts = productsData.map((p: any) => ({
        id: p.id,
        name: p.name
      }));

      setModifiers(mappedModifiers);
      setProducts(mappedProducts);
    } catch (err: any) {
      console.error('Error fetching modifiers data:', err);
      setError('Failed to load modifiers. Please check if the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleExportCSV = () => {
    if (filteredModifiers.length === 0) return;
    const headers = ['ID', 'Name', 'Price Delta', 'Associated Product', 'Status'];
    const rows = filteredModifiers.map(m => [m.id, `"${m.name.replace(/"/g, '""')}"`, m.priceDelta, `"${m.product?.name || 'None'}"`, m.isActive ? 'Active' : 'Inactive']);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `modifiers_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handlePrintTable = () => { window.print(); };

  const handleCopySummary = () => {
    const active = filteredModifiers.filter(m => m.isActive).length;
    navigator.clipboard.writeText(`Modifiers & Toppings: ${filteredModifiers.length} total, ${active} active, ${filteredModifiers.length - active} inactive.`);
  };

  const filteredModifiers = modifiers.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.product?.name || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' ||
      statusFilter === 'All Status' ||
      (statusFilter === 'Active' && m.isActive) ||
      (statusFilter === 'Inactive' && !m.isActive);

    const matchesProduct =
      productFilter === 'All' ||
      productFilter === 'All Products' ||
      (m.product && String(m.product.id) === productFilter) ||
      (!m.product && productFilter === 'None');

    return matchesSearch && matchesStatus && matchesProduct;
  });

  const totalPages = Math.ceil(filteredModifiers.length / pageSize) || 1;
  const paginatedModifiers = pageSize === 9999
    ? filteredModifiers
    : filteredModifiers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const formatPrice = (price: number | string) => {
    const num = typeof price === 'number' ? price : parseFloat(price);
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingModifierId(null);
    setFormName('');
    setFormPriceDelta('');
    setFormProduct(products.length > 0 ? String(products[0].id) : 'NULL');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (m: Modifier) => {
    setModalMode('edit');
    setEditingModifierId(m.id);
    setFormName(m.name);
    setFormPriceDelta(String(m.priceDelta));
    setFormProduct(m.product ? String(m.product.id) : 'NULL');
    setFormIsActive(m.isActive);
    setIsModalOpen(true);
  };

  // Toggle modifier active/inactive quickly
  const handleToggleActive = (m: Modifier) => {
    setConfirmTargetModifier(m);
    setToggleError(null);
    setIsConfirmModalOpen(true);
  };

  const executeToggleActive = async () => {
    if (!confirmTargetModifier) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`${API_BASE}/modifiers/${confirmTargetModifier.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive: !confirmTargetModifier.isActive })
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error updating modifier status');
      }

      setModifiers((prevModifiers) =>
        prevModifiers.map((mod) =>
          mod.id === confirmTargetModifier.id ? { ...mod, isActive: !confirmTargetModifier.isActive } : mod
        )
      );
      setIsConfirmModalOpen(false);
      setConfirmTargetModifier(null);
    } catch (err: any) {
      console.error(err);
      setToggleError(err.message || 'Error updating modifier status');
    } finally {
      setIsToggling(false);
    }
  };

  const handleSaveModifier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPriceDelta.trim() || formProduct === 'NULL') {
      alert('Por favor, completa todos los campos obligatorios.');
      return;
    }

    const deltaNum = parseFloat(formPriceDelta);
    if (isNaN(deltaNum) || deltaNum < 0) {
      alert('Delta price must be a non-negative number.');
      return;
    }

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const bodyData: any = {
        name: formName,
        priceDelta: deltaNum,
        isActive: formIsActive
      };

      if (modalMode === 'add') {
        bodyData.productId = parseInt(formProduct);
        const res = await fetch(`${API_BASE}/modifiers`, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyData)
        });
        if (!res.ok) {
          const errorJson = await res.json().catch(() => ({}));
          throw new Error(errorJson.message || 'Error creating modifier');
        }
      } else if (modalMode === 'edit' && editingModifierId) {
        const res = await fetch(`${API_BASE}/modifiers/${editingModifierId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(bodyData)
        });
        if (!res.ok) {
          const errorJson = await res.json().catch(() => ({}));
          throw new Error(errorJson.message || 'Error updating modifier');
        }
      }

      setIsModalOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error saving modifier');
    }
  };

  // Calculate visible columns for colSpan
  const visibleColumnsCount = Object.values(visibleColumns).filter(Boolean).length;
  const densityPadding = getDensityPadding(rowDensity);

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div ref={topRef} />

      {/* Section Title */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#ae001a] text-2xl">
            tune
          </span>
          <div>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
              Product Modifiers & Extra Add-ons
            </h2>
            <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
              Configure custom options, extra ingredients, and price modifiers linked directly to master catalog products.
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar and Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Row 1: Full-width search */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
            placeholder="Search modifiers by name or product..."
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro por Producto */}
            <select
              value={productFilter}
              onChange={(e) => {
                setProductFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[150px] font-sans text-secondary"
            >
              <option value="All">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Filtro por Estado */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[130px] font-sans text-secondary"
            >
              <option value="All Status">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenAddModal}
              className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              ADD MODIFIER
            </button>

          </div>
        </div>
      </div>

      {/* Modifiers Directory Table */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
        {/* Header Oscuro #222222 */}
        <div className="p-4 bg-[#222222] flex justify-between items-center relative">
          <div className="flex items-center gap-3">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
              MODIFIERS DIRECTORY
            </span>
            <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
              {filteredModifiers.length} {filteredModifiers.length === 1 ? 'modifier' : 'modifiers'}
            </span>
          </div>

          <TableOptionsMenu
            onExportCSV={handleExportCSV}
            onPrint={handlePrintTable}
            onCopySummary={handleCopySummary}
            onReload={fetchAllData}
            columns={[
              { key: 'name', label: 'Modifier Name' },
              { key: 'product', label: 'Associated Product' },
              { key: 'priceDelta', label: 'Delta Price' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions' },
            ]}
            visibleColumns={visibleColumns}
            onToggleColumn={(key) =>
              setVisibleColumns((prev) => ({
                ...prev,
                [key]: !prev[key as keyof typeof visibleColumns],
              }))
            }
            rowDensity={rowDensity}
            onChangeDensity={setRowDensity}
            totalItems={filteredModifiers.length}
            pageSize={pageSize}
            onChangePageSize={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
              <tr>
                {visibleColumns.name && (
                  <th className={`${densityPadding} text-left text-label-caps font-bold text-text-muted font-sans`}>
                    Modifier Name
                  </th>
                )}
                {visibleColumns.product && (
                  <th className={`${densityPadding} text-left text-label-caps font-bold text-text-muted font-sans`}>
                    Associated Product
                  </th>
                )}
                {visibleColumns.priceDelta && (
                  <th className={`${densityPadding} text-right text-label-caps font-bold text-text-muted font-sans`}>
                    Delta Price
                  </th>
                )}
                {visibleColumns.status && (
                  <th className={`${densityPadding} text-center text-label-caps font-bold text-text-muted font-sans`}>
                    Status
                  </th>
                )}
                {visibleColumns.actions && (
                  <th className={`${densityPadding} text-center text-label-caps font-bold text-text-muted font-sans`}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e2d8]">
              {visibleColumnsCount === 0 ? (
                <NoColumnsEmptyState colSpan={5} />
              ) : isLoading ? (
                <tr>
                  <td colSpan={visibleColumnsCount} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                    <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                      sync
                    </span>
                    <p className="text-secondary text-body-md mt-2 font-sans">Loading modifiers catalog...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={visibleColumnsCount} className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white">
                    <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                      error
                    </span>
                    <p className="font-bold">{error}</p>
                    <button
                      onClick={fetchAllData}
                      className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                    >
                      Retry Connection
                    </button>
                  </td>
                </tr>
              ) : modifiers.length === 0 ? (
                <TableEmptyState
                  colSpan={visibleColumnsCount}
                  icon="tune"
                  title="No modifiers found"
                  description="Click 'Add Modifier' to start building your modifiers catalog."
                />
              ) : filteredModifiers.length === 0 ? (
                <TableEmptyState
                  colSpan={visibleColumnsCount}
                  icon="tune"
                  title="No modifiers found"
                  description="No modifiers match the selected filter criteria."
                />
              ) : (
                paginatedModifiers.map((modifier) => {
                  const isInactive = !modifier.isActive;
                  return (
                    <tr
                      key={modifier.id}
                      className={`category-row group transition-colors ${
                        isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                      }`}
                    >
                      {visibleColumns.name && (
                        <td className={densityPadding}>
                          <div className="flex items-center gap-3">
                            <div className={`w-1 h-8 rounded-full ${isInactive ? 'bg-zinc-400' : 'bg-[#ae001a]'}`}></div>
                            <p className={`font-bold text-[#1d1c17] font-sans ${isInactive ? 'line-through' : ''}`}>{modifier.name}</p>
                          </div>
                        </td>
                      )}
                      {visibleColumns.product && (
                        <td className={`${densityPadding} text-body-md text-[#1d1c17] font-sans`}>
                          {modifier.product ? modifier.product.name : 'No Product'}
                        </td>
                      )}
                      {visibleColumns.priceDelta && (
                        <td className={`${densityPadding} text-right font-mono font-bold text-emerald-700`}>
                          +{formatPrice(modifier.priceDelta)}
                        </td>
                      )}
                      {visibleColumns.status && (
                        <td className={`${densityPadding} text-center`}>
                          <span
                            className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase font-sans ${
                              modifier.isActive
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-zinc-200 text-[#5f5e5e]'
                            }`}
                          >
                            {modifier.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className={`${densityPadding} text-center`}>
                          <div className="flex justify-center gap-3">
                            <button
                              onClick={() => handleOpenEditModal(modifier)}
                              className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                              title="Edit modifier"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button
                              onClick={() => void handleToggleActive(modifier)}
                              className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                              title={modifier.isActive ? "Deactivate modifier" : "Activate modifier"}
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                {modifier.isActive ? 'block' : 'check_circle_outline'}
                              </span>
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

        {/* Pagination Footer */}
        <TablePaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredModifiers.length}
          onPageChange={setCurrentPage}
          onChangePageSize={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Interactive Add / Edit Modifier Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col">
            <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
              <span className="font-bold text-label-caps uppercase tracking-wider font-sans">
                {modalMode === 'add' ? 'Add Modifier' : 'Edit Modifier'}
              </span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveModifier} className="flex-1 flex flex-col min-h-0">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                    Modifier Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-sans"
                    placeholder="e.g., Extra Cheese, No Onions, Gluten Free"
                    required
                  />
                </div>

                {modalMode === 'add' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Associated Product
                    </label>
                    <select
                      value={formProduct}
                      onChange={(e) => setFormProduct(e.target.value)}
                      className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-sans"
                    >
                      <option value="NULL" disabled>Select a product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                    Price Delta ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formPriceDelta}
                    onChange={(e) => setFormPriceDelta(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
                    placeholder="e.g., 1.50"
                    required
                    min="0"
                  />
                </div>
              </div>
              <div className="p-6 pt-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0 bg-[#fefbf6]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-zinc-100 transition-colors font-sans cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-colors font-sans cursor-pointer"
                >
                  SAVE MODIFIER
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {/* Activation/deactivation confirmation modal */}
      {isConfirmModalOpen && confirmTargetModifier && (
        <div className="fixed inset-0 z-[10000] overflow-y-auto flex items-center justify-center p-4 font-sans">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsConfirmModalOpen(false)}
          />

          {/* Modal Box */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 animate-scale-in">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                confirmTargetModifier.isActive 
                  ? 'bg-red-50 border border-red-100 text-[#ae001a]'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-600'
              }`}>
                <span className="material-symbols-outlined text-2xl block">
                  {confirmTargetModifier.isActive ? 'power_settings_new' : 'check_circle'}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  {confirmTargetModifier.isActive ? 'Confirm Deactivation' : 'Confirm Activation'}
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to {confirmTargetModifier.isActive ? 'deactivate' : 'activate'} this modifier? This action will set the status to {confirmTargetModifier.isActive ? 'inactive' : 'active'}.
                </p>
              </div>
            </div>

            {toggleError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-body-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm block">error</span>
                <span>{toggleError}</span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 text-body-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all duration-200 cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeToggleActive}
                disabled={isToggling}
                className={`px-4 py-2 text-white text-body-xs font-bold rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-sans ${
                  confirmTargetModifier.isActive
                    ? 'bg-red-600 hover:bg-[#ae001a]'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isToggling ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin block">sync</span>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{confirmTargetModifier.isActive ? 'Deactivate' : 'Activate'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Quick Links Hub */}
      <CatalogQuickLinks current="modifiers" onNavigate={onNavigate} />
    </div>
  );
};

export default ModifiersView;
