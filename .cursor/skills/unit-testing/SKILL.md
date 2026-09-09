---
name: unit-testing
description: >-
  Adds or runs VoiceHub unit tests with node --test for shared and service policies/logic. Use when implementing unit coverage for changed logic.
---

# unit testing

## When to use

Need unit tests for pure logic/policy.

## When NOT to use

Full E2E browser flows.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`

## Input

Module under test

## Workflow

1. Write focused *.test.js next to conventions.
2. Run node --test on relevant paths.

## Expected output

Tests + command results

## Tools

Edit, Shell.
