import React, { useState } from 'react';
import { AppModal } from '../../../shared/AppModal';
import { useKdsCriticalSla } from '../../../../../lib/kds-sla-config';

interface KitchenSlaFormProps {
  criticalSlaMinutes: number;
  onSave: (mins: number) => void;
  onClose: () => void;
}

const KitchenSlaForm: React.FC<KitchenSlaFormProps> = ({
  criticalSlaMinutes,
  onSave,
  onClose,
}) => {
  const [tempSla, setTempSla] = useState<number>(criticalSlaMinutes);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const safeVal = Math.max(1, Math.min(120, tempSla));
    onSave(safeVal);
  };

  const PRESETS = [2, 5, 8, 10, 12, 15, 20, 25, 30];

  return (
    <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 font-sans overflow-hidden">
      {/* Scrollable Body with vertical scrollbar */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[calc(85vh-130px)]">
        {/* Anti-Leapfrogging Callout (Short & Concise) */}
        <div className="bg-[#fef9f1] border-l-4 border-[#ae001a] px-3.5 py-2.5 rounded-r-lg">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#ae001a] text-lg shrink-0">
              shield
            </span>
            <p className="text-xs text-[#1d1c17]">
              <strong className="text-[#ae001a]">SLA Shield:</strong> Orders reaching this wait time are locked in queue to prevent newer orders from jumping ahead.
            </p>
          </div>
        </div>

        {/* Interactive Threshold & Slider */}
        <div className="bg-white border border-[#e8e2d8] p-5 rounded-xl space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="slaMinutesInput" className="font-extrabold text-xs text-[#1d1c17] uppercase tracking-wider block">
                Critical SLA Threshold
              </label>
              <p className="text-[11px] text-[#5f5e5e] mt-0.5">
                Maximum acceptable wait time before a ticket is flagged as a service breach.
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-3 py-1 rounded-lg">
              <span className="font-mono text-xl font-black text-red-700">{tempSla}</span>
              <span className="text-xs font-bold text-red-600">min</span>
            </div>
          </div>

          {/* Slider with exact-aligned scale markers */}
          <div className="space-y-1 pt-1">
            <input
              id="slaMinutesInput"
              type="range"
              min="1"
              max="60"
              step="1"
              value={tempSla}
              onChange={(e) => setTempSla(Number(e.target.value))}
              className="w-full accent-[#ae001a] cursor-pointer"
            />
            <div className="relative h-5 text-[10px] font-mono text-[#8a857a] select-none">
              {/* 1 min -> 0% */}
              <button
                type="button"
                onClick={() => setTempSla(1)}
                className="absolute left-0 top-0 cursor-pointer hover:text-[#ae001a] font-bold"
                title="Set to 1 min"
              >
                1m
              </button>

              {/* 15 min (Default) -> exactly at (15 - 1) / (60 - 1) * 100 = 23.73% */}
              <button
                type="button"
                onClick={() => setTempSla(15)}
                style={{ left: `${((15 - 1) / (60 - 1)) * 100}%`, transform: 'translateX(-50%)' }}
                className={`absolute top-0 cursor-pointer transition-colors whitespace-nowrap ${
                  tempSla === 15 ? 'text-[#ae001a] font-black' : 'hover:text-[#ae001a]'
                }`}
                title="Set to 15 min (Default)"
              >
                ▲ 15m (Default)
              </button>

              {/* 30 min -> exactly at (30 - 1) / (60 - 1) * 100 = 49.15% */}
              <button
                type="button"
                onClick={() => setTempSla(30)}
                style={{ left: `${((30 - 1) / (60 - 1)) * 100}%`, transform: 'translateX(-50%)' }}
                className={`absolute top-0 cursor-pointer transition-colors whitespace-nowrap ${
                  tempSla === 30 ? 'text-[#ae001a] font-black' : 'hover:text-[#ae001a]'
                }`}
                title="Set to 30 min"
              >
                30m
              </button>

              {/* 60 min -> 100% */}
              <button
                type="button"
                onClick={() => setTempSla(60)}
                className="absolute right-0 top-0 cursor-pointer hover:text-[#ae001a] font-bold text-right"
                title="Set to 60 min"
              >
                60m
              </button>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="pt-2 border-t border-[#f0ece1]">
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-2">
              Quick Presets (Ideal for Testing):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTempSla(preset)}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer border ${
                    tempSla === preset
                      ? 'bg-[#ae001a] text-white border-[#ae001a] shadow-xs scale-105'
                      : 'bg-[#fcfbf9] hover:bg-[#ede7dc] text-[#1d1c17] border-[#e8e2d8]'
                  }`}
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Action Footer */}
      <div className="p-4 bg-[#fcfbf9] border-t border-[#e8e2d8] flex items-center justify-end gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-bold text-[#5f5e5e] hover:text-[#1d1c17] cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-6 py-2.5 bg-[#ae001a] hover:bg-[#8e0015] text-white text-xs font-bold rounded shadow-xs cursor-pointer flex items-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">check_circle</span>
          Save &amp; Apply SLA
        </button>
      </div>
    </form>
  );
};

interface KitchenSlaConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavedToast?: (message: string) => void;
}

export const KitchenSlaConfigModal: React.FC<KitchenSlaConfigModalProps> = ({
  isOpen,
  onClose,
  onSavedToast,
}) => {
  const [criticalSlaMinutes, setCriticalSlaMinutes] = useKdsCriticalSla();

  if (!isOpen) return null;

  const handleSave = (safeVal: number) => {
    setCriticalSlaMinutes(safeVal);
    if (onSavedToast) {
      onSavedToast(`Kitchen SLA threshold updated to ${safeVal} minutes.`);
    }
    onClose();
  };

  return (
    <AppModal
      title="Kitchen SLA & Shield Configuration"
      size="md"
      onClose={onClose}
    >
      <KitchenSlaForm
        criticalSlaMinutes={criticalSlaMinutes}
        onSave={handleSave}
        onClose={onClose}
      />
    </AppModal>
  );
};
