import type {
  TimeEntry,
  PunchType,
  CollaboratorPunchState,
  CollaboratorPinAccount,
  TimeClockConfig,
  PinAuthResult,
  SupervisorOverrideLog,
  AttendanceStatus,
  AttendanceLedgerRecord,
  ScheduledWindow,
  UpdateAttendanceLedgerDto,
} from '../types/attendance';
import type { ShiftAssignment } from '../types/shifts';
import { fetchShiftAssignments, parseTimeToMinutes } from './shifts';
import { getAccessToken } from '../lib/auth-storage';

function getApiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL ?? '/api';
  const fullPath = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  if (fullPath.startsWith('http://') || fullPath.startsWith('https://')) {
    return fullPath;
  }
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin !== 'null' &&
    window.location.origin !== 'opaque'
  ) {
    try {
      return new URL(fullPath, window.location.origin).toString();
    } catch {
      // fallback
    }
  }
  return `http://localhost:3000${fullPath.startsWith('/') ? '' : '/'}${fullPath}`;
}

export const DEFAULT_CONFIG: TimeClockConfig = {
  gracePeriodMinutes: 15,
  enablePhotoVerification: true,
  maxPinAttempts: 3,
  lockoutDurationSeconds: 30,
};

// In-memory state for client-side rate-limiting lockout timer
let failedPinAttempts = 0;
let lockoutUntilMs = 0;

export function resetLockoutState(): void {
  failedPinAttempts = 0;
  lockoutUntilMs = 0;
}

export function getLockoutSecondsRemaining(): number {
  if (Date.now() < lockoutUntilMs) {
    return Math.ceil((lockoutUntilMs - Date.now()) / 1000);
  }
  return 0;
}

export async function validatePin(
  pinOrBadge: string,
  config: TimeClockConfig = DEFAULT_CONFIG
): Promise<PinAuthResult> {
  const secondsRemaining = getLockoutSecondsRemaining();
  if (secondsRemaining > 0) {
    return {
      success: false,
      isLockedOut: true,
      lockoutSecondsRemaining: secondsRemaining,
      error: `Terminal locked due to multiple failed PIN attempts. Try again in ${secondsRemaining}s.`,
    };
  }

  const token = getAccessToken();
  const res = await fetch(getApiUrl('/v1/attendance/validate-pin'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pinOrBadge: pinOrBadge.trim() }),
  });

  if (!res.ok) {
    failedPinAttempts += 1;
    if (failedPinAttempts >= config.maxPinAttempts) {
      lockoutUntilMs = Date.now() + config.lockoutDurationSeconds * 1000;
      return {
        success: false,
        isLockedOut: true,
        lockoutSecondsRemaining: config.lockoutDurationSeconds,
        error: `Too many invalid PIN attempts! Kiosk locked for ${config.lockoutDurationSeconds} seconds.`,
      };
    }
    const errJson = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errJson.message || `Invalid PIN or Badge Code. Attempt ${failedPinAttempts} of ${config.maxPinAttempts}.`,
    };
  }

  failedPinAttempts = 0;
  lockoutUntilMs = 0;
  const data = await res.json();
  return {
    success: true,
    account: data.account || data,
  };
}

export async function validateSupervisorPin(
  supervisorId: string,
  pin: string
): Promise<{ success: boolean; supervisorName?: string; error?: string }> {
  const token = getAccessToken();
  const res = await fetch(getApiUrl('/v1/attendance/validate-supervisor-pin'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ supervisorId, pin: pin.trim() }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errJson.message || 'Incorrect Supervisor Security PIN.',
    };
  }

  return await res.json();
}

export async function getCollaboratorPunchState(
  collaboratorId: string
): Promise<CollaboratorPunchState> {
  const token = getAccessToken();
  const res = await fetch(getApiUrl(`/v1/attendance/punch-state?collaborator_id=${collaboratorId}`), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    return 'OFF_DUTY';
  }

  const data = await res.json();
  return data.punchState || data.state || 'OFF_DUTY';
}

export interface ShiftEvaluationResult {
  hasScheduledShift: boolean;
  shiftAssignment?: ShiftAssignment;
  isEarlyClockIn: boolean;
  isLateClockIn: boolean;
  earlyMinutes: number;
  lateMinutes: number;
  requiresSupervisorOverride: boolean;
  overrideReason?: 'EARLY_CLOCK_IN' | 'UNSCHEDULED_SHIFT';
}

export async function evaluateScheduledShift(
  collaboratorId: string,
  now: Date = new Date(),
  config: TimeClockConfig = DEFAULT_CONFIG
): Promise<ShiftEvaluationResult> {
  const allShifts = await fetchShiftAssignments();
  const dateISO = now.toISOString().split('T')[0];

  const todayShift = allShifts.find(
    (s) => s.collaboratorId === collaboratorId && s.date === dateISO
  );

  if (!todayShift) {
    return {
      hasScheduledShift: false,
      isEarlyClockIn: false,
      isLateClockIn: false,
      earlyMinutes: 0,
      lateMinutes: 0,
      requiresSupervisorOverride: true,
      overrideReason: 'UNSCHEDULED_SHIFT',
    };
  }

  const startMin = parseTimeToMinutes(todayShift.startTime);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const diffMinutes = startMin - nowMin;

  const isEarly = diffMinutes > config.gracePeriodMinutes;
  const isLate = -diffMinutes > config.gracePeriodMinutes;

  return {
    hasScheduledShift: true,
    shiftAssignment: todayShift,
    isEarlyClockIn: isEarly,
    isLateClockIn: isLate,
    earlyMinutes: isEarly ? diffMinutes : 0,
    lateMinutes: isLate ? -diffMinutes : 0,
    requiresSupervisorOverride: isEarly,
    overrideReason: isEarly ? 'EARLY_CLOCK_IN' : undefined,
  };
}

export interface SubmitPunchDto {
  collaboratorId: string;
  punchType: PunchType;
  photoUrl?: string;
  supervisorOverride?: SupervisorOverrideLog;
  deviceInfo?: string;
}

export async function submitPunch(
  dto: SubmitPunchDto
): Promise<{ success: boolean; entry?: TimeEntry; error?: string }> {
  const token = getAccessToken();
  const res = await fetch(getApiUrl('/v1/attendance/punch'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errJson.message || `Failed to submit punch (${res.status})`,
    };
  }

  const data = await res.json();
  return {
    success: true,
    entry: data.entry || data,
  };
}

export async function fetchTimeEntries(): Promise<TimeEntry[]> {
  const token = getAccessToken();
  const res = await fetch(getApiUrl('/v1/attendance/time-entries'), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch time entries (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.data || [];
}

export async function loadTimeEntries(): Promise<TimeEntry[]> {
  return fetchTimeEntries();
}

export async function getSupervisors(): Promise<CollaboratorPinAccount[]> {
  const token = getAccessToken();
  const res = await fetch(getApiUrl('/v1/attendance/supervisors'), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch supervisors (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.data || [];
}

export function calculateNetPayableHours(
  clockIn: string | null,
  clockOut: string | null,
  unpaidBreakMinutes: number
): { rawWorkedHours: number; netPayableHours: number } {
  if (!clockIn || !clockOut) {
    return { rawWorkedHours: 0, netPayableHours: 0 };
  }

  const startMin = parseTimeToMinutes(clockIn);
  const endMin = parseTimeToMinutes(clockOut);

  let totalWorkedMins = endMin - startMin;
  if (totalWorkedMins < 0) {
    totalWorkedMins += 1440;
  }

  const rawHours = Math.max(0, parseFloat((totalWorkedMins / 60).toFixed(2)));
  const netMins = Math.max(0, totalWorkedMins - unpaidBreakMinutes);
  const netHours = Math.max(0, parseFloat((netMins / 60).toFixed(2)));

  return {
    rawWorkedHours: rawHours,
    netPayableHours: netHours,
  };
}

export function determineAttendanceStatus(
  scheduledWindow?: ScheduledWindow,
  clockIn?: string | null,
  clockOut?: string | null,
  gracePeriodMinutes = 5
): { status: AttendanceStatus; varianceMinutes: number; varianceLabel: string } {
  if (!scheduledWindow) {
    return {
      status: 'UNSCHEDULED',
      varianceMinutes: 0,
      varianceLabel: 'Unscheduled Shift',
    };
  }

  if (!clockIn || !clockOut) {
    return {
      status: 'MISSED_PUNCH',
      varianceMinutes: 0,
      varianceLabel: !clockIn ? 'Missing Clock-In' : 'Missing Clock-Out',
    };
  }

  const startMin = parseTimeToMinutes(scheduledWindow.startTime);
  const clockInMin = parseTimeToMinutes(clockIn);
  const tardyDiff = clockInMin - startMin;

  if (tardyDiff > gracePeriodMinutes) {
    return {
      status: 'TARDY',
      varianceMinutes: tardyDiff,
      varianceLabel: `+${tardyDiff} min Late`,
    };
  }

  const endMin = parseTimeToMinutes(scheduledWindow.endTime);
  const clockOutMin = parseTimeToMinutes(clockOut);
  const earlyDiff = endMin - clockOutMin;

  if (earlyDiff > gracePeriodMinutes) {
    return {
      status: 'EARLY_DEPARTURE',
      varianceMinutes: earlyDiff,
      varianceLabel: `${earlyDiff} min Early`,
    };
  }

  return {
    status: 'ON_TIME',
    varianceMinutes: 0,
    varianceLabel: 'On Time',
  };
}

export const STORE_LOCATIONS = [
  { id: 'loc-all', name: 'All Store Locations' },
  { id: 'loc-101', name: 'Downtown Flagship' },
  { id: 'loc-102', name: 'Uptown Bistro' },
  { id: 'loc-103', name: 'Airport Terminal 2' },
];

export async function fetchAttendanceLedgerRecords(): Promise<AttendanceLedgerRecord[]> {
  const token = getAccessToken();
  const res = await fetch(getApiUrl('/v1/attendance/ledger'), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch attendance ledger records (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.data || [];
}

export async function updateAttendanceLedgerRecord(
  dto: UpdateAttendanceLedgerDto
): Promise<{ success: boolean; record?: AttendanceLedgerRecord; error?: string }> {
  if (!dto.reason || !dto.reason.trim()) {
    return {
      success: false,
      error: 'Mandatory justification note is required to perform timesheet corrections.',
    };
  }

  const token = getAccessToken();
  const res = await fetch(getApiUrl(`/v1/attendance/ledger/${dto.recordId}`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errJson.message || `Failed to update ledger record (${res.status})`,
    };
  }

  const data = await res.json();
  return {
    success: true,
    record: data.record || data,
  };
}
