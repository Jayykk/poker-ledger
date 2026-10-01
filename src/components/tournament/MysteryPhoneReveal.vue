<template>
  <Transition name="mpr">
    <div v-if="result" class="mpr" @click="close">
      <div class="mpr-card" @click.stop>
        <!-- Projected: don't spoil it — the TV reveals first -->
        <template v-if="watching">
          <div class="mpr-emoji">👀</div>
          <div class="mpr-title">{{ $t('mystery.watchTv') }}</div>
          <div class="mpr-sub">{{ $t('mystery.watchTvHint') }}</div>
          <div class="mpr-bar"><span :style="{ animationDuration: `${delayMs}ms` }"></span></div>
        </template>
        <template v-else>
          <div class="mpr-emoji">🎉</div>
          <div class="mpr-sub">{{ result.names }} {{ $t('mystery.youDrew') }}</div>
          <div class="mpr-amount">${{ formatNumber(result.amount) }}</div>
          <div v-if="result.split" class="mpr-sub">{{ result.split }}</div>
          <button type="button" class="mpr-ok" @click="close">{{ $t('common.confirm') }}</button>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup>
// Phone-side result of a mystery draw. When the draw is shown on the TV stage
// the phone says "watch the TV" until the TV's reveal is over, then shows
// the amount — so nobody at the table sees it early.
import { ref, watch, onUnmounted } from 'vue';
import { formatNumber } from '../../utils/formatters.js';

const props = defineProps({
  // { names, amount, split } or null
  result: { type: Object, default: null },
  // Shown on the TV: hold the amount back until the reveal there is done
  projected: { type: Boolean, default: false },
  // The TV reveal's build-up (MysteryStage: ~6.4 s to the amount)
  delayMs: { type: Number, default: 6500 },
});
const emit = defineEmits(['close']);

const watching = ref(false);
let timer = null;
watch(() => props.result, (r) => {
  clearTimeout(timer);
  watching.value = !!r && props.projected;
  if (watching.value) timer = setTimeout(() => { watching.value = false; }, props.delayMs);
});
onUnmounted(() => clearTimeout(timer));

function close() {
  if (watching.value) return;
  emit('close');
}
</script>

<style scoped>
.mpr { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgb(0 0 0 / 0.72); padding: 1.5rem; }
.mpr-card {
  width: 100%;
  max-width: 22rem;
  text-align: center;
  padding: 1.75rem 1.5rem;
  border-radius: 1.25rem;
  background: rgb(var(--tw-slate-800));
  border: 2px solid rgb(var(--tw-amber-500));
  animation: mpr-pop 0.55s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.mpr-emoji { font-size: 3rem; }
.mpr-title { margin-top: 0.4rem; font-size: 1.4rem; font-weight: 800; color: rgb(var(--tw-white)); }
.mpr-sub { margin-top: 0.3rem; font-size: 0.85rem; color: rgb(var(--tw-slate-300)); }
.mpr-amount { font-family: 'JetBrains Mono', monospace; font-size: 2.8rem; font-weight: 900; color: rgb(var(--tw-amber-400)); }
.mpr-bar { margin-top: 1rem; height: 6px; border-radius: 999px; background: rgb(var(--tw-slate-700)); overflow: hidden; }
.mpr-bar span { display: block; height: 100%; width: 100%; background: rgb(var(--tw-amber-500)); transform-origin: left; animation: mpr-fill linear forwards; }
.mpr-ok { margin-top: 1.2rem; padding: 0.6rem 2rem; border-radius: 999px; font-weight: 700; background: rgb(var(--tw-amber-500)); color: var(--on-accent); }
@keyframes mpr-pop { 0% { transform: scale(0.7); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes mpr-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.mpr-enter-active, .mpr-leave-active { transition: opacity 0.2s; }
.mpr-enter-from, .mpr-leave-to { opacity: 0; }
</style>
