import fs from 'fs';
import { latLngToWebMercator, webMercatorToLatLng, GeoCoordinate } from '../src/utils/georeferencing';

// Parse ground truth GPX
function parseGPX(filePath: string): GeoCoordinate[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const points: GeoCoordinate[] = [];
  const regex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    points.push({ lat: parseFloat(match[1]), lng: parseFloat(match[2]) });
  }
  return points;
}

// Distance between two lat/lng in meters (Haversine)
function haversineMeters(p1: GeoCoordinate, p2: GeoCoordinate): number {
  const R = 6371000;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Minimum distance from a point to a polyline in meters
function pointToPolylineDistance(pt: GeoCoordinate, poly: GeoCoordinate[]): number {
  let minDist = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    // Distance to segment endpoints as conservative estimate
    const d = Math.min(haversineMeters(pt, poly[i]), haversineMeters(pt, poly[i + 1]));
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Evaluate error between candidate route and ground truth GPX
export function evaluateAlignment(candidate: GeoCoordinate[], groundTruth: GeoCoordinate[]) {
  const errors: number[] = [];
  for (const gt of groundTruth) {
    errors.push(pointToPolylineDistance(gt, candidate));
  }
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const maxError = Math.max(...errors);
  const medianError = [...errors].sort((a, b) => a - b)[Math.floor(errors.length / 2)];
  return { meanError, maxError, medianError };
}

// Solve proper conformal transform accounting for image Y-down and Web Mercator Y-up
export function solveConformalTransform(
  a1: { pixel: { x: number; y: number }; geo: GeoCoordinate },
  a2: { pixel: { x: number; y: number }; geo: GeoCoordinate }
) {
  const m1 = latLngToWebMercator(a1.geo.lat, a1.geo.lng);
  const m2 = latLngToWebMercator(a2.geo.lat, a2.geo.lng);

  // In image: u = x, v = -y (so v points North)
  const u1 = a1.pixel.x, v1 = -a1.pixel.y;
  const u2 = a2.pixel.x, v2 = -a2.pixel.y;

  const du = u2 - u1;
  const dv = v2 - v1;
  const ddistSq = du * du + dv * dv;

  const dmx = m2.x - m1.x;
  const dmy = m2.y - m1.y;

  const alpha = (dmx * du + dmy * dv) / ddistSq;
  const beta = (dmy * du - dmx * dv) / ddistSq;

  const tx = m1.x - (alpha * u1 - beta * v1);
  const ty = m1.y - (beta * u1 + alpha * v1);

  return {
    alpha,
    beta,
    tx,
    ty,
    scaleMetersPerPixel: Math.hypot(alpha, beta),
    rotationDegrees: (Math.atan2(beta, alpha) * 180) / Math.PI,
    transform: (px: number, py: number): GeoCoordinate => {
      const u = px;
      const v = -py;
      const mx = alpha * u - beta * v + tx;
      const my = beta * u + alpha * v + ty;
      return webMercatorToLatLng(mx, my);
    },
  };
}

async function run() {
  const gpxPoints = parseGPX('.examples/perahu.gpx');
  console.log(`Loaded ${gpxPoints.length} ground truth GPX points from perahu.gpx`);

  const smartData = JSON.parse(fs.readFileSync('.examples/perahu_smart_result.json', 'utf8'));
  const pixelPath: { x: number; y: number }[] = smartData.path;

  // Let's test two key anchors:
  // Anchor 1: Start marker at pixel (117, 238) -> GPX start point: (-7.7830317, 110.3726400)
  // Anchor 2: Easternmost deck corner at pixel (603, 238) -> GPX eastern point: (-7.783100, 110.387163)
  const a1 = {
    pixel: { x: 117, y: 238 },
    geo: gpxPoints[0], // first point is start
  };

  // Find easternmost point in GPX
  let eastGT = gpxPoints[0];
  for (const pt of gpxPoints) {
    if (pt.lng > eastGT.lng) eastGT = pt;
  }

  // Find easternmost point in pixel path
  let eastPixel = pixelPath[0];
  for (const pt of pixelPath) {
    if (pt.x > eastPixel.x) eastPixel = pt;
  }

  const a2 = {
    pixel: eastPixel,
    geo: eastGT,
  };

  console.log('Anchor 1 (Start):', a1);
  console.log('Anchor 2 (East corner):', a2);

  const solver = solveConformalTransform(a1, a2);
  console.log(`\nTransform parameters:`);
  console.log(`- Scale: ${solver.scaleMetersPerPixel.toFixed(3)} meters/pixel`);
  console.log(`- Rotation: ${solver.rotationDegrees.toFixed(2)}°`);

  const candidateRoute = pixelPath.map((p) => solver.transform(p.x, p.y));

  const stats = evaluateAlignment(candidateRoute, gpxPoints);
  console.log(`\n========================================`);
  console.log(`ALIGNMENT ACCURACY EVALUATION:`);
  console.log(`========================================`);
  console.log(`Mean Error to Ground Truth:   ${stats.meanError.toFixed(2)} meters`);
  console.log(`Median Error to Ground Truth: ${stats.medianError.toFixed(2)} meters`);
  console.log(`Max Error to Ground Truth:    ${stats.maxError.toFixed(2)} meters`);

  // Save the aligned candidate GPX
  fs.writeFileSync(
    '.examples/perahu_aligned_candidate.json',
    JSON.stringify({
      scale: solver.scaleMetersPerPixel,
      rotation: solver.rotationDegrees,
      stats,
      candidateRoute,
    }, null, 2)
  );
}

run();
