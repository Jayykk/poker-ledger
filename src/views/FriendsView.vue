<template>
  <div class="pt-8 px-4 pb-nav w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto">
    <h2 class="text-2xl font-bold text-white mb-6">{{ $t('friends.title') }}</h2>

    <!-- The old friend list / requests / invite-to-room are gone: 牌友圈 is
         worked out from games played together (the leaderboard's 只看牌友) -->
    <Leaderboard />
  </div>
</template>

<script setup>
import Leaderboard from '../components/social/Leaderboard.vue';
</script>
