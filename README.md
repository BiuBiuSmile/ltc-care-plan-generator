# 個管照顧計畫產生器 v10.2 最終穩定修正版

本版沿用 v10.1 全部功能，新增以下穩定性修正：

- AI `service_execution` 服務碼比對改為不分大小寫；`BA09a`、`BA17a`、`BA17d1`、`CB01a` 等不再因 AI 回傳大寫而遺失執行說明。
- 使用者取消關閉交通／輔具／喘息／餐飲／外籍看護時，不再誤把既有計畫標成「前置資料已變更」。
- 搭配 Worker v10.2：`qty / weekly_qty / fixed_month_qty / single_qty` 全部要求整數，並逐層驗證每週換算與本月合計。
- 搭配 Worker v10.2：AI 成功後的 usage log、session 清理、request 完成標記改為容錯處理，避免非關鍵 D1 寫入異常造成「已扣次但只看到失敗」。
- 搭配 Worker v10.2：個管 API 的 500 錯誤不再把 server stack trace 回傳到瀏覽器。

部署：先更新 Cloudflare Worker v10.2，再將本資料夾全部檔案覆蓋 GitHub Pages repository 根目錄。
Google Apps Script、既有 Secrets、D1 binding 不需重新設定。
