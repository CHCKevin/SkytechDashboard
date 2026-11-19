<script>
  import { onMount } from 'svelte';
  import * as api from '../lib/api.js';
  import HallScene from './HallScene.svelte';
  import MemberPanel from './MemberPanel.svelte';
  import RecruitDialog from './RecruitDialog.svelte';

  // 公會大廳頁籤：讀取所選日期的成員狀態，停留時定時更新。只讀取，不改任何人的工時。
  const REFRESH_MS = 5 * 60_000;
  let { date, onbanner = () => {} } = $props();

  let members = $state([]);
  let loading = $state(false);
  let loadError = $state('');
  let refreshError = $state('');
  let updatedAt = $state('');
  let selectedId = $state(null);
  let recruiting = $state(false);
  let openProjectUrl = $state(null);
  // 這兩個刻意不是 $state：load 在 effect 中被呼叫，讀到響應式狀態會讓 effect 依賴自己寫入的值。
  let latest = 0;
  let loadedDate = null;

  const selected = $derived(members.find(member => member.userId === selectedId) ?? null);

  const clock = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  // 換到還沒讀過的日期時先清空（不能把舊日期的狀態當成新日期顯示）；
  // 同一天的重新讀取失敗時保留畫面，只標示更新失敗。只採用最後一次讀取的結果。
  async function load(day) {
    const mine = ++latest;
    const fresh = day !== loadedDate;
    if (fresh) {
      loadedDate = null;
      members = [];
      loading = true;
      loadError = '';
      refreshError = '';
    }
    try {
      const hall = await api.getHall(day);
      if (mine !== latest) return;
      members = hall.members;
      loadedDate = day;
      loading = false;
      loadError = '';
      refreshError = '';
      updatedAt = clock();
      if (!hall.members.some(member => member.userId === selectedId)) selectedId = null;
    } catch (error) {
      if (mine !== latest) return;
      loading = false;
      if (fresh) loadError = error.message;
      else refreshError = error.message;
    }
  }

  const refresh = () => load(date);

  // 只用來把工作包編號做成 OpenProject 連結；讀不到（或示例模式）就顯示純文字，不打擾使用者。
  onMount(() => {
    api.getConfig().then(config => { openProjectUrl = config.openProjectUrl ?? null; }, () => {});
  });

  $effect(() => {
    load(date);
  });

  // 頁面在背景時不讀取；回到前景時立刻補讀一次。
  $effect(() => {
    const tick = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  });

  async function recruit(userId) {
    await api.addHallMember(userId);
    recruiting = false;
    await refresh();
  }

  async function remove(member) {
    if (!window.confirm(`請 ${member.name} 離開大廳？（工時紀錄不受影響）`)) return;
    try {
      await api.removeHallMember(member.userId);
      selectedId = null;
      // 先從畫面拿掉：之後的重新讀取就算失敗，已請離的成員也不會留在場景裡。
      members = members.filter(item => item.userId !== member.userId);
    } catch (error) {
      onbanner(error.message);
    }
    await refresh();
  }
</script>

<main class="layout">
  <div class="hall-stage">
    <h2 class="board-title">🏰 公會大廳</h2>
    <HallScene {members} {selectedId} onselect={id => (selectedId = selectedId === id ? null : id)} />
  </div>
  <MemberPanel {members} {selected} {date} {openProjectUrl} {loading} {loadError} {refreshError} {updatedAt}
    onselect={id => (selectedId = id)} onback={() => (selectedId = null)}
    onrecruit={() => (recruiting = true)} onremove={remove} onrefresh={refresh} />
</main>

{#if recruiting}
  <RecruitDialog memberIds={members.map(member => member.userId)} onsubmit={recruit} oncancel={() => (recruiting = false)} />
{/if}
