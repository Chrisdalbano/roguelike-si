import { expect, it } from 'vitest'
import { newGame, step, summary, view } from '../lib'
import { runGreedy } from './bot'
import type { State } from '../lib/engine'
import type { ThemeId } from '../lib/types'
import { W } from '../lib/dungeon'

function room(theme: ThemeId = 'egypt') {
  const s = newGame({ seed: 'handoff', theme, prompt: '' }) as State
  s.hero.x = 5; s.hero.y = 5
  s.floors[0]!.tiles.fill('floor'); s.floors[0]!.enemies = []; s.floors[0]!.items = []
  return s
}
const east = { type: 'move', dir: 'e' } as const
const wait = { type: 'wait' } as const
const meter = (s: State, id: string) => view(s).meters!.find(m => m.id === id)!

it.each([
  ['egypt', 'balance-36'], ['zombie', 'balance-19'], ['future', 'balance-14'],
  ['steampunk', 'balance-3'], ['medieval', 'balance-16'], ['deepsea', 'balance-5'],
] as const)('finishes a real generated %s run and summarizes the victory', (theme, seed) => {
  const config = { theme, seed, prompt: '' }
  const s = runGreedy(newGame(config)), v = view(s), result = summary(s)
  expect(v.status).toBe('won'); expect(v.hero.hp).toBeGreaterThan(0)
  expect(result).toMatchObject({ config, status: 'won', floor: 4, score: v.score, turns: v.turns })
  expect(result.kills).toBeGreaterThan(0); expect(result.score).toBeGreaterThanOrEqual(800)
  expect(result.turns).toBeGreaterThan(20); expect(v.timeLeftMs).toBeGreaterThan(0)
  expect(result.epitaph).toContain('returned alive'); expect(result.epitaph).toContain('floor 4')
  expect(result.shareText).toContain(`seed=${seed}&theme=${theme}`)
  expect(result.shareText.length).toBeLessThan(240)
  expect(view(step(s, wait))).toMatchObject({ status: 'won', score: v.score, turns: v.turns })
})

it('logs named melee, ranged and boss hits while preserving hurt events, including fatal hits', () => {
  for (const sprite of ['grunt', 'ranged', 'boss'] as const) for (const hp of [38, 1]) {
    const s = room(); s.turns = 1; s.hero.hp = hp
    s.floors[0]!.enemies.push({ id: 1, name: 'Sun Archer', sprite, x: sprite === 'ranged' ? 9 : 6, y: 5, hp: 30, maxHp: 30, atk: 5 })
    const v = view(step(s, wait))
    const hit = v.events.find(e => e.type === 'hurt')!
    expect(hit.type).toBe('hurt')
    expect(v.log.some(l => l.startsWith('Sun Archer strikes you for '))).toBe(true)
    expect(v.events).toContainEqual(expect.objectContaining({ type: 'attack', id: 1, target: 0 }))
    expect(v.status).toBe(hp === 1 ? 'dead' : 'playing')
  }
})

it('exposes detached resource meters with danger thresholds', () => {
  const s = room(); s.curse = 1
  expect(meter(s, 'curse')).toMatchObject({ label: 'Curse', value: 1, danger: false })
  s.curse = 2; expect(meter(s, 'curse').danger).toBe(true)
  s.config.theme = 'zombie'; s.noise = 4
  expect(meter(s, 'noise')).toMatchObject({ max: 18, danger: false })
  s.noise = 5; expect(meter(s, 'noise').danger).toBe(true)
  s.config.theme = 'deepsea'; s.oxygen = 20.5
  expect(meter(s, 'oxygen').danger).toBe(false)
  s.oxygen = 20; expect(meter(s, 'oxygen')).toMatchObject({ label: 'Air', max: 70, danger: true })
  const v = view(s); v.meters![0]!.value = -99
  expect(meter(s, 'oxygen').value).toBe(20)
  s.config.theme = 'steampunk'; s.turns = 2
  expect(meter(s, 'vent')).toMatchObject({ label: 'Vent', value: 1, max: 3, danger: true })
  s.turns = 3; expect(meter(s, 'vent')).toMatchObject({ value: 3, danger: false })
  s.config.theme = 'future'; s.keys = 0
  expect(view(s).meters).toEqual([{ id: 'keys', label: 'Power Cell', value: 0, max: 1, danger: true }])
})

it('caps inventory, leaves rejected loot recoverable, and collects keys and relics with a full pack', () => {
  for (const sprite of ['heal', 'key', 'relic'] as const) {
    let s = room(); s.inventory = Array.from({ length: 5 }, () => ({ sprite: 'heal' as const, name: 'Jar', desc: '' }))
    s.floors[0]!.items.push({ sprite, x: 6, y: 5 })
    const before = JSON.stringify(s)
    const next = step(s, east) as State
    expect(JSON.stringify(s)).toBe(before); s = next
    expect(s.inventory).toHaveLength(5)
    if (sprite === 'heal') {
      expect(view(s).cells[5 * W + 6]!.item).toBe('heal')
      expect(s.events.some(e => e.type === 'pickup')).toBe(false)
      expect(s.log.at(-1)).toContain('Pack full')
      s = step(s, { type: 'use', slot: 0 }) as State
      s = step(step(s, { type: 'move', dir: 'w' }), east) as State
      expect(s.inventory).toHaveLength(5); expect(s.floors[0]!.items).toHaveLength(0)
    } else {
      expect(s.floors[0]!.items).toHaveLength(0)
      expect(s.events).toContainEqual({ type: 'pickup', item: sprite, at: [6, 5] })
      expect(sprite === 'key' ? meter(s, 'keys').value : s.score).toBe(sprite === 'key' ? 2 : 100)
    }
  }
})

it('spends counted keys on chests and future doors and leaves full-pack chest rewards on the floor', () => {
  for (const theme of ['egypt', 'future'] as const) {
    let s = room(theme)
    s.inventory = Array.from({ length: 5 }, () => ({ sprite: 'heal' as const, name: 'Jar', desc: '' }))
    s.floors[0]!.tiles[5 * W + 6] = theme === 'egypt' ? 'chest' : 'door'
    s = step(s, east) as State
    expect(meter(s, 'keys').value).toBe(0); expect(s.inventory).toHaveLength(5)
    expect(s.floors[0]!.tiles[5 * W + 6]).toBe('floor')
    if (theme === 'egypt') {
      expect(s.curse).toBe(1); expect(s.score).toBe(100)
      expect(s.floors[0]!.items).toContainEqual({ sprite: 'heal', x: 6, y: 5 })
    }
  }
})

it('reads and migrates legacy JSON saves without losing keys or overflow items', () => {
  const s = room(); delete s.keys
  s.inventory = Array.from({ length: 6 }, () => ({ sprite: 'heal' as const, name: 'Jar', desc: '' }))
  s.inventory.push({ sprite: 'key', name: 'Key', desc: '' })
  const before = JSON.stringify(s)
  expect(meter(s, 'keys').value).toBe(1)
  const next = step(JSON.parse(before), wait) as State
  expect(JSON.stringify(s)).toBe(before)
  expect(next.keys).toBe(1); expect(next.inventory).toHaveLength(5)
  expect(next.floors[0]!.items).toContainEqual({ sprite: 'heal', x: 5, y: 5 })
  expect((step(next, wait) as State).keys).toBe(1)
})

it('drains a quarter unit of air per turn, refills at shrines and descents, and still suffocates', () => {
  let s = room('deepsea')
  expect((step(s, { type: 'tick', elapsedMs: 1000 }) as State).oxygen).toBe(70)
  s = step(s, wait) as State; expect(s.oxygen).toBe(69.75)
  s.oxygen = 0.25; s = step(s, wait) as State
  expect(s.oxygen).toBe(0); expect(s.hero.hp).toBe(36)
  s.floors[0]!.tiles[5 * W + 6] = 'shrine'
  s = step(s, east) as State; expect(s.oxygen).toBe(70)
  s.floors[0]!.stairs = 5 * W + 5
  s.oxygen = 1; s = step(s, { type: 'descend' }) as State
  expect(s.floor).toBe(2); expect(s.oxygen).toBe(70)
})
