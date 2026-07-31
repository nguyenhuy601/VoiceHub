# Phase 1 — Project Discovery & Visibility

**Status:** Ready to implement  
**Depends on:** —  
**Unlocks:** Phase 2 (RBAC), Phase 3 (Resource), Phase 6 (Governance dashboards)

## 1. Mục tiêu & phạm vi

### Done khi
- Org Admin cấu hình **Project Visibility Policy** tại `/app/admin/projects/policies`.
- Project mới mặc định **inherit** org policy; PM override khi `allowProjectManagerOverride = true`.
- Project có `relatedDepartmentIds` (discover + filter; không cấp RBAC).
- `listProjects` / `getProject` filter theo Visibility + trả `access.informationLevel`.
- FE: Summary-only gate; không discover → project không xuất hiện (get → 404).
- **Chưa** enforce Task/Repo/Wiki permissions.

### In-scope
- Org default Visibility Policy + Default Information Level (hybrid matrix).
- Project: Related Departments, Visibility inherit/custom, Information Level overrides.
- API list/get filter + FE Admin Policies + Create/Settings + Hub summary gate.

### Out-of-scope
- Permission matrix Project Role (P2).
- Capacity planner (P3).
- Workflow / Approval / SSO (P4–P6).

### Quyết định
| Item | Chốt |
|------|------|
| Info Level | Hybrid: org default per audience; project override nếu Allow PM Override |
| Policy UI | `/app/admin/projects/policies` |
| Storage | `Organization.settings.projectVisibilityPolicy` |
| Related Depts | Discover + P3 resource; không = ACL |
| Legacy | Dual-read `visibility: private\|workspace` 1 release rồi drop |

### Audience default matrix

| Audience | Discover default | Info Level default |
|----------|------------------|--------------------|
| system_admins | always on | confidential |
| organization_admins | on | confidential |
| directors | on | details |
| project_managers | on | confidential |
| project_members | on | details |
| related_department_managers | on | summary |
| related_department_members | **off** | summary |
| all_employees | off | summary |

**Surface:**
- **summary:** name, description, PM, related depts, status, progress %
- **details:** + sprint/milestone overview, members, timeline
- **confidential:** + repo/technicalSetup, customer/contract

---

## 2. Files affected

### Tạo mới
- `services/organization-service/src/utils/projectVisibilityPolicy.js`
- `services/organization-service/tests/projectVisibilityPolicy.test.js`
- `services/project-service/src/utils/projectVisibility.js`
- `services/project-service/src/clients/orgVisibility.client.js`
- `services/project-service/tests/projectVisibility.test.js`
- `client/src/features/adminTasks/TasksProjectVisibilityPolicyPanel.jsx`

### Sửa
- `services/organization-service/src/models/Organization.js`
- Org settings get/patch controller
- `services/project-service/src/models/Project.js` — `relatedDepartmentIds`, `visibilityMode`, `visibilityPolicy`, `informationLevelOverrides`
- `services/project-service/src/services/project.service.js`
- `services/project-service/src/services/taskBoard.service.js` — bỏ phụ thuộc binary workspace
- `client/src/config/adminDomainsConfig.js` — wire panel
- `client/src/features/adminTasks/CreateProjectWizardPanel.jsx`
- `client/src/components/Organization/ProjectHub/ProjectHubSettingsPanel.jsx`
- `client/src/components/Organization/ProjectHub/ProjectHubShell.jsx` — summary gate
- `client/src/components/Workspace/OrganizationTeamGrid.jsx`
- `client/src/services/api/organizationAPI.js`, `projectAPI.js`
- Locales: `adminDomains.strings.js`, `appStrings.pages.js`

### Không đụng
- Project Role permission matrix, gateway permission keys mới, allocation UI

---

## 3. Thiết kế & trách nhiệm module

### Org policy shape
```js
settings.projectVisibilityPolicy = {
  discoverAudiences: { /* bool per audience */ },
  defaultInformationLevels: { /* summary|details|confidential */ },
  allowProjectManagerOverride: true,
}
```

### Project fields
```js
{
  relatedDepartmentIds: [ObjectId],
  visibilityMode: 'inherit' | 'custom',
  visibilityPolicy: { /* when custom */ },
  informationLevelOverrides: [{ audience, level }],
}
```

### Resolve flow
1. Classify actor audiences (membership, org roles, project membership, related dept head/member).
2. Load org policy; if `visibilityMode=custom` merge project policy (+ level overrides).
3. Discover nếu bất kỳ audience matched có flag discover.
4. `informationLevel` = max level trong các audience matched.
5. List: chỉ project discover; Get: không discover → 404.
6. Response: `access: { informationLevel, audiences }`.

### UI
- Admin Policies: checkboxes discover + select level + Allow Override.
- Create/Settings: Inherit | Custom; Related Departments multi-select.
- Hub: `summary` → Overview only (“Only Summary Available”).

---

## 4. Thứ tự triển khai

1. Schema + normalize utils (org + project).
2. Org API get/patch policy.
3. project-service resolve + list/get filter + dual-read legacy.
4. Admin Policies panel.
5. Create / Hub Settings inherit|custom + related depts.
6. FE Summary gate.
7. Unit + build verify.

Dừng review sau bước 3 nếu cần.

---

## 5. Test plan

| ID | Pass khi |
|----|----------|
| T1 | Normalize default; system_admins không tắt |
| T2 | Related member + discover off → không list |
| T3 | Related dept manager on → summary |
| T4 | Override khi allow=false → reject |
| T5 | listProjects filter đúng 2 users |
| T6 | get không discover → 404 |
| T7 | Admin policies save/reload |
| T8 | Create inherit = org policy |
| T9 | `npm run build` client |

```bash
node --test services/organization-service/tests/projectVisibilityPolicy.test.js
node --test services/project-service/tests/projectVisibility.test.js
cd client && npm run build
```

---

## 6. Risk & trade-off

| Risk | Mitigation |
|------|------------|
| Break `visibility` cũ | Dual-read 1 release; flag `PROJECT_VISIBILITY_V2` |
| S2S latency classify | Batch placement 1 lần/list |
| Summary user gọi board | Shell gate; board API vẫn cần membership |
| Nhầm Related = ACL | UI hint rõ |

**Rollback:** `PROJECT_VISIBILITY_V2=0` → list theo membership + binary visibility.
