# VoiceHub Plan Template (Plan Standard)

Copy and fill. Do not omit Out-of-Scope, DO NOT MODIFY, Pass Criteria, or Rollback.

---

## 1. Mục tiêu & phạm vi

### 1.1 Objective

- **Type:** Feature | Bug | Refactor | Security | Performance | Architecture
- **Business reason:**
- **Technical reason:**
- **Expected outcome:**

### 1.2 Success Criteria — Definition of Done

Measurable only (no “finish feature X”):

- [ ] …
- [ ] …

### 1.3 In-Scope

- …

### 1.4 Out-of-Scope

- …

---

## 2. Files Affected

### 2.1 CREATE

- …

### 2.2 MODIFY

- …

### 2.3 DELETE

- … (or “none”)

### 2.4 DO NOT MODIFY

- …

### 2.5 Dependency / Impact

```text
module-a
  ↓
module-b
  ↓
API / client / deploy surface
```

---

## 3. Thiết kế & trách nhiệm module

### 3.1 Architecture

```text
Route → Controller → Service → Repository/Model → DB / External
```

### 3.2 Responsibility

| Layer / Module | Responsibility | Must not |
|----------------|----------------|----------|
| Route | | |
| Controller | | |
| Service | | |
| … | | |

### 3.3 Data Flow

```text
Client → … → DB
```

### 3.4 Business Rules

- **RULE-01:** …
- **RULE-02:** …

### 3.5 Constraints

- No public API break / no schema change / … (as applicable)

---

## 4. Thứ tự triển khai

### 4.1 Dependency

```text
Step 1 → Step 2 → Step 3 → …
```

Why order matters: …

### 4.2 Steps

#### STEP 1 — …

- **Objective:**
- **Files:** READ ONLY | CREATE | MODIFY
- **Implementation:**
- **Dependencies:** none | Step …
- **Expected result:**
- **Validation:**

#### STEP 2 — …

(same fields)

### 4.3 Review Gates

- After Step …: **STOP.** Wait for reviewer approval.
- Phrase: `Implement step N only. Stop for review.`

---

## 5. Test Plan

### 5.1 Unit

- …

### 5.2 Integration

- …

### 5.3 Smoke

- …

### 5.4 Regression

- …

### 5.5 Mock / Fixture

- **Mock:** …
- **Fixture:** …

### 5.6 Commands

```bash
node --test shared/tests/<relevant>.test.js
node --test services/<service>/tests/<relevant>.test.js
cd client && npm run build
# if security:
bash devops/scripts/check-security-env.sh
```

### 5.7 Pass Criteria

- [ ] Unit: …
- [ ] Integration: …
- [ ] Smoke: …
- [ ] No regression failure
- [ ] …

---

## 6. Risk & trade-off

### 6.1 Risks

| Risk | Impact | Probability | Trigger | Mitigation | Fallback |
|------|--------|-------------|---------|------------|----------|
| Scope creep / agent edits outside Files Affected | Medium | Medium | Unexpected diff | Enforce §2.4 | Revert extras |
| … | | | | | |

### 6.2 Trade-off

- **Decision:**
- **Alternative:**
- **Reason:**

### 6.3 Security

- Token / authn / authz / logging / secrets / injection / rate limit (as relevant)
- After security fix: `bash devops/scripts/check-security-env.sh` + `devops/scripts/security-regression-smoke.md`

### 6.4 Rollback

- Revert commit / feature flag / DOWN migration / restore prior behavior

### 6.5 Observability (when touching sensitive runtime)

- Logging events:
- Metrics:
- Alerts (if any):
