<script>
  // 把 { width, height, rects } 畫成 SVG。顏色用 fill 屬性，不用 inline style（CSP）；大小由 CSS 類別決定。
  let { art, class: className = '' } = $props();
</script>

<svg class={className} viewBox={`0 0 ${art.width} ${art.height}`} shape-rendering="crispEdges" aria-hidden="true">
  {#each art.rects as rect (`${rect.x},${rect.y}`)}
    <rect x={rect.x} y={rect.y} width={rect.w} height="1" fill={rect.color} />
  {/each}
</svg>
