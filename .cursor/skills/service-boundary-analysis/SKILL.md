---
name: service-boundary-analysis
description: >-
  Checks microservice ownership boundaries: no shared DB, no cross-service populate/FK, clients in services/*/src/clients. Use before cross-service calls or shared-library changes.
---

# service boundary analysis

## When to use

Adding S2S calls, populate across services, or touching shared/.

## When NOT to use

Pure UI styling.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc`
- `.cursor/rules/role-backend.mdc`
- `.cursor/rules/role-database.mdc`

## Input

Proposed change touching multiple services

## Workflow

1. Identify owning service for each data model.
2. Flag illegal cross-DB access, FK, JOIN, User populate without registered model.
3. Require HTTP clients under services/<name>/src/clients — not business logic in shared/.
4. Recommend correct boundary-preserving design.

## Expected output

Boundary verdict + violations + recommended ownership

## Tools

Read, Grep.
