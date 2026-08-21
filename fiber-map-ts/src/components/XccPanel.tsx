import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore, type CustomPortConfig } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { X, Link2, MapPin, Radio, ArrowRight, ArrowDown, Sparkles, Cpu, Activity, FileText, Zap, Server, Sliders, Map as MapIcon, Edit3, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { renameNode, saveXccPort, saveXccTray, getXcc, type NodeStub } from '../utils/api';

type PortStatus = 'active' | 'available' | 'broken' | 'reserved';

interface Port {
  id: number;
  status: PortStatus;
  label: string;
  portInTray: number;
  trayNum: number;
  trayName: string;
  destNodeName: string;
  destPortId: number | null;
  destCoords: [number, number];
  serviceName: string;
  remarks: string;
  attenuation: number;
  wavelength: string;
  connectorType: string;
}

export const XccPanel: React.FC = () => {
  const {
    selectedXcc,
    setSelectedXcc,
    setActiveRouteView,
    nodes,
    customPortConfigs,
    updatePortConfig,
    updateNodeName,
    customTrayLabels,
    updateTrayLabel,
    customTrayTargets,
    updateTrayTarget,
    setMapPickerState
  } = useAppStore(useShallow((state) => ({
    selectedXcc: state.selectedXcc,
    setSelectedXcc: state.setSelectedXcc,
    setActiveRouteView: state.setActiveRouteView,
    nodes: state.nodes,
    customPortConfigs: state.customPortConfigs,
    updatePortConfig: state.updatePortConfig,
    updateNodeName: state.updateNodeName,
    customTrayLabels: state.customTrayLabels,
    updateTrayLabel: state.updateTrayLabel,
    customTrayTargets: state.customTrayTargets,
    updateTrayTarget: state.updateTrayTarget,
    setMapPickerState: state.setMapPickerState
  })));
  
  // ALL HOOKS DECLARED AT TOP LEVEL IN UNCONDITIONAL ORDER (REACT RULES COMPLIANCE)
  const [traysCount, setTraysCount] = useState<number>(8);
  const [isCustomInput, setIsCustomInput] = useState<boolean>(false);
  const [customInputVal, setCustomInputVal] = useState<string>('12');

  const [selectedSourcePortId, setSelectedSourcePortId] = useState<number | null>(1);
  const [selectedDestPortId, setSelectedDestPortId] = useState<number | null>(1);
  const [hoveredPortId, setHoveredPortId] = useState<number | null>(null);
  const [customDestNodeName, setCustomDestNodeName] = useState<string>('');

  const [isEditingXccName, setIsEditingXccName] = useState<boolean>(false);
  const [xccNameInput, setXccNameInput] = useState<string>('');

  const [editingTrayKey, setEditingTrayKey] = useState<string | null>(null);
  const [editingTrayVal, setEditingTrayVal] = useState<string>('');

  const [noTargetAlert, setNoTargetAlert] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<CustomPortConfig>({
    status: 'active',
    serviceName: '',
    remarks: '',
    destNodeName: '',
    destPortId: 1,
    attenuation: -18.2,
    connectorType: 'SC/APC Duplex'
  });

  const matrixContainerRef = useRef<HTMLDivElement>(null);
  const [svgLineCoords, setSvgLineCoords] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Helper to get formatted Port (01-12) & Tray numbers
  const getPortDisplayLabel = (portId: number, trayName?: string) => {
    const portNum = ((portId - 1) % 12) + 1;
    const trayNum = Math.floor((portId - 1) / 12) + 1;
    const padPort = portNum < 10 ? `0${portNum}` : `${portNum}`;
    const padTray = trayNum < 10 ? `0${trayNum}` : `${trayNum}`;
    return {
      portNum: padPort,
      trayNum: padTray,
      short: `Port #${padPort} (Tray ${padTray})`,
      full: `${trayName ? trayName : `Tray ${padTray}`} — Port #${padPort}`
    };
  };

  // Filter available XCC nodes from store
  const xccNodesList = useMemo(() => {
    return nodes.filter(n => n.type === 'XCC' || n.name.includes('XCC'));
  }, [nodes]);

  // Set default customDestNodeName to another XCC node in store when selectedXcc changes
  useEffect(() => {
    if (selectedXcc && nodes.length > 0) {
      const otherXcc = nodes.find(n => n.type === 'XCC' && n.id !== selectedXcc.id) || nodes.find(n => n.id !== selectedXcc.id);
      if (otherXcc) {
        setCustomDestNodeName(otherXcc.name);
      }
    }
  }, [selectedXcc, nodes]);

  // Hydrate port/tray/rename data from the backend whenever an XCC panel is
  // opened — same read-path fix already applied to segments. Until now,
  // every XCC save endpoint was write-only: the data landed safely in
  // Postgres but nothing ever loaded it back into the UI, so an edited port
  // or renamed tray only stayed visible for the rest of that browser
  // session and silently reverted to defaults on refresh/reselect.
  useEffect(() => {
    if (!selectedXcc) return;
    const xccId = selectedXcc.id;
    let cancelled = false;

    getXcc(xccId)
      .then((data) => {
        if (cancelled) return;

        if (data.name && data.name !== selectedXcc.name) {
          updateNodeName(xccId, data.name);
        }

        data.ports.forEach((p) => {
          const configKey = `${xccId}_${p.portGroup}_${p.portNumber}`;
          updatePortConfig(configKey, {
            status: p.status as CustomPortConfig['status'],
            serviceName: p.serviceName,
            remarks: p.remarks,
            destNodeName: p.destNodeName,
            destPortId: p.destPortNumber ?? 1,
            attenuation: p.attenuation ?? -18.2,
            connectorType: p.connectorType
          });
        });

        data.trays.forEach((t) => {
          const trayKey = `${xccId}_tray_${t.trayIndex}`;
          if (t.trayName) updateTrayLabel(trayKey, t.trayName);
          if (t.targetNodeName) updateTrayTarget(trayKey, t.targetNodeName);
        });
      })
      .catch((err) => console.error('Failed to load persisted XCC data:', err));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedXcc?.id]);

  // Lookup target node object from nodes in store for EXACT real map coordinates
  const resolvedTargetNode = useMemo(() => {
    if (!selectedXcc) return null;
    return nodes.find(n => n.name === customDestNodeName) || 
           nodes.find(n => n.type === 'XCC' && n.id !== selectedXcc.id) || 
           nodes[0];
  }, [nodes, customDestNodeName, selectedXcc]);

  const totalPortsCount = useMemo(() => traysCount * 12, [traysCount]);

  // Base Tray Names
  const baseTrayLabels = [
    'POP MKR (Tray 01)',
    'PURWAKARTA (Tray 02)',
    'TILEN XCC (Tray 03)',
    'OTB LAMDA KELARI (Tray 04)',
    'BB ROBUSH CIKAMPEK (Tray 05)',
    'BB ROBUSH CIKAMPEK (Tray 06)',
    'BB ROBUSH CKR (Tray 07)',
    'BB ROBUSH CKR (Tray 08)',
    'BACKBONE CORE JKT (Tray 09)',
    'METRO-E SENTRAL (Tray 10)',
    'SUBMARINE CABLE (Tray 11)',
    'INTER-POP EXPRESS (Tray 12)'
  ];

  // Dynamic Port Generator supporting tray-specific target overrides from map picker
  const generatePorts = (seed: number, baseCoords: [number, number], total: number, isKelompok1: boolean): Port[] => {
    const ports: Port[] = [];
    const sampleServices = [
      'JKTTBSIP01 - SBWML02',
      'JKTTBSIP02 - CGKETH08',
      'JKT-SOUTH-CORE-L3-01',
      'GPON-OLT-JATINEGARA-04',
      'BACKBONE-METRO-E-99',
      'TELKOM-TRANSIT-IX-05'
    ];

    for (let i = 1; i <= total; i++) {
      const xccId = selectedXcc ? selectedXcc.id : 'default';
      const configKey = `${xccId}_${isKelompok1 ? 'k1' : 'k2'}_${i}`;
      const userConfig = customPortConfigs[configKey];

      const r = Math.sin(seed * i) * 10000;
      const rand = r - Math.floor(r);
      
      let defaultStatus: PortStatus = 'available';
      if ([1, 8, 14, 27, 30, 32, 44, 49, 52, 53, 55, 58, 73, 78, 80, 81, 84, 85, 98, 105, 120, 140, 160, 200].includes(i)) {
        defaultStatus = 'active';
      } else if ([18, 92, 93, 110, 150].includes(i)) {
        defaultStatus = 'broken';
      } else if (rand > 0.65 || [3, 5, 6, 7, 11, 15, 22, 33, 41, 60].includes(i)) {
        defaultStatus = 'reserved';
      }

      const status = userConfig ? userConfig.status : defaultStatus;
      const trayIndex = Math.floor((i - 1) / 12);
      const portInTray = ((i - 1) % 12) + 1;
      const trayKey = `${xccId}_tray_${trayIndex}`;
      
      const defaultTrayName = baseTrayLabels[trayIndex % baseTrayLabels.length];
      const trayName = customTrayLabels[trayKey] || defaultTrayName;

      // RESOLVE EXACT TARGET NODE PICKED VIA MAPS FOR THIS TRAY
      const trayTargetName = customTrayTargets[trayKey];
      const trayTargetNode = trayTargetName ? nodes.find(n => n.name === trayTargetName) : null;
      const currentTargetNode = trayTargetNode || resolvedTargetNode;

      const targetCoords: [number, number] = currentTargetNode ? currentTargetNode.coordinates : [baseCoords[0] + 0.008, baseCoords[1] - 0.006];
      const targetNodeName = currentTargetNode ? currentTargetNode.name : (customDestNodeName || 'Target XCC');

      const portLabel = `#${portInTray < 10 ? '0' + portInTray : portInTray}`;

      let defaultService = 'Unassigned';
      let defaultRemarks = '-';
      let destPortId: number | null = null;

      if (status === 'active') {
        defaultService = sampleServices[i % sampleServices.length];
        defaultRemarks = i % 3 === 0 ? 'INTERKONEKSI NORMAL' : 'JUMPER NO LABEL';
        if (i === 85) {
          destPortId = 49;
        } else if (i === 49) {
          destPortId = 85;
        } else {
          destPortId = userConfig?.destPortId || i;
        }
      } else if (status === 'reserved') {
        defaultService = 'Unassigned (Tanpa Label)';
        defaultRemarks = 'RESERVED / CADANGAN TANPA LABEL';
        destPortId = userConfig?.destPortId || i;
      } else if (status === 'broken') {
        defaultService = 'KABEL PUTUS / NO LINK';
        defaultRemarks = 'FIBER CUT ALARM';
        destPortId = null;
      } else {
        defaultService = 'Unassigned (Port Kosong)';
        defaultRemarks = 'IDLE / STANDBY';
        destPortId = null;
      }

      ports.push({
        id: i,
        status,
        label: portLabel,
        portInTray,
        trayNum: trayIndex + 1,
        trayName,
        destNodeName: userConfig ? userConfig.destNodeName : targetNodeName,
        destPortId,
        destCoords: targetCoords,
        serviceName: userConfig ? userConfig.serviceName : defaultService,
        remarks: userConfig ? userConfig.remarks : defaultRemarks,
        attenuation: userConfig ? userConfig.attenuation : (status === 'broken' ? -38.5 : (status === 'active' ? -18.2 : -22.1)),
        wavelength: i % 2 === 0 ? '1310 nm' : '1550 nm',
        connectorType: userConfig ? userConfig.connectorType : 'SC/APC Duplex (Yellow Jumper)'
      });
    }
    return ports;
  };

  const baseCoords: [number, number] = selectedXcc ? selectedXcc.coordinates : [106.8456, -6.2088];
  const kelompok1 = useMemo(() => generatePorts(1.2, baseCoords, totalPortsCount, true), [baseCoords, totalPortsCount, selectedXcc, customPortConfigs, customDestNodeName, resolvedTargetNode, customTrayTargets, customTrayLabels, nodes]);
  const kelompok2 = useMemo(() => generatePorts(2.4, baseCoords, totalPortsCount, false), [baseCoords, totalPortsCount, selectedXcc, customPortConfigs, customDestNodeName, resolvedTargetNode, customTrayTargets, customTrayLabels, nodes]);

  const activePort = useMemo(() => {
    return kelompok1.find(p => p.id === (selectedSourcePortId || 1)) || kelompok1[0] || generatePorts(1.2, baseCoords, 12, true)[0];
  }, [kelompok1, selectedSourcePortId, baseCoords]);

  const targetPortInK2 = useMemo(() => {
    if (selectedDestPortId) {
      return kelompok2.find(p => p.id === selectedDestPortId) || kelompok2[0];
    }
    if (activePort.destPortId) {
      return kelompok2.find(p => p.id === activePort.destPortId) || kelompok2[0];
    }
    return kelompok2[0];
  }, [kelompok2, selectedDestPortId, activePort]);

  // Determine active tray's specific target node picked via maps
  const activeTrayIndex = Math.floor((activePort.id - 1) / 12);
  const activeTrayKey = selectedXcc ? `${selectedXcc.id}_tray_${activeTrayIndex}` : `default_tray_${activeTrayIndex}`;
  const activeTrayTargetName = customTrayTargets[activeTrayKey];
  
  const activeTrayTargetNode = useMemo(() => {
    if (activeTrayTargetName) {
      return nodes.find(n => n.name === activeTrayTargetName) || null;
    }
    return resolvedTargetNode;
  }, [activeTrayTargetName, nodes, resolvedTargetNode]);

  // Measure exact pixel coordinates of selected K1 port and K2 port with SCROLL OFFSETS
  useEffect(() => {
    if (!selectedXcc || !matrixContainerRef.current || selectedSourcePortId === null) {
      setSvgLineCoords(null);
      return;
    }

    const k1PortObj = kelompok1.find(p => p.id === selectedSourcePortId);
    if (!k1PortObj || (k1PortObj.status !== 'active' && k1PortObj.status !== 'reserved')) {
      setSvgLineCoords(null);
      return;
    }

    const targetPortId = selectedDestPortId || k1PortObj.destPortId || selectedSourcePortId;

    const calculateLine = () => {
      if (!matrixContainerRef.current) return;
      const containerRect = matrixContainerRef.current.getBoundingClientRect();
      const scrollTop = matrixContainerRef.current.scrollTop;
      const scrollLeft = matrixContainerRef.current.scrollLeft;
      
      const k1El = matrixContainerRef.current.querySelector(`[data-k1-port="${selectedSourcePortId}"]`);
      const k2El = matrixContainerRef.current.querySelector(`[data-k2-port="${targetPortId}"]`);

      if (k1El && k2El) {
        const k1Rect = k1El.getBoundingClientRect();
        const k2Rect = k2El.getBoundingClientRect();

        setSvgLineCoords({
          x1: k1Rect.left + k1Rect.width / 2 - containerRect.left + scrollLeft,
          y1: k1Rect.bottom - containerRect.top + scrollTop,
          x2: k2Rect.left + k2Rect.width / 2 - containerRect.left + scrollLeft,
          y2: k2Rect.top - containerRect.top + scrollTop
        });
      } else {
        setSvgLineCoords(null);
      }
    };

    calculateLine();
    const timer = setTimeout(calculateLine, 100);
    const container = matrixContainerRef.current;
    
    window.addEventListener('resize', calculateLine);
    if (container) {
      container.addEventListener('scroll', calculateLine);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateLine);
      if (container) {
        container.removeEventListener('scroll', calculateLine);
      }
    };
  }, [selectedSourcePortId, selectedDestPortId, traysCount, selectedXcc, customDestNodeName, kelompok1]);

  const handleOpenEditModal = () => {
    setEditForm({
      status: activePort.status,
      serviceName: activePort.serviceName,
      remarks: activePort.remarks,
      destNodeName: (activeTrayTargetNode ? activeTrayTargetNode.name : customDestNodeName) || activePort.destNodeName,
      destPortId: targetPortInK2.id,
      attenuation: activePort.attenuation,
      connectorType: activePort.connectorType
    });
    setIsEditModalOpen(true);
  };

  const nodeStub = (node: { name: string; coordinates: [number, number]; status: string; type?: string; sourceFile?: string }): NodeStub => ({
    name: node.name,
    nodeType: node.type,
    longitude: node.coordinates[0],
    latitude: node.coordinates[1],
    status: node.status,
    sourceFile: node.sourceFile
  });

  const handleSaveEditModal = () => {
    if (!selectedXcc) return;
    const xccId = selectedXcc.id;
    const destPortToSave = selectedDestPortId || activePort.destPortId || 1;

    const configKey = `${xccId}_k1_${activePort.id}`;
    updatePortConfig(configKey, {
      ...editForm,
      destPortId: destPortToSave
    });

    const k2ConfigKey = `${xccId}_k2_${destPortToSave}`;
    updatePortConfig(k2ConfigKey, {
      status: editForm.status,
      serviceName: editForm.serviceName,
      remarks: editForm.remarks,
      destNodeName: selectedXcc.name,
      destPortId: activePort.id,
      attenuation: editForm.attenuation,
      connectorType: editForm.connectorType
    });

    if (editForm.destNodeName) {
      setCustomDestNodeName(editForm.destNodeName);
    }

    const stub = nodeStub(selectedXcc);
    Promise.all([
      saveXccPort(xccId, 'k1', activePort.id, {
        node: stub,
        status: editForm.status,
        serviceName: editForm.serviceName,
        remarks: editForm.remarks,
        destNodeName: editForm.destNodeName,
        destPortId: destPortToSave,
        attenuation: editForm.attenuation,
        connectorType: editForm.connectorType
      }),
      saveXccPort(xccId, 'k2', destPortToSave, {
        node: stub,
        status: editForm.status,
        serviceName: editForm.serviceName,
        remarks: editForm.remarks,
        destNodeName: selectedXcc.name,
        destPortId: activePort.id,
        attenuation: editForm.attenuation,
        connectorType: editForm.connectorType
      })
    ]).catch((err) => {
      console.error('Failed to save XCC port config to backend:', err);
      setNoTargetAlert('⚠️ TERSIMPAN LOKAL, TAPI GAGAL SYNC KE SERVER — CEK KONEKSI BACKEND');
      setTimeout(() => setNoTargetAlert(null), 4000);
    });

    setIsEditModalOpen(false);
  };

  const getTooltipPosClass = (index: number) => {
    const col = index % 12;
    let vertical = 'bottom-full mb-3';
    
    let horizontal = 'left-1/2 -translate-x-1/2';
    if (col <= 1) {
      horizontal = 'left-0 translate-x-0';
    } else if (col >= 10) {
      horizontal = 'right-0 translate-x-0 left-auto';
    }
    
    return `${vertical} ${horizontal}`;
  };

  const getPortCapsuleStyle = (port: Port, isSource: boolean, isTarget: boolean) => {
    let base = 'transition-all duration-200 flex flex-col items-center justify-between font-mono rounded-full w-10 sm:w-11 h-18 sm:h-20 pt-2.5 pb-2.5 border cursor-pointer select-none relative shadow-lg ';
    
    if (isSource) {
      return base + 'ring-4 ring-blue-500 scale-110 z-30 border-blue-300 bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-[0_0_24px_rgba(37,99,235,0.9)]';
    }
    if (isTarget) {
      return base + 'ring-4 ring-emerald-500 scale-110 z-30 border-emerald-300 bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-[0_0_24px_rgba(16,185,129,0.9)]';
    }

    switch (port.status) {
      case 'active':
        return base + 'bg-gradient-to-b from-emerald-600 to-emerald-800 text-white border-emerald-400 hover:from-emerald-500 hover:to-emerald-700 hover:scale-105';
      case 'broken':
        return base + 'bg-gradient-to-b from-rose-700 to-rose-900 text-white border-rose-400 hover:from-rose-600 hover:to-rose-800 hover:scale-105';
      case 'reserved':
        return base + 'bg-gradient-to-b from-amber-600 to-amber-800 text-amber-100 border-amber-400 hover:from-amber-500 hover:to-amber-700 hover:scale-105';
      default:
        return base + 'bg-gradient-to-b from-slate-700 to-slate-900 text-slate-200 border-slate-600 hover:from-slate-600 hover:to-slate-800 hover:scale-105';
    }
  };

  const getLedDotColor = (status: PortStatus) => {
    switch (status) {
      case 'active': return 'bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,1)]';
      case 'broken': return 'bg-rose-300 shadow-[0_0_8px_rgba(251,113,133,1)]';
      case 'reserved': return 'bg-amber-300 shadow-[0_0_8px_rgba(245,158,11,1)]';
      default: return 'bg-slate-400';
    }
  };

  const renderPortGrid = (portsList: Port[], isKelompok1: boolean) => {
    const rows: { trayName: string; trayIndex: number; ports: Port[] }[] = [];
    for (let r = 0; r < traysCount; r++) {
      const slice = portsList.slice(r * 12, (r + 1) * 12);
      if (slice.length > 0) {
        rows.push({
          trayIndex: r,
          trayName: slice[0]?.trayName || `Tray ${r + 1}`,
          ports: slice
        });
      }
    }

    const currentTargetPortId = selectedDestPortId || activePort.destPortId || selectedSourcePortId;

    return (
      <div className="space-y-4">
        {rows.map((row) => {
          const trayKey = selectedXcc ? `${selectedXcc.id}_tray_${row.trayIndex}` : `default_tray_${row.trayIndex}`;
          const currentTrayName = customTrayLabels[trayKey] || row.trayName;
          const currentTrayTarget = customTrayTargets[trayKey] || (resolvedTargetNode ? resolvedTargetNode.name : customDestNodeName);

          return (
            <div key={row.trayIndex} className="flex flex-col xl:flex-row items-stretch gap-3 bg-slate-100/50 dark:bg-slate-800/30 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/80">
              
              {/* INTERACTIVE TRAY TAG BOX (EDIT NAMA + PILIH VIA MAPS) */}
              <div className="w-full xl:w-80 flex flex-col justify-between gap-2 bg-slate-200/80 dark:bg-slate-800 p-3 rounded-2xl border border-slate-300 dark:border-slate-700 shrink-0 shadow-sm">
                
                {/* Tray Title & Inline Edit Button */}
                <div className="flex items-center justify-between gap-2">
                  {!editingTrayKey || editingTrayKey !== trayKey ? (
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                      <Server size={16} className="text-blue-500 shrink-0" />
                      <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 tracking-wide truncate">
                        {currentTrayName}
                      </span>
                      <button 
                        onClick={() => {
                          setEditingTrayKey(trayKey);
                          setEditingTrayVal(currentTrayName);
                        }}
                        className="p-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg transition-all border border-amber-500/30 shrink-0"
                        title="Edit Nama Tray ini"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 w-full">
                      <input 
                        type="text" 
                        value={editingTrayVal}
                        onChange={(e) => setEditingTrayVal(e.target.value)}
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-extrabold text-xs px-2.5 py-1 rounded-lg border-2 border-blue-500 focus:outline-none flex-1 min-w-0"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (editingTrayVal.trim()) {
                            updateTrayLabel(trayKey, editingTrayVal.trim());
                            if (selectedXcc) {
                              saveXccTray(selectedXcc.id, row.trayIndex, {
                                node: nodeStub(selectedXcc),
                                trayName: editingTrayVal.trim()
                              }).catch((err) => console.error('Failed to save tray name to backend:', err));
                            }
                          }
                          setEditingTrayKey(null);
                        }}
                        className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shrink-0"
                        title="Simpan Nama Tray"
                      >
                        <Save size={13} />
                      </button>
                      <button 
                        onClick={() => setEditingTrayKey(null)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 text-xs shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Target Node Info & Select via Maps Button */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-300 dark:border-slate-700/80">
                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate max-w-[170px]">
                    <span className="text-slate-400">Target: </span>
                    <strong className="text-emerald-500 font-bold">{currentTrayTarget || 'Belum Dihubungkan'}</strong>
                  </div>

                  <button 
                    onClick={() => {
                      setMapPickerState({
                        step: 'select_tray_target',
                        sourceXcc: selectedXcc || undefined,
                        targetTrayKey: trayKey,
                        targetTrayName: currentTrayName
                      });
                      setSelectedXcc(null);
                    }}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-mono font-extrabold flex items-center gap-1 shadow-md hover:scale-105 transition-all border border-blue-400/50 shrink-0"
                    title="Buka peta untuk memilih Node XCC Target arah Tray ini"
                  >
                    <MapIcon size={12} />
                    <span>PILIH VIA MAPS</span>
                  </button>
                </div>

              </div>

              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 flex-1 items-center">
                {row.ports.map((port, portIdxInRow) => {
                  const globalIndex = row.trayIndex * 12 + portIdxInRow;
                  const isSource = isKelompok1 && port.id === selectedSourcePortId;
                  const isTarget = !isKelompok1 && port.id === currentTargetPortId;
                  const isHovered = hoveredPortId === (isKelompok1 ? port.id : port.id + 1000);

                  return (
                    <div 
                      key={port.id}
                      data-k1-port={isKelompok1 ? port.id : undefined}
                      data-k2-port={!isKelompok1 ? port.id : undefined}
                      className="relative flex justify-center"
                      onMouseEnter={() => setHoveredPortId(isKelompok1 ? port.id : port.id + 1000)}
                      onMouseLeave={() => setHoveredPortId(null)}
                      onClick={() => {
                        if (isKelompok1) {
                          setSelectedSourcePortId(port.id);
                          if (port.status === 'active' || port.status === 'reserved') {
                            setSelectedDestPortId(port.destPortId || port.id);
                          } else {
                            setSelectedDestPortId(null);
                          }
                        } else {
                          setSelectedDestPortId(port.id);
                        }
                      }}
                    >
                      <button className={getPortCapsuleStyle(port, isSource, isTarget)}>
                        <span className={`w-2.5 h-2.5 rounded-full ${getLedDotColor(port.status)}`} />
                        <span className="text-sm sm:text-base font-extrabold tracking-tight font-mono drop-shadow-md">
                          {port.label}
                        </span>
                      </button>

                      {isHovered && (
                        <div className={`absolute ${getTooltipPosClass(globalIndex)} w-64 bg-slate-950/95 text-white border-2 border-cyan-400/90 rounded-2xl p-4 shadow-[0_0_35px_rgba(0,229,255,0.6)] z-[500] pointer-events-none text-xs backdrop-blur-2xl`}>
                          <div className="font-extrabold text-cyan-400 border-b border-slate-800 pb-2 mb-2 flex justify-between items-center text-sm tracking-wide">
                            <span className="flex items-center gap-1.5">
                              <Cpu size={15} className="text-cyan-400" />
                              PORT {port.label} (Tray {port.trayNum < 10 ? '0' + port.trayNum : port.trayNum})
                            </span>
                          </div>

                          <div className="space-y-2 font-mono text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 flex items-center gap-1">
                                <Activity size={13} className="text-slate-500" /> Status:
                              </span>
                              <span className={`font-bold capitalize px-2 py-0.5 rounded text-[11px] ${
                                port.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                port.status === 'broken' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                port.status === 'reserved' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                'bg-slate-800 text-slate-300'
                              }`}>
                                {port.status}
                              </span>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                                <Link2 size={13} className="text-slate-500" /> Service:
                              </span>
                              <div className="font-bold text-cyan-300 break-all pl-4 text-[11px]">
                                {port.serviceName}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1">
                                <FileText size={13} className="text-slate-500" /> Remarks:
                              </span>
                              <span className="text-slate-200 font-bold">{port.remarks}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const activePortLabel = getPortDisplayLabel(activePort.id, activePort.trayName);
  const targetPortLabel = getPortDisplayLabel(targetPortInK2.id, targetPortInK2.trayName);

  return (
    <>
      <AnimatePresence>
        {selectedXcc && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/40 dark:bg-slate-950/60 backdrop-blur-xl overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedXcc(null);
            }}
          >
            <motion.div 
              className="w-full max-w-7xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[94vh] backdrop-blur-2xl"
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
            >

              {/* Modal Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 shrink-0 gap-4">
                
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-500 shadow-inner">
                    <Radio size={22} />
                  </div>
                  <div>
                    {!isEditingXccName ? (
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-slate-900 dark:text-slate-100 font-extrabold text-base sm:text-lg tracking-wide uppercase flex items-center gap-2">
                          CROSS CONNECT (XCC) RACK — <span className="text-blue-500">{selectedXcc.name}</span>
                        </h2>
                        <button 
                          onClick={() => {
                            setXccNameInput(selectedXcc.name);
                            setIsEditingXccName(true);
                          }}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-xl transition-all border border-amber-500/40 flex items-center gap-1.5 text-xs font-mono font-extrabold hover:scale-105 shadow-sm"
                          title="Klik untuk mengedit Nama XCC Node ini"
                        >
                          <Edit3 size={13} />
                          <span>EDIT NAMA XCC</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input 
                          type="text" 
                          value={xccNameInput}
                          onChange={(e) => setXccNameInput(e.target.value)}
                          placeholder="Ketik Nama XCC Baru..."
                          className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-extrabold text-xs sm:text-sm px-3 py-1 rounded-xl border-2 border-blue-500 focus:outline-none min-w-[240px] shadow"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            if (xccNameInput.trim()) {
                              const newName = xccNameInput.trim();
                              updateNodeName(selectedXcc.id, newName);
                              renameNode(selectedXcc.id, { ...nodeStub(selectedXcc), name: newName })
                                .catch((err) => console.error('Failed to save XCC rename to backend:', err));
                            }
                            setIsEditingXccName(false);
                          }}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold px-3 py-1 rounded-xl shadow flex items-center gap-1"
                        >
                          <Save size={13} />
                          <span>SIMPAN</span>
                        </button>
                        <button 
                          onClick={() => setIsEditingXccName(false)}
                          className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-mono text-xs"
                        >
                          BATAL
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono font-medium mt-0.5">
                      KOORDINAT: {selectedXcc.coordinates[1].toFixed(5)}, {selectedXcc.coordinates[0].toFixed(5)} | SEGMENT: {selectedXcc.segment}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-200/80 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-inner">
                    <Sliders size={16} className="text-blue-500 ml-2" />
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 hidden sm:inline">KAPASITAS:</span>
                    
                    {!isCustomInput ? (
                      <select 
                        value={traysCount} 
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setIsCustomInput(true);
                          } else {
                            setTraysCount(Number(val));
                          }
                        }}
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono font-bold text-xs px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={1}>12 Ports (1 Baris)</option>
                        <option value={2}>24 Ports (2 Baris)</option>
                        <option value={4}>48 Ports (4 Baris)</option>
                        <option value={8}>96 Ports (8 Baris)</option>
                        <option value={12}>144 Ports (12 Baris)</option>
                        <option value={16}>192 Ports (16 Baris)</option>
                        <option value={24}>288 Ports (24 Baris)</option>
                        <option value="custom">Custom Baris...</option>
                      </select>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="number" 
                          min={1} 
                          max={40} 
                          value={customInputVal}
                          onChange={(e) => setCustomInputVal(e.target.value)}
                          placeholder="Jumlah Baris"
                          className="w-16 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono font-bold text-xs px-2 py-1 rounded-xl border border-blue-500 text-center focus:outline-none"
                        />
                        <button 
                          onClick={() => {
                            const parsed = parseInt(customInputVal, 10);
                            if (parsed && parsed > 0) setTraysCount(parsed);
                            setIsCustomInput(false);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-bold px-2.5 py-1 rounded-xl transition-all"
                        >
                          SET
                        </button>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => setSelectedXcc(null)}
                    className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold"
                  >
                    <X size={20} className="text-rose-500" />
                    <span className="hidden sm:inline">CLOSE</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div ref={matrixContainerRef} className="p-6 overflow-y-auto space-y-6 flex-1 relative">

                {/* DYNAMIC SVG DASHED LASER CONNECTOR LINE OVERLAY (STEADY ELEGANT GLOW) */}
                {svgLineCoords && activePort && (activePort.status === 'active' || activePort.status === 'reserved') && (
                  <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
                    <defs>
                      <marker 
                        id="jumper-arrow-head" 
                        viewBox="0 0 10 10" 
                        refX="5" 
                        refY="5" 
                        markerWidth="6" 
                        markerHeight="6" 
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={activePort.status === 'active' ? '#3B82F6' : '#F59E0B'} />
                      </marker>
                    </defs>

                    {/* Start Node Circle Dot (●) at Bottom Center of Selected Port */}
                    <circle cx={svgLineCoords.x1} cy={svgLineCoords.y1} r="4.5" fill={activePort.status === 'active' ? '#60A5FA' : '#FBBF24'} stroke={activePort.status === 'active' ? '#2563EB' : '#D97706'} strokeWidth="1.5" />

                    {/* Thick Vibrant Dashed Vertical/Curved Jumper Line connecting Source Port to Target Port */}
                    <path 
                      d={`M ${svgLineCoords.x1} ${svgLineCoords.y1} C ${svgLineCoords.x1} ${svgLineCoords.y1 + 50}, ${svgLineCoords.x2} ${svgLineCoords.y2 - 50}, ${svgLineCoords.x2} ${svgLineCoords.y2 - 10}`} 
                      stroke={activePort.status === 'active' ? '#3B82F6' : '#F59E0B'} 
                      strokeWidth="3.5" 
                      strokeDasharray="9 6" 
                      fill="none" 
                      markerEnd="url(#jumper-arrow-head)"
                      className={`filter ${activePort.status === 'active' ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]'}`}
                    />
                  </svg>
                )}

                {/* 1. UNIFORM COLOR LEGEND BAR */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-2xl px-4 py-3 flex items-center gap-3 border border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/40">
                    <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] shrink-0" />
                    <div className="text-xs">
                      <div className="font-extrabold text-slate-900 dark:text-slate-100">Active Link</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Terhubung & Normal</div>
                    </div>
                  </div>

                  <div className="rounded-2xl px-4 py-3 flex items-center gap-3 border border-slate-400/40 bg-slate-200/60 dark:bg-slate-800/60">
                    <div className="w-4 h-4 rounded-full bg-slate-500 shrink-0" />
                    <div className="text-xs">
                      <div className="font-extrabold text-slate-900 dark:text-slate-100">Idle / Standby</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Port Kosong (Tanpa Line)</div>
                    </div>
                  </div>

                  <div className="rounded-2xl px-4 py-3 flex items-center gap-3 border border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/40">
                    <div className="w-4 h-4 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)] shrink-0" />
                    <div className="text-xs">
                      <div className="font-extrabold text-slate-900 dark:text-slate-100">Broken / Putus</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Putus / Alarm (Tanpa Line)</div>
                    </div>
                  </div>

                  <div className="rounded-2xl px-4 py-3 flex items-center gap-3 border border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/40">
                    <div className="w-4 h-4 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)] shrink-0" />
                    <div className="text-xs">
                      <div className="font-extrabold text-slate-900 dark:text-slate-100">Unknown / Reserved</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Cadangan (Tanpa Label)</div>
                    </div>
                  </div>
                </div>

                {/* 2. MAIN CONNECTION SUMMARY CARD */}
                <div className="rounded-2xl p-6 border border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20 space-y-4 shadow-md">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="text-blue-500" size={20} />
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        INFORMASI SAMBUNGAN: PORT #{activePortLabel.portNum} (Tray {activePortLabel.trayNum}) {activePort.destPortId ? `➔ PORT #${targetPortLabel.portNum} (Tray ${targetPortLabel.trayNum})` : '(NO LINK)'}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3">
                      <button 
                        onClick={handleOpenEditModal}
                        className="bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs font-extrabold px-4 py-2 rounded-xl shadow-lg transition-all flex items-center gap-2 border border-amber-400/50 hover:scale-105"
                      >
                        <Edit3 size={16} />
                        <span>EDIT DATA PORT</span>
                      </button>

                      <span className={`text-xs px-3.5 py-1 rounded-full font-mono font-bold border shadow-sm ${
                        activePort.status === 'active' ? 'bg-emerald-500 text-white border-emerald-600' :
                        activePort.status === 'broken' ? 'bg-rose-500 text-white border-rose-600' :
                        activePort.status === 'reserved' ? 'bg-amber-500 text-white border-amber-600' :
                        'bg-slate-500 text-white border-slate-600'
                      }`}>
                        {activePort.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    
                    {/* SOURCE BOX */}
                    <div className="p-4 rounded-xl border border-blue-500/40 bg-white dark:bg-slate-900 space-y-2 shadow-md relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg font-mono">
                        ASAL (SOURCE)
                      </div>
                      <div className="text-xs font-bold text-blue-500 tracking-wider uppercase">PORT #{activePortLabel.portNum} — {activePort.trayName}</div>
                      <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">
                        {selectedXcc.name}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 font-mono space-y-1">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={14} className="text-blue-500 shrink-0" />
                          <span>Lat: {selectedXcc.coordinates[1].toFixed(5)}, Lng: {selectedXcc.coordinates[0].toFixed(5)}</span>
                        </div>
                      </div>
                    </div>

                    {/* DOTTED CONNECTION INDICATOR */}
                    <div className="flex flex-col items-center justify-center p-3 space-y-2.5">
                      <div className="flex items-center gap-2 text-blue-500 font-mono text-xs font-bold">
                        <Sparkles size={16} />
                        <span>{activePort.status === 'active' || activePort.status === 'reserved' ? 'SAMBUNGAN TERHUBUNG' : 'TIDAK ADA SAMBUNGAN'}</span>
                      </div>

                      {activePort.status === 'active' || activePort.status === 'reserved' ? (
                        <div className="w-full flex items-center justify-center gap-1 py-1">
                          <div className="h-0.5 flex-1 border-b-2 border-dashed border-blue-500/80" />
                          <div className="p-1.5 rounded-full bg-blue-600 text-white shadow-md">
                            <ArrowRight size={16} className="hidden md:block" />
                            <ArrowDown size={16} className="md:hidden" />
                          </div>
                          <div className="h-0.5 flex-1 border-b-2 border-dashed border-blue-500/80" />
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-slate-400 py-2">
                          [ PORT UNLINKED / NO CABLE ]
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap justify-center">
                        <button 
                          onClick={() => {
                            if (!activeTrayTargetNode) {
                              setNoTargetAlert(`Port #${activePortLabel.portNum} (${activePort.trayName}) belum memiliki Target Node XCC terhubung. Silakan klik tombol 'PILIH VIA MAPS' pada Tray ${activePort.trayName}.`);
                              return;
                            }

                            if (activePort.status === 'available' || activePort.status === 'broken' || !activePort.destPortId) {
                              setNoTargetAlert(`Port #${activePortLabel.portNum} (${activePort.trayName}) berstatus ${activePort.status.toUpperCase()} (Belum Terhubung). Tidak ada sirkuit aktif yang mengarah ke peta.`);
                              return;
                            }

                            // 100% EXPLICIT ROUTE TO THE EXACT TRAY-SELECTED TARGET NODE
                            setActiveRouteView({
                              sourceName: selectedXcc.name,
                              sourceCoords: selectedXcc.coordinates,
                              sourcePortLabel: `#${activePortLabel.portNum} (${activePort.trayName.split(' ')[0]})`,
                              destName: activeTrayTargetNode.name,
                              destCoords: activeTrayTargetNode.coordinates,
                              destPortLabel: `#${targetPortLabel.portNum} (${targetPortInK2.trayName.split(' ')[0]})`
                            });
                            setSelectedXcc(null);
                          }}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold px-4 py-2 rounded-xl shadow-md hover:scale-105 transition-all flex items-center gap-1.5 border border-blue-400/50"
                        >
                          <MapIcon size={15} />
                          <span>LIHAT DI PETA</span>
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono flex items-center gap-3 pt-0.5">
                        <span>Redaman: <strong className="text-slate-900 dark:text-slate-100">{activePort.attenuation} dBm</strong></span>
                        <span>•</span>
                        <span>Wave: <strong className="text-slate-900 dark:text-slate-100">{activePort.wavelength}</strong></span>
                      </div>
                    </div>

                    {/* DESTINATION BOX (STRICTLY USES TRAY TARGET NODE) */}
                    <div className="p-4 rounded-xl border border-emerald-500/40 bg-white dark:bg-slate-900 space-y-2 shadow-md relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg font-mono">
                        TUJUAN (TARGET)
                      </div>
                      <div className="text-xs font-bold text-emerald-500 tracking-wider uppercase">
                        {activePort.destPortId ? `PORT #${targetPortLabel.portNum} — ${targetPortInK2.trayName}` : 'NO TARGET PORT'}
                      </div>
                      
                      <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">
                        {activeTrayTargetNode ? activeTrayTargetNode.name : 'BELUM ADA TARGET (PILIH VIA MAPS)'}
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 font-mono space-y-1">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={14} className="text-emerald-500 shrink-0" />
                          <span>Lat: {(activeTrayTargetNode ? activeTrayTargetNode.coordinates[1] : selectedXcc.coordinates[1]).toFixed(5)}, Lng: {(activeTrayTargetNode ? activeTrayTargetNode.coordinates[0] : selectedXcc.coordinates[0]).toFixed(5)}</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                    <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans">Service Code:</span>
                      <strong className="text-blue-500 dark:text-cyan-400 font-bold">{activePort.serviceName}</strong>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans">Remarks:</span>
                      <strong className="text-slate-900 dark:text-slate-100 font-bold">{activePort.remarks}</strong>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-sans">Connector:</span>
                      <strong className="text-slate-900 dark:text-slate-100 font-bold">{activePort.connectorType}</strong>
                    </div>
                  </div>
                </div>

                {/* 3. SOURCE MATRIX RACK */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 shadow-sm relative z-10">
                  <div className="flex items-center justify-between px-6 py-3.5 bg-slate-100/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                      <h4 className="text-slate-900 dark:text-slate-100 font-extrabold tracking-wider text-sm uppercase flex items-center gap-2">
                        RACK OTB SOURCE <span className="text-slate-500 dark:text-slate-400 text-xs font-normal normal-case">({selectedXcc.name}) — PILIH PORT SOURCE</span>
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-300 dark:border-slate-700">
                      {totalPortsCount} PORTS ({traysCount} TRAYS)
                    </span>
                  </div>

                  <div className="p-6">
                    {renderPortGrid(kelompok1, true)}
                  </div>
                </div>

                {/* HIGH-TECH DOTTED LASER CONNECTOR DIVIDER */}
                <div className="relative py-4 flex flex-col items-center justify-center my-1 z-10">
                  <div className="w-full flex items-center justify-center gap-2 font-mono text-xs text-blue-500 font-bold">
                    <div className="h-0.5 flex-1 border-b-2 border-dashed border-blue-500/60" />
                    
                    <div className="px-6 py-2.5 rounded-2xl bg-slate-950 text-slate-100 border-2 border-cyan-500/70 flex items-center gap-3 shadow-[0_0_30px_rgba(0,229,255,0.4)] backdrop-blur-xl">
                      <span className="flex items-center gap-1.5 text-cyan-400 font-extrabold">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(0,229,255,1)]" />
                        SOURCE: PORT #{activePortLabel.portNum} (Tray {activePortLabel.trayNum})
                      </span>

                      <span className="flex items-center gap-1 text-yellow-400 font-mono font-extrabold tracking-wider">
                        {activePort.status === 'active' || activePort.status === 'reserved' 
                          ? `════ ░▒▓ (SAMBUNGAN PORT #${activePortLabel.portNum} ➔ PORT #${targetPortLabel.portNum}) ▓▒░ ════►` 
                          : '✖ ░▒▓ (PORT IDLE / UNLINKED) ▓▒░ ✖'}
                      </span>

                      <span className="flex items-center gap-1.5 text-emerald-400 font-extrabold">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)]" />
                        TARGET: {activePort.destPortId ? `PORT #${targetPortLabel.portNum} (Tray ${targetPortLabel.trayNum})` : 'NO LINK'}
                      </span>
                    </div>

                    <div className="h-0.5 flex-1 border-b-2 border-dashed border-blue-500/60" />
                  </div>
                </div>

                {/* 4. DESTINATION MATRIX RACK (STRICTLY USES TRAY TARGET NODE) */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 shadow-sm relative z-10">
                  <div className="flex items-center justify-between px-6 py-3.5 bg-slate-100/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                      <h4 className="text-slate-900 dark:text-slate-100 font-extrabold tracking-wider text-sm uppercase flex items-center gap-2">
                        RACK OTB DESTINATION <span className="text-slate-500 dark:text-slate-400 text-xs font-normal normal-case">({activeTrayTargetNode ? activeTrayTargetNode.name : 'BELUM ADA TARGET'}) — PILIH PORT DESTINATION</span>
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-300 dark:border-slate-700">
                      {totalPortsCount} PORTS ({traysCount} TRAYS)
                    </span>
                  </div>

                  <div className="p-6">
                    {renderPortGrid(kelompok2, false)}
                  </div>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EDIT PORT DATA MODAL */}
      <AnimatePresence>
        {isEditModalOpen && selectedXcc && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
            <motion.div 
              className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Edit3 size={18} className="text-amber-500" />
                  EDIT DATA PORT #{activePortLabel.portNum} (Tray {activePortLabel.trayNum})
                </h3>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/30 space-y-2">
                  <div className="text-[11px] font-bold text-blue-500 uppercase">1. PILIH PORT SOURCE ({selectedXcc.name}):</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500">Nomor Port Asal:</label>
                      <select 
                        value={selectedSourcePortId || 1} 
                        onChange={(e) => setSelectedSourcePortId(Number(e.target.value))}
                        className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2 rounded-xl border border-blue-500/40 font-bold text-[11px]"
                      >
                        {kelompok1.map(p => {
                          const lbl = getPortDisplayLabel(p.id, p.trayName);
                          return (
                            <option key={p.id} value={p.id}>{lbl.full}</option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500">Node Asal:</label>
                      <input 
                        type="text" 
                        disabled 
                        value={selectedXcc.name}
                        className="w-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 p-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 space-y-2">
                  <div className="text-[11px] font-bold text-emerald-500 uppercase">2. PILIH PORT DESTINATION ({editForm.destNodeName || 'XCC TUJUAN'}):</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500">Nomor Port Tujuan:</label>
                      <select 
                        value={selectedDestPortId || activePort.destPortId || 1} 
                        onChange={(e) => setSelectedDestPortId(Number(e.target.value))}
                        className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2 rounded-xl border border-emerald-500/40 font-bold text-[11px]"
                      >
                        {kelompok2.map(p => {
                          const lbl = getPortDisplayLabel(p.id, p.trayName);
                          return (
                            <option key={p.id} value={p.id}>{lbl.full}</option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500">Node Tujuan:</label>
                      <select 
                        value={editForm.destNodeName}
                        onChange={(e) => setEditForm({ ...editForm, destNodeName: e.target.value })}
                        className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2 rounded-xl border border-emerald-500/40 font-bold text-[11px]"
                      >
                        {xccNodesList.filter(n => n.id !== selectedXcc.id).map(n => (
                          <option key={n.id} value={n.name}>{n.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-sans font-bold">Status Port:</label>
                  <select 
                    value={editForm.status} 
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as PortStatus })}
                    className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold focus:outline-none"
                  >
                    <option value="active">Active (Terhubung & Normal)</option>
                    <option value="available">Idle / Standby (Port Kosong)</option>
                    <option value="broken">Broken / Putus (Alarm Putus)</option>
                    <option value="reserved">Reserved / Unknown (Cadangan)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-sans font-bold">Service Code / Sirkuit:</label>
                  <input 
                    type="text" 
                    value={editForm.serviceName} 
                    onChange={(e) => setEditForm({ ...editForm, serviceName: e.target.value })}
                    placeholder="e.g. JKTTBSIP01 - SBWML02"
                    className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1 font-sans font-bold">Remarks / Catatan:</label>
                  <input 
                    type="text" 
                    value={editForm.remarks} 
                    onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                    placeholder="e.g. JUMPER NO LABEL"
                    className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 mb-1 font-sans font-bold">Redaman (dBm):</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={editForm.attenuation} 
                      onChange={(e) => setEditForm({ ...editForm, attenuation: parseFloat(e.target.value) || -18.2 })}
                      className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 mb-1 font-sans font-bold">Konektor:</label>
                    <select 
                      value={editForm.connectorType} 
                      onChange={(e) => setEditForm({ ...editForm, connectorType: e.target.value })}
                      className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold focus:outline-none text-[11px]"
                    >
                      <option value="SC/APC Duplex (Yellow Jumper)">SC/APC Duplex</option>
                      <option value="LC/UPC Duplex (Blue Patchcord)">LC/UPC Duplex</option>
                      <option value="FC/PC Singlemode">FC/PC Singlemode</option>
                      <option value="ST Simplex">ST Simplex</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button 
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-mono text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    BATAL
                  </button>

                  <button 
                    onClick={handleSaveEditModal}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold px-5 py-2 rounded-xl shadow-lg flex items-center gap-1.5"
                  >
                    <Save size={16} />
                    <span>SIMPAN & HUBUNGKAN</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NO TARGET XCC ALERT MODAL */}
      <AnimatePresence>
        {noTargetAlert && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
            <motion.div 
              className="w-full max-w-md bg-white dark:bg-slate-900 border-2 border-rose-500/80 rounded-3xl p-6 shadow-2xl space-y-4 text-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/40">
                <Zap size={24} />
              </div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                TIDAK ADA XCC YANG DITUJU
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-mono leading-relaxed">
                {noTargetAlert}
              </p>
              <button 
                onClick={() => setNoTargetAlert(null)}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold py-2.5 rounded-xl shadow-md transition-all border border-rose-400/50"
              >
                MENGERTI & TUTUP
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
