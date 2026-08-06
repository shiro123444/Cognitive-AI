#!/usr/bin/env bash
# End-to-end verification of the Agent Runtime.
#
# Modes:
#   1) Real LLM (default when RUNTIME_PROVIDER=openai and key is set):
#        RUNTIME_PROVIDER=openai
#        RUNTIME_LLM_API_KEY=<key>
#        RUNTIME_LLM_BASE_URL=https://api.xiaomimimo.com/v1
#        RUNTIME_LLM_MODEL=mimo-v2.5-pro
#
#   2) Multi-agent structural check (always runnable with faux, no key):
#        MODE=multi bash deploy/verify-runtime-e2e.sh
#      This only verifies HTTP + session plumbing; full P1.5 coverage is in
#      `runtime/test/multi-agent.scheduling.test.ts` (33+ unit/integration tests).
#
# Expect (real LLM): run.state_changed → llm.response → tool.start/tool.end → completed
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${RUNTIME_PORT:-4000}"
MODE="${MODE:-llm}"

if [[ ! -f deploy/.env ]]; then
  echo "deploy/.env missing — copy from deploy/.env.template and fill LLM keys if needed"
  exit 1
fi

echo "==> building + starting postgres, engine, runtime ..."
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build postgres engine runtime

echo "==> waiting for runtime health ..."
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "http://localhost:${PORT}/health" >/dev/null || { echo "runtime did not become healthy"; exit 1; }
echo "    runtime healthy"

echo "==> creating a session ..."
SID=$(curl -sf -X POST "http://localhost:${PORT}/runtime/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"participants":["user:verify"]}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['session_id'])")
echo "    session: $SID"

if [[ "$MODE" == "multi" ]]; then
  echo "==> starting a supervisor run (multi-agent prompt; needs RUNTIME_PROVIDER=openai for real fan-out) ..."
  curl -sf -X POST "http://localhost:${PORT}/runtime/runs" \
    -H 'Content-Type: application/json' \
    -d "{\"session_id\":\"$SID\",\"agent_id\":\"supervisor\",\"system_prompt\":\"You are a supervisor. If runtime.delegate is available, split work to document-analyst and graph-explorer; otherwise answer briefly.\",\"user_message\":\"Prepare a short EEG alpha-wave teaching brief with concept relations.\",\"max_turns\":8}" \
    | python3 -m json.tool
else
  echo "==> starting a real-LLM run (tutor searches course materials) ..."
  curl -sf -X POST "http://localhost:${PORT}/runtime/runs" \
    -H 'Content-Type: application/json' \
    -d "{\"session_id\":\"$SID\",\"agent_id\":\"tutor\",\"system_prompt\":\"你是课程助教。必须调用 search_materials 工具回答。\",\"user_message\":\"什么是卷积神经网络？\",\"max_turns\":6}" \
    | python3 -m json.tool
fi

echo "==> event stream for session $SID :"
curl -sf "http://localhost:${PORT}/runtime/events/$SID?last_seen_seq=0" | python3 -m json.tool

echo ""
echo "Hints:"
echo "  - RUNTIME_PROVIDER=openai + key → expect tool.start/tool.end for search_materials"
echo "  - MODE=multi + openai → expect delegation.* events if the model calls runtime.delegate"
echo "  - Offline proof of P1.5: cd runtime && npm test  (multi-agent.scheduling.test.ts)"
