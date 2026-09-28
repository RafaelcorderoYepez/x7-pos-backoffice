import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { StockQuickLinks } from '../stocks/StockQuickLinks';
import { TableOptionsMenu, TablePaginationFooter, NoColumnsEmptyState, type TableDensity } from '../../../../shared/TableOptionsMenu';
import { getDensityPadding } from '../../../../shared/tableOptionsHelpers';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface Supply {
  id: number;
  name: string;
  code: string;
  sku?: string | null;
  unit: string;
  purchase_unit?: string | null;
  consumption_unit?: string | null;
  cost_per_unit?: number | null;
  average_cost?: number | null;
  conversion_factor?: number | null;
  isActive: boolean;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  isActive: boolean;
  variants?: Variant[];
}

interface Variant {
  id: number;
  name: string;
  sku?: string;
  price?: number;
}

interface RecipeLine {
  id?: number;
  rawMaterialId?: number | null;
  rawMaterial?: Supply | null;
  supplyProductId?: number | null;
  supplyProduct?: Product | null;
  quantity?: string | number | null;
  quantityPerSoldUnit?: string | number | null;
  unitOfMeasure?: string | null;
  costContribution?: number | null;
}

interface ProductRecipe {
  id: number;
  name?: string;
  finishedProductId: number;
  finishedProduct?: Product | null;
  finishedVariantId?: number | null;
  finishedVariant?: Variant | null;
  yieldQuantity?: number;
  isActive?: boolean;
  lines: RecipeLine[];
  theoreticalCostCached?: string | null;
}

interface RecipesViewProps {
  onNavigate?: (view: string) => void;
}

export const RecipesView: React.FC<RecipesViewProps> = ({ onNavigate }) => {
  const topRef = useRef<HTMLDivElement | null>(null);

  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search and status filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [productFilter, setProductFilter] = useState<string>('ALL');

  // Table options state
  const [rowDensity, setRowDensity] = useState<TableDensity>('comfortable');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true,
    product: true,
    yield: true,
    ingredients: true,
    cost: true,
    status: true,
    actions: true,
  });
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const handleExportCSV = () => {
    if (filteredRecipes.length === 0) return;
    const headers = ['ID', 'Recipe Name', 'Product SKU', 'Batch Yield', 'Ingredients Count', 'Theoretical Cost', 'Status'];
    const rows = filteredRecipes.map(r => {
      const prod = r.finishedProduct || products.find((p) => p.id === r.finishedProductId);
      return [
        r.id,
        `"${(r.name || prod?.name || `Recipe #${r.id}`).replace(/"/g, '""')}"`,
        `"${prod?.sku || ''}"`,
        r.yieldQuantity ?? 1,
        (r.lines || []).length,
        r.theoreticalCostCached || 0,
        r.isActive !== false ? 'Active' : 'Inactive'
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `recipes_formulas_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintTable = () => { window.print(); };

  const handleCopySummary = () => {
    const active = filteredRecipes.filter(r => r.isActive !== false).length;
    navigator.clipboard.writeText(`Recipes & BOM: ${filteredRecipes.length} total, ${active} active, ${filteredRecipes.length - active} inactive.`);
  };

  // Interactive Drawer / Modal to Create / Edit Recipe
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | 'view'>('add');
  const [selectedRecipe, setSelectedRecipe] = useState<ProductRecipe | null>(null);

  // Form State
  const [formName, setFormName] = useState<string>('');
  const [formProductId, setFormProductId] = useState<string>('');
  const [formVariantId, setFormVariantId] = useState<string>('');
  const [formYieldQty, setFormYieldQty] = useState<number>(1);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formLines, setFormLines] = useState<{ raw_material_id: string; quantity: number }[]>([]);
  const [formDuplicateWarning, setFormDuplicateWarning] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);


  // 1. Load Recipes, Commercial Products, and Raw Materials from backend
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Load v1 recipes
      let recipesRes = await fetch(`${API_BASE}/v1/recipes`, { headers });
      if (!recipesRes.ok) {
        recipesRes = await fetch(`${API_BASE}/v1/inventory/recipes`, { headers });
      }

      // Cargar productos
      const productsRes = await fetch(`${API_BASE}/products?limit=100`, { headers });

      // Load raw materials
      let suppliesRes = await fetch(`${API_BASE}/v1/inventory/raw-materials?status=active&limit=200`, { headers });
      if (!suppliesRes.ok) {
        suppliesRes = await fetch(`${API_BASE}/supplies?status=active&limit=200`, { headers });
      }

      if (recipesRes.status === 401 || productsRes.status === 401 || suppliesRes.status === 401) {
        clearAuthSession();
        window.location.assign('/login');
        return;
      }

      const productsJson = await productsRes.json().catch(() => ({}));
      const suppliesJson = await suppliesRes.json().catch(() => ({}));
      const recipesJson = recipesRes.ok ? await recipesRes.json().catch(() => []) : [];

      const productsList = productsJson.items || productsJson.data || productsJson || [];
      const suppliesList = suppliesJson.items || suppliesJson.data || suppliesJson || [];
      const recipesList = Array.isArray(recipesJson) ? recipesJson : (recipesJson.items || []);

      setProducts(Array.isArray(productsList) ? productsList : []);
      setSupplies(Array.isArray(suppliesList) ? suppliesList : []);
      setRecipes(Array.isArray(recipesList) ? recipesList : []);

    } catch (err: unknown) {
      console.error('Error fetching recipes workspace data:', err);
      const message = err instanceof Error ? err.message : 'Failed to load recipes data from server.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    void Promise.resolve().then(() => {
      fetchData();
    });
  }, [fetchData]);

  // Open Drawer to Create New Recipe
  const handleOpenAdd = () => {
    setSelectedRecipe(null);
    setDrawerMode('add');
    setFormName('');
    setFormProductId('');
    setFormVariantId('');
    setFormYieldQty(1);
    setFormIsActive(true);
    setFormLines([{ raw_material_id: '', quantity: 1 }]);
    setFormDuplicateWarning(null);
    setDrawerError(null);
    setIsDrawerOpen(true);
  };


  // Open Drawer to Edit Existing Recipe
  const handleOpenEdit = (rec: ProductRecipe) => {
    setSelectedRecipe(rec);
    setDrawerMode('edit');
    const prod = rec.finishedProduct || products.find((p) => p.id === rec.finishedProductId);
    setFormName(rec.name || (prod ? `${prod.name} Formula` : `Recipe #${rec.id}`));
    setFormProductId(String(rec.finishedProductId || ''));
    setFormVariantId(rec.finishedVariantId ? String(rec.finishedVariantId) : '');
    setFormYieldQty(rec.yieldQuantity ?? 1);
    setFormIsActive(rec.isActive !== false);
    const mappedLines = (rec.lines || []).map((l) => ({
      raw_material_id: String(l.rawMaterialId || l.rawMaterial?.id || l.supplyProductId || ''),
      quantity: Number(l.quantityPerSoldUnit || l.quantity || 1),
    }));
    setFormLines(mappedLines.length > 0 ? mappedLines : [{ raw_material_id: '', quantity: 1 }]);
    setFormDuplicateWarning(null);
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  // Abrir Drawer de Solo Lectura
  const handleOpenView = (rec: ProductRecipe) => {
    setSelectedRecipe(rec);
    setDrawerMode('view');
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  // Add Ingredient Line in Form
  const handleAddFormLine = () => {
    setFormDuplicateWarning(null);
    setFormLines((prev) => [...prev, { raw_material_id: '', quantity: 1 }]);
  };

  // Remove Ingredient Line
  const handleRemoveFormLine = (index: number) => {
    setFormDuplicateWarning(null);
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Realtime dynamic cost contribution calculation per line
  const calculateLineCostContribution = (rawMaterialId: string, quantity: number): number => {
    if (!rawMaterialId || quantity <= 0) return 0;
    const mat = supplies.find((s) => String(s.id) === String(rawMaterialId));
    if (!mat) return 0;
    const avgCost = Number(mat.average_cost ?? mat.cost_per_unit ?? 0);
    const convFactor = Number(mat.conversion_factor ?? 1) || 1;
    return quantity * (avgCost / convFactor);
  };

  // Realtime dynamic theoretical cost calculation for recipe
  const totalTheoreticalCost = formLines.reduce((sum, line) => {
    return sum + calculateLineCostContribution(line.raw_material_id, line.quantity);
  }, 0);

  // Change Ingredient Line Value with Duplicate Guard
  const handleFormLineChange = (index: number, key: 'raw_material_id' | 'quantity', val: string | number) => {
    setFormDuplicateWarning(null);
    if (key === 'raw_material_id' && val) {
      const isAlreadyAdded = formLines.some(
        (l, i) => i !== index && String(l.raw_material_id) === String(val)
      );
      if (isAlreadyAdded) {
        const duplicateItem = supplies.find((s) => String(s.id) === String(val));
        const msg = `"${duplicateItem?.name || 'Raw Material'}" is already added to this recipe formula. Please adjust the existing line quantity instead.`;
        setFormDuplicateWarning(msg);
        return;
      }
    }

    setFormLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: val };
      return next;
    });
  };

  // Delete Recipe
  const handleDeleteRecipe = async (recipeId: number) => {
    if (!window.confirm('Are you sure you want to delete or archive this production recipe formula?')) return;
    try {
      setIsLoading(true);
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/v1/recipes/${recipeId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        throw new Error('Failed to delete recipe.');
      }

      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error deleting recipe.';
      alert(message);
      setIsLoading(false);
    }
  };

  // Save Recipe (Submit)
  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerError(null);

    if (!formProductId || Number(formProductId) <= 0) {
      setDrawerError('You must select a Finished Product (Menu Item) to link this production recipe.');
      return;
    }

    if (!formName.trim()) {
      setDrawerError('Please enter a valid name for the recipe formula.');
      return;
    }

    const validLines = formLines
      .filter((l) => l.raw_material_id && Number(l.raw_material_id) > 0 && Number(l.quantity) >= 0.0001)
      .map((l) => {
        const supplyObj = supplies.find((s) => String(s.id) === String(l.raw_material_id));
        const rawUnit = (supplyObj?.consumption_unit || supplyObj?.unit || 'GRAM').trim() || 'GRAM';
        return {
          raw_material_id: Number(l.raw_material_id),
          quantity: Number(l.quantity),
          unit_of_measure: rawUnit,
        };
      });

    if (validLines.length === 0) {
      setDrawerError('Please add at least one valid raw material with a quantity greater than 0.0001.');
      return;
    }

    // Check duplicates before submission
    const selectedIds = validLines.map((l) => String(l.raw_material_id));
    const hasDuplicates = new Set(selectedIds).size !== selectedIds.length;
    if (hasDuplicates) {
      setDrawerError('Duplicate raw materials detected in recipe. Each ingredient must be unique.');
      return;
    }

    try {
      setIsLoading(true);

      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const payload: Record<string, unknown> = {
        productId: Number(formProductId),
        lines: validLines,
      };

      if (formName.trim()) {
        payload.name = formName.trim();
      }

      if (formYieldQty && Number(formYieldQty) > 0) {
        payload.yieldQuantity = Number(formYieldQty);
      }

      if (formVariantId && Number(formVariantId) > 0) {
        payload.variantId = Number(formVariantId);
      }

      let res;
      if (drawerMode === 'edit' && selectedRecipe) {
        res = await fetch(`${API_BASE}/v1/recipes/${selectedRecipe.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/v1/recipes`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        let errMsg = 'Could not save recipe.';
        if (Array.isArray(errJson.message)) {
          errMsg = errJson.message.join('\n');
        } else if (typeof errJson.message === 'string') {
          if (errJson.message.includes('already exists')) {
            errMsg = 'A recipe already exists for this product or variant.';
          } else if (errJson.message.includes('Validation failed')) {
            errMsg = 'Validation error on entered data. Please check selected product and ingredients.';
          } else {
            errMsg = errJson.message;
          }
        } else if (typeof errJson.error === 'string') {
          errMsg = errJson.error;
        }
        setDrawerError(errMsg);
        return;
      }

      setIsDrawerOpen(false);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error saving recipe.';
      setDrawerError(message);
    } finally {
      setIsLoading(false);
    }
  };




  // Multi-criteria Dynamic Recipe Filtering
  const filteredRecipes = recipes.filter((rec) => {
    const prod = rec.finishedProduct || products.find((p) => p.id === rec.finishedProductId);
    const variant = rec.finishedVariant;

    // Recipe name or linked product name
    const recipeName = rec.name || prod?.name || `Recipe #${rec.id}`;
    const prodSku = prod?.sku || '';
    const variantName = variant?.name || '';

    // Search by contained ingredients
    const matchesIngredient = (rec.lines || []).some((l) => {
      const mat = l.rawMaterial || supplies.find((s) => s.id === l.rawMaterialId || s.id === l.supplyProductId);
      return mat?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mat?.code.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const matchesSearch =
      recipeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prodSku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      variantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      matchesIngredient;

    // Filter by specific product
    const matchesProduct =
      productFilter === 'ALL' || String(rec.finishedProductId) === productFilter;

    // Filtro por Estado (Activo / Inactivo)
    const recIsActive = rec.isActive !== false;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && recIsActive) ||
      (statusFilter === 'INACTIVE' && !recIsActive);

    return matchesSearch && matchesProduct && matchesStatus;
  });

  const totalPages = Math.ceil(filteredRecipes.length / pageSize) || 1;
  const paginatedRecipes = filteredRecipes.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div ref={topRef} />
      {/* Header Card */}

      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ae001a] text-2xl font-normal select-none">
              menu_book
            </span>
            <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            Recipes Workspace
          </h2>
          </div>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Review production formulas, link ingredients to finished products or variants, monitor yield quantities and audit theoretical costs.
          </p>
        </div>
      </div>

      {/* Banner de Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-[#ae001a] p-4 rounded-lg text-sm font-semibold flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={fetchData}
            className="px-3 py-1 bg-[#ae001a] text-white text-xs font-bold rounded hover:bg-[#930015] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Toolbar Panel (Structure identical to Purchase Orders) */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Row 1: Full-width search */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            placeholder="Search by recipe name, product SKU, or contained ingredient..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[150px] font-sans text-secondary cursor-pointer"
            >
              <option value="ALL">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[130px] font-sans text-secondary cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              ADD RECIPE
            </button>

          </div>
        </div>
      </div>



      {/* Grid de Datos Principal */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl shadow-xs overflow-hidden">
        {(() => {
          const densityPadding = getDensityPadding(rowDensity);
          const activeColSpan =
            (visibleColumns.name ? 1 : 0) +
            (visibleColumns.product ? 1 : 0) +
            (visibleColumns.yield ? 1 : 0) +
            (visibleColumns.ingredients ? 1 : 0) +
            (visibleColumns.cost ? 1 : 0) +
            (visibleColumns.status ? 1 : 0) +
            (visibleColumns.actions ? 1 : 0);

          return (
            <>
              <div className="p-4 bg-[#222222] flex justify-between items-center relative">
                <div className="flex items-center gap-3">
                  <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
                    RECIPES & BOM FORMULAS
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
                    {filteredRecipes.length} {filteredRecipes.length === 1 ? 'recipe' : 'recipes'}
                  </span>
                </div>

                <TableOptionsMenu
                  onExportCSV={handleExportCSV}
                  onPrint={handlePrintTable}
                  onCopySummary={handleCopySummary}
                  onReload={fetchData}
                  columns={[
                    { key: 'name', label: 'Recipe Name & ID' },
                    { key: 'product', label: 'Linked Product / Variant' },
                    { key: 'yield', label: 'Batch Yield' },
                    { key: 'ingredients', label: 'Ingredients' },
                    { key: 'cost', label: 'Theoretical Cost' },
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
                  totalItems={filteredRecipes.length}
                  pageSize={pageSize}
                  onChangePageSize={(size) => {
                    setPageSize(size);
                    setCurrentPage(1);
                  }}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                />
              </div>

              {activeColSpan === 0 ? (
                <NoColumnsEmptyState />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                      <tr>
                        {visibleColumns.name && (
                          <th className={`text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                            Recipe Name & ID
                          </th>
                        )}
                        {visibleColumns.product && (
                          <th className={`text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                            Linked Product / Variant
                          </th>
                        )}
                        {visibleColumns.yield && (
                          <th className={`text-center text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                            Batch Yield
                          </th>
                        )}
                        {visibleColumns.ingredients && (
                          <th className={`text-center text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                            Ingredients
                          </th>
                        )}
                        {visibleColumns.cost && (
                          <th className={`text-right text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                            Theoretical Cost / Portion
                          </th>
                        )}
                        {visibleColumns.status && (
                          <th className={`text-center text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                            Status
                          </th>
                        )}
                        {visibleColumns.actions && (
                          <th className={`text-center text-label-caps font-bold text-[#5f5e5e] ${densityPadding}`}>
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#e8e2d8] text-sm font-sans">
                      {isLoading ? (
                        <tr>
                          <td colSpan={activeColSpan} className="py-12 px-6 text-center text-secondary font-sans bg-white">
                            <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                              sync
                            </span>
                            <p className="text-secondary text-body-md mt-2 font-sans">Loading recipes dataset...</p>
                          </td>
                        </tr>
                      ) : error ? (
                        <tr>
                          <td colSpan={activeColSpan} className="py-12 px-6 text-center text-[#ba1a1a] font-sans bg-white">
                            <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                              warning
                            </span>
                            <p className="font-bold">{error}</p>
                          </td>
                        </tr>
                      ) : filteredRecipes.length === 0 ? (
                        <tr>
                          <td colSpan={activeColSpan} className="py-12 px-6 text-center text-secondary font-sans bg-white">
                            <span className="material-symbols-outlined text-secondary text-5xl block mb-2 mx-auto select-none">
                              menu_book
                            </span>
                            <p className="font-bold text-[#222222] uppercase text-sm">No recipes found</p>
                            <p className="text-xs text-[#666666] mt-1">No production recipes match the selected filter criteria.</p>
                          </td>
                        </tr>
                      ) : (
                        paginatedRecipes.map((rec) => {
                          const prod = rec.finishedProduct || products.find((p) => p.id === rec.finishedProductId);
                          const variant = rec.finishedVariant;

                          const recipeName = rec.name || prod?.name || `Recipe Formula #${rec.id}`;
                          const yieldQty = rec.yieldQuantity ?? 1;
                          const calculatedLinesCost = (rec.lines || []).reduce((sum, l) => {
                            const mat = l.rawMaterial || supplies.find((s) => s.id === l.rawMaterialId || s.id === l.supplyProductId);
                            const qty = Number(l.quantityPerSoldUnit || l.quantity || 0);
                            const unitCost = Number(mat?.average_cost ?? mat?.cost_per_unit ?? 0);
                            const convFactor = Number(mat?.conversion_factor ?? 1) || 1;
                            return sum + (qty * (unitCost / convFactor));
                          }, 0);
                          const totalCost = Number(rec.theoreticalCostCached) > 0 
                            ? Number(rec.theoreticalCostCached) 
                            : calculatedLinesCost;
                          const portionCost = yieldQty > 0 ? totalCost / yieldQty : totalCost;
                          const ingredientCount = (rec.lines || []).length;
                          const recIsActive = rec.isActive !== false;

                          return (
                            <tr key={rec.id} className="hover:bg-[#f8f3eb] transition-colors">
                              {/* Recipe Name & ID */}
                              {visibleColumns.name && (
                                <td className={densityPadding}>
                                  <p className="font-bold text-[#1d1c17]">{recipeName}</p>
                                  <span className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                                    RCP-#{rec.id}
                                  </span>
                                </td>
                              )}

                              {/* Linked Product / Variant */}
                              {visibleColumns.product && (
                                <td className={densityPadding}>
                                  {prod ? (
                                    <div className="flex flex-col gap-1 items-start">
                                      <span className="px-2.5 py-1 rounded-full bg-[#f2ede5] text-[#1d1c17] font-semibold text-xs border border-[#e8e2d8] inline-flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[14px] text-[#ae001a]">
                                          restaurant
                                        </span>
                                        {prod.name}
                                      </span>
                                      {variant && (
                                        <span className="text-[11px] text-[#5f5e5e] italic font-mono pl-1">
                                          Variant: {variant.name}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 font-semibold text-xs italic">
                                      General Formula
                                    </span>
                                  )}
                                </td>
                              )}

                              {/* Batch Yield */}
                              {visibleColumns.yield && (
                                <td className={`text-center ${densityPadding}`}>
                                  <span className="font-bold text-[#1d1c17] font-mono">
                                    {yieldQty} {yieldQty === 1 ? 'Portion' : 'Portions'}
                                  </span>
                                </td>
                              )}

                              {/* Ingredient Count */}
                              {visibleColumns.ingredients && (
                                <td className={`text-center ${densityPadding}`}>
                                  <span className="px-2 py-0.5 rounded-full bg-[#ece8e0] text-[#5f5e5e] font-semibold text-xs">
                                    {ingredientCount} {ingredientCount === 1 ? 'Ingredient' : 'Ingredients'}
                                  </span>
                                </td>
                              )}

                              {/* Theoretical Cost & Portion Cost */}
                              {visibleColumns.cost && (
                                <td className={`text-right ${densityPadding}`}>
                                  <p className="font-bold font-mono text-[#ae001a] text-sm">
                                    ${portionCost.toFixed(4)} <span className="text-[10px] font-normal text-secondary">/ portion</span>
                                  </p>
                                  <span className="text-[10px] font-mono text-secondary">
                                    Total: ${totalCost.toFixed(4)}
                                  </span>
                                </td>
                              )}

                              {/* Status Badge */}
                              {visibleColumns.status && (
                                <td className={`text-center ${densityPadding}`}>
                                  <span
                                    className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase ${
                                      recIsActive
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-zinc-100 text-zinc-600'
                                    }`}
                                  >
                                    {recIsActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                              )}

                              {/* Actions */}
                              {visibleColumns.actions && (
                                <td className={`text-center ${densityPadding}`}>
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenView(rec)}
                                      className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] rounded hover:bg-[#f2ede5] transition-colors cursor-pointer"
                                      title="View Formula Lines"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">
                                        visibility
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEdit(rec)}
                                      className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] rounded hover:bg-[#f2ede5] transition-colors cursor-pointer"
                                      title="Edit Recipe"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRecipe(rec.id)}
                                      className="p-1.5 text-[#5f5e5e] hover:text-[#ba1a1a] rounded hover:bg-red-50 transition-colors cursor-pointer"
                                      title="Delete Recipe"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">
                                        delete
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
              )}
            </>
          );
        })()}

        <TablePaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredRecipes.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      </div>



      {/* Quick Links Navigational Hub (Sprint 25 Story 4114) */}
      <StockQuickLinks current="recipes" onNavigate={onNavigate} />

      {/* Interactive Drawer to Create / Edit Recipes */}
      {isDrawerOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex justify-end overflow-hidden">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 z-[99999]"
              onClick={() => setIsDrawerOpen(false)}
            />

            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-[#e8e2d8] animate-slide-in font-sans z-[100000]">

              {/* Header Drawer */}
              <div className="bg-[#222222] p-6 text-white flex justify-between items-center shrink-0">
                <div>
                  <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest block mb-0.5">
                    Recipe & BOM Formula Specification
                  </span>
                  <h3 className="font-black text-lg uppercase tracking-tight">
                    {drawerMode === 'add'
                      ? 'Add Recipe Formula'
                      : drawerMode === 'edit'
                      ? 'Edit Recipe Formula'
                      : 'Recipe Details'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-white/70 hover:text-white p-1 rounded cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              {/* Body Drawer */}
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                {drawerMode === 'view' && selectedRecipe ? (
                  <div className="flex flex-col gap-5 text-left">
                    <div className="bg-[#fcfbf9] border border-[#e8e2d8] p-4 rounded-lg flex flex-col gap-2">
                      <span className="text-xs font-bold text-gray-500 uppercase">
                        Finished Menu Item
                      </span>
                      <p className="font-black text-base text-[#1d1c17]">
                        {selectedRecipe.finishedProduct?.name || `Product #${selectedRecipe.finishedProductId}`}
                      </p>
                      <p className="text-xs text-[#5f5e5e] font-mono">
                        SKU: {selectedRecipe.finishedProduct?.sku || 'N/A'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="font-bold text-xs uppercase text-[#1d1c17]">
                        Bill of Materials (BOM) Lines
                      </h4>
                      <div className="border border-[#e8e2d8] rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-[#ece8e0] text-[#5f5e5e] font-bold uppercase">
                            <tr>
                              <th className="p-3">Ingredient</th>
                              <th className="p-3 text-right">Required Quantity</th>
                              <th className="p-3 text-right">Unit Cost (Base)</th>
                              <th className="p-3 text-right">Line Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e8e2d8]">
                            {(selectedRecipe.lines || []).map((l, i) => {
                              const mat =
                                l.rawMaterial ||
                                supplies.find(
                                  (s) => s.id === l.rawMaterialId || s.id === l.supplyProductId
                                );
                              const qty = Number(l.quantityPerSoldUnit || l.quantity || 0);
                              const baseCost = Number(mat?.cost_per_unit || mat?.average_cost || 0);
                              const convFactor = Number(mat?.conversion_factor ?? 1) || 1;
                              const lineCost = qty * (baseCost / convFactor);
                              const pUnit = mat?.purchase_unit || mat?.unit || 'unit';
                              const cUnit = l.unitOfMeasure || mat?.consumption_unit || mat?.unit || 'GRAM';
                              return (
                                <tr key={i}>
                                  <td className="p-3 font-bold text-[#1d1c17]">
                                    {mat?.name || 'Unknown Supply'}
                                  </td>
                                  <td className="p-3 text-right font-mono font-bold">
                                    {qty} {cUnit}
                                  </td>
                                  <td className="p-3 text-right font-mono text-[#5f5e5e] text-[11px]">
                                    ${baseCost.toFixed(4)} <span className="text-[10px]">/{pUnit}</span>
                                  </td>
                                  <td className="p-3 text-right font-mono font-bold text-[#ae001a]">
                                    ${lineCost.toFixed(4)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form id="recipe-form" onSubmit={handleSaveSubmit} className="flex flex-col gap-5 text-left">
                    {/* Drawer Error Alert */}
                    {drawerError && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-center gap-2 font-semibold">
                        <span className="material-symbols-outlined text-red-600 text-base">error</span>
                        <div className="flex-1">
                          <p className="font-bold text-red-900">Could not save recipe</p>
                          <p className="mt-0.5 text-[#ae001a]">{drawerError}</p>
                        </div>
                      </div>
                    )}

                    {/* Duplicates Alert */}
                    {formDuplicateWarning && (
                      <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg flex items-center gap-2 font-semibold">
                        <span className="material-symbols-outlined text-amber-600 text-base">warning</span>
                        <span>{formDuplicateWarning}</span>
                      </div>
                    )}

                    {/* Header Fields: Name (required, max 150 chars) */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[#1d1c17] uppercase">
                        Recipe Formula Name *
                      </label>
                      <input
                        type="text"
                        maxLength={150}
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        required
                        placeholder="e.g. Classic Beef Burger Production Formula"
                        className="bg-[#fcfbf9] text-xs font-bold px-3 py-2.5 border border-[#e8e2d8] rounded-lg outline-none focus:border-[#ae001a]"
                      />
                    </div>

                    {/* Finished Product & Variant Dropdowns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#1d1c17] uppercase">
                          Finished Product *
                        </label>
                        <select
                          value={formProductId}
                          onChange={(e) => {
                            const newProdId = e.target.value;
                            setFormProductId(newProdId);
                            setFormVariantId('');
                            if (newProdId && !formName) {
                              const foundProd = products.find((p) => String(p.id) === String(newProdId));
                              if (foundProd) {
                                setFormName(`${foundProd.name} Formula`);
                              }
                            }
                          }}
                          disabled={drawerMode === 'edit'}
                          required
                          className="bg-[#fcfbf9] text-xs font-semibold px-3 py-2.5 border border-[#e8e2d8] rounded-lg outline-none focus:border-[#ae001a]"
                        >
                          <option value="">(Select Finished Menu Item / Product *)</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku}) - Price: ${Number(p.basePrice).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#1d1c17] uppercase">
                          Finished Variant
                        </label>
                        <select
                          value={formVariantId}
                          onChange={(e) => setFormVariantId(e.target.value)}
                          disabled={!formProductId || drawerMode === 'edit'}
                          className="bg-[#fcfbf9] text-xs font-semibold px-3 py-2.5 border border-[#e8e2d8] rounded-lg outline-none focus:border-[#ae001a]"
                        >
                          <option value="">(Optional - Standard Base Variant)</option>
                          {(() => {
                            const selectedProd = products.find((p) => String(p.id) === formProductId);
                            return (selectedProd?.variants || []).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} ({v.sku || 'N/A'}) - Price: ${Number(v.price || 0).toFixed(2)}
                              </option>
                            ));
                          })()}
                        </select>
                      </div>
                    </div>

                    {/* Batch Yield & Status */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#1d1c17] uppercase">
                          Batch Yield (Portions / Units) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={formYieldQty}
                          onChange={(e) => setFormYieldQty(Math.max(1, Number(e.target.value)))}
                          required
                          className="bg-[#fcfbf9] text-xs font-bold px-3 py-2 border border-[#e8e2d8] rounded-lg outline-none focus:border-[#ae001a]"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#1d1c17] uppercase">
                          Status
                        </label>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs font-semibold text-[#1d1c17]">
                          <input
                            type="checkbox"
                            checked={formIsActive}
                            onChange={(e) => setFormIsActive(e.target.checked)}
                            className="accent-[#ae001a] w-4 h-4"
                          />
                          Active Recipe Formula
                        </label>
                      </div>
                    </div>

                    {/* Real-Time Theoretical Cost Summary Panel */}
                    <div className="bg-[#222222] text-white p-4 rounded-lg flex flex-wrap justify-between items-center gap-4">
                      <div>
                        <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider block">
                          Real-Time Theoretical Recipe Cost
                        </span>
                        <p className="text-xl font-black text-white font-mono mt-0.5">
                          ${totalTheoreticalCost.toFixed(4)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider block">
                          Cost per Portion / Yield
                        </span>
                        <p className="text-sm font-bold text-amber-400 font-mono mt-0.5">
                          ${(totalTheoreticalCost / (formYieldQty || 1)).toFixed(4)}
                        </p>
                      </div>
                    </div>

                    {/* Ingredients / BOM Lines Matrix */}
                    <div className="flex flex-col gap-3 pt-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-xs uppercase text-[#1d1c17]">
                          Recipe Ingredients Matrix (BOM) *
                        </h4>
                        <button
                          type="button"
                          onClick={handleAddFormLine}
                          className="px-3 py-1 bg-[#ece8e0] hover:bg-[#e8e2d8] text-[#1d1c17] text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">add</span>
                          Add Ingredient Line
                        </button>
                      </div>

                      <div className="flex flex-col gap-3">
                        {formLines.map((line, idx) => {
                          const mat = supplies.find((s) => String(s.id) === String(line.raw_material_id));
                          const lineCost = calculateLineCostContribution(line.raw_material_id, line.quantity);

                          return (

                            <div
                              key={idx}
                              className="grid grid-cols-12 gap-3 items-center bg-[#fcfbf9] border border-[#e8e2d8] p-3 rounded-lg hover:border-[#ae001a]/40 transition-colors"
                            >
                              <div className="col-span-5 flex flex-col gap-1 text-left">
                                <label className="text-[10px] font-bold text-[#5f5e5e] uppercase">
                                  Raw Material
                                </label>
                                <select
                                  value={line.raw_material_id}
                                  onChange={(e) =>
                                    handleFormLineChange(idx, 'raw_material_id', e.target.value)
                                  }
                                  required
                                  className="bg-white text-xs px-2.5 py-1.5 border border-[#e8e2d8] rounded outline-none focus:border-[#ae001a]"
                                >
                                  <option value="" disabled>
                                    Select raw material...
                                  </option>
                                  {supplies.map((s) => {
                                    const isSelectedInOtherRow = formLines.some(
                                      (other, oIdx) => oIdx !== idx && String(other.raw_material_id) === String(s.id)
                                    );
                                    const sCost = Number(s.average_cost ?? s.cost_per_unit ?? 0);
                                    const sConv = Number(s.conversion_factor ?? 1) || 1;
                                    const sConsCost = sCost / sConv;
                                    const pUnit = s.purchase_unit || s.unit || 'unit';
                                    const cUnit = s.consumption_unit || s.unit || 'unit';
                                    const costLabel = sConv !== 1 && pUnit !== cUnit
                                      ? `$${sCost.toFixed(4)}/${pUnit} ($${sConsCost.toFixed(4)}/${cUnit})`
                                      : `$${sCost.toFixed(4)}/${cUnit}`;
                                    return (
                                      <option
                                        key={s.id}
                                        value={s.id}
                                        disabled={isSelectedInOtherRow}
                                      >
                                        {s.name} ({s.code}) - Cost: {costLabel} {isSelectedInOtherRow ? '(Added)' : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              <div className="col-span-3 flex flex-col gap-1 text-left">
                                <label className="text-[10px] font-bold text-[#5f5e5e] uppercase">
                                  Qty ({mat?.consumption_unit || mat?.unit || 'Units'})
                                </label>
                                <input
                                  type="number"
                                  min="0.0001"
                                  step="any"
                                  value={line.quantity}
                                  onChange={(e) =>
                                    handleFormLineChange(idx, 'quantity', Math.max(0.0001, Number(e.target.value)))
                                  }
                                  required
                                  className="bg-white text-xs px-2.5 py-1.5 border border-[#e8e2d8] rounded outline-none focus:border-[#ae001a] font-mono font-bold"
                                />
                              </div>

                              <div className="col-span-3 flex flex-col gap-1 text-right">
                                <label className="text-[10px] font-bold text-[#5f5e5e] uppercase">
                                  Live Contribution
                                </label>
                                <div className="px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 font-mono font-bold truncate text-right">
                                  ${lineCost.toFixed(4)}
                                </div>
                              </div>

                              <div className="col-span-1 flex justify-center pt-3">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFormLine(idx)}
                                  className="w-7 h-7 rounded-full border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50 cursor-pointer"
                                  title="Remove line"
                                >
                                  <span className="material-symbols-outlined text-sm">delete_outline</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </form>

                )}
              </div>

              {/* Footer Drawer */}
              {drawerMode !== 'view' && (
                <div className="bg-[#fcfbf9] p-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="px-4 py-2 border border-[#e8e2d8] hover:bg-gray-100 text-[#5f5e5e] font-bold text-xs uppercase rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="recipe-form"
                    className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white font-bold text-xs uppercase rounded shadow-sm cursor-pointer"
                  >
                    Save Recipe Formula
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default RecipesView;
