<script>
  import { activityUrl } from '../lib/entries.js';

  // 工時列的標題。知道 OpenProject 網址時，工作包編號連到它的 Activity 頁（另開分頁）。
  let { entry, openProjectUrl = null } = $props();
  const href = $derived(entry.workPackageId && openProjectUrl ? activityUrl(openProjectUrl, entry.workPackageId) : null);
</script>

<span>{#if href}<a class="wp-link" {href} target="_blank" rel="noopener noreferrer">#{entry.workPackageId}</a>{' '}{:else if entry.workPackageId}{`#${entry.workPackageId} `}{/if}{entry.workPackageSubject}</span>
