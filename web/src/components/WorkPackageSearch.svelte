<script>
  import { searchWorkPackages } from '../lib/api.js';

  let { onselect, label = '搜尋 work package', delay = 300 } = $props();
  let query = $state('');
  let results = $state([]);
  let message = $state('');
  let searching = $state(false);
  let timer;
  let latest = 0;

  function oninput() {
    clearTimeout(timer);
    const term = query.trim();
    if (!term) {
      latest += 1;
      results = [];
      message = '';
      searching = false;
      return;
    }
    timer = setTimeout(() => run(term), delay);
  }

  // 只採用最後一次搜尋的結果，避免較慢的舊回應覆蓋新結果。
  async function run(term) {
    const mine = ++latest;
    searching = true;
    try {
      const found = await searchWorkPackages(term);
      if (mine !== latest) return;
      results = found;
      message = found.length ? '' : '找不到符合的 work package';
    } catch (error) {
      if (mine !== latest) return;
      results = [];
      message = error.message;
    } finally {
      if (mine === latest) searching = false;
    }
  }

  function choose(workPackage) {
    latest += 1;
    clearTimeout(timer);
    query = '';
    results = [];
    message = '';
    onselect(workPackage);
  }

  $effect(() => () => clearTimeout(timer));
</script>

<input class="search-input" type="search" aria-label={label} placeholder="輸入編號（#123）或名稱" autocomplete="off"
  bind:value={query} {oninput} />
{#if searching}<p class="hint">搜尋中…</p>{/if}
{#if message}<p class="hint error" role="status">{message}</p>{/if}
{#if results.length}
  <ul class="suggestions" aria-label="搜尋結果">
    {#each results as workPackage (workPackage.id)}
      <li>
        <button type="button" onclick={() => choose(workPackage)}>#{workPackage.id} {workPackage.subject}<small>{workPackage.project}</small></button>
      </li>
    {/each}
  </ul>
{/if}
