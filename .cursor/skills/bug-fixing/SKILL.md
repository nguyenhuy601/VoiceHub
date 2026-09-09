---
name: bug-fixing
description: >-
  Investigates and fixes VoiceHub bugs with minimal local changes: reproduce, narrow service, prove root cause, fix, verify. Prefer local fix over large refactors.
---

# bug fixing

## When to use

500s, wrong behavior, LAN/socket issues, regressions.

## When NOT to use

Greenfield features.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/swarm-compose-split.mdc`

## Input

Symptom, URL/service, logs if any

## Workflow

1. Reproduce or gather evidence.
2. Narrow to owning service/client module.
3. Hypothesize and prove root cause in code/logs.
4. Apply minimal fix — no drive-by refactor.
5. Verify with targeted tests / smoke.
6. If auth/gateway involved, consider security-review.

## Expected output

Root cause, files changed, verification notes

## Tools

Read, Grep, Shell, Edit.
