import React from 'react';
import { Server, Radio, Box, Hexagon } from 'lucide-react';
import type { NodeData } from '../store/useAppStore';

interface NodeMarkerContentProps {
  node: NodeData;
  isDimmed: boolean;
}

// Split out of FiberMap.tsx's node-marker .map() and wrapped in React.memo so
// that of the ~114 rendered markers, only ones whose own node/dimmed state
// actually changed re-render their (backdrop-blur-heavy) DOM tree — instead
// of every marker recreating its JSX on every FiberMap re-render regardless
// of whether anything about it changed. Purely a perf split, same markup as
// before, no visual change.
export const NodeMarkerContent: React.FC<NodeMarkerContentProps> = React.memo(({ node, isDimmed }) => {
  return (
    <div style={{ opacity: isDimmed ? 0.12 : 1, transition: 'opacity 0.2s' }}>
      {/* 1. XCC MARKER BADGE */}
      {node.type === 'XCC' ? (
        <div className="cursor-pointer group relative flex flex-col items-center transform-gpu">
          <div className={`absolute -inset-1 rounded-xl opacity-75 blur-sm transition-all group-hover:opacity-100 group-hover:blur-md ${
            node.status === 'critical' ? 'bg-rose-500' :
            node.status === 'warning' ? 'bg-amber-500' : 'bg-amber-400'
          }`} />

          <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xl backdrop-blur-md transition-all duration-300 group-hover:scale-110 ${
            node.status === 'critical' ? 'bg-rose-950/80 text-rose-400 border-rose-500/80 shadow-rose-500/50' :
            node.status === 'warning' ? 'bg-amber-950/80 text-amber-400 border-amber-500/80 shadow-amber-500/50' :
            'bg-slate-900/90 text-amber-400 border-amber-400/80 shadow-amber-500/50'
          }`}>
            <Server size={19} className="drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />

            <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
              node.status === 'critical' ? 'bg-rose-500 animate-ping' :
              node.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
            }`} />

            {/* Permanent XCC label badge — same style as POP/ODP */}
            <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-[9px] px-1.5 py-0.2 rounded-md border border-amber-200 shadow-md font-mono tracking-tight">
              XCC
            </div>
          </div>

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-slate-950/95 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-mono font-extrabold border-2 border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.5)] whitespace-nowrap z-50 pointer-events-none flex items-center gap-2 backdrop-blur-xl">
            <Server size={12} className="text-amber-400" />
            <span>XCC: {node.name}</span>
          </div>
        </div>
      ) : node.type === 'POP' ? (
        <div className="cursor-pointer group relative flex flex-col items-center transform-gpu">
          <div className="absolute -inset-2 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-lime-400 opacity-85 blur-md transition-all group-hover:opacity-100 group-hover:blur-lg rotate-45" />

          <div className="relative w-11 h-11 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 border-2 border-emerald-400 rounded-2xl rounded-tr-none rotate-45 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.9)] transition-all duration-300 group-hover:scale-115">
            <Radio size={22} className="-rotate-45 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,1)]" />

            <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-[9px] px-1.5 py-0.2 rounded-md border border-emerald-200 shadow-md font-mono -rotate-45 tracking-tight">
              POP
            </div>
          </div>

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-slate-950/95 text-emerald-300 px-3.5 py-2 rounded-2xl text-xs font-mono font-extrabold border-2 border-emerald-500/70 shadow-[0_0_30px_rgba(16,185,129,0.6)] whitespace-nowrap z-50 pointer-events-none flex items-center gap-2 backdrop-blur-xl">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
            <span>POP: {node.name}</span>
          </div>
        </div>
      ) : node.type === 'ODP' ? (
        <div className="cursor-pointer group relative flex flex-col items-center transform-gpu">
          <div className="absolute -inset-1.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 opacity-80 blur-sm transition-all group-hover:opacity-100 group-hover:blur-md" />

          <div className="relative w-10 h-10 bg-slate-950/90 border-2 border-cyan-400 rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(0,229,255,0.9)] transition-all duration-300 group-hover:scale-115">
            <Box size={20} className="text-cyan-300 drop-shadow-[0_0_8px_rgba(0,229,255,1)]" />

            <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black text-[9px] px-1.5 py-0.2 rounded-md border border-cyan-200 shadow-md font-mono tracking-tight">
              ODP
            </div>
          </div>

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-slate-950/95 text-cyan-300 px-3 py-1.5 rounded-xl text-xs font-mono font-extrabold border-2 border-cyan-500/60 shadow-[0_0_25px_rgba(0,229,255,0.5)] whitespace-nowrap z-50 pointer-events-none flex items-center gap-2 backdrop-blur-xl">
            <Box size={14} className="text-cyan-400" />
            <span>ODP: {node.name}</span>
          </div>
        </div>
      ) : node.type === 'HH' ? (
        <div className="cursor-pointer group relative flex flex-col items-center transform-gpu">
          <div className="absolute -inset-1 rounded-lg bg-pink-500 opacity-70 blur-sm transition-all group-hover:opacity-100 rotate-45" />

          <div className="relative w-8 h-8 bg-slate-950/90 border-2 border-pink-400 rounded-lg rotate-45 flex items-center justify-center shadow-[0_0_20px_rgba(236,72,153,0.8)] transition-all duration-300 group-hover:scale-115">
            <Hexagon size={14} className="-rotate-45 text-pink-300 drop-shadow-[0_0_8px_rgba(236,72,153,1)]" />
          </div>

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-slate-950/95 text-pink-300 px-2.5 py-1 rounded-lg text-xs font-mono font-extrabold border border-pink-500/60 whitespace-nowrap z-50 pointer-events-none">
            HH: {node.name}
          </div>
        </div>
      ) : node.type === 'Tiang' ? (
        <div className="cursor-pointer group relative flex flex-col items-center">
          <div className="relative w-7 h-7 bg-slate-900 border-2 border-slate-300 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-115">
            <svg className="w-4 h-4 text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="5" y1="7" x2="19" y2="7" />
              <circle cx="5" cy="7" r="1.5" fill="currentColor" />
              <circle cx="19" cy="7" r="1.5" fill="currentColor" />
            </svg>
          </div>

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-slate-900/95 text-slate-200 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border border-slate-700 whitespace-nowrap z-50 pointer-events-none">
            Tiang: {node.name}
          </div>
        </div>
      ) : (
        <div className="cursor-pointer group relative">
          <div className={`w-4 h-4 rounded-full border-2 border-surface shadow-md
            ${node.status === 'critical' ? 'bg-red-500 alarm-marker' :
              node.status === 'warning' ? 'bg-amber-400' :
              'bg-cyan-400'}`}
          />
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity bg-surface px-2 py-1 rounded text-xs text-text-primary border border-border whitespace-nowrap z-50 pointer-events-none">
            {node.name}
          </div>
        </div>
      )}
    </div>
  );
});

NodeMarkerContent.displayName = 'NodeMarkerContent';
