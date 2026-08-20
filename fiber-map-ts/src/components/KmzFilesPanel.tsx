import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { FileStack, X, Eye, EyeOff, Sparkles, MapPin, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const KmzFilesPanel: React.FC = () => {
  const {
    kmzFilesPanelOpen,
    setKmzFilesPanelOpen,
    knownKmzFiles,
    kmzFileVisibility,
    toggleKmzFileVisibility,
    highlightedKmzFile,
    setHighlightedKmzFile,
    requestDeleteKmzFile,
    nodes,
    sidebarOpen,
    theme
  } = useAppStore(useShallow((state) => ({
    kmzFilesPanelOpen: state.kmzFilesPanelOpen,
    setKmzFilesPanelOpen: state.setKmzFilesPanelOpen,
    knownKmzFiles: state.knownKmzFiles,
    kmzFileVisibility: state.kmzFileVisibility,
    toggleKmzFileVisibility: state.toggleKmzFileVisibility,
    highlightedKmzFile: state.highlightedKmzFile,
    setHighlightedKmzFile: state.setHighlightedKmzFile,
    requestDeleteKmzFile: state.requestDeleteKmzFile,
    nodes: state.nodes,
    sidebarOpen: state.sidebarOpen,
    theme: state.theme
  })));

  const isDark = theme === 'dark';

  return (
    <AnimatePresence>
      {kmzFilesPanelOpen && (
        <motion.div
          className={`fixed top-0 z-40 h-full w-80 sm:w-96 backdrop-blur-2xl shadow-2xl flex flex-col transition-all duration-300 border-r ${
            isDark
              ? 'bg-slate-950/95 text-slate-100 border-slate-800/80'
              : 'bg-white/95 text-slate-900 border-slate-200 shadow-2xl'
          } ${
            sidebarOpen ? 'left-64' : 'left-0 md:left-16'
          }`}
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -100, opacity: 0 }}
        >
          {/* Header */}
          <div className={`p-4 border-b flex items-center justify-between gap-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2 text-cyan-500 font-mono font-extrabold text-sm uppercase tracking-wider">
              <FileStack size={18} className="text-cyan-500" />
              <span>FILE KMZ TERMUAT</span>
            </div>
            <button
              onClick={() => setKmzFilesPanelOpen(false)}
              className={`p-1.5 rounded-xl transition-all ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
              title="Tutup Panel"
            >
              <X size={18} />
            </button>
          </div>

          <div className={`px-4 pt-3 pb-1 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Sembunyikan atau soroti node & jalur kabel per file KMZ.
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {knownKmzFiles.length === 0 && (
              <div className={`text-xs font-mono text-center py-10 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Belum ada file KMZ yang termuat.
              </div>
            )}

            {knownKmzFiles.map((fileName) => {
              const isHidden = kmzFileVisibility[fileName] === false;
              const isHighlighted = highlightedKmzFile === fileName;
              const nodeCount = nodes.filter((n) => n.sourceFile === fileName).length;

              return (
                <div
                  key={fileName}
                  className={`p-3 rounded-xl border transition-all ${
                    isHighlighted
                      ? isDark ? 'bg-amber-950/40 border-amber-500/60' : 'bg-amber-50 border-amber-400'
                      : isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                  } ${isHidden ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin size={14} className={isDark ? 'text-cyan-400 shrink-0' : 'text-cyan-600 shrink-0'} />
                      <span className="text-xs font-mono font-bold truncate" title={fileName}>{fileName}</span>
                    </div>
                    <span className={`text-[10px] font-mono shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      {nodeCount} node
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={() => toggleKmzFileVisibility(fileName)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-extrabold border transition-all ${
                        isHidden
                          ? isDark ? 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500' : 'bg-slate-200 text-slate-500 border-slate-300 hover:border-slate-400'
                          : isDark ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40 hover:border-cyan-400' : 'bg-cyan-50 text-cyan-700 border-cyan-300 hover:border-cyan-500'
                      }`}
                      title={isHidden ? 'Tampilkan file ini di peta' : 'Sembunyikan file ini dari peta'}
                    >
                      {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                      {isHidden ? 'TERSEMBUNYI' : 'TAMPIL'}
                    </button>

                    <button
                      onClick={() => setHighlightedKmzFile(isHighlighted ? null : fileName)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-extrabold border transition-all ${
                        isHighlighted
                          ? 'bg-amber-500 text-slate-950 border-amber-300'
                          : isDark ? 'bg-slate-800 text-slate-400 border-slate-700 hover:border-amber-500/50' : 'bg-slate-200 text-slate-500 border-slate-300 hover:border-amber-400'
                      }`}
                      title={isHighlighted ? 'Matikan sorotan' : 'Soroti file ini, redupkan yang lain'}
                    >
                      <Sparkles size={12} />
                      {isHighlighted ? 'DISOROTI' : 'SOROT'}
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm(`Hapus semua node & jalur kabel dari "${fileName}" dari tampilan peta saat ini? (Refresh halaman akan memuat ulang file default jika ini salah satunya)`)) {
                          requestDeleteKmzFile(fileName);
                        }
                      }}
                      className={`flex items-center justify-center px-2.5 py-1.5 rounded-lg border transition-all shrink-0 ${
                        isDark
                          ? 'bg-slate-800 text-rose-400 border-slate-700 hover:bg-rose-950 hover:border-rose-500/50'
                          : 'bg-slate-200 text-rose-600 border-slate-300 hover:bg-rose-50 hover:border-rose-400'
                      }`}
                      title="Hapus file ini dari tampilan peta (sementara, sampai di-refresh — tidak menghapus data yang sudah tersimpan)"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {highlightedKmzFile && (
            <div className={`p-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setHighlightedKmzFile(null)}
                className="w-full px-3 py-2 rounded-xl text-[11px] font-mono font-extrabold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
              >
                RESET SOROTAN
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
