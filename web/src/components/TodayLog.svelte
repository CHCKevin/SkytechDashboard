<script>
  import { barWidth } from '../lib/actions.js';
  import { entryMeta } from '../lib/entries.js';
  import EntryTitle from './EntryTitle.svelte';
  import { progressPercent, sumHours } from '../lib/totals.js';

  let { entries, target, openProjectUrl = null, loading = false, loadError = '', onedit, ondelete } = $props();
  const total = $derived(sumHours(entries));
  const percent = $derived(progressPercent(total, target));
</script>

<section aria-labelledby="log-title">
  <h2 id="log-title" class="board-title">🎒 本日已接任務</h2>
  <div class="parchment">
    {#if loading}
      <p class="empty">讀取中…</p>
    {:else if loadError}
      <p class="hint error" role="alert">{loadError}</p>
    {:else if !entries.length}
      <p class="empty">這天還沒有接任務</p>
    {/if}
    <ul class="entries">
      {#each entries as entry (entry.id)}
        <li class="entry">
          <EntryTitle {entry} {openProjectUrl} />
          <b>{entry.hours}h</b>
          {#if entryMeta(entry)}
            <small class="entry-meta">{entryMeta(entry)}</small>
          {/if}
          <span class="entry-actions">
            {#if entry.workPackageId}
              <button class="link" aria-label={`改 #${entry.workPackageId}`} onclick={() => onedit(entry)}>[改]</button>
            {/if}
            <button class="link" aria-label={`刪 ${entry.workPackageSubject}`} onclick={() => ondelete(entry)}>[刪]</button>
          </span>
        </li>
      {/each}
    </ul>
    <div class="total"><span>本日合計</span><b>{total} / {target}h</b></div>
    <div class="bar" role="progressbar" aria-label="本日進度" aria-valuemin="0" aria-valuemax={target} aria-valuenow={total}>
      <i class="bar-fill" class:done={percent >= 100} use:barWidth={percent}></i>
    </div>
  </div>
</section>
