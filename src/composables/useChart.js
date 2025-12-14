import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

/**
 * Simple debounce implementation
 */
function debounce(fn, delay) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * Composable for Chart.js integration
 */
export function useChart() {
  const chartInstance = ref(null);
  const isUpdating = ref(false);

  const createLineChart = (canvasId, data, options = {}) => {
    // Prevent concurrent updates
    if (isUpdating.value) {
      console.warn('Chart update already in progress, skipping...');
      return chartInstance.value;
    }

    isUpdating.value = true;

    try {
      const canvas = document.getElementById(canvasId);
      if (!canvas) {
        console.error(`Canvas with id ${canvasId} not found`);
        return null;
      }

      const ctx = canvas.getContext('2d');
      
      if (chartInstance.value) {
        chartInstance.value.destroy();
        chartInstance.value = null;
      }

      const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            display: false
          },
          y: {
            grid: {
              color: '#334155'
            }
          }
        }
      };

      chartInstance.value = new Chart(ctx, {
        type: 'line',
        data,
        options: { ...defaultOptions, ...options }
      });

      return chartInstance.value;
    } finally {
      isUpdating.value = false;
    }
  };

  const createPieChart = (canvasId, data, options = {}) => {
    // Prevent concurrent updates
    if (isUpdating.value) {
      console.warn('Chart update already in progress, skipping...');
      return chartInstance.value;
    }

    isUpdating.value = true;

    try {
      const canvas = document.getElementById(canvasId);
      if (!canvas) {
        console.error(`Canvas with id ${canvasId} not found`);
        return null;
      }

      const ctx = canvas.getContext('2d');
      
      if (chartInstance.value) {
        chartInstance.value.destroy();
        chartInstance.value = null;
      }

      const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#cbd5e1'
            }
          }
        }
      };

      chartInstance.value = new Chart(ctx, {
        type: 'pie',
        data,
        options: { ...defaultOptions, ...options }
      });

      return chartInstance.value;
    } finally {
      isUpdating.value = false;
    }
  };

  const createBarChart = (canvasId, data, options = {}) => {
    // Prevent concurrent updates
    if (isUpdating.value) {
      console.warn('Chart update already in progress, skipping...');
      return chartInstance.value;
    }

    isUpdating.value = true;

    try {
      const canvas = document.getElementById(canvasId);
      if (!canvas) {
        console.error(`Canvas with id ${canvasId} not found`);
        return null;
      }

      const ctx = canvas.getContext('2d');
      
      if (chartInstance.value) {
        chartInstance.value.destroy();
        chartInstance.value = null;
      }

      const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: '#334155'
            }
          },
          x: {
            grid: {
              display: false
            }
          }
        }
      };

      chartInstance.value = new Chart(ctx, {
        type: 'bar',
        data,
        options: { ...defaultOptions, ...options }
      });

      return chartInstance.value;
    } finally {
      isUpdating.value = false;
    }
  };

  const updateChart = (newData) => {
    if (chartInstance.value && !isUpdating.value) {
      isUpdating.value = true;
      try {
        chartInstance.value.data = newData;
        chartInstance.value.update();
      } finally {
        isUpdating.value = false;
      }
    }
  };

  const destroyChart = () => {
    if (chartInstance.value) {
      chartInstance.value.destroy();
      chartInstance.value = null;
    }
    isUpdating.value = false;
  };

  onUnmounted(() => {
    destroyChart();
  });

  return {
    chartInstance,
    isUpdating,
    createLineChart,
    createPieChart,
    createBarChart,
    updateChart,
    destroyChart,
    debounce
  };
}
