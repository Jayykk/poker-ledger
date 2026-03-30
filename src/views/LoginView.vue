<template>
  <div class="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
    <i class="fas fa-poker-chip text-7xl text-amber-500 animate-pulse mb-6"></i>
    <h2 class="text-3xl font-bold mb-8 text-white">Poker Sync Pro</h2>
    
    <div class="w-full max-w-sm space-y-4">

      <!-- LINE Login (shown when LIFF is available) -->
      <div v-if="liffAvailable" class="bg-[#06C755]/10 p-5 rounded-2xl border border-[#06C755]/30 space-y-3">
        <BaseButton
          @click="handleLineLogin"
          :loading="loading"
          :disabled="loading"
          fullWidth
          size="lg"
          class="!bg-[#06C755] hover:!bg-[#05b64d] !text-white !border-0"
        >
          <span class="flex items-center justify-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 5.95 2 10.75c0 3.15 2.36 5.93 5.88 7.26-.08.73-.51 2.7-.58 3.12 0 0-.01.1.05.14.06.03.13.01.13.01.17-.03 2.03-1.34 2.86-1.97.53.08 1.08.12 1.66.12 5.52 0 10-3.95 10-8.75S17.52 2 12 2z"/></svg>
            {{ $t('auth.lineLogin') }}
          </span>
        </BaseButton>
      </div>

      <!-- Divider (only if LINE is available) -->
      <div v-if="liffAvailable" class="relative py-2">
        <span class="bg-[var(--bg-primary)] px-2 text-gray-500 text-xs">
          {{ $t('common.or') }}
        </span>
      </div>

      <!-- Guest Login -->
      <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-3">
        <BaseInput
          v-model="guestForm.name"
          type="text"
          :placeholder="$t('auth.guestName')"
        />
        <BaseButton
          @click="handleGuestLogin"
          :loading="loading"
          :disabled="loading"
          variant="ghost"
          fullWidth
          size="lg"
        >
          {{ $t('auth.guestLogin') }}
        </BaseButton>
      </div>

      <div class="relative py-2">
        <span class="bg-[var(--bg-primary)] px-2 text-gray-500 text-xs">
          {{ $t('common.or') }}
        </span>
      </div>

      <!-- Email/Password Login -->
      <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-3">
        <BaseInput
          v-model="form.email"
          type="email"
          :placeholder="$t('auth.email')"
        />
        <BaseInput
          v-model="form.password"
          type="password"
          :placeholder="$t('auth.password')"
        />
        <BaseInput
          v-if="isRegister"
          v-model="form.name"
          type="text"
          :placeholder="$t('auth.displayName')"
        />
        
        <BaseButton
          @click="handleAuth"
          :loading="loading"
          :disabled="loading"
          variant="secondary"
          fullWidth
        >
          {{ isRegister ? $t('auth.register') : $t('auth.login') }}
        </BaseButton>

        <div
          @click="isRegister = !isRegister"
          class="text-xs text-gray-400 mt-2 cursor-pointer hover:text-gray-300"
        >
          {{ isRegister ? $t('auth.backToLogin') : $t('auth.registerAccount') }}
        </div>
      </div>

      <div v-if="error" class="text-rose-400 text-xs">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth.js';
import { useLiff } from '../composables/useLiff.js';
import { useLoading } from '../composables/useLoading.js';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';

const { t } = useI18n();
const router = useRouter();
const { login, register, guestLogin, loginWithLine, updateGuestDisplayName, loading, error } = useAuth();
const { isInitialized, isLoggedIn: liffLoggedIn, getAccessToken, loginWithLiff: liffLogin, isInLineClient } = useLiff();
const { withLoading } = useLoading();

const isRegister = ref(false);
const form = ref({
  email: '',
  password: '',
  name: ''
});

const guestForm = ref({
  name: ''
});

const liffAvailable = computed(() => isInitialized.value);

// Auto-login when opened inside LINE and LIFF is already logged in
onMounted(async () => {
  if (isInitialized.value && liffLoggedIn.value) {
    await handleLineLogin();
  }
});

const handleLineLogin = async () => {
  await withLoading(async () => {
    const token = getAccessToken();
    if (!token) {
      // Not logged in to LIFF yet — trigger LIFF login redirect
      liffLogin();
      return;
    }
    const success = await loginWithLine(token);
    if (success) {
      router.push('/lobby');
    }
  }, t('loading.loggingIn'));
};

const handleGuestLogin = async () => {
  await withLoading(async () => {
    const success = await guestLogin();
    if (success) {
      // If user provided a custom name, update it
      if (guestForm.value.name.trim()) {
        await updateGuestDisplayName(guestForm.value.name.trim());
      } else {
        // Use default guest name based on locale
        await updateGuestDisplayName(t('auth.defaultGuestName'));
      }
      router.push('/lobby');
    }
  }, t('loading.loggingIn'));
};

const handleAuth = async () => {
  if (isRegister.value) {
    await withLoading(async () => {
      const success = await register(form.value.email, form.value.password, form.value.name);
      if (success) {
        router.push('/lobby');
      }
    }, t('loading.registering'));
  } else {
    await withLoading(async () => {
      const success = await login(form.value.email, form.value.password);
      if (success) {
        router.push('/lobby');
      }
    }, t('loading.loggingIn'));
  }
};
</script>
