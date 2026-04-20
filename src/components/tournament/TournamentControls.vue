<template>
  <div class="tournament-controls-overlay" @click.self="$emit('close')">
    <div class="controls-panel">
      <div class="panel-header">
        <h3 class="text-lg font-bold text-white">{{ $t('tournament.controls') }}</h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Clock Controls -->
      <div class="control-section">
        <h4 class="section-title">{{ $t('tournament.clockControl') }}</h4>
        <div class="flex gap-2">
          <button
            v-if="status !== 'running'"
            @click="$emit('start')"
            class="ctrl-btn bg-emerald-600 hover:bg-emerald-500"
            :disabled="status === 'ended'"
          >
            <i class="fas fa-play mr-1"></i>{{ $t('tournament.start') }}
          </button>
          <button
            v-else
            @click="$emit('pause')"
            class="ctrl-btn bg-amber-600 hover:bg-amber-500"
          >
            <i class="fas fa-pause mr-1"></i>{{ $t('tournament.pause') }}
          </button>
          <button
            @click="$emit('previous')"
            class="ctrl-btn bg-slate-600 hover:bg-slate-500"
            :disabled="currentLevelIndex <= 0"
          >
            <i class="fas fa-step-backward mr-1"></i>{{ $t('tournament.prevLevel') }}
          </button>
          <button
            @click="$emit('advance')"
            class="ctrl-btn bg-slate-600 hover:bg-slate-500"
            :disabled="currentLevelIndex >= totalLevels - 1"
          >
            {{ $t('tournament.nextLevel') }}<i class="fas fa-step-forward ml-1"></i>
          </button>
        </div>
      </div>

      <!-- Player Management -->
      <div class="control-section">
        <h4 class="section-title">{{ $t('tournament.playerManagement') }}</h4>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-gray-400 text-xs">{{ $t('tournament.registered') }}</label>
            <div class="flex items-center gap-2 mt-1">
              <button
                @click="adjustPlayers('registered', -1)"
                class="adj-btn"
                :disabled="localRegistered <= 0"
              >-</button>
              <input
                v-model.number="localRegistered"
                type="number"
                min="0"
                class="num-input"
                @change="emitPlayers"
              />
              <button @click="adjustPlayers('registered', 1)" class="adj-btn">+</button>
            </div>
          </div>
          <div>
            <label class="text-gray-400 text-xs">{{ $t('tournament.remaining') }}</label>
            <div class="flex items-center gap-2 mt-1">
              <button
                @click="adjustPlayers('remaining', -1)"
                class="adj-btn"
                :disabled="localRemaining <= 0"
              >-</button>
              <input
                v-model.number="localRemaining"
                type="number"
                min="0"
                class="num-input"
                @change="emitPlayers"
              />
              <button @click="adjustPlayers('remaining', 1)" class="adj-btn">+</button>
            </div>
          </div>
        </div>
        <button
          @click="$emit('add-reentry')"
          class="ctrl-btn bg-blue-600 hover:bg-blue-500 mt-3 w-full"
        >
          <i class="fas fa-redo mr-1"></i>{{ $t('tournament.addReentry') }}
        </button>
      </div>

      <!-- End Tournament -->
      <div class="control-section">
        <button
          @click="confirmEnd"
          class="ctrl-btn bg-red-600 hover:bg-red-500 w-full"
        >
          <i class="fas fa-flag-checkered mr-1"></i>{{ $t('tournament.endTournament') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from '../../composables/useConfirm.js';

const { t } = useI18n();
const { confirm } = useConfirm();

const props = defineProps({
  status: { type: String, default: 'waiting' },
  playersRegistered: { type: Number, default: 0 },
  playersRemaining: { type: Number, default: 0 },
  reentries: { type: Number, default: 0 },
  currentLevelIndex: { type: Number, default: 0 },
  totalLevels: { type: Number, default: 0 },
});

const emit = defineEmits([
  'start', 'pause', 'advance', 'previous',
  'update-players', 'add-reentry', 'end', 'close',
]);

const localRegistered = ref(props.playersRegistered);
const localRemaining = ref(props.playersRemaining);

watch(() => props.playersRegistered, (v) => { localRegistered.value = v; });
watch(() => props.playersRemaining, (v) => { localRemaining.value = v; });

function adjustPlayers(field, delta) {
  if (field === 'registered') {
    localRegistered.value = Math.max(0, localRegistered.value + delta);
  } else {
    localRemaining.value = Math.max(0, localRemaining.value + delta);
  }
  emitPlayers();
}

function emitPlayers() {
  emit('update-players', {
    registered: localRegistered.value,
    remaining: localRemaining.value,
  });
}

async function confirmEnd() {
  const ok = await confirm({
    message: t('tournament.confirmEnd'),
    type: 'warning',
  });
  if (ok) emit('end');
}
</script>

<style scoped>
.tournament-controls-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.controls-panel {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
  max-width: 420px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.control-section {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.control-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.section-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.adj-btn {
  width: 32px;
  height: 32px;
  border-radius: 0.375rem;
  background: #475569;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.adj-btn:hover {
  background: #64748b;
}

.adj-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.num-input {
  width: 60px;
  text-align: center;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 0.375rem;
  color: white;
  font-size: 1rem;
  padding: 0.25rem;
}

.num-input::-webkit-inner-spin-button,
.num-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}
</style>
