<script>
  import WorkPackageSearch from './WorkPackageSearch.svelte';

  let { onselect } = $props();
</script>

<div class="parchment special">
  <h3>🗡 特別任務 <small>臨時、不常用的 work package</small></h3>
  <WorkPackageSearch label="搜尋特別任務" {onselect} />
</div>
