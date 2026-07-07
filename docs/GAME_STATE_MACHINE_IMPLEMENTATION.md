# Game State Machine Implementation Summary

> ⚠️ **歷史快照**：本文件為當時實作的紀錄。文中提到的 `handlers/game.js` 其後已拆分為
> `gameFlow.js` / `gameActions.js` / `gameControl.js`（`game.js` 僅剩 façade）；
> `utils/validators.js` 的 deprecated 版本已移除。現況請以根目錄 `README.md` 與 `TODO.md` 為準。

## Overview

This document summarizes the implementation of the game state machine and comprehensive improvements to the poker game flow, error handling, and UI.

## Key Changes

### 1. Backend - Structured Error System

**New Files:**
- `functions/src/errors/gameErrors.js` - Centralized error codes and messages
  - Defines `GameErrorCodes` enum for all possible game errors
  - Maps error codes to user-friendly Chinese messages
  - Provides `createGameError()` helper function

**Error Codes:**
```javascript
NOT_YOUR_TURN: '還沒輪到你'
INSUFFICIENT_CHIPS: '籌碼不足'
INVALID_ACTION: '無效的操作'
GAME_NOT_ACTIVE: '遊戲尚未開始'
INVALID_RAISE_AMOUNT: '加注金額無效'
ALREADY_FOLDED: '你已經棄牌了'
// ... and more
```

### 2. Backend - Game State Machine

**New File:**
- `functions/src/engines/gameStateMachine.js` - Core state machine logic

**Features:**
- Defines all game states: `WAITING`, `DEALING`, `PREFLOP`, `FLOP`, `TURN`, `RIVER`, `LAST_MAN`, `SHOWDOWN`, `SETTLING`
- Validates state transitions
- Detects "Last Man Standing" scenario
- Manages player turn progression
- Checks if betting rounds are complete

**State Flow:**
```
WAITING ──► DEALING ──► PREFLOP ──► FLOP ──► TURN ──► RIVER ──► SHOWDOWN ──► SETTLING ──► WAITING
                            │                                        ▲
                            └────────── LAST_MAN ──────────────────┘
```

### 3. Backend - Action Validator

**New File:**
- `functions/src/engines/actionValidator.js` - Centralized action validation

**Features:**
- Validates all player actions (fold, check, call, raise, all_in)
- Throws structured errors with detailed context
- Checks turn validity, chip availability, bet amounts
- Validates game start conditions

### 4. Backend - Pot Calculator

**New File:**
- `functions/src/engines/potCalculator.js` - Advanced pot calculation

**Features:**
- Calculates main pot and side pots
- Handles multiple all-in scenarios correctly
- Distributes chips to winners
- Awards odd chips to player closest to dealer button

### 5. Backend - Game Handler Updates

**Updated File:**
- `functions/src/handlers/game.js`

**Key Changes:**
1. **Last Man Standing Handler:**
   - Detects when only one active player remains
   - Awards pot immediately to winner
   - Records hand history with "last_man_standing" reason
   - Returns game to `WAITING` state (no auto-start)
   - Cleans up private hole cards

2. **Improved `handlePlayerAction()`:**
   - Uses new action validator
   - Checks for last man standing after each action
   - Uses state machine for round completion detection
   - Returns structured errors

3. **Updated `advanceRound()`:**
   - Uses `getFirstToAct()` from state machine
   - Properly manages turn progression

4. **Updated `handleShowdown()`:**
   - Returns to `WAITING` state after settling
   - Keeps community cards visible for result display
   - Does NOT auto-start next hand

### 6. Backend - Cloud Functions Error Handling

**Updated File:**
- `functions/src/index.js`

**Changes:**
- `pokerPlayerAction` now catches and returns structured errors
- `startPokerHand` now catches and returns structured errors
- Errors with `code` and `details` are returned as `failed-precondition`
- Frontend can extract error codes for user-friendly messages

### 7. Frontend - Error Handling

**Updated Files:**
- `src/composables/useGameActions.js`
- `src/store/modules/poker.js`

**Features:**
1. **Error Code Mapping:**
   - Maps all `GameErrorCodes` to Chinese messages
   - Displays toast notifications instead of redirecting
   - No more `router.push` on game errors

2. **Enhanced Store:**
   - Extracts error codes from Firebase Functions errors
   - Throws enhanced errors with `code` property
   - Maintains backward compatibility

### 8. Frontend - UI Improvements

**Updated File:**
- `src/components/game/PokerTable.vue`

**CSS Changes:**
1. **Fixed Viewport:**
   ```css
   .poker-table-container {
     position: fixed;
     inset: 0;
     overflow: hidden; /* Prevents scrolling */
   }
   ```

2. **Table Position Moved Up:**
   ```css
   .poker-table {
     top: 40%; /* Was 50%, now higher on screen */
   }
   ```

3. **Community Cards Position:**
   - Also moved up to match table position

### 9. Timer Synchronization

**Status:** Already implemented correctly

**Backend:** `functions/src/handlers/turnTimer.js`
- Sets `turnExpiresAt` timestamp
- Creates Cloud Tasks for timeout handling

**Frontend:** `src/components/game/TurnTimer.vue`
- Reads `expiresAt` prop from backend
- Updates countdown in real-time
- No client-side timer generation

## Game Flow Improvements

### Before
1. Game would freeze on last man standing
2. Game auto-started after showdown
3. Generic "internal" errors
4. Page could scroll
5. Table was too low on screen

### After
1. ✅ Last man standing handled gracefully
2. ✅ Game returns to WAITING, requires manual start
3. ✅ Specific, user-friendly error messages
4. ✅ Fixed viewport, no scrolling
5. ✅ Table positioned higher for better visibility

## Error Handling Flow

### Before
```
Error → Cloud Function throws "internal" → Frontend shows generic message → Router redirects
```

### After
```
Error → Validator throws structured error → 
Cloud Function returns failed-precondition with error code → 
Frontend extracts error code → 
Maps to Chinese message → 
Shows toast notification → 
No redirect, player stays in game
```

## Testing Checklist

- [ ] Start game with 2+ players
- [ ] Play until one player folds (last man standing)
- [ ] Verify winner gets pot
- [ ] Verify game returns to WAITING
- [ ] Verify host can manually start next hand
- [ ] Test all error scenarios:
  - [ ] Try to act out of turn
  - [ ] Try to check when bet required
  - [ ] Try to call with insufficient chips
  - [ ] Try to raise invalid amount
- [ ] Verify error messages show in Chinese
- [ ] Verify no router redirects on errors
- [ ] Verify page doesn't scroll
- [ ] Verify table is positioned higher
- [ ] Verify timer synchronization works

## Breaking Changes

None. All changes are backward compatible:
- Old validator functions still work (marked deprecated)
- Existing error handling still works (enhanced with new codes)
- All existing API endpoints unchanged

## Next Steps

1. Deploy backend functions
2. Deploy frontend
3. Test in production
4. Monitor error logs
5. Gather user feedback on error messages
6. Adjust UI positioning if needed

## Files Changed

### Backend
- ✅ `functions/src/errors/gameErrors.js` (new)
- ✅ `functions/src/engines/gameStateMachine.js` (new)
- ✅ `functions/src/engines/actionValidator.js` (new)
- ✅ `functions/src/engines/potCalculator.js` (new)
- ✅ `functions/src/handlers/game.js` (updated)
- ✅ `functions/src/index.js` (updated)
- ✅ `functions/src/utils/validators.js` (updated - deprecated)

### Frontend
- ✅ `src/composables/useGameActions.js` (updated)
- ✅ `src/store/modules/poker.js` (updated)
- ✅ `src/components/game/PokerTable.vue` (updated)

## Implementation Quality

- ✅ All ESLint checks pass
- ✅ JSDoc comments complete
- ✅ No trailing spaces
- ✅ No unused imports
- ✅ Follows existing code style
- ✅ Backward compatible
- ✅ Minimal changes approach
