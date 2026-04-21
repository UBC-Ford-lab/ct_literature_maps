import { useState, useEffect, useCallback } from "react";
import SemanticScatter from "./components/SemanticScatter";
import ClusterLegend from "./components/ClusterLegend";
import CitationNetwork, { CitationSelectedPaper } from "./components/CitationNetwork";
import InjectPaper from "./components/InjectPaper";
import ResearchTrends from "./components/ResearchTrends";
import SearchBar from "./components/SearchBar";
import MarkedDropdown from "./components/MarkedDropdown";
import AuthorView from "./components/AuthorView";
import ClickableAuthors from "./components/ClickableAuthors";
import {
  ViewTab,
  SemanticMap,
  SemanticPaper,
  SizeMode,
  InjectedPaper,
} from "./types";
import "./App.css";

export default function App() {
  const [tab, setTab] = useState<ViewTab>("semantic");
  const [semanticData, setSemanticData] = useState<SemanticMap | null>(null);
  const [selectedParent, setSelectedParent] = useState<number | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<SemanticPaper | null>(null);
  const [sizeMode, setSizeMode] = useState<SizeMode>("inGraph");
  const [showMyPapers, setShowMyPapers] = useState(false);
  const [injectedPaper, setInjectedPaper] = useState<InjectedPaper | null>(null);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [citationCount, setCitationCount] = useState(0);
  const [citationSelected, setCitationSelected] = useState<CitationSelectedPaper | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [citationSearchId, setCitationSearchId] = useState<string | null>(null);
  const [viewingAuthor, setViewingAuthor] = useState<string | null>(null);
  const [markedPapers, setMarkedPapers] = useState<Set<string>>(new Set());

  const toggleMarkAll = useCallback((ids: string[]) => {
    setMarkedPapers((prev) => {
      const next = new Set(prev);
      const allMarked = ids.every((id) => next.has(id));
      if (allMarked) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  const toggleMark = useCallback((id: string) => {
    setMarkedPapers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    fetch("./data/semantic-map.json")
      .then((r) => r.json())
      .then((data) => setSemanticData(data));
  }, []);

  const handleInject = useCallback((paper: InjectedPaper) => {
    setInjectedPaper(paper);
    setIsEmbedding(false);
    setTab("semantic");
  }, []);

  const handleSearch = useCallback((paper: SemanticPaper) => {
    if (tab === "semantic" || tab === "inject") {
      setSelectedPaper(paper);
    } else if (tab === "citation") {
      setCitationSearchId(paper.id);
    }
  }, [tab]);

  if (!semanticData) {
    return (
      <div className="app loading-app">
        <h1>Loading Literature Map...</h1>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top-bar">
        <div className="top-bar-left">
          <h1>CT Reconstruction Literature Map</h1>
          <span className="subtitle">
            AI-Driven Computed Tomography Reconstruction &amp; Enhancement
          </span>
        </div>
        <nav className="view-tabs">
          <button
            className={tab === "semantic" ? "active" : ""}
            onClick={() => setTab("semantic")}
          >
            Semantic Map
          </button>
          <button
            className={tab === "citation" ? "active" : ""}
            onClick={() => setTab("citation")}
          >
            Citation Network
          </button>
          <button
            className={tab === "trends" ? "active" : ""}
            onClick={() => setTab("trends")}
          >
            Research Trends
          </button>
          <button
            className={tab === "inject" ? "active" : ""}
            onClick={() => setTab("inject")}
          >
            Place Your Paper
          </button>
        </nav>
        <div className="top-bar-right">
          {(tab === "semantic" || tab === "citation") && semanticData && (
            <>
              <SearchBar papers={semanticData.papers} onSelect={handleSearch} onSelectAuthor={setViewingAuthor} />
              <MarkedDropdown
                papers={semanticData.papers}
                markedIds={markedPapers}
                onRemove={toggleMark}
                onClearAll={() => setMarkedPapers(new Set())}
              />
            </>
          )}
          <span className="paper-count">
            {tab === "citation"
              ? `${citationCount.toLocaleString()} papers`
              : `${semanticData.totalPapers.toLocaleString()} papers`}
          </span>
          <a className="github-btn" href="https://github.com/UBC-Ford-lab/ct_literature_maps" target="_blank" rel="noopener noreferrer" title="View on GitHub">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
          <button className="help-btn" onClick={() => setShowWelcome(true)} title="About this tool">
            ?
          </button>
        </div>
      </header>

      <div className="main-layout">
        {(tab === "semantic" || tab === "inject") && (
          <div className="sidebar">
            {tab === "inject" ? (
              <InjectPaper
                semanticMap={semanticData}
                onInject={handleInject}
                onClear={() => setInjectedPaper(null)}
                injectedPaper={injectedPaper}
                isLoading={isEmbedding}
              />
            ) : (
              <ClusterLegend
                parentClusters={semanticData.parentClusters}
                clusters={semanticData.clusters}
                selectedParent={selectedParent}
                selectedCluster={selectedCluster}
                onSelectParent={(id) => {
                  setSelectedParent(id);
                  setSelectedCluster(null);
                }}
                onSelectCluster={setSelectedCluster}
                totalPapers={semanticData.totalPapers}
                noiseCount={semanticData.noiseCount}
                sizeMode={sizeMode}
                onSizeModeChange={setSizeMode}
                showMyPapers={showMyPapers}
                onShowMyPapersChange={setShowMyPapers}
              />
            )}
          </div>
        )}

        <div className="viz-area">
          {(tab === "semantic" || tab === "inject") && (
            <SemanticScatter
              data={semanticData}
              selectedParent={selectedParent}
              selectedCluster={selectedCluster}
              sizeMode={sizeMode}
              showMyPapers={showMyPapers}
              injectedPaper={injectedPaper}
              markedPapers={markedPapers}
              onSelectPaper={setSelectedPaper}
            />
          )}
          {tab === "citation" && (
            <CitationNetwork onPaperCount={setCitationCount} onSelectPaper={setCitationSelected} searchNodeId={citationSearchId} onSearchHandled={() => setCitationSearchId(null)} markedPapers={markedPapers} />
          )}
          {tab === "trends" && (
            <ResearchTrends data={semanticData} />
          )}
        </div>

        {(tab === "semantic" || tab === "inject") && (
          <div className="detail-panel">
            {viewingAuthor ? (
              <AuthorView
                authorName={viewingAuthor}
                papers={semanticData.papers}
                markedPapers={markedPapers}
                onToggleMark={toggleMark}
                onMarkAll={toggleMarkAll}
                onBack={() => setViewingAuthor(null)}
                onSelectPaper={(p) => { setSelectedPaper(p); setViewingAuthor(null); }}
              />
            ) : selectedPaper ? (
              <>
                <div className="detail-header">
                  <span className="detail-year">{selectedPaper.year}</span>
                  {selectedPaper.isSeed && <span className="seed-badge">Seed</span>}
                  {selectedPaper.isMyPaper && <span className="my-badge">My Paper</span>}
                </div>
                <h2 className="detail-title">{selectedPaper.title}</h2>
                <div className="detail-meta">
                  <div className="meta-item">
                    <span className="meta-label">Global Citations</span>
                    <span className="meta-value">{selectedPaper.citedByCount?.toLocaleString() ?? "?"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">In-Field Citations</span>
                    <span className="meta-value">{selectedPaper.inGraphCitations}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Topic</span>
                    <span className="meta-value">
                      {semanticData.parentClusters.find((pc) => pc.id === selectedPaper.parentCluster)?.label ?? "—"}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Sub-cluster</span>
                    <span className="meta-value">
                      {semanticData.clusters.find((c) => c.id === selectedPaper.cluster)?.label ?? "—"}
                    </span>
                  </div>
                </div>
                {selectedPaper.authors && (
                  <ClickableAuthors authors={selectedPaper.authors} onClickAuthor={setViewingAuthor} />
                )}
                <button
                  className={`mark-btn ${markedPapers.has(selectedPaper.id) ? "marked" : ""}`}
                  onClick={() => toggleMark(selectedPaper.id)}
                >
                  {markedPapers.has(selectedPaper.id) ? "Unmark on map" : "Mark on map"}
                </button>
              </>
            ) : (
              <div className="empty-detail">
                <p>Click a paper to see details</p>
              </div>
            )}
          </div>
        )}

        {tab === "citation" && (
          <div className="detail-panel">
            {viewingAuthor ? (
              <AuthorView
                authorName={viewingAuthor}
                papers={semanticData.papers}
                markedPapers={markedPapers}
                onToggleMark={toggleMark}
                onMarkAll={toggleMarkAll}
                onBack={() => setViewingAuthor(null)}
                onSelectPaper={(p) => { setCitationSearchId(p.id); setViewingAuthor(null); }}
              />
            ) : citationSelected ? (
              <>
                <div className="detail-header">
                  <span className="detail-year">{citationSelected.year}</span>
                </div>
                <h2 className="detail-title">{citationSelected.title}</h2>
                <div className="detail-meta">
                  <div className="meta-item">
                    <span className="meta-label">Global Citations</span>
                    <span className="meta-value">{citationSelected.citedByCount?.toLocaleString() ?? "?"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Connections</span>
                    <span className="meta-value">
                      {citationSelected.references.length} refs, {citationSelected.citedBy.length} cited-by
                    </span>
                  </div>
                </div>
                {(() => {
                  const sem = semanticData.papers.find((p) => p.id === citationSelected.id);
                  return sem?.authors ? (
                    <ClickableAuthors authors={sem.authors} onClickAuthor={setViewingAuthor} />
                  ) : null;
                })()}
                <button
                  className={`mark-btn ${markedPapers.has(citationSelected.id) ? "marked" : ""}`}
                  onClick={() => toggleMark(citationSelected.id)}
                >
                  {markedPapers.has(citationSelected.id) ? "Unmark on map" : "Mark on map"}
                </button>

                {citationSelected.references.length > 0 && (
                  <div className="citation-connections">
                    <h4>
                      <span className="dir-line" style={{ background: "#4f8ff7" }} />
                      References ({citationSelected.references.length})
                    </h4>
                    <ul>
                      {citationSelected.references.slice(0, 20).map((r) => (
                        <li key={r.id}>
                          <span className="conn-year">[{r.year}]</span>
                          <span className="conn-title">{r.title}</span>
                        </li>
                      ))}
                      {citationSelected.references.length > 20 && (
                        <li className="conn-more">...and {citationSelected.references.length - 20} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {citationSelected.citedBy.length > 0 && (
                  <div className="citation-connections">
                    <h4>
                      <span className="dir-line" style={{ background: "#f7734f" }} />
                      Cited By ({citationSelected.citedBy.length})
                    </h4>
                    <ul>
                      {citationSelected.citedBy.slice(0, 20).map((r) => (
                        <li key={r.id}>
                          <span className="conn-year">[{r.year}]</span>
                          <span className="conn-title">{r.title}</span>
                        </li>
                      ))}
                      {citationSelected.citedBy.length > 20 && (
                        <li className="conn-more">...and {citationSelected.citedBy.length - 20} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-detail">
                <p>Click a node to see paper details and citation connections</p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="footer">
        Falk L. Wiegmann &amp; Nancy L. Ford — University of British Columbia — 2026
      </footer>

      {showWelcome && (
        <div className="welcome-overlay" onClick={() => setShowWelcome(false)}>
          <div className="welcome-modal" onClick={(e) => e.stopPropagation()}>
            <h2>CT Reconstruction Literature Map</h2>
            <p>
              ~5,000 papers on AI-driven CT reconstruction. Scroll to zoom, drag to pan, click any paper for details.
            </p>
            <p>
              Use the tabs to switch between the semantic map, citation network, publication trends, or to place your own paper on the map.
            </p>
            <button className="welcome-close" onClick={() => setShowWelcome(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
