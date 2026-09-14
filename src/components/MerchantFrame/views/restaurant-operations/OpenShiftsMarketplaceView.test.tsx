import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { OpenShiftsMarketplaceView } from './OpenShiftsMarketplaceView';
import * as shiftsApi from '../../../../api/shifts';
import type { OpenShift, ShiftAssignment } from '../../../../types/shifts';

const MOCK_OPEN_SHIFTS: OpenShift[] = [
  {
    id: 'ops-201',
    referenceId: 'OPS-201',
    merchantId: 'merch-main-01',
    collaboratorId: null,
    collaboratorName: null,
    role: 'Line Cook',
    department: 'Kitchen (BOH)',
    zone: 'Kitchen Station 1',
    date: '2026-09-02',
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    hours: 8,
    breakDuration: 30,
    hourlyRate: 18.5,
    estimatedGrossEarnings: 148.0,
    allocationMode: 'FIRST_COME_FIRST_SERVED',
    status: 'OPEN_FOR_PICKUP',
    createdAt: '2026-08-28T08:00:00Z',
    notes: 'Morning prep line coverage needed.',
  },
  {
    id: 'ops-202',
    referenceId: 'OPS-202',
    merchantId: 'merch-main-01',
    collaboratorId: null,
    collaboratorName: null,
    role: 'Bartender',
    department: 'Bar & Lounge',
    zone: 'Main Bar',
    date: '2026-09-03',
    startTime: '06:00 PM',
    endTime: '02:00 AM',
    hours: 8,
    breakDuration: 45,
    hourlyRate: 22.0,
    estimatedGrossEarnings: 176.0,
    allocationMode: 'REQUIRES_APPROVAL',
    status: 'OPEN_FOR_PICKUP',
    createdAt: '2026-08-28T10:30:00Z',
    notes: 'Peak dinner cocktail rush coverage.',
    pickupRequests: [
      {
        id: 'REQ-501',
        openShiftId: 'ops-202',
        collaboratorId: 'emp-104',
        collaboratorName: 'Valeria Gomez',
        collaboratorRole: 'Bartender',
        requestedAt: '2026-08-29T11:00:00Z',
        status: 'PENDING',
        notes: 'Available for pickup',
      },
    ],
  },
  {
    id: 'ops-203',
    referenceId: 'OPS-203',
    merchantId: 'merch-main-01',
    collaboratorId: null,
    collaboratorName: null,
    role: 'Waitstaff',
    department: 'Dining Room',
    zone: 'Patio Terrace',
    date: '2026-09-04',
    startTime: '11:00 AM',
    endTime: '07:30 PM',
    hours: 8.5,
    breakDuration: 30,
    hourlyRate: 16.0,
    estimatedGrossEarnings: 136.0,
    allocationMode: 'FIRST_COME_FIRST_SERVED',
    status: 'OPEN_FOR_PICKUP',
    createdAt: '2026-08-29T09:15:00Z',
    notes: 'Lunch terrace floor section coverage.',
  },
];

const MOCK_SHIFTS: ShiftAssignment[] = [
  {
    id: 'shift-1',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    date: '2026-09-02',
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    presetName: 'Morning Opening',
    status: 'published',
    hours: 8,
  },
  {
    id: 'shift-4',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    date: '2026-09-02',
    startTime: '11:00 AM',
    endTime: '07:00 PM',
    presetName: 'Mid-Day Support',
    status: 'published',
    hours: 8,
  },
];

describe('OpenShiftsMarketplaceView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(shiftsApi, 'fetchOpenShifts').mockResolvedValue([...MOCK_OPEN_SHIFTS]);
    vi.spyOn(shiftsApi, 'fetchShiftAssignments').mockResolvedValue([...MOCK_SHIFTS]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders marketplace header and hydrates KPI cards', async () => {
    render(<OpenShiftsMarketplaceView />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Open Shifts & Staffing Marketplace/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Available Open Shifts')).toBeInTheDocument();
    expect(screen.getByText('Total Open Coverage Hours')).toBeInTheDocument();
    expect(screen.getByText('#OPS-201')).toBeInTheDocument();
    expect(screen.getByText('#OPS-202')).toBeInTheDocument();
    expect(screen.getByText('#OPS-203')).toBeInTheDocument();
  });

  it('filters open shift cards by search query', async () => {
    render(<OpenShiftsMarketplaceView />);

    await waitFor(() => {
      expect(screen.getByText('#OPS-201')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by #OPS ID/i);
    fireEvent.change(searchInput, { target: { value: 'OPS-201' } });

    await waitFor(() => {
      expect(screen.getByText('#OPS-201')).toBeInTheDocument();
      expect(screen.queryByText('#OPS-202')).not.toBeInTheDocument();
      expect(screen.queryByText('#OPS-203')).not.toBeInTheDocument();
    });
  });

  it('allows supervisor to open Publish Open Shift modal', async () => {
    render(<OpenShiftsMarketplaceView />);

    await waitFor(() => {
      expect(screen.getByText('#OPS-201')).toBeInTheDocument();
    });

    const publishBtn = screen.getByRole('button', { name: /Publish Open Shift Block/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Publish Unassigned Shift Block/i })).toBeInTheDocument();
    });
  });

  it('executes shift claim with auto-assignment for FCFS mode', async () => {
    const claimSpy = vi.spyOn(shiftsApi, 'claimOpenShift').mockResolvedValue({
      openShift: { ...MOCK_OPEN_SHIFTS[0], status: 'ASSIGNED', collaboratorId: 'emp-105' },
      shiftAssignment: {
        id: 'sft-new',
        collaboratorId: 'emp-105',
        collaboratorName: 'Alejandro Ramos',
        role: 'Line Cook',
        department: 'Kitchen (BOH)',
        date: '2026-09-02',
        startTime: '07:00 AM',
        endTime: '03:00 PM',
        presetName: 'Open Shift Pickup',
        status: 'confirmed',
        hours: 8,
      },
      overtimeTriggered: false,
      message: 'Shift #OPS-201 claimed successfully!',
    });

    render(<OpenShiftsMarketplaceView />);

    await waitFor(() => {
      expect(screen.getByText('#OPS-201')).toBeInTheDocument();
    });

    // Switch active persona to Line Cook (Alejandro Ramos)
    const personaSelect = screen.getByDisplayValue(/Carlos Mendoza/i);
    fireEvent.change(personaSelect, { target: { value: 'emp-105' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Instant Claim Shift/i })).toBeInTheDocument();
    });

    const claimBtn = screen.getByRole('button', { name: /Instant Claim Shift/i });
    fireEvent.click(claimBtn);

    // Confirmation modal should open
    await waitFor(() => {
      expect(screen.getByText(/Confirm Shift Claim/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Claim/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(claimSpy).toHaveBeenCalledWith(
        'ops-201',
        'emp-105',
        'Alejandro Ramos',
        'Line Cook',
        expect.any(Number),
        expect.any(Array)
      );
    });
  });

  it('allows supervisor to review and approve pickup requests', async () => {
    const approveSpy = vi.spyOn(shiftsApi, 'approveOpenShiftPickup').mockResolvedValue({
      openShift: { ...MOCK_OPEN_SHIFTS[1], status: 'ASSIGNED', collaboratorId: 'emp-104' },
      shiftAssignment: {
        id: 'sft-approved',
        collaboratorId: 'emp-104',
        collaboratorName: 'Valeria Gomez',
        role: 'Bartender',
        department: 'Bar & Lounge',
        date: '2026-09-03',
        startTime: '06:00 PM',
        endTime: '02:00 AM',
        presetName: 'Bar Night',
        status: 'confirmed',
        hours: 8,
      },
    });

    render(<OpenShiftsMarketplaceView />);

    await waitFor(() => {
      expect(screen.getByText('#OPS-202')).toBeInTheDocument();
    });

    // Supervisor persona (emp-101) sees Review Requests (1) button for OPS-202
    const reviewBtn = screen.getByRole('button', { name: /Review Requests \(1\)/i });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(screen.getByText(/Review Pickup Requests \(#OPS-202\)/i)).toBeInTheDocument();
      expect(screen.getByText('Valeria Gomez')).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole('button', { name: /Approve/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('ops-202', 'REQ-501', expect.any(String));
    });
  });
});
