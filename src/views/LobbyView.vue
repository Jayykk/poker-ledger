<template>
  <div class="pt-8 px-4 pb-nav w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto">
    <h2 class="text-2xl font-bold text-white mb-6">{{ $t('lobby.title') }}</h2>
    
    <!-- Stats Card -->
    <BaseCard variant="gradient" padding="lg" class="mb-6">
      <div class="flex justify-between items-start mb-4">
        <div>
          <div class="flex items-center gap-2 text-xs text-gray-400">
            {{ $t('lobby.stats.totalProfit') }}
            <!-- 👁 hide / show — remembered, so the lobby can open hidden -->
            <button
              type="button"
              class="profit-eye"
              :aria-label="hideProfit ? $t('lobby.stats.showProfit') : $t('lobby.stats.hideProfit')"
              :aria-pressed="hideProfit"
              @click="toggleHideProfit"
            >
              <i class="fas" :class="hideProfit ? 'fa-eye-slash' : 'fa-eye'"></i>
            </button>
          </div>
          <div
            class="text-3xl font-mono font-bold"
            :class="hideProfit ? 'text-gray-400' : (stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400')"
          >
            {{ hideProfit ? '••••••' : formatNumber(stats.totalProfit) }}
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-gray-400">{{ $t('lobby.stats.games') }}</div>
          <div class="font-bold text-white text-xl">{{ stats.games }}</div>
        </div>
      </div>
      <div class="flex text-xs text-gray-500 justify-between">
        <span>{{ $t('lobby.stats.winRate') }} {{ stats.winRate }}%</span>
        <span v-if="isGuest" class="text-amber-500">{{ $t('auth.guest') }}</span>
      </div>
    </BaseCard>

    <!-- Main actions: right under the stats -->
    <div class="grid grid-cols-2 gap-3 mb-6">
      <button type="button" class="lobby-main primary" @click="showCreateModal = true">
        <i class="fas fa-plus"></i>{{ $t('lobby.createGame') }}
      </button>
      <button type="button" class="lobby-main" @click="showJoinModal = true">
        <i class="fas fa-sign-in-alt"></i>{{ $t('lobby.joinGame') }}
      </button>
    </div>

    <!-- Pending Invitations -->
    <div v-if="pendingInvitations.length > 0" class="mb-6">
      <h3 class="text-lg font-bold text-white mb-3">{{ $t('invitations.pending') }}</h3>
      <div class="grid gap-2 md:grid-cols-2">
        <BaseCard
          v-for="inv in pendingInvitations"
          :key="inv.id"
          padding="md"
          class="border-l-4 border-amber-500"
        >
          <div class="flex justify-between items-center">
            <div>
              <div class="text-white font-bold">{{ inv.gameName }}</div>
              <div class="text-xs text-gray-400">
                {{ $t('invitations.from') }}: {{ inv.fromName }}
              </div>
              <div class="text-xs text-gray-500">
                {{ $t('lobby.roomCode') }}: {{ inv.roomCode }}
              </div>
            </div>
            <div class="flex gap-2">
              <BaseButton @click="handleAcceptInvitation(inv)" size="sm" variant="primary">
                {{ $t('invitations.accept') }}
              </BaseButton>
              <BaseButton @click="handleRejectInvitation(inv)" size="sm" variant="danger">
                {{ $t('invitations.reject') }}
              </BaseButton>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- My Rooms -->
    <div v-if="myRooms.length > 0" class="mb-6">
      <h3 class="text-lg font-bold text-white mb-3">{{ $t('lobby.myRooms') }}</h3>
      <div class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="room in myRooms"
          :key="room.id"
          @click="handleEnterRoom(room.id)"
          :class="getRoomCardClass(room)"
          class="rounded-2xl border transition p-4 cursor-pointer active:scale-95 hover:border-opacity-60"
        >
          <!-- Room Type Badge -->
          <div class="flex items-start gap-3 mb-2">
            <span
              class="px-2 py-0.5 rounded text-xs font-bold"
              :class="room.type === 'tournament'
                ? 'bg-amber-600/50 text-amber-200'
                : room.type === 'online'
                  ? 'bg-purple-600/50 text-purple-200'
                  : 'bg-slate-600/50 text-slate-200'"
            >
              {{ room.type === 'tournament'
                ? '🏆 ' + $t('lobby.tournamentLabel')
                : room.type === 'online'
                  ? '🌐 ' + $t('lobby.onlineLabel')
                  : '🎰 ' + $t('lobby.liveLabel') }}
            </span>
            <span
              v-if="room.hostUid === user?.uid"
              class="px-2 py-0.5 rounded text-xs bg-amber-600 text-white"
            >
              {{ $t('game.host') }}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-white font-bold">{{ room.name }}</span>
              </div>
              
              <!-- Common info -->
              <div class="text-xs text-gray-400 mt-1">
                {{ $t('lobby.roomCode') }}: {{ room.roomCode }}
              </div>

              <!-- Online-specific info -->
              <div v-if="room.type === 'online'" class="text-xs text-gray-400 mt-1 space-y-0.5">
                <div>{{ $t('lobby.blinds') }}: {{ room.blinds?.small || 1 }}/{{ room.blinds?.big || 2 }}</div>
                <div>
                  {{ $t('lobby.currentPlayers') }}: {{ room.players?.length || 0 }} / 
                  {{ $t('lobby.maxPlayers') }}: {{ room.maxPlayers || 10 }}
                </div>
                <div>
                  {{ $t('lobby.roomStatus') }}: 
                  <span :class="getRoomStatusClass(room.status)">
                    {{ getRoomStatusText(room.status) }}
                  </span>
                </div>
              </div>

              <!-- Live-specific info -->
              <div v-else class="text-xs text-gray-400 mt-1">
                {{ $t('lobby.players') }}: {{ room.players?.length || 0 }}
              </div>

              <div class="text-xs text-gray-500 mt-1">
                {{ formatDate(room.createdAt) }}
              </div>
            </div>
            <div class="text-emerald-400 flex items-center gap-2">
                <!-- Edit button for host -->
                <button
                  v-if="room.hostUid === user?.uid"
                  @click.stop="handleEditRoom(room)"
                  class="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-600/10 transition"
                  :title="$t('common.edit')"
                >
                  <i class="fas fa-pencil-alt text-sm"></i>
                </button>
              <i class="fas fa-chevron-right"></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- My Live Events (Session layer) — ended events live in /session-history.
         Always shown, so creating one and the history stay one tap away. -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-bold text-white">{{ $t('session.myEvents') }}</h3>
        <div class="flex items-center gap-3">
          <button
            type="button"
            @click="$router.push('/session-setup')"
            class="text-sm text-sky-400 hover:text-sky-300 transition"
          >
            <i class="fas fa-plus text-xs"></i> {{ $t('session.createShort') }}
          </button>
          <button
            v-if="endedSessionsCount > 0"
            type="button"
            @click="$router.push('/session-history')"
            class="text-sm text-emerald-400 hover:text-emerald-300 transition"
          >
            {{ $t('session.historyEvents') }} <i class="fas fa-chevron-right text-xs"></i>
          </button>
        </div>
      </div>
      <div v-if="!mySessions.length" class="text-sm text-gray-500 px-1">{{ $t('session.noActiveEvents') }}</div>
      <div class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="evt in mySessions"
          :key="evt.id"
          @click="$router.push(`/session/${evt.id}`)"
          class="rounded-2xl border border-slate-700 bg-slate-800/40 transition p-4 cursor-pointer active:scale-95 hover:border-opacity-60"
        >
          <div class="flex justify-between items-center">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-white font-bold">{{ evt.name }}</span>
                <span
                  class="px-2 py-0.5 rounded text-xs font-bold"
                  :class="evt.status === 'active'
                    ? 'bg-amber-600/50 text-amber-200'
                    : evt.status === 'completed'
                      ? 'bg-slate-600/50 text-slate-300'
                      : 'bg-emerald-600/50 text-emerald-200'"
                >
                  {{ evt.status === 'active'
                    ? $t('session.statusActive')
                    : evt.status === 'completed'
                      ? $t('session.done')
                      : $t('session.queued') }}
                </span>
              </div>
              <div class="text-xs text-gray-400 mt-1">
                👥 {{ (evt.participantUids || []).length }} · 🗓️ {{ (evt.periods || []).length }}
              </div>
            </div>
            <i class="fas fa-chevron-right text-emerald-400"></i>
          </div>
        </div>
      </div>
    </div>

    <!-- Tools Section -->
    <div>
      <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">{{ $t('lobby.tools') }}</h3>
      <div class="grid grid-cols-3 gap-2">
        <button type="button" class="lobby-tool" @click="$router.push('/structures')">
          <span class="text-amber-400">🏆</span>{{ $t('action.tournamentSetup') }}
        </button>
        <button type="button" class="lobby-tool" @click="$router.push('/templates')">
          <span class="text-emerald-400">📋</span>{{ $t('template.title') }}
        </button>
        <button type="button" class="lobby-tool" @click="$router.push('/admin/tables')">
          <span class="text-sky-400">⚙️</span>{{ $t('admin.management.title') }}
        </button>
      </div>
    </div>

    <!-- Create Game Modal -->
    <BaseModal v-model="showCreateModal" :title="$t('lobby.createGame')">
      <!-- Step 1: Choose game type -->
      <div v-if="createStep === 1" class="space-y-3">
        <p class="text-sm text-gray-400 mb-2">{{ $t('lobby.chooseGameType') }}</p>
        <div
          @click="selectGameType('cash')"
          class="flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all active:scale-98"
          :class="selectedGameType === 'cash' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'"
        >
          <div class="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
            💵
          </div>
          <div>
            <h4 class="text-white font-bold">{{ $t('lobby.cashGame') }}</h4>
            <p class="text-gray-400 text-xs">{{ $t('lobby.cashGameDesc') }}</p>
          </div>
        </div>
        <div
          @click="selectGameType('tournament')"
          class="flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all active:scale-98"
          :class="selectedGameType === 'tournament' ? 'border-amber-500 bg-amber-500/10' : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'"
        >
          <div class="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
            🏆
          </div>
          <div>
            <h4 class="text-white font-bold">{{ $t('lobby.tournamentGame') }}</h4>
            <p class="text-gray-400 text-xs">{{ $t('lobby.tournamentGameDesc') }}</p>
          </div>
        </div>
        <BaseButton @click="createStep = 2" variant="primary" fullWidth :disabled="!selectedGameType">
          {{ $t('common.next') }}
        </BaseButton>
      </div>

      <!-- Step 2 (tournament only): Choose template -->
      <div v-else-if="createStep === 2 && selectedGameType === 'tournament'" class="space-y-3">
        <p class="text-sm text-gray-400 mb-2">{{ $t('lobby.chooseTemplate') }}</p>

        <!-- Custom presets (shown first) -->
        <div
          v-for="tmpl in allTemplateOptions.filter(t => !t.builtIn)"
          :key="tmpl.key"
          @click="selectedTemplate = tmpl"
          class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all"
          :class="selectedTemplate?.key === tmpl.key ? 'border-amber-500 bg-amber-500/10' : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'"
        >
          <div class="flex-1 min-w-0">
            <div class="text-white font-semibold text-sm truncate">
              {{ tmpl.name }}
            </div>
            <div class="text-gray-400 text-xs">{{ templateSummary(tmpl, t) }}</div>
          </div>
          <i v-if="selectedTemplate?.key === tmpl.key" class="fas fa-check text-amber-400"></i>
        </div>

        <!-- Built-in templates (collapsible) -->
        <div class="border-t border-slate-700 pt-2">
          <button
            @click="showBuiltInTemplates = !showBuiltInTemplates"
            class="flex items-center justify-between w-full py-2 text-sm text-gray-400 hover:text-white transition"
          >
            <span>{{ $t('tournament.builtInTemplates') }}</span>
            <i class="fas" :class="showBuiltInTemplates ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
          </button>
          <div v-if="showBuiltInTemplates" class="space-y-2">
            <div
              v-for="tmpl in allTemplateOptions.filter(t => t.builtIn)"
              :key="tmpl.key"
              @click="selectedTemplate = tmpl"
              class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all"
              :class="selectedTemplate?.key === tmpl.key ? 'border-amber-500 bg-amber-500/10' : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'"
            >
              <div class="flex-1 min-w-0">
                <div class="text-white font-semibold text-sm truncate">
                  {{ tmpl.name }}
                </div>
                <div class="text-gray-400 text-xs">{{ templateSummary(tmpl, t) }}</div>
              </div>
              <i v-if="selectedTemplate?.key === tmpl.key" class="fas fa-check text-amber-400"></i>
            </div>
          </div>
        </div>

        <div v-if="allTemplateOptions.length === 0" class="text-center text-gray-500 py-4 text-sm">
          {{ $t('tournament.noPresets') }}
        </div>

        <div class="flex gap-2">
          <BaseButton @click="createStep = 1" variant="ghost" class="flex-1">
            {{ $t('common.back') }}
          </BaseButton>
          <BaseButton @click="createStep = 3" variant="primary" class="flex-1" :disabled="!selectedTemplate">
            {{ $t('common.next') }}
          </BaseButton>
        </div>
      </div>

      <!-- Step 2 (cash) / Step 3 (tournament): Name + Buy-in -->
      <div v-else>
        <BaseInput
          v-model="gameName"
          :placeholder="$t('game.playerName')"
          class="mb-4"
        />

        <!-- Show selected template summary for tournament -->
        <div v-if="selectedGameType === 'tournament' && selectedTemplate" class="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div class="flex items-center justify-between">
            <span class="text-amber-400 text-sm font-semibold">
              🏆 {{ selectedTemplate.name }}
            </span>
            <button @click="createStep = 2" class="text-xs text-gray-400 hover:text-white">
              {{ $t('common.change') }}
            </button>
          </div>
          <div class="text-gray-400 text-xs mt-1">
            {{ templateSummary(selectedTemplate, t) }}
          </div>
        </div>

        <!-- Cash game: preset picker -->
        <div v-if="selectedGameType !== 'tournament'" class="mb-4">
          <div class="text-xs text-gray-400 mb-2">{{ $t('cashPreset.usePreset') }}</div>
          <div class="flex gap-2 overflow-x-auto pb-1">
            <button
              v-for="p in cashTemplates"
              :key="p.key"
              type="button"
              @click="selectCashPreset(p)"
              class="flex-shrink-0 px-3 py-2 rounded-lg border text-left text-sm transition-all"
              :class="selectedCashPresetId === p.key
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-slate-600 bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'"
            >
              <div class="font-semibold">{{ p.name || $t('cashPreset.untitled') }}</div>
              <div class="text-xs text-gray-400">
                {{ formatNumber(p.buyIn.chips) }} {{ $t('game.chips') }} · ${{ formatNumber(p.buyIn.amount) }}
              </div>
              <div v-if="p.structure" class="text-[10px] text-amber-400/80">
                <i class="fas fa-clock mr-0.5"></i>{{ p.structure.name }}
              </div>
            </button>
            <button
              type="button"
              @click="selectCashPreset(null)"
              class="flex-shrink-0 px-3 py-2 rounded-lg border text-sm transition-all"
              :class="!selectedCashPresetId
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-600 bg-slate-700/50 text-gray-300 hover:bg-slate-600/50'"
            >
              {{ $t('cashPreset.custom') }}
            </button>
          </div>
        </div>

        <!-- Cash game: chip stepper (only when custom) -->
        <div v-if="selectedGameType !== 'tournament' && !selectedCashPresetId" class="flex gap-2 mb-4 items-center">
          <BaseButton @click="decrementCreateBuyIn" size="sm">-100</BaseButton>
          <label class="flex-1">
            <BaseInput
              v-model.number="createBuyIn"
              type="number"
              :min="MIN_BUY_IN"
              :step="CHIP_STEP"
              class="w-full"
            />
          </label>
          <BaseButton @click="incrementCreateBuyIn" size="sm">+100</BaseButton>
          <span class="text-white text-sm">{{ $t('game.chips') }}</span>
        </div>

        <!-- Cash game: buy-in amount → derived rate (only when custom; online poker has no rate) -->
        <div v-if="selectedGameType === 'cash' && !selectedCashPresetId" class="mb-4">
          <div class="flex gap-2 items-center">
            <span class="text-gray-400 text-sm w-24">{{ $t('cashPreset.buyInAmount') }}</span>
            <span class="text-white text-sm">$</span>
            <BaseInput
              v-model.number="createBuyInAmount"
              type="number"
              min="0.01"
              step="1"
              class="flex-1"
            />
          </div>
          <div class="text-xs text-gray-400 mt-1 text-right">
            {{ $t('cashPreset.rate') }}: {{ derivedCreateRate ? $t('cashPreset.rateDerived', { rate: formatRate(derivedCreateRate) }) : '-' }}
          </div>
        </div>

        <!-- Cash game: selected preset summary (when using a preset) -->
        <div v-if="selectedGameType !== 'tournament' && selectedCashPresetId" class="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-300">{{ $t('cashPreset.buyIn') }}</span>
            <span class="text-white font-mono font-bold">{{ formatNumber(createBuyIn) }} {{ $t('game.chips') }}</span>
          </div>
          <div v-if="selectedGameType === 'cash'" class="flex justify-between items-center text-sm mt-1">
            <span class="text-gray-300">{{ $t('cashPreset.buyInAmount') }}</span>
            <span class="text-white font-mono font-bold">${{ formatNumber(createBuyInAmount) }}</span>
          </div>
          <div v-if="selectedGameType === 'cash'" class="flex justify-between items-center text-xs mt-1">
            <span class="text-gray-400">{{ $t('cashPreset.rate') }}</span>
            <span class="text-gray-300">{{ $t('cashPreset.rateDerived', { rate: formatRate(createRate) }) }}</span>
          </div>
          <div v-if="selectedCashPreset?.structure" class="flex justify-between items-center text-sm mt-1">
            <span class="text-gray-300">{{ $t('cashPreset.structure') }}</span>
            <span class="text-amber-300 font-semibold">{{ selectedCashPreset.structure.name }}</span>
          </div>
        </div>
        <!-- Tournament: read-only buy-in display -->
        <div v-else class="mb-4 p-3 bg-slate-700/50 rounded-lg flex justify-between items-center">
          <span class="text-gray-400 text-sm">{{ $t('tournament.buyInAmount') }}</span>
          <span class="text-white font-mono font-bold text-lg">${{ formatNumber(createBuyIn) }}</span>
        </div>

        <div class="flex gap-2">
          <BaseButton @click="createStep = selectedGameType === 'tournament' ? 2 : 1" variant="ghost" class="flex-1">
            {{ $t('common.back') }}
          </BaseButton>
          <BaseButton @click="handleCreateGame" variant="primary" class="flex-1" :disabled="isCreating">
            {{ $t('common.confirm') }}
          </BaseButton>
        </div>
      </div>
    </BaseModal>

    <!-- Join Game Modal -->
    <BaseModal v-model="showJoinModal" :title="$t('lobby.joinGame')">
      <div v-if="joinStep === 1">
        <BaseInput
          v-model="gameCode"
          :placeholder="$t('game.enterGameId')"
          class="mb-4"
        />
        <BaseButton @click="handleCheckGame" variant="primary" fullWidth>
          {{ $t('common.next') }}
        </BaseButton>
      </div>
      <div v-else>
        <div v-if="unboundPlayers.length > 0" class="mb-4">
          <p class="text-xs text-gray-400 mb-2">{{ $t('game.emptySeats') }}:</p>
          <div class="space-y-2 max-h-40 overflow-y-auto">
            <button
              v-for="p in unboundPlayers"
              :key="p.id"
              @click="handleBindJoin(p)"
              class="w-full py-2 bg-slate-700 text-white rounded-lg text-sm border border-slate-600 flex justify-between px-3 hover:bg-slate-600"
            >
              <span>{{ p.name }}</span>
              <span class="text-emerald-400">{{ formatNumber(p.buyIn) }}</span>
            </button>
          </div>
          <div class="relative py-3">
            <span class="bg-slate-800 px-2 text-gray-500 text-xs">{{ $t('common.or') }}</span>
          </div>
        </div>
        
        <p class="text-xs text-gray-400 mb-2">{{ $t('game.newSeat') }}:</p>
        <div class="flex gap-2 mb-4">
          <BaseInput
            v-model.number="buyIn"
            type="number"
            class="flex-1"
          />
          <span class="text-white text-sm pt-3">{{ $t('game.chips') }}</span>
        </div>
        <BaseButton @click="handleNewJoin" variant="primary" fullWidth>
          {{ $t('game.buyIn') }}
        </BaseButton>
      </div>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth.js';
import { useInvitation } from '../composables/useInvitation.js';
import { usePushNotification } from '../composables/usePushNotification.js';
import { useLoading } from '../composables/useLoading.js';
import { useGameStore } from '../store/modules/game.js';
import { useUserStore } from '../store/modules/user.js';
import { useNotification } from '../composables/useNotification.js';
import BaseCard from '../components/common/BaseCard.vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import { formatNumber, formatShortDate } from '../utils/formatters.js';
import { parsePokerGameId } from '../utils/pokerEntry.js';
import { DEFAULT_BUY_IN, MIN_BUY_IN, CHIP_STEP, GAME_TYPE, STORAGE_KEYS } from '../utils/constants.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';
import {
  TEMPLATE_KIND, normalizeTemplate, templateFromBuiltInTournament,
  clockConfigFromTemplate, gameCreationFromTemplate,
} from '../utils/tableTemplates.js';
import { templateSummary } from '../utils/templateDisplay.js';
import { rateFromBuyIn, formatRate } from '../utils/buyInRate.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useTableTemplates } from '../composables/useTableTemplates.js';
import { useSessions, sortSessions, MY_SESSIONS_LIMIT } from '../composables/useSessions.js';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const { isGuest, user } = useAuth();
const gameStore = useGameStore();
const { createGame, checkGameStatus, joinByBinding, joinAsNewPlayer, joinGameListener } = gameStore;
const userStore = useUserStore();
const { success, error: showError } = useNotification();
const { sendInvitationNotification } = usePushNotification();
const { withLoading, stopLoading } = useLoading();

// Invitation composable
const {
  pendingInvitations,
  loadInvitations,
  acceptInvitation,
  rejectInvitation,
  cleanup: cleanupInvitations
} = useInvitation();

const stats = computed(() => userStore.stats);

// Career P&L can be hidden (the 👁 next to it); the choice is remembered.
const readHideProfit = () => {
  try { return localStorage.getItem(STORAGE_KEYS.HIDE_CAREER_PROFIT) === '1'; } catch { return false; }
};
const hideProfit = ref(readHideProfit());
const toggleHideProfit = () => {
  hideProfit.value = !hideProfit.value;
  try { localStorage.setItem(STORAGE_KEYS.HIDE_CAREER_PROFIT, hideProfit.value ? '1' : '0'); } catch { /* private mode */ }
};
const myRooms = computed(() => gameStore.myRooms);

const showCreateModal = ref(false);
const showJoinModal = ref(false);
const joinStep = ref(1);
const gameName = ref('Poker Game');
const gameCode = ref('');
const buyIn = ref(DEFAULT_BUY_IN);
const createBuyIn = ref(DEFAULT_BUY_IN);
// Buy-in amount for one buy-in of createBuyIn chips; the rate is derived.
const createBuyInAmount = ref(DEFAULT_BUY_IN);
const derivedCreateRate = computed(() => rateFromBuyIn(createBuyIn.value, createBuyInAmount.value));
const createRate = computed(() => derivedCreateRate.value || 1);
// Table templates (開桌範本); `key` is unique across sources.
const userTemplates = ref([]);
const withKey = (tpl) => ({ ...tpl, key: `${tpl.source || 'builtin'}:${tpl.id}` });
const cashTemplates = computed(() =>
  userTemplates.value.filter((tpl) => tpl.kind === TEMPLATE_KIND.CASH).map(withKey)
);
const selectedCashPresetId = ref(null);
const selectedCashPreset = computed(() =>
  cashTemplates.value.find((p) => p.key === selectedCashPresetId.value) || null
);
const unboundPlayers = ref([]);
const isCreating = ref(false);

// Tournament create flow
const createStep = ref(1);
const selectedGameType = ref(null);
const selectedTemplate = ref(null);
const { createSession: createTournamentSession } = useTournamentClock();
const { listenTemplates } = useTableTemplates();
const { listenMySessions, listenJoinedSessions, myHostedSessions, myJoinedSessions } = useSessions();

// Live events (Session layer): both the ones I host and the ones I've joined.
// The lists live in useSessions' module-level cache so revisiting the lobby
// renders the previous data instantly instead of popping the section in after
// the first snapshot (which shoved the layout — the "lobby flash").
const allMySessions = computed(() => {
  const byId = new Map();
  for (const s of [...myHostedSessions.value, ...myJoinedSessions.value]) byId.set(s.id, s);
  return [...byId.values()];
});
// Ended events are hidden here — they live in /session-history instead.
const mySessions = computed(() =>
  sortSessions(allMySessions.value.filter((s) => s.status !== 'completed')).slice(0, MY_SESSIONS_LIMIT)
);
const endedSessionsCount = computed(() =>
  allMySessions.value.filter((s) => s.status === 'completed').length
);
let unsubMySessions = null;
let unsubJoinedSessions = null;

// Tournament picker: my templates first, then the built-ins
const allTemplateOptions = computed(() => {
  const custom = userTemplates.value.filter((tpl) => tpl.kind === TEMPLATE_KIND.TOURNAMENT).map(withKey);
  const builtIn = TOURNAMENT_TEMPLATES.map((b) => withKey(templateFromBuiltInTournament(b, t)));
  return [...custom, ...builtIn];
});

const showBuiltInTemplates = ref(false);

// Load the user's templates when the modal opens
let unsubTemplates = null;

const selectGameType = (type) => {
  selectedGameType.value = type;
  if (type === 'cash') {
    createStep.value = 2; // Skip template step, go straight to name+buyin
  }
};

/**
 * Open the create-game modal from a `?create=1|cash|tournament` query
 * (used by App.vue's bottom 「+」 · 「現場記帳」 to share this UI).
 * Runs on mount AND whenever the query changes, so the button also works
 * when the user is already on the lobby page.
 */
const openCreateFromQuery = () => {
  const createParam = route.query.create;
  if (!createParam) return;
  // If a specific type is given, pre-select it; otherwise start at step 1
  if (createParam === 'cash' || createParam === 'tournament') {
    selectGameType(createParam);
  }
  showCreateModal.value = true;
  // Strip the query so refresh / back doesn't reopen it
  router.replace({ path: '/lobby' });
};

watch(() => route.query.create, (val) => {
  if (val) openCreateFromQuery();
});

const selectCashPreset = (preset) => {
  if (!preset) {
    selectedCashPresetId.value = null;
    return;
  }
  selectedCashPresetId.value = preset.key;
  createBuyIn.value = preset.buyIn.chips;
  createBuyInAmount.value = preset.buyIn.amount;
};

// Reset create modal state when it closes
watch(showCreateModal, (val) => {
  if (!val) {
    createStep.value = 1;
    selectedGameType.value = null;
    selectedTemplate.value = null;
    gameName.value = 'Poker Game';
    createBuyIn.value = DEFAULT_BUY_IN;
    createBuyInAmount.value = DEFAULT_BUY_IN;
    selectedCashPresetId.value = null;
    showBuiltInTemplates.value = false;
    isCreating.value = false;
  } else {
    if (!unsubTemplates) {
      unsubTemplates = listenTemplates((list) => {
        userTemplates.value = list;
        // Auto-expand built-in if no custom tournament templates
        if (!list.some((tpl) => tpl.kind === TEMPLATE_KIND.TOURNAMENT)) {
          showBuiltInTemplates.value = true;
        }
        // Default to the first cash template if available, otherwise stay on custom
        if (cashTemplates.value.length > 0 && !selectedCashPresetId.value) {
          selectCashPreset(cashTemplates.value[0]);
        }
      });
    }
    // Reopened: the listener is already live, so pick the default here
    else if (cashTemplates.value.length > 0 && !selectedCashPresetId.value) {
      selectCashPreset(cashTemplates.value[0]);
    }
  }
});

// Auto-fill buy-in from tournament template
watch(selectedTemplate, (tmpl) => {
  if (tmpl) createBuyIn.value = tmpl.buyIn.amount;
});

// Track previously seen invitations to show notifications for new ones
const seenInvitationIds = ref(new Set());

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return formatShortDate(date);
};

const getRoomCardClass = (room) => {
  if (room.type === 'tournament') {
    return 'bg-gradient-to-br from-amber-900/30 to-amber-800/20 border-amber-700/30';
  }
  if (room.type === 'online') {
    return 'bg-gradient-to-br from-purple-900/30 to-purple-800/20 border-purple-700/30';
  }
  return 'bg-gradient-to-br from-slate-800/50 to-slate-700/30 border-slate-600/30';
};

const getRoomStatusClass = (status) => {
  if (status === 'waiting') return 'text-yellow-400';
  if (status === 'playing' || status === 'active') return 'text-emerald-400';
  if (status === 'ended' || status === 'completed') return 'text-gray-500';
  return 'text-gray-400';
};

const getRoomStatusText = (status) => {
  if (status === 'waiting') return t('lobby.statusWaiting');
  if (status === 'playing' || status === 'active') return t('lobby.statusPlaying');
  if (status === 'ended' || status === 'completed') return t('lobby.statusEnded');
  return status;
};


const incrementCreateBuyIn = () => {
  createBuyIn.value = (createBuyIn.value || 0) + CHIP_STEP;
};

const decrementCreateBuyIn = () => {
  if (createBuyIn.value > MIN_BUY_IN) {
    createBuyIn.value = Math.max(MIN_BUY_IN, createBuyIn.value - CHIP_STEP);
  }
};

// A stuck connection would leave "建立中" over the screen forever
const CREATE_TIMEOUT_MS = 20 * 1000;

const handleCreateGame = async () => {
  if (isCreating.value) return;
  isCreating.value = true;
  const work = withLoading(async () => {
    // Every table starts from a template: the picked one, or (custom cash)
    // one made from the chips / amount entered here.
    const tournament = selectedGameType.value === 'tournament';
    if (tournament && !selectedTemplate.value) return;
    const template = tournament
      ? selectedTemplate.value
      : selectedCashPreset.value || normalizeTemplate({
        kind: TEMPLATE_KIND.CASH,
        buyIn: { chips: createBuyIn.value, amount: createBuyInAmount.value },
      });
    const name = gameName.value || template.name;

    // Tournaments always get a clock; cash only with a blind structure
    // (timed game: the clock ends with the structure, settlement stays
    // stack − buy-in).
    const clockConfig = clockConfigFromTemplate(template, { name });
    const tournamentSessionId = clockConfig ? await createTournamentSession(clockConfig) : null;
    const game = gameCreationFromTemplate(template, { tournamentSessionId });
    const type = tournament ? GAME_TYPE.TOURNAMENT : GAME_TYPE.LIVE;
    const options = game.options;

    const gameId = await createGame(name, game.buyIn, type, options);
    if (gameId) {
      // Link tournament session back to the game room
      if (tournamentSessionId) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase-init.js');
        await updateDoc(doc(db, 'tournamentSessions', tournamentSessionId), { gameId });
      }
      showCreateModal.value = false;
      success(t('lobby.gameCreated'));
      await gameStore.loadMyRooms();
      router.push(type === GAME_TYPE.TOURNAMENT ? '/tournament-game' : '/game');
    }
  }, t('loading.creating'));
  let timer = null;
  try {
    const stuck = await Promise.race([
      work.then(() => false),
      new Promise((r) => { timer = setTimeout(() => r(true), CREATE_TIMEOUT_MS); }),
    ]);
    if (stuck) {
      // The write may still land: say so, and free the screen
      stopLoading();
      showCreateModal.value = false;
      showError(t('lobby.createStuck'));
    }
  } finally {
    clearTimeout(timer);
    isCreating.value = false;
  }
};

const handleCheckGame = async () => {
  if (!gameCode.value) {
    showError('Please enter game ID');
    return;
  }
  // An online table's invite link (…/poker-game/<id>, or ?__path=poker-game%2F<id>) goes straight to the table
  if (/poker-game(\/|%2F)/i.test(gameCode.value)) {
    const tableId = parsePokerGameId(gameCode.value);
    if (tableId) {
      showJoinModal.value = false;
      gameCode.value = '';
      router.push(`/poker-game/${tableId}`);
      return;
    }
  }
  
  await withLoading(async () => {
    const result = await checkGameStatus(gameCode.value);
    
    if (result.status === 'joined') {
      await joinGameListener(gameCode.value);
      showJoinModal.value = false;
      success('Already in game');
      router.push('/game');
    } else if (result.status === 'open') {
      unboundPlayers.value = result.unboundPlayers;
      joinStep.value = 2;
    } else {
      showError(result.msg || 'Cannot join game');
    }
  }, t('loading.checking'));
};

const handleBindJoin = async (player) => {
  await withLoading(async () => {
    const bindSuccess = await joinByBinding(gameCode.value, player.id);
    if (bindSuccess) {
      showJoinModal.value = false;
      joinStep.value = 1;
      // Reload rooms
      await gameStore.loadMyRooms();
      router.push('/game');
    }
  }, t('loading.binding'));
};

const handleNewJoin = async () => {
  await withLoading(async () => {
    const joinSuccess = await joinAsNewPlayer(gameCode.value, buyIn.value);
    if (joinSuccess) {
      showJoinModal.value = false;
      joinStep.value = 1;
      // Reload rooms
      await gameStore.loadMyRooms();
      router.push('/game');
    }
  }, t('loading.joining'));
};

const handleEnterRoom = async (roomId) => {
  await withLoading(async () => {
    // Check room type to route to the correct view
    const room = myRooms.value.find(r => r.id === roomId);
    await joinGameListener(roomId);
    router.push(room?.type === 'tournament' ? '/tournament-game' : '/game');
  }, t('loading.loading'));
};

const handleEditRoom = (room) => {
  if (room.type === 'tournament' && room.status === 'completed') {
    router.push(`/admin/cash/${room.id}?src=games`);
  } else if (room.type === 'tournament' && room.tournamentSessionId) {
    router.push(`/admin/tournament/${room.tournamentSessionId}`);
  } else {
    router.push(`/admin/cash/${room.id}`);
  }
};

const handleAcceptInvitation = async (invitation) => {
  await withLoading(async () => {
    const accepted = await acceptInvitation(invitation.id);
    if (accepted) {
      success(t('invitations.accepted'));
      // Join the game
      await joinGameListener(invitation.gameId);
      router.push('/game');
    }
  }, t('loading.accepting'));
};

const handleRejectInvitation = async (invitation) => {
  await withLoading(async () => {
    const rejected = await rejectInvitation(invitation.id);
    if (rejected) {
      success(t('invitations.rejected'));
    }
  }, t('loading.rejecting'));
};

onMounted(async () => {
  // Attach the live-event listeners BEFORE any awaited work: they render from
  // useSessions' module-level cache immediately, and waiting on loadMyRooms
  // first delayed the first snapshot — the events section then popped in late
  // and shoved the layout.
  unsubMySessions = listenMySessions();
  unsubJoinedSessions = listenJoinedSessions();

  // Load invitations and mark existing ones as seen
  loadInvitations();

  await gameStore.loadMyRooms();

  // Auto-open the create-game modal when navigated with ?create=1|cash|tournament
  openCreateFromQuery();

  // Wait a bit for the first snapshot to arrive, then mark all as seen
  setTimeout(() => {
    pendingInvitations.value.forEach(inv => {
      seenInvitationIds.value.add(inv.id);
    });
  }, 1000);
});

// Watch for new invitations and show action notifications
watch(pendingInvitations, (newInvitations, oldInvitations) => {
  newInvitations.forEach(inv => {
    // Only show notification for new invitations not seen before
    if (!seenInvitationIds.value.has(inv.id)) {
      seenInvitationIds.value.add(inv.id);
      
      // Show interactive notification
      sendInvitationNotification(
        inv.fromName,
        inv.gameName,
        () => handleAcceptInvitation(inv), // onConfirm
        () => handleRejectInvitation(inv)  // onDecline
      );
    }
  });
}, { deep: true });

onUnmounted(() => {
  cleanupInvitations();
  if (unsubMySessions) {
    unsubMySessions();
    unsubMySessions = null;
  }
  if (unsubJoinedSessions) {
    unsubJoinedSessions();
    unsubJoinedSessions = null;
  }
  if (unsubTemplates) {
    unsubTemplates();
    unsubTemplates = null;
  }
});
</script>

<style scoped>
.profit-eye {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 999px;
  color: rgb(var(--tw-gray-400));
  background: rgb(var(--tw-white) / 0.06);
}
.profit-eye:hover { color: rgb(var(--tw-white)); }
/* Smooth expansion for sections that appear after async data arrives (e.g.
   "My events"): animate height + opacity so the content below slides down
   instead of being shoved in a single frame. */
.section-expand-enter-active {
  transition: max-height 0.3s ease, opacity 0.3s ease;
  max-height: 1000px;
  overflow: hidden;
}
.section-expand-enter-from {
  max-height: 0;
  opacity: 0;
}
.section-expand-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
  max-height: 1000px;
  overflow: hidden;
}
.section-expand-leave-to {
  max-height: 0;
  opacity: 0;
}
.lobby-main {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.95rem 0.5rem;
  border-radius: 0.9rem;
  font-weight: 700;
  color: rgb(var(--tw-white));
  border: 1px solid rgb(var(--tw-slate-600));
  background: rgb(var(--tw-slate-800) / 0.6);
  transition: transform 0.1s;
}
.lobby-main:active, .lobby-tool:active { transform: scale(0.97); }
.lobby-main.primary {
  border-color: transparent;
  background: rgb(var(--tw-amber-500));
  color: var(--on-accent);
}
.lobby-tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.7rem 0.25rem;
  border-radius: 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(var(--tw-white));
  background: rgb(var(--tw-slate-800));
  border: 1px solid rgb(var(--tw-slate-700));
}
.lobby-tool span { font-size: 1.1rem; }
</style>
