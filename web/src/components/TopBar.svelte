<script>
  import { addDays, formatDay, todayLocal } from '../lib/dates.js';

  let { date, me, tab, onchange, ontab } = $props();
  const TABS = [['quests', '任務欄'], ['hall', '公會大廳']];
</script>

<header class="topbar">
  <h1 class="guild">⚔ 冒險者工時公會</h1>
  <div class="tabs" role="tablist" aria-label="頁籤">
    {#each TABS as [id, label] (id)}
      <button class="tab" role="tab" aria-selected={tab === id} onclick={() => ontab(id)}>{label}</button>
    {/each}
  </div>
  <nav class="date-nav" aria-label="切換日期">
    <button class="btn" aria-label="前一天" onclick={() => onchange(addDays(date, -1))}>◀</button>
    <span>{formatDay(date)}</span>
    <button class="btn" aria-label="後一天" onclick={() => onchange(addDays(date, 1))}>▶</button>
    <button class="btn" disabled={date === todayLocal()} onclick={() => onchange(todayLocal())}>今天</button>
  </nav>
  <span>冒險者：{me?.name ?? '…'}</span>
</header>
