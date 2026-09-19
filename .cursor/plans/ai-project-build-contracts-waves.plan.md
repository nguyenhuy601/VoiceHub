# AI Project Build Contracts — Waves 0 / A / B / C

Spec SoT remains `.cursor/plans/ai-project-build-spec-groups.plan.md` (do not edit from implement waves).
This file summarizes **API + schemas** shipped in the scaffold.

## Wave 0 — Scaffold

| Item | Value |
|------|--------|
| Service | `services/ai-project-planning-service` |
| Port | `3025` |
| Health | `GET /health` → `{ ok, service }` |
| Auth | `internalGatewayAuth` on `/internal/*` |
| Image | `AI_PROJECT_PLANNING_SERVICE_IMAGE` / `voicehub-ai-project-planning-service` |
| Mongo | `AI_PROJECT_PLANNING_MONGODB_URI` (DB `ai_project_planning_db`, not shared with project) |

### Internal API (S2S)

| Method | Path | Status | Body / notes |
|--------|------|--------|----------------|
| POST | `/internal/runs` | **202** | `{ projectId, packId, snapshotId, approvedSrsVersion, snapshotPayloadRef, trigger, initiatedBy }` → `{ runId, status }` |
| GET | `/internal/runs/:runId` | 200 | Public run DTO |
| POST | `/internal/runs/:runId/cancel` | 200 | Idempotent cancel |
| POST | `/internal/runs/:runId/resume` | 202 | Keeps `snapshotId` (RULE-09) |
| POST | `/internal/runs/:runId/feedback` | 200 | Structured feedback (Wave B) |

Gateway: `AI_PROJECT_PLANNING_SERVICE_URL` **optional** — if set, diagnostic proxy `/api/ai/project-planning`; browser path remains project-service.

---

## Wave A — Tools + registry + run + facade

### Evidence (§3.8)

```json
{
  "evidenceId": "EV-001",
  "sourceType": "employee_capacity",
  "sourceId": "EMP-102",
  "snapshotId": "SNAP-001",
  "metric": "available_capacity",
  "value": 32,
  "unit": "hours",
  "calculatedBy": "EmployeeMatchingTool",
  "timestamp": "ISO-8601",
  "ruleId": "CAP-003"
}
```

Envelope: `{ result, evidence[] }`.

### G18 Registry descriptor

`toolName, version, description, inputSchema, outputSchema, evidenceSchema, permissions, allowedContexts[], requires[], timeout, retryPolicy`

Unknown tool → `TOOL_NOT_REGISTERED`.

### G19 PlanningRun status

`queued | running | waiting_human | replanning | completed | failed | cancelled | expired`

Bound field: `snapshotId` (immutable for run lifetime).

### G13 Feasibility output

`{ pass, failures[{ code, message }], evidenceRefs[] }`

### Project facade

- Env: `AI_PLANNING_REMOTE=0|1`, `AI_PROJECT_PLANNING_SERVICE_URL`
- Client: `services/project-service/src/clients/aiProjectPlanning.client.js`
- When `AI_PLANNING_REMOTE=1`: `runAiAnalysisJob` → S2S start → HTTP **202** (no in-process LLM)

---

## Wave B — Runtime + arch/risk + G20 + feedback

### G17 Runtime (no DB / no business metrics)

`selectModel`, `loadSkillStub`, `assemblePromptStub`, `validateStructuredOutput`, `parseToolCalls` (names ∈ registry)

Skills: `planning`, `requirementUnderstanding` (`skillId, version, toolUsagePolicy, allowedToolNames[]`).

### Tools

`ArchitectureTool`, `RiskTool` (+ Wave A matching/effort/requirement/schedule) — stubs + evidence.

### G20 (project-service)

`materializeApprovedPlan({ approvedPlan, packId, organizationId, idempotencyKey })` — deterministic stub; idempotent by key.

### Feedback body

```json
{
  "kind": "planning_feedback | requirement_feedback",
  "text": "...",
  "impactScope": ["resource", "schedule"],
  "excludeEmployeeId": "EMP-102"
}
```

Impact whitelist: `requirement | WBS | architecture | resource | effort | schedule | risk`.

---

## Wave C — Orchestrator + retrieval + checkpoint

### Graph nodes (pure JS)

`understand → plan → select → execute → observe → evaluateLocal → feasibility`

- **evaluateLocal (G8)**: `enoughInfoToContinue`
- **feasibility (G13)**: plan pass/fail

### G7 Context Package

`{ query, citations[{ citationId, sourceId, snippet, score }], assembledAt }`

### G15 Checkpoint

Persisted on `PlanningRun.checkpoint` JSON (≠ run lifecycle).

### RULE-11 cutover

Do **not** delete in-process `aiAnalysis` yet. Gate behind `AI_PLANNING_REMOTE`. Rollback = set `0`.

---

## Enable remote

1. Deploy/build planning service: `bash devops/swarm/build-local-images.sh ai-project-planning-service`
2. `docker service update --force voicehub_ai-project-planning-service` (after stack has service)
3. In root + `services/project-service/.env`: `AI_PLANNING_REMOTE=1`
4. Ensure `AI_PROJECT_PLANNING_SERVICE_URL=http://ai-project-planning-service:3025` and `GATEWAY_INTERNAL_TOKEN` set
5. Rolling update `project-service`
