---
name: code-review
description: >-
  Reviews VoiceHub diffs for correctness, clean code, contracts, ownership, security, and testability. Structured findings with severity — never only looks fine. Use for PR/diff review requests.
---

# code review

## When to use

User asks for review; gate after multi-agent implement.

## When NOT to use

Writing a new feature from scratch.

## Related Rules

- `.cursor/rules/role-code-reviewer.mdc`
- `.cursor/rules/clean-code.mdc`
- `.cursor/rules/voicehub-constraints.mdc`

## Input

Diff / PR / file list

## Workflow

1. Scope vs Files Affected / DO NOT MODIFY.
2. Check API/Event contracts, DB ownership, coupling.
3. Quality, performance, security; authorization-analysis if authz touched.
4. Output: strengths, issues, severity, improvements, better examples.

## Expected output

Structured review report

## Tools

Read, Grep, Shell git diff. Prefer readonly.
