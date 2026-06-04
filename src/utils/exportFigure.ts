// Publication-figure export helpers.
//   - Plotly views (semantic map, trends) -> true vector SVG (scattergl traces
//     are converted to SVG scatter during export so points, axes, text and
//     legend are all vector).
//   - Citation network -> compact vector SVG built directly from the layout in
//     CitationNetwork.tsx (edges merged into per-cluster <path>s); this module
//     only provides the download/escape helpers it uses.
import Plotly from "plotly.js-dist-min";

/** Trigger a browser download of an in-memory text payload (e.g. an SVG string). */
export function downloadText(content: string, filename: string, mime = "image/svg+xml") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Escape text for inclusion in SVG markup. */
export function svgEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface PlotlyExportMutations {
  /** Layout attrs applied for the export (e.g. show a legend, widen a margin). */
  layoutApply?: Record<string, unknown>;
  /** Explicit values to restore those layout attrs to afterward. */
  layoutRevert?: Record<string, unknown>;
  /** Trace indices the trace mutations below apply to (e.g. the heatmap). */
  traceIndices?: number[];
  /** Trace attrs applied for the export (e.g. enable a colorbar). */
  traceApply?: Record<string, unknown>;
  /** Explicit values to restore those trace attrs to afterward. */
  traceRevert?: Record<string, unknown>;
}

export interface PlotlyExportRender {
  /**
   * Raster DPI multiplier for the SVG's embedded bitmaps (the year heatmap).
   * Vector parts are resolution-independent; this only affects rasterized
   * layers. Default 1.
   */
  scale?: number;
  /**
   * When true (default), WebGL (`scattergl`) traces are converted to SVG
   * `scatter` so every point is true vector. When false, points stay WebGL and
   * embed as a single bitmap (smaller, but raster).
   */
  vectorizeWebGL?: boolean;
  /**
   * Truncate numeric coordinates to this many decimals (Plotly emits ~6). 1 dp
   * is sub-pixel at export size. Small win on its own; combine with the options
   * below.
   */
  trimDecimals?: number;
  /**
   * Rewrite Plotly's verbose scatter-marker <path>s (each ~218 bytes drawing a
   * circle) as compact <circle> elements (~50 bytes). Lossless.
   */
  optimizeMarkers?: boolean;
  /**
   * Drop the contour *line* overlay (`closedline` paths). On the year heatmap
   * these are drawn at ~0.04 opacity — all but invisible, but ~2.7 MB of vector
   * paths. The colored fill (a bitmap) is unaffected. Near-lossless.
   */
  dropContourLines?: boolean;
}

const SVG_DATA_B64 = "data:image/svg+xml;base64,";
const SVG_DATA_PLAIN = "data:image/svg+xml,";

function svgFromDataUrl(dataUrl: string): string {
  if (dataUrl.startsWith(SVG_DATA_B64)) return atob(dataUrl.slice(SVG_DATA_B64.length));
  if (dataUrl.startsWith(SVG_DATA_PLAIN)) return decodeURIComponent(dataUrl.slice(SVG_DATA_PLAIN.length));
  const i = dataUrl.indexOf(",");
  return decodeURIComponent(dataUrl.slice(i + 1));
}

/** Shrink a Plotly SVG losslessly (or near-losslessly for dropLines). */
function optimizePlotlySvg(
  svg: string,
  opts: { decimals?: number; markers?: boolean; dropLines?: boolean },
): string {
  // Marker <path>s (a circle) -> <circle>. Must run while classes still present.
  if (opts.markers) {
    svg = svg.replace(
      /<path class="point[^"]*" transform="translate\(([-\d.]+),([-\d.]+)\)" d="M([\d.]+),0A[^"]*?Z" style="([^"]*)"\s*\/>/g,
      (_m, x, y, r, style) => {
        const fill = /fill:\s*([^;]+);/.exec(style);
        const op = /(?:^|[\s;])opacity:\s*([^;]+);/.exec(style);
        const stroke = /(?:^|[\s;])stroke:\s*([^;]+);/.exec(style);
        const sw = /stroke-width:\s*([\d.]+)px;/.exec(style);
        let a = `cx="${x}" cy="${y}" r="${r}"`;
        if (fill) a += ` fill="${fill[1].trim()}"`;
        if (op && op[1].trim() !== "1") a += ` opacity="${op[1].trim()}"`;
        if (stroke && sw && parseFloat(sw[1]) > 0) {
          a += ` stroke="${stroke[1].trim()}" stroke-width="${sw[1]}"`;
        }
        return `<circle ${a}/>`;
      },
    );
  }
  if (opts.dropLines) {
    svg = svg.replace(/<path class="closedline[^"]*"[^>]*\/>/g, "");
  }
  // Strip remaining Plotly class attributes (unused in a static figure).
  svg = svg.replace(/\sclass="[^"]*"/g, "");
  if (opts.decimals != null) {
    svg = svg.replace(new RegExp(`(-?\\d+\\.\\d{${opts.decimals}})\\d+`, "g"), "$1");
  }
  return svg;
}

/**
 * Download a Plotly graph div as an SVG. By default WebGL (`scattergl`) traces
 * are converted to SVG `scatter` so the output is fully vector; set
 * `render.vectorizeWebGL = false` to keep them as a high-DPI embedded raster
 * instead (much smaller for big scatters). Optional `mut` adds export-only
 * layout/trace styling (legend, colorbar, margins), reverted afterward.
 */
export async function exportPlotlySVG(
  gd: any,
  filename: string,
  width = 1200,
  height = 800,
  mut: PlotlyExportMutations = {},
  render: PlotlyExportRender = {},
): Promise<void> {
  if (!gd || !gd.data) return;

  const { scale = 1, vectorizeWebGL = true } = render;
  const glIndices: number[] = vectorizeWebGL
    ? gd.data.map((t: any, i: number) => (t.type === "scattergl" ? i : -1)).filter((i: number) => i >= 0)
    : [];

  try {
    if (glIndices.length) {
      await Plotly.restyle(gd, { type: "scatter" }, glIndices);
    }
    if (mut.traceApply && mut.traceIndices) {
      await Plotly.restyle(gd, mut.traceApply, mut.traceIndices);
    }
    if (mut.layoutApply) {
      await Plotly.relayout(gd, mut.layoutApply);
    }
    const needsPost = render.trimDecimals != null || render.optimizeMarkers || render.dropContourLines;
    if (needsPost) {
      // Capture the SVG, optimize it, then download the (smaller) string.
      const dataUrl: string = await Plotly.toImage(gd, { format: "svg", width, height, scale });
      const svg = optimizePlotlySvg(svgFromDataUrl(dataUrl), {
        decimals: render.trimDecimals,
        markers: render.optimizeMarkers,
        dropLines: render.dropContourLines,
      });
      downloadText(svg, filename.endsWith(".svg") ? filename : `${filename}.svg`);
    } else {
      await Plotly.downloadImage(gd, { format: "svg", width, height, scale, filename });
    }
  } finally {
    // Always restore interactive state, even if the export throws.
    if (mut.layoutRevert) {
      await Plotly.relayout(gd, mut.layoutRevert);
    }
    if (mut.traceRevert && mut.traceIndices) {
      await Plotly.restyle(gd, mut.traceRevert, mut.traceIndices);
    }
    if (glIndices.length) {
      await Plotly.restyle(gd, { type: "scattergl" }, glIndices);
    }
  }
}
