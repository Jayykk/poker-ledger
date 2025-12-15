<template>
  <div class="flex flex-col items-center justify-center" :class="containerClasses">
    <div :class="spinnerClasses"></div>
    <span v-if="text" :class="textClasses">{{ text }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  size: {
    type: String,
    default: 'md', // sm, md, lg
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  text: {
    type: String,
    default: ''
  },
  fullScreen: {
    type: Boolean,
    default: false
  }
});

const sizeMap = {
  sm: 16,
  md: 24,
  lg: 48
};

const containerClasses = computed(() => {
  if (props.fullScreen) {
    // pointer-events-auto is needed to ensure the overlay blocks all clicks
    return 'h-screen w-screen fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[9999] pointer-events-auto';
  }
  return '';
});

const spinnerClasses = computed(() => {
  const size = sizeMap[props.size];
  // Use full class names for Tailwind's purging mechanism
  const borderClass = props.fullScreen ? 'border-4' : 'border-2';
  return `loader ${borderClass} border-gray-600 border-t-amber-500 rounded-full animate-spin`;
});

const textClasses = computed(() => {
  return props.fullScreen ? 'mt-4 text-white text-base' : 'ml-2 text-gray-400';
});
</script>

<style scoped>
.loader {
  width: v-bind('sizeMap[size] + "px"');
  height: v-bind('sizeMap[size] + "px"');
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
