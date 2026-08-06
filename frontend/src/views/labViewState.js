export function templateStatusLabel(status) {
  const labels = {
    published: '可运行',
    draft: '草稿',
    coming_soon: '即将开放',
    archived: '已归档'
  };
  return labels[status] || status || '未知';
}

export function bandLabel(band) {
  const labels = {
    alpha: 'Alpha / 放松节律',
    beta: 'Beta / 注意加工',
    theta: 'Theta / 记忆加工'
  };
  return labels[band] || (band ? `${band.charAt(0).toUpperCase()}${band.slice(1)}` : '未知频段');
}

export function firstSignalPreview(run) {
  const preview = run?.artifacts?.[0]?.data?.signal_preview;
  return Array.isArray(preview?.[0]) ? preview[0] : [];
}

export function summarizeRun(run) {
  if (!run) return '尚未运行';
  if (run.status !== 'completed') return run.status || '运行中';
  const sampleCount = run.summary?.sample_count || 0;
  return `${sampleCount} samples · ${bandLabel(run.summary?.dominant_band)}`;
}

export function reportSections(run) {
  const content = run?.report?.content || {};
  const observations = Array.isArray(content.observations) ? content.observations.join('\n') : '';
  return [
    { title: '实验目的', body: content.purpose || '' },
    { title: '关键观察', body: observations },
    { title: '限制说明', body: content.limitations || '' },
    { title: '下一步', body: content.next_steps || '' }
  ].filter((section) => section.body);
}
