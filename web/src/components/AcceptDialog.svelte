<script>
  import { onMount } from 'svelte';
  import { listActivities } from '../lib/api.js';
  import { QUICK_HOURS, parseHoursInput } from '../lib/hours.js';

  let { mode = 'create', workPackage, initial, onsubmit, oncancel } = $props();

  // 表單欄位刻意只取 initial 掛載當下的快照（App 每次開啟都會重新掛載對話框）。
  // svelte-ignore state_referenced_locally
  let date = $state(initial.date);
  // svelte-ignore state_referenced_locally
  let hoursText = $state(initial.hours == null ? '' : String(initial.hours));
  // svelte-ignore state_referenced_locally
  let activityId = $state(initial.activityId ?? null);
  // svelte-ignore state_referenced_locally
  let comment = $state(initial.comment ?? '');
  let activities = $state(null);
  let activityError = $state('');
  let hoursError = $state('');
  let submitError = $state('');
  let pending = $state(false);

  // svelte-ignore state_referenced_locally
  const originalActivity = initial.activityId == null
    ? null
    : { id: initial.activityId, name: initial.activityName ?? `#${initial.activityId}` };
  // 原本的活動不在可選清單（或清單讀取失敗）時仍列出它，避免修改時被默默清掉。
  const missingOriginal = $derived(
    originalActivity !== null && activities !== null && !activities.some(activity => activity.id === originalActivity.id),
  );

  // 活動清單載入後才顯示下拉選單，確保預設值能被選中。讀取失敗時保留原本的活動。
  onMount(async () => {
    try {
      activities = await listActivities(workPackage.id);
    } catch (error) {
      activities = [];
      activityError = `活動類型讀取失敗：${error.message}`;
    }
  });

  // 修改模式只送出有變動的欄位：未修改的時數（例如 PT20M 顯示為 0.33）寫回會失真。
  function changedFields(values) {
    const before = { date: initial.date, hours: initial.hours, activityId: initial.activityId ?? null, comment: initial.comment ?? '' };
    return Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== before[key]));
  }

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const parsed = parseHoursInput(hoursText);
    if (parsed.error) {
      hoursError = parsed.error;
      return;
    }
    hoursError = '';
    submitError = '';
    const values = { date, hours: parsed.value, activityId, comment };
    const payload = mode === 'edit' ? changedFields(values) : values;
    if (mode === 'edit' && !Object.keys(payload).length) {
      oncancel();
      return;
    }
    pending = true;
    try {
      await onsubmit(payload);
    } catch (error) {
      submitError = error.message;
    } finally {
      pending = false;
    }
  }
</script>

<div class="overlay">
  <div class="dialog parchment" role="dialog" aria-modal="true" aria-labelledby="accept-title">
    <form onsubmit={submit}>
      <h2 id="accept-title">
        {mode === 'edit' ? '✎ 修改任務紀錄' : '📜 接下任務'}：#{workPackage.id} {workPackage.subject}
      </h2>

      <label class="field"><span>日期</span><input type="date" bind:value={date} required /></label>

      <div class="field">
        <span id="hours-label">時數</span>
        <div class="chips">
          {#each QUICK_HOURS as hours}
            <button type="button" class="chip" class:on={hoursText === String(hours)} onclick={() => (hoursText = String(hours))}>{hours}</button>
          {/each}
          <input type="text" inputmode="decimal" aria-labelledby="hours-label" placeholder="例如 2.5" bind:value={hoursText} />
        </div>
      </div>
      {#if hoursError}<p class="hint error" role="alert">{hoursError}</p>{/if}

      <div class="field">
        <span id="activity-label">活動</span>
        {#if activities === null}
          <span>讀取中…</span>
        {:else}
          <select aria-labelledby="activity-label" bind:value={activityId}>
            <option value={null}>不指定</option>
            {#if missingOriginal}
              <option value={originalActivity.id}>{activityError ? `${originalActivity.name}（保留原設定）` : originalActivity.name}</option>
            {/if}
            {#each activities as activity (activity.id)}
              <option value={activity.id}>{activity.name}</option>
            {/each}
          </select>
        {/if}
      </div>
      {#if activityError}<p class="hint error">{activityError}</p>{/if}

      <label class="field"><span>備註</span><textarea rows="3" maxlength="1000" bind:value={comment}></textarea></label>

      {#if submitError}<p class="hint error" role="alert">{submitError}</p>{/if}

      <div class="actions">
        <button type="button" class="btn" disabled={pending} onclick={oncancel}>取消</button>
        <button type="submit" class="btn btn-primary" disabled={pending}>
          {pending ? '送出中…' : mode === 'edit' ? '更新紀錄' : '接下任務！'}
        </button>
      </div>
    </form>
  </div>
</div>
