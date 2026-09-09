---
name: docker-troubleshooting
description: >-
  Troubleshoots VoiceHub Docker/Swarm issues: container, logs, network, volume, env to root cause to fix. Respects Swarm vs Compose split and disk constraints.
---

# docker troubleshooting

## When to use

Unhealthy service, crash loop, network/env failures.

## When NOT to use

Application logic bugs with healthy containers (use bug-fixing).

## Related Rules

- `.cursor/rules/swarm-compose-split.mdc`
- `.cursor/rules/docker-vhdx-disk.mdc`

## Input

Symptom + service name

## Workflow

1. Problem then inspect container/task status.
2. Logs then network then volume then environment.
3. Root cause then fix (single-service update, GC exited tasks if needed).
4. Avoid docker system prune -a --volumes unless sure.

## Expected output

RCA + fix commands

## Tools

Shell, Read.
