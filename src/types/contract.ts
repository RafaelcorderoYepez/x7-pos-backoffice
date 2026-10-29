// Types of collaborator contract: the employment agreement that Legal audits and of which the
// payroll draws its figures.
//
// The backend stores two different things under similar names and it is advisable not to mix them:
//   · `employment_type` — the employment relationship (full-time, part-time, temporary...).
//     It is what history calls "contract type" and what is painted as a pill.
//   · `contract_type` — the payroll model (hourly | salary | mixed). He consumes it
//     payment engine and is derived only from the chosen frequency, so the form does not
//     asks for it.
// `wage_rate` is the agreed amount for a period and the backend distributes it between
// `hourly_rate` and `base_salary` according to `pay_frequency`.

// ================= Employment relationship =================

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'temporary'
  | 'freelance'
  | 'internship';

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  'full_time',
  'part_time',
  'temporary',
  'freelance',
  'internship',
];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-Time',
  part_time: 'Part-Time',
  temporary: 'Temporary',
  freelance: 'Freelance',
  internship: 'Internship',
};

export const EMPLOYMENT_TYPE_BADGE_STYLES: Record<EmploymentType, string> = {
  full_time: 'bg-[#1d1c17]/5 text-[#1d1c17]',
  part_time: 'bg-blue-500/10 text-blue-700',
  temporary: 'bg-amber-500/10 text-amber-700',
  freelance: 'bg-purple-500/10 text-purple-700',
  internship: 'bg-teal-500/10 text-teal-700',
};

export const isEmploymentType = (raw?: string | null): raw is EmploymentType =>
  EMPLOYMENT_TYPES.includes((raw ?? '') as EmploymentType);

export const normalizeEmploymentType = (raw?: string | null): EmploymentType => {
  const value = (raw ?? '').trim().toLowerCase().replace(/[\s-]/g, '_');
  return isEmploymentType(value) ? value : 'full_time';
};

export const employmentTypeLabel = (raw?: string | null): string =>
  EMPLOYMENT_TYPE_LABELS[normalizeEmploymentType(raw)];

export const employmentTypeBadgeStyle = (raw?: string | null): string =>
  EMPLOYMENT_TYPE_BADGE_STYLES[normalizeEmploymentType(raw)];

// ================= Payment Frequency =================

export type PayFrequency = 'hourly' | 'weekly' | 'biweekly' | 'monthly';

export const PAY_FREQUENCIES: PayFrequency[] = [
  'hourly',
  'weekly',
  'biweekly',
  'monthly',
];

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  hourly: 'Hourly',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

// Suffix with which the remuneration is read on the grid: "$22.50 / hr".
export const PAY_FREQUENCY_SUFFIXES: Record<PayFrequency, string> = {
  hourly: 'hr',
  weekly: 'week',
  biweekly: 'biweekly',
  monthly: 'month',
};

export const isPayFrequency = (raw?: string | null): raw is PayFrequency =>
  PAY_FREQUENCIES.includes((raw ?? '') as PayFrequency);

export const normalizePayFrequency = (raw?: string | null): PayFrequency => {
  const value = (raw ?? '').trim().toLowerCase();
  return isPayFrequency(value) ? value : 'monthly';
};

export const payFrequencyLabel = (raw?: string | null): string =>
  PAY_FREQUENCY_LABELS[normalizePayFrequency(raw)];

// ================= Compliance Status =================

// It is not a column: it is derived from `active` and `end_date` against the system date.
// To keep it would be to have two truths and one to grow old alone every night.
export type ContractStatus =
  | 'active'
  | 'pending_renewal'
  | 'expired'
  | 'terminated';

export const CONTRACT_STATUSES: ContractStatus[] = [
  'active',
  'pending_renewal',
  'expired',
  'terminated',
];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  active: 'Active',
  pending_renewal: 'Expiring Soon',
  expired: 'Expired',
  terminated: 'Terminated',
};

export const CONTRACT_STATUS_BADGE_STYLES: Record<ContractStatus, string> = {
  active: 'bg-green-500/10 text-green-700',
  pending_renewal: 'bg-amber-500/10 text-amber-700',
  expired: 'bg-red-500/10 text-red-700',
  terminated: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

// ================= Payroll model =================

export type PayrollModel = 'hourly' | 'salary' | 'mixed';

export const PAYROLL_MODEL_LABELS: Record<PayrollModel, string> = {
  hourly: 'Hourly',
  salary: 'Salaried',
  mixed: 'Mixed',
};

// ================= Entidades =================

export interface ContractCollaboratorRef {
  id: number;
  name: string;
  role: string;
}

export interface CollaboratorContract {
  id: number;
  company_id: number;
  merchant_id: number;
  collaborator_id: number;
  contract_type: PayrollModel;
  employment_type: EmploymentType;
  pay_frequency: PayFrequency;
  wage_rate: number;
  working_hours_per_week: number;
  document_url: string | null;
  document_name: string | null;
  base_salary: number;
  hourly_rate: number;
  overtime_multiplier: number;
  double_overtime_multiplier: number;
  tips_included_in_payroll: boolean;
  active: boolean;
  start_date: string;
  end_date: string | null;
  created_at?: string;
  updated_at?: string;
  collaborator?: ContractCollaboratorRef | null;
}

// A recorded amendment: a field, its old value, and the new value.
export interface ContractRevision {
  id: number;
  contract_id: number;
  field: string;
  previous_value: string | null;
  new_value: string | null;
  changed_by_user_id: number | null;
  created_at: string;
}

// ================= Write DTOs =================

export interface CreateContractDto {
  company_id: number;
  merchant_id: number;
  collaborator_id: number;
  employment_type: EmploymentType;
  pay_frequency: PayFrequency;
  wage_rate: number;
  working_hours_per_week: number;
  start_date: string;
  end_date?: string | null;
  active?: boolean;
  overtime_multiplier?: number;
  double_overtime_multiplier?: number;
  tips_included_in_payroll?: boolean;
}

// The amendment does not reallocate trade or business: that would change ownership of the entire agreement.
export type UpdateContractDto = Partial<
  Omit<CreateContractDto, 'company_id' | 'merchant_id'>
>;
