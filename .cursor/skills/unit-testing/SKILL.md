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

1. Write focused `*.test.js` next to conventions.
2. Prefer **buffer / in-memory** tests (mẫu: `services/project-service/tests/rankRoleSuggestCandidates.test.js`) — `require` + `assert`, no disk I/O.
3. Do **not** call `write*Asset` / write product xlsx into `assets/` from test `before`. Product assets are regenerated only in implement/ship steps.
4. If a temp file is unavoidable: write under `os.tmpdir()`, delete in `after` / `finally`. Never leave xlsx/tmp under the repo.
5. Run `node --test` on relevant paths; report pass/fail only — do not commit files created by the test run.

## Expected output

Tests + command results (pass/fail). Clean tree regarding test I/O.

## Tools

Edit, Shell.
