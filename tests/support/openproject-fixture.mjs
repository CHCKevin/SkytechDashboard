import { collection } from './fake-openproject.mjs';

export const users = { 5: 'Alex', 6: '林小美', 8: '陳大文' };
const user = id => ({ href: `/api/v3/users/${id}`, title: users[id] });

export const workPackages = [
  { id: 11, subject: '建立登入頁', updatedAt: '2026-10-20T08:00:00Z', description: { raw: '一般' },
    _links: { project: { href: '/api/v3/projects/1', title: '星圖平台' }, status: { href: '/api/v3/statuses/7', title: 'In progress' },
      author: user(5), assignee: user(6) } },
  { id: 12, subject: '舊需求', updatedAt: '2026-10-21T08:00:00Z', description: { raw: '' },
    _links: { project: { href: '/api/v3/projects/3', title: '封存專案' }, status: { href: '/api/v3/statuses/99', title: 'Rejected' },
      author: user(6), assignee: { href: null } } },
  { id: 13, subject: '測試計畫', updatedAt: '2026-10-22T08:00:00Z', description: null,
    _links: { project: { href: '/api/v3/projects/2', title: '太空站維運' }, status: { href: '/api/v3/statuses/12', title: 'Closed' },
      author: user(5), assignee: { href: '/api/v3/groups/3', title: 'QA 群組' } } },
];

const activities = [
  { _type: 'Activity::Comment', id: 1, _links: { user: user(6) } },
  { _type: 'Activity', id: 2, _links: { user: { href: '/api/v3/users/8' } } },
  { _type: 'Activity', id: 3, _links: { user: { href: '/api/v3/users/9' } } },
  { _type: 'Activity::Comment', id: 4, _links: { user: user(5) } },
];

// 假 OpenProject 路由；overrides 以路徑為鍵，值為回應物件或 (url) => 回應。
export function fixtureRoutes(overrides = {}) {
  return url => {
    const custom = overrides[url.pathname];
    if (custom) return typeof custom === 'function' ? custom(url) : custom;
    if (url.pathname === '/api/v3/projects') {
      return url.searchParams.get('offset') === '2'
        ? { body: collection([{ id: 2, name: '太空站維運' }], { total: 2 }) }
        : { body: collection([{ id: 1, name: '星圖平台' }], { total: 2, next: '/api/v3/projects?offset=2&pageSize=1' }) };
    }
    if (url.pathname === '/api/v3/statuses') {
      return { body: collection([
        { id: 1, name: 'New', color: '#1A67A3' }, { id: 7, name: 'In progress', color: null }, { id: 12, name: 'Closed', color: '#666666' },
      ]) };
    }
    if (url.pathname === '/api/v3/work_packages') return { body: collection(workPackages) };
    if (url.pathname === '/api/v3/work_packages/11/activities') return { body: collection(activities) };
    const item = url.pathname.match(/^\/api\/v3\/work_packages\/(\d+)$/);
    if (item) {
      const element = workPackages.find(wp => String(wp.id) === item[1]);
      return element ? { body: element } : { status: 404, body: {} };
    }
    const person = url.pathname.match(/^\/api\/v3\/users\/(\d+)$/);
    if (person) return users[person[1]] ? { body: { id: Number(person[1]), name: users[person[1]] } } : { status: 403, body: {} };
    return { status: 404, body: {} };
  };
}
