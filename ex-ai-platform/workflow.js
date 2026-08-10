(function () {
  "use strict";

  const allowedRoles = new Set(["viewer", "analyst", "reviewer", "admin"]);
  const storedRole = sessionStorage.getItem("exai-role");
  let role = allowedRoles.has(storedRole) ? storedRole : "analyst";
  let capabilitySet = new Set();
  const listeners = new Set();
  let currentReport = null;
  let qualityActions = [];

  function isPublicReadonly() {
    return window.ExaiPublicData?.mode === "readonly";
  }

  function headers(extra = {}) {
    return {"X-EXAI-Role": role, ...extra};
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {...options, headers: headers(options.headers || {})});
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        if (payload.detail) detail = payload.detail;
      } catch (_) {
        // JSON 오류 응답이 아니면 HTTP 상태문구를 사용한다.
      }
      throw new Error(detail);
    }
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("application/json") ? response.json() : response.text();
  }

  async function loadCapabilities() {
    if (isPublicReadonly()) {
      capabilitySet = new Set();
      document.body.dataset.role = "viewer";
      document.querySelectorAll("[data-capability]").forEach((element) => { element.hidden = true; });
      const data = {role: "viewer", capabilities: [], readonly: true};
      for (const listener of listeners) listener(data);
      return data;
    }
    const data = await api("/api/session/capabilities");
    capabilitySet = new Set(data.capabilities || []);
    document.body.dataset.role = data.role;
    document.querySelectorAll("[data-capability]").forEach((element) => {
      element.hidden = !capabilitySet.has(element.dataset.capability);
    });
    for (const listener of listeners) listener(data);
    return data;
  }

  function can(capability) {
    return capabilitySet.has(capability);
  }

  function actor() {
    const labels = {viewer: "조회 사용자", analyst: "분석 담당자", reviewer: "검토 승인자", admin: "플랫폼 관리자"};
    return labels[role] || "사용자";
  }

  function currentRole() {
    return role;
  }

  function onRoleChange(listener) {
    listeners.add(listener);
  }

  const reportStatusLabel = {
    draft: "초안",
    reviewed: "검토 대기",
    approved: "승인 완료",
    corrected: "수정 요청",
  };

  function setDisabled(selector, disabled) {
    const element = document.querySelector(selector);
    if (element) element.disabled = disabled;
  }

  function renderReport(report) {
    currentReport = report;
    const preview = document.querySelector("#report-preview");
    const editor = document.querySelector("#report-editor");
    const actions = document.querySelector("#report-actions");
    if (!preview || !editor || !actions) return;
    preview.innerHTML = "";
    preview.dataset.status = report.status;
    const banner = document.createElement("div");
    banner.className = "draft-banner";
    banner.textContent = report.status === "approved" ? "승인 완료 · 배포 가능" : "검토 전 문서 · 자동 배포 금지";
    const meta = document.createElement("small");
    meta.textContent = `${reportStatusLabel[report.status] || report.status} · 버전 ${report.version || 1} · ${report.report_uid}`;
    const title = document.createElement("h3");
    title.textContent = report.title || "교통사고 분석 보고서";
    const body = document.createElement("pre");
    body.className = "report-text-preview";
    body.textContent = report.generated_text || "";
    const evidence = document.createElement("small");
    evidence.textContent = `근거 연결 ${(report.evidence || []).length}건 · 데이터 스냅샷 ${report.dataset_snapshot}`;
    preview.append(banner, meta, title, body, evidence);

    document.querySelector("#report-title").value = report.title || "";
    document.querySelector("#report-body").value = report.generated_text || "";
    document.querySelector("#report-notes").value = report.editor_notes || "";
    document.querySelector("#report-comment").value = report.rejection_reason || "";
    editor.hidden = false;
    actions.hidden = false;
    const editable = ["draft", "corrected"].includes(report.status) && can("report_edit");
    for (const selector of ["#report-title", "#report-body", "#report-notes"]) setDisabled(selector, !editable);
    setDisabled("#save-report", !editable);
    setDisabled("#submit-report", !(["draft", "corrected"].includes(report.status) && can("report_submit")));
    setDisabled("#approve-report", !(report.status === "reviewed" && can("report_approve")));
    setDisabled("#request-report-changes", !(report.status === "reviewed" && can("report_approve")));
    document.querySelector("#export-report").href = `/api/assist/reports/${encodeURIComponent(report.report_uid)}/export`;

    const history = document.querySelector("#report-history");
    history.innerHTML = "";
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `변경이력 ${(report.events || []).length}건`;
    const list = document.createElement("ol");
    for (const event of [...(report.events || [])].reverse()) {
      const row = document.createElement("li");
      row.textContent = `${event.created_at} · ${event.actor} · ${event.event_type}${event.comment ? ` · ${event.comment}` : ""}`;
      list.append(row);
    }
    details.append(summary, list);
    history.append(details);
  }

  async function openReport(reportUid) {
    const report = await api(`/api/assist/reports/${encodeURIComponent(reportUid)}`);
    renderReport(report);
  }

  async function loadReports() {
    const root = document.querySelector("#report-list");
    if (!root) return;
    if (isPublicReadonly()) {
      root.textContent = "공개 버전에서는 보고서 작성·승인 기능을 제공하지 않습니다.";
      return;
    }
    const data = await api("/api/assist/reports?limit=12");
    root.innerHTML = "";
    if (!data.items.length) {
      root.textContent = "보고서 없음";
      return;
    }
    for (const item of data.items) {
      const button = document.createElement("button");
      button.type = "button";
      const title = document.createElement("span");
      const state = document.createElement("b");
      const meta = document.createElement("small");
      title.textContent = item.title;
      state.textContent = reportStatusLabel[item.status] || item.status;
      meta.textContent = `버전 ${item.version} · ${item.updated_at || item.created_at}`;
      button.append(title, state, meta);
      button.addEventListener("click", () => openReport(item.report_uid).catch(showWorkflowError));
      root.append(button);
    }
  }

  function showWorkflowError(error) {
    const preview = document.querySelector("#report-preview");
    if (preview) preview.textContent = `업무 처리를 완료하지 못했습니다: ${error.message}`;
  }

  async function saveReport() {
    if (!currentReport) return;
    const payload = {
      title: document.querySelector("#report-title").value,
      generated_text: document.querySelector("#report-body").value,
      editor_notes: document.querySelector("#report-notes").value,
      actor: actor(),
    };
    const report = await api(`/api/assist/reports/${encodeURIComponent(currentReport.report_uid)}`, {
      method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
    });
    renderReport(report);
    await loadReports();
  }

  async function transitionCurrentReport(action) {
    if (!currentReport) return;
    const payload = {
      action,
      actor: actor(),
      comment: document.querySelector("#report-comment").value,
    };
    const report = await api(`/api/assist/reports/${encodeURIComponent(currentReport.report_uid)}/transition`, {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
    });
    renderReport(report);
    await loadReports();
  }

  const qualityStatusLabel = {
    open: "미배정", in_progress: "조치중", resolved: "승인대기", approved: "승인완료", rejected: "재조치",
  };

  function qualityButton(label, action, enabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.qualityAction = action;
    button.disabled = !enabled;
    return button;
  }

  function renderQualityActions(data) {
    qualityActions = data.items || [];
    const root = document.querySelector("#quality-action-list");
    const count = document.querySelector("#quality-action-count");
    if (!root || !count) return;
    count.textContent = `${data.total}개 조치항목`;
    root.innerHTML = "";
    if (!qualityActions.length) {
      root.textContent = "품질조치 없음";
      return;
    }
    for (const item of qualityActions) {
      const card = document.createElement("article");
      card.className = "quality-action-card";
      card.dataset.severity = item.severity;
      card.dataset.actionUid = item.action_uid;
      const info = document.createElement("div");
      info.className = "quality-action-title";
      const title = document.createElement("h3");
      const description = document.createElement("p");
      const meta = document.createElement("div");
      meta.className = "quality-action-meta";
      title.textContent = item.title;
      description.textContent = item.description;
      for (const value of [qualityStatusLabel[item.status] || item.status, item.severity, item.assignee || "담당자 없음"]) {
        const tag = document.createElement("span");
        tag.textContent = value;
        meta.append(tag);
      }
      info.append(title, description, meta);

      const controls = document.createElement("div");
      controls.className = "quality-action-controls";
      const assigneeLabel = document.createElement("label");
      assigneeLabel.textContent = "담당자";
      const assigneeInput = document.createElement("input");
      assigneeInput.dataset.qualityField = "assignee";
      assigneeInput.value = item.assignee || "";
      assigneeLabel.append(assigneeInput);
      const resolutionLabel = document.createElement("label");
      resolutionLabel.className = "wide";
      resolutionLabel.textContent = "조치 결과";
      const resolutionInput = document.createElement("textarea");
      resolutionInput.rows = 2;
      resolutionInput.dataset.qualityField = "resolution";
      resolutionInput.value = item.resolution || "";
      resolutionLabel.append(resolutionInput);
      const commentLabel = document.createElement("label");
      commentLabel.className = "wide";
      commentLabel.textContent = "승인·재조치 의견";
      const commentInput = document.createElement("input");
      commentInput.dataset.qualityField = "comment";
      commentLabel.append(commentInput);
      const buttons = document.createElement("div");
      buttons.className = "quality-action-buttons";
      buttons.append(
        qualityButton("담당 배정", "assign", can("quality_manage") && ["open", "in_progress", "rejected"].includes(item.status)),
        qualityButton("조치 완료", "resolve", can("quality_manage") && ["open", "in_progress", "rejected"].includes(item.status)),
        qualityButton("승인", "approve", can("quality_approve") && item.status === "resolved"),
        qualityButton("재조치", "reject", can("quality_approve") && item.status === "resolved"),
        qualityButton("다시 열기", "reopen", can("quality_manage") && ["approved", "rejected"].includes(item.status)),
      );
      controls.append(assigneeLabel, resolutionLabel, commentLabel, buttons);
      card.append(info, controls);
      root.append(card);
    }
  }

  async function loadQualityActions() {
    if (isPublicReadonly()) {
      const root = document.querySelector("#quality-action-list");
      const count = document.querySelector("#quality-action-count");
      if (root) root.textContent = "공개 버전에서는 품질조치 이력을 제공하지 않습니다.";
      if (count) count.textContent = "";
      return;
    }
    const status = document.querySelector("#quality-action-status")?.value || "";
    const data = await api(`/api/quality/actions${status ? `?status=${encodeURIComponent(status)}` : ""}`);
    renderQualityActions(data);
  }

  async function syncQuality() {
    const data = await api("/api/quality/actions/sync", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({actor: actor()}),
    });
    renderQualityActions(data);
  }

  async function updateQuality(card, action) {
    const field = (name) => card.querySelector(`[data-quality-field="${name}"]`)?.value || "";
    const payload = {action, actor: actor(), assignee: field("assignee"), resolution: field("resolution"), comment: field("comment")};
    await api(`/api/quality/actions/${encodeURIComponent(card.dataset.actionUid)}`, {
      method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
    });
    await loadQualityActions();
  }

  async function reportCreated(report) {
    await openReport(report.report_uid);
    await loadReports();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const select = document.querySelector("#active-role");
    if (!select) return;
    select.value = role;
    if (isPublicReadonly()) select.disabled = true;
    select.addEventListener("change", async () => {
      role = allowedRoles.has(select.value) ? select.value : "viewer";
      sessionStorage.setItem("exai-role", role);
      await loadCapabilities();
    });
    loadCapabilities().catch((error) => console.error("권한정보 확인 실패", error));
    document.querySelector("#save-report")?.addEventListener("click", () => saveReport().catch(showWorkflowError));
    document.querySelector("#submit-report")?.addEventListener("click", () => transitionCurrentReport("submit_review").catch(showWorkflowError));
    document.querySelector("#approve-report")?.addEventListener("click", () => transitionCurrentReport("approve").catch(showWorkflowError));
    document.querySelector("#request-report-changes")?.addEventListener("click", () => transitionCurrentReport("request_changes").catch(showWorkflowError));
    document.querySelector("#print-report")?.addEventListener("click", () => window.print());
    document.querySelector("#refresh-reports")?.addEventListener("click", () => loadReports().catch(showWorkflowError));
    document.querySelector("#sync-quality-actions")?.addEventListener("click", () => syncQuality().catch((error) => { document.querySelector("#quality-action-list").textContent = error.message; }));
    document.querySelector("#quality-action-status")?.addEventListener("change", () => loadQualityActions().catch(console.error));
    document.querySelector("#quality-action-list")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-quality-action]");
      const card = button?.closest(".quality-action-card");
      if (button && card) updateQuality(card, button.dataset.qualityAction).catch((error) => { card.querySelector(".quality-action-title p").textContent = error.message; });
    });
    onRoleChange(() => {
      if (currentReport) renderReport(currentReport);
      loadQualityActions().catch(console.error);
    });
    loadReports().catch(console.error);
    loadQualityActions().catch(console.error);
  });

  window.ExaiWorkflow = {api, headers, can, actor, currentRole, loadCapabilities, onRoleChange, reportCreated};
})();
