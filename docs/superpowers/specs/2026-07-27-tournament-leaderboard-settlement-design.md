# Tournament Leaderboard and Settlement Design

## Scope

This change adds ITM and ROI ranking modes to the friends tournament leaderboard and restores normal tournament settlement to authenticated room participants. Negotiated deal settlement remains restricted to the host or an administrator.

## Leaderboard Presentation

When the tournament game type is selected, the ranking options are:

`Profit | Win Rate | Titles | ITM | ROI`

The existing compact leaderboard row is retained.

- ITM mode shows `ITM%` as the primary value and `ITM {count}` as the secondary value.
- ROI mode shows `ROI%` as the primary value and `Rebuy {count}` as the secondary value.
- Positive ROI is green, negative ROI is red, and zero is neutral.
- ITM and ROI use the existing minimum-games selector, defaulting to three games.
- ITM ties are resolved by ITM count, then games played, then profit.
- ROI ties are resolved by profit, then games played.
- All new labels are translated in zh-TW, zh-CN, en, and ja.

The formulas are:

$$
ITM\% = \frac{ITMCount}{TournamentGames} \times 100\%
$$

$$
ROI = \frac{TotalPrize - TotalBuyIn}{TotalBuyIn} \times 100\%
$$

ROI is unavailable when total buy-in is zero rather than being displayed as a fabricated zero percent.

## Settlement Metric Snapshot

The game document already stores the configured buy-in as `baseBuyIn`, and each player stores cumulative buy-in as `players[].buyIn`. That is sufficient to derive entries while the source game exists, but completed games can later be deleted. Leaderboard reads must not depend on joining every history record back to its source game.

For new tournament settlements, the server records immutable metric inputs:

- `baseBuyIn` at the history-record level.
- `buyIn`, `prize`, and `profit` in the player's settlement row, as today.
- `entryCount` and `rebuyCount` in the player's settlement row.

For the fixed tournament buy-in model:

$$
EntryCount = \frac{PlayerTotalBuyIn}{BaseBuyIn}
$$

$$
RebuyCount = \max(0, EntryCount - 1)
$$

The server accepts this derivation only when `baseBuyIn > 0` and total buy-in is an integer multiple of base buy-in. An inconsistent value is recorded as unknown instead of rounded into a misleading count. Settlement corrections regenerate these metrics from the corrected values.

The history projection copies the snapshot values into `users/{uid}/history_sub/{gameId}`. The leaderboard aggregation reads only history records and does not query source games at runtime.

## Existing Data Backfill

Existing history records already contain the values needed for ROI, so ROI can be rebuilt without source games.

Rebuy backfill follows this order:

1. Use an existing explicit `rebuyCount` when present.
2. Otherwise load `games/{gameId}.baseBuyIn` and derive the count from the user's settlement row.
3. If the source game no longer exists or values are inconsistent, leave rebuy unknown for that game.

Unknown rebuy records still contribute to games, ITM, ROI, profit, and prize totals. They do not contribute an estimated rebuy count. The backfill reports the number of records that could not be resolved.

## Aggregated Statistics

The tournament bucket in `leaderboardStats` becomes:

```js
{
  games,
  wins,
  profit,
  itm,
  champion,
  runnerUp,
  totalBuyIn,
  totalPrize,
  rebuyCount,
  rebuyKnownGames
}
```

`rebuyKnownGames` makes partial legacy coverage observable. The stats source version is incremented so stale documents can be identified and rebuilt.

## Normal Tournament Settlement Authorization

Normal tournament settlement moves from a direct client Firestore update to an authenticated callable Cloud Function.

The function:

1. Requires authentication and loads the latest game document.
2. Allows the request when the caller UID exists in `game.players[].uid` or the caller is an administrator.
3. Rejects users who only possess the room link but are not participants.
4. Verifies that the game is an active tournament and is in a valid normal-settlement state.
5. Reads payout ratios and all financial inputs from server-loaded documents rather than trusting client-calculated settlement data.
6. Calculates placement, prize, profit, entry, and rebuy snapshots on the server.
7. Completes the game in a transaction and creates the history projection request token.
8. Treats a repeated request for the same completed game as idempotent and does not create duplicate history.

Firestore Rules continue to reject direct participant writes to lifecycle and settlement fields. The callable function uses Admin SDK writes after authorization and validation.

## Negotiated Deal Authorization

ICM, Chip Chop, and custom negotiated settlements remain host/admin-only because they accept player stack and allocation decisions that change payouts.

- The deal action is shown only to the host in the tournament UI.
- The server independently verifies host/admin authorization.
- A non-host cannot bypass the UI by calling the endpoint directly.

## Client Behavior

- A room participant can see and run normal settlement.
- A non-participant does not see the normal settlement action.
- A non-host participant does not see negotiated deal settlement.
- Authorization, invalid-state, and network failures produce explicit localized notifications instead of appearing unresponsive.
- Successful settlement keeps the existing history-sync and navigation flow.

## Tests

### Aggregation

- ITM count and percentage across periods.
- ROI from total prize and total buy-in, including negative and zero-buy-in cases.
- Rebuy derivation for zero, one, and multiple rebuys.
- Inconsistent and missing base buy-in remain unknown rather than guessed.
- ITM and ROI ordering and minimum-games filtering.
- Backfilled and newly projected records produce the same aggregate shape.

### Authorization and Settlement

- A listed participant can perform normal tournament settlement.
- A user with only the room ID cannot settle.
- An administrator can settle.
- A non-host participant cannot perform negotiated settlement.
- The host and administrator can perform negotiated settlement.
- Concurrent or repeated normal-settlement requests are idempotent.
- Firestore Rules still reject direct writes to status and settlement fields by non-host clients.
- The generated history contains base buy-in, entry count, and rebuy count.

## Deployment and Migration

Deploy Cloud Functions and Firestore Rules together, then run the history metric backfill and rebuild `leaderboardStats`. The backfill supports dry-run reporting before writes and is safe to rerun.