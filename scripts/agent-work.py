#!/usr/bin/env python3
"""Cooperative single-writer lease shared by worktrees on this machine."""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('action', choices=['status', 'start', 'heartbeat', 'finish'])
p.add_argument('--owner', choices=['chatgpt', 'antigravity', 'deepseek', 'human'])
p.add_argument('--task')
p.add_argument('--token')
p.add_argument('--note', default='')
a = p.parse_args()
root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
common = Path(subprocess.check_output(['git', 'rev-parse', '--git-common-dir'], text=True).strip()).resolve()
directory = common / 'agent-coordination'
directory.mkdir(exist_ok=True)
state_file = directory / 'state.json'
now = dt.datetime.now(dt.timezone.utc)
stamp = now.isoformat(timespec='seconds')

with (directory / 'mutex').open('a') as mutex:
    fcntl.flock(mutex, fcntl.LOCK_EX)
    state = json.loads(state_file.read_text()) if state_file.exists() else {'active': None}
    active = state.get('active')
    if a.action == 'status':
        result = dict(state)
        if active:
            age = (now - dt.datetime.fromisoformat(active['heartbeat_at'])).total_seconds()
            result['stale'] = age > 1800
            result['heartbeat_age_seconds'] = int(age)
        result['journal'] = str(directory / 'events.jsonl')
        print(json.dumps(result, ensure_ascii=False, indent=2))
        raise SystemExit(0)
    if a.action == 'start':
        if not a.owner or not a.task:
            p.error('start requires --owner and --task')
        if active:
            p.error('Another task holds the lease. Inspect status and contact its owner; do not steal an expired lease.')
        active = {
            'owner': a.owner, 'task': a.task, 'token': str(uuid.uuid4()),
            'started_at': stamp, 'heartbeat_at': stamp, 'checkout': str(root),
            'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        }
        state['active'] = active
    else:
        if not active or a.token != active['token']:
            p.error('A matching active lease token is required')
        if a.action == 'heartbeat':
            active['heartbeat_at'] = stamp
        else:
            if not a.note:
                p.error('finish requires --note with result and remaining work')
            state['active'] = None
            state['last_handoff'] = {'at': stamp, 'owner': active['owner'], 'task': active['task'], 'note': a.note}
    event = {'at': stamp, 'action': a.action, 'owner': active['owner'], 'task': active['task'], 'note': a.note}
    # Persist the audit record first. Fail closed if the state write is interrupted.
    with (directory / 'events.jsonl').open('a') as journal:
        journal.write(json.dumps(event, ensure_ascii=False) + '\n')
        journal.flush()
        os.fsync(journal.fileno())
    fd, temporary = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(state, output, ensure_ascii=False, indent=2)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, state_file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps(state, ensure_ascii=False, indent=2))
