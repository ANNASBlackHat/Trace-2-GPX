import fs from 'fs';
import {
  COLOR_PRESETS,
  extractRouteMask,
  zhangSuenThinning,
  traceSkeletonToPath,
  simplifyPath,
  PixelPoint,
} from '../src/utils/imageProcessing';

function runTest(name: string) {
  console.log(`\n========================================`);
  console.log(`TESTING: ${name}`);
  console.log(`========================================`);

  const buf = fs.readFileSync(`.examples/${name}.bin`);
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  const rawData = new Uint8ClampedArray(buf.buffer, buf.byteOffset + 8, width * height * 4);

  const imageData = {
    width,
    height,
    data: rawData,
  } as ImageData;

  const preset = COLOR_PRESETS.find((p) => p.id === 'strava-orange')!;

  const t0 = performance.now();
  const { mask, pixelCount } = extractRouteMask(imageData, {
    targetHue: preset.targetHsv[0],
    hueTolerance: preset.hueTolerance,
    minSaturation: preset.minSaturation,
    minValue: preset.minValue,
  });
  const t1 = performance.now();
  console.log(`1. Mask Extraction: ${pixelCount} pixels in ${(t1 - t0).toFixed(1)}ms`);

  const t2 = performance.now();
  const skeleton = zhangSuenThinning(mask, width, height);
  const t3 = performance.now();
  let skelPixels = 0;
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i] === 1) skelPixels++;
  }
  console.log(`2. Zhang-Suen Thinning: ${skelPixels} skeleton pixels in ${(t3 - t2).toFixed(1)}ms`);

  const t4 = performance.now();
  const rawPath = traceSkeletonToPath(skeleton, width, height);
  const t5 = performance.now();
  console.log(`3. Skeleton Graph Walk: ${rawPath.length} path points in ${(t5 - t4).toFixed(1)}ms`);

  const simplifiedPath = simplifyPath(rawPath, 1.5);
  console.log(`4. Simplified Path (eps=1.5): ${simplifiedPath.length} vertices`);

  // Calculate Skeleton Coverage:
  // How many of the skeleton pixels are actually within 2px of the extracted path?
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
  console.log(`\nCoverage Metrics:`);
  console.log(`- Total Skeleton Pixels: ${skelPixels}`);
  console.log(`- Path Covered Skeleton Pixels: ${visitedSkelPixels}`);
  console.log(`- Skeleton Coverage: ${coveragePercent}%`);

  // Detect path jumps / disconnects (> 5 pixels apart)
  let jumps = 0;
  let maxJump = 0;
  for (let i = 0; i < rawPath.length - 1; i++) {
    const d = Math.hypot(rawPath[i + 1].x - rawPath[i].x, rawPath[i + 1].y - rawPath[i].y);
    if (d > 3.0) {
      jumps++;
      if (d > maxJump) maxJump = d;
    }
  }
  console.log(`- Path Discontinuities (gaps > 3px): ${jumps} (Max gap jump: ${maxJump.toFixed(1)}px)`);

  // Save results for visual overlay inspection
  fs.writeFileSync(
    `.examples/${name}_result.json`,
    JSON.stringify({
      width,
      height,
      pixelCount,
      skelPixels,
      coveragePercent: Number(coveragePercent),
      jumps,
      maxJump,
      path: simplifiedPath,
      rawPathLength: rawPath.length,
    }, null, 2)
  );
}

runTest('kudalumping');
runTest('perahu');
