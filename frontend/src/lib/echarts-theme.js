// ECharts theme aligned with the EDUFISH Academic-Light token system.
// Charts render on canvas and cannot consume CSS variables, so colors are
// inlined from the Klein Blue palette + surface/text tokens.
export const edufishChartTheme = {
  color: ['#0022ff', '#5b6bff', '#0a8', '#c41', '#999999', '#333333'],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    color: '#666666'
  },
  title: {
    textStyle: { color: '#000000' },
    subtextStyle: { color: '#666666' }
  },
  legend: {
    textStyle: { color: '#333333' }
  },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: '#0022ff',
    borderWidth: 1,
    textStyle: {
      color: '#000000',
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace"
    }
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#dee2e6' } },
    axisTick: { lineStyle: { color: '#dee2e6' } },
    axisLabel: { color: '#666666', fontFamily: "'JetBrains Mono', monospace" },
    splitLine: { show: false }
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#dee2e6' } },
    axisTick: { lineStyle: { color: '#dee2e6' } },
    axisLabel: { color: '#666666', fontFamily: "'JetBrains Mono', monospace" },
    splitLine: { lineStyle: { color: '#f1f3f5' } }
  }
};
