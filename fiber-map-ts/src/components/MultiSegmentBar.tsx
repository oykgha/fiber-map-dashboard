import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { CheckSquare, X, Layers, FileText, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const MultiSegmentBar: React.FC = () => {
  const { 
    multiSelectMode, 
    toggleMultiSelectMode, 
    selectedSegments, 
    clearSelectedSegments,
    setSelectedSegment,
    theme 
  } = useAppStore();

  const isDark = theme === 'dark';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-auto">
      {/* Multi Select Mode Toggle Floating Button */}
      <button
        onClick={toggleMultiSelectMode}
        className={`px-4 py-2.5 rounded-2xl font-mono text-xs font-extrabold flex items-center gap-2.5 shadow-2xl backdrop-blur-md transition-all hover:scale-105 border ${
          multiSelectMode
            ? 'bg-amber-500/90 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.7)]'
            : isDark
              ? 'bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border-cyan-500/50'
              : 'bg-white/95 hover:bg-slate-50 text-cyan-700 border-cyan-400 shadow-xl'
        }`}
      >
        <CheckSquare size={16} className={multiSelectMode ? 'animate-pulse' : ''} />
        <span>{multiSelectMode ? 'MODE MULTI-PILIK KABEL: AKTIF' : 'MULTI-PILIH KABEL'}</span>
        {selectedSegments.length > 0 && (
          <span className="bg-slate-950 text-amber-300 px-2 py-0.5 rounded-full text-[10px] font-black border border-amber-400">
            {selectedSegments.length} KABEL
          </span>
        )}
      </button>

      {/* Multi-Cable Selection Manager Panel */}
      <AnimatePresence>
        {multiSelectMode && selectedSegments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`w-[90vw] max-w-xl p-4 rounded-3xl border shadow-2xl backdrop-blur-2xl font-mono text-xs space-y-3 ${
              isDark 
                ? 'bg-slate-900/95 border-amber-500/60 text-slate-100 shadow-[0_0_40px_rgba(245,158,11,0.3)]' 
                : 'bg-white/95 border-amber-400 text-slate-900 shadow-2xl'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-2.5 border-amber-500/30">
              <div className="flex items-center gap-2 text-amber-400 font-extrabold">
                <Layers size={16} />
                <span>DAFTAR {selectedSegments.length} KABEL TERPILIH</span>
              </div>
              <button 
                onClick={clearSelectedSegments}
                className="text-slate-400 hover:text-rose-400 text-[11px] flex items-center gap-1"
              >
                <X size={14} /> Bersihkan
              </button>
            </div>

            {/* Selected Cables List */}
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {selectedSegments.map((seg) => {
                const hasSor = seg.sorFiles && seg.sorFiles.length > 0;
                return (
                  <div 
                    key={seg.id}
                    className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                      hasSor 
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400 dark:text-emerald-300' 
                        : isDark
                          ? 'bg-slate-950/60 border-slate-800 text-slate-200'
                          : 'bg-slate-100 border-slate-300 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasSor ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-amber-400'}`} />
                      <span className="font-extrabold truncate">{seg.name}</span>
                      <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>({seg.lengthKm} km)</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {hasSor ? (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                          <FileText size={10} /> ADA .SOR ({seg.sorFiles.length})
                        </span>
                      ) : (
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border ${
                          isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-200 text-slate-600 border-slate-300'
                        }`}>
                          BELUM ADA .SOR
                        </span>
                      )}

                      <button
                        onClick={() => setSelectedSegment(seg)}
                        className="p-1 text-cyan-400 hover:bg-cyan-500/20 rounded-lg transition-colors"
                        title="Buka Detail & OTDR .SOR"
                      >
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
