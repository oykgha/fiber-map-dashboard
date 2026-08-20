import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import {
  X, MapPin, Navigation, Search, Check, AlertCircle, Sparkles, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const RouteBuilderModal: React.FC = () => {
  const {
    routeBuilder,
    setRouteBuilder,
    closeRouteBuilder,
    nodes,
    setSelectedSegment,
    getOrCreateSegmentData,
    theme
  } = useAppStore(useShallow((state) => ({
    routeBuilder: state.routeBuilder,
    setRouteBuilder: state.setRouteBuilder,
    closeRouteBuilder: state.closeRouteBuilder,
    nodes: state.nodes,
    setSelectedSegment: state.setSelectedSegment,
    getOrCreateSegmentData: state.getOrCreateSegmentData,
    theme: state.theme
  })));

  const isDark = theme === 'dark';

  const [latLngInputA, setLatLngInputA] = useState('');
  const [latLngInputZ, setLatLngInputZ] = useState('');
  const [nodeSearchA, setNodeSearchA] = useState('');
  const [nodeSearchZ, setNodeSearchZ] = useState('');

  if (!routeBuilder.isOpen) return null;

  // Trigger Map Picker mode for Point A or Point Z
  const handleStartPickOnMap = (target: 'pointA' | 'pointZ') => {
    setRouteBuilder({ pickingMode: target });
  };

  // Parse manual lat/long input
  const handleApplyLatLngA = () => {
    const parts = latLngInputA.split(',').map(p => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      // Input is Lat, Lng
      setRouteBuilder(prev => ({
        ...prev,
        pointA: {
          label: `Lat/Long (${parts[0].toFixed(4)}, ${parts[1].toFixed(4)})`,
          coords: [parts[1], parts[0]] // [Lng, Lat]
        }
      }));
    }
  };

  const handleApplyLatLngZ = () => {
    const parts = latLngInputZ.split(',').map(p => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      setRouteBuilder(prev => ({
        ...prev,
        pointZ: {
          label: `Lat/Long (${parts[0].toFixed(4)}, ${parts[1].toFixed(4)})`,
          coords: [parts[1], parts[0]] // [Lng, Lat]
        }
      }));
    }
  };

  // Select node from search list
  const handleSelectNodeA = (nodeName: string, coords: [number, number]) => {
    setRouteBuilder(prev => ({
      ...prev,
      pointA: { label: nodeName, coords }
    }));
    setNodeSearchA('');
  };

  const handleSelectNodeZ = (nodeName: string, coords: [number, number]) => {
    setRouteBuilder(prev => ({
      ...prev,
      pointZ: { label: nodeName, coords }
    }));
    setNodeSearchZ('');
  };

  // Apply selected route candidate and open segment modal
  const handleConfirmSelectedRoute = () => {
    if (routeBuilder.candidates.length === 0) return;
    const selected = routeBuilder.candidates[routeBuilder.selectedCandidateIndex || 0];

    const segData = getOrCreateSegmentData(
      selected.id,
      selected.name,
      selected.distanceKm
    );

    segData.nodeA = routeBuilder.pointA.label || 'Point A';
    segData.nodeZ = routeBuilder.pointZ.label || 'Point Z';

    closeRouteBuilder();
    setSelectedSegment(segData);
  };

  const filteredNodesA = nodeSearchA.trim() 
    ? nodes.filter(n => n.name.toLowerCase().includes(nodeSearchA.toLowerCase())).slice(0, 5)
    : [];

  const filteredNodesZ = nodeSearchZ.trim() 
    ? nodes.filter(n => n.name.toLowerCase().includes(nodeSearchZ.toLowerCase())).slice(0, 5)
    : [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md overflow-y-auto pointer-events-auto">
        <motion.div 
          className={`w-full max-w-2xl my-auto rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 relative overflow-hidden backdrop-blur-2xl border ${
            isDark 
              ? 'bg-slate-900/95 text-slate-100 border-purple-500/50 shadow-[0_0_60px_rgba(168,85,247,0.25)]' 
              : 'bg-white text-slate-900 border-purple-300 shadow-2xl'
          }`}
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
        >
          {/* Top Decorative Purple Glow Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500" />

          {/* Header */}
          <div className={`flex items-center justify-between border-b pb-3.5 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-purple-500/20 text-purple-500 border border-purple-500/40 flex items-center justify-center">
                <Navigation size={18} />
              </div>
              <div>
                <h2 className={`font-mono font-extrabold text-base sm:text-lg uppercase tracking-wide flex items-center gap-2 ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}>
                  <span>PENENTUAN RUTE KABEL A-Z</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-500 border border-purple-500/30">
                    REAL TRACE
                  </span>
                </h2>
                <p className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Pilih titik Asal (A) & Tujuan (Z) via Klik Peta, Input Lat/Long, atau Nama Node
                </p>
              </div>
            </div>

            <button 
              onClick={closeRouteBuilder}
              className={`p-2 rounded-xl transition-all ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Grid Selection for Point A & Point Z */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* POINT A SELECTION */}
            <div className={`p-4 rounded-2xl border space-y-3 font-mono text-xs ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-bold uppercase flex items-center gap-1.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                  📍 POINT A (ASAL KABEL):
                </span>
                {routeBuilder.pointA.coords && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30 font-bold">
                    SET
                  </span>
                )}
              </div>

              {/* Selected Point A Label */}
              {routeBuilder.pointA.label ? (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                  isDark ? 'bg-blue-950/50 border-blue-500/40 text-blue-300' : 'bg-blue-50 border-blue-300 text-blue-800'
                }`}>
                  <span className="font-extrabold truncate">{routeBuilder.pointA.label}</span>
                  <button
                    onClick={() => handleStartPickOnMap('pointA')}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold shrink-0 shadow"
                  >
                    Ganti
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleStartPickOnMap('pointA')}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] transition-all"
                >
                  <MapPin size={14} />
                  <span>KLIK MAPS UNTUK POINT A</span>
                </button>
              )}

              {/* Manual Lat/Long Input for Point A */}
              <div className={`space-y-1 pt-1 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                <label className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Atau Input Lat, Long (misal: -6.208, 106.845):</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="-6.2088, 106.8456"
                    value={latLngInputA}
                    onChange={(e) => setLatLngInputA(e.target.value)}
                    className={`w-full p-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white focus:ring-blue-500/50' : 'bg-white border-slate-300 text-slate-900 focus:ring-blue-500'
                    }`}
                  />
                  <button
                    onClick={handleApplyLatLngA}
                    className="px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shrink-0"
                  >
                    Set
                  </button>
                </div>
              </div>

              {/* Node Search for Point A */}
              <div className="space-y-1 relative">
                <label className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Cari Node Terdekat:</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik XCC / POP / ODP..."
                    value={nodeSearchA}
                    onChange={(e) => setNodeSearchA(e.target.value)}
                    className={`w-full p-2 pl-7 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white focus:ring-blue-500/50' : 'bg-white border-slate-300 text-slate-900 focus:ring-blue-500'
                    }`}
                  />
                  <Search size={12} className="absolute left-2.5 top-3 text-slate-500" />
                </div>

                {filteredNodesA.length > 0 && (
                  <div className={`absolute top-full left-0 right-0 mt-1 border rounded-xl p-1 z-30 shadow-xl space-y-1 ${
                    isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                  }`}>
                    {filteredNodesA.map(n => (
                      <button
                        key={n.id}
                        onClick={() => handleSelectNodeA(n.name, n.coordinates)}
                        className={`w-full text-left p-1.5 rounded-lg text-[11px] truncate block ${
                          isDark ? 'hover:bg-blue-600/30 text-slate-200' : 'hover:bg-blue-50 text-slate-800'
                        }`}
                      >
                        [{n.type}] {n.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* POINT Z SELECTION */}
            <div className={`p-4 rounded-2xl border space-y-3 font-mono text-xs ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-bold uppercase flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  🎯 POINT Z (TUJUAN KABEL):
                </span>
                {routeBuilder.pointZ.coords && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 font-bold">
                    SET
                  </span>
                )}
              </div>

              {/* Selected Point Z Label */}
              {routeBuilder.pointZ.label ? (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                  isDark ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                }`}>
                  <span className="font-extrabold truncate">{routeBuilder.pointZ.label}</span>
                  <button
                    onClick={() => handleStartPickOnMap('pointZ')}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shrink-0 shadow"
                  >
                    Ganti
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleStartPickOnMap('pointZ')}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] transition-all"
                >
                  <MapPin size={14} />
                  <span>KLIK MAPS UNTUK POINT Z</span>
                </button>
              )}

              {/* Manual Lat/Long Input for Point Z */}
              <div className={`space-y-1 pt-1 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                <label className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Atau Input Lat, Long (misal: -6.304, 106.852):</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="-6.3045, 106.8520"
                    value={latLngInputZ}
                    onChange={(e) => setLatLngInputZ(e.target.value)}
                    className={`w-full p-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white focus:ring-emerald-500/50' : 'bg-white border-slate-300 text-slate-900 focus:ring-emerald-500'
                    }`}
                  />
                  <button
                    onClick={handleApplyLatLngZ}
                    className="px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shrink-0"
                  >
                    Set
                  </button>
                </div>
              </div>

              {/* Node Search for Point Z */}
              <div className="space-y-1 relative">
                <label className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Cari Node Terdekat:</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik XCC / POP / ODP..."
                    value={nodeSearchZ}
                    onChange={(e) => setNodeSearchZ(e.target.value)}
                    className={`w-full p-2 pl-7 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white focus:ring-emerald-500/50' : 'bg-white border-slate-300 text-slate-900 focus:ring-emerald-500'
                    }`}
                  />
                  <Search size={12} className="absolute left-2.5 top-3 text-slate-500" />
                </div>

                {filteredNodesZ.length > 0 && (
                  <div className={`absolute top-full left-0 right-0 mt-1 border rounded-xl p-1 z-30 shadow-xl space-y-1 ${
                    isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                  }`}>
                    {filteredNodesZ.map(n => (
                      <button
                        key={n.id}
                        onClick={() => handleSelectNodeZ(n.name, n.coordinates)}
                        className={`w-full text-left p-1.5 rounded-lg text-[11px] truncate block ${
                          isDark ? 'hover:bg-emerald-600/30 text-slate-200' : 'hover:bg-emerald-50 text-slate-800'
                        }`}
                      >
                        [{n.type}] {n.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* CANDIDATE ROUTES OPTION SELECTOR */}
          {routeBuilder.candidates.length > 0 ? (
            <div className={`p-4 rounded-2xl border font-mono text-xs space-y-3 ${
              isDark ? 'bg-purple-950/40 border-purple-500/40' : 'bg-purple-50 border-purple-200'
            }`}>
              <div className={`flex items-center justify-between font-bold ${isDark ? 'text-purple-300' : 'text-purple-800'}`}>
                <span className="flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-500 animate-pulse" />
                  <span>DITEMUKAN {routeBuilder.candidates.length} OPSI JALUR KABEL TERGAMBAR:</span>
                </span>
                <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Pilih opsi rute yang sesuai</span>
              </div>

              <div className="space-y-2">
                {routeBuilder.candidates.map((cand, idx) => {
                  const isSelected = (routeBuilder.selectedCandidateIndex || 0) === idx;
                  return (
                    <div
                      key={cand.id}
                      onClick={() => setRouteBuilder({ selectedCandidateIndex: idx })}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-purple-900/60 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.5)] scale-[1.01]'
                          : isDark
                            ? 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-purple-500/40'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-purple-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center font-black text-xs ${
                          isSelected ? 'bg-purple-500 border-white text-white' : (isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-200 border-slate-300 text-slate-700')
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-extrabold text-xs flex items-center gap-2">
                            <span>{cand.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold">
                              📏 {Math.round(cand.distanceKm * 1000).toLocaleString('id-ID')} m ({cand.distanceKm} km)
                            </span>
                          </div>
                          <div className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {cand.matchedSegmentName || 'Jalur mengikuti rute jalan raya / fisik di peta'}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className={`flex items-center gap-1 font-bold text-xs ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                          <Check size={16} /> AKTIF
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            routeBuilder.pointA.coords && routeBuilder.pointZ.coords && (
              <div className={`p-3.5 rounded-2xl border text-xs font-mono flex items-center gap-2 ${
                isDark ? 'bg-amber-950/40 border-amber-500/40 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}>
                <AlertCircle size={18} className="shrink-0 text-amber-500" />
                <span>Memproses pencocokan jalur kabel fisik pada peta... Silakan periksa atau klik ulang titik A & Z.</span>
              </div>
            )
          )}

          {/* Footer Action Buttons */}
          <div className={`pt-2 border-t flex items-center justify-between gap-3 font-mono ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}>
            <button
              onClick={closeRouteBuilder}
              className={`px-5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                isDark 
                  ? 'border-slate-700 text-slate-300 hover:bg-slate-800' 
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Batal
            </button>

            <button
              disabled={!routeBuilder.pointA.coords || !routeBuilder.pointZ.coords || routeBuilder.candidates.length === 0}
              onClick={handleConfirmSelectedRoute}
              className={`px-6 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all shadow-lg ${
                routeBuilder.pointA.coords && routeBuilder.pointZ.coords && routeBuilder.candidates.length > 0
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.6)] cursor-pointer hover:scale-105'
                  : isDark ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
              }`}
            >
              <span>TERAPKAN RUTE KABEL TERPILIH</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
