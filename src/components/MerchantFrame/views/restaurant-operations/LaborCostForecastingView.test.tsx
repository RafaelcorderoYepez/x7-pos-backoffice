import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LaborCostForecastingView } from './LaborCostForecastingView';
import * as shiftsApi from '../../../../api/shifts';
import type { LaborForecastingSummary } from '../../../../types/shifts';

const MOCK_FORECAST_SUMMARY: LaborForecastingSummary = {
  merchantId: 'merch-main-01',
  startDate: '2026-09-01',
  endDate: '2026-09-07',
  targetLaborCostPercentage: 22.0,
  maxWeeklyLaborBudget: 5000.0,
  projectedLaborCostTotal: 5450.0,
  forecastedSalesRevenue: 22000.0,
  projectedLaborCostPercentage: 24.77,
  targetVariance: 2.77,
  budgetVarianceAmount: 450.0,
  isOverBudget: true,
  dailyForecasts: [
    {
      date: '2026-09-01',
      dayName: 'Monday',
      projectedSales: 3000.0,
      scheduledLaborCost: 700.0,
      fohLaborCost: 400.0,
      bohLaborCost: 300.0,
      totalScheduledHours: 35.0,
      laborCostPercentage: 23.33,
      hourlySalesProjections: [
        { hour: '11:00 AM', sales: 450, laborCost: 84 },
      ],
    },
    {
      date: '2026-09-02',
      dayName: 'Tuesday',
      projectedSales: 3200.0,
      scheduledLaborCost: 650.0,
      fohLaborCost: 350.0,
      bohLaborCost: 300.0,
      totalScheduledHours: 32.0,
      laborCostPercentage: 20.31,
    },
  ],
  payrollBreakdown: [
    {
      collaboratorId: 'emp-101',
      collaboratorName: 'Carlos Mendoza',
      role: 'Supervisor',
      department: 'Floor Management',
      hourlyWage: 24.0,
      regularHours: 40.0,
      overtimeHours: 4.0,
      totalHours: 44.0,
      regularPay: 960.0,
      overtimePay: 144.0,
      totalProjectedPay: 1104.0,
      overtimeCapWarning: true,
    },
    {
      collaboratorId: 'emp-102',
      collaboratorName: 'Sofia Rodriguez',
      role: 'Waitstaff',
      department: 'Dining Room',
      hourlyWage: 16.0,
      regularHours: 32.0,
      overtimeHours: 0.0,
      totalHours: 32.0,
      regularPay: 512.0,
      overtimePay: 0.0,
      totalProjectedPay: 512.0,
      overtimeCapWarning: false,
    },
  ],
};

describe('LaborCostForecastingView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(shiftsApi, 'fetchLaborForecasting').mockResolvedValue(MOCK_FORECAST_SUMMARY);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders workspace title and hydrates KPI summary banner', async () => {
    render(<LaborCostForecastingView />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Labor Cost Forecasting & Budget Analytics/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Projected Labor Cost Total')).toBeInTheDocument();
    expect(screen.getByText('Forecasted Sales Revenue')).toBeInTheDocument();
    expect(screen.getByText('$5,450.00')).toBeInTheDocument();
    expect(screen.getByText('$22,000.00')).toBeInTheDocument();
    expect(screen.getByText('24.8%')).toBeInTheDocument();
  });

  it('displays target variance gauge and pre-publication budget alert banner', async () => {
    render(<LaborCostForecastingView />);

    await waitFor(() => {
      expect(screen.getByText('+2.8%')).toBeInTheDocument();
      expect(screen.getByText('OVER BUDGET')).toBeInTheDocument();
    });

    expect(screen.getByText(/Pre-Publication Budget Gate Alert/i)).toBeInTheDocument();
    expect(screen.getByText(/Warning: Scheduled roster exceeds weekly labor budget target by/i)).toBeInTheDocument();
  });

  it('renders collaborator payroll breakdown grid with overtime detection warnings', async () => {
    render(<LaborCostForecastingView />);

    await waitFor(() => {
      expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
      expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
    });

    expect(screen.getByText('EXCEEDS 40H (+4.0h)')).toBeInTheDocument();
    expect(screen.getByText('$1,104.00')).toBeInTheDocument();
  });

  it('toggles scenario modeling ("what-if" planning) tool and simulates sales surge', async () => {
    render(<LaborCostForecastingView />);

    await waitFor(() => {
      expect(screen.getByText('$5,450.00')).toBeInTheDocument();
    });

    const scenarioBtn = screen.getByRole('button', { name: /Scenario Modeling/i });
    fireEvent.click(scenarioBtn);

    await waitFor(() => {
      expect(screen.getByText(/Scenario Modeling & "What-If" Planning Tool/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Simulated Sales:')).toBeInTheDocument();
    expect(screen.getByText('Simulated Labor Cost %:')).toBeInTheDocument();
  });

  it('opens pre-publication master schedule confirmation modal', async () => {
    render(<LaborCostForecastingView />);

    await waitFor(() => {
      expect(screen.getByText('$5,450.00')).toBeInTheDocument();
    });

    const publishBtn = screen.getByRole('button', { name: /Publish Weekly Roster Schedule/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Pre-Publication Roster Budget Verification/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm & Publish Master Schedule/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Roster Schedule Published/i)).toBeInTheDocument();
    });
  });
});
