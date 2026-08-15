<template>
  <div class="slot-container quiz-slot">
    <div class="slot-header">
      <div class="header-left">
        <span class="slot-badge badge-green">INTERACTIVE QUIZ</span>
        <span class="slot-title">启发式知识测评</span>
      </div>
      <div class="header-right">
        <span class="topic-tag">{{ quizData.topic || '记忆机制' }}</span>
      </div>
    </div>

    <div class="quiz-body">
      <p class="question-text">{{ quizData.question || '题目加载中...' }}</p>

      <div class="options-list">
        <button
          v-for="opt in quizData.options"
          :key="opt.id"
          class="option-item"
          :class="{
            selected: selectedOption === opt.id,
            correct: submitted && opt.id === quizData.correctOption,
            wrong: submitted && selectedOption === opt.id && opt.id !== quizData.correctOption,
          }"
          :disabled="submitted"
          @click="selectedOption = opt.id"
        >
          <span class="opt-key">{{ opt.id }}</span>
          <span class="opt-text">{{ opt.text }}</span>
        </button>
      </div>

      <div v-if="!submitted" class="action-bar">
        <button class="btn-submit" :disabled="!selectedOption" @click="submitAnswer">
          提交并让 Agent 评估
        </button>
      </div>

      <div v-if="submitted" class="feedback-card" :class="isCorrect ? 'correct-bg' : 'wrong-bg'">
        <div class="feedback-title">
          {{ isCorrect ? '🎉 回答完全正确！' : '💡 需要进一步巩固' }}
        </div>
        <p class="feedback-explanation">{{ quizData.explanation }}</p>
        <button class="btn-continue-ask" @click="$emit('continue-explore', quizData.topic)">
          🤖 针对该知识点继续深入推演
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({
      topic: '海马体与陈述性记忆',
      question: '切除双侧内侧颞叶（包含海马体）后，患者最可能表现出下列哪种记忆障碍？',
      options: [
        { id: 'A', text: '无法保留原有的童年远期记忆' },
        { id: 'B', text: '无法形成新的陈述性长时记忆（顺行性遗忘），但保留动作技能学习能力' },
        { id: 'C', text: '瞬时工作记忆（如复述 7 位数字）完全丧失' },
        { id: 'D', text: '情绪感知能力完全丧失' },
      ],
      correctOption: 'B',
      explanation: '经典病例 H.M. 证实海马体对于陈述性长时记忆的巩固至关重要，但不损害技能学习（非陈述性记忆）与短时工作记忆。',
    }),
  },
});

defineEmits(['continue-explore']);

const quizData = computed(() => props.data || {});
const selectedOption = ref(null);
const submitted = ref(false);

const isCorrect = computed(() => selectedOption.value === quizData.value.correctOption);

function submitAnswer() {
  if (!selectedOption.value) return;
  submitted.value = true;
}
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

.badge-green {
  font-size: 9px;
  font-weight: 800;
  background: var(--rk-green, #69b56b);
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

.topic-tag {
  font-size: 10px;
  font-weight: 700;
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 2px 8px;
}

.quiz-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question-text {
  font-size: 13px;
  font-weight: 700;
  color: var(--rk-ink, #171713);
  line-height: 1.5;
  margin: 0;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--rk-panel, #e4e3dc);
  border: 2px solid var(--rk-ink, #171713);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: transform 0.1s ease;
}

.option-item:hover:not(:disabled) {
  background: #fbfbf9;
  transform: translate(-1px, -1px);
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
}

.option-item.selected {
  background: var(--rk-yellow, #d9b63f);
}

.option-item.correct {
  background: #dcfce7;
  border-color: #166534;
}

.option-item.wrong {
  background: #fee2e2;
  border-color: #991b1b;
}

.opt-key {
  font-weight: 900;
  font-size: 11px;
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.opt-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--rk-ink, #171713);
}

.action-bar {
  display: flex;
  justify-content: flex-end;
}

.btn-submit {
  background: var(--rk-pink, #d5658a);
  color: #ffffff;
  font-weight: 800;
  font-size: 12px;
  padding: 8px 16px;
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 3px 3px 0 var(--rk-ink, #171713);
  cursor: pointer;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feedback-card {
  padding: 12px;
  border: 2px solid var(--rk-ink, #171713);
  border-radius: 4px;
  box-shadow: 3px 3px 0 var(--rk-ink, #171713);
}

.feedback-card.correct-bg {
  background: #f0fdf4;
}

.feedback-card.wrong-bg {
  background: #fffbeb;
}

.feedback-title {
  font-weight: 800;
  font-size: 12px;
  margin-bottom: 4px;
}

.feedback-explanation {
  font-size: 11.5px;
  color: var(--rk-ink, #171713);
  margin: 0 0 10px 0;
  line-height: 1.45;
}

.btn-continue-ask {
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 6px 12px;
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--rk-ink, #171713);
}

.btn-continue-ask:hover {
  background: var(--rk-yellow, #d9b63f);
}
</style>
