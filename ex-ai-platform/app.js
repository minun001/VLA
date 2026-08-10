const qs = (selector, root = document) => root.querySelector(selector);
const fmt = new Intl.NumberFormat("ko-KR");
let accidentMap;
let routeMapLayer;
let accidentMapLayer;
let segmentMapLayer;
let dashboardMap;
let dashboardRouteLayer;
let dashboardAccidentLayer;
let detailMap;
let detailMapLayer;
let taasRiskLayer;
let taasRiskData;
let taasLayerEnabled = false;
let taasIntegrationStatus;
let interpretedQuery;
let mapViewMode = "country";
let routeSupport = new Map();
let activePage = "dashboard";
let activeSegment = null;
let focusedAccidentUid = null;
let recordPage = 1;
let recordPageSize = 25;
let recordSort = "date";
let recordOrder = "desc";
let realtimeSource;
let realtimePollTimer;
let realtimeReconnectTimer;
const COUNTRY_CENTER = [36.25, 127.75];
const COUNTRY_ZOOM = 7;
const API_BASE = String(window.EXAI_API_BASE || "").replace(/\/$/, "");

function cssColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
const PAGE_TITLES = Object.freeze({
  dashboard: "대시보드",
  map: "지도·구간",
  records: "통계·목록",
  detail: "사고 상세",
  video: "영상·궤적 분석",
  report: "보고서",
  data: "데이터·품질",
});
const PAGE_ALIASES = Object.freeze({
  overview: "dashboard",
  assist: "dashboard",
  "map-analysis": "map",
  statistics: "records",
  "data-sources": "data",
  "quality-panel": "data",
});
const ROUTE_DISPLAY_NAMES = Object.freeze({
  "서1울양양선": "서울양양선",
});

function displayRouteName(routeName) {
  return ROUTE_DISPLAY_NAMES[routeName] || routeName;
}

function displaySeverity(value) {
  return {
    fatal: "사망사고",
    injury: "부상사고",
    property_damage_only: "물적피해",
  }[value] || value || "등급 미분류";
}

function displayTimestamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function parseHashState() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [rawPage = "dashboard", query = ""] = raw.split("?");
  const page = PAGE_TITLES[rawPage] ? rawPage : PAGE_ALIASES[rawPage] || "dashboard";
  return {page, filters: new URLSearchParams(query)};
}

function pageHash(page) {
  const params = queryParams();
  return `#/${page}${params.size ? `?${params}` : ""}`;
}

function updatePageLinks() {
  document.querySelectorAll("[data-page-link], [data-page-card]").forEach((link) => {
    const page = link.dataset.pageLink || link.dataset.pageCard;
    link.href = pageHash(page);
  });
  qs("[data-context-filter-link]").href = pageHash("dashboard");
  for (const [id, page] of [["drilldown-map", "map"], ["drilldown-records", "records"], ["drilldown-report", "report"], ["report-map-link", "map"], ["report-records-link", "records"], ["taas-audit-map-link", "map"], ["detail-back", "records"]]) {
    const link = qs(`#${id}`);
    if (link) link.href = pageHash(page);
  }
  renderDrilldownContext();
}

function showPage(page) {
  activePage = PAGE_TITLES[page] ? page : "dashboard";
  document.body.dataset.activePage = activePage;
  document.querySelectorAll("[data-page]").forEach((section) => {
    section.hidden = section.dataset.page !== activePage;
  });
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    if (link.dataset.pageLink === activePage) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = `${PAGE_TITLES[activePage]} · 교통사고 분석·관리 플랫폼`;
  updatePageLinks();
  if (activePage === "map" && accidentMap) {
    setTimeout(() => accidentMap.invalidateSize(), 0);
  }
  if (activePage === "dashboard" && dashboardMap) {
    setTimeout(() => dashboardMap.invalidateSize(), 0);
  }
  if (activePage === "detail" && detailMap) {
    setTimeout(() => detailMap.invalidateSize(), 0);
  }
}

function applyHashFilters(filters, clearMissing = false) {
  let changed = false;
  for (const id of ["year", "route", "cause"]) {
    const field = qs(`#${id}`);
    const requested = filters.get(id);
    const value = requested === null && clearMissing ? "" : requested;
    if (value !== null && [...field.options].some((option) => option.value === value) && field.value !== value) {
      field.value = value;
      changed = true;
    }
  }
  const rawFrom = filters.get("km_from");
  const rawTo = filters.get("km_to");
  const nextSegment = rawFrom !== null && rawTo !== null && Number(rawTo) > Number(rawFrom)
    ? {from: Number(rawFrom), to: Number(rawTo)}
    : null;
  if (JSON.stringify(nextSegment) !== JSON.stringify(activeSegment)) {
    activeSegment = nextSegment;
    changed = true;
  }
  const nextFocused = filters.get("accident") || null;
  if (nextFocused !== focusedAccidentUid) {
    focusedAccidentUid = nextFocused;
    changed = true;
  }
  return changed;
}

function syncRouteState() {
  history.replaceState(null, "", pageHash(activePage));
  updatePageLinks();
}

function queryParams(includeSearch = false) {
  const params = new URLSearchParams();
  for (const id of ["year", "route", "cause"]) {
    const value = qs(`#${id}`).value;
    if (value) params.set(id, value);
  }
  if (activeSegment) {
    params.set("km_from", String(activeSegment.from));
    params.set("km_to", String(activeSegment.to));
  }
  if (focusedAccidentUid) params.set("accident", focusedAccidentUid);
  if (includeSearch && qs("#search").value.trim()) params.set("search", qs("#search").value.trim());
  return params;
}

function segmentLabel(segment = activeSegment) {
  return segment ? `${segment.from}~${segment.to}km` : "";
}

function renderDrilldownContext() {
  const root = qs("#drilldown-context");
  if (!root) return;
  root.hidden = !activeSegment;
  if (!activeSegment) return;
  const route = displayRouteName(qs("#route").value) || "선택 노선";
  qs("#drilldown-title").textContent = `${route} ${segmentLabel()}`;
}

async function selectSegment(segment, accidentUid = null) {
  activeSegment = {from: Number(segment.from), to: Number(segment.to)};
  focusedAccidentUid = accidentUid;
  mapViewMode = "route";
  showPage("map");
  history.pushState(null, "", pageHash("map"));
  updatePageLinks();
  await refresh();
  qs("#map-analysis").scrollIntoView({behavior: reducedMotion() ? "auto" : "smooth", block: "start"});
}

async function clearSegmentSelection() {
  activeSegment = null;
  focusedAccidentUid = null;
  history.pushState(null, "", pageHash(activePage));
  updatePageLinks();
  await refresh();
}

async function openAccidentDetail(accidentUid) {
  if (!accidentUid) return;
  focusedAccidentUid = accidentUid;
  showPage("detail");
  history.pushState(null, "", pageHash("detail"));
  updatePageLinks();
  await loadAccidentDetail();
}

async function json(url, options = {}) {
  const requestOptions = {...options};
  requestOptions.headers = window.ExaiWorkflow
    ? ExaiWorkflow.headers(options.headers || {})
    : (options.headers || {});
  const isReadOnlyRequest = !requestOptions.method || requestOptions.method.toUpperCase() === "GET";
  const publicResolver = window.ExaiPublicData?.resolve;
  if (isReadOnlyRequest && typeof publicResolver === "function") {
    const fallback = window.ExaiPublicData.resolve(url);
    if (fallback !== undefined) return fallback;
  }
  try {
    const response = await fetch(`${API_BASE}${url}`, requestOptions);
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        if (payload.detail) detail = payload.detail;
      } catch (_) {
        // 응답 본문이 JSON이 아니면 HTTP 상태문구를 사용한다.
      }
      throw new Error(detail);
    }
    return response.json();
  } catch (error) {
    if (isReadOnlyRequest && typeof publicResolver === "function") {
      const fallback = window.ExaiPublicData.resolve(url);
      if (fallback !== undefined) return fallback;
    }
    throw error;
  }
}

function setRealtimeStatus(label, state = "pending") {
  const node = qs("#realtime-status");
  if (!node) return;
  node.dataset.state = state;
  const labelNode = qs(".realtime-label", node);
  if (labelNode) labelNode.textContent = label;
}

function stopRealtimePolling() {
  if (!realtimePollTimer) return;
  window.clearInterval(realtimePollTimer);
  realtimePollTimer = undefined;
}

function startRealtimePolling() {
  if (realtimePollTimer) return;
  setRealtimeStatus("주기 갱신", "fallback");
  realtimePollTimer = window.setInterval(() => refresh({silent: true}), 300000);
}

function connectRealtime() {
  if (window.ExaiPublicData?.mode === "readonly") {
    setRealtimeStatus("정적 스냅샷", "readonly");
    const sidebarState = qs(".sidebar-footer strong");
    const footerState = qs(".app-footer span:last-child");
    if (sidebarState) sidebarState.textContent = "공개 배포";
    if (footerState) footerState.textContent = "공개 배포";
    return;
  }
  if (!("EventSource" in window)) {
    startRealtimePolling();
    return;
  }
  if (realtimeSource) realtimeSource.close();
  const source = new EventSource(`${API_BASE}/api/events`);
  realtimeSource = source;
  source.addEventListener("ready", () => {
    stopRealtimePolling();
    setRealtimeStatus("실시간 연결", "live");
  });
  const refreshForEvent = () => {
    setRealtimeStatus("데이터 갱신", "live");
    refresh({silent: true}).finally(() => setRealtimeStatus("실시간 연결", "live"));
  };
  source.addEventListener("dataset.updated", refreshForEvent);
  source.addEventListener("taas.updated", refreshForEvent);
  source.addEventListener("taas.error", () => setRealtimeStatus("수집 확인 필요", "warn"));
  source.onerror = () => {
    source.close();
    if (realtimeSource === source) realtimeSource = undefined;
    startRealtimePolling();
    if (realtimeReconnectTimer) window.clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = window.setTimeout(() => {
      realtimeReconnectTimer = undefined;
      if (!realtimeSource) connectRealtime();
    }, 5000);
  };
}

function postJson(url, payload) {
  return json(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
}

function fillSelect(id, values) {
  const select = qs(`#${id}`);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function fillRouteSelect(routes) {
  const select = qs("#route");
  for (const item of routes) {
    const option = document.createElement("option");
    option.value = item.route_name;
    const mapLabel = item.map_status === "good"
      ? `지도 ${item.match_rate}%`
      : item.map_status === "partial"
        ? `부분 ${item.match_rate}%`
        : "좌표 검토중";
    option.textContent = `${displayRouteName(item.route_name)} · ${mapLabel}`;
    if (displayRouteName(item.route_name) !== item.route_name) {
      option.title = `원천 노선명: ${item.route_name}`;
    }
    select.append(option);
  }
}

function renderBars(id, items) {
  const root = qs(`#${id}`);
  root.innerHTML = "";
  const max = Math.max(...items.map((item) => item.value), 1);
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.title = item.label;
    label.textContent = item.label;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(item.value / max) * 100}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = fmt.format(item.value);
    row.append(label, track, value);
    root.append(row);
  }
  if (!items.length) root.innerHTML = '<p class="empty">조회 결과가 없습니다.</p>';
}

async function loadMetadata() {
  const [data, health] = await Promise.all([json("/api/metadata"), json("/api/health")]);
  if (window.ExaiPublicData?.mode === "readonly") {
    document.body.dataset.publicMode = "readonly";
    const badge = qs(".environment-badge");
    if (badge) badge.textContent = "공개 읽기 전용";
    setRealtimeStatus("공개 읽기 전용", "readonly");
    const reportButton = qs("#create-report");
    if (reportButton) {
      reportButton.disabled = true;
      reportButton.textContent = "공개 읽기 전용";
      reportButton.title = "공개 페이지에서는 보고서 저장·승인을 사용할 수 없습니다.";
    }
    const naturalSearchButton = qs("#interpret-query");
    if (naturalSearchButton) {
      naturalSearchButton.disabled = true;
      naturalSearchButton.title = "공개 페이지에서는 문장 검색 결과를 저장하지 않습니다.";
    }
    for (const selector of ["#year", "#route", "#cause", "#apply"]) {
      const control = qs(selector);
      if (control) {
        control.disabled = true;
        control.title = "공개 배포본은 2024년 경부선 정적 스냅샷입니다.";
      }
    }
  }
  fillSelect("year", data.years);
  fillRouteSelect(data.route_support);
  routeSupport = new Map(data.route_support.map((item) => [item.route_name, item]));
  fillSelect("cause", data.causes);
  const locationNote = qs("#location-note");
  if (locationNote) locationNote.textContent = data.location_note;
  qs("#hero-accidents").textContent = `${fmt.format(health.accident_count)}건`;
  if (data.years.length) qs("#year").value = String(Math.max(...data.years));
  if (data.routes.includes("경부선")) qs("#route").value = "경부선";
}

async function loadSummary() {
  const data = await json(`/api/summary?${queryParams()}`);
  qs("#kpi-accidents").textContent = fmt.format(data.totals.accidents);
  qs("#workspace-total").textContent = fmt.format(data.totals.accidents);
  qs("#kpi-deaths").textContent = fmt.format(data.totals.deaths);
  qs("#kpi-injuries").textContent = fmt.format(data.totals.injuries);
  qs("#kpi-fatal").textContent = fmt.format(data.totals.fatal_accidents);
  renderBars("route-chart", data.by_route.map((item) => ({...item, label: displayRouteName(item.label)})));
  renderBars("cause-chart", data.by_cause);
}

async function loadAccidents() {
  const params = queryParams(true);
  params.set("page", String(recordPage));
  params.set("page_size", String(recordPageSize));
  params.set("sort", recordSort);
  params.set("order", recordOrder);
  const data = await json(`/api/accidents?${params}`);
  recordPage = data.page;
  const rangeStart = data.total ? data.offset + 1 : 0;
  qs("#result-count").textContent = `총 ${fmt.format(data.total)}건 · ${fmt.format(rangeStart)}~${fmt.format(Math.min(data.offset + data.items.length, data.total))}건`;
  qs("#record-page-status").textContent = `${fmt.format(data.page)} / ${fmt.format(data.pages)} 페이지`;
  qs("#record-prev").disabled = data.page <= 1;
  qs("#record-next").disabled = data.page >= data.pages;
  document.querySelectorAll("[data-record-sort]").forEach((button) => {
    if (button.dataset.recordSort === recordSort) button.dataset.order = recordOrder;
    else delete button.dataset.order;
  });
  const body = qs("#accident-rows");
  body.innerHTML = "";
  for (const item of data.items) {
    const row = document.createElement("tr");
    for (const value of [
      `${item.accident_date} ${item.accident_time || ""}`,
      displayRouteName(item.route_name),
      item.direction || "-",
      item.kilometer_post ?? "-",
      item.cause || "-",
      fmt.format(item.deaths),
      fmt.format(item.injuries),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const actionCell = document.createElement("td");
    actionCell.className = "record-link-cell available";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "table-link-button";
    button.textContent = "사고 상세";
    button.addEventListener("click", () => openAccidentDetail(item.accident_uid));
    actionCell.append(button);
    row.append(actionCell);
    body.append(row);
  }
  if (!data.items.length) body.innerHTML = '<tr><td colspan="8" class="empty">조회 결과가 없습니다.</td></tr>';
}

function detailValue(value, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function appendDetailDefinition(root, label, value) {
  const item = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = detailValue(value);
  item.append(term, description);
  root.append(item);
}

function renderDetailStatus(root, badge, title, message) {
  root.innerHTML = "";
  const chip = document.createElement("span");
  chip.className = `status-chip ${badge.className || ""}`.trim();
  chip.textContent = badge.label;
  const heading = document.createElement("strong");
  heading.textContent = title;
  const body = document.createElement("p");
  body.textContent = message;
  root.append(chip, heading, body);
}

function destroyDetailMap() {
  if (detailMap) detailMap.remove();
  detailMap = undefined;
  detailMapLayer = undefined;
}

function renderDetailMap(location) {
  const root = qs("#detail-map");
  const note = qs("#detail-map-note");
  const meta = qs("#detail-map-meta");
  const hasLocation = location?.latitude !== null && location?.latitude !== undefined
    && location?.longitude !== null && location?.longitude !== undefined;
  meta.textContent = location?.label || "위치 정보";
  note.textContent = location?.is_approximate
    ? "이 지도는 도로 이정 기준으로 결합한 추정 위치입니다. 현장 위치 확정 근거로 사용하지 않습니다."
    : "이 사고에는 지도 좌표가 결합되지 않았습니다.";
  if (!hasLocation || typeof L === "undefined") {
    destroyDetailMap();
    root.className = "empty";
    root.textContent = hasLocation ? "지도 라이브러리를 불러오지 못했습니다." : "좌표 미결합";
    return;
  }
  root.className = "";
  if (!detailMap) {
    root.innerHTML = "";
    detailMap = L.map("detail-map", {zoomControl: true, preferCanvas: true});
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(detailMap);
  }
  if (detailMapLayer) detailMap.removeLayer(detailMapLayer);
  detailMapLayer = L.featureGroup().addTo(detailMap);
  const marker = L.circleMarker([location.latitude, location.longitude], {
    radius: 10, color: "#fff", weight: 3, fillColor: cssColor("--data-fatal", "#8a1538"), fillOpacity: .9,
  }).addTo(detailMapLayer);
  marker.bindTooltip(location.label, {permanent: false});
  detailMap.setView([location.latitude, location.longitude], 14, {animate: false});
  setTimeout(() => detailMap?.invalidateSize(), 0);
}

function renderAccidentDetail(data) {
  const accident = data.accident;
  const source = data.provenance;
  const location = data.location;
  const report = data.report;
  const quality = data.quality;
  qs("#detail-empty").hidden = true;
  qs("#detail-content").hidden = false;
  qs("#detail-title").textContent = `${displayRouteName(accident.route_name)} ${detailValue(accident.kilometer_post)}km 사고`;
  qs("#detail-subtitle").textContent = `${detailValue(accident.accident_date)} ${detailValue(accident.accident_time, "시간 미상")} · ${detailValue(accident.direction, "방향 미분류")}`;
  qs("#detail-uid").textContent = `사고 UID: ${accident.accident_uid}`;
  qs("#detail-source-badge").textContent = `자료 출처 · ${detailValue(source.source_name)}`;
  qs("#detail-quality-badge").textContent = quality.location_level === "caution" ? "좌표 결합 · 추정" : "좌표 · 미결합";

  const facts = qs("#detail-facts");
  facts.innerHTML = "";
  [
    ["발생 일시", `${detailValue(accident.accident_date)} ${detailValue(accident.accident_time, "시간 미상")}`],
    ["노선·이정", `${displayRouteName(accident.route_name)} · ${detailValue(accident.kilometer_post)}km`],
    ["사고 원인", detailValue(accident.cause, "원인 미분류")],
    ["사고 등급", displaySeverity(accident.severity)],
    ["사망자", `${fmt.format(accident.deaths || 0)}명`],
    ["부상자", `${fmt.format(accident.injuries || 0)}명`],
  ].forEach(([label, value]) => appendDetailDefinition(facts, label, value));

  const provenance = qs("#detail-provenance");
  provenance.innerHTML = "";
  [
    ["수집 자료", source.source_name],
    ["수집 시각", displayTimestamp(source.collected_at)],
    ["원본 파일", source.source_file],
    ["자료 식별값", source.source_sha256 ? `${source.source_sha256.slice(0, 12)}…` : "-"],
  ].forEach(([label, value]) => appendDetailDefinition(provenance, label, value));

  const segment = data.risk.local_segment;
  const taas = data.risk.taas;
  const riskMessage = segment
    ? `${segment.from_km}~${segment.to_km}km 구간에 같은 연도 사고 ${fmt.format(segment.accidents)}건, 사망 ${fmt.format(segment.deaths)}명, 부상 ${fmt.format(segment.injuries)}명이 집계되었습니다. ${data.risk.notice}`
    : data.risk.notice;
  renderDetailStatus(qs("#detail-risk"), {
    label: taas?.record_count ? "TAAS 적재" : "TAAS 대기",
    className: taas?.record_count ? "" : "unavailable",
  }, segment ? "동일 노선·10km 구간 집계" : "구간 집계 불가", riskMessage);

  const mediaRoot = qs("#detail-media");
  const mediaDemo = qs("#detail-media-demo");
  const media = data.media.items || [];
  if (media.length) {
    const item = media[0];
    renderDetailStatus(mediaRoot, {
      label: item.data_mode === "real" ? "실제 영상" : "시연 자료",
      className: item.data_mode === "real" ? "" : "caution",
    }, item.title, item.data_mode === "real"
      ? `분석 상태 ${detailValue(item.analysis_status)} · 검토 상태 ${detailValue(item.review_status)}`
      : "시연 자료는 실제 사고 근거로 사용하지 않습니다.");
    mediaDemo.hidden = item.data_mode === "real";
  } else {
    renderDetailStatus(mediaRoot, {label: "영상 미확보", className: "unavailable"}, "연결된 실제 영상 없음", data.media.demo_notice);
    mediaDemo.hidden = window.ExaiPublicData?.mode === "readonly";
  }
  mediaDemo.href = data.media.demo_url || "/trajectory-prototype/#/trajectory?t=1";

  const latestReport = report.latest;
  const reportOpen = qs("#detail-report-open");
  const reportCreate = qs("#detail-report-create");
  if (latestReport) {
    renderDetailStatus(qs("#detail-report"), {label: latestReport.status, className: latestReport.status === "approved" ? "" : "caution"}, latestReport.title, `버전 ${latestReport.version} · 최근 갱신 ${detailValue(latestReport.updated_at)}`);
    reportOpen.hidden = false;
    reportOpen.textContent = "보고서 출력";
    reportOpen.href = `${API_BASE}/api/assist/reports/${encodeURIComponent(latestReport.report_uid)}/export`;
    reportOpen.target = "_blank";
    reportCreate.hidden = true;
  } else {
    renderDetailStatus(qs("#detail-report"), {label: "검토 대기", className: "unavailable"}, "사고 단위 보고서 미생성", "원본 자료와 좌표 결합 상태를 근거로 보고서 초안을 생성한 뒤 검토·승인할 수 있습니다.");
    reportOpen.hidden = true;
    reportCreate.hidden = window.ExaiPublicData?.mode === "readonly";
    reportCreate.disabled = window.ExaiPublicData?.mode === "readonly";
  }
  renderDetailMap(location);
}

async function loadAccidentDetail() {
  const empty = qs("#detail-empty");
  const content = qs("#detail-content");
  if (!focusedAccidentUid) {
    content.hidden = true;
    empty.hidden = false;
    destroyDetailMap();
    return;
  }
  empty.hidden = false;
  empty.textContent = "사고 상세 정보를 불러오는 중입니다.";
  try {
    const data = await json(`/api/accidents/${encodeURIComponent(focusedAccidentUid)}/workspace`);
    if (data.accident_uid !== focusedAccidentUid) throw new Error("사고 식별자가 일치하지 않습니다.");
    renderAccidentDetail(data);
  } catch (error) {
    content.hidden = true;
    empty.hidden = false;
    empty.textContent = `사고 상세 정보를 불러오지 못했습니다: ${error.message}`;
    destroyDetailMap();
  }
}

async function createAccidentReportDraft() {
  if (!focusedAccidentUid || window.ExaiPublicData?.mode === "readonly") return;
  const button = qs("#detail-report-create");
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = "초안 생성 중";
  try {
    const report = await json(`/api/accidents/${encodeURIComponent(focusedAccidentUid)}/report-draft`, {method: "POST"});
    await window.ExaiWorkflow?.reportCreated?.(report);
    showPage("report");
    history.pushState(null, "", pageHash("report"));
    updatePageLinks();
  } catch (error) {
    alert(`보고서 초안을 만들지 못했습니다: ${error.message}`);
    button.disabled = false;
    button.textContent = previous;
  }
}

function ensureMap() {
  if (accidentMap) return;
  if (typeof L === "undefined") throw new Error("지도 라이브러리를 불러오지 못했습니다");
  accidentMap = L.map("accident-map", {preferCanvas: true});
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(accidentMap);
  accidentMap.setView(COUNTRY_CENTER, COUNTRY_ZOOM);
}

function ensureDashboardMap() {
  if (dashboardMap) return;
  if (typeof L === "undefined") throw new Error("지도 라이브러리를 불러오지 못했습니다");
  dashboardMap = L.map("dashboard-map", {
    preferCanvas: true,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
  });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 19}).addTo(dashboardMap);
  L.control.zoom({position: "bottomright"}).addTo(dashboardMap);
  dashboardMap.setView(COUNTRY_CENTER, COUNTRY_ZOOM);
}

function clearDashboardMapLayers() {
  if (dashboardRouteLayer) dashboardRouteLayer.remove();
  if (dashboardAccidentLayer) dashboardAccidentLayer.remove();
  dashboardRouteLayer = null;
  dashboardAccidentLayer = null;
}

function renderDashboardMap(data, geometries = [], groups = new Map()) {
  ensureDashboardMap();
  clearDashboardMapLayers();
  const empty = qs("#dashboard-map-empty");
  if (!data) {
    empty.hidden = false;
    qs("#dashboard-map-meta").textContent = "노선 선택 필요";
    dashboardMap.setView(COUNTRY_CENTER, COUNTRY_ZOOM, {animate: false});
    setTimeout(() => dashboardMap.invalidateSize(), 0);
    return;
  }
  empty.hidden = true;
  const routeLines = geometries
    .filter((geometry) => geometry.points.length)
    .map((geometry) => L.polyline(geometry.points, {
      color: cssColor("--data-route", "#007d73"), weight: 4, opacity: .82,
    }));
  if (routeLines.length) dashboardRouteLayer = L.featureGroup(routeLines).addTo(dashboardMap);

  dashboardAccidentLayer = L.featureGroup().addTo(dashboardMap);
  for (const items of groups.values()) {
    const item = items[0];
    const color = items.some((entry) => entry.deaths > 0)
      ? cssColor("--data-fatal", "#a41e34")
      : items.some((entry) => entry.injuries > 0)
        ? cssColor("--data-injury", "#d06400")
        : cssColor("--data-property", "#087db4");
    const radius = Math.min(11, 4.5 + Math.sqrt(items.length) * 1.8);
    L.circleMarker([item.latitude, item.longitude], {
      radius,
      color: "#fff",
      weight: 1.5,
      fillColor: color,
      fillOpacity: .88,
    }).bindTooltip(`${item.kilometer_post}km · ${items.length}건`).addTo(dashboardAccidentLayer);
  }
  const focusLayer = activeSegment && dashboardAccidentLayer.getBounds().isValid()
    ? dashboardAccidentLayer
    : dashboardRouteLayer;
  if (focusLayer?.getBounds().isValid()) {
    dashboardMap.fitBounds(focusLayer.getBounds(), {padding: [24, 24], animate: false});
  } else {
    dashboardMap.setView(COUNTRY_CENTER, COUNTRY_ZOOM, {animate: false});
  }
  qs("#dashboard-map-meta").textContent = `${fmt.format(data.located_accidents)}/${fmt.format(data.total_accidents)}건 표시 · ${data.match_rate}%`;
  setTimeout(() => dashboardMap.invalidateSize(), 0);
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function updateMapScope() {
  const route = displayRouteName(qs("#route").value) || "전체 노선";
  const year = qs("#year").value || "전체연도";
  const scale = mapViewMode === "route" ? "선택 노선 확대" : "대한민국 전체";
  const segment = activeSegment ? ` · ${segmentLabel()}` : "";
  qs("#map-scope").textContent = `${scale} · ${year} · ${route}${segment}`;
}

function setMapViewMode(mode) {
  mapViewMode = mode;
  qs("#map-view-country").setAttribute("aria-pressed", String(mode === "country"));
  qs("#map-view-route").setAttribute("aria-pressed", String(mode === "route"));
  updateMapScope();
  if (!accidentMap) return;
  const focusLayer = activeSegment && segmentMapLayer?.getBounds().isValid() ? segmentMapLayer : routeMapLayer;
  if (mode === "route" && focusLayer?.getBounds().isValid()) {
    accidentMap.fitBounds(focusLayer.getBounds(), {padding: [28, 28], animate: !reducedMotion()});
  } else {
    accidentMap.setView(COUNTRY_CENTER, COUNTRY_ZOOM, {animate: !reducedMotion()});
  }
}

function popupContent(item) {
  const root = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = `${item.accident_date} ${item.accident_time || ""} · ${item.kilometer_post}km`;
  const detail = document.createElement("div");
  detail.textContent = `${item.direction || "방향 미분류"} · ${item.cause || "원인 미분류"}`;
  const casualties = document.createElement("div");
  casualties.textContent = `사망 ${item.deaths}명 · 부상 ${item.injuries}명`;
  const note = document.createElement("small");
  note.textContent = `이정 좌표 변환거리 ${item.location_match_distance_km ?? 0}km · 실제 위치 정확도가 아님`;
  const actions = document.createElement("div");
  actions.className = "map-popup-actions";
  const detailLink = document.createElement("a");
  detailLink.textContent = "사고 상세";
  detailLink.href = `#/detail?${new URLSearchParams({...Object.fromEntries(queryParams()), accident: item.accident_uid})}`;
  actions.append(detailLink);
  for (const [label, page] of [["구간 사고목록", "records"], ["보고서 작성", "report"]]) {
    const link = document.createElement("a");
    link.textContent = label;
    link.href = pageHash(page);
    actions.append(link);
  }
  root.append(heading, detail, casualties, note, actions);
  return root;
}

function clearMapLayers() {
  if (routeMapLayer) routeMapLayer.remove();
  if (accidentMapLayer) accidentMapLayer.remove();
  if (taasRiskLayer) taasRiskLayer.remove();
  if (segmentMapLayer) segmentMapLayer.remove();
  routeMapLayer = null;
  accidentMapLayer = null;
  taasRiskLayer = null;
  segmentMapLayer = null;
}

const TAAS_RISK_COLORS = Object.freeze({
  "01": "#23866b",
  "02": "#d29100",
  "03": "#df6c1b",
  "04": "#b3262e",
});

function friendlyTaasError(message) {
  if ((message || "").includes("SERVICE_KEY_IS_NOT_REGISTERED_ERROR")) {
    return "TAAS 승인 반영 대기";
  }
  return "TAAS 연결 확인 중";
}

function taasPopupContent(item, data) {
  const root = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = `${data.section_name} · ${item.risk_grade_name}`;
  const value = document.createElement("div");
  value.textContent = `위험지수 ${item.risk_value} · ${data.vehicle_type_name}`;
  const note = document.createElement("small");
  note.textContent = `TAAS 조회시점 스냅샷 · 노선 매핑 ${data.mapping_status === "verified" ? "검증 완료" : "검토 필요"}`;
  root.append(heading, value, note);
  return root;
}

function renderTaasRiskLayer() {
  if (taasRiskLayer) taasRiskLayer.remove();
  taasRiskLayer = null;
  qs("#taas-risk-legend").hidden = !taasLayerEnabled;
  if (!taasLayerEnabled || !taasRiskData?.available || !accidentMap) return;
  const lines = taasRiskData.segments.map((item) => L.polyline(item.geometry, {
    color: TAAS_RISK_COLORS[item.risk_grade] || "#6b7682",
    weight: 8,
    opacity: .86,
    lineCap: "butt",
  }).bindPopup(taasPopupContent(item, taasRiskData)));
  taasRiskLayer = L.featureGroup(lines).addTo(accidentMap);
}

async function loadTaasRisk(route) {
  const status = qs("#taas-map-status");
  const toggle = qs("#taas-layer-toggle");
  if (!route) {
    taasRiskData = null;
    taasLayerEnabled = false;
    toggle.disabled = true;
    toggle.setAttribute("aria-pressed", "false");
    toggle.textContent = "위험도 표시";
    status.textContent = "노선 선택 필요";
    renderTaasRiskLayer();
    return;
  }
  const vehicleType = qs("#taas-vehicle-type").value;
  try {
    taasRiskData = await json(`/api/taas/highway-risk/${encodeURIComponent(route)}?vehicle_type=${vehicleType}`);
  } catch (error) {
    taasRiskData = null;
    taasLayerEnabled = false;
    toggle.disabled = true;
    toggle.setAttribute("aria-pressed", "false");
    status.textContent = `TAAS 상태 조회 실패 · ${error.message}`;
    renderTaasRiskLayer();
    return;
  }
  toggle.disabled = !taasRiskData.available;
  if (!taasRiskData.available) {
    taasLayerEnabled = false;
    toggle.setAttribute("aria-pressed", "false");
    toggle.textContent = "위험도 표시";
    const sourceState = taasIntegrationStatus?.source;
    status.textContent = sourceState?.integration_status === "연계 오류"
      ? friendlyTaasError(sourceState.blocking_reason)
      : taasIntegrationStatus?.auth_configured
        ? "TAAS 인증 설정 완료 · 공식 스냅샷 적재 대기"
        : "공식 TAAS 스냅샷 미적재 · 인증키와 구간 매핑 확인 필요";
  } else {
    const mapping = taasRiskData.mapping_status === "verified" ? "매핑 검증 완료" : "매핑 검토 필요";
    status.textContent = `${taasRiskData.section_name} · ${fmt.format(taasRiskData.segments.length)}개 구간 · ${mapping}`;
  }
  renderTaasRiskLayer();
}

function groupedPopupContent(items) {
  const root = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = `${items.length}건 중첩 표시`;
  const totals = document.createElement("div");
  totals.textContent = `사망 ${items.reduce((sum, item) => sum + item.deaths, 0)}명 · 부상 ${items.reduce((sum, item) => sum + item.injuries, 0)}명`;
  const list = document.createElement("ul");
  for (const item of items.slice(0, 5)) {
    const row = document.createElement("li");
    row.textContent = `${item.accident_date} ${item.accident_time || ""} · ${item.kilometer_post}km · ${item.cause || "원인 미분류"}`;
    list.append(row);
  }
  const note = document.createElement("small");
  note.textContent = items.length > 5 ? `최근 5건 표시 · 외 ${items.length - 5}건` : "동일 이정좌표에 결합된 사고";
  root.append(heading, totals, list, note);
  return root;
}

function renderMapQuality(data, uniquePoints) {
  const root = qs("#map-quality-summary");
  root.innerHTML = "";
  const values = [
    ["필터 사고", `${fmt.format(data.total_accidents)}건`],
    ["좌표 결합", `${fmt.format(data.located_accidents)}건 (${data.match_rate}%)`],
    ["지도 표시점", `${fmt.format(uniquePoints)}개`],
    ["미결합", `${fmt.format(data.total_accidents - data.located_accidents)}건`],
  ];
  for (const [label, value] of values) {
    const card = document.createElement("div");
    const name = document.createElement("span");
    const number = document.createElement("strong");
    name.textContent = label;
    number.textContent = value;
    card.append(name, number);
    root.append(card);
  }
}

async function loadMap() {
  const route = qs("#route").value;
  const year = qs("#year").value;
  const cause = qs("#cause").value;
  if (!route) {
    clearMapLayers();
    renderDashboardMap(null);
    qs("#map-empty").hidden = false;
    qs("#accident-map").hidden = true;
    qs("#map-meta").textContent = "";
    qs("#map-quality-summary").innerHTML = "";
    if (accidentMap) accidentMap.setView(COUNTRY_CENTER, COUNTRY_ZOOM, {animate: false});
    updateMapScope();
    await loadTaasRisk("");
    return;
  }
  qs("#map-empty").hidden = true;
  qs("#accident-map").hidden = false;
  ensureMap();
  clearMapLayers();
  accidentMap.setView(COUNTRY_CENTER, COUNTRY_ZOOM, {animate: false});
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (cause) params.set("cause", cause);
  if (activeSegment) {
    params.set("km_from", String(activeSegment.from));
    params.set("km_to", String(activeSegment.to));
  }
  const data = await json(`/api/map/${encodeURIComponent(route)}?${params}`);
  const rawGeometries = data.route_geometries?.length
    ? data.route_geometries
    : [{route_name: route, points: data.route_geometry}];
  const geometries = rawGeometries.map((geometry) => ({
    route_name: geometry.route_name,
    points: geometry.points.map((point) => [point[0], point[1]]),
  }));
  accidentMapLayer = L.featureGroup().addTo(accidentMap);
  const groups = new Map();
  for (const item of data.accidents) {
    const key = `${item.latitude.toFixed(7)},${item.longitude.toFixed(7)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const items of groups.values()) {
    const item = items[0];
    if (items.length > 1) {
      const marker = L.marker([item.latitude, item.longitude], {
        icon: L.divIcon({
          className: `cluster-marker${items.length >= 4 ? " high" : ""}${items.some((entry) => entry.accident_uid === focusedAccidentUid) ? " focused" : ""}`,
          html: String(items.length),
        }),
      }).bindPopup(groupedPopupContent(items)).addTo(accidentMapLayer);
      if (items.some((entry) => entry.accident_uid === focusedAccidentUid)) setTimeout(() => marker.openPopup(), 120);
    } else {
      const color = item.deaths > 0
        ? cssColor("--data-fatal", "#8a1538")
        : item.injuries > 0
          ? cssColor("--data-injury", "#b95d00")
          : cssColor("--data-property", "#0b67a3");
      const marker = L.circleMarker([item.latitude, item.longitude], {
        radius: item.accident_uid === focusedAccidentUid ? 10 : item.deaths > 0 ? 7 : 5,
        color: "#ffffff",
        weight: item.accident_uid === focusedAccidentUid ? 3 : 1,
        fillColor: color,
        fillOpacity: .82,
      }).bindPopup(popupContent(item)).addTo(accidentMapLayer);
      if (item.accident_uid === focusedAccidentUid) setTimeout(() => marker.openPopup(), 120);
    }
  }
  const routeLines = geometries
    .filter((geometry) => geometry.points.length)
    .map((geometry) => L.polyline(geometry.points, {
      color: cssColor("--data-route", "#145a8d"),
      weight: 4,
      opacity: .78,
    }));
  if (routeLines.length) {
    routeMapLayer = L.featureGroup(routeLines).addTo(accidentMap);
    routeLines.forEach((line) => line.bringToBack());
    if (mapViewMode === "route" && !activeSegment) {
      accidentMap.fitBounds(routeMapLayer.getBounds(), {padding: [28, 28], animate: !reducedMotion()});
    } else {
      accidentMap.setView(COUNTRY_CENTER, COUNTRY_ZOOM, {animate: false});
    }
  }
  if (activeSegment) {
    const segmentLines = rawGeometries
      .map((geometry) => geometry.points.filter((point) => point.length < 3 || (point[2] >= activeSegment.from && point[2] < activeSegment.to)))
      .filter((points) => points.length >= 2)
      .map((points) => L.polyline(points.map((point) => [point[0], point[1]]), {
        color: "#087e8b", weight: 8, opacity: .92,
      }));
    if (segmentLines.length) {
      segmentMapLayer = L.featureGroup(segmentLines).addTo(accidentMap);
      accidentMap.fitBounds(segmentMapLayer.getBounds(), {padding: [34, 34], animate: !reducedMotion()});
    } else if (accidentMapLayer.getBounds().isValid()) {
      accidentMap.fitBounds(accidentMapLayer.getBounds(), {padding: [34, 34], animate: !reducedMotion()});
    }
  }
  setTimeout(() => accidentMap.invalidateSize(), 0);
  qs("#map-title").textContent = `${displayRouteName(route)}${activeSegment ? ` ${segmentLabel()}` : ""} 사고 위치 지도`;
  const sourceYear = data.coordinate_source?.source_year ? ` · 좌표기준 ${data.coordinate_source.source_year}` : "";
  const references = data.coordinate_reference_routes?.length ? ` · 참조 ${data.coordinate_reference_routes.join(", ")}` : "";
  qs("#map-meta").textContent = `${year || "전체연도"}${activeSegment ? ` · ${segmentLabel()}` : ""} · ${fmt.format(data.located_accidents)}/${fmt.format(data.total_accidents)}건 좌표결합 (${data.match_rate}%)${sourceYear}${references}`;
  qs("#map-note").textContent = data.coordinate_status === "available"
    ? `좌표 결합 완료${data.coordinate_source?.source_year ? ` · 기준 ${data.coordinate_source.source_year}` : ""}`
    : `좌표 미결합 ${fmt.format(data.total_accidents)}건`;
  renderMapQuality(data, groups.size);
  renderDashboardMap(data, geometries, groups);
  await loadTaasRisk(route);
  updateMapScope();
}

function renderDashboardCorridor(data) {
  const strip = qs("#dashboard-corridor-strip");
  const summary = qs("#dashboard-corridor-summary");
  strip.innerHTML = "";
  if (!data?.segments?.length) {
    strip.classList.add("is-empty");
    summary.textContent = "노선을 선택하세요";
    return;
  }
  strip.classList.remove("is-empty");
  const max = Math.max(...data.segments.map((item) => item.accidents), 1);
  data.segments.forEach((item, index) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `dashboard-segment${item.accidents === 0 ? " zero" : ""}`;
    cell.style.setProperty("--segment-alpha", String(.14 + .86 * (item.accidents / max)));
    cell.dataset.km = index % 5 === 0 ? `${item.start_km}` : "";
    cell.title = `${item.start_km}~${item.end_km}km · ${item.accidents}건`;
    cell.setAttribute("aria-label", cell.title);
    cell.disabled = item.accidents === 0;
    cell.addEventListener("click", () => selectSegment({from: item.start_km, to: item.end_km}));
    strip.append(cell);
  });
  const top = data.top_segments?.[0];
  summary.innerHTML = "";
  const total = document.createElement("span");
  total.textContent = `총 ${fmt.format(data.totals.accidents)}건`;
  const topButton = document.createElement("button");
  topButton.type = "button";
  topButton.className = "dashboard-top-segment";
  topButton.textContent = top ? `최다 ${top.start_km}~${top.end_km}km · ${fmt.format(top.accidents)}건` : "사고 구간 없음";
  topButton.disabled = !top;
  if (top) topButton.addEventListener("click", () => selectSegment({from: top.start_km, to: top.end_km}));
  summary.append(total, topButton);
}

async function loadCorridor() {
  const route = qs("#route").value;
  const year = qs("#year").value;
  const cause = qs("#cause").value;
  if (!route) {
    qs("#corridor-empty").hidden = false;
    qs("#corridor-content").hidden = true;
    qs("#corridor-title").textContent = "고속도로 이정 구간 분석";
    qs("#corridor-meta").textContent = "";
    renderDashboardCorridor(null);
    return;
  }
  const params = new URLSearchParams({segment_km: "10"});
  if (year) params.set("year", year);
  if (cause) params.set("cause", cause);
  const data = await json(`/api/corridor/${encodeURIComponent(route)}?${params}`);
  qs("#corridor-empty").hidden = true;
  qs("#corridor-content").hidden = false;
  qs("#corridor-title").textContent = `${displayRouteName(route)} 이정 구간 분석`;
  qs("#corridor-meta").textContent = `${year || "전체연도"} · ${data.segment_km}km 단위 · ${fmt.format(data.totals.accidents)}건`;
  const max = Math.max(...data.segments.map((item) => item.accidents), 1);
  const strip = qs("#corridor-strip");
  strip.innerHTML = "";
  data.segments.forEach((item, index) => {
    const cell = document.createElement("button");
    cell.type = "button";
    const selected = activeSegment?.from === item.start_km && activeSegment?.to === item.end_km;
    cell.className = `segment${item.accidents === 0 ? " zero" : ""}${selected ? " selected" : ""}`;
    cell.style.opacity = item.accidents === 0 ? "1" : String(.15 + .85 * (item.accidents / max));
    cell.dataset.km = index % 5 === 0 ? `${item.start_km}km` : "";
    cell.title = `${item.start_km}~${item.end_km}km: 사고 ${item.accidents}건, 사망 ${item.deaths}명, 부상 ${item.injuries}명`;
    cell.setAttribute("aria-label", cell.title);
    cell.setAttribute("aria-pressed", String(selected));
    cell.disabled = item.accidents === 0;
    cell.addEventListener("click", () => selectSegment({from: item.start_km, to: item.end_km}));
    strip.append(cell);
  });
  const topList = qs("#top-segments");
  topList.innerHTML = "";
  for (const item of data.top_segments) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "linked-segment-button";
    button.textContent = `${item.start_km}~${item.end_km}km · 사고 ${fmt.format(item.accidents)}건 · 사망 ${fmt.format(item.deaths)}명`;
    button.addEventListener("click", () => selectSegment({from: item.start_km, to: item.end_km}));
    row.append(button);
    topList.append(row);
  }
  renderBars("direction-chart", data.by_direction);
  renderDashboardCorridor(data);
}

async function loadQuality() {
  const data = await json(`/api/quality/dashboard?${queryParams()}`);
  const root = qs("#quality");
  if (!data.ingestion_run) {
    root.innerHTML = '<p class="empty">적재 이력이 없습니다.</p>';
    return;
  }
  root.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "quality-grid";
  const metrics = [
    ["필터 사고", data.coverage.total],
    ["사고 최신연도", data.freshness.accident_latest_year || "-"],
    ["좌표 기준연도", data.freshness.coordinate_reference_year || "-"],
    ["좌표 결합", data.coverage.matched],
    ["결합률", `${data.coverage.match_rate}%`],
    ["고유 지도점", data.coverage.unique_map_points],
    ["중첩 사고", data.coverage.overlap_records],
    ["미결합", data.coverage.unmatched],
    ["노선참조 없음", data.coverage.missing_route_reference],
    ["변환규칙·이정범위", data.coverage.out_of_range_or_tolerance],
  ];
  for (const [label, rawValue] of metrics) {
    const card = document.createElement("div");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    name.textContent = label;
    value.textContent = typeof rawValue === "number" ? fmt.format(rawValue) : rawValue;
    card.append(name, value);
    grid.append(card);
  }
  root.append(grid);

  const status = qs("#quality-status");
  const gateClass = {
    no_data: " neutral",
    caution: " warn",
    unusable: " bad",
  }[data.quality_gate.level] || "";
  status.className = `status-pill${gateClass}`;
  status.textContent = data.quality_gate.label;
  status.title = `${data.quality_gate.reason} (현재 ${data.coverage.match_rate}%)`;
  qs("#kpi-match-rate").textContent = `${data.coverage.match_rate}%`;
  qs("#workspace-match-rate").textContent = `${data.coverage.match_rate}%`;
  qs("#kpi-quality-label").textContent = data.quality_gate.label;
  if (qs("#route").value) {
    qs("#route-support-note").textContent = `${displayRouteName(qs("#route").value)} · 지도 ${fmt.format(data.coverage.matched)}/${fmt.format(data.coverage.total)}건 · ${data.coverage.match_rate}%`;
    qs("#route-support-note").className = `route-support-note ${data.quality_gate.level === "good" ? "good" : data.quality_gate.level === "caution" ? "partial" : "unavailable"}`;
  }
  qs("#hero-period").textContent = data.dataset_period.start_year === data.dataset_period.end_year
    ? String(data.dataset_period.start_year)
    : `${data.dataset_period.start_year}–${data.dataset_period.end_year}`;
  qs("#hero-coordinate-year").textContent = data.coordinate_run?.source_year ? `${data.coordinate_run.source_year}년` : "미적재";

  const issueList = qs("#quality-issues");
  issueList.innerHTML = "";
  for (const issue of data.issues) {
    const row = document.createElement("li");
    row.textContent = `${issue.issue_code} · ${issue.field_name} · ${fmt.format(issue.count)}건`;
    issueList.append(row);
  }
  if (!data.issues.length) issueList.innerHTML = "<li>등록된 품질 이슈 없음</li>";

  const unmatchedList = qs("#unmatched-routes");
  unmatchedList.innerHTML = "";
  for (const item of data.unmatched_routes) {
    const row = document.createElement("li");
    row.textContent = `${displayRouteName(item.route_name)} · ${fmt.format(item.count)}건`;
    unmatchedList.append(row);
  }
  if (!data.unmatched_routes.length) unmatchedList.innerHTML = "<li>현재 조건의 미결합 사고 없음</li>";

  const ingestion = data.ingestion_run;
  const coordinate = data.coordinate_run;
  const period = data.dataset_period.start_year === data.dataset_period.end_year
    ? `${data.dataset_period.start_year}`
    : `${data.dataset_period.start_year}–${data.dataset_period.end_year}`;
  const mappingNote = data.route_mappings.length
    ? ` | 노선변환 ${data.route_mappings.map((item) => `${item.coordinate_route_name}(${item.mapping_type})`).join(", ")}`
    : "";
  qs("#lineage").textContent = `사고기간 ${period} · ${data.freshness.note} · 사고원천 ${ingestion.source_name} · ${ingestion.file_name} · SHA256 ${ingestion.file_sha256} · 적재 ${ingestion.accepted_rows}/${ingestion.total_rows}행 | 좌표원천 ${coordinate?.source_name || "미적재"} · 기준연도 ${coordinate?.source_year || "-"} · ${coordinate?.file_name || "-"} · 좌표점 ${coordinate ? fmt.format(coordinate.point_count) : "-"}${mappingNote}`;
}

function renderInterpretation(data) {
  const root = qs("#query-interpretation");
  root.innerHTML = "";
  const heading = document.createElement("strong");
  heading.textContent = data.status === "interpreted" ? "이렇게 이해했습니다" : "조건을 해석하지 못했습니다";
  root.append(heading);

  const chips = document.createElement("div");
  chips.className = "filter-chips";
  const labels = {year: "연도", route: "노선", cause: "원인"};
  for (const [key, value] of Object.entries(data.filters)) {
    const chip = document.createElement("span");
    chip.textContent = `${labels[key] || key}: ${value}`;
    chips.append(chip);
  }
  root.append(chips);

  if (data.unparsed_tokens.length) {
    const unparsed = document.createElement("p");
    unparsed.className = "assist-warning";
    unparsed.textContent = `인식하지 못한 표현: ${data.unparsed_tokens.join(", ")}`;
    root.append(unparsed);
  }
  for (const warningText of data.warnings) {
    const warning = document.createElement("p");
    warning.className = "assist-warning";
    warning.textContent = warningText;
    root.append(warning);
  }
  const audit = document.createElement("small");
  audit.textContent = `확인 가능한 조건 해석 · 적용 전 확인 ${data.execution_requires_confirmation ? "필수" : "불가"} · 감사ID ${data.query_uid}`;
  root.append(audit);
}

async function interpretNaturalQuery() {
  const question = qs("#natural-query").value.trim();
  if (!question) return;
  const button = qs("#interpret-query");
  button.disabled = true;
  try {
    interpretedQuery = await postJson("/api/assist/search/interpret", {question});
    renderInterpretation(interpretedQuery);
    qs("#apply-interpreted").disabled = interpretedQuery.status !== "interpreted";
  } catch (error) {
    qs("#query-interpretation").textContent = `조건을 해석하지 못했습니다. 위 필터를 직접 선택해 주세요: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function applyInterpretedQuery() {
  if (!interpretedQuery || interpretedQuery.status !== "interpreted") return;
  const decision = await postJson("/api/assist/search/decision", {
    query_uid: interpretedQuery.query_uid,
    confirmed: true,
  });
  for (const [key, value] of Object.entries(decision.filters)) {
    const field = qs(`#${key}`);
    if (field && [...field.options].some((option) => option.value === String(value))) field.value = String(value);
  }
  activeSegment = null;
  focusedAccidentUid = null;
  qs("#apply-interpreted").disabled = true;
  const audit = document.createElement("p");
  audit.className = "assist-confirmed";
  audit.textContent = "사용자가 확인한 조건을 조회에 적용했습니다.";
  qs("#query-interpretation").append(audit);
  await refresh();
}

function renderReport(report) {
  const root = qs("#report-preview");
  root.innerHTML = "";
  const banner = document.createElement("div");
  banner.className = "draft-banner";
  banner.textContent = "검토 전 초안 · 자동 승인/배포 금지";
  root.append(banner);
  const meta = document.createElement("small");
  meta.textContent = `보고서 ${report.report_uid} · ${report.generation_method} · ${report.created_at}`;
  root.append(meta);
  for (const section of report.sections) {
    const block = document.createElement("section");
    const heading = document.createElement("h4");
    const body = document.createElement("p");
    heading.textContent = section.heading;
    body.textContent = section.body;
    block.append(heading, body);
    root.append(block);
  }
  const evidenceHeading = document.createElement("h4");
  evidenceHeading.textContent = `근거 연결 ${report.evidence.length}건`;
  root.append(evidenceHeading);
  const list = document.createElement("ul");
  list.className = "evidence-list";
  for (const item of report.evidence) {
    const row = document.createElement("li");
    const label = document.createElement(item.ref.startsWith("/") ? "a" : "span");
    label.textContent = `${item.fact_id} · ${item.label}`;
    if (label.tagName === "A") {
      label.href = item.ref;
      label.target = "_blank";
      label.rel = "noopener";
    }
    row.append(label);
    list.append(row);
  }
  root.append(list);
  const snapshot = document.createElement("code");
  snapshot.textContent = `데이터 스냅샷 ${report.dataset_snapshot}`;
  root.append(snapshot);
}

async function createReport() {
  const button = qs("#create-report");
  button.disabled = true;
  try {
    const payload = Object.fromEntries(queryParams(false));
    const report = await postJson("/api/assist/reports/draft", payload);
    if (window.ExaiWorkflow?.reportCreated) await ExaiWorkflow.reportCreated(report);
    else renderReport(report);
  } catch (error) {
    qs("#report-preview").textContent = `초안 생성 실패: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function sourceStatusClass(status) {
  if (status === "연계 완료" || status === "시범 연계 완료") return "source-status done";
  if (status === "부분 연계") return "source-status partial";
  if (status === "연계 오류") return "source-status error";
  if (status === "연계 준비" || status === "연계 예정" || status === "승인 반영 대기") return "source-status planned";
  return "source-status unknown";
}

function sourceStatusLabel(status) {
  if (status === "시범 연계 완료") return "연계 완료";
  if (status === "연계 준비") return "연결 대기";
  if (status === "연계 예정") return "미연계";
  return status;
}

function renderTaasAudit(status) {
  taasIntegrationStatus = status;
  const source = status.source || {};
  const rows = Number(status.snapshots?.segment_count || source.record_count || 0);
  const vehicleTypes = Number(status.snapshots?.vehicle_type_count || 0);
  const hasData = rows > 0 && source.integration_status === "부분 연계";
  const hasError = source.integration_status === "연계 오류";
  const approvalPending = source.integration_status === "승인 반영 대기";
  qs("#taas-audit-message").textContent = hasData
    ? `위험구간 ${fmt.format(rows)}개 · 차종 ${fmt.format(vehicleTypes)}개`
    : hasError
      ? friendlyTaasError(source.blocking_reason)
      : approvalPending
        ? "승인 반영 대기"
        : "실데이터 미적재";
  qs("#taas-audit-message").title = hasError || approvalPending ? `기술 상세: ${source.blocking_reason || "확인 필요"}` : "";
  const latestAt = source.last_sync_at || status.latest_run?.completed_at;
  const latestLabel = latestAt
    ? `${status.latest_run?.status === "failed" ? "실패" : "완료"} · ${new Date(latestAt).toLocaleString("ko-KR")}`
    : "실행 없음";
  const metrics = qs("#taas-audit-metrics");
  metrics.innerHTML = "";
  const values = [
    ["인증", status.auth_configured ? "키 설정됨" : "키 미설정"],
    ["실데이터", hasData ? `${fmt.format(rows)}개 선분` : "0개"],
    ["최근 수집", latestLabel],
    ["지도 반영", hasData ? "사용 가능" : "비활성"],
  ];
  for (const [term, description] of values) {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = description;
    wrapper.append(dt, dd);
    metrics.append(wrapper);
  }
  const root = qs(".taas-integration-audit");
  root.dataset.state = hasData ? "available" : hasError ? "error" : approvalPending ? "pending" : "not-loaded";
}

async function loadDataSources() {
  const [data, taasStatus] = await Promise.all([json("/api/data-sources"), json("/api/taas/status")]);
  renderTaasAudit(taasStatus);
  qs("#source-count").textContent = `${fmt.format(data.total)}개 데이터원`;
  const body = qs("#data-source-rows");
  body.innerHTML = "";
  const statusCounts = data.items.reduce((counts, item) => {
    counts[item.integration_status] = (counts[item.integration_status] || 0) + 1;
    return counts;
  }, {});
  const summary = qs("#source-summary");
  summary.innerHTML = "";
  for (const [label, value, tone] of [
    ["연계 완료", (statusCounts["연계 완료"] || 0) + (statusCounts["시범 연계 완료"] || 0), "done"],
    ["TAAS 연계", (statusCounts["연계 준비"] || 0) + (statusCounts["승인 반영 대기"] || 0) + (statusCounts["부분 연계"] || 0), "priority"],
    ["미연계", statusCounts["연계 예정"] || 0, "planned"],
    ["접근·오류", (statusCounts["미확인"] || 0) + (statusCounts["연계 오류"] || 0), "unknown"],
    ["전체 카탈로그", data.total, "total"],
  ]) {
    const card = document.createElement("div");
    card.className = `source-summary-card ${tone}`;
    const name = document.createElement("span");
    const number = document.createElement("strong");
    name.textContent = label;
    number.textContent = `${fmt.format(value)}개`;
    card.append(name, number);
    summary.append(card);
  }
  for (const item of data.items) {
    const row = document.createElement("tr");
    const sourceCell = document.createElement("td");
    const sourceName = document.createElement(item.source_url ? "a" : "strong");
    sourceName.textContent = item.name;
    if (item.source_url) {
      sourceName.href = item.source_url;
      sourceName.target = "_blank";
      sourceName.rel = "noopener";
    }
    const provider = document.createElement("small");
    provider.textContent = item.provider;
    if (item.priority_rank <= 3) {
      const priority = document.createElement("span");
      priority.className = "source-priority";
      priority.textContent = `${item.integration_phase} · 우선순위 ${item.priority_rank}`;
      sourceCell.append(priority);
    }
    sourceCell.append(sourceName, provider);

    const purpose = document.createElement("td");
    purpose.textContent = item.purpose_class;
    const access = document.createElement("td");
    access.textContent = `${item.access_method} · ${item.auth_requirement}`;
    const period = document.createElement("td");
    period.textContent = `${item.latest_period || "미확인"} · ${item.update_cycle}`;
    const status = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = sourceStatusClass(item.integration_status);
    badge.textContent = sourceStatusLabel(item.integration_status);
    status.append(badge);
    const application = document.createElement("td");
    const policy = document.createElement("strong");
    policy.textContent = item.combine_policy;
    const limitation = document.createElement("small");
    limitation.textContent = item.limitations;
    application.append(policy, limitation);
    row.append(sourceCell, purpose, access, period, status, application);
    body.append(row);
  }
}

async function loadVideoCases() {
  const data = await json("/api/video-cases");
  const items = data.items || [];
  const eventCount = items.reduce((sum, item) => sum + (item.scene_event_count || 0), 0);
  const pointCount = items.reduce((sum, item) => sum + (item.trajectory_point_count || 0), 0);
  const vehicleCount = Math.max(0, ...items.map((item) => item.vehicle_count || 0));
  const values = [items.length, eventCount, pointCount, vehicleCount];
  qs("#video-demo-metrics").querySelectorAll("dd").forEach((element, index) => {
    element.textContent = fmt.format(values[index]);
  });
  qs("#video-case-count").textContent = `${fmt.format(items.length)}건`;
  qs("#video-demo-sync").textContent = items.length
    ? `데이터베이스 적재 · 궤적 ${fmt.format(pointCount)}포인트`
    : "분석 데이터 없음";
  qs("#trajectory-demo-link").hidden = !data.demo_available;

  const list = qs("#video-case-list");
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<div class="empty">영상·궤적 사례 없음</div>';
    return;
  }
  for (const item of items) {
    const article = document.createElement("article");
    article.className = "video-case-card";
    const header = document.createElement("header");
    const heading = document.createElement("div");
    const badge = document.createElement("span");
    badge.className = "analysis-status-badge";
    badge.textContent = item.data_mode === "synthetic" ? "분석 처리 완료" : item.data_mode;
    const title = document.createElement("h3");
    title.textContent = item.title;
    heading.append(badge, title);
    const review = document.createElement("span");
    review.className = "video-review-state";
    review.textContent = item.review_status === "demo" ? "분석 완료" : item.review_status;
    header.append(heading, review);

    const facts = document.createElement("dl");
    for (const [term, value] of [
      ["장면", `${fmt.format(item.scene_event_count || 0)}개`],
      ["궤적", `${fmt.format(item.trajectory_point_count || 0)}포인트`],
      ["차량", `${fmt.format(item.vehicle_count || 0)}대`],
      ["근거 유형", item.data_mode === "synthetic" ? "시나리오 데이터" : "실제 사고"],
    ]) {
      const wrapper = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      wrapper.append(dt, dd);
      facts.append(wrapper);
    }
    const footer = document.createElement("footer");
    const warning = document.createElement("p");
    warning.textContent = item.data_mode === "synthetic" ? "시나리오 분석" : "검토 완료";
    const open = document.createElement("a");
    open.href = data.demo_url;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "영상·평면 궤적 보기 →";
    footer.append(warning, open);
    article.append(header, facts, footer);
    list.append(article);
  }
}

const RECONSTRUCTION_DEMO = Object.freeze([
  {time: -4, a: [110, 68, 5], b: [115, 232, -4], ttc: 4.8, pet: 3.2, drac: 1.4, state: "접근"},
  {time: -3, a: [205, 78, 8], b: [210, 220, -7], ttc: 3.7, pet: 2.5, drac: 2.0, state: "접근"},
  {time: -2, a: [300, 100, 12], b: [310, 198, -11], ttc: 2.6, pet: 1.8, drac: 3.1, state: "주의"},
  {time: -1, a: [400, 125, 17], b: [410, 175, -16], ttc: 1.4, pet: 1.0, drac: 4.8, state: "긴급"},
  {time: 0, a: [492, 145, 23], b: [518, 159, -22], ttc: 0.0, pet: 0.3, drac: 6.5, state: "충돌"},
  {time: 1, a: [600, 120, -16], b: [600, 185, 18], ttc: 0.8, pet: 0.9, drac: 4.1, state: "분리"},
  {time: 2, a: [690, 90, -10], b: [690, 225, 14], ttc: 1.7, pet: 1.5, drac: 2.6, state: "충돌 후"},
]);

function setDemoGauge(id, ratio) {
  const element = qs(`#${id}`);
  const percent = Math.max(0, Math.min(100, ratio * 100));
  element.style.width = `${percent}%`;
  element.style.backgroundColor = percent >= 70 ? "#e65b52" : percent >= 45 ? "#e6a742" : "#54d6e1";
}

function updateReconstructionDemo() {
  const input = qs("#reconstruction-time");
  if (!input) return;
  const frame = RECONSTRUCTION_DEMO.find((item) => item.time === Number(input.value)) || RECONSTRUCTION_DEMO[0];
  const [ax, ay, ar] = frame.a;
  const [bx, by, br] = frame.b;
  qs("#reconstruction-car-a").setAttribute("transform", `translate(${ax} ${ay}) rotate(${ar})`);
  qs("#reconstruction-car-b").setAttribute("transform", `translate(${bx} ${by}) rotate(${br})`);
  qs("#reconstruction-time-label").textContent = frame.time < 0 ? `충돌 ${Math.abs(frame.time)}초 전` : frame.time === 0 ? "충돌 시점" : `충돌 ${frame.time}초 후`;
  qs("#safety-demo-state").textContent = frame.state;
  qs("#demo-ttc").textContent = frame.ttc.toFixed(1);
  qs("#demo-pet").textContent = frame.pet.toFixed(1);
  qs("#demo-drac").textContent = frame.drac.toFixed(1);
  const ttcRisk = 1 - Math.min(frame.ttc, 5) / 5;
  const petRisk = 1 - Math.min(frame.pet, 4) / 4;
  const dracRisk = Math.min(frame.drac, 7) / 7;
  setDemoGauge("demo-ttc-bar", ttcRisk);
  setDemoGauge("demo-pet-bar", petRisk);
  setDemoGauge("demo-drac-bar", dracRisk);
  qs("#demo-risk-point").style.left = `${12 + Math.max(ttcRisk, petRisk, dracRisk) * 76}%`;
}

function extractDemoFields() {
  const text = qs("#demo-source-text").value.trim();
  const match = (pattern, fallback = "미인식") => text.match(pattern)?.[1] || fallback;
  const dateMatch = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  const timeMatch = text.match(/(\d{1,2})시\s*(\d{1,2})분/);
  const fields = [
    ["일시", dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")} ${timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2].padStart(2, "0")}` : ""}` : "미인식"],
    ["노선", match(/([가-힣]+선)\s/)],
    ["방향", match(/([가-힣]+방향)/)],
    ["이정", `${match(/([\d.]+)\s*km/)}km`],
    ["사고유형", match(/(추돌|충돌|전복|화재|보행자)/)],
    ["부상", `${match(/부상자?\s*(\d+)명/)}명`],
  ];
  const output = qs("#demo-extraction-output");
  const status = qs("#demo-extraction-status");
  output.innerHTML = "";
  for (const [label, value] of fields) {
    const field = document.createElement("div");
    field.className = `extraction-field${value.includes("미인식") ? " missing" : ""}`;
    const name = document.createElement("small");
    const result = document.createElement("strong");
    name.textContent = label;
    result.textContent = value;
    field.append(name, result);
    output.append(field);
  }
  status.textContent = "추출 완료";
  status.dataset.state = "complete";
}

async function refresh({silent = false} = {}) {
  const workspace = qs("#workspace");
  const applyButton = qs("#apply");
  const recordButton = qs("#record-search-apply");
  const originalApplyLabel = applyButton.textContent;
  workspace.setAttribute("aria-busy", "true");
  applyButton.disabled = true;
  applyButton.textContent = "조회 중";
  recordButton.disabled = true;
  const current = [
    qs("#year").value ? `${qs("#year").value}년` : "전체연도",
    displayRouteName(qs("#route").value) || "전체노선",
    qs("#cause").value || "전체원인",
  ];
  if (activeSegment) current.push(`이정 ${segmentLabel()}`);
  qs("#active-filter-summary").textContent = current.join(" · ");
  qs("#workspace-filter").textContent = current.join(" · ");
  renderDrilldownContext();
  const selectedRoute = qs("#route").value;
  const support = routeSupport.get(selectedRoute);
  if (!selectedRoute) {
    qs("#route-support-note").textContent = "전체 노선 · 지도 노선 미선택";
    qs("#route-support-note").className = "route-support-note neutral";
  } else if (support) {
    qs("#route-support-note").textContent = support.map_status === "unavailable"
      ? `${displayRouteName(selectedRoute)} · 좌표 검토 · ${fmt.format(support.matched)}/${fmt.format(support.accidents)}건`
      : `${displayRouteName(selectedRoute)} · 지도 ${fmt.format(support.matched)}/${fmt.format(support.accidents)}건 · ${support.match_rate}%`;
    qs("#route-support-note").className = `route-support-note ${support.map_status}`;
  }
  try {
    await Promise.all([loadSummary(), loadAccidents(), loadMap(), loadCorridor(), loadQuality()]);
    syncRouteState();
  } catch (error) {
    console.error(error);
    if (!silent) alert(`데이터를 불러오지 못했습니다: ${error.message}`);
  } finally {
    workspace.setAttribute("aria-busy", "false");
    applyButton.disabled = window.ExaiPublicData?.mode === "readonly";
    applyButton.textContent = originalApplyLabel;
    recordButton.disabled = false;
  }
}

qs("#apply").addEventListener("click", () => {
  activeSegment = null;
  focusedAccidentUid = null;
  recordPage = 1;
  refresh();
});
qs("#record-search-apply").addEventListener("click", () => { recordPage = 1; refresh(); });
qs("#search").addEventListener("keydown", (event) => { if (event.key === "Enter") { recordPage = 1; refresh(); } });
qs("#record-page-size").addEventListener("change", () => {
  recordPageSize = Number(qs("#record-page-size").value);
  recordPage = 1;
  loadAccidents().catch((error) => console.error(error));
});
qs("#record-prev").addEventListener("click", () => {
  if (recordPage > 1) { recordPage -= 1; loadAccidents().catch((error) => console.error(error)); }
});
qs("#record-next").addEventListener("click", () => {
  recordPage += 1;
  loadAccidents().catch((error) => console.error(error));
});
document.querySelectorAll("[data-record-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextSort = button.dataset.recordSort;
    recordOrder = recordSort === nextSort && recordOrder === "desc" ? "asc" : "desc";
    recordSort = nextSort;
    recordPage = 1;
    loadAccidents().catch((error) => console.error(error));
  });
});
qs("#interpret-query").addEventListener("click", interpretNaturalQuery);
qs("#apply-interpreted").addEventListener("click", applyInterpretedQuery);
qs("#create-report").addEventListener("click", createReport);
qs("#detail-report-create").addEventListener("click", createAccidentReportDraft);
qs("#map-view-country").addEventListener("click", () => setMapViewMode("country"));
qs("#map-view-route").addEventListener("click", () => setMapViewMode("route"));
qs("#taas-layer-toggle").addEventListener("click", () => {
  taasLayerEnabled = !taasLayerEnabled;
  const button = qs("#taas-layer-toggle");
  button.setAttribute("aria-pressed", String(taasLayerEnabled));
  button.textContent = taasLayerEnabled ? "위험도 숨기기" : "위험도 표시";
  renderTaasRiskLayer();
});
qs("#taas-vehicle-type").addEventListener("change", () => loadTaasRisk(qs("#route").value));
qs("#clear-drilldown").addEventListener("click", clearSegmentSelection);
qs("#reconstruction-time")?.addEventListener("input", updateReconstructionDemo);
qs("#run-demo-extraction")?.addEventListener("click", extractDemoFields);
updateReconstructionDemo();

window.addEventListener("hashchange", async () => {
  const state = parseHashState();
  const filtersChanged = applyHashFilters(state.filters, state.filters.size > 0);
  showPage(state.page);
  window.scrollTo({top: 0, behavior: reducedMotion() ? "auto" : "smooth"});
  if (filtersChanged) {
    await refresh();
    if (window.ExaiPublicData?.mode !== "readonly") connectRealtime();
  }
  if (state.page === "detail") await loadAccidentDetail();
});

Promise.all([loadMetadata(), loadDataSources(), loadVideoCases()]).then(async () => {
  const state = parseHashState();
  applyHashFilters(state.filters, state.filters.size > 0);
  showPage(state.page);
  await refresh();
  if (state.page === "detail") await loadAccidentDetail();
  connectRealtime();
}).catch((error) => {
  console.error(error);
  alert(`초기화에 실패했습니다: ${error.message}`);
});
