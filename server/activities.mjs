import { collectParticipants } from '../shared/participants.mjs';
import { SourceError, errorInfo } from './openproject/errors.mjs';
import { personFromLink } from './openproject/normalize.mjs';

const NO_UPDATED_AT_TTL_MS = 60_000;
// 這兩種查名失敗是穩定結果，可以記住；其他（逾時、限流、伺服器錯誤）下次再查。
const STABLE_LOOKUP_ERRORS = new Set(['forbidden', 'not_found']);

export function createParticipantsLoader({ client, now = () => Date.now() }) {
  const cache = new Map();
  const userNames = new Map();

  // 活動連結可能沒有名字；查使用者資料補上，查不到就保留 null（顯示為未知使用者）。
  async function withName(person) {
    if (!person || person.name !== null || !/^\d+$/.test(person.id ?? '')) return person;
    if (!userNames.has(person.id)) {
      userNames.set(person.id, client.getJson(`/api/v3/users/${person.id}`)
        .then(user => (typeof user?.name === 'string' ? user.name : null), error => {
          if (!(error instanceof SourceError && STABLE_LOOKUP_ERRORS.has(error.code))) userNames.delete(person.id);
          return null;
        }));
    }
    return { ...person, name: await userNames.get(person.id) };
  }

  function partial(id, updatedAt, roles, error) {
    if (errorInfo(error).code === 'internal_error') console.error('Participants load failed:', error?.name ?? 'Error');
    return {
      workPackageId: id, workPackageUpdatedAt: updatedAt,
      people: collectParticipants(roles[0], roles[1], []), complete: false, error: errorInfo(error),
    };
  }

  async function getParticipants(id, { refresh = false } = {}) {
    let element;
    try {
      element = await client.getJson(`/api/v3/work_packages/${id}`);
    } catch (error) {
      if (error instanceof SourceError && error.code === 'not_found') return null;
      return partial(id, null, [null, null], error);
    }
    const updatedAt = typeof element?.updatedAt === 'string' ? element.updatedAt : null;
    const roles = [personFromLink(element?._links?.author), personFromLink(element?._links?.assignee)];
    const cached = cache.get(id);
    // 有 updatedAt 時以它為鍵；沒有時只短暫快取。
    if (!refresh && cached && cached.updatedAt === updatedAt && (updatedAt !== null || cached.expiresAt > now())) {
      return cached.result;
    }
    let actors;
    try {
      const activities = await client.getAll(`/api/v3/work_packages/${id}/activities`);
      actors = activities.map(activity => personFromLink(activity?._links?.user)).filter(Boolean);
    } catch (error) {
      return partial(id, updatedAt, roles, error);
    }
    const named = await Promise.all([...roles, ...actors].map(withName));
    const [author, assignee, ...others] = named;
    const result = {
      workPackageId: id, workPackageUpdatedAt: updatedAt,
      people: collectParticipants(author, assignee, others), complete: true, error: null,
    };
    // 有名字因暫時性錯誤沒查到時不快取，下次選取再補。
    const missedName = named.some(person => person?.name === null && /^\d+$/.test(person.id ?? '') && !userNames.has(person.id));
    if (!missedName) cache.set(id, { updatedAt, result, expiresAt: now() + NO_UPDATED_AT_TTL_MS });
    return result;
  }

  return { getParticipants };
}
