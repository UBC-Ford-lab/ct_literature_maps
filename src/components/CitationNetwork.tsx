import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { CitationGraph } from "../types";

interface Props {
  onPaperCount: (count: number) => void;
}

const CATEGORY_COLORS: Record<number, string> = {
  0: "#e6a020", // CT Undersampling & SR
  1: "#a855f7", // AI & DL Foundations
  2: "#14b8a6", // CT Reconstruction Theory
};

export default function CitationNetwork({ onPaperCount }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      const res = await fetch("./data/focused-graph.json");
      const data: CitationGraph = await res.json();
      if (cancelled) return;

      onPaperCount(data.totalNodes);

      const graph = new Graph();
      const seen = new Set<string>();

      // Compute in-degree
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
          x: n.x ?? (Math.random() - 0.5) * 100,
          y: n.y ?? (Math.random() - 0.5) * 100,
          size,
          color,
          label: deg >= 5 ? (n.title.length > 50 ? n.title.slice(0, 47) + "..." : n.title) : "",
          fullTitle: n.title,
          year: n.year,
        });
      }

      for (const e of data.edges) {
        if (graph.hasNode(e.from) && graph.hasNode(e.to) && !graph.hasDirectedEdge(e.from, e.to)) {
          graph.addDirectedEdge(e.from, e.to, { size: 0.3, color: "#1e1e40" });
        }
      }

      setLoading(false);

      const sigma = new Sigma(graph, containerRef.current!, {
        allowInvalidContainer: true,
        renderLabels: true,
        labelRenderedSizeThreshold: 6,
        labelSize: 10,
        labelColor: { color: "#c0c0d8" },
        labelFont: "Inter, system-ui, sans-serif",
        defaultEdgeColor: "#1e1e40",
        defaultEdgeType: "arrow",
        nodeReducer: (node, data) => {
          const res = { ...data };
          return res;
        },
        edgeReducer: (_edge, data) => {
          return { ...data, hidden: false };
        },
      });

      sigma.on("clickNode", ({ node }) => {
        setSelectedTitle(graph.getNodeAttribute(node, "fullTitle") || null);
      });
      sigma.on("enterNode", ({ node }) => {
        const title = graph.getNodeAttribute(node, "fullTitle");
        if (title) {
          sigma.setSetting("labelRenderedSizeThreshold", 0);
        }
      });
      sigma.on("leaveNode", () => {
        sigma.setSetting("labelRenderedSizeThreshold", 6);
      });

      sigmaRef.current = sigma;
    })();

    return () => {
      cancelled = true;
      sigmaRef.current?.kill();
    };
  }, [onPaperCount]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#0a0a14" }} />
      {loading && (
        <div className="loading-overlay">Loading citation network...</div>
      )}
      {selectedTitle && (
        <div className="citation-tooltip">
          {selectedTitle}
          <button onClick={() => setSelectedTitle(null)}>x</button>
        </div>
      )}
      <div className="citation-legend">
        <div><span className="legend-dot" style={{ background: "#e6a020" }} /> CT Undersampling & SR</div>
        <div><span className="legend-dot" style={{ background: "#a855f7" }} /> AI & DL Foundations</div>
        <div><span className="legend-dot" style={{ background: "#14b8a6" }} /> CT Reconstruction Theory</div>
      </div>
    </div>
  );
}
