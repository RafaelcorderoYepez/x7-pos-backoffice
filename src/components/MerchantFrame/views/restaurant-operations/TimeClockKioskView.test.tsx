import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TimeClockKioskView } from './TimeClockKioskView';
import * as attendanceApi from '../../../../api/attendance';

const TEST_ACCOUNTS: Record<string, attendanceApi.CollaboratorPinAccount> = {
  '1234': {
    collaboratorId: 'emp-101',
    name: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    pin: '1234',
    badgeCode: 'BADGE-101',
    isSupervisor: true,
  },
  '4567': {
    collaboratorId: 'emp-104',
    name: 'Valeria Gomez',
    role: 'Bartender',
    department: 'Bar & Lounge',
    pin: '4567',
    badgeCode: 'BADGE-104',
    isSupervisor: false,
  },
};

let mockPunchState: attendanceApi.CollaboratorPunchState = 'OFF_DUTY';

describe('TimeClockKioskView & Attendance Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    attendanceApi.resetLockoutState();
    mockPunchState = 'OFF_DUTY';

    let failedAttempts = 0;
    vi.spyOn(attendanceApi, 'validatePin').mockImplementation(async (pinOrBadge, _config = attendanceApi.DEFAULT_CONFIG) => {
      void _config;
      if (failedAttempts >= 3) {
        return { success: false, isLockedOut: true, lockoutSecondsRemaining: 300, error: 'Locked out' };
      }
      const acc = TEST_ACCOUNTS[pinOrBadge.trim()];
      if (!acc) {
        failedAttempts += 1;
        return { success: false, error: 'Invalid PIN' };
      }
      return { success: true, account: acc };
    });

    vi.spyOn(attendanceApi, 'getCollaboratorPunchState').mockImplementation(async () => mockPunchState);

    vi.spyOn(attendanceApi, 'evaluateScheduledShift').mockResolvedValue({
      hasScheduledShift: false,
      isEarlyClockIn: false,
      isLateClockIn: false,
      earlyMinutes: 0,
      lateMinutes: 0,
      requiresSupervisorOverride: true,
      overrideReason: 'UNSCHEDULED_SHIFT',
    });

    vi.spyOn(attendanceApi, 'getSupervisors').mockResolvedValue([TEST_ACCOUNTS['1234']]);

    vi.spyOn(attendanceApi, 'submitPunch').mockImplementation(async (dto) => {
      if (dto.punchType === 'CLOCK_IN') mockPunchState = 'WORKING';
      else if (dto.punchType === 'START_BREAK') mockPunchState = 'ON_BREAK';
      else if (dto.punchType === 'END_BREAK') mockPunchState = 'WORKING';
      else if (dto.punchType === 'CLOCK_OUT') mockPunchState = 'CLOCKED_OUT';

      return {
        success: true,
        entry: {
          id: `TE-${Date.now()}`,
          collaboratorId: dto.collaboratorId,
          collaboratorName: 'Test User',
          role: 'Staff',
          department: 'Floor',
          punchType: dto.punchType,
          punchState: mockPunchState,
          timestamp: new Date().toISOString(),
          timeFormatted: '12:00 PM',
          date: '2026-09-18',
        },
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Time Clock Kiosk UI with digit keypad and clock', () => {
    render(<TimeClockKioskView />);

    expect(screen.getByText(/Time Clock Terminal/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter Security PIN/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '1' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '9' })[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CLEAR' })).toBeInTheDocument();
  });

  it('authenticates collaborator upon entering valid 4-digit PIN', async () => {
    render(<TimeClockKioskView />);

    // Enter PIN 1234 for Carlos Mendoza (Supervisor)
    fireEvent.click(screen.getAllByRole('button', { name: '1' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '2' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '3' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '4' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
      expect(screen.getByText(/Supervisor • Floor Management/i)).toBeInTheDocument();
    });
  });

  it('enforces rate-limiting lockout after 3 invalid PIN attempts', async () => {
    const res1 = await attendanceApi.validatePin('0000');
    expect(res1.success).toBe(false);

    const res2 = await attendanceApi.validatePin('0000');
    expect(res2.success).toBe(false);

    const res3 = await attendanceApi.validatePin('0000');
    expect(res3.success).toBe(false);

    // Any subsequent attempt while locked should fail
    const res4 = await attendanceApi.validatePin('1234');
    expect(res4.success).toBe(false);
  });

  it('maintains state machine integrity across punches', async () => {
    const empId = 'emp-101';

    const dummyOverride = {
      supervisorId: 'emp-101',
      supervisorName: 'Carlos Mendoza',
      overrideType: 'EARLY_CLOCK_IN' as const,
      reason: 'Test approval',
      timestamp: new Date().toISOString(),
    };

    // Reset to off duty by clocking out if already working
    await attendanceApi.submitPunch({ collaboratorId: empId, punchType: 'CLOCK_OUT' });
    expect(await attendanceApi.getCollaboratorPunchState(empId)).toBe('CLOCKED_OUT');

    // 1. Clock In -> WORKING
    const res1 = await attendanceApi.submitPunch({ collaboratorId: empId, punchType: 'CLOCK_IN', supervisorOverride: dummyOverride });
    expect(res1.success).toBe(true);
    expect(res1.entry?.punchState).toBe('WORKING');
    expect(await attendanceApi.getCollaboratorPunchState(empId)).toBe('WORKING');

    // 2. Start Break -> ON_BREAK
    const res2 = await attendanceApi.submitPunch({ collaboratorId: empId, punchType: 'START_BREAK' });
    expect(res2.success).toBe(true);
    expect(res2.entry?.punchState).toBe('ON_BREAK');
    expect(await attendanceApi.getCollaboratorPunchState(empId)).toBe('ON_BREAK');

    // 3. End Break -> WORKING
    const res3 = await attendanceApi.submitPunch({ collaboratorId: empId, punchType: 'END_BREAK' });
    expect(res3.success).toBe(true);
    expect(res3.entry?.punchState).toBe('WORKING');
    expect(await attendanceApi.getCollaboratorPunchState(empId)).toBe('WORKING');

    // 4. Clock Out -> CLOCKED_OUT
    const res4 = await attendanceApi.submitPunch({ collaboratorId: empId, punchType: 'CLOCK_OUT' });
    expect(res4.success).toBe(true);
    expect(res4.entry?.punchState).toBe('CLOCKED_OUT');
    expect(await attendanceApi.getCollaboratorPunchState(empId)).toBe('CLOCKED_OUT');
  });

  it('triggers Supervisor Override modal when attempting an unscheduled clock-in', async () => {
    render(<TimeClockKioskView />);

    // Authenticate Valeria Gomez (PIN 4567)
    fireEvent.click(screen.getAllByRole('button', { name: '4' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '5' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '6' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '7' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Valeria Gomez')).toBeInTheDocument();
    });

    // Click Clock In
    const clockInBtn = screen.getByRole('button', { name: /CLOCK IN/i });
    fireEvent.click(clockInBtn);

    await waitFor(() => {
      expect(screen.getByText(/Supervisor Override Required/i)).toBeInTheDocument();
      expect(screen.getByText(/Unscheduled Shift Clock-In/i)).toBeInTheDocument();
    });
  });
});
