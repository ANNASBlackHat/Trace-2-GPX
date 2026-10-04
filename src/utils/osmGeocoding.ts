/**
 * OSM Geocoding (Nominatim / Photon) and Road Snapping (OSRM) integration.
 * Respects rate limits, includes timeouts and smooth fallbacks.
 */

import {
  GeoCoordinate,
  ControlPointAnchor,
  solveTwoPointTransform,
  createCalibratedAnchors,
  zoomToMetersPerPixel,
  haversineDistance,
} from './georeferencing';
import { PixelPoint } from './imageProcessing';

export interface GeocodedPlace {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  type: string;
  importance?: number;
}

const JOGJA_COORDINATES = { lat: -7.7956, lng: 110.3695 };

/**
 * Searches a place name using OpenStreetMap Nominatim or Photon API.
 * Defaults search prioritization to Yogyakarta (Jogja), Indonesia.
 */
export async function geocodePlace(
  query: string,
  nearCoordinates?: { lat: number; lng: number }
): Promise<GeocodedPlace[]> {
  const targetNear = nearCoordinates || JOGJA_COORDINATES;

  try {
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&limit=5`;

    // Prioritize results near target coordinates (~60km bounding box around Jogja / DIY)
    const delta = 0.6;
    url += `&viewbox=${targetNear.lng - delta},${targetNear.lat + delta},${
      targetNear.lng + delta
    },${targetNear.lat - delta}&bounded=0`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      // Fallback to Photon
      return searchPhoton(query, nearCoordinates);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return searchPhoton(query, nearCoordinates);
    }

    return data.map((item: any) => ({
      name: item.name || item.display_name.split(',')[0],
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type || item.class || 'place',
      importance: item.importance,
    }));
  } catch (err) {
    console.warn('Nominatim geocode failed, trying Photon fallback:', err);
    return searchPhoton(query, nearCoordinates);
  }
}

async function searchPhoton(
  query: string,
  nearCoordinates?: { lat: number; lng: number }
): Promise<GeocodedPlace[]> {
  try {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
    if (nearCoordinates) {
      url += `&lat=${nearCoordinates.lat}&lon=${nearCoordinates.lng}`;
    }

    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.features || !Array.isArray(data.features)) return [];

    return data.features.map((f: any) => {
      const [lng, lat] = f.geometry.coordinates;
      const props = f.properties || {};
      const name = props.name || props.street || query;
      const details = [props.name, props.city, props.country].filter(Boolean).join(', ');
      return {
        name,
        displayName: details || name,
        lat,
        lng,
        type: props.osm_value || 'poi',
      };
    });
  } catch (e) {
    console.warn('Photon geocoding also failed:', e);
    return [];
  }
}

/**
 * Snaps raw GPS coordinates to real roads/footpaths using public OSRM walking router.
 * Subsamples route into waypoints spaced ~120-200m apart to avoid API query length limits.
 */
export async function snapRouteToRoads(
  rawCoordinates: GeoCoordinate[],
  stepDistanceMeters = 150
): Promise<{ snappedCoordinates: GeoCoordinate[]; distanceMeters: number; success: boolean }> {
  if (rawCoordinates.length < 2) {
    return { snappedCoordinates: rawCoordinates, distanceMeters: 0, success: false };
  }

  // 1. Subsample waypoints along route
  const waypoints: GeoCoordinate[] = [rawCoordinates[0]];
  let accumulated = 0;

  for (let i = 0; i < rawCoordinates.length - 1; i++) {
    const d = haversineDistance(rawCoordinates[i], rawCoordinates[i + 1]);
    accumulated += d;
    if (accumulated >= stepDistanceMeters) {
      waypoints.push(rawCoordinates[i + 1]);
      accumulated = 0;
    }
  }

  // Ensure last point is included
  const lastPoint = rawCoordinates[rawCoordinates.length - 1];
  if (
    haversineDistance(waypoints[waypoints.length - 1], lastPoint) > 20 ||
    waypoints.length === 1
  ) {
    waypoints.push(lastPoint);
  }

  // Limit max waypoints per request to avoid URL length error (max ~70 points per call)
  const MAX_POINTS = 60;
  const chunkedWaypoints: GeoCoordinate[][] = [];

  if (waypoints.length <= MAX_POINTS) {
    chunkedWaypoints.push(waypoints);
  } else {
    for (let i = 0; i < waypoints.length - 1; i += MAX_POINTS - 1) {
      const slice = waypoints.slice(i, i + MAX_POINTS);
      if (slice.length >= 2) {
        chunkedWaypoints.push(slice);
      }
    }
  }

  const snappedSegments: GeoCoordinate[] = [];
  let totalDistance = 0;
  let didAnySnapSucceed = false;

  for (const chunk of chunkedWaypoints) {
    try {
      const coordsString = chunk.map((pt) => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/walking/${coordsString}?overview=full&geometries=geojson`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`OSRM responded with status ${response.status}`);
      }

      const data = await response.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        totalDistance += route.distance || 0;
        const coords = route.geometry.coordinates; // [lng, lat]
        const segment: GeoCoordinate[] = coords.map((c: [number, number]) => ({
          lat: c[1],
          lng: c[0],
        }));

        if (snappedSegments.length > 0 && segment.length > 0) {
          // Avoid duplicating joint point
          snappedSegments.push(...segment.slice(1));
        } else {
          snappedSegments.push(...segment);
        }
        didAnySnapSucceed = true;
      } else {
        // Fallback to raw chunk
        snappedSegments.push(...chunk);
      }
    } catch (err) {
      console.warn('OSRM request chunk failed, retaining raw waypoints:', err);
      snappedSegments.push(...chunk);
    }
  }

  if (didAnySnapSucceed && snappedSegments.length > 0) {
    return {
      snappedCoordinates: snappedSegments,
      distanceMeters: totalDistance,
      success: true,
    };
  }

  // Fallback to raw
  return {
    snappedCoordinates: rawCoordinates,
    distanceMeters: 0,
    success: false,
  };
}

export interface DetectedMapLabel {
  name: string;
  type?: string;
  normX: number; // 0..1000
  normY: number; // 0..1000
}

export interface ResolvedAnchorsResult {
  anchors: [ControlPointAnchor, ControlPointAnchor];
  matchedLabels: string[];
  scaleMetersPerPixel: number;
  rotationDegrees: number;
  isCalibratedFromLabels: boolean;
}

/**
 * Automatically matches Gemini-detected visual map labels against OpenStreetMap to resolve
 * Ground Control Anchors with realistic scale and rotation.
 */
export async function resolveGroundControlAnchors(
  labels: DetectedMapLabel[],
  imageWidth: number,
  imageHeight: number,
  areaContext: string,
  nearCoords: GeoCoordinate,
  suggestedZoom = 15
): Promise<ResolvedAnchorsResult> {
  const defaultScale = zoomToMetersPerPixel(suggestedZoom, nearCoords.lat);

  // If no labels or fewer than 2, return default calibrated anchors
  if (!labels || labels.length < 2) {
    const anchors = createCalibratedAnchors(nearCoords, defaultScale, imageWidth, imageHeight, areaContext);
    return {
      anchors,
      matchedLabels: [],
      scaleMetersPerPixel: defaultScale,
      rotationDegrees: 0,
      isCalibratedFromLabels: false,
    };
  }

  // Filter out noisy labels (numbers, elevations like "104 m", "15")
  const validLabels = labels.filter(
    (l) => l.name && l.name.length >= 3 && !/^\d+\s*m?$/i.test(l.name.trim())
  );

  const geocoded: { label: DetectedMapLabel; pixel: PixelPoint; geo: GeoCoordinate }[] = [];
  const candidates = validLabels.slice(0, 6);

  for (const l of candidates) {
    const px: PixelPoint = {
      x: Math.round((l.normX / 1000) * imageWidth),
      y: Math.round((l.normY / 1000) * imageHeight),
    };
    const query = `${l.name}, ${areaContext}`.trim();
    const results = await geocodePlace(query, nearCoords);
    if (results.length > 0) {
      geocoded.push({
        label: l,
        pixel: px,
        geo: { lat: results[0].lat, lng: results[0].lng },
      });
      if (geocoded.length >= 4) break;
    }
  }

  // Find pair with largest spatial separation on image
  let bestPair: [{ label: DetectedMapLabel; pixel: PixelPoint; geo: GeoCoordinate }, { label: DetectedMapLabel; pixel: PixelPoint; geo: GeoCoordinate }] | null = null;
  let maxDist = 0;

  for (let i = 0; i < geocoded.length; i++) {
    for (let j = i + 1; j < geocoded.length; j++) {
      const d = Math.hypot(geocoded[i].pixel.x - geocoded[j].pixel.x, geocoded[i].pixel.y - geocoded[j].pixel.y);
      if (d > maxDist) {
        maxDist = d;
        bestPair = [geocoded[i], geocoded[j]];
      }
    }
  }

  if (bestPair && maxDist >= 80) {
    const [pA, pB] = bestPair;
    const a1: ControlPointAnchor = {
      id: 'anchor-1',
      name: pA.label.name,
      pixel: pA.pixel,
      geo: pA.geo,
    };
    const a2: ControlPointAnchor = {
      id: 'anchor-2',
      name: pB.label.name,
      pixel: pB.pixel,
      geo: pB.geo,
    };

    const tf = solveTwoPointTransform(a1, a2);
    const scale = Math.hypot(tf.a, tf.b);
    const rot = (Math.atan2(tf.b, tf.a) * 180) / Math.PI;

    // Sanity check: scale between 0.5 and 25 m/px, rotation deviation <= 30 deg
    if (scale >= 0.5 && scale <= 25 && Math.abs(rot) <= 30) {
      return {
        anchors: [a1, a2],
        matchedLabels: [pA.label.name, pB.label.name],
        scaleMetersPerPixel: scale,
        rotationDegrees: rot,
        isCalibratedFromLabels: true,
      };
    }
  }

  // Fallback: Calibrated North-up anchors at center
  const anchors = createCalibratedAnchors(nearCoords, defaultScale, imageWidth, imageHeight, areaContext);
  return {
    anchors,
    matchedLabels: [],
    scaleMetersPerPixel: defaultScale,
    rotationDegrees: 0,
    isCalibratedFromLabels: false,
  };
}
