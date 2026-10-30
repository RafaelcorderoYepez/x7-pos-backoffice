import React, { useEffect, useMemo, useState } from 'react';
import { saasService } from '../../../services/saasService';
import type {
  CompanySubscription,
  SubscriptionPlan,
  UpdateCompanySubscriptionDto,
} from '../../../types/subscription';
import {
  AppModal,
  FormField,
  ModalFormError,
  ModalFormFooter,
} from '../../MerchantFrame/shared/AppModal';

const ALL = 'all';
const HEADER_CLASS =
  'px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]';
const SELECT_CLASS =
  'text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] px-3 py-2 focus:outline-none focus:border-[#ae001a]';

interface SubscriptionForm {
  planId: string;
  status: 'active' | 'inactive';
  startDate: string;
  endDate: string;
  renewalDate: string;
  paymentMethod: string;
}

const toForm = (s: CompanySubscription): SubscriptionForm => ({
  planId: String(s.plan.id),
  status: s.status,
  startDate: s.startDate,
  endDate: s.endDate ?? '',
  renewalDate: s.renewalDate ?? '',
  paymentMethod: s.paymentMethod,
});

/** Only the fields that changed: the backend keeps everything else as it is. */
export function toUpdateDto(
  original: CompanySubscription,
  form: SubscriptionForm,
): UpdateCompanySubscriptionDto {
  const before = toForm(original);
  const dto: UpdateCompanySubscriptionDto = {};
  if (form.planId !== before.planId) dto.planId = Number(form.planId);
  if (form.status !== before.status) dto.status = form.status;
  if (form.startDate !== before.startDate) dto.startDate = form.startDate;
  if (form.endDate !== before.endDate) dto.endDate = form.endDate || null;
  if (form.renewalDate !== before.renewalDate) dto.renewalDate = form.renewalDate || null;
  if (form.paymentMethod.trim() !== before.paymentMethod) {
    dto.paymentMethod = form.paymentMethod.trim();
  }
  return dto;
}

function statusBadge(s: CompanySubscription): { label: string; className: string } {
  if (s.isExpired) return { label: 'Expired', className: 'bg-[#ae001a]/10 text-[#ae001a]' };
  return s.status === 'active'
    ? { label: 'Active', className: 'bg-green-500/10 text-green-600' }
    : { label: 'Inactive', className: 'bg-[#5f5e5e]/20 text-[#5f5e5e]' };
}

/**
 * Plan of each company. It is what grants access: the login takes the latest active
 * subscription whose end date has not passed, so an expired one leaves the company without
 * its plan.
 */
export const CompanySubscriptionsView: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<CompanySubscription[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [planFilter, setPlanFilter] = useState(ALL);
  const [editing, setEditing] = useState<CompanySubscription | null>(null);
  const [form, setForm] = useState<SubscriptionForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadSubscriptions = () => {
    setIsLoading(true);
    setFetchError(false);
    Promise.all([saasService.listCompanySubscriptions(), saasService.getSubscriptionPlans()])
      .then(([list, planList]) => {
        setSubscriptions(list);
        setPlans(planList);
      })
      .catch((err) => {
        setFetchError(true);
        const message = err instanceof Error ? err.message : 'Failed to load subscriptions';
        setToast({
          message:
            message === 'SESSION_EXPIRED'
              ? 'Session expired. Please refresh the page to sign in again.'
              : message,
          type: 'error',
        });
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadSubscriptions();
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return subscriptions.filter(
      (s) =>
        (!term || s.company.name.toLowerCase().includes(term)) &&
        (statusFilter === ALL ||
          (statusFilter === 'expired' ? s.isExpired : s.status === statusFilter && !s.isExpired)) &&
        (planFilter === ALL || String(s.plan.id) === planFilter),
    );
  }, [subscriptions, searchQuery, statusFilter, planFilter]);

  const expiredCount = subscriptions.filter((s) => s.isExpired).length;

  const openEdit = (subscription: CompanySubscription) => {
    setEditing(subscription);
    setForm(toForm(subscription));
    setFormError(null);
  };

  const closeEdit = () => {
    if (isSubmitting) return;
    setEditing(null);
    setForm(null);
    setFormError(null);
  };

  const updateField = <K extends keyof SubscriptionForm>(field: K, value: SubscriptionForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !form) return;
    if (!form.startDate) return setFormError('Start date is required');
    if (form.endDate && form.endDate < form.startDate) {
      return setFormError('End date cannot be before the start date');
    }
    if (!form.paymentMethod.trim()) return setFormError('Payment method is required');

    const dto = toUpdateDto(editing, form);
    if (Object.keys(dto).length === 0) {
      closeEdit();
      return;
    }

    setIsSubmitting(true);
    try {
      await saasService.updateCompanySubscription(editing.id, dto);
      setToast({ message: 'Subscription updated successfully', type: 'success' });
      setIsSubmitting(false);
      setEditing(null);
      setForm(null);
      loadSubscriptions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update the subscription');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-[#222222] px-6 py-4 flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          COMPANY SUBSCRIPTIONS
        </span>
        <span className="text-white/50 text-xs">
          {isLoading
            ? '...'
            : `${subscriptions.length} subscriptions${expiredCount ? ` · ${expiredCount} expired` : ''}`}
        </span>
      </div>

      <div className="bg-white border border-[#e8e2d8] overflow-hidden">
        {!isLoading && !fetchError && (
          <div className="px-4 py-3 border-b border-[#e8e2d8] bg-[#f8f3eb] flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search by company…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] placeholder:text-[#5f5e5e] focus:outline-none focus:border-[#ae001a]"
              />
            </div>
            <select
              aria-label="Plan filter"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value={ALL}>All Plans</option>
              {plans.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  {plan.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value={ALL}>All Statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        )}

        {isLoading && (
          <p className="px-6 py-12 text-center text-sm text-[#5f5e5e]">Loading subscriptions…</p>
        )}

        {fetchError && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm font-semibold text-[#5f5e5e]">
              The subscriptions could not be loaded.
            </p>
            <button
              type="button"
              onClick={loadSubscriptions}
              className="px-4 py-2 bg-[#222222] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#ae001a]"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !fetchError && filtered.length === 0 && (
          <p className="px-6 py-12 text-center text-sm font-semibold text-[#5f5e5e]">
            No subscriptions match your search criteria
          </p>
        )}

        {!isLoading && !fetchError && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className={HEADER_CLASS}>Company</th>
                  <th className={HEADER_CLASS}>Plan</th>
                  <th className={HEADER_CLASS}>Start</th>
                  <th className={HEADER_CLASS}>End</th>
                  <th className={HEADER_CLASS}>Renewal</th>
                  <th className={HEADER_CLASS}>Payment</th>
                  <th className={HEADER_CLASS}>Status</th>
                  <th className={`${HEADER_CLASS} text-center`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {filtered.map((s) => {
                  const badge = statusBadge(s);
                  return (
                    <tr key={s.id} className={s.status === 'active' ? '' : 'opacity-75'}>
                      <td className="px-6 py-4 text-sm font-bold text-[#1d1c17]">{s.company.name}</td>
                      <td className="px-6 py-4 text-sm text-[#1d1c17]">{s.plan.name}</td>
                      <td className="px-6 py-4 text-sm text-[#1d1c17]">{s.startDate}</td>
                      <td className="px-6 py-4 text-sm text-[#1d1c17]">{s.endDate ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-[#1d1c17]">{s.renewalDate ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-[#1d1c17]">{s.paymentMethod}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase ${badge.className}`}
                          title={
                            s.isExpired
                              ? 'Past its end date: the company has no access to its plan'
                              : undefined
                          }
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          aria-label={`Edit subscription of ${s.company.name}`}
                          className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && form && (
        <AppModal
          title="Edit Subscription"
          subtitle={editing.company.name}
          titleId="company-subscription-form-title"
          onClose={closeEdit}
          closeDisabled={isSubmitting}
          closeAriaLabel="Close subscription form"
        >
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
            {formError ? <ModalFormError message={formError} /> : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="subscription-plan"
                  className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                >
                  Plan
                </label>
                <select
                  id="subscription-plan"
                  value={form.planId}
                  onChange={(e) => updateField('planId', e.target.value)}
                  className={SELECT_CLASS}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={String(plan.id)}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="subscription-status"
                  className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                >
                  Status
                </label>
                <select
                  id="subscription-status"
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value as 'active' | 'inactive')}
                  className={SELECT_CLASS}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <FormField
                id="subscription-start"
                label="Start Date"
                type="date"
                value={form.startDate}
                onChange={(value) => updateField('startDate', value)}
                required
              />
              <FormField
                id="subscription-end"
                label="End Date"
                type="date"
                value={form.endDate}
                onChange={(value) => updateField('endDate', value)}
              />
              <FormField
                id="subscription-renewal"
                label="Renewal Date"
                type="date"
                value={form.renewalDate}
                onChange={(value) => updateField('renewalDate', value)}
              />
              <FormField
                id="subscription-payment"
                label="Payment Method"
                value={form.paymentMethod}
                onChange={(value) => updateField('paymentMethod', value)}
                required
              />
            </div>
            <ModalFormFooter
              onCancel={closeEdit}
              submitLabel={isSubmitting ? 'Saving…' : 'Save Changes'}
              isSubmitting={isSubmitting}
            />
          </form>
        </AppModal>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[110] px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-[#ae001a]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};
