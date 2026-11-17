<script>
  import { sceneArt } from '../lib/hall-art.js';
  import { shortName } from '../lib/names.js';
  import { SEAT_GROUPS, SEAT_SPOTS, assignSeats } from '../lib/seats.js';
  import { STATUS_ICONS, STATUS_LABELS, spriteFor } from '../lib/sprite.js';
  import PixelArt from './PixelArt.svelte';

  // 大廳場景：吧檯 6 位、工作桌 20 位、沙發 5 位。成員坐哪裡由 assignSeats 依狀態偏好決定，
  // 角色面向哪裡由位子決定（例如吧檯面向吧檯，看到背面）。
  // 畫面由下往上疊：背景（地板、牆、吧檯、椅子、沙發）→ 每一排的角色 → 該排的桌子 → 下一排……
  // 動畫：工作中、發呆兩幀輪流（pixel.css 的 anim-*）；delay-* 讓大家不要同步晃動。
  let { members, selectedId = null, onselect } = $props();
  const seats = $derived(assignSeats(members));
  const art = sceneArt();
</script>

{#snippet seat(id)}
  {@const member = seats[id]}
  <div class="seat" data-seat={id}>
    {#if member}
      <button type="button" class="member" aria-pressed={member.userId === selectedId}
        aria-label={`${member.name}：${STATUS_LABELS[member.status]}`} onclick={() => onselect(member.userId)}>
        <PixelArt art={STATUS_ICONS[member.status]} class="status-icon" />
        <PixelArt art={spriteFor(member.userId, member.status, SEAT_SPOTS[id].facing)}
          class={`sprite anim-${member.status} delay-${member.userId % 3}`} />
        <span class="member-name">{shortName(member.name)}</span>
      </button>
    {/if}
  </div>
{/snippet}

<section class="scene" aria-label="公會大廳">
  <PixelArt art={art.background} class="scene-layer" />
  {#each SEAT_GROUPS as group (group.name)}
    {#each group.seats as id (id)}{@render seat(id)}{/each}
    {#if group.tables}<PixelArt art={art.tables[group.tables]} class="scene-layer scene-front" />{/if}
  {/each}
</section>
