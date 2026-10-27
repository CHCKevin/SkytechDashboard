import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linkId, personFromLink, normalizeProject, normalizeStatus, normalizeWorkPackage, unknownStatus,
} from '../server/openproject/normalize.mjs';
import { SourceError } from '../server/openproject/errors.mjs';

const statuses = new Map([['7', { id: '7', name: 'In progress', color: '#38bdf8' }]]);
const links = {
  project: { href: '/api/v3/projects/1', title: '星圖平台' },
  status: { href: '/api/v3/statuses/7', title: 'In progress' },
  author: { href: '/api/v3/users/5', title: 'Alex' },
  assignee: { href: null },
};
const wp = (overrides = {}) => ({
  id: 11, subject: '建立登入頁', updatedAt: '2026-10-20T08:00:00Z', description: { raw: '內容' }, _links: links, ...overrides,
});
const invalid = error => error instanceof SourceError && error.code === 'invalid_response';

test('principals keep distinct ID spaces', () => {
  assert.equal(linkId({ href: '/api/v3/projects/12' }, 'projects'), '12');
  assert.equal(linkId({ href: '/api/v3/projects/12/x' }, 'projects'), null);
  assert.deepEqual(personFromLink({ href: '/api/v3/users/5', title: ' Alex ' }), { id: '5', name: 'Alex' });
  assert.deepEqual(personFromLink({ href: '/api/v3/groups/5', title: 'QA' }), { id: 'group:5', name: 'QA' });
  assert.deepEqual(personFromLink({ href: '/api/v3/placeholder_users/5' }), { id: 'placeholder:5', name: null });
  assert.equal(personFromLink({ href: null }), null);
  assert.equal(personFromLink(undefined), null);
});
test('projects and statuses use string IDs and safe colors', () => {
  assert.deepEqual(normalizeProject({ id: 1, name: '星圖平台' }), { id: '1', name: '星圖平台' });
  assert.deepEqual(normalizeStatus({ id: 1, name: 'New', color: '#1A67A3' }), { id: '1', name: 'New', color: '#1a67a3' });
  assert.match(normalizeStatus({ id: 7, name: 'x', color: null }).color, /^#[0-9a-f]{6}$/);
  assert.throws(() => normalizeProject({ name: 'no id' }), invalid);
  assert.throws(() => normalizeStatus(null), invalid);
});
test('work packages map to the frontend contract', () => {
  assert.deepEqual(normalizeWorkPackage(wp(), statuses, 'http://op.test'), {
    id: '11', projectId: '1', subject: '建立登入頁',
    author: { id: '5', name: 'Alex' }, assignee: null,
    status: { id: '7', name: 'In progress', color: '#38bdf8' },
    description: '內容', updatedAt: '2026-10-20T08:00:00Z', url: 'http://op.test/work_packages/11',
  });
  const odd = normalizeWorkPackage(wp({
    description: { raw: '  ' }, updatedAt: undefined,
    _links: {
      project: { href: '/api/v3/projects/3' },
      status: { href: '/api/v3/statuses/99', title: 'Rejected' },
      author: { href: '/api/v3/users/9' },
      assignee: { href: '/api/v3/groups/3', title: 'QA' },
    },
  }), statuses, 'http://op.test');
  assert.equal(odd.description, null);
  assert.equal(odd.updatedAt, null);
  assert.deepEqual(odd.author, { id: '9', name: '未知使用者' });
  assert.deepEqual(odd.assignee, { id: 'group:3', name: 'QA' });
  assert.equal(odd.status.id, '99');
  assert.equal(odd.status.name, 'Rejected');
  assert.match(odd.status.color, /^#[0-9a-f]{6}$/);
  const noStatus = normalizeWorkPackage(wp({ _links: { ...links, status: undefined } }), statuses, 'http://op.test');
  assert.deepEqual(noStatus.status, unknownStatus);
});
test('malformed elements are rejected instead of guessed', () => {
  for (const bad of [wp({ id: 'abc' }), wp({ subject: 42 }), wp({ _links: { status: links.status } }), null]) {
    assert.throws(() => normalizeWorkPackage(bad, statuses, 'http://op.test'), invalid);
  }
});
