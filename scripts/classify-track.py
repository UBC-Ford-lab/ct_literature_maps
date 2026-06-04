#!/usr/bin/env python3
"""
Hybrid CT / AI-base / medical-imaging classifier.

Assigns every paper a `track`:
  ct   - CT / tomography reconstruction work, no significant AI method        (KEPT)
  both - CT / tomography that also uses an AI/ML method (the overlap)          (KEPT)
  med  - non-CT medical reconstruction imaging: MRI / PET / US / photoacoustic (KEPT)
  ai   - AI/ML/CV foundations, general super-resolution, generic non-imaging
         methods (SSIM / pure CS-TV-optimization without imaging context)      (HIDDEN)

The frontend "show AI base" toggle hides only `ai`. The ct/both/med split is
audit-only — it does NOT change what is hidden, so classification accuracy only
matters at the ai boundary.

Method (hybrid, per user):
  1. Cluster prior   - each of the 72 child clusters has a default track.
  2. Keyword override - title evidence can override the cluster prior.
  3. Embedding tiebreaker - for no-signal papers that fall in an ambiguous
     cluster, use cosine similarity to the CT-seed centroid (only the 4,783
     papers with embeddings; others keep the cluster prior).

Outputs (does NOT modify the big JSONs):
  public/data/track-map.json   {id: track}
  public/data/track-review.csv  full audit table
Run from anywhere; paths are resolved relative to this file.
"""
import json
import csv
import re
import struct
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "public", "data")
SEM = os.path.join(DATA, "semantic-map.json")
EMB = os.path.join(DATA, "embeddings.bin")
EMB_IDS = os.path.join(DATA, "embedding-ids.json")

# ── 1. Cluster prior ──────────────────────────────────────────────────────────
# Default track per child cluster id, derived from cluster labels (domain guess).
# 'split' means "no strong cluster prior — rely on keywords/embedding per paper".
CLUSTER_DEFAULT = {
    # Parent 1 — Deep Learning & Generative Models (AI foundations)
    40: "ai",    # Segmentation & Unet & Biomedical (segmentation, not reconstruction)
    11: "both",  # Generative & Adversarial & Lowdose (low-dose CT GANs)
    39: "ai",    # Radiologists & Classification & Covid19 (classification)
    36: "ai",    # Concepts & Architectures & Challenges
    53: "split", # Diffusion & Denoising & Probabilistic
    31: "ai",    # Adversarial & Diffusion & Unpaired (GRAF lives here)
    32: "ai",    # Radiance & Nerf & Pixelnerf (foundational NeRF)
    52: "split", # Denoising & Noise & Denoiser
    12: "both",  # Adversarial & Medical & Generative (medical)
    17: "ai",    # Transformer & Denoising & Uformer
    14: "split", # Adversarial & Generative & Compressed
    # Parent 2 — Image Super-Resolution (mostly general CV)
    26: "ai",    # Superresolution & Sparse & Representation (general)
    49: "ai",    # Superresolution & Generative & Adversarial
    44: "ai",    # Superresolution & Attention & Single
    42: "med",   # Superresolution & Application & Chest (medical)
    34: "ai",    # Superresolution & Transformer & Remote (remote sensing)
    38: "med",   # Superresolution & Simultaneous & Brain (medical)
    10: "ai",    # Hyperspectral & Superresolution & Sparse
    48: "ai",    # Superresolution & Generative & Adversarial
    43: "ai",    # Transformer & Superresolution & Swin
    46: "ct",    # Generative & Adversarial & Porous (digital rock / micro-CT)
    41: "ai",    # Superresolution & Remote & Sensing
    35: "med",   # Superresolution & Medical & Musculoskeletal
    37: "ai",    # Superresolution & Diffusion & Probabilistic
    9:  "ai",    # Hyperspectral & Denoising & Spatialspectral
    47: "ct",    # Rock & Digital & Microct (micro-CT)
    # Parent 4 — Clinical CT Denoising & DL Reconstruction (CT)
    28: "both",  # Denoising & Lowdose & Noise
    50: "ct",    # Characteristics & Practice & Competitive
    4:  "med",   # Deeppet & Encoderdecoder & Directly (PET reconstruction)
    30: "ct",    # Abdominal & Comparison & Iterative
    33: "ct",    # Chest & Noise & Lung
    18: "ct",    # Coronary & Angiography & Learningbased (CT angiography)
    51: "ct",    # Reduction & Algorithm & Phantom
    19: "ct",    # Iterative & Angiography & Algorithm
    15: "both",  # Denoising & Lowdose & Diffusion
    29: "ct",    # Liver & Metastases & Raunet
    22: "ct",    # Bone & Application & Prediction
    16: "ct",    # Superresolution & Coronary & Angiography
    45: "ct",    # Iterative & Abdominal & Algorithms
    # Parent 5 — Optimization & Compressed Sensing (MRI / generic / CT mix)
    7:  "med",   # Undersampled & Dynamic & Cascade (dynamic MRI)
    8:  "split", # Compressed & Sensing & Gradient (generic CS)
    21: "split", # Total & Variation & Algorithms (generic)
    5:  "med",   # Diffusion & Scorebased & Accelerated (accelerated MRI)
    6:  "med",   # Compressed & Sensing & Parallel (parallel MRI)
    20: "ai",    # Proximal & Signal & Splitting (generic optimization)
    # Parent 6 — Metal Artifacts & Specialized Tomography (CT)
    1:  "ct",    # Metal & Artifact & Reduction
    2:  "med",   # Photoacoustic & Accelerated & Highresolution
    3:  "ct",    # Radon & Transform & Fast
    # Parent 7 — CT Reconstruction Foundations (CT)
    60: "ct",    # Algorithm & Algebraic & Practical
    56: "ct",    # Directional & Wavelets & Lowdose
    55: "med",   # Electrical & Impedance & Shape (EIT)
    58: "ct",    # Tomographic & Limited & Prior
    54: "med",   # Inverse & Problems & Ultrasound (ultrasound)
    61: "ct",    # Fewview & Ment & Maximum
    57: "ct",    # Limited & Tomographic & Artificial
    59: "ct",    # Cbct & Sparseview & Nerp
    13: "ct",    # Survey & Phase & Recovery
    23: "ct",    # Potential & Machine & Domaintransform
    # Parent 8 — Iterative & Sparse-View CT Reconstruction (CT)
    25: "ct", 68: "ct", 62: "ct", 64: "ct", 67: "ct", 66: "ct",
    24: "ct", 70: "ct", 63: "ct", 71: "ct", 65: "ct", 69: "ct", 27: "ct",
    # Parent 9 — Image Quality Assessment (generic tooling)
    0:  "ai",    # Assessment & Similarity & Structural (SSIM, generic)
}

# ── 2. Keyword vocabularies ───────────────────────────────────────────────────
# NOTE: stems use \w* (not a trailing \b) so "tomograph" matches tomography /
# tomographic / tomogram, "radiograph" matches radiographic, etc.
CT = re.compile(r"\b(ct\b|cbct|tomograph\w*|tomogram\w*|sinogram\w*|projection data|"
                r"sparse[- ]?view|few[- ]?view|limited[- ]?angle|cone[- ]?beam|"
                r"micro[- ]?ct|fan[- ]?beam|radon|fbp|filtered back|low[- ]?dose|"
                r"dual[- ]?energy|spectral ct|radiograph\w*|dose reduction|metal artifact|"
                r"computed tomograph\w*|digital rock|porous media|conebeam|ptychograph\w*)\b",
                re.I)
# non-CT medical / non-CT reconstruction imaging modalities (kept as `med`)
MED = re.compile(r"\b(mri|mr imaging|magnetic resonance|pet\b|positron emission|"
                 r"ultrasound|sonograph\w*|photoacoustic|optoacoustic|spect\b|"
                 r"electrical impedance|electrical resistance|\beit\b|accelerated mri|"
                 r"parallel imaging|fluorescence molecular|diffuse optical|"
                 r"luminescence tomograph\w*)\b", re.I)
# AI / ML foundations (bare evidence — only decides in ambiguous clusters)
AI_FND = re.compile(r"\b(nerf|neural radiance|gan\b|generative adversarial|transformer\w*|"
                    r"diffusion model|score[- ]?based|imagenet|resnet|self[- ]?supervised|"
                    r"contrastive|attention mechanism|representation learning|"
                    r"foundation model|vision transformer)\b", re.I)
# general (non-medical) computer vision / super-resolution domains -> hide
GEN_CV = re.compile(r"\b(remote sensing|hyperspectral|satellite|natural image|"
                    r"object detection|scene |video super|stereo|\bface\b|"
                    r"point cloud|pedestrian|autonomous driving|text recognition)\b", re.I)
# any AI-method evidence (used only to upgrade ct -> both, audit-only)
AI_METHOD = re.compile(r"\b(deep learning|neural network|convolutional|cnn\b|gan\b|"
                       r"diffusion|transformer|unet|u-net|learned|learning[- ]based|"
                       r"self[- ]?supervised|generative|neural radiance|nerf)\b", re.I)


def evidence_str(title):
    t = title or ""
    ev = []
    if CT.search(t): ev.append("CT")
    if MED.search(t): ev.append("MED")
    if GEN_CV.search(t): ev.append("GENCV")
    if AI_FND.search(t): ev.append("AIFND")
    return "+".join(ev) if ev else "-"


def load_embeddings():
    if not (os.path.exists(EMB) and os.path.exists(EMB_IDS)):
        return {}
    ids = json.load(open(EMB_IDS))
    raw = open(EMB, "rb").read()
    dim = (len(raw) // 4) // len(ids)
    vecs = {}
    for i, pid in enumerate(ids):
        off = i * dim * 4
        v = struct.unpack_from(f"<{dim}f", raw, off)
        vecs[pid] = v
    return vecs


def cos(a, b):
    import math
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def main():
    sm = json.load(open(SEM))
    papers = sm["papers"]
    clusters = {c["id"]: c for c in sm["clusters"]}
    parents = {p["id"]: p["label"] for p in sm["parentClusters"]}

    vecs = load_embeddings()

    # CT centroid from definite-CT seeds (seed papers in CT parents 4/6/7/8)
    ct_parents = {4, 6, 7, 8}
    ct_seed_vecs = [vecs[p["id"]] for p in papers
                    if p.get("isSeed") and p["parentCluster"] in ct_parents and p["id"] in vecs]
    ct_centroid = None
    if ct_seed_vecs:
        dim = len(ct_seed_vecs[0])
        ct_centroid = [sum(v[i] for v in ct_seed_vecs) / len(ct_seed_vecs) for i in range(dim)]

    rows = []
    track_map = {}
    for p in papers:
        cid = p["cluster"]
        title = p["title"] or ""
        prior = CLUSTER_DEFAULT.get(cid, "split")
        ev = evidence_str(title)
        aimeth = bool(AI_METHOD.search(title))

        # Precedence (domain keywords win over bare AI-method evidence):
        #   1. CT domain term            -> ct (both if it also uses AI)
        #   2. explicit general-CV term  -> ai (remote sensing, stereo, faces...)
        #   3. non-CT medical modality   -> med
        #   4. else cluster prior (ct/both/med/ai)
        #   5. ambiguous cluster -> embedding tiebreaker, else AI-foundation/fallback
        if CT.search(title):
            track = "both" if aimeth else "ct"
            source = "kw:CT"
        elif GEN_CV.search(title):
            track = "ai"
            source = "kw:GENCV"
        elif MED.search(title):
            track = "med"
            source = "kw:MED"
        elif prior in ("ct", "both", "med"):
            track = "both" if (prior in ("ct", "both") and aimeth) else prior
            source = "cluster"
        elif prior == "ai":
            track = "ai"
            source = "cluster"
        else:  # split cluster, no domain keyword
            if ct_centroid and p["id"] in vecs:
                sim = cos(vecs[p["id"]], ct_centroid)
                track = "both" if (sim >= 0.35 and aimeth) else ("ct" if sim >= 0.35 else "ai")
                source = f"embed({sim:.2f})"
            elif AI_FND.search(title):
                track = "ai"
                source = "kw:AIFND"
            else:
                track = "ai"  # no signal at all in an ambiguous cluster -> hide
                source = "fallback-ai"

        track_map[p["id"]] = track
        rows.append({
            "id": p["id"],
            "title": (p["title"] or "")[:90],
            "parent": p["parentCluster"],
            "parentLabel": parents.get(p["parentCluster"], "?"),
            "cluster": cid,
            "clusterLabel": clusters.get(cid, {}).get("label", "?"),
            "clusterDefault": prior,
            "kwEvidence": ev,
            "source": source,
            "track": track,
            "hidden": "HIDE" if track == "ai" else "",
        })

    # ── outputs ──
    with open(os.path.join(DATA, "track-map.json"), "w") as f:
        json.dump(track_map, f)
    with open(os.path.join(DATA, "track-review.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # ── report ──
    dist = Counter(r["track"] for r in rows)
    print(f"Classified {len(rows)} papers")
    print("Track distribution:")
    for t in ("ct", "both", "med", "ai"):
        kept = "HIDDEN" if t == "ai" else "kept"
        print(f"  {t:>4}: {dist.get(t,0):>5}   ({kept})")
    hide = dist.get("ai", 0)
    print(f"  --> hidden when toggle off: {hide} / {len(rows)} ({100*hide/len(rows):.1f}%)")
    print(f"      visible (CT-relevant):  {len(rows)-hide}")
    print()
    src = Counter(r["source"].split("(")[0] for r in rows)
    print("Decision source:")
    for s, n in src.most_common():
        print(f"  {s:>14}: {n}")
    print()
    print("Per-parent kept/hidden:")
    pp = {}
    for r in rows:
        d = pp.setdefault(r["parent"], [0, 0])
        if r["track"] == "ai": d[1] += 1
        else: d[0] += 1
    for pid in sorted(pp):
        k, h = pp[pid]
        print(f"  parent {pid} {parents.get(pid,'?')[:34]:>34}: keep {k:>4}, hide {h:>4}")
    print()
    print("Wrote track-map.json and track-review.csv")


if __name__ == "__main__":
    main()
