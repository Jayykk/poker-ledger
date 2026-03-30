# 線上連線德州撲克遊戲功能開發清單

## 📋 開發階段與待辦事項（原有功能 — 已完成）

### Phase 1: 基礎架構 (Foundation) ✅
- [x] 分析現有程式碼架構
- [x] 設定 Firebase Cloud Functions 環境
- [x] 建立 Firestore 遊戲數據結構
- [x] 實作德撲核心遊戲引擎 (發牌、比牌邏輯)
- [x] 建立 Cloud Functions API endpoints
- [x] 實作玩家操作驗證機制

### Phase 2: 核心遊戲功能 (Core Game) ✅
- [x] 建立/加入遊戲房間
- [x] 座位系統 (入座/離座)
- [x] 完整下注流程 (Fold/Check/Call/Raise/All-in)
- [x] 發牌與開牌動畫
- [x] 回合管理 (Preflop → Flop → Turn → River)
- [x] 勝負判定與籌碼分配
- [x] 與現有記帳系統整合

### Phase 3: UI/UX 優化 (User Experience) ✅
- [x] 手機優先的響應式遊戲介面
- [x] 智慧下注滑桿 + 快捷金額按鈕
- [x] 操作確認機制 (防誤觸)
- [x] 樂觀更新 (Optimistic Update)
- [x] 牌面翻轉動畫
- [x] 籌碼移動動畫
- [x] 音效系統
- [x] 玩家計時器與超時處理

### Phase 4: 社交功能 (Social Features) ✅
- [x] 遊戲內聊天
- [x] 快捷表情
- [x] 旁觀模式
- [x] 好友邀請

### Phase 5: 進階功能 (Advanced - Future)
- [ ] 錦標賽模式
- [ ] Sit & Go
- [ ] 俱樂部系統
- [ ] 排行榜
- [ ] 成就系統

---

## 🟢 LINE 整合開發清單（並存擴充）

> 設計理念：參考 LightSplit 模式 — LINE 群組即入口，LIFF 頁面做操作，
> 訊息自動回到聊天室。**現有功能全部保留**，LINE 作為新的入口層與通知層。

---

### LINE Phase 1: 身分綁定 ✅

#### 1-1. LINE Login Channel & LIFF App 設定
- [x] 在 [LINE Developers Console](https://developers.line.biz/) 建立 Provider
- [x] 建立 LINE Login Channel（Channel ID: `2009641241`）
- [x] 建立 LIFF App（Size: `Full`，LIFF ID: `2009641241-Bsu3bf90`）
- [x] 記錄 `LIFF ID` 並填入 `.env` 的 `VITE_LIFF_ID`

#### 1-2. 前端 LIFF SDK 整合
- [x] `npm install @line/liff`
- [x] 建立 `src/composables/useLiff.js` — LIFF 生命週期管理
- [x] 修改 `src/main.js` — App 啟動時執行 `liff.init()`（非阻塞）
- [x] 修改 `src/views/LoginView.vue` — 新增「LINE 登入」按鈕
  - LINE 內自動觸發 LIFF 登入流程
  - 瀏覽器環境保留原有的 email / guest 登入

#### 1-3. 後端 Custom Token 核發
- [x] 新增 `functions/src/handlers/lineAuth.js`
  - 驗證 LINE access token → 取得 profile → `admin.auth().createCustomToken()`
- [x] 在 `functions/src/index.js` 註冊 `lineLogin` endpoint

#### 1-4. 前端 Firebase Auth 串接
- [x] 修改 `src/store/modules/auth.js` — 新增 `loginWithLine()` action
- [x] 修改 `src/composables/useAuth.js` — 暴露 `loginWithLine`
- [x] 處理 LINE↔Firebase 帳號映射（`line_{userId}` 為 uid）

#### 1-5. Firestore Rules 更新
- [x] 更新 `firestore.rules` — 新增 `transactions` collection 規則

#### 1-6. 驗證 & 測試
- [ ] 在 LINE App 內開啟 LIFF → 自動登入 → 進入 Lobby
- [ ] 在外部瀏覽器開啟 → 保持原有 email/guest 登入
- [ ] 頭像、暱稱正確顯示為 LINE profile

---

### LINE Phase 2: 記帳核心 — 代操作 + 交易歷程 ✅

> 現有記帳流程：開局 → 加人 → 編輯 buyIn/stack → 結算 → 報表
> 擴充重點：誰幫誰買入的紀錄、撤銷功能、歷程顯示

#### 2-1. Firestore `transactions` Collection
- [x] 設計 collection schema（gameId, targetUid/Name, actionUid/Name, amount, type, status 等）
- [x] 新增 Firestore indexes（`firestore.indexes.json`）

#### 2-2. 後端 Transaction Cloud Functions
- [x] 新增 `functions/src/handlers/transaction.js`
  - `recordBuyIn` / `undoBuyIn` / `getTransactionLog`
  - batch writes 確保原子性
- [x] 在 `functions/src/index.js` 註冊 `recordBuyInTx`, `undoBuyInTx`, `getTransactionLog`

#### 2-3. 前端記帳 UI 擴充
- [x] 新增 `src/composables/useTransactions.js` — onSnapshot 即時監聽
- [x] 修改 `src/views/GameView.vue` — 幫人買入按鈕 + 操作歷程區塊
- [x] 新增 `src/components/game/TransactionLog.vue` — 時間軸式交易歷程
- [x] 新增 `src/components/game/BuyInModal.vue` — 選玩家 + 金額確認

---

### LINE Phase 3: LINE 聊天室訊息（liff.sendMessages — 免費方案）✅

> **策略調整**：僅使用 `liff.sendMessages()`（免費、用戶主動觸發），
> 不使用 Messaging API push（會超過免費額度 200 則/月）。
> 結算由點「結算」的人以自己名義發送到聊天室。

#### 3-1 ~ 3-2. ~~LINE Messaging API~~ (已跳過 — 超過免費額度)
- [x] ~~已跳過~~ — 不使用 Bot push，全部改由前端 `liff.sendMessages()` 處理

#### 3-3. `liff.sendMessages()` — 聊天室內發送（前端觸發）
- [x] 在 `src/composables/useLiff.js` 新增 helpers
  - `sendBuyInMessage()` — 買入通知
  - `sendUndoMessage()` — 撤銷通知
  - `sendSettlementMessage()` — 結算報表
  - `shareGameInvite()` — shareTargetPicker 邀請卡片
- [x] 修改買入流程 — 買入成功後觸發 `liff.sendMessages()`
- [x] 修改結算流程 — 結算完成後由點結算的人發送報表到聊天室

#### 3-4 ~ 3-5. ~~結算推播 & Flex Message~~ (已跳過)
- [x] ~~已跳過~~ — 免費方案下不做 Bot push，結算改由前端 `liff.sendMessages()` 處理

---

### LINE Phase 4: LIFF UX 優化 & 群組互動

#### 4-1. LIFF 環境適配
- [ ] 修改 `src/App.vue` — 偵測 LIFF 環境
  - LINE 內：隱藏底部 nav bar、返回鈕改為 `liff.closeWindow()`
  - LINE 內：頂部顯示簡化 header（牌局名稱 + 關閉按鈕）
  - 外部瀏覽器：保持現有 UI 不變
- [ ] 確認 LIFF `Full` 模式下的 Safe Area（iPhone 瀏海、底部手勢條）
- [ ] 處理 LIFF 的 redirect flow（外部瀏覽器開啟 LIFF URL 的 consent 畫面）

#### 4-2. 牌局分享 — LINE 群組入口（像 LightSplit 的記帳連結）
- [ ] 局長開局後生成 LIFF URL：`https://liff.line.me/{liffId}/game/{gameId}`
- [ ] 使用 `liff.shareTargetPicker()` 分享到 LINE 群組或好友
  - 分享訊息為 Flex Message 卡片：
    ```
    🃏 {hostName} 開了一桌！
    盲注：{small}/{big}
    買入：${baseBuyIn}
    👉 點擊加入
    ```
  - 卡片內含 LIFF URL action → 點擊直接開啟該局
- [ ] 非 LINE 環境 fallback：複製 Room Code 或普通連結

#### 4-3. 快速加入流程
- [ ] 從 LINE 點擊邀請卡片 → 開啟 LIFF → 自動登入 → 直接進入該牌局
  - LIFF URL 帶 `gameId` 參數 → router 解析後自動導向 GameView
  - 如果玩家不在該局 → 自動加入（使用 LINE displayName + baseBuyIn）
  - 省略 LobbyView → 一鍵到位

#### 4-4. Router 調整
- [x] 修改 `src/main.js` router 設定
  - 新增路由：`/game/:gameId` — 支援 LIFF deep link 直接進入牌局
- [ ] LIFF 啟動參數解析：`liff.getContext()` 取得來源群組 ID（可選）
- [ ] 未登入時自動走 LINE 登入流程再 redirect 回目標頁

---

### LINE Phase 5: 進階功能（可選 / 未來）

#### 5-1. LINE Bot 指令（Rich Menu / 文字指令）
- [ ] 設定 Webhook URL → Cloud Function `lineWebhook`
- [ ] 實作基本指令：
  - `開局` → 回覆 LIFF 開局連結
  - `我的紀錄` → 回覆最近 5 局損益摘要
  - `幫助` → 回覆指令說明
- [ ] 設計 Rich Menu（底部選單）：開局 / 加入 / 紀錄 / 設定

#### 5-2. 舊帳號遷移 / LINE 綁定
- [ ] 已有 email 帳號的玩家 → 登入後可綁定 LINE
  - Profile 頁新增「綁定 LINE 帳號」按鈕
  - 綁定後 `users/{uid}` 寫入 `lineUserId`
  - 未來可用 LINE 登入同一帳號
- [ ] 遷移腳本：將現有 `users` 的 history 與新 LINE UID 對接

#### 5-3. 群組統計 & 排行
- [ ] 記錄群組 ID（`liff.getContext().groupId`）
  - 同一群組的牌局可以彙總統計
- [ ] 群組排行榜 — 月/季/總 損益排名
- [ ] Bot 定期推送群組週報摘要

---

## 📁 檔案結構

```
poker-ledger/
├── functions/                      # Cloud Functions
│   ├── package.json               # Functions 依賴配置
│   ├── .eslintrc.cjs             # ESLint 配置
│   └── src/
│       ├── index.js              # Functions 入口
│       ├── engines/
│       │   └── texasHoldem.js    # 德撲遊戲引擎
│       ├── handlers/
│       │   ├── room.js           # 房間管理
│       │   ├── game.js           # 遊戲操作
│       │   └── player.js         # 玩家操作
│       └── utils/
│           ├── deck.js           # 牌組工具
│           ├── handEvaluator.js  # 牌型判斷
│           └── validators.js     # 操作驗證
├── src/
│   ├── components/
│   │   └── game/                 # 遊戲組件
│   │       ├── PokerTable.vue    # 主遊戲桌面
│   │       ├── PlayerSeat.vue    # 玩家座位
│   │       ├── CommunityCards.vue # 公共牌
│   │       ├── HoleCards.vue     # 手牌
│   │       ├── BetControls.vue   # 下注控制
│   │       ├── BetSlider.vue     # 下注滑桿
│   │       ├── PotDisplay.vue    # 底池顯示
│   │       ├── ActionButtons.vue # 操作按鈕
│   │       ├── PlayerTimer.vue   # 計時器
│   │       └── GameChat.vue      # 遊戲聊天 (已存在)
│   ├── views/
│   │   ├── GameLobby.vue         # 遊戲大廳
│   │   └── PokerGame.vue         # 遊戲頁面
│   ├── store/modules/
│   │   └── poker.js              # 德撲遊戲狀態管理
│   ├── composables/
│   │   ├── usePokerGame.js       # 遊戲邏輯 composable
│   │   ├── useGameActions.js     # 遊戲操作 composable
│   │   └── useGameAnimation.js   # 動畫控制 composable
│   └── utils/
│       ├── pokerUtils.js         # 前端撲克工具函數
│       └── pokerHandEvaluator.js # 牌型評估 (已存在)
├── firebase.json                  # Firebase 配置
├── firestore.rules                # Firestore 安全規則
├── TODO.md                        # 本文件
└── README.md                      # 專案說明 (已更新)
```

---

## 🔥 Firestore 數據結構

### 遊戲房間集合 `/pokerGames/{gameId}`

```javascript
{
  meta: {
    type: "texas_holdem",
    mode: "cash",              // cash | tournament | sit_n_go
    blinds: { 
      small: 10, 
      big: 20 
    },
    minBuyIn: 1000,
    maxBuyIn: 5000,
    maxPlayers: 6,
    createdBy: "userId",
    createdAt: Timestamp
  },
  status: "waiting",           // waiting | playing | paused | finished
  table: {
    pot: 0,
    sidePots: [],
    communityCards: [],
    currentRound: "waiting",   // waiting | preflop | flop | turn | river | showdown
    dealerSeat: 0,
    currentTurn: null,
    turnStartedAt: Timestamp,
    turnTimeout: 30,           // seconds
    minRaise: 20,
    lastRaise: 0
  },
  seats: {
    0: { 
      odId: "userId",
      odName: "Player Name",
      odAvatar: "url",
      chips: 1000,
      status: "active",        // active | folded | all_in | sitting_out
      currentBet: 0,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false
    },
    1: null,                   // 空座位
    // ... seats 2-5
  },
  handNumber: 0
}
```

### 手牌記錄子集合 `/pokerGames/{gameId}/hands/{handId}`

```javascript
{
  handNumber: 1,
  players: {
    "userId": {
      startChips: 1000,
      endChips: 1200,
      position: 0,
      status: "won"           // won | lost | folded
    }
  },
  actions: [
    {
      odId: "userId",
      seat: 0,
      action: "raise",        // fold | check | call | raise | all_in
      amount: 100,
      round: "preflop",
      timestamp: Timestamp
    }
  ],
  communityCards: ["As", "Kh", "Qd", "Jc", "Ts"],
  result: {
    winners: [
      {
        odId: "userId",
        odName: "Player Name",
        amount: 1000,
        hand: "Full House"
      }
    ],
    pot: 1000
  },
  createdAt: Timestamp
}
```

### 私密手牌 `/pokerGames/{gameId}/private/{odId}`

```javascript
{
  holeCards: ["Ah", "Kd"]
}
```

---

## ☁️ Cloud Functions 端點

### 房間管理
- `createPokerRoom(config)` - 建立德州撲克房間
- `joinPokerRoom(gameId, seatNumber)` - 加入房間並選擇座位
- `leavePokerRoom(gameId)` - 離開房間
- `sitDown(gameId, seatNumber, buyIn)` - 入座並買入籌碼
- `standUp(gameId)` - 離座

### 遊戲流程
- `startPokerHand(gameId)` - 開始新的一手牌
- `dealCards(gameId)` - 發牌
- `playerAction(gameId, action, amount)` - 處理玩家操作
- `advanceRound(gameId)` - 推進到下一輪
- `showdown(gameId)` - 攤牌比大小
- `distributeWinnings(gameId)` - 分配獎池

### 計時器
- `handlePlayerTimeout(gameId, playerId)` - 處理玩家超時

---

## 🎨 主要組件說明

### PokerTable.vue
橢圓形德州撲克桌面，顯示：
- 6 個玩家座位（動態排列）
- 公共牌區域
- 底池顯示
- 發牌者/盲注指示器
- 響應式設計適配各種螢幕

### BetControls.vue
智慧下注控制介面：
- 觸控友好的滑桿
- 快捷按鈕：Fold, Check/Call, Min, 1/2 Pot, Pot, All-in
- 金額微調按鈕 (+BB, -BB)
- 防誤觸確認對話框
- 即時顯示有效操作

### PlayerSeat.vue
玩家座位組件：
- 顯示玩家資訊（頭像、名稱、籌碼）
- 手牌位置（僅自己可見完整牌面）
- 當前下注金額
- 狀態指示器（發牌者、盲注、當前回合）
- 行動計時器

---

## 🔒 安全規則重點

```javascript
// 確保只有 Cloud Functions 可以修改遊戲狀態
// 玩家只能讀取遊戲資訊和自己的私密資料
// 防止作弊和資料竄改

match /pokerGames/{gameId}/private/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if false; // 只有 Cloud Functions 可寫入
}
```

---

## 📝 開發注意事項

1. **公平性保證**：所有遊戲邏輯必須在 Cloud Functions 執行
2. **防作弊**：手牌資訊嚴格保護，只有玩家本人可見
3. **效能優化**：使用 Firestore 即時監聽，減少不必要的查詢
4. **錯誤處理**：完整的錯誤訊息和異常處理
5. **國際化**：支援多語言（繁中、簡中、英文、日文）
6. **響應式設計**：優先支援手機操作
7. **程式碼品質**：遵循現有專案規範，完整註解

---

## 🚀 部署步驟

### 1. 設定 Firebase Functions
```bash
firebase init functions
cd functions
npm install
```

### 2. 部署 Functions
```bash
firebase deploy --only functions
```

### 3. 更新 Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 4. 測試遊戲
- 建立測試房間
- 多帳號加入測試
- 驗證遊戲流程
- 檢查安全規則

---

**最後更新**: 2024-12-16  
**負責人**: Jayykk  
**專案版本**: 10.0.0
