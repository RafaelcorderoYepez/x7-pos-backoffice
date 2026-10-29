import React from 'react';
import { SalesMetricCard } from './SalesMetricCard';
import { TablesOccupancyCard } from './TablesOccupancyCard';
import { KitchenPerformanceCard } from './KitchenPerformanceCard';
import { TopSellingItems } from './TopSellingItems';
import { CurrentShifts } from './CurrentShifts';

interface MerchantHomeDashboardProps {
  refreshTrigger: number;
  onOpenKitchenMonitor: () => void;
  onNewReservation: () => void;
  onVoidTransaction: () => void;
  onRunEodReport: () => void;
  onEmergencySupport: () => void;
}

/** Portada del backoffice del merchant (pestaña "dashboard"). */
export const MerchantHomeDashboard: React.FC<MerchantHomeDashboardProps> = ({
  refreshTrigger,
  onOpenKitchenMonitor,
  onNewReservation,
  onVoidTransaction,
  onRunEodReport,
  onEmergencySupport,
}) => (
  <div className="space-y-8">
    <div className="grid grid-cols-12 gap-6">
      <SalesMetricCard refreshTrigger={refreshTrigger} />
      <div className="col-span-12 lg:col-span-4 grid grid-rows-2 gap-6">
        <TablesOccupancyCard refreshTrigger={refreshTrigger} />
        <KitchenPerformanceCard refreshTrigger={refreshTrigger} />
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <TopSellingItems refreshTrigger={refreshTrigger} />
      <CurrentShifts refreshTrigger={refreshTrigger} />

      <div className="bg-white border border-[#e8e2d8] p-0 overflow-hidden relative group h-[400px]">
        <img
          className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
          alt="Kitchen display station screen"
          src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=400&h=400&fit=crop&q=80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#222222] via-transparent to-transparent opacity-80"></div>
        <div className="absolute bottom-0 left-0 p-6 w-full text-left">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-white text-[10px] font-bold uppercase tracking-widest">
              Live Kitchen Status
            </span>
          </div>
          <h4 className="text-white font-bold text-lg mb-1">Peak Hour Incoming</h4>
          <p className="text-white/70 text-body-sm">
            12 new orders in last 10 minutes. Staffing at optimal levels.
          </p>
          <button
            onClick={onOpenKitchenMonitor}
            className="mt-4 w-full py-2 bg-[#d51f2c] text-white font-bold text-xs uppercase tracking-widest hover:bg-[#b01a24] transition-colors"
          >
            View Monitor
          </button>
        </div>
      </div>
    </div>

    <div className="bg-[#222222] p-8 flex flex-col md:flex-row justify-between items-center gap-6">
      <div className="text-center md:text-left">
        <h3 className="text-white font-bold text-xl">Quick Launch</h3>
        <p className="text-white/60 text-sm">Access core POS functions instantly.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <button
          onClick={onNewReservation}
          className="px-6 py-3 bg-white text-[#222222] font-bold text-xs uppercase border-b-4 border-[#d51f2c] hover:translate-y-[-2px] transition-transform duration-200"
        >
          New Reservation
        </button>
        <button
          onClick={onVoidTransaction}
          className="px-6 py-3 bg-white text-[#222222] font-bold text-xs uppercase border-b-4 border-[#d51f2c] hover:translate-y-[-2px] transition-transform duration-200"
        >
          Void Transaction
        </button>
        <button
          onClick={onRunEodReport}
          className="px-6 py-3 bg-white text-[#222222] font-bold text-xs uppercase border-b-4 border-[#d51f2c] hover:translate-y-[-2px] transition-transform duration-200"
        >
          Run EOD Report
        </button>
        <button
          onClick={onEmergencySupport}
          className="px-6 py-3 bg-[#d51f2c] text-white font-bold text-xs uppercase hover:bg-[#b01a24] transition-colors duration-200"
        >
          Emergency Support
        </button>
      </div>
    </div>
  </div>
);
