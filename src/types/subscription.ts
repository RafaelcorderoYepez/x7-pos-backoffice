//src/types/subscription.ts
// El backend acepta 'yearly' y 'annual' (el seed usa 'annual' para el plan Executive).
export type BillingCycle = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'annual';

export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  // null en los planes con precio a medida (isCustomPricing); se muestra priceLabel.
  price: number | null;
  billingCycle: BillingCycle;
  status: 'active' | 'inactive' | 'deleted';
  isCustomPricing?: boolean;
  priceLabel?: string | null;
}

export interface CreateSubscriptionPlanDto {
  name: string;
  description: string;
  price: number;
  billingCycle: BillingCycle;
  status: 'active';
}

export interface UpdateSubscriptionPlanDto {
  name?: string;
  description?: string;
  price?: number;
  billingCycle?: BillingCycle;
  status?: 'active' | 'inactive';
}

export interface CreatePlanApplicationDto {
  subscriptionPlan: number;
  application: number;
  limits: string;
  status: 'active';
}

export interface UpdatePlanApplicationDto {
  limits?: string;
  status?: 'active' | 'inactive';
}

export interface Application {
  id: number;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'inactive' | 'deleted';
}

export interface PlatformFeature {
  id: number;
  name: string;
  description: string;
  Unit: string;
  status: string;
}

export interface PlanApplication {
  id: number;
  subscriptionPlan: { id: number; name: string };
  application: { id: number; name: string; category: string };
  limits: string;
  status: string;
}

export interface PlanFeature {
  id: number;
  subscriptionPlan: { id: number; name: string };
  feature: { id: number; name: string; unit: string; description: string };
  limit_value: number;
  status: string;
}

export interface CreatePlanFeatureDto {
  subscriptionPlan: number;
  feature: number;
  limit_value: number;
  status: 'active';
}

export interface UpdatePlanFeatureDto {
  limit_value?: number;
  status?: 'active' | 'inactive';
}
