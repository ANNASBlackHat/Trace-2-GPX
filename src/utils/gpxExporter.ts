/**
 * GPX, KML, and GeoJSON exporters for GPS track data.
 * Outputs fully compliant standard GPX 1.1 format acceptable by Strava, Garmin Connect,
 * Suunto, Coros, Apple Health, Komoot, and AllTrails.
 */

import { GeoCoordinate, calculateRouteDistance } from './georeferencing';

export interface RouteExportOptions {
  name: string;
  activityType: 'running' | 'cycling' | 'hiking' | 'walking';
  paceMinPerKm: number; // e.g. 5.5 min/km for running, 2.5 min/km for cycling
  baseElevationMeters?: number;
  elevationGainFactor?: number; // 0 to 1
  startTime?: Date;
}

export interface RouteStats {
  distanceKm: number;
  distanceMiles: number;
  estimatedDurationSec: number;
  avgSpeedKmh: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  minElevationMeters: number;
  maxElevationMeters: number;
  pointCount: number;
}

/**
 * Computes elevation profile and stats along coordinates.
 */
export function enrichCoordinatesWithStats(
  coordinates: GeoCoordinate[],
  options: Partial<RouteExportOptions> = {}
): { enriched: GeoCoordinate[]; stats: RouteStats } {
  const baseEle = options.baseElevationMeters ?? 35;
  const gainFactor = options.elevationGainFactor ?? 0.35;
  const pace = options.paceMinPerKm ?? 5.5;

  let totalDistMeters = 0;
  let gain = 0;
  let loss = 0;

  const enriched: GeoCoordinate[] = [];
  let minEle = Infinity;
  let maxEle = -Infinity;

  for (let i = 0; i < coordinates.length; i++) {
    const pt = coordinates[i];
    if (i > 0) {
      const prev = coordinates[i - 1];
      const dLat = (pt.lat - prev.lat) * 111139;
      const dLng = (pt.lng - prev.lng) * 111139 * Math.cos((pt.lat * Math.PI) / 180);
      totalDistMeters += Math.hypot(dLat, dLng);
    }

    // Realistic natural undulation based on distance progression + coordinate hash
    const wave1 = Math.sin((totalDistMeters / 600) * Math.PI) * 18 * gainFactor;
    const wave2 = Math.cos((totalDistMeters / 250) * Math.PI) * 7 * gainFactor;
    const wave3 = Math.sin((pt.lat * 1000 + pt.lng * 1000)) * 4 * gainFactor;
    const ele = Math.round((baseEle + wave1 + wave2 + wave3) * 10) / 10;

    minEle = Math.min(minEle, ele);
    maxEle = Math.max(maxEle, ele);

    if (i > 0 && enriched[i - 1].ele !== undefined) {
      const diff = ele - enriched[i - 1].ele!;
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }

    enriched.push({
      lat: pt.lat,
      lng: pt.lng,
      ele,
    });
  }

  const distKm = totalDistMeters / 1000;
  const durationSec = Math.round(distKm * pace * 60);
  const avgSpeed = durationSec > 0 ? (distKm / (durationSec / 3600)) : 0;

  const stats: RouteStats = {
    distanceKm: Math.round(distKm * 100) / 100,
    distanceMiles: Math.round(distKm * 0.621371 * 100) / 100,
    estimatedDurationSec: durationSec,
    avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
    elevationGainMeters: Math.round(gain),
    elevationLossMeters: Math.round(loss),
    minElevationMeters: Math.round(minEle === Infinity ? 0 : minEle),
    maxElevationMeters: Math.round(maxEle === -Infinity ? 0 : maxEle),
    pointCount: coordinates.length,
  };

  return { enriched, stats };
}

/**
 * Builds valid GPX 1.1 XML string.
 */
export function buildGpxXml(
  coordinates: GeoCoordinate[],
  options: RouteExportOptions
): string {
  const { enriched } = enrichCoordinatesWithStats(coordinates, options);
  const startTime = options.startTime || new Date();
  const totalDist = calculateRouteDistance(coordinates);
  const totalSeconds = (totalDist / 1000) * options.paceMinPerKm * 60;

  let currentDist = 0;
  const trkpts: string[] = [];

  for (let i = 0; i < enriched.length; i++) {
    const pt = enriched[i];
    if (i > 0) {
      const prev = enriched[i - 1];
      const dLat = (pt.lat - prev.lat) * 111139;
      const dLng = (pt.lng - prev.lng) * 111139 * Math.cos((pt.lat * Math.PI) / 180);
      currentDist += Math.hypot(dLat, dLng);
    }

    const progress = totalDist > 0 ? currentDist / totalDist : 0;
    const timeMs = startTime.getTime() + progress * totalSeconds * 1000;
    const isoTime = new Date(timeMs).toISOString();

    trkpts.push(
      `      <trkpt lat="${pt.lat.toFixed(7)}" lon="${pt.lng.toFixed(7)}">` +
        `\n        <ele>${(pt.ele ?? 20).toFixed(1)}</ele>` +
        `\n        <time>${isoTime}</time>` +
        `\n      </trkpt>`
    );
  }

  const creator = 'Trace2GPX - https://github.com/google-gemini';
  const escapedName = escapeXml(options.name || 'Recovered GPS Route');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${creator}"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapedName}</name>
    <desc>Extracted from screenshot via Trace2GPX AI Studio</desc>
    <time>${startTime.toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapedName}</name>
    <type>${options.activityType.toUpperCase()}</type>
    <trkseg>
${trkpts.join('\n')}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Builds standard GeoJSON FeatureCollection.
 */
export function buildGeoJson(
  coordinates: GeoCoordinate[],
  name: string
): string {
  const lineStringCoords = coordinates.map((c) => [
    parseFloat(c.lng.toFixed(7)),
    parseFloat(c.lat.toFixed(7)),
    parseFloat((c.ele ?? 0).toFixed(1)),
  ]);

  const geoJson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name,
          source: 'Trace2GPX',
          pointCount: coordinates.length,
        },
        geometry: {
          type: 'LineString',
          coordinates: lineStringCoords,
        },
      },
    ],
  };

  return JSON.stringify(geoJson, null, 2);
}

/**
 * Builds KML 2.2 XML string for Google Earth.
 */
export function buildKml(
  coordinates: GeoCoordinate[],
  name: string
): string {
  const coordsString = coordinates
    .map((c) => `${c.lng.toFixed(7)},${c.lat.toFixed(7)},${(c.ele ?? 0).toFixed(1)}`)
    .join(' ');

  const escapedName = escapeXml(name);

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapedName}</name>
    <Style id="routeLine">
      <LineStyle>
        <color>ff024cfc</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>${escapedName}</name>
      <styleUrl>#routeLine</styleUrl>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>${coordsString}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Browser download helper for text/blobs.
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Formats duration in seconds to mm:ss or hh:mm:ss.
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}
