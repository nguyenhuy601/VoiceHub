---
name: api-design
description: >-
  Designs or changes VoiceHub REST APIs using resource+method conventions, validation, errors, authz, pagination, and gateway/client alignment. Prefer extending existing routes over new paths.
---

# api design

## When to use

Designing or changing HTTP routes, controllers, client API, gateway permissions.

## When NOT to use

UI-only work; socket-only when HTTP unchanged.

## Related Rules

- `.cursor/rules/restful-api-design.mdc`
- `.cursor/rules/role-api.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Use case, existing paths, breaking yes/no

## Workflow

1. Inventory existing routes (service + api-gateway + client/src/services).
2. Prefer extend handler / query params over new verb paths.
3. Define method, path, request/response, validation, errors, authn/authz, pagination/filtering, versioning if breaking.
4. List gateway permission map + client updates as same contract.
5. Design-only unless asked to implement (then backend-dev + feature-implementation).

## Expected output

API contract proposal + file impact list

## Tools

Read, Grep, Glob.
