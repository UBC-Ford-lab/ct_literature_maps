import { useMemo } from "react";
import Plot from "react-plotly.js";
import { SemanticMap, SemanticPaper, SizeMode, InjectedPaper } from "../types";

interface Props {
  data: SemanticMap;
  selectedParent: number | null;
  selectedCluster: number | null;
  sizeMode: SizeMode;
  showMyPapers: boolean;
  injectedPaper?: InjectedPaper | null;
  onSelectPaper: (paper: SemanticPaper | null) => void;
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

function parentColor(id: number): string {
  return PARENT_COLORS[id] || "#666";
}

/**
 * Build a gridded heatmap of average paper year.
 * Each cell averages the year of papers within it.
 * Returns a contour trace for Plotly.
 */
function buildNoveltyHeatmap(papers: SemanticPaper[], gridSize: number = 120) {
  if (!papers.length) return null;

  const xs = papers.map((p) => p.x);
  const ys = papers.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  // Add padding so heatmap extends beyond outermost points
  const pad = 0.5;
  const xLo = xMin - pad, xHi = xMax + pad;
  const yLo = yMin - pad, yHi = yMax + pad;
  const xStep = (xHi - xLo) / gridSize;
  const yStep = (yHi - yLo) / gridSize;

  // Accumulate year sums and counts per grid cell
  const yearSum = Array.from({ length: gridSize }, () => new Float64Array(gridSize));
  const counts = Array.from({ length: gridSize }, () => new Float64Array(gridSize));

  for (const p of papers) {
    if (!p.year || p.year < 2000) continue;
    const xi = Math.min(gridSize - 1, Math.max(0, Math.floor((p.x - xLo) / xStep)));
    const yi = Math.min(gridSize - 1, Math.max(0, Math.floor((p.y - yLo) / yStep)));
    yearSum[yi][xi] += p.year;
    counts[yi][xi] += 1;
  }

  // Compute average year per cell with wider neighbor smoothing
  const avgYear: number[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));

  for (let yi = 0; yi < gridSize; yi++) {
    for (let xi = 0; xi < gridSize; xi++) {
      // Only use the cell itself and immediate neighbors — no diffusion
      let sum = 0, wTotal = 0;
      const r = 1;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = yi + dy, nx = xi + dx;
          if (ny >= 0 && ny < gridSize && nx >= 0 && nx < gridSize && counts[ny][nx] > 0) {
            const w = (dx === 0 && dy === 0) ? counts[ny][nx] * 3 : counts[ny][nx] * 0.5;
            sum += (yearSum[ny][nx] / counts[ny][nx]) * w;
            wTotal += w;
          }
        }
      }
      // Require substantial paper density to show any warmth
      avgYear[yi][xi] = wTotal > 2.0 ? sum / wTotal : 2012;
    }
  }

  const xAxis = Array.from({ length: gridSize }, (_, i) => xLo + (i + 0.5) * xStep);
  const yAxis = Array.from({ length: gridSize }, (_, i) => yLo + (i + 0.5) * yStep);

  // Clamp the color range to 2012-2026 so differences within that range are visible
  return {
    x: xAxis,
    y: yAxis,
    z: avgYear,
    type: "contour" as const,
    zmin: 2012,
    zmax: 2026,
    colorscale: [
      [0,    "#0a0a14"],   // 2012 — matches background exactly
      [0.15, "#0c0c2a"],   // 2014
      [0.3,  "#1a1068"],   // 2016 — deep blue
      [0.45, "#3a1878"],   // 2018 — purple
      [0.6,  "#6a2060"],   // 2020 — magenta
      [0.75, "#a03040"],   // 2022 — warm red
      [0.9,  "#d05020"],   // 2024 — orange
      [1,    "#f07010"],   // 2026 — bright amber
    ],
    contours: {
      coloring: "heatmap" as const,
      showlines: false,
    },
    showscale: false,
    colorbar: {
    },
    opacity: 0.4,
    hoverinfo: "skip" as const,
    showlegend: false,
  };
}

export default function SemanticScatter({
  data,
  selectedParent,
  selectedCluster,
  sizeMode,
  showMyPapers,
  injectedPaper,
  onSelectPaper,
}: Props) {
  const traces = useMemo(() => {
    if (!data.papers.length) return [];

    const allTraces: any[] = [];

    // Heatmap background layer
    const heatmap = buildNoveltyHeatmap(data.papers);
    if (heatmap) allTraces.push(heatmap);

    // Group papers by parent cluster
    const groups = new Map<number, SemanticPaper[]>();
    for (const p of data.papers) {
      const pid = p.parentCluster;
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid)!.push(p);
    }

    // Noise
    const noise = groups.get(-1);
    if (noise) {
      allTraces.push({
        x: noise.map((p) => p.x),
        y: noise.map((p) => p.y),
        text: noise.map(
          (p) =>
            `<b>${p.title}</b><br>Year: ${p.year}<br>Cited: ${p.citedByCount ?? "?"}<br>Unclustered`
        ),
        customdata: noise,
        mode: "markers" as const,
        type: "scattergl" as const,
        name: `Unclustered (${noise.length})`,
        marker: {
          size: noise.map((p) => sizeScale(sizeMode === "inGraph" ? p.inGraphCitations : p.citedByCount)),
          color: "#222233",
          opacity: selectedParent !== null || selectedCluster !== null ? 0.05 : 0.2,
        },
        hoverinfo: "text" as const,
      });
    }

    // Parent topic traces
    for (const pc of data.parentClusters) {
      const papers = groups.get(pc.id) || [];
      if (!papers.length) continue;

      const color = parentColor(pc.id);
      const isParentSelected =
        selectedParent === null || selectedParent === pc.id;
      const hasClusterFilter = selectedCluster !== null;

      allTraces.push({
        x: papers.map((p) => p.x),
        y: papers.map((p) => p.y),
        text: papers.map((p) => {
          const subLabel =
            data.clusters.find((c) => c.id === p.cluster)?.label ||
            "Sub-cluster " + p.cluster;
          return `<b>${p.title}</b><br>Year: ${p.year}<br>Cited: ${p.citedByCount?.toLocaleString() ?? "?"}<br>In-field: ${p.inGraphCitations}<br>Topic: ${pc.label}<br>Sub: ${subLabel}${p.isSeed ? "<br><b>SEED PAPER</b>" : ""}`;
        }),
        customdata: papers,
        mode: "markers" as const,
        type: "scattergl" as const,
        name: `${pc.label} (${pc.paperCount})`,
        marker: {
          size: papers.map((p) => sizeScale(sizeMode === "inGraph" ? p.inGraphCitations : p.citedByCount)),
          color: hasClusterFilter
            ? papers.map((p) =>
                p.cluster === selectedCluster ? color : "#111122"
              )
            : color,
          opacity: isParentSelected ? 0.8 : 0.06,
          line: {
            width: papers.map((p) => (p.isSeed ? 2 : 0)),
            color: "#ffd700",
          },
        },
        hoverinfo: "text" as const,
      });
    }

    // My papers layer — on top with permanent labels
    const myIds = new Set(data.myPaperIds || []);
    const myPapers = data.papers.filter((p) => myIds.has(p.id));
    if (showMyPapers && myPapers.length > 0) {
      const labels = data.myPaperLabels || {};
      allTraces.push({
        x: myPapers.map((p) => p.x),
        y: myPapers.map((p) => p.y),
        text: myPapers.map(
          (p) =>
            `<b>${p.title}</b><br>Year: ${p.year}`
        ),
        customdata: myPapers,
        mode: "markers+text" as const,
        type: "scatter" as const,
        name: "My Papers",
        textposition: "top center" as const,
        textfont: {
          size: 10,
          color: "#ffffff",
          family: "Inter, system-ui, sans-serif",
        },
        marker: {
          size: 14,
          color: "#ff2d55",
          symbol: "diamond",
          line: { width: 2, color: "#ffffff" },
        },
        hoverinfo: "text" as const,
      });
      // Separate text trace for labels (so they render with scatter, not scattergl)
      allTraces.push({
        x: myPapers.map((p) => p.x),
        y: myPapers.map((p) => p.y),
        text: myPapers.map((p) => labels[p.id] || p.title.slice(0, 30)),
        mode: "text" as const,
        type: "scatter" as const,
        textposition: "bottom center" as const,
        textfont: {
          size: 9,
          color: "#ff8fa8",
          family: "Inter, system-ui, sans-serif",
        },
        hoverinfo: "skip" as const,
        showlegend: false,
      });
    }

    // Injected paper (from "Place Your Paper" feature)
    if (injectedPaper) {
      allTraces.push({
        x: [injectedPaper.x],
        y: [injectedPaper.y],
        text: [`<b>${injectedPaper.title}</b><br>Topic: ${injectedPaper.nearestCluster.parentLabel}<br>Sub: ${injectedPaper.nearestCluster.label}`],
        mode: "markers+text" as const,
        type: "scatter" as const,
        name: "Your Paper",
        textposition: "top center" as const,
        textfont: { size: 11, color: "#00ff88", family: "Inter, system-ui, sans-serif" },
        marker: {
          size: 18,
          color: "#00ff88",
          symbol: "star",
          line: { width: 2, color: "#ffffff" },
        },
        hoverinfo: "text" as const,
        showlegend: false,
      });
      allTraces.push({
        x: [injectedPaper.x],
        y: [injectedPaper.y],
        text: [injectedPaper.title.length > 40 ? injectedPaper.title.slice(0, 37) + "..." : injectedPaper.title],
        mode: "text" as const,
        type: "scatter" as const,
        textposition: "bottom center" as const,
        textfont: { size: 9, color: "#00cc66", family: "Inter, system-ui, sans-serif" },
        hoverinfo: "skip" as const,
        showlegend: false,
      });
    }

    return allTraces;
  }, [data, selectedParent, selectedCluster, sizeMode, showMyPapers, injectedPaper]);

  return (
    <Plot
      data={traces}
      layout={{
        // @ts-expect-error plotly template string
        template: "plotly_dark",
        paper_bgcolor: "#0a0a14",
        plot_bgcolor: "#0a0a14",
        margin: { t: 10, b: 10, l: 10, r: 10 },
        xaxis: { visible: false, fixedrange: false },
        yaxis: { visible: false, fixedrange: false, scaleanchor: "x" },
        showlegend: false,
        hoverlabel: {
          bgcolor: "#1a1a2e",
          bordercolor: "#3a3a6a",
          font: {
            size: 11,
            color: "#e0e0f0",
            family: "Inter, system-ui, sans-serif",
          },
        },
        dragmode: "pan",
      }}
      config={{
        scrollZoom: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
        displaylogo: false,
      }}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
      onClick={(event) => {
        const point = event.points?.[0];
        if (point?.customdata) {
          onSelectPaper(point.customdata as unknown as SemanticPaper);
        }
      }}
    />
  );
}

function sizeScale(citedBy: number | null): number {
  const c = citedBy || 0;
  if (c <= 0) return 3;
  return Math.max(3, Math.min(30, 3 + (Math.log(c) / Math.log(1.5)) * 0.7));
}
