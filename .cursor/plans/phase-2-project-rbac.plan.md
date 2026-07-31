# Phase 2 — Project RBAC

**Status:** Roadmap (sau Phase 1)  
**Depends on:** Phase 1 (discover + informationLevel)  
**Unlocks:** Phase 4 (Workflow transitions), Phase 5 (Approval actors)

## 1. Mục tiêu & phạm vi

### Done khi
- Mỗi Project Role có **Permission Matrix** (resource × action).
- API task/board/sprint/members/settings **enforce** theo matrix (không chỉ `canAssign`).
- Director “theo quyền” = P1 discover + P2 action check.
- Admin UI: chỉnh matrix theo Project Role (catalog org).
- Information Level (P1) vẫn giới hạn **surface đọc**; Permission giới hạn **hành động**.

### In-scope
- Mở rộng Project Role: Owner / PM / Leader / Developer / Tester / Guest / Custom.
- Matrix: Project, Task, Sprint, Repository, Wiki, Meeting, Release, Files, Members, Settings.
- Enforce trong `project-service` (+ coarse gateway nếu cần).
- Seed default matrix cho system project roles.

### Out-of-scope
- Custom workflow transitions (P4), approval chains (P5), capacity (P3).

### Ví dụ enforce
| Role | View Task | Update Task | Delete Sprint |
|------|-----------|-------------|---------------|
| Developer | yes | yes | no |
| Guest | yes (nếu details+) | no | no |
| PM | yes | yes | yes |

---

## 2. Files affected (dự kiến)

### Tạo mới
- `services/project-service/src/models/ProjectRolePermission.js` hoặc embed `permissions` trên `ProjectRole`
- `services/project-service/src/utils/projectPermissionMatrix.js` — defaults + normalize + `assertPermission`
- `services/project-service/src/services/projectAccess.service.js` — resolve effective perms cho user trên project
- Admin panel: `ProjectRolePermissionMatrixPanel.jsx` (hoặc mở rộng Project Role Edit)
- Tests: `projectPermissionMatrix.test.js`, `projectAccess.test.js`

### Sửa
- `ProjectRole.js`, `projectRoleDefaults.js`, `projectRoleAdmin.controller.js`
- Controllers/services: taskBoard, sprint, projectMember, planning, technical setup
- `boardCapabilities.js` — map sang matrix mới (backward-compatible)
- FE: Project Hub action buttons disable theo capabilities từ API
- `adminRbacCatalog.js` — align keys nếu cần; **System Role** `project:*` vẫn org-level create project
- Gateway `permissions.js` chỉ khi thêm coarse keys mới

---

## 3. Thiết kế & trách nhiệm module

### Permission key format
`resource:action` — ví dụ `task:view`, `task:create`, `sprint:close`, `repository:merge`, `members:manage`, `settings:update`.

### Resolve effective permissions
```text
User trên Project
  → ProjectMembership.projectRoleKeys[]
  → Union matrix của các roles
  → ∩ với Information Level (P1): summary không được task:view chi tiết dù matrix có
  → Org admin / system admin bypass (configurable)
```

### Tách lớp
| Lớp | Trách nhiệm |
|-----|-------------|
| Visibility (P1) | Có trong list/get không |
| Information Level (P1) | Payload fields / tab nào |
| Permissions (P2) | POST/PATCH/DELETE / mutate |

### Default seed (tóm tắt)
- **project_manager / product_owner:** gần full
- **tech_lead / senior_developer:** task CRUD, sprint view; không delete project
- **developer / junior:** task view/create/update; không delete sprint
- **qa / tester:** task view/update status; không repo merge
- **watcher / guest:** view-only theo level
- **Custom:** copy từ template gần nhất

---

## 4. Thứ tự triển khai

1. Schema permissions + default matrix + unit tests.
2. `assertPermission` helper + gắn 1 resource (Task) end-to-end.
3. Mở rộng Sprint, Members, Settings, Files.
4. Repo/Wiki/Meeting/Release — stub deny hoặc view-only nếu feature chưa có.
5. Admin UI matrix editor.
6. FE Hub consume `capabilities` từ API mới.
7. Regression board ACL cũ.

---

## 5. Test plan

| ID | Pass khi |
|----|----------|
| T1 | Default matrix seed đúng keys |
| T2 | Developer update task OK; delete sprint 403 |
| T3 | Watcher mutate 403 |
| T4 | Multi-role union permissions |
| T5 | Summary actor: task list API không trả card detail dù có task:view |
| T6 | Org admin bypass |
| T7 | Admin UI save matrix reload |

```bash
node --test services/project-service/tests/projectPermissionMatrix.test.js
node --test services/project-service/tests/projectAccess.test.js
```

---

## 6. Risk & trade-off

| Risk | Mitigation |
|------|------------|
| Phá boardCapabilities hiện tại | Adapter: map matrix → shape capabilities cũ 1 release |
| Matrix quá lớn UX | Group theo resource tabs; preset templates |
| Trùng System Role `project:*` | Document: System = org-wide admin; Project Role = trong 1 project |

**Rollback:** flag `PROJECT_RBAC_V2=0` → fallback canAssign + boardCapabilities cũ.
