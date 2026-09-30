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
