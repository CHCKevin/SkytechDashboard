import test from 'node:test';
import assert from 'node:assert/strict';
import { collectParticipants } from '../shared/participants.mjs';

test('deduplicates IDs while preserving different people with the same name', () => {
  const people = collectParticipants({ id: '1', name: 'Alex' }, { id: 1, name: 'Alex' },
    [{ id: '2', name: 'Alex' }, { id: '1', name: 'Alex' }]);
  assert.deepEqual(people.map(p => p.id), ['1', '2']);
  assert.equal(new Set(people.map(p => p.key)).size, 2);
});
test('unassigned does not create a ship; unidentified actors are not falsely merged', () => {
  const people = collectParticipants(null, null,
    [{ id: null, name: 'Deleted' }, { id: null, name: 'Deleted' }, { id: '3', name: '' }]);
  assert.equal(people.length, 3);
  assert.equal(people[2].name, '未知使用者');
  assert.equal(new Set(people.map(p => p.key)).size, 3);
  assert.deepEqual(collectParticipants(null, null, []), []);
});
