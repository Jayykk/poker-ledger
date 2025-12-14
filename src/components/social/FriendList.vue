<template>
  <BaseCard :title="$t('friends.friendList')" padding="md">
    <!-- Search -->
    <div class="mb-4">
      <div class="flex gap-2">
        <BaseInput
          v-model="searchQuery"
          :placeholder="$t('friends.searchUser')"
          type="text"
        />
        <BaseButton
          @click="searchUsers"
          variant="primary"
          :loading="searching"
        >
          <i class="fas fa-search"></i>
        </BaseButton>
      </div>
      
      <!-- Search results -->
      <div v-if="searchResults.length > 0" class="mt-2 space-y-2">
        <div
          v-for="user in searchResults"
          :key="user.uid"
          class="flex justify-between items-center p-2 bg-slate-700 rounded-lg"
        >
          <span class="text-white">{{ user.name }}</span>
          <BaseButton
            @click="sendFriendRequest(user)"
            size="sm"
            variant="secondary"
            :disabled="user.isFriend || user.isPending"
          >
            {{ user.isFriend ? 'Friend' : user.isPending ? 'Pending' : 'Add' }}
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Friend list tabs -->
    <div class="flex gap-2 mb-4">
      <button
        @click="activeTab = 'friends'"
        class="px-3 py-1 rounded-lg text-sm transition"
        :class="activeTab === 'friends' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
      >
        {{ $t('friends.friendList') }}
      </button>
      <button
        @click="activeTab = 'pending'"
        class="px-3 py-1 rounded-lg text-sm transition relative"
        :class="activeTab === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
      >
        {{ $t('friends.pending') }}
        <span v-if="pendingCount > 0" class="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-[10px] flex items-center justify-center">
          {{ pendingCount }}
        </span>
      </button>
    </div>

    <!-- Friends list -->
    <div v-if="activeTab === 'friends'" class="space-y-2">
      <div
        v-for="friend in friends"
        :key="friend.uid"
        class="flex justify-between items-center p-3 bg-slate-700 rounded-lg"
      >
        <div>
          <div class="text-white font-bold">{{ friend.name }}</div>
          <div class="text-xs text-gray-400">{{ formatDate(friend.addedAt) }}</div>
        </div>
        <div class="flex gap-2">
          <BaseButton
            @click="$emit('invite-friend', friend)"
            size="sm"
            variant="secondary"
          >
            <i class="fas fa-gamepad"></i>
          </BaseButton>
          <BaseButton
            @click="removeFriend(friend)"
            size="sm"
            variant="danger"
          >
            <i class="fas fa-times"></i>
          </BaseButton>
        </div>
      </div>
      
      <div v-if="friends.length === 0" class="text-center text-gray-500 py-8">
        {{ $t('friends.noFriends') }}
      </div>
    </div>

    <!-- Pending requests -->
    <div v-if="activeTab === 'pending'" class="space-y-2">
      <div
        v-for="request in pendingRequests"
        :key="request.uid"
        class="flex justify-between items-center p-3 bg-slate-700 rounded-lg"
      >
        <div>
          <div class="text-white font-bold">{{ request.name }}</div>
          <div class="text-xs text-gray-400">{{ formatDate(request.requestedAt) }}</div>
        </div>
        <div class="flex gap-2">
          <BaseButton
            @click="acceptFriendRequest(request)"
            size="sm"
            variant="secondary"
          >
            <i class="fas fa-check"></i>
          </BaseButton>
          <BaseButton
            @click="rejectFriendRequest(request)"
            size="sm"
            variant="danger"
          >
            <i class="fas fa-times"></i>
          </BaseButton>
        </div>
      </div>
      
      <div v-if="pendingRequests.length === 0" class="text-center text-gray-500 py-8">
        No pending requests
      </div>
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuth } from '../../composables/useAuth.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirm } from '../../composables/useConfirm.js';
import BaseCard from '../common/BaseCard.vue';
import BaseButton from '../common/BaseButton.vue';
import BaseInput from '../common/BaseInput.vue';
import { formatShortDate } from '../../utils/formatters.js';

const { t } = useI18n();
const { user } = useAuth();
const { success, error: showError } = useNotification();
const { confirm } = useConfirm();

defineEmits(['invite-friend']);

const activeTab = ref('friends');
const searchQuery = ref('');
const searchResults = ref([]);
const searching = ref(false);
const friends = ref([]);
const pendingRequests = ref([]);

const pendingCount = computed(() => pendingRequests.value.length);

const formatDate = (date) => {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return formatShortDate(d);
};

// Mock functions - In real implementation, these would interact with Firestore
const searchUsers = async () => {
  if (!searchQuery.value.trim()) return;
  
  searching.value = true;
  try {
    // Search users by name or email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('name', '>=', searchQuery.value), where('name', '<=', searchQuery.value + '\uf8ff'));
    const snapshot = await getDocs(q);
    
    searchResults.value = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
      isFriend: friends.value.some(f => f.uid === doc.id),
      isPending: false // Check pending status
    })).filter(u => u.uid !== user.value?.uid);
  } catch (err) {
    console.error('Search users error:', err);
    showError('Search failed');
  } finally {
    searching.value = false;
  }
};

const sendFriendRequest = async (targetUser) => {
  try {
    // Add friend request
    await addDoc(collection(db, 'friendRequests'), {
      fromUid: user.value.uid,
      fromName: user.value.displayName,
      toUid: targetUser.uid,
      toName: targetUser.name,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    
    success('Friend request sent!');
    searchResults.value = [];
    searchQuery.value = '';
  } catch (err) {
    console.error('Send friend request error:', err);
    showError('Failed to send request');
  }
};

const acceptFriendRequest = async (request) => {
  try {
    // Add to both users' friends subcollection
    const batch = [];
    
    await addDoc(collection(db, 'users', user.value.uid, 'friends'), {
      friendUid: request.uid,
      displayName: request.name,
      addedAt: serverTimestamp(),
      status: 'accepted'
    });
    
    await addDoc(collection(db, 'users', request.uid, 'friends'), {
      friendUid: user.value.uid,
      displayName: user.value.displayName,
      addedAt: serverTimestamp(),
      status: 'accepted'
    });
    
    // Remove from pending
    pendingRequests.value = pendingRequests.value.filter(r => r.uid !== request.uid);
    
    success('Friend request accepted!');
    loadFriends();
  } catch (err) {
    console.error('Accept friend request error:', err);
    showError('Failed to accept request');
  }
};

const rejectFriendRequest = async (request) => {
  pendingRequests.value = pendingRequests.value.filter(r => r.uid !== request.uid);
  success('Request rejected');
};

const removeFriend = async (friend) => {
  const shouldRemove = await confirm({
    message: t('friends.confirmRemove'),
    type: 'warning'
  });
  if (!shouldRemove) return;
  
  friends.value = friends.value.filter(f => f.uid !== friend.uid);
  success('Friend removed');
};

const loadFriends = async () => {
  if (!user.value) return;
  
  try {
    const friendsRef = collection(db, 'users', user.value.uid, 'friends');
    const snapshot = await getDocs(friendsRef);
    
    friends.value = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err) {
    console.error('Load friends error:', err);
  }
};

onMounted(() => {
  loadFriends();
});
</script>
