import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpaceContext,
  normalizeSpaceKind,
  resolveCompanyMembersDepartmentId,
  spaceHasProjectId,
  spaceRequiresProjectId,
  SPACE_KIND,
} from './spaceContextUtils.js';
import {
  getCompanyNavItems,
  getProjectsPostSelectNavItems,
  getProjectsPreSelectNavItems,
  normalizeProjectModule,
  PROJECT_MENU_GROUPS,
  HUB_TAB_TO_MODULE,
} from './suiteNavConfig.js';
import {
  detectSuiteFromPath,
  getDefaultPathForSuite,
  mapCollaboratePathToDualSuite,
  normalizeSuite,
  SUITE,
  buildProjectsModulePath,
  buildCompanyWorkspacePath,
  buildCompanyHomePath,
} from './suitePathUtils.js';
import {
  isRememberedProjectValid,
  LAST_PROJECT_ID_KEY,
} from '../features/projects/picker/projectPickerRemember.js';

describe('spaceContextUtils', () => {
  it('normalizes kind', () => {
    assert.equal(normalizeSpaceKind('project'), SPACE_KIND.PROJECT);
    assert.equal(normalizeSpaceKind('company'), SPACE_KIND.COMPANY);
    assert.equal(normalizeSpaceKind(''), SPACE_KIND.COMPANY);
  });

  it('clears projectId for company kind', () => {
    const space = createSpaceContext({
      kind: 'company',
      organizationId: 'o1',
      projectId: 'p1',
    });
    assert.equal(space.projectId, '');
    assert.equal(spaceRequiresProjectId(space), false);
  });

  it('resolveCompanyMembersDepartmentId scopes company dept only', () => {
    assert.equal(
      resolveCompanyMembersDepartmentId(
        createSpaceContext({ kind: 'company', departmentId: 'd1' })
      ),
      'd1'
    );
    assert.equal(
      resolveCompanyMembersDepartmentId(createSpaceContext({ kind: 'company' })),
      ''
    );
    assert.equal(
      resolveCompanyMembersDepartmentId(
        createSpaceContext({ kind: 'project', departmentId: 'd1', projectId: 'p1' })
      ),
      ''
    );
  });

  it('keeps teamId and level for company kind', () => {
    const space = createSpaceContext({
      kind: 'company',
      organizationId: 'o1',
      departmentId: 'd1',
      teamId: 't1',
      level: 'team',
    });
    assert.equal(space.departmentId, 'd1');
    assert.equal(space.teamId, 't1');
    assert.equal(space.level, 'team');
  });

  it('clears teamId when level is department', () => {
    const space = createSpaceContext({
      kind: 'company',
      organizationId: 'o1',
      departmentId: 'd1',
      teamId: 't1',
      level: 'department',
    });
    assert.equal(space.teamId, '');
    assert.equal(space.level, 'department');
  });

  it('clears department/team for project kind', () => {
    const space = createSpaceContext({
      kind: 'project',
      organizationId: 'o1',
      departmentId: 'd1',
      teamId: 't1',
      projectId: 'p1',
    });
    assert.equal(space.departmentId, '');
    assert.equal(space.teamId, '');
    assert.equal(space.projectId, 'p1');
  });

  it('keeps projectId for project kind', () => {
    const space = createSpaceContext({
      kind: 'project',
      organizationId: 'o1',
      projectId: 'p1',
    });
    assert.equal(space.projectId, 'p1');
    assert.equal(spaceRequiresProjectId(space), true);
    assert.equal(spaceHasProjectId(space), true);
  });
});

describe('suitePathUtils dual suite', () => {
  it('normalizes COLLABORATE to COMPANY', () => {
    assert.equal(normalizeSuite('COLLABORATE'), SUITE.COMPANY);
    assert.equal(normalizeSuite('collaborate'), SUITE.COMPANY);
  });

  it('detects suite from path', () => {
    assert.equal(detectSuiteFromPath('/app/company/workspaces'), SUITE.COMPANY);
    assert.equal(detectSuiteFromPath('/app/projects/abc/board'), SUITE.PROJECTS);
    assert.equal(detectSuiteFromPath('/app/collaborate/overview'), SUITE.COMPANY);
  });

  it('default paths', () => {
    assert.equal(getDefaultPathForSuite(SUITE.COMPANY), '/app/company/home');
    assert.equal(getDefaultPathForSuite(SUITE.PROJECTS), '/app/projects');
  });

  it('maps collaborate legacy paths', () => {
    assert.equal(
      mapCollaboratePathToDualSuite('/app/collaborate/workspaces', '?organizationId=o1'),
      '/app/company/workspaces'
    );
    assert.match(
      mapCollaboratePathToDualSuite('/app/collaborate/projects/pid1', '?tab=board'),
      /\/app\/projects\/pid1\/board/
    );
  });

  it('builds project module path', () => {
    assert.equal(
      buildProjectsModulePath('p1', 'changeRequests', { organizationId: 'o1' }),
      '/app/projects/p1/change-requests'
    );
    assert.equal(buildCompanyWorkspacePath({ organizationId: 'o1', tab: 'calendar' }), '/app/company/workspaces?tab=calendar');
  });

  it('builds company home path with dept/team', () => {
    assert.equal(
      buildCompanyHomePath({ organizationId: 'o1', departmentId: 'd1' }),
      '/app/company/home?departmentId=d1'
    );
    assert.equal(
      buildCompanyHomePath({ organizationId: 'o1', departmentId: 'd1', teamId: 't1' }),
      '/app/company/home?departmentId=d1&teamId=t1'
    );
  });
});

describe('suiteNavConfig', () => {
  it('company nav has home + scoped modules', () => {
    const keys = getCompanyNavItems().map((i) => i.key);
    assert.deepEqual(keys, ['home', 'chat', 'documents', 'calendar', 'approvals']);
  });

  it('projects pre-select nav', () => {
    const keys = getProjectsPreSelectNavItems().map((i) => i.key);
    assert.deepEqual(keys, ['picker', 'new']);
  });

  it('projects post-select groups', () => {
    // Omit deliveryPhase → Phase 2 WORK catalog (legacy callers that know phase).
    // UI loading must NOT call this path; ProjectsSidebar waits for project hub data.
    const items = getProjectsPostSelectNavItems('proj1');
    assert.ok(items.every((i) => i.path.includes('/app/projects/proj1/')));
    assert.ok(items.some((i) => i.group === PROJECT_MENU_GROUPS.WORK));
    assert.ok(items.some((i) => i.group === PROJECT_MENU_GROUPS.COLLAB));
    assert.ok(items.some((i) => i.group === PROJECT_MENU_GROUPS.OPS));
  });

  it('phase 1 deliveryPhase uses RA/Planning groups not WORK board catalog', () => {
    const items = getProjectsPostSelectNavItems('proj1', {
      deliveryPhase: 'requirement_analysis',
    });
    assert.ok(items.some((i) => i.group === PROJECT_MENU_GROUPS.PHASE1_RA));
    assert.equal(items.some((i) => i.module === 'board'), false);
    assert.equal(items.some((i) => i.module === 'list'), false);
    const fr = items.find((i) => i.module === 'analysis-fr');
    assert.ok(fr);
    assert.equal(Boolean(fr.readOnly), false);
  });

  it('marks RA tabs readOnly (except overview) after Start Planning', () => {
    const items = getProjectsPostSelectNavItems('proj1', {
      deliveryPhase: 'delivery_planning',
    });
    const overview = items.find((i) => i.module === 'overview');
    const fr = items.find((i) => i.module === 'analysis-fr');
    const docs = items.find((i) => i.module === 'customer-documents');
    const wbs = items.find((i) => i.module === 'planning-wbs');
    assert.ok(overview);
    assert.equal(Boolean(overview.readOnly), false);
    assert.ok(fr);
    assert.equal(fr.readOnly, true);
    assert.ok(docs);
    assert.equal(docs.readOnly, true);
    assert.ok(wbs);
    assert.equal(Boolean(wbs.readOnly), false);
    assert.equal(Boolean(wbs.locked), false);
  });

  it('normalizes hub tab to module', () => {
    assert.equal(normalizeProjectModule('changeRequests'), 'change-requests');
    assert.equal(HUB_TAB_TO_MODULE.changeRequests, 'change-requests');
  });

  it('maps legacy report module to overview', () => {
    assert.equal(normalizeProjectModule('report'), 'overview');
    assert.equal(
      getProjectsPostSelectNavItems('proj1').some((i) => i.key === 'report'),
      false
    );
  });

  it('locks analysis modules when canViewAnalysis is false (phase 1)', () => {
    const items = getProjectsPostSelectNavItems('proj1', {
      deliveryPhase: 'requirement_analysis',
      capabilities: { canViewAnalysis: false, canViewPlanning: false },
    });
    assert.ok(items.some((i) => i.module === 'overview'));
    const fr = items.find((i) => i.module === 'analysis-fr');
    const docs = items.find((i) => i.module === 'customer-documents');
    const wbs = items.find((i) => i.module === 'planning-wbs');
    assert.ok(fr);
    assert.equal(fr.locked, true);
    assert.ok(docs);
    assert.equal(docs.locked, true);
    assert.ok(wbs);
    assert.equal(wbs.locked, true);
    assert.ok(items.some((i) => i.module === 'chat'));
  });

  it('shows analysis modules when role-backed canViewAnalysis is true (phase 1)', () => {
    const items = getProjectsPostSelectNavItems('proj1', {
      deliveryPhase: 'requirement_analysis',
      // Caps derived from Project Role (PO/BA), not org Permission Group
      capabilities: { canViewAnalysis: true, canViewPlanning: true },
    });
    assert.ok(items.some((i) => i.module === 'overview'));
    assert.ok(items.some((i) => i.module === 'analysis-fr'));
    assert.ok(items.some((i) => i.module === 'customer-documents'));
    assert.ok(items.some((i) => i.module === 'chat'));
  });
});

describe('projectPickerRemember', () => {
  it('validates membership list', () => {
    assert.equal(isRememberedProjectValid('a', [{ _id: 'a' }]), true);
    assert.equal(isRememberedProjectValid('b', [{ _id: 'a' }]), false);
    assert.equal(LAST_PROJECT_ID_KEY, 'voicehub:last-project-id');
  });
});
