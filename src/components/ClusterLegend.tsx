import { useState } from "react";
import { SemanticCluster, ParentCluster, SizeMode } from "../types";

interface Props {
  parentClusters: ParentCluster[];
  clusters: SemanticCluster[];
  selectedParent: number | null;
  selectedCluster: number | null;
  onSelectParent: (id: number | null) => void;
  onSelectCluster: (id: number | null) => void;
  totalPapers: number;
  noiseCount: number;
  sizeMode: SizeMode;
  onSizeModeChange: (mode: SizeMode) => void;
  showMyPapers: boolean;
  onShowMyPapersChange: (show: boolean) => void;
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
};

export default function ClusterLegend({
  parentClusters,
  clusters,
  selectedParent,
  selectedCluster,
  onSelectParent,
  onSelectCluster,
  totalPapers,
  noiseCount,
  sizeMode,
  onSizeModeChange,
  showMyPapers,
  onShowMyPapersChange,
}: Props) {
  const [expandedParent, setExpandedParent] = useState<number | null>(null);

  const sorted = [...parentClusters].sort((a, b) => b.paperCount - a.paperCount);

  return (
    <div className="cluster-legend">
      <div className="legend-header">
        <h3>Topics</h3>
        {(selectedParent !== null || selectedCluster !== null) && (
          <button
            className="reset-btn"
            onClick={() => {
              onSelectParent(null);
              onSelectCluster(null);
            }}
          >
            Show all
          </button>
        )}
      </div>
      <div className="legend-count">
        {totalPapers.toLocaleString()} papers &middot; {parentClusters.length}{" "}
        topics &middot; {clusters.length} sub-clusters
        {noiseCount > 0 && ` &middot; ${noiseCount} unclustered`}
      </div>
      <div className="size-toggle">
        <span className="toggle-title">Dot size by</span>
        <div className="toggle-buttons">
          <button
            className={sizeMode === "inGraph" ? "active" : ""}
            onClick={() => onSizeModeChange("inGraph")}
          >
            In-field citations
          </button>
          <button
            className={sizeMode === "global" ? "active" : ""}
            onClick={() => onSizeModeChange("global")}
          >
            Global citations
          </button>
        </div>
      </div>
      <label className="my-papers-toggle">
        <input
          type="checkbox"
          checked={showMyPapers}
          onChange={(e) => onShowMyPapersChange(e.target.checked)}
        />
        <span className="my-papers-dot" />
        <span>Show Falk L. Wiegmann's papers</span>
      </label>
      <div className="legend-list">
        {sorted.map((pc) => {
          const color = PARENT_COLORS[pc.id] || "#666";
          const isExpanded = expandedParent === pc.id;
          const isSelected = selectedParent === pc.id;
          const children = clusters
            .filter((c) => c.parentCluster === pc.id)
            .sort((a, b) => b.paperCount - a.paperCount);

          return (
            <div key={pc.id} className="parent-group">
              <div
                className={`legend-item parent ${isSelected ? "selected" : ""}`}
                onClick={() =>
                  onSelectParent(isSelected ? null : pc.id)
                }
              >
                <span className="legend-dot" style={{ background: color }} />
                <span className="legend-label">{pc.label}</span>
                <span className="legend-paper-count">{pc.paperCount}</span>
                <button
                  className="expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedParent(isExpanded ? null : pc.id);
                  }}
                >
                  {isExpanded ? "\u25B4" : "\u25BE"}
                </button>
              </div>
              {isExpanded && (
                <div className="sub-cluster-list">
                  {children.map((cl) => (
                    <div
                      key={cl.id}
                      className={`legend-item sub ${selectedCluster === cl.id ? "selected" : ""}`}
                      onClick={() =>
                        onSelectCluster(
                          selectedCluster === cl.id ? null : cl.id
                        )
                      }
                    >
                      <span
                        className="legend-dot small"
                        style={{ background: color, opacity: 0.6 }}
                      />
                      <span className="legend-label">
                        {cl.label}
                      </span>
                      <span className="legend-paper-count">
                        {cl.paperCount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="heatbar-section">
        <span className="toggle-title">Background: Avg Publication Year</span>
        <div className="heatbar">
          <div className="heatbar-gradient" />
          <div className="heatbar-labels">
            <span>2012</span>
            <span>2016</span>
            <span>2020</span>
            <span>2024</span>
          </div>
        </div>
      </div>
    </div>
  );
}
