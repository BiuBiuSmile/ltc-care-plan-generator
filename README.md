# 個管照顧計畫產生器 Web v3（正式 AI 串接版）

這版已將 v2 的示範模式切換為正式 Cloudflare Worker：

```text
GitHub Pages
  ↓
/care-plan-web
  ↓
Cloudflare Worker
  ↓
OpenAI
  ↓
回傳 JSON
  ↓
網頁固定格式產生個管照顧計畫
```

## GitHub Pages 需要上傳 / 覆蓋

- index.html
- styles.css
- data.js
- config.js
- app.js
- icon.png

`config.js` 已設定：

```js
DEMO_MODE: false
API_URL: "https://renbao-csms-license-server.ben50490.workers.dev/care-plan-web"
```

## Cloudflare Worker

請先部署本次提供的：

`renbao-csms-license-server_v2.6.3_plus_care_plan_web.js`

此檔是以原本 v2.6.3 為底，只新增 `/care-plan-web` 相關函式與路由；原本 `/openai-chat`、授權、試用、繳費、更新、管理 API 都保留。

## Web API 限制

- 允許來源：`https://biubiussmile.github.io`
- 照專簡述最多 30,000 字
- Request 最大約 120 KB
- 每個 IP 在單一 Worker isolate 內每 10 分鐘最多 10 次
- system prompt 固定在 Worker，前端不能自訂 system prompt
- 不把照專內容寫入 D1 / Worker log

> 注意：目前 rate limit 是 Worker 記憶體內的基本限制，不是全域強制限制。若網站公開給大量使用者，後續再加 Cloudflare Rate Limiting / Turnstile / 登入會更安全。
