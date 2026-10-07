"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const titles = ["원본과 탐지를 비교", "도로 지지와 겹침", "가려진 관측 보존", "차로 후보 연결", "시설 분리와 차로", "이전 장면과 연결"];
  const ns = "http://www.w3.org/2000/svg";
  let data, frame, vehicle, stage = "lane";
  const text = (tag, value, cls) => {const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
  const svg = (tag, attrs) => {const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  const isAdmitted = e => e.input_eligible === true;
  const stamp = value => (Number(value)/1e6).toFixed(6)+" s";
  const number = value => Number.isFinite(value)?Number(value).toFixed(1):"미확정";
  const node = (value, held=false) => text("div",value,"graph-node"+(held?" held":""));
  const arrow = value => text("div","↓ "+value,"graph-arrow");
  const objectLabel = obj => "차량 "+(frame.objects.findIndex(o=>o.id===obj.id)+1);

  function selectFrame(next) {
    frame=next;
    vehicle=frame.objects.find(o=>o.lane_allowed)||frame.objects[0];
    $("sceneImage").src="assets/frames/"+frame.source_frame+".jpg";
    $("roadMask").src="assets/frames/"+frame.source_frame+"-road.png";
    $("vehicleSelect").replaceChildren(...frame.objects.map((o,i)=>{const e=text("option","차량 "+(i+1)+(o.lane_allowed?" · 차로 후보":" · 소속 보류"));e.value=o.id;return e;}));
    $("vehicleSelect").value=vehicle.id;
    document.querySelectorAll("#sceneButtons button").forEach((button,i)=>button.setAttribute("aria-pressed",String(data.frames[i]===frame)));
    $("sceneTime").textContent="첫 관측부터 "+frame.capture_elapsed_s.toFixed(2)+"초 경과";
    const video=$("reviewVideo");video.pause();video.currentTime=frame.video_time_s;
    render();
  }

  function renderOverlay() {
    const root=$("sceneOverlay");root.replaceChildren();
    const raw=$("rawOnly").checked;root.hidden=raw;$("roadMask").hidden=raw||stage!=="road";
    if(stage!=="road"){
      for(const corridor of frame.corridors){
        root.append(svg("polygon",{points:corridor.polygon_xy.map(p=>p.join(",")).join(" "),fill:corridor.status==="candidate"?"#23ac8b":"#a0a8ad",opacity:.13}));
      }
      for(const boundary of frame.boundaries)for(const component of boundary.components){
        root.append(svg("polyline",{points:component.map(p=>p.join(",")).join(" "),fill:"none",stroke:"#ffe064","stroke-width":4}));
      }
    }
    for(const [i,obj] of frame.objects.entries()){
      const [x1,y1,x2,y2]=obj.box;const selected=obj.id===vehicle.id;
      const g=svg("g",{});const color=selected?"#4df3eb":obj.lane_allowed?"#76edb4":"#ffbe70";
      g.append(svg("rect",{x:x1,y:y1,width:x2-x1,height:y2-y1,fill:"transparent",stroke:color,"stroke-width":selected?6:3}));
      const label=svg("text",{x:x1,y:Math.max(18,y1-7),fill:color,"font-size":22,"font-weight":700,stroke:"#173141","stroke-width":1,"paint-order":"stroke"});label.textContent=i+1;g.append(label);
      g.append(svg("circle",{cx:obj.anchor[0],cy:obj.anchor[1],r:selected?8:5,fill:color}));
      root.append(g);
    }
    // The ego image reference is NOT a physical ground point or an interaction edge.
  }

  function renderGraph() {
    const root=$("graph");root.replaceChildren();
    const assignment=frame.assignments.find(a=>a.observation_id===vehicle.id);
    const allEdges=frame.edges.filter(isAdmitted);
    const membership=allEdges.filter(e=>e.subject===vehicle.id&&e.object===assignment?.scene_corridor_candidate_id);
    let shown=[];
    if(stage==="temporal"){
      $("graphTitle").textContent="같은 차량으로 추적된 기록";
      const observations=frame.nodes.filter(n=>n.type==="VehicleObservation"&&(n.current_observation_id===vehicle.id||n.id===vehicle.id)).sort((a,b)=>a.timestamp_us-b.timestamp_us);
      const ids=new Set(observations.map(n=>n.id));
      shown=allEdges.filter(e=>ids.has(e.subject)&&ids.has(e.object)&&e.predicate==="previous_observed_track_hypothesis");
      const chain=text("div","","time-chain");
      for(let i=0;i<observations.length;i++){
        const n=observations[i];
        if(i){const e=shown.find(e=>e.subject===n.id&&e.object===observations[i-1].id);chain.append(arrow(e?"추적 연결 지지":"연결 보류"));}
        const seconds=(frame.timestamp_us-n.timestamp_us)/1e6;
        chain.append(node((seconds===0?"현재 관측":seconds.toFixed(3)+"초 전 관측")+" · 차량 위치 기록"));
      }
      root.append(chain,text("p","같은 추적 결과라는 뜻이며, 같은 실제 차량이나 차로 변경이 확인됐다는 뜻은 아니다."));
    }else if(stage==="road"){
      $("graphTitle").textContent="차량 주변의 도로 근거";
      shown=allEdges.filter(e=>e.subject===vehicle.id&&["visible_road_support_image_candidate","has_structure_visibility_evidence"].includes(e.predicate));
      const roadSupported=shown.some(e=>e.predicate==="visible_road_support_image_candidate");
      root.append(node(objectLabel(vehicle)+" · 관측 보존"),arrow("하단 주변 픽셀과 시설을 확인"),node(roadSupported?"채택된 영상 도로 지지":"도로 지지 연결 보류",!roadSupported));
      root.append(text("p","마스크가 분리돼 보여도 실제 도로가 완전히 차단됐다고 단정하지 않는다."));
    }else{
      $("graphTitle").textContent="차량이 들어가는 차로와 근거";
      shown=membership;
      root.append(node(objectLabel(vehicle)+" · 관측 보존"));
      if(vehicle.lane_allowed&&membership.length){
        root.append(arrow("채택된 영상 소속 관계"),node("차량이 들어가는 영상 차로 후보"));
        const corridorId=assignment.scene_corridor_candidate_id;
        const support=allEdges.filter(e=>e.subject===corridorId);
        shown=shown.concat(support);
        const evidence=text("div","","graph-evidence");
        evidence.append(text("div","좌우 차선 경계"),text("div","도로 영역 지지"));root.append(arrow("판단에 사용한 근거"),evidence);
      }else{
        root.append(arrow("차량은 유지"),node("차로 소속 연결은 보류",true));
      }
      root.append(text("p","자차와 같은 실제 차로인지와 직접 선행차 관계는 별도 검증이 필요하다."));
    }
    const evidence=$("evidence");evidence.replaceChildren();
    evidence.append(text("p","선택 장면: 원 프레임 "+frame.source_frame+" · 촬영 시각 "+stamp(frame.timestamp_us)+" · 판단에 사용 가능한 시각 "+stamp(frame.known_at_timestamp_us)+" · 전방 카메라 · 1920×600 px"));
    if(!shown.length)evidence.append(text("p","이 요약에 표시할 채택 연결이 없거나 보류됐다. 원본 차량 관측은 유지한다."));
    for(const edge of shown){
      evidence.append(text("p",edge.predicate+" · 원 관측 프레임 "+edge.source_frame+" · 사용 가능 시각 "+stamp(edge.known_at_timestamp_us)+" · 근거 "+(edge.evidence_refs?.length||0)+"개 · 영상 근거/추적 가설"));
    }
  }

  function render() {
    renderOverlay();renderGraph();
    const label=objectLabel(vehicle);
    $("decision").textContent=vehicle.lane_allowed?label+"은 차선과 도로 영역의 조건을 통과한 영상 차로 후보에 연결된다. 실제 자차와 같은 차로인지는 아직 확정하지 않는다.":label+"은 관측에 남겨 두되, 차선 경계·가림·도로 지지가 충분하지 않아 차로 연결을 보류한다.";
    const facts=$("vehicleFacts");facts.replaceChildren();
    const depth=vehicle.depth;
    const values=[
      ["아래쪽 중앙 위치",vehicle.anchor.map(number).join(", ")+" px · 접지점 아님"],
      ["탐지 점수",vehicle.score.toFixed(3)+" · 실물 정답 확률 아님"],
      ["하단 주변 도로 픽셀",(vehicle.road.road_fraction*100).toFixed(1)+"% · 분류된 픽셀 비율"],
      ["가림 단서",vehicle.anchor_overlap_ids.length?"다른 차량 박스와 하단점이 겹침":"하단점의 박스 겹침 없음 · 실제 가림 정답 미확정"],
      ["표면 깊이",depth.input_mask&&Number.isFinite(depth.value)?depth.value.toFixed(2)+" m · 미검증 모델 표면 깊이":"품질 조건으로 사용 보류"],
      ["실제 차로·방향·범퍼 거리","미검증 · 추정값을 확정값으로 사용하지 않음"]
    ];
    for(const [name,value] of values)facts.append(text("dt",name),text("dd",value));
  }

  async function init(){
    try{
      const response=await fetch("scene-data.json");if(!response.ok)throw Error("scene data unavailable");data=await response.json();
      if(data.dataset!=="PREVENTION"||data.frames.length!==6||data.physical_accuracy_verified!==false)throw Error("public scope mismatch");
      for(const [i,f] of data.frames.entries()){
        const button=document.createElement("button");button.type="button";button.setAttribute("aria-pressed","false");
        const image=document.createElement("img");image.src="assets/frames/"+f.source_frame+".jpg";image.alt=titles[i]+"의 원본 장면";image.loading="lazy";
        button.append(image,text("strong",titles[i]),text("span","관측 "+f.objects.length+"개 · "+f.capture_elapsed_s.toFixed(2)+"초 경과"));button.addEventListener("click",()=>selectFrame(f));$("sceneButtons").append(button);
      }
      $("vehicleSelect").addEventListener("change",()=>{vehicle=frame.objects.find(o=>o.id===$("vehicleSelect").value);render();});
      $("rawOnly").addEventListener("change",renderOverlay);
      for(const button of document.querySelectorAll("[data-stage]"))button.addEventListener("click",()=>{stage=button.dataset.stage;document.querySelectorAll("[data-stage]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));render();});
      $("reviewVideo").addEventListener("play",()=>{$("videoState").textContent="영상 재생 중 · 위의 그래프는 선택한 대표 장면에 고정된다. 다른 재생 시점의 계산으로 해석하지 않는다.";});
      $("reviewVideo").addEventListener("pause",()=>{$("videoState").textContent="선택 그래프의 영상 위치: "+frame.video_time_s.toFixed(1)+"초 · 현재 재생 위치: "+$("reviewVideo").currentTime.toFixed(1)+"초. 대표 장면을 선택하면 같은 위치로 이동한다.";});
      selectFrame(data.frames.find(f=>f.source_frame===2123));
    }catch(error){$("decision").textContent="대표 장면을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.";$("decision").className="demo-error";console.error(error);}
  }
  init();
})();
