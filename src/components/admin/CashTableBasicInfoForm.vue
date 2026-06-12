<template>
  <section class="card">
    <h2 class="section-title">{{ $t('tournament.basicInfo') }}</h2>
    <div class="space-y-3">
      <div v-if="isPokerGame" class="grid grid-cols-2 gap-3">
        <div>
          <label class="field-label">{{ $t('tournament.smallBlind') }}</label>
          <input
            v-model.number="smallBlind"
            type="number"
            min="0"
            class="field-input"
            :disabled="locked"
          />
        </div>
        <div>
          <label class="field-label">{{ $t('tournament.bigBlind') }}</label>
          <input
            v-model.number="bigBlind"
            type="number"
            min="0"
            class="field-input"
            :disabled="locked"
          />
        </div>
      </div>

      <div v-if="isPokerGame" class="grid grid-cols-2 gap-3">
        <div>
          <label class="field-label">{{ $t('admin.cashEdit.minBuyIn') }}</label>
          <input
            v-model.number="minBuyIn"
            type="number"
            min="0"
            class="field-input"
            :disabled="locked"
          />
        </div>
        <div>
          <label class="field-label">{{ $t('admin.cashEdit.maxBuyIn') }}</label>
          <input
            v-model.number="maxBuyIn"
            type="number"
            min="0"
            class="field-input"
            :disabled="locked"
          />
        </div>
      </div>

      <div v-if="isPokerGame">
        <label class="field-label">{{ $t('lobby.maxPlayers') }}</label>
        <input
          v-model.number="maxPlayers"
          type="number"
          min="2"
          max="20"
          class="field-input"
          disabled
        />
      </div>

      <div v-if="!isPokerGame">
        <label class="field-label">{{ $t('game.title') }}</label>
        <input
          v-model="name"
          type="text"
          class="field-input"
          :placeholder="$t('game.title')"
          :disabled="locked"
        />
      </div>

      <div v-if="!isPokerGame" class="grid grid-cols-2 gap-3">
        <div>
          <label class="field-label">{{ $t('admin.cashEdit.baseBuyIn') }}</label>
          <input
            v-model.number="baseBuyIn"
            type="number"
            min="0"
            class="field-input"
            :disabled="locked"
          />
        </div>
        <div v-if="gameType === 'online'">
          <label class="field-label">{{ $t('lobby.maxPlayers') }}</label>
          <input
            v-model.number="maxPlayers"
            type="number"
            min="2"
            max="20"
            class="field-input"
            :disabled="locked"
          />
        </div>
      </div>

      <div v-if="!isPokerGame && gameType === 'online'" class="grid grid-cols-2 gap-3">
        <div>
          <label class="field-label">{{ $t('tournament.smallBlind') }}</label>
          <input
            v-model.number="smallBlind"
            type="number"
            min="0"
            class="field-input"
            :disabled="locked"
          />
        </div>
        <div>
          <label class="field-label">{{ $t('tournament.bigBlind') }}</label>
          <input
            v-model.number="bigBlind"
            type="number"
            min="0"
            class="field-input"
            :disabled="locked"
          />
        </div>
      </div>

      <div>
        <label class="field-label">{{ $t('admin.cashEdit.notes') }}</label>
        <textarea
          v-model="notes"
          rows="2"
          class="field-input"
          :placeholder="$t('admin.cashEdit.notesPlaceholder')"
          :disabled="locked"
        ></textarea>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  /** Whether the edited document comes from the pokerGames collection */
  isPokerGame: {
    type: Boolean,
    default: false,
  },
  /** game.type for non-poker games ('online' enables maxPlayers/blinds editing) */
  gameType: {
    type: String,
    default: '',
  },
  /** Whether the form fields are locked (archived/locked status) */
  locked: {
    type: Boolean,
    default: false,
  },
  name: {
    type: String,
    default: '',
  },
  baseBuyIn: {
    type: [Number, String],
    default: 0,
  },
  minBuyIn: {
    type: [Number, String],
    default: 0,
  },
  maxBuyIn: {
    type: [Number, String],
    default: 0,
  },
  maxPlayers: {
    type: [Number, String],
    default: 10,
  },
  smallBlind: {
    type: [Number, String],
    default: 1,
  },
  bigBlind: {
    type: [Number, String],
    default: 2,
  },
  notes: {
    type: String,
    default: '',
  },
});

const emit = defineEmits([
  'update:name',
  'update:baseBuyIn',
  'update:minBuyIn',
  'update:maxBuyIn',
  'update:maxPlayers',
  'update:smallBlind',
  'update:bigBlind',
  'update:notes',
]);

function fieldModel(key) {
  return computed({
    get: () => props[key],
    set: (value) => emit(`update:${key}`, value),
  });
}

const name = fieldModel('name');
const baseBuyIn = fieldModel('baseBuyIn');
const minBuyIn = fieldModel('minBuyIn');
const maxBuyIn = fieldModel('maxBuyIn');
const maxPlayers = fieldModel('maxPlayers');
const smallBlind = fieldModel('smallBlind');
const bigBlind = fieldModel('bigBlind');
const notes = fieldModel('notes');
</script>

<style scoped>
.card {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  padding: 1rem;
}
.section-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.75rem;
}
.field-label {
  display: block;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.25rem;
}
.field-input {
  width: 100%;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: white;
  font-size: 0.9rem;
}
.field-input:focus {
  outline: none;
  border-color: #f59e0b;
}
.field-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
