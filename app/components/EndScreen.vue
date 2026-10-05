<script setup lang="ts">
import type { RunSummary } from '~~/lib'

const props = defineProps<{ summary: RunSummary; themeName: string; epitaph?: string | null }>()
const emit = defineEmits<{ again: []; exit: [] }>()

const heading = computed(() => ({ won: 'You made it out.', dead: 'Dead.', timeout: 'Out of time.', playing: 'Still down there.' })[props.summary.status])
const xUrl = computed(() => `https://x.com/intent/post?text=${encodeURIComponent(props.summary.shareText)}`)
const copied = ref(false)

async function copy() {
  const text = props.summary.shareText
  try { await navigator.clipboard.writeText(text) } catch {
    const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select()
    try { document.execCommand('copy') } catch {}
    t.remove()
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1800)
}
const again = ref<HTMLButtonElement | null>(null)
onMounted(() => again.value?.focus())
</script>

<template>
  <div class="end" :class="summary.status">
    <p class="era">{{ themeName }}</p>
    <h2>{{ heading }}</h2>
    <p class="epitaph" aria-live="polite">{{ epitaph || summary.epitaph }}</p>
    <dl class="stats">
      <div><dt>Score</dt><dd class="score">{{ summary.score }}</dd></div>
      <div><dt>Floor</dt><dd>{{ summary.floor }}/4</dd></div>
      <div><dt>Kills</dt><dd>{{ summary.kills }}</dd></div>
      <div><dt>Turns</dt><dd>{{ summary.turns }}</dd></div>
    </dl>
    <div class="actions">
      <button ref="again" type="button" class="primary" @click="emit('again')">Same dungeon again</button>
      <button type="button" @click="emit('exit')">New prompt</button>
      <button type="button" @click="copy">{{ copied ? 'Copied' : 'Copy result' }}</button>
      <a class="btn" :href="xUrl" target="_blank" rel="noopener">Share on X</a>
    </div>
  </div>
</template>

<style scoped>
.end { font-family: var(--font-mono); border-top: 1px solid var(--border); padding-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.era { margin: 0; color: var(--accent-lead); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
h2 { margin: 0; font-family: var(--font-sans); font-size: clamp(28px, 5vw, 44px); letter-spacing: -.02em; }
.epitaph { margin: 0; max-width: 62ch; color: var(--fg-secondary); font-size: 13px; line-height: 1.6; }
.stats { display: flex; gap: 28px; margin: 4px 0; }
.stats div { display: flex; flex-direction: column; }
dt { color: var(--fg-muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
dd { margin: 0; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.score { color: var(--accent-lead); }
.actions { display: flex; flex-wrap: wrap; gap: 6px; }
button, .btn { font: inherit; font-size: 13px; color: var(--fg-primary); background: var(--bg-surface); border: 1px solid var(--border); border-radius: 0; padding: 8px 14px; cursor: pointer; text-decoration: none; }
button:hover, .btn:hover { border-color: var(--border-strong); }
button:focus-visible, .btn:focus-visible { outline: 2px solid var(--accent-lead); outline-offset: 1px; }
.primary { background: var(--accent-lead); color: var(--accent-lead-foreground); border-color: var(--accent-lead); font-weight: 700; }
</style>
