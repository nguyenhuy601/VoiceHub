# AI Project Planning — Implement Step Gates

Use this file when implementing further Build Contract steps.

## Pattern

```
Implement step N only. Stop for review.
```

Do **not** continue to step N+1 until the reviewer / human approves the gate.

## Suggested gates (aligned with Build Spec waves)

| Step | Scope | Stop for review after |
|------|--------|------------------------|
| 0 | Service scaffold + infra wire (this tree) | Health + stack image mapping |
| A | Tools + registry + run + evidence + G13 + remote facade flag | Unit tests registry/run/evidence/feasibility |
| B | G17 runtime + arch/risk + skills + G20 stub + feedback API | Runtime offline stubs + feedback parse |
| C | Orchestrator + retrieval + checkpoint + remote S2S-only start | Graph stub + AI_PLANNING_REMOTE=1 smoke |
| D+ | Full LangGraph / Qdrant / real tool ports | Per Build Contract |

## RULE-11

- AI planning compute lives in `ai-project-planning-service`.
- `project-service` keeps domain + Gate HTTP + G20 materialize.
- Cutover flag: `AI_PLANNING_REMOTE` (`0` default / `1` remote).
