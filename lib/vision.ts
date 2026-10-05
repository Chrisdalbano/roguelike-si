import { H, W } from './dungeon'
import type { TileSprite } from './types'

// Symmetric supercover ray: both corner-adjacent walls block a diagonal peek.
export function lineOfSight(tiles: TileSprite[], x: number, y: number, tx: number, ty: number): boolean {
  const dx = tx - x, dy = ty - y, nx = Math.abs(dx), ny = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy)
  let ix = 0, iy = 0
  const blocks = (xx: number, yy: number) => tiles[yy * W + xx] === 'wall' || tiles[yy * W + xx] === 'door'
  while (ix < nx || iy < ny) {
    const a = (1 + 2 * ix) * ny, b = (1 + 2 * iy) * nx
    if (a === b) {
      if (blocks(x + sx, y) && blocks(x, y + sy)) return false
      x += sx; y += sy; ix++; iy++
    } else if (a < b) { x += sx; ix++ } else { y += sy; iy++ }
    if (x === tx && y === ty) return true
    if (blocks(x, y)) return false
  }
  return true
}
export function visibility(tiles: TileSprite[], x: number, y: number): boolean[] {
  return tiles.map((_, p) => {
    const tx = p % W, ty = Math.floor(p / W)
    return tx >= 0 && ty < H && (tx - x) ** 2 + (ty - y) ** 2 <= 64 && lineOfSight(tiles, x, y, tx, ty)
  })
}
