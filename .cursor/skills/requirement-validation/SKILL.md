---
name: requirement-validation
description: >-
  Validates structured requirements for gaps, conflicts, and testability. Use after requirement-analysis before committing to a plan.
---

# requirement validation

## When to use

After structured FR/NFR exist; need quality gate.

## When NOT to use

Initial brainstorming with no structure yet.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`

## Input

Structured requirements

## Workflow

1. Check completeness vs stated goals.
2. Find conflicts between FR/NFR/constraints.
3. Flag non-testable statements; suggest measurable rewrites.
4. List clarifying questions.

## Expected output

Gaps, conflicts, questions, pass/fail on readiness

## Tools

Read only.
