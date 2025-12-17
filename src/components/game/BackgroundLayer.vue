<template>
  <div class="background-layer" :style="backgroundStyle">
    <div class="background-overlay"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useBackground } from '../../composables/useBackground.js';

const { getBackgroundUrl } = useBackground();

const backgroundStyle = computed(() => {
  const url = getBackgroundUrl();
  
  if (url) {
    return {
      backgroundImage: `url(${url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  
  // Default gradient background
  return {
    background: 'linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #0d1b2a 100%)',
  };
});
</script>

<style scoped>
.background-layer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  transition: background 0.5s ease;
}

.background-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
</style>
