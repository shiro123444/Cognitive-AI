<template>
  <div class="slot-container matrix-slot">
    <div class="slot-header">
      <div class="header-left">
        <span class="slot-badge badge-purple">TEACHER STUDIO</span>
        <span class="slot-title">课程学情与知识掌握雷达</span>
      </div>
      <div class="header-right">
        <span class="cohort-tag">AI-Intro 2026 春季班</span>
      </div>
    </div>

    <div class="matrix-body">
      <!-- Coverage bars -->
      <div class="metric-card">
        <div class="card-title">章节知识点掌握度矩阵</div>
        <div class="bar-row">
          <span class="label">第 1 章 认知神经科学导论</span>
          <div class="progress-track"><div class="progress-fill" style="width: 92%;"></div></div>
          <span class="val">92%</span>
        </div>
        <div class="bar-row">
          <span class="label">第 2 章 视觉与感觉通道编码</span>
          <div class="progress-track"><div class="progress-fill" style="width: 86%;"></div></div>
          <span class="val">86%</span>
        </div>
        <div class="bar-row">
          <span class="label">第 3 章 记忆机制与 LTP (重点)</span>
          <div class="progress-track"><div class="progress-fill fill-warn" style="width: 68%;"></div></div>
          <span class="val">68%</span>
        </div>
        <div class="bar-row">
          <span class="label">第 4 章 前额叶皮层与执行控制</span>
          <div class="progress-track"><div class="progress-fill" style="width: 74%;"></div></div>
          <span class="val">74%</span>
        </div>
      </div>

      <!-- Autonomous Agent Warning & Prescription -->
      <div class="agent-prescription">
        <div class="presc-title">🤖 Agent 学情推演建议</div>
        <p class="presc-text">
          班级在<strong>【CA3-CA1 Schaffer 侧支】</strong>与<strong>【NMDA 受体依赖性 LTP】</strong>存在显著知识盲区。已自动生成 3 道针对性启发式探究题，并建议下一节课加载 NeuroLab 突触电位模拟。
        </p>
        <button class="btn-action" @click="$emit('auto-generate-lesson')">
          ⚡ 自动编排教学补充材料
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['auto-generate-lesson']);
</script>

<style scoped>
.slot-container {
  display: flex;
  flex-direction: column;
  background: var(--rk-white, #ffffff);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 4px 4px 0 var(--rk-ink, #171713);
  border-radius: 4px;
  overflow: hidden;
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--rk-panel, #e4e3dc);
  border-bottom: 2px solid var(--rk-ink, #171713);
}

.badge-purple {
  font-size: 9px;
  font-weight: 800;
  background: var(--rk-purple, #9b72cf);
  color: #ffffff;
  padding: 2px 6px;
  border: 1.5px solid var(--rk-ink, #171713);
  margin-right: 8px;
}

.slot-title {
  font-weight: 800;
  font-size: 13px;
  color: var(--rk-ink, #171713);
}

.cohort-tag {
  font-size: 10px;
  font-weight: 700;
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 2px 8px;
}

.matrix-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metric-card {
  background: #fbfbf9;
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 12px;
  border-radius: 4px;
}

.card-title {
  font-weight: 800;
  font-size: 11.5px;
  margin-bottom: 10px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.label {
  font-size: 11px;
  font-weight: 600;
  width: 170px;
}

.progress-track {
  flex: 1;
  height: 10px;
  background: #e4e3dc;
  border: 1.5px solid var(--rk-ink, #171713);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--rk-green, #69b56b);
}

.progress-fill.fill-warn {
  background: var(--rk-orange, #e87551);
}

.val {
  font-size: 11px;
  font-weight: 800;
  width: 32px;
  text-align: right;
}

.agent-prescription {
  background: #fffbeb;
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 12px;
  border-radius: 4px;
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
}

.presc-title {
  font-weight: 800;
  font-size: 11px;
  color: #92400e;
  margin-bottom: 4px;
}

.presc-text {
  font-size: 11px;
  line-height: 1.45;
  margin: 0 0 10px 0;
}

.btn-action {
  background: var(--rk-yellow, #d9b63f);
  border: 1.5px solid var(--rk-ink, #171713);
  font-weight: 800;
  font-size: 11px;
  padding: 6px 12px;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
}

.btn-action:hover {
  background: var(--rk-pink, #d5658a);
  color: #ffffff;
}
</style>
