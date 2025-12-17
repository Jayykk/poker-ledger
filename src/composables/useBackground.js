/**
 * Background management composable
 * Manages background images and gradients for the poker game
 */

import { ref } from 'vue';

const currentBackground = ref('default');
const backgroundImages = {
  default: null, // Use gradient background
  // Add more background options here in the future
  // casino: '/assets/backgrounds/casino.jpg',
  // felt: '/assets/backgrounds/felt.jpg',
};

export function useBackground() {
  const setBackground = (backgroundKey) => {
    if (backgroundImages.hasOwnProperty(backgroundKey)) {
      currentBackground.value = backgroundKey;
    }
  };

  const getBackgroundUrl = () => {
    return backgroundImages[currentBackground.value];
  };

  const resetBackground = () => {
    currentBackground.value = 'default';
  };

  return {
    currentBackground,
    backgroundImages,
    setBackground,
    getBackgroundUrl,
    resetBackground,
  };
}
