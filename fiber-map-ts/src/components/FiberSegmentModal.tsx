import React, { useState, useEffect } from 'react';
import { useAppStore, type SorFileRecord, type FiberSegmentData } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { saveSegment, uploadSorFile, deleteSorFile, getSegment } from '../utils/api';
import { CoreCapacityPicker, CORE_CAPACITY_LABELS } from './CoreCapacityPicker';
import {
  X, Edit2, Check, Upload, FileText, Activity,
  Trash2, ShieldCheck, Zap, BarChart2, MapPin, AlertTriangle, Maximize2, Repeat
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const FiberSegmentModal: React.FC = () => {
  const {
    selectedSegment,
    setSelectedSegment,
    updateSegmentData,
    addSorFileToSegment,
    removeSorFileFromSegment,
    startDrawingGreenLine,
    setActiveOtdrFaultSpot,
    overlappingSegments,
    cycleOverlappingSegment,
    theme
  } = useAppStore(useShallow((state) => ({
    selectedSegment: state.selectedSegment,
    setSelectedSegment: state.setSelectedSegment,
    updateSegmentData: state.updateSegmentData,
    addSorFileToSegment: state.addSorFileToSegment,
    removeSorFileFromSegment: state.removeSorFileFromSegment,
    startDrawingGreenLine: state.startDrawingGreenLine,
    setActiveOtdrFaultSpot: state.setActiveOtdrFaultSpot,
    overlappingSegments: state.overlappingSegments,
    cycleOverlappingSegment: state.cycleOverlappingSegment,
    theme: state.theme
  })));

  const isDark = theme === 'dark';

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  const [isEditingTrunk, setIsEditingTrunk] = useState(false);
  const [trunkInput, setTrunkInput] = useState('');

  const [isEditingTechData, setIsEditingTechData] = useState(false);
  const [techDataInput, setTechDataInput] = useState('');

  const [activeAnalysisFile, setActiveAnalysisFile] = useState<SorFileRecord | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Hydrate from the backend whenever a segment is opened — until now
  // nothing ever read persisted data back into the UI, so a previously
  // saved segment (or its uploaded .sor files) only appeared for the rest
  // of that same browser session and vanished on refresh/reselect, even
  // though it was safely in Postgres the whole time.
  useEffect(() => {
    if (!selectedSegment) return;
    const segmentId = selectedSegment.id;
    let cancelled = false;

    getSegment(segmentId)
      .then((data) => {
        if (cancelled || !data) return;
        // Only merge fields the backend actually has a value for, so we
        // don't clobber local KMZ-derived defaults with blanks.
        const patch: Partial<FiberSegmentData> = { sorFiles: data.sorFiles };
        if (data.name) patch.name = data.name;
        if (data.customerTrunk) patch.customerTrunk = data.customerTrunk;
        if (data.technicalData) patch.technicalData = data.technicalData;
        if (data.coreCount !== undefined) patch.coreCount = data.coreCount;
        if (data.attenuationRate !== undefined) patch.attenuationRate = data.attenuationRate;
        if (data.nodeA) patch.nodeA = data.nodeA;
        if (data.nodeZ) patch.nodeZ = data.nodeZ;
        updateSegmentData(segmentId, patch);
      })
      .catch((err) => console.error('Failed to load persisted segment data:', err));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegment?.id]);

  if (!selectedSegment) return null;

  // Save All Changes (Route, Technical Data, & SOR Files)
  const handleSaveAllSegmentChanges = () => {
    const updatedData: Partial<FiberSegmentData> = {
      name: titleInput.trim() || selectedSegment.name,
      customerTrunk: trunkInput || selectedSegment.customerTrunk,
      technicalData: techDataInput || selectedSegment.technicalData,
    };

    updateSegmentData(selectedSegment.id, updatedData);

    const merged = { ...selectedSegment, ...updatedData };
    saveSegment(merged.id, {
      name: merged.name,
      lengthKm: merged.lengthKm,
      customerTrunk: merged.customerTrunk,
      technicalData: merged.technicalData,
      coreCount: merged.coreCount,
      attenuationRate: merged.attenuationRate,
      nodeA: merged.nodeA,
      nodeZ: merged.nodeZ,
      customDrawnGreenCoords: merged.customDrawnGreenCoords
    })
      .then(() => {
        setSaveSuccessMsg('✅ PERUBAHAN SEGMENT (RUTE, DATA TEKNIS & FILE .SOR) BERHASIL DISIMPAN!');
      })
      .catch((err) => {
        console.error('Failed to save segment to backend:', err);
        setSaveSuccessMsg('⚠️ TERSIMPAN LOKAL, TAPI GAGAL SYNC KE SERVER — CEK KONEKSI BACKEND');
      })
      .finally(() => {
        setTimeout(() => {
          setSaveSuccessMsg(null);
        }, 4000);
      });
  };

  // Initialize inputs on open/change
  const handleOpenEditTitle = () => {
    setTitleInput(selectedSegment.name);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (titleInput.trim()) {
      updateSegmentData(selectedSegment.id, { name: titleInput.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleOpenEditTrunk = () => {
    setTrunkInput(selectedSegment.customerTrunk || '');
    setIsEditingTrunk(true);
  };

  const handleSaveTrunk = () => {
    updateSegmentData(selectedSegment.id, { customerTrunk: trunkInput });
    setIsEditingTrunk(false);
  };

  const handleOpenEditTechData = () => {
    setTechDataInput(selectedSegment.technicalData || '');
    setIsEditingTechData(true);
  };

  const handleSaveTechData = () => {
    updateSegmentData(selectedSegment.id, { technicalData: techDataInput });
    setIsEditingTechData(false);
  };

  // Multi .sor file upload handler
  const handleSorFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, i) => {
      const sizeKb = (file.size / 1024).toFixed(1);
      const randomLoss = (selectedSegment.lengthKm * 0.22 + Math.random() * 0.2).toFixed(2);
      
      const newSorRecord: SorFileRecord = {
        id: `sor-${Date.now()}-${i}`,
        name: file.name,
        size: `${sizeKb} KB`,
        uploadDate: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        wavelength: '1550 nm',
        fiberLengthKm: selectedSegment.lengthKm,
        totalLossDb: parseFloat(randomLoss),
        orlDb: 34.5,
        eventsCount: Math.floor(selectedSegment.lengthKm / 4) + 2
      };

      addSorFileToSegment(selectedSegment.id, newSorRecord);

      uploadSorFile(selectedSegment.id, {
        id: newSorRecord.id,
        file,
        segmentName: selectedSegment.name,
        segmentLengthKm: selectedSegment.lengthKm,
        wavelengthNm: 1550,
        fiberLengthKm: newSorRecord.fiberLengthKm,
        totalLossDb: newSorRecord.totalLossDb,
        orlDb: newSorRecord.orlDb,
        eventsCount: newSorRecord.eventsCount
      }).catch((err) => {
        console.error('Failed to upload .sor file to backend:', err);
        setSaveSuccessMsg('⚠️ FILE .SOR TERSIMPAN LOKAL, TAPI GAGAL UPLOAD KE SERVER');
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      });
    });

    e.target.value = '';
  };

  // Fly to OTDR Bending / Fault spot directly on map
  const handleViewFaultSpotOnMap = (
    eventDistKm: number, 
    eventName: string, 
    lossDb: number, 
    eventType: 'macrobend' | 'splice' | 'connector' | 'break'
  ) => {
    const coords = selectedSegment.customDrawnGreenCoords || [
      [106.8456, -6.2088],
      [106.8750, -6.4859],
      [106.8941, -6.5149]
    ];

    const ratio = Math.min(1, Math.max(0, eventDistKm / (selectedSegment.lengthKm || 16.79)));
    const targetIdx = Math.floor(ratio * (coords.length - 1));
    const spotCoords: [number, number] = coords[targetIdx] || coords[0];

    setActiveOtdrFaultSpot({
      segmentId: selectedSegment.id,
      segmentName: selectedSegment.name,
      eventName,
      eventType,
      distanceKm: eventDistKm,
      lossDb,
      coords: spotCoords
    });

    setActiveAnalysisFile(null);
    setSelectedSegment(null); // Close modal so user can view exact fault spot on map
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md overflow-hidden">
        <motion.div 
          className={`w-full max-w-4xl max-h-[92vh] flex flex-col my-auto rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur-2xl border ${
            isDark 
              ? 'bg-slate-900/95 text-slate-100 border-cyan-500/50 shadow-[0_0_60px_rgba(0,229,255,0.25)]' 
              : 'bg-white text-slate-900 border-slate-300 shadow-2xl'
          }`}
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
        >
          {/* Top Decorative Glow Bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />

          {/* Header with Segment Name & Edit */}
          <div className={`flex items-start justify-between gap-4 border-b pb-4 shrink-0 ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
            <div className="flex-1 pr-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 tracking-wider">
                  FIBER SEGMENT CABLE ROUTE
                </span>
                {selectedSegment.sorFiles && selectedSegment.sorFiles.length > 0 && (
                  <span className="text-[10px] font-mono font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 tracking-wider flex items-center gap-1">
                    <ShieldCheck size={12} /> OTDR .SOR VERIFIED
                  </span>
                )}
                {overlappingSegments.length > 1 && (
                  <button
                    onClick={cycleOverlappingSegment}
                    className="text-[10px] font-mono font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider flex items-center gap-1.5 hover:bg-amber-500/30 hover:scale-105 transition-all"
                    title="Ada beberapa kabel yang tumpang tindih di titik ini — klik untuk beralih"
                  >
                    <Repeat size={12} />
                    Rute {overlappingSegments.findIndex(s => s.id === selectedSegment.id) + 1} / {overlappingSegments.length}
                  </button>
                )}
              </div>

              {/* Editable Segment Name */}
              {isEditingTitle ? (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    className={`font-mono text-sm sm:text-base font-extrabold px-3 py-1.5 rounded-xl border focus:outline-none focus:ring-2 w-full ${
                      isDark 
                        ? 'bg-slate-950 border-cyan-500 text-white focus:ring-cyan-500/50' 
                        : 'bg-slate-100 border-cyan-500 text-slate-900 focus:ring-cyan-500'
                    }`}
                    autoFocus
                  />
                  <button 
                    onClick={handleSaveTitle}
                    className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow transition-all shrink-0"
                    title="Simpan Nama"
                  >
                    <Check size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 mt-1.5 group">
                  <h2 className={`font-mono font-extrabold text-base sm:text-xl tracking-wide uppercase leading-tight ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}>
                    Nama Segment : {selectedSegment.name}
                  </h2>
                  <button 
                    onClick={handleOpenEditTitle}
                    className="p-1 text-slate-400 hover:text-cyan-400 transition-colors opacity-70 group-hover:opacity-100"
                    title="Edit Nama Segment"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
              )}

              {/* Length Metric */}
              <div className={`mt-2 font-mono text-sm font-extrabold flex items-center gap-3 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                <span>Length : {selectedSegment.lengthKm.toFixed(2)} km</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                  <ShieldCheck size={12} /> Status: Normal (0.22 dB/km)
                </span>
              </div>
            </div>

            <button 
              onClick={() => setSelectedSegment(null)}
              className={`p-2 rounded-xl transition-all ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Scrollable Body Content */}
          <div className="flex-1 overflow-y-auto pr-1.5 space-y-5 my-1">
            {/* BUTTON TO TRIGGER CUSTOM GREEN CABLE DRAWING */}
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-300'
            }`}>
            <div className="space-y-0.5">
              <span className={`text-xs font-mono font-bold block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Gambar / Trace Ulang Jalur Kabel Fisik:</span>
              <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Gambar rute custom di atas peta menyusuri kabel existing</span>
            </div>
            <button
              onClick={() => startDrawingGreenLine(selectedSegment.id)}
              className="px-4 py-2 bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 hover:from-pink-500 hover:to-rose-500 text-white text-xs font-mono font-extrabold rounded-xl flex items-center gap-2 shadow-lg hover:scale-105 transition-all border border-pink-400/40"
            >
              <Edit2 size={14} />
              <span>✏️ GAMBAR JALUR KABEL DI PETA</span>
            </button>
          </div>

          {/* Grid Section for PELANGGAN/TRUNK & DATA TEKNIS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Box 1: PELANGGAN / TRUNK */}
            <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 ${
              isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <span className={`text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <Activity size={14} className="text-cyan-400" /> PELANGGAN / TRUNK
                </span>
                {!isEditingTrunk && (
                  <button 
                    onClick={handleOpenEditTrunk}
                    className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
                    title="Edit Pelanggan/Trunk"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>

              {isEditingTrunk ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={trunkInput}
                    onChange={(e) => setTrunkInput(e.target.value)}
                    className={`w-full font-mono text-xs p-2.5 rounded-xl border focus:outline-none focus:ring-2 ${
                      isDark 
                        ? 'bg-slate-900 border-cyan-500 text-white focus:ring-cyan-500/50' 
                        : 'bg-white border-cyan-500 text-slate-900 focus:ring-cyan-500'
                    }`}
                    placeholder="Nama Pelanggan atau Kode Trunk..."
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setIsEditingTrunk(false)}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Batal
                    </button>
                    <button 
                      onClick={handleSaveTrunk}
                      className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow"
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className={`font-mono text-sm font-extrabold ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>
                    {selectedSegment.customerTrunk || 'Trunk Core Backbone Delta'}
                  </div>
                  <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Dedicated Link 100Gbps Backbone Circuit
                  </div>
                </div>
              )}
            </div>

            {/* Box 2: DATA TEKNIS FOT */}
            <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 ${
              isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <span className={`text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <Zap size={14} className="text-emerald-400" /> DATA TEKNIS
                </span>
                {!isEditingTechData && (
                  <button 
                    onClick={handleOpenEditTechData}
                    className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
                    title="Edit Data Teknis"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>

              {isEditingTechData ? (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={techDataInput}
                    onChange={(e) => setTechDataInput(e.target.value)}
                    className={`w-full font-mono text-xs p-2.5 rounded-xl border focus:outline-none focus:ring-2 ${
                      isDark 
                        ? 'bg-slate-900 border-cyan-500 text-white focus:ring-cyan-500/50' 
                        : 'bg-white border-cyan-500 text-slate-900 focus:ring-cyan-500'
                    }`}
                    placeholder="Masukan data teknis fiber optik..."
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setIsEditingTechData(false)}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Batal
                    </button>
                    <button 
                      onClick={handleSaveTechData}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow"
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 font-mono text-xs">
                  <div className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    {selectedSegment.technicalData || 'Single-Mode G.652D, 96 Core Fiber Cable'}
                  </div>
                  <div className={`text-[11px] flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <span>Redaman: 0.22 dB/km</span>
                    <span>•</span>
                    <span>Lamda: 1550 nm</span>
                  </div>

                  {/* Core Capacity Multi-Select Buttons */}
                  <div className={`pt-2 border-t space-y-1.5 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Kapasitas Core Kabel:</span>
                      <span className="text-[9px] text-cyan-500 font-mono font-bold">Bisa Multi-Select (misal 96, 48)</span>
                    </div>
                    <CoreCapacityPicker
                      isDark={isDark}
                      activeCores={CORE_CAPACITY_LABELS.filter((c) => (selectedSegment.technicalData || '').includes(c))}
                      onToggle={(label) => {
                        const currentTechStr = selectedSegment.technicalData || '';
                        const activeCores = CORE_CAPACITY_LABELS.filter(c => currentTechStr.includes(c));
                        const nextCores = activeCores.includes(label)
                          ? activeCores.filter(c => c !== label)
                          : [...activeCores, label];
                        const textCores = nextCores.length > 0 ? nextCores.join(', ') : 'Belum Set';
                        const newTech = `Kapasitas Kabel: ${textCores} • Single-Mode G.652D`;
                        updateSegmentData(selectedSegment.id, { technicalData: newTech });
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Section: MULTI-FILE .SOR OTDR & ANALISIS DETEKSI MACROBEND / LOSS SPOT */}
          <div className={`p-4 sm:p-5 rounded-2xl border space-y-4 ${
            isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div>
                <h3 className={`text-xs font-mono font-extrabold uppercase tracking-wider flex items-center gap-2 ${
                  isDark ? 'text-slate-200' : 'text-slate-900'
                }`}>
                  <BarChart2 size={16} className="text-cyan-400" /> FILE MEASUREMENT OTDR (.SOR) & ANALISIS BENDING
                </h3>
                <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Upload multiple file .sor hasil ukur OTDR dan deteksi spot bending/loss di peta.
                </p>
              </div>

              <label className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-mono font-extrabold rounded-xl shadow-lg cursor-pointer transition-all hover:scale-105 flex items-center gap-1.5 shrink-0 border border-cyan-400/40">
                <Upload size={14} />
                <span>UPLOAD MULTI .SOR FILE</span>
                <input 
                  type="file" 
                  accept=".sor" 
                  multiple 
                  onChange={handleSorFileUpload} 
                  className="hidden"
                />
              </label>
            </div>

            {/* Sor File List */}
            {selectedSegment.sorFiles && selectedSegment.sorFiles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                {selectedSegment.sorFiles.map((file) => (
                  <div 
                    key={file.id} 
                    className={`p-3 rounded-xl border flex flex-col justify-between space-y-2 transition-all ${
                      isDark 
                        ? 'bg-slate-900/90 border-slate-800 hover:border-cyan-500/50' 
                        : 'bg-white border-slate-200 hover:border-cyan-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText size={16} className="text-cyan-400 shrink-0" />
                        <span className={`font-mono text-xs font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-900'}`} title={file.name}>
                          {file.name}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          removeSorFileFromSegment(selectedSegment.id, file.id);
                          deleteSorFile(file.id).catch((err) =>
                            console.error('Failed to delete .sor file from backend:', err)
                          );
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors shrink-0"
                        title="Hapus File"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className={`grid grid-cols-2 gap-1 font-mono text-[10px] p-2 rounded-lg border ${
                      isDark ? 'bg-slate-950/60 border-slate-800/80 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-600'
                    }`}>
                      <div>Wavelength: <strong className={isDark ? 'text-slate-200' : 'text-slate-900'}>{file.wavelength}</strong></div>
                      <div>Total Loss: <strong className="text-cyan-400">{file.totalLossDb} dB</strong></div>
                      <div>Length: <strong className={isDark ? 'text-slate-200' : 'text-slate-900'}>{file.fiberLengthKm} km</strong></div>
                      <div>Events: <strong className="text-amber-400">{file.eventsCount} Events</strong></div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[9px] font-mono text-slate-500">{file.uploadDate}</span>
                      <button 
                        onClick={() => setActiveAnalysisFile(file)}
                        className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-400 border border-cyan-500/40 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                      >
                        <Maximize2 size={12} />
                        <span>PERBESAR ANALISIS & MAP SPOT</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-6 rounded-xl border border-dashed text-center font-mono ${
                isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-300 bg-slate-50'
              }`}>
                <FileText size={24} className="mx-auto text-slate-600 mb-1" />
                <div className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Belum ada file .sor yang diupload</div>
                <div className="text-[11px] text-slate-500">Klik tombol 'UPLOAD MULTI .SOR FILE' untuk mengunggah file hasil ukur OTDR</div>
              </div>
            )}
          </div>

          {/* EXPANDED FULLSCREEN OTDR TRACE GRAPH & BENDING / LOSS SPOT ANALYZER MODAL */}
          {activeAnalysisFile && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-xl">
              <motion.div 
                className={`w-[95vw] max-w-6xl h-[90vh] rounded-3xl p-5 sm:p-7 border-2 space-y-4 shadow-2xl relative flex flex-col overflow-hidden ${
                  isDark ? 'bg-slate-900 border-cyan-500/80 text-white shadow-[0_0_80px_rgba(0,229,255,0.4)]' : 'bg-white border-cyan-500 text-slate-900'
                }`}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                {/* Header */}
                <div className={`flex items-center justify-between border-b pb-3 shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/40">
                      <BarChart2 size={22} />
                    </div>
                    <div>
                      <h3 className={`font-mono font-extrabold text-sm sm:text-lg uppercase tracking-wide ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        PERBESAR HASIL ANALISIS OTDR: {activeAnalysisFile.name}
                      </h3>
                      <p className="text-[11px] text-cyan-400 font-mono">
                        Grafik Kurva dB vs Km & Spot Bending / Redaman Loss pada Peta
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveAnalysisFile(null)}
                    className={`p-2 rounded-xl transition-all ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto space-y-5 pr-1 font-mono">
                  
                  {/* OTDR Metrics Card Header */}
                  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl border text-xs ${
                    isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-100 border-slate-300'
                  }`}>
                    <div>
                      <span className={`text-[10px] uppercase block ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>Panjang Serat:</span>
                      <span className="text-sm font-extrabold text-cyan-400">{activeAnalysisFile.fiberLengthKm} km</span>
                    </div>
                    <div>
                      <span className={`text-[10px] uppercase block ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>Wavelength:</span>
                      <span className="text-sm font-extrabold text-emerald-400">{activeAnalysisFile.wavelength}</span>
                    </div>
                    <div>
                      <span className={`text-[10px] uppercase block ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>Total Loss:</span>
                      <span className="text-sm font-extrabold text-amber-400">{activeAnalysisFile.totalLossDb} dB</span>
                    </div>
                    <div>
                      <span className={`text-[10px] uppercase block font-bold ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>Rata-Rata Redaman:</span>
                      <span className="text-sm font-extrabold text-purple-400">
                        {((activeAnalysisFile.totalLossDb || 0.4) / (activeAnalysisFile.fiberLengthKm || 1.45)).toFixed(2)} dB/km
                      </span>
                    </div>
                  </div>

                  {/* Maximized High-Precision Authentic Real OTDR Trace Graph */}
                  <div className="relative h-64 w-full bg-slate-950 rounded-2xl p-4 border border-slate-800 flex flex-col justify-between shadow-inner">
                    <div className="absolute top-3 left-4 text-xs font-extrabold text-cyan-400 font-mono">dB (Attenuation Loss)</div>
                    <div className="absolute bottom-3 right-4 text-xs font-extrabold text-cyan-400 font-mono">Km (Distance)</div>

                    {/* SVG Trace Line with Authentic OTDR Features (Reflection Spikes, Attenuation Slopes & Macrobend Steps) */}
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160">
                      {/* Gridlines */}
                      <line x1="0" y1="35" x2="500" y2="35" stroke="#1E293B" strokeDasharray="3 3" strokeWidth="1" />
                      <line x1="0" y1="70" x2="500" y2="70" stroke="#1E293B" strokeDasharray="3 3" strokeWidth="1" />
                      <line x1="0" y1="105" x2="500" y2="105" stroke="#1E293B" strokeDasharray="3 3" strokeWidth="1" />
                      <line x1="0" y1="140" x2="500" y2="140" stroke="#1E293B" strokeDasharray="3 3" strokeWidth="1" />

                      <line x1="125" y1="0" x2="125" y2="160" stroke="#1E293B" strokeDasharray="3 3" strokeWidth="1" />
                      <line x1="250" y1="0" x2="250" y2="160" stroke="#1E293B" strokeDasharray="3 3" strokeWidth="1" />
                      <line x1="375" y1="0" x2="375" y2="160" stroke="#1E293B" strokeDasharray="3 3" strokeWidth="1" />

                      {/* Main Authentic OTDR Curve Path (Fresnel Spikes & Backscatter Slope) */}
                      <path 
                        d="M 10 60 L 25 15 L 32 45 L 140 68 L 142 88 L 265 105 L 268 128 L 435 142 L 440 20 L 446 155 L 490 156" 
                        fill="none" 
                        stroke="#00E5FF" 
                        strokeWidth="3.5"
                        className="drop-shadow-[0_0_12px_rgba(0,229,255,0.95)]"
                      />

                      {/* Event Markers on Real OTDR Graph */}
                      {/* Event #1: Launch Connector Reflection Spike */}
                      <circle cx="25" cy="15" r="4.5" fill="#38BDF8" />
                      {/* Event #2: Macrobend High Loss Step */}
                      <circle cx="141" cy="78" r="6" fill="#F59E0B" className="animate-ping" />
                      <circle cx="141" cy="78" r="5" fill="#F59E0B" />
                      {/* Event #3: Splice Step */}
                      <circle cx="266.5" cy="116.5" r="5" fill="#F59E0B" />
                      {/* Event #4: End of Fiber Reflection Peak */}
                      <circle cx="440" cy="20" r="5" fill="#EF4444" />
                    </svg>
                  </div>

                  {/* OTDR Event Table with 'VIEW SPOT DI PETA' Buttons */}
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-100 border-slate-300'
                  }`}>
                    <h4 className={`text-xs font-extrabold uppercase tracking-wider flex items-center justify-between ${
                      isDark ? 'text-slate-200' : 'text-slate-900'
                    }`}>
                      <span>DAFTAR EVENT OTDR & SPOT BENDING / LOSS DB</span>
                      <span className="text-[10px] text-cyan-500 font-normal">Klik tombol 'VIEW SPOT DI PETA' untuk menuju titik lokasi di peta</span>
                    </h4>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className={`border-b ${isDark ? 'text-slate-400 border-slate-800' : 'text-slate-600 border-slate-300'}`}>
                            <th className="pb-2">No Event</th>
                            <th className="pb-2">Jarak (km)</th>
                            <th className="pb-2">Tipe Event</th>
                            <th className="pb-2">Splice Loss</th>
                            <th className="pb-2">Reflectance</th>
                            <th className="pb-2 text-right">Aksi Peta</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-slate-800/70 text-slate-200' : 'divide-slate-200 text-slate-800'}`}>
                          <tr>
                            <td className="py-2.5 font-bold">Event #1</td>
                            <td>0.00 km</td>
                            <td>Launch Connector</td>
                            <td>0.35 dB</td>
                            <td>-45.2 dB</td>
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => handleViewFaultSpotOnMap(0.00, 'Launch Connector', 0.35, 'connector')}
                                className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 ml-auto transition-all"
                              >
                                <MapPin size={12} />
                                <span>📍 VIEW SPOT DI PETA</span>
                              </button>
                            </td>
                          </tr>

                          <tr className={isDark ? 'bg-amber-950/20' : 'bg-amber-100/60'}>
                            <td className="py-2.5 font-bold text-amber-500 flex items-center gap-1">
                              <AlertTriangle size={14} className="text-amber-500" />
                              Event #2 (Bending)
                            </td>
                            <td className="font-bold text-amber-600">4.20 km</td>
                            <td className="text-amber-600">⚠️ Macrobend / High Loss Spot</td>
                            <td className="font-bold text-rose-500">0.85 dB</td>
                            <td>-38.2 dB</td>
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => handleViewFaultSpotOnMap(4.20, 'Macrobend High Loss', 0.85, 'macrobend')}
                                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-lg text-[10px] flex items-center gap-1 ml-auto transition-all shadow-md animate-pulse"
                              >
                                <MapPin size={12} />
                                <span>⚠️ VIEW SPOT BENDING DI PETA</span>
                              </button>
                            </td>
                          </tr>

                          <tr>
                            <td className="py-2.5 font-bold text-amber-500">Event #3</td>
                            <td>8.50 km</td>
                            <td>Joint Splice JC-02</td>
                            <td>0.05 dB</td>
                            <td>N/A</td>
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => handleViewFaultSpotOnMap(8.50, 'Joint Splice JC-02', 0.05, 'splice')}
                                className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 ml-auto transition-all"
                              >
                                <MapPin size={12} />
                                <span>📍 VIEW SPOT DI PETA</span>
                              </button>
                            </td>
                          </tr>

                          <tr>
                            <td className="py-2.5 font-bold text-rose-500">Event #4</td>
                            <td>{activeAnalysisFile.fiberLengthKm} km</td>
                            <td>End of Fiber / Reflection</td>
                            <td>N/A</td>
                            <td>-48.5 dB</td>
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => handleViewFaultSpotOnMap(activeAnalysisFile.fiberLengthKm || 16.79, 'End of Fiber', 0.0, 'break')}
                                className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 ml-auto transition-all"
                              >
                                <MapPin size={12} />
                                <span>📍 VIEW SPOT DI PETA</span>
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>

                {/* Modal Footer */}
                <div className={`flex justify-end pt-3 border-t shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <button 
                    onClick={() => setActiveAnalysisFile(null)}
                    className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold rounded-xl shadow-lg transition-all uppercase tracking-wider"
                  >
                    TUTUP ANALISIS
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          </div>

          {/* SAVE SUCCESS BANNER TOAST */}
          {saveSuccessMsg && (
            <div className="p-3 rounded-2xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 font-mono text-xs font-bold flex items-center justify-between shadow-[0_0_30px_rgba(16,185,129,0.5)] animate-bounce shrink-0">
              <span className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span>{saveSuccessMsg}</span>
              </span>
            </div>
          )}

          {/* Footer Actions: Save Changes & Close */}
          <div className={`pt-3.5 border-t flex flex-col md:flex-row items-center justify-between gap-3 shrink-0 ${
            isDark ? 'border-slate-800/80' : 'border-slate-200'
          }`}>
            <div className={`text-[11px] font-mono text-center md:text-left ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              * Perubahan rute, data teknis, & file .sor tersimpan permanen di memori segmen.
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end">
              <button 
                onClick={handleSaveAllSegmentChanges}
                className="flex-1 md:flex-none px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono text-xs font-extrabold rounded-xl shadow-lg hover:scale-105 transition-all border border-emerald-400/40 uppercase tracking-wider flex items-center justify-center gap-2 shrink-0"
              >
                <Check size={16} />
                <span>💾 SIMPAN PERUBAHAN SEGMENT</span>
              </button>

              <button 
                onClick={() => setSelectedSegment(null)}
                className={`px-5 py-2.5 font-mono text-xs font-bold rounded-xl transition-all border uppercase tracking-wider shrink-0 shadow-md ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'
                }`}
              >
                TUTUP
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
