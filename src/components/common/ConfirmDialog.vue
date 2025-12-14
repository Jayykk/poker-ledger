<template>
  <BaseModal
    :model-value="modelValue"
    @update:model-value="handleClose"
    :closable="true"
    :close-on-click-outside="false"
  >
    <div class="text-center">
      <div class="mb-4 flex justify-center">
        <div
          class="w-16 h-16 rounded-full flex items-center justify-center"
          :class="iconBgClass"
        >
          <i class="text-3xl" :class="iconClass"></i>
        </div>
      </div>

      <h3 class="text-xl font-bold text-white mb-2">{{ title }}</h3>
      <p class="text-gray-300 mb-6">{{ message }}</p>

      <div class="flex gap-3">
        <button
          @click="handleCancel"
          class="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition font-medium"
        >
          {{ cancelText }}
        </button>
        <button
          @click="handleConfirm"
          class="flex-1 px-4 py-2 rounded-lg text-white hover:opacity-90 transition font-medium"
          :class="confirmButtonClass"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { computed } from 'vue';
import BaseModal from './BaseModal.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'info', // 'info', 'warning', 'danger'
    validator: (value) => ['info', 'warning', 'danger'].includes(value)
  },
  confirmText: {
    type: String,
    default: 'Confirm'
  },
  cancelText: {
    type: String,
    default: 'Cancel'
  }
});

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel']);

const iconClass = computed(() => {
  const icons = {
    info: 'fas fa-info-circle text-blue-400',
    warning: 'fas fa-exclamation-triangle text-amber-400',
    danger: 'fas fa-exclamation-circle text-red-400'
  };
  return icons[props.type] || icons.info;
});

const iconBgClass = computed(() => {
  const classes = {
    info: 'bg-blue-500/20',
    warning: 'bg-amber-500/20',
    danger: 'bg-red-500/20'
  };
  return classes[props.type] || classes.info;
});

const confirmButtonClass = computed(() => {
  const classes = {
    info: 'bg-blue-600 hover:bg-blue-700',
    warning: 'bg-amber-600 hover:bg-amber-700',
    danger: 'bg-red-600 hover:bg-red-700'
  };
  return classes[props.type] || classes.info;
});

const handleConfirm = () => {
  emit('update:modelValue', false);
  emit('confirm');
};

const handleCancel = () => {
  emit('update:modelValue', false);
  emit('cancel');
};

const handleClose = (value) => {
  if (!value) {
    emit('update:modelValue', false);
    emit('cancel');
  }
};
</script>
