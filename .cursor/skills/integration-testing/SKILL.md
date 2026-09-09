---
name: integration-testing
description: >-
  Designs or runs integration tests across modules within a VoiceHub service or gateway path. Use when verifying controller-service-repository flows.
---

# integration testing

## When to use

Multi-module path in one service needs coverage.

## When NOT to use

Pure unit of a single function.

## Related Rules

- `.cursor/rules/role-qa.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Flow under test

## Workflow

1. Define boundaries and fixtures.
2. Implement or run integration tests.
3. Report results.

## Expected output

Integration test results

## Tools

Edit, Shell.
