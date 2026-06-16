# Poker Ledger — 開發待辦清單

> 詳細的歷史實作紀錄請見 `docs/`：`IMPLEMENTATION_SUMMARY.md`、`POKER_IMPLEMENTATION.md`、
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

- [x] ~~收緊 Firestore rules 的 list 權限~~ ✅ 2026-06-12：
  - `get` 維持開放（連結即授權，deep link / Dealer Clock 分享不受影響）；
    `list` 收緊為 active/joinable、自己主持的、或 admin —— 歷史牌局不可被枚舉
  - 同時補齊程式碼實際使用但 rules 缺漏的 collection：`games/{id}/hands`（手動手牌記錄）、
    `friendRequests`、`users/{uid}/invitations`、好友互加 mirror 寫入、
    `pokerGames/{id}/events`、hands 的 collection-group 讀取（排行榜需要）
  - 測試：`tests/rules/firestoreRules.test.js`（emulator，CI 執行）
  - ⚠️ **部署注意**：CI 不會自動部署 rules，需手動 `firebase deploy --only firestore:rules,firestore:indexes`；
    部署前建議先確認 production 現行 rules 與 repo 版本的差異（repo 舊版含無效語法
    `players[].uid`，疑似從未成功部署過，線上實際 rules 可能更寬鬆）
- [ ] **transactions 參與者限定讀取（中期）**：要做到「只有該局參與者可讀」需資料結構配合
  （搬成 `games/{gameId}/transactions` 子集合，或在交易文件 denormalize 參與者 uid 清單）；
  rules 無法強制 list query 必帶 gameId 過濾，子集合遷移是唯一正解
- [x] ~~Cloud Tasks HTTP endpoint 增加請求驗證~~ ✅ 2026-06-12：HMAC-SHA256 簽章
  （`utils/taskAuth.js`），5 個 task endpoint 全數驗證；**需設定 `POKER_TASKS_SECRET`
  環境變數後才生效**（未設定時跳過驗證並警告，向後相容）
- [x] ~~聊天訊息輸入強化~~ ✅ 2026-06-12：過濾控制字元/零寬/雙向控制字元

### P1 — 清理死碼與重複

- [x] ~~刪除根目錄 legacy 檔案~~ ✅ 2026-06-12：7 個檔案全數移除
- [x] ~~刪除未使用的 `src/views/game/PokerTable.vue`~~ ✅ 2026-06-12
- [x] ~~移除 deprecated validators~~ ✅ 2026-06-12：`startHand` 改用 actionValidator 版本
- [x] ~~移除 `useGame.js` 薄包裝層~~ ✅ 2026-06-12：3 個 view 改用 `useGameStore` + `storeToRefs`
- [x] ~~實作筆記移到 `docs/`~~ ✅ 2026-06-12

### P1 — 測試與 CI

- [x] ~~CI 加入測試步驟~~ ✅ 2026-06-12：新增 `ci.yml`（PR/branch push 跑 test+build+
  functions lint+rules emulator 測試）；兩個 deploy workflow 部署前先過 test+lint
- [ ] **前端 ESLint 設定**（functions 有且 CI 已跑；frontend 仍無 ESLint 設定，需另行導入
  eslint-plugin-vue 並消化初次掃描結果）
- [x] ~~補 Cloud Functions 測試~~ ✅ 2026-06-12：`tests/functions/` 106 個引擎測試
  （potCalculator/actionValidator/gameStateMachine/deck/handEvaluator），
  並由此**揪出攤牌 10 點牌格式誤判的重大 bug**（已修）
- [ ] **補 composables 單元測試**（useTournamentClock、useTimeBank、useTransactions 等
  依賴 firebase 的核心邏輯，需 mock firebase-init）；純工具函式已覆蓋
  （formatters/exportReport/tournamentStats/historyProjection，116 個測試）
- [x] ~~Firestore emulator rules 測試~~ ✅ 2026-06-12：`tests/rules/` + `npm run test:rules`，
  CI 內以 emulator 執行；`tests/events.test.js` placeholder 仍待補實作

### P2 — 程式碼品質

- [x] ~~拆分 `functions/handlers/game.js`（1815 行）~~ ✅ 2026-06-12：拆成
  gameFlow.js（953）/ gameActions.js（473）/ gameControl.js（435），game.js 成 37 行 façade
- [x] ~~拆分 `CashTableEditView.vue` / `DealerClockDisplay.vue`~~ ✅ 2026-06-12：
  CashTableEditView 1147→618 行（抽出 BasicInfoForm / SettlementCorrectionEditor /
  VersionHistoryPanel）；DealerClockDisplay 1084→280 行（抽出 Header / StatsPanel /
  CenterPanel / PayoutsPanel）
- [ ] **拆分其餘大檔案**（`PokerTable.vue` / `PokerGame.vue` / `LobbyView.vue` / `useLiff.js` / `game.js` store）：
  P4 功能已完成（見 4-4），機械式拆分純屬可讀性、且無法在本機多人實測下驗證回歸，
  判斷留待「有真機測試窗口」時再做，不盲拆。
- [ ] **統一後端錯誤處理（續）**：`Game not found` 與 `validateGameStart` 已改
  `createGameError`；其餘 `new Error()`（room.js / chat.js / transaction.js 與部分
  game 流程錯誤）仍待全面換成錯誤碼
- [x] ~~清理 console.log~~ ✅ 2026-06-12：新增 `src/utils/logger.js`（debug 僅 DEV 輸出），
  console.log 全數替換（實際僅 10 處；當初估的 116 含 warn/error，那些保留）
- [x] ~~統一數值轉換~~ ✅ 2026-06-12：`functions/src/utils/numbers.js`
  （coerceNumber/roundNumber/toMillis）

### P2 — 維運與資料

- [ ] **執行 `scripts/migrate_entries_to_events.js` 遷移**（先 `--dry-run` 驗證，
  確認後再 `--delete-old`；需要 production service account 憑證，須由維護者手動執行）
- [x] ~~硬編碼逾時改為可設定~~ ✅ 2026-06-12：`functions/src/utils/config.js`，
  全部可用環境變數覆寫（見 `functions/.env.example`），並消除 4 處重複定義
- [x] ~~清理未使用索引~~ ✅ 2026-06-12：移除 `transactions(gameId,status,targetUid)`；
  另補 `hands.createdAt` 的 COLLECTION_GROUP fieldOverride（排行榜/牌型查詢需要）
- [x] ~~Cloud Tasks dead-letter~~ ✅ 2026-06-12：task 建立失敗寫入 `taskFailures` collection

### P3 — 升級與長期（不含線上德撲，見 P4）

- [x] ~~升級 Firebase JS SDK v9 → v12~~ ✅ 2026-06-12：12.14.0，全測試通過
- [x] ~~無上限查詢加分頁/上限~~ ✅ 2026-06-12：`getTransactionLog` 上限 200、
  排行榜與牌型詳情的 `collectionGroup('hands')` 改為最近 1000 筆
  （`gameHistoryProjection` 經查只讀單一文件，無此問題）
- [ ] **E2E 測試**（Playwright）：覆蓋開局→買入→結算的關鍵路徑（需可登入的
  測試環境或 Auth emulator，本機/CI 基礎建設待建）
- [x] ~~評估 `pokersolver`~~ ✅ 2026-06-12 結論：**保留**。2.1.4 自 2019 年未更新，
  但零依賴、純計算、無安全面；已用 17 個測試釘住行為（並修掉 10 點牌格式 bug）。
  若未來要換，候選為自寫 evaluator 或 vendor 進專案

### P4 — 線上德撲大重構（UX 全面重新設計）

> 背景：線上德撲後端引擎（發牌/比牌/邊池/狀態機）品質紮實，但**操作流程不順**導致棄用。
> 重構原則：後端引擎保留，**砍掉重練的是流程與前端狀態層**——目標是把
> 「開桌到打完第一手」做到跟記帳功能一樣順。

#### 4-1. 現況問題盤點（動工前先做，避免重構錯方向）
- [x] ~~程式碼層架構盤點~~ ✅ 2026-06-15：完整盤點前後端線上德撲架構，定位痛點根因：
  建房不自動入座、連結不自動入座、第一手要手動、無桌內分享、加入用錯 6 碼驗證、`playSound` 是 no-op、
  callable 無 `minInstances` 冷啟動、前端無共用驗證。以上皆已於 4-2/4-3/4-4 修掉。
- [ ] **兩支手機實測 UX Audit**（需實機，無法在本機/CI 進行）：記錄每步點擊數、等待秒數、卡住點，
      量測 `pokerPlayerAction` 實際延遲（暖機後）。建議在 4-5 驗收時一併完成。

#### 4-2. 入口流程重設計 — 對齊記帳的順暢度
- [x] ~~**一鍵開桌**：建房即自動入座（房主），砍掉 建房→找房→選座→買入 的多步驟~~ ✅ 2026-06-15：
  - 後端 `createRoom(config, userId, userInfo)` 在 `config.buyIn` 有效時直接把房主入座 seat 0
    （`functions/src/utils/seatFactory.js` 純函式 `buildSeatData` / `resolveBuyIn`，與 `joinSeat` 共用座位結構）；
    `createPokerRoom` callable 補傳 `userInfo`；未帶 buyIn 時維持舊行為（空桌），向後相容
  - 前端 `GameLobby.vue` 建房 modal 新增「Your Buy-in」欄位，建房即入座（一個 confirm 取代 建房→導頁→選座→買入 modal）
  - 測試：`tests/functions/seatFactory.test.js`（座位結構 + 買入夾限）
- [x] ~~**連結即入桌**：點分享連結 → 自動以預設買入入座（與記帳 deep link 同模式），
      只有籌碼不足/滿座才跳互動~~ ✅ 2026-06-15：
  - `PokerGame.vue` 進房後若使用者尚未入座，`resolveAutoSeat()` 以房間 maxBuyIn 自動入座；
    已入座（含房主）/滿座/不可加入時退回手動；`?spectate` 可只旁觀
  - 桌內新增「Invite Players」分享：LINE 內用 `sharePokerInvite()`（shareTargetPicker，連結直接入座），
    桌外複製 `buildPokerInviteUrl()` web 連結；等待第二位玩家時顯示「Waiting for players… Share invite link」提示
  - 修掉 App.vue「加入線上房」原本寫死 6 碼驗證的 bug（線上房是 20 碼 doc id）——
    `parsePokerGameId()` 改為接受貼上的邀請連結或 ID；建房入口（底部列）改走統一大廳 `?create=online`
- [x] ~~**自動開局**：≥2 人入座即自動倒數開局，每手結束自動續局~~ ✅ 2026-06-15：
  - 後端 `isAutoNext` 在開局時已設 true、手與手之間自動續局原本就會跑；缺的只是「第一手」——
    `shouldAutoStartFirstHand()` 在房主端、waiting、handNumber 0、≥2 人入座時自動倒數開第一手
    （與手間續局共用同一個倒數 watcher；✕ 可取消，第一手取消為本地抑制）
- [x] ~~統一入口：併入統一大廳（與現金桌/錦標賽同一個建局流程，重用 cash presets 模式）~~ ✅ 2026-06-15：
  - `LobbyView.vue` 建局 modal Step 1 新增「🌐 線上德州撲克」選項，沿用現金桌的買入/cash preset 步驟
    （`buildOnlineRoomConfig()` 把買入同時當房主籌碼與買入區間），確認後建 `pokerGames` 房並直接進牌桌
  - i18n `lobby.onlineGame` / `onlineGameDesc` 補齊 4 語系；測試：`tests/pokerEntry.test.js`
  - 註：線上房尚未併入「我的房間」清單（pokerGames 與 games 不同 collection，資料層整併另計）

#### 4-3. 操作體驗 — 消滅「按了沒反應」
- [x] ~~**樂觀更新全覆蓋**：操作立即在 UI 反映為「待確認」狀態，後端確認落定、失敗回滾~~ ✅ 2026-06-16：
  - 主要動作（fold/check/call/raise/all-in）走 `performOptimisticAction`：即時音效 + 鎖按鈕 + 背景送出 + 失敗回捲；
    all-in 另把籌碼即時移入底池避免「先卡後跳」；座位入座補上成功/失敗 toast。snapshot 永遠為最終真相
- [x] ~~**預先操作（act-ahead）**：未輪到時可預選 Fold / Check-Fold / Call Any，輪到自動送出~~ ✅ 2026-06-16：
  - 純函式 `resolvePreAction()` 依面對的下注把預選對應到實際動作（check-fold 只在面對下注時棄牌、call-any 無注時改過牌）；
    `ActionButtons` 在非自己回合顯示預選列，`PokerTable` 持有選擇、輪到即自動送出、新一手/失格時清除。已測
- [x] ~~**延遲優化**：`pokerPlayerAction` 等高頻 callable 設 `minInstances` 消冷啟動；
      前端先跑 `actionValidator` 同款驗證（共用驗證邏輯包）即時擋非法操作，不等後端報錯~~ ✅ 2026-06-15：
  - `actionValidator.js` 抽出純函式 `checkPlayerAction()`（回傳 verdict，不丟例外），
    `validatePlayerAction()` 改為它的丟例外包裝層；前端透過 Vite alias `@engine` 直接 import 同一份，
    在 `useGameActions.performOptimisticAction()` 送出前先驗證，非法操作即時擋下、不打 callable
    （後端仍為最終權威；驗證若遇非預期狀態則 fail-open 交給後端）
  - `pokerPlayerAction` / `startPokerHand` 套用 `minInstances`（可由 `POKER_ACTION_MIN_INSTANCES`
    環境變數覆寫，預設 1，設 0 可省成本；見 `functions/.env.example`）
  - 測試：`tests/functions/actionValidator.test.js` 補 `checkPlayerAction` verdict 合約 + 與丟例外版本一致性
- [x] ~~**輪到誰一目了然**：當前行動者高亮 + 倒數圈 + 震動/音效提示（重用錦標賽音效系統）~~ ✅ 2026-06-16：
  - 高亮（金色脈動邊框）+ 倒數圈（`TurnTimer`）原本就有；補上「輪到你」音效 + 震動：
    新 `usePokerSound`（Web Audio，與錦標賽共用同一 AudioContext，原本 `playSound` 是 no-op／完全沒聲音），
    `notifyMyTurn()` 在回合輪到時播放雙嗶 + `navigator.vibrate`；牌桌選單可開關音效（localStorage 記憶）
- [x] ~~**斷線重連**：重新整理/切 app 回來無縫回桌恢復狀態（snapshot 驅動 + 本地動畫狀態重建）~~ ✅ 2026-06-16：
  - 路由帶 gameId、`PokerGame` onMounted 重新 `joinGame()` 掛回 snapshot + private 監聽，狀態由 snapshot 還原；
    新增載入中 spinner（避免重整後空白）。深層的「動畫狀態重播」仍屬 4-4 範圍

#### 4-4. 前端狀態層重構（配合 4-3 的地基）
- [x] ~~`poker.js` store + `PokerGame.vue` + `PokerTable.vue` 狀態流重整：
      UI 純由 Firestore snapshot 單向驅動，操作只發指令不直接改狀態~~ ✅ 2026-06-16（確認 + 收斂）：
  - `store/modules/poker.js` 早已是單一真相：`onSnapshot` → `currentGame`，所有 UI 由其衍生；
    操作只發 callable。唯一的本地寫入是 all-in 的樂觀橋接（移籌碼進底池避免跳動），下一個 snapshot 即覆蓋、
    snapshot 永遠權威——屬刻意的樂觀 overlay（4-3），予以保留。
  - 大檔案機械式拆分（PokerTable/PokerGame/LobbyView）風險高且無法在本機多人實測下驗證回歸，
    判斷為「功能完成後、有真機測試窗口時再做」的低風險窗口工作，不在本批盲拆。
- [x] ~~**動畫與狀態解耦**：動畫佇列消化狀態變化（快速連續更新不跳格、不閃爍），
      整併 `useGameAnimation` / `useGameAnimations` / `useShowdownAnimation`~~ ✅ 2026-06-16：
  - 新增純函式序列佇列 `createAnimationQueue()`（序列消化、可清空、單步失敗不卡死，已測）；
    `useGameAnimations` 改用它統一播放牌面提示音，並對「一次跳多張」（all-in runout 0→5）穩健：
    依新增張數補齊 flop/turn/river 提示音（舊的精確 count 轉移會整段漏掉）。
  - 整併：`useShowdownAnimation.js`（dead code）已刪；音效統一由 `usePokerSound` owns，`useGameAnimations` 為唯一觸發點，
    `useGameAnimation`（純發牌翻牌時序 helper，CommunityCards 使用）保留其單一職責
- [ ] **先執行 `migrate_entries_to_events.js`**（維護者手動步驟，需 production service account；本機/CI 無憑證無法執行）：
  - 現況：**即時對局**的事件後端已即時寫入 `events` 子集合（`functions/src/lib/events.js`，動作/亮牌/旁觀），
    動畫佇列的資料來源已就緒；此遷移只針對**歷史舊資料**（把舊 `hands[].actions` 等陣列搬進 events），不影響新流程
  - 待維護者執行：先 `--dry-run` 驗證，確認後 `--delete-old`

#### 4-5. 驗收標準（重構完成的定義）

> 2026-06-16：完整流程已在程式碼層打通（建房自動入座 → 分享連結 → 連結即入座 →
> ≥2 人自動開局 → 即時驗證/樂觀更新/暖機 callable → 自動續局 → 重整回桌）。
> 下列為「真機驗收」門檻，需 4-1 的雙手機實測確認（本機/CI 無法跑多人即時流程）。

- [ ] 兩支手機從點連結到打完一手 ≤ 90 秒、全程無「按了沒反應」超過 1 秒的點
      — 實作到位（連結即入座 + 自動開局 + `minInstances` + 樂觀更新），待實測計時
- [ ] 任一方中途重整頁面，10 秒內無縫回桌 — 實作到位（snapshot 重掛 + 載入中提示），待實測
- [x] ~~非法操作（籌碼不足、未輪到）在前端即時擋下，不出現後端錯誤 toast~~ ✅（共用 `checkPlayerAction`）
- [ ] 邀請一位沒用過的朋友實測，不需口頭解說能完成入座與第一手操作
      — 實作到位（桌內 Invite 分享 + 連結即入座 + 自動開局），待找人實測

---

**最後更新**: 2026-06-16
**負責人**: Jayykk
**專案版本**: 10.0.0
