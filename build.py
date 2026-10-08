"""Build the public, static PREVENTION demonstration from the existing review API.

Usage: python -B build.py --review-url URL [--document PATH]
Only the six approved representative frames and PREVENTION media are exported.
The research calculation, admission masks and timestamps are not changed.
The authored showcase HTML/CSS/JavaScript is preserved during data refresh.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRAMES = (2031, 2052, 2088, 2107, 2123, 2144)
IMAGES = ("pipeline.png", "feature_extraction.png", "main_ontology_graph.png",
          "r4_temporal_path.png", "core_equations.png")


def pick(obj, keys):
    return {key: obj[key] for key in keys if key in obj}


def public_frame(frame):
    assert frame["camera_ref"] == "R1D1:front_camera"
    assert frame["image_size_xy"] == [1920, 600]
    assert frame["source_frame"] in FRAMES
    assert frame["known_at_timestamp_us"] <= frame["timestamp_us"]
    assert not frame["ego_is_physical_projection"]
    assert frame["physical_same_lane"] is None and frame["direct_leader"] is None
    graph = frame["temporal_graph_build"]
    assert not graph["future_frames_used"]
    assert not graph["physical_edges_verified"]
    ids = {node["id"] for node in graph["nodes"]}
    for item in graph["nodes"] + graph["edges"]:
        assert item["source_frame"] <= frame["source_frame"]
        assert item["known_at_frame"] <= frame["source_frame"]
        assert item["timestamp_us"] <= frame["timestamp_us"]
        assert item["known_at_timestamp_us"] <= frame["timestamp_us"]
        assert item["camera_ref"] == frame["camera_ref"]
        assert not item["physical_verified"]
    for edge in graph["edges"]:
        assert edge["subject"] in ids and edge["object"] in ids
        for ref in edge.get("evidence_refs", []):
            for number in re.findall(r"(?:^|:)f(\d+)(?=:|$)", ref):
                assert int(number) <= frame["source_frame"], "future evidence reference"
    assert not frame["interaction_view"]["excluded_observation_ids"]
    objects = []
    for obj in frame["objects"]:
        item = pick(obj, ("id", "box", "anchor", "score", "anchor_overlap_ids", "identity_verified"))
        item["lane_allowed"] = obj["task_feature_usage"]["lane_image_membership_candidate_allowed"]
        item["road"] = pick(obj["road_actor_context"], ("state", "contact_structure_fraction", "contact_probe_statistics"))
        # Only one measured ratio is required in the public UI, not raw component logs.
        item["road"]["road_fraction"] = item["road"].pop("contact_probe_statistics").get("road_fraction")
        assert isinstance(item["road"]["road_fraction"], (int, float))
        assert 0 <= item["road"]["road_fraction"] <= 1
        item["depth"] = pick(obj["depth"], ("value", "units", "input_mask", "quality_status", "metric_accuracy_verified"))
        assert not item["depth"]["metric_accuracy_verified"]
        objects.append(item)
    for obj in objects:
        if obj["lane_allowed"]:
            assignment = next(a for a in frame["partition"]["assignments"] if a["observation_id"] == obj["id"])
            corridor = assignment["scene_corridor_candidate_id"]
            assert any(e["subject"] == obj["id"] and e["object"] == corridor and e["input_eligible"]
                       for e in graph["edges"])
            support = {e["predicate"] for e in graph["edges"] if e["subject"] == corridor and e["input_eligible"]}
            assert {"left_image_boundary_candidate", "right_image_boundary_candidate", "corridor_has_visible_road_support"} <= support
    return {
        **pick(frame, ("source_frame", "timestamp_us", "known_at_timestamp_us", "capture_elapsed_s",
                      "video_time_s", "image_size_xy", "camera_ref", "ego")),
        "objects": objects,
        "boundaries": [pick(b, ("id", "components")) for b in frame["boundaries"]],
        "corridors": [pick(c, ("candidate_id", "polygon_xy", "status")) for c in frame["partition"]["corridors"]],
        "assignments": [pick(a, ("observation_id", "scene_corridor_candidate_id", "held_reasons"))
                        for a in frame["partition"]["assignments"]],
        "nodes": [pick(n, ("id", "type", "source_frame", "timestamp_us", "known_at_timestamp_us",
                           "current_observation_id", "observation_id", "bbox_xyxy", "input_eligible",
                           "lane_membership_decision")) for n in graph["nodes"]],
        "edges": [pick(e, ("id", "subject", "predicate", "object", "source_frame", "timestamp_us",
                           "known_at_timestamp_us", "input_eligible", "relation_layer", "status", "evidence_refs"))
                  for e in graph["edges"]],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-url", required=True)
    parser.add_argument("--document", type=Path, help="Optional approved Notion document used only to refresh illustration assets")
    args = parser.parse_args()
    parsed = urllib.parse.urlparse(args.review_url)
    assert parsed.scheme in ("http", "https") and parsed.hostname
    def get(path):
        with urllib.request.urlopen(args.review_url.rstrip("/") + path, timeout=60) as response:
            return response.read()
    asset_dir = ROOT / "assets"
    (asset_dir / "frames").mkdir(parents=True, exist_ok=True)
    if args.document:
        for name in IMAGES:
            shutil.copyfile(args.document.parent / "assets" / name, asset_dir / name)
    frames = []
    for number in FRAMES:
        raw = json.loads(get(f"/api/frame/{number}"))
        frames.append(public_frame(raw))
        (asset_dir / "frames" / f"{number}.jpg").write_bytes(get(f"/api/image/{number}.jpg"))
        (asset_dir / "frames" / f"{number}-road.png").write_bytes(get(f"/api/road/{number}.png"))
    (asset_dir / "prevention-review.mp4").write_bytes(get("/media/review.mp4"))
    payload = {"dataset": "PREVENTION", "camera": "front_camera", "frames": frames,
               "physical_accuracy_verified": False, "automatic_exclusions": 0}
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    for forbidden in ("166.104.", "/home/", "C:\\\\", "N:\\\\", "Bearer ", "hf_"):
        assert forbidden not in data
    (ROOT / "scene-data.json").write_text(data, encoding="utf-8")
    # The research showcase is authored in index.html. Data refresh must not
    # overwrite the visual layout or replace the reviewed research wording.
    html = (ROOT / "index.html").read_text(encoding="utf-8-sig")
    assert all(f'id="{key}"' in html for key in ("viewer", "sceneImage", "graph", "reviewVideo"))
    assert "127.0.0.1" not in html and "/api/" not in html
    (ROOT / ".nojekyll").touch()
    print(json.dumps({"public_frames": len(frames), "observations": sum(len(f["objects"]) for f in frames),
                      "graph_nodes": sum(len(f["nodes"]) for f in frames), "graph_edges": sum(len(f["edges"]) for f in frames),
                      "casCADE_media": 0, "backend_required": False, "algorithm_changed": False}))


if __name__ == "__main__":
    main()
