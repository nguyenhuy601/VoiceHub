# Phase 5 — Approval System

**Status:** Roadmap (sau Phase 2 + Phase 4)  
**Depends on:** Phase 2 (roles), Phase 4 (transitions)  
**Unlocks:** Phase 6 compliance evidence

## 1. Mục tiêu & phạm vi

### Done khi
- Gắn **Approval Policy** vào transition hoặc entity (Task Done, Merge Request, Release).
- Chuỗi duyệt theo Project Role (Leader → QA → PM…).
- State: pending / approved / rejected / cancelled; block transition đến khi đủ duyệt.
- UI: inbox duyệt + lịch sử trên entity.

### In-scope
- `ApprovalPolicy`, `ApprovalRequest`, `ApprovalStep` models.
- Hooks: task status transition, (stub) MR/Release nếu chưa có full repo.
- Notify qua notification-service (event).

### Out-of-scope
- Legal e-sign; external vendor approvals.

### Ví dụ chuỗi
```text
Task Done: Developer → Leader Approve → QA → PM Approve
MR: Developer → Leader → Architect → Merge
Release: QA → Release Manager → Deploy
```

---

## 2. Files affected (dự kiến)

### Tạo mới
- `ApprovalPolicy.js`, `ApprovalRequest.js`
- `approval.service.js`, controller, routes
- Client: `ApprovalInboxPanel.jsx`, entity approval timeline
- Tests: `approvalChain.test.js`

### Sửa
- Workflow transition: flag `requiresApprovalPolicyId`
- notification-service event consumer/producer
- Project Settings: chọn policy templates
- Activity log entries

---

## 3. Thiết kế & trách nhiệm module

```text
ApprovalPolicy
  steps[] { order, approverType: 'project_role'|'user'|'org_role', roleKey?, userId?, quorum }

ApprovalRequest
  entityType, entityId, policyId, status, currentStep
  decisions[] { step, userId, decision, at, comment }
```

### Flow
1. Transition requires approval → create ApprovalRequest (pending).
2. Entity locked / status = awaiting_approval.
3. Approver acts → next step hoặc final approve → apply transition.
4. Reject → return previous status + notify.

### Approver resolution
- `project_role` → users có role trên project (P2 membership).
- `org_role` → OrgRoleAssignment (director…).
- Explicit userId hiếm khi dùng.

---

## 4. Thứ tự triển khai

1. Models + create/decide API + unit chain.
2. Hook 1 transition “Done” trên Task.
3. Notification + Inbox UI.
4. Policy templates admin.
5. Stub MR/Release policies (feature-flagged).
6. Audit fields cho P6.

---

## 5. Test plan

| ID | Pass khi |
|----|----------|
| T1 | Không đủ bước → transition không complete |
| T2 | Sai role approve → 403 |
| T3 | Full chain → status Done |
| T4 | Reject → về trạng thái trước |
| T5 | Cancel request khi card delete |

---

## 6. Risk & trade-off

| Risk | Mitigation |
|------|------------|
| Deadlock thiếu approver | Escalation timeout + org admin override |
| Spam notification | Digest / in-app inbox ưu tiên |

**Rollback:** tắt policy trên transitions; flow P4 thuần.
