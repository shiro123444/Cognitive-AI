"""Show concise task progress without dumping prompts, credentials, or thinking."""
import json
from pathlib import Path
import sys
import time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

root = Path(__file__).resolve().parents[1]
logs = root / 'tmp' / 'claude-plugin-work'
for path in logs.glob('*.status.json'):
    state = json.loads(path.read_text(encoding='utf-8'))
    events = []
    for line in path.with_name(path.name.replace('.status.json', '.jsonl')).read_text(encoding='utf-8').splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    calls = []
    errors = []
    for event in events:
        message = event.get('message')
        if not isinstance(message, dict):
            continue
        for block in message.get('content', []):
            if not isinstance(block, dict):
                continue
            if block.get('type') == 'tool_use':
                calls.append({'tool': block.get('name'), 'file': block.get('input', {}).get('file_path')})
            if block.get('type') == 'tool_result' and block.get('is_error'):
                errors.append(str(block.get('content', ''))[:200])
    print(json.dumps({'task': state['task'], 'status': state['status'],
                      'seconds': round(time.time() - state['started']),
                      'tool_calls': len(calls), 'recent_tools': calls[-4:],
                      'tool_error_count': len(errors), 'latest_error': errors[-1:]}, ensure_ascii=False))
for directory in ['packages/edufish-plugin', 'backend/app/plugin', 'examples/plugin-host']:
    paths = [str(path.relative_to(root)) for path in (root / directory).rglob('*')
             if path.is_file() and not any(part in {'node_modules', 'dist', '__pycache__'} for part in path.parts)]
    print(json.dumps({'directory': directory, 'files': paths}, ensure_ascii=False))
