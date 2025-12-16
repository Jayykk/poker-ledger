# 線上連線德州撲克遊戲功能開發清單

## 📋 開發階段與待辦事項

### Phase 1: 基礎架構 (Foundation) ✅ 
- [x] 分析現有程式碼架構
- [ ] 設定 Firebase Cloud Functions 環境
- [ ] 建立 Firestore 遊戲數據結構
- [ ] 實作德撲核心遊戲引擎 (發牌、比牌邏輯)
- [ ] 建立 Cloud Functions API endpoints
- [ ] 實作玩家操作驗證機制

### Phase 2: 核心遊戲功能 (Core Game)
- [ ] 建立/加入遊戲房間
- [ ] 座位系統 (入座/離座)
- [ ] 完整下注流程 (Fold/Check/Call/Raise/All-in)
- [ ] 發牌與開牌動畫
- [ ] 回合管理 (Preflop → Flop → Turn → River)
- [ ] 勝負判定與籌碼分配
- [ ] 與現有記帳系統整合

### Phase 3: UI/UX 優化 (User Experience)
- [ ] 手機優先的響應式遊戲介面
- [ ] 智慧下注滑桿 + 快捷金額按鈕
- [ ] 操作確認機制 (防誤觸)
- [ ] 樂觀更新 (Optimistic Update)
- [ ] 牌面翻轉動畫
- [ ] 籌碼移動動畫
- [ ] 音效系統
- [ ] 玩家計時器與超時處理

### Phase 4: 社交功能 (Social Features)
- [ ] 遊戲內聊天
- [ ] 快捷表情
- [ ] 旁觀模式
- [ ] 好友邀請

### Phase 5: 進階功能 (Advanced - Future)
- [ ] 錦標賽模式
- [ ] Sit & Go
- [ ] 俱樂部系統
- [ ] 排行榜
- [ ] 成就系統

---

## 📁 檔案結構

```
poker-ledger/
├── functions/                      # Cloud Functions
│   ├── package.json               # Functions 依賴配置
│   ├── .eslintrc.js              # ESLint 配置
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
