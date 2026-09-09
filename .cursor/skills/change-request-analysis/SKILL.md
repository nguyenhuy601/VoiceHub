---
name: change-request-analysis
description: >-
  Analyzes mid-flight change requests against baseline scope: deltas, risks, and clarifying questions. Use when requirements change during a plan or sprint.
---

# change request analysis

## When to use

CR or requirement change mid-plan.

## When NOT to use

Initial greenfield requirement (use requirement-analysis).

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`

## Input

Baseline plan/req + CR text

## Workflow

1. Diff CR vs baseline In/Out of scope.
2. List impacted services and contracts.
3. Risks and open questions.
4. Recommend absorb into plan vs new CR task.
5. Hand off to change-impact-analysis + plan-authoring.

## Expected output

Delta scope, risks, questions, recommendation

## Tools

Read, Grep.
