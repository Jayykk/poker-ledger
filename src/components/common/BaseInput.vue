<template>
  <div class="relative">
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :class="inputClasses"
      @input="handleInput"
      @blur="handleBlur"
      @focus="handleFocus"
    />
    <label v-if="label" :for="id" class="block text-xs text-gray-400 mb-1">
      {{ label }}
      <span v-if="required" class="text-rose-400">*</span>
    </label>
    <div v-if="error" class="text-rose-400 text-xs mt-1">{{ error }}</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  id: {
    type: String,
    default: () => `input-${Math.random().toString(36).substr(2, 9)}`
  },
  modelValue: {
    type: [String, Number],
    default: ''
  },
  type: {
    type: String,
    default: 'text'
  },
  placeholder: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  required: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'blur', 'focus']);

const isFocused = ref(false);

const inputClasses = computed(() => {
  const baseClasses = 'w-full bg-slate-900 border rounded-xl px-4 py-3 text-white transition';
  const focusClasses = isFocused.value ? 'border-amber-500 ring-2 ring-amber-500/30' : '';
  const errorClasses = props.error ? 'border-rose-500' : 'border-slate-600';
  const disabledClasses = props.disabled ? 'opacity-50 cursor-not-allowed' : '';
  
  return [baseClasses, focusClasses, errorClasses, disabledClasses].join(' ');
});

const handleInput = (event) => {
  emit('update:modelValue', event.target.value);
};

const handleBlur = (event) => {
  isFocused.value = false;
  emit('blur', event);
};

const handleFocus = (event) => {
  isFocused.value = true;
  emit('focus', event);
};
</script>
