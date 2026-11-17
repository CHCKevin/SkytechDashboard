<script>
  import { shortName } from '../lib/names.js';
  import { assignSeats } from '../lib/seats.js';
  import { STATUS_ICONS, STATUS_LABELS, spriteFor } from '../lib/sprite.js';
  import PixelArt from './PixelArt.svelte';

  // 大廳場景：吧檯 5 位、工作桌 7 位、沙發 4 位。成員坐哪裡由 assignSeats 依狀態偏好決定。
  let { members, selectedId = null, onselect } = $props();
  const seats = $derived(assignSeats(members));
  const numbered = (zone, numbers) => numbers.map(number => `${zone}-${number}`);
</script>

{#snippet seat(id)}
  {@const member = seats[id]}
  <div class="seat" data-seat={id}>
    {#if member}
      <button type="button" class="member" aria-pressed={member.userId === selectedId}
        aria-label={`${member.name}：${STATUS_LABELS[member.status]}`} onclick={() => onselect(member.userId)}>
        <PixelArt art={STATUS_ICONS[member.status]} class="status-icon" />
        <PixelArt art={spriteFor(member.userId, member.status)} class="sprite" />
        <span class="member-name">{shortName(member.name)}</span>
      </button>
    {/if}
  </div>
{/snippet}

<section class="scene" aria-label="公會大廳">
  <div class="zone-bar">
    <div class="shelf" aria-hidden="true">
      {#each [1, 2, 3, 1, 2, 3, 1, 2] as kind, index (index)}<i class={`bottle bottle-${kind}`}></i>{/each}
    </div>
    <div class="counter" aria-hidden="true"></div>
    <div class="stools">
      {#each numbered('bar', [1, 2, 3, 4, 5]) as id (id)}{@render seat(id)}{/each}
    </div>
  </div>
  <div class="scene-lower">
    <div class="zone-desk">
      {#each numbered('desk', [1, 2, 5]) as id (id)}{@render seat(id)}{/each}
      <div class="seat-gap" aria-hidden="true"></div>
      <div class="table table-4" aria-hidden="true"></div>
      <div class="table" aria-hidden="true"></div>
      <div class="table" aria-hidden="true"></div>
      {#each numbered('desk', [3, 4, 6, 7]) as id (id)}{@render seat(id)}{/each}
    </div>
    <div class="zone-sofa">
      <div class="sofa sofa-long">
        {#each numbered('sofa', [1, 2, 3]) as id (id)}{@render seat(id)}{/each}
      </div>
      <div class="sofa sofa-single">{@render seat('sofa-4')}</div>
    </div>
  </div>
</section>
