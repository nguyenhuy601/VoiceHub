# i18n inventory — Wave 0

Generated: 2026-10-18T16:37:09.709Z

Status legend: `Open` = chưa đồng bộ copy trong wave sau; Wave 0 chỉ inventory.

## 1. Admin domains (nav 5 lớp — nguồn adminDomainsConfig)

| Domain | Path | labelKey | Nav | Layer | Status |
|--------|------|----------|-----|-------|--------|
| users | /app/admin/users | `adminDomains.users.title` | domain | nav | Open |
| users | /app/admin/users | `adminDomains.users.list` | link | nav | Open |
| users | /app/admin/users/import | `adminDomains.users.import` | link | nav | Open |
| users | /app/admin/users/people-ops | `adminDomains.users.peopleOpsHub` | link | nav | Open |
| users | /app/admin/users/edit | `adminDomains.users.edit` | hidden | nav | Open |
| users | /app/admin/users/assign-org | `adminDomains.users.assignOrg` | hidden | nav | Open |
| users | /app/admin/users/delete | `adminDomains.users.delete` | hidden | nav | Open |
| accounts | /app/admin/accounts | `adminDomains.accounts.title` | domain | nav | Open |
| accounts | /app/admin/accounts | `adminDomains.accounts.list` | link | nav | Open |
| accounts | /app/admin/accounts/password | `adminDomains.accounts.passwordHub` | link | nav | Open |
| accounts | /app/admin/accounts/access | `adminDomains.accounts.accessHub` | link | nav | Open |
| accounts | /app/admin/accounts/verification | `adminDomains.accounts.verificationHub` | link | nav | Open |
| accounts | /app/admin/accounts/detail | `adminDomains.accounts.detail` | hidden | nav | Open |
| accounts | /app/admin/accounts/login-history | `adminDomains.accounts.loginHistory` | hidden | nav | Open |
| accounts | /app/admin/accounts/resend-verification | `adminDomains.accounts.resendVerification` | hidden | nav | Open |
| accounts | /app/admin/accounts/activate | `adminDomains.accounts.activate` | hidden | nav | Open |
| accounts | /app/admin/accounts/reset-password | `adminDomains.accounts.resetPassword` | hidden | nav | Open |
| accounts | /app/admin/accounts/force-password | `adminDomains.accounts.forcePassword` | hidden | nav | Open |
| accounts | /app/admin/accounts/set-password | `adminDomains.accounts.setPassword` | hidden | nav | Open |
| accounts | /app/admin/accounts/revoke-sessions | `adminDomains.accounts.revokeSessions` | hidden | nav | Open |
| accounts | /app/admin/accounts/lock | `adminDomains.accounts.lock` | hidden | nav | Open |
| org-structure | /app/admin/org-structure | `adminDomains.orgStructure.title` | domain | nav | Open |
| org-structure | (section dynamic) | `adminDomains.orgStructure.sectionDynamic` | section | tab | Open |
| org-structure | /app/admin/org-structure/levels | `adminDomains.orgStructure.levels` | link | nav | Open |
| org-structure | /app/admin/org-structure/units | `adminDomains.orgStructure.unitTree` | link | nav | Open |
| org-structure | (section departments) | `adminDomains.orgStructure.sectionDepartments` | section | tab | Open |
| org-structure | /app/admin/org-structure/departments | `adminDomains.orgStructure.deptList` | link | nav | Open |
| org-structure | /app/admin/org-structure/departments/create | `adminDomains.orgStructure.deptCreate` | link | nav | Open |
| org-structure | /app/admin/org-structure/departments/manage | `adminDomains.orgStructure.deptManageHub` | link | nav | Open |
| org-structure | /app/admin/org-structure/departments/edit | `adminDomains.orgStructure.deptEdit` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/departments/disable | `adminDomains.orgStructure.deptDisable` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/departments/parent | `adminDomains.orgStructure.deptParent` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/departments/head | `adminDomains.orgStructure.deptHead` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/departments/members | `adminDomains.orgStructure.deptMembers` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/departments/org-roles | `adminDomains.orgStructure.deptOrgRoles` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/departments/transfer | `adminDomains.orgStructure.deptTransfer` | link | nav | Open |
| org-structure | (section teams) | `adminDomains.orgStructure.sectionTeams` | section | tab | Open |
| org-structure | /app/admin/org-structure/teams | `adminDomains.orgStructure.teamList` | link | nav | Open |
| org-structure | /app/admin/org-structure/teams/create | `adminDomains.orgStructure.teamCreate` | link | nav | Open |
| org-structure | /app/admin/org-structure/teams/manage | `adminDomains.orgStructure.teamManageHub` | link | nav | Open |
| org-structure | /app/admin/org-structure/teams/edit | `adminDomains.orgStructure.teamEdit` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/teams/archive | `adminDomains.orgStructure.teamArchive` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/teams/members | `adminDomains.orgStructure.teamMembers` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/teams/leader | `adminDomains.orgStructure.teamLeader` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/teams/department | `adminDomains.orgStructure.teamDept` | hidden | nav | Open |
| org-structure | (section divisions) | `adminDomains.orgStructure.sectionDivisions` | section | tab | Open |
| org-structure | /app/admin/org-structure/divisions | `adminDomains.orgStructure.divisionList` | link | nav | Open |
| org-structure | /app/admin/org-structure/divisions/create | `adminDomains.orgStructure.divisionCreate` | link | nav | Open |
| org-structure | /app/admin/org-structure/divisions/manage | `adminDomains.orgStructure.divisionManageHub` | link | nav | Open |
| org-structure | /app/admin/org-structure/divisions/edit | `adminDomains.orgStructure.divisionEdit` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/divisions/disable | `adminDomains.orgStructure.divisionDisable` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/divisions/departments | `adminDomains.orgStructure.divisionDept` | hidden | nav | Open |
| org-structure | (section branches) | `adminDomains.orgStructure.sectionBranches` | section | tab | Open |
| org-structure | /app/admin/org-structure/branches | `adminDomains.orgStructure.branchList` | link | nav | Open |
| org-structure | /app/admin/org-structure/branches/create | `adminDomains.orgStructure.branchCreate` | link | nav | Open |
| org-structure | /app/admin/org-structure/branches/manage | `adminDomains.orgStructure.branchManageHub` | link | nav | Open |
| org-structure | /app/admin/org-structure/branches/edit | `adminDomains.orgStructure.branchEdit` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/branches/disable | `adminDomains.orgStructure.branchDisable` | hidden | nav | Open |
| org-structure | /app/admin/org-structure/branches/departments | `adminDomains.orgStructure.branchDept` | hidden | nav | Open |
| org-structure | (section backup) | `adminDomains.backup.title` | section | tab | Open |
| org-structure | /app/admin/backup | `adminDomains.backup.backup` | link | nav | Open |
| org-structure | (section system-config) | `adminDomains.systemConfig.title` | section | tab | Open |
| org-structure | /app/admin/system-config | `adminDomains.systemConfig.configHub` | link | nav | Open |
| org-structure | /app/admin/system-config/company | `adminDomains.systemConfig.company` | hidden | nav | Open |
| org-structure | /app/admin/system-config/retention | `adminDomains.systemConfig.retention` | hidden | nav | Open |
| org-structure | /app/admin/system-config/structure | `adminDomains.systemConfig.structure` | hidden | nav | Open |
| rbac | /app/admin/rbac | `adminDomains.rbac.title` | domain | nav | Open |
| rbac | (section overview) | `adminDomains.rbac.sectionOverview` | section | tab | Open |
| rbac | /app/admin/rbac | `adminDomains.rbac.taxonomy` | link | nav | Open |
| rbac | /app/admin/rbac/permissions-by-domain | `adminDomains.rbac.permissionsByDomain` | link | nav | Open |
| rbac | /app/admin/rbac/master-data | `adminDomains.rbac.masterData` | hidden | nav | Open |
| rbac | (section orgRoles) | `adminDomains.rbac.sectionOrgRoles` | section | tab | Open |
| rbac | /app/admin/rbac/org-roles | `adminDomains.rbac.orgRoleCatalog` | link | nav | Open |
| rbac | /app/admin/rbac/org-roles/create | `adminDomains.rbac.orgRoleCreate` | link | nav | Open |
| rbac | /app/admin/rbac/org-roles/permissions | `adminDomains.rbac.orgRolePermissionMatrix` | link | nav | Open |
| rbac | /app/admin/rbac/org-roles/manage | `adminDomains.rbac.orgRoleManageHub` | link | nav | Open |
| rbac | /app/admin/rbac/org-roles/edit | `adminDomains.rbac.orgRoleEdit` | hidden | nav | Open |
| rbac | /app/admin/rbac/org-roles/delete | `adminDomains.rbac.orgRoleDelete` | hidden | nav | Open |
| rbac | /app/admin/rbac/org-roles/lookup | `adminDomains.rbac.orgRoleLookup` | hidden | nav | Open |
| rbac | /app/admin/rbac/org-roles/assign | `adminDomains.rbac.orgRoleAssign` | hidden | nav | Open |
| rbac | /app/admin/rbac/org-roles/directory | `adminDomains.rbac.orgRoleDirectory` | hidden | nav | Open |
| rbac | (section positions) | `adminDomains.rbac.sectionPositions` | section | tab | Open |
| rbac | /app/admin/rbac/positions | `adminDomains.rbac.posList` | link | nav | Open |
| rbac | /app/admin/rbac/positions/create | `adminDomains.rbac.posCreate` | link | nav | Open |
| rbac | /app/admin/rbac/positions/manage | `adminDomains.rbac.posManageHub` | link | nav | Open |
| rbac | /app/admin/rbac/positions/roles | `adminDomains.rbac.positionRoleBind` | link | nav | Open |
| rbac | /app/admin/rbac/positions/assign | `adminDomains.rbac.posAssign` | link | nav | Open |
| rbac | /app/admin/rbac/positions/edit | `adminDomains.rbac.posEdit` | hidden | nav | Open |
| rbac | /app/admin/rbac/positions/disable | `adminDomains.rbac.posDisable` | hidden | nav | Open |
| rbac | (section projectRoles) | `adminDomains.rbac.sectionProjectRoles` | section | tab | Open |
| rbac | /app/admin/rbac/project-roles | `adminDomains.rbac.projectRoleCatalog` | link | nav | Open |
| rbac | /app/admin/rbac/project-roles/create | `adminDomains.rbac.projectRoleCreate` | link | nav | Open |
| rbac | /app/admin/rbac/project-roles/board | `adminDomains.rbac.projectRoleBoard` | link | nav | Open |
| rbac | /app/admin/rbac/project-roles/manage | `adminDomains.rbac.projectRoleManageHub` | link | nav | Open |
| rbac | /app/admin/rbac/project-roles/edit | `adminDomains.rbac.projectRoleEdit` | hidden | nav | Open |
| rbac | /app/admin/rbac/project-roles/delete | `adminDomains.rbac.projectRoleDelete` | hidden | nav | Open |
| rbac | (section systemRoles) | `adminDomains.rbac.sectionSystemRoles` | section | tab | Open |
| rbac | /app/admin/rbac/roles | `adminDomains.rbac.roles` | hidden | nav | Open |
| rbac | /app/admin/rbac/create | `adminDomains.rbac.create` | hidden | nav | Open |
| rbac | /app/admin/rbac/permissions | `adminDomains.rbac.permissions` | hidden | nav | Open |
| rbac | /app/admin/rbac/hierarchy | `adminDomains.rbac.hierarchy` | hidden | nav | Open |
| rbac | /app/admin/rbac/matrix | `adminDomains.rbac.matrix` | hidden | nav | Open |
| rbac | /app/admin/rbac/roles/manage | `adminDomains.rbac.permPackManageHub` | hidden | nav | Open |
| rbac | /app/admin/rbac/assign | `adminDomains.rbac.assign` | hidden | nav | Open |
| rbac | /app/admin/rbac/revoke | `adminDomains.rbac.revoke` | hidden | nav | Open |
| rbac | /app/admin/rbac/delete | `adminDomains.rbac.delete` | hidden | nav | Open |
| rbac | /app/admin/rbac/edit | `adminDomains.rbac.edit` | hidden | nav | Open |
| channels | /app/admin/channels | `adminDomains.channels.title` | domain | nav | Open |
| channels | /app/admin/channels | `adminDomains.channels.list` | link | nav | Open |
| chat | /app/admin/chat | `adminDomains.chat.title` | domain | nav | Open |
| chat | /app/admin/chat | `adminDomains.chat.configHub` | link | nav | Open |
| voice | /app/admin/voice | `adminDomains.voice.title` | domain | nav | Open |
| voice | /app/admin/voice | `adminDomains.voice.rooms` | link | nav | Open |
| voice | /app/admin/voice/manage-rooms | `adminDomains.voice.manageRooms` | link | nav | Open |
| voice | /app/admin/voice/meetings | `adminDomains.voice.meetings` | link | nav | Open |
| voice | /app/admin/voice/history | `adminDomains.voice.history` | link | nav | Open |
| voice | /app/admin/voice/meeting-ops | `adminDomains.voice.meetingOpsHub` | link | nav | Open |
| voice | /app/admin/voice/moderate | `adminDomains.voice.moderate` | hidden | nav | Open |
| voice | /app/admin/voice/end-meeting | `adminDomains.voice.endMeeting` | hidden | nav | Open |
| projects | /app/admin/projects | `adminDomains.projects.title` | domain | nav | Open |
| projects | (section governance) | `adminDomains.projects.sectionGovernance` | section | tab | Open |
| projects | /app/admin/projects | `adminDomains.projects.overview` | link | nav | Open |
| projects | /app/admin/projects/settings | `adminDomains.projects.settings` | link | nav | Open |
| projects | /app/admin/projects/project-team | `adminDomains.projects.members` | link | nav | Open |
| projects | /app/admin/projects/delegation | `adminDomains.projects.delegation` | link | nav | Open |
| projects | (section boards-delivery) | `adminDomains.projects.sectionBoards` | section | tab | Open |
| projects | /app/admin/projects/boards | `adminDomains.projects.boards` | link | nav | Open |
| projects | /app/admin/projects/workflow | `adminDomains.projects.workflow` | link | nav | Open |
| projects | /app/admin/projects/sprints | `adminDomains.projects.sprints` | link | nav | Open |
| projects | (section work-items) | `adminDomains.projects.sectionWorkItems` | section | tab | Open |
| projects | /app/admin/projects/manage | `adminDomains.projects.manageTasks` | link | nav | Open |
| projects | /app/admin/projects/change-requests | `adminDomains.projects.changeRequests` | link | nav | Open |
| projects | /app/admin/projects/briefs | `adminDomains.projects.briefs` | link | nav | Open |
| projects | /app/admin/projects/requirements | `adminDomains.projects.requirements` | link | nav | Open |
| projects | /app/admin/projects/export | `adminDomains.projects.export` | link | nav | Open |
| projects | /app/admin/projects/status | `adminDomains.projects.statusPriority` | link | nav | Open |
| projects | /app/admin/projects/labels | `adminDomains.projects.labels` | link | nav | Open |
| projects | (section ops) | `adminDomains.projects.sectionOps` | section | tab | Open |
| projects | /app/admin/projects/transfer | `adminDomains.projects.transfer` | link | nav | Open |
| projects | /app/admin/projects/policies | `adminDomains.projects.policies` | link | nav | Open |
| projects | /app/admin/projects/capacity | `adminDomains.projects.capacity` | link | nav | Open |
| projects | /app/admin/projects/planner | `adminDomains.projects.planner` | link | nav | Open |
| projects | /app/admin/projects/role-effort-budget-template | `adminDomains.projects.roleEffortBudgetTemplate` | link | nav | Open |
| projects | /app/admin/projects/utilization | `adminDomains.projects.utilization` | link | nav | Open |
| projects | /app/admin/projects/performance | `adminDomains.projects.performance` | link | nav | Open |
| projects | /app/admin/projects/approval-policies | `adminDomains.projects.approvalPolicies` | link | nav | Open |
| files | /app/admin/files | `adminDomains.files.title` | domain | nav | Open |
| files | /app/admin/files | `adminDomains.files.list` | link | nav | Open |
| notifications | /app/admin/notifications | `adminDomains.notifications.title` | domain | nav | Open |
| notifications | /app/admin/notifications | `adminDomains.notifications.configHub` | link | nav | Open |
| ai | /app/admin/ai | `adminDomains.ai.title` | domain | nav | Open |
| ai | /app/admin/ai | `adminDomains.ai.provider` | link | nav | Open |
| ai | /app/admin/ai/api-key | `adminDomains.ai.apiKey` | link | nav | Open |
| ai | /app/admin/ai/toggle | `adminDomains.ai.toggle` | link | nav | Open |
| ai | /app/admin/ai/chat | `adminDomains.ai.chat` | link | nav | Open |
| ai | /app/admin/ai/prompts | `adminDomains.ai.prompts` | link | nav | Open |
| ai | /app/admin/ai/limits | `adminDomains.ai.limits` | link | nav | Open |
| security | /app/admin/security | `adminDomains.security.title` | domain | nav | Open |
| security | /app/admin/security | `adminDomains.security.settingsHub` | link | nav | Open |
| security | /app/admin/security/sessions | `adminDomains.security.loginHistory` | link | nav | Open |
| security | /app/admin/security/password-policy | `adminDomains.security.passwordPolicy` | hidden | nav | Open |
| security | /app/admin/security/mfa | `adminDomains.security.mfa` | hidden | nav | Open |
| security | /app/admin/security/ip-whitelist | `adminDomains.security.ipWhitelist` | hidden | nav | Open |
| audit | /app/admin/audit | `adminDomains.audit.title` | domain | nav | Open |
| audit | /app/admin/audit | `adminDomains.audit.log` | link | nav | Open |
| audit | /app/admin/audit/search | `adminDomains.audit.search` | hidden | nav | Open |
| audit | /app/admin/audit/permissions | `adminDomains.audit.permissions` | hidden | nav | Open |
| audit | /app/admin/audit/login | `adminDomains.audit.login` | hidden | nav | Open |
| audit | /app/admin/audit/activity | `adminDomains.audit.activity` | hidden | nav | Open |
| audit | /app/admin/audit/export | `adminDomains.audit.export` | hidden | nav | Open |
| backup | /app/admin/backup | `adminDomains.backup.title` | domain | nav | Open |
| system-config | /app/admin/system-config | `adminDomains.systemConfig.title` | domain | nav | Open |
| monitoring | /app/admin/monitoring | `adminDomains.monitoring.title` | domain | nav | Open |
| monitoring | /app/admin/monitoring | `adminDomains.monitoring.services` | link | nav | Open |
| monitoring | /app/admin/monitoring/database | `adminDomains.monitoring.database` | link | nav | Open |
| monitoring | /app/admin/monitoring/queue | `adminDomains.monitoring.queue` | link | nav | Open |
| monitoring | /app/admin/monitoring/storage | `adminDomains.monitoring.storage` | link | nav | Open |
| monitoring | /app/admin/monitoring/online-users | `adminDomains.monitoring.onlineUsers` | link | nav | Open |
| monitoring | /app/admin/monitoring/voice-active | `adminDomains.monitoring.voiceActive` | link | nav | Open |
| reports | /app/admin/reports/tasks | `adminDomains.reports.title` | domain | nav | Open |
| reports | /app/admin/reports/tasks | `adminDomains.reports.tasks` | link | nav | Open |

### Action groups

| Group id | labelKey | Layer | Status |
|----------|----------|-------|--------|
| peopleOps | `adminDomains.users.actionGroup` | nav | Open |
| accountOps | `adminDomains.accounts.actionGroup` | nav | Open |
| deptOps | `adminDomains.orgStructure.deptActionGroup` | nav | Open |
| teamOps | `adminDomains.orgStructure.teamActionGroup` | nav | Open |
| divisionOps | `adminDomains.orgStructure.divisionActionGroup` | nav | Open |
| branchOps | `adminDomains.orgStructure.branchActionGroup` | nav | Open |
| posOps | `adminDomains.rbac.posActionGroup` | nav | Open |
| orgRoleOps | `adminDomains.rbac.orgRoleActionGroup` | nav | Open |
| projectRoleOps | `adminDomains.rbac.projectRoleActionGroup` | nav | Open |
| permPackOps | `adminDomains.rbac.permPackActionGroup` | nav | Open |
| channelOps | `adminDomains.channels.actionGroup` | nav | Open |
| chatOps | `adminDomains.chat.actionGroup` | nav | Open |
| voiceOps | `adminDomains.voice.actionGroup` | nav | Open |
| fileOps | `adminDomains.files.actionGroup` | nav | Open |

## 2. Catalog parity baseline (PARITY_ROOTS)

| Root | VI leaves | EN leaves | missingEn | missingVi | Status |
|------|-----------|-----------|-----------|-----------|--------|
| adminDomains | 374 | 374 | 0 | 0 | ParityOK |
| workspace | 2187 | 2187 | 0 | 0 | ParityOK |
| company | 5 | 5 | 0 | 0 | ParityOK |
| requirements | 953 | 953 | 0 | 0 | ParityOK |
| common | 53 | 53 | 0 | 0 | ParityOK |
| chat | 116 | 116 | 0 | 0 | ParityOK |
| friends | 51 | 51 | 0 | 0 | ParityOK |
| friendChat | 331 | 331 | 0 | 0 | ParityOK |
| voiceRoom | 248 | 248 | 0 | 0 | ParityOK |
| notifications | 103 | 103 | 0 | 0 | ParityOK |
| login | 18 | 18 | 0 | 0 | ParityOK |
| header | 26 | 26 | 0 | 0 | ParityOK |
| nav | 149 | 149 | 0 | 0 | ParityOK |
| approvals | 31 | 31 | 0 | 0 | ParityOK |
| documents | 174 | 174 | 0 | 0 | ParityOK |
| calendar | 144 | 144 | 0 | 0 | ParityOK |
| settingsPage | 195 | 195 | 0 | 0 | ParityOK |
| dashboard | 428 | 428 | 0 | 0 | ParityOK |

## 3. Suite → wave map (5 lớp DoD)

| Wave | Suite | Layers required | Inventory file |
|------|-------|-----------------|----------------|
| 0 | Infrastructure | inventory + scan | this file |
| 1 | Admin | nav/tab/card/button/form | i18n-inventory-wave1.md |
| 2 | Workspace / Dashboard | nav/tab/card/button/form | i18n-inventory-wave2.md |
| 3 | Projects | nav/tab/card/button/form | i18n-inventory-wave3.md |
| 4 | Comms | nav/tab/card/button/form | i18n-inventory-wave4.md |
| 5 | Auth / misc | nav/tab/card/button/form | i18n-inventory-wave5.md |

Layers checklist template: nav, tab, card, button, form


## 4. Wave 0 deliverables (closed)

| Deliverable | Status |
|-------------|--------|
| `i18n-inventory-surfaces.mjs` | Done |
| `i18n-scan-hardcoded.mjs` | Done |
| `i18n-strip-t-fallbacks.mjs` | Done |
| Parity baseline | **0 missing** after Wave 1 P0 keys |
| Hardcode scan filter | comments stripped; `t()||t()` excluded from t_fallback |

**Review Gate:** Wave 0 inventory complete — proceed Waves 1–5 (implemented in same delivery).
