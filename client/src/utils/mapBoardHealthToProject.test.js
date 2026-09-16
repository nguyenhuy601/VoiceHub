import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBoardDetailRefs,
  buildBoardIdToProjectIndex,
  enrichBoardHealthList,
  enrichBoardHealthRow,
  enrichOverdueItems,
  projectRefFromBoardDetailPayload,
  resolveBoardHealthProject,
  resolveOverdueScopeLabel,
} from './mapBoardHealthToProject.js';

describe('mapBoardHealthToProject', () => {
  const projects = [
    {
      _id: 'projA',
      title: 'Sales AR Q4',
      projectCode: 'SALES-AR',
      organizationId: 'org1',
      defaultBoardId: 'boardA',
    },
    {
      projectId: 'projB',
      title: 'Voice Hub',
      organizationId: 'org1',
      boards: [{ _id: 'boardB' }, { id: 'boardB2' }],
    },
  ];

  it('indexes defaultBoardId and boards[]', () => {
    const index = buildBoardIdToProjectIndex(projects);
    assert.equal(index.get('boardA')?.projectId, 'projA');
    assert.equal(index.get('boardA')?.projectTitle, 'Sales AR Q4');
    assert.equal(index.get('boardA')?.projectCode, 'SALES-AR');
    assert.equal(index.get('boardB')?.projectId, 'projB');
    assert.equal(index.get('boardB2')?.projectTitle, 'Voice Hub');
  });

  it('resolves and enriches board health rows', () => {
    const index = buildBoardIdToProjectIndex(projects);
    const resolved = resolveBoardHealthProject({ id: 'boardA', name: 'Main' }, index);
    assert.equal(resolved?.projectId, 'projA');

    const enriched = enrichBoardHealthRow(
      { id: 'boardA', name: 'Main', organizationId: 'org1', overdue: 1 },
      index
    );
    assert.equal(enriched.projectId, 'projA');
    assert.equal(enriched.projectTitle, 'Sales AR Q4');
    assert.equal(enriched.name, 'Main');
    assert.equal(enriched.overdue, 1);
  });

  it('leaves unresolved boards without projectId', () => {
    const list = enrichBoardHealthList(
      [{ id: 'unknown', name: 'Main' }, { id: 'boardB', name: 'Main' }],
      projects
    );
    assert.equal(list[0].projectId, '');
    assert.equal(list[1].projectId, 'projB');
    assert.equal(list[1].projectTitle, 'Voice Hub');
  });

  it('parses project ref from board detail payload', () => {
    const ref = projectRefFromBoardDetailPayload({
      board: {
        _id: 'boardDemo',
        title: 'Cafe Ops',
        boardTitle: 'Main',
        projectId: 'projCafe',
        projectCode: 'CAFE',
        organizationId: 'org1',
      },
    });
    assert.equal(ref?.projectId, 'projCafe');
    assert.equal(ref?.projectTitle, 'Cafe Ops');
    assert.equal(ref?.projectCode, 'CAFE');
    assert.equal(ref?.boardId, 'boardDemo');
  });

  it('applies detail refs onto unresolved rows', () => {
    const rows = applyBoardDetailRefs(
      [
        { id: 'boardA', name: 'Main', projectId: 'projA', projectTitle: 'Sales AR Q4' },
        { id: 'boardDemo', name: 'Main' },
      ],
      {
        boardDemo: {
          projectId: 'projCafe',
          projectTitle: 'Cafe Ops',
          projectCode: 'CAFE',
          organizationId: 'org1',
          boardId: 'boardDemo',
        },
      }
    );
    assert.equal(rows[0].projectTitle, 'Sales AR Q4');
    assert.equal(rows[1].projectId, 'projCafe');
    assert.equal(rows[1].projectTitle, 'Cafe Ops');
  });

  it('marks enrichmentFailed when detail lookup returns null', () => {
    const rows = applyBoardDetailRefs([{ id: 'boardX', name: 'Main' }], { boardX: null });
    assert.equal(rows[0].enrichmentFailed, true);
    assert.equal(rows[0].projectId, undefined);
  });

  it('prefers BE projectId over FE index (Wave 2)', () => {
    const index = buildBoardIdToProjectIndex(projects);
    const enriched = enrichBoardHealthRow(
      {
        id: 'boardA',
        name: 'Main',
        projectId: 'projFromBe',
        projectTitle: 'From BE',
        projectCode: 'BE-1',
      },
      index
    );
    assert.equal(enriched.projectId, 'projFromBe');
    assert.equal(enriched.projectTitle, 'From BE');
    assert.equal(enriched.projectCode, 'BE-1');
  });

  it('fills blank BE title/code from FE index without overwriting projectId', () => {
    const index = buildBoardIdToProjectIndex(projects);
    const enriched = enrichBoardHealthRow(
      { id: 'boardA', name: 'Main', projectId: 'projFromBe', projectTitle: '', projectCode: '' },
      index
    );
    assert.equal(enriched.projectId, 'projFromBe');
    assert.equal(enriched.projectTitle, 'Sales AR Q4');
    assert.equal(enriched.projectCode, 'SALES-AR');
  });

  it('enrichOverdueItems maps project title; resolveOverdueScopeLabel hides Main', () => {
    const out = enrichOverdueItems(
      [
        {
          id: 't1',
          title: '[OV-DEMO] Review',
          boardId: 'boardA',
          boardName: 'Main',
          projectTitle: '',
        },
        {
          id: 't2',
          title: 'Other',
          boardId: 'unknown',
          boardName: 'Main',
        },
      ],
      [],
      projects
    );
    assert.equal(out[0].projectTitle, 'Sales AR Q4');
    assert.equal(out[0].projectId, 'projA');
    assert.equal(resolveOverdueScopeLabel(out[0]), 'Sales AR Q4');
    assert.equal(resolveOverdueScopeLabel(out[1]), '');
    assert.equal(resolveOverdueScopeLabel({ boardName: 'Main' }), '');
    assert.equal(resolveOverdueScopeLabel({ boardName: 'Sprint Board' }), 'Sprint Board');
  });
});
