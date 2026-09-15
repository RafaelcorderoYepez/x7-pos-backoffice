export type ShiftStatus = 'draft' | 'published' | 'confirmed' | 'absent';

export type CollaboratorRole =
  | 'Waitstaff'
  | 'Line Cook'
  | 'Bartender'
  | 'Cashier'
  | 'Supervisor';

export interface ShiftTemplatePreset {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  defaultHours: number;
  breakDuration: number;
}

export interface ShiftAssignment {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  role: CollaboratorRole;
  department: string;
  avatarUrl?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // e.g. "08:00 AM"
  endTime: string; // e.g. "04:00 PM"
  presetName: string;
  status: ShiftStatus;
  hours: number;
  breakDuration?: number; // Break duration in minutes
  assignedRole?: CollaboratorRole;
  notes?: string;
}

export interface Collaborator {
  id: string;
  name: string;
  role: CollaboratorRole;
  department: string;
  avatarUrl?: string;
  email?: string;
}

export interface CreateShiftAssignmentDto {
  collaboratorId: string;
  collaboratorName: string;
  role: CollaboratorRole;
  department: string;
  avatarUrl?: string;
  date: string;
  startTime: string;
  endTime: string;
  presetName: string;
  status?: ShiftStatus;
  hours: number;
  breakDuration?: number;
  assignedRole?: CollaboratorRole;
  notes?: string;
}

export interface UpdateShiftAssignmentDto {
  collaboratorId?: string;
  collaboratorName?: string;
  role?: CollaboratorRole;
  department?: string;
  avatarUrl?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  presetName?: string;
  status?: ShiftStatus;
  hours?: number;
  breakDuration?: number;
  assignedRole?: CollaboratorRole;
  notes?: string;
}

export interface ShiftRosterSummary {
  totalShifts: number;
  draftShifts: number;
  publishedShifts: number;
  confirmedShifts: number;
  totalPlannedHours: number;
  collaboratorsCount: number;
}

export type ShiftSwapStatus =
  | 'PENDING_PEER_ACCEPTANCE'
  | 'PENDING_SUPERVISOR_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PENDING_APPROVAL';

export interface ShiftSwapRequest {
  id: string; // e.g. "SWP-101"
  merchantId?: string;
  shiftId: string;
  requestingCollaboratorId: string;
  requestingCollaboratorName: string;
  requestingCollaboratorRole: CollaboratorRole;
  requestingAvatarUrl?: string;
  targetCollaboratorId: string;
  targetCollaboratorName: string;
  targetCollaboratorRole: CollaboratorRole;
  targetAvatarUrl?: string;
  targetShiftId?: string; // Optional for 2-way direct shift swap
  targetShiftDate?: string;
  targetStartTime?: string;
  targetEndTime?: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  requiredRole: CollaboratorRole;
  hours: number;
  reason: string;
  status: ShiftSwapStatus;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export type ShiftTradeRequest = ShiftSwapRequest;

export type OpenShiftAllocationMode = 'FIRST_COME_FIRST_SERVED' | 'REQUIRES_APPROVAL';

export type OpenShiftPickupStatus =
  | 'OPEN_FOR_PICKUP'
  | 'PENDING_SUPERVISOR_APPROVAL'
  | 'ASSIGNED'
  | 'CANCELLED';

export interface OpenShiftPickupRequest {
  id: string; // e.g. "REQ-501"
  openShiftId: string;
  collaboratorId: string;
  collaboratorName: string;
  collaboratorRole: CollaboratorRole;
  avatarUrl?: string;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes?: string;
}

export interface OpenShift {
  id: string; // Internal unique ID e.g. "ops-201"
  referenceId: string; // Display badge reference e.g. "OPS-201" (#OPS-201)
  merchantId?: string;
  collaboratorId: string | null; // null for unassigned open shift
  collaboratorName?: string | null;
  role: CollaboratorRole;
  department: string;
  zone: string; // e.g. "Patio Terrace", "Main Bar", "Kitchen Station 1"
  date: string; // YYYY-MM-DD
  startTime: string; // e.g. "11:00 AM"
  endTime: string; // e.g. "07:30 PM"
  presetName?: string;
  status: OpenShiftPickupStatus;
  hours: number;
  breakDuration?: number;
  hourlyRate: number; // e.g. 18.00
  estimatedGrossEarnings: number; // calculated hours * hourlyRate
  allocationMode: OpenShiftAllocationMode;
  createdAt: string;
  notes?: string;
  pickupRequests?: OpenShiftPickupRequest[];
}

export interface CreateOpenShiftDto {
  role: CollaboratorRole;
  department: string;
  zone: string;
  date: string;
  startTime: string;
  endTime: string;
  presetName?: string;
  hours: number;
  breakDuration?: number;
  hourlyRate: number;
  allocationMode: OpenShiftAllocationMode;
  notes?: string;
  merchantId?: string;
}

export interface OpenShiftFilterParams {
  merchant_id?: string;
  role?: CollaboratorRole | 'ALL';
  allocationMode?: OpenShiftAllocationMode | 'ALL';
  status?: OpenShiftPickupStatus | 'ALL';
  startDate?: string;
  endDate?: string;
  search?: string;
  zone?: string;
}

export interface HourlySalesProjection {
  hour: string; // e.g. "11:00 AM"
  sales: number;
  laborCost: number;
}

export interface DailyLaborForecast {
  date: string; // YYYY-MM-DD
  dayName: string; // e.g. "Monday"
  projectedSales: number;
  scheduledLaborCost: number;
  fohLaborCost: number;
  bohLaborCost: number;
  totalScheduledHours: number;
  laborCostPercentage: number; // (scheduledLaborCost / projectedSales) * 100
  hourlySalesProjections?: HourlySalesProjection[];
}

export interface CollaboratorPayrollBreakdown {
  collaboratorId: string;
  collaboratorName: string;
  role: CollaboratorRole;
  department: string;
  hourlyWage: number;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  regularPay: number;
  overtimePay: number; // 1.5x
  totalProjectedPay: number;
  overtimeCapWarning: boolean;
}

export interface LaborForecastingSummary {
  merchantId: string;
  startDate: string;
  endDate: string;
  targetLaborCostPercentage: number; // e.g. 22.0
  maxWeeklyLaborBudget: number; // e.g. 5000.00
  projectedLaborCostTotal: number;
  forecastedSalesRevenue: number;
  projectedLaborCostPercentage: number;
  targetVariance: number; // projected - target (e.g. +2.5%)
  budgetVarianceAmount: number; // projected - maxWeeklyLaborBudget (e.g. +$450.00)
  isOverBudget: boolean;
  dailyForecasts: DailyLaborForecast[];
  payrollBreakdown: CollaboratorPayrollBreakdown[];
}

export interface LaborForecastingFilterParams {
  merchantId?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateLaborBudgetTargetsDto {
  targetLaborCostPercentage?: number;
  maxWeeklyLaborBudget?: number;
}



