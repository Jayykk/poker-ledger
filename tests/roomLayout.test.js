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

  it('the bottom bar sits at the bottom (no app nav in rooms)', () => {
    expect(bar).toContain('bottom: 0;');
    expect(bar).toMatch(/padding: [^;]*calc\([^;]*env\(safe-area-inset-bottom, 0px\)\);/);
  });

  it('every bar action is a labeled tab (座位 / 抽獎 are not bare emoji)', () => {
    expect(bar).toMatch(/\.bar-btn\) \{[^}]*flex-direction: column;/);
    for (const room of [cashRoom, tournamentRoom]) {
      expect(room).toContain(`<i class="fas fa-chair"></i>{{ $t('seats.title') }}`);
      expect(room).not.toContain('>🎴</button>');
    }
    expect(tournamentRoom).toContain(`<i class="fas fa-gift"></i>{{ $t('mystery.open') }}`);
    expect(tournamentRoom).toContain('<span v-if="mysteryPending > 0" class="bar-badge">{{ mysteryPending }}</span>');
  });

  it('the header goes back to the lobby, and rooms hide the app nav', () => {
    const header = read('src/components/game/RoomHeader.vue');
    expect(header).toContain(`@click="$router.push('/lobby')"`);
    expect(header).toContain("$t('room.backToLobby')");
    const app = read('src/App.vue');
    expect(app).toMatch(/hideBottomNav[\s\S]*?\(game\|tournament-game\)/);
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
    // on the clock, 🎁 opens the TV draw stage
    expect(clockView).toContain('@click="setMysteryStage(true)"');
    expect(clockView).toContain('<MysteryStage');
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

describe('anyone in the room can record knockouts and re-entries', () => {
  const store = read('src/store/modules/game.js');
  const clockComposable = read('src/composables/useTournamentClock.js');

  it('the clock is only written by those the session rules allow', () => {
    expect(store).toContain('sessionData.hostUid === authStore.user?.uid || sessionData.dealerModeEnabled === true');
    expect(store).toContain('if (canWriteSession(sessionData)) transaction.update(sessionRef, sessionUpdates);');
    expect((store.match(/canWriteSession\(sessionSnap\.data\(\)\)/g) || []).length).toBe(2); // undo knockout / re-entry
    expect(store).toContain('if (sessionRef && mayWriteSession) {');
  });

  it("the host's device mirrors re-entries and the end into the clock", () => {
    expect(clockComposable).toContain("extra['state.reentries'] = reentriesNow");
    expect(clockComposable).toContain("'state.endedBySync': true");
  });

  it('the room content lines up with the header and bottom bar', () => {
    expect(tournamentRoom).toContain('class="pt-16 px-4 pb-28 w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto"');
    expect(cashRoom).toContain('class="pt-16 px-4 pb-28 w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto"');
  });

  it('wider screens: players in a grid; header and bar follow the width', () => {
    expect(tournamentRoom.match(/<div class="room-grid">/g)).toHaveLength(2);
    expect(cashRoom.match(/<div class="room-grid">/g)).toHaveLength(1);
    const css = read('src/styles/main.css');
    expect(css).toMatch(/@media \(min-width: 768px\) \{\s*\.room-grid \{\s*display: grid;\s*grid-template-columns: repeat\(2/);
    expect(css).toMatch(/@media \(min-width: 1024px\) \{\s*\.room-grid \{ grid-template-columns: repeat\(3/);
    for (const f of ['src/components/game/RoomHeader.vue', 'src/components/game/RoomActionBar.vue']) {
      expect(read(f)).toMatch(/@media \(min-width: 1024px\) \{ \.room-(header|action-bar) \{ max-width: 64rem; \} \}/);
    }
  });
});

describe('elimination log credits the knockout, not whoever tapped 淘汰', () => {
  const log = read('src/components/game/TransactionLog.vue');
  const zhTW = JSON.parse(read('src/i18n/locales/zh-TW.json'));

  it('KO rows name the hunter; the tapper only "logged" it', () => {
    expect(log).toMatch(/transaction\.knockedOutBy', \{ name: tx\.targetName, by: tx\.restore\.bounty\.awards/);
    expect(log).toContain("$t('transaction.recordedBy', { name: tx.actionName })");
    expect(log).not.toContain('eliminatedPlayer');
    expect(zhTW.transaction.knockedOutBy).toBe('{name} 被 {by} 擊殺');
    expect(zhTW.transaction.playerOut).toBe('{name} 出局');
  });
});
