import React from 'react';
import { SaasOverviewContent } from '../../SaaSFrame/dashboard/SaasOverviewContent';

interface SaasDashboardViewProps {
  refreshTrigger: number;
  onNavigateToView: (view: string) => void;
}

/** Portada del dueño de la plataforma (rol SaaS Owner) dentro del backoffice. */
export const SaasDashboardView: React.FC<SaasDashboardViewProps> = ({ refreshTrigger, onNavigateToView }) => (
  <div className="space-y-8 animate-fade-in text-left">
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
      <div>
        <h1 className="font-sans text-h1 text-[#222222] uppercase tracking-tighter">
          Platform SaaS <span className="text-[#d51f2c]">/</span> Overview
        </h1>
        <p className="text-body-md text-[#666666] mt-1">
          Real-time performance metrics and merchant growth tracking.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => alert('Exporting SaaS report...')}
          className="px-4 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-[#222222] hover:text-white transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          Export Report
        </button>
        <button
          onClick={() => alert('New Merchant simulation')}
          className="px-4 py-2 bg-[#d51f2c] text-white font-bold text-label-caps hover:opacity-90 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New Merchant
        </button>
      </div>
    </div>

    <SaasOverviewContent refreshTrigger={refreshTrigger} onNavigateToView={onNavigateToView} />
  </div>
);
