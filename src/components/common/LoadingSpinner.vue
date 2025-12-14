<template>
  <div class="flex items-center justify-center" :class="containerClasses">
    <div :class="spinnerClasses"></div>
    <span v-if="text" class="ml-2 text-gray-400">{{ text }}</span>
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
  lg: 32
};

const containerClasses = computed(() => {
  return props.fullScreen ? 'h-screen w-screen fixed inset-0 bg-slate-900/80 z-50' : '';
});

const spinnerClasses = computed(() => {
  const size = sizeMap[props.size];
  return `loader border-2 border-gray-300 border-t-amber-500 rounded-full animate-spin`;
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
