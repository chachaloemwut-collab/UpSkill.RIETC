---
trigger: always_on
---

Read AGENTS.md, docs/AI_COLLABORATION.md and docs/AI_HANDOFF.md before every task.
Run python3 scripts/agent-work.py status and acquire the shared lease before edits.
Record UTC timestamps, heartbeat every 10 minutes, and release with a handoff.
Never steal a stale lease or overwrite administrator credentials during deploy.
