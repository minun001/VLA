"""Render the implemented PREVENTION pipeline into one public review video.

The remote worker reads the existing API, lossless RGB and depth cache. It does
not run inference, change admission decisions, interpolate labels or write dumps.
Only the requested MP4 and its web poster are written. Rendering code and fonts
are sent in memory; no remote copy of this script or font is saved.
"""
from __future__ import annotations

import argparse
import base64
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


def check_frame(frame, sequence):
    number = frame["source_frame"]
    assert frame["camera_ref"] == sequence["camera_ref"] == "R1D1:front_camera"
    assert frame["image_size_xy"] == sequence["image_size_xy"] == [1920, 600]
    assert frame["known_at_timestamp_us"] <= frame["timestamp_us"]
    assert not frame["ego_is_physical_projection"]
    assert frame["road"]["source_frame"] == number
    assert frame["road"]["rgb_sha256"] == frame["rgb_sha256"]
    assert frame["road_status"] == "current_native_inference"
    assert not frame["interaction_view"]["excluded_observation_ids"]
    graph = frame["temporal_graph_build"]
    assert not graph["future_frames_used"] and not graph["physical_edges_verified"]
    ids = {n["id"] for n in graph["nodes"]}
    assert len(ids) == len(graph["nodes"])
    for item in graph["nodes"] + graph["edges"]:
        assert item["source_frame"] <= number and item["known_at_frame"] <= number
        assert item["timestamp_us"] <= frame["timestamp_us"]
        assert item["known_at_timestamp_us"] <= frame["timestamp_us"]
        assert item["camera_ref"] == frame["camera_ref"]
        assert not item["physical_verified"]
        for ref in [item["id"], *item.get("evidence_refs", [])]:
            assert all(int(x) <= number for x in re.findall(r"(?:^|:)f(\d+)(?=:|$)", ref))
    for edge in graph["edges"]:
        assert edge["subject"] in ids and edge["object"] in ids
    for obj in frame["objects"]:
        assert obj["source_frame"] == number and obj["known_at_frame"] <= number
        assert obj["known_at_timestamp_us"] <= frame["timestamp_us"]
        assert not obj["depth"]["metric_accuracy_verified"]
        x0, y0, x1, y1 = obj["box"]
        assert 0 <= x0 < x1 <= 1920 and 0 <= y0 < y1 <= 600
        assert obj["anchor"] == [(x0 + x1) / 2, y1]
        if lane_allowed(obj):
            _, edges = spatial_graph(frame, obj)
            assert {e["predicate"] for e in edges} >= {
                "vehicle_in_image_corridor_candidate", "left_image_boundary_candidate",
                "right_image_boundary_candidate", "corridor_has_visible_road_support"}


def lane_allowed(obj):
    return obj["task_feature_usage"]["lane_image_membership_candidate_allowed"] is True


def track_label(obj):
    match = re.search(r":track:(\d+)$", obj.get("track") or "")
    return "추적 " + match[1] if match else "미연결 관측"


def spatial_graph(frame, obj):
    """Select existing admitted edges; never recompute or bypass a lane veto."""
    edges = [e for e in frame["temporal_graph_build"]["edges"] if e["input_eligible"]]
    if lane_allowed(obj):
        assignment = next(a for a in frame["partition"]["assignments"]
                          if a["observation_id"] == obj["id"])
        corridor = assignment["scene_corridor_candidate_id"]
        membership = [e for e in edges if e["subject"] == obj["id"]
                      and e["object"] == corridor
                      and e["predicate"] == "vehicle_in_image_corridor_candidate"]
        supports = [e for e in edges if e["subject"] == corridor and e["predicate"] in {
            "left_image_boundary_candidate", "right_image_boundary_candidate",
            "corridor_has_visible_road_support"}]
        assert len(membership) == 1 and len(supports) == 3
        return "membership", membership + supports
    return "support", [e for e in edges if e["subject"] == obj["id"] and e["predicate"] in {
        "visible_road_support_image_candidate", "has_structure_visibility_evidence"}]


def temporal_graph(frame, obj):
    graph = frame["temporal_graph_build"]
    nodes = sorted((n for n in graph["nodes"] if n["type"] == "VehicleObservation"
                    and (n.get("current_observation_id") == obj["id"] or n["id"] == obj["id"])),
                   key=lambda n: n["timestamp_us"])[-3:]
    ids = {n["id"] for n in nodes}
    edges = [e for e in graph["edges"] if e["input_eligible"] and e["subject"] in ids
             and e["object"] in ids and e["predicate"] == "previous_observed_track_hypothesis"]
    return nodes, edges


def render_remote(config, fonts):
    import cv2
    import imageio_ffmpeg
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    url = config["review_url"].rstrip("/")
    sample = Path(config["sample_dir"])
    output = Path(config["remote_output"])
    assert output.parent.is_dir(), "Use the existing result directory"

    def get(path):
        with urllib.request.urlopen(url + path, timeout=90) as response:
            return response.read()

    sequence = json.loads(get("/api/sequence"))
    assert sequence["dataset"] == "PREVENTION" and sequence["frame_count"] == 300
    assert sequence["first_source_frame"] == 1950 and sequence["last_source_frame"] == 2249
    assert sequence["summary"]["implementation_revision"] == "0.37"
    assert not sequence["summary"]["future_frames_used"]
    rows = json.loads(get("/api/frames"))["frames"]
    assert [f["source_frame"] for f in rows] == list(range(1950, 2250))
    assert len(rows) == len(sequence["frames"])
    for frame, clock in zip(rows, sequence["frames"]):
        assert all(frame[k] == clock[k] for k in ("source_frame", "timestamp_us", "video_time_s", "capture_elapsed_s"))
        check_frame(frame, sequence)
    contract = json.loads((sample / "metric_anything/depth_contract.json").read_text())
    assert contract["processing_complete"] and contract["processed_frames"] == 300
    assert contract["source_frame_range"] == [1950, 2249]
    assert not contract["future_frames_used"] and not contract["absolute_metric_accuracy_verified"]
    depth_maps = np.load(sample / "metric_anything/depth_maps.npy", mmap_mode="r")
    assert depth_maps.shape == (300, 600, 1920)
    cap = cv2.VideoCapture(str(sample / "video_camera1.mkv"))
    assert cap.isOpened() and int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) == 300
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
               "-pix_fmt", "rgb24", "-s", "1920x1080", "-r", "10", "-i", "pipe:0",
               "-an", "-c:v", "libx264", "-threads", "4", "-preset", "fast", "-crf", "19",
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    font_cache = {}

    def font(size, bold=False):
        key = size, bold
        if key not in font_cache:
            font_cache[key] = ImageFont.truetype(io.BytesIO(fonts[1 if bold else 0]), size)
        return font_cache[key]

    ink, muted, teal, amber = "#17383b", "#657a7b", "#148475", "#c08230"
    bg, line = "#f7f8f6", "#dbe4df"
    stats = {"frames": 0, "RGB_bindings": 0, "observations": 0, "lane_adopted": 0,
             "depth_quality_pass": 0, "admitted_spatial_edges_shown": 0, "temporal_edges_shown": 0}
    poster = output.with_suffix(".jpg")

    def arrow(draw, a, b, color=teal, width=3):
        draw.line([a, b], fill=color, width=width)
        angle = math.atan2(b[1] - a[1], b[0] - a[0])
        draw.polygon([b, (b[0] - 11 * math.cos(angle - .4), b[1] - 11 * math.sin(angle - .4)),
                      (b[0] - 11 * math.cos(angle + .4), b[1] - 11 * math.sin(angle + .4))], fill=color)

    def node(draw, xy, words, width=226, active=False):
        x, y = xy
        draw.rounded_rectangle((x-width/2, y-35, x+width/2, y+35), radius=12,
                               fill="#e1f1e9" if active else "#ffffff", outline=teal if active else line, width=2)
        lines = words.split("\n")
        for k, word in enumerate(lines):
            draw.text((x, y+(k-(len(lines)-1)/2)*25), word, anchor="mm", fill=ink, font=font(21, active))

    def panel(canvas, xy, title, image):
        x, y = xy
        draw = ImageDraw.Draw(canvas)
        draw.text((x, y), title, font=font(26, True), fill=ink)
        image = image.convert("RGB").resize((624, 195), Image.Resampling.LANCZOS)
        canvas.paste(image, (x, y+38))

    try:
        for index, frame in enumerate(rows):
            ok, bgr = cap.read()
            assert ok and bgr.shape == (600, 1920, 3)
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            assert hashlib.sha256(rgb.tobytes()).hexdigest() == frame["rgb_sha256"], "RGB/frame binding mismatch"
            raw = Image.fromarray(rgb)
            road = Image.open(io.BytesIO(get(frame["road"]["mask_url"]))).convert("RGBA")
            assert road.size == (1920, 600)
            road_view = Image.alpha_composite(raw.convert("RGBA"), road).convert("RGB")
            # Published class colours and model results are reused without threshold changes.
            overlay = road.copy()
            overlay.putalpha(overlay.getchannel("A").point(lambda a: int(a * .45)))
            combined = Image.alpha_composite(raw.convert("RGBA"), overlay)
            corridor_overlay = Image.new("RGBA", raw.size)
            cd = ImageDraw.Draw(corridor_overlay)
            for corridor in frame["partition"]["corridors"]:
                if corridor["status"] == "candidate":
                    cd.polygon([tuple(p) for p in corridor["polygon_xy"]], fill=(36, 180, 142, 30))
            combined = Image.alpha_composite(combined, corridor_overlay)
            draw = ImageDraw.Draw(combined)
            for boundary in frame["boundaries"]:
                for component in boundary["components"]:
                    if len(component) >= 2:
                        draw.line([tuple(p) for p in component], fill="#ffe371", width=4)
            selected = next((o for o in frame["objects"] if lane_allowed(o)),
                            max(frame["objects"], key=lambda o:(o["box"][2]-o["box"][0])*(o["box"][3]-o["box"][1])))
            colours = {}
            for obj in frame["objects"]:
                allowed = lane_allowed(obj)
                color = "#6ffff0" if obj["id"] == selected["id"] else "#a0f6bd" if allowed else "#ffc877"
                colours[obj["id"]] = color
                draw.rectangle(obj["box"], outline=color, width=5 if obj["id"] == selected["id"] else 3)
                x, y = obj["anchor"]
                draw.ellipse((x-6,y-6,x+6,y+6), fill=color)
                d = obj["depth"]
                if d["input_mask"] and d["units"] == "m" and d["value"] is not None:
                    stats["depth_quality_pass"] += 1
            # Label placement is presentation only. Every accepted box is kept,
            # while colliding small-object labels are omitted rather than merged.
            occupied = []
            ordered = sorted(frame["objects"], key=lambda o:(o["id"]!=selected["id"],
                             -(o["box"][2]-o["box"][0])*(o["box"][3]-o["box"][1])))
            for obj in ordered:
                label = track_label(obj)
                d = obj["depth"]
                if obj["id"]==selected["id"] and d["input_mask"] and d["units"]=="m" and d["value"] is not None:
                    label += f" · {d['value']:.1f} m*"
                fnt = font(28, True)
                bbox = draw.textbbox((0,0),label,font=fnt)
                w,h = bbox[2]-bbox[0]+16,37
                x0,y0,x1,y1 = obj["box"]
                positions = [(x0,y1+8),(x0,max(0,y0-h-7)),(x0,max(0,y0-2*h-15))] if obj["id"]==selected["id"] else [(x0,max(0,y0-h-7)),(x0,y1+8),(x0,max(0,y0-2*h-15))]
                for x,y in positions:
                    x,y = max(0,min(1920-w,x)),max(0,min(600-h,y))
                    area = (x,y,x+w,y+h)
                    if any(not(area[2]+8<a[0] or a[2]+8<area[0] or area[3]+6<a[1] or a[3]+6<area[1]) for a in occupied):continue
                    draw.rounded_rectangle(area,radius=5,fill=(18,42,43,215))
                    draw.text((x+8,y+3),label,font=fnt,fill=colours[obj["id"]])
                    occupied.append(area)
                    break
            # Raw pixel connections are shown in their own panel, never as traffic edges.
            geometry = raw.copy()
            gd = ImageDraw.Draw(geometry)
            for edge in frame["edges"]:
                assert edge["source_frame"] == frame["source_frame"] and edge["known_at_frame"] <= frame["source_frame"]
                assert edge["status"] == "image_geometry_proxy" and not edge["is_lane_or_leader_relation"]
                color = "#7ef4e8" if selected["id"] in (edge["subject"],edge["object"]) else "#899b9d"
                a,b = edge["a"],edge["b"]
                # Dashed image-space reference lines, including ego and vehicle pairs.
                length = math.hypot(b[0]-a[0], b[1]-a[1])
                for start in range(0, int(length), 22):
                    u,v = start/max(1,length), min(start+10,length)/max(1,length)
                    gd.line([(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u),
                             (a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v)],fill=color,width=3)
            for obj in frame["objects"]:
                x,y=obj["anchor"];gd.ellipse((x-7,y-7,x+7,y+7),fill="#70ffee")
            gd.text((980,550),"ego · 화면 기준",fill="#ffffff",font=font(34,True),stroke_width=2,stroke_fill="#17383b")
            depth = np.asarray(depth_maps[index])
            valid = np.isfinite(depth) & (depth > 0) & (depth < 1000)
            # Fixed causal display scale: no future-frame or full-sequence quantiles.
            scaled = np.clip(np.log1p(np.where(valid,depth,0))/math.log1p(150),0,1)
            colour = cv2.applyColorMap(np.uint8((1-scaled)*255),cv2.COLORMAP_TURBO)
            colour[~valid] = (180,180,180)
            depth_image = Image.fromarray(cv2.cvtColor(colour,cv2.COLOR_BGR2RGB))
            dd = ImageDraw.Draw(depth_image)
            for obj in frame["objects"]:
                dd.rectangle(obj["box"],outline="#e4fff6" if obj["depth"]["input_mask"] else "#b6b6b6",width=4)
            canvas = Image.new("RGB", (1920,1080), bg)
            out = ImageDraw.Draw(canvas)
            out.text((32,24),"주행 영상에서 Temporal KG까지",font=font(38,True),fill=ink)
            out.text((1888,43),f"관측 경과 {frame['capture_elapsed_s']:05.2f}초  ·  {index+1:03d} / 300",anchor="rm",font=font(25),fill=muted)
            out.line((32,82,1888,82),fill=line,width=2)
            out.text((32,96),"통합 결과  ·  차량·추적 ID / 차선 경계 / 차로 후보 / 도로 구조",font=font(26,True),fill=ink)
            canvas.paste(combined.convert("RGB").resize((1280,400),Image.Resampling.LANCZOS),(32,134))
            out.text((32,540),"청록: 확대 차량   녹색: 소속 후보   주황: 소속 보류   * 표면 깊이 추정",font=font(21),fill=muted)
            panel(canvas,(32,574),"도로·주변 구조물  |  Mask2Former",road_view)
            panel(canvas,(688,574),"표면 깊이  |  MetricAnything · 미검증 추정",depth_image)
            panel(canvas,(32,810),"하단 중심의 픽셀 연결  |  교통 관계와 구분",geometry)
            # Selected object crop and its actual feature values.
            out.text((688,810),"확대 차량의 관측값",font=font(26,True),fill=ink)
            box=selected["box"];cx,cy=(box[0]+box[2])/2,(box[1]+box[3])/2
            w,h=max(100,(box[2]-box[0])*1.8),max(80,(box[3]-box[1])*1.8)
            x,y=max(0,min(1920-w,cx-w/2)),max(0,min(600-h,cy-h/2))
            crop=raw.crop((int(x),int(y),int(x+w),int(y+h)))
            crop.thumbnail((202,195),Image.Resampling.LANCZOS)
            canvas.paste(crop,(688+(202-crop.width)//2,848+(195-crop.height)//2))
            depth_value=selected["depth"]
            value=f"{depth_value['value']:.2f} m*" if depth_value["input_mask"] and depth_value["units"]=="m" else "품질 조건으로 보류"
            values=[track_label(selected)+" · 동일 차량 정답 미검증",
                    "차로 소속: "+("영상 후보 채택" if lane_allowed(selected) else "판단 보류"),
                    "하단 중심: "+", ".join(f"{z:.1f}" for z in selected["anchor"])+" px",
                    "표면 깊이: "+value,
                    "가림: "+("하단점 박스 겹침" if selected["anchor_overlap_ids"] else "하단점 박스 겹침 없음")]
            for n,value in enumerate(values):out.text((910,850+n*36),value,font=font(21),fill=ink if n<2 else muted)
            # Graph nodes and arrows refer strictly to existing admitted source edges.
            out.rounded_rectangle((1344,96,1888,1043),radius=18,fill="#ffffff",outline=line,width=2)
            out.text((1370,119),"관측을 그래프로 연결",font=font(29,True),fill=ink)
            kind, edges = spatial_graph(frame,selected)
            positions={selected["id"]:(1616,220)}
            labels={selected["id"]:track_label(selected)+"\n현재 차량 관측"}
            if kind=="membership":
                corridor=edges[0]["object"];positions[corridor]=(1616,350);labels[corridor]="영상 차로 후보"
                names={"left_image_boundary_candidate":"왼쪽 차선\n경계", "right_image_boundary_candidate":"오른쪽 차선\n경계", "corridor_has_visible_road_support":"도로 지지"}
                for j,edge in enumerate(edges[1:]):positions[edge["object"]]=(1438+j*178,490);labels[edge["object"]]=names[edge["predicate"]]
            else:
                for j,edge in enumerate(edges):
                    positions[edge["object"]]=(1490+j*250 if len(edges)>1 else 1616,365)
                    labels[edge["object"]]="가시 도로\n근거" if edge["predicate"]=="visible_road_support_image_candidate" else "시설·가림\n근거"
            for edge in edges:
                a,b=positions[edge["subject"]],positions[edge["object"]]
                arrow(out,(a[0],a[1]+35),(b[0],b[1]-35))
            for nid,xy in positions.items():node(out,xy,labels[nid],width=238 if nid==selected["id"] or xy[1]==350 else 158,active=nid==selected["id"])
            out.text((1370,552),"소속 후보 채택" if kind=="membership" else "차로 소속 보류 · 관측은 유지",font=font(23,True),fill=teal if kind=="membership" else amber)
            out.text((1370,588),"시각·근거가 확인된 엣지만 표시",font=font(20),fill=muted)
            out.line((1370,628,1862,628),fill=line,width=2)
            out.text((1370,648),"과거 관측 참조  |  추적 가설",font=font(26,True),fill=ink)
            past, temporal_edges=temporal_graph(frame,selected)
            tp={n["id"]:(1438+i*(356/max(1,len(past)-1)),754) for i,n in enumerate(past)}
            for edge in temporal_edges:
                a,b=tp[edge["subject"]],tp[edge["object"]];arrow(out,(a[0]-73,a[1]),(b[0]+73,b[1]))
            for n in past:
                words="현재 관측" if n["id"]==selected["id"] else f"{(frame['timestamp_us']-n['timestamp_us'])/1e6:.3f}초 전"
                node(out,tp[n["id"]],words,width=146,active=n["id"]==selected["id"])
            out.text((1370,810),"실물 ID·차로 변경의 정답과 구분",font=font(20),fill=muted)
            out.line((1370,850,1862,850),fill=line,width=2)
            adopted=sum(lane_allowed(o) for o in frame["objects"])
            out.text((1370,875),f"차량 관측 {len(frame['objects'])}개  ·  소속 후보 {adopted}개",font=font(25,True),fill=ink)
            out.text((1370,919),f"소속 보류 {len(frame['objects'])-adopted}개  ·  자동 제외 0개",font=font(23),fill=muted)
            out.text((1370,967),"방향·물리 연결성: 미확정",font=font(23),fill=amber)
            out.text((1370,1006),"피처·관계·시간 → VLM 입력 · 학습 미실행",font=font(19),fill=muted)
            out.text((32,1052),"PREVENTION · YOLO26m + BoT-SORT / CLRerNet / Mask2Former / MetricAnything   |   10 fps 검수 재생 · 관측 경과 시간 별도 표기",font=font(20),fill=muted)
            if frame["source_frame"]==2123:canvas.save(poster,quality=94,subsampling=0)
            encoder.stdin.write(canvas.tobytes())
            stats["frames"]+=1;stats["RGB_bindings"]+=1;stats["observations"]+=len(frame["objects"])
            stats["lane_adopted"]+=adopted;stats["admitted_spatial_edges_shown"]+=len(edges);stats["temporal_edges_shown"]+=len(temporal_edges)
            if (index+1)%30==0:print(json.dumps({"rendered":index+1,"of":300}),flush=True)
        assert not cap.read()[0], "Unexpected extra RGB frame"
        encoder.stdin.close();error=encoder.stderr.read();assert encoder.wait()==0,error.decode(errors="replace")
        # Decode the actual encoded product and verify every presentation time.
        checked=subprocess.run([ffmpeg,"-hide_banner","-v","info","-threads","2","-i",str(output),
                                "-vf","showinfo","-an","-f","null","-"],capture_output=True,timeout=120)
        log=checked.stderr.decode(errors="replace")
        times=[(int(a),float(b)) for a,b in re.findall(r"\[Parsed_showinfo_[^\]]*\].*?\bn:\s*(\d+).*?\bpts_time:([-\d.e+]+)",log)]
        assert checked.returncode==0 and len(times)==300
        assert all(n==i and abs(t-i/10)<1e-5 for i,(n,t) in enumerate(times))
        assert "1920x1080" in log and "yuv420p" in log and "h264" in log
        assert json.loads(get("/api/sequence"))==sequence, "Source runtime changed during rendering"
        stats.update({"codec":"h264", "size":[1920,1080], "duration_s":30,
                      "decoded_PTS_verified":300,"poster_frame":2123,"automatic_exclusions":0,
                      "output":str(output),"poster":str(poster),"bytes":output.stat().st_size})
        print(json.dumps(stats),flush=True)
    finally:
        cap.release()
        if encoder.poll() is None:encoder.kill();encoder.wait()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ssh-target",required=True)
    parser.add_argument("--remote-python",required=True)
    parser.add_argument("--ssh-key",type=Path)
    parser.add_argument("--review-url",required=True)
    parser.add_argument("--sample-dir",required=True)
    parser.add_argument("--remote-output",required=True)
    parser.add_argument("--font",type=Path,required=True)
    parser.add_argument("--bold-font",type=Path,required=True)
    parser.add_argument("--output",type=Path,default=Path(__file__).parent/"assets/processed-techniques.mp4")
    args=parser.parse_args()
    ssh=["ssh","-T","-o","BatchMode=yes","-o","ConnectTimeout=10"]
    if args.ssh_key:ssh += ["-i",str(args.ssh_key),"-o","IdentitiesOnly=yes"]
    ssh.append(args.ssh_target)
    payload={"source":Path(__file__).read_text(encoding="utf-8"),
             "config":{k:getattr(args,k) for k in ("review_url","sample_dir","remote_output")},
             "fonts":[base64.b64encode(p.read_bytes()).decode() for p in (args.font,args.bold_font)]}
    entry="import json,sys,base64;p=json.load(sys.stdin);g={'__name__':'remote_renderer'};exec(p['source'],g);g['render_remote'](p['config'],[base64.b64decode(f) for f in p['fonts']])"
    command=ssh+[shlex.quote(args.remote_python)+" -B -c "+shlex.quote(entry)]
    subprocess.run(command,input=json.dumps(payload).encode(),check=True)
    for remote,local in [(args.remote_output,args.output),
                         (str(PurePosixPath(args.remote_output).with_suffix(".jpg")),args.output.with_suffix(".jpg"))]:
        read="import sys;from pathlib import Path;sys.stdout.buffer.write(Path("+repr(remote)+").read_bytes())"
        content=subprocess.run(ssh+[shlex.quote(args.remote_python)+" -B -c "+shlex.quote(read)],capture_output=True,check=True).stdout
        assert content
        local.write_bytes(content)
    print(json.dumps({"video":str(args.output),"poster":str(args.output.with_suffix('.jpg'))}))


if __name__=="__main__":
    main()
