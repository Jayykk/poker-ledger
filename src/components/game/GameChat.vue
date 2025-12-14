<template>
  <BaseCard :title="$t('chat.title')" padding="none">
    <!-- Messages -->
    <div ref="messagesContainer" class="h-64 overflow-y-auto p-4 space-y-2">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="flex gap-2"
        :class="msg.uid === user?.uid ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[70%] rounded-lg px-3 py-2"
          :class="msg.uid === user?.uid ? 'bg-amber-600 text-white' : 'bg-slate-700 text-white'"
        >
          <div v-if="msg.uid !== user?.uid" class="text-xs text-gray-300 mb-1">
            {{ msg.userName }}
          </div>
          <div class="text-sm">{{ msg.text }}</div>
          <div class="text-[10px] opacity-70 mt-1">
            {{ formatTime(msg.timestamp) }}
          </div>
        </div>
      </div>
      <div v-if="messages.length === 0" class="text-center text-gray-500 text-sm py-8">
        No messages yet
      </div>
    </div>

    <!-- Input -->
    <div class="border-t border-slate-700 p-4 flex gap-2">
      <input
        v-model="newMessage"
        type="text"
        :placeholder="$t('chat.typeMessage')"
        class="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-2 text-white text-sm"
        @keyup.enter="sendMessage"
      />
      <BaseButton
        @click="sendMessage"
        variant="primary"
        :disabled="!newMessage.trim()"
      >
        <i class="fas fa-paper-plane"></i>
      </BaseButton>
    </div>

    <!-- Emoji Picker (simple) -->
    <div v-if="showEmoji" class="border-t border-slate-700 p-2 flex gap-2 flex-wrap">
      <button
        v-for="emoji in emojis"
        :key="emoji"
        @click="addEmoji(emoji)"
        class="text-2xl hover:scale-125 transition"
      >
        {{ emoji }}
      </button>
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuth } from '../../composables/useAuth.js';
import BaseCard from '../common/BaseCard.vue';
import BaseButton from '../common/BaseButton.vue';
import { formatTime } from '../../utils/formatters.js';

const props = defineProps({
  gameId: {
    type: String,
    required: true
  }
});

const { user } = useAuth();

const messages = ref([]);
const newMessage = ref('');
const showEmoji = ref(false);
const messagesContainer = ref(null);

const emojis = ['😀', '😂', '🎉', '👍', '❤️', '🔥', '💰', '🃏', '♠️', '♥️', '♣️', '♦️'];

let unsubscribe = null;

onMounted(() => {
  // Subscribe to chat messages
  const chatRef = collection(db, 'games', props.gameId, 'chat');
  const q = query(chatRef, orderBy('timestamp', 'asc'), limit(50));
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    messages.value = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date()
    }));
    
    // Scroll to bottom
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      }
    });
  });
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});

const sendMessage = async () => {
  if (!newMessage.value.trim() || !user.value) return;
  
  try {
    const chatRef = collection(db, 'games', props.gameId, 'chat');
    await addDoc(chatRef, {
      text: newMessage.value.trim(),
      uid: user.value.uid,
      userName: user.value.displayName || 'Guest',
      timestamp: serverTimestamp()
    });
    
    newMessage.value = '';
  } catch (err) {
    console.error('Send message error:', err);
  }
};

const addEmoji = (emoji) => {
  newMessage.value += emoji;
  showEmoji.value = false;
};
</script>
