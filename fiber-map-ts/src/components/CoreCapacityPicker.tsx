import React from 'react';

export const CORE_CAPACITY_OPTIONS = [
  { label: '96 Core', bgActive: 'bg-indigo-600 text-white border-indigo-300' },
  { label: '48 Core', bgActive: 'bg-cyan-500 text-slate-950 border-cyan-200' },
  { label: '24 Core', bgActive: 'bg-emerald-500 text-slate-950 border-emerald-200' },
  { label: '12 Core', bgActive: 'bg-amber-500 text-slate-950 border-amber-200' }
] as const;

export const CORE_CAPACITY_LABELS: string[] = CORE_CAPACITY_OPTIONS.map((o) => o.label);

interface CoreCapacityPickerProps {
  activeCores: string[];
  onToggle: (label: string) => void;
  isDark: boolean;
}

// Shared 96/48/24/12-core chip picker — used by both FiberSegmentModal
// (editing an existing segment) and KmzImportSetupModal (assigning core
// count during import). Previously duplicated in both places; kept here so
// the two never drift apart visually or behaviorally.
export const CoreCapacityPicker: React.FC<CoreCapacityPickerProps> = ({ activeCores, onToggle, isDark }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {CORE_CAPACITY_OPTIONS.map(({ label, bgActive }) => {
      const isSelected = activeCores.includes(label);
      return (
        <button
          key={label}
          type="button"
          onClick={() => onToggle(label)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold flex items-center gap-1 transition-all border ${
            isSelected
              ? `${bgActive} shadow-md scale-105`
              : isDark
                ? 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                : 'bg-slate-200 text-slate-700 border-slate-300 hover:text-slate-900'
          }`}
        >
          <span>{isSelected ? `✓ ${label}` : label}</span>
        </button>
      );
    })}
  </div>
);
