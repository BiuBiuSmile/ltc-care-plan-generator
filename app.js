const DATA = window.CARE_PLAN_DATA;
const CONFIG = window.CARE_PLAN_CONFIG || { DEMO_MODE: true, API_URL: "" };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const money = new Intl.NumberFormat("zh-TW");
const WEEKDAYS = [
  ["mon", "一"], ["tue", "二"], ["wed", "三"], ["thu", "四"],
  ["fri", "五"], ["sat", "六"], ["sun", "日"],
];

const state = {
  filter: "all",
  query: "",
  items: [],
  aidItems: [],
  dirty: false,
};

let generationController = null;
let toastTimer = null;
let lastQualityContext = null;
let aiDraftText = "";

const BETA_TOKEN_KEY = "carePlanBetaToken";
const ADMIN_KEY_SESSION = "carePlanAdminKey";
let betaToken = localStorage.getItem(BETA_TOKEN_KEY) || "";
let betaUser = null;
let betaQuota = { max: 10, used: 0, remaining: 10 };
let adminKey = sessionStorage.getItem(ADMIN_KEY_SESSION) || "";
let adminMode = false;

const PARTIAL_SECTION_LABELS = {
  care_analysis: "照顧面",
  economic_analysis: "經濟面",
  environment_analysis: "環境面",
  social_analysis: "社交面",
  strengths_analysis: "個案／家庭優勢",
  problem_items: "照顧問題清單",
  service_execution: "服務執行說明",
};

const identityInfo = {
  "第三類（一般戶）": { rate: 16, key: "general", label: "一般戶" },
  "第二類（中低收入戶）": { rate: 5, key: "lowmid", label: "中低收入戶" },
  "第一類（長照低收入戶）": { rate: 0, key: null, label: "長照低收入戶" },
};

function service(code) {
  return DATA.services.find((x) => x.code === code);
}

function item(code) {
  return state.items.find((x) => x.code === code);
}

function estimateMonth(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  return n ? Math.round(n * 4.5) : 0;
}

function unitMode() {
  return $('input[name="unitMode"]:checked')?.value || "";
}

function currentIdentity() {
  return $("#identitySelect").value;
}

function currentCMS() {
  return $("#cmsSelect").value;
}

function currentWritingMode() {
  return $("#writingModeSelect")?.value || "standard";
}

function currentIntervention() {
  const value = $("#interventionSelect")?.value || "尚未使用";
  if (value === "自訂") return $("#interventionCustom")?.value.trim() || "";
  return value;
}

function calc() {
  const ident = identityInfo[currentIdentity()];
  const budget = Number(DATA.cms[currentCMS()] || 0);
  let total = 0;
  let burden = 0;
  state.items.forEach((i) => {
    const s = service(i.code);
    if (!s) return;
    total += s.amount * i.qty;
    if (ident.key) burden += s[ident.key] * i.qty;
  });
  return {
    budget,
    total,
    burden,
    remaining: budget - total,
    usage: budget ? (total / budget) * 100 : 0,
    rate: ident.rate,
  };
}

function markDirty() {
  state.dirty = true;
}

function markClean() {
  state.dirty = false;
}

function hasTextValue(selector) {
  const el = $(selector);
  return Boolean(el && String(el.value || "").trim());
}

function setCheckboxChecked(selector, checked = true) {
  const el = $(selector);
  if (el) el.checked = Boolean(checked);
}

function aidHasData() {
  return state.aidItems.some((x) => String(x.item || "").trim() || String(x.subsidy || "").trim()) ||
    hasTextValue("#aidPeriod") || hasTextValue("#aidQuota") || hasTextValue("#aidUsedTotal");
}

function outputIsEdited() {
  if (!aiDraftText) return false;
  return $("#outputText").value !== aiDraftText;
}

function updateDraftState() {
  const badge = $("#draftState");
  const restore = $("#restoreDraftBtn");
  if (!badge || !restore) return;
  const edited = outputIsEdited();
  badge.className = "draft-state " + (edited ? "edited" : "ai");
  badge.textContent = edited ? "已手動修改" : "AI 原稿";
  restore.disabled = !edited || !aiDraftText;
}

function setAiDraft(text) {
  aiDraftText = String(text || "");
  $("#outputText").value = aiDraftText;
  updateDraftState();
}

function confirmAndClear(label, hasData, clearFn, checkboxSelector) {
  if (!hasData) {
    clearFn();
    return true;
  }
  if (!confirm(`關閉「${label}」會清除已填資料，確定要關閉嗎？`)) {
    setCheckboxChecked(checkboxSelector, true);
    return false;
  }
  clearFn();
  return true;
}

function showToast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 1800);
}

function setLoading(show, message = "正在分析照專計畫簡述，請稍候…") {
  $("#loadingMessage").textContent = message;
  $("#loadingOverlay").classList.toggle("hidden", !show);
  document.body.style.overflow = show ? "hidden" : "";
}

function clearGenerateError() {
  $("#generateError").classList.add("hidden");
  $("#generateErrorMessage").textContent = "";
  $("#generateErrorDetail").textContent = "";
}

function showGenerateError(error) {
  const panel = $("#generateError");
  const parts = [];
  if (error.code) parts.push(`錯誤代碼：${error.code}`);
  if (error.status) parts.push(`HTTP：${error.status}`);
  if (error.detail && error.detail !== error.message) parts.push(String(error.detail));
  $("#generateErrorMessage").textContent = error.message || "AI 產生失敗，請稍後再試。";
  $("#generateErrorDetail").textContent = parts.join("\n");
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}


function apiBaseUrl() {
  return String(CONFIG.API_URL || "").replace(/\/care-plan-web\/?$/, "");
}
function authApiUrl(action) { return `${apiBaseUrl()}/care-plan-auth/${action}`; }
function adminApiUrl() { return `${apiBaseUrl()}/care-plan-admin`; }
function setAuthError(message = "") {
  const el = $("#authError");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("hidden", !message);
}
function renderQuota() {
  const q = $("#quotaText");
  const generateBtn = $("#generateBtn");
  const hint = $("#generateHint");
  const logoutBtn = $("#logoutBtn");

  if (adminMode) {
    if (q) {
      q.textContent = "管理者模式｜不扣測試額度";
      q.classList.remove("quota-low", "quota-empty");
    }
    if ($("#testerEmail")) $("#testerEmail").textContent = "管理者";
    if (generateBtn && !generationController) {
      generateBtn.disabled = false;
      generateBtn.textContent = "AI 產生個管計畫（管理者）";
    }
    if (hint) hint.textContent = "固定資料由網頁控制；目前為管理者模式，完整產生與局部重寫不占 10 位測試名額，也不扣測試者 10 次額度。";
    if (logoutBtn) logoutBtn.textContent = "離開管理者模式";
    return;
  }

  const max = Number(betaQuota?.max || 10);
  const remaining = Math.max(0, Number(betaQuota?.remaining ?? max));
  if (q) {
    q.textContent = `剩餘 ${remaining} / ${max} 次`;
    q.classList.toggle("quota-low", remaining > 0 && remaining <= 3);
    q.classList.toggle("quota-empty", remaining <= 0);
  }
  if ($("#testerEmail")) $("#testerEmail").textContent = betaUser?.email || "測試帳號";
  if (generateBtn && !generationController) {
    generateBtn.disabled = remaining <= 0;
    generateBtn.textContent = remaining <= 0 ? "AI 測試額度已用完" : "AI 產生個管計畫（使用 1 次）";
  }
  if (hint) hint.textContent = "固定資料由網頁控制；AI 依撰寫模式整理照顧問題分析、問題清單與服務執行目的。每次完整產生會使用 1 次測試額度。";
  if (logoutBtn) logoutBtn.textContent = "登出";
}
function updateBetaSession(data) {
  if (data?.admin_mode) adminMode = true;
  if (data?.user) betaUser = data.user;
  if (data?.quota && !adminMode) betaQuota = data.quota;
  renderQuota();
}
function showAppAfterAuth(data) {
  updateBetaSession(data);
  $("#authGate")?.classList.add("hidden");
  $("#appRoot")?.classList.remove("hidden");
}
function showAuthGate() {
  $("#appRoot")?.classList.add("hidden");
  $("#authGate")?.classList.remove("hidden");
}
async function authFetch(path, payload = {}, includeToken = false) {
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  if (includeToken && betaToken) headers.Authorization = `Bearer ${betaToken}`;
  const response = await fetch(authApiUrl(path), { method: "POST", headers, body: JSON.stringify(payload) });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok || data.ok === false) {
    const err = new Error(data.message || `HTTP ${response.status}`);
    err.code = data.code || "AUTH_ERROR";
    err.status = response.status;
    throw err;
  }
  return data;
}
async function validateAdminMode() {
  if (!adminKey) return false;
  const response = await fetch(adminApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Care-Plan-Admin-Key": adminKey,
    },
    body: JSON.stringify({ action: "status" }),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok || data.ok === false) return false;
  adminMode = true;
  betaUser = { email: "管理者" };
  showAppAfterAuth({ admin_mode: true, user: betaUser });
  return true;
}
async function restoreBetaSession() {
  if (CONFIG.DEMO_MODE) {
    showAppAfterAuth({ user: { email: "示範模式" }, quota: { max: 10, used: 0, remaining: 10 } });
    return;
  }

  if (adminKey) {
    try {
      if (await validateAdminMode()) return;
    } catch {}
    adminKey = "";
    adminMode = false;
    sessionStorage.removeItem(ADMIN_KEY_SESSION);
  }

  if (!betaToken) {
    showAuthGate();
    return;
  }

  try {
    const data = await authFetch("me", {}, true);
    showAppAfterAuth(data);
  } catch {
    betaToken = "";
    betaUser = null;
    localStorage.removeItem(BETA_TOKEN_KEY);
    showAuthGate();
  }
}
async function sendVerificationCode() {
  setAuthError("");
  const email = $("#emailInput").value.trim();
  if (!email) { setAuthError("請輸入 Email。"); return; }
  const btn = $("#sendVerifyCodeBtn");
  btn.disabled = true; btn.textContent = "寄送中…";
  try {
    const data = await authFetch("request-code", { email });
    $("#authSentMessage").textContent = data.message || "驗證碼已寄出。";
    $("#authStepInvite").classList.add("hidden");
    $("#authStepOtp").classList.remove("hidden");
    $("#verificationCodeInput").focus();
  } catch (e) { setAuthError(e.message); }
  finally { btn.disabled = false; btn.textContent = "取得 Email 驗證碼"; }
}
async function verifyBetaLogin() {
  setAuthError("");
  const email = $("#emailInput").value.trim();
  const code = $("#verificationCodeInput").value.trim();
  if (!/^\d{6}$/.test(code)) { setAuthError("請輸入 6 位數 Email 驗證碼。"); return; }
  const btn = $("#verifyLoginBtn");
  btn.disabled = true; btn.textContent = "驗證中…";
  try {
    const data = await authFetch("verify", { email, verification_code: code });
    betaToken = data.token || "";
    localStorage.setItem(BETA_TOKEN_KEY, betaToken);
    showAppAfterAuth(data);
    showToast("信箱驗證完成");
  } catch (e) { setAuthError(e.message); }
  finally { btn.disabled = false; btn.textContent = "完成驗證並進入"; }
}
async function logoutBeta() {
  if (adminMode) {
    adminMode = false;
    adminKey = "";
    sessionStorage.removeItem(ADMIN_KEY_SESSION);
  } else {
    try { if (betaToken) await authFetch("logout", {}, true); } catch {}
  }
  betaToken = ""; betaUser = null; betaQuota = { max: 10, used: 0, remaining: 10 };
  localStorage.removeItem(BETA_TOKEN_KEY);
  $("#verificationCodeInput").value = "";
  $("#authStepOtp").classList.add("hidden");
  $("#authStepInvite").classList.remove("hidden");
  showAuthGate();
}


function init() {
  Object.entries(DATA.cms).forEach(([k, v]) => {
    $("#cmsSelect").insertAdjacentHTML(
      "beforeend",
      `<option value="${k}">${k}｜${money.format(v)} 元</option>`
    );
  });
  $("#cmsSelect").value = "第4級";
  renderRespite();
  bind();
  renderAll();
  updateModeBanner();
  markClean();
  restoreBetaSession();
}

function bind() {
  $("#sendVerifyCodeBtn")?.addEventListener("click", sendVerificationCode);
  $("#verifyLoginBtn")?.addEventListener("click", verifyBetaLogin);
  $("#authBackBtn")?.addEventListener("click", () => { setAuthError(""); $("#authStepOtp").classList.add("hidden"); $("#authStepInvite").classList.remove("hidden"); });
  $("#verificationCodeInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") verifyBetaLogin(); });
  $("#logoutBtn")?.addEventListener("click", logoutBeta);
  $("#identitySelect").addEventListener("change", () => {
    renderBasic();
    renderTotals();
  });
  $("#cmsSelect").addEventListener("change", () => {
    renderBasic();
    renderTotals();
  });
  $("#serviceSearch").addEventListener("input", (e) => {
    state.query = e.target.value;
    renderServices();
  });
  $$(".filter-chip").forEach((b) => b.addEventListener("click", () => {
    state.filter = b.dataset.filter;
    $$(".filter-chip").forEach((x) => x.classList.toggle("active", x === b));
    renderServices();
  }));
  $("#clearServicesBtn").addEventListener("click", () => {
    if (state.items.length && confirm("清除全部已選服務？")) {
      state.items = [];
      markDirty();
      renderServices();
      renderApproved();
      renderTotals();
    }
  });
  $$("input[name=unitMode]").forEach((r) => r.addEventListener("change", () => {
    const m = unitMode();
    $("#designatedUnit").disabled = m !== "designated";
    $("#rotationUnit").disabled = m !== "rotation";
    if (m !== "designated") $("#designatedUnit").value = "";
    if (m !== "rotation") $("#rotationUnit").value = "";
  }));
  $("#interventionSelect").addEventListener("change", () => {
    const custom = $("#interventionSelect").value === "自訂";
    $("#interventionCustom").classList.toggle("hidden", !custom);
    if (!custom) $("#interventionCustom").value = "";
  });

  // v8：所有有「主開關＋子欄位」的服務採同一套狀態同步，避免畫面有資料但送出時被判定未啟用。
  ["#transportUnit", "#transportPhone"].forEach((sel) => $(sel).addEventListener("input", () => {
    if (hasTextValue(sel)) $("#transportEnabled").checked = true;
  }));
  $("#transportEnabled").addEventListener("change", () => {
    if ($("#transportEnabled").checked) return;
    confirmAndClear("交通接送", hasTextValue("#transportUnit") || hasTextValue("#transportPhone"), () => {
      $("#transportUnit").value = "";
      $("#transportPhone").value = "";
    }, "#transportEnabled");
  });

  ["#aidPeriod", "#aidQuota", "#aidUsedTotal"].forEach((sel) => $(sel).addEventListener("input", () => {
    if (hasTextValue(sel)) $("#aidEnabled").checked = true;
  }));
  $("#aidEnabled").addEventListener("change", () => {
    if ($("#aidEnabled").checked) return;
    confirmAndClear("輔具／居家無障礙環境改善", aidHasData(), () => {
      $("#aidPeriod").value = "";
      $("#aidQuota").value = "";
      $("#aidUsedTotal").value = "";
      state.aidItems = [];
      renderAidItems();
    }, "#aidEnabled");
  });

  $("#respiteList").addEventListener("change", (e) => {
    if (!e.target.matches('input[type="checkbox"][data-code]')) return;
    const anySelected = Boolean($("#respiteList").querySelector('input[type="checkbox"][data-code]:checked'));
    if (anySelected) $("#respiteEnabled").checked = true;
  });
  $("#respiteList").addEventListener("input", (e) => {
    if (!e.target.matches(".respite-count")) return;
    const code = e.target.dataset.count;
    if (!String(e.target.value || "").trim() || !code) return;
    const checkbox = $(`[data-code="${code}"]`);
    if (checkbox) checkbox.checked = true;
    $("#respiteEnabled").checked = true;
  });
  $("#respiteEnabled").addEventListener("change", () => {
    if ($("#respiteEnabled").checked) return;
    const selected = Boolean($("#respiteList").querySelector('input[type="checkbox"][data-code]:checked'));
    const hasCounts = Array.from($("#respiteList").querySelectorAll(".respite-count")).some((x) => String(x.value || "").trim());
    confirmAndClear("喘息服務", selected || hasCounts, () => {
      $("#respiteList").querySelectorAll('input[type="checkbox"][data-code]').forEach((x) => { x.checked = false; });
      $("#respiteList").querySelectorAll(".respite-count").forEach((x) => { x.value = ""; });
    }, "#respiteEnabled");
  });

  ["#mealCount", "#mealUnit"].forEach((sel) => $(sel).addEventListener("input", () => {
    if (hasTextValue(sel)) $("#mealEnabled").checked = true;
  }));
  $("#mealEnabled").addEventListener("change", () => {
    if ($("#mealEnabled").checked) return;
    confirmAndClear("餐飲服務", hasTextValue("#mealCount") || hasTextValue("#mealUnit"), () => {
      $("#mealCount").value = "";
      $("#mealUnit").value = "";
    }, "#mealEnabled");
  });

  $("#foreignAmount").addEventListener("input", () => {
    if (hasTextValue("#foreignAmount")) $("#foreignEnabled").checked = true;
  });
  $("#foreignEnabled").addEventListener("change", () => {
    if ($("#foreignEnabled").checked) return;
    confirmAndClear("聘用外籍看護 30% 額度", hasTextValue("#foreignAmount"), () => {
      $("#foreignAmount").value = "";
    }, "#foreignEnabled");
  });

  $("#addAidBtn").addEventListener("click", () => {
    $("#aidEnabled").checked = true;
    state.aidItems.push({ item: "", subsidy: "" });
    markDirty();
    renderAidItems();
  });
  $("#sourceText").addEventListener("input", () => {
    const n = $("#sourceText").value.length;
    $("#charCount").textContent = `${n} 字`;
    $("#charCount").classList.toggle("danger-badge", n > 30000);
  });
  $("#generateBtn").addEventListener("click", generate);
  $("#retryBtn").addEventListener("click", generate);
  $("#errorRetryBtn").addEventListener("click", generate);
  $("#copyBtn").addEventListener("click", copyOutput);
  $("#restoreDraftBtn").addEventListener("click", restoreAiDraft);
  $("#qualityRecheckBtn").addEventListener("click", recheckQuality);
  $("#outputText").addEventListener("input", () => {
    markQualityStale();
    updateDraftState();
  });
  $$(".partial-rewrite-btn").forEach((btn) => btn.addEventListener("click", () => regenerateSection(btn.dataset.section, btn)));
  $("#sampleBtn").addEventListener("click", loadSample);
  $("#resetBtn").addEventListener("click", resetAll);
  $("#floatingGoBtn").addEventListener("click", () => $("#step3").scrollIntoView({ behavior: "smooth" }));
  $("#mobileGoBtn").addEventListener("click", () => $("#step3").scrollIntoView({ behavior: "smooth" }));
  $("#cancelGenerateBtn").addEventListener("click", () => {
    if (generationController) generationController.abort();
  });

  // 所有使用者輸入都視為尚未另行保存；動態服務按鈕會另外呼叫 markDirty。
  document.addEventListener("input", (e) => {
    if (e.target.matches("input, textarea, select")) markDirty();
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("input, textarea, select")) markDirty();
  });
  window.addEventListener("beforeunload", (e) => {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

function renderAll() {
  renderBasic();
  renderServices();
  renderApproved();
  renderTotals();
  renderAidItems();
}

function renderBasic() {
  const ident = identityInfo[currentIdentity()];
  $("#budgetAmount").textContent = money.format(DATA.cms[currentCMS()] || 0);
  $("#copayRate").textContent = `${ident.rate}%`;
  $("#identityLabel").textContent = ident.label;
}

function filtered() {
  const q = state.query.trim().toLowerCase();
  return DATA.services.filter(
    (s) =>
      (state.filter === "all" || s.group === state.filter) &&
      (!q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
  );
}

function toggleService(code) {
  const old = item(code);
  if (old) state.items = state.items.filter((x) => x.code !== code);
  else state.items.push({ code, weeklyQty: 0, qty: 0, days: [] });
  markDirty();
  renderServices();
  renderApproved();
  renderTotals();
}

function renderServices() {
  const el = $("#serviceList");
  el.innerHTML = "";
  filtered().forEach((s) => {
    const it = item(s.code);
    const card = document.createElement("article");
    card.className = "service-card" + (it ? " selected" : "");
    card.innerHTML = `
      <button class="service-main" type="button">
        <div class="service-code">${s.code}</div>
        <div><div class="service-name">${s.name}</div><div class="service-price">${money.format(s.amount)} 元／單位</div></div>
        <span class="add-mark">${it ? "✓" : "＋"}</span>
      </button>
      ${it ? `
      <div class="service-editor">
        <div class="weekly-row">
          <label><span class="field-label">一週次數</span><input class="input-control weekly-input" type="number" min="0" value="${it.weeklyQty}"></label>
          <div class="month-estimate">預估每月 <strong>${it.qty}</strong> 單位</div>
        </div>
        <div class="weekdays">${WEEKDAYS.map(([k, n]) => `<button type="button" class="day-btn ${it.days.includes(k) ? "active" : ""}" data-day="${k}">${n}</button>`).join("")}</div>
      </div>` : ""}`;
    card.querySelector(".service-main").addEventListener("click", () => toggleService(s.code));
    if (it) {
      const input = card.querySelector(".weekly-input");
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("input", (e) => {
        it.weeklyQty = Math.max(0, Math.floor(Number(e.target.value) || 0));
        it.qty = estimateMonth(it.weeklyQty);
        card.querySelector(".month-estimate strong").textContent = it.qty;
        markDirty();
        renderApproved();
        renderTotals();
      });
      card.querySelectorAll(".day-btn").forEach((btn) => btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = btn.dataset.day;
        it.days = it.days.includes(d) ? it.days.filter((x) => x !== d) : [...it.days, d];
        it.weeklyQty = it.days.length;
        it.qty = estimateMonth(it.weeklyQty);
        markDirty();
        renderServices();
        renderApproved();
        renderTotals();
      }));
    }
    el.appendChild(card);
  });
  $("#selectedCount").textContent = `${state.items.length} 項`;
}

function renderApproved() {
  const el = $("#approvedList");
  if (!state.items.length) {
    el.className = "approved-list empty-state";
    el.textContent = "尚未加入服務項目";
    updateFloatingSummary();
    return;
  }
  el.className = "approved-list";
  el.innerHTML = "";
  state.items.forEach((it) => {
    const s = service(it.code);
    const days = WEEKDAYS.filter(([k]) => it.days.includes(k)).map(([, n]) => n).join("、");
    const row = document.createElement("div");
    row.className = "approved-item";
    row.innerHTML = `
      <div>
        <div class="approved-code">${s.code}｜${s.name}</div>
        <div class="approved-meta">每週 ${it.weeklyQty} 次${days ? `｜${days}` : ""}｜月單位 ${it.qty}</div>
      </div>
      <input class="input-control qty-input" type="number" min="0" value="${it.qty}" title="核定月單位數">`;
    row.querySelector("input").addEventListener("input", (e) => {
      it.qty = Math.max(0, Math.floor(Number(e.target.value) || 0));
      markDirty();
      renderTotals();
    });
    el.appendChild(row);
  });
  updateFloatingSummary();
}

function renderTotals() {
  const t = calc();
  $("#serviceTotal").textContent = money.format(t.total);
  $("#copayTotal").textContent = money.format(t.burden);
  $("#remainingAmount").textContent = `${t.remaining < 0 ? "超出 " : ""}${money.format(Math.abs(t.remaining))} 元`;
  $("#budgetUsage").textContent = `${t.usage.toFixed(1)}%`;
  const p = $("#budgetProgress");
  p.style.width = `${Math.min(100, t.usage)}%`;
  p.classList.toggle("warning", t.usage >= 80 && t.usage <= 100);
  p.classList.toggle("over", t.usage > 100);
  $("#budgetHint").textContent = t.total === 0
    ? "目前尚未使用核定額度。"
    : t.remaining < 0
      ? `已超出核定額度 ${money.format(Math.abs(t.remaining))} 元。`
      : `已使用 ${t.usage.toFixed(1)}% 核定額度。`;
  updateFloatingSummary();
}

function updateFloatingSummary() {
  const t = calc();
  const items = state.items.slice(0, 7);
  $("#floatingCount").textContent = `${state.items.length} 項`;
  $("#floatingTotal").textContent = `${money.format(t.total)} 元`;
  $("#mobileCount").textContent = `${state.items.length} 項服務`;
  $("#mobileTotal").textContent = `${money.format(t.total)} 元`;
  if (!items.length) {
    $("#floatingItems").textContent = "尚未加入服務";
    return;
  }
  $("#floatingItems").innerHTML = items.map((it) => {
    const s = service(it.code);
    return `<div class="floating-item"><strong>${escapeHtml(it.code)}｜${escapeHtml(s?.name || "")}</strong><span>${it.qty} 單位/月</span></div>`;
  }).join("") + (state.items.length > items.length ? `<div class="floating-item">另有 ${state.items.length - items.length} 項…</div>` : "");
}

function renderRespite() {
  const el = $("#respiteList");
  el.innerHTML = "";
  DATA.respite.forEach((r) => {
    const row = document.createElement("label");
    row.className = "respite-row";
    row.innerHTML = `<input type="checkbox" data-code="${r.code}"><span><strong>${r.code}</strong>｜${r.name}</span><input class="input-control respite-count" data-count="${r.code}" type="number" min="0" placeholder="核定次數／單位">`;
    el.appendChild(row);
  });
}

function renderAidItems() {
  const el = $("#aidItems");
  el.innerHTML = "";
  state.aidItems.forEach((a, i) => {
    const row = document.createElement("div");
    row.className = "aid-row";
    row.innerHTML = `<input class="input-control" placeholder="輔具項目" value="${escapeHtml(a.item)}"><input class="input-control" type="number" min="0" placeholder="補助金額" value="${escapeHtml(a.subsidy)}"><button class="remove-mini" type="button">移除</button>`;
    const inputs = row.querySelectorAll("input");
    inputs[0].addEventListener("input", (e) => { a.item = e.target.value; if (a.item.trim()) $("#aidEnabled").checked = true; markDirty(); });
    inputs[1].addEventListener("input", (e) => { a.subsidy = e.target.value; if (String(a.subsidy).trim()) $("#aidEnabled").checked = true; markDirty(); });
    row.querySelector("button").addEventListener("click", () => {
      state.aidItems.splice(i, 1);
      markDirty();
      renderAidItems();
    });
    el.appendChild(row);
  });
}

function selectedRespiteItems() {
  return DATA.respite
    .filter((r) => $(`[data-code="${r.code}"]`).checked)
    .map((r) => ({
      code: r.code,
      name: r.name,
      approved: $(`[data-count="${r.code}"]`).value.trim(),
    }));
}

function collect() {
  const ident = currentIdentity();
  const idInfo = identityInfo[ident];
  const respiteItems = selectedRespiteItems();
  return {
    identity: ident,
    cms_level: currentCMS(),
    professional_30_percent: {
      enabled: $("#foreignEnabled").checked || hasTextValue("#foreignAmount"),
      amount: $("#foreignAmount").value.trim(),
    },
    selected_services: state.items.map((it) => {
      const s = service(it.code);
      return {
        group: s.group,
        code: s.code,
        name: s.name,
        qty: String(it.qty),
        weekly_qty: String(it.weeklyQty),
        days: [...it.days],
        amount: s.amount,
        general: s.general,
        lowmid: s.lowmid,
      };
    }),
    transport: {
      enabled: $("#transportEnabled").checked || hasTextValue("#transportUnit") || hasTextValue("#transportPhone"),
      unit: $("#transportUnit").value.trim(),
      phone: $("#transportPhone").value.trim(),
    },
    assistive_device: {
      enabled: $("#aidEnabled").checked || aidHasData(),
      period: $("#aidPeriod").value.trim(),
      quota: $("#aidQuota").value.trim(),
      used_total: $("#aidUsedTotal").value.trim(),
      items: state.aidItems
        .filter((x) => x.item.trim())
        .map((x) => ({ item: x.item.trim(), subsidy: String(x.subsidy).trim() })),
    },
    respite: {
      // 只要有勾選任一 GA 項目，就視為喘息服務已啟用。
      // 這是第二層防呆，即使主開關因瀏覽器狀態不同步，也不會漏掉 GA09。
      enabled: $("#respiteEnabled").checked || respiteItems.length > 0,
      items: respiteItems,
    },
    meal: {
      enabled: $("#mealEnabled").checked || hasTextValue("#mealCount") || hasTextValue("#mealUnit"),
      count_per_month: $("#mealCount").value.trim(),
      unit: $("#mealUnit").value.trim(),
    },
    writing_mode: currentWritingMode(),
    special_plan_items: $("#specialPlanItems")?.value.trim() || "",
    other_service: $("#otherResource").value.trim(),
    unit_selection: {
      mode: unitMode(),
      designated_unit: $("#designatedUnit").value.trim(),
      rotation_unit: $("#rotationUnit").value.trim(),
    },
    burden_rate: idInfo.rate,
  };
}

function validate(data) {
  const missing = [];
  data.selected_services.forEach((s) => {
    if (!s.qty || Number(s.qty) <= 0) missing.push(`${s.code} ${s.name}（月單位數）`);
  });
  if (missing.length) {
    alert("已勾選的服務必須填寫月單位數：\n\n" + missing.slice(0, 8).map((x) => "• " + x).join("\n"));
    $("#step3").scrollIntoView({ behavior: "smooth" });
    return false;
  }
  if (!data.unit_selection.mode) {
    alert("STEP 5「服務單位選擇」為必填。");
    $("#step5").scrollIntoView({ behavior: "smooth" });
    return false;
  }
  if (data.unit_selection.mode === "designated" && !data.unit_selection.designated_unit) {
    alert("已選擇「指定單位」，請填寫單位名稱。");
    $("#designatedUnit").focus();
    return false;
  }
  if (data.unit_selection.mode === "rotation" && !data.unit_selection.rotation_unit) {
    alert("已選擇「不指定服務單位」，請填寫輪派單位。");
    $("#rotationUnit").focus();
    return false;
  }
  if (data.assistive_device.enabled && !data.assistive_device.items.length) {
    alert("已啟用輔具／居家無障礙環境改善服務，請至少新增一項輔具項目；若本次沒有申請，請關閉此項目。");
    $("#step4").scrollIntoView({ behavior: "smooth" });
    return false;
  }
  if (data.respite.enabled && !data.respite.items.length) {
    alert("已啟用喘息服務，請至少勾選一項喘息服務（例如 GA09）。");
    $("#step4").scrollIntoView({ behavior: "smooth" });
    return false;
  }
  for (const r of data.respite.items) {
    if (!r.approved) {
      alert(`已勾選 ${r.code} ${r.name}，請填寫核定次數／單位。`);
      $(`[data-count="${r.code}"]`).focus();
      return false;
    }
  }
  if (data.meal.enabled && !data.meal.count_per_month) {
    alert("已勾選餐飲服務，請填寫「餐／月」。");
    $("#mealCount").focus();
    return false;
  }
  if ($("#interventionSelect").value === "自訂" && !currentIntervention()) {
    alert("已選擇自訂服務介入後改變，請輸入內容。");
    $("#interventionCustom").focus();
    return false;
  }
  const source = $("#sourceText").value.trim();
  if (!source) {
    alert("請先貼上照專計畫簡述。");
    $("#step7").scrollIntoView({ behavior: "smooth" });
    return false;
  }
  if (source.length > 30000) {
    alert("照專計畫簡述內容過長，單次最多 30,000 字。");
    $("#sourceText").focus();
    return false;
  }
  return true;
}

// ===== 與桌面版一致的固定格式 =====
function planClean(value) {
  return String(value ?? "").trim();
}

function planNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const n = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return planClean(value);
  if (Math.abs(n - Math.trunc(n)) < 1e-9) return String(Math.trunc(n));
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function parsePlanQuantity(value) {
  const text = planClean(value).replace(/,/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function normalizeRocDate(value) {
  const text = planClean(value);
  if (!text) return "";
  const m = text.match(/(?:^|[^\d])(\d{2,3})\s*(?:年|[.\/／-])\s*(\d{1,2})\s*(?:月|[.\/／-])\s*(\d{1,2})\s*日?/);
  if (!m) return text;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return text;
  return `${String(y).padStart(3, "0")}/${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

function normalizeVisitTime(value) {
  const text = planClean(value);
  if (!text) return "";
  const colon = text.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/);
  if (colon) return `${colon[1]}:${colon[2]}`;
  const compact = text.match(/^(\d{1,2})(\d{2})$/);
  if (compact) return `${compact[1]}:${compact[2]}`;
  return text;
}

function asList(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(planClean).filter(Boolean);
  const text = planClean(value);
  return text ? [text] : [];
}

function serviceSchedule(serviceItem) {
  const quantity = parsePlanQuantity(serviceItem?.qty);
  const weekly = parsePlanQuantity(serviceItem?.weekly_qty);
  if (quantity === null || weekly === null || weekly <= 0) return "";

  // 只有「每週次數 × 4.5」與月單位相符時才顯示換算式。
  // 若每次服務含多個單位（例如一週3天、每次2單位），單靠目前欄位無法正確推算，
  // 因此寧可不顯示，也不要產生錯誤的固定換算式。
  const estimated = Math.round(weekly * 4.5);
  if (estimated !== Math.round(quantity)) return "";
  return `${planNumber(weekly)}次*4.5週=${planNumber(quantity)}單位`;
}

function executionMap(ai) {
  const m = {};
  const items = Array.isArray(ai?.service_execution) ? ai.service_execution : [];
  items.forEach((x) => {
    const code = planClean(x?.code);
    const note = planClean(x?.execution_note);
    if (code && note && !m[code]) m[code] = note;
  });
  return m;
}

function serviceLine(s, map) {
  const code = planClean(s.code);
  const name = planClean(s.name);
  const quantity = planClean(s.qty);
  const base = `${code}[${name}]*${quantity}單位/月`;
  const note = planClean(map[code]);
  const schedule = serviceSchedule(s);
  if (schedule && note) return `${base}(${schedule}/${note})`;
  if (schedule) return `${base}(${schedule})`;
  if (note) return `${base}(${note})`;
  return base;
}

function allowedProblemServiceMap(d) {
  const map = {};
  (d.selected_services || []).forEach((x) => {
    const code = planClean(x.code);
    if (code) map[code] = planClean(x.name);
  });

  const transport = d.transport || {};
  if (transport.enabled) map.DA01 = "交通接送";

  const respite = d.respite || {};
  (respite.items || []).forEach((x) => {
    const code = planClean(x.code);
    if (code) map[code] = planClean(x.name);
  });

  const aid = d.assistive_device || {};
  (aid.items || []).forEach((x) => {
    const text = planClean(x.item);
    const m = text.match(/^([A-Z]{1,3}\d+(?:-\d+)?)/i);
    if (m) map[m[1].toUpperCase()] = text.replace(m[1], "").replace(/^[\s\[【(（:-]+|[\]】)）]+$/g, "").trim() || "輔具";
  });

  const meal = d.meal || {};
  if (meal.enabled) map.OT01 = "營養餐飲";
  return map;
}

function renderProblemItems(ai, d, mode) {
  const rawItems = Array.isArray(ai?.problem_items) ? ai.problem_items : [];
  if (!rawItems.length) return [""];

  const allowed = allowedProblemServiceMap(d);
  const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const lines = [];

  rawItems.slice(0, 10).forEach((item, idx) => {
    if (typeof item === "string") {
      const text = planClean(item);
      if (text) lines.push(`(${numerals[idx] || idx + 1})${text}`);
      return;
    }

    const title = planClean(item?.title) || "照顧問題";
    const analysis = planClean(item?.analysis);
    const resolution = planClean(item?.resolution);
    const requestedCodes = Array.isArray(item?.service_codes) ? item.service_codes : [];
    const safeCodes = requestedCodes
      .map((c) => planClean(c).toUpperCase())
      .filter((c, i, arr) => c && allowed[c] && arr.indexOf(c) === i);

    let text = `(${numerals[idx] || idx + 1})${title}`;
    if (analysis) text += `：${analysis}`;

    if (safeCodes.length) {
      const codeText = safeCodes.map((code) => `${code}[${allowed[code]}]`).join("、");
      text += `→核定${codeText}`;
    } else if (resolution) {
      text += `→${resolution}`;
    }

    lines.push(text);
  });

  return lines.length ? lines : [""];
}

function renderPlan(ai, d, interventionChange) {
  const mode = planClean(d.writing_mode) || "standard";
  const identity = planClean(d.identity);
  const identityShort = identity ? identity.split("（", 1)[0] : "未填";
  const cmsLevel = planClean(d.cms_level);
  const cmsNumber = cmsLevel.replace("第", "").replace("級", "") || "未填";
  const cmsAmount = DATA.cms[cmsLevel];
  const cmsAmountText = cmsAmount !== undefined ? planNumber(cmsAmount) : "未填";
  const emap = executionMap(ai);

  const visitDate = normalizeRocDate(ai?.visit_date);
  const visitTime = normalizeVisitTime(ai?.visit_time);
  const interviewees = planClean(ai?.interviewees);
  const assessorName = planClean(ai?.assessor_name);
  const submissionDate = normalizeRocDate(ai?.submission_date);

  const visitParts = [];
  if (visitDate) visitParts.push(visitDate);
  if (visitTime) visitParts.push(visitTime);
  let visitLine = "訪視日期：" + visitParts.join(" ");

  const peopleParts = [];
  if (interviewees) peopleParts.push(interviewees);
  if (assessorName) peopleParts.push(`與照專 ${assessorName} 共訪`);
  if (peopleParts.length) visitLine += "，" + peopleParts.join("，");

  const lines = [
    "一、歷程記錄",
    visitLine,
    `計畫送審：${submissionDate}`,
    "二、照顧問題分析",
    "(一)照顧面：",
  ];

  const careItems = asList(ai?.care_analysis);
  if (careItems.length) {
    if (mode === "compact" && careItems.length === 1) {
      lines.push(planClean(careItems[0]));
    } else {
      careItems.forEach((text, idx) => lines.push(`${idx + 1}.${planClean(text)}`));
    }
  }

  const analysisSections = [
    ["(二)經濟面：", planClean(ai?.economic_analysis)],
    ["(三)環境面：", planClean(ai?.environment_analysis)],
    ["(四)社交面：", planClean(ai?.social_analysis)],
    ["(五)個案/家庭優勢：", planClean(ai?.strengths_analysis)],
  ];
  analysisSections.forEach(([label, value]) => lines.push(label + value));

  const intervention = planClean(interventionChange) || "尚未使用";
  lines.push(`(六)服務介入後改變：${intervention.replace(/。+$/, "")}。`);
  lines.push("三、照顧問題清單");
  lines.push(...renderProblemItems(ai, d, mode));

  const selected = Array.isArray(d.selected_services) ? d.selected_services : [];
  const careServices = selected.filter((x) => x.group === "care");
  const professionalServices = selected.filter((x) => x.group === "professional");
  const daycareServices = selected.filter((x) => x.group === "daycare");
  const serviceItems = [...careServices, ...daycareServices];

  let cmsLine = `(二)失能等級CMS ${cmsNumber}，失能額度為${cmsAmountText}元/月。`;
  const cmsChangeNote = planClean(ai?.cms_change_note);
  if (cmsChangeNote) cmsLine += cmsChangeNote.replace(/。+$/, "") + "。";

  lines.push(
    "四、照顧計畫",
    `(一)身分別：${identityShort}`,
    cmsLine
  );

  const foreign = d.professional_30_percent || {};
  if (foreign.enabled) {
    const amount = planClean(foreign.amount);
    lines.push(`(聘用外籍看護，僅能使用30%額度${amount ? ` ${amount}元/月` : ""})`);
  }

  lines.push("(三)依據照專勾選之照顧問題清單，與案家討論服務內容如下:");

  let sectionNo = 1;
  lines.push(`${sectionNo++}.照顧服務：`);
  if (serviceItems.length) serviceItems.forEach((x) => lines.push(serviceLine(x, emap)));
  else lines.push("案家目前暫無使用之需求。");

  let careTotal = 0;
  let careBurden = 0;
  let canCalculate = Boolean(serviceItems.length);
  let burdenKey;
  let burdenRate;
  if (identity.startsWith("第一類")) {
    burdenKey = null;
    burdenRate = 0;
  } else if (identity.startsWith("第二類")) {
    burdenKey = "lowmid";
    burdenRate = 5;
  } else {
    burdenKey = "general";
    burdenRate = 16;
  }

  serviceItems.forEach((x) => {
    const quantity = parsePlanQuantity(x.qty);
    if (quantity === null) {
      canCalculate = false;
      return;
    }
    careTotal += Number(x.amount || 0) * quantity;
    if (burdenKey) careBurden += Number(x[burdenKey] || 0) * quantity;
  });

  if (canCalculate) {
    lines.push(`以上擬訂計畫為:${planNumber(careTotal)}元/月，個案部分負擔為${burdenRate}%為${planNumber(careBurden)}元/月。`);
  }

  const unit = d.unit_selection || {};
  const unitModeValue = planClean(unit.mode);
  const designatedUnit = planClean(unit.designated_unit);
  const rotationUnit = planClean(unit.rotation_unit);
  if (unitModeValue === "designated" && designatedUnit) lines.push(`(案家指定，照會單位：${designatedUnit})`);
  else if (unitModeValue === "rotation" && rotationUnit) lines.push(`(依輪派原則進行照會：${rotationUnit})`);

  const professionalTitleIndex = lines.length;
  lines.push(`${sectionNo++}.專業服務：`);
  if (professionalServices.length) professionalServices.forEach((x) => lines.push(serviceLine(x, emap)));
  else lines[professionalTitleIndex] += "案家目前暫無使用之需求。";

  const transport = d.transport || {};
  if (transport.enabled) {
    const parts = ["交通接送"];
    if (planClean(transport.unit)) parts.push(`照會單位：${planClean(transport.unit)}`);
    if (planClean(transport.phone)) parts.push(`電話：${planClean(transport.phone)}`);
    lines.push(`${sectionNo++}.交通服務：` + parts.join("；") + "。");
  } else {
    lines.push(`${sectionNo++}.交通服務：案家目前暫無使用之需求。`);
  }

  const aid = d.assistive_device || {};
  let aidTitle = `${sectionNo++}.輔具服務及居家無障礙環境改善服務`;
  const aidDetails = [];
  if (planClean(aid.period)) aidDetails.push(`起訖日:${planClean(aid.period)}`);
  if (planClean(aid.quota)) aidDetails.push(`3年${planNumber(aid.quota)}元`);
  if (aidDetails.length) aidTitle += "(" + aidDetails.join("，") + ")";
  if (aid.enabled || (aid.items || []).length) {
    lines.push(aidTitle);
    (aid.items || []).forEach((x) => {
      const itemName = planClean(x.item) || "未填項目";
      const subsidy = planClean(x.subsidy);
      lines.push(`${itemName}${subsidy ? `(${subsidy}元)` : ""}`);
    });
    if (planClean(aid.used_total)) lines.push(`已核銷總金額：${planClean(aid.used_total)}元。`);
  } else {
    lines.push(aidTitle + "：案家目前暫無使用之需求。");
  }

  const respite = d.respite || {};
  if (respite.enabled) {
    const parts = [];
    (respite.items || []).forEach((x) => {
      const code = planClean(x.code);
      let name = planClean(x.name);
      const approved = planClean(x.approved);
      if (code === "GA09") {
        name = "居家喘息服務";
        const countText = approved ? ` ${approved}次/年` : "";
        parts.push(`${code}[${name}]${countText}`);
      } else {
        const unitText = approved ? `*${approved}單位` : "";
        parts.push(`${code}[${name}]${unitText}`);
      }
    });
    if (parts.length) lines.push(`${sectionNo++}.喘息服務：` + parts.join("、"));
    else lines.push(`${sectionNo++}.喘息服務：案家目前暫無使用之需求。`);
  } else {
    lines.push(`${sectionNo++}.喘息服務：案家目前暫無使用之需求。`);
  }

  const special = planClean(d.special_plan_items);
  if (special) {
    lines.push(`${sectionNo++}.特殊服務／其他核定事項：`);
    special.split(/\r?\n/).map(planClean).filter(Boolean).forEach((x) => lines.push(x));
  }

  const meal = d.meal || {};
  if (meal.enabled) {
    const count = planClean(meal.count_per_month);
    let mealLine = `${sectionNo++}.送餐服務：OT01[營養餐飲](10801)`;
    if (count) mealLine += `*${count}單位/月`;
    lines.push(mealLine);
    if (planClean(meal.unit)) lines.push(`(照會單位：${planClean(meal.unit)})`);
  } else {
    lines.push(`${sectionNo++}.送餐服務：案家目前暫無使用之需求。`);
  }

  lines.push(`五、其他資源運用：${planClean(d.other_service) || "無"}`);
  return lines.join("\n");
}


function normalizeForEvidence(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[，,]/g, "，")
    .replace(/[。．.]/g, "。")
    .replace(/[：:]/g, "：")
    .trim();
}

function extractCodesFromText(value) {
  const text = String(value ?? "").toUpperCase();
  const matches = text.match(/(?:BA|BB|BD|CA|CB|CC|CD|DA|EA|EB|EG|GA|SC|OT|AA)\d+(?:-\d+)?/g) || [];
  return [...new Set(matches)];
}

function selectedServiceCodeSet(d) {
  return new Set((d.selected_services || []).map((x) => planClean(x.code).toUpperCase()).filter(Boolean));
}

function qualityAllowedCodeSet(d) {
  const set = new Set(Object.keys(allowedProblemServiceMap(d)));
  extractCodesFromText(d.special_plan_items || "").forEach((c) => set.add(c));
  return set;
}

function expectedCareTotals(d) {
  const identity = planClean(d.identity);
  let burdenKey = "general";
  let burdenRate = 16;
  if (identity.startsWith("第一類")) { burdenKey = null; burdenRate = 0; }
  else if (identity.startsWith("第二類")) { burdenKey = "lowmid"; burdenRate = 5; }

  const serviceItems = (d.selected_services || []).filter((x) => x.group === "care" || x.group === "daycare");
  let total = 0;
  let burden = 0;
  let valid = serviceItems.length > 0;
  serviceItems.forEach((x) => {
    const qty = parsePlanQuantity(x.qty);
    if (qty === null) { valid = false; return; }
    total += Number(x.amount || 0) * qty;
    if (burdenKey) burden += Number(x[burdenKey] || 0) * qty;
  });
  return { valid, total, burden, burdenRate, serviceItems };
}

function qualityEvidenceSections(ai) {
  return [
    ["visit", Boolean(planClean(ai?.visit_date) || planClean(ai?.visit_time) || planClean(ai?.interviewees) || planClean(ai?.assessor_name) || planClean(ai?.submission_date)), "歷程記錄"],
    ["care_analysis", asList(ai?.care_analysis).length > 0, "照顧面"],
    ["economic_analysis", Boolean(planClean(ai?.economic_analysis)), "經濟面"],
    ["environment_analysis", Boolean(planClean(ai?.environment_analysis)), "環境面"],
    ["social_analysis", Boolean(planClean(ai?.social_analysis)), "社交面"],
    ["strengths_analysis", Boolean(planClean(ai?.strengths_analysis)), "個案／家庭優勢"],
    ["problem_items", Array.isArray(ai?.problem_items) && ai.problem_items.length > 0, "照顧問題清單"],
    ["service_execution", Array.isArray(ai?.service_execution) && ai.service_execution.some((x) => planClean(x?.execution_note)), "服務執行說明"],
  ];
}

function runQualityChecks(ai, d, outputText, sourceText) {
  const checks = [];
  const push = (status, title, detail) => checks.push({ status, title, detail });
  const output = String(outputText || "");
  const allowedCodes = qualityAllowedCodeSet(d);
  const selectedCodes = selectedServiceCodeSet(d);

  // 1. 服務碼：固定輸出 + AI 原始回傳雙重檢查
  const actualCodes = new Set(extractCodesFromText(output));
  const unexpectedOutput = [...actualCodes].filter((c) => !allowedCodes.has(c));
  const requiredCodes = new Set([...selectedCodes]);
  (d.respite?.items || []).forEach((x) => { const c = planClean(x.code).toUpperCase(); if (c) requiredCodes.add(c); });
  (d.assistive_device?.items || []).forEach((x) => extractCodesFromText(x.item).forEach((c) => requiredCodes.add(c)));
  if (d.meal?.enabled) requiredCodes.add("OT01");
  extractCodesFromText(d.special_plan_items || "").forEach((c) => requiredCodes.add(c));
  const missingCodes = [...requiredCodes].filter((c) => !actualCodes.has(c));

  const aiAttemptedCodes = [];
  (ai?.problem_items || []).forEach((x) => (x?.service_codes || []).forEach((c) => aiAttemptedCodes.push(planClean(c).toUpperCase())));
  (ai?.service_execution || []).forEach((x) => { const c = planClean(x?.code).toUpperCase(); if (c) aiAttemptedCodes.push(c); });
  const unsafeAiCodes = [...new Set(aiAttemptedCodes)].filter((c) => c && !allowedCodes.has(c));

  if (unexpectedOutput.length || missingCodes.length) {
    const details = [];
    if (unexpectedOutput.length) details.push(`產出出現未核定碼：${unexpectedOutput.join("、")}`);
    if (missingCodes.length) details.push(`產出漏掉核定碼：${missingCodes.join("、")}`);
    push("error", "服務碼一致性", details.join("\n"));
  } else if (unsafeAiCodes.length) {
    push("warn", "服務碼一致性", `最終固定格式正確，但 AI 原始回傳曾嘗試使用未允許服務碼：${unsafeAiCodes.join("、")}。系統已阻擋，建議人工看一次問題清單。`);
  } else {
    push("pass", "服務碼一致性", `已核對 ${requiredCodes.size} 個核定／使用者登打服務碼，未發現多出或漏掉。`);
  }

  // 2. 月單位數
  const qtyErrors = [];
  (d.selected_services || []).forEach((x) => {
    const code = planClean(x.code);
    const qty = planClean(x.qty);
    const line = output.split(/\r?\n/).find((ln) => ln.trim().startsWith(code + "["));
    if (!line || !line.includes(`*${qty}單位/月`)) qtyErrors.push(`${code} 應為 ${qty} 單位/月`);
  });
  if (qtyErrors.length) push("error", "月單位數", qtyErrors.join("\n"));
  else push("pass", "月單位數", `已核對 ${(d.selected_services || []).length} 個服務項目的月單位數。`);

  // 3. CMS / 身分別
  const cmsNumber = planClean(d.cms_level).replace("第", "").replace("級", "");
  const cmsAmount = DATA.cms[d.cms_level];
  const identityShort = planClean(d.identity).split("（", 1)[0];
  const cmsOk = output.includes(`CMS ${cmsNumber}`) && output.includes(`${planNumber(cmsAmount)}元/月`);
  const identityOk = output.includes(`(一)身分別：${identityShort}`);
  if (cmsOk && identityOk) push("pass", "CMS 與身分別", `CMS ${cmsNumber}、額度 ${planNumber(cmsAmount)} 元/月及${identityShort}皆一致。`);
  else push("error", "CMS 與身分別", `${!identityOk ? "身分別不一致。" : ""}${!cmsOk ? "CMS 等級或額度不一致。" : ""}`);

  // 4. 金額 / 部分負擔（照顧+日照固定段落）
  const totals = expectedCareTotals(d);
  if (!totals.serviceItems.length) {
    push("pass", "照顧服務金額", "本次未選取照顧／日照服務，無固定金額可核對。");
  } else if (!totals.valid) {
    push("warn", "照顧服務金額", "部分服務月單位無法解析，請人工確認金額。");
  } else {
    const expectedLine = `以上擬訂計畫為:${planNumber(totals.total)}元/月，個案部分負擔為${totals.burdenRate}%為${planNumber(totals.burden)}元/月。`;
    if (output.includes(expectedLine)) push("pass", "照顧服務金額", `總額 ${planNumber(totals.total)} 元/月；部分負擔 ${totals.burdenRate}%＝${planNumber(totals.burden)} 元/月。`);
    else push("error", "照顧服務金額", `固定計算結果應為：${expectedLine}`);
  }

  // 5. 照會單位
  const unit = d.unit_selection || {};
  let expectedUnit = "";
  if (unit.mode === "designated" && planClean(unit.designated_unit)) expectedUnit = `(案家指定，照會單位：${planClean(unit.designated_unit)})`;
  if (unit.mode === "rotation" && planClean(unit.rotation_unit)) expectedUnit = `(依輪派原則進行照會：${planClean(unit.rotation_unit)})`;
  if (expectedUnit && output.includes(expectedUnit)) push("pass", "服務單位", expectedUnit);
  else if (expectedUnit) push("error", "服務單位", `產出未找到正確照會單位：${expectedUnit}`);

  // 6. 問題清單對應核定服務
  const mapped = new Set();
  (ai?.problem_items || []).forEach((x) => (x?.service_codes || []).forEach((c) => {
    const code = planClean(c).toUpperCase();
    if (selectedCodes.has(code)) mapped.add(code);
  }));
  const unmapped = [...selectedCodes].filter((c) => !mapped.has(c));
  if (!selectedCodes.size) push("pass", "問題清單對應", "本次未選取照顧／專業／日照服務，無需比對服務對應。");
  else if (!unmapped.length) push("pass", "問題清單對應", `已將 ${mapped.size}/${selectedCodes.size} 個已選服務碼連結至照顧問題。`);
  else push("warn", "問題清單對應", `有 ${unmapped.length} 個已選服務碼尚未在 AI 問題清單中建立直接對應：${unmapped.join("、")}。這不一定是錯誤，但建議人工確認。`);

  // 7. 來源佐證：Worker 要求 AI 回傳原文短片段，再由前端實際比對是否存在於來源文字
  const evidence = ai?.source_evidence;
  if (!evidence || typeof evidence !== "object") {
    push("warn", "原文來源佐證", "AI 未回傳 source_evidence。若剛更新 v7，請確認 Cloudflare Worker 也已更新成 v7。固定資料檢核仍有效。" );
  } else {
    const srcNorm = normalizeForEvidence(sourceText);
    const missingEvidence = [];
    const invalidEvidence = [];
    let validQuoteCount = 0;
    qualityEvidenceSections(ai).forEach(([key, needed, label]) => {
      if (!needed) return;
      const quotes = Array.isArray(evidence[key]) ? evidence[key].map(planClean).filter(Boolean) : [];
      const validQuotes = quotes.filter((q) => normalizeForEvidence(q).length >= 4 && srcNorm.includes(normalizeForEvidence(q)));
      validQuoteCount += validQuotes.length;
      if (!quotes.length) missingEvidence.push(label);
      else if (!validQuotes.length) invalidEvidence.push(label);
    });
    if (!missingEvidence.length && !invalidEvidence.length) {
      push("pass", "原文來源佐證", `AI 回傳的來源片段可在照專原文中找到，共核對 ${validQuoteCount} 段。仍建議人工確認重要疾病、家庭與經濟敘述。`);
    } else {
      const dts = [];
      if (missingEvidence.length) dts.push(`無佐證片段：${missingEvidence.join("、")}`);
      if (invalidEvidence.length) dts.push(`回傳片段無法在原文直接找到：${invalidEvidence.join("、")}`);
      push("warn", "原文來源佐證", dts.join("\n"));
    }
  }

  return checks;
}

function renderQualityChecks(checks) {
  const list = $("#qualityList");
  const summary = $("#qualitySummary");
  const overall = $("#qualityOverall");
  const counts = { pass: 0, warn: 0, error: 0 };
  checks.forEach((x) => counts[x.status] = (counts[x.status] || 0) + 1);

  summary.innerHTML = `
    <div class="quality-summary-box"><span>通過</span><strong>${counts.pass}</strong></div>
    <div class="quality-summary-box"><span>需確認</span><strong>${counts.warn}</strong></div>
    <div class="quality-summary-box"><span>異常</span><strong>${counts.error}</strong></div>`;

  list.innerHTML = checks.map((x) => {
    const icon = x.status === "pass" ? "✓" : x.status === "warn" ? "!" : "×";
    return `<div class="quality-item ${x.status}"><div class="quality-icon">${icon}</div><div><div class="quality-item-title">${escapeHtml(x.title)}</div><div class="quality-item-detail">${escapeHtml(x.detail || "")}</div></div></div>`;
  }).join("");

  overall.className = "quality-overall " + (counts.error ? "error" : counts.warn ? "warn" : "pass");
  overall.textContent = counts.error ? `${counts.error} 項異常` : counts.warn ? `${counts.warn} 項需確認` : "固定資料檢核通過";
}

function performQualityCheck() {
  if (!lastQualityContext) return;
  const output = $("#outputText").value;
  const checks = runQualityChecks(lastQualityContext.ai, lastQualityContext.data, output, lastQualityContext.sourceText);
  renderQualityChecks(checks);
}

function recheckQuality() {
  if (!lastQualityContext) return;
  performQualityCheck();
  showToast("已重新檢核目前產出內容");
}

function markQualityStale() {
  if (!lastQualityContext || $("#outputSection").classList.contains("hidden")) return;
  const overall = $("#qualityOverall");
  overall.className = "quality-overall stale";
  overall.textContent = "內容已修改，請重新檢核";
}

function demoAI(src, d) {
  const dates = [...src.matchAll(/(\d{2,3})[年\/.](\d{1,2})[月\/.](\d{1,2})/g)]
    .map((m) => `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`);
  const tm = src.match(/(?:訪視|共訪|家訪)[^\n]{0,20}?(\d{1,2}:\d{2})/);
  const assessor = src.match(/(?:照專|照顧管理專員)[：:\s]*([\u4e00-\u9fff]{2,4})/);
  return {
    visit_date: dates[0] || "",
    visit_time: tm?.[1] || "",
    interviewees: "",
    assessor_name: assessor?.[1] || "",
    submission_date: dates[1] || "",
    care_analysis: [
      "【示範模式】正式啟用 AI 後，這裡會依照專簡述整理疾病、功能狀況、就醫與照顧需求。",
      "【示範模式】目前服務碼、月單位數、金額與照會單位仍由網頁固定，不交由 AI 推算。",
    ],
    economic_analysis: "【示範模式】正式版由 AI 依照專原文整理。",
    environment_analysis: "【示範模式】正式版由 AI 依照專原文整理。",
    social_analysis: "【示範模式】正式版由 AI 依照專原文整理。",
    strengths_analysis: "【示範模式】正式版由 AI 依照專原文整理。",
    cms_change_note: "",
    problem_items: d.selected_services.length ? [{
      title: "照顧服務需求",
      analysis: "【示範】正式版會依照專內容整理問題、原因與目前處理方式。",
      service_codes: d.selected_services.slice(0, 3).map((s) => s.code),
      resolution: ""
    }] : [],
    service_execution: d.selected_services.map((s) => ({
      code: s.code,
      execution_note: "【示範】正式版將依照專內容補入實際協助內容與目的。",
    })),
    source_evidence: {
      visit: [src.slice(0, 24)],
      care_analysis: [src.slice(0, 24)],
      economic_analysis: [],
      environment_analysis: [],
      social_analysis: [],
      strengths_analysis: [],
      problem_items: [src.slice(0, 24)],
      service_execution: [src.slice(0, 24)],
    },
  };
}

async function callAI(payload) {
  if (CONFIG.DEMO_MODE || !CONFIG.API_URL) return demoAI(payload.source_text, payload.change_form_data);

  generationController = new AbortController();
  const timer = setTimeout(() => generationController?.abort(), CONFIG.REQUEST_TIMEOUT_MS || 180000);
  try {
    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(adminMode && adminKey
          ? { "X-Care-Plan-Admin-Key": adminKey }
          : (betaToken ? { "Authorization": `Bearer ${betaToken}` } : {})),
      },
      body: JSON.stringify(payload),
      signal: generationController.signal,
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    if (data.admin_mode) { adminMode = true; renderQuota(); }
    else if (data.quota) updateBetaSession({ quota: data.quota });

    if (!response.ok || data.ok === false) {
      if (response.status === 401 || data.code === "SESSION_INVALID" || data.code === "SESSION_EXPIRED" || data.code === "AUTH_REQUIRED" || data.code === "ADMIN_UNAUTHORIZED") {
        if (adminMode) {
          adminMode = false;
          adminKey = "";
          sessionStorage.removeItem(ADMIN_KEY_SESSION);
        } else {
          betaToken = "";
          localStorage.removeItem(BETA_TOKEN_KEY);
        }
        showAuthGate();
      }
      const err = new Error(data.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.code = data.code || "HTTP_ERROR";
      err.detail = data.detail || (raw && !Object.keys(data).length ? raw.slice(0, 1200) : "");
      throw err;
    }
    return data.data || data.result || data;
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("AI 產生已取消或連線逾時。");
      err.code = "REQUEST_ABORTED";
      throw err;
    }
    if (e instanceof TypeError && /fetch/i.test(e.message || "")) {
      const err = new Error("瀏覽器無法連線至 AI Worker，請確認網路或 Worker 狀態後再試。");
      err.code = "FETCH_FAILED";
      err.detail = e.message;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    generationController = null;
  }
}

async function generate() {
  const d = collect();
  if (!validate(d)) return;

  clearGenerateError();
  const btn = $("#generateBtn");
  btn.disabled = true;
  btn.textContent = "AI 整理中…";
  $("#retryBtn").disabled = true;
  $("#errorRetryBtn").disabled = true;
  $("#generateHint").textContent = CONFIG.DEMO_MODE
    ? "正在以示範模式產生版面…"
    : "正在送至 AI 整理，請稍候…";
  setLoading(true, "正在分析照專計畫簡述，並整理照顧問題與服務執行內容…");

  try {
    const ai = await callAI({
      source_text: $("#sourceText").value.trim(),
      change_form_data: d,
      writing_mode: currentWritingMode(),
      intervention_change: currentIntervention(),
    });
    const renderedPlan = renderPlan(ai, d, currentIntervention());
    setAiDraft(renderedPlan);
    lastQualityContext = {
      ai,
      data: d,
      sourceText: $("#sourceText").value.trim(),
    };
    performQualityCheck();
    $("#outputStatus").textContent = CONFIG.DEMO_MODE
      ? "目前為示範模式：照顧問題分析為示意文字；服務與金額格式為正式邏輯。"
      : `AI 產生完成；目前為${currentWritingMode() === "compact" ? "精簡" : currentWritingMode() === "detailed" ? "詳細" : "標準"}撰寫模式。`;
    $("#outputSection").classList.remove("hidden");
    showToast("個管照顧計畫產生完成");
    $("#outputSection").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    showGenerateError(e);
  } finally {
    setLoading(false);
    btn.disabled = Number(betaQuota?.remaining || 0) <= 0;
    btn.textContent = Number(betaQuota?.remaining || 0) <= 0 ? "AI 測試額度已用完" : "AI 產生個管計畫（使用 1 次）";
    $("#retryBtn").disabled = false;
    $("#errorRetryBtn").disabled = false;
    $("#generateHint").textContent = "固定資料由網頁控制；AI 依撰寫模式整理照顧問題分析、問題清單與服務執行目的。";
  }
}

function mergePartialAi(baseAi, partialAi, section) {
  const merged = { ...(baseAi || {}) };
  if (!partialAi || typeof partialAi !== "object") return merged;
  if (Object.prototype.hasOwnProperty.call(partialAi, section)) merged[section] = partialAi[section];

  const currentEvidence = (baseAi && typeof baseAi.source_evidence === "object" && baseAi.source_evidence) ? baseAi.source_evidence : {};
  const partialEvidence = (partialAi && typeof partialAi.source_evidence === "object" && partialAi.source_evidence) ? partialAi.source_evidence : {};
  merged.source_evidence = { ...currentEvidence };
  if (Object.prototype.hasOwnProperty.call(partialEvidence, section)) merged.source_evidence[section] = partialEvidence[section];
  return merged;
}

async function regenerateSection(section, button) {
  if (!PARTIAL_SECTION_LABELS[section]) return;
  if (!lastQualityContext) {
    alert("請先產生一份完整計畫，再使用局部重寫。");
    return;
  }
  const d = collect();
  if (!validate(d)) return;

  if (outputIsEdited()) {
    const ok = confirm(`目前計畫已有手動修改。重新整理「${PARTIAL_SECTION_LABELS[section]}」後，系統會依最新 AI 結果重新組版，手動修改內容將被 AI 原稿取代。

確定繼續嗎？`);
    if (!ok) return;
  }

  clearGenerateError();
  const buttons = $$(".partial-rewrite-btn");
  buttons.forEach((x) => { x.disabled = true; });
  if (button) {
    button.classList.add("is-loading");
    button.textContent = `${PARTIAL_SECTION_LABELS[section]}整理中…`;
  }
  setLoading(true, `正在重新整理「${PARTIAL_SECTION_LABELS[section]}」，其他區塊會保留…`);

  try {
    const partial = await callAI({
      source_text: $("#sourceText").value.trim(),
      change_form_data: d,
      writing_mode: currentWritingMode(),
      intervention_change: currentIntervention(),
      regenerate_section: section,
    });
    const mergedAi = mergePartialAi(lastQualityContext.ai, partial, section);
    const renderedPlan = renderPlan(mergedAi, d, currentIntervention());
    setAiDraft(renderedPlan);
    lastQualityContext = {
      ai: mergedAi,
      data: d,
      sourceText: $("#sourceText").value.trim(),
    };
    performQualityCheck();
    $("#outputStatus").textContent = `已重新整理「${PARTIAL_SECTION_LABELS[section]}」；其他 AI 區塊沿用上一版內容。`;
    showToast(`已重新整理${PARTIAL_SECTION_LABELS[section]}`);
  } catch (e) {
    showGenerateError(e);
  } finally {
    setLoading(false);
    buttons.forEach((x) => { x.disabled = false; });
    if (button) {
      button.classList.remove("is-loading");
      button.textContent = PARTIAL_SECTION_LABELS[section];
    }
  }
}

function restoreAiDraft() {
  if (!aiDraftText || !outputIsEdited()) return;
  if (!confirm("確定要放棄目前手動修改，復原為最近一次 AI 原稿嗎？")) return;
  $("#outputText").value = aiDraftText;
  updateDraftState();
  performQualityCheck();
  showToast("已復原 AI 原稿");
}

async function copyOutput() {
  const text = $("#outputText").value;
  if (!text.trim()) return;
  try {
    await navigator.clipboard.writeText(text);
    $("#copyBtn").textContent = "已複製 ✓";
    showToast("已複製個管照顧計畫");
    setTimeout(() => $("#copyBtn").textContent = "複製結果", 1300);
  } catch {
    alert("瀏覽器無法自動複製，請手動全選複製。");
  }
}

function updateModeBanner() {
  const b = $("#modeBanner");
  if (CONFIG.DEMO_MODE) {
    b.className = "mode-banner demo";
    b.innerHTML = "<strong>網頁測試版</strong><span>不連線照管平台；目前 AI 為示範模式，可先確認操作流程與產出格式。</span>";
  } else {
    b.className = "mode-banner live";
    b.innerHTML = "<strong>封閉測試</strong><span>每位測試者共 10 次 AI 呼叫；完整產生與局部重寫各計 1 次。服務碼、月單位、金額與照會單位仍由網頁固定。</span>";
  }
}

function loadSample() {
  resetAll(false);
  $("#identitySelect").value = "第三類（一般戶）";
  $("#cmsSelect").value = "第4級";
  ["BA02", "BA07", "BA20"].forEach((c, idx) => state.items.push({
    code: c,
    weeklyQty: [5, 2, 3][idx],
    qty: [23, 10, 14][idx],
    days: idx === 0 ? ["mon", "tue", "wed", "thu", "fri"] : idx === 1 ? ["tue", "fri"] : ["mon", "wed", "fri"],
  }));
  $('input[name="unitMode"][value="designated"]').checked = true;
  $("#designatedUnit").disabled = false;
  $("#designatedUnit").value = "大安心喜樂福祉有限公司";
  $("#mealEnabled").checked = true;
  $("#mealCount").value = "62";
  $("#writingModeSelect").value = "standard";
  $("#interventionSelect").value = "尚未使用";
  $("#interventionCustom").classList.add("hidden");
  $("#sourceText").value = "115年9月1日 11:00與個案本人共訪，照專藍尹謙評估。個案近期因下肢無力，沐浴及部分日常生活需他人協助，家庭可提供部分支持。照顧計畫於115年9月2日送出。";
  $("#charCount").textContent = `${$("#sourceText").value.length} 字`;
  renderAll();
  markDirty();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetAll(confirmFirst = true) {
  if (confirmFirst && !confirm("確定要清空目前資料嗎？")) return;
  state.filter = "all";
  state.query = "";
  state.items = [];
  state.aidItems = [];
  document.querySelectorAll("input[type=text],input[type=number],input[type=search],textarea").forEach((x) => x.value = "");
  document.querySelectorAll("input[type=checkbox],input[type=radio]").forEach((x) => x.checked = false);
  $("#identitySelect").value = "第三類（一般戶）";
  $("#cmsSelect").value = "第4級";
  $("#writingModeSelect").value = "standard";
  $("#interventionSelect").value = "尚未使用";
  $("#interventionCustom").classList.add("hidden");
  $("#designatedUnit").disabled = true;
  $("#rotationUnit").disabled = true;
  $$(".filter-chip").forEach((x) => x.classList.toggle("active", x.dataset.filter === "all"));
  $("#charCount").textContent = "0 字";
  $("#charCount").classList.remove("danger-badge");
  $("#outputSection").classList.add("hidden");
  lastQualityContext = null;
  aiDraftText = "";
  updateDraftState();
  $("#qualityOverall").className = "quality-overall pending";
  $("#qualityOverall").textContent = "尚未檢核";
  $("#qualitySummary").innerHTML = "";
  $("#qualityList").innerHTML = "";
  clearGenerateError();
  renderAll();
  markClean();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

init();
