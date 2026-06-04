#!/usr/bin/env python3
"""
Inject the `track` field (from track-map.json) into every paper in
semantic-map.json and every node in focused-graph.json, keyed by shared id.

Papers/nodes absent from track-map (e.g. the 2 graph-only ids) default to "ct"
so they stay visible. Re-runnable; overwrites the two big JSONs in place.
"""
import json
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "public", "data")
SEM = os.path.join(DATA, "semantic-map.json")
GRAPH = os.path.join(DATA, "focused-graph.json")
TMAP = os.path.join(DATA, "track-map.json")

track_map = json.load(open(TMAP))


def bake(path, key_collection):
    data = json.load(open(path))
    coll = data[key_collection]
    dist = Counter()
    missing = 0
    for item in coll:
        t = track_map.get(item["id"])
        if t is None:
            t = "ct"
            missing += 1
        item["track"] = t
        dist[t] += 1
    json.dump(data, open(path, "w"))
    print(f"{os.path.basename(path)}: {len(coll)} {key_collection}, "
          f"{missing} defaulted -> ct, dist={dict(dist)}")


bake(SEM, "papers")
bake(GRAPH, "nodes")
print("Done.")
