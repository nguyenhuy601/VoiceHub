---
name: ai-project-primer
description: >-
  INVOKE FIRST for VoiceHub AI Project (Two-Phase HITL Planning) work — Phase 1
  WHAT / Phase 2 HOW, dedicated ai-project-planning-service, job projection,
  Gate 1/2, context+history control. Use before LangGraph/Deep Agents skills.
---

# AI Project primer (VoiceHub)

**Product name:** AI Project — Two-Phase Human-in-the-Loop Planning Architecture.

**Runtime ownership (RULE-11):** LLM / orchestrator / tools compute / run / checkpoint sống trong **`ai-project-planning-service`** (+ optional worker). **`project-service`** = pack/project domain, Gate HTTP facade, **G20 materialize**, start-run **202** qua S2S — không chạy LLM in-process.

Không nhầm với **`ai-task-service`** (chat → task board).

## When to use

- Changing AI Analysis jobs, snapshot, matching, schedule, wizard Blueprint
- Scaffold / migrate sang `ai-project-planning-service`
- Designing LangGraph migration or HITL for AI Project
- Auditing which data enters LLM vs engine

## When NOT to use

- Unrelated FE/BE features (chat, org, auth)
- Pure RBAC without AI jobs
- `ai-task-service` / chat extract tasks

## Layer choice (after this primer)

1. Read this primer for **product modes** + **service split**.
2. Build Spec: `.cursor/plans/ai-project-build-spec-groups.plan.md` (§3.7).
3. Then `ecosystem-primer` if writing LangChain/LangGraph/Deep Agents code.
4. HITL → `langgraph-human-in-the-loop`.
5. RAG/Qdrant → `langchain-rag` only when G7 in-scope.
6. Deep Agents harness → only if multi-step beyond the planning pipeline.

## Mode → pattern map

| Mode | Apply |
|------|--------|
| Phase 1 WHAT | SRS-only LLM + deterministic requirement tools → VERIFIED_FACTS; HITL confirm |
| Gate 1 | Pack approve on **project-service** + GateA |
| Phase 2 HOW | Engines on **AI planning service**; soft history ≤0.1 on matching |
| Gate 2 | Confirm / approve on project facade; compute trên AI service |
| Start run | project → S2S AI → **202** + poll/event (không await LLM) |
| Early AI + calendar/history | **Do not** inject into WHAT LLM unless plan/whitelist says so |

## SoT files (as-is → migrate)

- As-is (đến Wave C): `services/project-service/src/utils/aiAnalysis/**`
- To-be: `services/ai-project-planning-service/**`
- FE: `client/src/features/requirements/aiAnalysisWizardConstants.js`
- Jobs: `services/project-service/src/constants/aiAnalysisJobs.constants.js` (có thể mirror/shared constants sau Contract)

## Constraints

- `.cursor/rules/voicehub-constraints.mdc` — S2S clients trong `services/<name>/src/clients/`
- Swarm: build **chỉ** `ai-project-planning-service` khi đổi AI; không rebuild project vì AI
- Ollama / Qdrant: Compose extra — không nhét vào image project
- Snapshot ingest ≠ LLM input; Run bind `snapshotId`
