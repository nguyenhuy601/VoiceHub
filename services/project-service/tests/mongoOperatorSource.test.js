const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BANNED = /\.find\(\s*req\.body|\.findOne\(\s*req\.body/;

function walkJs(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walkJs(full, acc);
    } else if (name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('project-service mongo operator source', () => {
  it('has no find(req.body) or findOne(req.body)', () => {
    const root = path.join(__dirname, '../src');
    const hits = [];
    for (const file of walkJs(root)) {
      const text = fs.readFileSync(file, 'utf8');
      if (BANNED.test(text)) hits.push(path.relative(root, file));
    }
    assert.deepEqual(hits, []);
  });

  it('createCard strips body operators and keeps boardId from the route param', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/taskBoard.controller.js'),
      'utf8'
    );
    const start = src.indexOf('async createCard');
    assert.ok(start >= 0);
    const next = src.indexOf('async moveCard', start);
    const body = src.slice(start, next === -1 ? src.length : next);
    assert.equal(body.includes('...req.body'), false);
    const spread = body.indexOf('bodyWithoutIdentity(req.body)');
    const board = body.indexOf('boardId,');
    assert.ok(spread >= 0 && board > spread);
  });

  it('createProjectSprint keeps session userId and route projectId after the body', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/project.controller.js'),
      'utf8'
    ).replace(/\r\n/g, '\n');
    const start = src.indexOf('async function createSprint');
    assert.ok(start >= 0);
    const next = src.indexOf('async function patchSprint', start);
    const body = src.slice(start, next === -1 ? src.length : next);
    assert.equal(body.includes('...req.body'), false);
    const spread = body.indexOf('...bodyWithoutIdentity(req.body)');
    const user = body.indexOf('userId,', spread);
    const project = body.indexOf('projectId,', spread);
    assert.ok(spread >= 0 && user > spread && project > user);
    assert.ok(body.includes("typeof rawBoardId === 'string'"));
  });

  it('createPlanningItem keeps session userId and route projectId after the body', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/planning.controller.js'),
      'utf8'
    ).replace(/\r\n/g, '\n');
    const start = src.indexOf('async function createItem');
    assert.ok(start >= 0);
    const next = src.indexOf('async function patchItem', start);
    const body = src.slice(start, next === -1 ? src.length : next);
    assert.equal(body.includes('...req.body'), false);
    const spread = body.indexOf('...bodyWithoutIdentity(req.body)');
    const user = body.indexOf('userId,', spread);
    const project = body.indexOf('projectId,', spread);
    assert.ok(spread >= 0 && user > spread && project > user);
  });
});
