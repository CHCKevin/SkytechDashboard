<script>
  import { onMount } from 'svelte';
  import * as api from '../lib/api.js';
  import { formatWeekLabel, timesheetPdfUrl } from '../lib/timesheet.js';
  import AcceptDialog from './AcceptDialog.svelte';
  import PinDialog from './PinDialog.svelte';
  import QuestBoard from './QuestBoard.svelte';
  import SpecialQuest from './SpecialQuest.svelte';
  import TodayLog from './TodayLog.svelte';

  // 任務欄頁籤：常駐任務、特別任務與本日已接任務。日期由 App 持有，兩個頁籤共用。
  let { date, ondatechange, onbanner } = $props();

  // 這些錯誤代表請求可能已送達 OpenProject 但回應遺失或無法解讀，不能直接重送。
  const UNCERTAIN = new Set(['network', 'timeout', 'upstream_error', 'write_unconfirmed']);

  let target = $state(8);
  let openProjectUrl = $state(null);
  let quests = $state([]);
  let entries = $state([]);
  let loading = $state(false);
  let loadError = $state('');
  let dialog = $state(null);
  let pinning = $state(false);
  let latestLoad = 0;

  onMount(async () => {
    // 各自獨立：其中一個失敗不該讓其他已成功的資料被丟掉。
    const [config, pinned] = await Promise.allSettled([api.getConfig(), api.listQuests()]);
    if (config.status === 'fulfilled') {
      target = config.value.dailyTargetHours;
      openProjectUrl = config.value.openProjectUrl ?? null;
    }
    if (pinned.status === 'fulfilled') quests = pinned.value;
    const failed = [config, pinned].find(result => result.status === 'rejected');
    if (failed) onbanner(failed.reason.message);
  });

  // 報表連結跟著頂端所選日期換週；示例模式沒有 OpenProject 網址就不顯示。
  const timesheetHref = $derived(openProjectUrl ? timesheetPdfUrl(openProjectUrl, date) : null);

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
        onbanner(error.message);
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
    if (values.date !== undefined && values.date !== date) ondatechange(values.date);
    else await loadEntries(date);
  }

  async function removeEntry(entry) {
    if (!window.confirm(`確定刪除「${entry.workPackageSubject}」${entry.hours}h 的紀錄？`)) return;
    try {
      await api.deleteEntry(entry.id);
      await loadEntries(date);
    } catch (error) {
      onbanner(error.message);
      // 刪除可能其實已成功（回應遺失），重讀清單讓該列正確消失。
      await loadEntries(date);
    }
  }

  async function unpin(quest) {
    if (!window.confirm(`把 #${quest.workPackageId} 從布告欄撕下？（已記錄的工時不受影響）`)) return;
    try {
      quests = await api.unpinQuest(quest.workPackageId);
    } catch (error) {
      onbanner(error.message);
    }
  }

  async function pin(input) {
    quests = await api.pinQuest(input);
    pinning = false;
  }
</script>

<main class="layout">
  <QuestBoard {quests}
    onaccept={quest => openCreate({ id: quest.workPackageId, subject: quest.subject }, quest.activityId, quest.activityName)}
    onunpin={unpin}
    onpin={() => (pinning = true)}>
    <SpecialQuest onselect={workPackage => openCreate(workPackage)} />
  </QuestBoard>
  <div class="log-column">
    {#if timesheetHref}
      <a class="btn timesheet-link" href={timesheetHref} target="_blank" rel="noopener noreferrer">匯出工時表（{formatWeekLabel(date)}）↗</a>
    {/if}
    <TodayLog {entries} {target} {loading} {loadError} onedit={openEdit} ondelete={removeEntry} />
  </div>
</main>

{#if dialog}
  <AcceptDialog mode={dialog.mode} workPackage={dialog.workPackage} initial={dialog.initial}
    onsubmit={submitDialog} oncancel={() => (dialog = null)} />
{/if}
{#if pinning}
  <PinDialog onsubmit={pin} oncancel={() => (pinning = false)} />
{/if}
