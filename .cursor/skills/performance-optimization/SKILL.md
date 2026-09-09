---
name: performance-optimization
description: >-
  Optimizes VoiceHub performance with measure-first approach: repro, bottleneck, change, validate. Use when slow queries/UI or N+1 suspected.
---

# performance optimization

## When to use

Measurable performance issue with repro.

## When NOT to use

Premature micro-optimization without evidence.

## Related Rules

- `.cursor/rules/role-database.mdc`
- `.cursor/rules/clean-code.mdc`
- `.cursor/rules/role-frontend.mdc`

## Input

Symptom + metrics if any

## Workflow

1. Reproduce and locate hotspot (query, render, network).
2. Propose minimal optimization.
3. Validate before/after.

## Expected output

Bottleneck + fix + validation

## Tools

Read, Edit, Shell.
