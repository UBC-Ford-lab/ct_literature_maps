import { useState, useCallback } from "react";
import { SemanticMap, SemanticPaper, InjectedPaper } from "../types";

interface Props {
  semanticMap: SemanticMap;
  onInject: (paper: InjectedPaper) => void;
  onClear: () => void;
  injectedPaper: InjectedPaper | null;
  isLoading: boolean;
}

export default function InjectPaper({
  semanticMap,
  onInject,
  onClear,
  injectedPaper,
  isLoading,
}: Props) {
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");

  const handleSubmit = useCallback(() => {
    if (!title.trim()) return;
    embedAndProject(title.trim(), abstract.trim(), semanticMap, onInject);
  }, [title, abstract, semanticMap, onInject]);

  return (
    <div className="inject-panel">
      <h3>Place Your Paper on the Map</h3>
      <p className="inject-desc">
        Enter your paper's title and abstract. The app will embed it using the
        same model and show where it falls in the field.
      </p>

      <div className="inject-form">
        <label>
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Your paper title..."
          />
        </label>
        <label>
          Abstract
          <textarea
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            placeholder="Paste your abstract here (optional but improves accuracy)..."
            rows={6}
          />
        </label>
        <div className="inject-buttons">
          <button
            className="inject-btn primary"
            onClick={handleSubmit}
            disabled={!title.trim() || isLoading}
          >
            {isLoading ? "Embedding..." : "Place on Map"}
          </button>
          {injectedPaper && (
            <button className="inject-btn secondary" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="inject-status">
          Loading embedding model (first time may take ~30s)...
        </div>
      )}

      {injectedPaper && !isLoading && (
        <div className="inject-result">
          <h4>Result</h4>
          <div className="result-meta">
            <div className="result-item">
              <span className="result-label">Nearest Topic</span>
              <span className="result-value">
                {injectedPaper.nearestCluster.parentLabel}
              </span>
            </div>
            <div className="result-item">
              <span className="result-label">Sub-cluster</span>
              <span className="result-value">
                {injectedPaper.nearestCluster.label}
              </span>
            </div>
            <div className="result-item">
              <span className="result-label">Position</span>
              <span className="result-value">
                ({injectedPaper.x.toFixed(1)}, {injectedPaper.y.toFixed(1)})
              </span>
            </div>
          </div>
          <h4>Nearest Papers</h4>
          <ul className="nearest-list">
            {injectedPaper.nearestPapers.map((p, i) => (
              <li key={i}>
                <span className="nearest-year">[{p.year}]</span>
                <span className="nearest-title">{p.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Embedding & Projection Logic ─────────────────────────

let embeddingModelPromise: Promise<any> | null = null;
let embeddingsCache: Float32Array | null = null;
let embeddingIdsCache: string[] | null = null;

async function loadEmbeddingModel() {
  if (!embeddingModelPromise) {
    embeddingModelPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    })();
  }
  return embeddingModelPromise;
}

async function loadPrecomputedEmbeddings(): Promise<{
  embeddings: Float32Array;
  ids: string[];
}> {
  if (embeddingsCache && embeddingIdsCache) {
    return { embeddings: embeddingsCache, ids: embeddingIdsCache };
  }

  const [embBuf, idsJson] = await Promise.all([
    fetch("./data/embeddings.bin").then((r) => r.arrayBuffer()),
    fetch("./data/embedding-ids.json").then((r) => r.json()),
  ]);

  embeddingsCache = new Float32Array(embBuf);
  embeddingIdsCache = idsJson;
  return { embeddings: embeddingsCache, ids: embeddingIdsCache };
}

function cosineSimilarity(a: Float32Array, b: Float32Array, offset: number, dim: number): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < dim; i++) {
    const ai = a[i];
    const bi = b[offset + i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

async function embedAndProject(
  title: string,
  abstract: string,
  semanticMap: SemanticMap,
  onResult: (paper: InjectedPaper) => void
) {
  // 1. Embed the paper
  const extractor = await loadEmbeddingModel();
  const text = abstract ? `${title}. ${abstract}` : title;
  const output = await extractor(text, { pooling: "mean", normalize: true });
  const embedding = new Float32Array(output.data);
  const dim = embedding.length;

  // 2. Load pre-computed embeddings
  const { embeddings: precomputed, ids } = await loadPrecomputedEmbeddings();
  const numPapers = ids.length;

  // 3. Find top 10 nearest neighbors by cosine similarity
  const similarities: { idx: number; sim: number }[] = [];
  for (let i = 0; i < numPapers; i++) {
    const sim = cosineSimilarity(embedding, precomputed, i * dim, dim);
    similarities.push({ idx: i, sim });
  }
  similarities.sort((a, b) => b.sim - a.sim);
  const topK = similarities.slice(0, 10);

  // 4. Project: weighted average of nearest neighbors' x,y positions
  const paperMap = new Map(semanticMap.papers.map((p) => [p.id, p]));
  let xSum = 0, ySum = 0, wSum = 0;
  const nearestPapers: SemanticPaper[] = [];

  for (const { idx, sim } of topK) {
    const paperId = ids[idx];
    const paper = paperMap.get(paperId);
    if (paper) {
      const w = sim * sim; // weight by squared similarity
      xSum += paper.x * w;
      ySum += paper.y * w;
      wSum += w;
      if (nearestPapers.length < 5) nearestPapers.push(paper);
    }
  }

  const x = wSum > 0 ? xSum / wSum : 0;
  const y = wSum > 0 ? ySum / wSum : 0;

  // 5. Find nearest cluster
  let bestDist = Infinity;
  let bestCluster = semanticMap.clusters[0];
  for (const cl of semanticMap.clusters) {
    const d = (x - cl.centroid[0]) ** 2 + (y - cl.centroid[1]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestCluster = cl;
    }
  }

  onResult({
    title,
    abstract,
    x,
    y,
    nearestCluster: bestCluster,
    nearestPapers,
  });
}
