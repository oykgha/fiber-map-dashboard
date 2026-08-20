import React, { useEffect, useRef, useState, useMemo, useCallback, lazy, Suspense } from 'react';
import Map, { Source, Layer, type MapRef, type LayerProps, Marker } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import { Upload, CheckCircle, Trash2 } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { parseKmzToGeoJson } from '../utils/kmzParser';
import { fetchRealRoadRoute, type RealRoadRouteResult } from '../utils/realRoadRouter';
import { stableSegmentId, stableNodeId } from '../utils/segmentId';
import { useAppStore, type NodeData, type RouteCandidateOption, type PendingKmzRoute } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { MapFilterLegendPanel } from './MapFilterLegendPanel';
import { NodeMarkerContent } from './NodeMarkerContent';
import { saveXccTray } from '../utils/api';

// Only-render-when-opened popups/modals — lazy-loaded to keep their JS out
// of the initial bundle (same reasoning as App.tsx's lazy modals).
const PopDetailsModal = lazy(() => import('./PopDetailsModal').then(m => ({ default: m.PopDetailsModal })));
const OdpDetailsModal = lazy(() => import('./OdpDetailsModal').then(m => ({ default: m.OdpDetailsModal })));
const KmzImportSetupModal = lazy(() => import('./KmzImportSetupModal').then(m => ({ default: m.KmzImportSetupModal })));

const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LIGHT_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// Chaikin's Polyline Corner-Cutting Algorithm to smooth KMZ fiber lines along roads
function smoothLineCoordinates(coords: [number, number][], iterations = 2): [number, number][] {
  if (!coords || coords.length <= 2) return coords;

  let current = coords;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: [number, number][] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];

      const q: [number, number] = [
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1]
      ];

      const r: [number, number] = [
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1]
      ];

      smoothed.push(q);
      smoothed.push(r);
    }
    smoothed.push(current[current.length - 1]);
    current = smoothed;
  }
  return current;
}

// Helper to slice sub-segment along cable geometry from Point A to Point Z
function sliceSubSegmentCoords(
  coords: [number, number][],
  pointA: [number, number],
  pointZ: [number, number]
): [number, number][] {
  if (!coords || coords.length < 2) return [pointA, pointZ];

  let minDistA = Infinity;
  let idxA = 0;
  let minDistZ = Infinity;
  let idxZ = coords.length - 1;

  coords.forEach(([lng, lat], idx) => {
    const dA = Math.hypot(lng - pointA[0], lat - pointA[1]);
    if (dA < minDistA) {
      minDistA = dA;
      idxA = idx;
    }

    const dZ = Math.hypot(lng - pointZ[0], lat - pointZ[1]);
    if (dZ < minDistZ) {
      minDistZ = dZ;
      idxZ = idx;
    }
  });

  const startIdx = Math.min(idxA, idxZ);
  const endIdx = Math.max(idxA, idxZ);

  let sliced = coords.slice(startIdx, endIdx + 1);
  if (idxA > idxZ) {
    sliced.reverse();
  }

  if (sliced.length === 0) return [pointA, pointZ];

  return [pointA, ...sliced, pointZ];
}

// Helper to trace multiple clicked waypoints along existing cyan cable features in geoData
function traceWaypointsAlongExistingLines(
  waypoints: [number, number][],
  geoData: GeoJSON.FeatureCollection | null
): [number, number][] {
  if (!waypoints || waypoints.length === 0) return [];
  if (waypoints.length === 1) return [waypoints[0]];
  if (!geoData) return waypoints;

  const lineFeatures = geoData.features.filter(
    f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
  );

  if (lineFeatures.length === 0) return waypoints;

  let fullRoute: [number, number][] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const pStart = waypoints[i];
    const pEnd = waypoints[i + 1];

    let bestSliced: [number, number][] = [pStart, pEnd];
    let minDistSum = Infinity;

    lineFeatures.forEach(f => {
      let coords: [number, number][] = [];
      if (f.geometry.type === 'LineString') {
        coords = (f.geometry as GeoJSON.LineString).coordinates as [number, number][];
      } else if (f.geometry.type === 'MultiLineString') {
        coords = (f.geometry as GeoJSON.MultiLineString).coordinates.flat(1) as [number, number][];
      }

      if (coords.length >= 2) {
        const smoothed = smoothLineCoordinates(coords, 2);
        
        let distStart = Infinity;
        let distEnd = Infinity;
        smoothed.forEach(([lng, lat]) => {
          const dS = Math.hypot(lng - pStart[0], lat - pStart[1]);
          const dE = Math.hypot(lng - pEnd[0], lat - pEnd[1]);
          if (dS < distStart) distStart = dS;
          if (dE < distEnd) distEnd = dE;
        });

        if (distStart < 0.03 && distEnd < 0.03) {
          const totalDist = distStart + distEnd;
          if (totalDist < minDistSum) {
            minDistSum = totalDist;
            bestSliced = sliceSubSegmentCoords(smoothed, pStart, pEnd);
          }
        }
      }
    });

    if (i === 0) {
      fullRoute = [...bestSliced];
    } else {
      fullRoute = [...fullRoute, ...bestSliced.slice(1)];
    }
  }

  return fullRoute;
}

// Dynamic Glowing Fiber Path Layer Style (Laser Rose Magenta = Selected, Core Capacity Color Coding)
const fiberLineGlow: LayerProps = {
  id: 'fiber-line-glow',
  type: 'line',
  paint: {
    'line-color': [
      'case',
      ['get', 'isSelected'], '#FF007F',
      ['match', ['get', 'coreCapacity'],
        'kabel96', '#818CF8',
        'kabel48', '#00E5FF',
        'kabel24', '#34D399',
        'kabel12', '#FBBF24',
        'kabelBelumSet', '#94A3B8',
        '#94A3B8'
      ]
    ],
    'line-width': ['case', ['get', 'isSelected'], 13, 7],
    'line-blur': ['case', ['get', 'isSelected'], 6, 4],
    'line-opacity': [
      'case',
      ['get', 'isSelected'], 0.95,
      ['get', 'isDimmedByHighlight'], 0.08,
      0.75
    ],
  },
};

const fiberLineNormal: LayerProps = {
  id: 'fiber-line-normal',
  type: 'line',
  paint: {
    'line-color': [
      'case',
      ['get', 'isSelected'], '#FF007F',
      ['match', ['get', 'coreCapacity'],
        'kabel96', '#6366F1',
        'kabel48', '#00E5FF',
        'kabel24', '#10B981',
        'kabel12', '#F59E0B',
        'kabelBelumSet', '#64748B',
        '#64748B'
      ]
    ],
    'line-width': [
      'case',
      ['get', 'isSelected'], 6.5,
      ['match', ['get', 'coreCapacity'],
        'kabel96', 5,
        'kabel48', 4,
        'kabel24', 3.2,
        'kabel12', 2.5,
        'kabelBelumSet', 2.8,
        2.8
      ]
    ],
    'line-opacity': [
      'case',
      ['get', 'isSelected'], 0.95,
      ['get', 'isDimmedByHighlight'], 0.1,
      0.95
    ],
  },
};

// Directional Arrow Symbols along Fiber Path
const fiberLineArrows: LayerProps = {
  id: 'fiber-line-arrows',
  type: 'symbol',
  layout: {
    'symbol-placement': 'line',
    'symbol-spacing': 70,
    'text-field': '▶',
    'text-size': 11,
    'text-keep-upright': false,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': [
      'case',
      ['get', 'isSelected'], '#FFE4E6',
      ['match', ['get', 'coreCapacity'],
        'kabel96', '#C7D2FE',
        'kabel48', '#E0F2FE',
        'kabel24', '#A7F3D0',
        'kabel12', '#FEF08A',
        '#00F0FF'
      ]
    ],
    'text-halo-color': '#020617',
    'text-halo-width': 1.5,
  },
};

export const FiberMap: React.FC = () => {
  const mapRef = useRef<MapRef>(null);
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hoveredLineInfo, setHoveredLineInfo] = useState<{ x: number; y: number; name: string } | null>(null);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);

  const {
    nodes,
    setNodes,
    mapFilters,
    activeAlert,
    setActiveAlert,
    flyToCoordinates,
    activeOtdrFaultSpot,
    setActiveOtdrFaultSpot,
    theme,
    setSelectedXcc,
    selectedPopNode,
    setSelectedPopNode,
    selectedOdpNode,
    setSelectedOdpNode,
    selectedSegment,
    setSelectedSegment,
    updateSegmentData,
    segmentPointPickerState,
    setSegmentPointPickerState,
    routeBuilder,
    setRouteBuilder,
    isDrawingGreenLine,
    drawnGreenLineCoords,
    addGreenLinePoint,
    undoGreenLinePoint,
    finishDrawingGreenLine,
    cancelDrawingGreenLine,
    multiSelectMode,
    selectedSegments,
    toggleSelectSegment,
    segmentStoreMap,
    getOrCreateSegmentData,
    setOverlappingSegments,
    setPendingKmzImport,
    kmzFileVisibility,
    highlightedKmzFile,
    registerKmzFiles,
    activeRouteView,
    mapPickerState,
    setMapPickerState,
    updateTrayTarget
  } = useAppStore(useShallow((state) => ({
    nodes: state.nodes,
    setNodes: state.setNodes,
    mapFilters: state.mapFilters,
    activeAlert: state.activeAlert,
    setActiveAlert: state.setActiveAlert,
    flyToCoordinates: state.flyToCoordinates,
    activeOtdrFaultSpot: state.activeOtdrFaultSpot,
    setActiveOtdrFaultSpot: state.setActiveOtdrFaultSpot,
    theme: state.theme,
    setSelectedXcc: state.setSelectedXcc,
    selectedPopNode: state.selectedPopNode,
    setSelectedPopNode: state.setSelectedPopNode,
    selectedOdpNode: state.selectedOdpNode,
    setSelectedOdpNode: state.setSelectedOdpNode,
    selectedSegment: state.selectedSegment,
    setSelectedSegment: state.setSelectedSegment,
    updateSegmentData: state.updateSegmentData,
    segmentPointPickerState: state.segmentPointPickerState,
    setSegmentPointPickerState: state.setSegmentPointPickerState,
    routeBuilder: state.routeBuilder,
    setRouteBuilder: state.setRouteBuilder,
    isDrawingGreenLine: state.isDrawingGreenLine,
    drawnGreenLineCoords: state.drawnGreenLineCoords,
    addGreenLinePoint: state.addGreenLinePoint,
    undoGreenLinePoint: state.undoGreenLinePoint,
    finishDrawingGreenLine: state.finishDrawingGreenLine,
    cancelDrawingGreenLine: state.cancelDrawingGreenLine,
    multiSelectMode: state.multiSelectMode,
    selectedSegments: state.selectedSegments,
    toggleSelectSegment: state.toggleSelectSegment,
    segmentStoreMap: state.segmentStoreMap,
    getOrCreateSegmentData: state.getOrCreateSegmentData,
    setOverlappingSegments: state.setOverlappingSegments,
    setPendingKmzImport: state.setPendingKmzImport,
    kmzFileVisibility: state.kmzFileVisibility,
    highlightedKmzFile: state.highlightedKmzFile,
    registerKmzFiles: state.registerKmzFiles,
    activeRouteView: state.activeRouteView,
    mapPickerState: state.mapPickerState,
    setMapPickerState: state.setMapPickerState,
    updateTrayTarget: state.updateTrayTarget
  })));

  // State for Real Road Network Route from OSRM (Google Maps Style Routing)
  const [realRoadDrawnRoute, setRealRoadDrawnRoute] = useState<RealRoadRouteResult | null>(null);
  const [isRoutingRoad, setIsRoutingRoad] = useState(false);

  // Auto-fetch Real Road Route along clicked waypoints via Free OSRM Public API
  useEffect(() => {
    if (!drawnGreenLineCoords || drawnGreenLineCoords.length < 2) {
      setRealRoadDrawnRoute(null);
      setIsRoutingRoad(false);
      return;
    }

    let isMounted = true;
    setIsRoutingRoad(true);

    fetchRealRoadRoute(drawnGreenLineCoords).then((res) => {
      if (isMounted) {
        setRealRoadDrawnRoute(res);
        setIsRoutingRoad(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [drawnGreenLineCoords]);

  // Real-time cumulative distance in meters (using Real Road Network if available, or high-precision haversine fallback)
  const drawnCableDistanceMeters = useMemo(() => {
    if (realRoadDrawnRoute && realRoadDrawnRoute.distanceMeters > 0) {
      return realRoadDrawnRoute.distanceMeters;
    }
    if (!drawnGreenLineCoords || drawnGreenLineCoords.length < 2) return 0;
    let totalDistKm = 0;
    for (let i = 0; i < drawnGreenLineCoords.length - 1; i++) {
      const [lng1, lat1] = drawnGreenLineCoords[i];
      const [lng2, lat2] = drawnGreenLineCoords[i + 1];
      const R = 6371;
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLng = (lng2 - lng1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
          Math.cos(lat2 * (Math.PI / 180)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistKm += R * c;
    }
    return Math.round(totalDistKm * 1000);
  }, [drawnGreenLineCoords, realRoadDrawnRoute]);

  // Helper to calculate line distance in kilometers
  const calculateLineDistanceKm = (geometry: GeoJSON.Geometry): number => {
    let points: [number, number][] = [];
    if (geometry.type === 'LineString') {
      points = (geometry as GeoJSON.LineString).coordinates as [number, number][];
    } else if (geometry.type === 'MultiLineString') {
      points = (geometry as GeoJSON.MultiLineString).coordinates.flat(1) as [number, number][];
    }
    
    if (!points || points.length < 2) return 16.79;
    
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [lng1, lat1] = points[i];
      const [lng2, lat2] = points[i + 1];
      
      const R = 6371;
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLng = (lng2 - lng1) * (Math.PI / 180);
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistance += R * c;
    }
    
    return totalDistance > 0 ? parseFloat(totalDistance.toFixed(2)) : 16.79;
  };
  
  // Load DWD.kmz, POP.kmz, XCC.kmz, ODP.kmz, and backbone.kmz on startup
  useEffect(() => {
    Promise.all([
      parseKmzToGeoJson('/DWD.kmz'),
      parseKmzToGeoJson('/POP.kmz'),
      parseKmzToGeoJson('/XCC.kmz'),
      parseKmzToGeoJson('/ODP.kmz'),
      parseKmzToGeoJson('/backbone.kmz')
    ]).then(([dwdData, popData, xccData, odpData, backboneData]) => {
      let allFeatures: GeoJSON.Feature[] = [];
      let extractedNodes: NodeData[] = [];

      // Combine LineStrings for Fiber Cable Routes from DWD & Backbone
      const tagSourceFile = (features: GeoJSON.Feature[], fileName: string): GeoJSON.Feature[] =>
        features.map(f => ({ ...f, properties: { ...f.properties, sourceFile: fileName } }));

      if (dwdData) allFeatures = [...allFeatures, ...tagSourceFile(dwdData.features, 'DWD.kmz')];
      if (backboneData) allFeatures = [...allFeatures, ...tagSourceFile(backboneData.features, 'backbone.kmz')];

      setGeoData({
        type: 'FeatureCollection',
        features: allFeatures
      });

      // 1. Process DWD.kmz (ODC nodes)
      if (dwdData) {
        const odcNodes: NodeData[] = dwdData.features
          .filter(f => f.geometry.type === 'Point' && !f.properties?.name?.toUpperCase().includes('XCC') && !f.properties?.name?.toUpperCase().includes('ODP'))
          .map((f, i) => {
            const coords = (f.geometry as GeoJSON.Point).coordinates;
            return {
              id: f.properties?.id || `odc-node-${i}`,
              name: f.properties?.name || `ODC-${i + 1}`,
              coordinates: [coords[0], coords[1]] as [number, number],
              status: i % 10 === 0 ? 'warning' : 'normal',
              attenuation: -15,
              segment: 'Segment Alpha',
              type: 'ODC',
              sourceFile: 'DWD.kmz'
            };
          });

        if (odcNodes.length === 0) {
          const lines = dwdData.features.filter(f => f.geometry.type === 'LineString');
          const mockOdc: NodeData[] = lines.map((f, i) => {
            const coords = (f.geometry as GeoJSON.LineString).coordinates[0];
            return {
              id: `odc-line-${i}`,
              name: f.properties?.name || `ODC-${i + 1}`,
              coordinates: [coords[0], coords[1]] as [number, number],
              status: 'normal',
              attenuation: -15,
              segment: f.properties?.name || `Segment ${i + 1}`,
              type: 'ODC',
              sourceFile: 'DWD.kmz'
            };
          });
          extractedNodes = [...extractedNodes, ...mockOdc];
        } else {
          extractedNodes = [...extractedNodes, ...odcNodes];
        }
      }

      // 2. Process XCC.kmz (EXACT REAL XCC NAMES & LAT/LNG FROM XCC.KMZ)
      if (xccData) {
        const xccFeatures = xccData.features.filter(f => f.geometry.type === 'Point' && f.properties?.name);
        xccFeatures.forEach((f, idx) => {
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          const cleanName = (f.properties?.name || `XCC-${idx + 1}`).replace(/<[^>]*>?/gm, '').trim();

          if (!extractedNodes.some(n => n.name === cleanName)) {
            extractedNodes.push({
              id: `xcc-real-${idx + 1}`,
              name: cleanName,
              coordinates: [coords[0], coords[1]] as [number, number],
              status: idx % 5 === 0 ? 'warning' : 'normal',
              attenuation: -18.2,
              segment: 'XCC Core Network',
              type: 'XCC',
              sourceFile: 'XCC.kmz'
            });
          }
        });
      }

      // 3. Process backbone.kmz (REAL XCC NODES & BACKBONE FIBER ROUTES)
      if (backboneData) {
        const backboneXccPoints = backboneData.features.filter(f => f.geometry.type === 'Point' && f.properties?.name?.toUpperCase().startsWith('XCC'));
        
        backboneXccPoints.forEach((f, idx) => {
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          const cleanName = (f.properties?.name || `XCC-BB-${idx + 1}`).replace(/<[^>]*>?/gm, '').trim();

          // Deduplicate by name
          if (!extractedNodes.some(n => n.name === cleanName)) {
            extractedNodes.push({
              id: `xcc-bb-${idx + 1}`,
              name: cleanName,
              coordinates: [coords[0], coords[1]] as [number, number],
              status: 'normal',
              attenuation: -18.2,
              segment: 'Backbone Core Network',
              type: 'XCC',
              sourceFile: 'backbone.kmz'
            });
          }
        });
      }

      // 4. Process POP.kmz (POP NODES & EXACT LAT/LNG FROM POP.KMZ)
      if (popData) {
        const popFeatures = popData.features.filter(f => {
          if (f.geometry.type !== 'Point') return false;
          const name = f.properties?.name || '';
          return name.trim().length > 0 && !name.toLowerCase().includes('untitled');
        });

        popFeatures.forEach((f, idx) => {
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          const name = f.properties?.name || `POP-${idx + 1}`;

          if (!extractedNodes.some(n => n.name === name)) {
            extractedNodes.push({
              id: `pop-node-${idx + 1}`,
              name,
              coordinates: [coords[0], coords[1]] as [number, number],
              status: idx % 9 === 0 ? 'warning' : 'normal',
              attenuation: -14.2,
              segment: 'POP Backbone Segment',
              type: 'POP',
              sourceFile: 'POP.kmz'
            });
          }
        });
      }

      // 5. Process ODP.kmz (REAL ODP NODES & EXACT LAT/LNG FROM ODP.KMZ)
      if (odpData) {
        const odpFeatures = odpData.features.filter(f => f.geometry.type === 'Point' && f.properties?.name);
        odpFeatures.forEach((f, idx) => {
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          const cleanName = (f.properties?.name || `ODP-${idx + 1}`).replace(/<[^>]*>?/gm, '').trim();

          if (!extractedNodes.some(n => n.name === cleanName)) {
            extractedNodes.push({
              id: `odp-node-${idx + 1}`,
              name: cleanName,
              coordinates: [coords[0], coords[1]] as [number, number],
              status: 'normal',
              attenuation: -16.5,
              segment: 'ODP Access Network',
              type: 'ODP',
              sourceFile: 'ODP.kmz'
            });
          }
        });
      }

      setNodes(extractedNodes);
      registerKmzFiles(['DWD.kmz', 'POP.kmz', 'XCC.kmz', 'ODP.kmz', 'backbone.kmz']);

      // Fit bounds to cover all nodes & lines
      if (extractedNodes.length > 0 && mapRef.current) {
        const map = mapRef.current.getMap();
        const bounds = new maplibregl.LngLatBounds(
          extractedNodes[0].coordinates,
          extractedNodes[0].coordinates
        );
        
        extractedNodes.forEach(n => bounds.extend(n.coordinates));
        map.fitBounds(bounds, { padding: 80, duration: 1200 });
      }
    });
  }, [setNodes]);

  // Dynamic KMZ / KML File Upload Handler — parses the file and stages it
  // for review in KmzImportSetupModal instead of merging it into the live
  // map immediately. Nothing gets added to nodes/geoData until the user
  // finishes assigning core capacity per route and confirms there.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = URL.createObjectURL(file);
      const data = await parseKmzToGeoJson(url);

      if (data) {
        const lineFeatures = data.features.filter(f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');
        const routes: PendingKmzRoute[] = lineFeatures.map((f, idx) => {
          const taggedFeature: GeoJSON.Feature = { ...f, properties: { ...f.properties, sourceFile: file.name } };
          return {
            name: f.properties?.name || `${file.name.replace(/\.[^/.]+$/, '')} Route #${idx + 1}`,
            lengthKm: calculateLineDistanceKm(f.geometry),
            geometry: f.geometry,
            feature: taggedFeature
          };
        });

        const uploadedFeatures = data.features.filter(f => f.geometry.type === 'Point');
        const fileNameUpper = file.name.toUpperCase();
        const isXccFile = fileNameUpper.includes('XCC') || fileNameUpper.includes('BACKBONE');
        const isPopFile = fileNameUpper.includes('POP');
        const isOdpFile = fileNameUpper.includes('ODP');

        const newNodes: NodeData[] = uploadedFeatures.map((f, idx) => {
          const coords = (f.geometry as GeoJSON.Point).coordinates;
          const rawName = f.properties?.name || `${file.name.replace(/\.[^/.]+$/, '')} #${idx + 1}`;

          let nodeType: 'XCC' | 'POP' | 'ODP' | 'ODC' = 'ODC';
          if (isXccFile || rawName.toUpperCase().includes('XCC')) nodeType = 'XCC';
          else if (isPopFile || rawName.toUpperCase().includes('POP') || rawName.toUpperCase().includes('OLT')) nodeType = 'POP';
          else if (isOdpFile || rawName.toUpperCase().includes('ODP')) nodeType = 'ODP';

          const nodeCoords: [number, number] = [coords[0], coords[1]];
          return {
            id: stableNodeId(rawName, nodeCoords, file.name),
            name: rawName,
            coordinates: nodeCoords,
            status: 'normal',
            attenuation: -15.0,
            segment: 'Imported KMZ Segment',
            type: nodeType,
            sourceFile: file.name
          };
        });

        if (routes.length === 0 && newNodes.length === 0) {
          setUploadSuccessMsg(`File '${file.name}' tidak berisi node atau jalur kabel yang bisa diimpor.`);
          setTimeout(() => setUploadSuccessMsg(null), 5000);
        } else {
          setPendingKmzImport({ fileName: file.name, nodes: newNodes, routes });
        }
      }
    } catch (err) {
      console.error('File upload error:', err);
      setUploadSuccessMsg(`Gagal membaca file '${file.name}' — pastikan ini file .kmz/.kml yang valid.`);
      setTimeout(() => setUploadSuccessMsg(null), 5000);
    } finally {
      setIsUploading(false);
      // Reset so selecting the exact same file again (e.g. after cancelling
      // the import setup modal) still fires a change event — browsers don't
      // dispatch one if the input's value hasn't changed from last time.
      inputEl.value = '';
    }
  };

  // Handle active alert fly-to
  useEffect(() => {
    if (activeAlert && mapRef.current) {
      mapRef.current.flyTo({
        center: activeAlert.coordinates,
        zoom: 16,
        duration: 1500,
        essential: true,
      });
    }
  }, [activeAlert]);

  // Camera-only fly-to (e.g. from search results) — deliberately does NOT
  // touch activeAlert, which also controls whether AlertDrawer is open.
  useEffect(() => {
    if (flyToCoordinates && mapRef.current) {
      mapRef.current.flyTo({
        center: flyToCoordinates,
        zoom: 16,
        duration: 1500,
        essential: true,
      });
    }
  }, [flyToCoordinates]);

  // Handle OTDR Bending / Fault Spot fly-to camera
  useEffect(() => {
    if (activeOtdrFaultSpot && mapRef.current) {
      mapRef.current.flyTo({
        center: activeOtdrFaultSpot.coords,
        zoom: 17,
        duration: 1600,
        essential: true,
      });
    }
  }, [activeOtdrFaultSpot]);

  // Handle active route view fly-to & fit bounds
  useEffect(() => {
    if (activeRouteView && mapRef.current) {
      const map = mapRef.current.getMap();
      const bounds = new maplibregl.LngLatBounds(
        activeRouteView.sourceCoords,
        activeRouteView.sourceCoords
      );
      bounds.extend(activeRouteView.destCoords);

      map.fitBounds(bounds, {
        padding: 140,
        duration: 1500,
        maxZoom: 16
      });
    }
  }, [activeRouteView]);

  // Use Memo for LineStrings with Chaikin Smoothing, Core Capacity Color & Map Filtering
  const linesGeoJson = useMemo(() => {
    if (!geoData) return null;
    const rawLineFeatures = geoData.features.filter(f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');

    const smoothedFeatures = rawLineFeatures.map((f, idx) => {
      const rawName = f.properties?.name || `SEGMENT CABLE ROUTE #${idx + 1}`;
      const segRecord = segmentStoreMap[rawName] || segmentStoreMap[f.properties?.id];
      const hasSor = !!(segRecord && segRecord.sorFiles && segRecord.sorFiles.length > 0);
      // Compare by the segment's real id (via segRecord), not rawName —
      // many raw KMZ cable lines share the same generic placeholder name
      // ("Untitled Path"), so comparing by name here would highlight every
      // line sharing that name as "selected", not just the one actually
      // clicked. If segRecord doesn't exist yet, this line has never been
      // clicked/registered, so it can't possibly be the selected one.
      const isSelected = !!segRecord && (
        (!!selectedSegment && selectedSegment.id === segRecord.id) ||
        selectedSegments.some(s => s.id === segRecord.id)
      );

      // Core capacity classification — a route only gets a real kabel* color
      // once someone actually assigns a core count (via the segment modal's
      // chips, or the KMZ import setup popup). Previously this fell back to
      // capacityKeys[idx % 4], which assigned an essentially random core
      // color based on array position — visually indistinguishable from a
      // route that genuinely had that core count set. Unset routes now get
      // their own distinct "kabelBelumSet" category instead of a fake one.
      let coreCapKey: 'kabel96' | 'kabel48' | 'kabel24' | 'kabel12' | 'kabelBelumSet' = 'kabelBelumSet';
      if (segRecord?.technicalData) {
        if (segRecord.technicalData.includes('96 Core')) coreCapKey = 'kabel96';
        else if (segRecord.technicalData.includes('48 Core')) coreCapKey = 'kabel48';
        else if (segRecord.technicalData.includes('24 Core')) coreCapKey = 'kabel24';
        else if (segRecord.technicalData.includes('12 Core')) coreCapKey = 'kabel12';
      }

      const isDimmedByHighlight = !!highlightedKmzFile && f.properties?.sourceFile !== highlightedKmzFile;

      const featureProps = {
        ...f.properties,
        hasSor,
        isSelected,
        coreCapacity: coreCapKey,
        isDimmedByHighlight
      };

      if (f.geometry.type === 'LineString') {
        const origCoords = (f.geometry as GeoJSON.LineString).coordinates as [number, number][];
        const smoothedCoords = smoothLineCoordinates(origCoords, 2);
        return {
          ...f,
          properties: featureProps,
          geometry: {
            type: 'LineString',
            coordinates: smoothedCoords
          }
        };
      } else if (f.geometry.type === 'MultiLineString') {
        const origMulti = (f.geometry as GeoJSON.MultiLineString).coordinates as [number, number][][];
        const smoothedMulti = origMulti.map(c => smoothLineCoordinates(c, 2));
        return {
          ...f,
          properties: featureProps,
          geometry: {
            type: 'MultiLineString',
            coordinates: smoothedMulti
          }
        };
      }
      return { ...f, properties: featureProps };
    });

    // FILTER OUT CABLE FEATURES WHEN THEIR MAP FILTER IS UNCHECKED, OR WHEN
    // THEIR SOURCE KMZ FILE IS HIDDEN VIA THE SIDEBAR'S KMZ FILES PANEL!
    const activeLineFeatures = smoothedFeatures.filter(f => {
      const capKey = f.properties?.coreCapacity as keyof typeof mapFilters;
      if (capKey && mapFilters[capKey] === false) return false;
      const sourceFile = (f.properties as { sourceFile?: string } | null)?.sourceFile;
      if (sourceFile && kmzFileVisibility[sourceFile] === false) return false;
      return true;
    });

    return {
      type: 'FeatureCollection',
      features: activeLineFeatures
    } as GeoJSON.FeatureCollection;
  }, [geoData, segmentStoreMap, selectedSegment, selectedSegments, mapFilters, kmzFileVisibility, highlightedKmzFile]);

  // Active Route Line GeoJSON
  const activeRouteGeoJson = useMemo(() => {
    if (!activeRouteView) return null;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [activeRouteView.sourceCoords, activeRouteView.destCoords]
          },
          properties: { name: 'Active Jumper Connection' }
        }
      ]
    } as GeoJSON.FeatureCollection;
  }, [activeRouteView]);

  // Auto-calculate route candidate traces along real road network and existing drawn lines
  useEffect(() => {
    if (routeBuilder.pointA.coords && routeBuilder.pointZ.coords && geoData) {
      const [lngA, latA] = routeBuilder.pointA.coords;
      const [lngZ, latZ] = routeBuilder.pointZ.coords;

      const rawLineFeatures = geoData.features.filter(f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');
      const candidates: RouteCandidateOption[] = [];

      // Fetch Real Road Route from OSRM (Google Maps Style Driving Route)
      fetchRealRoadRoute([[lngA, latA], [lngZ, latZ]]).then((roadRes) => {
        if (roadRes && roadRes.coordinates.length >= 2) {
          const distKm = parseFloat((roadRes.distanceMeters / 1000).toFixed(2));
          candidates.push({
            id: 'cand-real-road',
            name: `Rute Jaringan Jalan Raya (${roadRes.distanceMeters.toLocaleString('id-ID')} m)`,
            distanceKm: distKm,
            coordinates: roadRes.coordinates,
            matchedSegmentName: 'Real Road Network (OSRM)'
          });
        }

        // Also check existing physical KMZ cables
        rawLineFeatures.forEach((f, idx) => {
          const segName = f.properties?.name || `Segment Cable Route #${idx + 1}`;
          let coords: [number, number][] = [];
          
          if (f.geometry.type === 'LineString') {
            coords = (f.geometry as GeoJSON.LineString).coordinates as [number, number][];
          } else if (f.geometry.type === 'MultiLineString') {
            coords = (f.geometry as GeoJSON.MultiLineString).coordinates.flat(1) as [number, number][];
          }

          if (coords.length >= 2) {
            const smoothed = smoothLineCoordinates(coords, 2);
            let distA = Infinity;
            let distZ = Infinity;
            smoothed.forEach(([lng, lat]) => {
              const dA = Math.hypot(lng - lngA, lat - latA);
              const dZ = Math.hypot(lng - lngZ, lat - latZ);
              if (dA < distA) distA = dA;
              if (dZ < distZ) distZ = dZ;
            });

            if (distA < 0.03 && distZ < 0.03) {
              const slicedSubSegment = sliceSubSegmentCoords(smoothed, [lngA, latA], [lngZ, latZ]);
              const distKm = calculateLineDistanceKm({ type: 'LineString', coordinates: slicedSubSegment });
              const distMeters = Math.round(distKm * 1000);
              
              candidates.push({
                id: `cand-kmz-${idx + 1}`,
                name: `Sub-Jalur Fisik KMZ: ${segName} (${distMeters.toLocaleString('id-ID')} m)`,
                distanceKm: distKm,
                coordinates: slicedSubSegment,
                matchedSegmentName: segName
              });
            }
          }
        });

        // Fallback if no candidate
        if (candidates.length === 0) {
          const directCoords: [number, number][] = smoothLineCoordinates([
            [lngA, latA],
            [(lngA + lngZ) / 2, (latA + latZ) / 2],
            [lngZ, latZ]
          ], 2);
          
          candidates.push({
            id: 'cand-direct-1',
            name: 'Jalur Kabel Terhubung Langsung',
            distanceKm: calculateLineDistanceKm({ type: 'LineString', coordinates: directCoords }),
            coordinates: directCoords
          });
        }

        setRouteBuilder({
          candidates: candidates.slice(0, 3),
          selectedCandidateIndex: 0
        });
      });
    }
  }, [routeBuilder.pointA.coords, routeBuilder.pointZ.coords, geoData]);

  // Preview GeoJSON for Route Builder Candidate
  const previewRouteGeoJson = useMemo(() => {
    if (!routeBuilder.candidates || routeBuilder.candidates.length === 0) return null;
    const selectedCand = routeBuilder.candidates[routeBuilder.selectedCandidateIndex || 0];
    if (!selectedCand || !selectedCand.coordinates || selectedCand.coordinates.length < 2) return null;

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: selectedCand.coordinates
          },
          properties: { name: selectedCand.name }
        }
      ]
    } as GeoJSON.FeatureCollection;
  }, [routeBuilder.candidates, routeBuilder.selectedCandidateIndex]);

  // Preview Cable Route following real road network paths (Google Maps-style) or existing KMZ lines
  const drawnGreenLineGeoJson = useMemo(() => {
    if (!drawnGreenLineCoords || drawnGreenLineCoords.length === 0) return null;
    
    if (drawnGreenLineCoords.length === 1) {
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: drawnGreenLineCoords[0]
            },
            properties: { name: 'Point A' }
          }
        ]
      } as GeoJSON.FeatureCollection;
    }

    // Priority 1: Real Road coordinates from OSRM
    if (realRoadDrawnRoute && realRoadDrawnRoute.coordinates.length >= 2) {
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: realRoadDrawnRoute.coordinates
            },
            properties: { name: 'Preview Real Road Cable Route' }
          }
        ]
      } as GeoJSON.FeatureCollection;
    }

    // Priority 2: Trace all waypoints along existing cyan cable features
    const matchedCoords = traceWaypointsAlongExistingLines(drawnGreenLineCoords, geoData);

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: matchedCoords
          },
          properties: { name: 'Preview Cable Route' }
        }
      ]
    } as GeoJSON.FeatureCollection;
  }, [drawnGreenLineCoords, realRoadDrawnRoute, geoData]);

  // Filtered separately from the render pass so it only recomputes when
  // nodes/filters/visibility actually change, not on every FiberMap
  // re-render (e.g. typing in search, hovering, drawing a line).
  const visibleNodes = useMemo(() => nodes.filter(node => {
    if (node.type === 'POP' && !mapFilters.pop) return false;
    if (node.type === 'XCC' && !mapFilters.xcc) return false;
    if ((node.type === 'ODP' || node.type === 'ODC') && !mapFilters.odp) return false;
    if (node.type === 'HH' && !mapFilters.hh) return false;
    if (node.type === 'Tiang' && !mapFilters.pole) return false;
    if (node.sourceFile && kmzFileVisibility[node.sourceFile] === false) return false;
    return true;
  }), [nodes, mapFilters.pop, mapFilters.xcc, mapFilters.odp, mapFilters.hh, mapFilters.pole, kmzFileVisibility]);

  // Hoisted out of the marker .map() so it's created once per relevant
  // state change instead of once per marker per render — the marker's own
  // onClick then just wraps this with the specific `node` it needs.
  const handleNodeClick = useCallback((node: NodeData) => {
    // 1. Intercept Marker click when in Green Line Drawing Mode
    if (isDrawingGreenLine) {
      addGreenLinePoint(node.coordinates);
      return;
    }

    // 2. Intercept Marker click when picking Route Point A or Point Z
    if (routeBuilder.pickingMode && routeBuilder.pickingMode !== 'none') {
      const pointKey = routeBuilder.pickingMode === 'pointA' ? 'pointA' : 'pointZ';
      setRouteBuilder({
        [pointKey]: {
          label: node.name,
          coords: node.coordinates
        },
        pickingMode: 'none',
        isOpen: true
      });
      return;
    }

    if (mapPickerState) {
      if (mapPickerState.step === 'select_source') {
        setMapPickerState({ step: 'select_dest', sourceXcc: node });
      } else if (mapPickerState.step === 'select_dest') {
        const source = mapPickerState.sourceXcc || node;
        setMapPickerState(null);
        setSelectedXcc(source);
      } else if (mapPickerState.step === 'select_tray_target') {
        if (mapPickerState.targetTrayKey) {
          updateTrayTarget(mapPickerState.targetTrayKey, node.name);

          const trayIndexStr = mapPickerState.targetTrayKey.split('_tray_')[1];
          const trayIndex = trayIndexStr !== undefined ? parseInt(trayIndexStr, 10) : NaN;
          const sourceXcc = mapPickerState.sourceXcc;
          if (sourceXcc && !Number.isNaN(trayIndex)) {
            saveXccTray(sourceXcc.id, trayIndex, {
              node: {
                name: sourceXcc.name,
                nodeType: sourceXcc.type,
                longitude: sourceXcc.coordinates[0],
                latitude: sourceXcc.coordinates[1],
                status: sourceXcc.status
              },
              targetNodeName: node.name
            }).catch((err) => console.error('Failed to save tray target to backend:', err));
          }
        }
        const source = mapPickerState.sourceXcc || nodes.find(n => n.type === 'XCC') || node;
        setMapPickerState(null);
        setSelectedXcc(source);
      }
      return;
    }

    if (node.type === 'XCC') {
      setSelectedXcc(node);
    } else if (node.type === 'POP') {
      setSelectedPopNode(node);
    } else if (node.type === 'ODP') {
      setSelectedOdpNode(node);
    } else {
      setActiveAlert(node);
    }
  }, [
    isDrawingGreenLine, addGreenLinePoint, routeBuilder, setRouteBuilder,
    mapPickerState, setMapPickerState, updateTrayTarget, nodes,
    setSelectedXcc, setSelectedPopNode, setSelectedOdpNode, setActiveAlert
  ]);

  return (
    <div className="absolute inset-0 w-full h-full bg-background z-0">
      
      {/* FLOATING KMZ FILE UPLOADER WIDGET */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <label className="bg-slate-900/90 hover:bg-slate-800 text-emerald-400 border border-emerald-500/50 hover:border-emerald-400 px-3.5 py-2 rounded-2xl text-xs font-mono font-extrabold flex items-center gap-2 shadow-2xl backdrop-blur-md cursor-pointer transition-all hover:scale-105">
          <Upload size={16} className={isUploading ? 'animate-spin' : ''} />
          <span>{isUploading ? 'MENGIMPOR...' : 'IMPOR FILE .KMZ'}</span>
          <input
            type="file"
            accept=".kmz,.kml"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {/* Clear all points & routes from the current map view — for testing
            the import flow against a blank map. Refresh reloads the default
            KMZ files; nothing in the database is touched. */}
        <button
          onClick={() => {
            if (window.confirm('Hapus semua titik & jalur kabel dari tampilan peta saat ini? (Refresh halaman akan memuat ulang data default)')) {
              setNodes([]);
              setGeoData({ type: 'FeatureCollection', features: [] });
            }
          }}
          className="bg-slate-900/90 hover:bg-rose-950 text-rose-400 border border-rose-500/50 hover:border-rose-400 px-3.5 py-2 rounded-2xl text-xs font-mono font-extrabold flex items-center gap-2 shadow-2xl backdrop-blur-md transition-all hover:scale-105"
          title="Hapus semua titik & jalur kabel dari tampilan peta (sementara, sampai di-refresh)"
        >
          <Trash2 size={16} />
          <span>HAPUS SEMUA</span>
        </button>

        {uploadSuccessMsg && (
          <div className="bg-emerald-950/90 text-emerald-400 border border-emerald-500/50 px-3 py-2 rounded-2xl text-xs font-mono font-bold flex items-center gap-1.5 shadow-2xl backdrop-blur-md">
            <CheckCircle size={16} />
            <span>{uploadSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* FLOATING DRAWING CABLE TOOLBAR (POSITIONED TOP-24 BELOW STAT CARDS) */}
      {isDrawingGreenLine && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 text-white font-mono px-5 py-3 rounded-2xl border-2 border-pink-500 shadow-[0_0_50px_rgba(255,0,127,0.8)] backdrop-blur-xl flex flex-col sm:flex-row items-center gap-4 animate-pulse">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pink-500 animate-ping" />
              <span className="font-extrabold text-xs sm:text-sm text-pink-300">
                ✏️ MODE GAMBAR KABEL ({drawnGreenLineCoords.length} TITIK)
              </span>
            </div>

            {drawnCableDistanceMeters > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-pink-950/80 border border-pink-500/60 rounded-xl text-xs font-mono font-extrabold text-pink-300 shadow-[0_0_15px_rgba(255,0,127,0.4)]">
                <span>📏 JARAK A ➔ Z:</span>
                <span className="text-white font-black tracking-wide">{drawnCableDistanceMeters.toLocaleString('id-ID')} m</span>
                <span className="text-pink-400 text-[11px] font-semibold">({(drawnCableDistanceMeters / 1000).toFixed(2)} km)</span>
                {realRoadDrawnRoute?.isRealRoad && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[9px] font-bold">
                    🛣️ REAL ROAD
                  </span>
                )}
                {isRoutingRoad && (
                  <span className="ml-1 text-[9px] text-cyan-300 animate-spin">⏳</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={drawnGreenLineCoords.length === 0}
              onClick={undoGreenLinePoint}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all"
            >
              ↩ Undo
            </button>
            <button
              disabled={drawnGreenLineCoords.length < 2}
              onClick={() => {
                const routeCoords = realRoadDrawnRoute?.coordinates && realRoadDrawnRoute.coordinates.length >= 2 
                  ? realRoadDrawnRoute.coordinates 
                  : drawnGreenLineCoords;
                const distanceKm = drawnCableDistanceMeters > 0 ? (drawnCableDistanceMeters / 1000) : undefined;
                finishDrawingGreenLine(routeCoords, distanceKm);
              }}
              className="px-4 py-1.5 bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 disabled:opacity-50 text-white text-xs font-mono font-extrabold rounded-xl border border-pink-300 transition-all shadow-[0_0_20px_rgba(255,0,127,0.6)]"
            >
              ✅ SIMPAN & TERAPKAN RUTE JALUR KABEL
            </button>
            <button
              onClick={cancelDrawingGreenLine}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all"
            >
              ❌ Batal
            </button>
          </div>
        </div>
      )}

      {/* FLOATING ROUTE BUILDER PICKING BANNER (POSITIONED TOP-24 BELOW STAT CARDS) */}
      {routeBuilder.pickingMode && routeBuilder.pickingMode !== 'none' && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 text-white font-mono px-5 py-3 rounded-2xl border-2 border-purple-400 shadow-[0_0_40px_rgba(168,85,247,0.7)] backdrop-blur-xl flex items-center gap-4 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-400 animate-ping" />
            <span className="font-extrabold text-xs sm:text-sm text-purple-300">
              {routeBuilder.pickingMode === 'pointA' ? '📍 KLIK MANAPUN DI PETA UNTUK POINT A (ASAL RUTE)' : '🎯 KLIK MANAPUN DI PETA UNTUK POINT Z (TUJUAN RUTE)'}
            </span>
          </div>
          <button
            onClick={() => setRouteBuilder({ pickingMode: 'none', isOpen: true })}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all"
          >
            Batal
          </button>
        </div>
      )}

      {/* FLOATING POINT A / POINT Z MAP PICKER BANNER (POSITIONED TOP-24 BELOW STAT CARDS) */}
      {segmentPointPickerState && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 text-white font-mono px-5 py-3 rounded-2xl border-2 border-cyan-400 shadow-[0_0_40px_rgba(0,229,255,0.7)] backdrop-blur-xl flex items-center gap-4 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-extrabold text-xs sm:text-sm text-cyan-300">
              {segmentPointPickerState.targetPoint === 'nodeA' ? '📍 KLIK MANAPUN DI PETA UNTUK POINT A (ASAL)' : '🎯 KLIK MANAPUN DI PETA UNTUK POINT Z (TUJUAN)'}
            </span>
          </div>
          <button
            onClick={() => {
              const currentId = segmentPointPickerState.segmentId;
              setSegmentPointPickerState(null);
              const seg = segmentStoreMap[currentId];
              if (seg) setSelectedSegment(seg);
            }}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all"
          >
            Batal
          </button>
        </div>
      )}

      {/* FLOATING CABLE HOVER POINTER BADGE INDICATOR */}
      {hoveredLineInfo && (
        <div 
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-3 bg-slate-950/95 text-cyan-300 font-mono text-xs font-extrabold px-3 py-1.5 rounded-2xl border-2 border-cyan-400 shadow-[0_0_25px_rgba(0,229,255,0.8)] backdrop-blur-md flex items-center gap-2 animate-bounce"
          style={{ left: hoveredLineInfo.x, top: hoveredLineInfo.y }}
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>▶ KLIK KABEL: {hoveredLineInfo.name}</span>
        </div>
      )}

      <Map
        ref={mapRef}
        initialViewState={{
          longitude: 106.8456,
          latitude: -6.2088,
          zoom: 12
        }}
        mapStyle={theme === 'dark' ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        interactiveLayerIds={['fiber-line-normal', 'fiber-line-glow']}
        style={{ width: '100%', height: '100%' }}
        onMouseEnter={(e) => {
          const lineFeature = e.features?.find(f => f.layer.id === 'fiber-line-normal' || f.layer.id === 'fiber-line-glow');
          if (lineFeature) {
            if (mapRef.current) mapRef.current.getMap().getCanvas().style.cursor = 'pointer';
            setHoveredLineInfo({
              x: e.point.x,
              y: e.point.y,
              name: lineFeature.properties?.name || 'SEGMENT CABLE ROUTE'
            });
          }
        }}
        onMouseLeave={() => {
          if (mapRef.current) mapRef.current.getMap().getCanvas().style.cursor = '';
          setHoveredLineInfo(null);
        }}
        onMouseMove={(e) => {
          const lineFeature = e.features?.find(f => f.layer.id === 'fiber-line-normal' || f.layer.id === 'fiber-line-glow');
          if (lineFeature) {
            if (mapRef.current) mapRef.current.getMap().getCanvas().style.cursor = 'pointer';
            setHoveredLineInfo({
              x: e.point.x,
              y: e.point.y,
              name: lineFeature.properties?.name || 'SEGMENT CABLE ROUTE'
            });
          } else {
            if (mapRef.current) mapRef.current.getMap().getCanvas().style.cursor = '';
            setHoveredLineInfo(null);
          }
        }}
        onClick={(e) => {
          // If in Green Line Drawing Mode
          if (isDrawingGreenLine) {
            e.originalEvent.stopPropagation();
            addGreenLinePoint([e.lngLat.lng, e.lngLat.lat]);
            return;
          }

          // If in routeBuilder picking mode for Point A or Point Z
          if (routeBuilder.pickingMode && routeBuilder.pickingMode !== 'none') {
            e.originalEvent.stopPropagation();
            
            let label = `Titik (${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)})`;
            const clickedNode = nodes.find(n => {
              const dx = Math.abs(n.coordinates[0] - e.lngLat.lng);
              const dy = Math.abs(n.coordinates[1] - e.lngLat.lat);
              return dx < 0.015 && dy < 0.015;
            });
            if (clickedNode) label = clickedNode.name;

            const pointKey = routeBuilder.pickingMode === 'pointA' ? 'pointA' : 'pointZ';

            setRouteBuilder({
              [pointKey]: {
                label,
                coords: [e.lngLat.lng, e.lngLat.lat]
              },
              pickingMode: 'none',
              isOpen: true
            });
            return;
          }

          // If in segmentPointPickerState (picking Point A or Point Z via map click)
          if (segmentPointPickerState) {
            e.originalEvent.stopPropagation();
            
            let locationLabel = `Titik (${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)})`;
            
            // Check if click was near a node
            const clickedNode = nodes.find(n => {
              const dx = Math.abs(n.coordinates[0] - e.lngLat.lng);
              const dy = Math.abs(n.coordinates[1] - e.lngLat.lat);
              return dx < 0.015 && dy < 0.015;
            });

            if (clickedNode) {
              locationLabel = `${clickedNode.name}`;
            }

            updateSegmentData(segmentPointPickerState.segmentId, {
              [segmentPointPickerState.targetPoint]: locationLabel
            });

            const currentSegId = segmentPointPickerState.segmentId;
            setSegmentPointPickerState(null);

            const updated = segmentStoreMap[currentSegId];
            if (updated) {
              setSelectedSegment(updated);
            }
            return;
          }

          // A click point can land on more than one route at once (overlapping
          // or closely-parallel cables). react-map-gl's e.features only hits
          // the exact clicked pixel, which misses routes running a few
          // pixels apart that a user would still perceive as "the same
          // spot" — so query a small tolerance box around the click instead.
          // Both fiber-line-glow + fiber-line-normal render the SAME line,
          // so dedupe by the line's own stable id before treating results as
          // distinct overlapping routes.
          const clickBox: [[number, number], [number, number]] = [
            [e.point.x - 4, e.point.y - 4],
            [e.point.x + 4, e.point.y + 4]
          ];
          const allLineFeatures = mapRef.current
            ? mapRef.current.getMap().queryRenderedFeatures(clickBox, { layers: ['fiber-line-normal', 'fiber-line-glow'] })
            : [];
          const seenIds = new Set<string>();
          const distinctLineFeatures = allLineFeatures.filter(f => {
            const rawName = f.properties?.name || 'SEGMENT CABLE ROUTE';
            const id = stableSegmentId(rawName, f.geometry);
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
          });

          if (distinctLineFeatures.length > 0) {
            const candidates = distinctLineFeatures.map(f => {
              const rawName = f.properties?.name || 'SEGMENT CABLE ROUTE';
              const distKm = calculateLineDistanceKm(f.geometry);
              return getOrCreateSegmentData(stableSegmentId(rawName, f.geometry), rawName, distKm);
            });

            setOverlappingSegments(candidates);

            if (multiSelectMode) {
              toggleSelectSegment(candidates[0]);
            } else {
              setSelectedSegment(candidates[0]);
            }
          }
        }}
      >
        {/* Render Fiber Cable LineStrings with Dynamic Color Logic & Directional Arrows */}
        {linesGeoJson && (
          <Source id="fiber-lines" type="geojson" data={linesGeoJson}>
            <Layer {...fiberLineGlow} />
            <Layer {...fiberLineNormal} />
            <Layer {...fiberLineArrows} />
          </Source>
        )}

        {/* Active Route Connection Glowing Line */}
        {activeRouteGeoJson && (
          <Source id="active-route-source" type="geojson" data={activeRouteGeoJson}>
            <Layer
              id="active-route-glow"
              type="line"
              paint={{
                'line-color': '#3B82F6',
                'line-width': 8,
                'line-blur': 4,
                'line-opacity': 0.8
              }}
            />
            <Layer
              id="active-route-core"
              type="line"
              paint={{
                'line-color': '#00E5FF',
                'line-width': 4,
                'line-dasharray': [2, 2]
              }}
            />
          </Source>
        )}

        {/* Route Builder Preview Glowing Line & Markers */}
        {previewRouteGeoJson && (
          <Source id="route-builder-preview-source" type="geojson" data={previewRouteGeoJson}>
            <Layer
              id="route-builder-preview-glow"
              type="line"
              paint={{
                'line-color': '#C084FC',
                'line-width': 10,
                'line-blur': 5,
                'line-opacity': 0.85
              }}
            />
            <Layer
              id="route-builder-preview-core"
              type="line"
              paint={{
                'line-color': '#E11D48',
                'line-width': 4.5,
                'line-dasharray': [2, 2]
              }}
            />
          </Source>
        )}

        {/* Auto-Magenta Preview Cable Layer following existing drawn lines on map */}
        {drawnGreenLineGeoJson && (
          <Source id="drawn-green-line-source" type="geojson" data={drawnGreenLineGeoJson}>
            <Layer
              id="drawn-green-line-glow"
              type="line"
              paint={{
                'line-color': '#FF007F',
                'line-width': 14,
                'line-blur': 7,
                'line-opacity': 0.95
              }}
            />
            <Layer
              id="drawn-green-line-core"
              type="line"
              paint={{
                'line-color': '#FF2D55',
                'line-width': 6,
              }}
            />
            <Layer
              id="drawn-green-line-arrows"
              type="symbol"
              layout={{
                'symbol-placement': 'line',
                'symbol-spacing': 60,
                'text-field': '▶',
                'text-size': 13,
                'text-keep-upright': false,
                'text-allow-overlap': true
              }}
              paint={{
                'text-color': '#FFE4E6',
                'text-halo-color': '#020617',
                'text-halo-width': 1.5
              }}
            />
          </Source>
        )}

        {/* Start Point A Marker for Drawn Green Line */}
        {drawnGreenLineCoords.length > 0 && (
          <Marker longitude={drawnGreenLineCoords[0][0]} latitude={drawnGreenLineCoords[0][1]} anchor="bottom">
            <div className="flex flex-col items-center font-mono text-xs font-extrabold z-40">
              <div className="bg-blue-600 text-white px-2.5 py-1 rounded-xl border border-blue-300 shadow-[0_0_20px_rgba(37,99,235,0.9)] animate-bounce">
                📍 POINT A ({drawnGreenLineCoords[0][1].toFixed(4)}, {drawnGreenLineCoords[0][0].toFixed(4)})
              </div>
              <div className="w-3 h-3 bg-blue-600 rotate-45 -mt-1.5 border-r border-b border-blue-300" />
            </div>
          </Marker>
        )}

        {/* Intermediate Waypoint Markers for Multi-Point Tracing */}
        {drawnGreenLineCoords.length > 2 && (
          drawnGreenLineCoords.slice(1, -1).map((pt, idx) => (
            <Marker key={`waypoint-${idx}`} longitude={pt[0]} latitude={pt[1]} anchor="center">
              <div className="w-4 h-4 rounded-full bg-pink-500 border-2 border-slate-950 shadow-[0_0_12px_rgba(255,0,127,0.9)] animate-pulse" />
            </Marker>
          ))
        )}

        {/* End Point Z Marker for Drawn Green Line */}
        {drawnGreenLineCoords.length > 1 && (
          <Marker longitude={drawnGreenLineCoords[drawnGreenLineCoords.length - 1][0]} latitude={drawnGreenLineCoords[drawnGreenLineCoords.length - 1][1]} anchor="bottom">
            <div className="flex flex-col items-center font-mono text-xs font-extrabold z-40">
              <div className="bg-gradient-to-r from-pink-600 to-rose-500 text-white px-3 py-1.5 rounded-xl border border-pink-300 shadow-[0_0_25px_rgba(255,0,127,0.9)] animate-bounce flex items-center gap-2">
                <span>🎯 POINT Z ({drawnGreenLineCoords[drawnGreenLineCoords.length - 1][1].toFixed(4)}, {drawnGreenLineCoords[drawnGreenLineCoords.length - 1][0].toFixed(4)})</span>
                {drawnCableDistanceMeters > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-black/60 text-yellow-300 font-black border border-yellow-400/50 text-[11px] tracking-wider shadow-inner">
                    📏 {drawnCableDistanceMeters.toLocaleString('id-ID')} m
                  </span>
                )}
              </div>
              <div className="w-3 h-3 bg-pink-500 rotate-45 -mt-1.5 border-r border-b border-pink-300" />
            </div>
          </Marker>
        )}

        {/* Render OTDR Bending / Loss Fault Spot Marker with Lat/Lng & Copy Button */}
        {activeOtdrFaultSpot && (
          <Marker longitude={activeOtdrFaultSpot.coords[0]} latitude={activeOtdrFaultSpot.coords[1]} anchor="bottom">
            <div className="flex flex-col items-center font-mono text-xs font-extrabold z-50">
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-3.5 rounded-2xl border-2 border-amber-400 shadow-[0_0_50px_rgba(245,158,11,0.95)] flex flex-col gap-2.5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                    <span className="text-amber-400 font-extrabold uppercase tracking-wide">
                      ⚠️ {activeOtdrFaultSpot.eventName} ({activeOtdrFaultSpot.distanceKm.toFixed(2)} km)
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveOtdrFaultSpot(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                    title="Tutup Marker"
                  >
                    ✕
                  </button>
                </div>

                {/* Lat/Lng Info & 1-Click Copy */}
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-slate-300 font-bold">
                    📍 Coords: <strong className="text-cyan-300 font-mono">{activeOtdrFaultSpot.coords[1].toFixed(5)}, {activeOtdrFaultSpot.coords[0].toFixed(5)}</strong>
                  </span>
                  <button
                    onClick={() => {
                      const text = `${activeOtdrFaultSpot.coords[1].toFixed(6)}, ${activeOtdrFaultSpot.coords[0].toFixed(6)}`;
                      navigator.clipboard.writeText(text);
                      setUploadSuccessMsg(`✅ LatLong (${text}) Berhasil Disalin!`);
                      setTimeout(() => setUploadSuccessMsg(null), 3000);
                    }}
                    className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/50 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition-all shadow"
                  >
                    📋 SALIN LATLONG
                  </button>
                </div>

                {/* Return to Cable Modal Button */}
                <div className="pt-1.5 flex items-center justify-between gap-3 border-t border-slate-800/80">
                  <span className="text-[10px] text-rose-400 font-bold">Loss: {activeOtdrFaultSpot.lossDb} dB</span>
                  <button
                    onClick={() => {
                      const targetId = activeOtdrFaultSpot.segmentId;
                      const seg = segmentStoreMap[targetId];
                      setActiveOtdrFaultSpot(null);
                      if (seg) setSelectedSegment(seg);
                    }}
                    className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-md hover:scale-105"
                  >
                    🔙 KEMBALI KE MODAL KABEL
                  </button>
                </div>
              </div>
              <div className="w-3.5 h-3.5 bg-amber-400 rotate-45 -mt-1.5 border-r-2 border-b-2 border-slate-950" />
            </div>
          </Marker>
        )}

        {/* Render HTML Markers for Nodes (XCC, POP, ODP, HH, Tiang) */}
        {visibleNodes.map(node => (
          <Marker
            key={node.id}
            longitude={node.coordinates[0]}
            latitude={node.coordinates[1]}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              handleNodeClick(node);
            }}
          >
            <NodeMarkerContent
              node={node}
              isDimmed={!!highlightedKmzFile && node.sourceFile !== highlightedKmzFile}
            />
          </Marker>
        ))}

        {/* Render Special Markers for Active Route View (Origin & Destination) */}
        {activeRouteView && (
          <>
            <Marker longitude={activeRouteView.sourceCoords[0]} latitude={activeRouteView.sourceCoords[1]} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className="bg-blue-600 text-white font-mono text-xs font-extrabold px-3 py-1 rounded-xl border border-blue-300 shadow-[0_0_20px_rgba(37,99,235,0.8)] animate-pulse">
                  📍 ASAL: {activeRouteView.sourceName} ({activeRouteView.sourcePortLabel})
                </div>
                <div className="w-3 h-3 bg-blue-600 rotate-45 -mt-1.5 border-r border-b border-blue-300" />
              </div>
            </Marker>

            <Marker longitude={activeRouteView.destCoords[0]} latitude={activeRouteView.destCoords[1]} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className="bg-emerald-600 text-white font-mono text-xs font-extrabold px-3 py-1 rounded-xl border border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.8)] animate-pulse">
                  🎯 TUJUAN: {activeRouteView.destName} ({activeRouteView.destPortLabel})
                </div>
                <div className="w-3 h-3 bg-emerald-600 rotate-45 -mt-1.5 border-r border-b border-emerald-300" />
              </div>
            </Marker>
          </>
        )}
      </Map>

      <Suspense fallback={null}>
        {/* POP Node Details Modal Popup */}
        <PopDetailsModal
          popNode={selectedPopNode}
          onClose={() => setSelectedPopNode(null)}
        />

        {/* ODP Node Details Modal Popup */}
        <OdpDetailsModal
          odpNode={selectedOdpNode}
          onClose={() => setSelectedOdpNode(null)}
        />

        {/* KMZ Import — Initial Setup Modal (core capacity per route before it goes live) */}
        <KmzImportSetupModal
          existingNodes={nodes}
          existingGeoData={geoData}
          setNodes={setNodes}
          setGeoData={setGeoData}
          onImported={(msg) => {
            setUploadSuccessMsg(msg);
            setTimeout(() => setUploadSuccessMsg(null), 5000);
          }}
        />
      </Suspense>

      {/* Floating Layer Filter & Legend Control Panel */}
      <MapFilterLegendPanel />

    </div>
  );
};
