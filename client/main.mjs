import { fetchSnapshot, fetchParticipants } from './api.mjs';
import { createStore } from './store.mjs';
import {
  MISSING, legendEntries, projectSummaries, visibleWorkPackages, detailFields, participantsStatus, safeUrl,
} from './view-model.mjs';

const $ = id => document.getElementById(id);

// 所有資料文字一律經 textContent 寫入，不使用 innerHTML。
function el(tag, text, props = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return Object.assign(node, props);
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = !text;
}

async function start() {
  if (!hasWebGL()) {
    showMessage('此瀏覽器或裝置不支援 WebGL，無法顯示 3D 宇宙。請改用支援 WebGL 的桌面瀏覽器。');
    return;
  }
  const { createScene } = await import('./scene.mjs');
  const store = createStore();
  const scene = createScene($('scene'), {
    onPickProject: id => store.showProject(id),
    onPickWorkPackage: id => select(id),
    onProgress: (rendered, total) => {
      $('progress').textContent = rendered < total ? `已呈現 ${rendered} / ${total} 顆星球` : '';
    },
  });

  async function select(id) {
    const token = store.select(id);
    if (!id) return;
    let result;
    try {
      result = await fetchParticipants(id);
    } catch (error) {
      store.failParticipants(token, error.message);
      return;
    }
    store.receiveParticipants(token, result);
  }

  function renderLegend(snapshot) {
    $('legend').replaceChildren(...legendEntries(snapshot).map(entry => {
      const swatch = el('span', null, { className: 'swatch' });
      swatch.style.background = entry.color;
      const item = el('li');
      item.append(swatch, el('span', `${entry.name}（${entry.count}）`));
      return item;
    }));
  }

  function renderProjectOptions(snapshot) {
    $('project-select').replaceChildren(
      el('option', '選擇專案…', { value: '' }),
      ...snapshot.projects.map(project => el('option', project.name, { value: project.id })),
    );
  }

  function renderList({ snapshot, view, selectedId }) {
    const list = $('item-list');
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const buttons = [];
    if (view.mode === 'overview') {
      $('list-title').textContent = '專案';
      for (const project of projectSummaries(snapshot)) {
        const button = el('button', `${project.name}（${project.count}）`, { type: 'button', onclick: () => store.showProject(project.id) });
        button.dataset.key = `project:${project.id}`;
        buttons.push(button);
      }
    } else {
      const project = snapshot.projects.find(item => item.id === view.projectId);
      $('list-title').textContent = view.mode === 'universe' ? '全部工作項目' : `${project?.name ?? MISSING} 的工作項目`;
      for (const wp of visibleWorkPackages(snapshot, view)) {
        const button = el('button', `#${wp.id} ${wp.subject}`, { type: 'button', onclick: () => select(wp.id) });
        button.dataset.key = `wp:${wp.id}`;
        if (wp.id === selectedId) button.setAttribute('aria-current', 'true');
        buttons.push(button);
      }
    }
    const empty = view.mode === 'overview' ? '沒有可見的專案' : '此視圖沒有工作項目';
    list.replaceChildren(...(buttons.length ? buttons : [el('span', empty)]).map(child => {
      const item = el('li');
      item.append(child);
      return item;
    }));
    // 重新繪製清單後保留鍵盤焦點。
    if (focused) buttons.find(button => button.dataset.key === focused)?.focus();
  }

  function renderDetail({ snapshot, selectedId, participants }) {
    const wp = snapshot.workPackages.find(item => item.id === selectedId);
    $('detail-panel').hidden = !wp;
    if (!wp) return;
    const project = snapshot.projects.find(item => item.id === wp.projectId);
    $('detail-title').textContent = `#${wp.id} ${wp.subject}`;
    const href = safeUrl(wp.url);
    const link = el('dd');
    link.append(href ? el('a', '在 OpenProject 開啟', { href, target: '_blank', rel: 'noopener noreferrer' }) : MISSING);
    $('detail-fields').replaceChildren(
      ...detailFields(wp, project?.name).flatMap(([name, value]) => [el('dt', name), el('dd', value)]),
      el('dt', '來源連結'), link,
    );
    $('participants-status').textContent = participantsStatus(participants);
    const people = participants.status === 'ready' ? participants.result.people : [];
    $('participants-list').replaceChildren(...people.map(person =>
      el('li', person.id === null ? `${person.name}（身分不明紀錄）` : person.name)));
  }

  let last = {};
  store.subscribe(state => {
    if (state.snapshot !== last.snapshot) {
      scene.setData(state.snapshot);
      renderLegend(state.snapshot);
      renderProjectOptions(state.snapshot);
      $('mode-badge').textContent = state.snapshot.mode === 'demo' ? '示例資料' : '即時資料';
    }
    if (state.view !== last.view) scene.setView(state.view);
    if (state.selectedId !== last.selectedId) scene.select(state.selectedId);
    if (state.participants !== last.participants && state.participants.status === 'ready') {
      scene.showShips(state.selectedId, state.participants.result.people);
    }
    if (state.snapshot !== last.snapshot || state.view !== last.view || state.selectedId !== last.selectedId) {
      renderList(state);
    }
    renderDetail(state);
    $('project-select').value = state.view.projectId ?? '';
    $('btn-universe').setAttribute('aria-pressed', String(state.view.mode === 'universe'));
    last = state;
  });

  $('btn-overview').onclick = () => store.showOverview();
  $('btn-universe').onclick = () => store.showUniverse();
  $('project-select').onchange = event => {
    if (event.target.value) store.showProject(event.target.value);
    else store.showOverview();
  };
  $('btn-reset').onclick = () => scene.resetView();
  $('btn-close-detail').onclick = () => select(null);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') select(null); });

  showMessage('載入資料中…');
  try {
    const snapshot = await fetchSnapshot();
    store.setSnapshot(snapshot);
    showMessage(snapshot.complete ? '' : '資料未完整載入，畫面可能缺少部分項目。');
  } catch (error) {
    showMessage(`無法載入資料：${error.message}。請確認本機服務已啟動後重新整理頁面。`);
  }
}

start().catch(error => showMessage(`畫面初始化失敗：${error.message}`));
