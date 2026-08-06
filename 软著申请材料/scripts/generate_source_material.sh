#!/usr/bin/env bash
set -euo pipefail

bundle_dir=$(cd "$(dirname "$0")/.." && pwd)
repo_root=$(cd "$bundle_dir/.." && pwd)
output="$bundle_dir/源程序鉴别材料.txt"

files=(
  "frontend/src/App.vue"
  "frontend/src/router/index.js"
  "frontend/src/api/client.js"
  "frontend/src/api/runtime.js"
  "frontend/src/views/CourseView.vue"
  "frontend/src/views/TutorView.vue"
  "frontend/src/views/LabView.vue"
  "frontend/src/views/TeacherStudioView.vue"
  "frontend/src/views/RuntimeInspectorView.vue"
  "frontend/src/components/NeuroLabCanvas.vue"
  "frontend/src/components/NeuroLabNiiVueScene.vue"
  "backend/run.py"
  "backend/app/__init__.py"
  "backend/app/api/courses.py"
  "backend/app/api/runtime_capabilities.py"
  "backend/app/services/tutor_service.py"
  "backend/app/services/runtime_capability_service.py"
  "backend/app/services/experiment_service.py"
  "backend/app/agents/registry.py"
  "runtime/src/bin.ts"
  "runtime/src/server.ts"
  "runtime/src/protocol/types.ts"
  "runtime/src/protocol/events.ts"
  "runtime/src/core/runtime-service.ts"
  "runtime/src/core/run-service.ts"
  "runtime/src/persistence/event-store.ts"
  "runtime/src/agent/agent-loop.ts"
  "runtime/src/agent/agent-catalog.ts"
  "runtime/src/agent/openai-provider.ts"
  "runtime/src/api/routes/runs.ts"
)

{
  printf '%s\n' '清舟教育智能体平台 V1.0 源程序鉴别材料'
  printf '%s\n\n' '生成方式：由项目当前工作树自动汇编；每段保留相对路径和行号。'
  for relative_path in "${files[@]}"; do
    source_path="$repo_root/$relative_path"
    if [[ ! -f "$source_path" ]]; then
      printf '\n[SKIPPED] %s\n' "$relative_path"
      continue
    fi
    printf '\n%s\n%s\n' "===== $relative_path =====" ''
    nl -ba "$source_path"
  done
} > "$output"

printf 'Generated %s\n' "$output"
