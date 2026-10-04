/**
 * Georeferencing math and coordinate transformations.
 * Handles Web Mercator (EPSG:3857) projection, conformal similitude transformation
 * (scale, rotation, translation), 2-point anchor fitting, and verification scoring.
 */

import { PixelPoint } from './imageProcessing';

export interface GeoCoordinate {
  lat: number;
  lng: number;
  ele?: number;
}

export interface ControlPointAnchor {
  id: string;
  name: string;
  pixel: PixelPoint;
  geo: GeoCoordinate;
}

export interface GeoreferenceTransform {
  // Similitude transformation parameters:
  // X_mercator = a * px - b * py + tx
  // Y_mercator = b * px + a * py + ty
  // where scale = sqrt(a^2 + b^2), rotation = atan2(b, a)
  a: number;
  b: number;
  tx: number;
  ty: number;
}

const R_EARTH = 6378137.0; // WGS84 major radius in meters
const ORIGIN_SHIFT = Math.PI * R_EARTH;

/**
 * Converts Latitude/Longitude (degrees) to Web Mercator (meters).
 */
export function latLngToWebMercator(lat: number, lng: number): { x: number; y: number } {
  const x = (lng * ORIGIN_SHIFT) / 180.0;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360.0)) / (Math.PI / 180.0);
  y = (y * ORIGIN_SHIFT) / 180.0;
  return { x, y };
}

/**
 * Converts Web Mercator (meters) to Latitude/Longitude (degrees).
 */
export function webMercatorToLatLng(x: number, y: number): GeoCoordinate {
  const lng = (x / ORIGIN_SHIFT) * 180.0;
  let lat = (y / ORIGIN_SHIFT) * 180.0;
  lat = (180.0 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180.0)) - Math.PI / 2.0);
  return { lat, lng };
}

/**
 * Solves a 2-point conformal (similitude) transform between image pixels and Web Mercator meters.
 * Conformal preserves shapes without non-uniform shearing.
 * Unifies the left-handed pixel grid (Y down) with right-handed Web Mercator (Y up)
 * using u = x (East) and v = -y (North), preventing accidental mirroring or 90-degree flips.
 */
export function solveTwoPointTransform(
  anchor1: { pixel: PixelPoint; geo: GeoCoordinate },
  anchor2: { pixel: PixelPoint; geo: GeoCoordinate }
): GeoreferenceTransform {
  const m1 = latLngToWebMercator(anchor1.geo.lat, anchor1.geo.lng);
  const m2 = latLngToWebMercator(anchor2.geo.lat, anchor2.geo.lng);

  // In image coords: u = x (East), v = -y (North)
  const u1 = anchor1.pixel.x;
  const v1 = -anchor1.pixel.y;
  const u2 = anchor2.pixel.x;
  const v2 = -anchor2.pixel.y;

  const du = u2 - u1;
  const dv = v2 - v1;
  const pixelDistSq = du * du + dv * dv;

  if (pixelDistSq < 1e-6) {
    // Degenerate case: anchors are on same pixel
    return { a: 1, b: 0, tx: m1.x - u1, ty: m1.y - v1 };
  }

  const dmx = m2.x - m1.x;
  const dmy = m2.y - m1.y;

  // dmx = a * du - b * dv
  // dmy = b * du + a * dv
  const a = (dmx * du + dmy * dv) / pixelDistSq;
  const b = (dmy * du - dmx * dv) / pixelDistSq;

  const tx = m1.x - (a * u1 - b * v1);
  const ty = m1.y - (b * u1 + a * v1);

  return { a, b, tx, ty };
}

/**
 * Transforms an image pixel coordinate to real world Latitude / Longitude.
 */
export function pixelToLatLng(
  pixel: PixelPoint,
  transform: GeoreferenceTransform
): GeoCoordinate {
  const u = pixel.x;
  const v = -pixel.y;
  const mx = transform.a * u - transform.b * v + transform.tx;
  const my = transform.b * u + transform.a * v + transform.ty;
  return webMercatorToLatLng(mx, my);
}

/**
 * Inverse transforms a real world Lat/Lng back to pixel coordinate.
 */
export function latLngToPixel(
  geo: GeoCoordinate,
  transform: GeoreferenceTransform
): PixelPoint {
  const { x: mx, y: my } = latLngToWebMercator(geo.lat, geo.lng);
  const dx = mx - transform.tx;
  const dy = my - transform.ty;

  const det = transform.a * transform.a + transform.b * transform.b;
  if (det === 0) return { x: 0, y: 0 };

  const u = (transform.a * dx + transform.b * dy) / det;
  const v = (-transform.b * dx + transform.a * dy) / det;

  return { x: u, y: -v };
}

/**
 * Transforms an array of pixel points to GeoCoordinates.
 */
export function transformPathToGeo(
  points: PixelPoint[],
  transform: GeoreferenceTransform
): GeoCoordinate[] {
  return points.map((p) => pixelToLatLng(p, transform));
}

/**
 * Adjusts transform by scale factor around image center.
 */
export function adjustTransformScale(
  transform: GeoreferenceTransform,
  factor: number,
  centerPixel: PixelPoint
): GeoreferenceTransform {
  const u = centerPixel.x;
  const v = -centerPixel.y;
  const cmx = transform.a * u - transform.b * v + transform.tx;
  const cmy = transform.b * u + transform.a * v + transform.ty;

  const newA = transform.a * factor;
  const newB = transform.b * factor;

  const newTx = cmx - (newA * u - newB * v);
  const newTy = cmy - (newB * u + newA * v);

  return { a: newA, b: newB, tx: newTx, ty: newTy };
}

/**
 * Adjusts transform by rotation angle in degrees around image center.
 */
export function adjustTransformRotation(
  transform: GeoreferenceTransform,
  deg: number,
  centerPixel: PixelPoint
): GeoreferenceTransform {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const u = centerPixel.x;
  const v = -centerPixel.y;
  const cmx = transform.a * u - transform.b * v + transform.tx;
  const cmy = transform.b * u + transform.a * v + transform.ty;

  const newA = transform.a * cos - transform.b * sin;
  const newB = transform.a * sin + transform.b * cos;

  const newTx = cmx - (newA * u - newB * v);
  const newTy = cmy - (newB * u + newA * v);

  return { a: newA, b: newB, tx: newTx, ty: newTy };
}

/**
 * Adjusts transform by translation offset (meters).
 */
export function adjustTransformPan(
  transform: GeoreferenceTransform,
  deltaEastMeters: number,
  deltaNorthMeters: number
): GeoreferenceTransform {
  return {
    ...transform,
    tx: transform.tx + deltaEastMeters,
    ty: transform.ty + deltaNorthMeters,
  };
}

/**
 * Flips/mirrors geographic coordinates horizontally around the route center.
 */
export function flipGeoRouteHorizontal(coords: GeoCoordinate[]): GeoCoordinate[] {
  if (coords.length === 0) return coords;
  const bbox = getGeoBoundingBox(coords);
  return coords.map((c) => ({
    ...c,
    lng: 2 * bbox.centerLng - c.lng,
  }));
}

/**
 * Flips/mirrors geographic coordinates vertically around the route center.
 */
export function flipGeoRouteVertical(coords: GeoCoordinate[]): GeoCoordinate[] {
  if (coords.length === 0) return coords;
  const bbox = getGeoBoundingBox(coords);
  return coords.map((c) => ({
    ...c,
    lat: 2 * bbox.centerLat - c.lat,
  }));
}

/**
 * Reverses the track direction (swaps start and finish).
 */
export function reverseGeoRoute(coords: GeoCoordinate[]): GeoCoordinate[] {
  return [...coords].reverse();
}

/**
 * Stretches or squashes geographic coordinates horizontally (East-West) or vertically (North-South)
 * around the route's geographic bounding center. Solves non-uniform aspect ratio and projection distortions!
 */
export function stretchGeoRoute(
  coords: GeoCoordinate[],
  factorX: number,
  factorY: number
): GeoCoordinate[] {
  if (coords.length === 0) return coords;
  const bbox = getGeoBoundingBox(coords);
  return coords.map((c) => ({
    ...c,
    lng: bbox.centerLng + (c.lng - bbox.centerLng) * factorX,
    lat: bbox.centerLat + (c.lat - bbox.centerLat) * factorY,
  }));
}

/**
 * Smooths geographic polyline using Chaikin's algorithm.
 */
export function smoothGeoRoute(coords: GeoCoordinate[], iterations = 1): GeoCoordinate[] {
  if (coords.length <= 2) return coords;

  let current = coords;
  for (let it = 0; it < iterations; it++) {
    const next: GeoCoordinate[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];

      next.push({
        lat: 0.75 * p0.lat + 0.25 * p1.lat,
        lng: 0.75 * p0.lng + 0.25 * p1.lng,
        ele: p0.ele !== undefined && p1.ele !== undefined ? 0.75 * p0.ele + 0.25 * p1.ele : undefined,
      });

      next.push({
        lat: 0.25 * p0.lat + 0.75 * p1.lat,
        lng: 0.25 * p0.lng + 0.75 * p1.lng,
        ele: p0.ele !== undefined && p1.ele !== undefined ? 0.25 * p0.ele + 0.75 * p1.ele : undefined,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }

  return current;
}

/**
 * Calculates total route distance in meters using Haversine formula.
 */
export function calculateRouteDistance(coords: GeoCoordinate[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistance(coords[i], coords[i + 1]);
  }
  return total;
}

export function haversineDistance(c1: GeoCoordinate, c2: GeoCoordinate): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(c2.lat - c1.lat);
  const dLon = toRad(c2.lng - c1.lng);
  const lat1 = toRad(c1.lat);
  const lat2 = toRad(c2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_EARTH * c;
}

/**
 * Computes bounding box for an array of coordinates.
 */
export function getGeoBoundingBox(coords: GeoCoordinate[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
} {
  if (coords.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0, centerLat: 0, centerLng: 0 };
  }

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
  };
}

/**
 * Computes verification / confidence score (0 to 100%) by re-projecting
 * the route back to pixel space and evaluating overlap with the extracted mask.
 */
export function calculateVerificationScore(
  geoCoords: GeoCoordinate[],
  transform: GeoreferenceTransform,
  mask: Uint8Array,
  width: number,
  height: number,
  toleranceRadius = 4
): { score: number; matchedPoints: number; totalPoints: number } {
  if (geoCoords.length === 0 || width <= 0 || height <= 0) {
    return { score: 0, matchedPoints: 0, totalPoints: 0 };
  }

  let matched = 0;
  const total = geoCoords.length;

  for (const c of geoCoords) {
    const p = latLngToPixel(c, transform);
    const px = Math.round(p.x);
    const py = Math.round(p.y);

    let foundMask = false;
    for (let dy = -toleranceRadius; dy <= toleranceRadius && !foundMask; dy++) {
      for (let dx = -toleranceRadius; dx <= toleranceRadius && !foundMask; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (mask[ny * width + nx] === 1) {
            foundMask = true;
          }
        }
      }
    }

    if (foundMask) matched++;
  }

  const score = Math.round((matched / total) * 100);
  return { score, matchedPoints: matched, totalPoints: total };
}

/**
 * Calculates standard Web Mercator meters-per-pixel for a given zoom level and latitude.
 */
export function zoomToMetersPerPixel(zoom: number, latDegrees: number): number {
  const rad = (latDegrees * Math.PI) / 180;
  return (156543.03392 * Math.cos(rad)) / Math.pow(2, zoom);
}

/**
 * Creates a calibrated North-Up (rotation = 0) transform for a given center coordinate and scale.
 */
export function createCalibratedTransform(
  centerGeo: GeoCoordinate,
  scaleMetersPerPixel: number,
  imageWidth: number,
  imageHeight: number,
  rotationDeg = 0
): GeoreferenceTransform {
  const centerMerc = latLngToWebMercator(centerGeo.lat, centerGeo.lng);
  const uCenter = imageWidth / 2;
  const vCenter = -(imageHeight / 2);

  const rad = (rotationDeg * Math.PI) / 180;
  const a = scaleMetersPerPixel * Math.cos(rad);
  const b = scaleMetersPerPixel * Math.sin(rad);

  const tx = centerMerc.x - (a * uCenter - b * vCenter);
  const ty = centerMerc.y - (b * uCenter + a * vCenter);

  return { a, b, tx, ty };
}

/**
 * Generates two calibrated control point anchors for an image given center and scale.
 */
export function createCalibratedAnchors(
  centerGeo: GeoCoordinate,
  scaleMetersPerPixel: number,
  imageWidth: number,
  imageHeight: number,
  areaName = 'Center'
): [ControlPointAnchor, ControlPointAnchor] {
  const tf = createCalibratedTransform(centerGeo, scaleMetersPerPixel, imageWidth, imageHeight);

  const p1: PixelPoint = {
    x: Math.round(imageWidth * 0.25),
    y: Math.round(imageHeight * 0.75),
  };
  const p2: PixelPoint = {
    x: Math.round(imageWidth * 0.75),
    y: Math.round(imageHeight * 0.25),
  };

  const a1: ControlPointAnchor = {
    id: 'anchor-1',
    name: `${areaName} (SW)`,
    pixel: p1,
    geo: pixelToLatLng(p1, tf),
  };

  const a2: ControlPointAnchor = {
    id: 'anchor-2',
    name: `${areaName} (NE)`,
    pixel: p2,
    geo: pixelToLatLng(p2, tf),
  };

  return [a1, a2];
}
