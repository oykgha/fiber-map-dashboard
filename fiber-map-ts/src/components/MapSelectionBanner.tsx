import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { X, Target, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const MapSelectionBanner: React.FC = () => {
  const { mapPickerState, setMapPickerState, theme } = useAppStore(useShallow((state) => ({
    mapPickerState: state.mapPickerState,
    setMapPickerState: state.setMapPickerState,
    theme: state.theme
  })));
  const isDark = theme === 'dark';

  if (!mapPickerState) return null;

  return (
    <AnimatePresence>
      {mapPickerState && (
        <motion.div 
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-[92%] sm:w-auto pointer-events-auto"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
        >
          <div className={`border-2 rounded-2xl p-4 sm:px-6 backdrop-blur-xl flex items-center gap-4 justify-between shadow-2xl ${
            isDark 
              ? 'bg-slate-950/95 text-white border-blue-500 shadow-[0_0_35px_rgba(59,130,246,0.5)]' 
              : 'bg-white text-slate-900 border-blue-500 shadow-2xl'
          }`}>
            
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-500/20 text-blue-500 border border-blue-500/40 shrink-0">
                {mapPickerState.step === 'select_source' ? (
                  <Radio className="animate-pulse" size={24} />
                ) : (
                  <Target className="animate-bounce" size={24} />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-mono font-extrabold text-blue-500 tracking-wider uppercase flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                  {mapPickerState.step === 'select_source' ? 'LANGKAH 1 DARI 2: PILIH SOURCE XCC' : 
                   mapPickerState.step === 'select_dest' ? 'LANGKAH 2 DARI 2: PILIH DESTINATION XCC' :
                   'PILIH NODE TARGET TRAY VIA MAPS'}
                </div>
                <div className={`text-sm font-extrabold font-sans ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {mapPickerState.step === 'select_source' ? (
                    'Klik ikon XCC mana saja di atas peta sebagai ASAL (Source)'
                  ) : mapPickerState.step === 'select_dest' ? (
                    <span>
                      Source: <strong className="text-blue-500 font-black">{mapPickerState.sourceXcc?.name}</strong> ➔ Sekarang klik XCC kedua sebagai TUJUAN (Destination)
                    </span>
                  ) : (
                    <span>
                      Modul: <strong className="text-amber-500 font-black">{mapPickerState.targetTrayName}</strong> ➔ Klik mana saja Node di peta untuk dijadikan Target Arah Tray!
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setMapPickerState(null)}
              className={`font-mono text-xs font-bold px-3 py-2 rounded-xl border transition-all flex items-center gap-1 shrink-0 ${
                isDark 
                  ? 'bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 border-slate-700 hover:border-rose-500' 
                  : 'bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 border-slate-300 hover:border-rose-300'
              }`}
            >
              <X size={16} />
              <span className="hidden sm:inline">BATAL</span>
            </button>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
