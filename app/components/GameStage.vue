<script setup lang="ts">
import { THEMES, intro, type Action, type Dir, type RenderView, type RunConfig } from '~~/lib'
import { Renderer } from '~/game/renderer'
import { itemSprite } from '~/game/sprites'
import { compose } from '~/audio/music'
import { createSfx } from '~/audio/sfx'

const props = defineProps<{ config: RunConfig }>()
const emit = defineEmits<{ again: []; exit: [] }>()

const theme = THEMES[props.config.theme]
const story = ref(intro(props.config))
const phase = ref<'intro' | 'play' | 'end'>('intro')
const screenEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const cssSize = ref({ w: 224, h: 144, px: 1 })
const crt = ref(true)
let renderer: Renderer | null = null
let pending: RenderView | null = null

// ---- audio + narrator (cosmetic; never touches the simulation) -----------------
const { music } = useAudio()
const narrator = useNarrator()
const song = compose(props.config.seed, props.config.theme)
const sfx = createSfx(props.config.seed, props.config.theme, { boss: () => music.sting() })
const aiEpitaph = ref<string | null>(null)
let cancelIntro = () => {}

const { view, result, dispatch, startClock } = useRun(props.config, (v) => {
  if (renderer) renderer.apply(v); else pending = v
  sfx.onView(v)
  if (v.status === 'playing' && phase.value === 'play') music.setLevel(v.timeLeftMs <= 60_000 ? 'tense' : 'full')
})

function act(a: Action) {
  if (phase.value === 'intro') { if (a.type === 'descend' || a.type === 'wait') begin(); return }
  if (phase.value !== 'play') return
  const before = view.value.turns
  dispatch(a)
  if (a.type === 'move' && view.value.turns === before && view.value.status === 'playing') sfx.bump()
}
const { send } = useControls(screenEl, act, () => phase.value !== 'end')

function begin() {
  if (phase.value !== 'intro') return
  cancelIntro() // too late to swap the card: drop the request
  phase.value = 'play'
  music.play(song, 'full')
  startClock()
}
watch(result, (r) => {
  if (!r) return
  music.stop(r.status === 'won' ? 0.4 : 1.2)
  narrator.epitaph(r, theme, view.value.log, view.value.timeLeftMs, text => (aiEpitaph.value = text))
  setTimeout(() => (phase.value = 'end'), r.status === 'won' ? 1600 : 1300)
})

// ---- HUD derived state ------------------------------------------------------
const v = computed(() => view.value)
const clock = computed(() => {
  const s = Math.max(0, Math.ceil(v.value.timeLeftMs / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const urgency = computed(() => (v.value.timeLeftMs <= 15_000 ? 'critical' : v.value.timeLeftMs <= 60_000 ? 'urgent' : ''))
const hpPct = computed(() => Math.round((100 * v.value.hero.hp) / v.value.hero.maxHp))
const onStairs = computed(() => {
  const { x, y } = v.value.hero
  return v.value.cells[y * v.value.width + x]?.tile === 'stairs' && v.value.floor < v.value.floors
})
const boss = computed(() => v.value.cells.find(c => c.actor?.sprite === 'boss')?.actor)
const log = computed(() => v.value.log.slice(-3))

// ---- canvas sizing: integer device-pixel scale --------------------------------
function fit() {
  const el = screenEl.value
  if (!el || !renderer) return
  const dpr = window.devicePixelRatio || 1
  const maxW = Math.min(el.clientWidth, 1100)
  const maxH = Math.max(150, window.innerHeight - (window.innerWidth < 700 ? 330 : 250))
  const k = Math.max(1, Math.floor(Math.min((maxW * dpr) / renderer.bw, (maxH * dpr) / renderer.bh)))
  renderer.setScale(k)
  cssSize.value = { w: (renderer.bw * k) / dpr, h: (renderer.bh * k) / dpr, px: k / dpr }
}

let ro: ResizeObserver | undefined
let motionQuery: MediaQueryList | undefined
const onMotion = () => { if (renderer) renderer.reduced = !!motionQuery?.matches }
onMounted(() => {
  try { crt.value = localStorage.getItem('rl-crt') !== 'off' } catch {}
  renderer = new Renderer(canvasEl.value!, props.config.theme)
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMotion(); motionQuery.addEventListener('change', onMotion)
  fit()
  ro = new ResizeObserver(fit); ro.observe(screenEl.value!)
  window.addEventListener('resize', fit)
  if (pending) renderer.apply(pending)
  renderer.start()
  music.play(song, 'thin')
  cancelIntro = narrator.intro(props.config, theme, story.value, (s) => { if (phase.value === 'intro') story.value = s })
})
onBeforeUnmount(() => {
  renderer?.stop(); ro?.disconnect()
  window.removeEventListener('resize', fit)
  motionQuery?.removeEventListener('change', onMotion)
})
function toggleCrt() {
  crt.value = !crt.value
  try { localStorage.setItem('rl-crt', crt.value ? 'on' : 'off') } catch {}
}
const pad: { dir?: Dir; label: string; area: string; wait?: boolean }[] = [
  { dir: 'n', label: 'Up', area: 'n' }, { dir: 'w', label: 'Left', area: 'w' }, { wait: true, label: 'Wait', area: 'c' },
  { dir: 'e', label: 'Right', area: 'e' }, { dir: 's', label: 'Down', area: 's' },
]
const arrows: Record<string, string> = { n: '▲', s: '▼', w: '◀', e: '▶', c: '·' }
</script>

<template>
  <section class="stage" :class="[urgency, `is-${phase}`]" aria-label="Game">
    <header class="hud">
      <div class="hp" :title="`${v.hero.hp} of ${v.hero.maxHp} HP`">
        <span class="k">HP</span>
        <span class="bar"><span :style="{ width: `${hpPct}%` }" /></span>
        <span class="n">{{ v.hero.hp }}/{{ v.hero.maxHp }}</span>
      </div>
      <div><span class="k">ATK</span> {{ v.hero.atk }} <span class="k">DEF</span> {{ v.hero.def }}</div>
      <div><span class="k">FLOOR</span> {{ v.floor }}/{{ v.floors }}</div>
      <div v-for="m in v.meters ?? []" :key="m.id" class="meter" :class="{ danger: m.danger }">
        <span class="k">{{ m.label.toUpperCase() }}</span> {{ Math.ceil(m.value) }}<template v-if="m.id !== 'keys'">/{{ m.max }}</template>
      </div>
      <div class="score"><span class="k">SCORE</span> {{ v.score }}</div>
      <div class="clock" :aria-label="`Doom clock ${clock}`">{{ clock }}</div>
    </header>

    <div ref="screenEl" class="screen">
      <div class="frame" :style="{ width: `${cssSize.w}px`, height: `${cssSize.h}px`, '--px': `${cssSize.px}px` }">
        <canvas ref="canvasEl" class="canvas" :style="{ width: `${cssSize.w}px`, height: `${cssSize.h}px` }" role="img" :aria-label="`${theme.name}, floor ${v.floor}`" />
        <div v-if="crt" class="crt" aria-hidden="true" />
      </div>
      <div v-if="phase === 'intro'" class="intro" :style="{ width: `${cssSize.w}px` }" @click="begin">
        <p class="era">{{ theme.name }}</p>
        <h2>{{ story.title }}</h2>
        <p v-for="line in story.lines" :key="line">{{ line }}</p>
        <button class="primary" type="button" autofocus @click="begin">Begin</button>
        <p class="hint">Enter or tap to begin. The clock starts now.</p>
      </div>
      <div v-if="boss && phase === 'play'" class="boss" :style="{ width: `${cssSize.w}px` }">
        <span class="k">BOSS</span>
        <span class="bar"><span :style="{ width: `${(100 * boss.hp) / boss.maxHp}%` }" /></span>
      </div>
    </div>

    <EndScreen v-if="phase === 'end' && result" :summary="result" :theme-name="theme.name" :epitaph="aiEpitaph" @again="emit('again')" @exit="emit('exit')" />
    <div v-else class="below">
      <ol class="log" aria-live="polite">
        <li v-if="onStairs" class="stairs">Stairs. Press Enter to descend.</li>
        <li v-for="(line, i) in log" :key="`${v.turns}-${i}-${line}`" :class="{ last: i === log.length - 1 }">{{ line }}</li>
      </ol>
      <div class="controls">
        <div class="pad" role="group" aria-label="Move">
          <button v-for="b in pad" :key="b.area" type="button" :class="`a-${b.area}`" :aria-label="b.label"
            @click="send(b.wait ? { type: 'wait' } : { type: 'move', dir: b.dir! })">{{ arrows[b.area] }}</button>
        </div>
        <div class="inv-wrap">
          <ul class="inv" aria-label="Inventory">
            <li v-for="(item, i) in v.inventory" :key="`${i}-${item.sprite}`">
              <button type="button" :disabled="item.sprite === 'key'" :title="item.desc" @click="send({ type: 'use', slot: i })">
                <span class="slot">{{ i < 9 ? i + 1 : '' }}</span>
                <SpriteIcon :px="itemSprite(item.sprite)" :palette="theme.palette" :size="24" bg />
                <span class="name">{{ item.name }}</span>
              </button>
            </li>
            <li v-if="!v.inventory.length" class="empty">Empty pockets.</li>
          </ul>
          <div class="row">
            <button type="button" class="descend" :class="{ ready: onStairs }" @click="send({ type: 'descend' })">Descend &gt;</button>
            <button type="button" class="quiet" :aria-pressed="crt" @click="toggleCrt">CRT {{ crt ? 'on' : 'off' }}</button>
            <AudioControls />
            <button type="button" class="quiet" @click="emit('exit')">Quit</button>
          </div>
        </div>
      </div>
      <p class="keys">Arrows, WASD or hjkl move. Bump to attack. Space waits. 1-5 use items. Enter descends.</p>
    </div>
  </section>
</template>

<style scoped>
.stage { font-family: var(--font-mono); display: flex; flex-direction: column; gap: 10px; }
.k { color: var(--fg-muted); font-size: 11px; letter-spacing: .08em; }
.hud { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; font-size: 13px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
.hp { display: flex; align-items: center; gap: 8px; }
.bar { display: inline-block; width: 90px; height: 8px; background: var(--bg-elevated); position: relative; }
.bar > span { position: absolute; inset: 0 auto 0 0; background: var(--accent-lead); transition: width .2s steps(4); }
.n { min-width: 5ch; }
.meter.danger, .meter.danger .k { color: var(--accent-lead); }
.clock { margin-left: auto; font-size: 22px; font-weight: 700; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
.urgent .clock { color: var(--accent-lead); }
.critical .clock { color: var(--accent-lead); animation: blink .5s steps(2, jump-none) infinite; }
@keyframes blink { 50% { opacity: .25; } }

.screen { position: relative; display: flex; flex-direction: column; align-items: center; touch-action: none; user-select: none; -webkit-user-select: none; }
.frame { position: relative; outline: 1px solid var(--border); }
.urgent .frame { outline-color: var(--accent-lead); }
.canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
.crt { position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--px) * .5), rgba(0,0,0,.16) calc(var(--px) * .5), rgba(0,0,0,.16) var(--px));
  box-shadow: inset 0 0 60px rgba(0,0,0,.45); }
.boss { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.boss .bar { flex: 1; }

.intro { position: absolute; top: 0; left: 50%; transform: translateX(-50%); min-height: 100%; z-index: 2; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 6px;
  padding: clamp(12px, 4%, 40px); background: color-mix(in srgb, var(--bg-canvas) 86%, transparent); font-size: clamp(12px, 1.6vw, 15px); }
.intro h2 { font-family: var(--font-sans); font-size: clamp(20px, 3.4vw, 36px); margin: 0 0 4px; letter-spacing: -.01em; }
.intro p { margin: 0; max-width: 60ch; }
.era { color: var(--accent-lead); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
.intro .primary { margin-top: 10px; }
.hint { color: var(--fg-muted); font-size: 11px; }

.below { display: flex; flex-direction: column; gap: 10px; }
.log { list-style: none; margin: 0; padding: 0; font-size: 12px; line-height: 1.5; color: var(--fg-muted); min-height: 4.5em; }
.log .last { color: var(--fg-primary); }
.log .stairs { color: var(--accent-lead); }
.controls { display: flex; gap: 16px; align-items: flex-start; }
.pad { display: none; grid-template-areas: ". n ." "w c e" ". s ."; grid-template-columns: repeat(3, 44px); grid-template-rows: repeat(3, 44px); gap: 2px; flex: none; }
.a-n { grid-area: n; } .a-s { grid-area: s; } .a-w { grid-area: w; } .a-e { grid-area: e; } .a-c { grid-area: c; }
.inv-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.inv { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.inv button { display: flex; align-items: center; gap: 6px; padding: 4px 8px 4px 4px; font-size: 12px; }
.slot { color: var(--fg-muted); width: 1ch; }
.empty { color: var(--fg-muted); font-size: 12px; padding: 6px 0; }
.row { display: flex; gap: 4px; flex-wrap: wrap; }
.descend.ready { background: var(--accent-lead); color: var(--accent-lead-foreground); border-color: var(--accent-lead); }
.keys { color: var(--fg-muted); font-size: 11px; margin: 0; }

button { font: inherit; color: var(--fg-primary); background: var(--bg-surface); border: 1px solid var(--border); border-radius: 0; padding: 6px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--border-strong); }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible { outline: 2px solid var(--accent-lead); outline-offset: 1px; }
.primary { background: var(--accent-lead); color: var(--accent-lead-foreground); border-color: var(--accent-lead); font-weight: 700; padding: 8px 18px; }
.quiet { background: transparent; color: var(--fg-muted); }

@media (pointer: coarse), (max-width: 700px) {
  .pad { display: grid; }
  .keys { display: none; }
  .hud { font-size: 12px; gap: 4px 12px; }
  .bar { width: 60px; }
  .inv .name { display: none; }
  .inv button { padding: 4px; min-height: 36px; }
  .log { font-size: 11px; min-height: 4.5em; }
  .intro { width: 100% !important; background: color-mix(in srgb, var(--bg-canvas) 96%, transparent); outline: 1px solid var(--border); padding: 16px; font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .critical .clock { animation: none; }
  .bar > span { transition: none; }
}
</style>
