---
name: AI Project Build Spec (Groups 1–20)
overview: Build Spec G1–G20 + Evidence. AI chạy trên microservice riêng ai-project-planning-service (+ optional worker) — không nhồi vào project-service. Spec-only; next Build Contracts then Step N only.
todos:
  - id: approve-build-spec
    content: Review/approve Spec G1–G20 + service split (§3.8) + RULE-01…14
    status: completed
  - id: contracts-wave-0
    content: "Wave 0: scaffold ai-project-planning-service + Swarm/gateway + S2S clients (empty graph)"
    status: completed
  - id: contracts-wave-a
    content: "Wave A: move/reuse tools+gates contracts — G9–G10,G13,G18,G19 skeleton; project thin facade"
    status: completed
  - id: contracts-wave-b
    content: "Wave B: G4+G17 runtime, G11–G12, G5–G6 facade, G20 init S2S"
    status: completed
  - id: contracts-wave-c
    content: "Wave C: G7 RAG, G8 orchestrator, G15 checkpoint, G16 feedback; strip aiAnalysis from project-service"
    status: completed
  - id: implement-step-gates
    content: Implement only after contract approved; each Cursor turn = Step N only + STOP
    status: completed
isProject: true
---

# AI Project — Build Specification (Groups 1–20)

**Type:** Architecture / Spec (không implement sản phẩm trong plan này)  
**Product:** AI Project — Two-Phase Human-in-the-Loop + Agentic Orchestration  
**SoT primer:** `.cursor/skills/ai-project-primer/SKILL.md`  
**Deploy SoT:** microservice **`ai-project-planning-service`** (không trùng `ai-task-service`) — triển khai Swarm **riêng** để không đội latency `project-service`.  
**Nguyên tắc vàng:** LangGraph điều phối — LLM suy luận (qua G17) — RAG cung cấp kiến thức — Tool tính toán (qua G18) — Validator kiểm tra — Human quyết định — **Project CRUD không chạy LLM in-process**.

---

## 1. Mục tiêu & phạm vi

### 1.1 Objective

- **Type:** Architecture
- **Business reason:** Chuẩn hóa ranh giới LLM vs Tool vs HITL để planning enterprise **chính xác, truy vết, human-centered** (không “LLM khổng lồ tự làm hết”).
- **Technical reason:** Diagram → **Build Spec 20 nhóm** + **tách microservice AI** khỏi `project-service` (isolation CPU/LLM/timeout) → Build Contract rồi mới code.
- **Expected outcome:** Spec approve; AI planning **không** chạy in-process trong `project-service`; Cursor không nhét LangGraph/Ollama vào project hot path.

### 1.2 Success Criteria — Definition of Done (spec phase)

- [ ] **20 nhóm** đủ 8 mục + cross-cutting Evidence
- [ ] **§3.7 Service Split** khóa ownership + async + S2S
- [ ] G8 Evaluate ≠ G13 Feasibility; Skill ≠ Tool ≠ Agent ≠ RAG
- [ ] RULE-01…**RULE-14** khóa; as-is map G1–G20; JEV deferred; 3 track trước Agent Core
- [ ] Lộ trình: Wave 0 scaffold service → Contracts → `Implement step N only. Stop for review.`

### 1.3 In-Scope

- Build Spec G1–G20 + LangGraph map + **dedicated `ai-project-planning-service`** (+ optional worker)
- Gap vs `project-service` aiAnalysis* (migrate-out target)
- Wave 0/A/B/C sequencing

### 1.4 Out-of-Scope

- **Không** product code trong phase Spec (kể cả scaffold — chờ approve + Wave 0 Contract)
- **Không** deploy Qdrant/LangGraph đến khi Contract Wave tương ứng approve
- **Không** đổi JWT / gateway trust model / RBAC packs / chat / voice / friend / org
- **Không** gộp vào `ai-task-service` (domain chat→task khác)
- **Không** giữ LLM/orchestrator lâu dài trong `project-service` sau Wave C (facade mỏng được phép)
- **Không** implement runtime **JEV 1/2/3** trong Spec/Contract waves hiện tại (control layer deferred — SoT: [`docs/ai-project/jev-control-layer.md`](../../docs/ai-project/jev-control-layer.md); provider-agnostic, không pin vendor)
- **Không** bắt đầu **Agent Core (LangGraph F2)** / JEV runtime trước khi Track C→A→B đạt DoD docs+contract — [`docs/ai-project/pre-agent-core-3tracks.md`](../../docs/ai-project/pre-agent-core-3tracks.md) (RULE-14)

---

## 2. Files Affected (spec phase)

### 2.1 CREATE

- `.cursor/plans/ai-project-build-spec-groups.plan.md` (file này)
- (Sau approve) `.cursor/plans/ai-project-build-contract-GNN.plan.md`

### 2.2 MODIFY / 2.3 DELETE

- none (spec phase)

### 2.4 DO NOT MODIFY (đến khi Contract + step implement)

- `services/project-service/src/utils/aiAnalysis/**`
- `services/project-service/src/constants/aiAnalysisJobs.constants.js`
- `client/src/features/requirements/**`
- Auth / gateway / org / chat / voice

### 2.5 Dependency / Impact

```text
G19 Run Management ──binds──► Snapshot (RULE-06 / RULE-09)
G1 Knowledge ← G2 Input ← G3 Ingestion
         ↓
G4 Understanding ──uses──► G17 Intelligence Runtime
         ↓
G5 Gate1 → G6 SRS Canonical
         ↓
G7 RAG (opt) ──► Context Package
         ↓
G8 Orchestrator ──selects──► G18 Tool Registry ──► G9–G12 Tools
         ↓                      ▲
    G8 Evaluate (local)         │
         ↓                      │
G13 Feasibility (whole plan)    │
         ↓                      │
G14 Gate2 → G20 Project Init    │
         ↓                      │
G16 Feedback (P1+P2) ───────────┘
G15 Checkpoint persists AgentState in Redis (`vh:ai-plan:g15:{runId}`); G19 Run is Mongo lifecycle only
```

**Deploy:** Swarm service **`ai-project-planning-service`** (build/update riêng); `project-service` chỉ facade/S2S; Ollama/Qdrant = Compose extra; **không** build lại project khi chỉ đổi AI graph.

### 2.6 Nguồn dữ liệu

N/A — spec-only. Build Contract từng nhóm bắt buộc điền §2.6 khi chạm HTTP.

---

## 3. Thiết kế & trách nhiệm

### 3.1 Architecture — 4 lớp (+ runtime/registry) + cross-cut JEV + khung đọc 3-layer

**Khung đọc vận hành (RULE-13):** Layer A Workflow · Layer B Agent · Layer C Governance — SoT: [`docs/ai-project/main-flow-3layer.md`](../../docs/ai-project/main-flow-3layer.md). Cùng backbone Two-Phase; không thay G1–G20. Vá lỗ theo 3 track C→A→B **trước** Agent Core: [`docs/ai-project/pre-agent-core-3tracks.md`](../../docs/ai-project/pre-agent-core-3tracks.md).

```text
1. ORCHESTRATION     G8 LangGraph + G19 Run + G15 Checkpoint + G5/G14 HITL + G16 Feedback
2. INTELLIGENCE      G17 Runtime: model/session/skill/prompt/budget/structured output/tool-call parse
3. KNOWLEDGE         G1 catalogs + G7 RAG (retrieve → rerank → assemble)
4. DETERMINISTIC     G18 Registry → G9–G12 Tools + G3/G13 Validators + G20 Project Init
X. JEV (deferred)    Control layer: JEV1 RAG confidence → Gate1; JEV2 model/risk → G17; JEV3 supervisor → G8
                     Provider-agnostic (Choice/Score/Noul + confidence). Không thay Snap/Tools/RAG/G13.
                     SoT: docs/ai-project/jev-control-layer.md — sau 3 track + Agent Core (RULE-14)
```

**Cấm hiểu sai:** Layer 2 ≠ “gọi Ollama với prompt khổng lồ tự làm hết”. Mọi LLM call đi qua **G17**; mọi business execution đi qua **G18 → Tool**. JEV ≠ LLM ≠ Tool ≠ Feasibility. Sơ đồ phẳng **không** được trộn Agent cycle vào Workflow (RULE-13).

### 3.2 RULES

| ID | Rule |
|----|------|
| RULE-01 | LLM **không** tự tính effort, employee score, schedule, capacity bằng suy luận |
| RULE-02 | LLM chọn tool → G18 Registry → Deterministic Tool → Result + Evidence → LLM chỉ diễn giải (G17) |
| RULE-03 | Phase 2 **chỉ** đọc Approved SRS Canonical — không Excel gốc |
| RULE-04 | AI output **không** auto-approve; Gate 1 / Gate 2 bắt buộc human |
| RULE-05 | Reject / feedback → Impact → selective re-plan (không full restart mặc định) |
| RULE-06 | Snapshot ingest ≠ LLM context; projection/whitelist theo job/profile/skill |
| RULE-07 | Knowledge/RAG **không** assign / estimate / schedule / approve |
| RULE-08 | Tool call **chỉ** qua G18 registered tools; cấm Agent gọi DB/API business trực tiếp |
| RULE-09 | Mỗi Run **bind** `snapshotId`; không đọc live DB giữa chừng để tránh plan lai hai thời điểm |
| RULE-10 | Mọi numeric/business claim trong result phải kèm `evidence[]` (cross-cutting Evidence) |
| RULE-11 | **AI planning runtime (G4/G7/G8/G15–G19, G17–G18, G9–G13 compute) sống trong `ai-project-planning-service`** — không chạy LLM/orchestrator in-process trong `project-service`. Project chỉ domain pack/project + Gate HTTP facade + **G20 materialize**. Giao tiếp S2S + async run (202 + poll/event). Không shared DB / cross-populate. |
| RULE-12 | **JEV = control layer** trên evidence/Context đã bind `snapshotId`; không execute tool; không đọc CURRENT; không thay G13 feasibility metrics; không auto-approve Gate. Provider-agnostic; runtime deferred — [`docs/ai-project/jev-control-layer.md`](../../docs/ai-project/jev-control-layer.md). |
| RULE-13 | **SoT vận hành đọc theo Layer A/B/C** — Workflow / Agent / Governance. Cấm sơ đồ phẳng trộn Agent cycle vào Workflow. Cùng backbone Two-Phase; không thay G1–G20 — [`docs/ai-project/main-flow-3layer.md`](../../docs/ai-project/main-flow-3layer.md). |
| RULE-14 | **Không bắt đầu Agent Core (LangGraph F2) / JEV runtime** trước khi Track C→A→B đạt DoD docs + contract gate — [`docs/ai-project/pre-agent-core-3tracks.md`](../../docs/ai-project/pre-agent-core-3tracks.md). Wave F JS evaluate ∈ Track B prep. **F2 HOW unlocked** (2026-09): `AGENT_CORE_F2=1` → LangGraph; default `0` = JS SoT. JEV vẫn deferred. |

### 3.3 Bảng nhóm G1–G20

| G | Chức năng |
|---|-----------|
| G1 | Knowledge & Shared Resources |
| G2 | Input Sources |
| G3 | Ingestion & Data Quality |
| G4 | Requirement Understanding |
| G5 | Human Review Gate 1 |
| G6 | SRS Canonical |
| G7 | Semantic / RAG |
| G8 | Agentic Planning Orchestrator |
| G9 | Core Planning Tools (Requirement / Resource / Effort) |
| G10 | Schedule Tool |
| G11 | Architecture Analysis Tool |
| G12 | Risk Analysis Tool |
| G13 | Automated Feasibility |
| G14 | Human Review Gate 2 |
| G15 | Agent State & Checkpoint |
| G16 | Feedback & Re-planning (Phase 1 + Phase 2) |
| G17 | AI Intelligence Runtime / Skills |
| G18 | Tool Registry & Policy |
| G19 | AI Run & Execution Management |
| G20 | Project Initialization |

**Cross-cutting (không thành Group riêng):** Evidence/Provenance · Observability · Security/Authorization · Idempotency · Versioning · Error/Retry.

### 3.4 Bắt buộc: G8 Evaluate ≠ G13 Feasibility

| | **G8 Evaluate** | **G13 Feasibility** |
|--|-----------------|---------------------|
| Câu hỏi | “Tôi có **đủ thông tin** để tiếp tục không?” | “**Kế hoạch cuối** có khả thi không?” |
| Phạm vi | Một action / một tool result / iteration | Toàn bộ plan trước Gate 2 |
| Ví dụ | Matching thiếu calendar → cần Schedule Tool; evidence thiếu → gọi lại / tool khác | Coverage FR 100%? Hours ≤ capacity? Deadline? Circular dep? Risk threshold? |
| Kết quả | Continue / Select other tool / Re-plan local / Need retrieve | `pass` \| `failures[]` → mở hoặc chặn Gate 2 |

**Cấm:** Gộp Evaluate và Feasibility thành một node/service.

### 3.5 Bắt buộc: Skill ≠ Tool ≠ Agent ≠ RAG

| Khái niệm | Là gì | Không phải |
|-----------|-------|------------|
| **Skill** | Instruction/capability package cho LLM (objective, methodology, output structure, constraints interpretation, **tool usage policy**) | Không calculate schedule/capacity |
| **Tool** | Executable **deterministic** capability (registered in G18) | Không “suy luận tự do” |
| **Agent** | Runtime decision-maker (G8): understand / plan / select / interpret / re-plan strategy | Không truy cập DB business trực tiếp |
| **RAG** | Knowledge retrieval (G7) | Không assign / estimate / approve |
| **Runtime (G17)** | Thực thi LLM call: model, session, skill load, prompt, budget, structured output, tool-call parse | Không business metric |

Ví dụ: **Planning Skill** dạy LLM *khi nào* gọi Matching/Schedule — **không** tự tính schedule.

### 3.6 As-is map

| G | Status | Ghi chú |
|---|--------|---------|
| 1 | PARTIAL | Catalogs + attachG1; Qdrant ingest Step 5 wired (default mode stub) |
| 2 | EXISTS | Import SRS + system supplement |
| 3 | AVAILABLE | Parse/normalize/validate; `aiAnalysis.ingestionRunId` stamped once (ensureAiAnalysisContainer) |
| 4 | AVAILABLE | G4 trên APS + Gate1 materialize; Phase1 LLM in-process forbidden (RULE-11) |
| 5 | EXISTS | Pack approve + GateA + Conflict/Ambiguity override |
| 6 | AVAILABLE | Approved pack; `aiAnalysis.approvedSrsVersion` freeze at Gate1 |
| 7 | AVAILABLE | hybrid+Qdrant Step 5 (`G7_RAG_MODE=hybrid`); stub:false khi hits |
| 8 | AVAILABLE | Agent Core F2 HOW LangGraph (`AGENT_CORE_F2`); default JS SoT |
| 9 | EXISTS | Matching/effort/requirement engines via G18 |
| 10 | EXISTS | scheduleCapacity + sequencingCpm |
| 11 | PARTIAL | ArchitectureTool heuristic |
| 12 | PARTIAL | RiskTool heuristic |
| 13 | PARTIAL | `deriveFeasibilityFlags` từ tool evidence (không hardcode HOW) |
| 14 | PARTIAL | Per-job confirm; reject→impact mỏng |
| 15 | AVAILABLE | Redis G15 + LangGraph RedisSaver (`AGENT_CORE_LG_MEMORY=0`) |
| 16 | PARTIAL | Feedback + selectiveReplan tool map |
| 17 | AVAILABLE | `runIntelligence` + timeout/budget; JEV2 route khi `JEV_CONTROL=1` |
| 18 | EXISTS | Registry + schemas + full HOW_PHASE_TOOL_STEPS |
| 19 | EXISTS | Run lifecycle + snapshot bind |
| 20 | PARTIAL | Gate2 promote + idempotencyKey replay |

**As-is 12 jobs:** WHAT = hierarchy → requirementAnalysis → capability → insights; HOW = wbs → dependency → architectureRisk → effort → CPM → matching → schedule → projectPlan (phase_how = full G18 chain).

### 3.7 Service Split — `ai-project-planning-service` (bắt buộc)

**Quyết định:** Tách toàn bộ AI Project planning khỏi `project-service` thành microservice riêng, deploy Swarm độc lập, để **CRUD/project API không bị latency / event-loop block bởi LLM**.

| | Service | Ownership |
|--|---------|-----------|
| **A** | `project-service` | RequirementPack domain, import entry (G2 facade), Gate 1/2 **HTTP** (authorize + persist pack status), **G20** materialize WBS/assignments vào project DB, FE-facing thin APIs |
| **B** | **`ai-project-planning-service`** | G3 DQ cho AI snapshot (hoặc nhận normalized từ project), G4, G6 canonical copy/version for planning, G7, G8, G9–G13 **compute**, G15–G19, G17, G18, Evidence store, Run/Checkpoint DB **riêng** |
| **C** | `ai-project-planning-worker` (optional Wave B+) | Long-running LLM/tool iterations (queue consumer) — giống pattern `ai-task-worker` |
| **D** | Compose extra | Ollama, (to-be) Qdrant — **không** nhét vào image Swarm project |
| **E** | `ai-task-service` | **Không đụng** — domain chat→task khác |

**Latency model (bắt buộc)**

```text
Browser
  → Gateway → project-service   (fast: validate, authz, enqueue/start run, 202)
                    │ S2S x-gateway-internal-token
                    ▼
           ai-project-planning-service  (slow: G17/G8/tools)
                    │ optional queue
                    ▼
           ai-project-planning-worker + Ollama (Compose)
                    │
                    ▼
           callback / event / poll → project-service cập nhật pack job status
```

- Project API **không** `await` full LLM trong request cycle.
- Client: poll job/run status hoặc notification/socket (Contract chọn 1).
- Scale AI replicas / CPU **không** kéo theo scale project CRUD.

**S2S rules (VoiceHub)**

- Client HTTP chỉ trong `services/<name>/src/clients/` — **cấm** business client trong `shared/`.
- Tin `x-user-id` chỉ khi internal token hợp lệ.
- **Không** shared Mongo giữa project và AI planning; AI nhận **snapshot payload** (RULE-09) qua S2S, không join DB project.
- Event schema chéo service: `shared/messaging/` nếu dùng Rabbit (optional).

**Migration**

1. Wave 0: scaffold service + health + Swarm + env `AI_PROJECT_PLANNING_SERVICE_URL` — **chưa** cắt traffic.
2. Wave A–B: dual-run / feature flag `AI_PLANNING_REMOTE=1` — project facade gọi AI service.
3. Wave C: xóa in-process `aiAnalysis` orchestrator khỏi project (giữ domain models + G20).

**AC §3.7**

- [ ] `project-service` p95 CRUD pack/project không tăng khi AI run đang chạy (cùng host: AI process riêng).
- [ ] Start analysis trả **202** (hoặc jobId ngay) — không block đến khi LLM xong.
- [ ] Build/deploy AI: `bash devops/swarm/build-local-images.sh ai-project-planning-service` (+ worker nếu có) — **không** bắt buộc rebuild project.
- [ ] Không import `aiAnalysis` pipeline vào request handler project sau Wave C.

---

### 3.8 Cross-cutting — Evidence / Provenance Contract (bắt buộc)

Mọi tool/result/interpret claim business phải kèm `evidence[]`.

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
  "timestamp": "2026-09-16T10:00:00Z",
  "ruleId": "CAP-003"
}
```

Envelope chuẩn:

```json
{
  "result": {},
  "evidence": []
}
```

**AC cross-cut:** UI giải thích được “vì sao đề xuất Employee B” từ evidence; thiếu evidence → validator fail (RULE-10).

**Các cross-cut khác (Contract điền chi tiết):** Observability (`runId`, `iteration`, `toolName`, `evidenceIds`, model/version); Security (gateway token + JWT; không lộ PII thừa); Idempotency (G19/G20); Versioning (SRS, skill, tool, snapshot); Error/Retry (timeout tool ≠ timeout LLM).

---

## 4. Build Spec theo nhóm

---

### G1 — Knowledge & Shared Resources

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Nguồn tin cậy dùng chung; **không** phải Agent |
| **Input** | Import, DB, history, config, catalog, approved SRS |
| **Xử lý** | Store + version + expose; Metric/Dimension canonical |
| **Output** | SRS entities, system data, metric defs, (to-be) vector corpus |
| **Responsibility** | Catalog SoT; nghĩa metric (vd. `employee_capacity = available − committed`) |
| **Không được làm** | Plan, assign, WBS, estimate, LLM business logic |
| **Dependency** | Org/user/project DBs; G2–G3 |
| **AC** | Metric dùng trong tool có catalog entry; không write path từ LLM vào catalog |

---

### G2 — Input Sources

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Entry Phase 1: Imported SRS Pack + System Supplement |
| **Input** | BG/BR/FR/NFR/UC/Arch/Test; Org/Employee/Role/Skill/Calendar/Project/Task/History |
| **Xử lý** | Thu thập + `sourceVersion` |
| **Output** | Raw pack + supplement refs → G3 |
| **Responsibility** | Phân loại nguồn |
| **Không được làm** | LLM extraction; approve; planning |
| **Dependency** | G1; FE import |
| **AC** | Mỗi run ghi loại nguồn; không lẫn supplement/SRS không version |

---

### G3 — Ingestion & Data Quality

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Deterministic: Parse → Normalize → Map → Dedup → Validate → Version → Persist |
| **Input** | Raw G2 |
| **Xử lý** | Parse; normalize enum; map Position/Skill; duplicates; validate refs |
| **Output** | `{ ingestionRunId, sourceVersion, normalizedData, validationResult, warnings[], errors[] }` |
| **Responsibility** | DQ gate trước AI |
| **Không được làm** | Agent; LLM đoán FR trong bước này |
| **Dependency** | G1, G2 |
| **AC** | Same input → same normalized hash; catalog miss → error/warn theo policy |

---

### G4 — Requirement Understanding

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Projection → extract → relationship → structured → validate |
| **Input** | Normalized requirements + **projected context theo whitelist/profile** (RULE-06) |
| **Xử lý** | Qua **G17**: terminology/ambiguity/extract; candidate relationships; validator tồn tại + circular |
| **Output** | `{ requirements, relationships, ambiguities, assumptions, evidence }` |
| **Responsibility** | Intelligence Phase 1 (via G17); relationship = candidate đến khi validate/human |
| **Không được làm** | Auto-approve; tính effort/match/schedule; **dùng Employee pool để diễn giải requirement** trừ khi profile/whitelist có business reason (xem ghi chú) |
| **Dependency** | G3, G1, G17; projection profiles |
| **AC** | Relationship có evidence + target tồn tại; circular fail; mọi LLM call qua G17 có model/skill/prompt version |

**Ghi chú policy (sửa tuyệt đối hóa cũ):**  
Requirement Understanding **không** được dùng Employee pool để interpretation theo mặc định. Employee / historical team chỉ được **project vào context** khi job/profile có business reason **và** whitelist cho phép — khớp RULE-06. **Không** đồng nghĩa “LLM Phase 1 không bao giờ được biết employee trong mọi trường hợp”.

---

### G5 — Human Review Gate 1

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | HITL trước baseline; `interrupt()` (to-be) |
| **Input** | AI output G4 + pack metadata |
| **Xử lý** | Approve / Edit / Reject / Comment / Request regen |
| **Output** | `reviewStatus` + versioned draft; feedback → G16 (`requirement_feedback`) |
| **Responsibility** | Human decision |
| **Không được làm** | AI → auto Approved |
| **Dependency** | G4, G19 (run status `waiting_human`), authz |
| **AC** | Không skip Gate 1; state đủ run/project/version/aiOutput/humanChanges/reviewer/status/comments/timestamp |

---

### G6 — SRS Canonical Model

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Baseline chính thức sau Gate 1 cho Phase 2 |
| **Input** | Reviewed/approved pack |
| **Xử lý** | Materialize canonical + version + `status=approved` |
| **Output** | Canonical SRS JSON |
| **Responsibility** | SoT Phase 2 |
| **Không được làm** | Phase 2 đọc Excel gốc |
| **Dependency** | G5 |
| **AC** | HOW/tools fail nếu thiếu approved version; edit = version mới + re-gate |

---

### G7 — Semantic & Knowledge Layer / RAG

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Query → Retrieval → Rerank/Filter → Context Assembly |
| **Input** | Agent intent; indexes G1; optional G6 corpus |
| **Xử lý** | Vector + keyword + metadata + relationship; top-k |
| **Output** | Context Package (citations/source ids) |
| **Responsibility** | Knowledge only |
| **Không được làm** | Assign, schedule, effort, approve |
| **Dependency** | G1; consumed by G8/G17 |
| **AC** | 4 bước testable; citation bắt buộc; không write planning |
| **JEV touchpoint** | **JEV 1** (deferred): confidence / RAG relevance trên Context Package trước Gate 1 — xem [`docs/ai-project/jev-control-layer.md`](../../docs/ai-project/jev-control-layer.md) |

---

### G8 — Agentic Planning Orchestrator

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Loop: Understand → Plan → Select Tool → Execute → Observe → **Evaluate (local)** → Re-plan/Continue |
| **Input** | Approved SRS + context + AgentState + **allowed tools từ G18** |
| **Xử lý** | LangGraph; quyết định qua G17; execute **chỉ** tool đã register G18; **Evaluate = đủ thông tin tiếp tục?** (không thay G13) |
| **Output** | Updated state; plan artifacts; toolResults + evidence |
| **Responsibility** | Orchestration |
| **Không được làm** | RULE-01; bypass G18; hardcode `if (action===matching)`; gọi DB trực tiếp; gộp Evaluate với G13 |
| **Dependency** | G6, G7(opt), G17, G18, G9–G12, G15, G19 |
| **AC** | Numeric chỉ từ toolResults+evidence; mỗi iteration log action/tool/evidence; Evaluate fail → local re-plan/select tool — không full ingest |
| **JEV touchpoint** | **JEV 3** (deferred): supervisor confidence / enough-info tư vấn CONTINUE\|RETRIEVE\|NEED_TOOL — **không** thay G13; optional tool-guard trước G18 |

**AgentState tối thiểu:** `runId, projectId, approvedSrsVersion, snapshotId, context, currentGoal, currentPlan, currentAction, toolResults, evidence, unresolvedIssues, evaluationResult` *(local)*`, humanFeedback, iteration, status`.

**Evaluate (G8) — checklist:** tool result đủ dữ liệu? evidence đủ? missing input? cần tool khác? conflict với context?

---

### G9 — Core Planning Tools (Requirement / Resource / Effort)

> Đổi tên từ “Shared Planning Tools”. **Không** phải umbrella của G10–G12 — ngang hàng với Schedule / Architecture / Risk.

| Tool | Input | Output |
|------|-------|--------|
| Requirement Analysis | SRS Canonical + AI context | relations, coverage, gaps + evidence |
| Employee Matching | task, employees, skills, calendar, history, constraints | candidates, scores, capacity evidence, conflicts |
| Effort Estimation | requirement, WBS, history, complexity, team | hours/duration, confidence, evidence |

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Deterministic requirement / matching / effort + evidence |
| **Responsibility** | Layer 4 (qua G18) |
| **Không được làm** | LLM ước lượng thay công thức/model đã chốt |
| **Dependency** | G1 metrics; G6; snapshot (RULE-09); G18 registration |
| **AC** | Same input → same score/hours; evidence bắt buộc; LLM không ghi đè số |

---

### G10 — Schedule Tool

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Slots / CPM / capacity conflict từ calendar snapshot |
| **Input** | WBS, deps, effort, availability, calendar (snapshot) |
| **Xử lý** | Deterministic slotting + critical path |
| **Output** | start/end, duration, timeSlots, criticalPath, capacityConflict + evidence |
| **Không được làm** | LLM suy “4h/day” ngoài calendar rules |
| **Dependency** | G9 outputs; G1 calendar; G18 |
| **AC** | Working hours; conflict flagged; reproducible trên cùng snapshot |

---

### G11 — Architecture Analysis Tool

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Impact từ Architecture Catalog + constraints (+ evidence) |
| **Input** | SRS, catalog, tech, integration, constraints |
| **Output** | impact, components, integration, tech constraints, risk signals + evidence |
| **Không được làm** | Approve architecture; invent catalog entries |
| **Dependency** | G1 catalog; G6; G18 |
| **AC** | Component cited có catalog id; missing → explicit gap |

---

### G12 — Risk Analysis Tool

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Risk theo policy + evidence |
| **Input** | Requirement, architecture, dependency, resource, schedule, history, policy |
| **Output** | risk, severity, probability, impact, evidence, mitigation |
| **Không được làm** | Auto-accept trên threshold |
| **Dependency** | G9–G11; G1 policy; G18 |
| **AC** | Threshold từ policy catalog; evidence bắt buộc |

---

### G13 — Automated Feasibility & Validation

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Validator **toàn plan** trước Gate 2 — **không** trùng G8 Evaluate |
| **Input** | Agent plan + toàn bộ tool evidence |
| **Xử lý** | Coverage FR; resource; schedule/deps/deadline; architecture; circular; risk threshold |
| **Output** | `{ pass, failures[], evidenceRefs[] }` |
| **Không được làm** | Human UI; tự re-plan; thay thế G8 Evaluate |
| **Dependency** | G8–G12 |
| **AC** | Fail → không mở Gate 2 approve (trừ force có audit); mã lỗi ổn định; test phân biệt Evaluate vs Feasibility |
| **JEV touchpoint** | **Không** map JEV → pass/fail plan. Feasibility vẫn deterministic từ tool evidence (RULE-12) |

---

### G14 — Human Review Gate 2

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Final planning approval |
| **Input** | Plan, WBS, assignment, effort, schedule, arch, risk, evidence, G13 result |
| **Xử lý** | Approve / Edit / Reject / Comment |
| **Output** | Approve → **G20**; Reject/Edit → G16 (`planning_feedback`) |
| **Không được làm** | Reject → full restart từ Ingest/G4 |
| **Dependency** | G13; G19 `waiting_human` |
| **AC** | Approve chỉ khi G13 pass (hoặc force+audit); Reject → structured feedback |

---

### G15 — Agent State & Checkpoint

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Persist AgentState checkpoint — **không** thay G19 Run Management |
| **Input** | Mọi node write trong một Run |
| **Xử lý** | Persist state, node, tool results, plan, iteration, human feedback, context snapshot ref trên **Redis only** |
| **Output** | Resumable graph state |
| **Không được làm** | Quản lý queue/cancel/ownership run (thuộc G19); dual-write Mongo AgentState; mất evidence giữa interrupt |
| **Dependency** | G8, G5, G14, G19 |
| **AC** | Resume `loadCheckpoint` Redis; miss → CHECKPOINT_MISSING; snapshotId không đổi (RULE-09); SoT key `vh:ai-plan:g15:{runId}` |

---

### G16 — Feedback & Re-planning (Phase 1 + Phase 2)

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Feedback subsystem chung — Loop 1 (SRS regen) **và** Loop 2 (selective re-plan) |
| **Input** | `requirement_feedback` (Gate 1 / regen) **hoặc** `planning_feedback` (Gate 2) |
| **Xử lý** | Parser → Impact Analysis → State Update → Re-planner / regenerate |
| **Output** | Partial re-execution plan + updated state |
| **Không được làm** | Full pipeline restart mặc định |
| **Dependency** | G5, G14, G8, G4, G15, G19 |
| **AC** | Case “không dùng Employee A” → chỉ matching→schedule→feasibility; case “sửa FR wording” → requirement understanding → Gate 1 — không chạy matching |

**Feedback kinds**

```text
Feedback
 ├── requirement_feedback  → Requirement impact → Regenerate G4 → Gate 1
 └── planning_feedback     → Planning impact → Selective re-plan → G13 → Gate 2
```

**Impact Scope (whitelist):** `requirement | WBS | architecture | resource | effort | schedule | risk`

---

### G17 — AI Intelligence Runtime / Skills

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Runtime LLM/Skills cho G4 và G8 — **chống** “LangGraph → Ollama → prompt khổng lồ → LLM làm hết” |
| **Input** | Agent state; Skill id/version; prompt template; Context Package; **tool schemas từ G18** (không raw DB) |
| **Xử lý** | Model selection; skill loading; prompt assembly; structured output; tool-call parsing; token/context budget; timeout/retry; session management; fallback model |
| **Output** | Structured LLM response; tool-call **request** (chưa execute); reasoning/interpretation |
| **Responsibility** | Intelligence **execution** layer |
| **Không được làm** | Tự tính business metric; truy cập DB business trực tiếp; bypass Tool/G18; tự approve; execute tool side-effects |
| **Dependency** | G7 context; G8 orchestration; G18 schemas; model provider / Ollama |
| **AC** | Mọi LLM call log `model/version`, `prompt/skill version`, `runId`; structured output validate trước khi vào State; tool-call name ∈ G18 registry; budget/timeout enforced |
| **JEV touchpoint** | **JEV 2** (deferred): model router + risk gater trước LLM call — mở rộng `selectModel`; provider-agnostic |

**Skill package tối thiểu:** `skillId, version, objective, methodology, outputSchema, constraintInterpretation, toolUsagePolicy, allowedToolNames[]`.

---

### G18 — Tool Registry & Policy

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | SoT danh sách tool + policy; Agent chọn **capability**, không tự ý infrastructure |
| **Input** | Tool descriptors đăng ký lúc build/deploy |
| **Xử lý** | Resolve tool by name; enforce `allowedContexts`, `requires`, permissions, timeout/retry |
| **Output** | Executable tool handle + validated I/O schemas |
| **Responsibility** | Gate trước mọi deterministic business execution từ Agent |
| **Không được làm** | Expose toàn bộ service API cho LLM; hardcode if-else tool ngoài registry |
| **Dependency** | G9–G12 implementations; G8/G17 consumers |
| **AC** | Call ngoài registry → reject; thiếu `requires` (vd. approvedSrs/snapshot) → reject; unit test policy matrix |

**Descriptor bắt buộc**

```text
toolName, version, description,
inputSchema, outputSchema, evidenceSchema,
permissions, allowedContexts[], requires[],
timeout, retryPolicy
```

**Ví dụ EmployeeMatchingTool**

- `allowedContexts`: `planning`
- `requires`: `approvedSrs`, `employeeSnapshot`, `calendarSnapshot`
- `returns`: candidates, scores, capacityEvidence, conflicts (+ evidence)

```text
Agent → Tool Registry → EmployeeMatchingTool → EmployeeMatchingService
(cấm: Agent → employee-db.query())
```

---

### G19 — AI Run & Execution Management

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Lifecycle Run — **khác** G15 Checkpoint (checkpoint ⊂ persistence trong một run) |
| **Input** | start/resume/cancel/retry requests; trigger; initiatedBy |
| **Xử lý** | Queue; status machine; timeout; idempotency; concurrency; ownership; **snapshot binding** |
| **Output** | Run record + status transitions |
| **Responsibility** | Execution management / consistency |
| **Không được làm** | Đổi `snapshotId` giữa run; đọc live capacity khi employee đổi giữa chừng (RULE-09) |
| **Dependency** | G3/G1 snapshot creation; G8/G15; G5/G14 waiting_human |
| **AC** | Status enum đầy đủ; resume không đổi snapshot; cancel idempotent; concurrent run policy documented |

**Run status**

```text
queued | running | waiting_human | replanning | completed | failed | cancelled | expired
```

**Run fields tối thiểu:** `runId, projectId, snapshotId, startedAt, completedAt, currentNode, iteration, attempt, trigger, initiatedBy, status`.

```text
Run → Snapshot (bound) → Consistent planning context
(cấm: Run 30' đọc live DB khi capacity đổi → plan lai)
```

---

### G20 — Project Initialization

| Mục | Nội dung |
|-----|----------|
| **Mục đích** | Materialize approved plan → project data — **deterministic application service, không phải Agent** |
| **Input** | Approved plan; Approved SRS; Human Gate 2 approval; G13 pass (hoặc force+audit) |
| **Xử lý** | Persist WBS, roles, assignments, schedule, milestones/releases, risks, planning artifacts |
| **Output** | Project Ready (activated project + artifact ids) |
| **Responsibility** | Application persistence after approval — **chạy trên `project-service`** (project DB ownership; RULE-11) |
| **Không được làm** | Tự sửa plan; tự chọn employee; chạy LLM; gọi G8; ghi project DB từ AI service |
| **Dependency** | G14 approve; G6; plan artifacts từ AI service (S2S payload) |
| **AC** | Chỉ sau Gate 2 approve; **idempotent**; audit trail; AI service **không** sở hữu project collections |

```text
Approved Plan → Project Initialization → Create/activate WBS, roles, assignments,
schedule, milestones, risks, artifacts → Project Ready
```

---

## 5. Test plan (Spec + Contract)

| ID | Check | Pass |
|----|-------|------|
| T-SPEC-1 | §1.2 + 20 groups + cross-cut Evidence | All checked |
| T-SPEC-2 | §3.4 Evaluate≠Feasibility có trong Contract G8 & G13 | Có test case phân biệt |
| T-SPEC-3 | §3.5 Skill≠Tool≠Agent≠RAG trong G17/G18 | Có |
| T-SPEC-4 | As-is §3.6 khớp repo | Không lệch |
| T-CON-1 | Mỗi G Wave có Build Contract đủ 11 mục §11 | File + review |
| T-UNIT-* | `node --test services/ai-project-planning-service/tests/*.test.js` (+ project facade tests) | Pass |
| T-REG | Wizard Phase1→Gate1→HOW; không 500 trên `https://voicehub.local` | Smoke |

---

## 6. Risk & trade-off

| Risk | Impact | Prob | Mitigation | Fallback |
|------|--------|------|------------|----------|
| G8 = Ollama monolith | High | Med | G17+G18+RULE-01/02/08 bắt buộc trước implement G8 | Giữ 12-job pipeline |
| Evaluate ≡ Feasibility | High | Med | §3.4 + separate nodes/tests | Code review reject |
| Run không bind snapshot | High | Med | G19 + RULE-09 | Freeze snapshot as-is |
| Registry hardcode if-else | Med | High | G18 AC + policy matrix tests | toolRegistry mở rộng |
| PROJECT_INIT nhầm Agent | Med | Med | G20 deterministic only | Service function + audit |
| Feedback chỉ Gate 2 | Med | Med | G16 P1+P2 kinds | Manual regen as-is |
| Sync S2S chậm / timeout | Med | Med | 202 + poll; timeout AI ≠ timeout project | Retry idempotent G19 |
| Nhầm `ai-task-service` | Med | Low | Tên `ai-project-planning-service`; §3.7 bảng E | Code review |
| Dual-write migrate | Med | Med | Feature flag `AI_PLANNING_REMOTE`; Wave C cutover | Rollback flag off |

### 6.1 Decision

| Decision | Alternative | Reason |
|----------|-------------|--------|
| **Tách `ai-project-planning-service` ngay (Wave 0)** | Giữ AI trong project đến hết Wave C | Tránh latency/event-loop project; scale AI độc lập |
| 20 groups + cross-cut Evidence | Giữ 16 groups | Chặn hiểu sai runtime/registry/run/init |
| G17 riêng (không nhét G8) | Prompt trong orchestrator | SoT model/skill/budget |
| G18 riêng | Hardcode trong G8 | Capability vs infrastructure |
| G19 ≠ G15 | Checkpoint = run mgmt | Lifecycle + snapshot binding |
| G20 ở **project-service** | G20 trong AI service | Project DB ownership; AI không ghi project collection |
| Worker optional | LLM sync trong API process | Pattern `ai-task-worker`; bảo vệ event loop AI service |

### 6.2 Security / 6.3 Rollback / 6.4 Observability

- Spec phase: không đổi authz
- Contract: gateway internal token + JWT; `/internal/*` không JWT user
- Rollback: revert plan; sau code — feature flag + Swarm image rollback
- Observability: `runId, snapshotId, iteration, toolName, evidenceIds, model, skillVersion`

---

## 7. Mapping LangGraph (to-be)

> Đọc vận hành theo Layer A/B/C: [`docs/ai-project/main-flow-3layer.md`](../../docs/ai-project/main-flow-3layer.md). F2 LangGraph chỉ sau Track C→A→B (RULE-14).

```text
START → INGEST(G3) → REQUIREMENT_UNDERSTANDING(G4 via G17)
  → VALIDATE_REQUIREMENTS → HUMAN_GATE_1(G5)
  → CREATE_SRS_CANONICAL(G6) → CREATE_CONTEXT(G7 opt)
  → PLANNING_AGENT(G8)
       → PLAN → SELECT_ACTION(G18) → EXECUTE_TOOL → OBSERVE
       → EVALUATE_LOCAL(G8)     // đủ info?
            ├─ need info → RETRIEVE(G7)
            ├─ need tool → SELECT_ACTION
            └─ ready → …
  → FEASIBILITY(G13)            // plan khả thi?
  → HUMAN_GATE_2(G14)
       ├─ Reject → FEEDBACK(G16) → IMPACT → RE-PLAN
       └─ Approve → PROJECT_INIT(G20) → END

G19 wraps entire run (AI service); G15 checkpoints graph state; G17 serves all LLM nodes.
G5/G14 human APIs + G20 PROJECT_INIT execute on **project-service** (callback từ AI khi cần).
```

---

## 8. Không build thành Agent

| Chức năng | Agent? | Build |
|-----------|--------|-------|
| Parse / Normalize / Validation | ❌ | G3 / validators |
| Scoring / Capacity / Effort / Schedule / Risk calc | ❌ | G9–G12 via G18 |
| Vector search / Rerank | ❌ | G7 |
| Intelligence runtime (model/prompt) | ❌ (runtime) | G17 — LLM execution, không Agent quyết định biz metric |
| Tool registry | ❌ | G18 |
| Run management | ❌ | G19 trên AI service |
| Project init | ❌ | **G20 trên project-service** |
| Requirement understanding / Tool selection / Re-plan strategy | ✅ | G4/G8 via G17 trên AI service |
| Final approval | ❌ | Human G5/G14 (project HTTP facade) |

---

## 9. Service layout (bắt buộc — không đặt trong project-service)

```text
services/ai-project-planning-service/
├── src/
│   ├── routes/internal/     # S2S start/resume/cancel/status
│   ├── clients/             # project-service callbacks (nếu cần)
│   ├── orchestration/       # G8 graph + nodes
│   ├── runtime/             # G17
│   ├── registry/            # G18
│   ├── run/                 # G19
│   ├── checkpoint/          # G15
│   ├── skills/
│   ├── tools/               # G9–G12
│   ├── retrieval/           # G7
│   ├── validation/          # G13 (+ G3 AI-side)
│   └── feedback/            # G16
└── Dockerfile

services/ai-project-planning-worker/   # optional
├── consumer queue → same tools/runtime
└── Dockerfile

services/project-service/
├── facade: startAiRun → S2S AI service (202)
├── Gate 1/2 HTTP + pack persistence
└── G20 projectInit (materialize vào project DB)
```

**Cấm:** thêm LangGraph/Ollama client nặng vào `project-service` request path sau Wave 0.

Env (ghi `.env`, không `.env.example`):

- `AI_PROJECT_PLANNING_SERVICE_URL=http://ai-project-planning-service:<port>`
- `AI_PLANNING_REMOTE=1` (feature flag cutover)

---

## 10. Thứ tự triển khai (sau approve Spec)

| Step | Wave | Groups / work | Action | Gate |
|------|------|---------------|--------|------|
| 0 | — | All | Approve Spec (+ §3.7 split) | STOP |
| 1 | **0** | Scaffold | `ai-project-planning-service` + Swarm + gateway internal + health + empty clients | `Implement Wave 0 only. Stop.` |
| 2 | A | G9–G10, G13, G18, G19 skeleton; project 202 facade | Contracts + migrate compute | STOP |
| 3 | B | G4, G17, G11–G12, G5–G6 facade, G20 S2S handshake | Contracts extend | STOP |
| 4 | C | G7, G8, G15, G16; strip in-process aiAnalysis từ project | Greenfield + cutover | STOP |
| 5+ | — | Per contract | `Implement step N only. Stop for review.` | Mỗi PR một step |

---

## 11. Build Contract template

1. API (ưu tiên mở rộng endpoint sẵn)  
2. Input Schema  
3. Output Schema (+ `evidence[]`)  
4. DB tables/collections  
5. LangGraph nodes (nếu có)  
6. Tool contract / Skill contract / Registry entry  
7. State + **Run** fields  
8. Error handling  
9. Acceptance Criteria (Given/When/Then)  
10. As-is reuse vs new  
11. DO NOT MODIFY  

---

## Một câu nhớ

**Project CRUD nhanh — AI planning service chậm/async — LangGraph điều phối — G17 chạy LLM — G18 chọn Tool — Evidence bắt buộc — Human quyết định — G20 materialize trên project-service.**
