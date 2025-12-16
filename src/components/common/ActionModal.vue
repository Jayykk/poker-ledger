<template>
  <BaseModal v-model="isOpen" :title="$t('action.title')">
    <div class="space-y-3">
      <!-- Live Track Option -->
      <div
        @click="handleLiveTrack"
        class="action-option bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 rounded-lg p-4 cursor-pointer transition-all active:scale-98 flex items-start gap-4"
      >
        <div class="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-2xl flex-shrink-0">
          <i class="fas fa-clipboard-list"></i>
        </div>
        <div class="flex-1">
          <h4 class="text-white font-bold text-lg mb-1">📝 {{ $t('action.liveTrack') }}</h4>
          <p class="text-gray-400 text-sm">{{ $t('action.liveTrackDesc') }}</p>
        </div>
      </div>

      <!-- Create Online Room Option -->
      <div
        @click="handleCreateOnline"
        class="action-option bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 rounded-lg p-4 cursor-pointer transition-all active:scale-98 flex items-start gap-4"
      >
        <div class="w-12 h-12 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-2xl flex-shrink-0">
          <i class="fas fa-plus-circle"></i>
        </div>
        <div class="flex-1">
          <h4 class="text-white font-bold text-lg mb-1">🎮 {{ $t('action.createOnline') }}</h4>
          <p class="text-gray-400 text-sm">{{ $t('action.createOnlineDesc') }}</p>
        </div>
      </div>

      <!-- Join Room Option -->
      <div
        @click="handleJoinOnline"
        class="action-option bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 rounded-lg p-4 cursor-pointer transition-all active:scale-98 flex items-start gap-4"
      >
        <div class="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl flex-shrink-0">
          <i class="fas fa-sign-in-alt"></i>
        </div>
        <div class="flex-1">
          <h4 class="text-white font-bold text-lg mb-1">🔍 {{ $t('action.joinOnline') }}</h4>
          <p class="text-gray-400 text-sm">{{ $t('action.joinOnlineDesc') }}</p>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import BaseModal from './BaseModal.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'create-online', 'join-online']);

const router = useRouter();

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const handleLiveTrack = () => {
  isOpen.value = false;
  router.push('/game');
};

const handleCreateOnline = () => {
  isOpen.value = false;
  emit('create-online');
};

const handleJoinOnline = () => {
  isOpen.value = false;
  emit('join-online');
};
</script>

<style scoped>
.action-option {
  transition: transform 0.1s ease;
}

.active\:scale-98:active {
  transform: scale(0.98);
}
</style>
