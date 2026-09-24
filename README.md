# 個管照顧計畫產生器｜v5 桌面網頁版

這版將 v4 正式測試版改為 **Desktop-first 桌面網頁介面**，AI 與資料邏輯不變。

## 主要調整
- 網頁最大寬度擴至約 1720px，不再像手機版置中窄欄。
- 桌面採「主要工作區 + 右側固定導覽／服務摘要」配置。
- STEP 2 服務選擇與 STEP 3 額度摘要左右並排。
- STEP 4 其他服務與 STEP 5/6 基本設定左右並排。
- 寬螢幕服務卡片可顯示 3 欄。
- 右側提供 STEP 1～8 快速跳轉。
- 已選服務摘要改放右側欄，不再浮在螢幕角落。
- 1180px 以下自動改為單欄；720px 以下仍保留手機響應式介面。
- Worker、AI Prompt、服務計算與輸出格式均未改動。

## 部署
將本資料夾中的 `index.html`、`styles.css`、`app.js`、`data.js`、`config.js`、`icon.png` 上傳到 `ltc-care-plan-generator` Repository 根目錄，覆蓋既有前端檔案即可。

Cloudflare Worker 不需要因本次版面修改重新部署。
