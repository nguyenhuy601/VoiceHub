---
name: requirement-analysis
description: >-
  Structures raw requirements into FR, NFR, business rules, constraints, assumptions, and dependencies. Use when analyzing tickets, PRDs, or vague feature requests before planning.
---

# requirement analysis

## When to use

Requirement doc or ticket is ambiguous; need structured FR/NFR before plan.

## When NOT to use

Already have clear AC and a one-file fix.

## Related Rules

- `.cursor/rules/senior-dev-engineering.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Requirement document / user story / ticket

## Workflow

1. Read source requirement; list unclear points as questions.
2. Extract Functional Requirements (FR).
3. Extract Non-functional Requirements (NFR).
4. Extract Business Rules, Constraints, Assumptions, Dependencies.
5. Output structured sections; do not invent product scope beyond evidence.

## Expected output

FR, NFR, Business Rules, Constraints, Assumptions, Dependencies

## Tools

Read, Grep. No product code edits.
