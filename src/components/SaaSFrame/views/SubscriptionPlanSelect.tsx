import React from 'react';
import type { SubscriptionPlan } from '../../../types/subscription';

/** "Essential ($69)"; a custom-priced plan shows its price label instead of "$null". */
export function planOptionLabel(plan: SubscriptionPlan): string {
  const price = plan.price === null ? plan.priceLabel || 'Custom pricing' : `$${plan.price}`;
  return `${plan.name} (${price})`;
}

interface SubscriptionPlanSelectProps {
  plans: SubscriptionPlan[];
  value: number | undefined;
  onChange: (plan: SubscriptionPlan) => void;
}

/** Plan picker for the title bar of the per-plan views (Plan Applications, Plan Features). */
export const SubscriptionPlanSelect: React.FC<SubscriptionPlanSelectProps> = ({
  plans,
  value,
  onChange,
}) => (
  <div className="flex items-center gap-3">
    <label className="text-[11px] font-bold uppercase tracking-wider text-white/70">
      Select Plan:
    </label>
    <select
      aria-label="Select Plan"
      value={value ?? ''}
      onChange={(e) => {
        const selected = plans.find((p) => p.id === Number(e.target.value));
        if (selected) onChange(selected);
      }}
      className="bg-[#333333] text-white px-3 py-1.5 border border-white/10 rounded text-xs focus:border-[#d51f2c] focus:ring-1 focus:ring-[#d51f2c] outline-none cursor-pointer"
    >
      {plans.map((p) => (
        <option key={p.id} value={p.id}>
          {planOptionLabel(p)}
        </option>
      ))}
    </select>
  </div>
);
