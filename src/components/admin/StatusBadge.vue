<template>
  <span
    class="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0"
    :class="badgeClass"
  >
    {{ label }}
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  status: {
    type: String,
    default: '',
  },
});

const badgeClass = computed(() => {
  switch (props.status) {
    case 'waiting':
      return 'bg-blue-600/40 text-blue-200';
    case 'active':
    case 'running':
    case 'playing':
      return 'bg-emerald-600/40 text-emerald-200';
    case 'paused':
      return 'bg-yellow-600/40 text-yellow-200';
    case 'ended':
      return 'bg-slate-600/40 text-slate-300';
    default:
      return 'bg-slate-700/40 text-slate-400';
  }
});

const label = computed(() => {
  switch (props.status) {
    case 'waiting':
      return t('lobby.statusWaiting');
    case 'active':
    case 'running':
    case 'playing':
      return t('lobby.statusPlaying');
    case 'paused':
      return t('tournament.paused');
    case 'ended':
      return t('lobby.statusEnded');
    default:
      return props.status || t('common.unknown');
  }
});
</script>
