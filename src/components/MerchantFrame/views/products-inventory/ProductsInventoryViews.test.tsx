// Carga básica de las vistas de catálogo e inventario contra un backend falso: qué endpoints se
// piden (solo rutas que existen en el backend), que los datos llegan a la pantalla y cómo se
// comporta cada vista cuando falla la petición principal o una secundaria.
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsView } from './products/ProductsView';
import { CategoriesView } from './category/CategoriesView';
import { VariantsView } from './variants/VariantsView';
import { ModifiersView } from './modifiers/ModifiersView';
import { RecipesView } from './recipes/RecipesView';
import { RawMaterialsView } from './raw-materials/RawMaterialsView';
import { RawMaterialCategoriesView } from './category/RawMaterialCategoriesView';
import { LocationsView } from './stocks/locations/LocationsView';
import { StockInventoryView } from './stocks/items/StockInventoryView';
import { MovementsView } from './stocks/movements/MovementsView';
import { PurchaseOrdersView } from './purchase-order/PurchaseOrdersView';
import { ProductsInventoryHubView } from './ProductsInventoryHubView';
import { RawMaterialsHubView } from './RawMaterialsHubView';
import { calledRoutes, fakeBackend, jsonResponse } from '../../../../test/fetch';

// Some shared components (quick links, nav hubs) navigate with react-router.
const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

vi.mock('../../../../lib/auth-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/auth-storage')>()),
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
  getStoredUser: vi.fn(() => ({ id: 1, role: 'merchant_admin', merchant: { id: 3 } })),
}));

const fail = (message = 'Service down') => () => jsonResponse({ message }, 500);

const CATEGORY = { id: 5, name: 'Pizzas', isActive: true, parents: [] };
const PRODUCT = { id: 11, name: 'Margherita', sku: 'PZ-1', basePrice: 9.5, isActive: true, category: { id: 5, name: 'Pizzas' } };
const VARIANT = { id: 21, name: 'Family Size', sku: 'PZ-1-F', price: 14, isActive: true, product: { id: 11, name: 'Margherita' } };
const MODIFIER = { id: 31, name: 'Extra Cheese', priceDelta: 1.5, isActive: true, product: { id: 11, name: 'Margherita' } };
const RAW_MATERIAL = { id: 41, code: 'RM-1', name: 'Mozzarella', unit: 'KG', isActive: true, category: { id: 51, name: 'Dairy' } };
const RAW_CATEGORY = { id: 51, name: 'Dairy', is_active: true };
const LOCATION = { id: 61, name: 'Main Cold Room', isActive: true, isMainStorage: true };
const STOCK_ITEM = { id: 71, currentQty: 12, supply: { id: 41, name: 'Mozzarella', isActive: true }, location: { id: 61, name: 'Main Cold Room', isActive: true }, isActive: true };
const MOVEMENT = { id: 81, movementType: 'IN', quantity: 5, createdAt: '2026-10-01T10:00:00Z', item: { id: 71, name: 'Mozzarella' }, supply: { id: 41, name: 'Mozzarella' } };
const SUPPLIER = { id: 91, name: 'Dairy Bros', isActive: true };
const PURCHASE_ORDER = { id: 101, orderDate: '2026-10-01', status: 'DRAFT', supplier: { id: 91, name: 'Dairy Bros' }, totalAmount: 120 };
const RECIPE = { id: 111, name: 'Margherita Dough', finishedProductId: 11, lines: [], isActive: true };

let fetchMock: ReturnType<typeof fakeBackend>;
const stub = (routes: Parameters<typeof fakeBackend>[0]) => {
  fetchMock = fakeBackend(routes);
  vi.stubGlobal('fetch', fetchMock);
};

beforeEach(() => {
  // jsdom implementa scrollTo/scrollIntoView como no-op ruidoso: algunas vistas lo llaman al montar.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProductsView', () => {
  it('loads products and categories', async () => {
    stub({ '/products': { data: [PRODUCT] }, '/category': { data: [CATEGORY] } });
    render(<ProductsView />);
    expect(await screen.findByText('Margherita')).toBeInTheDocument();
  });

  it('shows the error state when a list fails', async () => {
    stub({ '/products': fail(), '/category': { data: [CATEGORY] } });
    render(<ProductsView />);
    expect(await screen.findByText(/Failed to load products/)).toBeInTheDocument();
  });
});

describe('CategoriesView', () => {
  it('loads categories and counts linked products', async () => {
    stub({ '/category': { data: [CATEGORY] }, '/products': { data: [PRODUCT] } });
    render(<CategoriesView />);
    expect(await screen.findByText('Pizzas')).toBeInTheDocument();
  });

  it('shows the error state when a list fails', async () => {
    stub({ '/category': fail(), '/products': { data: [] } });
    render(<CategoriesView />);
    expect(await screen.findByText(/Failed to load categories/)).toBeInTheDocument();
  });
});

describe('VariantsView', () => {
  it('loads variants and their products', async () => {
    stub({ '/variants': { data: [VARIANT] }, '/products': { data: [PRODUCT] } });
    render(<VariantsView />);
    expect(await screen.findByText('Family Size')).toBeInTheDocument();
  });

  it('shows the error state when a list fails', async () => {
    stub({ '/variants': fail(), '/products': { data: [] } });
    render(<VariantsView />);
    expect(await screen.findByText(/Failed to load variants/)).toBeInTheDocument();
  });
});

describe('ModifiersView', () => {
  it('loads modifiers and their products', async () => {
    stub({ '/modifiers': { data: [MODIFIER] }, '/products': { data: [PRODUCT] } });
    render(<ModifiersView />);
    expect(await screen.findByText('Extra Cheese')).toBeInTheDocument();
  });

  it('shows the error state when a list fails', async () => {
    stub({ '/modifiers': fail(), '/products': { data: [] } });
    render(<ModifiersView />);
    expect(await screen.findByText(/Failed to load modifiers/)).toBeInTheDocument();
  });
});

describe('RecipesView', () => {
  it('loads recipes, products and raw materials from the real routes only', async () => {
    stub({
      '/v1/recipes': [RECIPE],
      '/products': { data: [PRODUCT] },
      '/v1/inventory/raw-materials': { data: [RAW_MATERIAL] },
    });
    render(<RecipesView />);
    expect((await screen.findAllByText('Margherita Dough')).length).toBeGreaterThan(0);
    const routes = calledRoutes(fetchMock);
    expect(routes).toEqual(
      expect.arrayContaining(['GET /v1/recipes', 'GET /products', 'GET /v1/inventory/raw-materials']),
    );
    expect(routes).not.toContain('GET /v1/inventory/recipes');
  });
});

describe('RawMaterialsView', () => {
  it('loads raw materials with categories and stock', async () => {
    stub({
      '/v1/inventory/raw-materials': { data: [RAW_MATERIAL] },
      '/v1/raw-material-categories': { data: [RAW_CATEGORY] },
      '/v1/raw-material-stock/items': { data: [{ supplyId: 41, currentQty: 3 }] },
    });
    render(<RawMaterialsView />);
    expect(await screen.findByText('Mozzarella')).toBeInTheDocument();
  });

  it('still renders raw materials when categories and stock fail', async () => {
    stub({
      '/v1/inventory/raw-materials': { data: [RAW_MATERIAL] },
      '/v1/raw-material-categories': fail(),
      '/v1/raw-material-stock/items': fail(),
    });
    render(<RawMaterialsView />);
    expect(await screen.findByText('Mozzarella')).toBeInTheDocument();
  });

  it('shows the error state when the raw materials request fails', async () => {
    stub({
      '/v1/inventory/raw-materials': fail(),
      '/v1/raw-material-categories': { data: [] },
      '/v1/raw-material-stock/items': { data: [] },
    });
    render(<RawMaterialsView />);
    expect(await screen.findByText(/Could not load raw materials/)).toBeInTheDocument();
  });
});

describe('RawMaterialCategoriesView', () => {
  it('loads categories', async () => {
    stub({ '/v1/raw-material-categories': { data: [RAW_CATEGORY] } });
    render(<RawMaterialCategoriesView />);
    expect(await screen.findByText('Dairy')).toBeInTheDocument();
  });

  it('shows the error state when the request fails', async () => {
    stub({ '/v1/raw-material-categories': fail() });
    render(<RawMaterialCategoriesView />);
    expect(await screen.findByText(/Could not load categories/)).toBeInTheDocument();
  });
});

describe('LocationsView', () => {
  it('loads locations from /locations without probing the non-existent v1 route', async () => {
    stub({ '/locations': { data: [LOCATION] } });
    render(<LocationsView />);
    expect(await screen.findByText('Main Cold Room')).toBeInTheDocument();
    expect(calledRoutes(fetchMock)).not.toContain('GET /v1/inventory/locations');
  });

  it('shows the error state when the request fails', async () => {
    stub({ '/locations': fail() });
    render(<LocationsView />);
    expect(await screen.findByText(/Failed to load inventory locations/)).toBeInTheDocument();
  });
});

describe('StockInventoryView', () => {
  const catalogs = {
    '/locations': { data: [LOCATION] },
    '/v1/inventory/raw-materials': { data: [RAW_MATERIAL] },
  };

  it('loads stock items from the raw-material stock module', async () => {
    stub({ ...catalogs, '/v1/raw-material-stock/items': { data: [STOCK_ITEM] } });
    render(<StockInventoryView />);
    // The grid groups by location: one stocked line under the cold room.
    expect(await screen.findByText('1 item line')).toBeInTheDocument();
    expect(calledRoutes(fetchMock)).not.toContain('GET /items');
  });

  it('falls back to the legacy /items route when the v1 stock route fails', async () => {
    stub({ ...catalogs, '/v1/raw-material-stock/items': fail(), '/items': { data: [STOCK_ITEM] } });
    render(<StockInventoryView />);
    // The grid groups by location: one stocked line under the cold room.
    expect(await screen.findByText('1 item line')).toBeInTheDocument();
  });

  it('posts manual adjustments to /items/:id/adjust (the only route exposing it)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    stub({
      ...catalogs,
      '/v1/raw-material-stock/items': { data: [STOCK_ITEM] },
      'POST /items/71/adjust': () => jsonResponse({ data: { id: 71, currentQty: 20 } }),
    });
    render(<StockInventoryView />);
    await screen.findByText('1 item line');

    await userEvent.click(screen.getByTitle('Adjust Stock Manually'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } });
    await userEvent.type(screen.getByPlaceholderText('Enter reason for manual adjustment...'), 'Recount');
    await userEvent.click(screen.getByRole('button', { name: 'Save Adjustment' }));

    await waitFor(() => expect(calledRoutes(fetchMock)).toContain('POST /items/71/adjust'));
    expect(calledRoutes(fetchMock)).not.toContain('POST /v1/raw-material-stock/items/71/adjust');
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(JSON.parse(String(init?.body))).toEqual({ value: 20, type: 'absolute', reason: 'Recount' });
  });

  it('shows the error state when both stock routes fail', async () => {
    stub({ ...catalogs, '/v1/raw-material-stock/items': fail(), '/items': fail() });
    render(<StockInventoryView />);
    expect(await screen.findByText(/Failed to load stock control panel data/)).toBeInTheDocument();
  });
});

describe('MovementsView', () => {
  it('loads movements from the raw-material stock module', async () => {
    stub({
      '/v1/raw-material-stock/movements': { data: [MOVEMENT], total: 1 },
      '/v1/raw-material-stock/items': { data: [STOCK_ITEM] },
    });
    render(<MovementsView />);
    await waitFor(() =>
      expect(calledRoutes(fetchMock)).toContain('GET /v1/raw-material-stock/movements'),
    );
    expect(calledRoutes(fetchMock)).not.toContain('GET /movements');
  });

  it('falls back to the legacy /movements route when the v1 route fails', async () => {
    stub({
      '/v1/raw-material-stock/movements': fail(),
      '/movements': { data: [MOVEMENT], total: 1 },
      '/v1/raw-material-stock/items': { data: [STOCK_ITEM] },
    });
    render(<MovementsView />);
    await waitFor(() => expect(calledRoutes(fetchMock)).toContain('GET /movements'));
    expect(screen.queryByText('Error loading stock movements log')).not.toBeInTheDocument();
  });
});

describe('PurchaseOrdersView', () => {
  it('loads orders and the supplier, raw material and location catalogs', async () => {
    stub({
      '/v1/purchase-orders': { data: [PURCHASE_ORDER] },
      '/v1/inventory/suppliers': { data: [SUPPLIER] },
      '/v1/inventory/raw-materials': { data: [RAW_MATERIAL] },
      '/locations': { data: [LOCATION] },
    });
    render(<PurchaseOrdersView />);
    expect((await screen.findAllByText(/Dairy Bros/)).length).toBeGreaterThan(0);
    expect(calledRoutes(fetchMock)).not.toContain('GET /v1/inventory/locations');
  });

  it('shows the error state when the orders request fails', async () => {
    stub({
      '/v1/purchase-orders': fail(),
      '/v1/inventory/suppliers': { data: [] },
      '/v1/inventory/raw-materials': { data: [] },
      '/locations': { data: [] },
    });
    render(<PurchaseOrdersView />);
    expect(await screen.findByText(/Failed to load purchase orders/)).toBeInTheDocument();
  });
});

describe('ProductsInventoryHubView', () => {
  it('requests every catalog count', async () => {
    stub({
      '/products': { data: [PRODUCT, { ...PRODUCT, id: 12, category: null }] },
      '/category': { data: [CATEGORY] },
      '/variants': { data: [VARIANT] },
      '/modifiers': fail(),
    });
    render(<ProductsInventoryHubView />);
    await waitFor(() =>
      expect(calledRoutes(fetchMock)).toEqual(
        expect.arrayContaining(['GET /products', 'GET /category', 'GET /variants', 'GET /modifiers']),
      ),
    );
  });
});

describe('RawMaterialsHubView', () => {
  it('uses only routes that exist in the backend', async () => {
    stub({
      '/v1/inventory/raw-materials': { data: [RAW_MATERIAL] },
      '/v1/purchase-orders': { data: [PURCHASE_ORDER] },
      '/locations': { data: [LOCATION] },
      '/v1/raw-material-categories': { data: [RAW_CATEGORY] },
      '/v1/raw-material-stock/items': { data: [STOCK_ITEM] },
      '/v1/raw-material-stock/movements': { data: [MOVEMENT] },
    });
    render(<RawMaterialsHubView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(calledRoutes(fetchMock).sort()).toEqual(
      [
        'GET /locations',
        'GET /v1/inventory/raw-materials',
        'GET /v1/purchase-orders',
        'GET /v1/raw-material-categories',
        'GET /v1/raw-material-stock/items',
        'GET /v1/raw-material-stock/movements',
      ].sort(),
    );
  });
});
