/**
 * KitchenAllergyModifierPicker.tsx
 *
 * 1-Click Interactive Allergy & Custom Modifier Builder for KDS Orders.
 * All UI labels in English (KDS language toggle operates on the monitor view).
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  detectAllergies,
  parseItemModifiers,
} from './kdsLocalization';

export interface KitchenAllergyModifierPickerProps {
  notes: string;
  onChange: (newNotes: string) => void;
  className?: string;
  placeholder?: string;
}

interface AllergyQuickOption {
  id: string;
  label: string;
  insertValue: string;
  matchPattern: RegExp;
  icon: string;
}

const CRITICAL_ALLERGY_OPTIONS: AllergyQuickOption[] = [
  {
    id: 'celiac',
    label: 'Gluten-Free / Celiac',
    insertValue: 'Gluten-Free, Celiac',
    matchPattern: /(celiac|celíaco|sin gluten|gluten-free)/i,
    icon: 'warning',
  },
  {
    id: 'peanuts',
    label: 'Peanuts / Tree Nuts',
    insertValue: 'Severe Allergy: No Peanuts',
    matchPattern: /(peanut|maní|cacahuate|tree nut|nut|nueces)/i,
    icon: 'warning',
  },
  {
    id: 'dairy',
    label: 'Dairy-Free',
    insertValue: 'Dairy-Free',
    matchPattern: /(dairy|sin lácteo|dairy-free|lactosa|lactose)/i,
    icon: 'warning',
  },
  {
    id: 'shellfish',
    label: 'Shellfish',
    insertValue: 'Shellfish Allergy',
    matchPattern: /(shellfish|mariscos|crustáceo)/i,
    icon: 'warning',
  },
  {
    id: 'vegan',
    label: 'Vegan',
    insertValue: 'Vegan',
    matchPattern: /(vegan|vegano)/i,
    icon: 'eco',
  },
];

export const KitchenAllergyModifierPicker: React.FC<KitchenAllergyModifierPickerProps> = ({
  notes,
  onChange,
  className = '',
  placeholder = 'Other custom notes (e.g. cut in half, sauce on the side)...',
}) => {
  const [activeBuilder, setActiveBuilder] = useState<'addition' | 'removal' | null>(null);
  const [builderInput, setBuilderInput] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeBuilder && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeBuilder]);

  // Active allergy IDs
  const activeAllergyIds = useMemo(() => {
    const ids = new Set<string>();
    if (!notes || !notes.trim()) return ids;

    for (const opt of CRITICAL_ALLERGY_OPTIONS) {
      if (opt.matchPattern.test(notes)) {
        ids.add(opt.id);
      }
    }
    return ids;
  }, [notes]);

  // Current segments breakdown for removable badges
  const currentSegments = useMemo(() => {
    if (!notes || !notes.trim()) return [];
    return notes
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [notes]);

  // Toggle predefined critical allergies
  const handleToggleAllergy = (option: AllergyQuickOption) => {
    const isActive = activeAllergyIds.has(option.id);

    if (isActive) {
      // Remove matching segments
      const updated = currentSegments.filter((seg) => !option.matchPattern.test(seg));
      onChange(updated.join(', '));
    } else {
      // Append allergy
      const updated = [...currentSegments, option.insertValue];
      onChange(updated.join(', '));
    }
  };

  // Add custom addition or removal
  const handleConfirmModifier = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const rawVal = builderInput.trim();
    if (!rawVal) {
      setActiveBuilder(null);
      return;
    }

    const cleanVal = rawVal.replace(/^[+-]\s*/, '').trim();
    let formatted = cleanVal;
    if (activeBuilder === 'addition') {
      const withoutAdd = cleanVal.replace(/^(?:add\s+extra|add|extra|agregar)\s+/i, '').trim();
      formatted = `Extra ${withoutAdd}`;
    } else if (activeBuilder === 'removal') {
      const lower = cleanVal.toLowerCase();
      if (!lower.startsWith('no ') && !lower.startsWith('without ') && !lower.startsWith('sin ')) {
        formatted = `No ${cleanVal}`;
      }
    } else if (activeBuilder === 'allergy') {
      const lower = cleanVal.toLowerCase();
      if (!lower.includes('allergy') && !lower.includes('alergia')) {
        formatted = `Allergy: ${cleanVal}`;
      }
    }

    const updated = [...currentSegments, formatted];
    onChange(updated.join(', '));
    setBuilderInput('');
    setActiveBuilder(null);
  };

  // Remove a specific individual badge
  const handleRemoveSegment = (indexToRemove: number) => {
    const updated = currentSegments.filter((_, idx) => idx !== indexToRemove);
    onChange(updated.join(', '));
  };

  // Live preview using KDS highlight engines
  const allergyPreview = useMemo(() => detectAllergies(notes, 'en'), [notes]);
  const modifierPreview = useMemo(() => parseItemModifiers(notes, 'en'), [notes]);

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* 1. Critical Allergy Quick Callouts */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-red-800 flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">warning</span>
            <span>Critical Dietary & Allergy Highlights:</span>
          </span>

          {currentSegments.length > 0 && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-[10px] font-bold text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {CRITICAL_ALLERGY_OPTIONS.map((opt) => {
            const isActive = activeAllergyIds.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleToggleAllergy(opt)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[10.5px] transition-all cursor-pointer select-none active:scale-95 ${
                  isActive
                    ? 'bg-red-600 text-white border-red-700 shadow-sm font-black ring-1 ring-red-400'
                    : 'bg-red-50/70 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-400 font-bold'
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">{opt.icon}</span>
                <span>{opt.label}</span>
                {isActive && (
                  <span className="material-symbols-outlined text-[11px] ml-0.5">check</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Custom Modifiers & Allergy Builder */}
      <div className="pt-0.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveBuilder(activeBuilder === 'allergy' ? null : 'allergy');
              setBuilderInput('');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11px] font-black transition-all cursor-pointer select-none active:scale-95 ${
              activeBuilder === 'allergy'
                ? 'bg-red-600 text-white border-red-700 shadow-sm ring-1 ring-red-400'
                : 'bg-red-50 text-red-800 border-red-300 hover:bg-red-100'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">warning</span>
            <span>Allergy...</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveBuilder(activeBuilder === 'addition' ? null : 'addition');
              setBuilderInput('');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11px] font-black transition-all cursor-pointer select-none active:scale-95 ${
              activeBuilder === 'addition'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-1 ring-emerald-400'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">add_circle</span>
            <span>Extra...</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveBuilder(activeBuilder === 'removal' ? null : 'removal');
              setBuilderInput('');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11px] font-black transition-all cursor-pointer select-none active:scale-95 ${
              activeBuilder === 'removal'
                ? 'bg-rose-700 text-white border-rose-800 shadow-sm ring-1 ring-rose-400'
                : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">do_not_disturb_on</span>
            <span>Remove...</span>
          </button>
        </div>

        {/* Dynamic Inline Input for Allergy / Addition / Removal */}
        {activeBuilder && (
          <div
            className={`mt-2 p-2 rounded-lg border flex items-center gap-1.5 animate-fadeIn ${
              activeBuilder === 'addition'
                ? 'bg-emerald-50/70 border-emerald-300'
                : activeBuilder === 'removal'
                ? 'bg-rose-50/70 border-rose-300'
                : 'bg-red-50/70 border-red-300'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[16px] shrink-0 ${
                activeBuilder === 'addition'
                  ? 'text-emerald-700'
                  : activeBuilder === 'removal'
                  ? 'text-rose-700'
                  : 'text-red-700'
              }`}
            >
              {activeBuilder === 'addition'
                ? 'add_circle'
                : activeBuilder === 'removal'
                ? 'do_not_disturb_on'
                : 'warning'}
            </span>

            <input
              ref={inputRef}
              type="text"
              value={builderInput}
              onChange={(e) => setBuilderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConfirmModifier(e);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveBuilder(null);
                  setBuilderInput('');
                }
              }}
              placeholder={
                activeBuilder === 'addition'
                  ? 'Type ingredient for EXTRA (e.g. Avocado, Bacon, Extra Sauce)...'
                  : activeBuilder === 'removal'
                  ? 'Type ingredient to REMOVE (e.g. Onions, Pickles, Mayo)...'
                  : 'Type ALLERGY (e.g. Eggs, Garlic, Sesame, Strawberries)...'
              }
              className="flex-1 px-2.5 py-1 bg-white border border-zinc-300 rounded text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleConfirmModifier(e);
              }}
              className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider text-white transition-all cursor-pointer active:scale-95 ${
                activeBuilder === 'addition'
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : activeBuilder === 'removal'
                  ? 'bg-rose-700 hover:bg-rose-800'
                  : 'bg-red-700 hover:bg-red-800'
              }`}
            >
              {activeBuilder === 'addition'
                ? '+ Extra'
                : activeBuilder === 'removal'
                ? '- Remove'
                : 'Add Allergy'}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveBuilder(null);
                setBuilderInput('');
              }}
              className="text-zinc-400 hover:text-zinc-700 p-1 rounded transition-colors cursor-pointer"
              title="Cancel"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Applied Modifier Badges List (with ✕ to remove) */}
      {currentSegments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center pt-1">
          {currentSegments.map((segment, idx) => {
            const lower = segment.toLowerCase();
            const isAllergy =
              lower.includes('allergy') ||
              lower.includes('alergia') ||
              lower.includes('celiac') ||
              lower.includes('celíaco') ||
              lower.includes('gluten') ||
              lower.includes('peanut') ||
              lower.includes('maní') ||
              lower.includes('dairy') ||
              lower.includes('lácteo') ||
              lower.includes('vegan');

            const isAddition =
              segment.startsWith('+') || lower.startsWith('extra ') || lower.startsWith('add ');
            const isRemoval =
              segment.startsWith('-') ||
              lower.startsWith('no ') ||
              lower.startsWith('without ') ||
              lower.startsWith('sin ');

            let badgeStyle =
              'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold';
            if (isAllergy) {
              badgeStyle =
                'bg-red-100 text-red-900 border-red-400 font-black shadow-2xs';
            } else if (isAddition) {
              badgeStyle =
                'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold shadow-2xs';
            } else if (isRemoval) {
              badgeStyle =
                'bg-rose-100 text-rose-900 border-rose-400 font-bold shadow-2xs';
            }

            return (
              <span
                key={`${segment}-${idx}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10.5px] ${badgeStyle}`}
              >
                <span>{segment.replace(/^[+-]\s*/, '').trim()}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSegment(idx)}
                  className="hover:opacity-75 transition-opacity cursor-pointer flex items-center"
                  title="Remove this modifier"
                >
                  <span className="material-symbols-outlined text-[12px]">close</span>
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* 4. Freeform Custom Prep Notes */}
      <div className="relative pt-0.5">
        <input
          type="text"
          placeholder={placeholder}
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className="w-full pl-7 pr-3 py-1.5 bg-[#faf9f6] border border-[#d8d2c7] rounded-lg text-[11px] text-[#1d1c17] placeholder-[#a09c94] focus:border-[#ae001a] focus:bg-white outline-none transition-all font-medium"
        />
        <span className="material-symbols-outlined text-[14px] text-zinc-400 absolute left-2 top-2.5 select-none pointer-events-none">
          edit_note
        </span>
      </div>

      {/* 5. Live KDS Display Preview */}
      {(allergyPreview.hasAllergy || modifierPreview.length > 0) && (
        <div className="p-2 bg-[#252528] rounded-lg border border-zinc-700 space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[11px] text-amber-400">visibility</span>
              <span>Kitchen Display (KDS) Live Preview</span>
            </span>
          </div>

          {/* Allergy Banner */}
          {allergyPreview.hasAllergy && (
            <div className="px-2 py-1 bg-red-950/90 border border-red-500 rounded text-red-100 text-[9.5px] font-black flex items-center gap-1.5 animate-pulse shadow-sm">
              <span className="material-symbols-outlined text-[12px] text-red-400">warning</span>
              <span className="uppercase tracking-wide">{allergyPreview.alertBannerText}</span>
            </div>
          )}

          {/* Modifier Pills (Sorted: Removals first, then Additions) */}
          {(() => {
            const prepModifiers = allergyPreview.hasAllergy
              ? modifierPreview.filter((m) => m.category !== 'allergy')
              : modifierPreview;

            const sortedPrepModifiers = [...prepModifiers].sort((a, b) => {
              const priority: Record<string, number> = {
                removal: 1,
                addition: 2,
                instruction: 3,
                preference: 4,
                allergy: 5,
              };
              return (priority[a.category] || 99) - (priority[b.category] || 99);
            });

            if (sortedPrepModifiers.length === 0) return null;

            return (
              <div className="flex flex-wrap gap-1 items-center">
                {sortedPrepModifiers.map((mod) => (
                  <span
                    key={mod.id}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8.5px] leading-tight ${mod.badgeClasses}`}
                  >
                    <span className="material-symbols-outlined text-[10px]">{mod.iconName}</span>
                    <span>{mod.text}</span>
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
