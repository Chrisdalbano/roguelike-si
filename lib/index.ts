export type * from './types'
export { THEMES } from './themes'
export { createRun, dailyRun, intro } from './narrative'
export { RUN_MS, newGame, step, view, summary } from './engine'
import type { RunConfig, TileSprite } from './types'
import { generate, H, W } from './dungeon'
import { intro } from './narrative'

export function dungeonJSON(config: RunConfig): unknown {
  const legend: Record<TileSprite, string> = { void: ' ', floor: '.', wall: '#', door: '+', stairs: '>', hazard: '^', chest: '$', shrine: '*' }
  return { config: { ...config }, theme: config.theme, width: W, height: H, legend, intro: intro(config), floors: generate(config).map((f, i) => ({
    floor: i + 1, generator: f.generator, rows: Array.from({ length: H }, (_, y) => f.tiles.slice(y * W, (y + 1) * W).map(t => legend[t]).join('')),
    start: { x: f.start % W, y: Math.floor(f.start / W) }, stairs: { x: f.stairs % W, y: Math.floor(f.stairs / W) }, enemies: f.enemies, items: f.items,
  })) }
}
