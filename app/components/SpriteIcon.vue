<script setup lang="ts">
// A single sprite drawn into a tiny canvas, for DOM use (inventory, swatches).
import type { Palette } from '~~/lib'
import { S, colour, type Px } from '~/game/sprites'

const props = withDefaults(defineProps<{ px: Px; palette: Palette; size?: number; bg?: boolean }>(), { size: 24, bg: false })
const el = ref<HTMLCanvasElement | null>(null)

function draw() {
  const c = el.value
  if (!c) return
  const g = c.getContext('2d')!
  g.clearRect(0, 0, S, S)
  if (props.bg) { g.fillStyle = props.palette.bg; g.fillRect(0, 0, S, S) }
  props.px.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = colour(ch, props.palette)
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1) }
  }))
}
onMounted(draw)
watch(() => [props.px, props.palette], draw)
</script>

<template>
  <canvas ref="el" :width="S" :height="S" class="sprite" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true" />
</template>

<style scoped>
.sprite { image-rendering: pixelated; display: block; flex: none; }
</style>
