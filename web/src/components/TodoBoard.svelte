<script>
  import { onMount } from 'svelte';
  import * as api from '../lib/api.js';
  import { todayLocal } from '../lib/dates.js';
  import { dueLevel, formatClosedAt, isOverdue, splitTodos } from '../lib/todos.js';
  import TodoDialog from './TodoDialog.svelte';

  // 待辦委託：只存本機，不隨頂端日期改變、不連動 OpenProject。
  let { onbanner } = $props();

  let todos = $state([]);
  let loading = $state(true);
  let busy = $state(false);
  let dialog = $state(null);
  const today = todayLocal();
  const groups = $derived(splitTodos(todos));

  onMount(async () => {
    try {
      todos = await api.listTodos();
    } catch (error) {
      onbanner(error.message);
    } finally {
      loading = false;
    }
  });

  async function submitDialog(values) {
    todos = dialog.mode === 'edit' ? await api.updateTodo(dialog.todo.id, values) : await api.createTodo(values);
    dialog = null;
  }

  // 結案、重開、刪除共用：同時只送一個請求，失敗時顯示橫幅並重讀清單。
  async function act(run) {
    if (busy) return;
    busy = true;
    try {
      todos = await run();
    } catch (error) {
      onbanner(error.message);
      try { todos = await api.listTodos(); } catch { /* 橫幅已顯示錯誤 */ }
    } finally {
      busy = false;
    }
  }

  const setClosed = (todo, closed) => act(() => api.updateTodo(todo.id, { closed }));

  function remove(todo) {
    if (!window.confirm(`確定刪除委託「${todo.title}」？`)) return;
    act(() => api.deleteTodo(todo.id));
  }
</script>

<section class="board todo-board" aria-labelledby="todo-title">
  <h2 id="todo-title" class="board-title">📋 待辦委託</h2>
  {#if loading}
    <p class="empty todo-empty">讀取中…</p>
  {/if}
  <div class="notes">
    {#each groups.open as todo (todo.id)}
      {@const overdue = isOverdue(todo, today)}
      {@const level = dueLevel(todo, today)}
      <article class="note todo-card" class:has-due={todo.dueDate} class:urgent={level === 'urgent'} class:soon={level === 'soon'}>
        <button class="note-main" aria-label={`改 ${todo.title}`} onclick={() => (dialog = { mode: 'edit', todo })}>
          <span class="todo-name">{todo.title}</span>
          {#if todo.note.trim()}<span class="todo-text">{todo.note.trim()}</span>{/if}
        </button>
        <!-- 期限是疊在便條下緣的小標籤，不佔內文空間、不換行 -->
        {#if todo.dueDate}<span class="todo-due">{overdue ? '⚠ 逾期' : '期限'} {todo.dueDate}</span>{/if}
        <button class="todo-close" aria-label={`結案 ${todo.title}`} title="結案" disabled={busy} onclick={() => setClosed(todo, true)}>✓</button>
        <button class="note-x" aria-label={`刪除 ${todo.title}`} title="刪除" disabled={busy} onclick={() => remove(todo)}>✕</button>
      </article>
    {/each}
    <button class="note note-add" onclick={() => (dialog = { mode: 'create' })}>＋ 釘上委託</button>
  </div>
  <details class="parchment todo-history">
    <summary>📦 歷史任務（{groups.closed.length}）</summary>
    {#if !groups.closed.length}
      <p class="empty">還沒有結案的委託</p>
    {/if}
    <ul class="entries">
      {#each groups.closed as todo (todo.id)}
        <li class="entry">
          <span class="entry-title">{todo.title}</span>
          <small>結案 {formatClosedAt(todo.closedAt)}</small>
          {#if todo.note.trim()}<small class="entry-meta">{todo.note.trim()}</small>{/if}
          <span class="entry-actions">
            <button class="link" aria-label={`重開 ${todo.title}`} disabled={busy} onclick={() => setClosed(todo, false)}>[重開]</button>
            <button class="link" aria-label={`刪除 ${todo.title}`} disabled={busy} onclick={() => remove(todo)}>[刪]</button>
          </span>
        </li>
      {/each}
    </ul>
  </details>
</section>

{#if dialog}
  <TodoDialog mode={dialog.mode} initial={dialog.todo} onsubmit={submitDialog} oncancel={() => (dialog = null)} />
{/if}
