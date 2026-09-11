import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCollaborateProjectHubPath,
  buildCompanyChatPath,
  buildProjectsModulePath,
  buildProjectsPickerPath,
  isCompanyChatModulePath,
} from './suitePathUtils.js';

describe('buildProjectsModulePath', () => {
  it('keeps module and serializes organizationId, boardId, channelId', () => {
    const path = buildProjectsModulePath('pid1', 'list', {
      organizationId: 'org1',
      boardId: 'board1',
      channelId: 'ch1',
    });
    assert.match(path, /\/app\/projects\/pid1\/list\?/);
    assert.match(path, /organizationId=org1/);
    assert.match(path, /boardId=board1/);
    assert.match(path, /channelId=ch1/);
    assert.doesNotMatch(path, /\/overview/);
  });

  it('maps changeRequests tab id to change-requests segment', () => {
    assert.equal(
      buildProjectsModulePath('p', 'changeRequests', { organizationId: 'o' }),
      '/app/projects/p/change-requests?organizationId=o'
    );
  });

  it('omits empty channelId', () => {
    const path = buildProjectsModulePath('p', 'chat', {
      organizationId: 'o',
      channelId: '',
    });
    assert.equal(path, '/app/projects/p/chat?organizationId=o');
  });

  it('chat path does not require boardId', () => {
    const path = buildProjectsModulePath('p', 'chat', { organizationId: 'o' });
    assert.equal(path, '/app/projects/p/chat?organizationId=o');
    assert.doesNotMatch(path, /boardId=/);
  });
});

describe('buildCollaborateProjectHubPath', () => {
  it('preserves explicit module when syncing boardId (board inject)', () => {
    const path = buildCollaborateProjectHubPath('pid', {
      module: 'board',
      organizationId: 'org',
      boardId: 'b1',
    });
    assert.equal(path, '/app/projects/pid/board?organizationId=org&boardId=b1');
  });

  it('defaults to overview when module omitted (wizard success)', () => {
    const path = buildCollaborateProjectHubPath('pid', {
      organizationId: 'org',
      boardId: 'b1',
    });
    assert.equal(path, '/app/projects/pid/overview?organizationId=org&boardId=b1');
  });
});

describe('buildProjectsPickerPath', () => {
  it('appends organizationId when present', () => {
    assert.equal(buildProjectsPickerPath('org9'), '/app/projects?organizationId=org9');
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

describe('buildCompanyChatPath', () => {
  it('keeps chat module path with dept announcement tab', () => {
    const path = buildCompanyChatPath('org1', {
      departmentId: 'dept1',
      tab: 'announcement',
      channelId: 'ch1',
    });
    assert.match(path, /^\/app\/company\/chat\?/);
    assert.match(path, /organizationId=org1/);
    assert.match(path, /departmentId=dept1/);
    assert.match(path, /tab=announcement/);
    assert.match(path, /channelId=ch1/);
  });
});
