import React, { useState, useEffect, useMemo } from 'react';
import type {
  LaborForecastingSummary,
  DailyLaborForecast,
} from '../../../../types/shifts';
import {
  fetchLaborForecasting,
  updateLaborBudgetTargets,
} from '../../../../api/shifts';
import { StaffManagementQuickLinks } from './StaffManagementQuickLinks';

interface LaborCostForecastingViewProps {
  onNavigate?: (routeOrView: string) => void;
}

export const LaborCostForecastingView: React.FC<LaborCostForecastingViewProps> = ({
  onNavigate,
}) => {
  const [data, setData] = useState<LaborForecastingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeHoverDay, setActiveHoverDay] = useState<DailyLaborForecast | null>(null);

  // Target Budget Configuration Inputs
  const [targetPctInput, setTargetPctInput] = useState<number>(22.0);
  const [maxBudgetInput, setMaxBudgetInput] = useState<number>(5000.0);
  const [isUpdatingTargets, setIsUpdatingTargets] = useState(false);

  // Scenario Modeling ("What-If" Planning) State
  const [showScenarioTool, setShowScenarioTool] = useState(false);
  const [scenarioSalesBoostPct, setScenarioSalesBoostPct] = useState<number>(0);
  const [scenarioWageMultiplier, setScenarioWageMultiplier] = useState<number>(1.0);
  const [scenarioShiftReductionCount, setScenarioShiftReductionCount] = useState<number>(0);

  // Pre-Publish Modal Gate
  const [showPrePublishModal, setShowPrePublishModal] = useState(false);
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string | null>(null);

  const loadForecastData = async () => {
    setIsLoading(true);
    try {
      const summary = await fetchLaborForecasting();
      setData(summary);
      setTargetPctInput(summary.targetLaborCostPercentage);
      setMaxBudgetInput(summary.maxWeeklyLaborBudget);
    } catch (err) {
      console.error('Failed to load labor forecasting data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadForecastData();
    });
  }, []);

  const handleSaveBudgetTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingTargets(true);
    try {
      await updateLaborBudgetTargets({
        targetLaborCostPercentage: Number(targetPctInput),
        maxWeeklyLaborBudget: Number(maxBudgetInput),
      });
      await loadForecastData();
    } catch (err) {
      console.error('Failed to update budget targets', err);
    } finally {
      setIsUpdatingTargets(false);
    }
  };

  // Live Scenario Modeling Computations
  const scenarioCalculations = useMemo(() => {
    if (!data) return null;

    const adjustedSales = data.forecastedSalesRevenue * (1 + scenarioSalesBoostPct / 100);
    const estimatedShiftCostReduction = scenarioShiftReductionCount * (8 * 18.0);
    const adjustedLaborCost =
      (data.projectedLaborCostTotal * scenarioWageMultiplier) - estimatedShiftCostReduction;

    const adjustedLaborCostPct = adjustedSales > 0 ? (adjustedLaborCost / adjustedSales) * 100 : 0;
    const savingsAmount = data.projectedLaborCostTotal - adjustedLaborCost;

    return {
      adjustedSales,
      adjustedLaborCost,
      adjustedLaborCostPct,
      savingsAmount,
      isUnderTarget: adjustedLaborCostPct <= data.targetLaborCostPercentage,
    };
  }, [
    data,
    scenarioSalesBoostPct,
    scenarioWageMultiplier,
    scenarioShiftReductionCount,
  ]);

  if (isLoading || !data) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto min-h-screen text-[#5f5e5e] bg-[#f1ece4] flex flex-col items-center justify-center font-poppins">
        <span className="material-symbols-outlined text-4xl animate-spin text-[#ae001a] mb-3">
          sync
        </span>
        <p className="text-sm font-semibold">
          Hydrating predictive labor cost & budget analytics engine...
        </p>
      </div>
    );
  }

  const isOverBudget = data.isOverBudget;
  const maxSalesInWeek = Math.max(...data.dailyForecasts.map((d) => d.projectedSales), 1);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen text-[#222222] bg-[#f1ece4] font-poppins">
      {/* Toast Notification */}
      {publishSuccessMsg && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-emerald-50 border border-emerald-400 text-emerald-950 rounded-lg shadow-2xl flex items-center gap-3 animate-fade-in">
          <span className="material-symbols-outlined text-2xl text-emerald-700">
            check_circle
          </span>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider">Roster Schedule Published</h4>
            <p className="text-xs text-[#5f5e5e] mt-0.5">{publishSuccessMsg}</p>
          </div>
          <button onClick={() => setPublishSuccessMsg(null)} className="ml-4 text-[#5f5e5e] hover:text-[#222222]">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Header & Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-[#e8e2d8]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-[#222222] flex items-center justify-center text-white shadow-md">
            <span className="material-symbols-outlined text-2xl text-[#ae001a]">query_stats</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#222222]">
                Labor Cost Forecasting & Budget Analytics
              </h1>
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#fef9f1] text-[#ae001a] border border-[#e8e2d8] uppercase tracking-wider">
                ROSTER INTEGRATED
              </span>
            </div>
            <p className="text-xs text-[#5f5e5e] mt-1 font-normal">
              Project total scheduled wage expenses against POS sales forecasts, evaluate Labor Cost %, track budget variances, and prevent unplanned overtime.
            </p>
          </div>
        </div>

        {/* Master Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowScenarioTool(!showScenarioTool)}
            className={`px-4 py-2.5 rounded text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
              showScenarioTool
                ? 'bg-amber-50 text-amber-950 border-amber-400'
                : 'bg-white text-[#222222] border-[#e8e2d8] hover:bg-[#fef9f1]'
            }`}
          >
            <span className="material-symbols-outlined text-base text-amber-700">finance</span>
            {showScenarioTool ? 'Close "What-If" Scenario' : 'Scenario Modeling ("What-If")'}
          </button>

          <button
            onClick={() => setShowPrePublishModal(true)}
            className="px-5 py-2.5 rounded text-[11px] font-bold uppercase tracking-widest text-white bg-[#ae001a] hover:bg-[#930015] shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">alarm_on</span>
            Publish Weekly Roster Schedule
          </button>
        </div>
      </div>

      {/* Pre-Publication Financial Guardrail Alert Banner */}
      {isOverBudget && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-300 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0">
              <span className="material-symbols-outlined text-xl">notification_important</span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-2">
                Pre-Publication Budget Gate Alert
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-200 text-amber-900">
                  Budget Warning
                </span>
              </h4>
              <p className="text-xs text-amber-900/90 mt-0.5">
                Warning: Scheduled roster exceeds weekly labor budget target by{' '}
                <strong className="text-amber-950 font-poppins font-black">
                  ${Math.abs(data.budgetVarianceAmount).toFixed(2)}
                </strong>{' '}
                (Projected: {data.projectedLaborCostPercentage.toFixed(1)}% vs Target: {data.targetLaborCostPercentage.toFixed(1)}%).
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowScenarioTool(true)}
            className="px-3.5 py-1.5 bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-bold rounded transition-colors whitespace-nowrap cursor-pointer"
          >
            Adjust Target Inputs
          </button>
        </div>
      )}

      {/* Real-time Anchored Financial Health KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {/* Card 1: Projected Labor Cost Total */}
        <div className="bg-white border border-[#e8e2d8] rounded p-5 shadow-sm hover:border-[#ae001a]/30 transition-all relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">
              Projected Labor Cost Total
            </span>
            <div className="w-9 h-9 rounded bg-[#f8f6f2] border border-[#e8e2d8] flex items-center justify-center text-[#ae001a]">
              <span className="material-symbols-outlined text-lg">attach_money</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#222222] font-poppins">
              ${data.projectedLaborCostTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-[#5f5e5e]">est. payroll</span>
          </div>
          <div className="mt-2 text-[11px] text-[#5f5e5e] flex items-center gap-1 font-poppins">
            <span>Max Budget Cap:</span>
            <strong className="text-[#222222]">${data.maxWeeklyLaborBudget.toFixed(2)}</strong>
          </div>
        </div>

        {/* Card 2: Forecasted Sales Revenue */}
        <div className="bg-white border border-[#e8e2d8] rounded p-5 shadow-sm hover:border-[#ae001a]/30 transition-all relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">
              Forecasted Sales Revenue
            </span>
            <div className="w-9 h-9 rounded bg-[#f8f6f2] border border-[#e8e2d8] flex items-center justify-center text-teal-700">
              <span className="material-symbols-outlined text-lg">trending_up</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-teal-900 font-poppins">
              ${data.forecastedSalesRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-[#5f5e5e]">POS target</span>
          </div>
          <div className="mt-2 text-[11px] text-[#5f5e5e] flex items-center gap-1 font-poppins">
            <span>7-Day Sales Aggregate</span>
          </div>
        </div>

        {/* Card 3: Projected Labor Cost % */}
        <div className="bg-white border border-[#e8e2d8] rounded p-5 shadow-sm hover:border-[#ae001a]/30 transition-all relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">
              Projected Labor Cost %
            </span>
            <div className="w-9 h-9 rounded bg-[#f8f6f2] border border-[#e8e2d8] flex items-center justify-center text-[#ae001a]">
              <span className="material-symbols-outlined text-lg">analytics</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#ae001a] font-poppins">
              {data.projectedLaborCostPercentage.toFixed(1)}%
            </span>
            <span className="text-xs text-[#5f5e5e]">of gross sales</span>
          </div>
          <div className="mt-2 text-[11px] text-[#5f5e5e] flex items-center gap-1 font-poppins">
            <span>Store Target Ratio:</span>
            <strong className="text-[#222222]">{data.targetLaborCostPercentage.toFixed(1)}%</strong>
          </div>
        </div>

        {/* Card 4: Target Variance Gauge */}
        <div className="bg-white border border-[#e8e2d8] rounded p-5 shadow-sm hover:border-[#ae001a]/30 transition-all relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">
              Target Budget Variance
            </span>
            <div
              className={`w-9 h-9 rounded border flex items-center justify-center ${
                data.targetVariance > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              }`}
            >
              <span className="material-symbols-outlined text-lg">savings</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-2xl sm:text-3xl font-black font-poppins ${
                data.targetVariance > 0 ? 'text-amber-900' : 'text-emerald-900'
              }`}
            >
              {data.targetVariance > 0 ? `+${data.targetVariance.toFixed(1)}%` : `${data.targetVariance.toFixed(1)}%`}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                data.targetVariance > 0
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300'
              }`}
            >
              {data.targetVariance > 0 ? 'OVER BUDGET' : 'ON TARGET'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[#5f5e5e] flex items-center gap-1 font-poppins">
            <span>Dollar Variance:</span>
            <strong className={data.budgetVarianceAmount > 0 ? 'text-amber-900 font-bold' : 'text-emerald-900 font-bold'}>
              {data.budgetVarianceAmount > 0
                ? `+$${data.budgetVarianceAmount.toFixed(2)}`
                : `-$${Math.abs(data.budgetVarianceAmount).toFixed(2)}`}
            </strong>
          </div>
        </div>
      </div>

      {/* Scenario Modeling ("What-If" Planning) Tool Drawer */}
      {showScenarioTool && scenarioCalculations && (
        <div className="mt-6 p-6 bg-white border border-amber-300 rounded-lg shadow-md animate-fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-[#e8e2d8]">
            <div className="flex items-center gap-2 text-amber-900">
              <span className="material-symbols-outlined text-2xl text-amber-700">finance</span>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#222222]">Scenario Modeling & "What-If" Planning Tool</h3>
            </div>
            <span className="text-xs text-[#5f5e5e]">Simulate revenue & shift target adjustments in real-time</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-5">
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-2">
                Sales Target Revenue Growth ({scenarioSalesBoostPct > 0 ? `+${scenarioSalesBoostPct}%` : `${scenarioSalesBoostPct}%`})
              </label>
              <input
                type="range"
                min="-20"
                max="30"
                step="5"
                value={scenarioSalesBoostPct}
                onChange={(e) => setScenarioSalesBoostPct(Number(e.target.value))}
                className="w-full accent-[#ae001a]"
              />
              <div className="flex justify-between text-[11px] text-[#5f5e5e] mt-1">
                <span>-20% sales drop</span>
                <span>Baseline</span>
                <span>+30% surge</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-2">
                Wage Rate Multiplier ({scenarioWageMultiplier.toFixed(2)}x)
              </label>
              <input
                type="range"
                min="0.9"
                max="1.3"
                step="0.05"
                value={scenarioWageMultiplier}
                onChange={(e) => setScenarioWageMultiplier(Number(e.target.value))}
                className="w-full accent-teal-700"
              />
              <div className="flex justify-between text-[11px] text-[#5f5e5e] mt-1">
                <span>0.90x (10% cut)</span>
                <span>1.0x (Current)</span>
                <span>1.30x (+30% overtime/holiday)</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-2">
                Shift Headcount Reduction ({scenarioShiftReductionCount} shifts)
              </label>
              <input
                type="range"
                min="0"
                max="6"
                step="1"
                value={scenarioShiftReductionCount}
                onChange={(e) => setScenarioShiftReductionCount(Number(e.target.value))}
                className="w-full accent-amber-600"
              />
              <div className="flex justify-between text-[11px] text-[#5f5e5e] mt-1">
                <span>0 (Full roster)</span>
                <span>-3 shifts</span>
                <span>-6 shifts</span>
              </div>
            </div>
          </div>

          {/* Scenario Calculation Results */}
          <div className="mt-6 p-4 bg-[#f8f6f2] border border-[#e8e2d8] rounded grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-poppins">
            <div>
              <span className="text-[#5f5e5e]">Simulated Sales:</span>
              <div className="text-base font-black text-teal-900 mt-0.5">
                ${scenarioCalculations.adjustedSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <span className="text-[#5f5e5e]">Simulated Labor Cost:</span>
              <div className="text-base font-black text-[#222222] mt-0.5">
                ${scenarioCalculations.adjustedLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <span className="text-[#5f5e5e]">Simulated Labor Cost %:</span>
              <div
                className={`text-base font-black mt-0.5 ${
                  scenarioCalculations.isUnderTarget ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {scenarioCalculations.adjustedLaborCostPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <span className="text-[#5f5e5e]">Projected Net Savings:</span>
              <div
                className={`text-base font-black mt-0.5 ${
                  scenarioCalculations.savingsAmount >= 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {scenarioCalculations.savingsAmount >= 0
                  ? `+$${scenarioCalculations.savingsAmount.toFixed(2)}`
                  : `-$${Math.abs(scenarioCalculations.savingsAmount).toFixed(2)}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Target Budget Configuration Form */}
      <div className="mt-8 bg-white border border-[#e8e2d8] rounded p-5 shadow-sm">
        <form onSubmit={handleSaveBudgetTargets} className="flex flex-col sm:flex-row items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Store Target Labor Cost % Ratio
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="10"
                  max="50"
                  value={targetPctInput}
                  onChange={(e) => setTargetPctInput(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5f5e5e]">%</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Max Weekly Labor Budget ($)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5f5e5e]">$</span>
                <input
                  type="number"
                  step="100"
                  min="1000"
                  value={maxBudgetInput}
                  onChange={(e) => setMaxBudgetInput(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded pl-7 pr-3.5 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isUpdatingTargets}
            className="px-5 py-2.5 bg-[#222222] hover:bg-[#333333] text-white font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {isUpdatingTargets ? (
              <span className="material-symbols-outlined text-base animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined text-base text-[#ae001a]">save</span>
            )}
            Update Store Targets
          </button>
        </form>
      </div>

      {/* Visual Analytics: Daily Sales Projections vs Scheduled Labor Cost Matrix */}
      <div className="mt-8 bg-white border border-[#e8e2d8] rounded p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#e8e2d8] mb-6 gap-2">
          <div>
            <h3 className="text-base font-bold text-[#222222] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ae001a]">bar_chart</span>
              Daily Sales Forecast vs. Scheduled Labor Matrix
            </h3>
            <p className="text-xs text-[#5f5e5e] mt-0.5">
              Hover over daily bars to inspect FOH vs BOH labor costs and hourly sales projections (`hover:shadow-lg transition-all duration-200`).
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-teal-700"></span>
              <span className="text-[#5f5e5e] font-semibold">Forecasted Sales</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#ae001a]"></span>
              <span className="text-[#5f5e5e] font-semibold">Scheduled Labor</span>
            </div>
          </div>
        </div>

        {/* Chart Matrix Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
          {data.dailyForecasts.map((day) => {
            const heightPct = Math.round((day.projectedSales / maxSalesInWeek) * 100);
            const isDayOverTarget = day.laborCostPercentage > data.targetLaborCostPercentage;

            return (
              <div
                key={day.date}
                onMouseEnter={() => setActiveHoverDay(day)}
                onMouseLeave={() => setActiveHoverDay(null)}
                className="bg-[#f8f6f2] border border-[#e8e2d8] hover:border-[#ae001a]/60 rounded p-3.5 flex flex-col justify-between transition-all duration-200 hover:shadow-md cursor-pointer relative group"
              >
                {/* Day Header */}
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#222222] mb-1">
                    <span>{day.dayName.substring(0, 3)}</span>
                    <span className="text-[10px] text-[#5f5e5e] font-poppins">{day.date.split('-').slice(1).join('/')}</span>
                  </div>
                  <div
                    className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded text-center font-poppins ${
                      isDayOverTarget
                        ? 'bg-amber-50 text-amber-900 border border-amber-300'
                        : 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                    }`}
                  >
                    {day.laborCostPercentage.toFixed(1)}% Ratio
                  </div>
                </div>

                {/* Stacked Visual Bar Representation */}
                <div className="my-4 h-32 flex items-end justify-center gap-2 bg-white rounded p-2 border border-[#e8e2d8]">
                  {/* Sales Bar */}
                  <div
                    className="w-1/2 bg-teal-700 hover:bg-teal-600 rounded-t transition-all"
                    style={{ height: `${Math.max(15, heightPct)}%` }}
                    title={`Sales: $${day.projectedSales.toFixed(2)}`}
                  ></div>
                  {/* Labor Bar */}
                  <div
                    className={`w-1/2 rounded-t transition-all ${
                      isDayOverTarget ? 'bg-amber-600 hover:bg-amber-500' : 'bg-[#ae001a] hover:bg-[#930015]'
                    }`}
                    style={{
                      height: `${Math.max(
                        10,
                        Math.round((day.scheduledLaborCost / (maxSalesInWeek * 0.5)) * 100)
                      )}%`,
                    }}
                    title={`Labor: $${day.scheduledLaborCost.toFixed(2)}`}
                  ></div>
                </div>

                {/* Foot Metrics */}
                <div className="text-[11px] font-poppins space-y-1 pt-2 border-t border-[#e8e2d8]">
                  <div className="flex justify-between text-[#5f5e5e]">
                    <span>Sales:</span>
                    <strong className="text-teal-900">${day.projectedSales.toFixed(0)}</strong>
                  </div>
                  <div className="flex justify-between text-[#5f5e5e]">
                    <span>Labor:</span>
                    <strong className="text-[#ae001a]">${day.scheduledLaborCost.toFixed(0)}</strong>
                  </div>
                </div>

                {/* Hover Micro-Interaction Popover */}
                {activeHoverDay?.date === day.date && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-30 w-64 p-3.5 bg-white border border-[#e8e2d8] rounded-lg shadow-2xl text-xs space-y-2 text-[#222222] pointer-events-none animate-fade-in">
                    <div className="font-bold border-b border-[#e8e2d8] pb-1 text-[#ae001a] flex justify-between">
                      <span>{day.dayName} Breakdown</span>
                      <span className="font-poppins">{day.laborCostPercentage.toFixed(1)}% Ratio</span>
                    </div>
                    <div className="flex justify-between font-poppins">
                      <span className="text-[#5f5e5e]">FOH Labor Cost:</span>
                      <strong className="text-[#222222]">${day.fohLaborCost.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between font-poppins">
                      <span className="text-[#5f5e5e]">BOH Labor Cost:</span>
                      <strong className="text-[#222222]">${day.bohLaborCost.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between font-poppins">
                      <span className="text-[#5f5e5e]">Scheduled Hours:</span>
                      <strong className="text-[#222222]">{day.totalScheduledHours.toFixed(1)} hrs</strong>
                    </div>
                    {day.hourlySalesProjections && (
                      <div className="pt-2 border-t border-[#e8e2d8] text-[10px]">
                        <span className="text-[#5f5e5e] font-bold block mb-1">Peak Hourly Projections:</span>
                        {day.hourlySalesProjections.slice(0, 3).map((h) => (
                          <div key={h.hour} className="flex justify-between text-[#222222] font-poppins">
                            <span>{h.hour}</span>
                            <span>Sales: ${h.sales} | Labor: ${h.laborCost}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Collaborator Payroll Breakdown Grid */}
      <div className="mt-8 bg-white border border-[#e8e2d8] rounded-lg shadow-sm overflow-hidden">
        <div className="bg-[#222222] text-white p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ae001a]">group</span>
              Collaborator Payroll Breakdown & Overtime Detection
            </h3>
            <p className="text-xs text-white/70 font-normal mt-0.5">
              Line-item breakdown listing regular hours, overtime hours (1.5x), base wages, and weekly overtime threshold warnings.
            </p>
          </div>
          <span className="text-xs text-white/80 font-poppins">
            Total Staff: {data.payrollBreakdown.length} collaborators
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#ece8e0] border-b border-[#e8e2d8] text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider">
                <th className="py-3 px-4">Collaborator</th>
                <th className="py-3 px-4">Role & Dept</th>
                <th className="py-3 px-4 text-right">Base Rate</th>
                <th className="py-3 px-4 text-right">Reg. Hours</th>
                <th className="py-3 px-4 text-right">OT Hours</th>
                <th className="py-3 px-4 text-right">Total Hours</th>
                <th className="py-3 px-4 text-right">Reg. Pay</th>
                <th className="py-3 px-4 text-right">OT Pay (1.5x)</th>
                <th className="py-3 px-4 text-right">Est. Total Pay</th>
                <th className="py-3 px-4 text-center">Overtime Cap Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e2d8] text-xs font-poppins">
              {data.payrollBreakdown.map((row) => (
                <tr key={row.collaboratorId} className="hover:bg-[#fef9f1] transition-colors">
                  <td className="py-3 px-4 font-bold text-[#222222]">
                    {row.collaboratorName}
                  </td>
                  <td className="py-3 px-4 text-[#222222]">
                    <span className="font-semibold text-[#ae001a]">{row.role}</span>
                    <span className="text-[11px] text-[#5f5e5e] block">{row.department}</span>
                  </td>
                  <td className="py-3 px-4 text-right text-[#5f5e5e] font-poppins">
                    ${row.hourlyWage.toFixed(2)}/h
                  </td>
                  <td className="py-3 px-4 text-right text-[#5f5e5e] font-poppins">
                    {row.regularHours.toFixed(1)}h
                  </td>
                  <td className="py-3 px-4 text-right font-poppins font-bold text-amber-900">
                    {row.overtimeHours > 0 ? `${row.overtimeHours.toFixed(1)}h` : '0.0h'}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-[#222222] font-poppins">
                    {row.totalHours.toFixed(1)}h
                  </td>
                  <td className="py-3 px-4 text-right text-[#5f5e5e] font-poppins">
                    ${row.regularPay.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-poppins font-bold text-amber-900">
                    ${row.overtimePay.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-black text-[#ae001a] font-poppins text-sm">
                    ${row.totalProjectedPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.overtimeHours > 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-900 border border-rose-300 inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs text-rose-600">alarm_on</span>
                        EXCEEDS 40H (+{row.overtimeHours.toFixed(1)}h)
                      </span>
                    ) : row.totalHours >= 38 ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs text-amber-600">warning</span>
                        NEAR CAP ({row.totalHours.toFixed(1)}h)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300">
                        STANDARD ({row.totalHours.toFixed(1)}h)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pre-Publication Confirmation Modal */}
      {showPrePublishModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#e8e2d8] rounded-lg w-full max-w-lg min-w-[320px] sm:min-w-[480px] p-6 text-[#222222] shadow-2xl">
            <div className="bg-[#222222] text-white -mx-6 -mt-6 p-4 rounded-t-lg mb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ae001a] text-xl">alarm_on</span>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">Pre-Publication Roster Budget Verification</h3>
              </div>
              <button onClick={() => setShowPrePublishModal(false)} className="text-white/70 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {isOverBudget ? (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded text-xs space-y-2 mb-4">
                <div className="flex items-center gap-2 text-amber-950 font-bold">
                  <span className="material-symbols-outlined text-base text-amber-700">warning</span>
                  Budget Boundary Warning Flagged
                </div>
                <p className="text-amber-900">
                  Scheduled roster exceeds target labor budget by{' '}
                  <strong className="text-amber-950 font-poppins font-black">${Math.abs(data.budgetVarianceAmount).toFixed(2)}</strong>.
                </p>
                <p className="text-[#5f5e5e]">
                  Projected Labor Cost % is {data.projectedLaborCostPercentage.toFixed(1)}% (Store Target: {data.targetLaborCostPercentage.toFixed(1)}%).
                </p>
              </div>
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded text-xs space-y-2 mb-4">
                <div className="flex items-center gap-2 text-emerald-950 font-bold">
                  <span className="material-symbols-outlined text-base text-emerald-700">check_circle</span>
                  Schedule Within Target Budget Boundaries
                </div>
                <p className="text-emerald-900 font-poppins">
                  Projected Labor Cost Total (${data.projectedLaborCostTotal.toFixed(2)}) is within max budget limit (${data.maxWeeklyLaborBudget.toFixed(2)}).
                </p>
              </div>
            )}

            <p className="text-xs text-[#5f5e5e] mb-6">
              Publishing will convert draft shifts to published status and notify all scheduled staff.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#e8e2d8]">
              <button
                type="button"
                onClick={() => setShowPrePublishModal(false)}
                className="px-4 py-2 text-xs font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] hover:bg-[#fef9f1] rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPrePublishModal(false);
                  setPublishSuccessMsg(
                    `Roster published successfully! Scheduled spend: $${data.projectedLaborCostTotal.toFixed(2)} (${data.projectedLaborCostPercentage.toFixed(1)}% of sales).`
                  );
                }}
                className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white bg-[#ae001a] hover:bg-[#930015] rounded transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">publish</span>
                Confirm & Publish Master Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Management Shortcuts */}
      <StaffManagementQuickLinks
        activeModule="labor-forecasting"
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default LaborCostForecastingView;
