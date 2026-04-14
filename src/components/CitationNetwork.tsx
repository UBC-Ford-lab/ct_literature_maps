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
}

const CATEGORY_COLORS: Record<number, string> = {
  0: "#e6a020",
  1: "#a855f7",
  2: "#14b8a6",
};


export default function CitationNetwork({ onPaperCount, onSelectPaper }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Store selection state in refs for reducers
  const selectedRef = useRef<string | null>(null);
  const neighborsRef = useRef<Set<string>>(new Set());
  const outEdgesRef = useRef<Set<string>>(new Set());
  const inEdgesRef = useRef<Set<string>>(new Set());

  // Handle selection changes
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

      // Build paper info for detail panel
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

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    // Wait until container has real dimensions before initializing Sigma
    const container = containerRef.current;
    const waitForSize = (): Promise<void> => {
      return new Promise((resolve) => {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          resolve();
          return;
        }
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
              observer.disconnect();
              resolve();
              return;
            }
          }
        });
        observer.observe(container);
      });
    };

    (async () => {
      await waitForSize();
      if (cancelled) return;

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

        // Scale up positions so graph fills the viewport (Sigma works best with larger coords)
        graph.addNode(n.id, {
          x: (n.x ?? (Math.random() - 0.5)) * 500,
          y: (n.y ?? (Math.random() - 0.5)) * 500,
          size,
          color,
          origColor: color,
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
          graph.addDirectedEdge(e.from, e.to, { size: 0.3, color: "#1e1e40" });
        }
      }

      graphRef.current = graph;
      setLoading(false);

      const sigma = new Sigma(graph, containerRef.current!, {
        allowInvalidContainer: true,
        autoCenter: false,
        autoRescale: false,
        renderLabels: true,
        labelRenderedSizeThreshold: 6,
        labelSize: 10,
        labelColor: { color: "#c0c0d8" },
        labelFont: "Inter, system-ui, sans-serif",
        defaultEdgeColor: "#1e1e40",
        defaultEdgeType: "arrow",

        nodeReducer: (node, data) => {
          const sel = selectedRef.current;
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
            color: "#111122",
            size: (data.size || 3) * 0.5,
            label: "",
            zIndex: -1,
          };
        },

        edgeReducer: (edge, data) => {
          const sel = selectedRef.current;
          if (!sel) return { ...data };

          if (outEdgesRef.current.has(edge)) {
            return { ...data, color: "#4f8ff7", size: 1.5, zIndex: 15 };
          }
          if (inEdgesRef.current.has(edge)) {
            return { ...data, color: "#f7734f", size: 1.5, zIndex: 15 };
          }
          return { ...data, hidden: true };
        },
      });

      sigma.on("clickNode", ({ node }) => {
        handleSelect(node === selectedRef.current ? null : node);
      });
      sigma.on("clickStage", () => {
        handleSelect(null);
      });
      sigma.on("enterNode", () => {
        if (!selectedRef.current) {
          sigma.setSetting("labelRenderedSizeThreshold", 0);
        }
      });
      sigma.on("leaveNode", () => {
        if (!selectedRef.current) {
          sigma.setSetting("labelRenderedSizeThreshold", 6);
        }
      });

      sigmaRef.current = sigma;

      // Manually center and fit the graph since autoRescale doesn't work reliably in tabs
      const fitGraph = () => {
        const container = containerRef.current;
        if (!container) return;

        const w = container.offsetWidth;
        const h = container.offsetHeight;
        if (w === 0 || h === 0) return;

        // Compute graph bounding box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        graph.forEachNode((_n, attrs) => {
          minX = Math.min(minX, attrs.x);
          maxX = Math.max(maxX, attrs.x);
          minY = Math.min(minY, attrs.y);
          maxY = Math.max(maxY, attrs.y);
        });

        const graphW = maxX - minX || 1;
        const graphH = maxY - minY || 1;
        const graphCx = (minX + maxX) / 2;
        const graphCy = (minY + maxY) / 2;

        // Sigma's camera x/y are in a coordinate system where the graph
        // is normalized to fit the viewport. With autoRescale off, we need
        // to set the camera to look at the center of the graph, with a ratio
        // that fits everything in view.
        // In Sigma without autoRescale, camera (0,0) = top-left of graph bbox,
        // and 1 unit = 1 pixel. So we need to:
        // - Center: camera.x = graphCx, camera.y = graphCy
        // - Ratio: how many graph-units per pixel. To fit graphW into w pixels:
        //   ratio = graphW / w (approximately)
        const padding = 1.2; // 20% padding
        const ratioX = (graphW * padding) / w;
        const ratioY = (graphH * padding) / h;
        const ratio = Math.max(ratioX, ratioY);

        sigma.getCamera().setState({
          x: graphCx,
          y: graphCy,
          ratio,
          angle: 0,
        });
        sigma.refresh();
      };

      // Try fitting multiple times as layout settles
      requestAnimationFrame(fitGraph);
      setTimeout(fitGraph, 100);
      setTimeout(fitGraph, 500);
    })();

    return () => {
      cancelled = true;
      sigmaRef.current?.kill();
    };
  }, [onPaperCount, handleSelect]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "#0a0a14" }} />
      {loading && (
        <div className="loading-overlay">Loading citation network...</div>
      )}
      <div className="citation-legend">
        <div><span className="legend-dot" style={{ background: "#e6a020" }} /> CT Undersampling & SR</div>
        <div><span className="legend-dot" style={{ background: "#a855f7" }} /> AI & DL Foundations</div>
        <div><span className="legend-dot" style={{ background: "#14b8a6" }} /> CT Reconstruction Theory</div>
        {selectedNode && (
          <>
            <div style={{ borderTop: "1px solid #2a2a4a", marginTop: 6, paddingTop: 6 }}>
              <span className="legend-dot" style={{ background: "#4f8ff7", display: "inline-block", width: 16, height: 3, borderRadius: 1.5 }} /> References (cites)
            </div>
            <div>
              <span className="legend-dot" style={{ background: "#f7734f", display: "inline-block", width: 16, height: 3, borderRadius: 1.5 }} /> Cited by
            </div>
          </>
        )}
      </div>
    </div>
  );
}
