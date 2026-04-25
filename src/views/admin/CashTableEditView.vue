<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="handleBack" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">{{ $t('admin.cashEdit.title') }}</h1>
        <button
          @click="handleSaveClick"
          :disabled="!canEditItem || isStatusLocked(game)"
          class="px-4 py-1.5 rounded-lg text-sm font-semibold transition"
          :class="canEditItem && !isStatusLocked(game)
            ? 'bg-amber-600 hover:bg-amber-500 text-white'
            : 'bg-slate-600 text-gray-400 cursor-not-allowed'"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-5">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <i class="fas fa-spinner fa-spin text-2xl text-amber-400"></i>
      </div>

      <template v-else-if="game">
        <!-- Permission denied -->
        <div v-if="!canEditItem" class="bg-red-900/30 border border-red-700 rounded-2xl p-5 text-center">
          <i class="fas fa-lock text-3xl text-red-400 mb-3 block"></i>
          <p class="text-red-300 font-semibold">{{ $t('admin.permissionDenied') }}</p>
          <p class="text-gray-400 text-sm mt-1">{{ $t('admin.permissionDeniedHint') }}</p>
        </div>

        <template v-else>
          <!-- Ended lock banner -->
          <div v-if="isStatusLocked(game)" class="bg-slate-700/60 border border-slate-600 rounded-2xl p-4 flex items-center gap-3">
            <i class="fas fa-archive text-gray-400 text-xl"></i>
            <div>
              <p class="text-white font-semibold text-sm">{{ $t('admin.statusLocked') }}</p>
              <p class="text-gray-400 text-xs mt-0.5">{{ $t('admin.statusLockedHint') }}</p>
            </div>
          </div>

          <!-- Active warning -->
          <div v-else-if="isStatusWarning(game)" class="bg-amber-600/20 border border-amber-600/50 rounded-2xl p-4 flex items-center gap-3">
            <i class="fas fa-exclamation-triangle text-amber-400 text-xl"></i>
            <div>
              <p class="text-amber-300 font-semibold text-sm">{{ $t('admin.statusActiveWarning') }}</p>
              <p class="text-gray-400 text-xs mt-0.5">{{ $t('admin.statusActiveHint') }}</p>
            </div>
          </div>

          <!-- Basic Info -->
          <section class="card">
            <h2 class="section-title">{{ $t('tournament.basicInfo') }}</h2>
            <div class="space-y-3">

              <!-- pokerGames: blinds (always visible) -->
              <div v-if="isPokerGame" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="field-label">{{ $t('tournament.smallBlind') }}</label>
                  <input
                    v-model.number="form.blinds.small"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
                <div>
                  <label class="field-label">{{ $t('tournament.bigBlind') }}</label>
                  <input
                    v-model.number="form.blinds.big"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
              </div>

              <!-- pokerGames: buy-in range -->
              <div v-if="isPokerGame" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="field-label">{{ $t('admin.cashEdit.minBuyIn') }}</label>
                  <input
                    v-model.number="form.minBuyIn"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
                <div>
                  <label class="field-label">{{ $t('admin.cashEdit.maxBuyIn') }}</label>
                  <input
                    v-model.number="form.maxBuyIn"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
              </div>

              <!-- pokerGames: max players -->
              <div v-if="isPokerGame">
                <label class="field-label">{{ $t('lobby.maxPlayers') }}</label>
                <input
                  v-model.number="form.maxPlayers"
                  type="number"
                  min="2"
                  max="20"
                  class="field-input"
                  :disabled="isStatusLocked(game)"
                />
              </div>

              <!-- games (ledger): name -->
              <div v-if="!isPokerGame">
                <label class="field-label">{{ $t('game.title') }}</label>
                <input
                  v-model="form.name"
                  type="text"
                  class="field-input"
                  :placeholder="$t('game.title')"
                  :disabled="isStatusLocked(game)"
                />
              </div>

              <!-- games (ledger): baseBuyIn + maxPlayers -->
              <div v-if="!isPokerGame" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="field-label">{{ $t('admin.cashEdit.baseBuyIn') }}</label>
                  <input
                    v-model.number="form.baseBuyIn"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
                <div v-if="game.type === 'online'">
                  <label class="field-label">{{ $t('lobby.maxPlayers') }}</label>
                  <input
                    v-model.number="form.maxPlayers"
                    type="number"
                    min="2"
                    max="20"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
              </div>

              <!-- games (ledger): online-only blinds -->
              <div v-if="!isPokerGame && game.type === 'online'" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="field-label">{{ $t('tournament.smallBlind') }}</label>
                  <input
                    v-model.number="form.blinds.small"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
                <div>
                  <label class="field-label">{{ $t('tournament.bigBlind') }}</label>
                  <input
                    v-model.number="form.blinds.big"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
              </div>

              <!-- Notes (both schemas) -->
              <div>
                <label class="field-label">{{ $t('admin.cashEdit.notes') }}</label>
                <textarea
                  v-model="form.notes"
                  rows="2"
                  class="field-input"
                  :placeholder="$t('admin.cashEdit.notesPlaceholder')"
                  :disabled="isStatusLocked(game)"
                ></textarea>
              </div>
            </div>
          </section>

          <!-- Version History -->
          <section class="card">
            <div class="flex items-center justify-between mb-3">
              <h2 class="section-title mb-0">{{ $t('admin.versionHistory.title') }}</h2>
              <button @click="loadVersions" class="text-xs text-amber-400 hover:text-amber-300">
                <i class="fas fa-history mr-1"></i>{{ $t('admin.versionHistory.load') }}
              </button>
            </div>

            <div v-if="loadingVersions" class="text-center py-4 text-gray-400">
              <i class="fas fa-spinner fa-spin"></i>
            </div>

            <div v-else-if="versions.length === 0 && versionsLoaded" class="text-gray-500 text-sm text-center py-3">
              {{ $t('admin.versionHistory.empty') }}
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="v in versions"
                :key="v.id"
                class="bg-slate-900/60 rounded-xl p-3 border border-slate-700"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs text-gray-300 font-semibold">{{ v.editorName }}</span>
                  <span class="text-xs text-gray-500">{{ formatTimestamp(v.timestamp) }}</span>
                </div>
                <div v-if="v.reason" class="text-xs text-gray-400 italic mb-1.5">"{{ v.reason }}"</div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-500">
                    {{ Object.keys(v.after || {}).join(', ') }}
                  </span>
                  <button
                    v-if="isAdmin && !isStatusLocked(game)"
                    @click="handleRollback(v)"
                    class="text-xs text-amber-400 hover:text-amber-300 ml-2"
                  >
                    <i class="fas fa-undo mr-0.5"></i>{{ $t('admin.versionHistory.rollback') }}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </template>
      </template>

      <div v-else class="text-center py-12 text-gray-500">
        {{ $t('game.gameNotFound') }}
      </div>
    </div>

    <!-- Diff preview modal -->
    <ConfigDiffPreview
      v-if="showDiff"
      :changes="diffChanges"
      :status-warning="isStatusWarning(game)"
      @confirm="handleConfirmSave"
      @cancel="showDiff = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useTablePermissions } from '../../composables/useTablePermissions.js';
import { useConfigEditor } from '../../composables/useConfigEditor.js';
import { useNotification } from '../../composables/useNotification.js';
import ConfigDiffPreview from '../../components/admin/ConfigDiffPreview.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { isAdmin, permissionsLoaded, loadPermissions, canEdit, isStatusLocked, isStatusWarning } = useTablePermissions();
const { saving, saveGameConfig, getConfigVersions, rollbackToVersion } = useConfigEditor();

const gameId = computed(() => route.params.gameId);

/**
 * Source collection from the `?src=` query param (preferred source).
 * Defaults to 'pokerGames' because that is where most legacy data lives.
 */
const sourceCollection = computed(() => route.query.src || 'pokerGames');

const game = ref(null);
const loading = ref(true);
const form = ref({
  // Shared / ledger fields
  name: '',
  baseBuyIn: 0,
  // pokerGames fields
  minBuyIn: 0,
  maxBuyIn: 0,
  maxPlayers: 10,
  blinds: { small: 1, big: 2 },
  notes: '',
});
const versions = ref([]);
const versionsLoaded = ref(false);
const loadingVersions = ref(false);
const showDiff = ref(false);
const diffChanges = ref([]);

const canEditItem = computed(() => game.value && canEdit(game.value));

/**
 * Track which collection the document was actually loaded from.
 * This can differ from sourceCollection when the fallback load path is taken.
 */
const activeCollection = ref('pokerGames');

/** True when the loaded document lives in the `pokerGames` collection. */
const isPokerGame = computed(() => activeCollection.value === 'pokerGames');

function buildDiffChanges(before, after) {
  const changes = [];

  const compare = (key, bVal, aVal, label, isRisky) => {
    const bStr = JSON.stringify(bVal ?? null);
    const aStr = JSON.stringify(aVal ?? null);
    if (bStr !== aStr) {
      changes.push({ field: key, label, before: bVal, after: aVal, isRisky: isRisky || false });
    }
  };

  if (isPokerGame.value) {
    // before = { blinds: {...}, minBuyIn, maxBuyIn, maxPlayers, notes }
    // after  = { blinds: {...}, minBuyIn, maxBuyIn, maxPlayers, notes }
    compare('meta.blinds.small', before.blinds?.small, after.blinds?.small, t('tournament.smallBlind'), true);
    compare('meta.blinds.big', before.blinds?.big, after.blinds?.big, t('tournament.bigBlind'), true);
    compare('meta.minBuyIn', before.minBuyIn, after.minBuyIn, t('admin.cashEdit.minBuyIn'), true);
    compare('meta.maxBuyIn', before.maxBuyIn, after.maxBuyIn, t('admin.cashEdit.maxBuyIn'), true);
    compare('meta.maxPlayers', before.maxPlayers, after.maxPlayers, t('lobby.maxPlayers'), false);
    compare('notes', before.notes, after.notes, t('admin.cashEdit.notes'), false);
  } else {
    compare('name', before.name, after.name, t('game.title'), false);
    compare('baseBuyIn', before.baseBuyIn, after.baseBuyIn, t('admin.cashEdit.baseBuyIn'), true);
    compare('maxPlayers', before.maxPlayers, after.maxPlayers, t('lobby.maxPlayers'), false);
    compare('blinds.small', before.blinds?.small, after.blinds?.small, t('tournament.smallBlind'), true);
    compare('blinds.big', before.blinds?.big, after.blinds?.big, t('tournament.bigBlind'), true);
    compare('notes', before.notes, after.notes, t('admin.cashEdit.notes'), false);
  }

  return changes;
}

/**
 * Build the Firestore update object from the current form values.
 * For pokerGames, uses dot-notation paths to update only the meta sub-fields
 * without overwriting unrelated meta data.
 */
function formToFirestoreUpdates() {
  if (isPokerGame.value) {
    return {
      'meta.blinds': { small: form.value.blinds.small, big: form.value.blinds.big },
      'meta.minBuyIn': form.value.minBuyIn,
      'meta.maxBuyIn': form.value.maxBuyIn,
      'meta.maxPlayers': form.value.maxPlayers,
      'meta.notes': form.value.notes || '',
    };
  }
  // games (ledger) schema: flat top-level fields
  const updates = {
    name: form.value.name,
    baseBuyIn: form.value.baseBuyIn,
    notes: form.value.notes || '',
  };
  if (game.value?.type === 'online') {
    updates.maxPlayers = form.value.maxPlayers;
    updates.blinds = { small: form.value.blinds.small, big: form.value.blinds.big };
  }
  return updates;
}

/**
 * Build a human-readable "before" snapshot for diff preview and version history.
 * Returns plain nested fields (not Firestore dot-notation) so diffs display well
 * and rollbacks can re-apply cleanly.
 * Always uses literal defaults (never form values) so the snapshot accurately
 * reflects the current database state.
 */
function formToBefore() {
  if (isPokerGame.value) {
    const meta = game.value?.meta || {};
    return {
      blinds: { small: meta.blinds?.small ?? 1, big: meta.blinds?.big ?? 2 },
      minBuyIn: meta.minBuyIn ?? 0,
      maxBuyIn: meta.maxBuyIn ?? 0,
      maxPlayers: meta.maxPlayers ?? 10,
      notes: meta.notes ?? '',
    };
  }
  return {
    name: game.value?.name,
    baseBuyIn: game.value?.baseBuyIn,
    notes: game.value?.notes || '',
    maxPlayers: game.value?.maxPlayers,
    blinds: game.value?.blinds ? { ...game.value.blinds } : undefined,
  };
}

/**
 * Build the "after" snapshot (same shape as formToBefore) for diff + version history.
 */
function formToAfter() {
  if (isPokerGame.value) {
    return {
      blinds: { small: form.value.blinds.small, big: form.value.blinds.big },
      minBuyIn: form.value.minBuyIn,
      maxBuyIn: form.value.maxBuyIn,
      maxPlayers: form.value.maxPlayers,
      notes: form.value.notes || '',
    };
  }
  return {
    name: form.value.name,
    baseBuyIn: form.value.baseBuyIn,
    notes: form.value.notes || '',
    maxPlayers: form.value.maxPlayers,
    blinds: { small: form.value.blinds.small, big: form.value.blinds.big },
  };
}

function validate() {
  if (isPokerGame.value) {
    if (form.value.blinds.small < 0 || form.value.blinds.big < 0) {
      showError(t('admin.validation.blindsNegative'));
      return false;
    }
    if (form.value.blinds.big < form.value.blinds.small) {
      showError(t('admin.validation.bigBlindLessThanSmall'));
      return false;
    }
    if (form.value.minBuyIn < 0 || form.value.maxBuyIn < 0) {
      showError(t('admin.validation.buyInNegative'));
      return false;
    }
  } else {
    if (!form.value.name?.trim()) {
      showError(t('tournament.nameRequired'));
      return false;
    }
    if (form.value.baseBuyIn < 0) {
      showError(t('admin.validation.buyInNegative'));
      return false;
    }
    if (game.value?.type === 'online') {
      if (form.value.blinds.small < 0 || form.value.blinds.big < 0) {
        showError(t('admin.validation.blindsNegative'));
        return false;
      }
      if (form.value.blinds.big < form.value.blinds.small) {
        showError(t('admin.validation.bigBlindLessThanSmall'));
        return false;
      }
    }
  }
  return true;
}

async function handleSaveClick() {
  if (!validate()) return;
  const before = formToBefore();
  const after = formToAfter();
  diffChanges.value = buildDiffChanges(before, after);
  showDiff.value = true;
}

async function handleConfirmSave(reason) {
  showDiff.value = false;
  const before = formToBefore();
  const firestoreUpdates = formToFirestoreUpdates();
  const after = formToAfter();
  try {
    await saveGameConfig(activeCollection.value, gameId.value, firestoreUpdates, before, reason);
    // Reflect changes back into the local game reference so the UI stays in sync
    if (isPokerGame.value) {
      if (!game.value.meta) game.value.meta = {};
      game.value.meta.blinds = after.blinds;
      game.value.meta.minBuyIn = after.minBuyIn;
      game.value.meta.maxBuyIn = after.maxBuyIn;
      game.value.meta.maxPlayers = after.maxPlayers;
      game.value.meta.notes = after.notes;
    } else {
      Object.assign(game.value, firestoreUpdates);
    }
    success(t('common.save') + ' ✓');
    versionsLoaded.value = false;
    versions.value = [];
  } catch (e) {
    showError(e.message);
  }
}

async function handleRollback(version) {
  try {
    await rollbackToVersion(
      activeCollection.value,
      gameId.value,
      version.id,
      `Rollback to ${formatTimestamp(version.timestamp)}`
    );
    success(t('admin.versionHistory.rollbackSuccess'));
    await loadGame();
    await loadVersions();
  } catch (e) {
    showError(e.message);
  }
}

async function loadGame() {
  loading.value = true;
  try {
    // Try the preferred source collection first; if not found, try the other.
    let snap = await getDoc(doc(db, sourceCollection.value, gameId.value));
    let usedCollection = sourceCollection.value;

    if (!snap.exists()) {
      const fallback = sourceCollection.value === 'pokerGames' ? 'games' : 'pokerGames';
      snap = await getDoc(doc(db, fallback, gameId.value));
      if (snap.exists()) {
        usedCollection = fallback;
      }
    }

    // Record which collection we actually loaded from so saves/rollbacks go to the right place
    activeCollection.value = usedCollection;

    if (snap.exists()) {
      game.value = { id: snap.id, ...snap.data() };

      if (isPokerGame.value) {
        // Map nested `meta` fields into the flat form
        const meta = game.value.meta || {};
        form.value = {
          name: meta.name || '',
          baseBuyIn: 0,
          minBuyIn: meta.minBuyIn ?? 0,
          maxBuyIn: meta.maxBuyIn ?? 0,
          maxPlayers: meta.maxPlayers ?? 10,
          blinds: { small: meta.blinds?.small ?? 1, big: meta.blinds?.big ?? 2 },
          notes: meta.notes || '',
        };
      } else {
        // Flat `games` (ledger) schema
        form.value = {
          name: game.value.name || '',
          baseBuyIn: game.value.baseBuyIn || 0,
          minBuyIn: 0,
          maxBuyIn: 0,
          maxPlayers: game.value.maxPlayers || 10,
          blinds: { small: game.value.blinds?.small || 1, big: game.value.blinds?.big || 2 },
          notes: game.value.notes || '',
        };
      }
    }
  } finally {
    loading.value = false;
  }
}

async function loadVersions() {
  loadingVersions.value = true;
  try {
    versions.value = await getConfigVersions(activeCollection.value, gameId.value);
    versionsLoaded.value = true;
  } catch (e) {
    console.error('load versions error', e);
  } finally {
    loadingVersions.value = false;
  }
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

function handleBack() {
  router.push('/admin/tables');
}

onMounted(async () => {
  await loadPermissions();
  await loadGame();
});
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
