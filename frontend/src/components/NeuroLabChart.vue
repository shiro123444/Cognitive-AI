<script setup>
import * as echarts from 'echarts';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { edufishChartTheme } from '../lib/echarts-theme.js';

// Register the EDUFISH theme once per module load; all NeuroLabCharts share it.
echarts.registerTheme('edufish', edufishChartTheme);

const props = defineProps({
  option: {
    type: Object,
    default: () => ({})
  },
  height: {
    type: String,
    default: '240px'
  }
});

const root = ref(null);
let chart = null;
let resizeObserver = null;

function render() {
  if (!root.value) return;
  if (!chart) {
    chart = echarts.init(root.value, 'edufish');
    // Keep the chart in sync with any container resize (layout changes,
    // splitpanes, responsive breakpoints) without per-call wiring.
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => chart?.resize());
      resizeObserver.observe(root.value);
    }
  }
  chart.setOption(props.option || {}, true);
  chart.resize();
}

onMounted(render);
watch(() => props.option, render, { deep: true });
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (chart) chart.dispose();
});
</script>

<template>
  <div ref="root" class="chart-root" :style="{ height }" />
</template>
