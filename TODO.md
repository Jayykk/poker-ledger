# Poker Ledger — 開發待辦清單

> 詳細的歷史實作紀錄請見：`IMPLEMENTATION_SUMMARY.md`、`POKER_IMPLEMENTATION.md`、
> `POKER_FEATURES_IMPLEMENTATION.md`、`GAME_STATE_MACHINE_IMPLEMENTATION.md`、`POKER_UI_REDESIGN.md`

---

## ✅ 已完成功能總覽

### 記帳核心（Cash Ledger）
- [x] 建立/加入牌局、座位管理、buy-in / rebuy / stack 追蹤
- [x] 結算系統（匯率換算、損益計算）、CSV 匯出、報表複製
- [x] 每日報表（日期區間彙總 + 玩家排名）
- [x] 現金桌預設（Cash Presets）+ 統一開局流程（PR #157-159）
- [x] 交易歷程（transactions collection）：誰幫誰買入、撤銷、稽核軌跡
- [x] 撤銷保護：追蹤交易最後修改時間，buy-in 被修改後禁止 undo（961eb85, 406f6fa）

### 線上德州撲克（Live Texas Hold'em）
- [x] Phase 1-4 全部完成：Cloud Functions 遊戲引擎、發牌/比牌、完整下注流程、
      回合管理、勝負判定、動畫、音效、計時器、聊天、旁觀、好友邀請
- [x] 防殭屍任務機制（turnId / autoCloseToken 驗證）
- [x] Run It Twice、亮牌（showPokerCards）、邊池計算

### 錦標賽系統（Tournament）
- [x] 錦標賽時鐘（全螢幕盲注計時、自動升盲、休息時段、音效警示）
- [x] Dealer Clock 模式（匿名登入、URL 分享、5 秒倒數閃爍）
- [x] 鬧鐘音量強化：Web Audio API 原生排程、可蓋過 Spotify、iOS/LINE WebView 相容（bd647d2 等）
- [x] Time Bank（快捷預設、Firestore 同步）
- [x] 錦標賽預設（盲注結構、配置儲存）
- [x] Re-entry 管理（買入次數上限、undo、場次計數同步）
- [x] 螢幕常亮（Wake Lock，含 iOS fallback）
- [x] 錦標賽結算（含 active→completed 轉換修正，47d3127）

### 管理後台（Admin）
- [x] 桌況管理 `/admin/tables`（現金/錦標賽分頁、completed 過濾含 closed 狀態）
- [x] 現金桌編輯 `/admin/cash/:gameId`（含 ConfigDiffPreview 差異預覽）
- [x] 錦標賽編輯 `/admin/tournament/:sessionId`（含結算編輯）

### LINE 整合
- [x] Phase 1：LIFF 登入 + Firebase Custom Token（`line_{userId}` 映射）
- [x] Phase 2：代操作買入 + 交易歷程 UI
- [x] Phase 3：`liff.sendMessages()` 買入/撤銷/結算通知（免費方案，不用 Bot push）
- [x] Phase 4：LIFF UX 適配、shareTargetPicker 邀請、deep link 快速加入、
      錦標賽分享連結自動加入（cfc6da4）

### 基礎設施
- [x] 報表圖表穩定化（destroy+recreate、防無限 re-render，aff33e6 / 068fd72）
- [x] 排行榜期間過濾改用日曆邊界（9a422b3）
- [x] Cache-busting 檔名 + no-cache meta tags（b53a5b3）
- [x] GitHub Actions 自動部署（GitHub Pages + Firebase Functions/Hosting，WIF 認證）

---

## 🚧 未完成（既有規劃）

### 線上德撲 Phase 5（進階，未排程）
- [ ] 錦標賽模式（線上發牌版）
- [ ] Sit & Go
- [ ] 俱樂部系統
- [ ] 排行榜（線上德撲專屬）
- [ ] 成就系統

### LINE Phase 1 驗證（待人工測試）
- [ ] LINE App 內開啟 LIFF → 自動登入 → 進入 Lobby
- [ ] 外部瀏覽器保持原有 email/guest 登入
- [ ] 頭像、暱稱正確顯示為 LINE profile

### LINE Phase 5（可選 / 未來）
- [ ] LINE Bot 指令（Webhook + Rich Menu：開局 / 我的紀錄 / 幫助）
- [ ] 舊帳號遷移 / LINE 綁定（Profile 頁綁定按鈕、`users/{uid}.lineUserId`）
- [ ] 群組統計與排行（`liff.getContext().groupId` 彙總、月/季/總排名、週報推送）
- [ ] LIFF 啟動參數解析：`liff.getContext()` 取得來源群組 ID

---

## 🔧 優化待辦（2026-06-12 全專案 Review 產出）

### P0 — 安全性

- [ ] **收緊 Firestore rules 的 list 權限（get 維持開放，連結加入不受影響）**
  - 問題不在「有連結就能讀」（文件 ID 為不可猜測的隨機字串，連結即授權，符合產品設計），
    而在任何登入者可下**不帶條件的 collection query** 枚舉整個資料庫的牌局與結算金額
  - 做法：將 `allow read` 拆成 `allow get`（維持 `isAuthenticated()`）+ `allow list`（收緊）
    - `games` / `pokerGames`：list 僅允許 `status == 'active'`（大廳本來就只查 active）或 `isAdmin()`
      → 大廳、連結加入、deep link 全部照常，但已結算的歷史牌局不可被枚舉
    - `tournamentSessions`：list 僅允許 `hostUid == auth.uid` 或 `isAdmin()`
      （TableManagementView 已有 creator-scoped fallback query，不會壞）
  - **不可動的依賴**（收緊前必測）：`game.js:151` 連結加入的 get、`game.js:765` 大廳 active list、
    `Leaderboard.vue:427` 的 `collectionGroup('hands')`（hands 維持可讀，或改 Cloud Function 聚合）
  - 變更需搭配 Firestore emulator rules 測試防 regression
- [ ] **transactions 參與者限定讀取（中期）**：要做到「只有該局參與者可讀」需資料結構配合
  （搬成 `games/{gameId}/transactions` 子集合，或在交易文件 denormalize 參與者 uid 清單）；
  短期先比照上面拆 get/list 防全域枚舉
- [ ] **Cloud Tasks HTTP endpoint 增加請求驗證**
  - `handleTurnTimeout` / `handleShowdownResolve` / `handleRoomAutoClose` 等 `onRequest`
    handler 無簽章驗證（目前僅靠 payload 內 turnId/token 緩解）
  - 建議啟用 Cloud Tasks OIDC service account 認證，或 payload 加 HMAC 簽章
- [ ] **聊天訊息輸入強化**（`functions/src/handlers/chat.js:21-30`）
  - 目前僅 trim + 截斷 500 字，補上控制字元過濾／HTML escape

### P1 — 清理死碼與重複

- [ ] **刪除根目錄 legacy 檔案**（舊 CDN 版 vanilla 實作，零引用，App 完全走 `src/` + Vite）
  - `auth.js`、`game.js`、`main.js`、`store.js`、`views.js`、`firebase-init.js`、`config.js`
  - 注意：根目錄 `index.html` 是 Vite 入口，**不可刪**
- [ ] **刪除未使用的 `src/views/game/PokerTable.vue`**（router 與所有 import 皆無引用的包裝層）
- [ ] **移除 `functions/src/utils/validators.js` 中已標記 deprecated 的函式**
  （`validatePlayerAction` / `validateGameStart`，已由 `engines/actionValidator.js` 取代）
- [ ] **評估移除 `src/composables/useGame.js` 薄包裝層**（純轉發 `useGameStore`，無附加邏輯）
- [ ] **整理根目錄實作筆記**：將 5 份 `*_IMPLEMENTATION*.md` / `POKER_UI_REDESIGN.md` /
  `TESTING_GUIDE.md` 移到 `docs/` 資料夾，保持根目錄乾淨

### P1 — 測試與 CI

- [ ] **CI 加入測試步驟**：`deploy.yml` 與 `firebase-deploy.yml` 目前只 build 不跑測試，
  在 deploy 前加 `npm test`（i18n 完整性測試也會一併把關）
- [ ] **CI 加入 lint**（frontend 目前無 ESLint 設定；functions 有但 CI 沒跑）
- [ ] **補 Cloud Functions 測試**：`functions/` 連 test script 都沒有；
  優先覆蓋 `engines/`（potCalculator 邊池、handEvaluator、gameStateMachine、actionValidator）— 純函式易測
- [ ] **補 composables 單元測試**（useTournamentClock、useTimeBank、useTransactions 等核心邏輯）
- [ ] **Firestore emulator 整合測試**：`tests/events.test.js` 目前是 placeholder；
  rules 變更（尤其 P0 收緊後）需要 emulator 測試防 regression

### P2 — 程式碼品質

- [ ] **拆分超大檔案**（>700 行，維護困難）：
  - `functions/src/handlers/game.js`（1815 行）→ 拆成 gameFlow / gameAction / gameControl
  - `src/views/admin/CashTableEditView.vue`（1029 行）→ 表單區塊抽子元件
  - `src/components/tournament/DealerClockDisplay.vue`（923 行）
  - `src/components/game/PokerTable.vue`（879 行）→ 座位區 / 操作區 / 公共牌區
  - `src/views/PokerGame.vue`（832 行）、`src/views/LobbyView.vue`（796 行）、
    `src/store/modules/game.js`（767 行）、`src/composables/useLiff.js`（749 行）
- [ ] **統一後端錯誤處理**：`game.js` 混用 `new Error()` 與 `createGameError()`，
  全面改用 `createGameError` + 錯誤碼（前端才能穩定解析）
- [ ] **清理 console.log**：全前端約 116 處（`useTournamentClock.js` 20 處、
  `store/modules/game.js` 14 處、`PokerGame.vue` 12 處…），改用可依環境關閉的 logger util
- [ ] **統一數值轉換**：`transaction.js` 的 `Number(x) || 0` 與
  `gameHistoryProjection.js` 的 `roundNumber()` 模式不一致，抽共用 `coerceNumber()`

### P2 — 維運與資料

- [ ] **執行 `scripts/migrate_entries_to_events.js` 遷移**（先 `--dry-run` 驗證，
  確認後再 `--delete-old`；目前 events 子集合遷移尚未執行）
- [ ] **硬編碼逾時改為可設定**：`SHOWDOWN_RESOLVE_DELAY_SECONDS`、
  `WIN_BY_FOLD_TIMEOUT_SECONDS`（game.js:38-40）、`ROOM_IDLE_TIMEOUT_SECONDS`（room.js:21）
  → 移到 Firestore config 或環境變數，免重新部署即可調整
- [ ] **檢查並清理未使用的 Firestore 索引**（`firestore.indexes.json` 中
  `transactions (gameId, status, targetUid)` 疑似未使用）
- [ ] **Cloud Tasks 建立失敗的 dead-letter 記錄**：task 建立目前 fire-and-forget，
  失敗只寫 log，計時器會無聲失效 → 失敗時落 Firestore 供告警/重試

### P3 — 升級與長期（不含線上德撲，見 P4）

- [ ] **升級 Firebase JS SDK v9 → v12**（前端 `firebase@^9.22.0` 已是 2021 年版本；
  已用 modular API，升級成本低，可獲得 bundle size 與效能改善）
- [ ] **大量手牌歷史分頁**：`gameHistoryProjection` / `handHistories` 一次讀全部，
  千手以上牌局需 cursor 分頁
- [ ] **E2E 測試**（Playwright）：覆蓋開局→買入→結算的關鍵路徑
- [ ] **評估 `pokersolver` 維護狀態**，必要時尋找替代或 vendor 進專案

### P4 — 線上德撲大重構（UX 全面重新設計）

> 背景：線上德撲後端引擎（發牌/比牌/邊池/狀態機）品質紮實，但**操作流程不順**導致棄用。
> 重構原則：後端引擎保留，**砍掉重練的是流程與前端狀態層**——目標是把
> 「開桌到打完第一手」做到跟記帳功能一樣順。

#### 4-1. 現況問題盤點（動工前先做，避免重構錯方向）
- [ ] UX Audit：兩支手機實測完整流程，記錄每一步的點擊數、等待秒數、卡住的點
      （建房 → 入座 → 買入 → 開局 → 每手操作 → 結算）
- [ ] 列出放棄當時的具體痛點清單（哪一步「奇怪」：入座流程？輪到誰不明顯？按了沒反應？）
- [ ] 量測 Cloud Functions 延遲：每個玩家操作都走 callable（`pokerPlayerAction`），
      冷啟動 + 來回延遲是「按了沒反應」的最大嫌疑

#### 4-2. 入口流程重設計 — 對齊記帳的順暢度
- [ ] **一鍵開桌**：建房即自動入座（房主），砍掉 建房→找房→選座→買入 的多步驟
- [ ] **連結即入桌**：點分享連結 → 自動以預設買入入座（與記帳 deep link 同模式），
      只有籌碼不足/滿座才跳互動
- [ ] **自動開局**：≥2 人入座即自動倒數開局，每手結束自動續局
      （現有 `startPokerHand` 手動觸發 + `handleStartNextHand` 任務鏈重新梳理）
- [ ] 統一入口：併入統一大廳（與現金桌/錦標賽同一個建局流程，重用 cash presets 模式）

#### 4-3. 操作體驗 — 消滅「按了沒反應」
- [ ] **樂觀更新全覆蓋**：操作立即在 UI 反映為「待確認」狀態，後端確認落定、失敗回滾
      （目前部分有做，需要系統化到所有操作）
- [ ] **預先操作（act-ahead）**：未輪到時可預選 Fold / Check-Fold / Call Any，輪到自動送出
- [ ] **延遲優化**：`pokerPlayerAction` 等高頻 callable 設 `minInstances: 1` 消冷啟動；
      前端先跑 `actionValidator` 同款驗證（共用驗證邏輯包）即時擋非法操作，不等後端報錯
- [ ] **輪到誰一目了然**：當前行動者高亮 + 倒數圈 + 震動/音效提示（重用錦標賽音效系統）
- [ ] **斷線重連**：重新整理/切 app 回來無縫回桌恢復狀態（snapshot 驅動 + 本地動畫狀態重建）

#### 4-4. 前端狀態層重構（配合 4-3 的地基）
- [ ] `poker.js` store + `PokerGame.vue`（832 行）+ `PokerTable.vue`（879 行）狀態流重整：
      UI 純由 Firestore snapshot 單向驅動，操作只發指令不直接改狀態
- [ ] **動畫與狀態解耦**：動畫佇列消化狀態變化（快速連續更新不跳格、不閃爍），
      整併 `useGameAnimation` / `useGameAnimations` / `useShowdownAnimation`
- [ ] 先執行 `migrate_entries_to_events.js`，事件統一走 events 子集合（動畫佇列的資料來源）

#### 4-5. 驗收標準（重構完成的定義）
- [ ] 兩支手機從點連結到打完一手 ≤ 90 秒、全程無「按了沒反應」超過 1 秒的點
- [ ] 任一方中途重整頁面，10 秒內無縫回桌
- [ ] 非法操作（籌碼不足、未輪到）在前端即時擋下，不出現後端錯誤 toast
- [ ] 邀請一位沒用過的朋友實測，不需口頭解說能完成入座與第一手操作

---

**最後更新**: 2026-06-12
**負責人**: Jayykk
**專案版本**: 10.0.0
