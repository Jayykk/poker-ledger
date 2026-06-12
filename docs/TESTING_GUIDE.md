# Testing Guide for Game State Machine Refactoring

## Prerequisites
1. Deploy backend functions to Firebase
2. Deploy frontend to hosting
3. Have at least 2 test accounts ready

## Test Scenarios

### 1. Basic Game Flow
**Steps:**
1. Create a new game room as Player A
2. Join seat 1 with 1000 chips
3. Join as Player B in seat 2 with 1000 chips
4. As host (Player A), click "Start Hand"
5. Observe blinds posted correctly
6. Take turns betting
7. Complete hand normally to showdown

**Expected:**
- ✅ Hand progresses through: PREFLOP → FLOP → TURN → RIVER → SHOWDOWN
- ✅ Winner gets pot
- ✅ Game returns to WAITING state
- ✅ "Start Hand" button appears for host
- ✅ Community cards remain visible after showdown

### 2. Last Man Standing
**Steps:**
1. Start a new hand with 2+ players
2. All players except one fold
3. Observe last man standing scenario

**Expected:**
- ✅ Remaining player immediately wins pot
- ✅ No showdown phase
- ✅ Game returns to WAITING state
- ✅ Hand history shows "last_man_standing" reason
- ✅ No crash or freeze

### 3. Manual Hand Start
**Steps:**
1. Complete a hand (by showdown or last man standing)
2. Verify game is in WAITING state
3. Wait 10 seconds
4. Verify game does NOT auto-start
5. As host, click "Start Hand"

**Expected:**
- ✅ Game stays in WAITING until host clicks
- ✅ No automatic hand start
- ✅ Only host can see/click "Start Hand" button
- ✅ New hand starts correctly when clicked

### 4. Error Handling - Not Your Turn
**Steps:**
1. Start a hand
2. When it's Player A's turn, try to act as Player B
3. Observe error message

**Expected:**
- ✅ Toast message: "還沒輪到你"
- ✅ No page redirect
- ✅ Game state unchanged
- ✅ Player stays on poker table page

### 5. Error Handling - Insufficient Chips
**Steps:**
1. Start a hand with Player A having 50 chips
2. When facing a bet of 100 chips, try to call

**Expected:**
- ✅ Toast message: "籌碼不足"
- ✅ Shows required vs available chips in error details
- ✅ No page redirect
- ✅ Action not executed

### 6. Error Handling - Invalid Check
**Steps:**
1. Start a hand
2. When facing a bet, try to check

**Expected:**
- ✅ Toast message: "不能過牌，必須跟注或棄牌"
- ✅ No page redirect
- ✅ Check action disabled/prevented

### 7. Error Handling - Invalid Raise Amount
**Steps:**
1. Start a hand
2. Try to raise less than minimum raise amount

**Expected:**
- ✅ Toast message: "加注金額無效"
- ✅ Shows minimum required raise
- ✅ No page redirect

### 8. UI - Fixed Viewport
**Steps:**
1. Join a game on desktop
2. Try to scroll the page
3. Repeat on mobile device

**Expected:**
- ✅ Page does not scroll
- ✅ Entire game fits in viewport
- ✅ No vertical or horizontal overflow
- ✅ Works on both desktop and mobile

### 9. UI - Table Position
**Steps:**
1. Join a game
2. Observe poker table position

**Expected:**
- ✅ Table is positioned higher than before (top: 40%)
- ✅ More space below for action buttons
- ✅ Community cards visible and centered
- ✅ Good visual balance

### 10. Timer Synchronization
**Steps:**
1. Start a hand with 30-second turn timeout
2. Open game in two browser windows
3. Observe timer countdown in both

**Expected:**
- ✅ Both timers show same countdown
- ✅ No drift between windows
- ✅ Timer based on backend timestamp
- ✅ Auto-fold happens after 30 seconds if no action

### 11. Multiple All-In (Side Pots)
**Steps:**
1. Start with 3 players:
   - Player A: 100 chips
   - Player B: 200 chips
   - Player C: 500 chips
2. Player A goes all-in for 100
3. Player B goes all-in for 200
4. Player C calls 200
5. Play to showdown

**Expected:**
- ✅ Main pot: 300 (100 × 3)
- ✅ Side pot: 200 (100 × 2, only B and C eligible)
- ✅ Winner(s) determined correctly per pot
- ✅ Chips distributed correctly
- ✅ Odd chips to player closest to dealer

### 12. Edge Case - All Players All-In
**Steps:**
1. Start with 2 players
2. Both go all-in preflop
3. Observe remaining streets

**Expected:**
- ✅ No more betting actions
- ✅ Board runs out completely (flop, turn, river)
- ✅ Winner determined at showdown
- ✅ Game returns to WAITING

### 13. Success Messages
**Steps:**
1. Perform each action: fold, check, call, raise, all-in
2. Observe success toast for each

**Expected:**
- ✅ Fold: "你棄牌了"
- ✅ Check: "你過牌了"
- ✅ Call: "你跟注了"
- ✅ Raise: "你加注了 {amount}"
- ✅ All-in: "你全下了！"

### 14. Backward Compatibility
**Steps:**
1. Load existing game rooms (if any)
2. Try to interact with old game data

**Expected:**
- ✅ Old games still load
- ✅ Old error handling still works
- ✅ No breaking changes
- ✅ Smooth migration

## Performance Testing

### Load Testing
1. Create multiple game rooms
2. Have multiple concurrent hands running
3. Monitor server response times

**Expected:**
- ✅ Response time < 500ms for most actions
- ✅ No memory leaks
- ✅ Cloud Tasks created/deleted properly
- ✅ No orphaned tasks

### Stress Testing
1. Rapidly perform actions
2. Test with many players (8-10)
3. Test timeout scenarios

**Expected:**
- ✅ No race conditions
- ✅ Transaction conflicts handled
- ✅ Timeouts work correctly
- ✅ No data corruption

## Security Testing

1. Try to act as another player
2. Try to manipulate pot amounts
3. Try invalid game states

**Expected:**
- ✅ All actions validated server-side
- ✅ No client-side manipulation possible
- ✅ Authentication enforced
- ✅ Error messages don't leak sensitive data

## Regression Testing

1. Test all existing features still work
2. Chat functionality
3. Spectator mode
4. Hand history
5. Game settings

**Expected:**
- ✅ No existing features broken
- ✅ All integrations work
- ✅ Data persistence correct

## Browser Compatibility

Test on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Mobile Safari (iOS)
- Chrome Mobile (Android)

**Expected:**
- ✅ Works on all browsers
- ✅ CSS renders correctly
- ✅ Fixed viewport works
- ✅ Touch interactions work

## Bug Reporting Template

When reporting bugs, include:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Browser/device info
5. Screenshots/videos if applicable
6. Console errors (F12)

## Success Criteria

All test scenarios must pass before considering the implementation complete:
- [ ] All 14 functional tests pass
- [ ] Performance acceptable
- [ ] Security validated
- [ ] No regressions
- [ ] Cross-browser compatible
- [ ] Mobile responsive
- [ ] Error messages clear and helpful
- [ ] No console errors
