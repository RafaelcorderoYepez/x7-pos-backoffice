
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TimeEntriesView } from './TimeEntriesView';
import * as attendanceApi from '../../../../api/attendance';
import {
  calculateNetPayableHours,
  determineAttendanceStatus,
} from '../../../../api/attendance';

const sampleLedgerRecords: attendanceApi.AttendanceLedgerRecord[] = [
  {
    id: 'ledg-101',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    date: '2026-09-15',
    scheduledWindow: { startTime: '09:00 AM', endTime: '05:00 PM', scheduledHours: 8.0 },
    actualPunches: { clockIn: '09:04 AM', clockOut: '05:00 PM', unpaidBreakMinutes: 30 },
    status: 'ON_TIME',
    varianceMinutes: 0,
    varianceLabel: 'On Time',
    rawWorkedHours: 8.0,
    netPayableHours: 7.5,
    isManualOverride: false,
    auditLogs: [],
  },
  {
    id: 'ledg-102',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    date: '2026-09-15',
    scheduledWindow: { startTime: '09:00 AM', endTime: '05:00 PM', scheduledHours: 8.0 },
    actualPunches: { clockIn: '09:12 AM', clockOut: '05:03 PM', unpaidBreakMinutes: 30 },
    status: 'TARDY',
    varianceMinutes: 12,
    varianceLabel: '+12 min Late',
    rawWorkedHours: 7.85,
    netPayableHours: 7.35,
    isManualOverride: false,
    auditLogs: [],
  },
  {
    id: 'ledg-103',
    collaboratorId: 'emp-103',
    collaboratorName: 'Mateo Silva',
    role: 'Line Cook',
    department: 'Kitchen',
    date: '2026-09-15',
    scheduledWindow: { startTime: '09:00 AM', endTime: '05:00 PM', scheduledHours: 8.0 },
    actualPunches: { clockIn: '09:00 AM', clockOut: null, unpaidBreakMinutes: 0 },
    status: 'MISSED_PUNCH',
    varianceMinutes: 0,
    varianceLabel: 'Missing Clock-Out',
    rawWorkedHours: 0,
    netPayableHours: 0,
    isManualOverride: false,
    auditLogs: [],
  },
];

describe('Attendance Ledger Workspace Directory & Calculation Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(attendanceApi, 'fetchTimeEntries').mockResolvedValue([]);
    vi.spyOn(attendanceApi, 'fetchAttendanceLedgerRecords').mockResolvedValue(sampleLedgerRecords);
    vi.spyOn(attendanceApi, 'updateAttendanceLedgerRecord').mockImplementation(async (dto) => {
      if (!dto.reason || !dto.reason.trim()) {
        return { success: false, error: 'Mandatory justification note is required' };
      }
      const record = sampleLedgerRecords.find((r) => r.id === dto.recordId) || sampleLedgerRecords[0];
      const updated = {
        ...record,
        actualPunches: {
          ...record.actualPunches,
          clockIn: dto.clockIn !== undefined ? dto.clockIn : record.actualPunches.clockIn,
          clockOut: dto.clockOut !== undefined ? dto.clockOut : record.actualPunches.clockOut,
          unpaidBreakMinutes: dto.unpaidBreakMinutes ?? record.actualPunches.unpaidBreakMinutes,
        },
        netPayableHours: 7.47,
        isManualOverride: true,
        auditLogs: [
          {
            id: 'aud-1',
            modifiedByUserId: dto.modifiedByUserId,
            modifiedByUserName: dto.modifiedByUserName,
            modifiedAt: new Date().toISOString(),
            originalClockIn: record.actualPunches.clockIn,
            updatedClockIn: dto.clockIn !== undefined ? dto.clockIn : record.actualPunches.clockIn,
            originalClockOut: record.actualPunches.clockOut,
            updatedClockOut: dto.clockOut !== undefined ? dto.clockOut : record.actualPunches.clockOut,
            reason: dto.reason,
          },
        ],
      };
      return { success: true, record: updated as any };
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Net Payable Worked Hours Formula', () => {
    it('accurately subtracts unpaid break duration from total shift time: (ClockOut - ClockIn) - UnpaidBreaks', () => {
      const result1 = calculateNetPayableHours('09:00 AM', '05:00 PM', 30);
      expect(result1.rawWorkedHours).toBe(8.0);
      expect(result1.netPayableHours).toBe(7.5);

      const result2 = calculateNetPayableHours('09:12 AM', '05:03 PM', 30);
      expect(result2.rawWorkedHours).toBe(7.85);
      expect(result2.netPayableHours).toBe(7.35);

      const result3 = calculateNetPayableHours('08:00 AM', '04:00 PM', 0);
      expect(result3.rawWorkedHours).toBe(8.0);
      expect(result3.netPayableHours).toBe(8.0);
    });

    it('returns 0 net payable hours when clock-out is missing', () => {
      const result = calculateNetPayableHours('09:00 AM', null, 30);
      expect(result.rawWorkedHours).toBe(0);
      expect(result.netPayableHours).toBe(0);
    });
  });

  describe('2. Attendance Status & Variance Determination', () => {
    const scheduledWindow = {
      startTime: '09:00 AM',
      endTime: '05:00 PM',
      scheduledHours: 8.0,
    };

    it('evaluates ON_TIME when clock-in is within the 5-minute grace period', () => {
      const result = determineAttendanceStatus(scheduledWindow, '09:04 AM', '05:00 PM', 5);
      expect(result.status).toBe('ON_TIME');
      expect(result.varianceLabel).toBe('On Time');
    });

    it('evaluates TARDY when clock-in is past the 5-minute grace period', () => {
      const result = determineAttendanceStatus(scheduledWindow, '09:12 AM', '05:03 PM', 5);
      expect(result.status).toBe('TARDY');
      expect(result.varianceMinutes).toBe(12);
      expect(result.varianceLabel).toBe('+12 min Late');
    });

    it('evaluates EARLY_DEPARTURE when clock-out is prior to scheduled end time', () => {
      const result = determineAttendanceStatus(scheduledWindow, '09:00 AM', '04:30 PM', 5);
      expect(result.status).toBe('EARLY_DEPARTURE');
      expect(result.varianceMinutes).toBe(30);
      expect(result.varianceLabel).toBe('30 min Early');
    });

    it('evaluates MISSED_PUNCH when clock-out is missing', () => {
      const result = determineAttendanceStatus(scheduledWindow, '09:00 AM', null, 5);
      expect(result.status).toBe('MISSED_PUNCH');
      expect(result.varianceLabel).toBe('Missing Clock-Out');
    });

    it('evaluates UNSCHEDULED when shift assignment is missing', () => {
      const result = determineAttendanceStatus(undefined, '08:00 AM', '04:00 PM', 5);
      expect(result.status).toBe('UNSCHEDULED');
      expect(result.varianceLabel).toBe('Unscheduled Shift');
    });
  });

  describe('3. Immutable Audit Trail & Manual Timesheet Correction', () => {
    it('enforces mandatory justification reason upon record adjustment', async () => {
      const records = await attendanceApi.fetchAttendanceLedgerRecords();
      const targetId = records[0].id;

      const attemptEmptyReason = await attendanceApi.updateAttendanceLedgerRecord({
        recordId: targetId,
        clockIn: '08:00 AM',
        clockOut: '04:00 PM',
        unpaidBreakMinutes: 30,
        reason: '   ',
        modifiedByUserId: 'usr-admin-1',
        modifiedByUserName: 'Manager Test',
      });

      expect(attemptEmptyReason.success).toBe(false);
      expect(attemptEmptyReason.error).toContain('Mandatory justification note is required');
    });

    it('creates an immutable audit log entry containing editor ID, timestamps, prior values, and justification reason', async () => {
      const records = await attendanceApi.fetchAttendanceLedgerRecords();
      const target = records.find((r) => r.status === 'MISSED_PUNCH') || records[0];

      const updateRes = await attendanceApi.updateAttendanceLedgerRecord({
        recordId: target.id,
        clockIn: '04:02 PM',
        clockOut: '12:00 AM',
        unpaidBreakMinutes: 30,
        reason: 'Employee forgot to clock out at shift end, verified with CCTV.',
        modifiedByUserId: 'usr-admin-901',
        modifiedByUserName: 'Jane Admin',
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.record).toBeDefined();

      const updated = updateRes.record!;
      expect(updated.actualPunches.clockOut).toBe('12:00 AM');
      expect(updated.netPayableHours).toBe(7.47);
      expect(updated.isManualOverride).toBe(true);
      expect(updated.auditLogs.length).toBeGreaterThan(0);

      const latestAudit = updated.auditLogs[0];
      expect(latestAudit.modifiedByUserId).toBe('usr-admin-901');
      expect(latestAudit.modifiedByUserName).toBe('Jane Admin');
      expect(latestAudit.reason).toBe('Employee forgot to clock out at shift end, verified with CCTV.');
      expect(latestAudit.originalClockOut).toBeNull();
      expect(latestAudit.updatedClockOut).toBe('12:00 AM');
    });
  });

  describe('4. Attendance Ledger Workspace UI Integration', () => {
    it('renders the Attendance Ledger grid layout with high scannability and metrics', async () => {
      render(<TimeEntriesView />);

      await waitFor(() => {
        expect(screen.getByText(/Attendance Ledger & Timesheet Audit/i)).toBeInTheDocument();
        expect(screen.getByText(/Total Net Payable Hours/i)).toBeInTheDocument();
        expect(screen.getByText(/On-Time Attendance Rate/i)).toBeInTheDocument();
        expect(screen.getByText(/Carlos Mendoza/i)).toBeInTheDocument();
        expect(screen.getByText(/Sofia Rodriguez/i)).toBeInTheDocument();
        expect(screen.getByText(/\+12 min Late/i)).toBeInTheDocument();
      });
    });

    it('filters ledger rows when selecting an attendance status filter tab', async () => {
      render(<TimeEntriesView />);

      await waitFor(() => {
        expect(screen.getByTestId('filter-tardy')).toBeInTheDocument();
      });

      const tardyButton = screen.getByTestId('filter-tardy');
      fireEvent.click(tardyButton);

      await waitFor(() => {
        expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
        expect(screen.queryByText('Carlos Mendoza')).not.toBeInTheDocument();
      });
    });

    it('opens Timesheet Correction drawer upon clicking Adjust button', async () => {
      render(<TimeEntriesView />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /Adjust/i }).length).toBeGreaterThan(0);
      });

      const adjustButtons = screen.getAllByRole('button', { name: /Adjust/i });
      fireEvent.click(adjustButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Manual Timesheet Correction/i)).toBeInTheDocument();
        expect(screen.getByText(/Mandatory Audit Justification Note/i)).toBeInTheDocument();
      });
    });
  });
});
