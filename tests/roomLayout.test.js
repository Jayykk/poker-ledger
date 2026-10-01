import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
const tournamentRoom = read('src/views/TournamentGameView.vue');
const cashRoom = read('src/views/GameView.vue');
const header = read('src/components/game/RoomHeader.vue');
const row = read('src/components/game/TournamentPlayerCard.vue');

describe('tournament room layout', () => {
  it('shows the clock card (tap → full clock, host can start / pause)', () => {
    expect(tournamentRoom).toContain('<RoomClockCard');
    expect(tournamentRoom).toContain('@open="$router.push(`/tournament-clock/${game.tournamentSessionId}`)"');
    expect(tournamentRoom).toContain('@toggle="toggleClock"');
  });

  it('splits players into in-play and eliminated sections', () => {
    expect(tournamentRoom).toContain('v-for="player in activePlayers"');
    expect(tournamentRoom).toContain('v-for="player in eliminatedPlayers"');
  });

  it('eliminate and re-entry are one tap on the row', () => {
    expect(row).toContain("@click=\"$emit('eliminate', player)\"");
    expect(row).toContain("@click=\"$emit('reentry', player)\"");
    expect(row).toContain("reentryBlocked === 'limit'");
  });

  it('share and close-room live in the header; the rest in the bottom bar', () => {
    expect(tournamentRoom).toContain('@copy-id="handleCopyId"');
    expect(tournamentRoom).toContain('@close-room="handleCloseGame"');
    expect(header).toMatch(/v-if="isHost"[\s\S]*close-room/);
    expect(tournamentRoom).toMatch(/<RoomActionBar>[\s\S]*showAddPlayer = true[\s\S]*scrollToLog[\s\S]*showHandRecord = true[\s\S]*showSettlement = true/);
  });

  it('adding players only while entries are open', () => {
    expect(tournamentRoom).toContain('v-if="isHost && reentriesOpen" type="button" class="bar-btn" @click="showAddPlayer = true"');
  });
});

describe('timed cash room', () => {
  it('uses the same clock card with the time to the end', () => {
    expect(cashRoom).toContain('<RoomClockCard');
    expect(cashRoom).toContain("$t('room.endsIn'");
    expect(cashRoom).toContain(':closed="timedBuyInClosed"');
  });
});

describe('row ⋯ menu', () => {
  it('offers rename and remove on players still in', () => {
    expect(row).toContain("@click=\"pick('edit')\"");
    expect(row).toContain("@click=\"pick('remove')\"");
    expect(tournamentRoom).toContain('@remove="handleRemoveFromRow"');
  });

  it('the eliminated header has no re-entry hint text', () => {
    expect(tournamentRoom).not.toContain('eliminatedHint');
  });
});

describe('rename rule and bottom bar spacing', () => {
  const bar = read('src/components/game/RoomActionBar.vue');
  const gameStore = read('src/store/modules/game.js');

  it('only hand-added and guest seats can be renamed', async () => {
    const { canRenamePlayer } = await import('../src/utils/ledgerOps.js');
    expect(canRenamePlayer({ uid: null, name: 'Player' })).toBe(true);
    expect(canRenamePlayer({ uid: 'anon1', isGuest: true })).toBe(true);
    expect(canRenamePlayer({ uid: 'line_123' })).toBe(false);
    expect(row).toContain('v-if="canRename" type="button" @click="pick(\'edit\')"');
    expect(tournamentRoom).toMatch(/const handleEditPlayer = \(player\) => \{\s*if \(!canRenamePlayer\(player\)\) return;/);
  });

  it('seats remember a guest login when they are created', () => {
    const guestFlags = gameStore.match(/\.\.\.\(authStore\.isGuest \? \{ isGuest: true \} : \{\}\)/g) || [];
    expect(guestFlags.length).toBe(3); // host seat, bound seat, new seat
  });

  it('the bottom bar leaves room for the nav\'s raised + button', () => {
    expect(bar).toContain('padding: 0.55rem 1rem calc(0.55rem + 1.75rem);');
  });
});

describe('cash room layout', () => {
  const cashRow = read('src/components/game/PlayerCard.vue');

  it('uses the shared header and bottom bar', () => {
    expect(cashRoom).toContain('<RoomHeader');
    expect(cashRoom).toContain('@close-room="handleCloseGame"');
    expect(cashRoom).toMatch(/<RoomActionBar>[\s\S]*showAddPlayer = true[\s\S]*scrollToLog[\s\S]*showHandRecord = true[\s\S]*showSettlement = true/);
  });

  it('players are rows in one section, biggest winner first', () => {
    expect(cashRoom).toContain('v-for="player in sortedPlayers"');
    expect(cashRow).toContain("@click=\"$emit('add-buy', player)\"");
    expect(cashRow).toContain(':disabled="buyInDisabled"');
    expect(cashRow).toContain("@click=\"$emit('edit', player)\"");
  });

  it('no more English labels on the seat', () => {
    expect(cashRow).not.toContain('Stack:');
    expect(cashRow).not.toContain('Rebuys:');
  });
});

describe('mystery bounty wiring', () => {
  const store = read('src/store/modules/game.js');
  const main = read('src/main.js');
  const clockView = read('src/views/TournamentClockView.vue');

  it('the draw screen has a route and is reachable from the room and the clock', () => {
    expect(main).toContain("path: '/mystery-draw/:gameId'");
    expect(tournamentRoom).toContain('$router.push(`/mystery-draw/${gameId}`)');
    expect(clockView).toContain('$router.push(`/mystery-draw/${session.gameId}`)');
  });

  it('knockouts earn a ticket only once the draw phase is on; undo removes it', () => {
    expect(store).toMatch(/isMysteryBounty\(bounty\) && eliminatorIds\.length[\s\S]*mysteryPhaseActive\(bounty[\s\S]*addTicket\(updatedPlayers, playerId, eliminatorIds\)/);
    expect(store).toContain('removeTicket(updatedPlayers, tx.restore.mysteryTicket)');
    // KO / PKO math never runs for a mystery game
    expect(store).toContain('perEntry > 0 && isKnockoutBounty(gameData.bounty)');
  });

  it('settling waits for every earned draw', () => {
    expect(tournamentRoom).toContain(':disabled="playersStillInPlay.length > 0 || mysteryPending > 0"');
  });
});
