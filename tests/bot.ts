import { step, view } from '../lib'
import type { Action, GameState } from '../lib/types'

export function greedyAction(state: GameState): Action {
  const v = view(state), w = v.width, p = v.hero.y * w + v.hero.x
  const use = (sprite: string) => v.inventory.findIndex(i => i.sprite === sprite)
  if (v.hero.hp <= v.hero.maxHp - 12 && use('heal') >= 0) return { type: 'use', slot: use('heal') }
  for (const sprite of ['weapon', 'armor', 'time']) if (use(sprite) >= 0) return { type: 'use', slot: use(sprite) }
  const nearby = v.cells.filter((c, i) => c.actor && c.actor.id !== 0 && Math.abs(i % w - v.hero.x) + Math.abs(Math.floor(i / w) - v.hero.y) <= 3)
  if (use('bomb') >= 0 && (nearby.length >= 2 || nearby.some(c => c.actor?.sprite === 'boss'))) return { type: 'use', slot: use('bomb') }
  if (v.cells[p]!.tile === 'stairs' && v.floor < 4) return { type: 'descend' }
  const dist = Array(v.cells.length).fill(Infinity), first: Action[] = [], queue = [p]; dist[p] = 0
  for (let q = 0; q < queue.length; q++) {
    const n = queue[q]!
    for (const [delta, dir] of [[-w, 'n'], [w, 's'], [-1, 'w'], [1, 'e']] as const) {
      const next = n + delta, c = v.cells[next]
      if (!c || (Math.abs(delta) === 1 && Math.floor(n / w) !== Math.floor(next / w)) || c.tile === 'wall' || dist[next] <= dist[n] + 1) continue
      dist[next] = dist[n] + 1; first[next] = n === p ? { type: 'move', dir } : first[n]!
      if (c.seen) queue.push(next)
    }
  }
  let target = -1, best = Infinity
  for (let i = 0; i < v.cells.length; i++) {
    const c = v.cells[i]!
    if (i === p || !Number.isFinite(dist[i])) continue
    let score = Infinity
    if (!c.seen) score = dist[i] + 9
    if (c.item) score = dist[i] - 5
    if (c.tile === 'stairs' && v.floor < 4) score = dist[i] + 5
    if (c.tile === 'shrine' && v.hero.hp < 25) score = dist[i] - 3
    if (c.actor?.sprite === 'boss') score = dist[i] - 10
    if (c.actor && c.actor.id !== 0 && dist[i] <= 1) score = -20
    if (score < best) { best = score; target = i }
  }
  return target >= 0 ? first[target]! : { type: 'wait' }
}
export function runGreedy(initial: GameState): GameState {
  let s = initial
  for (let i = 0; i < 600 && view(s).status === 'playing'; i++) {
    s = step(s, greedyAction(s)); s = step(s, { type: 'tick', elapsedMs: 750 })
  }
  return s
}
