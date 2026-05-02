import { useEffect, useRef, useState, useCallback } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { CitationGraph } from "../types";

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
}

const CATEGORY_COLORS: Record<number, string> = {
  0: "#e6a020",
  1: "#a855f7",
  2: "#14b8a6",
};

export default function CitationNetwork({ onPaperCount, onSelectPaper, searchNodeId, onSearchHandled, markedPapers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [yearRange, setYearRange] = useState<[number, number]>([1970, 2026]);
  const yearRangeRef = useRef<[number, number]>([1970, 2026]);
  const [showCamDebug, setShowCamDebug] = useState(false);
  const [camState, setCamState] = useState<{ x: number; y: number; ratio: number } | null>(null);

  const selectedRef = useRef<string | null>(null);
  const markedRef = useRef<Set<string>>(new Set());
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
      const res = await fetch("./data/focused-graph.json");
      const data: CitationGraph = await res.json();
      if (cancelled) return;

      onPaperCount(data.totalNodes);

      const graph = new Graph();
      const seen = new Set<string>();

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
        const color = CATEGORY_COLORS[n.community ?? 0] || "#666";

        graph.addNode(n.id, {
          x: (n.x ?? (Math.random() - 0.5)) * 500,
          y: (n.y ?? (Math.random() - 0.5)) * 500,
          size,
          color,
          label: deg >= 5 ? (n.title.length > 50 ? n.title.slice(0, 47) + "..." : n.title) : "",
          fullTitle: n.title,
          year: n.year,
          citedByCount: n.citedByCount,
          communityId: n.community ?? 0,
          inDegree: deg,
        });
      }

      for (const e of data.edges) {
        if (graph.hasNode(e.from) && graph.hasNode(e.to) && !graph.hasDirectedEdge(e.from, e.to)) {
          graph.addDirectedEdge(e.from, e.to, { size: 0.3, color: "#d0d0e0" });
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
        defaultEdgeColor: "#d0d0e0",
        defaultEdgeType: "arrow",
        stagePadding: 30,

        nodeReducer: (node, data) => {
          const yr = graphRef.current?.getNodeAttribute(node, "year") || 0;
          const [minY, maxY] = yearRangeRef.current;
          const inRange = yr >= minY && yr <= maxY;

          if (!inRange) return { ...data, hidden: true };

          const isMarked = markedRef.current.has(node);
          const sel = selectedRef.current;

          // Marked papers always stay visible and pink
          if (isMarked) {
            const isAlsoSelected = node === sel;
            return {
              ...data,
              color: isAlsoSelected ? "#ffd700" : "#d63384",
              size: (data.size || 3) * 2,
              zIndex: isAlsoSelected ? 30 : 20,
              label: graphRef.current?.getNodeAttribute(node, "fullTitle") || data.label,
            };
          }

          if (!sel) return { ...data };

          if (node === sel) {
            return {
              ...data,
              color: "#ffd700",
              size: (data.size || 3) * 1.8,
              zIndex: 30,
              label: graphRef.current?.getNodeAttribute(node, "fullTitle") || data.label,
            };
          }
          if (neighborsRef.current.has(node)) {
            return {
              ...data,
              zIndex: 10,
              highlighted: true,
              label: graphRef.current?.getNodeAttribute(node, "fullTitle") || data.label,
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
          // Hide edges where either endpoint is out of year range
          const graph = graphRef.current;
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
            return { ...data, color: "#4f8ff7", size: 2.5, zIndex: 30 };
          }
          if (isIncoming) {
            return { ...data, color: "#f7734f", size: 2.5, zIndex: 30 };
          }
          if (srcMarked && tgtMarked) {
            return { ...data, color: "#d63384", size: 2, zIndex: 20 };
          }
          if (srcMarked || tgtMarked) {
            return { ...data, color: "#e899b8", size: 1.2, zIndex: 15 };
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
      sigmaInstance.on("enterNode", () => {
        if (!selectedRef.current) {
          sigmaInstance?.setSetting("labelRenderedSizeThreshold", 0);
        }
      });
      sigmaInstance.on("leaveNode", () => {
        if (!selectedRef.current) {
          sigmaInstance?.setSetting("labelRenderedSizeThreshold", 6);
        }
      });

      sigmaRef.current = sigmaInstance;

      // Set camera to the correct centered position
      setTimeout(() => {
        sigmaInstance?.getCamera().setState({
          x: 0.5056,
          y: 0.4302,
          ratio: 0.2092,
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
    <div style={{ width: "100%", height: "100%", background: "#ffffff" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%"}} />
      {loading && (
        <div className="loading-overlay">Loading citation network...</div>
      )}
      <div className="citation-legend">
        <div><span className="legend-dot" style={{ background: "#e6a020" }} /> CT Undersampling & SR</div>
        <div><span className="legend-dot" style={{ background: "#a855f7" }} /> AI & DL Foundations</div>
        <div><span className="legend-dot" style={{ background: "#14b8a6" }} /> CT Reconstruction Theory</div>
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
