import React from 'react';

interface ComingSoonViewProps {
  title: string;
  route: string;
  icon: string;
  onBack: () => void;
}

/** Secciones con URL propia pero aún sin contenido (legales, soporte). */
export const ComingSoonView: React.FC<ComingSoonViewProps> = ({ title, route, icon, onBack }) => (
  <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm max-w-4xl mx-auto my-8">
    <div className="flex items-center gap-4 border-b border-[#e8e2d8] pb-6 mb-6">
      <span className="material-symbols-outlined text-primary text-5xl">
        {icon}
      </span>
      <div>
        <h2 className="text-h2 font-black text-[#222222] uppercase leading-none">
          {title}
        </h2>
        <p className="text-[11px] text-secondary font-bold uppercase tracking-wider mt-1.5">
          Provisional SPA Route: <span className="text-primary">{route}</span>
        </p>
      </div>
    </div>

    <div className="p-6 bg-[#f1ece4] border border-[#e8e2d8] rounded mb-6 text-left">
      <p className="font-bold text-primary text-sm uppercase tracking-wider mb-2">Feature Coming Soon</p>
      <p className="text-body-md text-[#5f5e5e] leading-relaxed">
        This section is under active development. In a future update, it will be available with full functionality in <strong>X7 Point of Sale</strong>.
      </p>
    </div>

    <div className="flex justify-end">
      <button
        onClick={onBack}
        className="px-6 py-2.5 bg-[#222222] text-white font-bold text-xs uppercase tracking-wider hover:bg-primary transition-all rounded shadow-md"
      >
        Back to Dashboard
      </button>
    </div>
  </div>
);

/** "Plan Features" sin plan elegido: pide escoger uno antes de mapear funcionalidades. */
export const PlanFeaturesPickPlanView: React.FC<{ onChoosePlan: () => void }> = ({ onChoosePlan }) => (
  <div className="bg-white border border-[#e8e2d8] p-12 rounded flex flex-col items-center text-center">
    <span className="material-symbols-outlined text-[#ae001a] text-6xl" aria-hidden="true">checklist</span>
    <h2 className="text-h2 font-black text-[#222222] mt-4 uppercase">Plan Features</h2>
    <p className="text-body-md text-[#666666] mt-2 max-w-md">
      Select a subscription plan to manage the features it unlocks.
    </p>
    <button
      type="button"
      onClick={onChoosePlan}
      className="mt-6 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-colors duration-200"
    >
      Choose a plan
    </button>
  </div>
);

interface FeatureInDevelopmentViewProps {
  featureName: string;
  featureIcon: string;
  appName: string;
  /** Hub del módulo al que pertenece la funcionalidad, si tiene uno. */
  hub?: { title: string } | null;
  onBackToHub: () => void;
  onBackToDashboard: () => void;
}

/** Funcionalidad del menú que todavía no tiene vista. */
export const FeatureInDevelopmentView: React.FC<FeatureInDevelopmentViewProps> = ({
  featureName,
  featureIcon,
  appName,
  hub,
  onBackToHub,
  onBackToDashboard,
}) => (
  <div className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden">
    <div className="bg-[#222222] px-8 py-6 flex items-center gap-5">
      <div className="w-12 h-12 bg-[#d51f2c] rounded flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-white text-2xl">{featureIcon}</span>
      </div>
      <div className="text-left">
        <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-0.5">
          {appName || 'Module'}
        </p>
        <h2 className="text-white font-black text-xl uppercase tracking-tight leading-none">
          {featureName}
        </h2>
      </div>
    </div>

    <div className="p-10 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full mb-6">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
        <span className="text-amber-700 text-[11px] font-bold uppercase tracking-wider">In Development</span>
      </div>

      <p className="text-body-md text-[#5f5e5e] max-w-md mx-auto leading-relaxed">
        The module <strong className="text-[#222222]">{featureName}</strong> is under active development.
        It will be available in an upcoming release of <strong className="text-[#d51f2c]">X7 Point of Sale</strong>.
      </p>

      <div className="flex justify-center gap-3 mt-8">
        {hub && (
          <button
            onClick={onBackToHub}
            className="px-5 py-2.5 bg-[#ae001a] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#930015] transition-all rounded shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            <span>Back to {hub.title}</span>
          </button>
        )}
        <button
          onClick={onBackToDashboard}
          className="px-5 py-2.5 bg-[#222222] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#d51f2c] transition-all rounded shadow-sm cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  </div>
);
