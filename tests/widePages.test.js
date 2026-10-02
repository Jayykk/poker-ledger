import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
const PAGE = 'pt-8 px-4 pb-nav w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto';

describe('pages widen on tablets / desktops like the rooms', () => {
  for (const f of ['LobbyView', 'ReportView', 'DailyReportView', 'FriendsView', 'ProfileView']) {
    it(`${f}: phone width, 48rem from 768px, 64rem from 1024px`, () => {
      expect(read(`src/views/${f}.vue`)).toContain(`class="${PAGE}`);
    });
  }

  it('lobby: rooms and events in a card grid', () => {
    const lobby = read('src/views/LobbyView.vue');
    expect(lobby.match(/class="grid gap-2 md:grid-cols-2 lg:grid-cols-3"/g)).toHaveLength(2);
  });

  it('friends: list and leaderboard side by side on desktops', () => {
    expect(read('src/views/FriendsView.vue')).toContain('lg:grid lg:grid-cols-2');
  });

  it('mystery draw page: two columns on desktops, phone order kept', () => {
    const v = read('src/views/MysteryDrawView.vue');
    expect(v).toMatch(/<div v-else class="md-cols">\s*<div class="md-col">[\s\S]*?mystery\.waiting[\s\S]*?<div class="md-col">[\s\S]*?mystery\.left[\s\S]*?mystery\.history/);
    // margin: auto alone shrank it in the app's flex column (it was 336px wide)
    expect(v).toContain('.md-page { width: 100%;');
    expect(v).toMatch(/@media \(min-width: 1024px\) \{\s*\.md-page \{ max-width: 64rem; \}\s*\.md-cols \{ display: grid;/);
  });

  it('every page shares one width: no 2xl / 1200px / phone-only containers left', () => {
    const pages = ['BlindStructureSetupView', 'BlindStructuresView', 'SessionHistoryView', 'TableTemplateSetupView', 'TableTemplatesView', 'admin/CashTableEditView', 'admin/TableManagementView', 'admin/TournamentEditView'];
    for (const p of pages) {
      const v = read(`src/views/${p}.vue`);
      expect(v).not.toContain('max-w-2xl');
      expect(v).toContain('max-w-md md:max-w-3xl lg:max-w-5xl mx-auto');
    }
    expect(read('src/App.vue')).toContain('h-16 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto');
    expect(read('src/views/GameLobby.vue')).not.toContain('1200px');
    expect(read('src/views/SessionView.vue')).toContain('@media (min-width: 1024px) { .card { max-width: 64rem; } }');
    expect(read('src/views/SessionSetupView.vue')).toContain('@media (min-width: 1024px) { .setup-card { max-width: 64rem; } }');
  });

  it('live events are no longer phone-width', () => {
    expect(read('src/views/SessionView.vue')).not.toContain('560px');
    expect(read('src/views/SessionSetupView.vue')).not.toMatch(/\.setup-card \{\s*max-width: 640px/);
  });
});
