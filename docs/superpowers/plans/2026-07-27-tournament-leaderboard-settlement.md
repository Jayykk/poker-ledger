# Tournament Leaderboard and Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ITM and ROI tournament rankings with durable rebuy metrics, allow room participants to perform normal tournament settlement, and keep negotiated settlement host/admin-only.

**Architecture:** Pure tournament payout and entry math lives under `functions/src/utils/` so Cloud Functions can deploy it and the Vue app can share it. Callable Functions own both settlement transactions and enforce different authorization policies for normal and negotiated settlement. Completed-game history contains immutable metric inputs; `leaderboardStats` remains the only collection read by the leaderboard UI.

**Tech Stack:** Vue 3 Composition API, Pinia, Firebase callable Functions, Firestore transactions and triggers, Vitest, Firestore Rules emulator, vue-i18n.

## Global Constraints

- Do not run `npm install`, `npm ci`, `npm update`, or modify either lockfile.
- Do not modify `package.json`; no dependency change is required.
- Use test-first RED/GREEN cycles for every production behavior.
- Normal settlement allows an authenticated UID present in `game.players[].uid`, the host, or an administrator.
- Negotiated ICM, Chip Chop, and custom settlement allows only the host or an administrator.
- Firestore Rules must continue rejecting direct non-host writes to settlement and lifecycle fields.
- ROI is `(totalPrize - totalBuyIn) / totalBuyIn * 100`; zero total buy-in produces an unavailable ROI.
- Rebuy counts are never guessed from inconsistent or missing legacy inputs.
- Add every new UI string to zh-TW, zh-CN, en, and ja.
- Do not create commits unless the user explicitly requests them.

---

### Task 1: Shared Tournament Settlement Math

**Files:**
- Create: `functions/src/utils/tournamentSettlementMath.js`
- Modify: `src/utils/settlementMath.js`
- Create: `tests/functions/tournamentSettlementMath.test.js`
- Test: `tests/settlementMath.test.js`

**Interfaces:**
- Produces: `deriveTournamentEntryMetrics(totalBuyIn, baseBuyIn) -> { entryCount, rebuyCount } | null`
- Produces: `buildTournamentPrizeMap(totalBuyIns, payoutRatios) -> Record<number, number>`
- Produces: `buildTournamentSettlement(players, payoutRatios, baseBuyIn) -> SettlementRow[]`
- Produces: `buildDealSettlement(players, payoutRatios, allocations, baseBuyIn) -> SettlementRow[]`
- `SettlementRow` includes `buyIn`, `prize`, `profit`, `entryCount`, and `rebuyCount`.

- [ ] **Step 1: Write failing metric tests**

Create `tests/functions/tournamentSettlementMath.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  deriveTournamentEntryMetrics,
  buildTournamentSettlement,
} from '../../functions/src/utils/tournamentSettlementMath.js';

describe('deriveTournamentEntryMetrics', () => {
  it('derives entries and rebuys from fixed tournament buy-ins', () => {
    expect(deriveTournamentEntryMetrics(3000, 1000)).toEqual({
      entryCount: 3,
      rebuyCount: 2,
    });
  });

  it.each([
    [1000, 0],
    [2500, 1000],
    [-1000, 1000],
  ])('returns null for inconsistent inputs (%s, %s)', (totalBuyIn, baseBuyIn) => {
    expect(deriveTournamentEntryMetrics(totalBuyIn, baseBuyIn)).toBeNull();
  });
});

describe('buildTournamentSettlement', () => {
  it('snapshots entry and rebuy counts per player', () => {
    const rows = buildTournamentSettlement([
      { id: 'p1', uid: 'u1', name: 'Alice', placement: 1, buyIn: 3000 },
      { id: 'p2', uid: 'u2', name: 'Bob', placement: 2, buyIn: 1000 },
    ], [{ place: 1, percentage: 100 }], 1000);

    expect(rows[0]).toMatchObject({
      odId: 'u1', buyIn: 3000, prize: 4000, profit: 1000,
      entryCount: 3, rebuyCount: 2,
    });
    expect(rows[1]).toMatchObject({
      odId: 'u2', entryCount: 1, rebuyCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm test -- tests/functions/tournamentSettlementMath.test.js`

Expected: FAIL because `functions/src/utils/tournamentSettlementMath.js` does not exist.

- [ ] **Step 3: Implement deployable shared math**

Create `functions/src/utils/tournamentSettlementMath.js` by moving the existing largest-remainder `buildTournamentPrizeMap`, `buildTournamentSettlement`, and `buildDealSettlement` behavior from `src/utils/settlementMath.js`, then add:

```js
export function deriveTournamentEntryMetrics(totalBuyIn, baseBuyIn) {
  const total = Number(totalBuyIn);
  const base = Number(baseBuyIn);
  if (!Number.isFinite(total) || !Number.isFinite(base) || total < 0 || base <= 0) return null;

  const exactEntries = total / base;
  if (!Number.isInteger(exactEntries) || exactEntries < 1) return null;

  return {
    entryCount: exactEntries,
    rebuyCount: Math.max(0, exactEntries - 1),
  };
}
```

In both settlement builders, merge `deriveTournamentEntryMetrics(p.buyIn, baseBuyIn)` into each row only when the result is non-null. Preserve all current largest-remainder and negotiated-allocation behavior exactly.

- [ ] **Step 4: Re-export shared functions from the frontend utility**

Replace the moved implementations in `src/utils/settlementMath.js` with imports/re-exports while leaving ICM and Chip Chop calculations local:

```js
import {
  buildDealSettlement,
  buildTournamentPrizeMap,
  buildTournamentSettlement,
  deriveTournamentEntryMetrics,
} from '../../functions/src/utils/tournamentSettlementMath.js';

export {
  buildDealSettlement,
  buildTournamentPrizeMap,
  buildTournamentSettlement,
  deriveTournamentEntryMetrics,
};
```

Update existing frontend calls to pass `baseBuyIn` as the third/fourth argument.

- [ ] **Step 5: Run focused settlement math tests**

Run: `npm test -- tests/functions/tournamentSettlementMath.test.js tests/settlementMath.test.js`

Expected: PASS with existing payout reconciliation tests unchanged.

---

### Task 2: Durable History Metrics and Leaderboard Aggregation

**Files:**
- Modify: `functions/src/handlers/gameHistoryProjection.js`
- Modify: `functions/src/utils/leaderboardStatsMath.js`
- Modify: `tests/leaderboardStatsMath.test.js`
- Create: `tests/functions/gameHistoryProjection.test.js`

**Interfaces:**
- Consumes: `deriveTournamentEntryMetrics` from Task 1.
- Produces history fields: top-level `baseBuyIn`; settlement-row `entryCount` and `rebuyCount`.
- Produces tournament aggregate fields: `totalBuyIn`, `totalPrize`, `rebuyCount`, `rebuyKnownGames`.

- [ ] **Step 1: Add failing aggregation tests**

Extend `tests/leaderboardStatsMath.test.js`:

```js
it('aggregates tournament ROI inputs and known rebuy snapshots', () => {
  const records = [{
    type: 'tournament', profit: 1000, baseBuyIn: 1000, createdAt: at,
    settlement: [{
      odId: uid, buyIn: 3000, prize: 4000, profit: 1000,
      entryCount: 3, rebuyCount: 2,
    }],
  }];

  expect(aggregateHistoryRecords(uid, records).get('all').tournament).toMatchObject({
    games: 1,
    totalBuyIn: 3000,
    totalPrize: 4000,
    rebuyCount: 2,
    rebuyKnownGames: 1,
  });
});

it('keeps ROI but does not guess rebuy when legacy base buy-in is unknown', () => {
  const records = [{
    type: 'tournament', profit: 500, createdAt: at,
    settlement: [{ odId: uid, buyIn: 1000, prize: 1500, profit: 500 }],
  }];

  expect(aggregateHistoryRecords(uid, records).get('all').tournament).toMatchObject({
    totalBuyIn: 1000,
    totalPrize: 1500,
    rebuyCount: 0,
    rebuyKnownGames: 0,
  });
});
```

- [ ] **Step 2: Run aggregation tests and verify RED**

Run: `npm test -- tests/leaderboardStatsMath.test.js`

Expected: FAIL because the new aggregate fields are absent.

- [ ] **Step 3: Implement aggregate fields and version bump**

Change the tournament bucket factory to:

```js
const emptyTournamentBucket = () => ({
  ...emptyBucket(),
  itm: 0,
  champion: 0,
  runnerUp: 0,
  totalBuyIn: 0,
  totalPrize: 0,
  rebuyCount: 0,
  rebuyKnownGames: 0,
});
```

For tournament records, use the caller's own settlement row:

```js
const buyIn = Number(ownRow?.buyIn) || 0;
const prize = Number(ownRow?.prize) || 0;
const explicitRebuy = Number.isInteger(ownRow?.rebuyCount) && ownRow.rebuyCount >= 0
  ? ownRow.rebuyCount
  : null;
const derived = explicitRebuy == null
  ? deriveTournamentEntryMetrics(buyIn, record.baseBuyIn)
  : null;
const rebuyCount = explicitRebuy ?? derived?.rebuyCount ?? null;

bucket.totalBuyIn += buyIn;
bucket.totalPrize += prize;
if (rebuyCount != null) {
  bucket.rebuyCount += rebuyCount;
  bucket.rebuyKnownGames += 1;
}
```

Round `totalBuyIn` and `totalPrize` with the existing `round2` pass. Increment `LEADERBOARD_STATS_VERSION` from `1` to `2`.

- [ ] **Step 4: Add failing projection tests**

Export a pure `buildUserProjectionDocs` test surface from `gameHistoryProjection.js`, then create `tests/functions/gameHistoryProjection.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { buildUserProjectionDocs } from '../../functions/src/handlers/gameHistoryProjection.js';

it('projects tournament base buy-in and immutable rebuy metrics', () => {
  const docs = buildUserProjectionDocs('g1', {
    name: 'Sunday', type: 'tournament', status: 'completed', baseBuyIn: 1000,
    completedAt: 1000,
    settlementSnapshot: [{
      odId: 'u1', name: 'Alice', placement: 1,
      buyIn: 3000, prize: 4000, profit: 1000,
      entryCount: 3, rebuyCount: 2,
    }],
  });

  expect(docs[0].data.baseBuyIn).toBe(1000);
  expect(docs[0].data.settlement[0]).toMatchObject({ entryCount: 3, rebuyCount: 2 });
});
```

- [ ] **Step 5: Run projection test and verify RED**

Run: `npm test -- tests/functions/gameHistoryProjection.test.js`

Expected: FAIL because the projection drops the metric fields and the builder is not exported.

- [ ] **Step 6: Preserve metric snapshots in history projection**

Update settlement normalization:

```js
function normalizeSettlementRow(row) {
  const normalized = {
    odId: row.odId || row.uid || null,
    name: row.name || '',
    buyIn: roundNumber(row.buyIn),
    stack: roundNumber(row.stack),
    placement: row.placement == null ? null : roundNumber(row.placement),
    prize: roundNumber(row.prize),
    profit: roundNumber(row.profit),
  };
  if (Number.isInteger(row.entryCount)) normalized.entryCount = row.entryCount;
  if (Number.isInteger(row.rebuyCount)) normalized.rebuyCount = row.rebuyCount;
  return normalized;
}
```

Add `baseBuyIn: roundNumber(game.baseBuyIn)` to each projected history record. When rebuilding a legacy tournament settlement from players, merge `deriveTournamentEntryMetrics(player.buyIn, game.baseBuyIn)` into its row.

- [ ] **Step 7: Run focused history and aggregation tests**

Run: `npm test -- tests/functions/gameHistoryProjection.test.js tests/leaderboardStatsMath.test.js`

Expected: PASS.

---

### Task 3: Participant-Authorized Normal Settlement Callable

**Files:**
- Create: `functions/src/handlers/tournamentSettlement.js`
- Modify: `functions/src/index.js`
- Create: `tests/functions/tournamentSettlementAuthorization.test.js`
- Create: `tests/functions/tournamentSettlementState.test.js`

**Interfaces:**
- Consumes Task 1: `buildTournamentSettlement(players, payoutRatios, baseBuyIn)`.
- Produces: `settleTournamentGame({ gameId, callerUid, db }) -> { gameId, syncToken, settlement, alreadySettled }`.
- Produces callable: `settleTournamentGame` with request `{ gameId }`.

- [ ] **Step 1: Write failing authorization and state tests**

Create pure-policy tests:

```js
import { describe, expect, it } from 'vitest';
import {
  canRunNormalTournamentSettlement,
  validateNormalTournamentState,
} from '../../functions/src/handlers/tournamentSettlement.js';

const game = {
  type: 'tournament', status: 'active', hostUid: 'host',
  players: [
    { uid: 'host', eliminated: true, placement: 2 },
    { uid: 'member', eliminated: false, placement: null },
  ],
};

it('allows a listed participant and an admin', () => {
  expect(canRunNormalTournamentSettlement(game, 'member', false)).toBe(true);
  expect(canRunNormalTournamentSettlement(game, 'outsider', true)).toBe(true);
});

it('rejects an outsider who only has the game id', () => {
  expect(canRunNormalTournamentSettlement(game, 'outsider', false)).toBe(false);
});

it('requires exactly one surviving champion for normal settlement', () => {
  expect(() => validateNormalTournamentState({ ...game, players: [] }))
    .toThrow('INVALID_TOURNAMENT_STATE');
  expect(validateNormalTournamentState(game)).toBeUndefined();
});
```

- [ ] **Step 2: Run policy tests and verify RED**

Run: `npm test -- tests/functions/tournamentSettlementAuthorization.test.js tests/functions/tournamentSettlementState.test.js`

Expected: FAIL because the handler module does not exist.

- [ ] **Step 3: Implement pure authorization and state validation**

In `functions/src/handlers/tournamentSettlement.js`:

```js
export function canRunNormalTournamentSettlement(game, callerUid, isAdmin) {
  if (isAdmin) return true;
  return (game.players || []).some((player) => player.uid === callerUid);
}

export function validateNormalTournamentState(game) {
  if (game.type !== 'tournament' || game.status !== 'active') {
    throw new HttpsError('failed-precondition', 'INVALID_TOURNAMENT_STATE');
  }
  const alive = (game.players || []).filter((player) => !player.eliminated);
  if (alive.length !== 1) {
    throw new HttpsError('failed-precondition', 'INVALID_TOURNAMENT_STATE');
  }
}
```

- [ ] **Step 4: Implement the transactional service**

The service must read, in order, the game, optional admin document, and linked tournament session before any writes. It obtains payout ratios only from `session.config.payoutRatios`, crowns the one survivor, computes settlement with Task 1, and writes:

```js
{
  players: updatedPlayers,
  status: 'completed',
  rate: 1,
  payoutRatios,
  settlementSnapshot: settlement,
  completedAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  'historyProjection.requestToken': syncToken,
  'historyProjection.requestedAt': FieldValue.serverTimestamp(),
}
```

If the game is already completed and has `settlementSnapshot`, return it with `alreadySettled: true`; do not write again. Missing payout ratios produce `failed-precondition/PAYOUT_RATIOS_NOT_CONFIGURED`. Unauthorized users receive `permission-denied`.

- [ ] **Step 5: Export the callable without masking HttpsError codes**

Add to `functions/src/index.js`:

```js
export const settleTournamentGame = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const gameId = request.data?.gameId;
  if (!gameId) throw new HttpsError('invalid-argument', 'Missing gameId');
  return settleTournamentGameHandler({ gameId, callerUid: request.auth.uid, db: getFirestore() });
});
```

Import the handler under the alias `settleTournamentGameHandler`. Do not wrap known `HttpsError` values in `internal`, so the client can display useful errors.

- [ ] **Step 6: Run focused function tests and lint**

Run: `npm test -- tests/functions/tournamentSettlementAuthorization.test.js tests/functions/tournamentSettlementState.test.js`

Run: `npm --prefix functions run lint`

Expected: both commands PASS.

---

### Task 4: Host/Admin Negotiated Settlement Callable

**Files:**
- Modify: `functions/src/handlers/tournamentSettlement.js`
- Modify: `functions/src/index.js`
- Modify: `tests/functions/tournamentSettlementAuthorization.test.js`
- Create: `tests/functions/tournamentDealValidation.test.js`

**Interfaces:**
- Consumes Task 1: `buildTournamentPrizeMap` and `buildDealSettlement`.
- Produces: `settleTournamentDeal({ gameId, callerUid, deal, db })`.
- Produces callable: `settleTournamentDeal` with request `{ gameId, deal }`.

- [ ] **Step 1: Add failing deal authorization tests**

```js
import { canRunNegotiatedSettlement } from '../../functions/src/handlers/tournamentSettlement.js';

it('allows only host/admin for negotiated settlement', () => {
  expect(canRunNegotiatedSettlement({ hostUid: 'host' }, 'host', false)).toBe(true);
  expect(canRunNegotiatedSettlement({ hostUid: 'host' }, 'member', false)).toBe(false);
  expect(canRunNegotiatedSettlement({ hostUid: 'host' }, 'admin', true)).toBe(true);
});
```

- [ ] **Step 2: Add failing stale-state and total tests**

Test exported `validateDealAllocations(players, payoutRatios, allocations)` with:

```js
expect(() => validateDealAllocations(players, payoutRatios, [
  { playerId: 'missing', placement: 1, prize: 1000 },
])).toThrow('DEAL_STATE_CHANGED');

expect(() => validateDealAllocations(players, payoutRatios, [
  { playerId: 'p1', placement: 1, prize: 1 },
  { playerId: 'p2', placement: 2, prize: 1 },
])).toThrow('DEAL_TOTAL_MISMATCH');
```

- [ ] **Step 3: Run deal tests and verify RED**

Run: `npm test -- tests/functions/tournamentSettlementAuthorization.test.js tests/functions/tournamentDealValidation.test.js`

Expected: FAIL because deal policy and validation are not implemented.

- [ ] **Step 4: Move current deal integrity checks into the server handler**

Implement:

```js
export function canRunNegotiatedSettlement(game, callerUid, isAdmin) {
  return isAdmin || game.hostUid === callerUid;
}
```

Move these existing guarantees from `game.js` into the handler transaction:

- allocation IDs exactly match currently alive player IDs;
- allocation total equals the undecided prize pool computed from latest buy-ins;
- placements are unique positive integers within the alive-player range;
- negotiated mode is one of `icm`, `chipchop`, or `custom`;
- linked tournament session is ended in the same transaction;
- settlement and history projection metrics use the latest `baseBuyIn`.

- [ ] **Step 5: Export the negotiated callable**

Add `settleTournamentDeal` to `functions/src/index.js`, requiring authentication, `gameId`, and `deal`. Preserve `permission-denied`, `DEAL_STATE_CHANGED`, and `DEAL_TOTAL_MISMATCH` error identity.

- [ ] **Step 6: Run focused tests and lint**

Run: `npm test -- tests/functions/tournamentSettlementAuthorization.test.js tests/functions/tournamentDealValidation.test.js`

Run: `npm --prefix functions run lint`

Expected: PASS.

---

### Task 5: Switch the Pinia Store and Tournament UI to Callables

**Files:**
- Modify: `src/store/modules/game.js`
- Modify: `src/views/TournamentGameView.vue`
- Modify: `src/i18n/locales/zh-TW.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`
- Create: `tests/tournamentSettlementClient.test.js`

**Interfaces:**
- Consumes Task 3 callable `settleTournamentGame({ gameId })`.
- Consumes Task 4 callable `settleTournamentDeal({ gameId, deal })`.
- Keeps existing store return shape `{ success, settlement, gameId, syncToken }` so `finalizeSettlement` remains unchanged.

- [ ] **Step 1: Write failing client mapping tests**

Extract and test a pure error-key mapper:

```js
import { describe, expect, it } from 'vitest';
import { tournamentSettlementErrorKey } from '../src/utils/tournamentSettlementErrors.js';

it.each([
  ['functions/permission-denied', 'tournament.settlementPermissionDenied'],
  ['functions/failed-precondition', 'tournament.settlementStateChanged'],
  ['functions/unavailable', 'tournament.settlementUnavailable'],
])('maps %s to %s', (code, key) => {
  expect(tournamentSettlementErrorKey({ code })).toBe(key);
});
```

- [ ] **Step 2: Run client test and verify RED**

Run: `npm test -- tests/tournamentSettlementClient.test.js`

Expected: FAIL because the mapper does not exist.

- [ ] **Step 3: Implement the mapper and localized strings**

Create `src/utils/tournamentSettlementErrors.js` with an exact code-to-key map and fallback `tournament.settlementFailed`. Add translations for permission denied, state changed, unavailable, and generic failure to all four locale files.

- [ ] **Step 4: Replace direct client transactions with callable calls**

Import `tournamentSettlementErrorKey` in `src/store/modules/game.js`. Replace the body of normal and negotiated settlement methods:

```js
try {
  const callable = httpsCallable(functions, 'settleTournamentGame');
  const response = await callable({ gameId: gameId.value });
  return response.data;
} catch (err) {
  error.value = tournamentSettlementErrorKey(err);
  return false;
}
```

and:

```js
try {
  const callable = httpsCallable(functions, 'settleTournamentDeal');
  const response = await callable({ gameId: gameId.value, deal });
  return response.data;
} catch (err) {
  error.value = tournamentSettlementErrorKey(err);
  return false;
}
```

Remove client-supplied payout ratios from both method signatures and call sites. Keep only preview calculations in the Vue view; the server does not trust them.

- [ ] **Step 5: Align action visibility with authorization**

Add:

```js
const isParticipant = computed(() =>
  (game.value?.players || []).some((player) => player.uid === user.value?.uid)
);
```

Show the normal settlement action only for `isParticipant || isHost`; keep `canDeal` host-only. The store's `gameError` now contains an i18n key after callable failures, so handle false results with `showError(t(gameError.value || 'tournament.settlementFailed'))` rather than silently closing the modal.

- [ ] **Step 6: Run client and i18n tests**

Run: `npm test -- tests/tournamentSettlementClient.test.js tests/i18nCompleteness.test.js`

Expected: PASS.

---

### Task 6: Add ITM and ROI Ranking Modes

**Files:**
- Create: `src/utils/leaderboardRanking.js`
- Modify: `src/components/social/Leaderboard.vue`
- Modify: `src/i18n/locales/zh-TW.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`
- Create: `tests/leaderboardRanking.test.js`

**Interfaces:**
- Produces: `buildTournamentLeaderboardEntry(row) -> entry`.
- Produces: `rankLeaderboardEntries(entries, sort, minGames) -> entry[]`.
- Entry fields include `itmCount`, `itmRate`, `roi`, `roiAvailable`, `rebuyCount`, and `rebuyKnownGames`.

- [ ] **Step 1: Write failing ranking tests**

```js
import { describe, expect, it } from 'vitest';
import {
  buildTournamentLeaderboardEntry,
  rankLeaderboardEntries,
} from '../src/utils/leaderboardRanking.js';

const row = (uid, tournament) => ({ uid, name: uid, tournament });

it('calculates ITM and ROI from aggregate inputs', () => {
  expect(buildTournamentLeaderboardEntry(row('alice', {
    games: 12, itm: 4, profit: 6300,
    totalBuyIn: 18000, totalPrize: 24300,
    rebuyCount: 6, rebuyKnownGames: 12,
  }))).toMatchObject({
    itmCount: 4,
    itmRate: 33.3,
    roi: 35,
    roiAvailable: true,
    rebuyCount: 6,
  });
});

it('sorts ITM ties by count then games then profit', () => {
  const entries = [
    { uid: 'a', games: 6, itmRate: 50, itmCount: 3, profit: 100 },
    { uid: 'b', games: 10, itmRate: 50, itmCount: 5, profit: 50 },
  ];
  expect(rankLeaderboardEntries(entries, 'itm', 3).map((entry) => entry.uid))
    .toEqual(['b', 'a']);
});

it('filters ROI by minimum games and excludes unavailable ROI', () => {
  const entries = [
    { uid: 'a', games: 2, roi: 100, roiAvailable: true, profit: 100 },
    { uid: 'b', games: 5, roi: 25, roiAvailable: true, profit: 50 },
    { uid: 'c', games: 5, roi: null, roiAvailable: false, profit: 0 },
  ];
  expect(rankLeaderboardEntries(entries, 'roi', 3).map((entry) => entry.uid))
    .toEqual(['b']);
});
```

- [ ] **Step 2: Run ranking tests and verify RED**

Run: `npm test -- tests/leaderboardRanking.test.js`

Expected: FAIL because the ranking utility does not exist.

- [ ] **Step 3: Implement pure ranking functions**

Use one-decimal percentage rounding:

```js
const percent1 = (numerator, denominator) =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;

export function buildTournamentLeaderboardEntry(row) {
  const bucket = row.tournament || {};
  const roi = percent1(bucket.totalPrize - bucket.totalBuyIn, bucket.totalBuyIn);
  return {
    uid: row.uid,
    name: row.name,
    games: bucket.games || 0,
    profit: Math.round(bucket.profit || 0),
    itmCount: bucket.itm || 0,
    itmRate: percent1(bucket.itm || 0, bucket.games || 0) || 0,
    roi,
    roiAvailable: roi != null,
    rebuyCount: bucket.rebuyCount || 0,
    rebuyKnownGames: bucket.rebuyKnownGames || 0,
  };
}
```

Implement the exact tie-breakers from the design and apply `minGames` to `winRate`, `itm`, and `roi`.

- [ ] **Step 4: Add tournament-only sort controls and row rendering**

In `Leaderboard.vue`, add `{ value: 'itm', label: 'sortByItm' }` and `{ value: 'roi', label: 'sortByRoi' }` only when `selectedGameType === 'tournament'`. Render:

```vue
<template v-else-if="selectedSort === 'itm'">
  <div class="text-xl font-mono font-bold text-emerald-400">{{ entry.itmRate.toFixed(1) }}%</div>
  <div class="text-xs text-gray-400">{{ $t('friends.itmCount', { n: entry.itmCount }) }}</div>
</template>
<template v-else-if="selectedSort === 'roi'">
  <div class="text-xl font-mono font-bold" :class="roiClass(entry.roi)">
    {{ entry.roi > 0 ? '+' : '' }}{{ entry.roi.toFixed(1) }}%
  </div>
  <div class="text-xs text-gray-400">{{ $t('friends.rebuyCount', { n: entry.rebuyCount }) }}</div>
</template>
```

Show the minimum-games selector when `['winRate', 'itm', 'roi'].includes(selectedSort)` and reset ITM/ROI to profit when leaving tournament format.

- [ ] **Step 5: Add all locale labels**

Add `sortByItm`, `sortByRoi`, `itmCount`, and `rebuyCount` under `friends` in all four locale files. Use concise labels suitable for the existing compact row.

- [ ] **Step 6: Run focused UI logic and i18n tests**

Run: `npm test -- tests/leaderboardRanking.test.js tests/i18nCompleteness.test.js`

Expected: PASS.

---

### Task 7: Backfill Legacy Rebuy Snapshots

**Files:**
- Create: `functions/src/utils/tournamentHistoryBackfill.js`
- Create: `functions/scripts/backfill_tournament_metrics.js`
- Create: `tests/functions/tournamentHistoryBackfill.test.js`
- Modify: `functions/scripts/backfill_leaderboard_stats.js` only if help text must reference the required ordering.

**Interfaces:**
- Consumes Task 1: `deriveTournamentEntryMetrics`.
- Produces: `buildTournamentMetricPatch(history, game, uid) -> { patch, status }`.
- CLI options: `--dry-run`, `--uid <uid>`, and `--help`.

- [ ] **Step 1: Write failing backfill decision tests**

```js
import { describe, expect, it } from 'vitest';
import { buildTournamentMetricPatch } from '../../functions/src/utils/tournamentHistoryBackfill.js';

it('derives a legacy rebuy snapshot from the source game', () => {
  const result = buildTournamentMetricPatch({
    type: 'tournament', settlement: [{ odId: 'u1', buyIn: 3000, prize: 4000 }],
  }, { baseBuyIn: 1000 }, 'u1');

  expect(result).toEqual({
    status: 'resolved',
    patch: {
      baseBuyIn: 1000,
      settlement: [{ odId: 'u1', buyIn: 3000, prize: 4000, entryCount: 3, rebuyCount: 2 }],
    },
  });
});

it('reports unknown without changing history when the source game is missing', () => {
  expect(buildTournamentMetricPatch({ type: 'tournament', settlement: [] }, null, 'u1'))
    .toEqual({ status: 'unknown', patch: null });
});
```

- [ ] **Step 2: Run backfill test and verify RED**

Run: `npm test -- tests/functions/tournamentHistoryBackfill.test.js`

Expected: FAIL because the backfill utility does not exist.

- [ ] **Step 3: Implement the pure patch builder**

Return `already-complete` when explicit metrics already exist, `resolved` when source data is valid, `unknown` when source data is absent/inconsistent, and `skipped` for non-tournament history. Preserve every settlement row and enrich only the target user's row.

- [ ] **Step 4: Implement an idempotent dry-run-first CLI**

Follow the credential and database initialization pattern in `functions/scripts/backfill_leaderboard_stats.js`. For each `users/{uid}/history_sub/{gameId}` tournament record:

1. skip complete records;
2. load `games/{gameId}`;
3. call `buildTournamentMetricPatch`;
4. print counts for resolved, already complete, unknown, skipped, and failures;
5. write only when `--dry-run` is absent;
6. use batches of at most 400 writes.

Usage must be:

```text
node functions/scripts/backfill_tournament_metrics.js --dry-run
node functions/scripts/backfill_tournament_metrics.js
node functions/scripts/backfill_leaderboard_stats.js
```

- [ ] **Step 5: Run utility tests and CLI help**

Run: `npm test -- tests/functions/tournamentHistoryBackfill.test.js`

Run: `node functions/scripts/backfill_tournament_metrics.js --help`

Expected: tests PASS; help exits without contacting Firestore and documents all options and ordering.

---

### Task 8: Security Rules Regression and Full Verification

**Files:**
- Modify: `tests/rules/firestoreRules.test.js`
- Modify: `firestore.rules` only if a callable-related rule regression is discovered; expected production change is none.
- Modify: `docs/superpowers/specs/2026-07-27-tournament-leaderboard-settlement-design.md` only if implementation reveals a necessary clarification.

**Interfaces:**
- Verifies all preceding tasks as one deployment unit.

- [ ] **Step 1: Add a rules regression test for participant direct settlement**

Keep the existing host settlement success and add an explicit tournament participant case:

```js
it('tournament participants still cannot bypass the callable with direct settlement writes', async () => {
  await assertFails(updateDoc(doc(bobDb(), 'games', 'active-tournament'), {
    status: 'completed',
    settlementSnapshot: [{ odId: BOB, prize: 999999, profit: 999999 }],
  }));
});
```

Seed `active-tournament` with Bob in `players` but Alice as `hostUid`. This proves participant authorization exists only in the callable, not in client write rules.

- [ ] **Step 2: Run Firestore Rules tests**

Run: `npm run test:rules`

Expected: PASS, including host direct settlement compatibility and participant direct-write rejection.

- [ ] **Step 3: Run the complete Vitest suite**

Run: `npm test`

Expected: all tests PASS with no unhandled promise rejections.

- [ ] **Step 4: Run Functions lint and frontend build**

Run: `npm --prefix functions run lint`

Run: `npm run build`

Expected: both commands exit 0; Vite resolves the shared Functions utility import.

- [ ] **Step 5: Review migration without writing production data**

Run: `node functions/scripts/backfill_tournament_metrics.js --dry-run`

Expected: summary reports resolved and unknown legacy records, performs zero writes, and exits 0 when there are no read failures. Do not run the write mode or deploy without explicit user approval.

- [ ] **Step 6: Inspect final scope**

Run: `git status --short`

Run: `git diff --check`

Expected: only files named in this plan are changed, lockfiles are untouched, and there are no whitespace errors.