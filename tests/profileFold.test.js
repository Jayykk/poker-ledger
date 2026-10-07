import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 我的: the long pickers start folded to one row each
const profile = readFileSync(resolve(__dirname, '..', 'src/views/ProfileView.vue'), 'utf-8');

describe('profile folded sections', () => {
  it('主題: one row with the current theme, the list only when opened', () => {
    expect(profile).toContain('<button type="button" class="pv-fold" :aria-expanded="themeOpen" @click="themeOpen = !themeOpen">');
    expect(profile).toContain("<span class=\"pv-fold-now\">{{ $t(`profile.themes.${currentTheme}.name`) }}</span>");
    expect(profile).toContain('<div v-if="themeOpen" class="grid grid-cols-2 gap-2 mt-3">');
    expect(profile).toContain('const themeOpen = ref(false);');
  });

  it('稱號 顯示方式 and 頭像框 fold the same way', () => {
    expect(profile).toContain('const titleOpen = ref(false);');
    expect(profile).toContain('const frameOpen = ref(false);');
  });
});
