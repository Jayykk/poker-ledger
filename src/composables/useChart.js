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

  const safeDestroy = () => {
    if (chartInstance.value) {
      try {
        if (chartInstance.value.canvas) {
          chartInstance.value.destroy();
        }
      } catch (e) {
        // Chart already destroyed or in bad state, ignore
      }
      chartInstance.value = null;
    }
  };

  const createLineChart = (canvasId, data, options = {}) => {
    safeDestroy();

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      return null;
    }

    const ctx = canvas.getContext('2d');

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
  };

  const createPieChart = (canvasId, data, options = {}) => {
    safeDestroy();

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      return null;
    }

    const ctx = canvas.getContext('2d');

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
  };

  const createBarChart = (canvasId, data, options = {}) => {
    safeDestroy();

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      return null;
    }

    const ctx = canvas.getContext('2d');

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
  };

  const updateChart = (newData) => {
    if (chartInstance.value) {
      chartInstance.value.data = newData;
      chartInstance.value.update('none');
    }
  };

  const destroyChart = () => {
    safeDestroy();
  };

  onUnmounted(() => {
    destroyChart();
  });

  return {
    chartInstance,
    createLineChart,
    createPieChart,
    createBarChart,
    updateChart,
    destroyChart,
    debounce
  };
}
