<script>
  import { onMount } from 'svelte';
  import * as api from './lib/api.js';
  import { todayLocal } from './lib/dates.js';
  import HallTab from './components/HallTab.svelte';
  import QuestTab from './components/QuestTab.svelte';
  import TopBar from './components/TopBar.svelte';

  // 日期由兩個頁籤共用；每次載入頁面都從任務欄開始，不記憶上次的頁籤。
  let date = $state(todayLocal());
  let tab = $state('quests');
  let me = $state(null);
  let banner = $state('');

  // 橫幅屬於產生它的頁籤，換頁籤時不帶過去。
  function switchTab(next) {
    if (next !== tab) banner = '';
    tab = next;
  }

  onMount(async () => {
    try {
      me = await api.getMe();
    } catch (error) {
      banner = error.message;
    }
  });
</script>

<div class="app">
  <TopBar {date} {me} {tab} onchange={day => (date = day)} ontab={switchTab} />
  {#if banner}
    <p class="banner" role="alert">{banner} <button class="link" onclick={() => (banner = '')}>關閉</button></p>
  {/if}
  {#if tab === 'hall'}
    <HallTab {date} onbanner={message => (banner = message)} />
  {:else}
    <QuestTab {date} ondatechange={day => (date = day)} onbanner={message => (banner = message)} />
  {/if}
</div>
