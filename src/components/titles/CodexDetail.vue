<template>
  <BaseModal :model-value="!!item" layer="z-[10010]" @update:model-value="(open) => { if (!open) $emit('close'); }">
    <template #header>
      <span v-if="view" class="cd-head">{{ view.heading }}</span>
    </template>

    <!-- ── A title family ── -->
    <div v-if="view?.kind === 'title'" class="cd" data-testid="codex-title">
      <div class="flex items-center justify-between gap-2 min-w-0">
        <TitleBadge v-if="view.tier" :family-id="view.id" :tier="view.tier" :name-set="ctx.nameSet" />
        <span v-else class="cd-locked"><i class="fas fa-lock mr-1"></i>{{ view.secret ? $t('titles.hiddenName') : $t('titles.locked') }}</span>
        <span v-if="view.tier" class="cd-muted">{{ $t(`titles.rarity.${titleRarity(view.tier)}`) }}</span>
      </div>
      <p v-if="view.secret" class="cd-text italic">🔮 {{ $t(view.hintKey) }}</p>
      <template v-else>
        <p class="cd-text">{{ $t(view.descKey) }}</p>
        <p class="cd-progress" data-testid="codex-title-progress">
          <template v-if="view.next">
            {{ $t('titles.codexDetail.nowValue', { value: ctx.formatValue(view.id, view.value) }) }} ·
            {{ $t('titles.codexDetail.toNext', { name: ctx.stepName(view.id, view.next.tier), value: ctx.formatValue(view.id, view.next.threshold - view.value) }) }}
          </template>
          <template v-else>{{ $t('titles.maxed') }}</template>
        </p>

        <div class="cd-section">
          <span>{{ $t('titles.codexDetail.steps') }}</span>
          <span class="cd-legend">
            <span v-if="ctx.siteStats"><i class="fas fa-globe" aria-hidden="true"></i> {{ $t('titles.codexDetail.site') }}</span>
            <span><i class="fas fa-user-group" aria-hidden="true"></i> {{ $t('titles.codexDetail.circle') }}</span>
          </span>
        </div>
        <ol class="cd-steps" data-testid="codex-steps">
          <li
            v-for="step in view.steps"
            :key="step.tier"
            class="cd-step"
            :class="[titleRarity(step.tier), { reached: step.tier <= view.tier, current: step.tier === view.tier }]"
          >
            <span class="cd-step-roman">{{ roman(step.tier) }}</span>
            <span class="cd-step-name">{{ ctx.stepName(view.id, step.tier) }}</span>
            <span class="cd-step-value">{{ ctx.formatValue(view.id, step.threshold) }}</span>
            <span v-if="ctx.siteStats" class="cd-step-count" data-testid="step-site">{{ step.site }}</span>
            <span class="cd-step-count" data-testid="step-circle">{{ step.circle }}</span>
          </li>
        </ol>
      </template>

      <!-- The themed frame this family unlocks -->
      <button v-if="view.frame" type="button" class="cd-link-card" data-testid="codex-title-frame" @click="$emit('open', 'frame', view.frame.id)">
        <PlayerAvatar size="md" :src="ctx.avatar" :name="ctx.name" :frame="view.frame.id" :still="!view.frame.earned" />
        <span class="min-w-0 flex-1 text-left">
          <span class="cd-link-title">{{ $t('titles.codexDetail.unlocksFrame', { n: view.frame.minTier }) }}</span>
          <span class="cd-link-sub">{{ $t(`titles.frames.${view.frame.id}`) }} · {{ view.frame.earned ? $t('titles.codexDetail.earned') : $t('titles.codexDetail.notEarned') }}</span>
        </span>
        <i class="fas fa-chevron-right cd-muted" aria-hidden="true"></i>
      </button>
    </div>

    <!-- ── A frame ── -->
    <div v-else-if="view?.kind === 'frame'" class="cd" data-testid="codex-frame">
      <div class="flex items-center gap-3 min-w-0">
        <PlayerAvatar size="lg" :src="ctx.avatar" :name="ctx.name" :frame="view.id" />
        <div class="min-w-0">
          <div class="cd-name">{{ $t(`titles.frames.${view.id}`) }}</div>
          <div class="cd-muted">{{ $t(`titles.codexDetail.kind.${view.status.kind}`) }}</div>
          <span class="cd-chip" :class="view.chip" data-testid="codex-frame-status">{{ $t(`titles.codexDetail.${view.chip}`) }}</span>
        </div>
      </div>

      <div class="cd-section"><span>{{ $t('titles.codexDetail.howTo') }}</span></div>
      <p class="cd-text" data-testid="codex-frame-how">{{ view.how }}</p>
      <p v-if="view.hint" class="cd-text italic">🔮 {{ view.hint }}</p>

      <div class="cd-section"><span>{{ $t('titles.codexDetail.progress') }}</span></div>
      <template v-if="view.status.progress">
        <div class="cd-bar"><div class="cd-fill" :style="{ width: `${view.ratio}%` }"></div></div>
        <p class="cd-text" data-testid="codex-frame-progress">{{ view.progressText }}</p>
      </template>
      <p v-for="line in view.lines" :key="line" class="cd-text" data-testid="codex-frame-line">{{ line }}</p>

      <p class="cd-counts" data-testid="codex-frame-counts">
        <span v-if="ctx.siteStats"><i class="fas fa-globe" aria-hidden="true"></i> {{ $t('titles.codexDetail.siteCount', { n: view.site, total: ctx.siteStats.players || 0 }) }}</span>
        <span><i class="fas fa-user-group" aria-hidden="true"></i> {{ $t('titles.codexDetail.circleCount', { n: view.circle, total: ctx.circleDocs.length }) }}</span>
      </p>

      <button v-if="view.family" type="button" class="cd-link" @click="$emit('open', 'title', view.family)">
        {{ $t('titles.codexDetail.seeTitle') }} <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
      <button v-if="view.crown" type="button" class="cd-link" @click="$emit('open', 'crown', view.crown)">
        {{ $t('titles.codexDetail.seeCrown') }} <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
      <p class="cd-muted mt-2">{{ view.wearHint }}</p>
    </div>

    <!-- ── A 王座 ── -->
    <div v-else-if="view?.kind === 'crown'" class="cd" data-testid="codex-crown">
      <TitleBadge :family-id="view.id" :tier="CROWN_TIER" />
      <p class="cd-text">{{ $t(`titles.families.${view.id}.desc`) }}</p>
      <p class="cd-text">{{ $t('titles.codexDetail.crownRule') }}</p>

      <div class="cd-section"><span>{{ $t('titles.codexDetail.reigning', { month: monthLabel(view.prevMonth) }) }}</span></div>
      <p class="cd-text" data-testid="codex-crown-reigning">{{ view.reigning.length ? view.reigning.map(ctx.memberName).join(' · ') : $t('titles.throne.vacant') }}</p>

      <div class="cd-section"><span>{{ $t('titles.codexDetail.racing') }}</span></div>
      <p class="cd-text" data-testid="codex-crown-race">{{ view.race }}</p>

      <div class="cd-section"><span>{{ $t('titles.codexDetail.myCrown') }}</span></div>
      <p class="cd-text" data-testid="codex-crown-mine">{{ view.mine }}</p>

      <button type="button" class="cd-link-card" @click="$emit('open', 'frame', view.frame)">
        <PlayerAvatar size="md" :src="ctx.avatar" :name="ctx.name" :frame="view.frame" :still="!view.frameEarned" />
        <span class="min-w-0 flex-1 text-left">
          <span class="cd-link-title">{{ $t('titles.codexDetail.kind.crown') }}</span>
          <span class="cd-link-sub">{{ $t(`titles.frames.${view.frame}`) }}</span>
        </span>
        <i class="fas fa-chevron-right cd-muted" aria-hidden="true"></i>
      </button>
      <p v-if="ctx.siteStats" class="cd-counts">
        <span><i class="fas fa-globe" aria-hidden="true"></i> {{ $t('titles.codexDetail.crownSiteCount', { n: view.site }) }}</span>
      </p>
    </div>

    <template v-if="view?.kind === 'frame'" #footer>
      <button type="button" class="cd-go" data-testid="codex-go-profile" @click="$emit('go-profile')">
        {{ $t('titles.codexDetail.goProfile') }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
// 稱號圖鑑 detail: a title family (its ten steps, how many hold each, the
// themed frame it unlocks), a 頭像框 (how to get it, progress, when it was
// earned, how many have it) or a 王座 (who wears it this month, this month's
// race, my wins). Everything about the player comes in `ctx` from TitlesView.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../common/BaseModal.vue';
import TitleBadge from '../common/TitleBadge.vue';
import PlayerAvatar from '../common/PlayerAvatar.vue';
import {
  CROWN_FRAMES, CROWN_MIN_PALS, CROWN_TIER, THEME_FRAMES, getCrownFrame, getThemeFrame, getTitleFamily,
  nextTierProgress,
  previousMonthKey, titleName, titleRarity,
} from '../../utils/titles.js';
import { frameCount, frameStatus, monthLabel, stepCounts } from '../../utils/codex.js';
import { formatShortDate } from '../../utils/formatters.js';

const props = defineProps({
  // { kind: 'title' | 'frame' | 'crown', id } or null (closed)
  item: { type: Object, default: null },
  // From TitlesView: myDoc, allStats, siteStats, circleDocs, circleMembers,
  // crownMonth, nameSet, myFrame, avatar, name, throneRow(id), formatValue,
  // formatCrown, stepName, memberName
  ctx: { type: Object, required: true },
});
defineEmits(['close', 'open', 'go-profile']);

const { t, te, locale } = useI18n();

const ROMAN = ['—', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'];
const roman = (tier) => ROMAN[tier] || String(tier);
const join = (list) => list.join(t('titles.codexDetail.listSep'));

const view = computed(() => {
  const { kind, id } = props.item || {};
  if (kind === 'title') return titleView(id);
  if (kind === 'frame') return frameView(id);
  if (kind === 'crown') return crownView(id);
  return null;
});

function titleView(id) {
  const fam = getTitleFamily(id);
  if (!fam || fam.group === 'crown') return null;
  const { ctx } = props;
  const held = Number(ctx.myDoc?.unlocked?.[id]?.tier) || 0;
  const progress = nextTierProgress(fam, ctx.allStats, held);
  const tier = progress.tier;
  const site = ctx.siteStats?.titles?.[id] || [];
  const circle = stepCounts(ctx.circleDocs, id);
  const theme = framesOfFamily(id);
  return {
    kind: 'title',
    id,
    heading: t('titles.codex'),
    tier,
    secret: fam.hidden && !tier,
    hintKey: fam.hintKey,
    descKey: fam.descKey,
    value: progress.value,
    next: progress.next,
    steps: fam.tiers.map((step) => ({ ...step, site: site[step.tier - 1] || 0, circle: circle[step.tier - 1] })),
    frame: theme ? { ...theme, earned: frameStatus(theme.id, ctx.myDoc, ctx.crownMonth).earned } : null,
  };
}

function framesOfFamily(familyId) {
  return THEME_FRAMES.find((f) => f.family === familyId) || null;
}

function dateOf(at) {
  return formatShortDate(at, locale.value);
}

function frameView(id) {
  const { ctx } = props;
  const status = frameStatus(id, ctx.myDoc, ctx.crownMonth);
  if (!status) return null;
  const worn = ctx.myFrame === id;
  const view = {
    kind: 'frame',
    id,
    heading: t('titles.codexDetail.framesTitle'),
    status,
    chip: worn ? 'worn' : status.earned ? 'earned' : 'notEarned',
    lines: [],
    site: ctx.siteStats?.frames?.[id] || 0,
    circle: frameCount(ctx.circleDocs, id, ctx.crownMonth),
    ratio: status.progress ? Math.min(100, Math.round((status.progress.value / status.progress.goal) * 100)) : 0,
    wearHint: status.kind === 'tier' ? t('titles.codexDetail.wearHintTier') : t('titles.codexDetail.wearHintSpecial'),
  };
  if (status.kind === 'tier') {
    const { value, goal } = status.progress;
    view.how = t('titles.codexDetail.howTier', { min: goal });
    view.progressText = value >= goal
      ? t('titles.codexDetail.progTierDone', { n: value, min: goal })
      : t('titles.codexDetail.progTier', { n: value, min: goal, left: goal - value });
  } else if (status.kind === 'theme') {
    const theme = getThemeFrame(id);
    const fam = getTitleFamily(theme.family);
    const secret = !!fam?.hidden && !(status.progress.value > 0);
    const step = fam?.tiers.find((s) => s.tier === theme.minTier);
    view.family = secret ? null : theme.family;
    if (secret) {
      view.how = t('titles.codexDetail.howThemeHidden', { n: theme.minTier });
      view.hint = fam.hintKey ? t(fam.hintKey) : '';
      view.progressText = t('titles.codexDetail.progThemeHidden');
    } else {
      view.how = t('titles.codexDetail.howTheme', {
        desc: t(fam.descKey),
        value: ctx.formatValue(theme.family, step?.threshold),
        n: theme.minTier,
        name: titleName({ t, te }, theme.family, theme.minTier, ctx.nameSet),
      });
      view.progressText = t('titles.codexDetail.progTheme', {
        n: status.progress.value, goal: status.progress.goal,
      });
    }
  } else {
    const { crown } = getCrownFrame(id);
    view.crown = crown;
    view.how = t('titles.codexDetail.howCrown', {
      name: titleName({ t, te }, crown, CROWN_TIER),
      desc: t(`titles.families.${crown}.desc`),
    });
    if (status.wornFrom) {
      view.lines.push(t('titles.codexDetail.crownWearing', { month: monthLabel(ctx.crownMonth), won: monthLabel(status.wornFrom) }));
    }
    view.lines.push(status.wonMonths.length
      ? t('titles.codexDetail.crownWon', { months: join(status.wonMonths.map(monthLabel)), n: status.wonMonths.length })
      : t('titles.codexDetail.crownNever'));
    view.lines.push(raceLine(crown));
  }
  if (status.kind !== 'crown' && status.earned) {
    view.lines.push(status.at
      ? t('titles.codexDetail.earnedAt', { date: dateOf(status.at) })
      : t('titles.codexDetail.earnedAtUnknown'));
  }
  return view;
}

// This month's race for a crown, from where I stand
function raceLine(crownId) {
  const row = props.ctx.throneRow(crownId);
  if (!row) return t('titles.codexDetail.raceNeedPals', { n: CROWN_MIN_PALS });
  if (row.mine) return t('titles.codexDetail.raceMine');
  if (row.holders.length) return t('titles.codexDetail.raceLeader', { names: join(row.holders.map(props.ctx.memberName)) });
  return t('titles.codexDetail.raceNone');
}

function crownView(id) {
  const { ctx } = props;
  const frame = CROWN_FRAMES.find((f) => f.crown === id);
  if (!frame) return null;
  const status = frameStatus(frame.id, ctx.myDoc, ctx.crownMonth);
  return {
    kind: 'crown',
    id,
    heading: t('titles.throne.title'),
    prevMonth: previousMonthKey(ctx.crownMonth),
    reigning: ctx.crownWearers(id),
    race: raceLine(id),
    mine: status.wonMonths.length
      ? t('titles.codexDetail.crownWon', { months: join(status.wonMonths.map(monthLabel)), n: status.wonMonths.length })
      : t('titles.codexDetail.crownNever'),
    frame: frame.id,
    frameEarned: status.earned,
    site: ctx.siteStats?.crowns?.[id] || 0,
  };
}
</script>

<style scoped>
.cd { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
.cd-head { font-size: 0.85rem; }
.cd-name { font-size: 1rem; font-weight: 700; color: rgb(var(--tw-white)); }
.cd-muted { font-size: 0.7rem; color: rgb(var(--tw-slate-400)); }
.cd-locked { font-size: 0.75rem; font-weight: 700; color: rgb(var(--tw-slate-400)); }
.cd-text { font-size: 0.8rem; line-height: 1.45; color: rgb(var(--tw-slate-300)); overflow-wrap: anywhere; }
.cd-progress { font-size: 0.75rem; color: rgb(var(--tw-amber-400)); }
.cd-section {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: rgb(var(--tw-slate-400));
}
.cd-legend { display: flex; gap: 0.6rem; font-weight: 400; }
.cd-chip {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  border: 1px solid rgb(var(--tw-slate-600));
  color: rgb(var(--tw-slate-300));
}
.cd-chip.worn { border-color: rgb(var(--tw-amber-500)); color: rgb(var(--tw-amber-400)); }
.cd-chip.earned { border-color: rgb(var(--tw-emerald-500)); color: rgb(var(--tw-emerald-400)); }
.cd-bar { height: 0.4rem; border-radius: 999px; background: rgb(var(--tw-slate-700)); overflow: hidden; }
.cd-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #f59e0b, #fde047); }
.cd-counts { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.4rem; font-size: 0.72rem; color: rgb(var(--tw-slate-300)); }
.cd-steps { display: flex; flex-direction: column; gap: 0.15rem; }
/* One row per step: roman · name · threshold · counts; the name truncates */
.cd-step {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.15rem 0.4rem;
  border-radius: 0.4rem;
  font-size: 0.7rem;
  color: rgb(var(--tw-slate-400));
}
.cd-step-roman { flex-shrink: 0; width: 1.1rem; text-align: center; }
.cd-step-name { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cd-step-value, .cd-step-count { flex-shrink: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.cd-step-count { min-width: 1.6rem; text-align: right; color: rgb(var(--tw-slate-500)); }
.cd-step.current { background: rgb(var(--tw-slate-700) / 0.6); }
.cd-step.reached { font-weight: 700; }
.cd-step.reached.common { color: #cbd5e1; }
.cd-step.reached.rare { color: #93c5fd; }
.cd-step.reached.epic { color: #d8b4fe; }
.cd-step.reached.legendary { color: #fde68a; }
.cd-step.reached.mythic { color: #c4b5fd; }
:root[data-mode="light"] .cd-step.reached.common { color: #475569; }
:root[data-mode="light"] .cd-step.reached.rare { color: #1d4ed8; }
:root[data-mode="light"] .cd-step.reached.epic { color: #7e22ce; }
:root[data-mode="light"] .cd-step.reached.legendary { color: #92400e; }
:root[data-mode="light"] .cd-step.reached.mythic { color: #6d28d9; }
.cd-link-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.6rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.7rem;
  border: 1px solid rgb(var(--tw-slate-700));
  background: rgb(var(--tw-slate-900) / 0.4);
  min-width: 0;
}
.cd-link-title { display: block; font-size: 0.75rem; font-weight: 700; color: rgb(var(--tw-white)); }
.cd-link-sub { display: block; font-size: 0.7rem; color: rgb(var(--tw-slate-400)); }
.cd-link { align-self: flex-start; margin-top: 0.4rem; font-size: 0.75rem; color: rgb(var(--tw-amber-400)); }
.cd-go {
  width: 100%;
  padding: 0.55rem;
  border-radius: 0.6rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: rgb(var(--tw-white));
  background: rgb(var(--tw-amber-600));
}
</style>
