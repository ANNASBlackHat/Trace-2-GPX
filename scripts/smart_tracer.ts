import fs from 'fs';
import {
  COLOR_PRESETS,
  extractRouteMask,
  zhangSuenThinning,
  PixelPoint,
  simplifyPath,
} from '../src/utils/imageProcessing';

interface Node {
  id: number;
  x: number;
  y: number;
  degree: number;
  edges: Edge[];
}

interface Edge {
  id: number;
  nodeA: Node;
  nodeB: Node;
  points: PixelPoint[]; // points from nodeA to nodeB (inclusive)
  visitedCount: number;
}

export function buildGraphFromSkeleton(
  skeleton: Uint8Array,
  width: number,
  height: number
): { nodes: Node[]; edges: Edge[]; skeletonPixels: number } {
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

  // Identify junction / endpoint pixels
  // A pixel is a node if degree !== 2 (i.e. endpoints have degree 1, junctions have degree >= 3)
  const nodePixelMap = new Map<number, Node>();
  const nodes: Node[] = [];
  let nextNodeId = 1;

  for (const idx of pixelSet) {
    const n = getNeighbors(idx);
    if (n.length !== 2) {
      const node: Node = {
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
    const node: Node = {
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
  const edges: Edge[] = [];
  let nextEdgeId = 1;

  for (const startNode of nodes) {
    const startIdx = startNode.y * width + startNode.x;
    const neighbors = getNeighbors(startIdx);

    for (const firstStep of neighbors) {
      const stepKey = `${startIdx}->${firstStep}`;
      if (visitedEdgeStarts.has(stepKey)) continue;

      // Walk along degree-2 pixels until we hit another node
      const edgePoints: PixelPoint[] = [
        { x: startNode.x, y: startNode.y },
        { x: firstStep % width, y: Math.floor(firstStep / width) },
      ];

      visitedEdgeStarts.add(stepKey);

      let prev = startIdx;
      let curr = firstStep;
      let endNode: Node | null = nodePixelMap.get(curr) || null;

      while (!endNode) {
        const nextCandidates = getNeighbors(curr).filter((n) => n !== prev);
        if (nextCandidates.length === 0) break; // dead end without node?
        const next = nextCandidates[0];
        edgePoints.push({ x: next % width, y: Math.floor(next / width) });
        prev = curr;
        curr = next;
        endNode = nodePixelMap.get(curr) || null;
      }

      if (endNode) {
        // Mark reverse step so we don't duplicate undirected edges
        const reverseKey = `${curr}->${prev}`;
        visitedEdgeStarts.add(reverseKey);

        const edge: Edge = {
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
 * Intelligent Tour Planner:
 * Traverses all edges in the graph.
 * If an edge leads to a dead-end spur (endpoint with degree 1), it traverses into the spur
 * and automatically backtracks to the junction so the rest of the route is visited!
 */
export function traceCompleteRoute(
  graph: { nodes: Node[]; edges: Edge[]; skeletonPixels: number },
  startCoord?: PixelPoint
): PixelPoint[] {
  const { nodes, edges } = graph;
  if (edges.length === 0) return [];

  // Pick start node: closest to startCoord or top-left
  let startNode = nodes[0];
  if (startCoord) {
    let bestDist = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - startCoord.x, n.y - startCoord.y);
      if (d < bestDist) {
        bestDist = d;
        startNode = n;
      }
    }
  } else {
    // Prefer degree 1 endpoint if available
    const endpoints = nodes.filter((n) => n.edges.length === 1);
    if (endpoints.length > 0) {
      startNode = endpoints[0];
    }
  }

  const resultPath: PixelPoint[] = [];
  let currentNode = startNode;
  resultPath.push({ x: currentNode.x, y: currentNode.y });

  // Target: visit every edge at least once
  const remainingEdges = new Set(edges);

  while (remainingEdges.size > 0) {
    // Look for an available edge from currentNode
    // Priority:
    // 1. Unvisited dead-end spurs (degree 1 endpoints) -> visit and immediately backtrack!
    // 2. Unvisited normal edges with smoothest continuation angle
    // 3. If currentNode has no unvisited edges, find shortest path to the nearest node with unvisited edges!

    const unvisitedFromHere = currentNode.edges.filter((e) => remainingEdges.has(e));

    if (unvisitedFromHere.length > 0) {
      // Check if any unvisited edge is a dead-end spur (other node has only 1 edge)
      const spurEdge = unvisitedFromHere.find((e) => {
        const other = e.nodeA === currentNode ? e.nodeB : e.nodeA;
        return other.edges.length === 1;
      });

      if (spurEdge) {
        // Traverse spur to dead end, then backtrack immediately to currentNode!
        const forward = spurEdge.nodeA === currentNode;
        const pts = forward ? spurEdge.points : [...spurEdge.points].reverse();
        // Skip first point since it's already in resultPath
        for (let i = 1; i < pts.length; i++) resultPath.push(pts[i]);
        // Backtrack
        for (let i = pts.length - 2; i >= 0; i--) resultPath.push(pts[i]);

        remainingEdges.delete(spurEdge);
        // currentNode stays the same!
        continue;
      }

      // Pick smoothest angle continuation
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
      // Need to bridge / move to nearest node that HAS unvisited edges
      // Use BFS to find shortest path across graph edges to a node with unvisited edges
      const queue: { node: Node; pathNodes: Node[]; pathEdges: Edge[] }[] = [
        { node: currentNode, pathNodes: [currentNode], pathEdges: [] },
      ];
      const visitedBFS = new Set<number>([currentNode.id]);
      let targetPath: { pathNodes: Node[]; pathEdges: Edge[] } | null = null;

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
        // Traverse through the path edges
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
        // Disconnected component? Look for closest node in any other component
        let closestUnvisitedEdge: Edge | null = null;
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
          // Bridge across gap
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
