---
name: acceptance-criteria
description: >-
  Writes measurable acceptance criteria (Given/When/Then or checklists) from functional requirements. Use before implementation plans or QA test-case-generation.
---

# acceptance criteria

## When to use

Need testable AC before coding or planning section 1.2.

## When NOT to use

After code ships with no AC request.

## Related Rules

- `.cursor/rules/role-qa.mdc`

## Input

FR / user stories

## Workflow

1. For each FR write AC that are observable (HTTP status, UI state, data).
2. Cover happy path, key negatives, permission boundaries when relevant.
3. Align wording with plan Success Criteria.

## Expected output

AC list (Given/When/Then or checkboxes)

## Tools

Read only unless writing plan/docs.
