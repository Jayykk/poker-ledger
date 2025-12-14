import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

/**
 * Composable for Chart.js integration
 */
export function useChart() {
  const chartInstance = ref(null);

  const createLineChart = (canvasId, data, options = {}) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error(`Canvas with id ${canvasId} not found`);
      return null;
    }

    const ctx = canvas.getContext('2d');
    
    if (chartInstance.value) {
      chartInstance.value.destroy();
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
  };

  const createPieChart = (canvasId, data, options = {}) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error(`Canvas with id ${canvasId} not found`);
      return null;
    }

    const ctx = canvas.getContext('2d');
    
    if (chartInstance.value) {
      chartInstance.value.destroy();
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
  };

  const createBarChart = (canvasId, data, options = {}) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error(`Canvas with id ${canvasId} not found`);
      return null;
    }

    const ctx = canvas.getContext('2d');
    
    if (chartInstance.value) {
      chartInstance.value.destroy();
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
  };

  const updateChart = (newData) => {
    if (chartInstance.value) {
      chartInstance.value.data = newData;
      chartInstance.value.update();
    }
  };

  const destroyChart = () => {
    if (chartInstance.value) {
      chartInstance.value.destroy();
      chartInstance.value = null;
    }
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
    destroyChart
  };
}
