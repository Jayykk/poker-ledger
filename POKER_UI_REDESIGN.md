# Poker UI Redesign and Bug Fixes

## Summary of Changes

This document summarizes the changes made to redesign the poker game interface and fix critical bugs.

## 1. Critical Bug Fix: Game Start Issue

### Problem
When clicking "Start Hand", the game would freeze with no countdown timer and no game progression.

### Root Cause
In `functions/src/engines/texasHoldem.js`, the `initializeHand` function was setting `table.currentTurn` to a seat number (integer) instead of a player ID (odId string). This caused the game to not recognize whose turn it was.

### Solution
Modified line 93-94 in `texasHoldem.js`:
```javascript
// Before (WRONG):
table.currentTurn = activePlayers[firstToActIndex];

// After (CORRECT):
const firstToActSeat = activePlayers[firstToActIndex];
table.currentTurn = seats[firstToActSeat].odId;
```

The `activePlayers` array contains seat numbers, so we need to look up the seat to get the player's `odId`.

## 2. First-Person Seat View (Seat Rotation)

### Feature
When a player sits down at a seat, their seat is now displayed at the bottom center of the screen, with other players arranged in relative circular order.

### Implementation
In `src/components/game/PokerTable.vue`:

1. **Find Player's Seat**:
```javascript
const mySeatNumber = computed(() => {
  const userId = authStore.user?.uid;
  if (!userId) return null;
  
  for (let i = 0; i < maxSeats.value; i++) {
    const seat = seats.value[i];
    if (seat && seat.odId === userId) {
      return i;
    }
  }
  return null;
});
```

2. **Calculate Display Position**:
```javascript
const getDisplayPosition = (actualSeatNum) => {
  if (mySeatNumber.value === null) {
    return actualSeatNum; // No rotation if not seated
  }
  // Rotate so my seat appears at position 0 (bottom center)
  return (actualSeatNum - mySeatNumber.value + maxSeats.value) % maxSeats.value;
};
```

3. **Map Seats to Display Positions**:
Each seat is assigned a display position (0-9 for a 10-seat table), where:
- Position 0 = bottom center (player's seat)
- Positions 1-9 = arranged clockwise around the table

## 3. Empty Seat Hiding

### Feature
Only seats with players are displayed. Empty seats are hidden to reduce visual clutter.

### Implementation
In `src/components/game/PokerTable.vue`:

```javascript
const visibleSeats = computed(() => {
  const visible = [];
  for (let i = 0; i < maxSeats.value; i++) {
    const seat = seats.value[i];
    // Show seat if:
    // 1. Player is not seated yet (show all for joining)
    // 2. It's my seat
    // 3. Seat is occupied
    if (mySeatNumber.value === null || i === mySeatNumber.value || seat !== null) {
      const displayPos = getDisplayPosition(i);
      visible.push({
        actualSeatNum: i,
        displayPosition: displayPos,
        seat: seat,
      });
    }
  }
  return visible;
});
```

### Special Cases:
- **Before sitting**: All seats are visible (so you can choose where to sit)
- **After sitting**: Only your seat + occupied seats are visible
- **Your seat**: Always visible even if you stand up

## 4. New UI: Leave Seat Button

### Feature
Added "Leave Seat" button in the header toolbar, separate from "Leave Table".

### Difference:
- **Leave Table**: Exits the game completely and returns to lobby
- **Leave Seat**: Removes player from their seat but keeps them as spectator

### Implementation
In `src/views/PokerGame.vue`:

1. Added button in header:
```html
<button 
  v-if="mySeat && currentGame.status === 'playing'"
  @click="handleLeaveSeat" 
  class="btn-leave-seat"
>
  Leave Seat
</button>
```

2. Handler uses existing backend function:
```javascript
const handleLeaveSeat = async () => {
  if (confirm('Leave your seat but stay at the table as spectator?')) {
    try {
      await leaveSeat();
      success('You left your seat');
    } catch (error) {
      console.error('Failed to leave seat:', error);
    }
  }
};
```

### Backend Constraint
The existing `leaveSeat` function prevents leaving during an active hand where you're playing. This is correct behavior to prevent cheating/exploitation.

## 5. Updated Layout Structure

### Current Layout (Top to Bottom):
1. **Header Toolbar**:
   - Left: "Leave Table" button
   - Center: Table info (Table ID, Blinds, Hand number)
   - Right: "Leave Seat", "End After Hand", "Delete Room" buttons

2. **Central Game Area**:
   - Poker table with rotated seats
   - Community cards in center
   - Pot display

3. **Bottom Action Area**:
   - Action buttons (Fold, Check, Call, Raise, All-in)
   - Start Hand button (for game creator)

## Files Modified

1. `functions/src/engines/texasHoldem.js` - Fixed startHand bug
2. `src/components/game/PokerTable.vue` - Seat rotation and hiding logic
3. `src/components/game/PlayerSeat.vue` - Added visible prop
4. `src/views/PokerGame.vue` - Added Leave Seat button and UI improvements

## Testing Checklist

- [x] Code builds successfully (npm run build)
- [x] Functions lint successfully (npm run lint)
- [ ] Manual testing: Game start works
- [ ] Manual testing: Seat rotation displays correctly
- [ ] Manual testing: Empty seats are hidden
- [ ] Manual testing: Leave Seat vs Leave Table work correctly

## Known Limitations

1. **Leave Seat during active hand**: Currently prevented by backend. Player must wait until hand completes.
2. **Seat rotation animation**: No smooth transitions when seats rotate (could be future enhancement)
3. **Mobile responsiveness**: Existing responsive design maintained, but seat rotation may need additional mobile testing

## Future Enhancements

1. Add smooth CSS transitions when seats rotate
2. Add visual indicators for seat positions (e.g., "Your view" label)
3. Consider allowing "Leave Seat" during hand (with auto-fold)
4. Add spectator mode UI enhancements
5. Add setting to toggle seat rotation on/off
