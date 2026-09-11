---
name: plan-authoring
description: >-
  Authors VoiceHub technical plans using the mandatory Plan Standard (6 sections
  with measurable DoD, classified files, review gates, test commands, risks).
  Use when creating or updating CreatePlan / .cursor/plans/*, feature design,
  or multi-step implementation plans.
---

# Plan authoring (VoiceHub Plan Standard)

## When to use

- User asks for a plan, design before code, or CreatePlan.
- Multi-service / multi-step work needs Review Gates.

## When NOT to use

- Single-file typo / obvious one-liner fix.
- Pure Q&A with no implementation plan.

## Related Rules

- `.cursor/rules/voicehub-constraints.mdc` — Plan Standard (mandatory skeleton)
- Feed §2.5 from skill `change-impact-analysis`
- Feed §3 from `architecture-analysis` / `api-design` / `service-boundary-analysis`
- Feed §5 from `test-planning` / `test-case-generation`

## Required context

- Goal, constraints, known services/files
- Full template: [references/plan-template.md](references/plan-template.md)

## Workflow

1. Clarify type: Feature / Bug / Refactor / Security / Performance / Architecture.
2. Run or reuse `change-impact-analysis` for CREATE/MODIFY/DELETE/DO NOT MODIFY + blast radius.
3. Fill all 6 sections per template — no skipping Out-of-Scope or Pass Criteria.
4. Reject vague DoD (“finish login”) — rewrite as measurable checks.
5. For multi-step plans: add Review Gates (`Implement step N only. Stop for review.`).
6. Validate with checklist below before presenting the plan.

## Expected output

A plan document with sections 1–6 (including 6.1–6.5 when applicable) ready for review.

## Validation checklist

- [ ] §1.2 Success Criteria are measurable (status codes, commands, behaviors)
- [ ] §1.4 Out-of-Scope present
- [ ] §2 has CREATE/MODIFY/DO NOT MODIFY (+ DELETE if any) and §2.5 impact
- [ ] §2.6 Nguồn dữ liệu khi đụng API/list/card (origin field, payload, sinh req mới?)
- [ ] §2.6 Tối ưu response khi sinh/đổi payload (whitelist, omit nested, view opt-in, compat, FE cache key)
- [ ] §3 has layers + responsibilities (+ business rules if domain logic)
- [ ] §4 steps ordered with dependencies; Review Gate on large plans
- [ ] §5 has unit/integration/smoke/regression + concrete commands + pass checklist
- [ ] §6 has risks table + decision/alternative/reason + rollback
- [ ] Security work references `check-security-env.sh` / security-regression-smoke.md

## Tools

Read, Grep, Glob, CreatePlan. Do not implement product code in this skill.
