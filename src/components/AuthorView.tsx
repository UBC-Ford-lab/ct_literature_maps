import { useMemo } from "react";
import { SemanticPaper } from "../types";

interface Props {
  authorName: string;
  papers: SemanticPaper[];
  markedPapers: Set<string>;
  onToggleMark: (id: string) => void;
  onMarkAll: (ids: string[]) => void;
  onBack: () => void;
  onSelectPaper: (paper: SemanticPaper) => void;
}

export default function AuthorView({
  authorName,
  papers,
  markedPapers,
  onToggleMark,
  onMarkAll,
  onBack,
  onSelectPaper,
}: Props) {
  const authorPapers = useMemo(() => {
    const name = authorName.toLowerCase();
    return papers
      .filter((p) => (p.authors || "").toLowerCase().includes(name))
      .sort((a, b) => (b.citedByCount || 0) - (a.citedByCount || 0));
  }, [authorName, papers]);

  const allIds = authorPapers.map((p) => p.id);
  const allMarked = allIds.length > 0 && allIds.every((id) => markedPapers.has(id));

  return (
    <div className="author-view">
      <button className="author-back" onClick={onBack}>&larr; Back</button>
      <h3 className="author-name">{authorName}</h3>
      <p className="author-count">{authorPapers.length} paper{authorPapers.length !== 1 ? "s" : ""} in this dataset</p>
      <button
        className={`mark-btn ${allMarked ? "marked" : ""}`}
        onClick={() => onMarkAll(allIds)}
      >
        {allMarked ? "Unmark all" : "Mark all on map"}
      </button>
      <div className="author-papers">
        {authorPapers.map((p) => (
          <div key={p.id} className="author-paper-item">
            <div className="author-paper-info" onClick={() => onSelectPaper(p)}>
              <span className="author-paper-title">{p.title}</span>
              <span className="author-paper-meta">
                {p.year} &middot; {(p.citedByCount || 0).toLocaleString()} citations
              </span>
            </div>
            <button
              className={`author-paper-mark ${markedPapers.has(p.id) ? "marked" : ""}`}
              onClick={() => onToggleMark(p.id)}
              title={markedPapers.has(p.id) ? "Unmark" : "Mark on map"}
            >
              {markedPapers.has(p.id) ? "●" : "○"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
