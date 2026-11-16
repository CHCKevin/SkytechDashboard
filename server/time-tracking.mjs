import { fromDuration, toDuration } from './hours.mjs';
import { SourceError } from './openproject/errors.mjs';

const ME_FILTER = { user: { operator: '=', values: ['me'] } };

// 真實 OpenProject 工時來源；HAL 與本機 JSON 的轉換都在這裡。
export function createTimeTrackingSource({ client }) {
  async function getWorkPackage(id) {
    const wp = await client.getJson(`/api/v3/work_packages/${id}`);
    return { id: wp.id, subject: wp.subject ?? '', project: wp._links?.project?.title ?? '' };
  }

  return {
    async getMe() {
      const user = await client.getJson('/api/v3/users/me');
      return { id: user.id, name: user.name ?? '' };
    },

    async listEntries(date) {
      const filters = JSON.stringify([ME_FILTER, { spentOn: { operator: '=d', values: [date] } }]);
      const elements = await client.getAll('/api/v3/time_entries', { filters, sortBy: '[["id","asc"]]' });
      return elements.map(toEntry);
    },

    async createEntry(input) {
      await getWorkPackage(input.workPackageId);
      const hal = await client.send('POST', '/api/v3/time_entries', toPayload(input));
      // 請求已成功送達，之後才解讀失敗：結果其實已寫入，不可讓前端當成確定失敗而重送。
      try {
        return toEntry(hal);
      } catch {
        throw new SourceError('write_unconfirmed');
      }
    },

    async updateEntry(id, patch) {
      if (patch.workPackageId !== undefined) await getWorkPackage(patch.workPackageId);
      return toEntry(await client.send('PATCH', `/api/v3/time_entries/${id}`, toPayload(patch)));
    },

    async deleteEntry(id) {
      await client.send('DELETE', `/api/v3/time_entries/${id}`);
    },

    getWorkPackage,

    // subjectOrId 也會比對名稱子字串，精確編號可能不在第一頁；純數字時另外直接查該編號並排在最前面。
    async searchWorkPackages(term) {
      if (!term) return [];
      const filters = encodeURIComponent(JSON.stringify([{ subjectOrId: { operator: '**', values: [term] } }]));
      const sortBy = encodeURIComponent('[["updatedAt","desc"]]');
      const [page, exact] = await Promise.all([
        client.getJson(`/api/v3/work_packages?pageSize=10&filters=${filters}&sortBy=${sortBy}`),
        /^\d+$/.test(term) ? getWorkPackage(Number(term)).catch(ignoreMissing) : null,
      ]);
      const items = page?._embedded?.elements;
      if (!Array.isArray(items)) throw new SourceError('invalid_response');
      const results = items
        .map(wp => ({ id: wp.id, subject: wp.subject ?? '', project: wp._links?.project?.title ?? '' }))
        .filter(wp => wp.id !== exact?.id);
      return (exact ? [exact, ...results] : results).slice(0, 10);
    },

    async listActivities(workPackageId) {
      await getWorkPackage(workPackageId);
      const form = await client.send('POST', '/api/v3/time_entries/form', {
        _links: { entity: { href: `/api/v3/work_packages/${workPackageId}` } },
      });
      const allowed = form?._embedded?.schema?.activity?._embedded?.allowedValues;
      if (!Array.isArray(allowed)) throw new SourceError('invalid_response');
      return allowed.map(activity => ({ id: activity.id, name: activity.name ?? '', default: Boolean(activity.default) }));
    },
  };
}

function ignoreMissing(error) {
  if (error?.code === 'not_found' || error?.code === 'forbidden') return null;
  throw error;
}

function idFrom(href, pattern) {
  if (typeof href !== 'string') return null;
  const match = pattern.exec(new URL(href, 'http://local').pathname);
  return match ? Number(match[1]) : null;
}

function toEntry(hal) {
  if (!hal || typeof hal !== 'object') throw new SourceError('invalid_response');
  const entity = hal._links?.entity ?? hal._links?.workPackage ?? {};
  const activity = hal._links?.activity ?? {};
  const activityId = idFrom(activity.href, /^\/api\/v3\/time_entries\/activities\/(\d+)$/);
  return {
    id: hal.id,
    workPackageId: idFrom(entity.href, /^\/api\/v3\/work_packages\/(\d+)$/),
    workPackageSubject: entity.title ?? '',
    date: hal.spentOn,
    hours: fromDuration(hal.hours),
    activityId,
    activityName: activityId === null ? null : activity.title ?? '',
    comment: hal.comment?.raw ?? '',
  };
}

function toPayload({ workPackageId, date, hours, activityId, comment }) {
  const body = {};
  const links = {};
  if (date !== undefined) body.spentOn = date;
  if (hours !== undefined) body.hours = toDuration(hours);
  if (comment !== undefined) body.comment = { raw: comment };
  if (workPackageId !== undefined) links.entity = { href: `/api/v3/work_packages/${workPackageId}` };
  if (activityId !== undefined) {
    links.activity = { href: activityId === null ? null : `/api/v3/time_entries/activities/${activityId}` };
  }
  if (Object.keys(links).length) body._links = links;
  return body;
}
