<template>
  <div class="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
    <i class="fas fa-poker-chip text-7xl text-amber-500 animate-pulse mb-6"></i>
    <h2 class="text-3xl font-bold mb-8 text-white">Poker Sync Pro</h2>
    
    <div class="w-full max-w-sm space-y-4">
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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth.js';
import { useLoading } from '../composables/useLoading.js';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';

const { t } = useI18n();
const router = useRouter();
const { login, register, guestLogin, updateGuestDisplayName, loading, error } = useAuth();
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
