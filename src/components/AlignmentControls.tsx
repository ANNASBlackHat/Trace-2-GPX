import React, { useState } from 'react';
import {
  ControlPointAnchor,
  GeoreferenceTransform,
  adjustTransformPan,
  adjustTransformRotation,
  adjustTransformScale,
  GeoCoordinate,
} from '../utils/georeferencing';
import { geocodePlace, GeocodedPlace } from '../utils/osmGeocoding';
import { HoldButton } from '../utils/useHoldRepeat';
import {
  Compass,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  MapPin,
  Search,
  CheckCircle2,
  RefreshCw,
  GitBranch,
  Target,
  SlidersHorizontal,
  FlipHorizontal,
  FlipVertical,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Move,
  Trash2,
} from 'lucide-react';

export interface AlignmentControlsProps {
  anchors: [ControlPointAnchor, ControlPointAnchor] | null;
  transform: GeoreferenceTransform | null;
  onTransformChanged: (newTransform: GeoreferenceTransform) => void;
  imageDimensions: { width: number; height: number };
  verificationScore: number;
  // Gemini localization data
  geminiLocation: {
    city: string;
    area?: string;
    country: string;
    confidence: number;
    labels?: Array<{ name: string; type?: string }>;
    summary?: string;
    modelUsed?: string;
  } | null;
  isLocalizing: boolean;
  onReLocalize: () => void;
  onManualLocationSelect: (place: GeocodedPlace) => void;
  // Road snapping
  onSnapToRoads: () => void;
  isSnapping: boolean;
  snappedAvailable: boolean;
  activeView: 'both' | 'raw' | 'snapped';
  onActiveViewChange: (view: 'both' | 'raw' | 'snapped') => void;
  // Flip actions
  onFlipH?: () => void;
  onFlipV?: () => void;
  onFlipDirection?: () => void;
  // Non-uniform stretch & smooth
  onStretch?: (factorX: number, factorY: number) => void;
  onSmooth?: () => void;
  // Route reset & restore
  onClearRoute?: () => void;
  onRestoreOriginalRoute?: () => void;
  isCustomRoute?: boolean;
}

export const AlignmentControls: React.FC<AlignmentControlsProps> = ({
  anchors,
  transform,
  onTransformChanged,
  imageDimensions,
  verificationScore,
  geminiLocation,
  isLocalizing,
  onReLocalize,
  onManualLocationSelect,
  onSnapToRoads,
  isSnapping,
  snappedAvailable,
  activeView,
  onActiveViewChange,
  onFlipH,
  onFlipV,
  onFlipDirection,
  onStretch,
  onSmooth,
  onClearRoute,
  onRestoreOriginalRoute,
  isCustomRoute,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodedPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [stepMeters, setStepMeters] = useState(25);

  // Collapsible accordion states
  const [fineTuneOpen, setFineTuneOpen] = useState(true);
  const [snappingOpen, setSnappingOpen] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [showAnchorHelp, setShowAnchorHelp] = useState(false);
  const [rotStepDeg, setRotStepDeg] = useState(5);

  const centerPixel = {
    x: imageDimensions.width / 2 || 360,
    y: imageDimensions.height / 2 || 270,
  };

  // Nudge actions
  const handlePan = (dEast: number, dNorth: number) => {
    if (!transform) return;
    const updated = adjustTransformPan(transform, dEast, dNorth);
    onTransformChanged(updated);
  };

  const handleRotate = (deg: number) => {
    if (!transform) return;
    const updated = adjustTransformRotation(transform, deg, centerPixel);
    onTransformChanged(updated);
  };

  const handleScale = (factor: number) => {
    if (!transform) return;
    const updated = adjustTransformScale(transform, factor, centerPixel);
    onTransformChanged(updated);
  };

  // Manual Geocode Search
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await geocodePlace(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 text-slate-200 text-xs">
      {/* SECTION 1 (TOP): FINE-TUNE ALIGNMENT & FLIP (Always visible first!) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-lg backdrop-blur-md flex flex-col gap-3">
        <div
          onClick={() => setFineTuneOpen(!fineTuneOpen)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-100 text-sm">Fine-Tune Alignment</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">Step:</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStepMeters(stepMeters === 10 ? 50 : stepMeters === 50 ? 200 : 10);
              }}
              className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-emerald-400 font-mono text-[10px]"
            >
              {stepMeters}m
            </button>
            <div className="p-1 text-slate-400 hover:text-white">
              {fineTuneOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {fineTuneOpen && (
          <div className="flex flex-col gap-3 pt-1">
            {/* 3-column D-Pad, Rotate, and Scale */}
            <div className="grid grid-cols-3 gap-2">
              {/* Pan D-Pad with Hold-to-Repeat */}
              <div className="flex flex-col items-center justify-center p-2 bg-slate-950/80 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 mb-1">Pan</span>
                <HoldButton
                  onTrigger={() => handlePan(0, stepMeters)}
                  className="p-1.5 rounded hover:bg-slate-800 active:bg-emerald-600 text-slate-300 hover:text-white transition-colors"
                  title={`Pan North ${stepMeters}m (Hold to keep moving)`}
                >
                  <ArrowUp className="w-4 h-4" />
                </HoldButton>
                <div className="flex items-center gap-2">
                  <HoldButton
                    onTrigger={() => handlePan(-stepMeters, 0)}
                    className="p-1.5 rounded hover:bg-slate-800 active:bg-emerald-600 text-slate-300 hover:text-white transition-colors"
                    title={`Pan West ${stepMeters}m (Hold to keep moving)`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </HoldButton>
                  <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  <HoldButton
                    onTrigger={() => handlePan(stepMeters, 0)}
                    className="p-1.5 rounded hover:bg-slate-800 active:bg-emerald-600 text-slate-300 hover:text-white transition-colors"
                    title={`Pan East ${stepMeters}m (Hold to keep moving)`}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </HoldButton>
                </div>
                <HoldButton
                  onTrigger={() => handlePan(0, -stepMeters)}
                  className="p-1.5 rounded hover:bg-slate-800 active:bg-emerald-600 text-slate-300 hover:text-white transition-colors"
                  title={`Pan South ${stepMeters}m (Hold to keep moving)`}
                >
                  <ArrowDown className="w-4 h-4" />
                </HoldButton>
              </div>

              {/* Rotate Controls with Step Selector & Hold-to-Repeat */}
              <div className="flex flex-col items-center justify-between p-2 bg-slate-950/80 rounded-lg border border-slate-800 gap-1.5">
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] text-slate-400">Rotate</span>
                  {/* Step selector */}
                  <div className="flex items-center bg-slate-800 rounded p-0.5 border border-slate-700 text-[8px] font-mono">
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

                <div className="flex items-center gap-1.5 w-full justify-center">
                  <HoldButton
                    onTrigger={() => handleRotate(-rotStepDeg)}
                    className="flex-1 flex flex-col items-center py-1.5 px-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-sky-600 text-sky-400 border border-slate-700 transition-colors font-mono"
                    title={`Hold to spin counterclockwise by ${rotStepDeg}°`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="text-[9px] mt-0.5">-{rotStepDeg}&deg;</span>
                  </HoldButton>

                  <HoldButton
                    onTrigger={() => handleRotate(rotStepDeg)}
                    className="flex-1 flex flex-col items-center py-1.5 px-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-sky-600 text-sky-400 border border-slate-700 transition-colors font-mono"
                    title={`Hold to spin clockwise by ${rotStepDeg}°`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span className="text-[9px] mt-0.5">+{rotStepDeg}&deg;</span>
                  </HoldButton>
                </div>

                <button
                  type="button"
                  onClick={() => handleRotate(90)}
                  className="w-full py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[9px] font-mono text-center"
                  title="Quarter Turn Clockwise (+90°)"
                >
                  Turn +90&deg;
                </button>
              </div>

              {/* Scale Controls with Hold-to-Repeat */}
              <div className="flex flex-col items-center justify-center p-2 bg-slate-950/80 rounded-lg border border-slate-800 gap-2">
                <span className="text-[10px] text-slate-400">Scale</span>
                <div className="flex items-center gap-1.5">
                  <HoldButton
                    onTrigger={() => handleScale(0.98)}
                    className="flex flex-col items-center px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-amber-400 border border-slate-700 transition-colors"
                    title="Shrink 2% (Hold to zoom out)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                    <span className="text-[9px] mt-0.5">-2%</span>
                  </HoldButton>
                  <HoldButton
                    onTrigger={() => handleScale(1.02)}
                    className="flex flex-col items-center px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-amber-600 text-amber-400 border border-slate-700 transition-colors"
                    title="Enlarge 2% (Hold to zoom in)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span className="text-[9px] mt-0.5">+2%</span>
                  </HoldButton>
                </div>
              </div>
            </div>

            {/* FLIP ACTIONS ROW */}
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300">Flip Route:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onFlipH}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-purple-900/40 text-purple-300 border border-slate-700 hover:border-purple-500/50 flex items-center gap-1.5 transition-colors text-xs"
                  title="Flip route horizontally (mirror left-to-right)"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Flip Horiz</span>
                </button>

                <button
                  onClick={onFlipV}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-purple-900/40 text-purple-300 border border-slate-700 hover:border-purple-500/50 flex items-center gap-1.5 transition-colors text-xs"
                  title="Flip route vertically (mirror upside-down)"
                >
                  <FlipVertical className="w-3.5 h-3.5" />
                  <span>Flip Vert</span>
                </button>

                <button
                  onClick={onFlipDirection}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-900/40 text-sky-300 border border-slate-700 hover:border-sky-500/50 flex items-center gap-1.5 transition-colors text-xs"
                  title="Reverse track direction (swap Start and Finish)"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Reverse</span>
                </button>
              </div>
            </div>

            {/* STRETCH ASPECT RATIO (WIDTH & HEIGHT) & SMOOTH */}
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">
                  Stretch Shape (Aspect Ratio):
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onStretch?.(0.98, 1.0)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono"
                    title="Squash Width 2%"
                  >
                    Width -2%
                  </button>
                  <button
                    type="button"
                    onClick={() => onStretch?.(1.02, 1.0)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs font-mono"
                    title="Stretch Width 2%"
                  >
                    Width +2%
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Vertical Height:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onStretch?.(1.0, 0.98)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono"
                    title="Squash Height 2%"
                  >
                    Height -2%
                  </button>
                  <button
                    type="button"
                    onClick={() => onStretch?.(1.0, 1.02)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs font-mono"
                    title="Stretch Height 2%"
                  >
                    Height +2%
                  </button>
                  {onSmooth && (
                    <button
                      type="button"
                      onClick={onSmooth}
                      className="px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-700 text-xs flex items-center gap-1"
                      title="Smooth jagged edges"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      <span>Smooth</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Verification Match Score */}
            <div className="flex items-center justify-between bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="font-semibold text-slate-200">Verification Match</span>
                  <span className="text-[10px] text-slate-400 block">
                    Overlap with original screenshot trace
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      verificationScore > 80
                        ? 'bg-emerald-500'
                        : verificationScore > 50
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, verificationScore))}%` }}
                  />
                </div>
                <span
                  className={`font-bold font-mono text-sm ${
                    verificationScore > 80
                      ? 'text-emerald-400'
                      : verificationScore > 50
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {verificationScore}%
                </span>
              </div>
            </div>

            {/* Route Reset / Draw Fresh Management */}
            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-200 block text-xs">Route Line Action</span>
                <span className="text-[10px] text-slate-400">Clear messy line or restore original</span>
              </div>
              <div className="flex items-center gap-1.5">
                {onClearRoute && (
                  <button
                    type="button"
                    onClick={onClearRoute}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-rose-300 border border-slate-700 hover:border-rose-500/50 flex items-center gap-1.5 text-xs transition-colors"
                    title="Remove messy line and draw fresh along roads"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Clear Line</span>
                  </button>
                )}
                {onRestoreOriginalRoute && (
                  <button
                    type="button"
                    onClick={onRestoreOriginalRoute}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 hover:border-sky-500/50 flex items-center gap-1.5 text-xs transition-colors"
                    title="Restore line from screenshot"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                    <span>Restore</span>
                  </button>
                )}
              </div>
            </div>

            {/* Anchor Explanation Box */}
            <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50 flex flex-col gap-1">
              <div
                onClick={() => setShowAnchorHelp(!showAnchorHelp)}
                className="flex items-center justify-between cursor-pointer text-slate-400 hover:text-slate-200"
              >
                <div className="flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-medium text-[11px] text-slate-300">
                    What are the Anchor Pins for?
                  </span>
                </div>
                <span className="text-[10px] text-sky-400 underline">
                  {showAnchorHelp ? 'Hide' : 'Explain'}
                </span>
              </div>

              {showAnchorHelp && (
                <p className="text-[11px] text-slate-300 leading-relaxed pt-1 border-t border-slate-700/40 mt-1">
                  <strong>Pin 1 and Pin 2</strong> are two reference points used to calculate the
                  scale and orientation of your screenshot.
                  <br />
                  &bull; <strong>To move the whole route together:</strong> Drag the{' '}
                  <span className="text-emerald-400 font-semibold">Green Center Pin</span> on the
                  map or use the <strong>Pan arrows</strong> above.
                  <br />
                  &bull; <strong>To stretch/turn corners:</strong> Drag Pin 1 &amp; Pin 2.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: STREET SNAPPING (OSRM) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-lg backdrop-blur-md flex flex-col gap-2.5">
        <div
          onClick={() => setSnappingOpen(!snappingOpen)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400">
              <GitBranch className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-slate-100 text-sm">Street Snapping (OSRM)</span>
          </div>

          <div className="p-1 text-slate-400 hover:text-white">
            {snappingOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {snappingOpen && (
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Snap raw trace onto OpenStreetMap walking paths:
              </span>
              <button
                onClick={onSnapToRoads}
                disabled={isSnapping}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all shadow-sm ${
                  snappedAvailable
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/50'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isSnapping ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <GitBranch className="w-3.5 h-3.5" />
                )}
                <span>{isSnapping ? 'Snapping...' : snappedAvailable ? 'Re-Snap' : 'Snap to Roads'}</span>
              </button>
            </div>

            {snappedAvailable && (
              <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-xs">View Mode:</span>
                <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-md">
                  <button
                    onClick={() => onActiveViewChange('snapped')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      activeView === 'snapped'
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Snapped
                  </button>
                  <button
                    onClick={() => onActiveViewChange('both')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      activeView === 'both'
                        ? 'bg-slate-700 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Compare
                  </button>
                  <button
                    onClick={() => onActiveViewChange('raw')}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      activeView === 'raw'
                        ? 'bg-orange-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Raw Trace
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 3: AI VISION LOCALIZATION & SEARCH (Collapsible) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-lg backdrop-blur-md flex flex-col gap-2.5">
        <div
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-slate-100 text-sm">AI Vision &amp; Search</span>
              {geminiLocation && (
                <span className="text-[10px] text-emerald-400 block truncate max-w-[200px]">
                  {geminiLocation.city || geminiLocation.country}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReLocalize();
              }}
              disabled={isLocalizing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition-colors disabled:opacity-50"
            >
              {isLocalizing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              <span>{isLocalizing ? 'Analyzing...' : 'Identify AI'}</span>
            </button>
            <div className="p-1 text-slate-400 hover:text-white">
              {aiPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {aiPanelOpen && (
          <div className="flex flex-col gap-2.5 pt-1">
            {geminiLocation ? (
              <div className="bg-slate-950/90 rounded-lg p-2.5 border border-slate-800 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-bold text-slate-100 text-xs">
                      {[geminiLocation.area, geminiLocation.city, geminiLocation.country]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {geminiLocation.modelUsed && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-mono">
                        {geminiLocation.modelUsed}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-[9px]">
                      {Math.round(geminiLocation.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {geminiLocation.summary && (
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {geminiLocation.summary}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 italic">
                Click &ldquo;Identify AI&rdquo; or search a city below.
              </div>
            )}

            {/* Search Place Bar */}
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search city, park or landmark..."
                  className="w-full bg-slate-950/90 border border-slate-700 rounded-lg pl-8 pr-16 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="absolute right-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700"
                >
                  {isSearching ? '...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-800">
                  {searchResults.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        onManualLocationSelect(item);
                        setSearchResults([]);
                        setSearchQuery(item.displayName);
                      }}
                      className="w-full text-left p-2 hover:bg-slate-800 text-slate-200 transition-colors flex items-center justify-between"
                    >
                      <div className="truncate pr-2">
                        <div className="font-medium text-slate-100 text-xs">{item.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{item.displayName}</div>
                      </div>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                        {item.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            {/* Quick Jogja Location Presets */}
            <div className="flex flex-col gap-1 pt-1.5 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-medium">Quick Jogja Presets:</span>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onManualLocationSelect({
                      name: 'UGM / Sleman',
                      displayName: 'Universitas Gadjah Mada, Sleman, Yogyakarta',
                      lat: -7.7712,
                      lng: 110.3778,
                      type: 'university',
                    })
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-900/40 text-emerald-300 border border-slate-700 hover:border-emerald-500/50 text-[10px] transition-colors"
                >
                  📍 UGM / Sleman
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onManualLocationSelect({
                      name: 'Alun-Alun Kidul',
                      displayName: 'Alun-Alun Kidul, Kraton, Kota Yogyakarta',
                      lat: -7.8118,
                      lng: 110.3632,
                      type: 'park',
                    })
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-900/40 text-emerald-300 border border-slate-700 hover:border-emerald-500/50 text-[10px] transition-colors"
                >
                  📍 Alkid / Kraton
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onManualLocationSelect({
                      name: 'Malioboro / Tugu',
                      displayName: 'Jl. Malioboro, Tugu Yogyakarta',
                      lat: -7.7891,
                      lng: 110.3661,
                      type: 'street',
                    })
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-900/40 text-emerald-300 border border-slate-700 hover:border-emerald-500/50 text-[10px] transition-colors"
                >
                  📍 Malioboro / Tugu
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onManualLocationSelect({
                      name: 'Seturan / Babarsari',
                      displayName: 'Seturan, Caturtunggal, Depok, Sleman',
                      lat: -7.7745,
                      lng: 110.4085,
                      type: 'suburb',
                    })
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-900/40 text-emerald-300 border border-slate-700 hover:border-emerald-500/50 text-[10px] transition-colors"
                >
                  📍 Seturan / Babarsari
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
