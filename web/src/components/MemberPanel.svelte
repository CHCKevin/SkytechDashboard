<script>
  import { formatDay } from '../lib/dates.js';
  import { entryMeta } from '../lib/entries.js';
  import { shortName } from '../lib/names.js';
  import { HALL_CAPACITY } from '../lib/seats.js';
  import { STATUS_LABELS, spriteFor } from '../lib/sprite.js';
  import PixelArt from './PixelArt.svelte';

  // 大廳右側面板：沒選人時是成員名單，選了人就是他當日的工時（唯讀）。
  let {
    members, selected = null, date, loading = false, loadError = '', refreshError = '', updatedAt = '',
    onselect, onback, onrecruit, onremove, onrefresh,
  } = $props();
  const full = $derived(members.length >= HALL_CAPACITY);
</script>

<section aria-labelledby="hall-panel-title">
  {#if selected}
    <h2 id="hall-panel-title" class="board-title">🛡 {shortName(selected.name)}</h2>
    <div class="parchment">
      <div class="member-head">
        <PixelArt art={spriteFor(selected.userId, selected.status)} class="sprite" />
        <div>
          <p class="member-full">{selected.name}</p>
          <p class="hint">{STATUS_LABELS[selected.status]} · {formatDay(date)}</p>
        </div>
      </div>
      {#if !selected.entries.length}
        <p class="empty">這天沒有記錄工時</p>
      {/if}
      <ul class="entries">
        {#each selected.entries as entry (entry.id)}
          <li class="entry">
            <span>{entry.workPackageId ? `#${entry.workPackageId} ` : ''}{entry.workPackageSubject}</span>
            <b>{entry.hours}h</b>
            {#if entryMeta(entry)}
              <small class="entry-meta">{entryMeta(entry)}</small>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="total"><span>合計</span><b>{selected.totalHours}h</b></div>
      <div class="actions">
        <button type="button" class="btn" onclick={() => onremove(selected)}>請離大廳</button>
        <button type="button" class="btn btn-primary" onclick={onback}>返回</button>
      </div>
      {@render footer()}
    </div>
  {:else}
    <h2 id="hall-panel-title" class="board-title">🍺 公會成員 {members.length} / {HALL_CAPACITY}</h2>
    <div class="parchment">
      {#if loading}
        <p class="empty">讀取中…</p>
      {:else if loadError}
        <p class="hint error" role="alert">{loadError}</p>
      {:else if !members.length}
        <p class="empty">大廳還沒有成員，先招募幾位吧</p>
      {/if}
      <ul class="roster">
        {#each members as member (member.userId)}
          <li>
            <button type="button" class="roster-row" onclick={() => onselect(member.userId)}>
              <PixelArt art={spriteFor(member.userId, member.status)} class="sprite-small" />
              <span class="roster-name">{shortName(member.name)}</span>
              <span>{STATUS_LABELS[member.status]}</span>
              <b>{member.totalHours}h</b>
            </button>
          </li>
        {/each}
      </ul>
      <div class="actions">
        <button type="button" class="btn" disabled={loading} onclick={onrefresh}>重新整理</button>
        <button type="button" class="btn btn-primary" disabled={full || loading || Boolean(loadError)} onclick={onrecruit}>＋ 招募成員</button>
      </div>
      {#if full}<p class="hint">大廳已滿</p>{/if}
      {@render footer()}
    </div>
  {/if}
</section>

{#snippet footer()}
  {#if refreshError}<p class="hint error" role="status">更新失敗：{refreshError}</p>{/if}
  {#if updatedAt}<p class="hint">上次更新 {updatedAt}</p>{/if}
{/snippet}
