import { useState, useMemo, useRef, useEffect } from "react";
import { SemanticPaper } from "../types";

interface Props {
  papers: SemanticPaper[];
  onSelect: (paper: SemanticPaper) => void;
  onSelectAuthor: (name: string) => void;
}

interface AuthorResult {
  name: string;
  paperCount: number;
}

export default function SearchBar({ papers, onSelect, onSelectAuthor }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build author index once
  const authorIndex = useMemo(() => {
    const index = new Map<string, number>();
    for (const p of papers) {
      if (!p.authors) continue;
      for (const name of p.authors.split(", ")) {
        const trimmed = name.trim();
        if (trimmed) index.set(trimmed, (index.get(trimmed) || 0) + 1);
      }
    }
    return index;
  }, [papers]);

  const { authorResults, paperResults } = useMemo(() => {
    if (query.length < 2) return { authorResults: [], paperResults: [] };
    const q = query.toLowerCase();

    // Find matching authors
    const authorResults: AuthorResult[] = [];
    for (const [name, count] of authorIndex) {
      // Match query words against author name words (word-boundary matching)
      // "Rui Li" matches "Rui Li" but NOT "Rui Liu" or "Rui Liao"
      const nameWords = name.toLowerCase().split(/[\s.]+/).filter(Boolean);
      const qWords = q.split(/\s+/).filter(Boolean);
      const matches = qWords.every((qw) =>
        nameWords.some((nw) => nw === qw || (qw.length >= 2 && nw === qw))
      );
      // For single-word queries, allow prefix matching (typing "Rah" finds "Rahmim")
      const singleWordPrefix = qWords.length === 1 && nameWords.some((nw) => nw.startsWith(qWords[0]));
      if (matches || singleWordPrefix) {
        authorResults.push({ name, paperCount: count });
      }
    }
    authorResults.sort((a, b) => b.paperCount - a.paperCount);

    // Find matching papers
    const paperResults = papers
      .filter((p) =>
        p.title.toLowerCase().includes(q) ||
        (p.authors || "").toLowerCase().includes(q) ||
        p.id.replace(/_/g, " ").includes(q)
      )
      .sort((a, b) => (b.citedByCount || 0) - (a.citedByCount || 0))
      .slice(0, 10);

    return { authorResults: authorResults.slice(0, 5), paperResults };
  }, [query, papers, authorIndex]);

  const hasResults = authorResults.length > 0 || paperResults.length > 0;

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <input
        className="search-input"
        type="text"
        placeholder="Search by title or author..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (query.length >= 2) setOpen(true); }}
      />
      {open && hasResults && (
        <div className="search-dropdown">
          {authorResults.length > 0 && (
            <>
              <div className="search-section-header">Authors</div>
              {authorResults.map((a) => (
                <div
                  key={a.name}
                  className="search-result author-result"
                  onClick={() => {
                    onSelectAuthor(a.name);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="search-author-name">{a.name}</span>
                  <span className="search-meta">{a.paperCount} paper{a.paperCount !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </>
          )}
          {paperResults.length > 0 && (
            <>
              {authorResults.length > 0 && <div className="search-section-header">Papers</div>}
              {paperResults.map((p) => (
                <div
                  key={p.id}
                  className="search-result"
                  onClick={() => {
                    onSelect(p);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="search-title">{p.title}</span>
                  {p.authors && <span className="search-authors">{p.authors}</span>}
                  <span className="search-meta">
                    {p.year} &middot; {(p.citedByCount || 0).toLocaleString()} citations
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
