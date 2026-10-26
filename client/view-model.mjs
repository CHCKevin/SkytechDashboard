export const MISSING = '未提供';

const text = value => (value == null || value === '' ? MISSING : String(value));
const statusKey = status => String(status.id);

export function legendEntries(snapshot) {
  const counts = new Map();
  for (const wp of snapshot.workPackages) {
    counts.set(statusKey(wp.status), (counts.get(statusKey(wp.status)) ?? 0) + 1);
  }
  return snapshot.statuses.map(status =>
    ({ name: status.name, color: status.color, count: counts.get(statusKey(status)) ?? 0 }));
}

export function projectSummaries(snapshot) {
  return snapshot.projects.map(project => ({
    ...project, count: snapshot.workPackages.filter(wp => wp.projectId === project.id).length,
  }));
}

export function visibleWorkPackages(snapshot, view) {
  if (view.mode === 'universe') return snapshot.workPackages;
  if (view.mode === 'galaxy') return snapshot.workPackages.filter(wp => wp.projectId === view.projectId);
  return [];
}

export function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? MISSING : date.toLocaleString('zh-TW', { hour12: false });
}

export function detailFields(wp, projectName) {
  return [
    ['專案', text(projectName)],
    ['狀態', text(wp.status?.name)],
    ['建立者', text(wp.author?.name)],
    ['負責人', wp.assignee ? text(wp.assignee.name) : '未指派'],
    ['更新時間', wp.updatedAt ? formatTime(wp.updatedAt) : MISSING],
    ['描述', text(wp.description)],
  ];
}

export function participantsStatus({ status, result, message }) {
  if (status === 'loading') return '載入參與者中…';
  if (status === 'error') return `參與者載入失敗：${message}`;
  if (status !== 'ready') return '';
  if (!result.complete) return `名單可能不完整：${result.error?.message ?? '活動歷史未完整讀取'}`;
  return result.people.length ? '' : '沒有可顯示的參與者';
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
