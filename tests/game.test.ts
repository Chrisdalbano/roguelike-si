import { describe, expect, it } from 'vitest'
import { createRun, dailyRun, dungeonJSON, intro, newGame, RUN_MS, step, summary, THEMES, view } from '../lib'
import type { Action, RunConfig, ThemeId } from '../lib'
import type { State } from '../lib/engine'
import { distances, generate, W, walkable } from '../lib/dungeon'
import { random } from '../lib/random'
import { lineOfSight } from '../lib/vision'
import { runGreedy } from './bot'

const ids = Object.keys(THEMES) as ThemeId[]
const config = (seed = 'test', theme: ThemeId = 'medieval'): RunConfig => ({ seed, theme, prompt: '' })
const fixture = (theme: ThemeId = 'medieval') => {
  const s = newGame(config('fixture', theme)) as State
  const f = s.floors[0]!
  f.enemies = []; f.items = []; f.tiles.fill('floor')
  return s
}
describe('generation and replay', () => {
  it('connects every floor across 200 seeds per theme', () => {
    for (const theme of ids) for (let seed = 0; seed < 200; seed++) for (const f of generate(config(String(seed), theme))) {
      const d = distances(f.tiles, f.start)
      expect(d[f.stairs], `${theme}/${seed}`).toBeGreaterThan(0)
      expect(f.tiles.every((t, p) => !walkable(t) || d[p]! >= 0)).toBe(true)
      expect(new Set([...f.enemies, ...f.items].map(e => e.y * W + e.x)).size).toBe(f.enemies.length + f.items.length)
    }
  }, 60_000)
  it('replays identical configs and actions without mutating inputs', () => {
    for (const theme of ids) {
      let a = newGame(config('replay', theme)), b = newGame(config('replay', theme))
      const rng = random('actions')
      for (let n = 0; n < 100; n++) {
        const action: Action = { type: 'move', dir: (['n', 'e', 's', 'w'] as const)[Math.floor(rng() * 4)]! }
        const before = JSON.stringify(a); const next = step(a, action)
        expect(JSON.stringify(a)).toBe(before); a = next; b = step(b, action)
        expect(view(a)).toEqual(view(b)); expect(JSON.parse(JSON.stringify(a))).toEqual(a)
      }
      expect(dungeonJSON(config('replay', theme))).toEqual(dungeonJSON(config('replay', theme)))
    }
  })
  it('maps keywords, normalization, hash fallback, random and UTC daily seeds', () => {
    for (const theme of ids) for (const word of THEMES[theme].keywords) expect(createRun(word).theme).toBe(theme)
    expect(createRun('  MUMMY   Heist ').seed).toBe('mummy heist')
    expect(createRun('unknown')).toEqual(createRun('unknown'))
    expect(createRun('', new Date(0)).seed).not.toBe(createRun('', new Date(1)).seed)
    expect(dailyRun(new Date('2026-01-01T23:00:00Z'))).toEqual(dailyRun(new Date('2026-01-01T00:00:00Z')))
    expect(intro(config()).lines.length).toBeGreaterThanOrEqual(2)
  })
})
describe('simulation', () => {
  it('counts only valid ticks, times out exactly, and time items extend the clock', () => {
    let s = fixture()
    for (const elapsedMs of [-1, NaN, Infinity]) expect(view(step(s, { type: 'tick', elapsedMs })).timeLeftMs).toBe(RUN_MS)
    s.inventory.push({ sprite: 'time', name: 'Time', desc: '' })
    s = step(s, { type: 'use', slot: 3 }) as State
    expect(s.timeLeftMs).toBe(RUN_MS + 20_000)
    s = step(s, { type: 'tick', elapsedMs: RUN_MS + 19_999 }) as State
    expect(s.status).toBe('playing')
    s = step(s, { type: 'tick', elapsedMs: 1 }) as State
    expect(s.status).toBe('timeout'); expect(view(step(s, { type: 'wait' })).turns).toBe(s.turns)
  })
  it('wins by killing the final boss and records death causes', () => {
    let s = fixture(); s.floor = 4
    const f = s.floors[3]!; f.tiles.fill('floor'); f.items = []
    f.enemies = [{ id: 399, sprite: 'boss', name: 'Cinder Lord', x: s.hero.x + 1, y: s.hero.y, hp: 1, maxHp: 38, atk: 8 }]
    s = step(s, { type: 'move', dir: 'e' }) as State
    expect(s.status).toBe('won'); expect(summary(s).kills).toBe(1); expect(view(s).events.some(e => e.type === 'death')).toBe(true)
    s = fixture(); s.hero.hp = 1
    s.floors[0]!.enemies = [{ id: 1, sprite: 'grunt', name: 'Hollow Knight', x: s.hero.x + 1, y: s.hero.y, hp: 20, maxHp: 20, atk: 4 }]
    s = step(s, { type: 'wait' }) as State
    expect(s.status).toBe('dead'); expect(summary(s).epitaph).toContain('Hollow Knight')
    expect(summary(s).shareText.length).toBeLessThan(240)
    expect(summary(s).shareText).toMatch(/https:\/\/roguelike.si\/\?seed=fixture&theme=medieval$/)
  })
  it('supports every theme mechanic through existing tiles', () => {
    for (const theme of ids) {
      let s = fixture(theme), p = s.hero.y * W + s.hero.x + 1
      s.floors[0]!.tiles[p] = theme === 'egypt' ? 'chest' : theme === 'future' ? 'door' : 'shrine'
      s = step(s, { type: 'move', dir: 'e' }) as State
      if (theme === 'egypt') expect(s.curse).toBe(1)
      if (theme === 'future') expect(s.inventory.some(i => i.sprite === 'key')).toBe(false)
      if (theme === 'medieval') expect(s.hero.atk).toBe(6)
      if (theme === 'deepsea') expect(s.oxygen).toBe(70)
    }
    let s = fixture('steampunk'); s.floors[0]!.tiles[s.hero.y * W + s.hero.x] = 'hazard'
    s = step(step(step(s, { type: 'wait' }), { type: 'wait' }), { type: 'wait' }) as State
    expect(s.hero.hp).toBe(35)
    s = fixture('zombie'); s.inventory = [{ sprite: 'bomb', name: '', desc: '' }]
    expect((step(s, { type: 'use', slot: 0 }) as State).noise).toBe(17)
  })
  it('keeps fog memory, hides entities and provides symmetric line of sight', () => {
    const s = newGame(config()) as State, f = s.floors[0]!
    for (let a = 0; a < f.tiles.length; a += 7) for (let b = 0; b < f.tiles.length; b += 11) if (f.tiles[a] === 'floor' && f.tiles[b] === 'floor') {
      expect(lineOfSight(f.tiles, a % W, Math.floor(a / W), b % W, Math.floor(b / W))).toBe(lineOfSight(f.tiles, b % W, Math.floor(b / W), a % W, Math.floor(a / W)))
    }
    const v = view(s); expect(v.cells.filter(c => !c.visible).every(c => !c.actor && !c.item)).toBe(true)
    v.hero.hp = 0; v.inventory.length = 0; expect(view(s).hero.hp).toBe(38)
  })
  it('allows passage past locked chests and unaffordable shrines', () => {
    for (const tile of ['chest', 'shrine'] as const) {
      const s = fixture(); s.inventory = []; s.hero.hp = 5
      s.floors[0]!.tiles[s.hero.y * W + s.hero.x + 1] = tile
      expect(view(step(s, { type: 'move', dir: 'e' })).hero.x).toBe(s.hero.x + 1)
    }
  })
  it('brutes rest, ranged enemies shoot, bosses telegraph and fog persists', () => {
    for (const sprite of ['brute', 'ranged', 'boss'] as const) {
      let s = fixture(); s.floors[0]!.enemies = [{ id: 1, sprite, name: sprite, x: s.hero.x + (sprite === 'ranged' ? 4 : 1), y: s.hero.y, hp: 30, maxHp: 30, atk: 6 }]
      s = step(s, { type: 'wait' }) as State
      expect(s.hero.hp).toBe(38)
      s = step(s, { type: 'wait' }) as State
      expect(s.hero.hp).toBeLessThan(38)
    }
    let s = fixture(); s = step(s, { type: 'wait' }) as State
    const old = s.hero.y * W + s.hero.x
    for (let i = 0; i < 10; i++) s = step(s, { type: 'move', dir: 'e' }) as State
    expect(view(s).cells[old]).toMatchObject({ seen: true, visible: false })
  })
  it('survives 300 scripted random-walk runs', () => {
    for (let run = 0; run < 300; run++) {
      let s = newGame(config(`walk-${run}`, ids[run % 6]!)); const rng = random(`walk-${run}`)
      for (let i = 0; i < 150 && view(s).status === 'playing'; i++) {
        const choices: Action[] = [{ type: 'move', dir: (['n', 's', 'e', 'w'] as const)[Math.floor(rng() * 4)]! }, { type: 'wait' }, { type: 'use', slot: Math.floor(rng() * 10) - 1 }, { type: 'descend' }]
        s = step(s, choices[Math.floor(rng() * choices.length)]!)
        s = step(s, { type: 'tick', elapsedMs: 1000 }); expect(Number.isFinite(view(s).hero.hp)).toBe(true)
      }
    }
  }, 60_000)
  it('measures a greedy player using only the public view', () => {
    const results = Array.from({ length: 120 }, (_, i) => summary(runGreedy(newGame(config(`balance-${i}`, ids[i % 6]!)))))
    const floors = results.map(r => r.floor).sort((a, b) => a - b)
    console.log('BALANCE', JSON.stringify({ runs: results.length, wins: results.filter(r => r.status === 'won').length, medianFloor: (floors[59]! + floors[60]!) / 2, themes: ids.map(theme => ({ theme, wins: results.filter(r => r.config.theme === theme && r.status === 'won').length })) }))
    expect(results.every(r => r.status !== 'playing')).toBe(true)
  }, 60_000)
})
