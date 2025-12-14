<template>
  <div :class="cardClasses">
    <div v-if="title || $slots.header" class="card-header mb-4">
      <slot name="header">
        <h3 class="text-white font-bold">{{ title }}</h3>
      </slot>
    </div>
    
    <div class="card-body">
      <slot></slot>
    </div>
    
    <div v-if="$slots.footer" class="card-footer mt-4">
      <slot name="footer"></slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  padding: {
    type: String,
    default: 'md', // sm, md, lg, none
    validator: (value) => ['none', 'sm', 'md', 'lg'].includes(value)
  },
  variant: {
    type: String,
    default: 'default', // default, gradient
    validator: (value) => ['default', 'gradient'].includes(value)
  },
  clickable: {
    type: Boolean,
    default: false
  }
});

const cardClasses = computed(() => {
  const baseClasses = 'rounded-2xl border transition';
  
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };
  
  const variantClasses = {
    default: 'bg-slate-800 border-slate-700',
    gradient: 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 shadow-xl'
  };
  
  const clickableClass = props.clickable ? 'cursor-pointer active:scale-95 hover:border-slate-600' : '';
  
  return [
    baseClasses,
    paddingClasses[props.padding],
    variantClasses[props.variant],
    clickableClass
  ].join(' ');
});
</script>
