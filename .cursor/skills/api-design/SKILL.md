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
4. **Response shaping (khi list/card/enrich):** whitelist field theo UI; prefer `view=` / `fields=` query trên route sẵn; default giữ full cho consumer cũ; không embed nested chỉ để “có sẵn”; không route mới chỉ để slim payload. Plan Standard §2.6 bắt buộc điền mục Tối ưu response.
5. List gateway permission map + client updates as same contract.
6. Design-only unless asked to implement (then backend-dev + feature-implementation).

## Response shaping (quick rules)

| Do | Don't |
|----|-------|
| Opt-in slim (`view=card`) for landing/list | Always return full mongoose lean + populate |
| Keep `defaultBoardId` without `boards[]` when UI only enters by id | Ship Tier-3 (budget, workflow config, closure) on list |
| Put `view` in FE queryKey | Mix full/slim in same React Query cache |
| Document omit list in plan DoD | New REST path only to return fewer fields |

## Expected output

API contract proposal + file impact list

## Tools

Read, Grep, Glob.
