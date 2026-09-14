// Tipos del contrato de colaborador: el acuerdo laboral que Legal audita y del que la
// nómina saca sus cifras.
//
// El backend guarda dos cosas distintas bajo nombres parecidos y conviene no mezclarlas:
//   · `employment_type`  — la relación laboral (jornada completa, parcial, temporal…).
//     Es lo que la historia llama "contract type" y lo que se pinta como píldora.
//   · `contract_type`    — el modelo de nómina (hourly | salary | mixed). Lo consume el
//     motor de pagos y se deriva solo de la frecuencia elegida, así que el formulario no
//     lo pide.
// `wage_rate` es el importe pactado para un periodo y el backend lo reparte entre
// `hourly_rate` y `base_salary` según `pay_frequency`.

// ================= Relación laboral =================

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

// ================= Frecuencia de pago =================

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

// Sufijo con el que se lee la retribución en la parrilla: "$22.50 / hr".
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

// ================= Estado de cumplimiento =================

// No es una columna: se deriva de `active` y de `end_date` contra la fecha del sistema.
// Guardarlo sería tener dos verdades y que una envejeciera sola cada noche.
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

// ================= Modelo de nómina =================

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

// Una enmienda registrada: un campo, su valor anterior y el nuevo.
export interface ContractRevision {
  id: number;
  contract_id: number;
  field: string;
  previous_value: string | null;
  new_value: string | null;
  changed_by_user_id: number | null;
  created_at: string;
}

// ================= DTOs de escritura =================

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

// La enmienda no reasigna comercio ni empresa: eso cambiaría de dueño el acuerdo entero.
export type UpdateContractDto = Partial<
  Omit<CreateContractDto, 'company_id' | 'merchant_id'>
>;
