"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
// All values are deliberately fixed mock data; no model or file is uploaded.
const demo = {
  model: "Qwen2.5-7B-Instruct",
  benchmark: "ScienceBench.jsonl",
  totalItems: 1000,
  ask: { contaminationRate: 0.126, ci: [0.098, 0.154], cleanItems: 842 },
  evaluation: { testedItems: 62, ability: 0.69, ci: [0.62, 0.76] },
  dimensions: [
    { name: "数学推理", score: 0.82, module: "逻辑与证明", moduleScore: 0.85, skills: [["命题逻辑", true], ["演绎推理", true], ["反例构造", true]] },
    { name: "物理建模", score: 0.74, module: "力学建模", moduleScore: 0.70, skills: [["受力分析", true], ["守恒定律", true], ["边界条件设定", false]] },
    { name: "化学原理", score: 0.36, module: "化学平衡", moduleScore: 0.30, skills: [["有机反应中的催化剂使用", false], ["温度对 K 的影响", false], ["平衡常数表达式", true]] },
    { name: "生命科学", score: 0.68, module: "细胞与遗传", moduleScore: 0.64, skills: [["细胞结构", true], ["遗传规律", true], ["基因表达调控", false]] },
    { name: "材料科学", score: 0.61, module: "结构与性能", moduleScore: 0.57, skills: [["晶体结构", true], ["缺陷与性能", false], ["相变机制", true]] },
    { name: "地球科学", score: 0.65, module: "地球系统", moduleScore: 0.62, skills: [["地质构造", true], ["水循环", true], ["气候反馈机制", false]] }
  ],
  newDimension: { name: "实验设计", score: 0.52 }
};
const stages = [
  ["配置测评任务", "载入待测模型与题库，开启一次可信的能力诊断。"],
  ["Benchmark 可信性审计", "先检查题库污染风险，再让可信样本进入正式测评。"],
  ["自适应测评执行", "根据模型的当前能力，动态选择最有信息量的题目。"],
  ["认知诊断结果", "从学科到模块，再到知识点，定位模型的能力短板。"],
  ["薄弱环节训练", "围绕认知诊断发现的薄弱知识点进行定向训练。"],
  ["模型自主提问", "模型识别策略性知识缺口，主动向人类专家提问并收集知识。"],
  ["专家知识收集", "将专家回答结构化，写入 Agent Memory 并回流后续训练。"],
  ["能力维度持续扩展", "随着新任务出现，让模型的能力画像持续生长。"]
];
// Keep dimension expansion available in the source, but hide it from this demo.
const visibleStageCount = 7;
const loaded = { model: false, benchmark: false };
const state = { step: 0, unlocked: 0, timer: null, elapsed: 0, lastTime: 0, paused: false, speed: 1, questionCount: -1, selectedDimension: 2 };

function announce(message) {
  $("#announcement").textContent = message;
}

function setStatus(text, kind = "") {
  $("#stage-status").textContent = text;
  $("#stage-status").className = `status-badge ${kind}`;
}

function loadExample(kind) {
  loaded[kind] = true;
  const card = $(`#${kind}-upload`);
  card.classList.add("loaded");
  card.setAttribute("aria-pressed", "true");
  $(`#${kind}-name`).textContent = kind === "model" ? demo.model : demo.benchmark;
  $(`#${kind}-detail`).textContent = kind === "model" ? "7B 参数 · 指令微调模型" : "1,000 items · 科学基础题库";
  $(`#${kind}-action`).textContent = "✓ 已载入";
  $("#session-model").textContent = loaded.model ? demo.model : "等待载入模型";
  $("#session-benchmark").textContent = loaded.benchmark ? "ScienceBench · 1,000 items" : "尚未配置 Benchmark";
  $("#configuration-hint").textContent = loaded.model && loaded.benchmark ? "模型与题库已就绪，可以开始测评" : "请先载入模型与 Benchmark";
  $("#start-button").disabled = !(loaded.model && loaded.benchmark);
  setStatus(loaded.model && loaded.benchmark ? "配置就绪" : "等待配置", loaded.model && loaded.benchmark ? "done" : "");
  announce(kind === "model" ? "示例模型已载入" : "示例题库已载入，共 1,000 道题目");
}

function updateNavigation() {
  $$(".step[data-step]").forEach((button, index) => {
    button.hidden = index >= visibleStageCount;
    button.disabled = index > state.unlocked;
    button.classList.toggle("active", index === state.step);
    button.classList.toggle("complete", index < state.unlocked && index !== state.step);
    if (index === state.step) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
}

function showView(step, focus = true) {
  if (step >= visibleStageCount) return;
  state.step = step;
  state.unlocked = Math.max(step, state.unlocked);
  $$(".view").forEach((view, index) => { view.hidden = index !== step; });
  $("#stage-index").textContent = `STEP ${String(step + 1).padStart(2, "0")} / ${String(visibleStageCount).padStart(2, "0")}`;
  $("#stage-title").textContent = stages[step][0];
  $("#stage-description").textContent = stages[step][1];
  $("#playback-toolbar").hidden = !state.timer;
  updateNavigation();
  document.dispatchEvent(new CustomEvent("demo-view-change", { detail: { step } }));
  if (focus) $("#stage-title").focus({ preventScroll: true });
  announce(stages[step][0]);
}

function stopPlayback() {
  clearInterval(state.timer);
  state.timer = null;
  state.paused = false;
  document.body.classList.remove("paused");
  $("#playback-toolbar").hidden = true;
  $("#pause-button").textContent = "暂停演示";
  $("#playback-label").textContent = "流程自动演示中";
}

function startPlayback() {
  stopPlayback();
  state.elapsed = 0;
  state.questionCount = -1;
  showView(1);
  renderAudit(0);
  state.lastTime = performance.now();
  state.timer = setInterval(tick, 100);
  $("#playback-toolbar").hidden = false;
}

function tick() {
  const now = performance.now();
  const delta = now - state.lastTime;
  state.lastTime = now;
  // Freeze the demonstration in a hidden tab so the presenter never misses a stage.
  if (state.paused || document.hidden) return;
  state.elapsed += Math.min(delta, 250) * state.speed;
  if (state.step === 1) {
    renderAudit(Math.min(1, state.elapsed / 6000));
    if (state.elapsed >= 7000) {
      state.elapsed = 0;
      showView(2);
      renderEvaluation(0);
    }
  } else if (state.step === 2) {
    renderEvaluation(Math.min(demo.evaluation.testedItems, Math.floor(state.elapsed / 250)));
    if (state.elapsed >= 17000) {
      stopPlayback();
      showView(3);
      renderDiagnosis();
      setStatus("诊断已生成", "done");
      document.dispatchEvent(new CustomEvent("evaluation-completed"));
    }
  }
}

function renderAudit(progress) {
  const done = progress >= 1;
  const percentage = Math.round(progress * 100);
  const phase = Math.min(2, Math.floor(progress * 3));
  const messages = ["正在载入并检查 Benchmark 样本…", "正在估计污染率与置信区间…", "正在筛选可信样本…"];
  $("#audit-percentage").textContent = `${percentage}%`;
  $("#audit-progress").setAttribute("aria-valuenow", percentage);
  $("#audit-progress > div").style.width = `${percentage}%`;
  $("#audit-message").textContent = done ? "✓ Benchmark 审计完成，即将进入自适应测评" : messages[phase];
  $("#audit-orbit").classList.toggle("done", done);
  $$(".audit-checks > span").forEach((item, index) => item.classList.toggle("done", progress >= (index + 1) / 3));
  const estimated = progress >= 0.66;
  $("#contamination-rate").textContent = estimated ? `${(demo.ask.contaminationRate * 100).toFixed(1)}%` : "—";
  $("#audit-ci").textContent = estimated ? `[${(demo.ask.ci[0] * 100).toFixed(1)}%, ${(demo.ask.ci[1] * 100).toFixed(1)}%]` : "—";
  $("#clean-count").innerHTML = `${done ? demo.ask.cleanItems : "—"}<small>items</small>`;
  $("#retained-count").textContent = done ? demo.ask.cleanItems : "—";
  $("#retention-note").textContent = done ? "保留 84.2% · 排除 158 条风险样本" : "筛选后进入正式测评";
  $("#raw-samples").innerHTML = Array.from({ length: 50 }, (_, i) => `<i class="${estimated && i >= 42 ? "filtered" : ""}"></i>`).join("");
  $("#clean-samples").classList.toggle("clean", done);
  $("#clean-samples").innerHTML = "<i></i>".repeat(42);
  setStatus(done ? "审计完成" : "审计进行中", done ? "done" : "running");
}

function abilityAt(round) {
  if (round === 62) return { ability: demo.evaluation.ability, lower: demo.evaluation.ci[0], upper: demo.evaluation.ci[1] };
  const progress = round / 62;
  const ability = round === 0 ? 0.5 : 0.5 + 0.19 * (1 - Math.exp(-round / 9)) + Math.sin(round * 0.58) * 0.055 * (1 - progress);
  const margin = 0.07 + 0.31 * Math.pow(1 - progress, 3);
  return { ability, lower: Math.max(0, ability - margin), upper: Math.min(1, ability + margin) };
}

function questionAt(round) {
  const dimensionIndex = (round * 5 + Math.floor(round / 7)) % 6;
  const correct = ((round * 17) % 100) / 100 < demo.dimensions[dimensionIndex].score;
  return { name: demo.dimensions[dimensionIndex].name, correct };
}

function renderConvergence(round) {
  const width = 600, height = 266;
  const x = (r) => 43 + (r / 62) * 530;
  const y = (value) => 217 - value * 177;
  const sequence = Array.from({ length: round + 1 }, (_, r) => ({ round: r, ...abilityAt(r) }));
  const points = (entries, key) => entries.map((entry) => `${x(entry.round).toFixed(1)},${y(entry[key]).toFixed(1)}`).join(" ");
  const band = `${points(sequence, "upper")} ${points([...sequence].reverse(), "lower")}`;
  const current = abilityAt(round);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((value) => `<line x1="43" x2="573" y1="${y(value)}" y2="${y(value)}" stroke="#dce5ef" stroke-dasharray="3 5"/><text x="30" y="${y(value) + 4}" text-anchor="end" fill="#586c86" font-size="11">${value.toFixed(2)}</text>`).join("");
  const ticks = [0, 10, 20, 30, 40, 50, 62].map((r) => `<text x="${x(r)}" y="239" text-anchor="middle" fill="#586c86" font-size="11">${r}</text>`).join("");
  $("#convergence-chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="能力估计收敛图：已测 ${round} 题，能力 ${current.ability.toFixed(2)}，置信区间 ${current.lower.toFixed(2)} 至 ${current.upper.toFixed(2)}"><text x="43" y="20" fill="#586c86" font-size="11">能力估计</text>${grid}${ticks}<polygon points="${band}" fill="#2563b820"/><polyline points="${points(sequence, "upper")}" stroke="#2563b855" stroke-width="1" fill="none"/><polyline points="${points(sequence, "lower")}" stroke="#2563b855" stroke-width="1" fill="none"/><polyline points="${points(sequence, "ability")}" stroke="#2563b8" stroke-width="2.3" fill="none"/><circle cx="${x(round)}" cy="${y(current.ability)}" r="4" fill="#2563b8"/><text x="573" y="262" fill="#586c86" text-anchor="end" font-size="11">测评题量</text></svg>`;
}

function renderEvaluation(round) {
  if (round === state.questionCount) return;
  state.questionCount = round;
  const done = round === demo.evaluation.testedItems;
  const estimate = abilityAt(round);
  $("#tested-count").textContent = round;
  $("#ability-value").textContent = estimate.ability.toFixed(2);
  $("#ability-ci").textContent = `[${estimate.lower.toFixed(2)}, ${estimate.upper.toFixed(2)}]`;
  const rows = [];
  for (let r = Math.max(1, round - 6); r <= round; r++) {
    const question = questionAt(r);
    rows.push(`<li><span><span class="question-id">Q${String(r).padStart(2, "0")}</span>${question.name}</span><span class="answer-icon ${question.correct ? "" : "wrong"}" aria-label="${question.correct ? "回答正确" : "回答错误"}">${question.correct ? "✓" : "✕"}</span></li>`);
  }
  $("#question-list").innerHTML = rows.join("") || '<li class="question-placeholder">正在选择第一道题目…</li>';
  $("#next-question-label").textContent = done ? "自适应测评完成" : "下一道高信息量题目";
  $("#next-question").textContent = done ? "已达到停止条件 ✓" : `Q${String(round + 1).padStart(2, "0")} · ${questionAt(round + 1).name}`;
  $("#evaluation-state").classList.toggle("done", done);
  $("#evaluation-state").innerHTML = done ? "✓ 已达到停止条件，能力估计已稳定" : '<span class="running-dot"></span>根据当前能力状态，选择下一道最有信息量的题目';
  $("#efficiency-value").textContent = done ? `仅测 62 题 · 题量节省 ${((1 - 62 / demo.ask.cleanItems) * 100).toFixed(1)}%` : `置信区间宽度 ${(estimate.upper - estimate.lower).toFixed(2)} · 持续收窄`;
  setStatus(done ? "测评完成" : "测评进行中", done ? "done" : "running");
  renderConvergence(round);
}

function radarMarkup(dimensions, animate = false) {
  const cx = 215, cy = 166, radius = 102;
  const coordinate = (index, value = 1) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / dimensions.length;
    return [cx + Math.cos(angle) * radius * value, cy + Math.sin(angle) * radius * value];
  };
  const polygon = (values) => values.map((value, index) => coordinate(index, value).map((n) => n.toFixed(1)).join(",")).join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map((level) => `<polygon points="${polygon(dimensions.map(() => level))}" fill="none" stroke="#ccd8e6" stroke-width="1"/>`).join("");
  const axes = dimensions.map((dimension, index) => {
    const [x, y] = coordinate(index);
    const [lx, ly] = coordinate(index, 1.32);
    const isNew = dimension.name === demo.newDimension.name;
    const color = isNew ? "#2563b8" : dimension.score < 0.5 ? "#c34e3a" : "#465d7a";
    const align = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
    return `<g class="${isNew ? "new-axis" : ""}"><line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${isNew ? "#2563b899" : "#ccd8e6"}"/><text x="${lx}" y="${ly + 4}" fill="${color}" text-anchor="${align}" font-size="13">${dimension.name}</text>${isNew ? `<text x="${lx}" y="${ly + 22}" fill="#2563b8" text-anchor="${align}" font-size="9" letter-spacing="1.5">NEW</text>` : ""}</g>`;
  }).join("");
  const values = dimensions.map((dimension) => dimension.score);
  const initialValues = values.map((value, index) => index === 6 ? 0 : value);
  const animation = animate && !matchMedia("(prefers-reduced-motion: reduce)").matches ? `<animate attributeName="points" dur="0.9s" from="${polygon(initialValues)}" to="${polygon(values)}" fill="freeze"/>` : "";
  const dots = dimensions.map((dimension, index) => {
    const [x, y] = coordinate(index, dimension.score);
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="${dimension.score < 0.5 ? "#c34e3a" : "#2563b8"}" stroke="#ffffff" stroke-width="1.5"/>`;
  }).join("");
  const description = dimensions.map((dimension) => `${dimension.name} ${dimension.score.toFixed(2)}`).join("，");
  return `<svg viewBox="0 0 430 332" role="img" aria-label="${dimensions.length} 维能力雷达图：${description}">${grid}${axes}<polygon points="${polygon(values)}" fill="#2563b820" stroke="#2563b8" stroke-width="2">${animation}</polygon>${dots}<text x="${cx + 6}" y="${cy - 55}" fill="#60738c" font-size="9">0.5</text><text x="${cx + 6}" y="${cy - 105}" fill="#60738c" font-size="9">1.0</text></svg>`;
}

function renderDiagnosis() {
  // The diagnosis report is the gate for the two follow-up learning stages.
  state.unlocked = Math.max(state.unlocked, 4);
  updateNavigation();
  $("#diagnosis-radar").innerHTML = radarMarkup(demo.dimensions);
  renderKnowledge(state.selectedDimension);
}

function renderKnowledge(index) {
  state.selectedDimension = index;
  $("#dimension-ranking").innerHTML = demo.dimensions.map((dimension, i) => `<button type="button" class="dimension-row ${dimension.score < 0.5 ? "weak" : ""} ${i === index ? "selected" : ""}" data-dimension="${i}" aria-pressed="${i === index}" aria-controls="knowledge-items"><span>${dimension.name}</span><span class="dimension-bar"><i style="width:${dimension.score * 100}%"></i></span><span class="dimension-value">${dimension.score.toFixed(2)}</span><span class="dimension-label">${dimension.score < 0.5 ? "薄弱" : ""}</span></button>`).join("");
  const dimension = demo.dimensions[index];
  const weak = dimension.score < 0.5;
  $("#knowledge-title").innerHTML = `${dimension.name} <span>›</span> ${dimension.module} <b style="color:${weak ? "var(--coral)" : "var(--gold)"}">${dimension.moduleScore.toFixed(2)}</b>`;
  $("#knowledge-badge").textContent = weak ? "主要薄弱模块" : "知识点诊断";
  $("#knowledge-badge").classList.toggle("good", !weak);
  $("#knowledge-items").innerHTML = dimension.skills.map(([name, mastered]) => `<div class="knowledge-item ${mastered ? "mastered" : ""}"><span class="knowledge-result" aria-label="${mastered ? "已掌握" : "待加强"}">${mastered ? "✓" : "✕"}</span><span>${name}</span><small>${mastered ? "已掌握" : "待加强"}</small></div>`).join("");
}

function showExtension() {
  if (visibleStageCount < 8) return;
  stopPlayback();
  showView(7);
  $("#original-radar").innerHTML = radarMarkup(demo.dimensions);
  $("#expanded-radar").innerHTML = radarMarkup([...demo.dimensions, demo.newDimension], true);
  setStatus("新维度已纳入", "done");
}

function visitStep(step) {
  if (step >= visibleStageCount || step > state.unlocked || step === state.step) return;
  // Revisiting finished stages displays their final state without starting new timers.
  // A running stage is discarded when navigating away; it cannot be shown as completed.
  if (state.timer) state.unlocked = state.step - 1;
  stopPlayback();
  showView(step);
  if (step === 0) setStatus(loaded.model && loaded.benchmark ? "配置就绪" : "等待配置", loaded.model && loaded.benchmark ? "done" : "");
  if (step === 1) renderAudit(1);
  if (step === 2) { state.questionCount = -1; renderEvaluation(62); }
  if (step === 3) { renderDiagnosis(); setStatus("诊断已生成", "done"); }
  if (step === 4) window.startWeakTraining?.();
  if (step === 5) window.showAutonomousQuestion?.();
  if (step === 6) window.showKnowledgeCollection?.();
}

function resetDemo() {
  stopPlayback();
  Object.assign(state, { unlocked: 0, elapsed: 0, speed: 1, questionCount: -1, selectedDimension: 2 });
  loaded.model = false;
  loaded.benchmark = false;
  for (const kind of ["model", "benchmark"]) {
    $(`#${kind}-upload`).classList.remove("loaded");
    $(`#${kind}-upload`).setAttribute("aria-pressed", "false");
    $(`#${kind}-name`).textContent = kind === "model" ? "上传待测大模型" : "上传 Benchmark";
    $(`#${kind}-detail`).textContent = kind === "model" ? "点击载入示例模型" : "点击载入示例题库";
    $(`#${kind}-action`).textContent = kind === "model" ? "选择模型" : "选择 Benchmark";
  }
  $("#session-model").textContent = "等待载入模型";
  $("#session-benchmark").textContent = "尚未配置 Benchmark";
  $("#configuration-hint").textContent = "请先载入模型与 Benchmark";
  $("#start-button").disabled = true;
  $("#speed-select").value = "1";
  showView(0);
  setStatus("等待配置");
}

$("#model-upload").addEventListener("click", () => loadExample("model"));
$("#benchmark-upload").addEventListener("click", () => loadExample("benchmark"));
$("#start-button").addEventListener("click", () => {
  if (!loaded.model || !loaded.benchmark) return;
  state.unlocked = 0;
  state.selectedDimension = 2;
  startPlayback();
});
$("#pause-button").addEventListener("click", () => {
  state.paused = !state.paused;
  document.body.classList.toggle("paused", state.paused);
  $("#pause-button").textContent = state.paused ? "继续演示" : "暂停演示";
  $("#playback-label").textContent = state.paused ? "演示已暂停" : "流程自动演示中";
  setStatus(state.paused ? "演示已暂停" : state.step === 1 ? "审计进行中" : "测评进行中", "running");
});
$("#speed-select").addEventListener("change", (event) => { state.speed = Number(event.target.value); });
$("#dimension-ranking").addEventListener("click", (event) => {
  const button = event.target.closest("[data-dimension]");
  if (!button) return;
  const index = Number(button.dataset.dimension);
  renderKnowledge(index);
  $(`[data-dimension="${index}"]`).focus({ preventScroll: true });
  announce(`${demo.dimensions[index].name}，${demo.dimensions[index].module}，能力 ${demo.dimensions[index].moduleScore.toFixed(2)}`);
});
$$(".step[data-step]").forEach((button) => button.addEventListener("click", () => visitStep(Number(button.dataset.step))));
$("#weak-training-button").addEventListener("click", () => visitStep(4));
$("#extension-button").addEventListener("click", showExtension);
$("#back-report-button").addEventListener("click", () => visitStep(3));
$("#reset-button").addEventListener("click", resetDemo);
$("#replay-button").addEventListener("click", resetDemo);
$("#fullscreen-button").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    announce("当前浏览器不支持全屏，请使用浏览器的全屏菜单。");
    $("#fullscreen-button").title = "请使用浏览器的全屏菜单";
  }
});
document.addEventListener("fullscreenchange", () => {
  const label = document.fullscreenElement ? "退出全屏" : "全屏展示";
  $("#fullscreen-button").setAttribute("aria-label", label);
  $("#fullscreen-button").title = label;
});
window.addEventListener("pagehide", stopPlayback);
$$("[data-extension]").forEach((element) => { element.hidden = visibleStageCount < 8; });
showView(0, false);
