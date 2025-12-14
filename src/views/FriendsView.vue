<template>
  <div class="pt-8 px-4 pb-24">
    <h2 class="text-2xl font-bold text-white mb-6">{{ $t('friends.title') }}</h2>

    <!-- Friend List Component -->
    <FriendList class="mb-6" @invite-friend="handleInviteFriend" />

    <!-- Leaderboard Component -->
    <Leaderboard />
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { useNotification } from '../composables/useNotification.js';
import FriendList from '../components/social/FriendList.vue';
import Leaderboard from '../components/social/Leaderboard.vue';

const { t } = useI18n();
const { success } = useNotification();

const handleInviteFriend = (friend) => {
  // In a real implementation, this would create a game and send invitation
  success(`Invited ${friend.name}`);
};
</script>
