import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findBoardCardById,
  pickPlanningEpicsAndFeatures,
} from './hydrateWorkItemDetailHelpers.js';

test('pickPlanningEpicsAndFeatures splits by type', () => {
  const { epics, features } = pickPlanningEpicsAndFeatures([
    { _id: '1', type: 'epic', title: 'E' },
    { _id: '2', type: 'Feature', title: 'F' },
    { _id: '3', type: 'story', title: 'S' },
  ]);
  assert.equal(epics.length, 1);
  assert.equal(features.length, 1);
  assert.equal(epics[0]._id, '1');
  assert.equal(features[0]._id, '2');
});

test('findBoardCardById matches _id or id', () => {
  const cards = [{ _id: 'abc', title: 'A' }, { id: 'def', title: 'B' }];
  assert.equal(findBoardCardById(cards, 'abc')?.title, 'A');
  assert.equal(findBoardCardById(cards, 'def')?.title, 'B');
  assert.equal(findBoardCardById(cards, 'zzz'), null);
});
