/**
 * Unit — Project greenfield (không load project.service — tránh env ORGANIZATION_SERVICE_URL).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('clear-task-service-data script', () => {
  it('lists task collections + requires --confirm and CLEAR_TASK_DATA_CONFIRM', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../devops/scripts/clear-task-service-data.js'),
      'utf8'
    );
    for (const name of [
      'projects',
      'taskboards',
      'tasks',
      'projectmemberships',
      'sprints',
      'projectroles',
      'taskactivitylogs',
    ]) {
      assert.match(src, new RegExp(`'${name}'`));
    }
    assert.match(src, /--confirm/);
    assert.match(src, /CLEAR_TASK_DATA_CONFIRM/);
    assert.doesNotMatch(src, /organizations/);
    assert.doesNotMatch(src, /users\b/);
  });
});

describe('project.routes greenfield', () => {
  it('exposes createProject not board-as-project mount', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/project.routes.js'),
      'utf8'
    );
    assert.match(src, /createProject/);
    assert.match(src, /:projectId\/boards/);
    assert.match(src, /:projectId\/sprints/);
    assert.match(src, /router\.delete\('\/:projectId\/sprints\/:sprintId'/);
    assert.doesNotMatch(src, /taskBoardRoutes/);
  });
});

describe('TaskBoard model projectId', () => {
  it('requires projectId on schema', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/models/TaskBoard.js'),
      'utf8'
    );
    assert.match(src, /projectId/);
    assert.match(src, /required:\s*true/);
  });
});
