---
name: gate-s0-to-p1
overview: "Gate G0 — Stabilization done + bug rà soát trước khi bắt Phase 1 (Stateful HA)."
todos:
  - id: stabilization-signoff
    content: Tick toàn bộ S0-S4 stabilization master index
    status: pending
  - id: security-regression
    content: check-security-env + gateway permission smoke pass
    status: pending
  - id: bug-triage-p0
    content: Không P0 mở chat/auth/socket/gateway
    status: pending
  - id: s4-smoke-suite
    content: Chạy tests/s4-*.smoke.js + run-s3-validation.sh
    status: pending
  - id: gate-doc-signoff
    content: Ghi docs/phase-gate-*-g0.md + Dev lead approve
    status: pending
isProject: false
---

# Gate G0 — Stabilization → Phase 1

**Chạy trước:** [p1-prep-backup-inventory](../phase-1-stateful-ha/foundation/p1-prep-backup-inventory.plan.md)  
**Sau PASS:** Bắt đầu [phase-1-stateful-ha](../phase-1-stateful-ha/00-master-index.plan.md)  
**Tiêu chí:** Cổng vào Stateful HA

## 1. Mục tiêu & phạm vi

### Done (PASS)
- Stabilization S0–S4 sign-off đủ ([master index](../stabilization/00-master-index.plan.md))
- Security smoke pass; không P0 bug production-path
- S3 socket HA + S4 cleanup smoke pass
- Gate doc signed

### In-scope
- Stabilization plans S0–S4
- [`check-security-env.sh`](../../../devops/scripts/check-security-env.sh)
- [`security-regression-smoke.md`](../../../devops/scripts/security-regression-smoke.md)
- Issue tracker / known bugs list (nội bộ)

### Out-of-scope
- Atlas deploy (thuộc Phase 1)
- P2 security backlog ([s1-p1-p2-backlog](../stabilization/security/s1-p1-p2-backlog.plan.md)) — không block nếu đã marked post-sign-off

## 2. Files affected

| Chạy / tạo | Không đụng |
|------------|------------|
| `tests/s4-gateway-legacy.smoke.js` | Phase 1 code |
| `tests/s4-api-pagination-client.smoke.js` | |
| `tests/s4-docs-alignment.smoke.js` | |
| `devops/swarm/run-s3-validation.sh` | |
| `docs/phase-gate-YYYY-MM-DD-g0.md` (mới) | |

## 3. Thiết kế & trách nhiệm

### A. Plan completion matrix (Stabilization)

| Plan | Pass khi |
|------|----------|
| s0-secrets-observability | Baseline + rollback runbook |
| s1-chat-idor-dm | DM IDOR tests pass |
| s1-internal-tokens | Token sync deploy doc |
| s1-gateway-permissions | Permission map smoke |
| s2-socket-canonical | `CHAT_SOCKET_ENABLED=false`; client qua gateway |
| s3-realtime-ha-chaos | Socket 2 replica + chaos pass |
| s4-gateway-legacy | Deprecated routes unmounted |
| s4-api-pagination-client | pageToken client |
| s4-docs-alignment | ARCHITECTURE/MIGRATION/SPEC |

### B. Bug triage

| Severity | Gate |
|----------|------|
| **P0** | Login broken, auth bypass, DM leak, socket public misconfig → **FAIL** |
| **P1** | Rate limit thiếu, webhook edge → ghi backlog; PASS có điều kiện |
| **P2** | Defer |

Nguồn: GitHub issues, QA sheet, `security-regression-smoke.md` mục fail.

## 4. Thứ tự triển khai

1. Review stabilization master index — all todos completed
2. Chạy security + S4 smoke suite
3. Bug triage meeting — liệt kê P0/P1
4. Nếu FAIL → fix hoặc waive (Dev lead)
5. Ghi gate doc + tag `phase-gate-g0-pass-YYYY-MM-DD`
6. **Mới** được implement `p1-prep`

## 5. Test plan

```bash
VOICEHUB_ENV_CHECK=staging bash devops/scripts/check-security-env.sh
bash devops/scripts/gateway-permission-smoke.sh
bash devops/swarm/run-s3-validation.sh
node tests/s4-gateway-legacy.smoke.js
node tests/s4-api-pagination-client.smoke.js
node tests/s4-docs-alignment.smoke.js
```

**Pass:** Tất cả exit 0; không task Failed trên stack `voicehub` (app services).

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Bỏ qua gate → Phase 1 trên nền socket dual | Gate bắt buộc trước p1-prep | Tiếp tục stabilization fix |
| P1 backlog nhầm P0 | Severity rubric trên | Re-triage |

## Sign-off

- [ ] Dev lead: stabilization complete
- [ ] DevOps: smoke commands pass
- [ ] No open P0 on chat/auth/gateway/socket
- [ ] **APPROVED to start Phase 1**
