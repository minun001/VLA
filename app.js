"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const ns = "http://www.w3.org/2000/svg";
  const titles = ["분리대 주변", "도로 합류부", "차량 간 가림", "차로 소속 후보", "도로·시설 경계", "연속 관측"];
  const stages = {
    road:{label:"도로 구조",caption:"도로·분리대·시설로 분류된 픽셀과 차량 주변의 지지 영역입니다.",legend:[["#4e9c83","도로"],["#bf9064","시설"]]},
    lane:{label:"차선·차로 후보",caption:"검출된 좌우 차선과 도로 지지로 영상 차로 후보를 구성합니다.",legend:[["#ffe064","검출 차선"],["#4fc6a1","차로 후보"]]},
    vehicle:{label:"차량과 차로",caption:"차량 하단 주변과 경계 조건을 통과한 소속 관계만 표시합니다.",legend:[["#59e8e0","선택 차량"],["#8ae1b2","소속 후보"],["#ffbe70","소속 보류"]]},
    temporal:{label:"시간 연결",caption:"선택한 차량의 과거 관측을 현재 시점까지 연결합니다.",legend:[["#59e8e0","현재 관측"],["#b7d5cf","추적 가설"]]}
  };
  const relationNames = {
    visible_road_support_image_candidate:"하단 주변의 도로 지지",
    has_structure_visibility_evidence:"시설과의 겹침·가림 근거",
    left_image_boundary_candidate:"왼쪽 차선 경계",
    right_image_boundary_candidate:"오른쪽 차선 경계",
    corridor_has_visible_road_support:"차로 영역의 도로 지지",
    vehicle_in_image_corridor_candidate:"영상 차로 후보 소속",
    previous_observed_track_hypothesis:"이전 관측과의 추적 연결"
  };
  let data, frame, vehicle, stage="vehicle", imageReady=false, selectToken=0, pendingVideoTime=null;
  const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
  const svg=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  const number=v=>Number.isFinite(v)?Number(v).toFixed(1):"미확정";
  const ensure=(ok,message)=>{if(!ok)throw Error(message);};
  const admitted=e=>e.input_eligible===true;
  const objectLabel=o=>"차량 "+(frame.objects.findIndex(x=>x.id===o.id)+1);

  function validate(payload){
    ensure(payload.dataset==="PREVENTION"&&payload.physical_accuracy_verified===false&&payload.automatic_exclusions===0,"Public data scope mismatch");
    ensure(JSON.stringify(payload.frames.map(f=>f.source_frame))==="[2031,2052,2088,2107,2123,2144]","Unexpected scene schedule");
    for(const f of payload.frames){
      ensure(f.camera_ref==="R1D1:front_camera"&&JSON.stringify(f.image_size_xy)==="[1920,600]","Camera or native coordinates mismatch");
      ensure(Number.isFinite(f.timestamp_us)&&Number.isFinite(f.known_at_timestamp_us)&&f.known_at_timestamp_us<=f.timestamp_us,"Invalid source clock");
      const ids=new Set(f.nodes.map(n=>n.id));ensure(ids.size===f.nodes.length,"Duplicate source node");
      for(const item of [...f.nodes,...f.edges]){
        ensure(item.source_frame<=f.source_frame&&item.timestamp_us<=f.timestamp_us&&item.known_at_timestamp_us<=f.timestamp_us,"Future graph evidence");
        for(const value of [item.id,...(item.evidence_refs||[])])for(const m of value.matchAll(/(?:^|:)f(\d+)(?=:|$)/g))ensure(Number(m[1])<=f.source_frame,"Future evidence reference");
      }
      for(const e of f.edges)ensure(ids.has(e.subject)&&ids.has(e.object),"Dangling source edge");
      ensure(new Set(f.objects.map(o=>o.id)).size===f.objects.length,"Duplicate observation");
      for(const o of f.objects){
        const b=o.box;ensure(b.length===4&&b.every(Number.isFinite)&&0<=b[0]&&b[0]<b[2]&&b[2]<=1920&&0<=b[1]&&b[1]<b[3]&&b[3]<=600,"Invalid native box");
        ensure(o.anchor.length===2&&Math.abs(o.anchor[0]-(b[0]+b[2])/2)<1e-6&&o.anchor[1]===b[3],"Invalid bottom center");
        ensure(o.depth.metric_accuracy_verified===false&&typeof o.lane_allowed==="boolean","Unverified feature promoted");
        if(o.lane_allowed){const a=f.assignments.find(a=>a.observation_id===o.id);ensure(a&&f.corridors.some(c=>c.candidate_id===a.scene_corridor_candidate_id&&c.status==="candidate"),"Membership without a common corridor");
          ensure(f.edges.some(e=>e.subject===o.id&&e.object===a.scene_corridor_candidate_id&&e.predicate==="vehicle_in_image_corridor_candidate"&&admitted(e)),"Unadmitted lane membership");
          for(const p of ["left_image_boundary_candidate","right_image_boundary_candidate","corridor_has_visible_road_support"])ensure(f.edges.some(e=>e.subject===a.scene_corridor_candidate_id&&e.predicate===p&&admitted(e)),"Incomplete membership support");
        }
      }
    }
    return payload;
  }

  function selectFrame(next){
    const token=++selectToken;frame=next;vehicle=frame.objects.find(o=>o.lane_allowed)||frame.objects[0];imageReady=false;
    $("sceneImage").onload=()=>{if(token!==selectToken)return;const image=$("sceneImage"),[w,h]=frame.image_size_xy;if(image.naturalWidth<=0||image.naturalHeight<=0||Math.abs(image.naturalWidth/image.naturalHeight-w/h)>1e-6){imageReady=false;renderCrop();$("decision").textContent="원영상의 종횡비가 좌표계와 일치하지 않습니다.";return;}imageReady=true;renderCrop();};
    $("sceneImage").onerror=()=>{if(token===selectToken){imageReady=false;renderCrop();$("decision").textContent="원영상 로드 실패";}};
    $("sceneImage").src="assets/frames/"+frame.source_frame+".jpg";$("sceneImage").dataset.sourceFrame=String(frame.source_frame);
    $("roadMask").src="assets/frames/"+frame.source_frame+"-road.png";$("roadMask").dataset.sourceFrame=String(frame.source_frame);
    $("vehicleSelect").replaceChildren(...frame.objects.map(o=>{const e=text("option",objectLabel(o)+(o.lane_allowed?" · 소속 후보":" · 소속 보류"));e.value=o.id;return e;}));$("vehicleSelect").value=vehicle.id;
    document.querySelectorAll("#sceneButtons button").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.sourceFrame)===frame.source_frame)));
    $("sceneTime").textContent="첫 관측부터 "+frame.capture_elapsed_s.toFixed(2)+"초";
    const video=$("reviewVideo");video.pause();pendingVideoTime=frame.video_time_s;seekSelectedVideoFrame();
    render();updateVideoState();
  }

  function renderOverlay(){
    const root=$("sceneOverlay");root.replaceChildren();root.dataset.sourceFrame=String(frame.source_frame);root.dataset.stage=stage;
    const raw=$("rawOnly").checked;root.toggleAttribute("hidden",raw);$("roadMask").hidden=raw||stage!=="road";
    $("stageLabel").textContent=stages[stage].label;$("stageCaption").textContent=raw?"선택 프레임의 원영상":stages[stage].caption;
    $("sceneLegend").replaceChildren(...(raw?[]:stages[stage].legend).map(([color,label])=>{const e=text("span",label),i=document.createElement("i");i.style.background=color;e.prepend(i);return e;}));
    if(raw)return;
    if(stage!=="road"){
      for(const c of frame.corridors){root.append(svg("polygon",{points:c.polygon_xy.map(p=>p.join(",")).join(" "),fill:c.status==="candidate"?"#23ac8b":"#a0a8ad",opacity:.16,"data-corridor-id":c.candidate_id}));}
      for(const b of frame.boundaries)for(const points of b.components)root.append(svg("polyline",{points:points.map(p=>p.join(",")).join(" "),fill:"none",stroke:"#ffe064","stroke-width":4,"data-boundary-id":b.id}));
    }
    if(stage==="lane")return;
    for(const o of frame.objects){
      const [x,y,x1,y1]=o.box,selected=o.id===vehicle.id,color=selected?"#59e8e0":o.lane_allowed?"#8ae1b2":"#ffbe70",g=svg("g",{"data-observation-id":o.id});
      g.append(svg("rect",{x,y,width:x1-x,height:y1-y,fill:"none",stroke:color,"stroke-width":selected?5:2.5}));
      g.append(svg("circle",{cx:o.anchor[0],cy:o.anchor[1],r:selected?7:4,fill:color}));
      const label=svg("text",{x,y:Math.max(20,y-7),fill:color,"font-size":22,"font-weight":650,stroke:"#173141","stroke-width":2,"paint-order":"stroke"});label.textContent=objectLabel(o);g.append(label);root.append(g);
    }
  }

  function renderCrop(){
    const canvas=$("objectCrop"),ctx=canvas.getContext("2d");ctx.fillStyle="#e8eee9";ctx.fillRect(0,0,canvas.width,canvas.height);delete canvas.dataset.sourceFrame;delete canvas.dataset.observationId;
    if(!imageReady||$("sceneImage").dataset.sourceFrame!==String(frame.source_frame))return;
    const b=vehicle.box,w=Math.min(1920,Math.max(100,(b[2]-b[0])*2.5)),h=Math.min(600,Math.max(75,(b[3]-b[1])*2.5));
    const x=Math.max(0,Math.min(1920-w,(b[0]+b[2]-w)/2)),y=Math.max(0,Math.min(600-h,(b[1]+b[3]-h)/2)),scale=Math.min(canvas.width/w,canvas.height/h),dx=(canvas.width-w*scale)/2,dy=(canvas.height-h*scale)/2;
    const image=$("sceneImage"),sx=image.naturalWidth/frame.image_size_xy[0],sy=image.naturalHeight/frame.image_size_xy[1];
    ctx.drawImage(image,x*sx,y*sy,w*sx,h*sy,dx,dy,w*scale,h*scale);ctx.strokeStyle="#177570";ctx.lineWidth=2;ctx.strokeRect(dx+(b[0]-x)*scale,dy+(b[1]-y)*scale,(b[2]-b[0])*scale,(b[3]-b[1])*scale);
    canvas.dataset.sourceFrame=String(frame.source_frame);canvas.dataset.observationId=vehicle.id;
  }

  function drawGraph(graphNodes,graphEdges,kind){
    const root=$("graph");root.replaceChildren();root.dataset.sourceFrame=String(frame.source_frame);root.dataset.stage=stage;
    const mobile=matchMedia("(max-width:640px)").matches,W=mobile?360:700,H=mobile?440:300,g=svg("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":$("graphTitle").textContent});
    const defs=svg("defs"),marker=svg("marker",{id:"relationArrow",viewBox:"0 0 10 10",refX:9,refY:5,markerWidth:6,markerHeight:6,orient:"auto-start-reverse"});marker.append(svg("path",{d:"M0 0L10 5L0 10Z",fill:"#429480"}));defs.append(marker);g.append(defs);
    const current=frame.nodes.find(n=>n.id===vehicle.id),by=new Map(graphNodes.map(n=>[n.id,n]));
    let positions;
    if(kind==="temporal"){
      const total=graphNodes.length;positions=graphNodes.map((n,i)=>({id:n.id,x:mobile?180:100+i*(500/Math.max(1,total-1)),y:mobile?65+i*(305/Math.max(1,total-1)):150,w:mobile?230:Math.min(150,540/Math.max(1,total)),h:70}));
    }else if(kind==="membership"){
      positions=graphNodes.map((n,i)=>i===0?{id:n.id,x:mobile?180:105,y:mobile?55:150,w:150,h:58}:i===1?{id:n.id,x:mobile?180:335,y:mobile?175:150,w:mobile?220:170,h:66}:{id:n.id,x:mobile?65+(i-2)*115:590,y:mobile?335:60+(i-2)*90,w:mobile?102:170,h:58});
    }else{
      positions=graphNodes.map((n,i)=>i===0?{id:n.id,x:mobile?180:155,y:mobile?65:150,w:mobile?220:210,h:66}:{id:n.id,x:mobile?180:520,y:mobile?185+(i-1)*100:60+(i-1)*(180/Math.max(1,graphNodes.length-2)),w:mobile?230:220,h:58});
    }
    const pos=new Map(positions.map(p=>[p.id,p]));
    for(const edge of graphEdges){
      const a=pos.get(edge.subject),b=pos.get(edge.object);if(!a||!b)continue;
      const vertical=mobile,dx=b.x-a.x,dy=b.y-a.y,sign=Math.sign(vertical?dy:dx)||1;
      const x1=a.x+(vertical?0:sign*a.w/2),y1=a.y+(vertical?sign*a.h/2:0),x2=b.x-(vertical?0:sign*b.w/2),y2=b.y-(vertical?sign*b.h/2:0);
      g.append(svg("line",{x1,y1,x2,y2,stroke:"#429480","stroke-width":1.7,"marker-end":"url(#relationArrow)","data-evidence-edge":edge.id}));
      if(kind==="temporal"||graphEdges.length<=2){const label=svg("text",{x:vertical?(x1+12):(x1+x2)/2,y:vertical?(y1+y2)/2:(y1+y2)/2-12,fill:"#5d8074","font-size":mobile?11:12,"text-anchor":vertical?"start":"middle"});label.textContent=kind==="temporal"?"이전 관측":edge.predicate==="vehicle_in_image_corridor_candidate"?"소속 후보":"영상 근거";g.append(label);}
    }
    for(const p of positions){
      const n=by.get(p.id),isCurrent=n.id===current?.id,isVehicle=n.kind==="vehicle",fill=isCurrent?"#dceee5":isVehicle?"#eef3ef":"#ffffff",color=isCurrent?"#287a5b":"#a7bdb0";
      const group=svg("g",{"data-source-node":n.id});group.append(svg("rect",{x:p.x-p.w/2,y:p.y-p.h/2,width:p.w,height:p.h,rx:9,fill,stroke:color,"stroke-width":1.3}));
      const lines=(mobile&&p.w<110?n.label.replace("차선 경계","차선\n경계"):n.label).split("\n"),label=svg("text",{x:p.x,y:p.y-(lines.length-1)*9+5,"text-anchor":"middle",fill:"#23493c","font-size":mobile?13:14,"font-weight":isCurrent?650:500});
      lines.forEach((line,i)=>{const span=svg("tspan",{x:p.x,dy:i?19:0});span.textContent=line;label.append(span);});group.append(label);g.append(group);
    }
    root.append(g);
  }

  function renderGraph(){
    const all=frame.edges.filter(admitted),nodesById=new Map(frame.nodes.map(n=>[n.id,n])),a=frame.assignments.find(a=>a.observation_id===vehicle.id),label=objectLabel(vehicle),base={id:vehicle.id,label:label+"\n현재 관측",kind:"vehicle"};
    let shown=[],graphNodes=[base],kind="support",note="";
    if(stage==="temporal"){
      $("graphTitle").textContent="과거 관측과 현재의 연결";kind="temporal";
      const observations=frame.nodes.filter(n=>n.type==="VehicleObservation"&&(n.current_observation_id===vehicle.id||n.id===vehicle.id)).sort((a,b)=>a.timestamp_us-b.timestamp_us).slice(-4),ids=new Set(observations.map(n=>n.id));
      shown=all.filter(e=>ids.has(e.subject)&&ids.has(e.object)&&e.predicate==="previous_observed_track_hypothesis");
      graphNodes=observations.map(n=>({id:n.id,label:n.id===vehicle.id?"현재 관측":((frame.timestamp_us-n.timestamp_us)/1e6).toFixed(3)+"초 전\n차량 관측",kind:"vehicle"}));
      note="선택 시점까지 기록된 최근 "+observations.length+"개 관측을 연결했습니다. 추적 결과이며, 동일 차량 여부와 차로 변경은 별도 검증 대상입니다.";
    }else if(stage==="lane"){
      $("graphTitle").textContent="차로 후보와 좌우 경계";
      const c=frame.corridors.find(c=>c.candidate_id===a?.scene_corridor_candidate_id&&c.status==="candidate")||frame.corridors.find(c=>c.status==="candidate");
      if(c){graphNodes=[{id:c.candidate_id,label:"영상 차로 후보"}];shown=all.filter(e=>e.subject===c.candidate_id&&["left_image_boundary_candidate","right_image_boundary_candidate","corridor_has_visible_road_support"].includes(e.predicate));for(const e of shown)if(nodesById.has(e.object))graphNodes.push({id:e.object,label:relationNames[e.predicate]});}
      note=c?"좌우 경계와 도로 지지가 연결된 후보입니다. 후보 개수를 실제 차로 수로 해석하지 않습니다.":"이 장면에는 채택된 영상 차로 후보가 없습니다. 차량 관측은 보존됩니다.";
    }else if(stage==="road"){
      $("graphTitle").textContent="차량 주변의 도로·시설 근거";
      shown=all.filter(e=>e.subject===vehicle.id&&["visible_road_support_image_candidate","has_structure_visibility_evidence"].includes(e.predicate));
      for(const e of shown)graphNodes.push({id:e.object,label:e.predicate==="visible_road_support_image_candidate"?"가시 도로 영역":"시설·가림 근거"});
      note="영상의 도로 지지와 시설 근거입니다. 도로 마스크의 분리만으로 물리적 차단을 확정하지 않습니다.";
    }else{
      $("graphTitle").textContent="차량 소속과 판단 근거";
      const membership=vehicle.lane_allowed?all.find(e=>e.subject===vehicle.id&&e.object===a?.scene_corridor_candidate_id&&e.predicate==="vehicle_in_image_corridor_candidate"):null;
      if(membership){kind="membership";graphNodes.push({id:membership.object,label:"영상 차로 후보"});shown=[membership,...all.filter(e=>e.subject===membership.object&&["left_image_boundary_candidate","right_image_boundary_candidate","corridor_has_visible_road_support"].includes(e.predicate))];for(const e of shown.slice(1))graphNodes.push({id:e.object,label:relationNames[e.predicate].replace("차로 영역의 ","")});}
      note=membership?"소속 관계와 좌우 경계·도로 지지의 실제 연결입니다. 자차와 같은 물리 차로인지는 미확정입니다.":"소속 근거가 부족해 연결을 보류했습니다. 차량 관측을 삭제한 것은 아닙니다.";
    }
    graphNodes=graphNodes.filter((n,i,arr)=>arr.findIndex(x=>x.id===n.id)===i);drawGraph(graphNodes,shown,kind);$("graphNote").textContent=note;
    const evidence=$("evidence");evidence.replaceChildren();evidence.append(text("p","PREVENTION · 전방 카메라 · 원 프레임 "+frame.source_frame+" · 좌표계 1920×600 px · 관측 "+(frame.timestamp_us/1e6).toFixed(6)+" s · 사용 가능 "+(frame.known_at_timestamp_us/1e6).toFixed(6)+" s"));
    if(!shown.length)evidence.append(text("p","선택 단계에서 표시할 채택 관계가 없습니다. 원 관측은 보존합니다."));
    for(const e of shown)evidence.append(text("p",(relationNames[e.predicate]||e.predicate)+" · 원 프레임 "+e.source_frame+" · 사용 가능 "+(e.known_at_timestamp_us/1e6).toFixed(6)+" s · 근거 "+(e.evidence_refs?.length||0)+"개 · "+e.id));
  }

  function render(){
    renderOverlay();renderGraph();renderCrop();
    const badge=$("decisionBadge");badge.className="status-badge"+(vehicle.lane_allowed?"":" review");badge.textContent=vehicle.lane_allowed?"소속 후보 채택":"소속 판단 보류";
    $("decision").textContent=vehicle.lane_allowed?objectLabel(vehicle)+"의 소속 후보를 채택했습니다. 자차와 같은 실제 차로인지는 미확정입니다.":objectLabel(vehicle)+"의 차로 소속은 보류했습니다. 경계·가림·도로 근거가 부족하며 차량 관측은 유지합니다.";
    const depth=vehicle.depth,values=[["하단 중심",vehicle.anchor.map(number).join(", ")+" px"],["탐지 점수",vehicle.score.toFixed(3)], ["주변 도로 픽셀",(vehicle.road.road_fraction*100).toFixed(1)+"%"],["박스 겹침",vehicle.anchor_overlap_ids.length?"하단점에서 겹침 관측":"하단점 겹침 없음"],["표면 깊이",depth.input_mask&&depth.units==="m"&&Number.isFinite(depth.value)?depth.value.toFixed(2)+" m · 미검증 추정":"품질 조건으로 보류"]];
    $("vehicleFacts").replaceChildren(...values.flatMap(([k,v])=>[text("dt",k),text("dd",v)]));
  }

  function seekSelectedVideoFrame(){
    const v=$("reviewVideo");
    // Fragmented MP4 reports a growing duration while loading. Wait until the
    // selected time is available instead of letting the browser clamp to zero.
    if(pendingVideoTime===null||v.readyState<1||!Number.isFinite(v.duration)||v.duration<pendingVideoTime)return;
    const target=pendingVideoTime;pendingVideoTime=null;v.currentTime=target;updateVideoState();
  }

  function updateVideoState(){
    if(!frame)return;const v=$("reviewVideo");
    if(pendingVideoTime!==null){$("videoState").textContent="선택 장면으로 이동 중 · 그래프는 대표 프레임 기준";return;}
    $("videoState").textContent=v.paused?"재생 "+v.currentTime.toFixed(1)+"초 · 선택 프레임 "+frame.video_time_s.toFixed(1)+"초 · 그래프는 대표 프레임에 고정":"영상 재생 중 · 그래프는 선택한 대표 프레임에 고정";
  }

  async function init(){
    try{const response=await fetch("scene-data.json");ensure(response.ok,"Scene data unavailable");data=validate(await response.json());
      for(const [i,f] of data.frames.entries()){
        const button=document.createElement("button");button.type="button";button.setAttribute("aria-pressed","false");button.dataset.sourceFrame=String(f.source_frame);
        const image=document.createElement("img");image.src="assets/frames/"+f.source_frame+".jpg";image.alt=titles[i]+" 원영상";image.loading="lazy";
        button.append(image,text("strong",titles[i]),text("span",f.capture_elapsed_s.toFixed(2)+"초 · 관측 "+f.objects.length+"개"));button.addEventListener("click",()=>selectFrame(f));$("sceneButtons").append(button);
      }
      $("scopeSummary").textContent="PREVENTION · 대표 프레임 6개 · 차량 관측 "+data.frames.reduce((n,f)=>n+f.objects.length,0)+"개 · 30초 검수 재생";
      $("vehicleSelect").addEventListener("change",()=>{vehicle=frame.objects.find(o=>o.id===$("vehicleSelect").value);ensure(vehicle,"Unknown selected vehicle");render();});$("rawOnly").addEventListener("change",renderOverlay);
      for(const b of document.querySelectorAll("[data-stage]"))b.addEventListener("click",()=>{stage=b.dataset.stage;document.querySelectorAll("[data-stage]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));render();});
      for(const name of ["loadedmetadata","durationchange","progress","canplay"])$("reviewVideo").addEventListener(name,seekSelectedVideoFrame);
      for(const name of ["play","pause","seeked","timeupdate"])$("reviewVideo").addEventListener(name,updateVideoState);
      let compact=matchMedia("(max-width:640px)").matches;window.addEventListener("resize",()=>{const next=matchMedia("(max-width:640px)").matches;if(next!==compact){compact=next;if(frame)renderGraph();}});
      selectFrame(data.frames.find(f=>f.source_frame===2123));
    }catch(error){$("decision").textContent="데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.";$("decision").className="demo-error";console.error(error);}
  }
  init();
})();

