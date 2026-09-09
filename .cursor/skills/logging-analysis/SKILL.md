---
name: logging-analysis
description: >-
  Analyzes VoiceHub service logs for incidents with enough context and without sensitive data leakage. Use during production-like debugging.
---

# logging analysis

## When to use

Need to interpret service logs for an incident.

## When NOT to use

Feature design without runtime issue.

## Related Rules

- `.cursor/rules/senior-dev-engineering.mdc`

## Input

Logs + timeframe

## Workflow

1. Correlate timestamps and request IDs.
2. Find first error; avoid recommending secret logging.

## Expected output

Log-based RCA hints

## Tools

Read, Shell.
