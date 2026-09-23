# 個管照顧計畫產生器 Web v2

這版先把「付費 / 會員」拿掉，重點放回真正工作流程：

1. 身分別、CMS、外籍看護 30% 額度
2. 勾選 BA / 專業 / 日照服務
3. 每週次數、服務星期、月單位數、額度與部分負擔
4. 交通、輔具、喘息、送餐、其他資源
5. 指定單位 / 輪派單位（必填）
6. 服務介入後改變
7. 貼上照專計畫簡述
8. 產生固定格式個管照顧計畫

## 目前 AI 模式

`config.js` 預設：

```js
DEMO_MODE: true
```

因此可以完整操作、驗證欄位、計算金額與查看最終格式，但「照顧問題分析」會用示範文字，不會把資料送出去。

之後 Cloudflare Worker Web 端點完成後：

```js
DEMO_MODE: false,
API_URL: "https://你的-worker.workers.dev/care-plan-web"
```

即可切換成真正 AI。

## GitHub Pages

把下列檔案放 repository 根目錄：

- index.html
- styles.css
- data.js
- config.js
- app.js
- icon.png

Settings → Pages → Deploy from a branch → main / root。

## 安全原則

- 不連線照管平台。
- OpenAI API Key 不放 GitHub Pages。
- 正式 prompt 建議也放 Cloudflare Worker，避免前端直接暴露全部 AI 規則。
- 個案照專簡述只在按下產生時送到 Worker；是否留存由 Worker 決定，建議不要寫入 log / DB。
