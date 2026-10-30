import { afterEach, describe, expect, it, vi } from 'vitest';
import { saasService } from './saasService';

// Una respuesta paginada como las de los listados del backend.
const page = <T,>(data: T[], pageNumber: number, totalPages: number) =>
  new Response(
    JSON.stringify({ data, pagination: { total: 0, page: pageNumber, limit: 100, totalPages } }),
  );

const requestedUrls = () =>
  vi.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url));

describe('saasService — listados paginados', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getFeatures recorre todas las páginas', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(page([{ id: 1 }, { id: 2 }], 1, 2))
      .mockResolvedValueOnce(page([{ id: 3 }], 2, 2));

    const features = await saasService.getFeatures();

    expect(features.map((f) => f.id)).toEqual([1, 2, 3]);
    expect(requestedUrls()).toEqual([
      expect.stringContaining('/features?page=1&limit=100'),
      expect.stringContaining('/features?page=2&limit=100'),
    ]);
  });

  it('getApplications pide de a 100 en vez del límite por defecto de 10', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(page([{ id: 1 }], 1, 1));

    await saasService.getApplications();

    expect(requestedUrls()).toEqual([expect.stringContaining('/applications?page=1&limit=100')]);
  });

  it('getPlanFeatures conserva el filtro del plan al paginar', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(page([{ id: 1 }], 1, 2))
      .mockResolvedValueOnce(page([{ id: 2 }], 2, 2));

    const planFeatures = await saasService.getPlanFeatures(3);

    expect(planFeatures).toHaveLength(2);
    expect(requestedUrls()).toEqual([
      expect.stringContaining('/plan-features?subscriptionPlanId=3&page=1&limit=100'),
      expect.stringContaining('/plan-features?subscriptionPlanId=3&page=2&limit=100'),
    ]);
  });

  it('getSubscriptionPlans deja en null el precio de un plan a medida', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      page(
        [
          { id: 1, name: 'Essential', price: '69.00', billingCycle: 'monthly' },
          { id: 3, name: 'Executive', price: null, billingCycle: 'annual', isCustomPricing: true },
        ],
        1,
        1,
      ),
    );

    const plans = await saasService.getSubscriptionPlans();

    expect(plans.map((p) => p.price)).toEqual([69, null]);
  });
});
