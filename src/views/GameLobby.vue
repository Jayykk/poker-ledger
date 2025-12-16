<template>
  <div class="game-lobby">
    <div class="lobby-header">
      <h1>🎰 Poker Lobby</h1>
      <button @click="showCreateModal = true" class="btn-create">
        Create Room
      </button>
    </div>

    <!-- Available Games List -->
    <div class="games-list">
      <div v-if="loading" class="loading">Loading games...</div>

      <div v-else-if="availableGames.length === 0" class="no-games">
        <p>No active games. Create one to get started!</p>
      </div>

      <div v-else class="games-grid">
        <div
          v-for="game in availableGames"
          :key="game.id"
          class="game-card"
          @click="joinGame(game.id)"
        >
          <div class="game-header">
            <h3>Table #{{ game.id.slice(0, 8) }}</h3>
            <span class="game-status" :class="game.status">
              {{ game.status }}
            </span>
          </div>
          
          <div class="game-info">
            <div class="info-row">
              <span>Blinds:</span>
              <span>{{ game.meta.blinds.small }}/{{ game.meta.blinds.big }}</span>
            </div>
            <div class="info-row">
              <span>Buy-in:</span>
              <span>{{ game.meta.minBuyIn }} - {{ game.meta.maxBuyIn }}</span>
            </div>
            <div class="info-row">
              <span>Players:</span>
              <span>{{ countPlayers(game) }}/{{ game.meta.maxPlayers }}</span>
            </div>
          </div>

          <button class="btn-join">Join Table</button>
        </div>
      </div>
    </div>

    <!-- Create Room Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click="showCreateModal = false">
      <div class="modal-content" @click.stop>
        <h2>Create Poker Room</h2>
        
        <div class="form-group">
          <label>Small Blind</label>
          <input v-model.number="newRoom.smallBlind" type="number" min="1" />
        </div>

        <div class="form-group">
          <label>Big Blind</label>
          <input v-model.number="newRoom.bigBlind" type="number" min="1" />
        </div>

        <div class="form-group">
          <label>Min Buy-in</label>
          <input v-model.number="newRoom.minBuyIn" type="number" min="1" />
        </div>

        <div class="form-group">
          <label>Max Buy-in</label>
          <input v-model.number="newRoom.maxBuyIn" type="number" min="1" />
        </div>

        <div class="form-group">
          <label>Max Players</label>
          <select v-model.number="newRoom.maxPlayers">
            <option :value="2">2</option>
            <option :value="6">6</option>
            <option :value="9">9</option>
          </select>
        </div>

        <div class="modal-actions">
          <button @click="showCreateModal = false" class="btn-cancel">
            Cancel
          </button>
          <button @click="handleCreateRoom" class="btn-confirm">
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePokerGame } from '../composables/usePokerGame.js';

const router = useRouter();
const { getAvailableGames, loading } = usePokerGame();

const availableGames = ref([]);
const showCreateModal = ref(false);
const newRoom = ref({
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 1000,
  maxBuyIn: 5000,
  maxPlayers: 6,
  mode: 'cash',
});

onMounted(async () => {
  await loadGames();
});

const loadGames = async () => {
  try {
    availableGames.value = await getAvailableGames();
  } catch (error) {
    console.error('Failed to load games:', error);
  }
};

const countPlayers = (game) => {
  return Object.values(game.seats || {}).filter((s) => s !== null).length;
};

const joinGame = (gameId) => {
  router.push({ name: 'PokerGame', params: { gameId } });
};

const handleCreateRoom = async () => {
  try {
    const { createGame } = usePokerGame();
    const room = await createGame(newRoom.value);
    showCreateModal.value = false;
    router.push({ name: 'PokerGame', params: { gameId: room.id } });
  } catch (error) {
    console.error('Failed to create room:', error);
  }
};
</script>

<style scoped>
.game-lobby {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 40px 20px;
}

.lobby-header {
  max-width: 1200px;
  margin: 0 auto 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lobby-header h1 {
  color: white;
  font-size: 36px;
  margin: 0;
}

.btn-create {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border: none;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-create:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}

.games-list {
  max-width: 1200px;
  margin: 0 auto;
}

.loading,
.no-games {
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  padding: 60px 20px;
  font-size: 18px;
}

.games-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.game-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.game-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.game-header h3 {
  color: white;
  margin: 0;
  font-size: 18px;
}

.game-status {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
}

.game-status.waiting {
  background: #4CAF50;
  color: white;
}

.game-status.playing {
  background: #ff9800;
  color: white;
}

.game-info {
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 8px;
  font-size: 14px;
}

.btn-join {
  width: 100%;
  background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
  color: white;
  border: none;
  padding: 10px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-join:hover {
  transform: scale(1.02);
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1e1e1e;
  border-radius: 16px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h2 {
  color: white;
  margin-top: 0;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 8px;
  font-weight: bold;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 16px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel {
  background: #666;
  color: white;
}

.btn-confirm {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
}

.btn-cancel:hover,
.btn-confirm:hover {
  transform: scale(1.02);
}

@media (max-width: 768px) {
  .lobby-header {
    flex-direction: column;
    gap: 20px;
  }

  .games-grid {
    grid-template-columns: 1fr;
  }
}
</style>
