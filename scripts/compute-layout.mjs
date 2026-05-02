#!/usr/bin/env node
/**
 * Recompute ForceAtlas2 layout for focused-graph.json
 *
 * Reads:  public/data/focused-graph.json (with current edges)
 * Writes: public/data/focused-graph.json (with new x/y per node)
 *
 * Process: random init → 300 ForceAtlas2 iterations with LinLog + scaling
 *          → normalize to [-1, 1] → save.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_PATH = path.join(__dirname, "..", "public", "data", "focused-graph.json");
const SEMMAP_PATH = path.join(__dirname, "..", "public", "data", "semantic-map.json");

console.log(`Reading ${GRAPH_PATH}...`);
const data = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
console.log(`  ${data.nodes.length} nodes, ${data.edges.length} edges`);

console.log(`Reading ${SEMMAP_PATH} for semantic clusters...`);
const sm = JSON.parse(fs.readFileSync(SEMMAP_PATH, "utf8"));
const parentClusterMap = new Map(); // node id → parentCluster id
for (const p of sm.papers) {
  if (p.parentCluster !== undefined && p.parentCluster !== null) {
    parentClusterMap.set(p.id, p.parentCluster);
  }
}
const parentLabels = Object.fromEntries((sm.parentClusters || []).map(pc => [pc.id, pc.label]));
const allParentClusterIds = [...new Set([...parentClusterMap.values()])].sort((a, b) => a - b);
console.log(`  ${parentClusterMap.size} graph nodes have a parent cluster (${allParentClusterIds.length} clusters)`);

const graph = new Graph({ multi: false, type: "directed" });
// Place each semantic parent cluster on a ring around the origin.
const RING_RADIUS = 12000;
const COMMUNITY_CENTERS = {};
allParentClusterIds.forEach((cid, i) => {
  const angle = (i / allParentClusterIds.length) * 2 * Math.PI;
  COMMUNITY_CENTERS[cid] = {
    cx: RING_RADIUS * Math.cos(angle),
    cy: RING_RADIUS * Math.sin(angle),
  };
});
const FALLBACK_COMM = -1;
COMMUNITY_CENTERS[FALLBACK_COMM] = { cx: 0, cy: 0 };

let dupNodes = 0;
const commCounts = {};
const nodeComm = new Map();
for (const n of data.nodes) {
  if (graph.hasNode(n.id)) { dupNodes++; continue; }
  const c = parentClusterMap.has(n.id) ? parentClusterMap.get(n.id) : FALLBACK_COMM;
  nodeComm.set(n.id, c);
  commCounts[c] = (commCounts[c] || 0) + 1;
  const center = COMMUNITY_CENTERS[c];
  const r = 1800 * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  graph.addNode(n.id, {
    x: center.cx + r * Math.cos(theta),
    y: center.cy + r * Math.sin(theta),
    size: 1 + Math.log2(1 + (n.citedByCount || 0)),
  });
}
console.log(`  Semantic-cluster seeding:`);
for (const cid of [...allParentClusterIds, FALLBACK_COMM]) {
  if (!commCounts[cid]) continue;
  console.log(`    cluster ${cid} (${parentLabels[cid] || 'unmatched'}): ${commCounts[cid]}`);
}
if (dupNodes) console.log(`  Skipped ${dupNodes} duplicate node IDs`);
// All edges treated equally — let FA2 extract whatever community structure exists naturally.
let skipped = 0, intra = 0, cross = 0;
for (const e of data.edges) {
  if (!graph.hasNode(e.from) || !graph.hasNode(e.to)) {
    skipped++;
    continue;
  }
  if (graph.hasEdge(e.from, e.to)) continue;
  if (nodeComm.get(e.from) === nodeComm.get(e.to)) intra++; else cross++;
  graph.addEdge(e.from, e.to);
}
console.log(`  Built graph: ${graph.order} nodes, ${graph.size} edges (skipped ${skipped} dangling)`);
console.log(`  Intra-cluster: ${intra}, cross-cluster: ${cross} (all weighted equally)`);

// Single-phase: very low gravity so seeded community separation is preserved,
// linLog mode makes hubs visible without collapsing into a single blob.
const settings = {
  barnesHutOptimize: true,
  barnesHutTheta: 0.5,
  strongGravityMode: false,
  gravity: 0.005,
  scalingRatio: 20,
  slowDown: 5,
  linLogMode: true,
  adjustSizes: false,
  outboundAttractionDistribution: true,
  edgeWeightInfluence: 0,
};
console.log("Settings:", settings);

const ITERATIONS = 5000;
console.log(`Running ${ITERATIONS} iterations...`);
const t0 = Date.now();
forceAtlas2.assign(graph, { iterations: ITERATIONS, settings });
console.log(`  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Normalize to [-1, 1] (centered) — no artificial community push, let FA2 settle naturally.
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
graph.forEachNode((_, attrs) => {
  if (attrs.x < minX) minX = attrs.x;
  if (attrs.x > maxX) maxX = attrs.x;
  if (attrs.y < minY) minY = attrs.y;
  if (attrs.y > maxY) maxY = attrs.y;
});
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const half = Math.max(maxX - minX, maxY - minY) / 2;
console.log(`  Bounds: x=[${minX.toFixed(1)}, ${maxX.toFixed(1)}], y=[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);

const positions = {};
graph.forEachNode((id, attrs) => {
  positions[id] = {
    x: (attrs.x - cx) / half,
    y: (attrs.y - cy) / half,
  };
});

let updated = 0;
for (const n of data.nodes) {
  const p = positions[n.id];
  if (p) {
    n.x = p.x;
    n.y = p.y;
    updated++;
  }
}
console.log(`Updated positions for ${updated} nodes`);

fs.writeFileSync(GRAPH_PATH, JSON.stringify(data));
console.log(`Saved → ${GRAPH_PATH}`);
