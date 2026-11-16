<script>
  import { getHall } from '../lib/api.js';

  let { date } = $props();

  $effect(() => {
    getHall(date).catch(() => {});
  });
</script>

<main class="layout"></main>
