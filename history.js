"use strict";

(() => {
  const storageKey = "llm-adaptive-testing.evaluation-history.v1";
  const maxRecords = 20;
  const tableBody = document.querySelector("#history-rows");
  const dialog = document.querySelector("#history-dialog");
  const notice = document.querySelector("#history-notice");
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const scoreValid = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
  const intervalValid = (value) => Array.isArray(value) && value.length === 2 && value.every(scoreValid) && value[0] <= value[1];
  const shortText = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;
  const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
  const formatTime = (value) => new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(value));

  function snapshot(id, completedAt, kind = "local") {
    return {
      id, completedAt, kind,
      model: demo.model, benchmark: demo.benchmark,
      totalItems: demo.totalItems, cleanItems: demo.ask.cleanItems,
      contaminationRate: demo.ask.contaminationRate, contaminationCi: [...demo.ask.ci],
      ability: demo.evaluation.ability, abilityCi: [...demo.evaluation.ci],
      testedItems: demo.evaluation.testedItems, dimensions: copy(demo.dimensions)
    };
  }

  // These examples are explicitly distinguished from locally completed demo runs.
  const examples = [
    snapshot("example-3", "2026-10-12T07:30:00Z", "example"),
    { ...snapshot("example-2", "2026-10-10T02:20:00Z", "example"), ability: 0.65, abilityCi: [0.57, 0.73], testedItems: 70,
      dimensions: demo.dimensions.map((dimension, i) => ({ ...copy(dimension), score: [0.78, 0.70, 0.32, 0.64, 0.57, 0.61][i] })) },
    { ...snapshot("example-1", "2026-10-09T06:10:00Z", "example"), ability: 0.61, abilityCi: [0.52, 0.70], testedItems: 84,
      dimensions: demo.dimensions.map((dimension, i) => ({ ...copy(dimension), score: [0.74, 0.66, 0.28, 0.60, 0.53, 0.57][i] })) }
  ];

  function validRecord(record) {
    return record && shortText(record.id) && record.kind === "local" &&
      shortText(record.completedAt) && Number.isFinite(Date.parse(record.completedAt)) &&
      shortText(record.model) && shortText(record.benchmark) &&
      scoreValid(record.ability) && intervalValid(record.abilityCi) &&
      scoreValid(record.contaminationRate) && intervalValid(record.contaminationCi) &&
      positiveInteger(record.totalItems) && positiveInteger(record.cleanItems) &&
      positiveInteger(record.testedItems) && record.testedItems <= record.cleanItems && record.cleanItems <= record.totalItems &&
      Array.isArray(record.dimensions) && record.dimensions.length === demo.dimensions.length &&
      record.dimensions.every((dimension, index) => dimension && dimension.name === demo.dimensions[index].name &&
        scoreValid(dimension.score) && scoreValid(dimension.moduleScore) && shortText(dimension.module) &&
        Array.isArray(dimension.skills) && dimension.skills.length > 0 && dimension.skills.length <= 10 &&
        dimension.skills.every((skill) => Array.isArray(skill) && shortText(skill[0]) && typeof skill[1] === "boolean"));
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid history data");
      const valid = parsed.filter(validRecord);
      if (valid.length !== parsed.length) notice.textContent = "部分本地记录无法读取，已显示可用记录与预置示例。";
      return valid.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, maxRecords);
    } catch {
      notice.textContent = "无法读取浏览器历史记录；仍可查看预置示例，本次结果将保留在当前页面。";
      return [];
    }
  }

  let localRecords = loadRecords();
  let records = [];
  const weakestDimension = (record) => record.dimensions.reduce((weakest, dimension) => dimension.score < weakest.score ? dimension : weakest);

  function renderHistory() {
    records = [...localRecords, ...examples].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
    document.querySelector("#history-count").textContent = `${records.length} 条记录`;
    tableBody.innerHTML = records.map((record) => {
      const weakest = weakestDimension(record);
      return `<tr>
        <td data-label="完成时间"><time datetime="${escapeHtml(record.completedAt)}">${escapeHtml(formatTime(record.completedAt))}</time><small class="history-origin ${record.kind === "local" ? "local" : ""}">${record.kind === "local" ? "本地演示" : "预置示例"}</small></td>
        <td data-label="模型 / 题库"><strong>${escapeHtml(record.model)}</strong><small>${escapeHtml(record.benchmark)}</small></td>
        <td data-label="综合能力"><b class="history-score">${record.ability.toFixed(2)}</b><small>95% CI [${record.abilityCi.map((value) => value.toFixed(2)).join(", ")}]</small></td>
        <td data-label="测评题量"><span class="mono">${record.testedItems} / ${record.cleanItems}</span><small>节省 ${((1 - record.testedItems / record.cleanItems) * 100).toFixed(1)}%</small></td>
        <td data-label="主要薄弱项"><span class="history-weak">${escapeHtml(weakest.name)}</span><small>能力 ${weakest.score.toFixed(2)}</small></td>
        <td class="history-action"><button type="button" class="text-button history-open" data-history-id="${escapeHtml(record.id)}" aria-label="查看 ${escapeHtml(formatTime(record.completedAt))} ${escapeHtml(record.model)} 的测评结果">查看结果</button></td>
      </tr>`;
    }).join("");
  }

  function openResult(record) {
    const weakest = weakestDimension(record);
    document.querySelector("#history-detail-meta").textContent = `${record.model} · ${formatTime(record.completedAt)}（北京时间）· ${record.kind === "local" ? "本地演示" : "预置示例"}`;
    document.querySelector("#history-detail-content").innerHTML = `
      <div class="history-detail-metrics">
        <div><span>综合能力</span><strong>${record.ability.toFixed(2)}</strong><small>95% CI [${record.abilityCi.map((value) => value.toFixed(2)).join(", ")}]</small></div>
        <div><span>测评题量</span><strong>${record.testedItems}<small> / ${record.cleanItems}</small></strong><small>题量节省 ${((1 - record.testedItems / record.cleanItems) * 100).toFixed(1)}%</small></div>
        <div><span>估计污染率</span><strong>${(record.contaminationRate * 100).toFixed(1)}%</strong><small>95% CI [${record.contaminationCi.map((value) => `${(value * 100).toFixed(1)}%`).join(", ")}]</small></div>
        <div><span>保留可信样本</span><strong>${record.cleanItems}</strong><small>原始题库 ${record.totalItems.toLocaleString("zh-CN")} 条</small></div>
      </div>
      <div class="history-detail-grid">
        <div class="history-detail-chart"><h4>多维能力画像</h4><div class="radar-chart">${radarMarkup(record.dimensions)}</div></div>
        <div class="history-detail-dimensions"><h4>能力分布</h4>${record.dimensions.map((dimension) => `<div><span>${escapeHtml(dimension.name)}</span><span class="history-detail-bar"><i style="width:${dimension.score * 100}%"></i></span><b>${dimension.score.toFixed(2)}</b></div>`).join("")}</div>
      </div>
      <div class="history-detail-weakness"><span class="micro-label">主要薄弱项</span><h4>${escapeHtml(weakest.name)} <span>›</span> ${escapeHtml(weakest.module)} <b>${weakest.moduleScore.toFixed(2)}</b></h4><ul>${weakest.skills.map(([name, mastered]) => `<li class="${mastered ? "mastered" : ""}"><span>${mastered ? "✓" : "✕"}</span>${escapeHtml(name)}<small>${mastered ? "已掌握" : "待加强"}</small></li>`).join("")}</ul></div>`;
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-id]");
    if (!button) return;
    const record = records.find((item) => item.id === button.dataset.historyId);
    if (record) openResult(record);
  });

  document.addEventListener("evaluation-completed", () => {
    const now = new Date();
    localRecords.unshift(snapshot(`evaluation-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, now.toISOString()));
    localRecords = localRecords.slice(0, maxRecords);
    try {
      localStorage.setItem(storageKey, JSON.stringify(localRecords));
      notice.textContent = "";
    } catch {
      notice.textContent = "浏览器未能保存历史记录，本次结果仅保留在当前页面，刷新后可能丢失。";
    }
    renderHistory();
  });

  renderHistory();
})();
