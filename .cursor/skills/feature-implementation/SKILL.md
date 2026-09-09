---
name: feature-implementation
description: >-
  Generic VoiceHub feature implementation workflow: analyze, inspect architecture, identify files, implement within FE/BE scope, validate, test, self-review. Use for features with clear AC/plan — not one skill per feature.
---

# feature implementation

## When to use

Implementing an in-scope feature with AC or approved plan.

## When NOT to use

Design-only; do not create a new skill per feature name.

## Related Rules

- `.cursor/rules/senior-dev-engineering.mdc`
- `.cursor/rules/clean-code.mdc`
- `.cursor/rules/role-backend.mdc`
- `.cursor/rules/role-frontend.mdc`
- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/enterprise-admin-ui.mdc`

## Input

AC/plan step, layer (FE/BE), service name if BE

## Workflow

1. Analyze requirement (reuse BA outputs if present).
2. Inspect existing architecture and contracts.
3. Identify affected files; respect DO NOT MODIFY and service ownership.
4. Implement with VoiceHub layers; FE: loading/empty/error/retry, i18n, design system.
5. Validate locally (lint/build as available).
6. Test via plan section 5 or regression-testing skill.
7. Self-review against clean-code; optional code-review agent.
8. Honor Review Gates: stop when plan says Stop for review.
9. FE page removal: follow remove-page-cleanup.mdc checklist.

## Expected output

Scoped diff + notes on contract/tests

## Tools

Read, Edit, Grep, Shell (tests/build).
