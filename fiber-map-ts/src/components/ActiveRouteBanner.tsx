import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { MapPin, ArrowRight, X, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const ActiveRouteBanner: React.FC = () => {
  const { activeRouteView, setActiveRouteView, setSelectedXcc, nodes, theme } = useAppStore(useShallow((state) => ({
    activeRouteView: state.activeRouteView,
    setActiveRouteView: state.setActiveRouteView,
    setSelectedXcc: state.setSelectedXcc,
    nodes: state.nodes,
    theme: state.theme
  })));
  const isDark = theme === 'dark';

  if (!activeRouteView) return null;

  const handleReopenXcc = () => {
    // sourceName is always copied directly from a real node's .name (see
    // XccPanel.tsx's setActiveRouteView call), so an exact match should
    // always succeed. The previous `|| n.type === 'XCC'` fallback was a
    // bug: .find() evaluates that OR per-element, so it returned the
    // FIRST XCC-type node in the whole array the moment it hit one —
    // completely ignoring whether it was the actual source node. This
    // button almost certainly reopened the wrong XCC panel most of the
    // time. Keeping a real fallback (search only after an exact match
    // fails) instead of a fake one baked into the predicate.
    const foundNode = nodes.find(n => n.name === activeRouteView.sourceName)
      || nodes.find(n => n.type === 'XCC');
    if (foundNode) {
      setSelectedXcc(foundNode);
    }
  };

  return (
    <AnimatePresence>
      {activeRouteView && (
        <motion.div 
          className="fixed top-6 left-1/2 -translate-x-1/2 z-40 max-w-4xl w-[92%] sm:w-auto pointer-events-auto"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
        >
          <div className={`border shadow-2xl rounded-2xl p-4 sm:px-6 backdrop-blur-xl flex flex-col sm:flex-row items-center gap-4 justify-between ${
            isDark 
              ? 'bg-slate-950/90 text-white border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.3)]' 
              : 'bg-white/95 text-slate-900 border-blue-400 shadow-xl'
          }`}>
            
            {/* Route Details Info */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-500 border border-blue-500/30 shrink-0">
                <Layers className="animate-pulse" size={20} />
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] font-mono font-bold text-blue-500 tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  PETA JALUR JUMPER XCC AKTIF
                </div>
                <div className={`text-sm font-bold font-mono flex items-center gap-2 flex-wrap ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}>
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <MapPin size={14} />
                    {activeRouteView.sourceName} <strong className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>({activeRouteView.sourcePortLabel})</strong>
                  </span>
                  
                  <ArrowRight size={16} className="text-blue-500" />
                  
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <MapPin size={14} />
                    {activeRouteView.destName} <strong className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>({activeRouteView.destPortLabel})</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={`flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-3 sm:pt-0 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <button 
                onClick={handleReopenXcc}
                className="bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold px-3.5 py-2 rounded-xl border border-blue-400/50 shadow-md transition-all flex items-center gap-1.5 whitespace-nowrap"
              >
                <Layers size={15} />
                <span>MATRIX XCC</span>
              </button>

              <button 
                onClick={() => setActiveRouteView(null)}
                className={`font-mono text-xs font-bold p-2 rounded-xl border transition-all ${
                  isDark 
                    ? 'bg-slate-800 hover:bg-rose-900/50 text-slate-300 hover:text-rose-300 border-slate-700 hover:border-rose-500/50' 
                    : 'bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 border-slate-300 hover:border-rose-300'
                }`}
                title="Tutup Peta Route"
              >
                <X size={18} />
              </button>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
