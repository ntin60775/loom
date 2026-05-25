# loom-extension

**AI-Native Development Environment** for [pi](https://pi.dev) — a task-centric, knowledge-accumulating extension that turns pi into an autonomous development orchestrator.

## What it does

- **Plan Mode** (`/plan`) — brainstorm, decompose, write specs, create artifacts.
- **Agent Mode** (`/agent`) — execute plans step-by-step with worker/reviewer subagents.
- **Knowledge Layer** — accumulates project rules, architecture, and task history across sessions.
- **Subagent Spawning** — scout, researcher, migrator, worker, reviewer pipelines.
- **Verification Matrix** — invariant tracking and compliance checks.

## Commands

| Command | Description |
|---------|-------------|
| `/plan [desc]` | Enter Plan Mode |
| `/agent` | Enter Agent Mode |
| `/loom-init` | Initialize loom in current project |
| `/task-status` | Show current task status |
| `/rule-add` | Add a project rule |
| `/rule-list` | List project rules |
| `/arch-add` | Add architecture component |
| `/arch-list` | List architecture components |
| `/subagents` | List active subagents |
| `/verify-matrix` | Generate verification matrix |

## Install

```bash
pi install npm:loom-extension
```

Or project-local:

```bash
pi install -l npm:loom-extension
```

## Requirements

- pi >= 0.75.0

## License

Apache-2.0
