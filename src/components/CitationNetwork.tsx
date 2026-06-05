import { useEffect, useRef, useState, useCallback } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { CitationGraph } from "../types";
import { downloadText, svgEscape } from "../utils/exportFigure";

export interface CitationSelectedPaper {
  id: string;
  title: string;
  year: number;
  citedByCount: number | null;
  community: number;
  references: { id: string; title: string; year: number }[];
  citedBy: { id: string; title: string; year: number }[];
}

interface Props {
  onPaperCount: (count: number) => void;
  onSelectPaper: (paper: CitationSelectedPaper | null) => void;
  searchNodeId?: string | null;
  onSearchHandled?: () => void;
  markedPapers?: Set<string>;
  showAiBase: boolean;
}

const PARENT_COLORS: Record<number, string> = {
  1: "#e6a020",
  2: "#20b8e6",
  3: "#e64a20",
  4: "#a855f7",
  5: "#22c55e",
  6: "#3b82f6",
  7: "#f472b6",
  8: "#14b8a6",
  9: "#94a3b8",
};

// Mix a hex color toward white. amount=1 -> white, 0 -> full color.
function lightenToward(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

// Opaque per-cluster edge colors. We deliberately do NOT use alpha: with 67k
// edges and three dominant near-identical hues (teal+cyan+purple = ~67% of
// edges), true alpha accumulation blows the dense core into one color and hides
// the rest. Opaque colors render every cluster at equal intensity. EDGE_LIGHTEN
// is the only saturation knob (lower = more pronounced, higher = more subtle).
const EDGE_LIGHTEN = 0.6;
const EDGE_SIZE = 0.4;
const EDGE_COLORS: Record<number, string> = Object.fromEntries(
  Object.entries(PARENT_COLORS).map(([k, v]) => [Number(k), lightenToward(v, EDGE_LIGHTEN)]),
);
const DEFAULT_EDGE_COLOR = lightenToward("#96a0b4", EDGE_LIGHTEN);

export default function CitationNetwork({ onPaperCount, onSelectPaper, searchNodeId, onSearchHandled, markedPapers, showAiBase }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [yearRange, setYearRange] = useState<[number, number]>([1970, 2026]);
  const yearRangeRef = useRef<[number, number]>([1970, 2026]);
  const [showCamDebug, setShowCamDebug] = useState(false);
  const [includeLegend, setIncludeLegend] = useState(true);
  const [camState, setCamState] = useState<{ x: number; y: number; ratio: number } | null>(null);
  const [parentLabels, setParentLabels] = useState<Record<number, string>>({});

  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const markedRef = useRef<Set<string>>(new Set());
  const showAiBaseRef = useRef<boolean>(true);
  const totalNodesRef = useRef<number>(0);
  const ctNodesRef = useRef<number>(0);
  const neighborsRef = useRef<Set<string>>(new Set());
  const outEdgesRef = useRef<Set<string>>(new Set());
  const inEdgesRef = useRef<Set<string>>(new Set());

  const handleSelect = useCallback((nodeId: string | null) => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    selectedRef.current = nodeId;
    neighborsRef.current = new Set();
    outEdgesRef.current = new Set();
    inEdgesRef.current = new Set();

    if (nodeId && graph.hasNode(nodeId)) {
      graph.forEachOutEdge(nodeId, (edge, _attr, _src, target) => {
        neighborsRef.current.add(target);
        outEdgesRef.current.add(edge);
      });
      graph.forEachInEdge(nodeId, (edge, _attr, source) => {
        neighborsRef.current.add(source);
        inEdgesRef.current.add(edge);
      });

      const refs = [...outEdgesRef.current].map((e) => {
        const target = graph.target(e);
        return {
          id: target,
          title: graph.getNodeAttribute(target, "fullTitle") || "",
          year: graph.getNodeAttribute(target, "year") || 0,
        };
      });
      const citedBy = [...inEdgesRef.current].map((e) => {
        const source = graph.source(e);
        return {
          id: source,
          title: graph.getNodeAttribute(source, "fullTitle") || "",
          year: graph.getNodeAttribute(source, "year") || 0,
        };
      });

      onSelectPaper({
        id: nodeId,
        title: graph.getNodeAttribute(nodeId, "fullTitle") || "",
        year: graph.getNodeAttribute(nodeId, "year") || 0,
        citedByCount: graph.getNodeAttribute(nodeId, "citedByCount") ?? null,
        community: graph.getNodeAttribute(nodeId, "communityId") ?? 0,
        references: refs.sort((a, b) => b.year - a.year),
        citedBy: citedBy.sort((a, b) => b.year - a.year),
      });
    } else {
      onSelectPaper(null);
    }

    setSelectedNode(nodeId);
    sigma.refresh();
  }, [onSelectPaper]);

  // Sync marked papers ref and refresh
  useEffect(() => {
    markedRef.current = markedPapers || new Set();
    sigmaRef.current?.refresh();
  }, [markedPapers]);

  // Handle search from top bar
  useEffect(() => {
    if (searchNodeId && graphRef.current?.hasNode(searchNodeId)) {
      handleSelect(searchNodeId);
      onSearchHandled?.();
    }
  }, [searchNodeId, handleSelect, onSearchHandled]);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let sigmaInstance: Sigma | null = null;

    (async () => {
      const [graphRes, semRes] = await Promise.all([
        fetch("./data/focused-graph.json"),
        fetch("./data/semantic-map.json"),
      ]);
      const data: CitationGraph = await graphRes.json();
      const semMap = await semRes.json();
      if (cancelled) return;

      // Map node id → parentCluster (from semantic map)
      const parentClusterMap = new Map<string, number>();
      for (const p of semMap.papers || []) {
        if (p.parentCluster !== undefined && p.parentCluster !== null) {
          parentClusterMap.set(p.id, p.parentCluster);
        }
      }
      // Capture parent labels for the legend
      const labels: Record<number, string> = {};
      for (const pc of semMap.parentClusters || []) {
        labels[pc.id] = pc.label;
      }
      setParentLabels(labels);

      const graph = new Graph();
      const seen = new Set<string>();
      let ctNodeCount = 0;

      const inDeg = new Map<string, number>();
      for (const n of data.nodes) inDeg.set(n.id, 0);
      for (const e of data.edges) {
        if (inDeg.has(e.to)) inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
      }

      for (const n of data.nodes) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        const deg = inDeg.get(n.id) || 0;
        const citations = n.citedByCount || 0;
        const size = citations <= 0 ? 1 : Math.max(1, Math.min(12, Math.sqrt(citations) * 0.07));
        const parentCluster = parentClusterMap.get(n.id);
        const color = (parentCluster !== undefined && PARENT_COLORS[parentCluster]) || "#999";
        const track = n.track ?? "ct";
        if (track !== "ai") ctNodeCount++;

        graph.addNode(n.id, {
          x: (n.x ?? (Math.random() - 0.5)) * 500,
          y: (n.y ?? (Math.random() - 0.5)) * 500,
          size,
          color,
          label: "",
          fullTitle: n.title,
          year: n.year,
          citedByCount: n.citedByCount,
          communityId: n.community ?? 0,
          parentCluster: parentCluster ?? -1,
          inDegree: deg,
          track,
        });
      }

      totalNodesRef.current = data.totalNodes;
      ctNodesRef.current = ctNodeCount;
      onPaperCount(showAiBaseRef.current ? data.totalNodes : ctNodeCount);

      for (const e of data.edges) {
        if (graph.hasNode(e.from) && graph.hasNode(e.to) && !graph.hasDirectedEdge(e.from, e.to)) {
          const srcParent = parentClusterMap.get(e.from);
          const edgeColor = (srcParent !== undefined && EDGE_COLORS[srcParent]) || DEFAULT_EDGE_COLOR;
          graph.addDirectedEdge(e.from, e.to, { size: EDGE_SIZE, color: edgeColor });
        }
      }

      graphRef.current = graph;
      setLoading(false);

      // Wait for the container to be fully laid out before creating Sigma
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      if (cancelled) return;

      const container = containerRef.current;
      if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) return;

      sigmaInstance = new Sigma(graph, container, {
        zIndex: true,
        renderLabels: true,
        labelRenderedSizeThreshold: 6,
        labelSize: 10,
        labelColor: { color: "#2a2a40" },
        labelFont: "Inter, system-ui, sans-serif",
        defaultEdgeColor: "#e8ecf2",
        defaultEdgeType: "arrow",
        stagePadding: 30,

        nodeReducer: (node, data) => {
          // CT-only mode: hide AI-foundation papers entirely.
          if (!showAiBaseRef.current && data.track === "ai") {
            return { ...data, hidden: true };
          }

          const yr = graphRef.current?.getNodeAttribute(node, "year") || 0;
          const [minY, maxY] = yearRangeRef.current;
          const inRange = yr >= minY && yr <= maxY;

          if (!inRange) return { ...data, hidden: true };

          const isMarked = markedRef.current.has(node);
          const sel = selectedRef.current;

          const fullTitle = graphRef.current?.getNodeAttribute(node, "fullTitle") || data.label;

          // Marked papers always stay visible and pink
          if (isMarked) {
            const isAlsoSelected = node === sel;
            return {
              ...data,
              color: isAlsoSelected ? "#ffd700" : "#d63384",
              size: (data.size || 3) * 2,
              zIndex: isAlsoSelected ? 30 : 20,
              label: fullTitle,
              forceLabel: true,
            };
          }

          if (!sel) {
            // Nothing selected: reveal a title only for the hovered node.
            if (node === hoveredRef.current) {
              return { ...data, label: fullTitle, forceLabel: true, zIndex: 10 };
            }
            return { ...data };
          }

          if (node === sel) {
            return {
              ...data,
              color: "#ffd700",
              size: (data.size || 3) * 1.8,
              zIndex: 30,
              label: fullTitle,
              forceLabel: true,
            };
          }
          if (neighborsRef.current.has(node)) {
            return {
              ...data,
              zIndex: 10,
              highlighted: true,
              label: fullTitle,
              forceLabel: true,
            };
          }
          return {
            ...data,
            color: "#e0e0e8",
            size: (data.size || 3) * 0.5,
            label: "",
            zIndex: -1,
          };
        },

        edgeReducer: (edge, data) => {
          const graph = graphRef.current;
          // CT-only mode: hide edges touching an AI-foundation paper.
          if (!showAiBaseRef.current && graph) {
            const srcTrack = graph.getNodeAttribute(graph.source(edge), "track");
            const tgtTrack = graph.getNodeAttribute(graph.target(edge), "track");
            if (srcTrack === "ai" || tgtTrack === "ai") {
              return { ...data, hidden: true };
            }
          }
          // Hide edges where either endpoint is out of year range
          if (graph) {
            const [minY, maxY] = yearRangeRef.current;
            const srcYear = graph.getNodeAttribute(graph.source(edge), "year") || 0;
            const tgtYear = graph.getNodeAttribute(graph.target(edge), "year") || 0;
            if (srcYear < minY || srcYear > maxY || tgtYear < minY || tgtYear > maxY) {
              return { ...data, hidden: true };
            }
          }

          const sel = selectedRef.current;
          const hasMarked = markedRef.current.size > 0;

          // Check if this edge involves marked papers
          let srcMarked = false, tgtMarked = false;
          if (graph && hasMarked) {
            srcMarked = markedRef.current.has(graph.source(edge));
            tgtMarked = markedRef.current.has(graph.target(edge));
          }

          // Check if this edge involves the selected node
          const isOutgoing = sel && outEdgesRef.current.has(edge);
          const isIncoming = sel && inEdgesRef.current.has(edge);

          // Determine edge style — zIndex now works (setting enabled)
          if (isOutgoing) {
            return { ...data, color: "#4f8ff7", size: 0.8, zIndex: 30 };
          }
          if (isIncoming) {
            return { ...data, color: "#f7734f", size: 0.8, zIndex: 30 };
          }
          if (srcMarked && tgtMarked) {
            return { ...data, color: "#d63384", size: 0.8, zIndex: 20 };
          }
          if (srcMarked || tgtMarked) {
            return { ...data, color: "#e899b8", size: 0.6, zIndex: 15 };
          }

          // If a node is selected, hide everything else
          if (sel) return { ...data, hidden: true };
          // If papers are marked, fade everything else
          if (hasMarked) {
            return { ...data, color: "#f0f0f4", size: 0.2, zIndex: 0 };
          }

          return { ...data };
        },
      });

      sigmaInstance.on("clickNode", ({ node }) => {
        handleSelect(node === selectedRef.current ? null : node);
      });
      sigmaInstance.on("clickStage", () => {
        handleSelect(null);
      });
      sigmaInstance.on("enterNode", ({ node }) => {
        hoveredRef.current = node;
        sigmaInstance?.refresh();
      });
      sigmaInstance.on("leaveNode", () => {
        hoveredRef.current = null;
        sigmaInstance?.refresh();
      });

      sigmaRef.current = sigmaInstance;

      // Set camera to the correct centered position
      setTimeout(() => {
        sigmaInstance?.getCamera().setState({
          x: 0.3808,
          y: 0.5101,
          ratio: 0.8944,
          angle: 0,
        });
      }, 100);
    })();

    return () => {
      cancelled = true;
      sigmaInstance?.kill();
      sigmaRef.current = null;
    };
  }, [onPaperCount, handleSelect]);

  // Refresh Sigma when year range changes
  useEffect(() => {
    yearRangeRef.current = yearRange;
    sigmaRef.current?.refresh();
  }, [yearRange]);

  // Toggle AI-base visibility: hide/show ai nodes+edges and update the count.
  useEffect(() => {
    showAiBaseRef.current = showAiBase;
    if (totalNodesRef.current > 0) {
      onPaperCount(showAiBase ? totalNodesRef.current : ctNodesRef.current);
    }
    sigmaRef.current?.refresh();
  }, [showAiBase, onPaperCount]);

  // Subscribe to camera updates when debug overlay is on
  useEffect(() => {
    if (!showCamDebug) {
      setCamState(null);
      return;
    }
    const sigma = sigmaRef.current;
    if (!sigma) return;
    const cam = sigma.getCamera();
    const update = () => {
      const s = cam.getState();
      setCamState({ x: s.x, y: s.y, ratio: s.ratio });
    };
    update();
    cam.on("updated", update);
    return () => { cam.off("updated", update); };
  }, [showCamDebug]);

  // Build a compact vector SVG of the network directly from the layout, honoring
  // the current AI-base and year filters. All edges of a group are merged into
  // ONE <path> (instead of one element per edge) so the file stays small and the
  // PDF has ~6.5k objects, not ~130k. When papers are marked, the figure mirrors
  // the on-screen marked state (pink highlighted nodes + labels, pink/light-pink
  // connecting edges, everything else grayed); otherwise edges are colored by
  // source cluster.
  const handleExportSVG = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const showAi = showAiBaseRef.current;
    const [minYr, maxYr] = yearRangeRef.current;
    const marked = markedRef.current;
    const hasMarked = marked.size > 0;
    const round = (v: number) => Math.round(v);
    const isVisible = (n: string): boolean => {
      const t = graph.getNodeAttribute(n, "track");
      if (!showAi && t === "ai") return false;
      const yr = (graph.getNodeAttribute(n, "year") as number) || 0;
      return yr >= minYr && yr <= maxYr;
    };

    // Visible nodes (y flipped: Sigma y is up, SVG y is down). Marked nodes are
    // pulled out so they can be drawn on top, pink and labeled.
    type VN = { x: number; y: number; r: number };
    const nodesByColor = new Map<string, VN[]>();
    const markedNodes: { x: number; y: number; r: number; title: string }[] = [];
    const vis = new Set<string>();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const bump = (x: number, y: number, r: number) => {
      if (x - r < minX) minX = x - r;
      if (x + r > maxX) maxX = x + r;
      if (y - r < minY) minY = y - r;
      if (y + r > maxY) maxY = y + r;
    };
    graph.forEachNode((id, a: any) => {
      if (!isVisible(id)) return;
      vis.add(id);
      const x = a.x as number;
      const y = -(a.y as number);
      const baseR = Math.max(0.8, (a.size as number) * 1.3);
      if (hasMarked && marked.has(id)) {
        const r = Math.max(3, baseR * 1.7);
        markedNodes.push({ x, y, r, title: (a.fullTitle as string) || "" });
        bump(x, y, r);
      } else {
        const color = (a.color as string) || "#999";
        const arr = nodesByColor.get(color) || [];
        arr.push({ x, y, r: baseR });
        nodesByColor.set(color, arr);
        bump(x, y, baseR);
      }
    });
    if (!vis.size) return;

    // Visible edges. With marks: pink (both ends marked) / light-pink (one end) /
    // gray (rest). Without marks: grouped by source-cluster color.
    const seg = (sa: any, ta: any) => `M${round(sa.x)} ${round(-sa.y)}L${round(ta.x)} ${round(-ta.y)}`;
    const edgePaths = new Map<string, string[]>();
    const ePair: string[] = [], eAdj: string[] = [], eFade: string[] = [];
    graph.forEachEdge((_e, _ea: any, s: string, t: string, sa: any, ta: any) => {
      if (!vis.has(s) || !vis.has(t)) return;
      if (hasMarked) {
        const sm = marked.has(s), tm = marked.has(t);
        if (sm && tm) ePair.push(seg(sa, ta));
        else if (sm || tm) eAdj.push(seg(sa, ta));
        else eFade.push(seg(sa, ta));
      } else {
        const color = (sa.color as string) || "#999";
        const arr = edgePaths.get(color) || [];
        arr.push(seg(sa, ta));
        edgePaths.set(color, arr);
      }
    });

    const pad = (maxX - minX) * 0.02 + 10;
    const vbX = minX - pad, vbY = minY - pad;
    const vbW = maxX - minX + pad * 2, vbH = maxY - minY + pad * 2;

    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(vbX)} ${round(vbY)} ${round(vbW)} ${round(vbH)}" width="${round(vbW)}" height="${round(vbH)}">`,
    );
    parts.push(`<rect x="${round(vbX)}" y="${round(vbY)}" width="${round(vbW)}" height="${round(vbH)}" fill="#ffffff"/>`);

    // Edge layer (gray first so highlighted edges sit on top).
    parts.push(`<g fill="none" stroke-linecap="round">`);
    if (hasMarked) {
      if (eFade.length) parts.push(`<path stroke="#d9dde4" stroke-width="0.4" d="${eFade.join("")}"/>`);
      if (eAdj.length) parts.push(`<path stroke="#e899b8" stroke-width="0.8" d="${eAdj.join("")}"/>`);
      if (ePair.length) parts.push(`<path stroke="#d63384" stroke-width="1.2" d="${ePair.join("")}"/>`);
    } else {
      for (const [color, segs] of edgePaths) {
        parts.push(`<path stroke="${color}" stroke-opacity="0.2" stroke-width="0.5" d="${segs.join("")}"/>`);
      }
    }
    parts.push(`</g>`);

    // Node layer (grouped by fill color so each circle omits its own fill).
    for (const [color, ns] of nodesByColor) {
      parts.push(`<g fill="${color}">`);
      for (const n of ns) parts.push(`<circle cx="${round(n.x)}" cy="${round(n.y)}" r="${n.r.toFixed(1)}"/>`);
      parts.push(`</g>`);
    }

    // Marked nodes (pink, on top) + their labels with a white halo for legibility.
    if (markedNodes.length) {
      const fs = Math.max(7, vbW / 80);
      parts.push(`<g fill="#d63384" stroke="#ffffff">`);
      for (const m of markedNodes) {
        parts.push(`<circle cx="${round(m.x)}" cy="${round(m.y)}" r="${m.r.toFixed(1)}" stroke-width="${(m.r * 0.25).toFixed(2)}"/>`);
      }
      parts.push(`</g>`);
      parts.push(`<g font-family="Inter, system-ui, sans-serif" font-size="${fs.toFixed(1)}" fill="#a01a52" paint-order="stroke" stroke="#ffffff" stroke-width="${(fs * 0.28).toFixed(2)}" stroke-linejoin="round">`);
      for (const m of markedNodes) {
        const label = m.title.length > 48 ? m.title.slice(0, 45) + "…" : m.title;
        parts.push(`<text x="${(m.x + m.r + fs * 0.4).toFixed(1)}" y="${(m.y + fs * 0.35).toFixed(1)}">${svgEscape(label)}</text>`);
      }
      parts.push(`</g>`);
    }

    // Legend (top-left), sized relative to the figure.
    const entries = Object.entries(PARENT_COLORS).filter(([id]) => parentLabels[Number(id)]);
    if (includeLegend && entries.length) {
      const fs = Math.max(7, vbW / 75);
      const dot = fs * 0.85;
      const rowH = fs * 1.7;
      const lx = vbX + pad, ly = vbY + pad;
      const boxW = fs * 22, boxH = rowH * entries.length + fs * 0.8;
      parts.push(`<g font-family="Inter, system-ui, sans-serif" font-size="${fs.toFixed(1)}">`);
      parts.push(`<rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="${(fs * 0.5).toFixed(1)}" fill="#ffffff" fill-opacity="0.95" stroke="#dde0e8" stroke-width="${(fs * 0.06).toFixed(2)}"/>`);
      entries.forEach(([id, color], i) => {
        const cy = ly + fs * 0.9 + rowH * (i + 0.5);
        const cx = lx + fs * 0.9;
        parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(dot / 2).toFixed(1)}" fill="${color}"/>`);
        parts.push(`<text x="${(cx + dot).toFixed(1)}" y="${(cy + fs * 0.35).toFixed(1)}" fill="#1a1a2e">${svgEscape(parentLabels[Number(id)])}</text>`);
      });
      parts.push(`</g>`);
    }

    parts.push(`</svg>`);
    downloadText(parts.join(""), "citation-network.svg");
  }, [parentLabels, includeLegend]);

  const handleYearChange = (idx: 0 | 1, value: number) => {
    setYearRange((prev) => {
      const next: [number, number] = [...prev] as [number, number];
      next[idx] = value;
      if (next[0] > next[1]) {
        next[idx === 0 ? 1 : 0] = value;
      }
      return next;
    });
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#ffffff" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%"}} />
      {loading && (
        <div className="loading-overlay">Loading citation network...</div>
      )}
      <div className="citation-legend">
        {Object.entries(PARENT_COLORS)
          .filter(([id]) => parentLabels[Number(id)])
          .map(([id, color]) => (
            <div key={id}>
              <span className="legend-dot" style={{ background: color }} />
              {parentLabels[Number(id)]}
            </div>
          ))}
        {selectedNode && (
          <>
            <div style={{ borderTop: "1px solid #dde0e8", marginTop: 6, paddingTop: 6 }}>
              <span className="legend-dot" style={{ background: "#4f8ff7", display: "inline-block", width: 16, height: 3, borderRadius: 1.5 }} /> References (cites)
            </div>
            <div>
              <span className="legend-dot" style={{ background: "#f7734f", display: "inline-block", width: 16, height: 3, borderRadius: 1.5 }} /> Cited by
            </div>
          </>
        )}
      </div>
      <div className="fig-export-group">
        <button
          className="fig-export-btn fig-export-btn--ingroup"
          onClick={handleExportSVG}
          title="Download this network as a compact vector SVG figure"
        >
          ⤓ SVG
        </button>
        <label className="fig-export-opt" title="Include the topic-cluster legend in the exported SVG">
          <input
            type="checkbox"
            checked={includeLegend}
            onChange={(e) => setIncludeLegend(e.target.checked)}
          />
          Legend
        </label>
      </div>
      <button
        className="cam-debug-toggle"
        onClick={() => setShowCamDebug((v) => !v)}
        title="Toggle camera coords overlay"
      >
        ⊕
      </button>
      {showCamDebug && camState && (
        <div className="cam-debug-overlay">
          Camera: x: {camState.x.toFixed(4)}, y: {camState.y.toFixed(4)}, ratio: {camState.ratio.toFixed(4)}
        </div>
      )}
      <div className="citation-year-filter">
        <span className="year-label">Year: {yearRange[0]} – {yearRange[1]}</span>
        <input
          type="range"
          min={1970}
          max={2026}
          value={yearRange[0]}
          onChange={(e) => handleYearChange(0, Number(e.target.value))}
        />
        <input
          type="range"
          min={1970}
          max={2026}
          value={yearRange[1]}
          onChange={(e) => handleYearChange(1, Number(e.target.value))}
        />
      </div>
    </div>
  );
}
