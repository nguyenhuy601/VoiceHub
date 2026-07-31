# Phase 4 — Workflow Engine

**Status:** Roadmap (sau Phase 2)  
**Depends on:** Phase 2 (ai được transition)  
**Unlocks:** Phase 5 (approval gắn transition)

## 1. Mục tiêu & phạm vi

### Done khi
- Org/Project chọn **Workflow template** (Startup vs Enterprise…).
- Custom **Status**, **Transition**, optional **Validator** / **Condition**.
- Task/card chuyển status chỉ qua transition hợp lệ + permission P2.
- Board columns map từ workflow status (không hardcode Todo/Doing/Done duy nhất).

### In-scope
- WorkflowTemplate (org catalog) + Project.workflowId hoặc board binding.
- Status + Transition graph.
- Validators tối thiểu: required fields, assignee present.
- Conditions tối thiểu: role-in-project, priority.

### Out-of-scope
- Full BPMN; Approval multi-step (P5); SLA timers (có thể P6).

### Ví dụ
| Startup | Enterprise |
|---------|------------|
| Todo → Doing → Done | Open → Analysis → Dev → Code Review → QA → UAT → Deploy → Done |

---

## 2. Files affected (dự kiến)

### Tạo mới
- Models: `WorkflowTemplate`, `WorkflowStatus`, `WorkflowTransition` (project-service)
- `workflow.service.js`, `workflow.controller.js`, routes
- Admin: Workflow catalog panel; Project Settings bind workflow
- Tests: `workflowTransition.test.js`

### Sửa
- `Task` / `TaskCard` status field → statusKey từ workflow
- `taskBoard.service` move card / change status
- Board UI columns từ workflow statuses
- Seed default templates Startup + Enterprise

---

## 3. Thiết kế & trách nhiệm module

```text
WorkflowTemplate (org)
  └── statuses[] { key, label, category, sortOrder }
  └── transitions[] { from, to, name, requiredPermission?, validators[], conditions[] }

Project / Board
  └── workflowTemplateId (inherit org default hoặc override)
```

### Transition apply
1. Load card current status.
2. Find transition from→to.
3. Check P2 permission (`task:change_status` hoặc transition.requiredPermission).
4. Run conditions → validators.
5. Persist + activity log.

### Board render
- Columns = statuses sorted; cards group by statusKey.
- Drag-drop chỉ enable nếu có transition + permission.

---

## 4. Thứ tự triển khai

1. Models + seed 2 templates + unit transition graph.
2. Bind project/board → template; migrate existing lists → statuses.
3. Enforce change-status API.
4. Admin workflow editor (CRUD status/transition).
5. Board UI dynamic columns.
6. Validators/conditions v1.

---

## 5. Test plan

| ID | Pass khi |
|----|----------|
| T1 | Transition illegal → 400 |
| T2 | Missing permission → 403 |
| T3 | Validator fail → 400 message rõ |
| T4 | Board columns = template statuses |
| T5 | Migrate board cũ không mất card |

---

## 6. Risk & trade-off

| Risk | Mitigation |
|------|------------|
| Phá board list model hiện tại | Map List ↔ Status 1:1 lúc migrate; dual-read |
| Editor phức tạp | Bắt đầu 2 templates cố định; custom editor phase nhỏ |

**Rollback:** project gắn template “Legacy Board Lists”; skip transition engine.
