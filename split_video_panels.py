"""Export four aligned videos per drive: original, perception, depth and KG.

Existing results are reused; this changes presentation only. Original RGB frames
come from the same cached/NAS camera windows. Encoding, validation and temporary
media stay in RAM. Only requested MP4s, website posters/catalogue and Desktop
copies are saved. No model inference or graph decision is changed.
"""
from __future__ import annotations
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path
import shlex
import subprocess
from PIL import Image

PANELS = (
    ("original", "원본", "01_원본"),
    ("perception", "차량·도로·차선", "02_차량_도로_차선"),
    ("depth", "Depth", "03_Depth"),
    ("graph", "관계·Temporal KG", "04_관계_Temporal_KG"),
)

def filter_for(panel, original):
    y = 612 if original else 613
    gy = 848 if original else 849
    if panel == "perception":
        return "format=rgb24,crop=1280:400:32:134:exact=1,format=yuv420p", False
    if panel == "depth":
        return f"format=rgb24,crop=624:195:688:{y}:exact=1,pad=624:196:0:0:color=0xf7f8f6,format=yuv420p", False
    assert panel == "graph"
    return (
        "format=rgb24,split=5[a][b][c][d][e];"
        "[a]crop=1280:400:32:134:exact=1,scale=736:230:flags=lanczos[drive];"
        "[b]crop=1280:38:32:96:exact=1,scale=736:22:flags=lanczos[title];"
        f"[c]crop=624:195:32:{gy}:exact=1,scale=736:230:flags=lanczos[lines];"
        "[d]crop=624:38:32:810:exact=1,scale=736:44:flags=lanczos[line_title];"
        "[e]crop=544:752:1344:96:exact=1,pad=1280:752:736:0:color=0xf7f8f6[canvas];"
        "[canvas][title]overlay=0:10[v1];[v1][drive]overlay=0:42[v2];"
        "[v2][line_title]overlay=0:340[v3];[v3][lines]overlay=0:392,format=yuv420p[out]"
    ), True

def poster_for(panel, source, original):
    if panel == "perception":
        return source.crop((32,134,1312,534)).convert("RGB")
    if panel == "depth":
        y=612 if original else 613
        image=Image.new("RGB",(624,196),"#f7f8f6")
        image.paste(source.crop((688,y,1312,y+195)),(0,0))
        return image
    assert panel == "graph"
    image=Image.new("RGB",(1280,752),"#f7f8f6")
    image.paste(source.crop((1344,96,1888,848)),(736,0))
    image.paste(source.crop((32,96,1312,134)).resize((736,22),Image.Resampling.LANCZOS),(0,10))
    image.paste(source.crop((32,134,1312,534)).resize((736,230),Image.Resampling.LANCZOS),(0,42))
    image.paste(source.crop((32,810,656,848)).resize((736,44),Image.Resampling.LANCZOS),(0,340))
    gy=848 if original else 849
    image.paste(source.crop((32,gy,656,gy+195)).resize((736,230),Image.Resampling.LANCZOS),(0,392))
    return image

def remote_export(cfg):
    import math
    import os
    import re
    import sys
    import imageio_ffmpeg
    source = Path("/home/min_hs/VLA/prevention_pilot/data") / cfg["relative"]
    assert hashlib.sha256(source.read_bytes()).hexdigest()==cfg["source_sha256"]
    ff=imageio_ffmpeg.get_ffmpeg_exe()
    # A seekable anonymous RAM file allows a normal fast-start MP4, rather
    # than fragmented output with browser-specific timeline offsets/indexing.
    fd=os.memfd_create("vla-panel",flags=0)
    memory_output=f"/proc/self/fd/{fd}"
    sample_mae=None
    raw_poster=None
    if cfg["panel"]=="original":
        import cv2
        import numpy as np
        if cfg["clip"]=="R1D1":
            url=str(Path("/home/min_hs/VLA/prevention_pilot/data/R1D1_f001950_f002249/video_camera1.mkv"))
            start=0
        else:
            endpoint=json.loads((Path.home()/"prevention_tools/access.json").read_text())["endpoint"]
            url=endpoint+"/video/"+cfg["clip"]
            start=cfg["first_frame"]
        cap=cv2.VideoCapture(url)
        assert cap.isOpened()
        assert int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))==1920 and int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))==600
        assert cap.set(cv2.CAP_PROP_POS_FRAMES,start)
        command=[ff,"-hide_banner","-v","error","-f","rawvideo","-pix_fmt","rgb24","-s","1920x600","-r","10","-i","pipe:0",
                 "-an","-c:v","libx264","-threads","4","-preset","fast","-crf","18","-bf","0","-pix_fmt","yuv420p",
                 "-y","-movflags","+faststart","-f","mp4",memory_output]
        encoder=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,pass_fds=(fd,))
        samples={}
        with ThreadPoolExecutor(max_workers=2) as pool:
            output=pool.submit(encoder.stdout.read)
            errors=pool.submit(encoder.stderr.read)
            try:
                for step in range(cfg["frames"]):
                    assert int(round(cap.get(cv2.CAP_PROP_POS_FRAMES)))==start+step
                    ok,bgr=cap.read()
                    assert ok and bgr.shape==(600,1920,3)
                    assert int(round(cap.get(cv2.CAP_PROP_POS_FRAMES)))==start+step+1
                    rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
                    if step in (0,cfg["frames"]//2,cfg["frames"]-1):
                        samples[step]=rgb.copy()
                    encoder.stdin.write(rgb.tobytes())
                encoder.stdin.close()
                output.result(timeout=120)
                failure=errors.result(timeout=120)
                assert encoder.wait()==0,failure.decode(errors="replace")
                os.lseek(fd,0,os.SEEK_SET)
                encoded=os.read(fd,os.fstat(fd).st_size)
            finally:
                cap.release()
                if encoder.poll() is None:
                    encoder.kill();encoder.wait()
        selection="+".join(f"eq(n\\,{i})" for i in sorted(samples))
        decoded=subprocess.run([ff,"-v","error","-threads","2","-i","pipe:0","-vf","select="+selection,
                                "-vsync","0","-f","rawvideo","-pix_fmt","rgb24","pipe:1"],
                               input=encoded,capture_output=True,check=True).stdout
        pixels=np.frombuffer(decoded,dtype=np.uint8).reshape((3,600,1920,3))
        sample_mae=max(float(np.abs(p.astype(np.float32)-samples[i]).mean()) for p,i in zip(pixels,sorted(samples)))
        assert sample_mae<12, "Original encoded RGB does not match source frames"
        buf=io.BytesIO()
        Image.fromarray(samples[cfg["frames"]//2]).save(buf,"JPEG",quality=93,subsampling=0)
        raw_poster=base64.b64encode(buf.getvalue()).decode()
        width,height=1920,600
        ssim=None
    else:
        vf,complex_filter=filter_for(cfg["panel"],cfg["clip"]=="R1D1")
        filtering=["-filter_complex",vf,"-map","[out]"] if complex_filter else ["-vf",vf,"-map","0:v:0"]
        subprocess.run([ff,"-hide_banner","-v","error","-threads","2","-i",str(source),*filtering,
                   "-an","-c:v","libx264","-threads","4","-preset","fast","-crf","18","-bf","0","-pix_fmt","yuv420p",
                   "-y","-movflags","+faststart","-f","mp4",memory_output],pass_fds=(fd,),capture_output=True,check=True)
        os.lseek(fd,0,os.SEEK_SET)
        encoded=os.read(fd,os.fstat(fd).st_size)
        width,height={"perception":(1280,400),"depth":(624,196),"graph":(1280,752)}[cfg["panel"]]
        reference=("[0:v]"+vf.replace("[out]","[ref]")+";[ref][1:v]ssim" if complex_filter
                   else "[0:v]"+vf+"[ref];[ref][1:v]ssim")
        comparison=subprocess.run([ff,"-hide_banner","-v","info","-threads","2","-i",str(source),
                   "-threads","2","-i","pipe:0","-filter_complex",reference,"-an","-f","null","-"],
                   input=encoded,capture_output=True,check=True)
        values=re.findall(r"SSIM .*?All:([\d.]+)",comparison.stderr.decode(errors="replace"))
        assert values and float(values[-1])>=.97,"Extracted content mismatch"
        ssim=float(values[-1])
    os.close(fd)
    check=subprocess.run([ff,"-hide_banner","-v","info","-copyts","-threads","2","-i","pipe:0",
                          "-vf","showinfo","-an","-f","null","-"],input=encoded,capture_output=True,check=True)
    log=check.stderr.decode(errors="replace")
    times=[(int(a),float(b)) for a,b in re.findall(r"\[Parsed_showinfo_[^\]]*\].*?\bn:\s*(\d+).*?\bpts_time:([-\d.e+]+)",log)]
    assert len(times)==cfg["frames"]
    assert all(n==i and math.isclose(t,i/10,abs_tol=1e-5) for i,(n,t) in enumerate(times))
    assert f"{width}x{height}" in log and "h264" in log and "yuv420p" in log
    assert hashlib.sha256(source.read_bytes()).hexdigest()==cfg["source_sha256"]
    print(json.dumps({"sha256":hashlib.sha256(encoded).hexdigest(),"frames":len(times),
                      "width":width,"height":height,"ssim":ssim,"original_sample_mae":sample_mae,
                      "poster":raw_poster,"bytes":len(encoded)}),file=sys.stderr)
    sys.stdout.buffer.write(encoded)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ssh-target",default="min_hs@166.104.207.39")
    parser.add_argument("--ssh-key",type=Path,required=True)
    parser.add_argument("--remote-python",default="/home/min_hs/VLA/prevention_pilot/.venv-yolo26/bin/python")
    parser.add_argument("--desktop-root",type=Path)
    args=parser.parse_args()
    root=Path(__file__).resolve().parent
    other=json.loads((root/"other-drives.json").read_text(encoding="utf-8"))
    assert other["processing_complete"] and other["physical_accuracy_verified"] is False
    clips=[{"clip":"R1D1","title":"차량·차로·시간 관계","frames":300,"first_frame":1950,
            "observations":1834,"duration_s":30,"video":"assets/processed-techniques.mp4",
            "poster":"assets/processed-techniques.jpg"},*other["clips"]]
    assert [c["clip"] for c in clips]==[f"R{i}D1" for i in range(1,6)]
    output=root/"assets"/"panels"
    output.mkdir(exist_ok=True)
    catalogue={"dataset":"PREVENTION","render_fps":10,"export_complete":False,
               "source":"native_original_and_existing_review_panels","new_inference":False,
               "physical_accuracy_verified":False,
               "panels":[{"id":p,"title":t} for p,t,_ in PANELS],"clips":[]}
    ssh=["ssh","-T","-o","BatchMode=yes","-o","ConnectTimeout=10","-i",str(args.ssh_key),
         "-o","IdentitiesOnly=yes",args.ssh_target]
    source_code=Path(__file__).read_text(encoding="utf-8")
    entry="import json,sys;p=json.load(sys.stdin);g={'__name__':'panel_export'};exec(p['source'],g);g['remote_export'](p['config'])"
    for ci,clip in enumerate(clips):
        source_path=root/clip["video"]
        relative=("R1D1_f001950_f002249/yolo26m_vehicle/processed-techniques.mp4" if ci==0
                  else "multi_drive_video/"+source_path.name)
        source_sha=hashlib.sha256(source_path.read_bytes()).hexdigest()
        media={}
        for panel,_,folder in PANELS:
            config={"relative":relative,"source_sha256":source_sha,"panel":panel,"clip":clip["clip"],
                    "first_frame":clip["first_frame"],"frames":clip["frames"]}
            result=subprocess.run(ssh+[shlex.quote(args.remote_python)+" -B -c "+shlex.quote(entry)],
                    input=json.dumps({"source":source_code,"config":config}).encode(),
                    capture_output=True,check=True,timeout=240)
            meta=json.loads(result.stderr.decode().strip().splitlines()[-1])
            assert len(result.stdout)==meta["bytes"] and hashlib.sha256(result.stdout).hexdigest()==meta["sha256"]
            target=output/(clip["clip"].lower()+"-"+panel+".mp4")
            target.write_bytes(result.stdout)
            assert hashlib.sha256(target.read_bytes()).hexdigest()==meta["sha256"]
            if args.desktop_root:
                directory=args.desktop_root/(f"{ci+1:02d}_"+clip["clip"])
                directory.mkdir(parents=True,exist_ok=True)
                copy=directory/(folder+".mp4")
                copy.write_bytes(result.stdout)
                assert hashlib.sha256(copy.read_bytes()).hexdigest()==meta["sha256"]
            if panel=="original":
                image=Image.open(io.BytesIO(base64.b64decode(meta["poster"]))).convert("RGB")
            else:
                with Image.open(root/clip["poster"]) as image_source:
                    assert image_source.size==(1920,1080)
                    image=poster_for(panel,image_source,ci==0)
            assert image.size==(meta["width"],meta["height"])
            image.save(target.with_suffix(".jpg"),quality=93,subsampling=0)
            media[panel]={"video":"assets/panels/"+target.name,"poster":"assets/panels/"+target.with_suffix(".jpg").name,
                          "width":meta["width"],"height":meta["height"],"verified_frames":meta["frames"],
                          "ssim_to_rendered_reference":meta["ssim"],"original_sample_mae":meta["original_sample_mae"]}
            print(json.dumps({"clip":clip["clip"],"panel":panel,"frames":meta["frames"],
                              "size":[meta["width"],meta["height"]],"ssim":meta["ssim"],
                              "original_sample_mae":meta["original_sample_mae"]}),flush=True)
        catalogue["clips"].append({k:clip[k] for k in ("clip","title","frames","duration_s","observations")}|{"media":media})
    catalogue["export_complete"]=True
    (root/"video-panels.json").write_text(json.dumps(catalogue,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Verified 20 videos: four views per scene, including original RGB.",flush=True)

if __name__=="__main__":
    main()

