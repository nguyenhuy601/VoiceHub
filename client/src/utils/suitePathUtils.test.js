import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCollaborateProjectHubPath,
  buildCompanyChatPath,
  buildProjectsModulePath,
  buildProjectsPickerPath,
  isCompanyChatModulePath,
  isCompanyDocumentsModulePath,
  isImmersiveCompanyModulePath,
} from './suitePathUtils.js';

describe('buildProjectsModulePath', () => {
  it('keeps module and serializes boardId/channelId but not organizationId', () => {
    const path = buildProjectsModulePath('pid1', 'list', {
      organizationId: 'org1',
      boardId: 'board1',
      channelId: 'ch1',
    });
    assert.match(path, /\/app\/projects\/pid1\/list\?/);
    assert.doesNotMatch(path, /organizationId=/);
    assert.match(path, /boardId=board1/);
    assert.match(path, /channelId=ch1/);
    assert.doesNotMatch(path, /\/overview/);
  });

  it('maps changeRequests tab id to change-requests segment', () => {
    assert.equal(
      buildProjectsModulePath('p', 'changeRequests', { organizationId: 'o' }),
      '/app/projects/p/change-requests'
    );
  });

  it('omits empty channelId', () => {
    const path = buildProjectsModulePath('p', 'chat', {
      organizationId: 'o',
      channelId: '',
    });
    assert.equal(path, '/app/projects/p/chat');
  });

  it('chat path does not require boardId', () => {
    const path = buildProjectsModulePath('p', 'chat', { organizationId: 'o' });
    assert.equal(path, '/app/projects/p/chat');
    assert.doesNotMatch(path, /boardId=/);
  });
});

describe('resolveProjectOrganizationId', () => {
  it('prefers query then projectRow then workspace', () => {
    assert.equal(
      resolveProjectOrganizationId({
        search: '?organizationId=fromQuery',
        projectRow: { organizationId: 'fromProject' },
        workspaceOrgId: 'fromWs',
      }),
      'fromQuery'
    );
    assert.equal(
      resolveProjectOrganizationId({
        search: '',
        projectRow: { organizationId: 'fromProject' },
        workspaceOrgId: 'fromWs',
      }),
      'fromProject'
    );
    assert.equal(
      organizationIdFromProjectRow({ organization: { _id: 'nested' } }),
      'nested'
    );
  });
});

describe('buildCollaborateProjectHubPath', () => {
  it('preserves explicit module when syncing boardId (board inject)', () => {
    const path = buildCollaborateProjectHubPath('pid', {
      module: 'board',
      organizationId: 'org',
      boardId: 'b1',
    });
    assert.equal(path, '/app/projects/pid/board?boardId=b1');
  });

  it('defaults to overview when module omitted (wizard success)', () => {
    const path = buildCollaborateProjectHubPath('pid', {
      organizationId: 'org',
      boardId: 'b1',
    });
    assert.equal(path, '/app/projects/pid/overview?boardId=b1');
  });
});

describe('buildProjectsPickerPath', () => {
  it('does not append organizationId (single-company)', () => {
    assert.equal(buildProjectsPickerPath('org9'), '/app/projects');
    assert.equal(buildProjectsPickerPath(''), '/app/projects');
  });
});

describe('isCompanyChatModulePath', () => {
  it('matches /app/company/chat only', () => {
    assert.equal(isCompanyChatModulePath('/app/company/chat'), true);
    assert.equal(isCompanyChatModulePath('/app/company/chat/'), true);
    assert.equal(isCompanyChatModulePath('/app/company/chat?tab=announcement'), true);
    assert.equal(isCompanyChatModulePath('/app/company/workspaces'), false);
    assert.equal(isCompanyChatModulePath('/app/company/home'), false);
  });
});

describe('isCompanyDocumentsModulePath', () => {
  it('matches /app/company/documents only', () => {
    assert.equal(isCompanyDocumentsModulePath('/app/company/documents'), true);
    assert.equal(isCompanyDocumentsModulePath('/app/company/documents/'), true);
    assert.equal(isCompanyDocumentsModulePath('/app/company/documents?tab=documents'), true);
    assert.equal(isCompanyDocumentsModulePath('/app/company/chat'), false);
    assert.equal(isImmersiveCompanyModulePath('/app/company/documents'), true);
    assert.equal(isImmersiveCompanyModulePath('/app/company/home'), false);
  });
});

describe('buildCompanyChatPath', () => {
  it('keeps chat module path with dept announcement tab without organizationId', () => {
    const path = buildCompanyChatPath('org1', {
      departmentId: 'dept1',
      tab: 'announcement',
      channelId: 'ch1',
    });
    assert.match(path, /^\/app\/company\/chat\?/);
    assert.doesNotMatch(path, /organizationId=/);
    assert.match(path, /departmentId=dept1/);
    assert.match(path, /tab=announcement/);
    assert.match(path, /channelId=ch1/);
  });

  it('keeps teamId on company chat path', () => {
    const path = buildCompanyChatPath('org1', {
      departmentId: 'dept1',
      teamId: 'team-be1',
      tab: 'chat',
      channelId: 'ch-team',
    });
    assert.match(path, /departmentId=dept1/);
    assert.match(path, /teamId=team-be1/);
    assert.match(path, /tab=chat/);
    assert.match(path, /channelId=ch-team/);
  });

  it('Be-1 and Be-2 produce different teamId on the same chat path', () => {
    const be1 = buildCompanyChatPath('org1', {
      departmentId: 'dept1',
      teamId: 'team-be1',
      tab: 'chat',
      channelId: 'ch-be1',
    });
    const be2 = buildCompanyChatPath('org1', {
      departmentId: 'dept1',
      teamId: 'team-be2',
      tab: 'chat',
      channelId: 'ch-be2',
    });
    assert.notEqual(be1, be2);
    assert.match(be1, /teamId=team-be1/);
    assert.match(be2, /teamId=team-be2/);
    assert.doesNotMatch(be1, /teamId=team-be2/);
    assert.doesNotMatch(be2, /teamId=team-be1/);
  });
});
