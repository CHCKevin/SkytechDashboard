<script>
  import { searchUsers } from '../lib/api.js';

  // 招募成員：以名稱搜尋 OpenProject 使用者（無法列出全部名單，只能搜尋），選一位加入大廳。
  let { memberIds = [], onsubmit, oncancel, searchDelay = 300 } = $props();
  let query = $state('');
  let results = $state([]);
  let message = $state('');
  let searching = $state(false);
  let chosen = $state(null);
  let error = $state('');
  let pending = $state(false);
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
    timer = setTimeout(() => run(term), searchDelay);
  }

  // 只採用最後一次搜尋的結果，避免較慢的舊回應覆蓋新結果。
  async function run(term) {
    const mine = ++latest;
    searching = true;
    try {
      const found = await searchUsers(term);
      if (mine !== latest) return;
      results = found;
      message = found.length ? '' : '找不到符合的成員';
    } catch (searchError) {
      if (mine !== latest) return;
      results = [];
      message = searchError.message;
    } finally {
      if (mine === latest) searching = false;
    }
  }

  function choose(user) {
    chosen = user;
    error = '';
  }

  async function submit(event) {
    event.preventDefault();
    if (!chosen || pending) return;
    pending = true;
    error = '';
    try {
      await onsubmit(chosen.id);
    } catch (submitError) {
      error = submitError.message;
    } finally {
      pending = false;
    }
  }

  $effect(() => () => clearTimeout(timer));
</script>

<div class="overlay">
  <div class="dialog parchment" role="dialog" aria-modal="true" aria-labelledby="recruit-title">
    <form onsubmit={submit}>
      <h2 id="recruit-title">🍺 招募成員</h2>
      <input class="search-input" type="search" aria-label="搜尋成員名稱" placeholder="輸入成員名稱" autocomplete="off"
        bind:value={query} {oninput} />
      {#if searching}<p class="hint">搜尋中…</p>{/if}
      {#if message}<p class="hint error" role="status">{message}</p>{/if}
      {#if results.length}
        <ul class="suggestions" aria-label="搜尋結果">
          {#each results as user (user.id)}
            {@const joined = memberIds.includes(user.id)}
            <li>
              <button type="button" disabled={joined} aria-pressed={chosen?.id === user.id} onclick={() => choose(user)}>
                {user.name}{#if joined}<small>已在大廳</small>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if chosen}<p>要招募：{chosen.name}</p>{/if}
      {#if error}<p class="hint error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" disabled={pending} onclick={oncancel}>取消</button>
        <button type="submit" class="btn btn-primary" disabled={!chosen || pending}>加入大廳</button>
      </div>
    </form>
  </div>
</div>
