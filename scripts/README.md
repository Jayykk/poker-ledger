# Scripts

This directory contains utility scripts for managing the Poker Ledger application.

## Cleanup Scripts

### delete_stale_poker_rooms.js

One-time cleanup that deletes stale / orphan online-poker rooms (`pokerGames`).

**Purpose**: Before the periodic `handleRoomSweep` existed, a room's only auto-close was a single best-effort Cloud Task; when that task was lost, the room stayed `waiting` forever ("orphan room" in the lobby). This script clears that backlog. Going forward `handleRoomSweep` keeps things tidy, so this should rarely be needed.

**A room is considered stale when**:
- `status` is `closed` / `completed` / `ended`, OR
- it is idle: `meta.lastActivityAt` older than `--idle-minutes` (default 60), or missing entirely (legacy doc)

**Usage**:
```bash
# Dry run (default) — lists targets, deletes nothing
node scripts/delete_stale_poker_rooms.js

# Actually delete
node scripts/delete_stale_poker_rooms.js --yes

# Custom idle threshold
node scripts/delete_stale_poker_rooms.js --idle-minutes 120 --yes

# Also delete idle 'playing' rooms
node scripts/delete_stale_poker_rooms.js --include-active --yes
```

**Prerequisites**: Firebase Admin credentials — set `GOOGLE_APPLICATION_CREDENTIALS`, or place `serviceAccountKey.json` / `service-account.json` at the repo root (same convention as the migration script below).

**Safety**: dry-run by default; nothing is deleted without `--yes`. Deletion is recursive (removes `events` / `hands` / `private` / `history` subcollections).

## Migration Scripts

### migrate_entries_to_events.js

Migrates game data from the old array-based structure to the new subcollection-based structure.

**Purpose**: Fix the Firestore limitation where `FieldValue.serverTimestamp()` cannot be used inside array elements.

**What it migrates**:
- `actions` arrays in hand documents → `events` subcollection with `type: 'action'`
- `shownCards` arrays in hand documents → `events` subcollection with `type: 'shownCards'`
- `spectators` arrays in game documents → `events` subcollection with `type: 'spectatorJoin'`

**Usage**:
```bash
# Dry run to see what would be migrated
node scripts/migrate_entries_to_events.js --dry-run

# Migrate all games, keeping original arrays
node scripts/migrate_entries_to_events.js

# Migrate all games and delete original arrays
node scripts/migrate_entries_to_events.js --delete-old

# Migrate specific game only
node scripts/migrate_entries_to_events.js --game-id abc123
```

**Prerequisites**:
1. Install dependencies: `cd functions && npm install`
2. Set up Firebase Admin credentials:
   - Option 1: Place service account JSON in project root as `serviceAccountKey.json`
   - Option 2: Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable
   - Option 3: Use default application credentials

**Safety**:
- Always run with `--dry-run` first to preview changes
- The script preserves original arrays by default (use `--delete-old` to remove them)
- Uses batched writes to handle large datasets efficiently
- Normalizes timestamps from various formats to Firestore Timestamps

**Data Model Changes**:

Old structure:
```javascript
// In hands/{handId} document
{
  actions: [
    { odId: 'user1', action: 'bet', amount: 100, timestamp: Timestamp }
  ],
  shownCards: [
    { odId: 'user2', cards: ['Ah', 'Kh'], timestamp: Timestamp }
  ]
}

// In pokerGames/{gameId} document
{
  spectators: [
    { userId: 'user3', userName: 'Bob', joinedAt: Timestamp }
  ]
}
```

New structure:
```javascript
// In pokerGames/{gameId}/events/{eventId} documents
{
  type: 'action',
  handNumber: 1,
  odId: 'user1',
  action: 'bet',
  amount: 100,
  timestamp: Timestamp
}

{
  type: 'shownCards',
  handNumber: 1,
  odId: 'user2',
  cards: ['Ah', 'Kh'],
  timestamp: Timestamp
}

{
  type: 'spectatorJoin',
  userId: 'user3',
  userName: 'Bob',
  timestamp: Timestamp
}
```
