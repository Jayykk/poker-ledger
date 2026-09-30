<template>
  <div>
    <div class="flex items-center justify-end gap-3 mb-2">
      <button type="button" @click="addLevel" class="text-sm text-emerald-400 hover:text-emerald-300">
        <i class="fas fa-plus mr-1"></i>{{ $t('tournament.addLevel') }}
      </button>
      <button type="button" @click="addBreak" class="text-sm text-blue-400 hover:text-blue-300">
        <i class="fas fa-coffee mr-1"></i>{{ $t('tournament.addBreak') }}
      </button>
    </div>

    <div class="blind-grid header">
      <span>#</span>
      <span>{{ $t('tournament.smallBlind') }}</span>
      <span>{{ $t('tournament.bigBlind') }}</span>
      <span>{{ $t('tournament.ante') }}</span>
      <span>{{ $t('tournament.duration') }}</span>
      <span></span>
    </div>

    <div
      v-for="(lvl, idx) in levels"
      :key="idx"
      class="blind-grid"
      :class="{ 'break-row': lvl.isBreak }"
    >
      <span class="text-gray-400 text-sm self-center">{{ lvl.isBreak ? '☕' : lvl.level }}</span>
      <template v-if="lvl.isBreak">
        <span class="break-label text-blue-300 text-sm self-center text-center">{{ $t('tournament.breakTime') }}</span>
      </template>
      <template v-else>
        <input v-model.number="lvl.small" type="number" min="0" class="level-input" />
        <input v-model.number="lvl.big" type="number" min="0" class="level-input" />
        <input v-model.number="lvl.ante" type="number" min="0" class="level-input" />
      </template>
      <div class="flex items-center gap-1">
        <input v-model.number="lvl.duration" type="number" min="1" class="level-input w-14" />
        <span class="text-gray-500 text-xs">min</span>
      </div>
      <button type="button" @click="removeLevel(idx)" class="text-red-400 hover:text-red-300">
        <i class="fas fa-trash-alt text-sm"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
// Blind levels table (盲注結構). Edits the bound array in place.
import { renumberLevels } from '../../utils/tableTemplates.js';

const levels = defineModel('levels', { type: Array, required: true });

function addLevel() {
  const lastPlay = [...levels.value].reverse().find((l) => !l.isBreak);
  levels.value.push({
    level: 0,
    small: lastPlay ? lastPlay.small * 1.5 : 25,
    big: lastPlay ? lastPlay.big * 1.5 : 50,
    ante: lastPlay ? lastPlay.ante : 0,
    duration: lastPlay ? lastPlay.duration : 15,
    isBreak: false,
  });
  renumberLevels(levels.value);
}

function addBreak() {
  levels.value.push({ level: 0, small: 0, big: 0, ante: 0, duration: 10, isBreak: true });
}

function removeLevel(idx) {
  levels.value.splice(idx, 1);
  renumberLevels(levels.value);
}
</script>

<style scoped>
.blind-grid {
  display: grid;
  grid-template-columns: 2rem 1fr 1fr 1fr 5rem 2rem;
  gap: 0.4rem;
  align-items: center;
  padding: 0.3rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.blind-grid.header {
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 0.25rem;
}
.blind-grid.break-row {
  background: rgba(59, 130, 246, 0.08);
  border-radius: 0.375rem;
}
.break-label { grid-column: span 3; }
.level-input {
  width: 100%;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 0.375rem;
  padding: 0.3rem 0.4rem;
  color: white;
  font-size: 0.8rem;
  text-align: center;
}
.level-input:focus { outline: none; border-color: #f59e0b; }
.level-input::-webkit-inner-spin-button,
.level-input::-webkit-outer-spin-button { -webkit-appearance: none; }
</style>
