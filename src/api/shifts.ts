import { apiRequest, unwrapList, type MaybeEnvelopedList } from './http';
import type {
  ShiftAssignment,
  CreateShiftAssignmentDto,
  UpdateShiftAssignmentDto,
  Collaborator,
  ShiftTemplatePreset,
  ShiftSwapRequest,
  ShiftSwapStatus,
  OpenShift,
  CreateOpenShiftDto,
  OpenShiftFilterParams,
  LaborForecastingSummary,
  LaborForecastingFilterParams,
  UpdateLaborBudgetTargetsDto,
} from '../types/shifts';

export const SHIFT_PRESETS: ShiftTemplatePreset[] = [
  { id: 'p1', name: 'Morning Opening', startTime: '07:00 AM', endTime: '03:00 PM', defaultHours: 8, breakDuration: 30 },
  { id: 'p2', name: 'Mid-Day Support', startTime: '11:00 AM', endTime: '07:00 PM', defaultHours: 8, breakDuration: 30 },
  { id: 'p3', name: 'Peak Dinner', startTime: '04:00 PM', endTime: '11:00 PM', defaultHours: 7, breakDuration: 30 },
  { id: 'p4', name: 'Closing Shift', startTime: '05:00 PM', endTime: '01:00 AM', defaultHours: 8, breakDuration: 45 },
  { id: 'p5', name: 'Bar Night', startTime: '06:00 PM', endTime: '02:00 AM', defaultHours: 8, breakDuration: 45 },
];

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().toUpperCase();
  const isPM = cleaned.includes('PM');
  const isAM = cleaned.includes('AM');
  const rawTime = cleaned.replace(/AM|PM/g, '').trim();
  const parts = rawTime.split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export function parseShiftInterval(
  dateStr: string,
  startTimeStr: string,
  endTimeStr: string
): { startMs: number; endMs: number } {
  const startMin = parseTimeToMinutes(startTimeStr);
  let endMin = parseTimeToMinutes(endTimeStr);

  if (endMin <= startMin) {
    endMin += 24 * 60;
  }

  const baseDate = new Date(`${dateStr}T00:00:00`).getTime();
  return {
    startMs: baseDate + startMin * 60 * 1000,
    endMs: baseDate + endMin * 60 * 1000,
  };
}

export function findOverlappingShift(
  shifts: ShiftAssignment[],
  collaboratorId: string,
  dateStr: string,
  startTimeStr: string,
  endTimeStr: string,
  excludeShiftId?: string
): ShiftAssignment | undefined {
  const candidate = parseShiftInterval(dateStr, startTimeStr, endTimeStr);

  return shifts.find((s) => {
    if (s.collaboratorId !== collaboratorId) return false;
    if (excludeShiftId && s.id === excludeShiftId) return false;

    const existing = parseShiftInterval(s.date, s.startTime, s.endTime);
    return candidate.startMs < existing.endMs && existing.startMs < candidate.endMs;
  });
}

export function calculateProjectedWeeklyHours(
  shifts: ShiftAssignment[],
  collaboratorId: string,
  candidateHours: number,
  excludeShiftId?: string
): number {
  const existingSum = shifts
    .filter((s) => s.collaboratorId === collaboratorId && s.id !== excludeShiftId)
    .reduce((acc, s) => acc + (s.hours || 0), 0);

  return existingSum + candidateHours;
}

export async function fetchCollaborators(): Promise<Collaborator[]> {
  const data = await apiRequest<MaybeEnvelopedList<Collaborator>>(
    '/v1/collaborators',
    { method: 'GET' },
    'Failed to fetch collaborators.',
  );
  return unwrapList(data);
}

export async function fetchOpenShifts(
  params?: OpenShiftFilterParams
): Promise<OpenShift[]> {
  const query = new URLSearchParams();
  if (params?.merchant_id) query.set('merchant_id', params.merchant_id);
  if (params?.role && params.role !== 'ALL') query.set('role', params.role);
  if (params?.startDate) query.set('date_range_start', params.startDate);
  if (params?.endDate) query.set('date_range_end', params.endDate);

  const data = await apiRequest<MaybeEnvelopedList<OpenShift>>(
    `/v1/open-shifts?${query.toString()}`,
    { method: 'GET' },
    'Failed to fetch open shifts.',
  );
  return unwrapList(data);
}

export async function publishOpenShift(
  dto: CreateOpenShiftDto
): Promise<OpenShift> {
  const estimatedGrossEarnings = dto.hours * dto.hourlyRate;
  return apiRequest<OpenShift>(
    '/v1/open-shifts',
    {
      method: 'POST',
      body: JSON.stringify({
        ...dto,
        collaborator_id: null,
        status: 'OPEN_FOR_PICKUP',
        estimated_gross_earnings: estimatedGrossEarnings,
      }),
    },
    'Failed to publish open shift.',
  );
}

export async function claimOpenShift(
  shiftId: string,
  collaboratorId: string,
  collaboratorName: string,
  userRole: string,
  userWeeklyHours = 0,
  _userShifts: ShiftAssignment[] = []
): Promise<{
  openShift: OpenShift;
  shiftAssignment?: ShiftAssignment;
  overtimeTriggered: boolean;
  message: string;
}> {
  void _userShifts;
  return apiRequest(
    `/v1/open-shifts/${shiftId}/claim`,
    {
      method: 'POST',
      body: JSON.stringify({
        collaborator_id: collaboratorId,
        collaborator_name: collaboratorName,
        user_role: userRole,
        user_weekly_hours: userWeeklyHours,
      }),
    },
    'Failed to claim open shift.',
  );
}

export async function approveOpenShiftPickup(
  shiftId: string,
  requestId: string,
  approvedBy = 'Carlos Mendoza (Supervisor)'
): Promise<{ openShift: OpenShift; shiftAssignment: ShiftAssignment }> {
  return apiRequest<{ openShift: OpenShift; shiftAssignment: ShiftAssignment }>(
    `/v1/open-shifts/${shiftId}/pickup-requests/${requestId}/approve`,
    { method: 'POST', body: JSON.stringify({ approved_by: approvedBy }) },
    'Failed to approve pickup request.',
  );
}

export async function rejectOpenShiftPickup(
  shiftId: string,
  requestId: string,
  reason: string,
  rejectedBy = 'Carlos Mendoza (Supervisor)'
): Promise<OpenShift> {
  return apiRequest<OpenShift>(
    `/v1/open-shifts/${shiftId}/pickup-requests/${requestId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, rejected_by: rejectedBy }),
    },
    'Failed to reject pickup request.',
  );
}

export async function cancelOpenShift(shiftId: string): Promise<boolean> {
  await apiRequest<void>(
    `/v1/open-shifts/${shiftId}`,
    { method: 'DELETE' },
    'Failed to cancel open shift.',
  );
  return true;
}

export async function fetchShiftAssignments(
  startDate?: string,
  endDate?: string
): Promise<ShiftAssignment[]> {
  const query = new URLSearchParams();
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  const data = await apiRequest<MaybeEnvelopedList<ShiftAssignment>>(
    `/shifts?${query.toString()}`,
    { method: 'GET' },
    'Failed to fetch shift assignments.',
  );
  return unwrapList(data);
}

export async function createShiftAssignment(
  dto: CreateShiftAssignmentDto
): Promise<ShiftAssignment> {
  return apiRequest<ShiftAssignment>(
    '/shifts',
    { method: 'POST', body: JSON.stringify(dto) },
    'Failed to create shift assignment.',
  );
}

export async function updateShiftAssignment(
  id: string,
  dto: UpdateShiftAssignmentDto
): Promise<ShiftAssignment> {
  return apiRequest<ShiftAssignment>(
    `/shifts/${id}`,
    { method: 'PATCH', body: JSON.stringify(dto) },
    'Failed to update shift assignment.',
  );
}

export async function deleteShiftAssignment(id: string): Promise<boolean> {
  await apiRequest<void>(
    `/shifts/${id}`,
    { method: 'DELETE' },
    'Failed to delete shift assignment.',
  );
  return true;
}

export async function publishWeeklyRoster(
  startDate: string,
  endDate: string
): Promise<{ updatedCount: number; shifts: ShiftAssignment[] }> {
  return apiRequest<{ updatedCount: number; shifts: ShiftAssignment[] }>(
    '/shifts/publish',
    { method: 'POST', body: JSON.stringify({ startDate, endDate }) },
    'Failed to publish weekly roster.',
  );
}

export interface ShiftSwapFilterParams {
  merchant_id?: string;
  status?: ShiftSwapStatus | 'ALL';
  startDate?: string;
  endDate?: string;
  requester_id?: string;
  recipient_id?: string;
  search?: string;
}

export async function fetchShiftSwapRequests(
  params?: ShiftSwapFilterParams
): Promise<ShiftSwapRequest[]> {
  const query = new URLSearchParams();
  if (params?.merchant_id) query.set('merchant_id', params.merchant_id);
  if (params?.status && params.status !== 'ALL') query.set('status', params.status);
  if (params?.startDate) query.set('startDate', params.startDate);
  if (params?.endDate) query.set('endDate', params.endDate);
  if (params?.requester_id) query.set('requester_id', params.requester_id);
  if (params?.recipient_id) query.set('recipient_id', params.recipient_id);

  const data = await apiRequest<MaybeEnvelopedList<ShiftSwapRequest>>(
    `/v1/shift-swaps?${query.toString()}`,
    { method: 'GET' },
    'Failed to fetch shift swaps.',
  );
  return unwrapList(data);
}

export async function approveShiftSwapRequest(
  swapId: string,
  approvedBy = 'Carlos Mendoza (Floor Manager)'
): Promise<{ swap: ShiftSwapRequest; shift: ShiftAssignment }> {
  return apiRequest<{ swap: ShiftSwapRequest; shift: ShiftAssignment }>(
    `/v1/shift-swaps/${swapId}/approve`,
    { method: 'POST', body: JSON.stringify({ approved_by: approvedBy }) },
    'Failed to approve shift swap.',
  );
}

export async function rejectShiftSwapRequest(
  swapId: string,
  reason: string,
  rejectedBy = 'Carlos Mendoza (Supervisor)'
): Promise<ShiftSwapRequest> {
  return apiRequest<ShiftSwapRequest>(
    `/v1/shift-swaps/${swapId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, rejected_by: rejectedBy }),
    },
    'Failed to reject shift swap.',
  );
}

export async function createShiftSwapRequest(
  dto: Omit<ShiftSwapRequest, 'id' | 'createdAt' | 'status'>
): Promise<ShiftSwapRequest> {
  return apiRequest<ShiftSwapRequest>(
    '/v1/shift-swaps',
    { method: 'POST', body: JSON.stringify(dto) },
    'Failed to create shift swap request.',
  );
}

export async function fetchMyShiftAssignments(
  startDate?: string,
  endDate?: string,
  collaboratorId = ''
): Promise<ShiftAssignment[]> {
  const query = new URLSearchParams();
  if (startDate) query.set('start_date', startDate);
  if (endDate) query.set('end_date', endDate);
  if (collaboratorId) query.set('collaborator_id', collaboratorId);

  const data = await apiRequest<MaybeEnvelopedList<ShiftAssignment>>(
    `/v1/shift-assignments/me?${query.toString()}`,
    { method: 'GET' },
    'Failed to fetch personal shifts.',
  );
  return unwrapList(data);
}

export async function submitShiftAbsenceNotice(
  shiftId: string,
  reason: string,
  notes?: string
): Promise<ShiftAssignment> {
  return apiRequest<ShiftAssignment>(
    `/v1/shift-assignments/${shiftId}/absence`,
    { method: 'POST', body: JSON.stringify({ reason, notes }) },
    'Failed to submit absence notice.',
  );
}

export function generateShiftICS(shifts: ShiftAssignment[], collaboratorName = 'Collaborator'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//X7 POS Restaurant Operations//Personal Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${collaboratorName} Work Schedule`,
  ];

  const formatICSDate = (dateStr: string, timeStr: string): string => {
    const cleanTime = timeStr.trim().toUpperCase();
    const isPM = cleanTime.includes('PM');
    const isAM = cleanTime.includes('AM');
    const raw = cleanTime.replace(/AM|PM/g, '').trim();
    const parts = raw.split(':');
    let h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;

    const [yyyy, mm, dd] = dateStr.split('-');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${yyyy}${mm}${dd}T${pad(h)}${pad(m)}00Z`;
  };

  shifts.forEach((shift) => {
    const startIso = formatICSDate(shift.date, shift.startTime);
    let endIso = formatICSDate(shift.date, shift.endTime);
    if (endIso <= startIso) {
      const [y, m, d] = shift.date.split('-').map(Number);
      const nextDay = new Date(y, m - 1, d + 1);
      const yyyy = nextDay.getFullYear();
      const mm = String(nextDay.getMonth() + 1).padStart(2, '0');
      const dd = String(nextDay.getDate()).padStart(2, '0');
      endIso = formatICSDate(`${yyyy}-${mm}-${dd}`, shift.endTime);
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${shift.id}@x7pos.com`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`DTSTART:${startIso}`);
    lines.push(`DTEND:${endIso}`);
    lines.push(`SUMMARY:Shift: ${shift.assignedRole || shift.role} (${shift.department || 'Floor'})`);
    lines.push(
      `DESCRIPTION:Assigned Role: ${shift.assignedRole || shift.role}\\nDepartment: ${
        shift.department || 'Main Floor'
      }\\nHours: ${shift.hours}h\\nNotes: ${shift.notes || 'None'}`
    );
    lines.push(`LOCATION:${shift.department || 'X7 POS Restaurant'}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICSFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function fetchLaborForecasting(
  params?: LaborForecastingFilterParams
): Promise<LaborForecastingSummary> {
  const query = new URLSearchParams();
  if (params?.merchantId) query.set('merchant_id', params.merchantId);
  if (params?.startDate) query.set('start_date', params.startDate);
  if (params?.endDate) query.set('end_date', params.endDate);

  return apiRequest<LaborForecastingSummary>(
    `/v1/labor-forecasting?${query.toString()}`,
    { method: 'GET' },
    'Failed to fetch labor forecasting.',
  );
}

export async function updateLaborBudgetTargets(
  dto: UpdateLaborBudgetTargetsDto
): Promise<{ targetLaborCostPercentage: number; maxWeeklyLaborBudget: number }> {
  return apiRequest<{ targetLaborCostPercentage: number; maxWeeklyLaborBudget: number }>(
    '/v1/labor-forecasting/budget-targets',
    { method: 'PATCH', body: JSON.stringify(dto) },
    'Failed to update labor budget targets.',
  );
}
