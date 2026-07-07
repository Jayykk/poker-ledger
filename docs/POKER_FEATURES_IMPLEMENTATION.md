# Poker Game Enhancements - Implementation Summary

> ⚠️ **歷史快照（2024-12-16）**：本文件為當時實作的紀錄。「待完成項目」中的斷線重連、
> i18n keys、PokerTable/GameChat 整合其後皆已完成；**唯 Run It Twice 至今仍未接線**
> （Modal 與引擎函式皆為死碼，且引擎版有同板 bug，見 TODO.md 2026-07-07 review）。
> 現況請以根目錄 `README.md` 與 `TODO.md` 為準。

## 完成時間
2024-12-16

## 概要
本次開發完成了線上德州撲克遊戲的多項重要功能，修復了已知問題，並新增了後端 Cloud Functions 和前端 Vue 組件。

---

## ✅ 已完成功能

### 一、Bug 修復

#### Issue #39: Live 開局時建立新局
**問題**: 點選「Live」開局時，系統會一直開啟現有的 live 局，而不是建立新的 live 局

**解決方案**:
- 修改 `ActionModal.vue` 改為發送 `create-live` 事件而非直接路由
- 在 `App.vue` 新增 `handleCreateLive` 處理器，每次點擊都建立新的 Live 遊戲
- 遊戲名稱自動包含當前日期

**修改檔案**:
- `src/components/common/ActionModal.vue`
- `src/App.vue`

---

### 二、後端功能 (Cloud Functions)

#### 1. Show Cards（秀牌功能）✅
**實作內容**:
- 玩家可在任何時候自願展示手牌
- 展示的手牌記錄到歷史中，包含時間戳記
- 透過 `showPokerCards` Cloud Function 呼叫

**相關檔案**:
- `functions/src/handlers/game.js` - `showCards()` 函數
- `functions/src/index.js` - 導出 `showPokerCards`

**使用方式**:
```javascript
const functions = getFunctions();
const showPokerCards = httpsCallable(functions, 'showPokerCards');
await showPokerCards({ gameId });
```

#### 2. Outs 計算器 ✅
**實作內容**:
- 計算玩家可能的成牌機率
- 顯示剩餘牌堆中可以成牌的 Outs
- 使用「2 和 4 法則」估算勝率
- 提供精確的組合數學計算
- Monte Carlo 模擬計算 equity

**相關檔案**:
- `functions/src/utils/oddsCalculator.js`

**主要函數**:
```javascript
// 計算 outs
calculateOuts(holeCards, communityCards, deadCards)

// 計算勝率
calculateWinProbability(outs, round)

// Monte Carlo 模擬
calculateEquity(holeCards, communityCards, simulations)
```

**功能特點**:
- 分類 outs（成同花、成順子、成三條等）
- 計算賠率比例（如 2:1）
- 支援 flop 和 turn 階段的計算

#### 3. 智能手牌記錄（大牌標記系統）✅
**實作內容**:
- 自動標記「精彩大牌」:
  - 牌型 ≥ Full House（rank ≥ 6）
  - 底池超過 50BB
  - All-in 對決
- 記錄完整的 Hand History
- 記錄每位玩家的手牌（僅限精彩牌局）

**相關檔案**:
- `functions/src/handlers/game.js` - `handleShowdown()` 函數

**資料結構**:
```javascript
{
  notable: true,
  notableReasons: {
    highRank: true,
    largePot: true,
    allIn: true
  },
  playerCards: {
    "userId1": ["As", "Kh"],
    "userId2": ["Qd", "Jc"]
  }
}
```

#### 4. 超時自動處理 ✅
**實作內容**:
- 玩家超時自動 fold（有下注時）或 check（無下注時）
- 標記玩家為 timed out 狀態
- 記錄最後超時時間

**相關檔案**:
- `functions/src/handlers/game.js` - `handlePlayerTimeout()` 函數
- `functions/src/index.js` - 導出 `playerTimeout`

**使用方式**:
```javascript
const playerTimeout = httpsCallable(functions, 'playerTimeout');
await playerTimeout({ gameId });
```

#### 5. Auto Muck（自動隱藏輸家手牌）✅
**實作內容**:
- 攤牌時只有精彩牌局才儲存手牌
- 輸家可透過 `showCards` 主動展示手牌
- 符合德州撲克標準規則

**實作位置**:
- `functions/src/handlers/game.js` - `handleShowdown()` 函數

#### 6. Run it Twice ⚠️ (部分完成)
**已實作**:
- 發牌兩次的核心邏輯 (`runItTwice()` 函數)
- 前端 UI 組件 (`RunItTwiceModal.vue`)

**待完成**:
- 玩家同意追蹤機制
- 底池分配邏輯整合
- 遊戲流程整合

**相關檔案**:
- `functions/src/engines/texasHoldem.js` - `runItTwice()` 函數
- `src/components/game/RunItTwiceModal.vue`

#### 7. Side Pot 分池完善 ✅
**實作內容**:
- 完善多人 All-in 時的分池邏輯
- 正確計算和分配多個 Side Pot
- 按投注金額排序計算每個 pot 的資格玩家

**相關檔案**:
- `functions/src/engines/texasHoldem.js` - `calculateSidePots()` 函數

**演算法**:
1. 依照投注金額排序玩家
2. 為每個投注等級建立 side pot
3. 計算每個 pot 的合格玩家名單

#### 8. 斷線重連保護 ⚠️ (部分完成)
**已實作**:
- 超時自動處理機制可用於斷線處理
- 超時標記和時間記錄

**待完成**:
- 連線狀態監控
- 緩衝時間設定
- 自動重連機制

#### 9. 觀戰模式 ✅
**實作內容**:
- 非玩家可以觀看牌局
- 觀戰者無法看到玩家手牌（由 private collection 控制）
- 觀戰者可參與聊天
- 加入/離開觀戰功能

**相關檔案**:
- `functions/src/handlers/room.js` - `joinAsSpectator()`, `leaveSpectator()`
- `functions/src/index.js` - 導出 `joinPokerSpectator`, `leavePokerSpectator`

**資料結構**:
```javascript
spectators: [
  {
    userId: "user123",
    userName: "Spectator Name",
    userAvatar: "url",
    joinedAt: Timestamp
  }
]
```

#### 10. 聊天功能 ✅
**實作內容**:
- 遊戲內即時對話功能
- 訊息儲存在 Firestore subcollection
- 訊息長度限制（500字元）
- 訊息刪除功能（發送者或房主）
- 自動清理 XSS 風險

**相關檔案**:
- `functions/src/handlers/chat.js`
- `functions/src/index.js` - 導出 `sendChatMessage`, `getChatMessages`, `deleteChatMessage`

**Cloud Functions**:
```javascript
// 發送訊息
sendChatMessage({ gameId, message })

// 取得訊息
getChatMessages({ gameId, limit: 50 })

// 刪除訊息
deleteChatMessage({ gameId, messageId })
```

---

### 三、前端組件 (Vue Components)

#### 1. ShowCardsButton.vue ✅
**功能**:
- 自願秀牌按鈕
- 呼叫 `showPokerCards` Cloud Function
- 載入狀態顯示
- 錯誤處理

**使用方式**:
```vue
<ShowCardsButton
  :gameId="gameId"
  :hasCards="hasCards"
  @cards-shown="handleCardsShown"
  @error="handleError"
/>
```

#### 2. OddsDisplay.vue ✅
**功能**:
- 顯示勝率百分比（估算值和精確值）
- 顯示 outs 數量
- 顯示賠率比例
- Outs 分類明細（成同花、順子等）

**使用方式**:
```vue
<OddsDisplay
  :odds="oddsData"
  :outsBreakdown="breakdown"
  :loading="calculating"
/>
```

**資料格式**:
```javascript
odds: {
  outs: 9,
  approximate: 36,
  exact: 35.0,
  odds: "1.9:1"
}
```

#### 3. RunItTwiceModal.vue ✅
**功能**:
- Run it Twice 確認彈窗
- 顯示當前底池
- 顯示分割後的兩個底池
- 同意狀態追蹤
- 雙方同意機制

**使用方式**:
```vue
<RunItTwiceModal
  v-model="showRunItTwice"
  :pot="potSize"
  :opponent="opponentName"
  :opponentAgreed="agreed"
  @agree="handleAgree"
  @decline="handleDecline"
/>
```

#### 4. useGameActions.js 增強 ✅
**新增功能**:
- `showCards(gameId)` - 秀牌
- `sendMessage(gameId, message)` - 發送聊天訊息
- `joinAsSpectator(gameId)` - 加入觀戰
- `leaveSpectator(gameId)` - 離開觀戰

**使用方式**:
```javascript
const { showCards, sendMessage, joinAsSpectator } = useGameActions();

await showCards(gameId);
await sendMessage(gameId, "Good game!");
await joinAsSpectator(gameId);
```

---

## 📊 統計數據

### 程式碼變更
- **新增檔案**: 6
  - `functions/src/utils/oddsCalculator.js`
  - `functions/src/handlers/chat.js`
  - `src/components/game/ShowCardsButton.vue`
  - `src/components/game/OddsDisplay.vue`
  - `src/components/game/RunItTwiceModal.vue`
  - `POKER_FEATURES_IMPLEMENTATION.md`

- **修改檔案**: 7
  - `functions/src/handlers/game.js`
  - `functions/src/handlers/room.js`
  - `functions/src/engines/texasHoldem.js`
  - `functions/src/index.js`
  - `src/components/common/ActionModal.vue`
  - `src/App.vue`
  - `src/composables/useGameActions.js`

### Cloud Functions
- **新增 Functions**: 6
  - `showPokerCards`
  - `playerTimeout`
  - `sendChatMessage`
  - `getChatMessages`
  - `deleteChatMessage`
  - `joinPokerSpectator`
  - `leavePokerSpectator`

### 品質檢查
- ✅ ESLint 檢查通過
- ✅ 前端建置成功
- ✅ CodeQL 安全掃描: 0 個漏洞
- ✅ Code Review: 所有問題已解決

---

## 🔧 技術細節

### Firestore 資料結構變更

#### 1. 遊戲房間 (`/pokerGames/{gameId}`)
新增欄位:
```javascript
{
  spectators: [
    {
      userId: string,
      userName: string,
      userAvatar: string,
      joinedAt: Timestamp
    }
  ]
}
```

#### 2. 手牌歷史 (`/pokerGames/{gameId}/hands/{handId}`)
新增欄位:
```javascript
{
  notable: boolean,
  notableReasons: {
    highRank: boolean,
    largePot: boolean,
    allIn: boolean
  },
  playerCards: {
    [userId]: ["As", "Kh"]
  },
  shownCards: [
    {
      odId: string,
      cards: ["As", "Kh"],
      timestamp: Timestamp
    }
  ],
  result: {
    potInBB: number,
    winners: [
      {
        odId: string,
        amount: number,
        hand: string,
        handRank: number
      }
    ]
  }
}
```

#### 3. 聊天訊息 (`/pokerGames/{gameId}/chat/{messageId}`)
新集合:
```javascript
{
  userId: string,
  userName: string,
  userAvatar: string,
  message: string,
  timestamp: Timestamp,
  createdAt: number
}
```

#### 4. 座位狀態 (`seats[seatNum]`)
新增欄位:
```javascript
{
  timedOut: boolean,
  lastTimeout: Timestamp
}
```

---

## 📝 使用範例

### 1. 秀牌功能
```javascript
import { useGameActions } from '@/composables/useGameActions';

const { showCards } = useGameActions();

// 玩家主動秀牌
await showCards(gameId);
```

### 2. 計算勝率
```javascript
import { calculateOuts, calculateWinProbability } from '@/utils/oddsCalculator';

const holeCards = ['As', 'Kh'];
const communityCards = ['Qs', 'Js', '2h'];

// 計算 outs
const outs = calculateOuts(holeCards, communityCards);
console.log('Total outs:', outs.total);
console.log('To flush:', outs.toFlush);

// 計算勝率
const probability = calculateWinProbability(outs.total, 'flop');
console.log('Win probability:', probability.exact + '%');
console.log('Odds:', probability.odds);
```

### 3. 聊天系統
```javascript
import { useGameActions } from '@/composables/useGameActions';

const { sendMessage } = useGameActions();

// 發送訊息
await sendMessage(gameId, 'Good hand!');
```

### 4. 觀戰模式
```javascript
import { useGameActions } from '@/composables/useGameActions';

const { joinAsSpectator, leaveSpectator } = useGameActions();

// 加入觀戰
await joinAsSpectator(gameId);

// 離開觀戰
await leaveSpectator(gameId);
```

---

## ⚠️ 待完成項目

> 2026-07-07 更新：第 2 項（斷線重連）與第 3 項（i18n keys）已完成；
> 第 1 項 Run it Twice 整合**仍未完成**——`RunItTwiceModal.vue` 無引用、
> 引擎 `runItTwice()` 無呼叫點，且兩次 runout 會發出相同的牌（同板 bug）。

### 1. Run it Twice 完整整合
- [ ] 玩家同意追蹤系統
- [ ] 底池分配計算
- [ ] 遊戲流程整合

### 2. 斷線重連保護
- [ ] 連線狀態監控
- [ ] 緩衝時間設定
- [ ] 自動重連邏輯

### 3. 翻譯檔案更新
需要在 i18n 檔案中新增以下 keys:
- `poker.showCards`
- `poker.oddsCalculator`
- `poker.winProbability`
- `poker.outs`
- `poker.odds`
- `poker.outsBreakdown`
- `poker.toFlush`
- `poker.toStraight`
- `poker.toTrips`
- `poker.toFullHouse`
- `poker.runItTwice`
- `poker.runItTwiceDesc`
- `poker.runItTwiceNote`
- `poker.agree`
- `poker.currentPot`
- `poker.runOne`
- `poker.runTwo`
- `poker.agreementStatus`

### 4. 與現有 Poker Game 畫面整合
- [ ] 在 PokerTable.vue 中整合 ShowCardsButton
- [ ] 在適當位置顯示 OddsDisplay
- [ ] 整合 GameChat 與新的聊天系統
- [ ] 處理 Run it Twice 流程

---

## 🚀 部署步驟

### 1. 部署 Cloud Functions
```bash
cd functions
npm install
firebase deploy --only functions
```

### 2. 部署前端
```bash
npm install
npm run build
firebase deploy --only hosting
```

### 3. 更新 Firestore Security Rules
確保安全規則允許:
- 玩家讀取自己的 private hole cards
- 觀戰者無法讀取 private collection
- 聊天訊息的讀寫權限

---

## 📚 參考資料

### 相關文件
- `TODO.md` - 原始需求清單
- `POKER_IMPLEMENTATION.md` - 德撲實作說明
- `README.md` - 專案說明

### Cloud Functions 端點
所有新增的 Cloud Functions 都已在 `functions/src/index.js` 中導出，可透過 Firebase SDK 呼叫。

### 安全性
- ✅ 所有 Cloud Functions 都需要驗證
- ✅ 訊息內容經過清理和長度限制
- ✅ 權限檢查確保只有參與者可執行動作
- ✅ CodeQL 掃描 0 個漏洞

---

## 👨‍💻 開發者筆記

### 設計決策
1. **Notable Hands**: 自動儲存精彩牌局的手牌，避免儲存所有牌局造成資料膨脹
2. **Spectator Mode**: 使用物件陣列而非單純 userId 陣列，方便未來擴充觀戰者資訊
3. **Chat System**: 使用 subcollection 而非單一文件陣列，便於分頁和管理
4. **Outs Calculator**: 同時提供估算值和精確值，平衡效能和準確性

### 效能考量
- Outs 計算在客戶端執行（如需要）
- Monte Carlo 模擬限制在合理次數（1000次預設）
- 聊天訊息使用分頁載入，預設限制 50 筆

### 測試建議
1. 測試多人 all-in 的 side pot 計算
2. 測試觀戰者權限（確保無法看到手牌）
3. 測試超時處理在不同情境下的行為
4. 測試聊天訊息的權限控制

---

**實作完成日期**: 2024-12-16  
**實作者**: GitHub Copilot  
**版本**: 1.0.0
