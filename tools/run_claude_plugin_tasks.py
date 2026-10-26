"""Run bounded, disjoint Claude CLI implementation tasks requested by the user."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
LOGS = ROOT / "tmp" / "claude-plugin-work"
TASKS = ROOT / "tools" / "claude-plugin-tasks"
TASK_NAMES = {"backend", "package", "example", "review", "fix", "ui-foundation", "ui-components", "ui-preview", "lab-engine", "lab-workbench", "lab-brain"}


def run_task(name: str, model: str | None, resume: bool = False, instruction: str | None = None) -> dict:
    prompt_path = TASKS / f"{name}.md"
    prompt = prompt_path.read_text(encoding="utf-8")
    if instruction:
        prompt = instruction
    executable = shutil.which("claude")
    if not executable:
        raise RuntimeError("Claude CLI is not available on PATH")
    allowed = ["Read", "Glob", "Grep", "Edit", "Write",
               "Bash(python *)", "Bash(node *)", "Bash(npm run *)",
               "Bash(npm test *)", "Bash(npx --no-install *)",
               "Bash(git diff *)", "Bash(git status *)", "Bash(rg *)",
               "Bash(ls *)", "Bash(cat *)", "Bash(test *)",
               "Bash(./backend/.venv/Scripts/python.exe *)",
               "Bash(backend/.venv/Scripts/python.exe *)",
               "Bash(.venv/Scripts/python.exe *)"]
    command = [executable, "-p", "--output-format", "stream-json", "--verbose",
               "--permission-mode", "acceptEdits", "--permission-prompts", "none",
               "--tools", "Read,Glob,Grep,Edit,Write,Bash", "--allowedTools", *allowed]
    if model:
        command[2:2] = ["--model", model]
    if resume:
        previous = json.loads((LOGS / f"{name}.status.json").read_text(encoding="utf-8"))
        session_id = previous.get("session_id")
        if not session_id:
            raise RuntimeError(f"No resumable Claude session for {name}")
        command[2:2] = ["--resume", session_id]
    started = time.time()
    print(f"START {name}", flush=True)
    stderr_file = (LOGS / f"{name}.stderr.log").open("w", encoding="utf-8")
    process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=stderr_file,
                               encoding="utf-8", errors="replace")
    status = {"task": name, "model": model, "pid": process.pid, "status": "running", "started": started}
    status_path = LOGS / f"{name}.status.json"
    status_path.write_text(json.dumps(status, indent=2), encoding="utf-8")
    assert process.stdin is not None and process.stdout is not None
    process.stdin.write(prompt)
    process.stdin.close()
    result = None
    failure_reason = None
    with (LOGS / f"{name}.jsonl").open("w", encoding="utf-8") as log:
        for line in process.stdout:
            log.write(line)
            log.flush()
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") == "system" and event.get("subtype") == "init":
                status["session_id"] = event.get("session_id")
                status_path.write_text(json.dumps(status, indent=2), encoding="utf-8")
            if event.get("type") == "system" and event.get("subtype") == "api_retry":
                status["last_api_error_status"] = event.get("error_status")
                status["last_retry_attempt"] = event.get("attempt")
                status_path.write_text(json.dumps(status, indent=2), encoding="utf-8")
                if event.get("error_status") in {401, 403, 503} and event.get("attempt", 0) >= 3:
                    failure_reason = f"Configured model service unavailable (HTTP {event.get('error_status')})"
                    process.terminate()
                    break
            if event.get("type") == "result":
                result = event
    returncode = process.wait()
    stderr_file.close()
    stderr = (LOGS / f"{name}.stderr.log").read_text(encoding="utf-8")
    status.update(status="complete" if returncode == 0 and result and not result.get("is_error") else "failed",
                  returncode=returncode, elapsed_seconds=round(time.time() - started, 1),
                  result=result, failure_reason=failure_reason)
    status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"END {name}: {status['status']} ({status['elapsed_seconds']}s)", flush=True)
    if result:
        print(json.dumps({"task": name, "result": result.get("result"),
                          "is_error": result.get("is_error"),
                          "permission_denials": result.get("permission_denials")}, ensure_ascii=False), flush=True)
    elif failure_reason:
        print(f"{name}: {failure_reason}", flush=True)
    elif stderr:
        print(f"{name}: {stderr[:1200]}", flush=True)
    return status


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tasks", nargs="*", default=["backend", "package", "example"])
    parser.add_argument("--model", default=None, help="Optional explicit model; otherwise use current Claude configuration")
    parser.add_argument("--resume", action="store_true", help="Continue the selected task's recorded Claude session")
    parser.add_argument("--instruction", help="Send a follow-up instruction to a selected resumed task")
    parser.add_argument("--stop-task", choices=sorted(TASK_NAMES), help="Stop only a task process started by this runner")
    args = parser.parse_args()
    if args.stop_task:
        state_path = LOGS / f"{args.stop_task}.status.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("status") != "running":
            print(f"Task {args.stop_task} is already stopped", flush=True)
            return 0
        os_pid = int(state["pid"])
        import os
        os.kill(os_pid, signal.SIGTERM)
        print(f"Stopped task {args.stop_task} (PID {os_pid})", flush=True)
        return 0
    for name in args.tasks:
        if name not in TASK_NAMES:
            parser.error("Unknown bounded task")
    LOGS.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(as_completed([pool.submit(run_task, name, args.model, args.resume, args.instruction) for name in args.tasks]))
        statuses = [future.result() for future in results]
    return 0 if all(status["status"] == "complete" for status in statuses) else 1


if __name__ == "__main__":
    raise SystemExit(main())
