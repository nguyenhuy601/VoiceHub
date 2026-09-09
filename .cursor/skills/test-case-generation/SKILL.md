---
name: test-case-generation
description: >-
  Generates VoiceHub test cases from requirements and business rules: happy, negative, boundary, permission, concurrency. Prefer for QA Agent. Does not modify product code.
---

# test case generation

## When to use

Need explicit test cases from AC/rules.

## When NOT to use

Only executing existing tests.

## Related Rules

- `.cursor/rules/role-qa.mdc`

## Input

Requirement + business rules + AC

## Workflow

1. Derive cases: happy, negative, boundary, permission, concurrency.
2. Each case: steps, expected, priority, severity, preconditions, test data.
3. Do not edit product source (P1).

## Expected output

Test case table/list per role-qa format

## Tools

Read only.
