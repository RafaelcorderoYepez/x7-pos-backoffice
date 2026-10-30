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

/**
 * The plan a company is subscribed to (GET /company-subscriptions). This is what grants
 * access: the login takes the latest active one whose end date has not passed.
 */
export interface CompanySubscription {
  id: number;
  company: { id: number; name: string };
  plan: { id: number; name: string };
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  status: 'active' | 'inactive';
  paymentMethod: string;
  /** Active but past its end date: the company has no access to the plan any more. */
  isExpired: boolean;
}

export interface UpdateCompanySubscriptionDto {
  planId?: number;
  status?: 'active' | 'inactive';
  startDate?: string;
  endDate?: string | null;
  renewalDate?: string | null;
  paymentMethod?: string;
}
