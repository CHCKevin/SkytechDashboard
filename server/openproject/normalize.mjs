import { colorForStatus } from '../../shared/layout.mjs';
import { SourceError } from './errors.mjs';

const UNKNOWN_STATUS = '未知狀態';
const UNKNOWN_USER = '未知使用者';

export const unknownStatus = Object.freeze({ id: null, name: UNKNOWN_STATUS, color: colorForStatus(null) });

// 由 HAL 連結取出資源 ID；格式不符時回傳 null。
export function linkId(link, resource) {
  const match = typeof link?.href === 'string' && link.href.match(new RegExp(`^/api/v3/${resource}/(\\d+)$`));
  return match ? match[1] : null;
}

// 使用者、群組、佔位使用者各自有獨立 ID，加上前綴避免去重時互相合併。
const principals = [['users', ''], ['groups', 'group:'], ['placeholder_users', 'placeholder:']];

export function personFromLink(link) {
  if (!link?.href) return null;
  const name = typeof link.title === 'string' && link.title.trim() ? link.title.trim() : null;
  for (const [resource, prefix] of principals) {
    const id = linkId(link, resource);
    if (id) return { id: `${prefix}${id}`, name };
  }
  return { id: null, name };
}

function requireId(value) {
  if (Number.isInteger(value) || (typeof value === 'string' && /^\d+$/.test(value))) return String(value);
  throw new SourceError('invalid_response');
}

export function normalizeProject(element) {
  return { id: requireId(element?.id), name: typeof element.name === 'string' ? element.name : '未命名專案' };
}

export function normalizeStatus(element) {
  const id = requireId(element?.id);
  return { id, name: typeof element.name === 'string' ? element.name : UNKNOWN_STATUS, color: colorForStatus(id, element.color) };
}

export function normalizeWorkPackage(element, statusesById, baseUrl) {
  const id = requireId(element?.id);
  const links = element._links ?? {};
  const projectId = linkId(links.project, 'projects');
  if (!projectId || typeof element.subject !== 'string') throw new SourceError('invalid_response');
  const statusId = linkId(links.status, 'statuses');
  const named = person => person && { ...person, name: person.name ?? UNKNOWN_USER };
  const raw = element.description?.raw;
  return {
    id,
    projectId,
    subject: element.subject,
    author: named(personFromLink(links.author)),
    assignee: named(personFromLink(links.assignee)),
    status: statusesById.get(statusId)
      ?? (statusId ? { id: statusId, name: links.status.title ?? UNKNOWN_STATUS, color: colorForStatus(statusId) } : unknownStatus),
    description: typeof raw === 'string' && raw.trim() ? raw : null,
    updatedAt: typeof element.updatedAt === 'string' ? element.updatedAt : null,
    url: `${baseUrl}/work_packages/${id}`,
  };
}
