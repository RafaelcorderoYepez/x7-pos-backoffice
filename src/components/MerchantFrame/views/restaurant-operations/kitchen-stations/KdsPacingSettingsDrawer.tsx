import React from 'react';
import type { KdsCardDensity } from './kds-monitor-model';

interface KdsPacingSettingsDrawerProps {
  cardDensity: KdsCardDensity;
  mainCourseHoldDelayMins: number;
  dessertHoldDelayMins: number;
  criticalSlaMinutes: number;
  autoFireEnabled: boolean;
  audioChimeEnabled: boolean;
  onDensityChange: (density: KdsCardDensity) => void;
  onMainCourseHoldDelayChange: (mins: number) => void;
  onDessertHoldDelayChange: (mins: number) => void;
  onCriticalSlaChange: (mins: number) => void;
  onToggleAutoFire: () => void;
  onToggleAudioChime: () => void;
  onRunAutoPacingNow: () => void;
  onClose: () => void;
}

/** Panel lateral de pacing: densidad de tarjetas, retenciones por curso, SLA crítico y avisos. */
export const KdsPacingSettingsDrawer: React.FC<KdsPacingSettingsDrawerProps> = ({
  cardDensity,
  mainCourseHoldDelayMins,
  dessertHoldDelayMins,
  criticalSlaMinutes,
  autoFireEnabled,
  audioChimeEnabled,
  onDensityChange,
  onMainCourseHoldDelayChange,
  onDessertHoldDelayChange,
  onCriticalSlaChange,
  onToggleAutoFire,
  onToggleAudioChime,
  onRunAutoPacingNow,
  onClose,
}) => (
  <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-fade-in font-sans">
    <div className="w-full max-w-md bg-[#1a1b20] border-l-2 border-[#ae001a] h-full flex flex-col shadow-2xl">
      {/* Drawer Header */}
      <div className="p-5 border-b border-zinc-800 bg-[#212228] flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[#ae001a] text-2xl">tune</span>
          <div>
            <h2
              className="text-base font-black uppercase tracking-wider text-white !text-white"
              style={{ color: '#ffffff', fontSize: '15px', lineHeight: '1.4' }}
            >
              Multi-Course Pacing SLA
            </h2>
            <p className="text-xs text-zinc-400 font-bold" style={{ color: '#a1a1aa' }}>
              Target Hold Delays &amp; Automated Fire Thresholds
            </p>
          </div>
        </div>
        <button
          onClick={() => onClose()}
          className="w-8 h-8 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-sm">
        {/* Card Density Setting */}
        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3
                className="font-black text-white !text-white text-xs uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: '#ffffff', fontSize: '12px', lineHeight: '1rem' }}
              >
                <span className="material-symbols-outlined text-amber-400 text-sm">view_column</span>
                KDS Ticket Card Density
              </h3>
              <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                Controls ticket width to fit more simultaneous cards on screen.
              </p>
            </div>
            <span className="font-mono text-xs font-black text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40 uppercase">
              {cardDensity}
            </span>
          </div>
          <div className="flex gap-2">
            {(['compact', 'normal', 'spacious'] as const).map((density) => (
              <button
                key={density}
                type="button"
                onClick={() => onDensityChange(density)}
                className={`flex-1 py-1.5 rounded text-xs font-bold border transition-all cursor-pointer uppercase ${
                  cardDensity === density
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                }`}
              >
                {density === 'compact' ? 'Compact (256px)' : density === 'normal' ? 'Normal (288px)' : 'Wide (320px)'}
              </button>
            ))}
          </div>
        </div>

        {/* Main Course Delay Setting */}
        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3
                className="font-black text-white !text-white text-xs uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: '#ffffff', fontSize: '12px', lineHeight: '1rem' }}
              >
                <span className="material-symbols-outlined text-blue-400 text-sm">lunch_dining</span>
                Main Course Hold Delay
              </h3>
              <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                Target window after appetizers before mains auto-fire.
              </p>
            </div>
            <span className="font-mono text-base font-black text-blue-400 bg-blue-950/60 px-2.5 py-1 rounded border border-blue-500/40">
              {mainCourseHoldDelayMins}m
            </span>
          </div>
          <input
            type="range"
            min="4"
            max="20"
            step="1"
            value={mainCourseHoldDelayMins}
            onChange={(e) => onMainCourseHoldDelayChange(Number(e.target.value))}
            className="w-full accent-[#ae001a] cursor-pointer"
          />
          <div className="flex gap-2">
            {[8, 10, 12, 15].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onMainCourseHoldDelayChange(preset)}
                className={`flex-1 py-1 rounded text-xs font-bold border transition-all cursor-pointer ${
                  mainCourseHoldDelayMins === preset
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        </div>

        {/* Dessert Delay Setting */}
        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3
                className="font-black text-white !text-white text-xs uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: '#ffffff', fontSize: '12px', lineHeight: '1rem' }}
              >
                <span className="material-symbols-outlined text-purple-400 text-sm">cake</span>
                Dessert Course Hold Delay
              </h3>
              <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                Target hold delay while entrees are served.
              </p>
            </div>
            <span className="font-mono text-base font-black text-purple-400 bg-purple-950/60 px-2.5 py-1 rounded border border-purple-500/40">
              {dessertHoldDelayMins}m
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="35"
            step="5"
            value={dessertHoldDelayMins}
            onChange={(e) => onDessertHoldDelayChange(Number(e.target.value))}
            className="w-full accent-[#ae001a] cursor-pointer"
          />
          <div className="flex gap-2">
            {[15, 20, 25, 30].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onDessertHoldDelayChange(preset)}
                className={`flex-1 py-1 rounded text-xs font-bold border transition-all cursor-pointer ${
                  dessertHoldDelayMins === preset
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        </div>

        {/* Critical Kitchen SLA & Shield Setting */}
        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3
                className="font-black text-white !text-white text-xs uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: '#ffffff', fontSize: '12px', lineHeight: '1rem' }}
              >
                <span className="material-symbols-outlined text-red-500 text-sm">shield</span>
                Critical SLA Shield Target
              </h3>
              <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                Orders reaching this wait receive SLA Shield protection &amp; turn red.
              </p>
            </div>
            <span className="font-mono text-base font-black text-red-400 bg-red-950/60 px-2.5 py-1 rounded border border-red-500/40">
              {criticalSlaMinutes}m
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="60"
            step="1"
            value={criticalSlaMinutes}
            onChange={(e) => onCriticalSlaChange(Number(e.target.value))}
            className="w-full accent-[#ae001a] cursor-pointer"
          />
          <div className="flex flex-wrap gap-2">
            {[2, 5, 10, 15, 20, 30].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onCriticalSlaChange(preset)}
                className={`flex-1 py-1 rounded text-xs font-bold border transition-all cursor-pointer ${
                  criticalSlaMinutes === preset
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        </div>

        {/* Automation Toggles */}
        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p
                className="font-black text-xs text-white !text-white uppercase tracking-wider"
                style={{ color: '#ffffff' }}
              >
                Automated Fire on Expiration
              </p>
              <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                Release held dishes directly to cook line queues when pacing timer reaches zero.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleAutoFire()}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                autoFireEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                  autoFireEnabled ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
            <div>
              <p
                className="font-black text-xs text-white !text-white uppercase tracking-wider"
                style={{ color: '#ffffff' }}
              >
                Kitchen Audio Chime
              </p>
              <p className="text-xs text-zinc-400 font-medium mt-0.5" style={{ color: '#a1a1aa' }}>
                Sound resonant double bell when courses or items are fired.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleAudioChime()}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                audioChimeEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                  audioChimeEnabled ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Force Pacing Engine Now */}
        <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl space-y-2">
          <h4
            className="font-black text-xs uppercase tracking-wider text-amber-300 flex items-center gap-1.5"
            style={{ color: '#fcd34d' }}
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
            Immediate Staging Override
          </h4>
          <p className="text-xs text-zinc-400" style={{ color: '#a1a1aa' }}>
            Instantly releases all held courses across all active tickets without waiting for timers.
          </p>
          <button
            type="button"
            onClick={onRunAutoPacingNow}
            className="w-full mt-2 py-2 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-black text-xs uppercase tracking-wider rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
          >
            <span className="material-symbols-outlined text-base">flash_on</span>
            <span>Release All Held Courses Now</span>
          </button>
        </div>
      </div>

      {/* Drawer Footer */}
      <div className="p-4 border-t border-zinc-800 bg-[#212228] flex justify-end gap-3">
        <button
          type="button"
          onClick={() => onClose()}
          className="w-full py-2.5 bg-[#ae001a] hover:bg-[#900015] text-white font-black text-xs uppercase tracking-wider rounded transition-colors cursor-pointer shadow-md"
        >
          Save &amp; Close Settings
        </button>
      </div>
    </div>
  </div>
);
