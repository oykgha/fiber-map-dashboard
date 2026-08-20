import { create } from 'zustand';

export interface MapFilters {
  pop: boolean;
  xcc: boolean;
  odp: boolean;
  hh: boolean;
  pole: boolean;
  kabel96: boolean;
  kabel48: boolean;
  kabel24: boolean;
  kabel12: boolean;
  kabelBelumSet: boolean;
}

export interface NodeData {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  status: 'normal' | 'warning' | 'critical';
  attenuation: number;
  segment: string;
  type?: 'ODC' | 'XCC' | 'POP' | 'ODP' | 'HH' | 'Tiang';
  technicianNotes?: string;
  statusHandling?: 'open' | 'in progress' | 'resolved';
  sourceFile?: string; // which .kmz/.kml file this node came from (default startup files or an import)
}

export interface PendingKmzRoute {
  name: string;
  lengthKm: number;
  geometry: GeoJSON.Geometry;
  feature: GeoJSON.Feature;
}

export interface PendingKmzImport {
  fileName: string;
  nodes: NodeData[];
  routes: PendingKmzRoute[];
}

export interface ActiveRouteView {
  sourceName: string;
  sourceCoords: [number, number];
  sourcePortLabel: string;
  destName: string;
  destCoords: [number, number];
  destPortLabel: string;
}

export interface MapPickerState {
  step: 'select_source' | 'select_dest' | 'select_tray_target';
  sourceXcc?: NodeData;
  targetTrayKey?: string;
  targetTrayName?: string;
}

export interface CustomPortConfig {
  status: 'active' | 'available' | 'broken' | 'reserved';
  serviceName: string;
  remarks: string;
  destNodeName: string;
  destPortId: number;
  attenuation: number;
  connectorType: string;
}

export interface SorFileRecord {
  id: string;
  name: string;
  size: string;
  uploadDate: string;
  wavelength?: string;
  fiberLengthKm?: number;
  totalLossDb?: number;
  orlDb?: number;
  eventsCount?: number;
}

export interface FiberSegmentData {
  id: string;
  name: string;
  lengthKm: number;
  customerTrunk: string;
  technicalData: string;
  coreCount?: number;
  attenuationRate?: number;
  nodeA?: string;
  nodeZ?: string;
  customDrawnGreenCoords?: [number, number][];
  sorFiles: SorFileRecord[];
}

export interface SegmentPointPickerState {
  segmentId: string;
  segmentName: string;
  targetPoint: 'nodeA' | 'nodeZ';
}

export interface RouteCandidateOption {
  id: string;
  name: string;
  distanceKm: number;
  coordinates: [number, number][];
  matchedSegmentName?: string;
}

export interface RouteBuilderState {
  isOpen: boolean;
  pointA: { label: string; coords: [number, number] | null };
  pointZ: { label: string; coords: [number, number] | null };
  pickingMode: 'none' | 'pointA' | 'pointZ';
  activeDirection: 'all' | 'left' | 'right';
  activeCableName: string | null;
  candidates: RouteCandidateOption[];
  selectedCandidateIndex: number;
}

export interface OtdrFaultSpot {
  segmentId: string;
  segmentName: string;
  eventName: string;
  eventType: 'macrobend' | 'splice' | 'connector' | 'break';
  distanceKm: number;
  lossDb: number;
  reflectanceDb?: number;
  coords: [number, number];
}

interface AppState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  activeOtdrFaultSpot: OtdrFaultSpot | null;
  setActiveOtdrFaultSpot: (spot: OtdrFaultSpot | null) => void;
  
  activeAlert: NodeData | null;
  setActiveAlert: (alert: NodeData | null) => void;

  // Camera-only fly-to, decoupled from activeAlert. activeAlert doubles as
  // "which node to show in AlertDrawer" AND (via FiberMap's effect)
  // "where the camera should fly" — those got wrongly conflated, so any
  // caller that just wants the camera to move (not the alert drawer to
  // open) needs its own field. See SearchSubmenu.tsx's handleNodeClick.
  flyToCoordinates: [number, number] | null;
  setFlyToCoordinates: (coords: [number, number] | null) => void;

  searchSubmenuOpen: boolean;
  setSearchSubmenuOpen: (open: boolean) => void;
  toggleSearchSubmenu: () => void;

  selectedPopNode: NodeData | null;
  setSelectedPopNode: (node: NodeData | null) => void;

  selectedOdpNode: NodeData | null;
  setSelectedOdpNode: (node: NodeData | null) => void;

  selectedSegment: FiberSegmentData | null;
  setSelectedSegment: (segment: FiberSegmentData | null) => void;
  updateSegmentData: (id: string, data: Partial<FiberSegmentData>) => void;
  addSorFileToSegment: (segmentId: string, file: SorFileRecord) => void;
  removeSorFileFromSegment: (segmentId: string, fileId: string) => void;

  // When a map click hits more than one overlapping route at the same pixel,
  // this holds every candidate so the modal can offer a "next route" cycle
  // button instead of silently picking whichever one MapLibre's hit-test
  // happened to return first.
  overlappingSegments: FiberSegmentData[];
  setOverlappingSegments: (segments: FiberSegmentData[]) => void;
  cycleOverlappingSegment: () => void;

  isDrawingGreenLine: boolean;
  drawnGreenLineCoords: [number, number][];
  activeDrawingSegmentId: string | null;
  startDrawingGreenLine: (segmentId?: string) => void;
  addGreenLinePoint: (coord: [number, number]) => void;
  undoGreenLinePoint: () => void;
  finishDrawingGreenLine: (customRouteCoords?: [number, number][], customDistanceKm?: number) => { id: string; name: string } | null;
  cancelDrawingGreenLine: () => void;

  segmentPointPickerState: SegmentPointPickerState | null;
  setSegmentPointPickerState: (picker: SegmentPointPickerState | null) => void;

  routeBuilder: RouteBuilderState;
  setRouteBuilder: (update: Partial<RouteBuilderState> | ((prev: RouteBuilderState) => Partial<RouteBuilderState>)) => void;
  openRouteBuilder: () => void;
  closeRouteBuilder: () => void;

  multiSelectMode: boolean;
  toggleMultiSelectMode: () => void;
  selectedSegments: FiberSegmentData[];
  toggleSelectSegment: (segment: FiberSegmentData) => void;
  clearSelectedSegments: () => void;

  segmentStoreMap: Record<string, FiberSegmentData>;
  getOrCreateSegmentData: (id: string, name: string, lengthKm: number) => FiberSegmentData;

  // Per-KMZ-file visibility & highlight, driven by the left sidebar's KMZ
  // Files panel. kmzFileVisibility only needs entries for files that are
  // hidden — a file not present in the map is treated as visible.
  kmzFileVisibility: Record<string, boolean>;
  toggleKmzFileVisibility: (fileName: string) => void;
  highlightedKmzFile: string | null;
  setHighlightedKmzFile: (fileName: string | null) => void;
  knownKmzFiles: string[];
  registerKmzFiles: (fileNames: string[]) => void;
  kmzFilesPanelOpen: boolean;
  setKmzFilesPanelOpen: (open: boolean) => void;
  toggleKmzFilesPanel: () => void;

  // KmzFilesPanel lives outside FiberMap.tsx and has no access to its local
  // geoData/nodes state, so deleting a file's nodes+routes from the map has
  // to happen there. This field is the request; FiberMap.tsx watches it,
  // performs the actual removal, then clears it back to null. Mirrors how
  // pendingKmzImport already bridges the opposite direction (import).
  deleteKmzFileRequest: string | null;
  requestDeleteKmzFile: (fileName: string | null) => void;
  // Called by FiberMap.tsx once it's actually removed the file's nodes and
  // geoData features, to clean up the file's own bookkeeping entries.
  finalizeKmzFileDeletion: (fileName: string) => void;


  nodes: NodeData[];
  setNodes: (nodes: NodeData[]) => void;

  // A freshly-selected KMZ file's parsed contents, held here until the user
  // finishes the "initial setup" step (assigning core capacity per route)
  // in KmzImportSetupModal — nothing gets merged into the live map/nodes
  // until that's confirmed.
  pendingKmzImport: PendingKmzImport | null;
  setPendingKmzImport: (pending: PendingKmzImport | null) => void;


  mapFilters: MapFilters;
  setMapFilters: (filters: Partial<MapFilters>) => void;
  toggleMapFilter: (key: keyof MapFilters) => void;
  resetMapFilters: () => void;

  theme: 'dark' | 'light';
  toggleTheme: () => void;
  
  selectedXcc: NodeData | null;
  setSelectedXcc: (xcc: NodeData | null) => void;

  activeRouteView: ActiveRouteView | null;
  setActiveRouteView: (route: ActiveRouteView | null) => void;
  
  mapPickerState: MapPickerState | null;
  setMapPickerState: (picker: MapPickerState | null) => void;

  customPortConfigs: Record<string, CustomPortConfig>;
  updatePortConfig: (key: string, config: Partial<CustomPortConfig>) => void;

  customTrayLabels: Record<string, string>;
  updateTrayLabel: (key: string, name: string) => void;

  customTrayTargets: Record<string, string>;
  updateTrayTarget: (trayKey: string, targetNodeName: string) => void;

  updateNodeName: (id: string, name: string) => void;
  
  kpiStats: { normal: number; warning: number; critical: number };
  calculateKpi: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  activeOtdrFaultSpot: null,
  setActiveOtdrFaultSpot: (spot) => set({ activeOtdrFaultSpot: spot }),
  
  activeAlert: null,
  setActiveAlert: (alert) => set({ activeAlert: alert }),

  flyToCoordinates: null,
  setFlyToCoordinates: (coords) => set({ flyToCoordinates: coords }),

  searchSubmenuOpen: false,
  setSearchSubmenuOpen: (open) => set({ searchSubmenuOpen: open }),
  toggleSearchSubmenu: () => set((state) => ({ searchSubmenuOpen: !state.searchSubmenuOpen })),

  selectedPopNode: null,
  setSelectedPopNode: (node) => set({ selectedPopNode: node }),

  selectedOdpNode: null,
  setSelectedOdpNode: (node) => set({ selectedOdpNode: node }),

  selectedSegment: null,
  // Selecting a segment through any path other than clicking overlapping
  // lines on the map (e.g. Route Builder, "return to modal" buttons) must
  // not leave a stale multi-cable overlappingSegments list behind — that
  // list is what drives the "Rute X / Y" cycle button, and a stale one
  // shows a wrong index and cycles into completely unrelated cables. Only
  // keep the existing overlap group if the new selection is actually a
  // member of it; otherwise collapse it to just this one segment.
  setSelectedSegment: (segment) => set((state) => {
    const staysInOverlapGroup = !!segment && state.overlappingSegments.some((s) => s.id === segment.id);
    return {
      selectedSegment: segment,
      overlappingSegments: staysInOverlapGroup ? state.overlappingSegments : (segment ? [segment] : state.overlappingSegments),
    };
  }),

  overlappingSegments: [],
  setOverlappingSegments: (segments) => set({ overlappingSegments: segments }),
  cycleOverlappingSegment: () => set((state) => {
    if (state.overlappingSegments.length < 2 || !state.selectedSegment) return {};
    const currentIndex = state.overlappingSegments.findIndex((s) => s.id === state.selectedSegment!.id);
    const nextIndex = (currentIndex + 1) % state.overlappingSegments.length;
    return { selectedSegment: state.overlappingSegments[nextIndex] };
  }),

  updateSegmentData: (id, data) => set((state) => {
    const target = state.selectedSegment?.id === id ? state.selectedSegment : state.segmentStoreMap[id];
    if (!target) return {};

    const updated = { ...target, ...data };

    // segmentStoreMap is indexed by both id and name (so a fresh KMZ click,
    // which only ever knows the raw name, can still find an existing
    // record). On rename, the OLD name-key must be dropped — otherwise it
    // sits there frozen with stale pre-rename data, and getOrCreateSegmentData
    // checks the name-key BEFORE the id-key, so re-clicking the same cable
    // after a rename would resurface the old name/data as if the rename
    // never happened, even though it saved correctly.
    const newMap = { ...state.segmentStoreMap };
    if (target.name !== updated.name) {
      delete newMap[target.name];
    }
    newMap[id] = updated;
    newMap[updated.name] = updated;

    return {
      selectedSegment: state.selectedSegment?.id === id ? updated : state.selectedSegment,
      segmentStoreMap: newMap
    };
  }),

  addSorFileToSegment: (segmentId, file) => set((state) => {
    const target = state.selectedSegment?.id === segmentId ? state.selectedSegment : state.segmentStoreMap[segmentId];
    if (!target) return {};

    const updated = {
      ...target,
      sorFiles: [file, ...target.sorFiles]
    };

    return {
      selectedSegment: state.selectedSegment?.id === segmentId ? updated : state.selectedSegment,
      segmentStoreMap: {
        ...state.segmentStoreMap,
        [segmentId]: updated,
        [updated.name]: updated
      }
    };
  }),

  removeSorFileFromSegment: (segmentId, fileId) => set((state) => {
    const target = state.selectedSegment?.id === segmentId ? state.selectedSegment : state.segmentStoreMap[segmentId];
    if (!target) return {};

    const updated = {
      ...target,
      sorFiles: target.sorFiles.filter(f => f.id !== fileId)
    };

    return {
      selectedSegment: state.selectedSegment?.id === segmentId ? updated : state.selectedSegment,
      segmentStoreMap: {
        ...state.segmentStoreMap,
        [segmentId]: updated,
        [updated.name]: updated
      }
    };
  }),

  isDrawingGreenLine: false,
  drawnGreenLineCoords: [],
  activeDrawingSegmentId: null,
  
  startDrawingGreenLine: (segmentId) => set({
    isDrawingGreenLine: true,
    drawnGreenLineCoords: [],
    activeDrawingSegmentId: segmentId || null,
    selectedSegment: null // Temporarily hide segment modal while drawing
  }),

  addGreenLinePoint: (coord) => set((state) => ({
    drawnGreenLineCoords: [...state.drawnGreenLineCoords, coord]
  })),

  undoGreenLinePoint: () => set((state) => ({
    drawnGreenLineCoords: state.drawnGreenLineCoords.slice(0, -1)
  })),

  finishDrawingGreenLine: (customRouteCoords, customDistanceKm) => {
    const state = get();
    const coords = (customRouteCoords && customRouteCoords.length >= 2) ? customRouteCoords : state.drawnGreenLineCoords;
    if (coords.length < 2) {
      set({ isDrawingGreenLine: false, drawnGreenLineCoords: [], activeDrawingSegmentId: null });
      return null;
    }

    // Calculate total distance if not provided
    let totalDist = customDistanceKm !== undefined ? customDistanceKm : 0;
    if (customDistanceKm === undefined) {
      for (let i = 0; i < coords.length - 1; i++) {
        const [lng1, lat1] = coords[i];
        const [lng2, lat2] = coords[i + 1];
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLng = (lng2 - lng1) * (Math.PI / 180);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*(Math.PI/180)) * Math.cos(lat2*(Math.PI/180)) * Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        totalDist += R * c;
      }
    }

    const distMeters = Math.round(totalDist * 1000);
    const segId = state.activeDrawingSegmentId || `seg-green-${Date.now()}`;
    // startDrawingGreenLine nulls out selectedSegment while drawing (to hide
    // the modal), so reading state.selectedSegment here would always be
    // null — pulling from segmentStoreMap instead preserves whatever
    // customerTrunk/technicalData (core capacity!) was already set on this
    // segment before the retrace, instead of silently wiping it back to
    // defaults on every "Gambar Rute" edit.
    const existingSeg = state.segmentStoreMap[segId];
    const segName = existingSeg?.name || `Jalur Kabel Real Maps (${distMeters.toLocaleString('id-ID')} m)`;

    const pointA = `Point A (${coords[0][1].toFixed(4)}, ${coords[0][0].toFixed(4)})`;
    const pointZ = `Point Z (${coords[coords.length - 1][1].toFixed(4)}, ${coords[coords.length - 1][0].toFixed(4)})`;

    const updatedSeg: FiberSegmentData = {
      id: segId,
      name: segName,
      lengthKm: parseFloat(totalDist.toFixed(2)),
      customerTrunk: existingSeg?.customerTrunk || 'Real Road Network Fiber Route',
      technicalData: existingSeg?.technicalData || 'Single-Mode G.652D, Real Maps Snapped',
      nodeA: pointA,
      nodeZ: pointZ,
      customDrawnGreenCoords: coords,
      sorFiles: existingSeg?.sorFiles || []
    };

    set((s) => ({
      isDrawingGreenLine: false,
      drawnGreenLineCoords: [],
      activeDrawingSegmentId: null,
      selectedSegment: updatedSeg,
      segmentStoreMap: {
        ...s.segmentStoreMap,
        [segId]: updatedSeg,
        [updatedSeg.name]: updatedSeg
      }
    }));

    return { id: segId, name: segName };
  },

  cancelDrawingGreenLine: () => set({
    isDrawingGreenLine: false,
    drawnGreenLineCoords: [],
    activeDrawingSegmentId: null
  }),

  segmentPointPickerState: null,
  setSegmentPointPickerState: (picker) => set({ segmentPointPickerState: picker }),

  routeBuilder: {
    isOpen: false,
    pointA: { label: '', coords: null },
    pointZ: { label: '', coords: null },
    pickingMode: 'none',
    activeDirection: 'all',
    activeCableName: null,
    candidates: [],
    selectedCandidateIndex: 0
  },
  setRouteBuilder: (update) => set((state) => ({
    routeBuilder: typeof update === 'function' ? { ...state.routeBuilder, ...update(state.routeBuilder) } : { ...state.routeBuilder, ...update }
  })),
  openRouteBuilder: () => set((state) => ({
    routeBuilder: { ...state.routeBuilder, isOpen: true }
  })),
  closeRouteBuilder: () => set({
    routeBuilder: {
      isOpen: false,
      pointA: { label: '', coords: null },
      pointZ: { label: '', coords: null },
      pickingMode: 'none',
      activeDirection: 'all',
      activeCableName: null,
      candidates: [],
      selectedCandidateIndex: 0
    }
  }),

  multiSelectMode: false,
  toggleMultiSelectMode: () => set((state) => ({ multiSelectMode: !state.multiSelectMode })),
  
  selectedSegments: [],
  toggleSelectSegment: (segment) => set((state) => {
    // Compare by id, not name — many raw KMZ cable lines share the same
    // generic placeholder name ("Untitled Path"), so name-based equality
    // here would toggle off (or double-count) an unrelated segment that
    // merely happens to share that name with the one just clicked.
    const exists = state.selectedSegments.some(s => s.id === segment.id);
    return {
      selectedSegments: exists
        ? state.selectedSegments.filter(s => s.id !== segment.id)
        : [...state.selectedSegments, segment]
    };
  }),
  clearSelectedSegments: () => set({ selectedSegments: [] }),

  segmentStoreMap: {},
  getOrCreateSegmentData: (id, name, lengthKm) => {
    const state = get();
    // id-only lookup — must NOT fall back to name. Many raw KMZ cable lines
    // share the same generic placeholder name ("Untitled Path"), and id is
    // a hash of this specific line's name + geometry (stableSegmentId), so
    // it's always resolvable without the name fallback for any line that's
    // gone through the normal click/import flow. A name-first (or
    // name-fallback) lookup here silently merges every distinct physical
    // cable sharing that name into one shared record the instant any one
    // of them is clicked — editing one's core capacity/technical data then
    // edits all of them, since they're literally the same object.
    const existing = state.segmentStoreMap[id];
    if (existing) return existing;

    const newSeg: FiberSegmentData = {
      id: id || `seg-${Date.now()}`,
      name,
      lengthKm,
      customerTrunk: '',
      technicalData: '',
      sorFiles: []
    };

    set((s) => ({
      segmentStoreMap: {
        ...s.segmentStoreMap,
        [name]: newSeg,
        [newSeg.id]: newSeg
      }
    }));

    return newSeg;
  },

  kmzFileVisibility: {},
  toggleKmzFileVisibility: (fileName) => set((state) => ({
    kmzFileVisibility: {
      ...state.kmzFileVisibility,
      [fileName]: state.kmzFileVisibility[fileName] === false ? true : false
    }
  })),
  highlightedKmzFile: null,
  setHighlightedKmzFile: (fileName) => set({ highlightedKmzFile: fileName }),
  knownKmzFiles: [],
  registerKmzFiles: (fileNames) => set((state) => ({
    knownKmzFiles: Array.from(new Set([...state.knownKmzFiles, ...fileNames]))
  })),
  kmzFilesPanelOpen: false,
  setKmzFilesPanelOpen: (open) => set({ kmzFilesPanelOpen: open }),
  toggleKmzFilesPanel: () => set((state) => ({ kmzFilesPanelOpen: !state.kmzFilesPanelOpen })),

  deleteKmzFileRequest: null,
  requestDeleteKmzFile: (fileName) => set({ deleteKmzFileRequest: fileName }),
  finalizeKmzFileDeletion: (fileName) => set((state) => {
    const { [fileName]: _removedVisibility, ...restVisibility } = state.kmzFileVisibility;
    return {
      knownKmzFiles: state.knownKmzFiles.filter((f) => f !== fileName),
      kmzFileVisibility: restVisibility,
      highlightedKmzFile: state.highlightedKmzFile === fileName ? null : state.highlightedKmzFile,
      deleteKmzFileRequest: null
    };
  }),

  theme: 'dark',
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  
  selectedXcc: null,
  setSelectedXcc: (xcc) => set({ selectedXcc: xcc }),

  activeRouteView: null,
  setActiveRouteView: (route) => set({ activeRouteView: route }),

  mapPickerState: null,
  setMapPickerState: (picker) => set({ mapPickerState: picker }),

  customPortConfigs: {},
  updatePortConfig: (key, config) => set((state) => ({
    customPortConfigs: {
      ...state.customPortConfigs,
      [key]: {
        ...(state.customPortConfigs[key] || {
          status: 'available',
          serviceName: 'Unassigned',
          remarks: '-',
          destNodeName: 'Target XCC',
          destPortId: 1,
          attenuation: -18.2,
          connectorType: 'SC/APC Duplex'
        }),
        ...config
      }
    }
  })),

  customTrayLabels: {},
  updateTrayLabel: (key, name) => set((state) => ({
    customTrayLabels: {
      ...state.customTrayLabels,
      [key]: name
    }
  })),

  customTrayTargets: {},
  updateTrayTarget: (trayKey, targetNodeName) => set((state) => ({
    customTrayTargets: {
      ...state.customTrayTargets,
      [trayKey]: targetNodeName
    }
  })),

  updateNodeName: (id, name) => set((state) => ({
    nodes: state.nodes.map(n => n.id === id ? { ...n, name } : n),
    selectedXcc: state.selectedXcc && state.selectedXcc.id === id ? { ...state.selectedXcc, name } : state.selectedXcc
  })),
  
  nodes: [],
  setNodes: (nodes) => {
    set({ nodes });
    get().calculateKpi();
  },

  pendingKmzImport: null,
  setPendingKmzImport: (pending) => set({ pendingKmzImport: pending }),

  mapFilters: {
    pop: true,
    xcc: true,
    odp: true,
    hh: true,
    pole: true,
    kabel96: true,
    kabel48: true,
    kabel24: true,
    kabel12: true,
    kabelBelumSet: true,
  },
  setMapFilters: (filters) => set((state) => ({ mapFilters: { ...state.mapFilters, ...filters } })),
  toggleMapFilter: (key) => set((state) => ({ mapFilters: { ...state.mapFilters, [key]: !state.mapFilters[key] } })),
  resetMapFilters: () => set({
    mapFilters: {
      pop: true,
      xcc: true,
      odp: true,
      hh: true,
      pole: true,
      kabel96: true,
      kabel48: true,
      kabel24: true,
      kabel12: true,
      kabelBelumSet: true,
    }
  }),
  
  kpiStats: { normal: 0, warning: 0, critical: 0 },
  calculateKpi: () => {
    const nodes = get().nodes;
    set({
      kpiStats: {
        normal: nodes.filter(n => n.status === 'normal').length,
        warning: nodes.filter(n => n.status === 'warning').length,
        critical: nodes.filter(n => n.status === 'critical').length,
      }
    });
  }
}));
