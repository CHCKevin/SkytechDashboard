import { colorForStatus } from '../shared/layout.mjs';
import { collectParticipants } from '../shared/participants.mjs';

// 合成示例資料，不代表任何真實 OpenProject 內容。
// 涵蓋：空專案、未指派、同名不同 ID、一人多角色、未知狀態、無 updatedAt、歷史不完整、HTML 字串描述。
const people = {
  alexA: { id: '1', name: 'Alex' },
  alexB: { id: '2', name: 'Alex' },
  mei: { id: '3', name: '林小美' },
  wen: { id: '4', name: '陳大文' },
  deleted: { id: null, name: '已刪除使用者' },
};

const statuses = [
  { id: '1', name: '新建', color: '#1E90FF' },
  { id: '7', name: '進行中', color: null },
  { id: '12', name: '已關閉', color: '#6B7280' },
  { id: null, name: '未知狀態', color: null },
].map(status => ({ ...status, color: colorForStatus(status.id, status.color) }));
const statusById = new Map(statuses.map(status => [status.id, status]));

const projects = [
  { id: '101', name: '星圖平台' },
  { id: '102', name: '太空站維運' },
  { id: '103', name: '空專案' },
];

const workPackages = [
  { id: '1001', projectId: '101', subject: '建立登入頁', author: people.alexA, assignee: people.mei,
    statusId: '7', description: '示例：一般工作項目', updatedAt: '2026-10-20T08:00:00.000Z' },
  { id: '1002', projectId: '101', subject: '整合 API', author: people.mei, assignee: people.mei,
    statusId: '1', description: '<b>示例：此字串不應被當成 HTML</b>', updatedAt: '2026-10-22T03:30:00.000Z' },
  { id: '1003', projectId: '101', subject: '撰寫文件', author: people.alexB, assignee: null,
    statusId: '12', description: null, updatedAt: null },
  { id: '1004', projectId: '102', subject: '機房巡檢', author: people.wen, assignee: people.alexA,
    statusId: null, description: '示例：狀態不明且活動歷史不完整', updatedAt: '2026-10-25T10:15:00.000Z' },
];

const activities = {
  '1001': { authors: [people.mei, people.alexA, people.wen], complete: true },
  '1002': { authors: [people.mei], complete: true },
  '1003': { authors: [people.alexA, people.alexB], complete: true },
  '1004': { authors: [people.deleted], complete: false },
};

export function createDemoSource({ now = () => new Date() } = {}) {
  return {
    async getSnapshot() {
      const items = workPackages.map(({ statusId, ...wp }) =>
        ({ ...wp, status: statusById.get(statusId), url: null }));
      return structuredClone({
        mode: 'demo', revision: 'demo-1',
        projects, workPackages: items, statuses,
        complete: true, stale: false, lastSuccessAt: now().toISOString(),
        progress: { loaded: items.length, total: items.length },
        error: null,
      });
    },
    async getParticipants(id) {
      const wp = workPackages.find(item => item.id === id);
      if (!wp) return null;
      const history = activities[id];
      return structuredClone({
        workPackageId: id,
        workPackageUpdatedAt: wp.updatedAt,
        people: collectParticipants(wp.author, wp.assignee, history.authors),
        complete: history.complete,
        error: history.complete ? null
          : { code: 'activities_incomplete', message: '示例：活動歷史僅部分可讀，參與者名單可能不完整' },
      });
    },
  };
}
