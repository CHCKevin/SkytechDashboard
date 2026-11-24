<script>
  import WorkPackageSearch from './WorkPackageSearch.svelte';

  let { mode = 'create', initial = { title: '', note: '', dueDate: null }, onsubmit, oncancel, searchDelay = 300 } = $props();

  // 表單欄位只取 initial 掛載當下的快照（每次開啟都會重新掛載對話框）。
  // svelte-ignore state_referenced_locally
  let title = $state(initial.title);
  // svelte-ignore state_referenced_locally
  let note = $state(initial.note);
  // svelte-ignore state_referenced_locally
  let dueDate = $state(initial.dueDate ?? '');
  let error = $state('');
  let pending = $state(false);

  // 標題可以直接輸入，也可以像特別任務一樣用編號或名稱搜尋 work package 帶入（只帶入文字，不連動 OpenProject）。
  function choose(workPackage) {
    title = `#${workPackage.id} ${workPackage.subject}`.slice(0, 100);
    error = '';
  }

  // 在搜尋框按 Enter 只是在搜尋，不能把整個表單送出（搜尋結果按鈕仍可用 Enter 選取）。
  function blockEnter(event) {
    if (event.key === 'Enter' && event.target.type === 'search') event.preventDefault();
  }

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    if (!title.trim()) {
      error = '標題不能是空的';
      return;
    }
    error = '';
    const values = { title: title.trim(), note, dueDate: dueDate || null };
    // 修改模式只送出有變動的欄位，沒有變動就直接關閉。
    const payload = mode === 'edit'
      ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== (initial[key] ?? null)))
      : values;
    if (mode === 'edit' && !Object.keys(payload).length) {
      oncancel();
      return;
    }
    pending = true;
    try {
      await onsubmit(payload);
    } catch (submitError) {
      error = submitError.message;
    } finally {
      pending = false;
    }
  }
</script>

<div class="overlay">
  <div class="dialog parchment" role="dialog" aria-modal="true" aria-labelledby="todo-dialog-title">
    <form onsubmit={submit}>
      <h2 id="todo-dialog-title">{mode === 'edit' ? '✎ 修改委託' : '📋 釘上委託'}</h2>
      <label class="field"><span>標題</span><input type="text" maxlength="100" bind:value={title} /></label>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="field" onkeydown={blockEnter}>
        <span>帶入</span>
        <div><WorkPackageSearch label="用編號查詢 work package 帶入標題" delay={searchDelay} onselect={choose} /></div>
      </div>
      <label class="field"><span>備註</span><textarea rows="4" maxlength="1000" bind:value={note}></textarea></label>
      <label class="field"><span>期限</span><input type="date" bind:value={dueDate} /></label>
      {#if error}<p class="hint error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" disabled={pending} onclick={oncancel}>取消</button>
        <button type="submit" class="btn btn-primary" disabled={pending}>
          {pending ? '送出中…' : mode === 'edit' ? '更新委託' : '釘上布告欄'}
        </button>
      </div>
    </form>
  </div>
</div>
