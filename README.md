# 個管照顧計畫產生器 v9 封閉測試版

## 新增
- 邀請碼 + Email 6 位數驗證碼
- 每位測試者固定 10 次 AI 呼叫額度
- 完整產生與局部 AI 重寫各扣 1 次；本地品質檢核、編輯、複製不扣
- `admin.html` 簡易管理頁：新增測試者、看使用量、停用、重發邀請碼、重設 10 次、刪除
- D1 僅保存測試帳號、登入驗證、額度與 AI 呼叫統計；不保存照專/個案本文

## Cloudflare Worker 必要設定
保留既有 `OPENAI_API_KEY` 與 `LICENSE_DB` 綁定，另外新增：

1. Secret：`CARE_PLAN_ADMIN_KEY`
   - 管理頁登入密碼。請設成長且不可猜的字串。
2. Secret：`CARE_PLAN_AUTH_SECRET`
   - 用於邀請碼與驗證碼雜湊。請用另一組長隨機字串。
3. Secret：`RESEND_API_KEY`
   - 用於寄送 Email 驗證碼。
4. Variable 或 Secret：`CARE_PLAN_EMAIL_FROM`
   - 例如：`個管照顧計畫測試 <noreply@your-domain.com>`
   - 寄件網域需先在 Resend 驗證。

D1 資料表會由 Worker 第一次使用時自動建立，不需手動執行 SQL。

## 更新順序
1. 將 `Worker_v9_封閉測試_邀請碼Email驗證.txt` 全部覆蓋至現有 Worker 並 Deploy。
2. 設定上述 Worker Secrets / Variable。
3. 將本資料夾所有檔案覆蓋 GitHub Pages Repository。
4. 開啟 `admin.html`，輸入 `CARE_PLAN_ADMIN_KEY` 建立測試帳號。
5. 把「邀請碼 + 登記 Email」交給測試者。
6. 測試者進首頁後輸入邀請碼與 Email，收 6 位數驗證碼後登入。

## 安全行為
- 邀請碼只儲存雜湊，管理頁建立/重發時只顯示一次。
- Email 驗證碼有效 10 分鐘，最多錯 5 次。
- 驗證後工作階段最長 7 天；同一測試帳號重新驗證會讓舊登入失效。
- 使用者停用或到期後，AI 端點立即拒絕。
- 額度在 Worker 呼叫 OpenAI 前原子扣除；若 OpenAI 呼叫失敗會退回該次額度。
- CORS 仍限制 GitHub Pages 來源，但真正的 AI 權限由 Worker session + D1 額度控制。
