# Poker Ledger — 開發待辦清單

> 本清單只列**未完成**項目（2026-07-07 清理：已完成項全數移除，歷史實作紀錄見 `docs/`、
> git log 與 PR 歷史）。
>
> ❌ **明確不做**：LINE Bot 與任何依賴 LINE 付費推播（Messaging API push）的功能
> ——成本考量，完全排除，勿再列入評估。

---

## 🔴 P0 — 資安/金流

- [ ] **transactions 參與者限定讀取（子集合遷移）**：目前任何登入者可讀全部交易紀錄；
      rules 無法強制 list query 必帶 gameId 過濾，搬成 `games/{gameId}/transactions`
      子集合（由父文件把關）是唯一正解。create/undo 的欄位與身分驗證已於 2026-07 收緊
- [ ] **sessions `periods` 深層驗證需 CF**：rules 已限制非主辦者只能動
      periods/participantUids、不得增減時段、participantUids 只能加減自己；
      但 periods 內各時段的 roster「內容」仍可被整包改寫——完整防護需把 RSVP 改走 Cloud Functions
- [ ] **rules 自動部署**：CI 目前只測試不部署（firebase-deploy 部署前已加 emulator 測試 gate）。
      待辦：人工比對 production rules 與 repo 版本一致後，評估把
      `firebase deploy --only firestore:rules,firestore:indexes` 納入 firebase-deploy.yml
- [ ] **（德撲）客戶端自動結算 double-settle 競態**（`src/store/modules/poker.js:446-472`）：
      每個連線客戶端的 onSnapshot 都跑非原子 check-then-act，多客戶端可同時觸發結算；
      失敗時重置 `settling:false` 會再觸發。**金流相關，建議近期修復**：
      結算觸發移到 Cloud Functions（status 轉 ended 的 server-side trigger）或改 transaction 搶鎖

## 🟠 P1 — 效能（建議下一輪主力，與 F4 一起做）

- [ ] **排行榜 N+1 全量讀取**（`src/components/social/Leaderboard.vue:336-375`）：
      讀整個 `users` 集合 + 每人一次 `history_sub` getDocs（無上限），
      成本 O(使用者 × 場次)、每次開排行榜都跑。解法與功能評估 **F4** 合併：
      CF 維護 `leaderboardStats/{uid}` 彙總集合，排行榜改讀單一集合
- [ ] **`loadMyRooms` 全集合掃描**（`src/store/modules/game.js`）：抓所有 active games
      再前端過濾。加 `playerUids` 陣列欄位 + `array-contains` 查詢
      （需資料遷移 + rules list 條件同步調整）
- [ ] **TableManagementView 以 catch-fallback 代替索引**
      （`src/views/admin/TableManagementView.vue:221-256`）：orderBy 缺索引就退回無序全撈。
      補 `firestore.indexes.json` 對應索引、移除 fallback

## 🟡 P2 — 測試與程式碼品質

- [ ] **composables 單元測試**（useTournamentClock、useTimeBank、useTransactions 等
      依賴 firebase 的核心邏輯，需 mock firebase-init）；純工具函式已覆蓋
- [ ] **前端 ESLint**（導入 eslint-plugin-vue 並消化初次掃描結果；functions 已有）
- [ ] **E2E 測試**（Playwright）：開局→買入→結算關鍵路徑（需 Auth emulator 或測試環境）
- [ ] **`tests/events.test.js` placeholder 補實作**
- [ ] **store 監聽器洩漏盤點**：`poker.js` `stopListeners()`（:481-490）與 `game.js`
      `cleanup()`（:796）依賴 view 手動呼叫，漏呼叫即洩漏——盤點所有離開路徑，
      或改在 router leave guard 統一處理
- [ ] **統一後端錯誤處理（續）**：room.js / chat.js / transaction.js 與部分 game 流程的
      `new Error()` 換成錯誤碼（`createGameError`）
- [ ] **拆分其餘大檔案**（PokerGame.vue / PokerTable.vue / LobbyView.vue / useLiff.js /
      game.js store）：機械式拆分純屬可讀性、無法在本機多人實測下驗證回歸，
      留待有真機測試窗口時再做，不盲拆
- [ ] **雙軌狀態模式文件化**：Pinia store 與 composable 各自持有 Firestore 監聽與業務邏輯
      （ledger/auth/poker 走 store；sessions/tournament clock 走 composable）——
      訂約定寫進 copilot-instructions 即可，不強制重構

## 🟢 P3 — 維運（人工步驟）

- [ ] **執行 `scripts/migrate_entries_to_events.js`**（先 `--dry-run` 驗證，確認後
      `--delete-old`；需 production service account 憑證，須由維護者手動執行）
- [ ] **LINE Phase 1 人工驗證**：LINE App 內開 LIFF 自動登入進 Lobby、
      外部瀏覽器維持 email/guest 登入、頭像暱稱顯示為 LINE profile
- [ ] **德撲真機驗收**（§4-5 殘留）：兩支手機點連結到打完一手 ≤ 90 秒、
      中途重整 10 秒內回桌、找沒用過的朋友實測免解說入座——實作皆已到位，待實測計時

## 🃏 線上德撲（本體範圍外，順帶發現備忘）

- [ ] **Run It Twice 未接線 + 同板 bug**（`functions/src/engines/texasHoldem.js:453-499`）：
      引擎 `runItTwice()` 無任何 handler 呼叫、前端 `RunItTwiceModal.vue` 無任何引用（死碼）；
      且 `deck1`/`deck2` 從同一副牌複製、發牌順序相同——兩次 runout **必然完全相同**。
      要嘛修好牌堆邏輯並接上流程、要嘛整組刪除
- [ ] **死碼清理**：`calculateSidePots`（texasHoldem.js:399-445，讀已不存在的
      `seat.currentBet`；實際邏輯在 potCalculator.js）、`onTurnChange` no-op trigger
      （functions/src/index.js:717-722，註解自承已不需要）
- [ ] **Phase 5（未排程）**：錦標賽模式（線上發牌版）、Sit & Go、俱樂部系統、
      線上德撲專屬排行榜、成就系統

## 📱 LINE（僅限免費 LIFF 範圍；Bot/付費推播不做）

- [ ] **舊帳號遷移 / LINE 綁定**（Profile 頁綁定按鈕、`users/{uid}.lineUserId`）
- [ ] **群組統計與排行**：`liff.getContext().groupId` 彙總、月/季/總排名，
      **僅限 LIFF 內查看**（❌ 週報推送不做——需 Bot push）
- [ ] **LIFF 啟動參數解析**：`liff.getContext()` 取得來源群組 ID

---

## 💡 功能評估：數據統計強化（2026-07-07，建議順序 F1 → F4 → F2 → F3）

> 皆建立在既有 `users/{uid}/history_sub` 投影（Cloud Functions 寫入、已含每場結果）
> 之上，前端純計算 + Chart.js，後端成本低。

- [ ] **F1 個人戰績深度分析**（ReportView 強化；工作量：小）
  - 星期幾/時段勝率熱圖、連勝連敗記錄、最大單場贏/輸、平均買入 vs 損益（ROI 走勢）
  - 資料現成（history_sub 已有逐場記錄 + 時間戳），純前端聚合，無 schema 變更
- [ ] **F4 排行榜彙總集合**（工作量：中；**與 P1「排行榜 N+1」一石二鳥**）
  - CF 在結算/投影更新時同步維護 `leaderboardStats/{uid}`（月/季/年彙總欄位），
    排行榜從「全 users × history_sub 掃描」改為讀單一集合
  - 同時解 N+1 效能問題並開啟「歷史期間排行」「全站排行」等新能力
- [ ] **F2 錦標賽專屬統計**（工作量：小-中）
  - ITM 率、平均名次、錦標賽 ROI（buyIn vs prize）
  - 前置：確認 `history_sub` 投影是否帶 `placement`/`prize`
    （`functions/src/handlers/gameHistoryProjection.js`），缺則擴充投影欄位 + 回填既有紀錄
- [ ] **F3 對手對戰統計**（工作量：中）
  - 同桌次數、同桌時的相對損益（「跟誰打最容易輸」）
  - 需在投影加同場名單（可從 `settlementSnapshot` 回填）；注意隱私——僅限好友間可見

---

**最後更新**: 2026-07-07（移除已完成項；LINE Bot 完全排除）
**負責人**: Jayykk
**專案版本**: 10.0.0
