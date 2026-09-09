---
name: regression-testing
description: >-
  Closes VoiceHub plans by running the plan Test section: unit, smoke/integration, FE build, security scripts when applicable; reports pass/fail/skip with blockers. Never fake pass.
---

# regression testing

## When to use

Before marking plan/task done; after implementation.

## When NOT to use

At start of design-only work.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`

## Input

Plan section 5 / T* list + changed paths

## Workflow

1. Read Test plan section.
2. Run listed unit tests (shared + service).
3. If client changed: cd client && npm run build (or lint).
4. Smoke/integration if API/deploy in scope; record blockers honestly.
5. Security scripts when auth/security touched.
6. Report table: test id to pass/fail/skip + reason.

## Expected output

Pass/fail/skip report

## Tools

Shell, Read.
