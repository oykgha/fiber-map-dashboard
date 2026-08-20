import React from 'react';
import { type NodeData, useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Box, MapPin, X, Activity, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OdpDetailsModalProps {
  odpNode: NodeData | null;
  onClose: () => void;
}

export const OdpDetailsModal: React.FC<OdpDetailsModalProps> = ({ odpNode, onClose }) => {
  const { theme } = useAppStore(useShallow((state) => ({ theme: state.theme })));
  const isDark = theme === 'dark';

  if (!odpNode) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
        <motion.div 
          className={`w-full max-w-lg border-2 rounded-3xl p-6 space-y-5 backdrop-blur-2xl relative overflow-hidden shadow-2xl ${
            isDark 
              ? 'bg-slate-900/95 border-cyan-500/60 text-white shadow-[0_0_50px_rgba(0,229,255,0.3)]' 
              : 'bg-white border-cyan-500 text-slate-900'
          }`}
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
        >
          {/* Top Decorative Glow Bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />

          {/* Header */}
          <div className={`flex items-start justify-between gap-4 border-b pb-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-[0_0_20px_rgba(0,229,255,0.7)] border border-cyan-300 shrink-0 font-extrabold">
                <Box size={24} />
              </div>
              <div>
                <span className="text-[10px] font-mono font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-500 border border-cyan-500/30 tracking-wider">
                  OPTICAL DISTRIBUTION POINT (ODP)
                </span>
                <h3 className={`font-extrabold text-base sm:text-lg mt-1 tracking-wide uppercase leading-tight ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}>
                  {odpNode.name}
                </h3>
              </div>
            </div>

            <button 
              onClick={onClose}
              className={`p-2 rounded-xl transition-all ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Detail Cards Grid */}
          <div className="space-y-3 font-mono text-xs">
            <div className={`p-4 rounded-2xl border space-y-3 ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-300'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2.5 ${
                isDark ? 'text-slate-400 border-slate-800/80' : 'text-slate-600 border-slate-300'
              }`}>
                <span className="flex items-center gap-1.5">
                  <MapPin size={15} className="text-cyan-500" /> Koordinat Geografis:
                </span>
                <strong className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {odpNode.coordinates[1].toFixed(6)}, {odpNode.coordinates[0].toFixed(6)}
                </strong>
              </div>

              <div className={`flex items-center justify-between pt-0.5 ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}>
                <span className="flex items-center gap-1.5">
                  <Activity size={15} className="text-emerald-500" /> Status Operasional:
                </span>
                <span className={`px-2.5 py-0.5 rounded-full border font-bold ${
                  odpNode.status === 'critical'
                    ? 'bg-rose-500/20 text-rose-500 border-rose-500/30'
                    : odpNode.status === 'warning'
                      ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
                }`}>
                  {odpNode.status === 'critical' ? 'CRITICAL' : odpNode.status === 'warning' ? 'WARNING' : 'ACTIVE / NORMAL'}
                </span>
              </div>
            </div>

            {/* Specifications Box */}
            <div className={`p-3 rounded-2xl border space-y-1 ${
              isDark ? 'bg-cyan-950/20 border-cyan-500/30' : 'bg-cyan-50 border-cyan-300'
            }`}>
              <span className="text-[10px] text-cyan-600 font-bold uppercase">Kategori Node:</span>
              <div className={`text-sm font-extrabold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Cpu size={14} className="text-cyan-500" /> Optical Distribution Terminal (Splitter Box)
              </div>
            </div>
          </div>

          {/* Footer Action */}
          <div className={`pt-2 border-t flex justify-end ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <button 
              onClick={onClose}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold py-2.5 rounded-xl shadow-lg transition-all border border-cyan-400/40 uppercase tracking-wider"
            >
              TUTUP DETAILS
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
