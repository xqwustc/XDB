"use strict";

(() => {
  const root = document.querySelector("#expert-demo");
  if (!root) return;
  const page = document;
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const stages = $$('[data-expert-stage]');
  const state = { stage: 0, timer: null, record: null, firstAnswer: null, memory: [], weakComplete: false, questionStarted: false, questionStage: 1 };
  const dialog = $("#expert-dialog");
  const request = "针对带配位性杂环的芳基氯化物 Suzuki–Miyaura 偶联，请给出“有机反应实验催化剂选择”的判断顺序、依据、边界与验证方式。";
  const example = {
    expert: "有机合成专家 A（示例）",
    source: "专家经验总结；以底物配位性、卤素离去能力和金属残留约束为判断依据",
    kind: "procedural",
    knowledge: "1. 先检查底物是否含有会配位或毒化金属的杂环，并确认芳基卤化物的离去能力。\n2. 若存在配位性杂环，优先选择对配位抑制更有耐受性的 Pd 配体体系；再按底物电子效应和官能团耐受性缩小候选。\n3. 以小规模对照实验验证转化率、选择性和金属残留；记录失败模式后再调整配体、碱或温度。",
    boundary: "适用于 Suzuki–Miyaura 偶联的芳基氯化物，且底物含配位性杂环时优先采用；对易分解底物或放大生产需重新评估溶剂、传质和残留约束。",
    verification: "设置无配体与候选配体对照，比较转化率和选择性；用文献条件交叉核对，并以 LC-MS、NMR 和金属残留检测确认结果。",
    supplement: "若反应不转化，先区分是催化剂被底物配位抑制，还是碱、溶剂或温度不匹配：保持底物不变，逐项替换配体和碱做最小对照。若仍失败，再切换到更活泼的催化体系，并记录每次切换的理由和证据。"
  };
  const followupQuestion = "当第一次选择的体系没有转化时，你会如何区分“底物配位抑制”和“碱/溶剂不匹配”？请给出最小对照实验、调整顺序，以及什么证据会让你切换催化体系。";

  // Keep the conversation UI and its data inside the expert-demo module.
  const chatRounds = [
    { field: "knowledge", label: "选择策略", question: `${request}\n我们先从选择策略开始：您会先检查什么，按什么顺序缩小催化体系的候选范围？` },
    { field: "boundary", label: "适用边界", question: "这些判断适用于哪些底物和条件？哪些情况需要重新评估，不能直接沿用？" },
    { field: "verification", label: "验证方式", question: "如何验证这些选择依据？请说明需要的对照实验、观测指标或表征方法。" },
    { field: "supplement", label: "失败处理", question: followupQuestion },
    { field: "source", label: "知识来源", question: "最后，请说明上述建议的知识来源，例如文献、实验记录或您的经验总结；尚未验证的部分也请注明。" }
  ];
  const chat = { round: 0, answers: {}, messages: [] };
  stages[2].innerHTML = `
    <div class="expert-chat-heading"><strong>模型与专家对话</strong><span id="expert-chat-progress"></span></div>
    <p class="expert-note">示例模型按知识缺口逐轮追问。您可以自由回复，原始对话会随知识样本一起保存。</p>
    <div id="expert-chat-log" class="expert-chat-log" role="log" aria-label="模型与专家对话记录" aria-live="polite" aria-relevant="additions"></div>
    <form id="expert-answer-form" class="expert-form expert-chat-composer">
      <label for="expert-chat-input">专家回复</label>
      <textarea id="expert-chat-input" name="reply" required maxlength="6000" rows="3" placeholder="输入您的回答，与模型讨论选择依据…"></textarea>
      <div class="expert-chat-actions"><button class="secondary-button" id="expert-fill-example" type="button">填入本轮示例</button><span>Ctrl / ⌘ + Enter 发送</span><button class="primary-button" type="submit">发送回复</button></div>
    </form>
    <div id="expert-chat-complete" class="expert-chat-complete" hidden><p>对话已收集完成，可修改任一回复，或整理为知识样本。</p><button class="primary-button" id="expert-chat-review" type="button">整理对话并预览知识</button></div>`;
  function appendChatMessage(role, content, round) {
    const message = { role, content };
    chat.messages.push(message);
    const bubble = document.createElement("article");
    bubble.className = `expert-chat-message ${role}`;
    const label = document.createElement("strong");
    label.textContent = role === "model" ? "模型" : "专家";
    const body = document.createElement("p");
    body.textContent = content;
    bubble.append(label, body);
    if (role === "expert") {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-button";
      edit.textContent = "修改这条回复";
      edit.dataset.chatEdit = round;
      bubble.append(edit);
    }
    $("#expert-chat-log").append(bubble);
  }
  function chatQuestion(index) {
    const previous = index ? chat.answers[chatRounds[index - 1].field] : "";
    return (previous ? `您刚才提到：“${previous.slice(0, 90)}${previous.length > 90 ? "…" : ""}”\n\n` : "") + chatRounds[index].question;
  }
  function updateChatComposer() {
    const complete = chat.round === chatRounds.length;
    $("#expert-answer-form").hidden = complete;
    $("#expert-chat-complete").hidden = !complete;
    $("#expert-chat-progress").textContent = complete ? `已收集 ${chatRounds.length} 轮回答` : `${chat.round + 1} / ${chatRounds.length} · ${chatRounds[chat.round].label}`;
    $("#expert-chat-input").value = complete ? "" : chat.answers[chatRounds[chat.round].field] || "";
    $("#expert-chat-input").setCustomValidity("");
    const log = $("#expert-chat-log");
    log.scrollTop = log.scrollHeight;
  }
  function rebuildChat(round = 0) {
    chat.round = round;
    chat.messages = [];
    $("#expert-chat-log").replaceChildren();
    for (let index = 0; index <= Math.min(round, chatRounds.length - 1); index++) {
      appendChatMessage("model", chatQuestion(index));
      if (index < round) appendChatMessage("expert", chat.answers[chatRounds[index].field], index);
    }
    updateChatComposer();
  }
  rebuildChat();

  function setStage(stage) {
    state.stage = stage;
    if (stage !== 0) state.questionStage = stage;
    // The training workspace stays visible while the dialog collects knowledge.
    stages.forEach((view, index) => { view.hidden = index === 1 ? stage === 0 : index !== stage; });
    const flowStep = stage === 0 ? 0 : stage === 3 ? 2 : 1;
    $$(".expert-flow li").forEach((item, index) => {
      if (index === flowStep) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
      item.classList.toggle("done", index < flowStep);
    });
    const labels = ["等待模型选择训练数据集", "定向训练中，等待触发知识求助", "等待专家回答与补充", "等待专家确认知识样本"];
    $("#expert-live").textContent = labels[stage];
  }
  function fillForm(form, fields) {
    Object.entries(fields).forEach(([name, value]) => {
      const input = form.elements[name];
      if (input) { input.value = value; input.setCustomValidity(""); }
    });
  }
  function collectForm(form) {
    let valid = true;
    for (const field of form.querySelectorAll("[required]")) {
      field.setCustomValidity(field.value.trim() ? "" : "请填写有效内容，不能只输入空格。");
      if (!field.checkValidity()) valid = false;
    }
    if (!valid) { form.reportValidity(); return null; }
    return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
  }
  function stopTimer() { clearInterval(state.timer); state.timer = null; }
  function prepareWeakTraining() {
    if (state.weakComplete) return;
    stopTimer();
    $("#expert-train-start").disabled = true;
    $("#weak-training-panel").hidden = false;
    setStatus("薄弱项训练中", "running");
    let progress = 0;
    state.timer = setInterval(() => {
      if (document.hidden || root.closest(".view").dataset.view !== "4" || root.closest(".view").hidden) return;
      progress = Math.min(100, progress + 10);
      $("#weak-training-percent").textContent = `${progress}%`;
      $("#weak-training-progress").setAttribute("aria-valuenow", String(progress));
      $("#weak-training-progress > div").style.width = `${progress}%`;
      if (progress !== 100) return;
      stopTimer();
      state.weakComplete = true;
      $("#weak-training-message").textContent = "薄弱环节训练完成，进入模型自主提问 ✓";
      $("#expert-train-start").textContent = "薄弱环节训练已完成";
      showView(5);
      window.showAutonomousQuestion();
    }, 350);
  }
  function openDialog() {
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  function openAnswer() {
    setStage(2);
    openDialog();
    const log = $("#expert-chat-log");
    log.scrollTop = log.scrollHeight;
    $(chat.round === chatRounds.length ? "#expert-chat-review" : "#expert-chat-input").focus();
  }
  function startTraining() {
    stopTimer();
    state.questionStarted = true;
    setStage(1);
    setStatus("专家协同训练中", "running");
    let progress = 0;
    $("#expert-request").hidden = true;
    $("#expert-training-message").textContent = "正在学习有机反应催化与条件案例…";
    $("#expert-training-progress > div").style.width = "0%";
    $("#expert-training-progress").setAttribute("aria-valuenow", "0");
    $("#expert-training-percent").textContent = "0%";
    state.timer = setInterval(() => {
      if (document.hidden || root.closest(".view").dataset.view !== "5" || root.closest(".view").hidden) return;
      progress += 4;
      const needsExpert = progress >= 32;
      $("#expert-training-progress > div").style.width = `${progress}%`;
      $("#expert-training-progress").setAttribute("aria-valuenow", String(progress));
      $("#expert-training-percent").textContent = `${progress}%`;
      if (needsExpert) {
        stopTimer();
        $("#expert-training-message").textContent = "已发现程序性知识缺口，模型主动请求专家…";
        setStatus("等待专家回答", "running");
        $("#expert-request").hidden = false;
        $("#expert-live").textContent = "模型已发起专家求助 REQ-001";
        openAnswer();
      }
    }, 350);
  }
  function buildRecord(supplement) {
    const values = state.firstAnswer;
    state.record = {
      id: "EXPERT-CATALYST-001", requestId: "REQ-001", status: "draft", demo: true,
      diagnostic: { model: "Qwen2.5-7B-Instruct", dimension: "化学原理", score: 0.36, module: "化学平衡", moduleScore: 0.30, weakSkill: "有机反应中的催化剂使用" },
      trainingDataset: "有机反应催化与条件案例集", expertDataset: "专家补充知识集", sourceType: "human-expert-dialogue",
      ...values, followupQuestion: chat.messages[6].content, supplement, createdAt: new Date().toISOString(),
      dialogue: structuredClone(chat.messages)
    };
    $("#expert-record-fields").innerHTML = [
      ["知识类型", values.kind === "procedural" ? "策略性 / 程序性知识" : "事实性知识"], ["专家标识", values.expert], ["来源", values.source], ["知识内容", values.knowledge], ["适用条件与边界", values.boundary], ["验证方法", values.verification], ["专家补充", supplement]
    ].map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`).join("");
    $("#expert-record-json").textContent = JSON.stringify(state.record, null, 2);
    $(".expert-stats > div:first-child strong").textContent = chat.round;
    $(".expert-memory-source small").textContent = `${chat.round} 轮对话 · 决策策略`;
    $("#expert-return .expert-context p").textContent = "新增样本包含知识内容、适用边界、验证方法、失败处理、知识来源及完整原始对话。";
    $("#expert-collected-count").textContent = "0";
    $("#expert-record-status").textContent = "待专家确认";
    $("#expert-record-status").classList.remove("done");
    $("#expert-confirm-note").textContent = "请核对知识内容、来源与适用边界；确认后写入 Agent Memory。";
    $("#expert-confirm").disabled = false;
    $("#expert-return").hidden = true;
    $("#expert-resume-panel").hidden = true;
    $("#expert-resume").disabled = false;
    dialog.append(stages[3]);
    setStage(3);
    dialog.scrollTop = 0;
    $("#expert-confirm").focus();
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
  function downloadRecord() {
    if (!state.record || state.record.status !== "confirmed") return;
    const blob = new Blob([`${JSON.stringify(state.record)}\n`], { type: "application/jsonl;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = "expert-catalyst-knowledge.jsonl";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    $("#expert-live").textContent = "已导出 1 条专家知识 JSONL";
  }
  $("#expert-train-start").addEventListener("click", prepareWeakTraining);
  $("#expert-answer-open").addEventListener("click", () => {
    if (state.stage === 3 && state.record?.status === "draft") openDialog();
    else openAnswer();
  });
  $("#expert-dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (!$("#expert-memory-transfer").hidden) event.preventDefault();
  });
  $("#expert-fill-example").addEventListener("click", () => {
    if (chat.round < chatRounds.length) fillForm($("#expert-answer-form"), { reply: example[chatRounds[chat.round].field] });
  });
  root.addEventListener("input", (event) => { if (event.target.matches("input,textarea")) event.target.setCustomValidity(""); });
  $("#expert-answer-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const values = collectForm(event.currentTarget);
    if (!values) return;
    if (chat.round >= chatRounds.length) return;
    chat.answers[chatRounds[chat.round].field] = values.reply;
    appendChatMessage("expert", values.reply, chat.round);
    chat.round += 1;
    if (chat.round < chatRounds.length) appendChatMessage("model", chatQuestion(chat.round));
    updateChatComposer();
    $("#expert-live").textContent = `已收集 ${chat.round} 轮专家回答`;
    $(chat.round === chatRounds.length ? "#expert-chat-review" : "#expert-chat-input").focus();
  });
  $("#expert-chat-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
      event.preventDefault();
      $("#expert-answer-form").requestSubmit();
    }
  });
  $("#expert-chat-log").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-chat-edit]");
    if (!edit) return;
    rebuildChat(Number(edit.dataset.chatEdit));
    $("#expert-chat-input").focus();
  });
  $("#expert-chat-review").addEventListener("click", () => {
    if (chat.round !== chatRounds.length) return;
    state.firstAnswer = { expert: "当前对话专家", kind: "procedural", ...chat.answers };
    buildRecord(chat.answers.supplement);
  });
  $("#expert-confirm").addEventListener("click", () => {
    if (!state.record || state.record.status !== "draft") return;
    stopTimer();
    $("#expert-confirm").disabled = true;
    $("#expert-dialog-close").disabled = true;
    stages[3].hidden = true;
    $("#expert-memory-transfer").hidden = false;
    dialog.scrollTop = 0;
    $("#expert-memory-write-message").textContent = "正在整理专家知识…";
    $("#expert-memory-write-count").textContent = state.memory.length ? "更新 1 条知识" : "0 → 1 条知识";
    let step = 0;
    $$(".expert-memory-log li").forEach((item) => item.classList.remove("done"));
    state.timer = setInterval(() => {
      if (document.hidden) return;
      $$(".expert-memory-log li")[step].classList.add("done");
      step += 1;
      $("#expert-memory-write-message").textContent = ["正在写入 Agent Memory…", "记忆已保存，正在检索训练所需知识…", "检索完成，恢复训练…"][step - 1];
      if (step !== 3) return;
      stopTimer();
      state.record.status = "confirmed";
      state.record.confirmedAt = new Date().toISOString();
      state.record.memory = { id: "MEM-CATALYST-001", storedAt: state.record.confirmedAt, retrievedForTraining: true };
      state.memory = [structuredClone(state.record)];
      $("#expert-record-json").textContent = JSON.stringify(state.record, null, 2);
      $("#expert-collected-count").textContent = "1";
      $("#expert-record-status").textContent = "已写入 Memory";
      $("#expert-record-status").classList.add("done");
      $("#expert-confirm-note").textContent = "专家知识已写入 Agent Memory，保留来源、边界与原始对话。";
      $("#expert-memory-count").textContent = `${state.memory.length} 条专家知识`;
      $("#expert-memory-state").textContent = "已检索：催化剂选择的决策步骤、适用边界与失败处理策略。正在用于后续训练。";
      $("#expert-memory-preview").textContent = state.memory[0].knowledge;
      $("#expert-memory-card").hidden = false;
      $("#expert-return").hidden = false;
      $("#expert-request").hidden = true;
      $("#expert-dialog-close").disabled = false;
      $("#expert-memory-transfer").hidden = true;
      root.querySelector(".expert-content").insertBefore(stages[3], root.querySelector(".expert-bottom"));
      stages[3].hidden = false;
      dialog.close();
      $("#expert-resume").click();
    }, 1000);
  });
  $("#expert-edit-answer").addEventListener("click", () => {
    stopTimer();
    state.record = null;
    document.dispatchEvent(new CustomEvent("expert-knowledge-invalidated", {detail:{fromStep:5}}));
    $("#expert-request").hidden = false;
    rebuildChat(chat.round);
    openAnswer();
  });
  $("#expert-export").addEventListener("click", downloadRecord);
  $("#expert-resume").addEventListener("click", () => {
    if (!state.record || !state.memory.length || state.record.status !== "confirmed") return;
    stopTimer();
    $("#expert-resume").disabled = true;
    $("#expert-edit-answer").disabled = true;
    let progress = 32;
    $("#expert-training-message").textContent = "检索 Agent Memory 中的专家知识，继续训练…";
    state.timer = setInterval(() => {
      if (document.hidden || root.closest(".view").dataset.view !== "5" || root.closest(".view").hidden) return;
      progress = Math.min(100, progress + 8);
      $("#expert-training-progress > div").style.width = `${progress}%`;
      $("#expert-training-progress").setAttribute("aria-valuenow", String(progress));
      $("#expert-training-percent").textContent = `${progress}%`;
      if (progress === 100) {
        stopTimer();
        $("#expert-training-message").textContent = "已使用 Agent Memory 中的专家知识，训练演示完成 ✓";
        $("#expert-return-note").textContent = "已演示知识回流；实际效果需要独立测评验证，专家数据仍可导出。";
        $("#expert-live").textContent = "模拟训练完成，已收集 1 条专家知识样本";
        setStatus("专家知识已收集", "done");
        $("#expert-edit-answer").disabled = false;
        showKnowledgeCollection();
        showView(6);
      }
    }, 300);
  });
  function reset() {
    stopTimer();
    dialog.close();
    state.record = null; state.firstAnswer = null; state.memory = [];
    document.dispatchEvent(new CustomEvent("expert-knowledge-invalidated", {detail:{fromStep:4}}));
    state.weakComplete = false; state.questionStarted = false; state.questionStage = 1;
    $("#expert-train-start").disabled = false;
    $("#expert-train-start").textContent = "采用模型推荐并开始训练";
    $("#weak-training-panel").hidden = true;
    $("#weak-training-percent").textContent = "0%";
    $("#weak-training-progress").setAttribute("aria-valuenow", "0");
    $("#weak-training-progress > div").style.width = "0%";
    $("#weak-training-message").textContent = "正在针对薄弱项学习催化与条件案例…";
    $("#expert-memory-transfer").hidden = true;
    $("#expert-dialog-close").disabled = false;
    $("#expert-memory-count").textContent = "0 条专家知识";
    $("#expert-memory-state").textContent = "等待采集：专家回答将整理为可检索的记忆，用于后续训练。";
    $("#expert-memory-card").hidden = true;
    $("#expert-memory-preview").textContent = "";
    root.querySelector(".expert-content").insertBefore(stages[3], root.querySelector(".expert-bottom"));
    $("#expert-answer-form").reset();
    chat.answers = {};
    rebuildChat();
    $$("input,textarea").forEach((field) => field.setCustomValidity(""));
    $("#expert-answer-form").hidden = false;
    $("#expert-return").hidden = true; $("#expert-resume-panel").hidden = true;
    $("#expert-confirm").disabled = false; $("#expert-edit-answer").disabled = false; $("#expert-resume").disabled = false;
    $("#expert-record-status").textContent = "待专家确认"; $("#expert-record-status").classList.remove("done");
    $("#expert-record-fields").textContent = ""; $("#expert-record-json").textContent = "";
    $("#expert-collected-count").textContent = "0";
    $("#expert-return-note").textContent = "专家样本已经入集，可继续定向训练或导出 JSONL。";
    setStage(0);
  }
  window.startWeakTraining = () => {
    setStage(0);
    setStatus(state.weakComplete ? "薄弱项训练已完成" : state.timer ? "薄弱项训练中" : "等待选择训练数据", state.weakComplete ? "done" : "");
  };
  window.showAutonomousQuestion = () => {
    if (!state.questionStarted) startTraining();
    else {
      setStage(state.questionStage);
      setStatus(state.record?.status === "confirmed" ? "知识已写入 Memory" : "模型自主提问", state.record?.status === "confirmed" ? "done" : "running");
    }
  };
  function showKnowledgeCollection() {
    const record = state.record;
    if (!record || record.status !== "confirmed") return;
    const memory = record.memory || {};
    const collection = page.querySelector(".knowledge-collection-view");
    collection.querySelector(".collection-heading p").textContent = `把 ${record.dialogue.filter((message) => message.role === "expert").length} 轮专家回答整理成可追踪的结构化记忆。`;
    collection.querySelector(".collection-step p").textContent = "保留模型逐轮追问与专家实际回复，按对话主题映射知识字段。";
    const transcript = collection.querySelector(".collection-dialogue");
    transcript.replaceChildren();
    record.dialogue.forEach((message) => {
      const bubble = document.createElement("span");
      bubble.className = message.role === "model" ? "dialogue-model" : "dialogue-human";
      bubble.textContent = `${message.role === "model" ? "模型" : "专家"}：${message.content}`;
      transcript.append(bubble);
    });
    collection.querySelector(".collection-fields").innerHTML = [
      ["适用边界 · 第 2 轮", record.boundary], ["选择策略 · 第 1 轮", record.knowledge],
      ["验证方式 · 第 3 轮", record.verification], ["失败处理 · 第 4 轮", record.supplement]
    ].map(([label, value]) => `<span><b>${label}</b>${escapeHtml(value)}</span>`).join("");
    collection.querySelector(".collection-checks").innerHTML = [
      ["已记录知识来源 · 第 5 轮", record.source], ["已记录适用边界", record.boundary],
      ["已记录验证方法", record.verification], ["已记录失败处理", record.supplement]
    ].map(([label, value]) => `<span class="collection-check done">✓ ${label}：${escapeHtml(value)}</span>`).join("") + '<span class="expert-note">以上表示字段已收集，知识有效性仍需依据所述方法验证。</span>';
    page.querySelector("#collection-status").textContent = "已写入 Memory";
    page.querySelector("#collection-memory-note").textContent = "已完成写入；下一批催化剂选择任务会优先检索该条策略。";
    page.querySelector("#collection-memory-json").textContent = JSON.stringify({
      memory_id: memory.id || "MEM-CATALYST-001",
      type: "procedural_strategy",
      topic: "有机反应实验催化剂选择",
      source: record.sourceType,
      retrieval_tags: ["Suzuki-Miyaura", "配位性杂环", "催化剂选择"],
      status: "ready_for_training",
      fields: { trigger: record.boundary, decision: record.knowledge, verification: record.verification, failure_handling: record.supplement }
    }, null, 2);
  }
  window.showKnowledgeCollection = showKnowledgeCollection;
  window.getConfirmedExpertRecord = () => state.record?.status === "confirmed" ? structuredClone(state.record) : null;
  document.addEventListener("demo-view-change", (event) => {
    const step = event.detail.step;
    if (step === 4 || step === 5) document.querySelector(`[data-view="${step}"]`).append(root);
    else dialog.close();
  });
  page.querySelector("#collection-back-button").addEventListener("click", () => visitStep(5));
  page.querySelector("#collection-export-button").addEventListener("click", downloadRecord);
  $("#expert-restart").addEventListener("click", () => {
    reset(); showView(4); window.startWeakTraining();
  });
  ["#reset-button", "#replay-button", "#start-button"].forEach((selector) => document.querySelector(selector).addEventListener("click", () => {
    reset();
  }));
  window.addEventListener("pagehide", stopTimer);
  setStage(0);
})();
