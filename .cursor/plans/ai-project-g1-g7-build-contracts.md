# AI Project — Build Contracts: G1 Knowledge + G7 RAG

**Status:** Contract locked (Wave D prep) — schemas executable in `ai-project-planning-service`.  
**Spec SoT:** [ai-project-build-spec-groups.plan.md](ai-project-build-spec-groups.plan.md)  
**Waves SoT:** [ai-project-build-contracts-waves.plan.md](ai-project-build-contracts-waves.plan.md)  
**Analysis plan:** G1 G7 Spec Analysis (do not treat analysis plan as SoT after this file).

**Code anchors:**

| Contract | Module |
|----------|--------|
| G1 catalogs | `services/ai-project-planning-service/src/knowledge/g1CatalogSchemas.js` |
| G2/G3/G6 deps | `services/ai-project-planning-service/src/knowledge/g2G3G6Deps.js` |
| G7 pipeline | `services/ai-project-planning-service/src/retrieval/g7PipelineSchemas.js` |
| Assembly stub | `services/ai-project-planning-service/src/retrieval/contextAssembly.js` |

---

## 1. G1 — Knowledge & Shared Resources

### 1.1 Purpose / Forbidden

| | |
|--|--|
| **Purpose** | Shared SoT: Skill / Metric / Dimension catalogs + vector-ready docs |
| **Owner** | Catalog schemas + seed in `ai-project-planning-service`; domain rows remain in user/org/project DBs |
| **Forbidden** | Plan, assign, WBS, estimate, LLM write into catalog (RULE-07) |

### 1.2 Skill Catalog

```json
{
  "version": "cap-whitelist-v2",
  "skills": [
    {
      "skillId": "skill:react",
      "name": "React",
      "aliases": ["reactjs"],
      "category": "frontend",
      "levelScale": { "min": 1, "max": 5 }
    }
  ]
}
```

**Compat:** As-is stub may send `skills: string[]` — `validateSkillCatalog` promotes to entries.  
**AC:** Snapshot projection always has `skillCatalog.version`; empty catalog → G3 warn/error per policy.

### 1.3 Metric Catalog

Every tool numeric `evidence.metric` MUST resolve via `resolveMetric(metricId)`.

| metricId | formula | unit | ruleId | owners |
|----------|---------|------|--------|--------|
| `available_capacity` | `available_hours - committed_hours` | hours | CAP-003 | EmployeeMatchingTool, ScheduleTool |
| `planned_allocation` | `sum(assignment.plannedHours)` | hours | CAP-001 | resourceCapacity |
| `candidate_count` | `count(matching.candidates)` | count | MATCH-001 | EmployeeMatchingTool |
| `total_effort_hours` | `sum(wbs.estimateHours)` | hours | EFF-001 | EffortEstimationTool |
| `scheduled_tasks` | `count(schedule.tasks)` | count | SCH-001 | ScheduleTool |
| `feasibility_pass` | `G13.pass ? 1 : 0` | boolean | FEAS-001 | FeasibilityValidator |

**AC:** `resolveMetric('available_capacity')` non-null; unknown metric → `catalogMiss('metric', id)` severity `error`.

### 1.4 Dimension Catalog

Seed: `skill_level` (1–5 + junior/mid/senior/lead aliases), `membership_role` (member/lead/manager/admin).  
**AC:** Alias miss → severity `warn` (passthrough raw); unknown dimension id → `error`.

### 1.5 Vector document schema

```json
{
  "sourceId": "EV-span-12",
  "docType": "evidence_span|srs_canonical|skill_def|metric_def|employee_history|calendar_rule",
  "text": "…",
  "metadata": {
    "snapshotId": "SNAP-001",
    "projectId": "…",
    "packId": "…",
    "packVersion": 3,
    "skillId": "skill:react",
    "metricId": "available_capacity",
    "orgId": "…"
  },
  "embeddingVersion": "ollama-nomic-v1"
}
```

**AC:** `validateVectorDocument` fails without `metadata.snapshotId` (RULE-09). No PII in `text` (no email/avatar/displayName).

### 1.6 G1 Acceptance Criteria checklist

- [ ] Metric used in tool evidence ∈ `METRIC_CATALOG_SEED` (or future DB-backed catalog with same ids)
- [ ] No HTTP/LLM write path into G1 catalogs
- [ ] Skill stub promotion still validates
- [ ] Vector docs always carry `snapshotId`

---

## 2. G7 — Semantic & Knowledge / RAG

### 2.1 Purpose / Forbidden

| | |
|--|--|
| **Purpose** | Query Intent → Retrieve → Rerank/Filter → Context Assembly |
| **Owner** | `ai-project-planning-service/src/retrieval/` (RULE-11) |
| **Forbidden** | Assign, schedule, effort, approve (RULE-07) |
| **Infra** | Qdrant in Compose extra only (Wave D+); never in project Swarm image |

### 2.2 Pipeline steps (testable)

| Step | Module (to-be / now) | Input | Output |
|------|----------------------|-------|--------|
| 1 query_intent | `classifyQueryIntent` | query string | intent enum |
| 2 retrieve | stub substring / later Qdrant+BM25 | intent + corpus | candidate docs |
| 3 rerank_filter | score sort + `filterCitationsToCorpus` | candidates + allowed ids | ranked docs |
| 4 context_assembly | `assembleContextPackage` | ranked docs | Context Package |

Intents: `requirement_evidence | skill_def | metric_def | history_snippet | general`.

### 2.3 Modes (`G7_RAG_MODE`)

| Mode | Meaning |
|------|---------|
| `stub` | Default Wave C — in-memory substring (current) |
| `keyword` | BM25/keyword only (no vector) |
| `hybrid` | Keyword + vector |
| `qdrant` | Vector primary (Wave D+) |
| `off` | Empty citations |

### 2.4 Context Package (Wave C + extensions)

**Required (Wave C):**

```json
{
  "query": "…",
  "citations": [
    { "citationId": "CIT-1", "sourceId": "…", "snippet": "…", "score": 0.0 }
  ],
  "assembledAt": "ISO-8601"
}
```

**Opt-in (backward compatible):** `mode`, `intent`, `stub`.

**AC:**

- [ ] `validateContextPackage` passes for assembly output
- [ ] Every `sourceId` ∈ input corpus / snapshot index (RULE-C1)
- [ ] Four steps independently unit-testable
- [ ] Consumer G8/G17 may ignore `mode`/`intent`

### 2.5 Env

| Var | Default | Notes |
|-----|---------|-------|
| `G7_RAG_MODE` | `stub` | See modes table |
| `QDRANT_URL` | unset until D+ | e.g. `http://qdrant:6333` |
| `PHASE1_RAG` | `stub` | project-service Phase1 keyword path (compat until RULE-11 cutover) |

---

## 3. Dependencies — G2 / G3 / G6 + RULE bind

### 3.1 G2 System Supplement — field lists

Source ids: `srs_pack`, `employee_pool`, `skill_catalog`, `org_calendar`, `project_history`.

Field whitelist SoT in code: `g2G3G6Deps.js` (aligned with `project-service/.../sourceManifest.js`).

**AC:** Projection never dumps full User/Org docs; history fields limited to `role|domain|months`.

### 3.2 G3 Catalog-miss policy

| Kind | Severity |
|------|----------|
| skill | error |
| metric | error |
| dimension | warn |

**AC:** Same input → same normalized hash; catalog miss emits `G1_CATALOG_MISS`.

### 3.3 G6 Canonical SRS (G7 Phase-2 corpus)

Required: `approvedSrsVersion`, `status=approved`, `functionalRequirements`, `nonFunctionalRequirements`.

**AC:** Index G7 Phase-2 corpus only after Gate 1 approved version; HOW fails if missing approved envelope.

### 3.4 RULE-09 snapshot bind

```js
assertSnapshotBind({ snapshotId, runId }) // throws SNAPSHOT_BIND_REQUIRED
```

Retrieve/index always scoped by `snapshotId`. No live HR DB mid-run.

### 3.5 Consumers (interface only)

| Consumer | Use of Context Package |
|----------|------------------------|
| G8 | `RETRIEVE` when `enoughInfoToContinue === false` needs knowledge |
| G17 | Inject citations into prompt under RULE-06 whitelist / token budget |

---

## 4. Implementation order (STOP gates)

> Implement **one step only**, then stop for review.

### Step 1 — Build Contract G1 *(this file §1 + `g1CatalogSchemas.js`)*

- **Done when:** Unit `g1CatalogSchemas.test.js` green; metric seed covers Wave A evidence metrics.
- **Review Gate:** `Implement step 1 only. Stop for review.`

### Step 2 — Implement G1 catalogs in snapshot path (no Qdrant)

- Wire `validateSkillCatalog` / `resolveMetric` into snapshot build (project or planning service).
- Replace `buildSkillCatalogStub` with versioned entries when registry available.
- **Files:** `aiAnalysisSnapshot.service.js`, `fieldProjection.js`, optional planning ingest.
- **Review Gate:** STOP

### Step 3 — Build Contract G7 *(this file §2 + `g7PipelineSchemas.js`)*

- **Done when:** Unit `g7PipelineSchemas.test.js` green; assembly emits `mode`+`intent`.
- **Review Gate:** STOP

### Step 4 — G7 keyword/hybrid on AI service (still no Qdrant)

- Split `queryIntent` / `retrieve` / `rerank` modules; corpus = snapshot vector docs (text only).
- Unify Phase1 `phase1EvidenceRetrieve` behind same interface or S2S.
- **Review Gate:** STOP

### Step 5 — Wave D+: Qdrant + embeddings

1. Add `qdrant` to `docker-compose.swarm-extra.yml` (overlay network).
2. Set `QDRANT_URL`, `G7_RAG_MODE=qdrant`.
3. Ingest snapshot corpus; wire G8/G17.
4. Build **only** `ai-project-planning-service`:  
   `bash devops/swarm/build-local-images.sh ai-project-planning-service`  
   then `docker service update --force …`
5. Compose: `docker compose -f docker-compose.swarm-extra.yml --env-file .env up -d` (build only if new Dockerfile).
- **Review Gate:** STOP
- **Rollback:** `G7_RAG_MODE=stub`; stop Qdrant container.

### Out of order (forbidden)

- Matching/schedule formula changes
- Meilisearch chat as G7
- `boardRag.js` / director health lights
- Public browser RAG routes
- Neo4j (graph-lite = `semanticMerge` edges only in Step 4–5)

---

## 5. Test commands (contract verification)

```bash
node --test services/ai-project-planning-service/tests/g1CatalogSchemas.test.js
node --test services/ai-project-planning-service/tests/g7PipelineSchemas.test.js
node --test services/ai-project-planning-service/tests/g2G3G6Deps.test.js
```

Pass criteria: all three files exit 0; `assembleContextPackage` output validates as Context Package; `resolveMetric('available_capacity')` returns CAP-003 entry.
