// Event -> sound. Reads the same view(state).events the renderer animates, plus
// a small diff against the previous view for things the logic does not emit as
// events (doors, chests, shrines, item use, the doom-clock warning).
import type { ItemSprite, RenderView } from '../../lib/types'
import { random } from '../../lib/random'
import { audio, midiHz } from './engine'

const T = () => audio.now() + 0.005

/** Seeded pitch wobble: same run, same little variations. */
function wobble(rng: () => number, cents = 60) { return 2 ** (((rng() * 2 - 1) * cents) / 1200) }

const notes = (ms: number[], wave: 'square' | 'pulse25' | 'pulse12' | 'triangle', gap: number, len: number, vol: number, t = T()) =>
  ms.forEach((m, i) => audio.tone({ wave, freq: midiHz(m), at: t + i * gap, dur: len, vol }))

export const SFX = {
  step(r: () => number) {
    audio.noiseHit({ crunch: true, type: 'highpass', freq: 1600 * wobble(r, 200), dur: 0.035, vol: 0.035 })
    audio.tone({ wave: 'triangle', freq: 98 * wobble(r), to: 70, dur: 0.04, vol: 0.05 })
  },
  bump(r: () => number) { audio.tone({ wave: 'square', freq: 82 * wobble(r), to: 55, dur: 0.07, vol: 0.05 }) },
  attack(r: () => number) {
    audio.tone({ wave: 'pulse25', freq: 620 * wobble(r), to: 170, dur: 0.08, vol: 0.06 })
    audio.noiseHit({ type: 'bandpass', freq: 2800, q: 1.2, dur: 0.05, vol: 0.06 })
  },
  hurt(r: () => number, dmg: number) {
    const k = Math.min(1.6, 0.7 + dmg / 8)
    audio.noiseHit({ crunch: true, type: 'lowpass', freq: 1400, to: 300, dur: 0.14, vol: 0.12 * k })
    audio.tone({ wave: 'square', freq: 240 * wobble(r), to: 80, dur: 0.16, vol: 0.07 * k })
  },
  kill(r: () => number) {
    const b = 76 + Math.round((r() * 2 - 1) * 2)
    notes([b, b - 5, b - 9], 'pulse25', 0.045, 0.06, 0.05)
    audio.noiseHit({ crunch: true, type: 'bandpass', freq: 900, to: 200, dur: 0.18, vol: 0.06 })
  },
  bossDown() {
    audio.duck(0.25, 1.2)
    audio.noiseHit({ crunch: true, type: 'lowpass', freq: 3000, to: 80, dur: 1.4, vol: 0.22 })
    notes([79, 74, 71, 67, 62, 59, 55, 50], 'square', 0.08, 0.1, 0.06)
  },
  pickup(item: ItemSprite) {
    const t = T()
    switch (item) {
      case 'heal': notes([72, 79], 'triangle', 0.07, 0.12, 0.12, t); break
      case 'weapon': notes([88, 95], 'pulse12', 0.05, 0.09, 0.05, t); break
      case 'armor': audio.tone({ wave: 'square', freq: midiHz(43), to: midiHz(40), at: t, dur: 0.12, vol: 0.07 }); notes([67, 71], 'pulse25', 0.06, 0.08, 0.04, t + 0.05); break
      case 'bomb': audio.noiseHit({ type: 'bandpass', freq: 5000, to: 2500, q: 3, at: t, dur: 0.22, vol: 0.05 }); notes([60], 'square', 0, 0.05, 0.04, t); break
      case 'key': notes([91, 96], 'pulse12', 0.06, 0.18, 0.045, t); break
      case 'relic': notes([83], 'square', 0, 0.07, 0.045, t); notes([88], 'square', 0, 0.3, 0.045, t + 0.07); break
      case 'time': notes([72, 73, 74, 75, 76], 'triangle', 0.035, 0.05, 0.1, t); break
    }
  },
  use(item: ItemSprite) {
    switch (item) {
      case 'heal': notes([60, 64, 67, 72], 'triangle', 0.05, 0.1, 0.12); break
      case 'weapon': audio.noiseHit({ type: 'highpass', freq: 2000, to: 9000, dur: 0.18, vol: 0.06 }); audio.tone({ wave: 'pulse25', freq: 440, to: 1320, dur: 0.16, vol: 0.05 }); break
      case 'armor': notes([48, 55, 60], 'square', 0.06, 0.09, 0.05); break
      case 'time': notes([84, 79, 84, 91], 'pulse12', 0.06, 0.07, 0.05); break
      case 'relic': notes([83, 88], 'square', 0.07, 0.15, 0.04); break
      default: break
    }
  },
  bomb() {
    audio.duck(0.3, 0.5)
    audio.noiseHit({ crunch: true, type: 'lowpass', freq: 3500, to: 120, dur: 0.7, vol: 0.28 })
    audio.tone({ wave: 'square', freq: 110, to: 35, dur: 0.45, vol: 0.12 })
  },
  door(future: boolean) {
    if (future) audio.tone({ wave: 'pulse25', freq: 1400, to: 300, dur: 0.12, vol: 0.05 })
    audio.noiseHit({ crunch: true, type: 'bandpass', freq: 500, to: 250, q: 1.5, dur: 0.14, vol: 0.08 })
    audio.tone({ wave: 'square', freq: 140, to: 100, dur: 0.1, vol: 0.04 })
  },
  chest() { notes([72, 76, 79, 84], 'pulse25', 0.05, 0.08, 0.05) },
  shrine() {
    const t = T()
    for (const m of [76, 83]) audio.tone({ wave: 'triangle', freq: midiHz(m), at: t, dur: 0.6, attack: 0.08, vol: 0.08, echo: 0.4 })
    audio.tone({ wave: 'pulse12', freq: midiHz(88), at: t + 0.15, dur: 0.4, attack: 0.05, vol: 0.03, echo: 0.5 })
  },
  descend() {
    audio.duck(0.35, 0.6)
    notes([79, 76, 72, 67, 64, 60], 'pulse25', 0.055, 0.07, 0.055)
    audio.noiseHit({ type: 'lowpass', freq: 1200, to: 200, dur: 0.4, attack: 0.1, vol: 0.06 })
  },
  clock(secondsLeft: number) {
    const hi = secondsLeft <= 5
    audio.tone({ wave: 'square', freq: hi ? 1976 : 1568, dur: 0.03, vol: hi ? 0.05 : 0.035 })
    if (hi) audio.tone({ wave: 'square', freq: 1976, at: T() + 0.12, dur: 0.03, vol: 0.04 })
  },
  death() {
    audio.duck(0.15, 1.6)
    audio.tone({ wave: 'square', freq: midiHz(67), to: midiHz(43), dur: 0.9, vol: 0.08, vibrato: { rate: 9, cents: 40 } })
    audio.noiseHit({ crunch: true, type: 'lowpass', freq: 800, to: 100, at: T() + 0.1, dur: 0.6, vol: 0.08 })
    notes([55, 54, 53], 'triangle', 0.3, 0.28, 0.12, T() + 0.9)
  },
  timeout() {
    audio.duck(0.15, 1.6)
    notes([81, 76, 81, 76, 81, 76], 'square', 0.12, 0.09, 0.045)
    audio.tone({ wave: 'square', freq: midiHz(64), to: midiHz(40), at: T() + 0.75, dur: 0.8, vol: 0.07 })
  },
  win() {
    audio.duck(0.1, 2.2)
    const t = T()
    notes([67, 72, 76], 'pulse25', 0.09, 0.08, 0.06, t)
    audio.tone({ wave: 'pulse25', freq: midiHz(79), at: t + 0.27, dur: 0.2, vol: 0.06 })
    audio.tone({ wave: 'pulse25', freq: midiHz(76), at: t + 0.5, dur: 0.12, vol: 0.06 })
    audio.tone({ wave: 'pulse25', freq: midiHz(84), at: t + 0.63, dur: 0.9, vol: 0.065, vibrato: { rate: 6, cents: 20 }, echo: 0.3 })
    notes([48, 55, 60], 'triangle', 0.27, 0.25, 0.14, t)
    audio.tone({ wave: 'triangle', freq: midiHz(48), at: t + 0.63, dur: 0.9, vol: 0.14 })
  },
}

/** Per-run mapper: feed it every view, in order. */
export function createSfx(seed: string, theme: string, hooks: { boss?: () => void } = {}) {
  const rng = random(`${seed}:sfx`)
  let prev: RenderView | null = null
  let lastSecond = Infinity
  let bossSeen = false

  function onView(v: RenderView) {
    const p = prev
    prev = v
    if (!p) return
    if (!audio.running) { bossSeen ||= v.cells.some(c => c.visible && c.actor?.sprite === 'boss'); return }
    const ev = v.events
    let played = 0
    const play = (fn: () => void) => { if (played++ < 4) fn() } // never a wall of sound from one step

    // Doom-clock warning: one tick per second in the last 15.
    const sec = Math.ceil(v.timeLeftMs / 1000)
    if (v.status === 'playing' && sec <= 15 && sec >= 1 && sec < lastSecond) SFX.clock(sec)
    lastSecond = sec

    if (v.status !== p.status) {
      if (v.status === 'dead') SFX.death()
      else if (v.status === 'timeout') SFX.timeout()
      else if (v.status === 'won') { SFX.bossDown(); setTimeout(SFX.win, 900) }
      return
    }
    if (!bossSeen && v.cells.some(c => c.visible && c.actor?.sprite === 'boss')) { bossSeen = true; hooks.boss?.() }
    if (!ev.length && !changed(p, v)) return

    const descended = ev.find(e => e.type === 'descend')
    if (descended) { play(SFX.descend); return }
    if (ev.some(e => e.type === 'explode')) play(SFX.bomb)
    for (const e of ev) {
      if (e.type === 'attack' && e.id === 0) { play(() => SFX.attack(rng)); break }
    }
    const hurt = ev.find(e => e.type === 'hurt')
    if (hurt && hurt.type === 'hurt') play(() => SFX.hurt(rng, hurt.dmg))
    if (ev.some(e => e.type === 'death' && e.id !== 0)) play(() => SFX.kill(rng))
    for (const e of ev) if (e.type === 'pickup') { play(() => SFX.pickup(e.item)); break }

    // Tiles that changed under or next to the hero: doors, chests, shrines.
    if (v.floor === p.floor) {
      for (let i = 0; i < v.cells.length; i++) {
        const a = p.cells[i]!.tile, b = v.cells[i]!.tile
        if (a === b || b !== 'floor') continue
        if (a === 'door') play(() => SFX.door(theme === 'future'))
        else if (a === 'chest') play(SFX.chest)
        else if (a === 'shrine') play(SFX.shrine)
      }
    }
    // Inventory item used (the logic emits no event for most uses).
    if (v.inventory.length < p.inventory.length && !ev.some(e => e.type === 'pickup')) {
      const used = p.inventory.find((it, i) => v.inventory[i]?.sprite !== it.sprite)
      if (used && used.sprite !== 'bomb') play(() => SFX.use(used.sprite))
    }
    const heroMoved = ev.some(e => e.type === 'move' && e.id === 0)
    if (heroMoved && played === 0) play(() => SFX.step(rng))
  }
  /** A move that changed nothing: walked into a wall. */
  function bump() { if (audio.running) SFX.bump(rng) }
  return { onView, bump }
}

function changed(a: RenderView, b: RenderView) {
  return a.inventory.length !== b.inventory.length || a.turns !== b.turns
}
