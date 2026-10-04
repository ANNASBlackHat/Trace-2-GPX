import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  COLOR_PRESETS,
  ColorFilterPreset,
  MaskFilterParams,
  extractRouteMask,
  zhangSuenThinning,
  traceSkeletonToPath,
  detectStartMarker,
  simplifyPath,
  PixelPoint,
  rgbToHsv,
} from '../utils/imageProcessing';
import {
  Pipette,
  Sliders,
  Sparkles,
  RotateCcw,
  CheckCircle,
  Eye,
  Layers,
  ArrowRightLeft,
  Activity,
  Repeat,
} from 'lucide-react';

export interface ImageMaskEditorProps {
  imageElement: HTMLImageElement | null;
  onPathExtracted: (
    path: PixelPoint[],
    mask: Uint8Array,
    width: number,
    height: number,
    imageData: ImageData
  ) => void;
  initialPresetId?: string;
}

export const ImageMaskEditor: React.FC<ImageMaskEditorProps> = ({
  imageElement,
  onPathExtracted,
  initialPresetId = 'strava-orange',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<'original' | 'mask' | 'skeleton' | 'path'>('skeleton');

  // Filter params
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPresetId);
  const [targetHue, setTargetHue] = useState<number>(18);
  const [hueTolerance, setHueTolerance] = useState<number>(22);
  const [minSaturation, setMinSaturation] = useState<number>(0.55);
  const [minValue, setMinValue] = useState<number>(0.45);
  const [customColorHex, setCustomColorHex] = useState<string>('#FC4C02');
  const [eyedropperActive, setEyedropperActive] = useState<boolean>(false);

  // Path tuning
  const [simplifyEpsilon, setSimplifyEpsilon] = useState<number>(1.5);
  const [isReversed, setIsReversed] = useState<boolean>(false);
  const [isOutAndBack, setIsOutAndBack] = useState<boolean>(false);

  // Cached state
  const [cachedMask, setCachedMask] = useState<Uint8Array | null>(null);
  const [cachedSkeleton, setCachedSkeleton] = useState<Uint8Array | null>(null);
  const [cachedPath, setCachedPath] = useState<PixelPoint[]>([]);
  const [detectedStart, setDetectedStart] = useState<PixelPoint | null>(null);
  const [pixelStats, setPixelStats] = useState<{
    maskPixels: number;
    skeletonPixels: number;
    pathPoints: number;
  }>({ maskPixels: 0, skeletonPixels: 0, pathPoints: 0 });

  // Update preset when changed
  const applyPreset = (preset: ColorFilterPreset) => {
    setSelectedPresetId(preset.id);
    setTargetHue(preset.targetHsv[0]);
    setHueTolerance(preset.hueTolerance);
    setMinSaturation(preset.minSaturation);
    setMinValue(preset.minValue);
    setCustomColorHex(preset.colorHex);
  };

  // Re-run extraction whenever image or parameters change
  const runExtraction = useCallback(() => {
    if (!imageElement || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = imageElement.naturalWidth || imageElement.width;
    const height = imageElement.naturalHeight || imageElement.height;

    canvas.width = width;
    canvas.height = height;

    // Draw source image
    ctx.drawImage(imageElement, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    // 1. Extract Binary Mask
    const params: MaskFilterParams = {
      targetHue,
      hueTolerance,
      minSaturation,
      minValue,
    };

    const { mask, pixelCount } = extractRouteMask(imageData, params);

    // 2. Zhang-Suen Thinning Skeleton
    const skeleton = zhangSuenThinning(mask, width, height);

    let skelCount = 0;
    for (let i = 0; i < skeleton.length; i++) {
      if (skeleton[i] === 1) skelCount++;
    }

    // Auto-detect green start icon if present
    const autoStart = detectStartMarker(imageData);
    setDetectedStart(autoStart);

    // 3. Trace skeleton into ordered path using smart graph walk
    let path = traceSkeletonToPath(skeleton, width, height, autoStart || undefined);

    // 4. Simplify with Douglas-Peucker
    if (simplifyEpsilon > 0 && path.length > 2) {
      path = simplifyPath(path, simplifyEpsilon);
    }

    // 5. Reverse if requested
    if (isReversed) {
      path = [...path].reverse();
    }

    // 6. Out and back
    if (isOutAndBack && path.length > 0) {
      const returnPath = [...path].slice(0, -1).reverse();
      path = [...path, ...returnPath];
    }

    setCachedMask(mask);
    setCachedSkeleton(skeleton);
    setCachedPath(path);
    setPixelStats({
      maskPixels: pixelCount,
      skeletonPixels: skelCount,
      pathPoints: path.length,
    });

    onPathExtracted(path, mask, width, height, imageData);
  }, [
    imageElement,
    targetHue,
    hueTolerance,
    minSaturation,
    minValue,
    simplifyEpsilon,
    isReversed,
    isOutAndBack,
  ]);

  // Initial and trigger extraction
  useEffect(() => {
    runExtraction();
  }, [runExtraction]);

  // Render active visualization tab onto canvas
  useEffect(() => {
    if (!imageElement || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (activeTab === 'original') {
      ctx.drawImage(imageElement, 0, 0, width, height);
    } else if (activeTab === 'mask') {
      // Draw black background and bright green/orange mask
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      if (cachedMask) {
        const maskImg = ctx.createImageData(width, height);
        for (let i = 0; i < cachedMask.length; i++) {
          if (cachedMask[i] === 1) {
            maskImg.data[i * 4] = 252;
            maskImg.data[i * 4 + 1] = 76;
            maskImg.data[i * 4 + 2] = 2;
            maskImg.data[i * 4 + 3] = 255;
          } else {
            maskImg.data[i * 4 + 3] = 255;
          }
        }
        ctx.putImageData(maskImg, 0, 0);
      }
    } else if (activeTab === 'skeleton') {
      // Draw dimmed original image with glowing magenta skeleton
      ctx.drawImage(imageElement, 0, 0, width, height);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fillRect(0, 0, width, height);

      if (cachedSkeleton) {
        ctx.fillStyle = '#ec4899'; // vivid pink/magenta skeleton
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (cachedSkeleton[y * width + x] === 1) {
              ctx.fillRect(x, y, 1.5, 1.5);
            }
          }
        }
      }
    } else if (activeTab === 'path') {
      // Draw dimmed original image with ordered vector path and directional markers
      ctx.drawImage(imageElement, 0, 0, width, height);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(0, 0, width, height);

      if (cachedPath.length > 1) {
        // Trace line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cachedPath[0].x, cachedPath[0].y);
        for (let i = 1; i < cachedPath.length; i++) {
          ctx.lineTo(cachedPath[i].x, cachedPath[i].y);
        }
        ctx.stroke();

        // Start point (Green circle)
        const start = cachedPath[0];
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(start.x, start.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // End point (Red circle)
        const end = cachedPath[cachedPath.length - 1];
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(end.x, end.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [activeTab, imageElement, cachedMask, cachedSkeleton, cachedPath]);

  // Eyedropper click handler
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropperActive || !canvasRef.current || !imageElement) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.drawImage(imageElement, 0, 0);
    const pixel = tempCtx.getImageData(x, y, 1, 1).data;

    const [h, s, v] = rgbToHsv(pixel[0], pixel[1], pixel[2]);
    const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2])
      .toString(16)
      .slice(1)}`;

    setTargetHue(Math.round(h));
    setMinSaturation(Math.max(0.3, Math.round((s - 0.2) * 100) / 100));
    setMinValue(Math.max(0.3, Math.round((v - 0.2) * 100) / 100));
    setCustomColorHex(hex);
    setSelectedPresetId('custom');
    setEyedropperActive(false);
  };

  return (
    <div className="flex flex-col xl:flex-row gap-5 w-full bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-md">
      {/* Left Column: Visual Canvas Viewer & Layer Switcher */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200">Shape Extraction Preview</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {pixelStats.pathPoints} vector vertices
            </span>
          </div>

          {/* Visualization Modes */}
          <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-lg border border-slate-700 text-xs">
            <button
              onClick={() => setActiveTab('original')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeTab === 'original'
                  ? 'bg-slate-700 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Original
            </button>
            <button
              onClick={() => setActiveTab('mask')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeTab === 'mask'
                  ? 'bg-orange-500/20 text-orange-300 font-medium border border-orange-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mask ({pixelStats.maskPixels.toLocaleString()} px)
            </button>
            <button
              onClick={() => setActiveTab('skeleton')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeTab === 'skeleton'
                  ? 'bg-pink-500/20 text-pink-300 font-medium border border-pink-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Skeleton ({pixelStats.skeletonPixels.toLocaleString()} px)
            </button>
            <button
              onClick={() => setActiveTab('path')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeTab === 'path'
                  ? 'bg-sky-500/20 text-sky-300 font-medium border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ordered Path
            </button>
          </div>
        </div>

        {/* Canvas Display */}
        <div className="relative flex-1 min-h-[360px] max-h-[520px] bg-slate-950/80 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={`max-w-full max-h-[500px] object-contain ${
              eyedropperActive ? 'cursor-crosshair ring-2 ring-emerald-500' : 'cursor-default'
            }`}
          />

          {eyedropperActive && (
            <div className="absolute top-3 left-3 bg-emerald-950/90 text-emerald-200 border border-emerald-500/50 px-3 py-1.5 rounded-lg text-xs shadow-lg backdrop-blur-md flex items-center gap-1.5 animate-pulse">
              <Pipette className="w-3.5 h-3.5 text-emerald-400" />
              <span>Click on the route line to sample its exact color</span>
            </div>
          )}
        </div>

        {/* Legend / Info footer */}
        <div className="flex items-center justify-between text-xs text-slate-400 mt-2 px-1">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Start
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Finish
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Activity className="w-3 h-3 text-pink-400" /> Zhang-Suen 1px Thinning
            </span>
            {detectedStart && (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle className="w-3 h-3 text-emerald-400" /> Auto-Start Pin ({detectedStart.x}, {detectedStart.y})
              </span>
            )}
          </div>
          <span>
            Resolution: {canvasRef.current?.width || 0} &times; {canvasRef.current?.height || 0}
          </span>
        </div>
      </div>

      {/* Right Column: Color Filter & Path Processing Controls */}
      <div className="w-full xl:w-80 flex flex-col gap-4 border-t xl:border-t-0 xl:border-l border-slate-800 pt-4 xl:pt-0 xl:pl-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>Route Color Filter</span>
          </h3>
          <button
            onClick={() => setEyedropperActive(!eyedropperActive)}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition-colors ${
              eyedropperActive
                ? 'bg-emerald-500 text-slate-900 border-emerald-400 font-semibold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Sample color from image"
          >
            <Pipette className="w-3.5 h-3.5" />
            <span>Eyedropper</span>
          </button>
        </div>

        {/* Brand Color Presets */}
        <div className="grid grid-cols-2 gap-1.5">
          {COLOR_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all ${
                  isSelected
                    ? 'bg-slate-800 border-emerald-500 ring-1 ring-emerald-500/50 shadow-sm'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: preset.colorHex }}
                />
                <div className="truncate">
                  <div className="font-medium text-slate-200 truncate">{preset.name}</div>
                  <div className="text-[10px] text-slate-500">{preset.brand}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Sliders */}
        <div className="space-y-3 pt-2 text-xs">
          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Target Hue ({targetHue}&deg;)</span>
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: `hsl(${targetHue}, 100%, 50%)` }}
              />
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={targetHue}
              onChange={(e) => {
                setTargetHue(Number(e.target.value));
                setSelectedPresetId('custom');
              }}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Hue Tolerance (&plusmn;{hueTolerance}&deg;)</span>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              value={hueTolerance}
              onChange={(e) => setHueTolerance(Number(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Min Saturation ({Math.round(minSaturation * 100)}%)</span>
              <span className="text-slate-500">Filters grey map roads</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={minSaturation}
              onChange={(e) => setMinSaturation(Number(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Path Simplification (Douglas-Peucker: {simplifyEpsilon}px)</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="6"
              step="0.5"
              value={simplifyEpsilon}
              onChange={(e) => setSimplifyEpsilon(Number(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Path Direction & Mode Toggles */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <div className="text-xs font-semibold text-slate-300 mb-1.5">Route Options</div>

          <button
            onClick={() => setIsReversed(!isReversed)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
              isReversed
                ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
              <span>Reverse Direction</span>
            </span>
            <span className="text-[11px] text-slate-400">{isReversed ? 'Reversed' : 'Standard'}</span>
          </button>

          <button
            onClick={() => setIsOutAndBack(!isOutAndBack)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
              isOutAndBack
                ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <Repeat className="w-3.5 h-3.5 text-purple-400" />
              <span>Mark as Out-and-Back</span>
            </span>
            <span className="text-[11px] text-slate-400">{isOutAndBack ? 'Active' : 'Off'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
