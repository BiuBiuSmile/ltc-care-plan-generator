# 個管照顧計畫產生器 Web v4（實際測試版）

這版建立在已成功串接 AI 的 v3 上，新增三大項：

1. Cloudflare Worker CORS 收回正式白名單，只允許指定 GitHub Pages / 本機測試來源。
2. Web 最終產出格式與桌面版 `care_plan_generator_v4_cloudflare_openai_proxy_送餐OT01格式.py` 對齊。
3. 操作體驗強化：大型 Loading、取消產生、完整錯誤資訊、重新產生、複製成功提示、離頁提醒、固定已選服務摘要。

## GitHub Pages 上傳 / 覆蓋

請將以下檔案放在 Repository 根目錄：

- index.html
- styles.css
- data.js
- config.js
- app.js
- icon.png
- README.md

`config.js` 已設定正式 AI：

```js
DEMO_MODE: false
API_URL: "https://renbao-csms-license-server.ben50490.workers.dev/care-plan-web"
```

## Cloudflare Worker

請部署另外提供的：

`renbao-csms-license-server_v2.6.3_care_plan_web_正式版.txt`

它以目前已成功運作的 CORS 測試版為底，只將 `/care-plan-web` 的 CORS 從 `*` 收回白名單；既有 `/openai-chat`、授權、試用、繳費、更新、管理 API 不變。

## v4 產出格式對齊項目

- 民國日期統一 `yyy/mm/dd`
- 四碼時間自動轉回 `hh:mm`
- 照顧問題分析空值文字與桌面版一致
- 三、照顧問題清單固定預留五行
- CMS 額度與計畫金額不加入千分位，與桌面版一致
- BA / 專業 / 日照服務行格式與桌面版一致
- 指定單位 / 輪派單位格式一致
- 交通服務格式一致
- 輔具起訖日、3年額度、已核銷總金額格式一致
- GA09：`GA09[居家喘息服務] 42次/年`
- OT01：`OT01[營養餐飲](10801)*62單位/月`
- 無需求：`案家目前暫無使用之需求。`

## CORS

正式允許來源：

- `https://biubiussmile.github.io`
- `http://localhost:5500`
- `http://127.0.0.1:5500`
- `http://localhost:8000`
- `http://127.0.0.1:8000`

若未來改用 `careplan.chkia.dev` 等自訂網域，需要把新 Origin 加進 Worker 白名單。
