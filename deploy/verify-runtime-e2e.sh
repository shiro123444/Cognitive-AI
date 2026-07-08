#!/usr/bin/env bash
# End-to-end verification of the Agent Runtime against a REAL LLM.
#
# Prereqs (in deploy/.env):
#   RUNTIME_PROVIDER=openai
#   RUNTIME_LLM_API_KEY=<your OpenAI-compatible key>
#   RUNTIME_LLM_BASE_URL=https://api.xiaomimimo.com/v1   (or OpenAI / NIM / Ollama)
#   RUNTIME_LLM_MODEL=mimo-v2.5-pro
#
# This brings up postgres + engine + runtime, runs a real agent run, and prints
# the resulting event stream. Expect: run.state_changed → llm.response →
# tool.start/tool.end (search_materials) → completed.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${RUNTIME_PORT:-4000}"

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

echo "==> starting a real-LLM run (tutor searches course materials) ..."
curl -sf -X POST "http://localhost:${PORT}/runtime/runs" \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SID\",\"agent_id\":\"tutor\",\"system_prompt\":\"你是课程助教。必须调用 search_materials 工具回答。\",\"user_message\":\"什么是卷积神经网络？\",\"max_turns\":6}" \
  | python3 -m json.tool

echo "==> event stream for session $SID :"
curl -sf "http://localhost:${PORT}/runtime/events/$SID?last_seen_seq=0" | python3 -m json.tool

echo ""
echo "If RUNTIME_PROVIDER=openai, the event stream should contain tool.start / tool.end"
echo "for search_materials — proof the real LLM drove the capability bridge end-to-end."
