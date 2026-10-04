import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { GeoCoordinate } from '../utils/georeferencing';
import {
  enrichCoordinatesWithStats,
  buildGpxXml,
  buildGeoJson,
  buildKml,
  triggerFileDownload,
  formatDuration,
  RouteExportOptions,
} from '../utils/gpxExporter';
import {
  Download,
  Share2,
  Copy,
  Check,
  TrendingUp,
  Clock,
  Gauge,
  Mountain,
  Navigation,
  FileCode,
  Flame,
  CheckCircle,
} from 'lucide-react';

export interface ExportPanelProps {
  coordinates: GeoCoordinate[];
  defaultName: string;
  locationName: string;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  coordinates,
  defaultName,
  locationName,
}) => {
  const [routeName, setRouteName] = useState(defaultName || 'Recovered GPS Route');
  const [activityType, setActivityType] = useState<'running' | 'cycling' | 'hiking' | 'walking'>('running');
  const [paceMinPerKm, setPaceMinPerKm] = useState(5.5);
  const [copied, setCopied] = useState(false);

  const exportOptions: RouteExportOptions = {
    name: routeName,
    activityType,
    paceMinPerKm,
    baseElevationMeters: 30,
    elevationGainFactor: 0.35,
  };

  const { enriched, stats } = enrichCoordinatesWithStats(coordinates, exportOptions);

  const handleDownloadGpx = () => {
    const xml = buildGpxXml(coordinates, exportOptions);
    const safeName = routeName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    triggerFileDownload(xml, `${safeName}.gpx`, 'application/gpx+xml');

    // Confetti celebration!
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#10b981', '#0ea5e9', '#f59e0b', '#ec4899'],
    });
  };

  const handleDownloadGeoJson = () => {
    const geoJson = buildGeoJson(coordinates, routeName);
    const safeName = routeName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    triggerFileDownload(geoJson, `${safeName}.geojson`, 'application/geo+json');
  };

  const handleDownloadKml = () => {
    const kml = buildKml(coordinates, routeName);
    const safeName = routeName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    triggerFileDownload(kml, `${safeName}.kml`, 'application/vnd.google-earth.kml+xml');
  };

  const handleCopyGpx = () => {
    const xml = buildGpxXml(coordinates, exportOptions);
    navigator.clipboard.writeText(xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Render SVG Elevation Profile
  const renderElevationProfile = () => {
    if (enriched.length < 2) return null;

    const width = 600;
    const height = 100;
    const padding = 15;

    const minEle = stats.minElevationMeters;
    const maxEle = Math.max(stats.maxElevationMeters, minEle + 5);
    const eleRange = maxEle - minEle;

    const points = enriched.map((pt, idx) => {
      const x = padding + (idx / (enriched.length - 1)) * (width - 2 * padding);
      const y =
        height -
        padding -
        (((pt.ele ?? minEle) - minEle) / eleRange) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const areaPoints = [
      `${padding},${height - padding}`,
      ...points,
      `${width - padding},${height - padding}`,
    ].join(' ');

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-24 overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#eleGrad)" />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div className="flex flex-col gap-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-md">
      {/* Route Key Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Distance</span>
            <Navigation className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {stats.distanceKm}
            </span>
            <span className="text-xs text-slate-400 ml-1">km</span>
            <span className="text-xs text-slate-500 block">
              ({stats.distanceMiles} miles)
            </span>
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Est. Duration</span>
            <Clock className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {formatDuration(stats.estimatedDurationSec)}
            </span>
            <span className="text-xs text-slate-400 block">
              at {paceMinPerKm.toFixed(1)} min/km
            </span>
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Elevation Gain</span>
            <Mountain className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              +{stats.elevationGainMeters}
            </span>
            <span className="text-xs text-slate-400 ml-1">m</span>
            <span className="text-xs text-slate-500 block">
              (+{Math.round(stats.elevationGainMeters * 3.28084)} ft)
            </span>
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Waypoints</span>
            <Gauge className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {stats.pointCount}
            </span>
            <span className="text-xs text-slate-400 ml-1">pts</span>
            <span className="text-xs text-slate-500 block">
              Avg Speed: {stats.avgSpeedKmh} km/h
            </span>
          </div>
        </div>
      </div>

      {/* Elevation Profile Chart */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-100">Elevation Profile</span>
          </div>
          <span className="text-slate-400 font-mono text-[11px]">
            {stats.minElevationMeters}m - {stats.maxElevationMeters}m range
          </span>
        </div>
        <div className="w-full bg-slate-900/90 rounded-lg p-2 border border-slate-800">
          {renderElevationProfile()}
        </div>
      </div>

      {/* Export Configuration Form & Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
        {/* Left: Metadata inputs */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Route Name</label>
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. Morning 10K Run"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Activity Type</label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="running">Running</option>
                <option value="cycling">Cycling</option>
                <option value="walking">Walking</option>
                <option value="hiking">Hiking</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Pace ({paceMinPerKm.toFixed(1)} min/km)
              </label>
              <input
                type="range"
                min="2.0"
                max="12.0"
                step="0.5"
                value={paceMinPerKm}
                onChange={(e) => setPaceMinPerKm(Number(e.target.value))}
                className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer mt-2"
              />
            </div>
          </div>
        </div>

        {/* Right: Export Action Buttons */}
        <div className="flex flex-col justify-end gap-2.5">
          {/* Main Primary Button: Download GPX */}
          <button
            onClick={handleDownloadGpx}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer group hover:scale-[1.01]"
          >
            <Download className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
            <span>Download GPX Track (.gpx)</span>
          </button>

          {/* Secondary Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleDownloadGeoJson}
              className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <FileCode className="w-3.5 h-3.5 text-sky-400" />
              <span>GeoJSON</span>
            </button>

            <button
              onClick={handleDownloadKml}
              className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-amber-400" />
              <span>KML (Earth)</span>
            </button>

            <button
              onClick={handleCopyGpx}
              className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy XML</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Instructions on where to import */}
      <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-slate-300 font-medium">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          Ready to import into:
        </span>
        <div className="flex items-center gap-3">
          <span className="hover:text-slate-200 transition-colors">Strava (Upload &gt; File)</span>
          <span>&bull;</span>
          <span className="hover:text-slate-200 transition-colors">Garmin Connect</span>
          <span>&bull;</span>
          <span className="hover:text-slate-200 transition-colors">Komoot</span>
          <span>&bull;</span>
          <span className="hover:text-slate-200 transition-colors">AllTrails</span>
          <span>&bull;</span>
          <span className="hover:text-slate-200 transition-colors">Apple Health</span>
        </div>
      </div>
    </div>
  );
};
