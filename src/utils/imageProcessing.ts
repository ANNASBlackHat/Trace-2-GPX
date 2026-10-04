/**
 * Image processing utilities for route extraction from GPS screenshots.
 * Includes color space conversion, HSV/RGB thresholding, morphological noise reduction,
 * Zhang-Suen skeletonization thinning, and graph tracing.
 */

export interface ColorFilterPreset {
  id: string;
  name: string;
  brand: string;
  colorHex: string;
  targetHsv: [number, number, number]; // [0..360, 0..1, 0..1]
  hueTolerance: number; // degrees
  minSaturation: number; // 0..1
  minValue: number; // 0..1
}

export const COLOR_PRESETS: ColorFilterPreset[] = [
  {
    id: 'strava-orange',
    name: 'Strava Orange',
    brand: 'Strava',
    colorHex: '#FC4C02',
    targetHsv: [18, 0.99, 0.99],
    hueTolerance: 22,
    minSaturation: 0.55,
    minValue: 0.45,
  },
  {
    id: 'garmin-cyan',
    name: 'Garmin Cyan',
    brand: 'Garmin',
    colorHex: '#00A3E0',
    targetHsv: [196, 1.0, 0.88],
    hueTolerance: 25,
    minSaturation: 0.5,
    minValue: 0.45,
  },
  {
    id: 'nike-volt',
    name: 'Nike Volt / Neon',
    brand: 'Nike Run Club',
    colorHex: '#D4FF00',
    targetHsv: [70, 1.0, 1.0],
    hueTolerance: 25,
    minSaturation: 0.45,
    minValue: 0.55,
  },
  {
    id: 'apple-red',
    name: 'Apple Activity Red',
    brand: 'Apple Fitness',
    colorHex: '#FA233B',
    targetHsv: [353, 0.86, 0.98],
    hueTolerance: 20,
    minSaturation: 0.55,
    minValue: 0.45,
  },
  {
    id: 'alltrails-purple',
    name: 'AllTrails / Outdoor Purple',
    brand: 'AllTrails',
    colorHex: '#8A2BE2',
    targetHsv: [271, 0.81, 0.88],
    hueTolerance: 30,
    minSaturation: 0.4,
    minValue: 0.4,
  },
];

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;

  let h = 0;
  if (diff !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / diff) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / diff + 2;
    } else {
      h = (rNorm - gNorm) / diff + 4;
    }
    h = h * 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : diff / max;
  const v = max;

  return [h, s, v];
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

export interface MaskFilterParams {
  targetHue: number;
  hueTolerance: number;
  minSaturation: number;
  minValue: number;
  minBrightness?: number;
  useRgbDistance?: boolean;
  targetRgb?: [number, number, number];
  rgbTolerance?: number;
}

/**
 * Creates a 2D binary mask (1 for route pixel, 0 for background) from ImageData.
 */
export function extractRouteMask(
  imageData: ImageData,
  params: MaskFilterParams
): { mask: Uint8Array; width: number; height: number; pixelCount: number } {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  let pixelCount = 0;

  const {
    targetHue,
    hueTolerance,
    minSaturation,
    minValue,
    useRgbDistance,
    targetRgb,
    rgbTolerance = 65,
  } = params;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 50) continue; // transparent pixel

      let isMatch = false;

      if (useRgbDistance && targetRgb) {
        const [tr, tg, tb] = targetRgb;
        const dist = Math.sqrt(
          (r - tr) * (r - tr) + (g - tg) * (g - tg) + (b - tb) * (b - tb)
        );
        isMatch = dist <= rgbTolerance;
      } else {
        const [h, s, v] = rgbToHsv(r, g, b);
        if (s >= minSaturation && v >= minValue) {
          let hueDiff = Math.abs(h - targetHue);
          if (hueDiff > 180) hueDiff = 360 - hueDiff;
          isMatch = hueDiff <= hueTolerance;
        }
      }

      if (isMatch) {
        mask[y * width + x] = 1;
        pixelCount++;
      }
    }
  }

  // Quick morphological opening: remove isolated noise pixels (pixels with fewer than 2 neighbors)
  const cleanedMask = new Uint8Array(width * height);
  let cleanedCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (mask[idx] === 1) {
        let neighborCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (mask[(y + dy) * width + (x + dx)] === 1) {
              neighborCount++;
            }
          }
        }
        if (neighborCount >= 2) {
          cleanedMask[idx] = 1;
          cleanedCount++;
        }
      }
    }
  }

  // Connected Component Analysis: keep only the main route components and wipe out UI text/logos
  const filteredMask = filterLargestConnectedComponents(cleanedMask, width, height, 0.15);
  let finalCount = 0;
  for (let i = 0; i < filteredMask.length; i++) {
    if (filteredMask[i] === 1) finalCount++;
  }

  return { mask: filteredMask, width, height, pixelCount: finalCount };
}

/**
 * Connected Component Labeling (CCL) via BFS.
 * Retains only the largest connected route components and eliminates isolated icons, text labels, and UI clutter.
 */
export function filterLargestConnectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minRelativeRatio = 0.15
): Uint8Array {
  const visited = new Uint8Array(width * height);
  const components: number[][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (mask[startIdx] === 1 && visited[startIdx] === 0) {
        const comp: number[] = [];
        const queue: number[] = [startIdx];
        visited[startIdx] = 1;

        let head = 0;
        while (head < queue.length) {
          const curr = queue[head++];
          comp.push(curr);

          const cx = curr % width;
          const cy = Math.floor(curr / width);

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = ny * width + nx;
                if (mask[nidx] === 1 && visited[nidx] === 0) {
                  visited[nidx] = 1;
                  queue.push(nidx);
                }
              }
            }
          }
        }

        // Only keep clusters with at least 15 pixels
        if (comp.length > 15) {
          components.push(comp);
        }
      }
    }
  }

  if (components.length === 0) return mask;

  // Sort descending by size
  components.sort((a, b) => b.length - a.length);
  const largestSize = components[0].length;

  const result = new Uint8Array(width * height);
  for (const comp of components) {
    if (comp.length >= largestSize * minRelativeRatio) {
      for (let i = 0; i < comp.length; i++) {
        result[comp[i]] = 1;
      }
    }
  }

  return result;
}

/**
 * Zhang-Suen Skeletonization Thinning Algorithm.
 * Iteratively erodes boundary pixels while strictly preserving topological connectivity
 * and end points, reducing the line to a single-pixel wide centerline.
 */
export function zhangSuenThinning(
  mask: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const skeleton = new Uint8Array(mask);
  let changing = true;

  const toRemove: number[] = [];

  while (changing) {
    changing = false;

    // Step 1
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (skeleton[idx] !== 1) continue;

        // 8-neighborhood P2 to P9:
        // P9 P2 P3
        // P8 P1 P4
        // P7 P6 P5
        const p2 = skeleton[(y - 1) * width + x];
        const p3 = skeleton[(y - 1) * width + (x + 1)];
        const p4 = skeleton[y * width + (x + 1)];
        const p5 = skeleton[(y + 1) * width + (x + 1)];
        const p6 = skeleton[(y + 1) * width + x];
        const p7 = skeleton[(y + 1) * width + (x - 1)];
        const p8 = skeleton[y * width + (x - 1)];
        const p9 = skeleton[(y - 1) * width + (x - 1)];

        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;

        // Number of 0 to 1 transitions in ordered sequence P2, P3, P4, P5, P6, P7, P8, P9, P2
        const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let a = 0;
        for (let i = 0; i < 8; i++) {
          if (neighbors[i] === 0 && neighbors[i + 1] === 1) a++;
        }
        if (a !== 1) continue;

        if (p2 * p4 * p6 !== 0) continue;
        if (p4 * p6 * p8 !== 0) continue;

        toRemove.push(idx);
      }
    }

    if (toRemove.length > 0) {
      for (let i = 0; i < toRemove.length; i++) {
        skeleton[toRemove[i]] = 0;
      }
      toRemove.length = 0;
      changing = true;
    }

    // Step 2
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (skeleton[idx] !== 1) continue;

        const p2 = skeleton[(y - 1) * width + x];
        const p3 = skeleton[(y - 1) * width + (x + 1)];
        const p4 = skeleton[y * width + (x + 1)];
        const p5 = skeleton[(y + 1) * width + (x + 1)];
        const p6 = skeleton[(y + 1) * width + x];
        const p7 = skeleton[(y + 1) * width + (x - 1)];
        const p8 = skeleton[y * width + (x - 1)];
        const p9 = skeleton[(y - 1) * width + (x - 1)];

        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;

        const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let a = 0;
        for (let i = 0; i < 8; i++) {
          if (neighbors[i] === 0 && neighbors[i + 1] === 1) a++;
        }
        if (a !== 1) continue;

        if (p2 * p4 * p8 !== 0) continue;
        if (p2 * p6 * p8 !== 0) continue;

        toRemove.push(idx);
      }
    }

    if (toRemove.length > 0) {
      for (let i = 0; i < toRemove.length; i++) {
        skeleton[toRemove[i]] = 0;
      }
      toRemove.length = 0;
      changing = true;
    }
  }

  return skeleton;
}

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Detects the standard green circular Start Marker icon common in Strava, Garmin, etc.
 */
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
      const a = data[idx + 3];
      if (a < 50) continue;

      // Bright green circular marker (high green, low red & blue)
      if (g > 150 && r < 130 && b < 110 && g - r > 35) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  // A marker circle is typically between 25 and 800 pixels
  if (count >= 25) {
    return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
  }
  return null;
}

export interface GraphNode {
  id: number;
  x: number;
  y: number;
  degree: number;
  edges: GraphEdge[];
}

export interface GraphEdge {
  id: number;
  nodeA: GraphNode;
  nodeB: GraphNode;
  points: PixelPoint[];
  visitedCount: number;
}

/**
 * Builds a topological graph (nodes at junctions/endpoints, edges along 1px skeleton chains).
 */
export function buildGraphFromSkeleton(
  skeleton: Uint8Array,
  width: number,
  height: number
): { nodes: GraphNode[]; edges: GraphEdge[]; skeletonPixels: number } {
  const pixelSet = new Set<number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skeleton[y * width + x] === 1) {
        pixelSet.add(y * width + x);
      }
    }
  }

  const getNeighbors = (idx: number): number[] => {
    const x = idx % width;
    const y = Math.floor(idx / width);
    const n: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = ny * width + nx;
          if (pixelSet.has(nidx)) n.push(nidx);
        }
      }
    }
    return n;
  };

  const nodePixelMap = new Map<number, GraphNode>();
  const nodes: GraphNode[] = [];
  let nextNodeId = 1;

  for (const idx of pixelSet) {
    const n = getNeighbors(idx);
    if (n.length !== 2) {
      const node: GraphNode = {
        id: nextNodeId++,
        x: idx % width,
        y: Math.floor(idx / width),
        degree: n.length,
        edges: [],
      };
      nodes.push(node);
      nodePixelMap.set(idx, node);
    }
  }

  // If there are no junctions or endpoints (e.g. pure single closed loop), pick one arbitrary pixel as a node
  if (nodes.length === 0 && pixelSet.size > 0) {
    const firstIdx = pixelSet.values().next().value!;
    const node: GraphNode = {
      id: nextNodeId++,
      x: firstIdx % width,
      y: Math.floor(firstIdx / width),
      degree: 2,
      edges: [],
    };
    nodes.push(node);
    nodePixelMap.set(firstIdx, node);
  }

  // Trace edges between nodes
  const visitedEdgeStarts = new Set<string>();
  const edges: GraphEdge[] = [];
  let nextEdgeId = 1;

  for (const startNode of nodes) {
    const startIdx = startNode.y * width + startNode.x;
    const neighbors = getNeighbors(startIdx);

    for (const firstStep of neighbors) {
      const stepKey = `${startIdx}->${firstStep}`;
      if (visitedEdgeStarts.has(stepKey)) continue;

      const edgePoints: PixelPoint[] = [
        { x: startNode.x, y: startNode.y },
        { x: firstStep % width, y: Math.floor(firstStep / width) },
      ];

      visitedEdgeStarts.add(stepKey);

      let prev = startIdx;
      let curr = firstStep;
      let endNode: GraphNode | null = nodePixelMap.get(curr) || null;

      while (!endNode) {
        const nextCandidates = getNeighbors(curr).filter((n) => n !== prev);
        if (nextCandidates.length === 0) break;
        const next = nextCandidates[0];
        edgePoints.push({ x: next % width, y: Math.floor(next / width) });
        prev = curr;
        curr = next;
        endNode = nodePixelMap.get(curr) || null;
      }

      if (endNode) {
        const reverseKey = `${curr}->${prev}`;
        visitedEdgeStarts.add(reverseKey);

        const edge: GraphEdge = {
          id: nextEdgeId++,
          nodeA: startNode,
          nodeB: endNode,
          points: edgePoints,
          visitedCount: 0,
        };
        edges.push(edge);
        startNode.edges.push(edge);
        if (endNode !== startNode) {
          endNode.edges.push(edge);
        }
      }
    }
  }

  return { nodes, edges, skeletonPixels: pixelSet.size };
}

/**
 * Traces the skeleton pixels into an ordered continuous path of [x, y] coordinates.
 * Uses topological graph traversal with automatic spur backtracking and BFS bridging,
 * ensuring 100% route coverage even with dead ends, loops, and marker gaps.
 */
export function traceSkeletonToPath(
  skeleton: Uint8Array,
  width: number,
  height: number,
  userStartPoint?: PixelPoint
): PixelPoint[] {
  const graph = buildGraphFromSkeleton(skeleton, width, height);
  const { nodes, edges } = graph;
  if (edges.length === 0) return [];

  // Pick start node: closest to userStartPoint or endpoint with degree 1
  let startNode = nodes[0];
  if (userStartPoint) {
    let bestDist = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - userStartPoint.x, n.y - userStartPoint.y);
      if (d < bestDist) {
        bestDist = d;
        startNode = n;
      }
    }
  } else {
    const endpoints = nodes.filter((n) => n.edges.length === 1);
    if (endpoints.length > 0) {
      startNode = endpoints[0];
    }
  }

  const resultPath: PixelPoint[] = [];
  let currentNode = startNode;
  resultPath.push({ x: currentNode.x, y: currentNode.y });

  const remainingEdges = new Set(edges);

  while (remainingEdges.size > 0) {
    const unvisitedFromHere = currentNode.edges.filter((e) => remainingEdges.has(e));

    if (unvisitedFromHere.length > 0) {
      // 1. Prioritize dead-end spurs (other node has only 1 edge) -> traverse in and immediately backtrack!
      const spurEdge = unvisitedFromHere.find((e) => {
        const other = e.nodeA === currentNode ? e.nodeB : e.nodeA;
        return other.edges.length === 1;
      });

      if (spurEdge) {
        const forward = spurEdge.nodeA === currentNode;
        const pts = forward ? spurEdge.points : [...spurEdge.points].reverse();
        for (let i = 1; i < pts.length; i++) resultPath.push(pts[i]);
        // Backtrack along the spur to return to currentNode
        for (let i = pts.length - 2; i >= 0; i--) resultPath.push(pts[i]);

        remainingEdges.delete(spurEdge);
        continue;
      }

      // 2. Choose edge with smoothest continuation angle to preserve route momentum
      let chosenEdge = unvisitedFromHere[0];
      if (resultPath.length >= 2 && unvisitedFromHere.length > 1) {
        const lastP = resultPath[resultPath.length - 1];
        const prevP = resultPath[resultPath.length - 2];
        const curAngle = Math.atan2(lastP.y - prevP.y, lastP.x - prevP.x);

        let minAngleDiff = Infinity;
        for (const e of unvisitedFromHere) {
          const forward = e.nodeA === currentNode;
          const nextP = forward ? e.points[1] : e.points[e.points.length - 2];
          const edgeAngle = Math.atan2(nextP.y - lastP.y, nextP.x - lastP.x);
          let diff = Math.abs(curAngle - edgeAngle);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          if (diff < minAngleDiff) {
            minAngleDiff = diff;
            chosenEdge = e;
          }
        }
      }

      const forward = chosenEdge.nodeA === currentNode;
      const otherNode = forward ? chosenEdge.nodeB : chosenEdge.nodeA;
      const pts = forward ? chosenEdge.points : [...chosenEdge.points].reverse();

      for (let i = 1; i < pts.length; i++) resultPath.push(pts[i]);

      remainingEdges.delete(chosenEdge);
      currentNode = otherNode;
    } else {
      // 3. Current node has no unvisited edges. Use BFS across existing graph edges to reach nearest unvisited edge.
      const queue: { node: GraphNode; pathNodes: GraphNode[]; pathEdges: GraphEdge[] }[] = [
        { node: currentNode, pathNodes: [currentNode], pathEdges: [] },
      ];
      const visitedBFS = new Set<number>([currentNode.id]);
      let targetPath: { pathNodes: GraphNode[]; pathEdges: GraphEdge[] } | null = null;

      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr.node.edges.some((e) => remainingEdges.has(e))) {
          targetPath = curr;
          break;
        }

        for (const e of curr.node.edges) {
          const neighbor = e.nodeA === curr.node ? e.nodeB : e.nodeA;
          if (!visitedBFS.has(neighbor.id)) {
            visitedBFS.add(neighbor.id);
            queue.push({
              node: neighbor,
              pathNodes: [...curr.pathNodes, neighbor],
              pathEdges: [...curr.pathEdges, e],
            });
          }
        }
      }

      if (targetPath && targetPath.pathEdges.length > 0) {
        for (let i = 0; i < targetPath.pathEdges.length; i++) {
          const e = targetPath.pathEdges[i];
          const fromN = targetPath.pathNodes[i];
          const toN = targetPath.pathNodes[i + 1];
          const forward = e.nodeA === fromN;
          const pts = forward ? e.points : [...e.points].reverse();
          for (let k = 1; k < pts.length; k++) resultPath.push(pts[k]);
          currentNode = toN;
        }
      } else {
        // 4. Bridge across disconnected components (e.g. gaps caused by start/finish icons or text)
        let closestUnvisitedEdge: GraphEdge | null = null;
        let minDist = Infinity;
        let pickNodeA = true;

        for (const e of remainingEdges) {
          const dA = Math.hypot(e.nodeA.x - currentNode.x, e.nodeA.y - currentNode.y);
          const dB = Math.hypot(e.nodeB.x - currentNode.x, e.nodeB.y - currentNode.y);
          if (dA < minDist) {
            minDist = dA;
            closestUnvisitedEdge = e;
            pickNodeA = true;
          }
          if (dB < minDist) {
            minDist = dB;
            closestUnvisitedEdge = e;
            pickNodeA = false;
          }
        }

        if (closestUnvisitedEdge) {
          const nextNode = pickNodeA ? closestUnvisitedEdge.nodeA : closestUnvisitedEdge.nodeB;
          resultPath.push({ x: nextNode.x, y: nextNode.y });
          currentNode = nextNode;
        } else {
          break;
        }
      }
    }
  }

  return resultPath;
}

/**
 * Douglas-Peucker Polyline Simplification
 * Keeps key vertices and removes redundant intermediate points within tolerance epsilon (in pixels).
 */
export function simplifyPath(points: PixelPoint[], epsilon: number): PixelPoint[] {
  if (points.length <= 2) return points;

  const findPerpendicularDistance = (
    p: PixelPoint,
    p1: PixelPoint,
    p2: PixelPoint
  ): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const mag = Math.hypot(dx, dy);
    if (mag === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / mag;
  };

  let maxDist = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = findPerpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, index + 1), epsilon);
    const right = simplifyPath(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[points.length - 1]];
}

/**
 * Chaikin's algorithm for smoothing a polyline.
 * Rounds sharp corners and removes pixel staircase jitter.
 */
export function smoothPath(points: PixelPoint[], iterations = 1): PixelPoint[] {
  if (points.length <= 2) return points;

  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: PixelPoint[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];

      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      });

      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }

  return current;
}

