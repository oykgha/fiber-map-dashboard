import React, { useState } from 'react';
import { useAppStore, type MapFilters } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import {
  Layers, ChevronDown, ChevronUp, Radio, Box, Server,
  Hexagon, Check, Eye, EyeOff, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FilterConfigItem {
  key: keyof MapFilters;
  label: string;
  displayBadge?: string;
  color: string;
  icon: React.ReactNode;
  category: 'node' | 'cable';
}

export const MapFilterLegendPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const { mapFilters, toggleMapFilter, resetMapFilters, setMapFilters, nodes, segmentStoreMap, theme } = useAppStore(useShallow((state) => ({
    mapFilters: state.mapFilters,
    toggleMapFilter: state.toggleMapFilter,
    resetMapFilters: state.resetMapFilters,
    setMapFilters: state.setMapFilters,
    nodes: state.nodes,
    segmentStoreMap: state.segmentStoreMap,
    theme: state.theme
  })));
  const isDark = theme === 'dark';

  // Calculate live counts for each node category
  const popCount = nodes.filter(n => n.type === 'POP').length;
  const xccCount = nodes.filter(n => n.type === 'XCC').length;
  const odpCount = nodes.filter(n => n.type === 'ODP' || n.type === 'ODC').length;
  const hhCount = nodes.filter(n => n.type === 'HH').length;
  const poleCount = nodes.filter(n => n.type === 'Tiang').length;

  // Calculate live total asset distance in Meters (m) for cable categories
  const segmentList = Object.values(segmentStoreMap);
  const getCableMeters = (coreName: string, defaultMeters: number) => {
    const matchingSegments = segmentList.filter(s => (s.technicalData || '').includes(coreName));
    if (matchingSegments.length === 0) return defaultMeters;
    const totalKm = matchingSegments.reduce((sum, s) => sum + (s.lengthKm || 0), 0);
    return Math.round(totalKm * 1000);
  };

  const k96Meters = getCableMeters('96 Core', 14250);
  const k48Meters = getCableMeters('48 Core', 28400);
  const k24Meters = getCableMeters('24 Core', 19150);
  const k12Meters = getCableMeters('12 Core', 8500);

  // Routes with no core count assigned yet — anything whose technicalData
  // doesn't mention a core count at all (covers both truly-untouched
  // imports and segments explicitly left at "Belum Set" via the chips).
  const CORE_LABELS = ['96 Core', '48 Core', '24 Core', '12 Core'];
  const belumSetMeters = Math.round(
    segmentList
      .filter((s) => !CORE_LABELS.some((label) => (s.technicalData || '').includes(label)))
      .reduce((sum, s) => sum + (s.lengthKm || 0), 0) * 1000
  );

  // Toggle all filters on/off
  const isAllActive = Object.values(mapFilters).every(Boolean);
  const handleToggleAll = () => {
    const nextState = !isAllActive;
    setMapFilters({
      pop: nextState,
      xcc: nextState,
      odp: nextState,
      hh: nextState,
      pole: nextState,
      kabel96: nextState,
      kabel48: nextState,
      kabel24: nextState,
      kabel12: nextState,
      kabelBelumSet: nextState,
    });
  };

  const filterConfigs: FilterConfigItem[] = [
    {
      key: 'pop',
      label: 'Node POP / OLT',
      displayBadge: `${popCount}`,
      color: '#10B981',
      category: 'node',
      icon: (
        <div className="w-5 h-5 rounded-lg bg-emerald-950/80 border border-emerald-400/80 flex items-center justify-center text-emerald-400 rotate-45 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.5)]">
          <Radio size={11} className="-rotate-45" />
        </div>
      )
    },
    {
      key: 'xcc',
      label: 'Node XCC Cabinet',
      displayBadge: `${xccCount}`,
      color: '#F59E0B',
      category: 'node',
      icon: (
        <div className="w-5 h-5 rounded-lg bg-slate-900 border border-amber-400/80 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.5)]">
          <Server size={11} />
        </div>
      )
    },
    {
      key: 'odp',
      label: 'Node ODP Box',
      displayBadge: `${odpCount}`,
      color: '#00E5FF',
      category: 'node',
      icon: (
        <div className="w-5 h-5 rounded-lg bg-slate-900 border border-cyan-400 flex items-center justify-center text-cyan-300 shrink-0 shadow-[0_0_8px_rgba(0,229,255,0.5)]">
          <Box size={11} />
        </div>
      )
    },
    {
      key: 'hh',
      label: 'Handhole (HH)',
      displayBadge: `${hhCount}`,
      color: '#EC4899',
      category: 'node',
      icon: (
        <div className="w-5 h-5 rounded-lg bg-slate-900 border border-pink-400 flex items-center justify-center text-pink-300 rotate-45 shrink-0 shadow-[0_0_8px_rgba(236,72,153,0.5)]">
          <Hexagon size={10} className="-rotate-45" />
        </div>
      )
    },
    {
      key: 'pole',
      label: 'Tiang Fiber',
      displayBadge: `${poleCount}`,
      color: '#94A3B8',
      category: 'node',
      icon: (
        <div className="w-5 h-5 rounded-full bg-slate-900 border border-slate-300 flex items-center justify-center text-slate-200 shrink-0 shadow-md">
          <svg className="w-3 h-3 text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="2" x2="12" y2="22" />
            <line x1="5" y1="7" x2="19" y2="7" />
          </svg>
        </div>
      )
    },
    {
      key: 'kabel96',
      label: 'Kabel 96 Core',
      displayBadge: `${k96Meters.toLocaleString()} m`,
      color: '#6366F1',
      category: 'cable',
      icon: (
        <div className="w-7 h-3 flex items-center justify-center">
          <div className="w-full h-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
        </div>
      )
    },
    {
      key: 'kabel48',
      label: 'Kabel 48 Core',
      displayBadge: `${k48Meters.toLocaleString()} m`,
      color: '#00E5FF',
      category: 'cable',
      icon: (
        <div className="w-7 h-3 flex items-center justify-center">
          <div className="w-full h-1 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
        </div>
      )
    },
    {
      key: 'kabel24',
      label: 'Kabel 24 Core',
      displayBadge: `${k24Meters.toLocaleString()} m`,
      color: '#10B981',
      category: 'cable',
      icon: (
        <div className="w-7 h-3 flex items-center justify-center">
          <div className="w-full h-1 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        </div>
      )
    },
    {
      key: 'kabel12',
      label: 'Kabel 12 Core',
      displayBadge: `${k12Meters.toLocaleString()} m`,
      color: '#F59E0B',
      category: 'cable',
      icon: (
        <div className="w-7 h-3 flex items-center justify-center">
          <div className="w-full h-1 border-t-2 border-dashed border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
        </div>
      )
    },
    {
      key: 'kabelBelumSet',
      label: 'Belum Diset',
      displayBadge: `${belumSetMeters.toLocaleString()} m`,
      color: '#64748B',
      category: 'cable',
      icon: (
        <div className="w-7 h-3 flex items-center justify-center">
          <div className="w-full h-1 bg-slate-500 rounded-full opacity-70" />
        </div>
      )
    },
  ];

  return (
    <div className="fixed top-20 right-6 z-40 font-sans pointer-events-auto">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-72 backdrop-blur-xl border rounded-2xl overflow-hidden transition-all ${
          isDark 
            ? 'bg-slate-950/85 border-cyan-500/30 text-white shadow-[0_0_35px_rgba(2,6,23,0.85)]' 
            : 'bg-white/95 border-slate-300 text-slate-900 shadow-xl'
        }`}
      >
        {/* Panel Header */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`px-4 py-3 border-b flex items-center justify-between cursor-pointer select-none group ${
            isDark 
              ? 'bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-slate-800/80 text-white' 
              : 'bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 border rounded-lg group-hover:scale-110 transition-transform ${
              isDark ? 'bg-cyan-950/70 border-cyan-500/40 text-cyan-400' : 'bg-cyan-100 border-cyan-300 text-cyan-700'
            }`}>
              <Layers size={15} />
            </div>
            <div>
              <h3 className={`text-xs font-extrabold tracking-wide uppercase flex items-center gap-1.5 ${
                isDark ? 'text-slate-100' : 'text-slate-900'
              }`}>
                <span>Legend & Filter Peta</span>
              </h3>
              <p className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Layer Asset Fiber Optik</p>
            </div>
          </div>
          
          <button className={`p-1 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Collapsible Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-3 space-y-3"
            >
              {/* Quick Actions Header Bar */}
              <div className={`flex items-center justify-between text-[11px] font-bold pb-2 border-b ${
                isDark ? 'border-slate-800/70' : 'border-slate-200'
              }`}>
                <button
                  onClick={handleToggleAll}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all ${
                    isDark 
                      ? 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-cyan-500/30' 
                      : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border-cyan-300'
                  }`}
                >
                  {isAllActive ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span>{isAllActive ? 'Sembunyikan Semua' : 'Tampilkan Semua'}</span>
                </button>

                <button
                  onClick={resetMapFilters}
                  className={`flex items-center gap-1 px-2 py-1 transition-colors ${
                    isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Reset Filter ke Default"
                >
                  <RotateCcw size={11} />
                  <span>Reset</span>
                </button>
              </div>

              {/* Node Assets Section */}
              <div className="space-y-1.5">
                <div className={`text-[10px] font-extrabold uppercase tracking-wider px-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  Perangkat & Node
                </div>
                {filterConfigs.filter(c => c.category === 'node').map((item) => {
                  const isActive = mapFilters[item.key];
                  return (
                    <div
                      key={item.key}
                      onClick={() => toggleMapFilter(item.key)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer select-none transition-all ${
                        isActive
                          ? isDark 
                            ? 'bg-slate-900/90 border-slate-700/80 text-slate-100 hover:border-cyan-500/50'
                            : 'bg-slate-100 border-slate-300 text-slate-900 hover:border-cyan-500'
                          : isDark
                            ? 'bg-slate-950/40 border-slate-900 text-slate-500 opacity-60'
                            : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.displayBadge !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                            isActive 
                              ? isDark ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/30' : 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                              : isDark ? 'bg-slate-900 text-slate-600' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {item.displayBadge}
                          </span>
                        )}
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          isActive 
                            ? 'bg-cyan-500 border-cyan-400 text-slate-950' 
                            : isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-slate-200'
                        }`}>
                          {isActive && <Check size={11} strokeWidth={3} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cable Lines Section */}
              <div className="space-y-1.5 pt-1">
                <div className={`text-[10px] font-extrabold uppercase tracking-wider px-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  Kapasitas Kabel Fiber
                </div>
                {filterConfigs.filter(c => c.category === 'cable').map((item) => {
                  const isActive = mapFilters[item.key];
                  return (
                    <div
                      key={item.key}
                      onClick={() => toggleMapFilter(item.key)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer select-none transition-all ${
                        isActive
                          ? isDark 
                            ? 'bg-slate-900/90 border-slate-700/80 text-slate-100 hover:border-cyan-500/50'
                            : 'bg-slate-100 border-slate-300 text-slate-900 hover:border-cyan-500'
                          : isDark
                            ? 'bg-slate-950/40 border-slate-900 text-slate-500 opacity-60'
                            : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.displayBadge !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                            isActive 
                              ? isDark ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/30' : 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                              : isDark ? 'bg-slate-900 text-slate-600' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {item.displayBadge}
                          </span>
                        )}
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          isActive 
                            ? 'bg-cyan-500 border-cyan-400 text-slate-950' 
                            : isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-slate-200'
                        }`}>
                          {isActive && <Check size={11} strokeWidth={3} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
