<script>
  import { listActivities } from '../lib/api.js';
  import WorkPackageSearch from './WorkPackageSearch.svelte';

  let { onsubmit, oncancel, searchDelay = 300 } = $props();
  let workPackage = $state(null);
  let activities = $state(null);
  let activityId = $state(null);
  let error = $state('');
  let pending = $state(false);

  async function choose(selected) {
    workPackage = selected;
    activities = null;
    activityId = null;
    error = '';
    try {
      activities = await listActivities(selected.id);
    } catch (loadError) {
      activities = [];
      error = `活動類型讀取失敗：${loadError.message}`;
    }
  }

  async function submit(event) {
    event.preventDefault();
    pending = true;
    error = '';
    try {
      await onsubmit({ workPackageId: workPackage.id, activityId });
    } catch (submitError) {
      error = submitError.message;
    } finally {
      pending = false;
    }
  }
</script>

<div class="overlay">
  <form class="dialog parchment" role="dialog" aria-modal="true" aria-labelledby="pin-title" onsubmit={submit}>
    <h2 id="pin-title">📌 釘上常駐任務</h2>
    <WorkPackageSearch label="搜尋要釘上的 work package" delay={searchDelay} onselect={choose} />
    {#if workPackage}
      <p>#{workPackage.id} {workPackage.subject}</p>
      {#if activities === null}
        <p class="hint">讀取活動類型…</p>
      {:else}
        <div class="field">
          <span id="pin-activity-label">預設活動</span>
          <select aria-labelledby="pin-activity-label" bind:value={activityId}>
            <option value={null}>不指定</option>
            {#each activities as activity (activity.id)}
              <option value={activity.id}>{activity.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    {/if}
    {#if error}<p class="hint error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="btn" disabled={pending} onclick={oncancel}>取消</button>
      <button type="submit" class="btn btn-primary" disabled={!workPackage || activities === null || pending}>釘上布告欄</button>
    </div>
  </form>
</div>
