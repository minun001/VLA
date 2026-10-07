"""Build the public, static PREVENTION demonstration from the existing review API.

Usage: python -B build.py --review-url URL --document PATH
Only the six approved representative frames and PREVENTION media are exported.
The research calculation, admission masks and timestamps are not changed.
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


VIEWER = """
<section id="viewer" aria-labelledby="viewerTitle">
<h2 id="viewerTitle">실제 영상에서 단계별 결과를 확인한다</h2>
<p><strong>장면을 고르고 차량을 선택하면, 도로 근거부터 시간 연결까지 같은 관측으로 확인할 수 있다.</strong></p>
<p class="small">PREVENTION의 대표 장면 6개를 공개한 정적 데모다. 실시간 추론이나 전체 데이터 공개가 아니다.</p>
<div id="sceneButtons" class="scene-buttons" aria-label="대표 장면 선택"></div>
<div class="demo-toolbar"><label>차량 <select id="vehicleSelect" aria-label="선택 차량"></select></label>
<label><input type="checkbox" id="rawOnly"> 원본 영상만 보기</label><span id="sceneTime" class="small"></span></div>
<div class="demo-steps" aria-label="구축 단계">
<button data-stage="road" aria-pressed="false">1. 도로 구조</button>
<button data-stage="lane" aria-pressed="true">2. 차선·차로</button>
<button data-stage="vehicle" aria-pressed="false">3. 차량 소속</button>
<button data-stage="temporal" aria-pressed="false">4. 시간 연결</button>
</div>
<div class="scene-canvas"><img id="sceneImage" alt="선택 장면의 PREVENTION 원영상">
<img id="roadMask" alt="같은 시점에서 계산한 도로와 시설 마스크"><svg id="sceneOverlay" viewBox="0 0 1920 600" role="img" aria-label="선택 장면의 차선·차로·차량"></svg></div>
<p class="legend">초록: 영상 차로 후보 · 노랑: 검출 차선 · 청록: 선택 차량 · 주황: 소속 판단 보류</p>
<p id="decision" class="decision" role="status"></p>
<div class="demo-grid"><div><h3 id="graphTitle">선택 차량의 연결</h3><div id="graph" class="public-graph"></div></div>
<div><h3>관측에서 얻은 값</h3><dl id="vehicleFacts" class="facts"></dl></div></div>
<details><summary>현재 연결의 원 관측 시각·사용 시각·근거 보기</summary><div id="evidence" class="evidence"></div></details>
<p class="small">화면의 연결은 계산된 영상 근거 또는 추적 가설이다. 실제 같은 차로·이동 방향·물리 차단·직접 선행차는 미확정이며, 자동 제외 차량은 0개다.</p>
<h3>원본 장면을 연속 영상으로 확인한다</h3>
<video id="reviewVideo" controls preload="metadata" playsinline poster="assets/frames/2123.jpg"><source src="assets/prevention-review.mp4" type="video/mp4"></video>
<p id="videoState" class="small">대표 장면을 선택하면 영상도 해당 위치에서 멈춘다. 재생 중 그래프는 선택한 대표 장면에 고정된다.</p>
<p class="small">검수 재생은 10 fps, 30초다. 원 관측의 경과 시간은 약 25.71초로, 재생 시간을 실제 행동 간격으로 사용하지 않는다.</p>
</section>
"""

NOTICE = """
<section id="sources"><h2>데이터 출처와 사용 범위</h2>
<p>PREVENTION: R. Izquierdo, A. Quintanar, I. Parra, D. Fernández-Llorca, M. A. Sotelo,
<em>The PREVENTION dataset: a novel benchmark for PREdiction of VEhicles iNTentIONs</em>, ITSC 2019, pp. 3114–3121.
<a href="https://doi.org/10.1109/ITSC.2019.8917433">논문</a> ·
<a href="https://invett.aut.uah.es/rizquierdo/">데이터 제공자·이용 조건</a></p>
<p>이 페이지의 PREVENTION 영상 발췌·이미지·변환 결과는 원 데이터에 기반하며,
<a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC BY-NC-SA 3.0</a> 조건으로 제공한다.
차량 박스·세그멘테이션·차선·깊이·관계 표시는 본 연구에서 계산한 결과이며 제공자의 정확도 인증을 뜻하지 않는다.</p>
<p>CASCADE와 PhysicalAI의 원 영상·주석은 포함하지 않는다. 연구 소개에 언급된 VLM 추가 학습은 계획이며 미실행이다.</p>
<p class="small">민현식 · Hanyang University, VIAT Lab · <a href="https://github.com/minun001/VLA">사이트 소스</a></p></section>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-url", required=True)
    parser.add_argument("--document", type=Path, required=True)
    args = parser.parse_args()
    parsed = urllib.parse.urlparse(args.review_url)
    assert parsed.scheme in ("http", "https") and parsed.hostname
    def get(path):
        with urllib.request.urlopen(args.review_url.rstrip("/") + path, timeout=60) as response:
            return response.read()
    asset_dir = ROOT / "assets"
    (asset_dir / "frames").mkdir(parents=True, exist_ok=True)
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
    html = args.document.read_text(encoding="utf-8")
    assert set(re.findall(r'src="assets/([^"/]+)"', html)) == set(IMAGES)
    html = html.replace('href="http://127.0.0.1:18860/#featureRationale"', 'href="#viewer"')
    html = html.replace('href="http://127.0.0.1:18860/#temporalGraphBuild"', 'href="#viewer"')
    html = html.replace("영상·그래프 검수와 전체 수식 보기", "대표 장면의 영상·그래프 보기")
    html = html.replace('<h2 id="section-4">', VIEWER + '<h2 id="section-4">')
    html = html.replace('</head>', '<meta name="description" content="도로 영상에서 피처와 공간·시간 관계를 추출해 Temporal KG로 구성하는 VLM 주행 상황 이해 연구."><link rel="stylesheet" href="public.css"></head>')
    html = html.replace('</main>', NOTICE + '</main>')
    html = html.replace('</body>', '<script src="app.js" defer></script></body>')
    html = html.replace('<main class="document">', '<main class="document" id="featureRationale">')
    html = html.replace('</aside>', '<a href="#viewer">실제 적용 결과</a><a href="#sources">데이터 출처</a></aside>')
    assert "127.0.0.1" not in html and "/api/" not in html
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    (ROOT / ".nojekyll").touch()
    print(json.dumps({"public_frames": len(frames), "observations": sum(len(f["objects"]) for f in frames),
                      "graph_nodes": sum(len(f["nodes"]) for f in frames), "graph_edges": sum(len(f["edges"]) for f in frames),
                      "casCADE_media": 0, "backend_required": False, "algorithm_changed": False}))


if __name__ == "__main__":
    main()
