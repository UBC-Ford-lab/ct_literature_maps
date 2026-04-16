import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { SemanticMap } from "../types";

interface Props {
  data: SemanticMap;
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

interface SubClusterStats {
  id: number;
  label: string;
  parentId: number;
  parentLabel: string;
  total: number;
  pre2020: number;
  y2021_22: number;
  y2023_24: number;
  y2025_26: number;
  growthRate: number;
  recentPct: number;
  avgCitations: number;
  yearCounts: Record<number, number>;
}

type SortKey = "growthRate" | "recentPct" | "total" | "avgCitations" | "label";

export default function ResearchTrends({ data }: Props) {
  const [selectedParent, setSelectedParent] = useState<number | null>(null);
  const [highlightCluster, setHighlightCluster] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("growthRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Compute stats
  const { parentYearCounts, subStats, yearRange, insights } = useMemo(() => {
    const years = data.papers.map((p) => p.year).filter((y) => y >= 2010 && y <= 2026);
    const minY = 2010;
    const maxY = 2026;

    // Parent category year counts
    const parentYearCounts = new Map<number, Record<number, number>>();
    for (const pc of data.parentClusters) {
      const counts: Record<number, number> = {};
      for (let y = minY; y <= maxY; y++) counts[y] = 0;
      parentYearCounts.set(pc.id, counts);
    }
    for (const p of data.papers) {
      if (p.year < minY || p.year > maxY) continue;
      const counts = parentYearCounts.get(p.parentCluster);
      if (counts) counts[p.year] = (counts[p.year] || 0) + 1;
    }

    // Sub-cluster stats
    const subStats: SubClusterStats[] = [];
    for (const cl of data.clusters) {
      if (cl.paperCount < 5) continue;
      const members = data.papers.filter((p) => p.cluster === cl.id);
      const parent = data.parentClusters.find((pc) => pc.id === cl.parentCluster);

      const pre2020 = members.filter((p) => p.year <= 2020).length;
      const y2021_22 = members.filter((p) => p.year >= 2021 && p.year <= 2022).length;
      const y2023_24 = members.filter((p) => p.year >= 2023 && p.year <= 2024).length;
      const y2025_26 = members.filter((p) => p.year >= 2025).length;
      const recent = y2023_24 + y2025_26;
      const growthRate = y2021_22 > 0 ? recent / y2021_22 : recent > 0 ? 10 : 0;
      const avgCitations =
        members.reduce((s, p) => s + (p.citedByCount || 0), 0) / members.length;

      const yearCounts: Record<number, number> = {};
      for (let y = minY; y <= maxY; y++) yearCounts[y] = 0;
      for (const p of members) {
        if (p.year >= minY && p.year <= maxY) yearCounts[p.year]++;
      }

      subStats.push({
        id: cl.id,
        label: cl.label,
        parentId: cl.parentCluster,
        parentLabel: parent?.label || "?",
        total: members.length,
        pre2020,
        y2021_22,
        y2023_24,
        y2025_26,
        growthRate,
        recentPct: (recent / members.length) * 100,
        avgCitations,
        yearCounts,
      });
    }

    // Insights
    const insights: string[] = [];
    const fastestGrowing = [...subStats].sort((a, b) => b.recentPct - a.recentPct)[0];
    if (fastestGrowing) {
      insights.push(
        `${fastestGrowing.label}: ${fastestGrowing.recentPct.toFixed(0)}% of papers since 2023`
      );
    }
    const highestCited = [...subStats].sort((a, b) => b.avgCitations - a.avgCitations)[0];
    if (highestCited) {
      insights.push(
        `${highestCited.label}: highest avg citations (${highestCited.avgCitations.toFixed(0)})`
      );
    }
    const totalRecent = data.papers.filter((p) => p.year >= 2023).length;
    const totalAll = data.papers.length;
    insights.push(
      `${totalRecent.toLocaleString()} of ${totalAll.toLocaleString()} papers (${((totalRecent / totalAll) * 100).toFixed(0)}%) published since 2023`
    );

    return { parentYearCounts, subStats, yearRange: [minY, maxY] as [number, number], insights };
  }, [data]);

  // Stacked area traces
  const areaTraces = useMemo(() => {
    const yearLabels = [];
    for (let y = yearRange[0]; y <= yearRange[1]; y++) yearLabels.push(y);

    const traces = [];
    const sortedParents = [...data.parentClusters].sort((a, b) => a.paperCount - b.paperCount);

    for (const pc of sortedParents) {
      if (selectedParent !== null && selectedParent !== pc.id) continue;
      const counts = parentYearCounts.get(pc.id);
      if (!counts) continue;

      traces.push({
        x: yearLabels,
        y: yearLabels.map((y) => counts[y] || 0),
        name: pc.label,
        type: "scatter" as const,
        mode: "lines" as const,
        stackgroup: "one",
        line: { width: 0.5, color: PARENT_COLORS[pc.id] || "#666" },
        fillcolor: (PARENT_COLORS[pc.id] || "#666") + "88",
        hovertemplate: `%{x}: %{y} papers<br>${pc.label}<extra></extra>`,
      });
    }

    // If a sub-cluster is highlighted, overlay its line
    if (highlightCluster !== null) {
      const sub = subStats.find((s) => s.id === highlightCluster);
      if (sub) {
        traces.push({
          x: yearLabels,
          y: yearLabels.map((y) => sub.yearCounts[y] || 0),
          name: sub.label,
          type: "scatter" as const,
          mode: "lines+markers" as const,
          line: { width: 3, color: "#ffffff" },
          marker: { size: 5, color: "#ffffff" },
          hovertemplate: `%{x}: %{y} papers<br>${sub.label}<extra></extra>`,
        });
      }
    }

    return traces;
  }, [data, parentYearCounts, yearRange, selectedParent, highlightCluster, subStats]);

  // Sort table
  const sortedStats = useMemo(() => {
    const filtered = selectedParent !== null
      ? subStats.filter((s) => s.parentId === selectedParent)
      : subStats;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "growthRate": cmp = a.growthRate - b.growthRate; break;
        case "recentPct": cmp = a.recentPct - b.recentPct; break;
        case "total": cmp = a.total - b.total; break;
        case "avgCitations": cmp = a.avgCitations - b.avgCitations; break;
        case "label": cmp = a.label.localeCompare(b.label); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [subStats, sortKey, sortDir, selectedParent]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === "desc" ? " \u25BC" : " \u25B2") : "";

  return (
    <div className="trends-layout">
      <div className="trends-sidebar">
        <h3>Research Trends</h3>
        <p className="trends-desc">
          Publication growth by topic area. Click a category to filter, hover a
          sub-cluster row to overlay its trend line.
        </p>

        <div className="trends-insights">
          <h4>Key Insights</h4>
          {insights.map((insight, i) => (
            <div key={i} className="insight-item">{insight}</div>
          ))}
        </div>

        <div className="trends-filter">
          <h4>Filter by Category</h4>
          <button
            className={selectedParent === null ? "active" : ""}
            onClick={() => setSelectedParent(null)}
          >
            All
          </button>
          {data.parentClusters
            .sort((a, b) => b.paperCount - a.paperCount)
            .map((pc) => (
              <button
                key={pc.id}
                className={selectedParent === pc.id ? "active" : ""}
                onClick={() => setSelectedParent(selectedParent === pc.id ? null : pc.id)}
              >
                <span
                  className="filter-dot"
                  style={{ background: PARENT_COLORS[pc.id] }}
                />
                {pc.label}
              </button>
            ))}
        </div>
      </div>

      <div className="trends-main">
        <div className="trends-chart">
          <Plot
            data={areaTraces}
            layout={{
              // @ts-expect-error plotly template
              template: "plotly_dark",
              paper_bgcolor: "#0a0a14",
              plot_bgcolor: "#0a0a14",
              margin: { t: 20, b: 40, l: 50, r: 20 },
              xaxis: {
                title: { text: "Year", font: { size: 11, color: "#686888" } },
                tickfont: { size: 10, color: "#9898b8" },
                gridcolor: "#1a1a2e",
                range: [2010, 2026],
                dtick: 2,
              },
              yaxis: {
                title: { text: "Papers Published", font: { size: 11, color: "#686888" } },
                tickfont: { size: 10, color: "#9898b8" },
                gridcolor: "#1a1a2e",
              },
              legend: {
                font: { size: 9, color: "#9898b8" },
                bgcolor: "rgba(10,10,20,0.8)",
                bordercolor: "#2a2a4a",
                borderwidth: 1,
              },
              hoverlabel: {
                bgcolor: "#1a1a2e",
                bordercolor: "#3a3a6a",
                font: { size: 11, color: "#e0e0f0" },
              },
              showlegend: true,
            }}
            config={{ displayModeBar: false, scrollZoom: false }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </div>

        <div className="trends-table-wrapper">
          <table className="trends-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("label")}>
                  Sub-cluster{sortArrow("label")}
                </th>
                <th>Category</th>
                <th className="sortable num" onClick={() => toggleSort("total")}>
                  Total{sortArrow("total")}
                </th>
                <th className="num">21-22</th>
                <th className="num">23-24</th>
                <th className="num">25-26</th>
                <th className="sortable num" onClick={() => toggleSort("growthRate")}>
                  Growth{sortArrow("growthRate")}
                </th>
                <th className="sortable num" onClick={() => toggleSort("recentPct")}>
                  Recent %{sortArrow("recentPct")}
                </th>
                <th className="sortable num" onClick={() => toggleSort("avgCitations")}>
                  Avg Cited{sortArrow("avgCitations")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((s) => (
                <tr
                  key={s.id}
                  className={highlightCluster === s.id ? "highlighted" : ""}
                  onMouseEnter={() => setHighlightCluster(s.id)}
                  onMouseLeave={() => setHighlightCluster(null)}
                >
                  <td>
                    <span
                      className="table-dot"
                      style={{ background: PARENT_COLORS[s.parentId] }}
                    />
                    {s.label}
                  </td>
                  <td className="cat-cell">{s.parentLabel}</td>
                  <td className="num">{s.total}</td>
                  <td className="num">{s.y2021_22}</td>
                  <td className="num">{s.y2023_24}</td>
                  <td className="num">{s.y2025_26}</td>
                  <td className="num">
                    <span className={`growth-badge ${s.growthRate >= 3 ? "hot" : s.growthRate >= 2 ? "warm" : ""}`}>
                      {s.growthRate >= 10 ? "new" : s.growthRate.toFixed(1) + "x"}
                    </span>
                  </td>
                  <td className="num">{s.recentPct.toFixed(0)}%</td>
                  <td className="num">{s.avgCitations.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
