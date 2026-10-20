// Types of the Accounts Payable domain.
// Properties use snake_case to match REST API contract
// (GET /api/v1/accounts-payable/...) and with the rest of the inventory/supplier views.

// Lowercase values ​​to match backend enum
// (SupplierInvoiceStatus: pending | partially_paid | paid | cancelled).
// "Overdue" is not a persisted state: it is derived in the front via isPastDue().
export type SupplierInvoiceStatus =
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'cancelled';

// Ordered list of states to populate selects and validations without looping through an enum.
export const SUPPLIER_INVOICE_STATUSES: SupplierInvoiceStatus[] = [
  'pending',
  'partially_paid',
  'paid',
  'cancelled',
];

// Legible labels for badges and selectors.
export const SUPPLIER_INVOICE_STATUS_LABELS: Record<SupplierInvoiceStatus, string> = {
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

// ================= Document Types (AP Shared) =================

// document_type is free varchar(50) on the backend; the front offers this catalog
// closed on both paylines and assignments.
export type ApDocumentType = 'invoice' | 'debit_note' | 'adjustment' | 'advance';

export const AP_DOCUMENT_TYPES: ApDocumentType[] = [
  'invoice',
  'debit_note',
  'adjustment',
  'advance',
];

// Assignments point to debt documents: 'advance' does not apply as a destination.
export const AP_ALLOCATION_DOCUMENT_TYPES: ApDocumentType[] = [
  'invoice',
  'debit_note',
  'adjustment',
];

export const AP_DOCUMENT_TYPE_LABELS: Record<ApDocumentType, string> = {
  invoice: 'Invoice',
  debit_note: 'Debit Note',
  adjustment: 'Adjustment',
  advance: 'Advance Payment',
};

export const AP_DOCUMENT_TYPE_BADGE_STYLES: Record<ApDocumentType, string> = {
  invoice: 'bg-blue-500/10 text-blue-700',
  debit_note: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  adjustment: 'bg-amber-500/10 text-amber-700',
  advance: 'bg-purple-500/10 text-purple-700',
};

// The backend does not validate the catalog, so an unknown value drops to a badge
// neutral and to a readable label derived from the string itself.
export const documentTypeLabel = (type: string): string =>
  AP_DOCUMENT_TYPE_LABELS[type as ApDocumentType] ??
  type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const documentTypeBadgeStyle = (type: string): string =>
  AP_DOCUMENT_TYPE_BADGE_STYLES[type as ApDocumentType] ??
  'bg-[#ece8e0] text-[#1d1c17]';

// Minimum relational link to the supplier embedded in the invoice.
export interface InvoiceSupplierRef {
  id: number;
  name: string;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

// Minimum relational link to the inventory catalog product.
// Inventory variant of a product. Backend requires product_id + variant_id
// together by linking a line to inventory (for stock receipt).
export interface InvoiceVariantRef {
  id: number;
  name: string;
  sku?: string | null;
  isActive?: boolean;
}

export interface InvoiceProductRef {
  id: number;
  name: string;
  sku?: string | null;
  last_cost?: number | string | null;
  variants?: InvoiceVariantRef[];
}

// Minimum relational link to the parent invoice from a line.
export interface ItemInvoiceRef {
  id: number;
  invoice_number: string;
}

export interface SupplierInvoiceItem {
  id: number;
  invoice_id: number;
  invoice?: ItemInvoiceRef | null;
  product_id: number | null;
  variant_id?: number | null;
  product?: InvoiceProductRef | null;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  tax_amount: number | string;
  line_subtotal: number | string;
  line_total: number | string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface SupplierInvoice {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier?: InvoiceSupplierRef | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number | string;
  tax_total: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  balance_due: number | string;
  status: SupplierInvoiceStatus;
  notes?: string | null;
  items?: SupplierInvoiceItem[];
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

// ---- Write DTOs ----

export interface CreateSupplierInvoiceDto {
  supplier_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_total: number;
  total_amount: number; // Backend requires explicitly (= subtotal + tax_total).
  notes?: string | null;
  // company_id is injected into request body on submit (derived from session/JWT).
}

export type UpdateSupplierInvoiceDto = Partial<CreateSupplierInvoiceDto>;

export interface CreateSupplierInvoiceItemDto {
  invoice_id: number;
  product_id?: number | null;
  variant_id?: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_subtotal: number; // Required by the backend.
  tax_amount: number;
  line_total: number; // Required by the backend.
}

// ================= Supplier Credit Notes =================

// Lowercase values ​​to match backend enum
// (SupplierCreditNoteStatus: draft | issued | partially_applied | fully_applied | cancelled).
export type SupplierCreditNoteStatus =
  | 'draft'
  | 'issued'
  | 'partially_applied'
  | 'fully_applied'
  | 'cancelled';

export const SUPPLIER_CREDIT_NOTE_STATUSES: SupplierCreditNoteStatus[] = [
  'draft',
  'issued',
  'partially_applied',
  'fully_applied',
  'cancelled',
];

export const SUPPLIER_CREDIT_NOTE_STATUS_LABELS: Record<SupplierCreditNoteStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_applied: 'Partially Applied',
  fully_applied: 'Fully Applied',
  cancelled: 'Cancelled',
};

export interface SupplierCreditNote {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier?: InvoiceSupplierRef | null; // Resolved on the front end (the backend does not embed it).
  credit_note_number: string;
  issue_date: string;
  total_amount: number | string;
  applied_amount: number | string;
  status: SupplierCreditNoteStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  allocations?: SupplierPaymentAllocation[]; // Loaded separately for the detail drawer.
}

// Minimum relational link to the parent payment from a line or assignment.
// The backend does not embed it: it is resolved on the front end against /api/supplier-payments.
export interface ItemPaymentRef {
  id: number;
  payment_number: string;
}

// Minimum relational link to the credit note that finances an assignment.
export interface AllocationCreditNoteRef {
  id: number;
  credit_note_number: string;
}

// Application of a payment/credit note against a document (invoice).
// payment_id y credit_note_id son mutuamente excluyentes (XOR): exactamente uno
// is present — the backend rejects both or neither.
export interface SupplierPaymentAllocation {
  id: number;
  payment_id: number | null;
  payment?: ItemPaymentRef | null; // Resolved on the front.
  credit_note_id: number | null;
  credit_note?: AllocationCreditNoteRef | null; // Resolved on the front.
  supplier_id: number;
  document_number: string;
  document_type: string;
  allocated_amount: number | string;
  created_at?: string;
  deleted_at?: string | null;
}

// Funding origin of an assignment, derived from which id is reported.
export type AllocationSourceType = 'payment' | 'credit_note';

export const allocationSourceType = (
  a: Pick<SupplierPaymentAllocation, 'payment_id' | 'credit_note_id'>,
): AllocationSourceType => (a.credit_note_id != null ? 'credit_note' : 'payment');

// Body to create a payment→document assignment (invoice) against a supplier.
// Send ONLY one of payment_id / credit_note_id (the other goes null or omitted).
export interface CreateSupplierPaymentAllocationDto {
  payment_id?: number | null;
  credit_note_id?: number | null;
  supplier_id: number;
  document_number: string;
  document_type: string;
  allocated_amount: number;
}

export type UpdateSupplierPaymentAllocationDto =
  Partial<CreateSupplierPaymentAllocationDto>;

export interface CreateSupplierCreditNoteDto {
  supplier_id: number;
  credit_note_number: string;
  issue_date: string;
  total_amount: number;
  // company_id is injected by the view on submit (derived from the session/JWT).
}

export type UpdateSupplierCreditNoteDto = Partial<CreateSupplierCreditNoteDto> & {
  status?: SupplierCreditNoteStatus;
};

// ================= Supplier Payments (Disbursements) =================

// Lowercase values ​​to match backend enum
// (SupplierPaymentStatus: draft | posted | partially_allocated | fully_allocated | cancelled).
export type SupplierPaymentStatus =
  | 'draft'
  | 'posted'
  | 'partially_allocated'
  | 'fully_allocated'
  | 'cancelled';

export const SUPPLIER_PAYMENT_STATUSES: SupplierPaymentStatus[] = [
  'draft',
  'posted',
  'partially_allocated',
  'fully_allocated',
  'cancelled',
];

export const SUPPLIER_PAYMENT_STATUS_LABELS: Record<SupplierPaymentStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  partially_allocated: 'Partially Allocated',
  fully_allocated: 'Fully Allocated',
  cancelled: 'Voided', // The backend uses 'cancelled'; the UI shows it as "Voided" (spec).
};

// Methods offered in the filter (subset of the spec: Bank Transfer, Check, Credit Card, Cash).
export const SUPPLIER_PAYMENT_METHOD_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
];

// Payment breakdown line (breakdown items): what external document does it cover?
// each portion of the disbursement voucher.
export interface SupplierPaymentItem {
  id: number;
  payment_id: number;
  payment?: ItemPaymentRef | null; // Resolved on the front end (the backend does not embed it).
  document_number: string;
  document_type: string;
  amount: number | string;
  deleted_at?: string | null;
}

export interface CreateSupplierPaymentItemDto {
  payment_id: number;
  document_number: string;
  document_type: string;
  amount: number;
}

export type UpdateSupplierPaymentItemDto = Partial<CreateSupplierPaymentItemDto>;

// Statuses of the parent payment that freeze its breakdown lines (Posted Payment
// Immobility Lock). 'cancelled' is displayed as "Voided" in the UI.
const FROZEN_PAYMENT_STATUSES: SupplierPaymentStatus[] = [
  'posted',
  'fully_allocated',
  'cancelled',
];

// A payment is frozen if it has already been posted/voided or if it has an assigned amount
// (the latter also covers 'partially_allocated').
export const isPaymentFrozen = (
  p: Pick<SupplierPayment, 'status' | 'allocated_amount'>,
): boolean => {
  const allocated =
    typeof p.allocated_amount === 'number'
      ? p.allocated_amount
      : parseFloat(p.allocated_amount ?? '0');
  return (
    FROZEN_PAYMENT_STATUSES.includes(p.status) ||
    (!isNaN(allocated) && allocated > 0)
  );
};

// payment_method is free text on the backend; We offer common options in the form.
export const SUPPLIER_PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Card' },
  { value: 'wire', label: 'Wire' },
  { value: 'other', label: 'Other' },
];

export interface SupplierPayment {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier?: InvoiceSupplierRef | null; // Resolved on the front.
  payment_number: string;
  payment_date: string;
  payment_method: string;
  reference?: string | null;
  total_amount: number | string;
  allocated_amount: number | string;
  status: SupplierPaymentStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  allocations?: SupplierPaymentAllocation[];
}

export interface CreateSupplierPaymentDto {
  supplier_id: number;
  payment_number: string;
  payment_date: string;
  payment_method: string;
  reference?: string | null;
  total_amount: number;
  // company_id is injected by the view on submit (derived from the session/JWT).
}

export type UpdateSupplierPaymentDto = Partial<CreateSupplierPaymentDto> & {
  status?: SupplierPaymentStatus;
};

export type UpdateSupplierInvoiceItemDto = Partial<CreateSupplierInvoiceItemDto>;
