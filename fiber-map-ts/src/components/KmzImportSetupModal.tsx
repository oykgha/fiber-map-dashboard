import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Route, CheckCircle2, Server, Radio, Box, Hexagon } from 'lucide-react';
import { useAppStore, type NodeData } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { stableSegmentId } from '../utils/segmentId';
import { saveSegment } from '../utils/api';
import { CoreCapacityPicker } from './CoreCapacityPicker';

const NODE_TYPE_ICON: Record<string, React.ReactNode> = {
  XCC: <Server size={13} className="text-amber-400" />,
  POP: <Radio size={13} className="text-emerald-400" />,
  ODP: <Box size={13} className="text-cyan-400" />,
  ODC: <Hexagon size={13} className="text-slate-400" />
};

interface KmzImportSetupModalProps {
  existingNodes: NodeData[];
  existingGeoData: GeoJSON.FeatureCollection | null;
  setNodes: (nodes: NodeData[]) => void;
  setGeoData: (data: GeoJSON.FeatureCollection) => void;
  onImported: (message: string) => void;
}

export const KmzImportSetupModal: React.FC<KmzImportSetupModalProps> = ({
  existingNodes,
  existingGeoData,
  setNodes,
  setGeoData,
  onImported
}) => {
  const {
    pendingKmzImport,
    setPendingKmzImport,
    getOrCreateSegmentData,
    updateSegmentData,
    registerKmzFiles,
    theme
  } = useAppStore(useShallow((state) => ({
    pendingKmzImport: state.pendingKmzImport,
    setPendingKmzImport: state.setPendingKmzImport,
    getOrCreateSegmentData: state.getOrCreateSegmentData,
    updateSegmentData: state.updateSegmentData,
    registerKmzFiles: state.registerKmzFiles,
    theme: state.theme
  })));

  const isDark = theme === 'dark';
  const [coresByRoute, setCoresByRoute] = useState<Record<number, string[]>>({});
  const [isSaving, setIsSaving] = useState(false);

  if (!pendingKmzImport) return null;
  const pending = pendingKmzImport;

  const toggleCore = (routeIdx: number, label: string) => {
    setCoresByRoute((prev) => {
      const current = prev[routeIdx] || [];
      const next = current.includes(label) ? current.filter((c) => c !== label) : [...current, label];
      return { ...prev, [routeIdx]: next };
    });
  };

  const handleCancel = () => {
    setCoresByRoute({});
    setPendingKmzImport(null);
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    registerKmzFiles([pending.fileName]);

    if (pending.nodes.length > 0) {
      setNodes([...existingNodes, ...pending.nodes]);
    }
    if (pending.routes.length > 0) {
      setGeoData({
        type: 'FeatureCollection',
        features: [...(existingGeoData?.features || []), ...pending.routes.map((r) => r.feature)]
      });
    }

    const saves = pending.routes.map((route, idx) => {
      const id = stableSegmentId(route.name, route.geometry);
      const cores = coresByRoute[idx] || [];
      const segData = getOrCreateSegmentData(id, route.name, route.lengthKm);
      const technicalData = cores.length > 0
        ? `Kapasitas Kabel: ${cores.join(', ')} • Single-Mode G.652D`
        : segData.technicalData;

      if (cores.length > 0) {
        updateSegmentData(id, { technicalData });
      }

      return saveSegment(id, {
        name: route.name,
        lengthKm: route.lengthKm,
        technicalData
      }).catch((err) => console.error(`Failed to save imported route "${route.name}" to backend:`, err));
    });

    await Promise.all(saves);

    setIsSaving(false);
    setCoresByRoute({});
    onImported(`Berhasil mengimpor ${pending.nodes.length} Node & ${pending.routes.length} Jalur Kabel dari '${pending.fileName}'!`);
    setPendingKmzImport(null);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/60 backdrop-blur-xl overflow-y-auto"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className={`w-full max-w-4xl rounded-3xl overflow-hidden flex flex-col max-h-[92vh] shadow-2xl border ${
            isDark ? 'bg-slate-900/95 border-slate-700' : 'bg-white/95 border-slate-200'
          }`}
        >
          {/* Header */}
          <div className={`flex items-start justify-between gap-4 px-6 py-4 border-b shrink-0 ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200 bg-slate-100/70'}`}>
            <div>
              <span className="text-[10px] font-mono font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 tracking-wider">
                SETUP AWAL IMPORT KMZ
              </span>
              <h2 className={`font-mono font-extrabold text-base sm:text-lg mt-1.5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {pending.fileName}
              </h2>
              <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {pending.nodes.length} node &bull; {pending.routes.length} jalur kabel ditemukan. Atur kapasitas core tiap jalur sebelum ditambahkan ke peta.
              </p>
            </div>
            <button
              onClick={handleCancel}
              className={`p-2 rounded-xl transition-all shrink-0 ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Points summary */}
            {pending.nodes.length > 0 && (
              <div className={`rounded-2xl border p-4 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                  <MapPin size={14} className="text-cyan-400" /> Titik / Node ({pending.nodes.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {pending.nodes.map((n, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-lg truncate ${isDark ? 'bg-slate-900 text-slate-300' : 'bg-white text-slate-700 border border-slate-200'}`}
                      title={n.name}
                    >
                      {NODE_TYPE_ICON[n.type || 'ODC']}
                      <span className="truncate">{n.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Routes setup */}
            {pending.routes.length > 0 && (
              <div className={`rounded-2xl border p-4 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`flex items-center gap-2 text-xs font-mono font-extrabold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                  <Route size={14} className="text-purple-400" /> Jalur Kabel ({pending.routes.length})
                </div>
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {pending.routes.map((route, idx) => {
                    const activeCores = coresByRoute[idx] || [];
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className={`text-xs font-mono font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-900'}`} title={route.name}>
                            {route.name}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400 shrink-0">{route.lengthKm.toFixed(2)} km</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`text-[9px] font-mono uppercase ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Kapasitas Core:</span>
                          <CoreCapacityPicker
                            isDark={isDark}
                            activeCores={activeCores}
                            onToggle={(label) => toggleCore(idx, label)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className={`px-4 py-2.5 rounded-xl text-xs font-mono font-extrabold transition-all disabled:opacity-50 ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              BATAL
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSaving}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-mono text-xs font-extrabold rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-60 disabled:hover:scale-100"
            >
              <CheckCircle2 size={16} />
              {isSaving ? 'MENYIMPAN...' : 'SIMPAN & TAMBAHKAN KE PETA'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
