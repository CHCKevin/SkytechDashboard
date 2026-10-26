const idle = Object.freeze({ status: 'idle', result: null, message: null });

function isVisible(snapshot, view, id) {
  const wp = snapshot?.workPackages.find(item => item.id === id);
  if (!wp) return false;
  return view.mode === 'universe' || (view.mode === 'galaxy' && wp.projectId === view.projectId);
}

export function createStore() {
  let state = { snapshot: null, view: { mode: 'overview', projectId: null }, selectedId: null, participants: idle };
  // 每次選取變更都遞增；回應帶回的 token 不同即為過時回應，不得覆蓋目前選取。
  let token = 0;
  const listeners = new Set();

  function update(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  function selection(id) {
    token += 1;
    return { selectedId: id, participants: id ? { status: 'loading', result: null, message: null } : idle };
  }

  function changeView(view) {
    const keep = state.selectedId && isVisible(state.snapshot, view, state.selectedId);
    update({ view, ...(keep ? {} : selection(null)) });
  }

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSnapshot(snapshot) {
      const patch = { snapshot };
      // 只有完整快照才能確認項目或專案已消失；部分資料不得當成刪除。
      if (snapshot.complete) {
        const { projectId } = state.view;
        if (projectId && !snapshot.projects.some(project => project.id === projectId)) {
          patch.view = { mode: 'overview', projectId: null };
        }
        if (state.selectedId && !isVisible(snapshot, patch.view ?? state.view, state.selectedId)) {
          Object.assign(patch, selection(null));
        }
      }
      update(patch);
    },
    showOverview: () => changeView({ mode: 'overview', projectId: null }),
    showProject: projectId => changeView({ mode: 'galaxy', projectId }),
    showUniverse: () => changeView({ mode: 'universe', projectId: null }),
    select(id) {
      update(selection(id ?? null));
      return token;
    },
    receiveParticipants(requestToken, result) {
      if (requestToken !== token) return false;
      update({ participants: { status: 'ready', result, message: null } });
      return true;
    },
    failParticipants(requestToken, message) {
      if (requestToken !== token) return false;
      update({ participants: { status: 'error', result: null, message } });
      return true;
    },
  };
}
