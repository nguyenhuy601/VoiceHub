---
name: monitoring-analysis
description: >-
  Reviews VoiceHub health/metrics signals when observability stack is available. Use for latency or error-rate investigations.
---

# monitoring analysis

## When to use

Health/metrics show degradation.

## When NOT to use

No metrics available — use logging-analysis.

## Related Rules

- `.cursor/rules/role-solution-architect.mdc`

## Input

Symptom + metrics if any

## Workflow

1. Check health endpoints and obvious SLO breaches.
2. Relate to recent deploys.

## Expected output

Monitoring findings

## Tools

Shell, Read.
