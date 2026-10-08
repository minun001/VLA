"""Apply the adopted camera components to other PREVENTION drives and render them.

The worker imports existing research producers and final lane gates. It does not
port the R1D1-specific full scene compiler or certify physical relations. Native
RGB, masks, depth and graphs stay in memory; only requested videos/posters and
their small website catalogue are saved. Source code/fonts travel over SSH stdin.
"""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess
import sys
import urllib.request


CASES = (("R2D1", 800, "교차로 부근의 회전 장면"),
         ("R3D1", 1500, "차량이 적은 도로"),
         ("R4D1", 1800, "분리대가 보이는 다차로 도로"),
         ("R5D1", 1633, "가까운 차량과 박스 겹침"))


def track_label(obj):
    tracker_id = obj.get("tracker_id")
    return "추적 " + str(tracker_id) if type(tracker_id) is int and tracker_id > 0 else "개별 관측"


def observed_chain(typed, oid, frame, timestamp):
    nodes = {n["id"]: n for n in typed["nodes"] if n["type"] == "VehicleObservation"}
    links = {}
    for edge in typed["edges"]:
        if edge["predicate"] != "next_observation" or not edge["input_eligible"]:
            continue
        assert edge["object"] not in links, "Ambiguous displayed predecessor"
        assert edge["known_at_frame"] <= frame and edge["known_at_timestamp_us"] <= timestamp
        links[edge["object"]] = edge
    chain, actual = [oid], []
    while len(chain) < 3 and chain[-1] in links:
        edge = links[chain[-1]]
        assert edge["subject"] not in chain, "Cyclic displayed history"
        actual.append(edge); chain.append(edge["subject"])
    for nid in chain:
        assert nodes[nid]["source_frame"] <= frame and nodes[nid]["timestamp_us"] <= timestamp
    return list(reversed(chain)), actual, nodes


def qualified_frame(result, step):
    """Validate a causal core prefix, then reuse the main source/task lane gates."""
    from comparisons.diverse_review_projection import project_diverse_frame
    from research.sequence_contract import build_sequence_graph
    from research.scene_semantics import _apply_road_actor_context, _apply_lane_space_membership
    from research.lane_space_graph import qualify_lane_space_graph
    record = result["frames"][step]
    rows = [x["row"] for x in result["frames"][:step + 1]]
    graph = build_sequence_graph(rows, None, result["context"])["typed_graph"]
    payload = {k: record[k] for k in ("row", "raw", "lane", "actor", "lane_space")}
    payload["graph"] = graph
    payload["temporal"] = result["temporal"]["frames"][step]
    project_diverse_frame(payload)  # source, camera, time, native probe, prefix contract
    assignments = {x["observation_id"]: x for x in record["local"]["vehicle_assignments"]}
    packet = {"objects": [{"observation_id": o["observation_id"],
                "bbox_xyxy": copy.deepcopy(o["bbox_xyxy"]),
                "lane_image_geometry": copy.deepcopy(assignments[o["observation_id"]])}
                for o in record["row"]["tracked_objects"]], "interpretation_rules": []}
    _apply_road_actor_context(packet, record["actor"])
    _apply_lane_space_membership(packet, record["lane_space"])
    usage = {o["observation_id"]: o["task_feature_usage"] for o in packet["objects"]}
    qualified = qualify_lane_space_graph(record["lane_space"], usage)
    assert not qualified["automatically_excluded_observation_ids"]
    assert all(a["decision"] in ("candidate", "held")
               for a in qualified["membership_contract"]["assertions"])
    assert {o["observation_id"] for o in packet["objects"]} == {
        o["observation_id"] for o in record["row"]["tracked_objects"]}
    return packet, qualified, graph


def remote_worker(config, fonts):
    import gc
    import os
    import cv2
    import numpy as np
    import torch
    import imageio_ffmpeg
    from PIL import Image, ImageDraw, ImageFont
    root = Path(config["project_root"])
    sys.path.insert(0, str(root))
    os.chdir(root)
    from comparisons.diverse_scene_validation import execute_window, read_video_window, RoadWorker
    from research.yolo_vehicle_pipeline import configure
    from research.clrernet_lane_detector import ClrerDetector
    from research.road_scene_segmentation import decode_label_map
    from research.image_relations import frame_bottom_center_relations
    from research.depth_model_adapters import load_depth_model
    from ultralytics import YOLO

    configure()
    torch.set_num_threads(8)
    endpoint = json.loads((Path.home() / "prevention_tools/access.json").read_text())["endpoint"]
    output = Path(config["remote_output_dir"])
    assert output.is_absolute() and output.parent == root / "data"
    output.mkdir(exist_ok=True)
    count = config["count"]
    assert 12 <= count <= 120
    yolo = YOLO(str(root / "weights/yolo26m_vehicle_only.pt"))
    lane = ClrerDetector()
    road = RoadWorker()
    font_cache = {}

    def font(size, bold=False):
        key = size, bold
        if key not in font_cache:
            font_cache[key] = ImageFont.truetype(io.BytesIO(fonts[int(bold)]), size)
        return font_cache[key]

    def track(o):
        return track_label(o)

    def dashed(draw, a, b, color):
        length = math.dist(a, b)
        for start in range(0, int(length), 24):
            u, v = start / max(1, length), min(start + 11, length) / max(1, length)
            draw.line([(a[0] + (b[0]-a[0])*u, a[1] + (b[1]-a[1])*u),
                       (a[0] + (b[0]-a[0])*v, a[1] + (b[1]-a[1])*v)], fill=color, width=3)

    def arrow(draw, a, b):
        draw.line([a, b], fill="#168a78", width=4)
        ang = math.atan2(b[1]-a[1], b[0]-a[0])
        draw.polygon([b, (b[0]-12*math.cos(ang-.4), b[1]-12*math.sin(ang-.4)),
                      (b[0]-12*math.cos(ang+.4), b[1]-12*math.sin(ang+.4))], fill="#168a78")

    def node(draw, xy, text, width=200, active=False):
        x, y = xy
        draw.rounded_rectangle((x-width/2, y-36, x+width/2, y+36), radius=13,
                               fill="#e7f7ef" if active else "#f3f6f3", outline="#bdd8cc", width=2)
        draw.multiline_text(xy, text, font=font(22, active), anchor="mm", align="center", fill="#17383b", spacing=4)

    def panel(canvas, xy, title, picture):
        ImageDraw.Draw(canvas).text(xy, title, font=font(25, True), fill="#17383b")
        canvas.paste(picture.resize((624,195), Image.Resampling.LANCZOS), (xy[0], xy[1]+39))

    catalogue = {"dataset": "PREVENTION", "render_fps": 10,
        "processing_complete": False, "scope": "adopted_components_with_existing_final_lane_gates",
        "full_R1D1_main_executed": False, "VLM_model_inference_executed": False,
        "physical_accuracy_verified": False, "clock_basis": "video_playback_us_not_capture", "clips": []}
    source_names = ["comparisons/diverse_scene_validation.py", "comparisons/diverse_review_projection.py",
                    "research/scene_semantics.py", "research/lane_space_graph.py", "research/lane_ontology.py"]
    source_hashes = {p: hashlib.sha256((root/p).read_bytes()).hexdigest() for p in source_names}
    try:
        for ci, (clip, first, title) in enumerate(CASES):
            print(json.dumps({"starting": clip, "frames": count}), flush=True)
            images, meta = read_video_window(endpoint + "/video/" + clip, first, count)
            assert (meta["width"], meta["height"]) == (1920, 600)
            # Informative progress without writing logs or perception dumps.
            class ProgressRoad:
                done = 0
                def infer(self, rgb, row, camera):
                    value = road.infer(rgb, row, camera)
                    self.done += 1
                    if self.done % 12 == 0:
                        print(json.dumps({"clip": clip, "road_lane_frames": self.done, "of": count}), flush=True)
                    return value
            result = execute_window("PREVENTION", clip, first, images, meta, "native", yolo, lane, ProgressRoad())
            # Validate every display binding, including late unlinked/temporal
            # cases, before running the expensive depth/encoding stage.
            views = []
            for step, record in enumerate(result["frames"]):
                view = qualified_frame(result, step)
                for obj in record["row"]["tracked_objects"]:
                    track_label(obj)
                    observed_chain(view[2], obj["observation_id"], record["row"]["source_frame"], record["row"]["timestamp_us"])
                views.append(view)
            info = json.load(urllib.request.urlopen(endpoint + "/info/" + clip, timeout=60))
            intrinsic = info["calibration"]["camera1_intrinsic_calibration.dat"]
            lines = {x.split()[0]: x.split()[1:] for x in intrinsic.splitlines() if x.split()}
            assert list(map(int, lines["ImageSize"])) == [1920, 600]
            focal = float(lines["IntrinsicParams"][0])
            path = output / ("drive-" + clip.lower() + ".mp4")
            prior = config.get("reuse_depth", {}).get(clip)
            depth_frames = []
            if prior:
                # Reuse only the already verified same-frame heatmap display,
                # never RGB labels, depth numbers, or graph decisions. Read it
                # into RAM before replacing the requested video in place.
                assert hashlib.sha256(path.read_bytes()).hexdigest() == prior["video_sha256"]
                assert prior["first_frame"] == first and prior["frames"] == count and prior["focal_px"] == focal
                cap = cv2.VideoCapture(str(path))
                assert cap.isOpened() and int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) == count
                for _ in range(count):
                    ok, bgr = cap.read(); assert ok and bgr.shape == (1080,1920,3)
                    depth_frames.append(Image.fromarray(cv2.cvtColor(bgr[613:808,688:1312],cv2.COLOR_BGR2RGB)))
                assert not cap.read()[0]; cap.release()
                depth_model = infer = depth_contract = None
            else:
                depth_model, infer, depth_contract = load_depth_model("metric_anything", focal, device="cuda")
            encoder = subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-v", "error", "-y",
                "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1920x1080", "-r", "10", "-i", "pipe:0",
                "-an", "-c:v", "libx264", "-threads", "4", "-preset", "fast", "-crf", "20",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)],
                stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            stats = {"observations": 0, "lane_candidates": 0, "held": 0,
                     "rendered_membership_edges": 0, "rendered_temporal_edges": 0,
                     "RGB_bindings_checked": 0, "empty_detection_frames": 0}
            previous_track = None
            try:
                for step, (rgb, record) in enumerate(zip(images, result["frames"])):
                    row = record["row"]
                    assert row["source_frame"] == first + step
                    assert hashlib.sha256(rgb.tobytes()).hexdigest() == record["raw"]["rgb_sha256"] == record["road"]["provenance"]["original_RGB_sha256"]
                    packet, space, typed = views[step]
                    objects = row["tracked_objects"]
                    decisions = {a["subject"]: a for a in space["membership_contract"]["assertions"]}
                    allowed = {oid for oid, a in decisions.items() if a["decision"] == "candidate"}
                    edges = [e for e in space["edges"] if e["predicate"] == "vehicle_in_image_corridor_candidate"]
                    assert {e["subject"] for e in edges} == allowed
                    selected = max(objects, key=lambda o: (o["observation_id"] in allowed,
                        previous_track is not None and o.get("object_key") == previous_track,
                        (o["bbox_xyxy"][2]-o["bbox_xyxy"][0])*(o["bbox_xyxy"][3]-o["bbox_xyxy"][1]))) if objects else None
                    if selected: previous_track = selected.get("object_key")
                    labels = decode_label_map(record["road"]["label_map"], expected_hw=(600,1920))
                    raw = Image.fromarray(rgb)
                    tint = np.zeros_like(rgb)
                    tint[np.isin(labels, [13,14])] = [46,186,145]
                    tint[np.isin(labels, [2,3,4,5,6])] = [234,160,65]
                    mask = tint.any(axis=2)
                    road_rgb = rgb.copy()
                    road_rgb[mask] = np.rint(.55*rgb[mask]+.45*tint[mask]).astype(np.uint8)
                    combined = Image.fromarray(road_rgb).convert("RGBA")
                    overlay = Image.new("RGBA", raw.size, (0,0,0,0))
                    polygon_draw = ImageDraw.Draw(overlay)
                    for n in space["nodes"]:
                        if n["type"] == "LaneCorridorImageCandidate" and n["status"] == "candidate":
                            polygon_draw.polygon([tuple(x) for x in n["polygon_xy"]], fill=(60,191,161,25), outline=(86,225,191,160))
                    combined = Image.alpha_composite(combined, overlay)
                    d = ImageDraw.Draw(combined)
                    for boundary in record["lane"]["boundaries"]:
                        points = [(x,y) for x,y,*_ in boundary["points_xy_score"]]
                        if len(points)>1: d.line(points, fill="#87e5ff", width=4)
                    occupied = []
                    for obj in sorted(objects, key=lambda o: o is not selected):
                        oid = obj["observation_id"]
                        color = "#72fff0" if obj is selected else ("#8df2a2" if oid in allowed else "#ffc579")
                        box = obj["bbox_xyxy"]; x0,y0,x1,y1 = box
                        d.rectangle(box, outline=color, width=5 if obj is selected else 3)
                        x,y = (x0+x1)/2,y1
                        d.ellipse((x-6,y-6,x+6,y+6), fill=color)
                        text = track(obj); tw = d.textbbox((0,0),text,font=font(25,True))[2]+16
                        for ty in (y0-38,y1+6,y0-78):
                            tx=max(0,min(1920-tw,x0));ty=max(0,min(560,ty));area=(tx,ty,tx+tw,ty+35)
                            if any(not(area[2]+5<a[0] or a[2]+5<area[0] or area[3]+5<a[1] or a[3]+5<area[1]) for a in occupied):continue
                            d.rounded_rectangle(area,radius=5,fill=(17,44,42,220));d.text((tx+8,ty+2),text,font=font(25,True),fill=color);occupied.append(area);break
                    if prior:
                        depth_image = depth_frames[step]
                    else:
                        depth = np.asarray(infer(rgb)).squeeze()
                        assert depth.shape == (600,1920)
                        valid = np.isfinite(depth) & (depth > 0) & (depth < depth_contract["depth_saturation_ceiling_m"]*(1-1e-6))
                        scale = np.clip(np.log1p(np.where(valid,depth,0))/math.log1p(150),0,1)
                        heat = cv2.applyColorMap(np.uint8((1-scale)*255),cv2.COLORMAP_TURBO)
                        heat[~valid] = (180,180,180)
                        depth_image = Image.fromarray(cv2.cvtColor(heat,cv2.COLOR_BGR2RGB))
                    relation = frame_bottom_center_relations(objects, row["source_frame"], (1920,600), context=result["context"])
                    geom = raw.copy(); gd = ImageDraw.Draw(geom)
                    for e in relation["edges"]:
                        dashed(gd,e["source_point_xy_px"],e["target_point_xy_px"],"#6bddd2" if selected and selected["observation_id"] in (e["subject"],e["object"]) else "#93a2a0")
                    for a in relation["vehicle_bottom_centers"].values():
                        x,y=a["xy_px"];gd.ellipse((x-6,y-6,x+6,y+6),fill="#79fff0")
                    gd.text((980,550),"ego · 화면 기준",font=font(30,True),fill="white",stroke_width=2,stroke_fill="#17383b")
                    canvas = Image.new("RGB",(1920,1080),"#f7f8f6");out=ImageDraw.Draw(canvas)
                    out.text((32,25),title,font=font(38,True),fill="#17383b")
                    out.text((1888,44),f"{ci+1} / 4 · {step+1:02d} / {count}  |  원영상 {step/meta['fps']:.2f}초 경과",anchor="rm",font=font(24),fill="#657a7b")
                    out.line((32,82,1888,82),fill="#dbe4df",width=2)
                    out.text((32,96),"차량·추적 / 도로 구조 / 차선·차로 후보",font=font(26,True),fill="#17383b")
                    canvas.paste(combined.convert("RGB").resize((1280,400),Image.Resampling.LANCZOS),(32,134))
                    out.text((32,540),"청록: 확대 차량   녹색: 소속 후보   주황: 소속 보류 · 관측 유지",font=font(22),fill="#657a7b")
                    panel(canvas,(32,574),"도로·시설 구분  |  Mask2Former",Image.fromarray(road_rgb))
                    panel(canvas,(688,574),"가시 표면 깊이  |  MetricAnything · 미검증",depth_image)
                    panel(canvas,(32,810),"하단 중심 연결  |  픽셀 기하 참조",geom)
                    out.text((688,810),"선택 차량의 원영상",font=font(26,True),fill="#17383b")
                    if selected:
                        box=selected["bbox_xyxy"];x0,y0,x1,y1=box
                        padw,padh=max(90,(x1-x0)*.5),max(40,(y1-y0)*.3)
                        crop=raw.crop((max(0,int(x0-padw)),max(0,int(y0-padh)),min(1920,int(x1+padw)),min(600,int(y1+padh))))
                        crop.thumbnail((235,190));canvas.paste(crop,(688+(235-crop.width)//2,850+(190-crop.height)//2))
                        state="소속 후보 채택" if selected["observation_id"] in allowed else "소속 판단 보류"
                        for j,text in enumerate([track(selected),state,"원 박스·관측 보존","깊이: 표면 추정값","범퍼 거리·방향: 미확정"]):
                            out.text((945,852+36*j),text,font=font(22,j<2),fill="#17383b" if j<2 else "#657a7b")
                    else:
                        out.text((688,890),"현재 프레임: 채택된 차량 탐지 없음",font=font(25,True),fill="#17383b")
                        out.text((688,940),"차량이 실제로 없다는 정답은 아닙니다.",font=font(22),fill="#657a7b")
                    out.rounded_rectangle((1344,96,1888,1043),radius=18,fill="white",outline="#dbe4df",width=2)
                    out.text((1370,119),"관측 → 공간·시간 그래프",font=font(29,True),fill="#17383b")
                    if selected:
                        oid=selected["observation_id"];member=next((e for e in edges if e["subject"]==oid),None)
                        node(out,(1616,220),track(selected)+"\n현재 관측",240,True)
                        if member:
                            cid=member["object"];arrow(out,(1616,256),(1616,314));node(out,(1616,350),"영상 차로 후보",240)
                            supports=[e for e in space["edges"] if e["subject"]==cid and e["predicate"] in ("left_image_boundary_candidate","right_image_boundary_candidate","corridor_has_visible_road_support")]
                            assert len(supports)==3
                            for e in supports:
                                pos={"left_image_boundary_candidate":(1438,490),"right_image_boundary_candidate":(1616,490),"corridor_has_visible_road_support":(1794,490)}[e["predicate"]]
                                text={"left_image_boundary_candidate":"왼쪽 차선\n경계","right_image_boundary_candidate":"오른쪽 차선\n경계","corridor_has_visible_road_support":"도로 지지"}[e["predicate"]]
                                arrow(out,(1616,386),(pos[0],pos[1]-36));node(out,pos,text,156)
                            out.text((1370,552),"기존 최종 소속 관문 통과",font=font(23,True),fill="#168a78")
                            stats["rendered_membership_edges"]+=1
                        else:
                            out.text((1390,340),"차로 소속은 연결하지 않음",font=font(27,True),fill="#b27d31")
                            out.text((1390,390),"도로·경계·가림 근거 부족",font=font(23),fill="#657a7b")
                            out.text((1390,440),"차량 관측은 그래프에 유지",font=font(23),fill="#657a7b")
                        chain,actual,past_nodes=observed_chain(typed,oid,row["source_frame"],row["timestamp_us"])
                        positions={nid:(1438+i*356/max(1,len(chain)-1),746) for i,nid in enumerate(chain)}
                        for e in actual:
                            a,b=positions[e["subject"]],positions[e["object"]];arrow(out,(a[0]+70,a[1]),(b[0]-70,b[1]))
                        for nid in chain:
                            n=past_nodes[nid];assert n["timestamp_us"]<=row["timestamp_us"]
                            text="현재 관측" if nid==oid else f"{(row['timestamp_us']-n['timestamp_us'])/1e6:.2f}초 전"
                            node(out,positions[nid],text,140,nid==oid)
                        stats["rendered_temporal_edges"]+=len(actual)
                    else:
                        out.text((1390,250),"차량 노드 없음",font=font(30,True),fill="#657a7b")
                        out.text((1390,310),"도로·경계 결과만 표시",font=font(24),fill="#657a7b")
                    out.line((1370,628,1862,628),fill="#dbe4df",width=2)
                    out.text((1370,648),"과거 → 현재  |  추적 가설",font=font(26,True),fill="#17383b")
                    out.text((1370,810),"각 영상의 시작에서 추적을 초기화",font=font(21),fill="#657a7b")
                    out.line((1370,850,1862,850),fill="#dbe4df",width=2)
                    out.text((1370,875),f"차량 {len(objects)}개 · 소속 후보 {len(allowed)}개",font=font(25,True),fill="#17383b")
                    out.text((1370,920),f"소속 보류 {len(objects)-len(allowed)}개 · 자동 제외 0개",font=font(23),fill="#657a7b")
                    out.text((1370,967),"방향·물리 연결성: 미확정",font=font(23),fill="#b27d31")
                    out.text((1370,1006),"구성요소 적용 · VLM 추론 미실행",font=font(21),fill="#657a7b")
                    out.text((32,1052),f"PREVENTION {clip} · YOLO26m + BoT-SORT / CLRerNet / Mask2Former / MetricAnything  |  10 fps 검수 재생 · 원영상 시간 별도",font=font(20),fill="#657a7b")
                    if step==count//2:canvas.save(path.with_suffix(".jpg"),quality=93,subsampling=0)
                    encoder.stdin.write(canvas.tobytes())
                    stats["observations"]+=len(objects);stats["lane_candidates"]+=len(allowed);stats["held"]+=len(objects)-len(allowed)
                    stats["RGB_bindings_checked"]+=1;stats["empty_detection_frames"]+=not bool(objects)
                    if (step+1)%12==0:print(json.dumps({"clip":clip,"depth_rendered":step+1,"of":count}),flush=True)
                encoder.stdin.close();error=encoder.stderr.read()
                assert encoder.wait()==0,error.decode(errors="replace")
            finally:
                if encoder.poll() is None:encoder.kill();encoder.wait()
                del depth_model,infer;gc.collect();torch.cuda.empty_cache()
            checked=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-hide_banner","-v","info","-i",str(path),
                "-vf","showinfo","-an","-f","null","-"],capture_output=True,timeout=120)
            times=[(int(a),float(b)) for a,b in re.findall(r"\[Parsed_showinfo_[^\]]*\].*?\bn:\s*(\d+).*?\bpts_time:([-\d.e+]+)",checked.stderr.decode(errors="replace"))]
            assert checked.returncode==0 and len(times)==count
            assert all(n==i and abs(t-i/10)<1e-5 for i,(n,t) in enumerate(times))
            assert source_hashes=={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in source_names}
            if prior:
                assert all(stats[k] == prior[k] for k in stats), "Recomputed perception differs from the heatmap source run"
            entry={"clip":clip,"title":title,"first_frame":first,"last_frame":first+count-1,"frames":count,
                "video":"assets/"+path.name,"poster":"assets/"+path.with_suffix('.jpg').name,
                "duration_s":count/10,"source_fps":meta["fps"],"source_elapsed_s":(count-1)/meta["fps"],
                "focal_px":focal,"focal_projection_verified":False,"depth_maps_computed":count,
                "automatic_exclusions":0,"encoded_PTS_checked":count,
                "depth_model_rerun_in_this_render":not bool(prior),
                "depth_display_source":"verified_same_frame_prior_video_heatmap" if prior else "current_native_model_inference",
                "depth_source_video_sha256":prior["video_sha256"] if prior else None,**stats}
            catalogue["clips"].append(entry)
            print(json.dumps({"finished":entry},ensure_ascii=False),flush=True)
            del result,images,views;gc.collect()
    finally:road.close()
    catalogue["processing_complete"]=True
    print("CATALOGUE "+json.dumps(catalogue,ensure_ascii=False),flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ssh-target",required=True);p.add_argument("--ssh-key",type=Path,required=True)
    p.add_argument("--remote-python",required=True);p.add_argument("--project-root",required=True)
    p.add_argument("--remote-output-dir",required=True);p.add_argument("--count",type=int,default=48)
    p.add_argument("--font",type=Path,required=True);p.add_argument("--bold-font",type=Path,required=True)
    p.add_argument("--reuse-depth-video",action="store_true",help="Display-only rerender: reuse the verified same-frame heatmap from existing videos")
    p.add_argument("--output-dir",type=Path,default=Path(__file__).parent/"assets")
    a=p.parse_args()
    ssh=["ssh","-T","-o","BatchMode=yes","-o","ConnectTimeout=12","-i",str(a.ssh_key),"-o","IdentitiesOnly=yes",a.ssh_target]
    payload={"source":Path(__file__).read_text(encoding="utf-8"),
        "config":{k:getattr(a,k) for k in ("project_root","remote_output_dir","count")},
        "fonts":[base64.b64encode(x.read_bytes()).decode() for x in (a.font,a.bold_font)]}
    if a.reuse_depth_video:
        prior=json.loads((a.output_dir.parent/"other-drives.json").read_text(encoding="utf-8"))
        assert prior["processing_complete"] and len(prior["clips"])==4
        payload["config"]["reuse_depth"]={c["clip"]:{**c,"video_sha256":hashlib.sha256((a.output_dir/Path(c["video"]).name).read_bytes()).hexdigest()} for c in prior["clips"]}
    entry="import json,sys,base64;p=json.load(sys.stdin);g={'__name__':'remote_renderer'};exec(p['source'],g);g['remote_worker'](p['config'],[base64.b64decode(x) for x in p['fonts']])"
    proc=subprocess.Popen(ssh+[shlex.quote(a.remote_python)+" -B -c "+shlex.quote(entry)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding="utf-8")
    proc.stdin.write(json.dumps(payload));proc.stdin.close();catalogue=None
    for line in proc.stdout:
        print(line,end="",flush=True)
        if line.startswith("CATALOGUE "):catalogue=json.loads(line[len("CATALOGUE "):])
    assert proc.wait()==0 and catalogue and catalogue["processing_complete"]
    for clip in catalogue["clips"]:
        for key in ("video","poster"):
            local=a.output_dir/Path(clip[key]).name
            remote=PurePosixPath(a.remote_output_dir)/local.name
            read="from pathlib import Path;import sys;sys.stdout.buffer.write(Path("+repr(str(remote))+").read_bytes())"
            data=subprocess.run(ssh+[shlex.quote(a.remote_python)+" -B -c "+shlex.quote(read)],capture_output=True,check=True).stdout
            assert data;local.write_bytes(data)
    (a.output_dir.parent/"other-drives.json").write_text(json.dumps(catalogue,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":main()
