---
name: technical-debt-analysis
description: >-
  Produces VoiceHub technical debt reports: complexity, duplication, deprecated APIs, architecture violations, perf and security smells. Use for audits.
---

# technical debt analysis

## When to use

Codebase debt audit requested.

## When NOT to use

Urgent production hotfix.

## Related Rules

- `.cursor/rules/clean-code.mdc`
- `.cursor/rules/role-solution-architect.mdc`

## Input

Area to audit

## Workflow

1. Sample hotspot files.
2. Categorize debt with severity.
3. Recommend prioritized remediation (no drive-by huge refactor).

## Expected output

Technical debt report

## Tools

Read, Grep.
