const CONFIG = window.CARE_PLAN_CONFIG || { DEMO_MODE: false, API_URL: "" };
const $ = (s) => document.querySelector(s);
const BETA_TOKEN_KEY = "carePlanBetaToken";
const ADMIN_KEY_SESSION = "carePlanAdminKey";
const PENDING_EMAIL_KEY = "carePlanPendingEmail";
const PENDING_EXPIRES_KEY = "carePlanPendingExpiresAt";
const OTP_TTL_MS = 10 * 60 * 1000;

function apiBaseUrl() {
  return String(CONFIG.API_URL || "").replace(/\/care-plan-web\/?$/, "");
}
function authApiUrl(action) {
  return `${apiBaseUrl()}/care-plan-auth/${action}`;
}
function setAuthError(message = "") {
  const el = $("#authError");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("hidden", !message);
}
async function authFetch(path, payload = {}, includeToken = false) {
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  const token = localStorage.getItem(BETA_TOKEN_KEY) || "";
  if (includeToken && token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(authApiUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok || data.ok === false) {
    const err = new Error(data.message || `HTTP ${response.status}`);
    err.code = data.code || "AUTH_ERROR";
    throw err;
  }
  return data;
}
function clearPendingVerification() {
  sessionStorage.removeItem(PENDING_EMAIL_KEY);
  sessionStorage.removeItem(PENDING_EXPIRES_KEY);
}
function savePendingVerification(email) {
  sessionStorage.setItem(PENDING_EMAIL_KEY, email);
  sessionStorage.setItem(PENDING_EXPIRES_KEY, String(Date.now() + OTP_TTL_MS));
}
function restorePendingVerification() {
  const email = String(sessionStorage.getItem(PENDING_EMAIL_KEY) || "").trim();
  const expiresAt = Number(sessionStorage.getItem(PENDING_EXPIRES_KEY) || 0);
  if (!email || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    clearPendingVerification();
    return false;
  }
  const emailInput = $("#emailInput");
  if (emailInput) emailInput.value = email;
  const sent = $("#authSentMessage");
  if (sent) sent.textContent = "驗證碼已寄出，請輸入信箱收到的 6 位數驗證碼。";
  $("#authStepInvite")?.classList.add("hidden");
  $("#authStepOtp")?.classList.remove("hidden");
  setTimeout(() => $("#verificationCodeInput")?.focus(), 0);
  return true;
}
function goToPlanner() {
  window.location.replace("app.html");
}
async function sendVerificationCode() {
  setAuthError("");
  const email = $("#emailInput").value.trim();
  if (!email) { setAuthError("請輸入 Email。"); return; }
  const btn = $("#sendVerifyCodeBtn");
  btn.disabled = true;
  btn.textContent = "寄送中…";
  try {
    const data = await authFetch("request-code", { email });
    savePendingVerification(email);
    $("#authSentMessage").textContent = data.message || "驗證碼已寄出。";
    $("#authStepInvite").classList.add("hidden");
    $("#authStepOtp").classList.remove("hidden");
    $("#verificationCodeInput").focus();
  } catch (e) {
    setAuthError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "取得 Email 驗證碼";
  }
}
async function verifyBetaLogin() {
  setAuthError("");
  const email = $("#emailInput").value.trim();
  const code = $("#verificationCodeInput").value.trim();
  if (!/^\d{6}$/.test(code)) {
    setAuthError("請輸入 6 位數 Email 驗證碼。");
    return;
  }
  const btn = $("#verifyLoginBtn");
  btn.disabled = true;
  btn.textContent = "驗證中…";
  try {
    const data = await authFetch("verify", { email, verification_code: code });
    const token = data.token || "";
    if (!token) throw new Error("驗證成功，但未取得登入憑證。請重新登入。");
    localStorage.setItem(BETA_TOKEN_KEY, token);
    clearPendingVerification();
    goToPlanner();
  } catch (e) {
    setAuthError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "完成驗證並進入";
  }
}
function initAuth() {
  // 管理者已從 admin.html 驗證時，直接進使用頁。
  if (sessionStorage.getItem(ADMIN_KEY_SESSION)) {
    goToPlanner();
    return;
  }
  // 已有測試者 session 時也直接進使用頁；app.html 會再向 Worker 驗證有效性。
  if (localStorage.getItem(BETA_TOKEN_KEY)) {
    goToPlanner();
    return;
  }
  restorePendingVerification();
  $("#sendVerifyCodeBtn")?.addEventListener("click", sendVerificationCode);
  $("#verifyLoginBtn")?.addEventListener("click", verifyBetaLogin);
  $("#authBackBtn")?.addEventListener("click", () => {
    setAuthError("");
    clearPendingVerification();
    $("#verificationCodeInput").value = "";
    $("#authStepOtp").classList.add("hidden");
    $("#authStepInvite").classList.remove("hidden");
    $("#emailInput")?.focus();
  });
  $("#verificationCodeInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") verifyBetaLogin();
  });
  $("#emailInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendVerificationCode();
  });
}
initAuth();
