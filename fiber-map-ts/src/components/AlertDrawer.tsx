import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Activity, MapPin, Clock, ChevronRight } from 'lucide-react';

export const AlertDrawer: React.FC = () => {
  const { activeAlert, setActiveAlert } = useAppStore(useShallow((state) => ({ activeAlert: state.activeAlert, setActiveAlert: state.setActiveAlert })));

  return (
    <AnimatePresence>
      {activeAlert && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-y-0 right-0 w-full md:w-96 glass-panel z-50 flex flex-col md:border-l border-border shadow-2xl overflow-y-auto"
        >
          {/* Header */}
          <div className={`p-5 flex items-center justify-between border-b ${activeAlert.status === 'critical' ? 'border-red-500/30 bg-red-500/10' : activeAlert.status === 'warning' ? 'border-amber-500/30 bg-amber-500/10' : 'border-border'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${activeAlert.status === 'critical' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="font-bold text-text-primary tracking-wide uppercase text-sm">
                  {activeAlert.status} ALERT
                </h2>
                <div className="text-xs text-text-secondary font-mono">ID: {activeAlert.id.substring(0, 8).toUpperCase()}</div>
              </div>
            </div>
            <button 
              onClick={() => setActiveAlert(null)}
              className="p-2 hover:bg-panel-hover rounded-full transition-colors text-text-secondary hover:text-text-primary"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 flex-1">
            {/* Technical Badge */}
            <div className="flex items-center justify-between bg-surface rounded-xl p-4 border border-border">
              <div className="flex items-center gap-3 text-text-secondary">
                <Activity size={18} className="text-cyan-500" />
                <span className="text-sm font-medium text-text-primary">Attenuation</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-mono font-bold ${activeAlert.status === 'critical' ? 'text-red-500' : 'text-amber-400'}`}>
                  {activeAlert.attenuation}
                </span>
                <span className="text-xs text-text-secondary font-mono">dBm</span>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-text-secondary uppercase tracking-wider">Node / GPON</label>
                <div className="flex items-center gap-2 text-text-primary bg-panel-hover p-3 rounded-lg text-sm border border-border">
                  <MapPin size={16} className="text-text-secondary" />
                  {activeAlert.name}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary uppercase tracking-wider">Coordinates</label>
                <div className="font-mono text-cyan-600 dark:text-cyan-400 bg-panel-hover p-3 rounded-lg text-sm border border-border">
                  {activeAlert.coordinates[1].toFixed(6)}, {activeAlert.coordinates[0].toFixed(6)}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary uppercase tracking-wider">Segment</label>
                <div className="text-text-primary bg-panel-hover p-3 rounded-lg text-sm border border-border">
                  {activeAlert.segment || 'Unknown Segment'}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-secondary uppercase tracking-wider">Timestamp</label>
                <div className="flex items-center gap-2 text-text-primary bg-panel-hover p-3 rounded-lg text-sm border border-border">
                  <Clock size={16} className="text-text-secondary" />
                  {new Date().toLocaleString()}
                </div>
              </div>
            </div>

            {/* Action Form */}
            <div className="pt-4 border-t border-border space-y-4">
              <label className="text-xs text-text-secondary uppercase tracking-wider">Technician Log</label>
              <textarea 
                className="w-full bg-surface border border-border rounded-lg p-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all min-h-[100px]"
                placeholder="Enter field notes..."
              />
              
              <div className="flex gap-3 pt-2">
                <button className="flex-1 bg-panel-hover hover:bg-black/10 dark:hover:bg-white/20 text-text-primary border border-border py-2.5 rounded-lg text-sm font-medium transition-colors">
                  Acknowledge
                </button>
                <button className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeAlert.status === 'critical' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-cyan-500 hover:bg-cyan-600 text-white'}`}>
                  Dispatch Tech <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
