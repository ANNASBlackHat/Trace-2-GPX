import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  GeoCoordinate,
  GeoreferenceTransform,
  getGeoBoundingBox,
  pixelToLatLng,
} from '../utils/georeferencing';
import { HoldButton } from '../utils/useHoldRepeat';
import {
  Layers,
  Maximize2,
  Move,
  RotateCw,
  RotateCcw,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  FlipHorizontal,
  FlipVertical,
  ArrowRightLeft,
  Sliders,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Edit3,
  PenTool,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Plus,
  Minimize2,
  Undo2,
  Check,
  X,
} from 'lucide-react';

export interface InteractiveMapProps {
  rawGeoRoute: GeoCoordinate[];
  snappedGeoRoute: GeoCoordinate[] | null;
  activeView: 'both' | 'raw' | 'snapped';
  anchors: [
    { id: string; name: string; geo: GeoCoordinate; pixel: { x: number; y: number } },
    { id: string; name: string; geo: GeoCoordinate; pixel: { x: number; y: number } }
  ] | null;
  onAnchorDrag: (anchorIndex: 0 | 1, newGeo: GeoCoordinate) => void;
  onPan?: (dEastMeters: number, dNorthMeters: number) => void;
  onRotate?: (deg: number) => void;
  onScale?: (factor: number) => void;
  onStretch?: (factorX: number, factorY: number) => void;
  onSmooth?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onFlipDirection?: () => void;
  onRouteCenterDrag?: (deltaLat: number, deltaLng: number) => void;
  onUpdateRouteCoords?: (newCoords: GeoCoordinate[]) => void;
  onClearRoute?: () => void;
  onRestoreOriginalRoute?: () => void;
  isCustomRoute?: boolean;
  screenshotDataUrl?: string;
  imageDimensions?: { width: number; height: number };
  transform?: GeoreferenceTransform | null;
  isSnapping?: boolean;
}

const BASE_MAPS = {
  cartoPositron: {
    name: 'Carto Light (Clean)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  osm: {
    name: 'OpenStreetMap Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  cartoDark: {
    name: 'Carto Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  rawGeoRoute,
  snappedGeoRoute,
  activeView,
  anchors,
  onAnchorDrag,
  onPan,
  onRotate,
  onScale,
  onStretch,
  onSmooth,
  onFlipH,
  onFlipV,
  onFlipDirection,
  onRouteCenterDrag,
  onUpdateRouteCoords,
  onClearRoute,
  onRestoreOriginalRoute,
  isCustomRoute,
  screenshotDataUrl,
  imageDimensions,
  transform,
  isSnapping,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);

  const rawPolylineRef = useRef<L.Polyline | null>(null);
  const snappedPolylineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);
  const centerMoveMarkerRef = useRef<L.Marker | null>(null);
  const waypointMarkersRef = useRef<L.Marker[]>([]);

  const anchor1MarkerRef = useRef<L.Marker | null>(null);
  const anchor2MarkerRef = useRef<L.Marker | null>(null);

  const [activeBasemapKey, setActiveBasemapKey] = useState<keyof typeof BASE_MAPS>('cartoPositron');
  const [showAnchors, setShowAnchors] = useState<boolean>(true);
  const [hudStepMeters, setHudStepMeters] = useState<number>(25);
  const [rotStepDeg, setRotStepDeg] = useState<number>(5);
  const [hudExpanded, setHudExpanded] = useState<boolean>(false);

  // Advanced Editing states
  const [isEditingPoints, setIsEditingPoints] = useState<boolean>(false);
  const [isDrawingNew, setIsDrawingNew] = useState<boolean>(false);
  const [showOverlay, setShowOverlay] = useState<boolean>(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] =
      rawGeoRoute.length > 0 ? [rawGeoRoute[0].lat, rawGeoRoute[0].lng] : [-7.782, 110.375];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const baseCfg = BASE_MAPS[activeBasemapKey];
    tileLayerRef.current = L.tileLayer(baseCfg.url, {
      attribution: baseCfg.attribution,
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layer when basemap changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }
    const baseCfg = BASE_MAPS[activeBasemapKey];
    tileLayerRef.current = L.tileLayer(baseCfg.url, {
      attribution: baseCfg.attribution,
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);
  }, [activeBasemapKey]);

  // Click-to-draw on map handler
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!isDrawingNew || !onUpdateRouteCoords) return;
      const newPt: GeoCoordinate = { lat: e.latlng.lat, lng: e.latlng.lng };
      onUpdateRouteCoords([...rawGeoRoute, newPt]);
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [isDrawingNew, rawGeoRoute, onUpdateRouteCoords]);

  // Custom Div Icons
  const createPinIcon = (color: string, label: string) => {
    return L.divIcon({
      className: 'custom-anchor-pin',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%); cursor:grab;">
          <div style="background:${color}; color:#fff; font-weight:bold; font-size:10px; padding:2px 7px; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.4); white-space:nowrap; border:1.5px solid white;">
            ${label}
          </div>
          <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${color};"></div>
          <div style="width:5px; height:5px; background:${color}; border-radius:50%; margin-top:-2px;"></div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  };

  const createCenterMoveIcon = () => {
    return L.divIcon({
      className: 'custom-center-move-pin',
      html: `
        <div style="background:#10b981; color:#ffffff; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.5); border:2.5px solid white; cursor:grab; transform:translate(-50%, -50%);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 9 2 12 5 15"></polyline>
            <polyline points="9 5 12 2 15 5"></polyline>
            <polyline points="19 9 22 12 19 15"></polyline>
            <polyline points="9 19 12 22 15 19"></polyline>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="12" y1="2" x2="12" y2="22"></line>
          </svg>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  };

  const createWaypointHandleIcon = (index: number) => {
    return L.divIcon({
      className: 'custom-waypoint-handle',
      html: `
        <div style="background:#ffffff; border:2.5px solid #2563eb; width:14px; height:14px; border-radius:50%; box-shadow:0 1px 5px rgba(0,0,0,0.4); cursor:pointer; transform:translate(-50%, -50%);"></div>
      `,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  };

  const createEndpointIcon = (type: 'start' | 'finish') => {
    const isStart = type === 'start';
    const bg = isStart ? '#22c55e' : '#ef4444';
    const symbol = isStart ? 'S' : 'F';
    return L.divIcon({
      className: 'custom-endpoint-icon',
      html: `
        <div style="background:${bg}; color:white; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.35); transform:translate(-50%, -50%);">
          ${symbol}
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  };

  // Screenshot Image Overlay Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (imageOverlayRef.current) {
      imageOverlayRef.current.remove();
      imageOverlayRef.current = null;
    }

    if (showOverlay && screenshotDataUrl && transform && imageDimensions) {
      const { width, height } = imageDimensions;
      const c1 = pixelToLatLng({ x: 0, y: 0 }, transform);
      const c2 = pixelToLatLng({ x: width, y: 0 }, transform);
      const c3 = pixelToLatLng({ x: width, y: height }, transform);
      const c4 = pixelToLatLng({ x: 0, y: height }, transform);

      const minLat = Math.min(c1.lat, c2.lat, c3.lat, c4.lat);
      const maxLat = Math.max(c1.lat, c2.lat, c3.lat, c4.lat);
      const minLng = Math.min(c1.lng, c2.lng, c3.lng, c4.lng);
      const maxLng = Math.max(c1.lng, c2.lng, c3.lng, c4.lng);

      const bounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
      imageOverlayRef.current = L.imageOverlay(screenshotDataUrl, bounds, {
        opacity: overlayOpacity,
        interactive: false,
      }).addTo(map);
    }
  }, [showOverlay, overlayOpacity, screenshotDataUrl, transform, imageDimensions]);

  // Update Route Polylines and Start/End markers + Center Move Handle + Draggable Waypoint Handles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (rawPolylineRef.current) rawPolylineRef.current.remove();
    if (snappedPolylineRef.current) snappedPolylineRef.current.remove();
    if (startMarkerRef.current) startMarkerRef.current.remove();
    if (endMarkerRef.current) endMarkerRef.current.remove();
    if (centerMoveMarkerRef.current) centerMoveMarkerRef.current.remove();

    // Clear previous waypoint handles
    for (const m of waypointMarkersRef.current) m.remove();
    waypointMarkersRef.current = [];

    const displayCoords =
      activeView === 'snapped' && snappedGeoRoute && snappedGeoRoute.length > 0
        ? snappedGeoRoute
        : rawGeoRoute;

    if (rawGeoRoute.length > 0 && (activeView === 'both' || activeView === 'raw')) {
      const latLngs: [number, number][] = rawGeoRoute.map((c) => [c.lat, c.lng]);
      rawPolylineRef.current = L.polyline(latLngs, {
        color: activeView === 'both' ? '#3b82f6' : '#FC4C02',
        weight: activeView === 'both' ? 3.5 : 5,
        opacity: activeView === 'both' ? 0.7 : 0.95,
        dashArray: activeView === 'both' ? '6, 6' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    }

    if (
      snappedGeoRoute &&
      snappedGeoRoute.length > 0 &&
      (activeView === 'both' || activeView === 'snapped')
    ) {
      const latLngs: [number, number][] = snappedGeoRoute.map((c) => [c.lat, c.lng]);
      snappedPolylineRef.current = L.polyline(latLngs, {
        color: '#10b981',
        weight: 5.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    }

    // Start, Finish, and Center Drag Marker
    if (displayCoords.length > 0) {
      const startPt = displayCoords[0];
      const endPt = displayCoords[displayCoords.length - 1];

      startMarkerRef.current = L.marker([startPt.lat, startPt.lng], {
        icon: createEndpointIcon('start'),
        zIndexOffset: 500,
      })
        .addTo(map)
        .bindTooltip('Route Start', { permanent: false, direction: 'top' });

      const distStartEnd = Math.hypot(startPt.lat - endPt.lat, startPt.lng - endPt.lng);
      if (distStartEnd > 0.0004 || displayCoords.length < 5) {
        endMarkerRef.current = L.marker([endPt.lat, endPt.lng], {
          icon: createEndpointIcon('finish'),
          zIndexOffset: 500,
        })
          .addTo(map)
          .bindTooltip('Route Finish', { permanent: false, direction: 'top' });
      }

      // Center Drag Marker (Move Entire Route)
      if (onRouteCenterDrag && !isEditingPoints) {
        const bbox = getGeoBoundingBox(displayCoords);
        const centerMarker = L.marker([bbox.centerLat, bbox.centerLng], {
          draggable: true,
          icon: createCenterMoveIcon(),
          zIndexOffset: 800,
        }).addTo(map);

        centerMarker.bindTooltip('Drag here to MOVE ENTIRE ROUTE', {
          permanent: false,
          direction: 'top',
        });

        let dragStartLat = bbox.centerLat;
        let dragStartLng = bbox.centerLng;

        centerMarker.on('dragstart', (e) => {
          const pos = (e.target as L.Marker).getLatLng();
          dragStartLat = pos.lat;
          dragStartLng = pos.lng;
        });

        centerMarker.on('dragend', (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          const dLat = newPos.lat - dragStartLat;
          const dLng = newPos.lng - dragStartLng;
          onRouteCenterDrag(dLat, dLng);
        });

        centerMoveMarkerRef.current = centerMarker;
      }
    }

    // RENDER INTERACTIVE WAYPOINT EDITING HANDLES
    if (isEditingPoints && onUpdateRouteCoords && rawGeoRoute.length > 0) {
      // Sample vertices so map remains fast (max ~45 handles)
      const step = Math.max(1, Math.floor(rawGeoRoute.length / 40));
      const indicesToRender: number[] = [];
      for (let i = 0; i < rawGeoRoute.length; i += step) {
        indicesToRender.push(i);
      }
      if (indicesToRender[indicesToRender.length - 1] !== rawGeoRoute.length - 1) {
        indicesToRender.push(rawGeoRoute.length - 1);
      }

      for (const idx of indicesToRender) {
        const pt = rawGeoRoute[idx];
        const marker = L.marker([pt.lat, pt.lng], {
          draggable: true,
          icon: createWaypointHandleIcon(idx),
          zIndexOffset: 1200,
        }).addTo(map);

        marker.on('drag', (e) => {
          const newLatLng = (e.target as L.Marker).getLatLng();
          const updated = [...rawGeoRoute];
          updated[idx] = { lat: newLatLng.lat, lng: newLatLng.lng };
          onUpdateRouteCoords(updated);
        });

        marker.bindTooltip(`Waypoint #${idx + 1}<br><span style="font-size:9px;">Drag to align road</span>`, {
          direction: 'top',
        });

        waypointMarkersRef.current.push(marker);
      }
    }
  }, [rawGeoRoute, snappedGeoRoute, activeView, onRouteCenterDrag, isEditingPoints, onUpdateRouteCoords]);

  // Update Draggable Anchors
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (anchor1MarkerRef.current) anchor1MarkerRef.current.remove();
    if (anchor2MarkerRef.current) anchor2MarkerRef.current.remove();

    if (!showAnchors || !anchors || isEditingPoints) return;

    // Anchor 1
    const a1 = anchors[0];
    const m1 = L.marker([a1.geo.lat, a1.geo.lng], {
      draggable: true,
      icon: createPinIcon('#0ea5e9', `Pin 1: ${a1.name}`),
      zIndexOffset: 1000,
    }).addTo(map);

    m1.on('drag', (e) => {
      const newPos = (e.target as L.Marker).getLatLng();
      onAnchorDrag(0, { lat: newPos.lat, lng: newPos.lng });
    });
    anchor1MarkerRef.current = m1;

    // Anchor 2
    const a2 = anchors[1];
    const m2 = L.marker([a2.geo.lat, a2.geo.lng], {
      draggable: true,
      icon: createPinIcon('#f59e0b', `Pin 2: ${a2.name}`),
      zIndexOffset: 1000,
    }).addTo(map);

    m2.on('drag', (e) => {
      const newPos = (e.target as L.Marker).getLatLng();
      onAnchorDrag(1, { lat: newPos.lat, lng: newPos.lng });
    });
    anchor2MarkerRef.current = m2;
  }, [anchors, showAnchors, isEditingPoints]);

  // Fit bounds helper
  const handleFitBounds = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const coords =
      snappedGeoRoute && snappedGeoRoute.length > 0 ? snappedGeoRoute : rawGeoRoute;
    if (coords.length === 0) return;

    const bbox = getGeoBoundingBox(coords);
    map.fitBounds(
      [
        [bbox.minLat, bbox.minLng],
        [bbox.maxLat, bbox.maxLng],
      ],
      { padding: [50, 50], maxZoom: 16 }
    );
  };

  useEffect(() => {
    if (rawGeoRoute.length > 0 && mapInstanceRef.current) {
      handleFitBounds();
    }
  }, [rawGeoRoute.length > 0]);

  return (
    <div className="relative w-full h-full min-h-[540px] bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-slate-700/60">
      {/* Leaflet map container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Map Control Bar (Unified Non-Overlapping Ribbon) */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left Toolbar: Basemap & Screenshot Overlay */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-700 shadow-xl text-xs text-slate-200">
          <div className="flex items-center gap-1 font-medium text-slate-300">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <select
            value={activeBasemapKey}
            onChange={(e) => setActiveBasemapKey(e.target.value as keyof typeof BASE_MAPS)}
            className="bg-slate-800 text-slate-100 rounded px-1.5 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer text-xs max-w-[130px]"
          >
            {Object.entries(BASE_MAPS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>

          <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

          {/* Screenshot Overlay Toggle */}
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs ${
              showOverlay
                ? 'bg-purple-600/40 text-purple-200 border border-purple-500/60 font-semibold'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Overlay original screenshot image on map to compare streets"
          >
            <ImageIcon className="w-3 h-3 text-purple-300" />
            <span>Overlay</span>
          </button>

          {showOverlay && (
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              className="w-14 accent-purple-500 cursor-pointer"
              title={`Overlay Opacity: ${Math.round(overlayOpacity * 100)}%`}
            />
          )}

          <button
            onClick={handleFitBounds}
            className="flex items-center gap-1 px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors text-xs"
            title="Fit view to route"
          >
            <Maximize2 className="w-3 h-3 text-slate-300" />
          </button>
        </div>

        {/* Right Toolbar: Edit Tools & Nudge Drawer Toggle */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-700 shadow-xl text-xs text-slate-200">
          {/* Edit Points Mode Button */}
          <button
            onClick={() => {
              setIsEditingPoints(!isEditingPoints);
              if (isDrawingNew) setIsDrawingNew(false);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs font-semibold ${
              isEditingPoints
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Drag and adjust route vertices directly on the roads"
          >
            <Edit3 className="w-3 h-3 text-sky-300" />
            <span>{isEditingPoints ? 'Done Editing' : 'Edit Points'}</span>
          </button>

          {/* Click to Draw on Map */}
          <button
            onClick={() => {
              setIsDrawingNew(!isDrawingNew);
              if (isEditingPoints) setIsEditingPoints(false);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs font-semibold ${
              isDrawingNew
                ? 'bg-emerald-600 text-white shadow-md animate-pulse'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Click on the map along roads to add route waypoints"
          >
            <PenTool className="w-3 h-3 text-emerald-300" />
            <span>{isDrawingNew ? 'Drawing...' : 'Draw'}</span>
          </button>

          {/* When in Click to Draw mode: Undo Last Point button */}
          {isDrawingNew && (
            <button
              onClick={() => {
                if (rawGeoRoute.length > 0 && onUpdateRouteCoords) {
                  onUpdateRouteCoords(rawGeoRoute.slice(0, -1));
                }
              }}
              disabled={rawGeoRoute.length === 0}
              className="flex items-center gap-1 px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-300 text-xs transition-colors"
              title="Undo last placed point"
            >
              <Undo2 className="w-3 h-3" />
              <span>Undo ({rawGeoRoute.length})</span>
            </button>
          )}

          {/* Clear Route / Start Fresh */}
          {onClearRoute && (
            <button
              onClick={() => {
                onClearRoute();
                setIsDrawingNew(true);
                setIsEditingPoints(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-rose-950/80 text-rose-300 border border-slate-700 hover:border-red-500/50 transition-colors text-xs"
              title="Remove existing line completely and start fresh"
            >
              <Trash2 className="w-3 h-3 text-rose-400" />
              <span>Clear</span>
            </button>
          )}

          {/* Restore Original Extracted Line */}
          {(isCustomRoute || rawGeoRoute.length === 0) && onRestoreOriginalRoute && (
            <button
              onClick={onRestoreOriginalRoute}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 hover:border-sky-500/50 transition-colors text-xs"
              title="Restore original extracted route from screenshot"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restore</span>
            </button>
          )}

          <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

          {/* Toggle Nudge & Rotate Popover */}
          <button
            onClick={() => setHudExpanded(!hudExpanded)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors text-xs font-semibold ${
              hudExpanded
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700'
            }`}
            title="Open on-map D-pad, rotation, and scaling panel"
          >
            <Sliders className="w-3 h-3" />
            <span>Nudge &amp; Rotate</span>
            {hudExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* FLOATING QUICK HUD POPOVER (Positioned cleanly below the top bar, no overlap!) */}
      {hudExpanded && (
        <div className="absolute top-14 right-3 z-[410] bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl rounded-xl p-3 flex flex-col gap-2.5 text-xs text-slate-200 w-[285px] animate-in fade-in slide-in-from-top-2 duration-150">
          {/* HUD Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200 text-xs">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Alignment &amp; Shape</span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Step size toggle */}
              <button
                onClick={() =>
                  setHudStepMeters(hudStepMeters === 10 ? 50 : hudStepMeters === 50 ? 200 : 10)
                }
                className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-emerald-400 font-mono text-[10px]"
                title="Change nudge distance"
              >
                {hudStepMeters}m
              </button>
              <button
                onClick={() => setHudExpanded(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-0.5">
            {/* Row 1: Pan D-Pad & Scale */}
            <div className="flex items-center justify-between gap-3">
              {/* Pan D-Pad with Hold-to-Repeat */}
              <div className="flex flex-col items-center">
                <HoldButton
                  onTrigger={() => onPan?.(0, hudStepMeters)}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-slate-200 transition-colors"
                  title={`Nudge North ${hudStepMeters}m (Hold to keep moving)`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </HoldButton>
                <div className="flex items-center gap-1 my-0.5">
                  <HoldButton
                    onTrigger={() => onPan?.(-hudStepMeters, 0)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-slate-200 transition-colors"
                    title={`Nudge West ${hudStepMeters}m (Hold to keep moving)`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </HoldButton>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/30 border border-emerald-500/50" />
                  <HoldButton
                    onTrigger={() => onPan?.(hudStepMeters, 0)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-slate-200 transition-colors"
                    title={`Nudge East ${hudStepMeters}m (Hold to keep moving)`}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </HoldButton>
                </div>
                <HoldButton
                  onTrigger={() => onPan?.(0, -hudStepMeters)}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-slate-200 transition-colors"
                  title={`Nudge South ${hudStepMeters}m (Hold to keep moving)`}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </HoldButton>
              </div>

              {/* Rotate & Scale buttons */}
              <div className="flex flex-col gap-2 flex-1">
                {/* Rotation with Step Selector & Hold-to-Repeat */}
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 mr-1">Rotate:</span>
                    {/* Step selector */}
                    <div className="flex items-center bg-slate-800 rounded p-0.5 border border-slate-700 text-[9px] font-mono">
                      {[1, 5, 15, 45].map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => setRotStepDeg(deg)}
                          className={`px-1 py-0.5 rounded transition-colors ${
                            rotStepDeg === deg
                              ? 'bg-sky-500 text-white font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {deg}&deg;
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <HoldButton
                      onTrigger={() => onRotate?.(-rotStepDeg)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-sky-600 text-sky-400 border border-slate-700 flex items-center gap-1 text-[11px] font-mono"
                      title={`Hold to spin counterclockwise by ${rotStepDeg}°`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>-{rotStepDeg}&deg;</span>
                    </HoldButton>

                    <HoldButton
                      onTrigger={() => onRotate?.(rotStepDeg)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-sky-600 text-sky-400 border border-slate-700 flex items-center gap-1 text-[11px] font-mono"
                      title={`Hold to spin clockwise by ${rotStepDeg}°`}
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>+{rotStepDeg}&deg;</span>
                    </HoldButton>

                    <button
                      type="button"
                      onClick={() => onRotate?.(90)}
                      className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-mono"
                      title="Quarter Turn Clockwise (+90°)"
                    >
                      90&deg;
                    </button>
                  </div>
                </div>

                {/* Scale with Hold-to-Repeat */}
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-[10px] text-slate-400 mr-1">Scale:</span>
                  <HoldButton
                    onTrigger={() => onScale?.(0.98)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-amber-400 border border-slate-700 flex items-center gap-1 text-[11px]"
                    title="Shrink 2% (Hold to zoom out)"
                  >
                    <ZoomOut className="w-3 h-3" />
                    <span>-2%</span>
                  </HoldButton>
                  <HoldButton
                    onTrigger={() => onScale?.(1.02)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-amber-400 border border-slate-700 flex items-center gap-1 text-[11px]"
                    title="Enlarge 2% (Hold to zoom in)"
                  >
                    <ZoomIn className="w-3 h-3" />
                    <span>+2%</span>
                  </HoldButton>
                </div>
              </div>
            </div>

            {/* Row 2: NON-UNIFORM STRETCH (Width vs Height) & SMOOTH */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium">Stretch W/H:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onStretch?.(0.98, 1.0)}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-[10px]"
                    title="Squash Width (East-West) by 2%"
                  >
                    W-
                  </button>
                  <button
                    type="button"
                    onClick={() => onStretch?.(1.02, 1.0)}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-mono text-[10px]"
                    title="Stretch Width (East-West) by 2%"
                  >
                    W+
                  </button>
                  <span className="text-slate-600 mx-0.5">|</span>
                  <button
                    type="button"
                    onClick={() => onStretch?.(1.0, 0.98)}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-[10px]"
                    title="Squash Height (North-South) by 2%"
                  >
                    H-
                  </button>
                  <button
                    type="button"
                    onClick={() => onStretch?.(1.0, 1.02)}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-mono text-[10px]"
                    title="Stretch Height (North-South) by 2%"
                  >
                    H+
                  </button>

                  {onSmooth && (
                    <button
                      type="button"
                      onClick={onSmooth}
                      className="ml-1 px-2 py-0.5 rounded bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 text-[10px] flex items-center gap-1"
                      title="Smooth jagged polyline curves"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                      <span>Smooth</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: FLIP OPTIONS (Horizontal, Vertical, Reverse Direction) */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Flip:
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={onFlipH}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-purple-900/40 text-purple-300 border border-slate-700 hover:border-purple-500/50 flex items-center gap-1 text-[11px] transition-colors"
                  title="Mirror horizontally (left-to-right)"
                >
                  <FlipHorizontal className="w-3 h-3" />
                  <span>Flip Horiz</span>
                </button>

                <button
                  onClick={onFlipV}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-purple-900/40 text-purple-300 border border-slate-700 hover:border-purple-500/50 flex items-center gap-1 text-[11px] transition-colors"
                  title="Mirror vertically (upside down)"
                >
                  <FlipVertical className="w-3 h-3" />
                  <span>Flip Vert</span>
                </button>

                <button
                  onClick={onFlipDirection}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-900/40 text-sky-300 border border-slate-700 hover:border-sky-500/50 flex items-center gap-1 text-[11px] transition-colors"
                  title="Swap start and finish points"
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  <span>Reverse</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Points / Drawing Hint Banner */}
      {isEditingPoints && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 bg-blue-950/95 border border-blue-500 text-blue-100 px-4 py-2 rounded-full shadow-2xl text-xs backdrop-blur-md">
          <Edit3 className="w-4 h-4 text-sky-400 animate-bounce" />
          <span>
            <strong>Waypoint Edit Mode:</strong> Drag the white circles along the roads to reshape the route!
          </span>
          <button
            onClick={() => setIsEditingPoints(false)}
            className="ml-2 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold"
          >
            Done
          </button>
        </div>
      )}

      {isDrawingNew && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 bg-emerald-950/95 border border-emerald-500 text-emerald-100 px-4 py-2 rounded-full shadow-2xl text-xs backdrop-blur-md">
          <PenTool className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>
            <strong>Click-to-Draw:</strong> Click on the map along roads to place route waypoints.
          </span>
          <button
            onClick={() => setIsDrawingNew(false)}
            className="ml-2 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
          >
            Done
          </button>
        </div>
      )}

      {/* Snapping Toast */}
      {isSnapping && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-4 py-2 rounded-full shadow-xl text-xs backdrop-blur-md animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          <span>Snapping GPS path to OpenStreetMap footways (OSRM)...</span>
        </div>
      )}

      {/* Empty Route Guidance Banner */}
      {rawGeoRoute.length === 0 && !isDrawingNew && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2.5 bg-slate-900/95 border border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl shadow-2xl text-xs backdrop-blur-md">
          <Trash2 className="w-4 h-4 text-rose-400" />
          <span>Route is clear. Start drawing along the roads or restore the original line.</span>
          <button
            onClick={() => setIsDrawingNew(true)}
            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            Start Drawing
          </button>
          {onRestoreOriginalRoute && (
            <button
              onClick={onRestoreOriginalRoute}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700"
            >
              Restore Original
            </button>
          )}
        </div>
      )}

      {/* Map Bottom Legend / Center Drag Hint */}
      <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-700 shadow-lg text-[11px] text-slate-300 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
          <Crosshair className="w-3.5 h-3.5" />
          <span>Green Center Pin = Drag whole route</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-700" />

        {activeView === 'both' ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-blue-500 rounded-full inline-block border-t border-dashed"></span>
              <span>Raw</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
              <span className="font-semibold text-emerald-400">Snapped</span>
            </div>
          </>
        ) : activeView === 'snapped' ? (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
            <span className="font-semibold text-emerald-400">Snapped</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 bg-orange-500 rounded-full inline-block"></span>
            <span className="font-semibold text-orange-400">Raw Path</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-slate-400 ml-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block text-[9px] text-center leading-none text-white font-bold"></span>
          <span>S</span>
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block text-[9px] text-center leading-none text-white font-bold ml-1"></span>
          <span>F</span>
        </div>
      </div>
    </div>
  );
};
