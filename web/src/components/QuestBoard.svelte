<script>
  let { quests, onaccept, onunpin, onpin, children } = $props();
</script>

<section class="board" aria-labelledby="board-title">
  <h2 id="board-title" class="board-title">📜 常駐任務</h2>
  <div class="notes">
    {#each quests as quest (quest.workPackageId)}
      <article class="note">
        <button class="note-main" onclick={() => onaccept(quest)}>
          <span class="note-id">#{quest.workPackageId}</span>
          <span>{quest.subject}</span>
          <span class="note-meta">預設：{quest.activityName ?? '不指定'}</span>
        </button>
        <button class="note-x" aria-label={`撕下 #${quest.workPackageId}`} onclick={() => onunpin(quest)}>✕</button>
      </article>
    {/each}
    <button class="note note-add" onclick={onpin}>＋ 釘上常駐任務</button>
  </div>
  {@render children?.()}
</section>
