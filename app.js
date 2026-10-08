(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const player = $("pipelinePlayer");
  const base = {clip:"R1D1",title:"차량·차로·시간 관계",video:"assets/processed-techniques.mp4",poster:"assets/processed-techniques.jpg",frames:300,duration_s:30,observations:1834};
  let clips = [base], selected = 0;
  function ensure(ok, text) { if(!ok) throw new Error(text); }
  function validate(data) {
    ensure(data.dataset==="PREVENTION" && data.processing_complete===true && data.render_fps===10, "Incomplete catalogue");
    ensure(data.physical_accuracy_verified===false && data.full_R1D1_main_executed===false && data.VLM_model_inference_executed===false, "Unsupported accuracy/scope");
    ensure(Array.isArray(data.clips) && data.clips.length===4, "Expected four additional drives");
    const expected = ["R2D1","R3D1","R4D1","R5D1"];
    data.clips.forEach((c,i) => {
      ensure(c.clip===expected[i] && typeof c.title==="string" && c.title.length>0, "Drive identity mismatch");
      ensure(c.video==="assets/drive-"+c.clip.toLowerCase()+".mp4" && c.poster==="assets/drive-"+c.clip.toLowerCase()+".jpg", "Unexpected media path");
      for(const key of ["frames","observations","lane_candidates","held","empty_detection_frames"]) ensure(Number.isInteger(c[key]) && c[key]>=0, "Invalid count");
      ensure(c.frames>0 && c.last_frame-c.first_frame+1===c.frames && c.duration_s===c.frames/10, "Media clock mismatch");
      ensure(c.RGB_bindings_checked===c.frames && c.depth_maps_computed===c.frames && c.encoded_PTS_checked===c.frames, "Incomplete frame processing");
      ensure(c.lane_candidates+c.held===c.observations && c.automatic_exclusions===0 && c.focal_projection_verified===false, "Admission/scope mismatch");
    });
    return data.clips;
  }
  function number(n) { return n.toLocaleString("ko-KR"); }
  function time(n) { return Number.isInteger(n)? n+"초" : n.toFixed(1)+"초"; }
  function cards() {
    $("videoCollection").replaceChildren();
    clips.forEach((c,i) => {
      const b=document.createElement("button"); b.className="clip-card"; b.type="button";
      b.setAttribute("aria-pressed",String(i===selected));
      b.setAttribute("aria-label",c.title+" 적용 영상 선택");
      const thumb=document.createElement("span");thumb.className="clip-thumb";
      const img=document.createElement("img");img.src=c.poster;img.alt=c.title+"의 실제 적용 결과";img.loading="lazy";img.width=1920;img.height=1080;
      const ix=document.createElement("span");ix.className="clip-index";ix.textContent=String(i+1).padStart(2,"0");
      const duration=document.createElement("span");duration.className="clip-duration";duration.textContent=time(c.duration_s);
      thumb.append(img,ix,duration);
      const text=document.createElement("span");text.className="clip-copy";
      const title=document.createElement("strong");title.textContent=c.title;
      const meta=document.createElement("small");meta.textContent=number(c.frames)+"프레임 · "+number(c.observations)+"개 관측";
      text.append(title,meta);b.append(thumb,text);
      b.addEventListener("click",()=>{select(i);$("pipelinePlayer").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});});$("videoCollection").append(b);
    });
    $("collectionCount").textContent="적용 영상 "+clips.length+"개";
    $("videoPosition").textContent=String(selected+1).padStart(2,"0")+" / "+String(clips.length).padStart(2,"0");
  }
  function select(index) {
    ensure(Number.isInteger(index) && index>=0 && index<clips.length,"Unknown clip");
    const same=index===selected;selected=index;const c=clips[index];
    player.pause();$("videoError").hidden=true;
    if(!same || !player.currentSrc.endsWith(c.video)) {
      player.poster=c.poster;player.src=c.video;player.load();
    }
    $("videoTitle").textContent=c.title;
    $("videoMeta").textContent=time(c.duration_s)+" · "+number(c.frames)+"프레임 · "+number(c.observations)+"개 차량 관측";
    $("videoPosition").textContent=String(index+1).padStart(2,"0")+" / "+String(clips.length).padStart(2,"0");
    $("videoDownload").href=c.video;
    player.setAttribute("aria-label",c.title+" — 차량·도로·차선·깊이·그래프 적용 영상");
    document.querySelectorAll(".clip-card").forEach((b,i)=>b.setAttribute("aria-pressed",String(i===index)));
  }
  player.addEventListener("error",()=>{
    $("videoError").textContent="영상을 불러오지 못했습니다. 다운로드 링크를 확인하거나 새로고침해 주세요.";
    $("videoError").hidden=false;
  });
  window.addEventListener("hashchange",()=>{
    if(["#featureRationale","#temporalGraphBuild","#viewer","#diverseVideoValidation","#laneValidation"].includes(location.hash)) $("pipelineVideo").scrollIntoView();
  });
  cards();
  fetch("other-drives.json",{cache:"no-cache"}).then(r=>{ensure(r.ok,"Catalogue unavailable");return r.json();}).then(data=>{
    clips=[base,...validate(data)];cards();select(0);
  }).catch(error=>{
    $("collectionError").hidden=false;$("collectionError").textContent="추가 영상 목록을 불러오지 못했습니다. 기존 적용 영상은 재생할 수 있습니다.";
    console.error(error);
  });
})();
