---
name: test-analysis
description: >-
  Analyzes VoiceHub test failures and flakes to find root causes and next actions. Use after CI or local test fails.
---

# test analysis

## When to use

Failing or flaky tests need triage.

## When NOT to use

Green suite with no failures.

## Related Rules

- `.cursor/rules/role-qa.mdc`

## Input

Failure logs

## Workflow

1. Classify: product bug vs test bug vs env.
2. Recommend fix owner and next skill (bug-fixing vs test fix).

## Expected output

Triage report

## Tools

Read, Shell.
