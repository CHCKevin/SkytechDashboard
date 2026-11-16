<script>
  import { addDays, formatDay, todayLocal } from '../lib/dates.js';

  let { date, me, onchange } = $props();
</script>

<header class="topbar">
  <h1 class="guild">⚔ 冒險者工時公會</h1>
  <nav class="date-nav" aria-label="切換日期">
    <button class="btn" aria-label="前一天" onclick={() => onchange(addDays(date, -1))}>◀</button>
    <span>{formatDay(date)}</span>
    <button class="btn" aria-label="後一天" onclick={() => onchange(addDays(date, 1))}>▶</button>
    <button class="btn" disabled={date === todayLocal()} onclick={() => onchange(todayLocal())}>今天</button>
  </nav>
  <span>冒險者：{me?.name ?? '…'}</span>
</header>
