//src/services/saasService.ts
import type { SubscriptionPlan, CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto, Application, PlatformFeature, PlanApplication, CreatePlanApplicationDto, UpdatePlanApplicationDto, PlanFeature, CreatePlanFeatureDto, UpdatePlanFeatureDto, CompanySubscription, UpdateCompanySubscriptionDto } from '../types/subscription';
import type { CompanyRegistryItem, CompanyRegistryPayload, CompanyRegistryStatus } from '../types/company-registry';
import type { PlatformUser } from '../types/user';
import { saasRequest } from '../api/http';

// Las rutas de este servicio van sin barra inicial ('subscription-plan', 'features/3'...).
function saasApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return saasRequest<T>(`/${path}`, { method: 'GET', ...options }, 'Request failed. Please try again.');
}

// Los listados del backend paginan (10 por defecto, 100 como máximo): sin recorrer todas las
// páginas, Applications mostraba 10 de 28 y Plan Features 100 de las 116 del plan Executive.
const PAGE_SIZE = 100;

async function saasFetchAll<T>(path: string): Promise<T[]> {
  const separator = path.includes('?') ? '&' : '?';
  const items: T[] = [];
  for (let page = 1; ; page++) {
    // La mayoría de los módulos anidan la paginación en `pagination`; /users la pone en la raíz.
    const response = await saasApiFetch<{
      data: T[];
      pagination?: { totalPages: number };
      totalPages?: number;
    }>(`${path}${separator}page=${page}&limit=${PAGE_SIZE}`);
    items.push(...response.data);
    const totalPages = response.pagination?.totalPages ?? response.totalPages;
    if (totalPages === undefined || page >= totalPages) return items;
  }
}

const toPlan = (plan: SubscriptionPlan): SubscriptionPlan => ({
  ...plan,
  price: plan.price === null ? null : Number(plan.price),
});

export interface MerchantMetric {
  count: number;
  terminals: number;
}

export interface SaaSMetrics {
  totalMerchants: {
    value: number;
    growth: number;
    trend: number[]; // for the mini-chart
  };
  quickService: MerchantMetric;
  fullRestaurant: MerchantMetric;
  enterprise: MerchantMetric;
}

export interface RevenueData {
  amount: string;
  growthVsPrevYear: string;
  labels: string[];
  values: number[];
}

export interface RecentMerchant {
  id: string;
  name: string;
  joinedText: string;
  type: 'Quick Service' | 'Full Restaurant' | 'Enterprise';
  logoUrl?: string;
}

export interface ServiceHealth {
  status: 'operational' | 'degraded' | 'downtime';
  latency: number; // in more
  authUptime: string; // ej "99.998%"
  paymentBridge: 'Stable' | 'Degraded' | 'Down';
  cloudNodes: {
    active: number;
    total: number;
  };
  subServices: {
    apiLatency: 'operational' | 'degraded' | 'downtime';
    authUptime: 'operational' | 'degraded' | 'downtime';
    paymentBridge: 'operational' | 'degraded' | 'downtime';
    cloudNodes: 'operational' | 'degraded' | 'downtime';
  };
}

// Global flag to simulate test failures
let simulateApiFailure = false;

export const setSimulateApiFailure = (fail: boolean) => {
  simulateApiFailure = fail;
};

export const getSimulateApiFailure = () => simulateApiFailure;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const saasService = {
  async getMetrics(): Promise<SaaSMetrics> {
    await delay(600); // simulate network delay
    if (simulateApiFailure) {
      throw new Error('Failed to fetch SaaS metrics');
    }
    return {
      totalMerchants: {
        value: 2842,
        growth: 12.5,
        trend: [2100, 2250, 2400, 2350, 2600, 2750, 2842],
      },
      quickService: {
        count: 1120,
        terminals: 4480,
      },
      fullRestaurant: {
        count: 942,
        terminals: 7536,
      },
      enterprise: {
        count: 780,
        terminals: 15600,
      },
    };
  },

  async getRevenue(period: '1M' | '6M' | '1Y'): Promise<RevenueData> {
    await delay(500);
    if (simulateApiFailure) {
      throw new Error('Failed to fetch revenue data');
    }

    // Return dynamic data according to period
    switch (period) {
      case '1M':
        return {
          amount: '$410K',
          growthVsPrevYear: '+14.2% vs prev. month',
          labels: ['W1', 'W2', 'W3', 'W4'],
          values: [95000, 102000, 105000, 108000],
        };
      case '1Y':
        return {
          amount: '$8.4M',
          growthVsPrevYear: '+22.5% vs prev. year',
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          values: [550000, 580000, 620000, 680000, 710000, 750000, 780000, 810000, 830000, 850000, 880000, 920000],
        };
      case '6M':
      default:
        return {
          amount: '$4.2M',
          growthVsPrevYear: '+18.2% vs prev. year',
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          values: [580000, 620000, 680000, 710000, 750000, 860000],
        };
    }
  },

  async getRecentMerchants(): Promise<RecentMerchant[]> {
    await delay(400);
    if (simulateApiFailure) {
      throw new Error('Failed to fetch recent merchants');
    }
    return [
      {
        id: '1',
        name: 'The Copper Whisk',
        joinedText: 'Joined: 2 hours ago',
        type: 'Quick Service',
      },
      {
        id: '2',
        name: 'Lumière Bistro',
        joinedText: 'Joined: 5 hours ago',
        type: 'Full Restaurant',
      },
      {
        id: '3',
        name: 'Global Dining Group',
        joinedText: 'Joined: Yesterday',
        type: 'Enterprise',
        // Real restaurant image to replace googleusercontent placeholders
        logoUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=80&h=80&fit=crop&crop=faces&q=80',
      },
      {
        id: '4',
        name: 'Roast & Steam',
        joinedText: 'Joined: Yesterday',
        type: 'Quick Service',
      },
      {
        id: '5',
        name: 'Urban Bites HQ',
        joinedText: 'Joined: 2 days ago',
        type: 'Full Restaurant',
      },
    ];
  },

  async getHealthStatus(): Promise<ServiceHealth> {
    await delay(300);
    if (simulateApiFailure) {
      return {
        status: 'downtime',
        latency: 0,
        authUptime: '0.00%',
        paymentBridge: 'Down',
        cloudNodes: { active: 0, total: 142 },
        subServices: {
          apiLatency: 'downtime',
          authUptime: 'downtime',
          paymentBridge: 'downtime',
          cloudNodes: 'downtime',
        },
      };
    }

    // Simulate very sporadic or controlled random degradation to display the yellow/red dot
    // For practical demo purposes, let it be operational unless forced to fail.
    return {
      status: 'operational',
      latency: 24,
      authUptime: '99.998%',
      paymentBridge: 'Stable',
      cloudNodes: { active: 142, total: 142 },
      subServices: {
        apiLatency: 'operational',
        authUptime: 'operational',
        paymentBridge: 'operational',
        cloudNodes: 'operational',
      },
    };
  },

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const plans = await saasFetchAll<SubscriptionPlan>('subscription-plan');
    return plans.map(toPlan);
  },

  async createSubscriptionPlan(dto: CreateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const response = await saasApiFetch<{ data: SubscriptionPlan }>('subscription-plan', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return toPlan(response.data);
  },

  async updateSubscriptionPlan(id: number, dto: UpdateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const response = await saasApiFetch<{ data: SubscriptionPlan }>(
      `subscription-plan/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(dto),
      },
    );
    return toPlan(response.data);
  },

  async deleteSubscriptionPlan(id: number): Promise<SubscriptionPlan> {
    const response = await saasApiFetch<{ data: SubscriptionPlan }>(
      `subscription-plan/${id}`,
      { method: 'DELETE' },
    );
    return toPlan(response.data);
  },

  async getApplications(): Promise<Application[]> {
    return saasFetchAll<Application>('applications');
  },

  async updateApplication(
    app: Application,
    updates: Partial<{ name: string; description: string; category: string; status: 'active' | 'inactive' }>,
  ): Promise<Application> {
    const response = await saasApiFetch<{ data: Application }>(
      `applications/${app.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      },
    );
    return response.data;
  },

  async deleteApplication(id: number): Promise<Application> {
    const response = await saasApiFetch<{ data: Application }>(
      `applications/${id}`,
      { method: 'DELETE' },
    );
    return response.data;
  },

  async createApplication(dto: {
    name: string;
    description: string;
    category: string;
    status: 'active' | 'inactive';
  }): Promise<Application> {
    const response = await saasApiFetch<{ data: Application }>(
      'applications',
      {
        method: 'POST',
        body: JSON.stringify(dto),
      },
    );
    return response.data;
  },

  async getFeatures(): Promise<PlatformFeature[]> {
    return saasFetchAll<PlatformFeature>('features');
  },

  async createFeature(dto: {
    name: string;
    description: string;
    Unit: string;
    status: string;
  }): Promise<PlatformFeature> {
    const response = await saasApiFetch<{ data: PlatformFeature }>(
      'features',
      {
        method: 'POST',
        body: JSON.stringify(dto),
      },
    );
    return response.data;
  },

  async updateFeature(
    id: number,
    dto: Partial<{ name: string; description: string; Unit: string; status: string }>,
  ): Promise<PlatformFeature> {
    const response = await saasApiFetch<{ data: PlatformFeature }>(
      `features/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
    );
    return response.data;
  },

  async deleteFeature(id: number): Promise<PlatformFeature> {
    const response = await saasApiFetch<{ data: PlatformFeature }>(
      `features/${id}`,
      { method: 'DELETE' },
    );
    return response.data;
  },

  async getPlanApplications(planId: number): Promise<PlanApplication[]> {
    return saasFetchAll<PlanApplication>(`plan-applications?subscriptionPlanId=${planId}`);
  },

  async createPlanApplication(dto: CreatePlanApplicationDto): Promise<PlanApplication> {
    const response = await saasApiFetch<{ data: PlanApplication }>(
      'plan-applications',
      { method: 'POST', body: JSON.stringify(dto) },
    );
    return response.data;
  },

  async updatePlanApplication(id: number, dto: UpdatePlanApplicationDto): Promise<PlanApplication> {
    const response = await saasApiFetch<{ data: PlanApplication }>(
      `plan-applications/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
    );
    return response.data;
  },

  async getPlanFeatures(planId: number): Promise<PlanFeature[]> {
    return saasFetchAll<PlanFeature>(`plan-features?subscriptionPlanId=${planId}`);
  },

  async createPlanFeature(dto: CreatePlanFeatureDto): Promise<PlanFeature> {
    const response = await saasApiFetch<{ data: PlanFeature }>(
      'plan-features',
      { method: 'POST', body: JSON.stringify(dto) },
    );
    return response.data;
  },

  async updatePlanFeature(id: number, dto: UpdatePlanFeatureDto): Promise<PlanFeature> {
    const response = await saasApiFetch<{ data: PlanFeature }>(
      `plan-features/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
    );
    return response.data;
  },

  async deletePlanFeature(id: number): Promise<PlanFeature> {
    const response = await saasApiFetch<{ data: PlanFeature }>(
      `plan-features/${id}`,
      { method: 'DELETE' },
    );
    return response.data;
  },

  // ── Global Company Registry (SaaS Owner) ──────────────────────────────
  async listCompanies(): Promise<CompanyRegistryItem[]> {
    const response = await saasApiFetch<{ data: CompanyRegistryItem[] }>(
      'companies',
    );
    return response.data ?? [];
  },

  async createCompany(
    payload: CompanyRegistryPayload,
  ): Promise<CompanyRegistryItem> {
    const response = await saasApiFetch<{ data: CompanyRegistryItem }>(
      'companies',
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return response.data;
  },

  async updateCompany(
    id: number,
    payload: CompanyRegistryPayload,
  ): Promise<CompanyRegistryItem> {
    const response = await saasApiFetch<{ data: CompanyRegistryItem }>(
      `companies/${id}`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );
    return response.data;
  },

  async setCompanyStatus(
    id: number,
    status: CompanyRegistryStatus,
  ): Promise<CompanyRegistryItem> {
    const response = await saasApiFetch<{ data: CompanyRegistryItem }>(
      `companies/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    );
    return response.data;
  },

  // ── Global Users Directory (SaaS Owner) ───────────────────────────────
  // GET /users es solo para portal_admin: todos los usuarios de la plataforma.
  async listPlatformUsers(): Promise<PlatformUser[]> {
    return saasFetchAll<PlatformUser>('users');
  },

  async setPlatformUserActive(id: number, isActive: boolean): Promise<void> {
    await saasApiFetch<unknown>(`users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  },

  // ── Company subscriptions (SaaS Owner) ────────────────────────────────
  // La suscripción de la compañía es la que da el plan; merchant_subscription no decide el acceso.
  async listCompanySubscriptions(): Promise<CompanySubscription[]> {
    return saasFetchAll<CompanySubscription>('company-subscriptions');
  },

  async updateCompanySubscription(
    id: number,
    dto: UpdateCompanySubscriptionDto,
  ): Promise<CompanySubscription> {
    const response = await saasApiFetch<{ data: CompanySubscription }>(
      `company-subscriptions/${id}`,
      { method: 'PATCH', body: JSON.stringify(dto) },
    );
    return response.data;
  },
};
