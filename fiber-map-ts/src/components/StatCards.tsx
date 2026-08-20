import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

export const StatCards: React.FC = () => {
  const { kpiStats } = useAppStore(useShallow((state) => ({ kpiStats: state.kpiStats })));

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 flex gap-2 md:gap-4 overflow-x-auto max-w-full px-4 no-scrollbar">
      <div className="glass-panel rounded-full px-6 py-2 flex items-center space-x-3 shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
        <span className="text-sm font-medium text-text-secondary">Normal</span>
        <span className="font-mono text-cyan-500 font-bold">{kpiStats.normal}</span>
      </div>
      
      <div className="glass-panel rounded-full px-6 py-2 flex items-center space-x-3 shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(255,179,0,0.8)]" />
        <span className="text-sm font-medium text-text-secondary">Warning</span>
        <span className="font-mono text-amber-500 font-bold">{kpiStats.warning}</span>
      </div>

      <div className="glass-panel rounded-full px-6 py-2 flex items-center space-x-3 shrink-0 border-red-500/30">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_12px_rgba(255,51,102,0.8)]" />
        <span className="text-sm font-medium text-text-secondary">Critical</span>
        <span className="font-mono text-red-500 font-bold">{kpiStats.critical}</span>
      </div>
    </div>
  );
};
