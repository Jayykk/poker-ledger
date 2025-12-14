<template>
  <button
    :class="buttonClasses"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="loader mr-2"></span>
    <slot></slot>
  </button>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  variant: {
    type: String,
    default: 'primary', // primary, secondary, danger, ghost
    validator: (value) => ['primary', 'secondary', 'danger', 'ghost'].includes(value)
  },
  size: {
    type: String,
    default: 'md', // sm, md, lg
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  fullWidth: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['click']);

const buttonClasses = computed(() => {
  const baseClasses = 'rounded-xl font-bold transition active:scale-95 flex items-center justify-center';
  
  const variantClasses = {
    primary: 'bg-amber-600 hover:bg-amber-500 text-white',
    secondary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white',
    ghost: 'bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-700'
  };
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };
  
  const widthClass = props.fullWidth ? 'w-full' : '';
  const disabledClass = props.disabled || props.loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  
  return [
    baseClasses,
    variantClasses[props.variant],
    sizeClasses[props.size],
    widthClass,
    disabledClass
  ].join(' ');
});

const handleClick = (event) => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>
