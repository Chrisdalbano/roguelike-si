import type { ActorSprite, ItemSprite, RunConfig, TileSprite } from './types'
import { random } from './random'
import { vocabulary } from './themes'

export const W = 28, H = 18
export interface Enemy { id: number; x: number; y: number; sprite: Exclude<ActorSprite, 'hero'>; name: string; hp: number; maxHp: number; atk: number }
export interface Floor { tiles: TileSprite[]; enemies: Enemy[]; items: { x: number; y: number; sprite: ItemSprite }[]; start: number; stairs: number; generator: string; seen: boolean[] }
export const neighbors = (p: number) => [p - W, p + W, ...(p % W ? [p - 1] : []), ...(p % W < W - 1 ? [p + 1] : [])].filter(n => n >= 0 && n < W * H)
export const walkable = (t: TileSprite | undefined) => !!t && t !== 'wall' && t !== 'void'
export function distances(tiles: TileSprite[], start: number): number[] {
  const d = Array(W * H).fill(-1); d[start] = 0
  const q = [start]
  for (let i = 0; i < q.length; i++) for (const n of neighbors(q[i]!)) if (d[n] < 0 && walkable(tiles[n])) { d[n] = d[q[i]!] + 1; q.push(n) }
  return d
}
export function generate(config: RunConfig): Floor[] {
  return Array.from({ length: 4 }, (_, f) => {
    const rng = random(`${config.theme}:${config.seed}:floor:${f}`)
    const int = (n: number) => Math.floor(rng() * n)
    let tiles: TileSprite[] = Array(W * H).fill('wall')
    const cave = (config.theme === 'deepsea' || config.theme === 'zombie') ? f % 2 === 0 : f === 2
    const carve = (x: number, y: number) => { tiles[y * W + x] = 'floor' }
    if (cave) {
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (rng() > .43) carve(x, y)
      for (let pass = 0; pass < 3; pass++) {
        const next = [...tiles]
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          let walls = 0
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && tiles[(y + dy) * W + x + dx] === 'wall') walls++
          next[y * W + x] = walls >= 5 ? 'wall' : walls <= 3 ? 'floor' : tiles[y * W + x]!
        }
        tiles = next
      }
    } else {
      let last = [3, 3]
      for (let room = 0; room < 8; room++) {
        const w = 4 + int(4), h = 3 + int(3), x = 1 + int(W - w - 2), y = 1 + int(H - h - 2)
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) carve(xx, yy)
        const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2)
        for (let xx = Math.min(last[0]!, cx); xx <= Math.max(last[0]!, cx); xx++) carve(xx, last[1]!)
        for (let yy = Math.min(last[1]!, cy); yy <= Math.max(last[1]!, cy); yy++) carve(cx, yy)
        last = [cx, cy]
      }
    }
    carve(3, 3)
    // Join disconnected cave pockets to the entrance with orthogonal tunnels.
    let d = distances(tiles, 3 * W + 3)
    for (let p = 0; p < tiles.length; p++) if (walkable(tiles[p]) && d[p]! < 0) {
      let x = p % W, y = Math.floor(p / W)
      while (x !== 3) { carve(x, y); x += Math.sign(3 - x) }
      while (y !== 3) { carve(x, y); y += Math.sign(3 - y) }
      d = distances(tiles, 3 * W + 3)
    }
    const start = 3 * W + 3
    const stairs = d.indexOf(Math.max(...d))
    tiles[stairs] = 'stairs'
    const spots = tiles.map((t, p) => t === 'floor' && d[p]! > 4 ? p : -1).filter(p => p >= 0)
    for (let i = spots.length - 1; i > 0; i--) { const j = int(i + 1); [spots[i], spots[j]] = [spots[j]!, spots[i]!] }
    const take = () => spots.pop()!
    for (const tile of ['chest', 'chest', 'shrine', 'shrine', 'door', 'hazard', 'hazard'] as TileSprite[]) tiles[take()] = tile
    const items: Floor['items'] = []
    for (const sprite of ['heal', 'heal', 'weapon', 'armor', 'bomb', 'key', ...(rng() < .18 ? ['time'] : ['relic'])] as ItemSprite[]) {
      const p = take(); items.push({ x: p % W, y: Math.floor(p / W), sprite })
    }
    const enemies: Enemy[] = []
    const kinds: Enemy['sprite'][] = ['grunt', 'brute', 'ranged', 'swarm']
    for (let i = 0; i < 6 + f * 2; i++) {
      const sprite = kinds[i % 4]!, p = take(), k = kinds.indexOf(sprite)
      const hp = [8, 17, 7, 4][k]! + f * 2
      enemies.push({ id: f * 100 + i + 1, x: p % W, y: Math.floor(p / W), sprite, name: vocabulary[config.theme].foe[k]!, hp, maxHp: hp, atk: [3, 6, 3, 2][k]! + f })
      if (sprite === 'swarm') {
        const extra = take()
        enemies.push({ id: f * 100 + 50 + i, x: extra % W, y: Math.floor(extra / W), sprite, name: vocabulary[config.theme].foe[k]!, hp: 4, maxHp: 4, atk: 2 })
      }
    }
    if (f === 3) enemies.push({ id: 399, x: stairs % W, y: Math.floor(stairs / W), sprite: 'boss', name: vocabulary[config.theme].foe[4]!, hp: 32, maxHp: 32, atk: 7 })
    return { tiles, items, enemies, start, stairs, generator: cave ? 'cellular-cave' : 'rooms', seen: Array(W * H).fill(false) }
  })
}
