/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SAMPLE_ROUTES, SampleRoute, generateSampleImageDataUrl } from './data/sampleRoutes';
import { PixelPoint } from './utils/imageProcessing';
import {
  ControlPointAnchor,
  GeoreferenceTransform,
  GeoCoordinate,
  solveTwoPointTransform,
  transformPathToGeo,
  calculateVerificationScore,
  pixelToLatLng,
  adjustTransformPan,
  adjustTransformRotation,
  adjustTransformScale,
  stretchGeoRoute,
  smoothGeoRoute,
  createCalibratedAnchors,
} from './utils/georeferencing';
import { snapRouteToRoads, GeocodedPlace, resolveGroundControlAnchors } from './utils/osmGeocoding';
import { ImageMaskEditor } from './components/ImageMaskEditor';
import { InteractiveMap } from './components/InteractiveMap';
import { AlignmentControls } from './components/AlignmentControls';
import { ExportPanel } from './components/ExportPanel';
import {
  Upload,
  Compass,
  MapPin,
  Layers,
  Sparkles,
  GitBranch,
  Download,
  Info,
  CheckCircle2,
  AlertCircle,
  FileImage,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Clipboard,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function App() {
  // Navigation / Wizard step
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Active image state
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('');
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({
    width: 720,
    height: 540,
  });
  const [activeSampleId, setActiveSampleId] = useState<string>('ugm-jogja');

  // Extracted route state
  const [extractedPixelPath, setExtractedPixelPath] = useState<PixelPoint[]>([]);
  const [binaryMask, setBinaryMask] = useState<Uint8Array | null>(null);

  // Georeferencing state
  const [anchors, setAnchors] = useState<[ControlPointAnchor, ControlPointAnchor] | null>(null);
  const [transform, setTransform] = useState<GeoreferenceTransform | null>(null);
  const [rawGeoRoute, setRawGeoRoute] = useState<GeoCoordinate[]>([]);
  const [snappedGeoRoute, setSnappedGeoRoute] = useState<GeoCoordinate[] | null>(null);
  const [activeView, setActiveView] = useState<'both' | 'raw' | 'snapped'>('raw');
  const [verificationScore, setVerificationScore] = useState<number>(0);
  const [isCustomRoute, setIsCustomRoute] = useState<boolean>(false);

  // AI & Geocoding states
  const [geminiLocation, setGeminiLocation] = useState<{
    city: string;
    area?: string;
    country: string;
    confidence: number;
    labels?: Array<{ name: string; type?: string }>;
    summary?: string;
    modelUsed?: string;
  } | null>(null);
  const [isLocalizing, setIsLocalizing] = useState<boolean>(false);
  const [isSnapping, setIsSnapping] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load a sample route
  const loadSample = useCallback((sample: SampleRoute) => {
    setActiveSampleId(sample.id);
    setIsCustomRoute(false);
    const dataUrl = generateSampleImageDataUrl(sample, 720, 540);
    setScreenshotDataUrl(dataUrl);

    const img = new Image();
    img.onload = () => {
      setImageElement(img);
      setImageDimensions({ width: img.naturalWidth || 720, height: img.naturalHeight || 540 });

      // Setup initial anchors for this sample
      const w = img.naturalWidth || 720;
      const h = img.naturalHeight || 540;

      const a1: ControlPointAnchor = {
        id: 'anchor-1',
        name: sample.anchors[0].name,
        pixel: {
          x: Math.round(w * sample.anchors[0].pixelPercent.x),
          y: Math.round(h * sample.anchors[0].pixelPercent.y),
        },
        geo: sample.anchors[0].geo,
      };

      const a2: ControlPointAnchor = {
        id: 'anchor-2',
        name: sample.anchors[1].name,
        pixel: {
          x: Math.round(w * sample.anchors[1].pixelPercent.x),
          y: Math.round(h * sample.anchors[1].pixelPercent.y),
        },
        geo: sample.anchors[1].geo,
      };

      setAnchors([a1, a2]);
      const solved = solveTwoPointTransform(a1, a2);
      setTransform(solved);

      // Prepopulate AI location info for sample
      setGeminiLocation({
        city: sample.location.split(',')[0],
        area: sample.title,
        country: sample.location.split(',').pop()?.trim() || '',
        confidence: 0.98,
        summary: `Pre-calibrated ground truth for ${sample.title} (${sample.appBrand}).`,
      });
      setSnappedGeoRoute(null);
      setActiveView('raw');
    };
    img.src = dataUrl;
  }, []);

  // Initial load with default sample
  useEffect(() => {
    loadSample(SAMPLE_ROUTES[0]);
  }, [loadSample]);

  // Handle image file upload (drag & drop or input)
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }

    setErrorMessage(null);
    setActiveSampleId('');
    setIsCustomRoute(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setScreenshotDataUrl(dataUrl);

      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setImageElement(img);
        setImageDimensions({ width: w, height: h });

        // Default calibrated anchors centered in Yogyakarta, Indonesia (scale ~3.5 m/px, North-Up)
        const initialAnchors = createCalibratedAnchors(
          { lat: -7.785, lng: 110.375 },
          3.5,
          w,
          h,
          'Jogja'
        );

        setAnchors(initialAnchors);
        const solved = solveTwoPointTransform(initialAnchors[0], initialAnchors[1]);
        setTransform(solved);
        setSnappedGeoRoute(null);
        setActiveView('raw');

        // Automatically trigger AI localization for new uploads!
        triggerGeminiLocalization(dataUrl, file.type);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Clipboard paste listener (Cmd+V / Ctrl+V screenshot)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileUpload(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Update georeferenced route when pixel path or transform changes
  useEffect(() => {
    if (extractedPixelPath.length > 0 && transform && !isCustomRoute) {
      const geo = transformPathToGeo(extractedPixelPath, transform);
      setRawGeoRoute(geo);

      // Calculate verification overlap score
      if (binaryMask && imageDimensions.width > 0 && imageDimensions.height > 0) {
        const result = calculateVerificationScore(
          geo,
          transform,
          binaryMask,
          imageDimensions.width,
          imageDimensions.height
        );
        setVerificationScore(result.score);
      }
    }
  }, [extractedPixelPath, transform, binaryMask, imageDimensions, isCustomRoute]);

  // Recalculate transform when an anchor is dragged on map
  const handleAnchorDrag = (anchorIndex: 0 | 1, newGeo: GeoCoordinate) => {
    if (!anchors) return;
    const updatedAnchors: [ControlPointAnchor, ControlPointAnchor] = [
      { ...anchors[0] },
      { ...anchors[1] },
    ];
    updatedAnchors[anchorIndex].geo = newGeo;
    setAnchors(updatedAnchors);

    const newTransform = solveTwoPointTransform(updatedAnchors[0], updatedAnchors[1]);
    setTransform(newTransform);
  };

  const centerPixel = {
    x: (imageDimensions.width || 720) / 2,
    y: (imageDimensions.height || 540) / 2,
  };

  // Direct map transformation handlers
  const handlePan = (dEastMeters: number, dNorthMeters: number) => {
    if (!transform) return;
    const updated = adjustTransformPan(transform, dEastMeters, dNorthMeters);
    setTransform(updated);
  };

  const handleRotate = (deg: number) => {
    if (!transform) return;
    const updated = adjustTransformRotation(transform, deg, centerPixel);
    setTransform(updated);
  };

  const handleScale = (factor: number) => {
    if (!transform) return;
    const updated = adjustTransformScale(transform, factor, centerPixel);
    setTransform(updated);
  };

  const handleFlipHorizontal = () => {
    const w = imageDimensions.width || 720;
    setExtractedPixelPath((prev) => prev.map((p) => ({ x: w - p.x, y: p.y })));
    setSnappedGeoRoute(null);
  };

  const handleFlipVertical = () => {
    const h = imageDimensions.height || 540;
    setExtractedPixelPath((prev) => prev.map((p) => ({ x: p.x, y: h - p.y })));
    setSnappedGeoRoute(null);
  };

  const handleFlipDirection = () => {
    setExtractedPixelPath((prev) => [...prev].reverse());
    if (snappedGeoRoute) {
      setSnappedGeoRoute((prev) => (prev ? [...prev].reverse() : null));
    }
  };

  const handleStretch = (factorX: number, factorY: number) => {
    setIsCustomRoute(true);
    setRawGeoRoute((prev) => stretchGeoRoute(prev, factorX, factorY));
    setSnappedGeoRoute(null);
  };

  const handleSmooth = () => {
    setIsCustomRoute(true);
    setRawGeoRoute((prev) => smoothGeoRoute(prev, 1));
    setSnappedGeoRoute(null);
  };

  const handleUpdateRouteCoords = (newCoords: GeoCoordinate[]) => {
    setIsCustomRoute(true);
    setRawGeoRoute(newCoords);
    setSnappedGeoRoute(null);
  };

  const handleClearRoute = () => {
    setIsCustomRoute(true);
    setRawGeoRoute([]);
    setSnappedGeoRoute(null);
  };

  const handleRestoreOriginalRoute = () => {
    setIsCustomRoute(false);
    if (extractedPixelPath.length > 0 && transform) {
      const geo = transformPathToGeo(extractedPixelPath, transform);
      setRawGeoRoute(geo);
      setSnappedGeoRoute(null);
    }
  };

  const handleRouteCenterDrag = (deltaLat: number, deltaLng: number) => {
    if (!anchors) return;
    const updatedAnchors: [ControlPointAnchor, ControlPointAnchor] = [
      {
        ...anchors[0],
        geo: {
          lat: anchors[0].geo.lat + deltaLat,
          lng: anchors[0].geo.lng + deltaLng,
        },
      },
      {
        ...anchors[1],
        geo: {
          lat: anchors[1].geo.lat + deltaLat,
          lng: anchors[1].geo.lng + deltaLng,
        },
      },
    ];
    setAnchors(updatedAnchors);
    const newTransform = solveTwoPointTransform(updatedAnchors[0], updatedAnchors[1]);
    setTransform(newTransform);
  };

  // Callback when ImageMaskEditor extracts path
  const handlePathExtracted = (
    path: PixelPoint[],
    mask: Uint8Array,
    width: number,
    height: number
  ) => {
    setIsCustomRoute(false);
    setExtractedPixelPath(path);
    setBinaryMask(mask);
    setImageDimensions({ width, height });
  };

  // Call Gemini API server proxy
  const triggerGeminiLocalization = async (dataUrl?: string, mimeType = 'image/jpeg') => {
    const targetUrl = dataUrl || screenshotDataUrl;
    if (!targetUrl) return;

    setIsLocalizing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/localize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: targetUrl,
          mimeType,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${res.status}`);
      }

      const { result, modelUsed } = await res.json();
      setGeminiLocation({ ...result, modelUsed });

      // Automatically resolve ground control anchors from visual map labels
      if (result.estimatedCenterLat && result.estimatedCenterLng) {
        const clat = result.estimatedCenterLat;
        const clng = result.estimatedCenterLng;
        const areaContext = [result.area, result.city, result.country].filter(Boolean).join(', ');

        const w = imageDimensions.width || 720;
        const h = imageDimensions.height || 540;

        const resolved = await resolveGroundControlAnchors(
          result.labels || [],
          w,
          h,
          areaContext,
          { lat: clat, lng: clng },
          result.suggestedZoom || 15
        );

        setAnchors(resolved.anchors);
        const solved = solveTwoPointTransform(resolved.anchors[0], resolved.anchors[1]);
        setTransform(solved);
      }
    } catch (err: any) {
      console.warn('Gemini localization notice:', err.message);
      // Non-fatal: user can still position anchors manually or search city
      setErrorMessage(
        'Gemini localization notice: ' +
          err.message +
          '. You can manually search for your city or drag the anchor pins.'
      );
    } finally {
      setIsLocalizing(false);
    }
  };

  // Manual location select from search bar
  const handleManualLocationSelect = (place: GeocodedPlace) => {
    const clat = place.lat;
    const clng = place.lng;
    const w = imageDimensions.width || 720;
    const h = imageDimensions.height || 540;

    const updatedAnchors = createCalibratedAnchors(
      { lat: clat, lng: clng },
      3.5,
      w,
      h,
      place.name
    );

    setAnchors(updatedAnchors);
    const solved = solveTwoPointTransform(updatedAnchors[0], updatedAnchors[1]);
    setTransform(solved);

    setGeminiLocation({
      city: place.name,
      country: place.displayName,
      confidence: 0.9,
      summary: `Manual alignment centered on ${place.displayName}.`,
    });
  };

  // Road snapping with OSRM
  const handleSnapToRoads = async () => {
    if (rawGeoRoute.length < 2) return;
    setIsSnapping(true);
    try {
      const result = await snapRouteToRoads(rawGeoRoute, 120);
      if (result.success && result.snappedCoordinates.length > 0) {
        setSnappedGeoRoute(result.snappedCoordinates);
        setActiveView('snapped');
      } else {
        setSnappedGeoRoute(rawGeoRoute);
        setActiveView('raw');
      }
    } catch (e) {
      console.error('Road snapping error:', e);
    } finally {
      setIsSnapping(false);
    }
  };

  const activeSample = SAMPLE_ROUTES.find((s) => s.id === activeSampleId);
  const locationLabel = geminiLocation
    ? [geminiLocation.area, geminiLocation.city, geminiLocation.country].filter(Boolean).join(', ')
    : activeSample?.location || 'Unknown Location';

  const routeForExport =
    activeView === 'snapped' && snappedGeoRoute && snappedGeoRoute.length > 0
      ? snappedGeoRoute
      : rawGeoRoute;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 lg:px-8 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 via-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Compass className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                Trace2GPX
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                  AI-Powered
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400">
              Convert route screenshots into georeferenced GPX files
            </p>
          </div>
        </div>

        {/* Wizard Step Selector */}
        <div className="hidden md:flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setActiveStep(1)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeStep === 1
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">
              1
            </span>
            <span>Shape Extraction</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <button
            onClick={() => setActiveStep(2)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeStep === 2
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">
              2
            </span>
            <span>Map Alignment &amp; AI</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <button
            onClick={() => setActiveStep(3)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeStep === 3
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">
              3
            </span>
            <span>Export GPX</span>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* File Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Upload Screenshot</span>
          </button>

          {/* Info Modal Button */}
          <button
            onClick={() => setShowInfoModal(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors"
            title="How it works"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main App Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 flex flex-col gap-6">
        {/* Sample Routes Picker Bar */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Try sample GPS screenshots:</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {SAMPLE_ROUTES.map((sample) => {
              const isSelected = activeSampleId === sample.id;
              return (
                <button
                  key={sample.id}
                  onClick={() => loadSample(sample)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-slate-800 text-slate-100 border-emerald-500 ring-1 ring-emerald-500/50 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: sample.defaultColorHex }}
                  />
                  <span>{sample.title}</span>
                  <span className="text-[10px] text-slate-500 hidden lg:inline">
                    ({sample.appBrand})
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500 hidden xl:flex items-center gap-1.5">
            <Clipboard className="w-3.5 h-3.5 text-slate-400" />
            <span>Tip: Paste screenshot with Cmd+V</span>
          </div>
        </div>

        {/* Error Notification Banner if any */}
        {errorMessage && (
          <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl p-3 flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-amber-400 hover:text-amber-200 font-bold ml-2"
            >
              &times;
            </button>
          </div>
        )}

        {/* Tab 1: Shape Extraction & Skeletonization */}
        {activeStep === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-mono">
                    1
                  </span>
                  Route Masking &amp; Zhang-Suen Thinning
                </h2>
                <p className="text-xs text-slate-400">
                  Isolate the colored GPS line using HSV thresholding, thin to a 1px topological skeleton, and extract ordered vector vertices.
                </p>
              </div>

              <button
                onClick={() => setActiveStep(2)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-950/40 cursor-pointer"
              >
                <span>Continue to Map Alignment</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <ImageMaskEditor
              imageElement={imageElement}
              onPathExtracted={handlePathExtracted}
              initialPresetId={activeSample?.colorPresetId || 'strava-orange'}
            />
          </div>
        )}

        {/* Tab 2: Map Alignment & AI Localization */}
        {activeStep === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-mono">
                    2
                  </span>
                  Map Georeferencing &amp; Street Snapping
                </h2>
                <p className="text-xs text-slate-400">
                  Anchor 1 and Anchor 2 allow 2-point conformal transformation. Drag pins on map or fine-tune with the pad below.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveStep(1)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  &larr; Back to Trace
                </button>
                <button
                  onClick={() => setActiveStep(3)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-950/40 cursor-pointer"
                >
                  <span>Review &amp; Export GPX</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left / Center: Interactive Leaflet Map */}
              <div className="lg:col-span-8 flex flex-col gap-3">
                <div className="h-[560px] w-full">
                  <InteractiveMap
                    rawGeoRoute={rawGeoRoute}
                    snappedGeoRoute={snappedGeoRoute}
                    activeView={activeView}
                    anchors={anchors}
                    onAnchorDrag={handleAnchorDrag}
                    onPan={handlePan}
                    onRotate={handleRotate}
                    onScale={handleScale}
                    onFlipH={handleFlipHorizontal}
                    onFlipV={handleFlipVertical}
                    onFlipDirection={handleFlipDirection}
                    onStretch={handleStretch}
                    onSmooth={handleSmooth}
                    onRouteCenterDrag={handleRouteCenterDrag}
                    onUpdateRouteCoords={handleUpdateRouteCoords}
                    onClearRoute={handleClearRoute}
                    onRestoreOriginalRoute={handleRestoreOriginalRoute}
                    isCustomRoute={isCustomRoute}
                    screenshotDataUrl={screenshotDataUrl}
                    imageDimensions={imageDimensions}
                    transform={transform}
                    isSnapping={isSnapping}
                  />
                </div>
              </div>

              {/* Right: Alignment Controls & AI Localization */}
              <div className="lg:col-span-4">
                <AlignmentControls
                  anchors={anchors}
                  transform={transform}
                  onTransformChanged={(newT) => setTransform(newT)}
                  imageDimensions={imageDimensions}
                  verificationScore={verificationScore}
                  geminiLocation={geminiLocation}
                  isLocalizing={isLocalizing}
                  onReLocalize={() => triggerGeminiLocalization()}
                  onManualLocationSelect={handleManualLocationSelect}
                  onSnapToRoads={handleSnapToRoads}
                  isSnapping={isSnapping}
                  snappedAvailable={Boolean(snappedGeoRoute && snappedGeoRoute.length > 0)}
                  activeView={activeView}
                  onActiveViewChange={setActiveView}
                  onFlipH={handleFlipHorizontal}
                  onFlipV={handleFlipVertical}
                  onFlipDirection={handleFlipDirection}
                  onStretch={handleStretch}
                  onSmooth={handleSmooth}
                  onClearRoute={handleClearRoute}
                  onRestoreOriginalRoute={handleRestoreOriginalRoute}
                  isCustomRoute={isCustomRoute}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Review, Elevation & GPX Export */}
        {activeStep === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-mono">
                    3
                  </span>
                  Route Inspection &amp; GPX Export
                </h2>
                <p className="text-xs text-slate-400">
                  Ready for instant download. Fully compatible with Strava, Garmin, Suunto, Coros, Komoot, and Apple Health.
                </p>
              </div>

              <button
                onClick={() => setActiveStep(2)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
              >
                &larr; Adjust Map Alignment
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Mini Map Preview */}
              <div className="lg:col-span-5 h-[420px]">
                <InteractiveMap
                  rawGeoRoute={rawGeoRoute}
                  snappedGeoRoute={snappedGeoRoute}
                  activeView={activeView}
                  anchors={null} // hide anchors on clean export preview
                  onAnchorDrag={() => {}}
                  screenshotDataUrl={screenshotDataUrl}
                  imageDimensions={imageDimensions}
                  transform={transform}
                  isSnapping={isSnapping}
                />
              </div>

              {/* Export Panel & Stats */}
              <div className="lg:col-span-7">
                <ExportPanel
                  coordinates={routeForExport}
                  defaultName={activeSample?.title || geminiLocation?.area || 'Extracted GPS Track'}
                  locationName={locationLabel}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Info / Architecture Drawer Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-200 text-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-100 text-sm">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>How Trace2GPX Converts Screenshots to Real GPS</span>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3.5 text-slate-300 leading-relaxed">
              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <strong className="text-slate-100 block">Deterministic Shape Extraction (No LLM Hallucinations)</strong>
                  HSV color thresholding isolates the route line (Strava Orange, Garmin Cyan, Nike Volt). The Zhang-Suen thinning algorithm erodes it into a strict 1-pixel topological skeleton, followed by graph traversal and Douglas-Peucker vectorization.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <strong className="text-slate-100 block">AI Vision Map Localization</strong>
                  Gemini vision inspects the basemap screenshot for readable road labels, body of water shapes, and park landmarks to detect the city and bounding coordinates.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <strong className="text-slate-100 block">2-Point Conformal Similitude Transform</strong>
                  Closed-form mathematical fit between pixel space $(x, y)$ and Web Mercator meters $(X, Y)$ preserves true angles and scale without distortion. Two draggable anchors let you visually lock the route onto roads.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <strong className="text-slate-100 block">Street Snapping &amp; GPX 1.1 Standard Export</strong>
                  Public OSRM footway router snaps the line directly to real OpenStreetMap paths. Downloads compliant GPX with elevation profiles and realistic workout timestamps.
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
              >
                Got it, let&apos;s trace!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
