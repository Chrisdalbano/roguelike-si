// Canvas renderer: draws a RenderView at 8 px per cell into a low-res buffer,
// animates from view.events, then blits to the screen at an integer scale.
import type { ActorSprite, GameEvent, ItemSprite, Palette, RenderView, ThemeId } from '../../lib/types'
import { THEMES } from '../../lib/themes'
import { S, actorSprite, colour, eachTextPixel, itemSprite, textWidth, tileSprite, type Mode, type Px } from './sprites'

type XY = [number, number]
interface Actor {
  id: number; sprite: ActorSprite; x: number; y: number; fx: number; fy: number; t0: number; dur: number
  flash: [number, number]; lunge?: { dx: number; dy: number; t0: number }; hp: number; maxHp: number; born: number
}
interface Particle { x: number; y: number; vx: number; vy: number; g: number; born: number; life: number; c: string }
interface Fx { kind: 'ring' | 'text' | 'pop' | 'bolt' | 'blast'; t0: number; dur: number; at: XY; to?: XY; text?: string; c?: string; item?: ItemSprite; r?: number }

const ease = (p: number) => 1 - (1 - p) ** 3
const clamp01 = (p: number) => Math.max(0, Math.min(1, p))
const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0

export class Renderer {
  readonly bw = 28 * S
  readonly bh = 18 * S
  reduced = false
  private ctx: CanvasRenderingContext2D
  private buf = document.createElement('canvas')
  private b: CanvasRenderingContext2D
  private snap = document.createElement('canvas')
  private cache = new WeakMap<Px, Map<string, HTMLCanvasElement>>()
  private dither: HTMLCanvasElement | null = null
  private pal: Palette
  private theme: ThemeId
  private view: RenderView | null = null
  private actors = new Map<number, Actor>()
  private parts: Particle[] = []
  private fx: Fx[] = []
  private shake = { t0: 0, dur: 0, mag: 0 }
  private hurtAt = -1e9
  private wipe: { t0: number; floor: number; place: string } | null = null
  private lastSecond = -1
  private raf = 0
  private lastFrame = 0
  private scale = 1

  constructor(private canvas: HTMLCanvasElement, theme: ThemeId) {
    this.ctx = canvas.getContext('2d')!
    this.buf.width = this.snap.width = this.bw
    this.buf.height = this.snap.height = this.bh
    this.b = this.buf.getContext('2d')!
    this.theme = theme
    this.pal = THEMES[theme].palette
  }

  setScale(k: number) {
    this.scale = Math.max(1, Math.floor(k))
    this.canvas.width = this.bw * this.scale
    this.canvas.height = this.bh * this.scale
  }

  start() {
    const loop = (t: number) => { this.frame(t); this.raf = requestAnimationFrame(loop) }
    this.raf = requestAnimationFrame(loop)
  }
  stop() { cancelAnimationFrame(this.raf) }

  /** Feed a fresh view. Consumes its events into animations. */
  apply(v: RenderView) {
    const t = performance.now()
    const moves = new Map<number, Extract<GameEvent, { type: 'move' }>>()
    const descend = v.events.find(e => e.type === 'descend')
    if (descend && this.view) {
      this.snap.getContext('2d')!.drawImage(this.buf, 0, 0)
      const place = [...v.log].reverse().find(l => /^Floor \d+:/.test(l))?.replace(/^Floor \d+: /, '').replace(/\.$/, '') ?? ''
      this.wipe = { t0: t, floor: descend.floor, place }
      this.actors.clear(); this.parts = []; this.fx = []
    }
    for (const e of v.events) {
      if (e.type === 'move') moves.set(e.id, e)
      else if (e.type === 'attack') this.onAttack(e, t)
      else if (e.type === 'death') this.onDeath(e.id, e.at, t)
      else if (e.type === 'pickup') this.onPickup(e.item, e.at, t)
      else if (e.type === 'hurt') { this.kick(Math.min(4, 1 + Math.ceil(e.dmg / 3)), 260, t); this.hurtAt = t }
      else if (e.type === 'heal' && e.amount > 0) {
        const h = this.actors.get(0)
        const at: XY = h ? [h.x, h.y] : [v.hero.x, v.hero.y]
        this.fx.push({ kind: 'text', t0: t, dur: 800, at, text: `+${e.amount}`, c: this.pal.light })
        this.burst(at[0] * S + 4, at[1] * S + 6, 10, [this.pal.light, this.pal.mid], t, { up: true })
      } else if (e.type === 'explode') {
        this.fx.push({ kind: 'blast', t0: t, dur: 160, at: e.at, r: e.radius })
        this.fx.push({ kind: 'ring', t0: t, dur: 520, at: e.at, r: e.radius })
        this.fx.push({ kind: 'ring', t0: t + 90, dur: 520, at: e.at, r: e.radius })
        this.burst(e.at[0] * S + 4, e.at[1] * S + 4, 46, [this.pal.accent, this.pal.light, this.pal.mid], t, { speed: 0.11 })
        this.kick(5, 420, t)
      }
    }
    // Sync actor sprites with the cells, tweening the ones that moved.
    const present = new Set<number>()
    v.cells.forEach((c, i) => {
      if (!c.actor) return
      const { id } = c.actor, x = i % v.width, y = Math.floor(i / v.width)
      present.add(id)
      let a = this.actors.get(id)
      if (!a) { a = { id, sprite: c.actor.sprite, x, y, fx: x, fy: y, t0: t, dur: 0, flash: [0, 0], hp: 0, maxHp: 0, born: moves.has(id) || descend ? 0 : t }; this.actors.set(id, a) }
      const m = moves.get(id)
      if (m) {
        const [cx, cy] = this.cellPos(a, t)
        a.fx = cx; a.fy = cy; a.t0 = t; a.dur = id === 0 ? 95 : 120
        if (id === 0 && !this.reduced) this.burst(m.from[0] * S + 4, m.from[1] * S + 7, 3, [this.pal.dark, this.pal.mid], t, { speed: 0.02 })
      } else if (a.x !== x || a.y !== y) { a.fx = x; a.fy = y; a.dur = 0 }
      a.x = x; a.y = y; a.sprite = c.actor.sprite; a.hp = c.actor.hp; a.maxHp = c.actor.maxHp
    })
    for (const id of this.actors.keys()) if (!present.has(id)) this.actors.delete(id)
    this.view = v
  }

  private onAttack(e: Extract<GameEvent, { type: 'attack' }>, t: number) {
    const a = this.actors.get(e.id), target = this.actors.get(e.target)
    if (a) {
      const dx = Math.sign(e.at[0] - a.x), dy = Math.sign(e.at[1] - a.y)
      const far = Math.abs(e.at[0] - a.x) + Math.abs(e.at[1] - a.y) > 1
      if (far) this.fx.push({ kind: 'bolt', t0: t, dur: 140, at: [a.x, a.y], to: e.at, c: a.sprite === 'boss' ? this.pal.accent : this.pal.light })
      else if (!this.reduced) a.lunge = { dx, dy, t0: t }
    }
    const delay = 60
    if (target) target.flash = [t + delay, t + delay + 110]
    this.fx.push({ kind: 'text', t0: t + delay, dur: 700, at: e.at, text: `-${e.dmg}`, c: e.target === 0 ? this.pal.accent : this.pal.light })
    this.burst(e.at[0] * S + 4, e.at[1] * S + 4, 5, [this.pal.light, this.pal.accent], t + delay, { speed: 0.06 })
  }

  private onDeath(id: number, at: XY, t: number) {
    const a = this.actors.get(id)
    const sprite = actorSprite(this.theme, a?.sprite ?? (id === 0 ? 'hero' : 'grunt'))
    const ox = at[0] * S, oy = at[1] * S, slow = id === 0 || a?.sprite === 'boss'
    if (!this.reduced) sprite.forEach((row, y) => [...row].forEach((ch, x) => {
      const c = colour(ch, this.pal); if (!c) return
      this.parts.push({ x: ox + x, y: oy + y, vx: (x - 3.5) * 0.006 + (Math.random() - 0.5) * 0.03, vy: -0.02 - Math.random() * 0.04,
        g: 0.00012, born: t + 120 + y * (slow ? 45 : 18), life: (slow ? 1300 : 650) + Math.random() * 300, c })
    }))
    if (id === 0) this.kick(3, 500, t)
    if (a?.sprite === 'boss') { this.kick(6, 700, t); this.fx.push({ kind: 'ring', t0: t + 100, dur: 900, at, r: 5 }) }
    this.actors.delete(id)
  }

  private onPickup(item: ItemSprite, at: XY, t: number) {
    this.fx.push({ kind: 'pop', t0: t, dur: 520, at, item })
    this.burst(at[0] * S + 4, at[1] * S + 4, 8, [this.pal.accent, this.pal.light], t, { speed: 0.05 })
  }

  private burst(x: number, y: number, n: number, colours: string[], t: number, o: { speed?: number; up?: boolean } = {}) {
    if (this.reduced) return
    const sp = o.speed ?? 0.04
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.8)
      this.parts.push({ x, y, vx: o.up ? (Math.random() - 0.5) * 0.02 : Math.cos(ang) * v, vy: o.up ? -0.02 - Math.random() * 0.03 : Math.sin(ang) * v,
        g: o.up ? 0 : 0.00008, born: t, life: 300 + Math.random() * 400, c: colours[i % colours.length]! })
    }
  }

  private kick(mag: number, dur: number, t: number) {
    if (this.reduced) return
    if (t - this.shake.t0 < this.shake.dur && this.shake.mag > mag) return
    this.shake = { t0: t, dur, mag }
  }

  private cellPos(a: Actor, t: number): XY {
    if (!a.dur) return [a.x, a.y]
    const p = ease(clamp01((t - a.t0) / a.dur))
    return [a.fx + (a.x - a.fx) * p, a.fy + (a.y - a.fy) * p]
  }

  // ---- sprite baking -------------------------------------------------------

  private sprite(px: Px, mode: Mode | 'o' | 's' = 'n', phase = 0): HTMLCanvasElement {
    let m = this.cache.get(px)
    if (!m) { m = new Map(); this.cache.set(px, m) }
    const key = `${this.theme}${mode}${phase}`
    let c = m.get(key)
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = S
      const g = c.getContext('2d')!
      px.forEach((row, y) => [...row].forEach((ch, x) => {
        const col = mode === 'o' ? (ch === '.' ? null : this.pal.bg) : mode === 's' ? (ch === '.' ? null : this.pal.accent) : colour(ch, this.pal, mode, phase)
        if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1) }
      }))
      m.set(key, c)
    }
    return c
  }

  private ditherTile(): HTMLCanvasElement {
    if (!this.dither) {
      const c = this.dither = document.createElement('canvas'); c.width = c.height = S
      const g = c.getContext('2d')!; g.fillStyle = this.pal.bg
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + y) % 2 === 0 && y % 2 === 0) g.fillRect(x, y, 1, 1)
    }
    return this.dither
  }

  // ---- frame ---------------------------------------------------------------

  private frame(t: number) {
    const dt = Math.min(50, t - (this.lastFrame || t)); this.lastFrame = t
    const v = this.view, b = this.b
    b.fillStyle = this.pal.bg; b.fillRect(0, 0, this.bw, this.bh)
    if (!v) return this.blit(t)
    const w = this.wipe, wdur = this.reduced ? 700 : 1000
    const wp = w ? (t - w.t0) / wdur : 1
    if (w && wp >= 1) this.wipe = null
    if (w && wp < 0.4 && !this.reduced) b.drawImage(this.snap, 0, 0)
    else this.world(v, t, dt)
    if (w && wp < 1) this.drawWipe(w, wp)
    this.urgency(v, t)
    this.blit(t)
  }

  private world(v: RenderView, t: number, dt: number) {
    const b = this.b, still = this.reduced
    for (let i = 0; i < v.cells.length; i++) {
      const c = v.cells[i]!
      if (!c.seen || c.tile === 'void') continue
      const x = i % v.width, y = Math.floor(i / v.width)
      let variant: 'face' | 'top' | 'alt' | 'plain' = 'plain'
      if (c.tile === 'wall') {
        const below = v.cells[i + v.width]
        variant = below?.tile === 'wall' ? 'top' : hash(x, y) % 7 === 0 ? 'alt' : 'face'
      } else if (c.tile === 'floor' && hash(x, y) % 13 === 0) variant = 'alt'
      let mode: Mode = c.visible ? 'n' : 'd', phase = 0
      if (c.visible && !still && (c.tile === 'hazard' || c.tile === 'shrine' || c.tile === 'stairs')) {
        mode = 'c'
        phase = c.tile === 'hazard' ? Math.floor(t / 130) + x + y : Math.floor(t / (c.tile === 'stairs' ? 320 : 200))
        phase %= 3
      }
      b.drawImage(this.sprite(tileSprite(this.theme, c.tile, variant), mode, phase), x * S, y * S)
      if (!c.visible && variant !== 'top') b.drawImage(this.ditherTile(), x * S, y * S)
    }
    // Items
    v.cells.forEach((c, i) => {
      if (!c.item || !c.visible) return
      const x = i % v.width, y = Math.floor(i / v.width)
      const bob = still ? 0 : Math.floor(t / 420 + x * 0.7 + y * 0.3) % 2
      b.drawImage(this.sprite(itemSprite(c.item)), x * S, y * S - bob)
    })
    // Actors, hero last
    const list = [...this.actors.values()].sort((a, z) => (a.id === 0 ? 1 : 0) - (z.id === 0 ? 1 : 0) || a.y - z.y)
    for (const a of list) {
      if (a.id === 0 && v.hero.hp <= 0) continue
      const [cx, cy] = this.cellPos(a, t)
      let px = Math.round(cx * S), py = Math.round(cy * S)
      if (a.lunge) {
        const lp = (t - a.lunge.t0) / 150
        if (lp >= 1) a.lunge = undefined
        else { const o = Math.round(Math.sin(lp * Math.PI) * 4); px += a.lunge.dx * o; py += a.lunge.dy * o }
      }
      const moving = a.dur && t - a.t0 < a.dur
      if (!still && !moving) py -= Math.floor(t / 380 + a.id * 0.37) % 2
      else if (moving) py -= 1
      const px8 = actorSprite(this.theme, a.sprite)
      if (a.born && t - a.born < 240 && Math.floor((t - a.born) / 60) % 2 === 0) continue // flicker in
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) b.drawImage(this.sprite(px8, 'o'), px + ox, py + oy)
      if (a.sprite === 'boss' && (still || Math.floor(t / 260) % 2 === 0)) {
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) b.drawImage(this.sprite(px8, 's'), px + ox, py + oy)
      }
      const flashing = t >= a.flash[0] && t < a.flash[1]
      b.drawImage(this.sprite(px8, flashing ? 'f' : 'n'), px, py)
      if (a.id !== 0 && a.hp < a.maxHp && a.maxHp > 0) {
        b.fillStyle = this.pal.bg; b.fillRect(px, py - 2, 8, 1)
        b.fillStyle = this.pal.accent; b.fillRect(px, py - 2, Math.max(1, Math.round(8 * a.hp / a.maxHp)), 1)
      }
    }
    this.effects(t, dt)
  }

  private effects(t: number, dt: number) {
    const b = this.b, p = this.pal
    this.parts = this.parts.filter(q => t < q.born + q.life)
    for (const q of this.parts) {
      if (t < q.born) { continue }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt
      const life = (t - q.born) / q.life
      if (life > 0.7 && Math.floor(t / 50) % 2) continue // blink out
      b.fillStyle = q.c; b.fillRect(Math.round(q.x), Math.round(q.y), 1, 1)
    }
    this.fx = this.fx.filter(f => t < f.t0 + f.dur)
    for (const f of this.fx) {
      const k = (t - f.t0) / f.dur
      if (k < 0) continue
      const cx = f.at[0] * S + 4, cy = f.at[1] * S + 4
      if (f.kind === 'text') {
        const rise = this.reduced ? 0 : Math.round(ease(k) * 7)
        const x0 = cx - Math.floor(textWidth(f.text!) / 2), y0 = f.at[1] * S - 3 - rise
        if (k > 0.75 && Math.floor(t / 60) % 2) continue
        eachTextPixel(f.text!, (x, y) => { b.fillStyle = p.bg; b.fillRect(x0 + x + 1, y0 + y + 1, 1, 1) })
        eachTextPixel(f.text!, (x, y) => { b.fillStyle = f.c!; b.fillRect(x0 + x, y0 + y, 1, 1) })
      } else if (f.kind === 'pop') {
        const y = f.at[1] * S - Math.round(ease(k) * 8)
        if (k < 0.6 || Math.floor(t / 50) % 2) b.drawImage(this.sprite(itemSprite(f.item!), k < 0.15 ? 'f' : 'n'), f.at[0] * S, y)
      } else if (f.kind === 'bolt') {
        const tx = f.to![0] * S + 4, ty = f.to![1] * S + 4
        for (let i = 0; i < 4; i++) {
          const kk = clamp01(k - i * 0.08)
          b.fillStyle = i ? p.mid : f.c!
          b.fillRect(Math.round(cx + (tx - cx) * kk), Math.round(cy + (ty - cy) * kk), i ? 1 : 2, i ? 1 : 2)
        }
      } else if (f.kind === 'blast') {
        const r = f.r!
        b.fillStyle = k < 0.5 ? p.light : p.accent
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > r) continue
          const x = (f.at[0] + dx) * S, y = (f.at[1] + dy) * S
          for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if ((xx + yy + (k < 0.5 ? 0 : 1)) % 2 === 0) b.fillRect(x + xx, y + yy, 1, 1)
        }
      } else if (f.kind === 'ring') {
        const R = Math.round(ease(k) * (f.r! * S + 4)) + 2
        b.fillStyle = k < 0.5 ? p.light : p.accent
        if (k > 0.7 && Math.floor(t / 50) % 2) continue
        for (let i = -R; i <= R; i++) {
          const h = R - Math.abs(i)
          b.fillRect(cx + i, cy - h, 1, 1); b.fillRect(cx + i, cy + h, 1, 1)
          if (k < 0.5) { b.fillRect(cx + i, cy - h + 1, 1, 1); b.fillRect(cx + i, cy + h - 1, 1, 1) }
        }
      }
    }
  }

  private drawWipe(w: NonNullable<Renderer['wipe']>, k: number) {
    const b = this.b, p = this.pal, cols = this.bw / S
    if (this.reduced) {
      if (k < 0.8) this.label(w)
      return
    }
    let from = 0, to = 0
    if (k < 0.4) to = Math.ceil(ease(k / 0.4) * cols)
    else if (k < 0.6) to = cols
    else { from = Math.floor(ease((k - 0.6) / 0.4) * cols); to = cols }
    b.fillStyle = p.bg
    b.fillRect(from * S, 0, (to - from) * S, this.bh)
    // dithered leading edge
    const edge = k < 0.4 ? to : from - 1
    if (edge >= 0 && edge < cols) {
      b.fillStyle = p.dark
      for (let y = 0; y < this.bh; y++) for (let x = 0; x < S; x++) if ((x + y) % 2 === 0) b.fillRect(edge * S + x, y, 1, 1)
    }
    if (from * S < this.bw / 2 + 20 && to * S > this.bw / 2 - 20) this.label(w)
  }

  private label(w: { floor: number; place: string }) {
    const b = this.b, p = this.pal
    const big = `FLOOR ${w.floor}`, bw = textWidth(big) * 2
    const x0 = Math.floor((this.bw - bw) / 2), y0 = Math.floor(this.bh / 2) - 9
    eachTextPixel(big, (x, y) => { b.fillStyle = p.light; b.fillRect(x0 + x * 2, y0 + y * 2, 2, 2) })
    const small = w.place.toUpperCase(), sx = Math.floor((this.bw - textWidth(small)) / 2)
    eachTextPixel(small, (x, y) => { b.fillStyle = p.accent; b.fillRect(sx + x, y0 + 15 + y, 1, 1) })
  }

  private urgency(v: RenderView, t: number) {
    if (v.status !== 'playing') return
    const left = v.timeLeftMs, b = this.b
    if (left > 60_000 && t - this.hurtAt > 160) return
    const crit = left <= 15_000
    const sec = Math.ceil(left / 1000)
    if (crit && sec !== this.lastSecond) { this.lastSecond = sec; this.kick(1, 120, t) }
    const on = t - this.hurtAt < 160 || this.reduced || Math.floor(t / (crit ? 125 : 500)) % 2 === 0
    if (!on) return
    const th = crit || t - this.hurtAt < 160 ? 2 : 1
    b.fillStyle = this.pal.accent
    b.fillRect(0, 0, this.bw, th); b.fillRect(0, this.bh - th, this.bw, th)
    b.fillRect(0, 0, th, this.bh); b.fillRect(this.bw - th, 0, th, this.bh)
  }

  private blit(t: number) {
    const k = this.scale, ctx = this.ctx
    let ox = 0, oy = 0
    const s = this.shake, sp = (t - s.t0) / s.dur
    if (!this.reduced && sp >= 0 && sp < 1) {
      const m = s.mag * (1 - sp)
      ox = Math.round((Math.random() * 2 - 1) * m); oy = Math.round((Math.random() * 2 - 1) * m)
    }
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = this.pal.bg; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.buf, ox * k, oy * k, this.bw * k, this.bh * k)
  }
}
