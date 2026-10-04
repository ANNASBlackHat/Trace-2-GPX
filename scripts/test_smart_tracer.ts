import fs from 'fs';
import {
  COLOR_PRESETS,
  extractRouteMask,
  zhangSuenThinning,
  simplifyPath,
  PixelPoint,
} from '../src/utils/imageProcessing';
import { buildGraphFromSkeleton, traceCompleteRoute } from './smart_tracer';

// Function to detect Green Start Marker icon in Strava/Garmin images
export function detectStartMarker(imageData: ImageData): PixelPoint | null {
  const { width, height, data } = imageData;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Bright green circular marker
      if (g > 160 && r < 120 && b < 100) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  // A marker circle is typically between 50 and 500 pixels
  if (count >= 30) {
    return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
  }
  return null;
}

function runSmartTest(name: string) {
  console.log(`\n========================================`);
  console.log(`SMART TRACER TESTING WITH START MARKER: ${name}`);
  console.log(`========================================`);

  const buf = fs.readFileSync(`.examples/${name}.bin`);
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  const rawData = new Uint8ClampedArray(buf.buffer, buf.byteOffset + 8, width * height * 4);

  const imageData = { width, height, data: rawData } as ImageData;
  const preset = COLOR_PRESETS.find((p) => p.id === 'strava-orange')!;

  const startMarker = detectStartMarker(imageData);
  console.log(`Detected Start Marker:`, startMarker);

  // 1. Mask
  const { mask } = extractRouteMask(imageData, {
    targetHue: preset.targetHsv[0],
    hueTolerance: preset.hueTolerance,
    minSaturation: preset.minSaturation,
    minValue: preset.minValue,
  });

  // 2. Skeleton
  const skeleton = zhangSuenThinning(mask, width, height);
  let skelPixels = 0;
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i] === 1) skelPixels++;
  }

  // 3. Build Graph
  const graph = buildGraphFromSkeleton(skeleton, width, height);

  // 4. Trace complete route starting from detected start marker!
  const rawPath = traceCompleteRoute(graph, startMarker || undefined);

  // 5. Simplify
  const simplified = simplifyPath(rawPath, 1.5);

  // Calculate Skeleton Coverage:
  const pathSet = new Set<string>();
  for (const pt of rawPath) {
    pathSet.add(`${pt.x},${pt.y}`);
  }
  let visitedSkelPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skeleton[y * width + x] === 1 && pathSet.has(`${x},${y}`)) {
        visitedSkelPixels++;
      }
    }
  }
  const coveragePercent = ((visitedSkelPixels / skelPixels) * 100).toFixed(1);
  console.log(`Results:`);
  console.log(`- Start Vertex: (${simplified[0].x}, ${simplified[0].y})`);
  console.log(`- End Vertex: (${simplified[simplified.length - 1].x}, ${simplified[simplified.length - 1].y})`);
  console.log(`- Skeleton Pixels: ${skelPixels}`);
  console.log(`- Covered Skeleton Pixels: ${visitedSkelPixels}`);
  console.log(`- Coverage: ${coveragePercent}%`);

  fs.writeFileSync(
    `.examples/${name}_smart_result.json`,
    JSON.stringify({
      width,
      height,
      coveragePercent: Number(coveragePercent),
      startMarker,
      path: simplified,
    }, null, 2)
  );
}

runSmartTest('kudalumping');
runSmartTest('perahu');
