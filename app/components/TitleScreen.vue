<script setup lang="ts">
import { THEMES, createRun, dailyRun, type RunConfig, type ThemeId } from '~~/lib'
import { actorSprite } from '~/game/sprites'

const emit = defineEmits<{ start: [config: RunConfig] }>()
const PLACEHOLDER = 'mummy heist under a dying sun'
const prompt = ref('')
const chosen = ref<ThemeId | null>(null)
const themes = Object.values(THEMES)
const daily = ref<RunConfig | null>(null)
onMounted(() => { daily.value = dailyRun(new Date()) })

// Which theme the prompt would pick (createRun is deterministic for a non-empty prompt).
const matched = computed(() => (prompt.value.trim() ? createRun(prompt.value).theme : null))
const active = computed(() => chosen.value ?? matched.value)
const hint = computed(() => {
  if (chosen.value) return `Theme locked: ${THEMES[chosen.value].name}. Click it again to let the prompt decide.`
  if (matched.value) return `The prompt reads as ${THEMES[matched.value].name}.`
  return 'Leave it empty for a random dungeon.'
})

function play() {
  const run = createRun(prompt.value)
  emit('start', chosen.value ? { ...run, theme: chosen.value } : run)
}
function pick(id: ThemeId) { chosen.value = chosen.value === id ? null : id }
</script>

<template>
  <section class="title">
    <p class="eyebrow">roguelike.si</p>
    <h1>Type a prompt. Get a dungeon. You have five minutes.</h1>

    <form class="prompt" @submit.prevent="play">
      <label for="prompt">Prompt</label>
      <div class="field">
        <input id="prompt" v-model="prompt" :placeholder="PLACEHOLDER" maxlength="80" autocomplete="off" spellcheck="false">
        <button type="submit" class="primary">Play</button>
      </div>
      <p class="hint" aria-live="polite">{{ hint }}</p>
    </form>

    <fieldset class="themes">
      <legend>Theme</legend>
      <div class="grid" role="radiogroup" aria-label="Theme">
        <button v-for="t in themes" :key="t.id" type="button" role="radio" class="swatch"
          :aria-checked="active === t.id" :class="{ on: active === t.id, locked: chosen === t.id }" @click="pick(t.id)">
          <SpriteIcon :px="actorSprite(t.id, 'hero')" :palette="t.palette" :size="40" bg />
          <span class="meta">
            <span class="name">{{ t.name }}</span>
            <span class="tones" aria-hidden="true">
              <i v-for="c in [t.palette.bg, t.palette.dark, t.palette.mid, t.palette.light, t.palette.accent]" :key="c" :style="{ background: c }" />
            </span>
          </span>
        </button>
      </div>
    </fieldset>

    <div class="daily">
      <button type="button" :disabled="!daily" @click="daily && emit('start', daily)">Daily run</button>
      <span v-if="daily">Same dungeon for everyone today, {{ daily.seed.slice(6) }} UTC: {{ THEMES[daily.theme].name }}.</span>
    </div>
  </section>
</template>

<style scoped>
.title { display: flex; flex-direction: column; gap: 22px; padding-block: clamp(24px, 6vw, 72px) 24px; }
.eyebrow { margin: 0; font-family: var(--font-mono); color: var(--accent-lead); font-size: 13px; letter-spacing: .06em; }
h1 { margin: 0; font-size: clamp(30px, 5.4vw, 64px); line-height: 1.02; letter-spacing: -.03em; font-weight: 700; max-width: 16ch; }
label, legend { font-family: var(--font-mono); font-size: 11px; color: var(--fg-muted); letter-spacing: .1em; text-transform: uppercase; padding: 0; margin-bottom: 8px; display: block; }
.field { display: flex; max-width: 640px; }
input { flex: 1; min-width: 0; font: inherit; font-family: var(--font-mono); font-size: 16px; color: var(--fg-primary); background: var(--bg-surface); border: 1px solid var(--border-strong); border-right: 0; border-radius: 0; padding: 12px 14px; }
input::placeholder { color: var(--fg-muted); }
input:focus { outline: none; border-color: var(--accent-lead); }
.hint { margin: 8px 0 0; font-family: var(--font-mono); font-size: 12px; color: var(--fg-muted); }
.themes { border: 0; margin: 0; padding: 0; min-width: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; max-width: 980px; }
.swatch { display: flex; align-items: center; gap: 12px; text-align: left; padding: 8px; background: var(--bg-surface); border: 1px solid var(--border); color: var(--fg-secondary); }
.swatch.on { border-color: var(--fg-primary); color: var(--fg-primary); }
.swatch.locked { border-color: var(--accent-lead); box-shadow: inset 3px 0 0 var(--accent-lead); }
.meta { display: flex; flex-direction: column; gap: 6px; }
.name { font-size: 14px; font-weight: 600; }
.tones { display: flex; }
.tones i { width: 14px; height: 8px; display: block; }
.daily { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 12px; color: var(--fg-muted); }
button { font: inherit; color: var(--fg-primary); background: var(--bg-surface); border: 1px solid var(--border); border-radius: 0; padding: 10px 16px; cursor: pointer; }
.daily button { font-family: var(--font-mono); font-size: 13px; }
button:hover:not(:disabled) { border-color: var(--border-strong); }
button:focus-visible, .swatch:focus-visible { outline: 2px solid var(--accent-lead); outline-offset: 1px; }
.primary { background: var(--accent-lead); color: var(--accent-lead-foreground); border-color: var(--accent-lead); font-weight: 700; padding-inline: 26px; }
.primary:hover { filter: brightness(1.08); }
</style>
