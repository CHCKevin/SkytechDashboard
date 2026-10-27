import { errorInfo } from './openproject/errors.mjs';
import { normalizeProject, normalizeStatus, normalizeWorkPackage } from './openproject/normalize.mjs';

const MAX_AGE_MS = 30_000;
const MIN_REFRESH_MS = 10_000;

export function createSnapshotLoader({ client, baseUrl, now = () => Date.now() }) {
  let lastGood = null;
  let latest = null;
  let finishedAt = -Infinity;
  let inFlight = null;

  async function load() {
    const [projectElements, statusElements, workPackageElements] = await Promise.all([
      client.getAll('/api/v3/projects'),
      client.getAll('/api/v3/statuses'),
      // 預設篩選只含未結案項目；明確送出空篩選才會取得全部可見項目。
      client.getAll('/api/v3/work_packages', { filters: '[]' }),
    ]);
    const statuses = statusElements.map(normalizeStatus);
    const statusesById = new Map(statuses.map(status => [status.id, status]));
    const workPackages = workPackageElements.map(element => normalizeWorkPackage(element, statusesById, baseUrl));
    const projects = projectElements.map(normalizeProject);
    const projectIds = new Set(projects.map(project => project.id));
    const statusIds = new Set(statuses.map(status => status.id));
    workPackages.forEach((wp, index) => {
      // 項目所屬專案不在專案清單（例如封存）時，以連結標題補一個星系。
      if (!projectIds.has(wp.projectId)) {
        projectIds.add(wp.projectId);
        projects.push({ id: wp.projectId, name: workPackageElements[index]._links.project.title ?? '未知專案' });
      }
      if (!statusIds.has(wp.status.id)) {
        statusIds.add(wp.status.id);
        statuses.push(wp.status);
      }
    });
    const at = new Date(now()).toISOString();
    return {
      mode: 'live', revision: `live-${at}`, projects, workPackages, statuses,
      complete: true, stale: false, lastSuccessAt: at,
      progress: { loaded: workPackages.length, total: workPackages.length }, error: null,
    };
  }

  function failed(error) {
    const reason = errorInfo(error);
    if (reason.code === 'internal_error') console.error('Snapshot load failed:', error?.name ?? 'Error');
    if (lastGood) return { ...lastGood, stale: true, error: reason };
    return {
      mode: 'live', revision: 'none', projects: [], workPackages: [], statuses: [],
      complete: false, stale: false, lastSuccessAt: null, progress: { loaded: 0, total: null }, error: reason,
    };
  }

  function start() {
    inFlight = load()
      .then(snapshot => { lastGood = snapshot; return snapshot; }, failed)
      .then(result => { latest = result; finishedAt = now(); inFlight = null; return result; });
    return inFlight;
  }

  return {
    // 同時請求共用一輪；刷新可能被其他網頁觸發，因此從上一輪完成起算限制頻率；錯誤結果也至少保留 10 秒。
    async getSnapshot({ refresh = false } = {}) {
      if (inFlight) return inFlight;
      const maxAge = refresh || latest?.error ? MIN_REFRESH_MS : MAX_AGE_MS;
      if (latest && now() - finishedAt < maxAge) return latest;
      return start();
    },
  };
}
