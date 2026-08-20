import React, { useState, useMemo } from 'react';
import { useAppStore, type NodeData } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Search, X, Server, Radio, Box, MapPin, ArrowUpRight, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const SearchSubmenu: React.FC = () => {
  const {
    searchSubmenuOpen,
    setSearchSubmenuOpen,
    nodes,
    setSelectedXcc,
    setSelectedPopNode,
    setSelectedOdpNode,
    setActiveAlert,
    setFlyToCoordinates,
    sidebarOpen,
    theme
  } = useAppStore(useShallow((state) => ({
    searchSubmenuOpen: state.searchSubmenuOpen,
    setSearchSubmenuOpen: state.setSearchSubmenuOpen,
    nodes: state.nodes,
    setSelectedXcc: state.setSelectedXcc,
    setSelectedPopNode: state.setSelectedPopNode,
    setSelectedOdpNode: state.setSelectedOdpNode,
    setActiveAlert: state.setActiveAlert,
    setFlyToCoordinates: state.setFlyToCoordinates,
    sidebarOpen: state.sidebarOpen,
    theme: state.theme
  })));

  const isDark = theme === 'dark';

  const [query, setQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'XCC' | 'POP' | 'ODP'>('ALL');

  // Filter nodes based on active tab and search query
  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      const matchesTab = activeTab === 'ALL' || node.type === activeTab;
      const matchesQuery = query.trim() === '' || 
        node.name.toLowerCase().includes(query.toLowerCase()) || 
        (node.type && node.type.toLowerCase().includes(query.toLowerCase()));
      return matchesTab && matchesQuery;
    });
  }, [nodes, activeTab, query]);

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      ALL: nodes.length,
      XCC: nodes.filter(n => n.type === 'XCC').length,
      POP: nodes.filter(n => n.type === 'POP').length,
      ODP: nodes.filter(n => n.type === 'ODP').length,
    };
  }, [nodes]);

  const handleNodeClick = (node: NodeData) => {
    // 1. Fly map focus to node coordinates. Previously this used
    // setActiveAlert(node), which ALSO opens AlertDrawer (a completely
    // separate full-screen panel) as an unintended side effect — clicking
    // any search result opened both the correct detail panel below AND a
    // nonsensical alert drawer for a node that likely wasn't alerting at
    // all. flyToCoordinates only moves the camera.
    setFlyToCoordinates(node.coordinates);

    // 2. Open corresponding panel/modal — for node types with no
    // dedicated panel (HH/Tiang), fall back to the alert drawer as the
    // detail view, matching FiberMap.tsx's marker click behavior.
    if (node.type === 'XCC') {
      setSelectedXcc(node);
    } else if (node.type === 'POP') {
      setSelectedPopNode(node);
    } else if (node.type === 'ODP') {
      setSelectedOdpNode(node);
    } else {
      setActiveAlert(node);
    }
  };

  const getNodeIcon = (type?: string) => {
    switch (type) {
      case 'XCC':
        return (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
            isDark 
              ? 'bg-slate-900 border-amber-400/70 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]' 
              : 'bg-amber-50 border-amber-400 text-amber-700 shadow-sm'
          }`}>
            <Server size={16} />
          </div>
        );
      case 'POP':
        return (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
            isDark 
              ? 'bg-slate-950 border-emerald-400/80 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]' 
              : 'bg-emerald-50 border-emerald-400 text-emerald-700 shadow-sm'
          }`}>
            <Radio size={16} />
          </div>
        );
      case 'ODP':
        return (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
            isDark 
              ? 'bg-slate-950 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.4)]' 
              : 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm'
          }`}>
            <Box size={16} />
          </div>
        );
      default:
        return (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
          }`}>
            <Layers size={16} />
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      {searchSubmenuOpen && (
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
          <div className={`p-4 border-b flex items-center justify-between gap-3 ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}>
            <div className="flex items-center gap-2 text-cyan-500 font-mono font-extrabold text-sm uppercase tracking-wider">
              <Search size={18} className="text-cyan-500" />
              <span>CARI NODE & INFRA</span>
            </div>

            <button 
              onClick={() => setSearchSubmenuOpen(false)}
              className={`p-1.5 rounded-xl transition-all ${
                isDark 
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Tutup Pencarian"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search Input Bar */}
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`} />
              <input 
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ketik nama XCC, POP, atau ODP..."
                className={`w-full font-mono text-xs pl-10 pr-9 py-2.5 rounded-2xl border transition-all focus:outline-none focus:ring-2 ${
                  isDark 
                    ? 'bg-slate-900/90 text-slate-100 placeholder-slate-500 border-slate-700 focus:ring-cyan-500/50' 
                    : 'bg-slate-100 text-slate-900 placeholder-slate-400 border-slate-300 focus:ring-cyan-500'
                }`}
                autoFocus
              />
              {query && (
                <button 
                  onClick={() => setQuery('')}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Tabs (ALL, XCC, POP, ODP) */}
            <div className={`grid grid-cols-4 gap-1.5 p-1 rounded-2xl border font-mono text-[11px] ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              {(['ALL', 'XCC', 'POP', 'ODP'] as const).map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-1.5 rounded-xl font-extrabold transition-all flex items-center justify-center gap-1 ${
                      isActive 
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md' 
                        : isDark
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
                    }`}
                  >
                    <span>{tab}</span>
                    <span className={`text-[9px] px-1 rounded-full ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {counts[tab]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Results List */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {filteredNodes.length > 0 ? (
              filteredNodes.map((node) => (
                <motion.div
                  key={node.id}
                  onClick={() => handleNodeClick(node)}
                  className={`p-3 border rounded-2xl cursor-pointer transition-all flex items-center justify-between group shadow-sm ${
                    isDark 
                      ? 'bg-slate-900/70 hover:bg-slate-800/90 border-slate-800/80 hover:border-cyan-500/50' 
                      : 'bg-slate-50 hover:bg-cyan-50/80 border-slate-200/90 hover:border-cyan-500/50'
                  }`}
                  whileHover={{ scale: 1.01, x: 2 }}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    {getNodeIcon(node.type)}
                    <div className="overflow-hidden font-mono">
                      <div className={`font-extrabold text-xs truncate transition-colors ${
                        isDark 
                          ? 'text-slate-100 group-hover:text-cyan-300' 
                          : 'text-slate-800 group-hover:text-cyan-600'
                      }`}>
                        {node.name}
                      </div>
                      <div className={`text-[10px] flex items-center gap-1 mt-0.5 ${
                        isDark ? 'text-slate-500' : 'text-slate-500'
                      }`}>
                        <MapPin size={10} className={isDark ? 'text-slate-500 shrink-0' : 'text-slate-400 shrink-0'} />
                        <span>{node.coordinates[1].toFixed(4)}, {node.coordinates[0].toFixed(4)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      node.type === 'XCC' 
                        ? (isDark ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300') :
                      node.type === 'POP' 
                        ? (isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-300') :
                      node.type === 'ODP' 
                        ? (isDark ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-cyan-100 text-cyan-700 border-cyan-300') :
                      (isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-200 text-slate-600 border-slate-300')
                    }`}>
                      {node.type || 'NODE'}
                    </span>
                    <ArrowUpRight size={14} className={`transition-colors ${
                      isDark ? 'text-slate-500 group-hover:text-cyan-400' : 'text-slate-400 group-hover:text-cyan-600'
                    }`} />
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-12 space-y-2 font-mono">
                <Search size={32} className={`mx-auto ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                <div className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Node Tidak Ditemukan</div>
                <div className={`text-[11px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Coba kata kunci atau filter lain</div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
