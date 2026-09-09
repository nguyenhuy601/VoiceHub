---
name: test-planning
description: >-
  Creates VoiceHub test plans mapping requirements to unit, integration, smoke, and regression layers with concrete commands. Use when filling plan section 5 or before QA case generation.
---

# test planning

## When to use

Writing plan Test section or release test strategy.

## When NOT to use

Running tests only (use regression-testing).

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/role-qa.mdc`

## Input

AC / plan scope

## Workflow

1. Map scope to unit / integration / smoke / regression.
2. List commands (node --test, client build, smoke scripts).
3. Define pass criteria checklist.
4. Note env blockers (swarm, voicehub.local).

## Expected output

Test plan section-5-ready structure

## Tools

Read, Grep.
