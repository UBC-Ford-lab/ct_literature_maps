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

console.log(`Reading ${GRAPH_PATH}...`);
const data = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
console.log(`  ${data.nodes.length} nodes, ${data.edges.length} edges`);

const graph = new Graph({ multi: false, type: "directed" });
let dupNodes = 0;
for (const n of data.nodes) {
  if (graph.hasNode(n.id)) { dupNodes++; continue; }
  graph.addNode(n.id, {
    x: Math.random() * 1000 - 500,
    y: Math.random() * 1000 - 500,
    size: 1 + Math.log2(1 + (n.citedByCount || 0)),
  });
}
if (dupNodes) console.log(`  Skipped ${dupNodes} duplicate node IDs`);
let skipped = 0;
for (const e of data.edges) {
  if (!graph.hasNode(e.from) || !graph.hasNode(e.to)) {
    skipped++;
    continue;
  }
  if (graph.hasEdge(e.from, e.to)) continue;
  graph.addEdge(e.from, e.to);
}
console.log(`  Built graph: ${graph.order} nodes, ${graph.size} edges (skipped ${skipped} dangling)`);

const settings = forceAtlas2.inferSettings(graph);
settings.linLogMode = true;
settings.adjustSizes = true;
settings.barnesHutOptimize = true;
settings.barnesHutTheta = 0.7;
settings.gravity = 1.0;
settings.scalingRatio = 10.0;
settings.slowDown = 5.0;
console.log("Settings:", settings);

const ITERATIONS = 300;
console.log(`Running ${ITERATIONS} iterations...`);
const t0 = Date.now();
forceAtlas2.assign(graph, { iterations: ITERATIONS, settings });
console.log(`  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Normalize to [-1, 1] (centered)
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
