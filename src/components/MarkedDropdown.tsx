import { useState, useRef, useEffect } from "react";
import { SemanticPaper } from "../types";

interface Props {
  papers: SemanticPaper[];
  markedIds: Set<string>;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export default function MarkedDropdown({ papers, markedIds, onRemove, onClearAll }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (markedIds.size === 0) return null;

  const marked = papers.filter((p) => markedIds.has(p.id));

  return (
    <div className="marked-dropdown-wrapper" ref={ref}>
      <button className="marked-btn" onClick={() => setOpen(!open)}>
        <span className="marked-dot" />
        {markedIds.size} marked
      </button>
      {open && (
        <div className="marked-dropdown">
          <div className="marked-dropdown-header">
            <span>Marked Papers</span>
            <button className="marked-clear" onClick={() => { onClearAll(); setOpen(false); }}>
              Clear all
            </button>
          </div>
          {marked.map((p) => (
            <div key={p.id} className="marked-item">
              <div className="marked-item-info">
                <span className="marked-item-title">{p.title}</span>
                <span className="marked-item-meta">
                  {p.year}{p.authors ? ` · ${p.authors.split(",")[0]}` : ""}
                </span>
              </div>
              <button className="marked-remove" onClick={() => onRemove(p.id)} title="Remove">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
