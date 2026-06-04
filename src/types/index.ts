// ── Semantic Map Types ────────────────────────────────────

/**
 * Research track used by the "show AI base" toggle.
 *   ct   - CT / tomography reconstruction (no significant AI method)
 *   both - CT / tomography that also uses an AI/ML method (overlap)
 *   med  - non-CT medical reconstruction imaging (MRI / PET / US / EIT ...)
 *   ai   - AI/ML/CV foundations, general super-resolution, generic methods
 * The toggle hides only "ai"; the other three are CT-relevant.
 */
export type Track = "ct" | "both" | "med" | "ai";

export interface SemanticPaper {
  track?: Track;
  id: string;
  title: string;
  year: number;
  citedByCount: number | null;
  isSeed: boolean;
  isMyPaper?: boolean;
  originalCommunity: number;
  x: number;
  y: number;
  cluster: number;
  parentCluster: number;
  hasAbstract: boolean;
  inGraphCitations: number;
  authors?: string;
}

export interface SemanticCluster {
  id: number;
  label: string;
  paperCount: number;
  centroid: [number, number];
  parentCluster: number;
  parentLabel: string;
}

export interface ParentCluster {
  id: number;
  label: string;
  paperCount: number;
  childClusterCount: number;
  centroid: [number, number];
}

export interface SemanticMap {
  generatedAt: string;
  totalPapers: number;
  totalClusters: number;
  noiseCount: number;
  papers: SemanticPaper[];
  clusters: SemanticCluster[];
  parentClusters: ParentCluster[];
  myPaperIds?: string[];
  myPaperLabels?: Record<string, string>;
}

export type SizeMode = "global" | "inGraph";

export type ViewTab = "semantic" | "citation" | "inject" | "trends";

// ── Citation Graph Types ─────────────────────────────────

export interface GraphNode {
  id: string;
  track?: Track;
  title: string;
  year: number;
  category: string;
  architecture: string;
  domain: string;
  isSeed: boolean;
  citedByCount: number | null;
  tags: string[];
  community?: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface CitationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNodes: number;
  totalEdges: number;
  seedCount: number;
  communityLabels?: Record<string, string>;
  layoutPrecomputed?: boolean;
}

// ── Injected Paper ───────────────────────────────────────

export interface InjectedPaper {
  title: string;
  abstract: string;
  x: number;
  y: number;
  nearestCluster: SemanticCluster;
  nearestPapers: SemanticPaper[];
}
