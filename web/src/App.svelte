<script>
  import { onMount } from 'svelte';
  import * as api from './lib/api.js';
  import { todayLocal } from './lib/dates.js';
  import AcceptDialog from './components/AcceptDialog.svelte';
  import PinDialog from './components/PinDialog.svelte';
  import QuestBoard from './components/QuestBoard.svelte';
  import SpecialQuest from './components/SpecialQuest.svelte';
  import TodayLog from './components/TodayLog.svelte';
  import TopBar from './components/TopBar.svelte';

  // 這些錯誤代表請求可能已送達 OpenProject 但回應遺失或無法解讀，不能直接重送。
  const UNCERTAIN = new Set(['network', 'timeout', 'upstream_error', 'write_unconfirmed']);

  let date = $state(todayLocal());
  let me = $state(null);
  let target = $state(8);
  let quests = $state([]);
  let entries = $state([]);
  let loading = $state(false);
  let loadError = $state('');
  let banner = $state('');
  let dialog = $state(null);
  let pinning = $state(false);
  let latestLoad = 0;

  onMount(async () => {
    // 各自獨立：其中一個失敗不該讓其他已成功的資料被丟掉。
    const [user, config, pinned] = await Promise.allSettled([api.getMe(), api.getConfig(), api.listQuests()]);
    if (user.status === 'fulfilled') me = user.value;
    if (config.status === 'fulfilled') target = config.value.dailyTargetHours;
    if (pinned.status === 'fulfilled') quests = pinned.value;
    const failed = [user, config, pinned].find(result => result.status === 'rejected');
    if (failed) banner = failed.reason.message;
  });

  $effect(() => {
    loadEntries(date);
  });

  // 只採用最後一次讀取的結果，快速切換日期時舊回應不會蓋掉新日期。
  async function loadEntries(day) {
    const mine = ++latestLoad;
    // 先清空：載入中或失敗時不能把前一天的紀錄當成這一天顯示（[改]/[刪] 會動到錯的資料）。
    entries = [];
    loading = true;
    loadError = '';
    try {
      const list = await api.listEntries(day);
      if (mine === latestLoad) {
        entries = list;
        loading = false;
      }
    } catch (error) {
      if (mine === latestLoad) {
        loading = false;
        loadError = error.message;
        banner = error.message;
      }
    }
  }

  function openCreate(workPackage, activityId = null, activityName = null) {
    dialog = { mode: 'create', workPackage, initial: { date, hours: null, activityId, activityName, comment: '' } };
  }

  function openEdit(entry) {
    dialog = {
      mode: 'edit', entryId: entry.id,
      workPackage: { id: entry.workPackageId, subject: entry.workPackageSubject },
      initial: { date: entry.date, hours: entry.hours, activityId: entry.activityId, activityName: entry.activityName, comment: entry.comment },
    };
  }

  async function submitDialog(values) {
    const current = dialog;
    try {
      if (current.mode === 'edit') await api.updateEntry(current.entryId, values);
      else await api.createEntry({ workPackageId: current.workPackage.id, ...values });
    } catch (error) {
      if (current.mode === 'create' && UNCERTAIN.has(error.code)) {
        await loadEntries(date);
        throw new Error('連線中斷，結果不確定：已重新讀取清單，請先確認這筆是否已建立，再決定是否重送');
      }
      throw error;
    }
    dialog = null;
    // 修改模式只帶有變動的欄位，values.date 可能不存在。
    if (values.date !== undefined && values.date !== date) date = values.date;
    else await loadEntries(date);
  }

  async function removeEntry(entry) {
    if (!window.confirm(`確定刪除「${entry.workPackageSubject}」${entry.hours}h 的紀錄？`)) return;
    try {
      await api.deleteEntry(entry.id);
      await loadEntries(date);
    } catch (error) {
      banner = error.message;
      // 刪除可能其實已成功（回應遺失），重讀清單讓該列正確消失。
      await loadEntries(date);
    }
  }

  async function unpin(quest) {
    if (!window.confirm(`把 #${quest.workPackageId} 從布告欄撕下？（已記錄的工時不受影響）`)) return;
    try {
      quests = await api.unpinQuest(quest.workPackageId);
    } catch (error) {
      banner = error.message;
    }
  }

  async function pin(input) {
    quests = await api.pinQuest(input);
    pinning = false;
  }
</script>

<div class="app">
  <TopBar {date} {me} onchange={day => (date = day)} />
  {#if banner}
    <p class="banner" role="alert">{banner} <button class="link" onclick={() => (banner = '')}>關閉</button></p>
  {/if}
  <main class="layout">
    <QuestBoard {quests}
      onaccept={quest => openCreate({ id: quest.workPackageId, subject: quest.subject }, quest.activityId, quest.activityName)}
      onunpin={unpin}
      onpin={() => (pinning = true)}>
      <SpecialQuest onselect={workPackage => openCreate(workPackage)} />
    </QuestBoard>
    <TodayLog {entries} {target} {loading} {loadError} onedit={openEdit} ondelete={removeEntry} />
  </main>
</div>

{#if dialog}
  <AcceptDialog mode={dialog.mode} workPackage={dialog.workPackage} initial={dialog.initial}
    onsubmit={submitDialog} oncancel={() => (dialog = null)} />
{/if}
{#if pinning}
  <PinDialog onsubmit={pin} oncancel={() => (pinning = false)} />
{/if}
