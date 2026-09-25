---
name: ai-project-primer
description: >-
  INVOKE FIRST for VoiceHub AI Project (Two-Phase HITL Planning) work — Phase 1
  WHAT / Phase 2 HOW, dedicated ai-project-planning-service, job projection,
  Gate 1/2, context+history control. Use before LangChain/Deep Agents skills.
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
- Designing or referencing **JEV** control layer (docs only until dedicated wave)
- Reading **3-layer** main flow or **3-track** pre-Agent-Core sequencing

## When NOT to use

- Unrelated FE/BE features (chat, org, auth)
- Pure RBAC without AI jobs
- `ai-task-service` / chat extract tasks

## Layer choice (after this primer)

1. Read this primer for **product modes** + **service split**.
2. Build Spec: `.cursor/plans/ai-project-build-spec-groups.plan.md` (§3.7; RULE-01…**14**).
3. Main flow 3-layer (RULE-13): [`docs/ai-project/main-flow-3layer.md`](../../docs/ai-project/main-flow-3layer.md).
4. Vá 3 track C→A→B **trước** Agent Core (RULE-14): [`docs/ai-project/pre-agent-core-3tracks.md`](../../docs/ai-project/pre-agent-core-3tracks.md).
5. JEV control layer (deferred, provider-agnostic): [`docs/ai-project/jev-control-layer.md`](../../docs/ai-project/jev-control-layer.md) — sau 3 track + Agent Core; **không** pin vendor.
6. Then `ecosystem-primer` if writing LangChain/LangGraph/Deep Agents code.
7. HITL → `langgraph-human-in-the-loop`.
8. RAG/Qdrant → `langchain-rag` only when G7 in-scope.
9. Deep Agents / LangGraph **F2 Agent Core** — HOW graph available behind `AGENT_CORE_F2` (default off); full HITL interrupt / JEV vẫn sau gate riêng.

## Mode → pattern map

| Mode | Apply |
|------|--------|
| Phase 1 WHAT | SRS-only LLM + deterministic requirement tools → VERIFIED_FACTS; HITL confirm |
| Gate 1 | Pack approve on **project-service** + GateA |
| Phase 2 HOW | Engines on **AI planning service**; soft history ≤0.1 on matching |
| Gate 2 | Confirm / approve on project facade; compute trên AI service |
| Start run | project → S2S AI → **202** + poll/event (không await LLM) |
| Early AI + calendar/history | **Do not** inject into WHAT LLM unless plan/whitelist says so |
| 3-layer read | Workflow A / Agent B / Governance C — cùng backbone |
| 3-track vá | C→A→B trước F2 (RULE-14) — **đã đóng** |
| Agent Core F2 | HOW LangGraph: `AGENT_CORE_F2=1` (`howPhaseGraph`); default `0` = JS `agentLoopRunner` |
| JEV 1/2/3 | Docs SoT only until sau Agent Core ổn + Step 5 score (RULE-12 / RULE-14) |

## SoT files (as-is → migrate)

- As-is (đến Wave C): `services/project-service/src/utils/aiAnalysis/**`
- To-be: `services/ai-project-planning-service/**`
- FE: `client/src/features/requirements/aiAnalysisWizardConstants.js`
- Jobs: `services/project-service/src/constants/aiAnalysisJobs.constants.js` (có thể mirror/shared constants sau Contract)
- System map: `docs/ARCHITECTURE.md` (mục AI Project)
- Main flow 3-layer: `docs/ai-project/main-flow-3layer.md`
- 3 tracks pre-Agent Core: `docs/ai-project/pre-agent-core-3tracks.md`
- JEV design: `docs/ai-project/jev-control-layer.md`

## Constraints

- `.cursor/rules/voicehub-constraints.mdc` — S2S clients trong `services/<name>/src/clients/`
- Swarm: build **chỉ** `ai-project-planning-service` khi đổi AI; không rebuild project vì AI
- Ollama / Qdrant: Compose extra — không nhét vào image project
- Snapshot ingest ≠ LLM input; Run bind `snapshotId`
- **JEV deferred:** không implement `jevClient` / env vendor trong remediation Step 5 / holes A–H; không pin TypeSafe/OpenRouter làm SoT runtime
- **Agent Core F2:** HOW graph available (`AGENT_CORE_F2`); default off — JS SoT; không interrupt Gate trong F2.0
