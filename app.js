(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const player = $("pipelinePlayer");
  const descriptions = {
    original: "같은 장면의 원본 영상입니다. 인식 결과와 그래프를 비교할 때 사용합니다.",
    perception: "차량 박스·추적 ID·차선 경계·도로와 시설 마스크를 함께 봅니다. 실제 차로 소속은 검증이 더 필요합니다.",
    depth: "MetricAnything가 추정한 가시 표면 깊이입니다. 검증된 범퍼 간 거리와 다릅니다.",
    graph: "차량 연결선·차로 소속 후보·과거와 현재 관측을 함께 봅니다. 연결선은 픽셀 기하 참조이며 그래프는 검증된 물리 관계와 구분합니다."
  };
  const shapes = {original:[1920,600], perception:[1280,400], depth:[624,196], graph:[1280,752]};
  let clips = [], panels = [], selected = 0, mode = "original", pending = null;
  function ensure(ok, text) { if (!ok) throw new Error(text); }
  function validate(data) {
    ensure(data.dataset === "PREVENTION" && data.export_complete === true && data.render_fps === 10, "Incomplete panel export");
    ensure(data.source === "native_original_and_existing_review_panels" && data.new_inference === false && data.physical_accuracy_verified === false, "Unsupported scope");
    ensure(Array.isArray(data.panels) && data.panels.length === 4 && Array.isArray(data.clips) && data.clips.length === 5, "Expected four views of five scenes");
    data.panels.forEach((p,i) => ensure(p.id === Object.keys(descriptions)[i] && typeof p.title === "string" && p.title.length > 0, "Unknown view"));
    data.clips.forEach((c,i) => {
      ensure(c.clip === "R"+(i+1)+"D1" && typeof c.title === "string" && c.title.length > 0, "Scene mismatch");
      ensure(c.frames === (i === 0 ? 300 : 48) && c.duration_s === c.frames/10 && Number.isInteger(c.observations) && c.observations >= 0, "Media clock/count mismatch");
      ensure(c.media && Object.keys(c.media).length === 4, "Incomplete scene views");
      for (const p of data.panels) {
        const m = c.media[p.id], stem = "assets/panels/"+c.clip.toLowerCase()+"-"+p.id;
        ensure(m && m.video === stem+".mp4" && m.poster === stem+".jpg", "Unexpected media path");
        ensure(m.width === shapes[p.id][0] && m.height === shapes[p.id][1] && m.verified_frames === c.frames, "Unverified dimensions/frames");
        if (p.id === "original") ensure(Number.isFinite(m.original_sample_mae) && m.original_sample_mae < 12, "Unverified original RGB");
        else ensure(Number.isFinite(m.ssim_to_rendered_reference) && m.ssim_to_rendered_reference >= .97, "Unverified rendered content");
      }
    });
    return data;
  }
  const number = n => n.toLocaleString("ko-KR");
  const time = n => Number.isInteger(n) ? n+"초" : n.toFixed(1)+"초";
  const active = () => clips[selected]?.media[mode];
  function error(text) { $("videoError").textContent = text; $("videoError").hidden = false; }
  function framePosition() {
    if (!clips.length) return;
    const c = clips[selected], t = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const f = Math.min(c.frames, Math.max(1, Math.floor(t*10 + 1e-5) + 1));
    $("framePosition").textContent = "검수 재생 "+t.toFixed(1)+"초 · "+f+" / "+c.frames+"프레임";
    $("previousFrame").disabled = f <= 1 || player.readyState < 1;
    $("nextFrame").disabled = f >= c.frames || player.readyState < 1;
  }
  function cards() {
    $("videoCollection").replaceChildren();
    clips.forEach((c,i) => {
      const m = c.media[mode], b = document.createElement("button");
      b.className = "clip-card"; b.type = "button";
      b.setAttribute("aria-pressed", String(i === selected));
      b.setAttribute("aria-label", c.title+" 장면 선택");
      const thumb = document.createElement("span"); thumb.className = "clip-thumb";
      const img = document.createElement("img");
      img.src = m.poster; img.alt = c.title+" · "+panels.find(p=>p.id===mode).title;
      img.loading = "lazy"; img.width = m.width; img.height = m.height;
      const ix = document.createElement("span"); ix.className = "clip-index"; ix.textContent = String(i+1).padStart(2,"0");
      const duration = document.createElement("span"); duration.className = "clip-duration"; duration.textContent = time(c.duration_s);
      thumb.append(img,ix,duration);
      const text = document.createElement("span"); text.className = "clip-copy";
      const title = document.createElement("strong"); title.textContent = c.title;
      const meta = document.createElement("small"); meta.textContent = number(c.frames)+"프레임 · "+number(c.observations)+"개 관측";
      text.append(title,meta); b.append(thumb,text);
      b.addEventListener("click", () => select(i,mode));
      $("videoCollection").append(b);
    });
  }
  function selectors() {
    $("panelSelector").replaceChildren();
    panels.forEach((p,i) => {
      const b = document.createElement("button"); b.type = "button"; b.dataset.panel = p.id;
      b.setAttribute("aria-pressed",String(p.id===mode)); b.setAttribute("aria-controls","pipelinePlayer");
      const ix = document.createElement("span"); ix.textContent = String(i+1).padStart(2,"0");
      b.append(ix,document.createTextNode(p.title));
      b.addEventListener("click",()=>select(selected,p.id,true)); $("panelSelector").append(b);
    });
  }
  function select(index, panel, preserve = false) {
    ensure(Number.isInteger(index) && index >= 0 && index < clips.length && Object.hasOwn(descriptions,panel), "Unknown scene/view");
    const sameScene = index === selected;
    const seek = preserve && sameScene && Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const resume = preserve && sameScene && !player.paused;
    player.pause(); selected = index; mode = panel;
    const c = clips[index], m = active(), p = panels.find(p=>p.id===panel);
    $("videoError").hidden = true;
    $("playerSection").dataset.panel = mode;
    $("panelDescription").textContent = descriptions[mode];
    $("videoTitle").textContent = c.title+" · "+p.title;
    $("videoMeta").textContent = time(c.duration_s)+" · "+number(c.frames)+"프레임 · "+number(c.observations)+"개 차량 관측";
    $("videoPosition").textContent = "장면 "+String(index+1).padStart(2,"0")+" / 05";
    $("videoResolution").textContent = p.title+" · "+m.width+" × "+m.height;
    $("videoDownload").href = m.video; $("videoDownload").download = c.clip+"-"+mode+".mp4";
    player.setAttribute("aria-label",c.title+" — "+p.title);
    player.style.setProperty("--media-ratio",m.width+" / "+m.height);
    pending = {url:new URL(m.video,location.href).href, time:Math.min(seek,(c.frames-1)/10), resume};
    player.poster = m.poster; player.src = m.video; player.load();
    selectors(); cards(); framePosition();
    const url = new URL(location.href); url.searchParams.set("scene",c.clip); url.searchParams.set("panel",mode);
    history.replaceState(null,"",url);
  }
  player.addEventListener("loadedmetadata", () => {
    const m = active(), c = clips[selected];
    if (!m || !pending || player.currentSrc !== pending.url) return;
    if (player.videoWidth !== m.width || player.videoHeight !== m.height || !Number.isFinite(player.duration) || Math.abs(player.duration-c.duration_s)>.11) {
      error("영상 크기 또는 재생 길이가 목록과 다릅니다. 이 영상의 동기화 상태를 확인해야 합니다."); return;
    }
    const request = pending; pending = null;
    player.currentTime = request.time; framePosition();
    if (request.resume) player.play().catch(()=>{});
  });
  for (const event of ["timeupdate","seeked","loadeddata"]) player.addEventListener(event,framePosition);
  player.addEventListener("error",()=>error("영상을 불러오지 못했습니다. 다운로드 링크를 확인하거나 새로고침해 주세요."));
  function step(delta) {
    if (!clips.length || player.readyState < 1) return;
    player.pause();
    const frame = Math.floor(player.currentTime*10+1e-5);
    player.currentTime = Math.max(0,Math.min(clips[selected].frames-1,frame+delta))/10;
  }
  $("previousFrame").addEventListener("click",()=>step(-1));
  $("nextFrame").addEventListener("click",()=>step(1));
  fetch("video-panels.json",{cache:"no-cache"}).then(r=>{ensure(r.ok,"Catalogue unavailable");return r.json();}).then(validate).then(data=>{
    clips = data.clips; panels = data.panels;
    const query = new URLSearchParams(location.search), scene = clips.findIndex(c=>c.clip===query.get("scene"));
    select(scene < 0 ? 0 : scene, Object.hasOwn(descriptions,query.get("panel")) ? query.get("panel") : "original");
  }).catch(e=>{
    $("collectionError").hidden = false;
    $("collectionError").textContent = "결과별 영상 목록을 불러오지 못했습니다. 기본 주행 영상은 다운로드할 수 있습니다.";
    console.error(e);
  });
})();

