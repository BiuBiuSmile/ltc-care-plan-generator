# 個管照顧計畫產生器 v9.4｜驗證／使用分頁版

- `index.html`：Email 驗證專用頁。
- `app.html`：個管計畫實際使用頁，沒有有效測試者 session 或管理者 session 會自動回到 `index.html`。
- `admin.html`：管理者頁，登入後「進入計畫系統」會前往 `app.html`。
- 測試者完成 6 位數 Email 驗證後會直接跳轉到 `app.html`，不會再看到驗證卡片與計畫頁出現在同一頁。
- Cloudflare Worker 不需因本次前端分頁修改而更新。


## v9.5
- Email 驗證碼寄出後，重新整理驗證頁會保留「輸入驗證碼」狀態。
- 10 分鐘後自動失效並回到重新取得驗證碼。
- 驗證成功或返回修改 Email 時會清除暫存狀態。
