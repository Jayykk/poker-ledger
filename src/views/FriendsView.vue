<template>
  <div class="pt-8 px-4 pb-24">
    <h2 class="text-2xl font-bold text-white mb-6">{{ $t('friends.title') }}</h2>

    <!-- Friend List Component -->
    <FriendList class="mb-6" @invite-friend="handleInviteFriend" />

    <!-- Leaderboard Component -->
    <Leaderboard />

    <!-- Invite to Room Modal -->
    <BaseModal v-model="showInviteModal" :title="$t('friends.inviteToRoom')">
      <div v-if="myRooms.length === 0" class="text-center py-4">
        <p class="text-gray-400 mb-4">{{ $t('friends.noActiveRooms') }}</p>
        <BaseButton @click="showInviteModal = false" variant="secondary" fullWidth>
          {{ $t('common.close') }}
        </BaseButton>
      </div>
      <div v-else>
        <p class="text-xs text-gray-400 mb-3">{{ $t('friends.selectRoom') }}</p>
        <div class="space-y-2 max-h-60 overflow-y-auto mb-4">
          <button
            v-for="room in myRooms"
            :key="room.id"
            @click="handleSelectRoom(room)"
            class="w-full p-3 bg-slate-700 text-white rounded-lg text-sm border border-slate-600 hover:bg-slate-600 transition text-left"
          >
            <div class="font-bold">{{ room.name }}</div>
            <div class="text-xs text-gray-400">
              {{ $t('lobby.roomCode') }}: {{ room.roomCode }} · 
              {{ $t('lobby.players') }}: {{ room.players?.length || 0 }}
            </div>
          </button>
        </div>
        <BaseButton @click="showInviteModal = false" variant="secondary" fullWidth>
          {{ $t('common.cancel') }}
        </BaseButton>
      </div>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotification } from '../composables/useNotification.js';
import { useInvitation } from '../composables/useInvitation.js';
import { usePushNotification } from '../composables/usePushNotification.js';
import { useGameStore } from '../store/modules/game.js';
import FriendList from '../components/social/FriendList.vue';
import Leaderboard from '../components/social/Leaderboard.vue';
import BaseModal from '../components/common/BaseModal.vue';
import BaseButton from '../components/common/BaseButton.vue';

const { t } = useI18n();
const { success, error: showError } = useNotification();
const { sendInvitation } = useInvitation();
const { sendInvitationNotification } = usePushNotification();
const gameStore = useGameStore();

const showInviteModal = ref(false);
const selectedFriend = ref(null);

const myRooms = computed(() => gameStore.myRooms);

const handleInviteFriend = async (friend) => {
  selectedFriend.value = friend;
  
  // Load rooms if not already loaded
  if (myRooms.value.length === 0) {
    await gameStore.loadMyRooms();
  }
  
  showInviteModal.value = true;
};

const handleSelectRoom = async (room) => {
  if (!selectedFriend.value) return;
  
  const invitationId = await sendInvitation(
    selectedFriend.value.friendUid || selectedFriend.value.uid,
    selectedFriend.value.displayName || selectedFriend.value.name,
    room.id,
    room.name,
    room.roomCode
  );
  
  if (invitationId) {
    success(t('friends.invitationSent'));
    
    // Send push notification
    sendInvitationNotification(
      selectedFriend.value.displayName || selectedFriend.value.name,
      room.name
    );
    
    showInviteModal.value = false;
    selectedFriend.value = null;
  } else {
    showError('Failed to send invitation');
  }
};

onMounted(async () => {
  // Pre-load rooms
  await gameStore.loadMyRooms();
});
</script>
