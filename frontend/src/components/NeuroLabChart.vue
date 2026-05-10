<script setup>
import * as echarts from 'echarts';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

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

function render() {
  if (!root.value) return;
  if (!chart) {
    chart = echarts.init(root.value);
  }
  chart.setOption(props.option || {}, true);
  chart.resize();
}

onMounted(render);
watch(() => props.option, render, { deep: true });
onBeforeUnmount(() => {
  if (chart) chart.dispose();
});
</script>

<template>
  <div ref="root" class="chart-root" :style="{ height }" />
</template>
