// Web 版設定
// 預設為 true：先看完整操作流程，不送資料到任何 AI。
// 等 Cloudflare Worker Web 端點完成後，改成 false 並填入 API_URL。
window.CARE_PLAN_CONFIG = {
  DEMO_MODE: true,
  API_URL: "", // 例如：https://你的-worker.workers.dev/care-plan-web
  REQUEST_TIMEOUT_MS: 180000
};
