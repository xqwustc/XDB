(function () {
  "use strict";

  const STORAGE_KEY = "topic3-catalyst-model-history.v1";
  const MAX_RECORDS = 20;
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const dateText = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未记录";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(date);
  };
  const text = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;
  const layers = (record) => {
    const selected = record && record.localization && record.localization.selectedLayers;
    return Array.isArray(selected) ? selected.filter((item) => Number.isInteger(item)).map((item) => `L${item}`) : [];
  };

  // These records make the management view useful before the first local save.
  const examples = [
    {
      schema: 3, kind: "example", id: "example-catalyst-02", name: "Qwen2.5-7B-Instruct · 催化剂知识更新",
      savedAt: "2026-10-18T08:20:00Z", modelLabel: "Qwen2.5-7B-Instruct", sourceRecordId: "EXPERT-CATALYST-001",
      localization: { selectedLayers: [9, 13, 17], fact: { selected: [{ layer: 13 }] }, procedure: { selected: [{ layer: 9 }, { layer: 17 }] } },
      training: { steps: 100 }, tests: { "0": {}, "1": {}, "2": {}, "3": {} },
      parameterPolicy: { protected: "通用参数", encouraged: "专业参数" }
    },
    {
      schema: 3, kind: "example", id: "example-catalyst-01", name: "Qwen2.5-7B-Instruct · 初版局部更新",
      savedAt: "2026-10-12T07:30:00Z", modelLabel: "Qwen2.5-7B-Instruct", sourceRecordId: "EXPERT-CATALYST-001",
      localization: { selectedLayers: [9, 13], fact: { selected: [{ layer: 13 }] }, procedure: { selected: [{ layer: 9 }] } },
      training: { steps: 80 }, tests: { "0": {}, "1": {}, "2": {}, "3": {} },
      parameterPolicy: { protected: "通用参数", encouraged: "专业参数" }
    }
  ];

  let notice = "";
  let localRecords = load();
  let dialog;

  function valid(record) {
    return record && typeof record === "object" && typeof record.id === "string" && record.id.length <= 160 &&
      typeof record.name === "string" && record.name.length > 0 && record.name.length <= 80 &&
      typeof record.savedAt === "string" && !Number.isNaN(Date.parse(record.savedAt)) &&
      (record.schema === 3 || record.format === "topic3-demo-parameter-snapshot");
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        notice = "本地历史格式无法读取，已显示预置示例。";
        return [];
      }
      const records = parsed.filter(valid).map(record => {
        const legacyNames = ["Qwen-" + "Cat · 催化知识更新", "Qwen-" + "Cat · 催化剂知识更新", "Qwen-" + "Cat · 初版局部更新"];
        return legacyNames.includes(record.name)
          ? { ...record, name: record.name.replace("Qwen-" + "Cat", "Qwen2.5-7B-Instruct") }
          : record;
      });
      if (records.length !== parsed.length) notice = "部分本地记录无法读取，已显示可用记录与预置示例。";
      return records.sort(sortNewest).slice(0, MAX_RECORDS);
    } catch (error) {
      notice = "浏览器本地存储不可用，当前历史只保留在本次页面会话中。";
      return [];
    }
  }

  function sortNewest(a, b) { return Date.parse(b.savedAt) - Date.parse(a.savedAt); }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localRecords));
      notice = "";
      return true;
    } catch (error) {
      notice = "浏览器本地存储不可用，当前历史只保留在本次页面会话中。";
      return false;
    }
  }

  function allRecords() { return [...localRecords, ...examples].sort(sortNewest); }

  function normalize(snapshot) {
    const record = copy(snapshot || {});
    const now = new Date().toISOString();
    record.schema = 3;
    record.kind = "local";
    record.id = text(record.id, `DEMO-CATALYST-${Date.now()}`);
    record.name = text(record.name, `${text(record.modelLabel, "模型")} · 催化剂知识更新`);
    record.name = record.name.slice(0, 80);
    record.savedAt = text(record.savedAt, now);
    return record;
  }

  function save(snapshot) {
    const record = normalize(snapshot);
    localRecords = [record, ...localRecords.filter((item) => item.id !== record.id)].sort(sortNewest).slice(0, MAX_RECORDS);
    const persisted = persist();
    if (dialog && dialog.open) renderDialog();
    return { persisted, record: copy(record), message: notice };
  }

  function rename(id, name) {
    const value = String(name == null ? "" : name).trim();
    if (!value || value.length > 80) return { ok: false, message: "名称长度需为 1–80 个字符。" };
    const index = localRecords.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, message: "预置示例不可修改，或记录已不存在。" };
    localRecords[index] = { ...localRecords[index], name: value };
    const persisted = persist();
    if (dialog && dialog.open) renderDialog(id);
    const record = copy(localRecords[index]);
    window.dispatchEvent(new CustomEvent("model-history-renamed", { detail: record }));
    return { ok: true, persisted, record, message: notice };
  }

  function installStyle() {
    if (!document.getElementById("model-history-page-style")) {
      const link = document.createElement("link");
      link.id = "model-history-page-style";
      link.rel = "stylesheet";
      link.href = "history-page.css";
      document.head.append(link);
    }
    if (document.getElementById("model-history-style")) return;
    const style = document.createElement("style");
    style.id = "model-history-style";
    style.textContent = `
      #model-history-dialog{width:min(1060px,calc(100vw - 32px));max-height:88vh;border:1px solid #d8e1ec;border-radius:12px;padding:0;color:#172b46;background:#fff;box-shadow:0 20px 70px #172b4630}
      #model-history-dialog::backdrop{background:#172b4666}
      .mh-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:24px 28px 18px;border-bottom:1px solid #e2eaf4}
      .mh-head h2{margin:0;font-size:20px}.mh-head p{margin:6px 0 0;color:#607189;font-size:13px}.mh-close{border:1px solid #bdcde0;background:#fff;color:#34516f;border-radius:6px;padding:7px 12px;cursor:pointer}
      .mh-body{padding:20px 28px 28px;overflow:auto}.mh-notice{margin:0 0 14px;color:#7a3fad;font-size:12px}.mh-table{width:100%;border-collapse:collapse;font-size:13px}.mh-table th{text-align:left;color:#607189;font-size:11px;font-weight:600;padding:10px 12px;border-bottom:1px solid #d8e1ec}.mh-table td{padding:14px 12px;border-bottom:1px solid #edf1f6;vertical-align:middle}.mh-table tr:hover td{background:#f7faff}.mh-name{font-weight:650;color:#174e99}.mh-table small{display:block;color:#607189;margin-top:4px}.mh-tag{display:inline-block;border-radius:999px;padding:3px 8px;font-size:10px;color:#087f68;background:#edf8f3}.mh-tag.example{color:#607189;background:#f1f4f8}.mh-action{white-space:nowrap}.mh-action button{border:0;background:none;color:#2563b8;cursor:pointer;padding:4px 5px}.mh-action button+button{margin-left:6px}.mh-empty{padding:38px 10px;text-align:center;color:#607189;border:1px dashed #bdcde0;border-radius:8px}.mh-detail{margin-top:18px;padding:18px;border:1px solid #d8e1ec;background:#f7faff;border-radius:8px}.mh-detail h3{margin:0 0 7px;font-size:17px}.mh-detail-meta{color:#607189;font-size:12px;margin:0 0 15px}.mh-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.mh-facts div{padding:12px;background:#fff;border:1px solid #e2eaf4;border-radius:6px}.mh-facts span{display:block;color:#607189;font-size:11px}.mh-facts b{display:block;margin-top:5px;color:#174e99}.mh-edit{display:flex;gap:8px;margin-top:15px}.mh-edit input{flex:1;border:1px solid #bdcde0;border-radius:5px;padding:8px 10px;color:#172b46}.mh-primary{border:1px solid #2563b8;border-radius:5px;padding:8px 13px;background:#2563b8;color:#fff;cursor:pointer}.mh-secondary{border:1px solid #bdcde0;border-radius:5px;padding:8px 13px;background:#fff;color:#34516f;cursor:pointer}
      @media(max-width:720px){.mh-body,.mh-head{padding-inline:16px}.mh-table th:nth-child(3),.mh-table td:nth-child(3){display:none}.mh-facts{grid-template-columns:repeat(2,1fr)}}`;
    document.head.append(style);
  }

  function ensureDialog() {
    if (dialog) return dialog;
    installStyle();
    dialog = document.createElement("dialog");
    dialog.id = "model-history-dialog";
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    return dialog;
  }

  function tableMarkup(records) {
    if (!records.length) return '<div class="mh-empty">还没有保存的模型参数记录。</div>';
    return `<table class="mh-table"><thead><tr><th>模型版本</th><th>保存时间</th><th>关键层</th><th>状态</th><th></th></tr></thead><tbody>${records.map((record) => {
      const selected = layers(record);
      const status = record.kind === "example" ? '<span class="mh-tag example">预置示例</span>' : '<span class="mh-tag">本次保存</span>';
      return `<tr><td><strong class="mh-name">${esc(record.name)}</strong><small>${esc(text(record.modelLabel, "演示模型"))} · ${esc(text(record.sourceRecordId, "示例任务"))}</small></td><td>${esc(dateText(record.savedAt))}</td><td>${selected.length ? esc(selected.join(" · ")) : "—"}</td><td>${status}</td><td class="mh-action"><button data-model-history-action="detail" data-history-id="${esc(record.id)}">查看</button>${record.kind === "local" ? `<button data-model-history-action="rename" data-history-id="${esc(record.id)}">改名</button>` : ""}</td></tr>`;
    }).join("")}</tbody></table>`;
  }

  function detailMarkup(record) {
    if (!record) return "";
    const selected = layers(record);
    const fact = record.localization && record.localization.fact && record.localization.fact.selected;
    const procedure = record.localization && record.localization.procedure && record.localization.procedure.selected;
    const tests = record.tests && typeof record.tests === "object" ? Object.keys(record.tests).length : 0;
    const policy = record.parameterPolicy || {};
    return `<section class="mh-detail"><h3>${esc(record.name)}</h3><p class="mh-detail-meta">${esc(text(record.modelLabel, "演示模型"))} · ${esc(dateText(record.savedAt))} · ${record.kind === "example" ? "预置示例" : "本地保存"}</p><div class="mh-facts"><div><span>定位关键层</span><b>${selected.length ? esc(selected.join(" · ")) : "未记录"}</b></div><div><span>事实 / 程序定位</span><b>${Array.isArray(fact) ? fact.length : 0} / ${Array.isArray(procedure) ? procedure.length : 0}</b></div><div><span>训练步数</span><b>${esc(record.training && record.training.steps || "—")}</b></div><div><span>测试完成</span><b>${tests ? `${tests} 项` : "—"}</b></div></div><p class="mh-detail-meta">参数策略：保护 ${esc(text(policy.protected, "通用参数"))}，鼓励更新 ${esc(text(policy.encouraged, "专业参数"))}。</p>${record.kind === "local" ? `<div class="mh-edit"><input maxlength="80" data-model-history-name value="${esc(record.name)}" aria-label="模型版本名称"><button class="mh-primary" data-model-history-action="save-name" data-history-id="${esc(record.id)}">保存名称</button></div>` : ""}</section>`;
  }

  function renderDialog(selectedId) {
    const records = allRecords();
    const selected = records.find((record) => record.id === selectedId);
    ensureDialog();
    dialog.setAttribute("aria-labelledby", "model-history-dialog-title");
    dialog.innerHTML = `<div class="mh-head"><div><h2 id="model-history-dialog-title">${selected ? "模型版本详情" : "模型参数版本管理"}</h2><p>查看定位范围、训练测试记录与参数更新策略。</p></div><div><button class="mh-secondary" data-model-history-action="export" ${selected ? `data-history-id="${esc(selected.id)}"` : ""}>${selected ? "导出该版本" : "导出记录"}</button> <button class="mh-close" data-model-history-action="close">关闭 ×</button></div></div><div class="mh-body"><p class="mh-notice" data-model-history-notice>${esc(notice)}</p>${selected ? "" : tableMarkup(records)}<div data-model-history-detail>${selected ? detailMarkup(selected) : ""}</div></div>`;
    if (!dialog.open) dialog.showModal();
  }

  function open() { renderDialog(); return dialog; }

  function exportRecords(id) {
    const record = id ? allRecords().find(item => item.id === id) : null;
    if (id && !record) return;
    const blob = new Blob([JSON.stringify(record || allRecords(), null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = record ? `${record.id}-参数快照.json` : `topic3-model-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function view() {
    installStyle();
    const records = allRecords();
    const latest = localRecords[0];
    const rows = records.length ? records.map((record) => {
      const selected = layers(record);
      const tests = record.tests && typeof record.tests === "object" ? Object.keys(record.tests).length : 0;
      const status = record.kind === "example" ? "预置示例" : "本地保存";
      return `<tr><td data-label="保存时间"><time>${esc(dateText(record.savedAt))}</time><small class="history-origin ${record.kind === "local" ? "local" : ""}">${status}</small></td><td data-label="模型版本"><strong class="history-version-name">${esc(record.name)}</strong><small>${esc(text(record.modelLabel, "演示模型"))} · ${esc(text(record.sourceRecordId, "催化剂知识更新"))}</small></td><td data-label="定位范围"><span class="history-layers">${selected.length ? esc(selected.join(" · ")) : "未记录"}</span><small>事实 / 程序定位</small></td><td data-label="训练与测试"><span class="history-mono">${esc(record.training && record.training.steps || "—")} 步</span><small>${tests ? `${tests} 项测试完成` : "测试未记录"}</small></td><td class="history-action"><button type="button" class="history-open" data-model-history-action="detail" data-history-id="${esc(record.id)}">查看详情</button>${record.kind === "local" ? `<button type="button" class="history-open" data-model-history-action="rename" data-history-id="${esc(record.id)}">编辑名称</button>` : ""}<button type="button" class="history-open" data-model-history-action="export" data-history-id="${esc(record.id)}">导出</button></td></tr>`;
    }).join("") : `<tr><td colspan="5" class="history-empty">还没有保存的模型参数记录。</td></tr>`;
    return `<section class="history-page-panel" aria-labelledby="model-history-title"><div class="history-page-heading"><div><h3 id="model-history-title">编辑版本管理</h3><p class="history-page-description">查看已保存的模型参数版本、定位范围与训练测试记录。</p></div><div class="history-page-tools"><span class="history-page-count">${records.length} 条记录</span><button type="button" class="secondary-button history-export" data-model-history-action="export">导出记录</button></div></div><div class="history-page-table-wrap"><table class="history-page-table" aria-label="模型参数版本历史"><thead><tr><th>保存时间</th><th>模型版本</th><th>定位范围</th><th>训练与测试</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div><p class="history-page-notice">${esc(notice)}</p>${latest ? `<p class="history-page-current">当前版本：<strong>${esc(latest.name)}</strong></p>` : ""}</section>`;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-model-history-action]");
    if (!button) return;
    const action = button.dataset.modelHistoryAction;
    if (action === "open") open();
    if (action === "close" && dialog) dialog.close();
    if (action === "detail") renderDialog(button.dataset.historyId);
    if (action === "rename") renderDialog(button.dataset.historyId);
    if (action === "export") exportRecords(button.dataset.historyId);
    if (action === "save-name") {
      const input = dialog && dialog.querySelector("[data-model-history-name]");
      const result = rename(button.dataset.historyId, input && input.value);
      if (!result.ok) { notice = result.message; renderDialog(button.dataset.historyId); }
    }
  });

  window.ModelHistory = { view, save, rename, open, records: allRecords };
})();
