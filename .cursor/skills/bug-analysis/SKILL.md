---
name: bug-analysis
description: >-
  Triages VoiceHub bugs before fixing: severity, area, repro steps, suspected layer. Use before bug-fixing on unclear issues.
---

# bug analysis

## When to use

New bug needs classification.

## When NOT to use

Already know exact one-line fix.

## Related Rules

- `.cursor/rules/role-qa.mdc`

## Input

Bug report

## Workflow

1. Capture repro, severity, affected services.
2. Hypothesize layer (FE/BE/DB/gateway).
3. Hand off to bug-fixing.

## Expected output

Triage brief

## Tools

Read, Grep.
