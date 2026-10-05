// Builds public/og.png (1200x630), favicons and the touch icon from the game's
// own sprites. No dependencies: a tiny RGBA raster plus a hand-rolled PNG writer.
// Run: node --experimental-strip-types tools/og-image.ts
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { THEMES } from '../lib/themes.ts'
import { actorSprite, colour, eachTextPixel, itemSprite, tileSprite, type Px } from '../app/game/sprites.ts'
import type { Palette, ThemeId } from '../lib/types.ts'

const NIGHT = '#111310', BONE = '#f1eee5', MUTED = '#9da493', ORANGE = '#ff9858'

class Raster {
  data: Uint8Array; w: number; h: number
  constructor(w: number, h: number, bg: string) {
    this.w = w; this.h = h
    this.data = new Uint8Array(w * h * 4)
    this.rect(0, 0, w, h, bg)
  }
  rect(x: number, y: number, w: number, h: number, hex: string) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
        const o = (yy * this.w + xx) * 4
        this.data[o] = r!; this.data[o + 1] = g!; this.data[o + 2] = b!; this.data[o + 3] = 255
      }
  }
  sprite(px: Px, pal: Palette, x: number, y: number, k: number) {
    px.forEach((row, yy) => [...row].forEach((ch, xx) => { const c = colour(ch, pal); if (c) this.rect(x + xx * k, y + yy * k, k, k, c) }))
  }
  text(s: string, x: number, y: number, k: number, hex: string) { eachTextPixel(s, (xx, yy) => this.rect(x + xx * k, y + yy * k, k, k, hex)) }
  png(): Buffer {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h)
    for (let y = 0; y < this.h; y++) { raw[y * (this.w * 4 + 1)] = 0; Buffer.from(this.data.buffer, y * this.w * 4, this.w * 4).copy(raw, y * (this.w * 4 + 1) + 1) }
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(body.length)
      const tb = Buffer.concat([Buffer.from(type), body]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb))
      return Buffer.concat([len, tb, crc])
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = 6
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
  }
}
const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
function crc32(b: Buffer) { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

// ---- OG image ----------------------------------------------------------------
const og = new Raster(1200, 630, NIGHT)
og.text('ROGUELIKE', 60, 56, 12, BONE)
og.text('.SI', 60 + 9 * 48, 56, 12, ORANGE)
og.text('TYPE A PROMPT. GET A DUNGEON.', 62, 150, 5, BONE)
og.text('FIVE MINUTES. FOUR FLOORS. ONE BOSS.', 62, 190, 5, MUTED)
const ids = Object.keys(THEMES) as ThemeId[]
const k = 5, cell = 8 * k, pw = 4 * cell, gap = (1200 - 80 - 6 * pw) / 5
ids.forEach((id, i) => {
  const pal = THEMES[id].palette, x0 = 40 + i * (pw + gap), y0 = 262
  og.rect(x0, y0, pw, 5 * cell, pal.bg)
  const at = (cx: number, cy: number, px: Px) => og.sprite(px, pal, x0 + cx * cell, y0 + cy * cell, k)
  for (let cx = 0; cx < 4; cx++) {
    at(cx, 0, tileSprite(id, 'wall', cx === 2 ? 'alt' : 'face'))
    for (let cy = 1; cy < 4; cy++) at(cx, cy, tileSprite(id, 'floor', (cx + cy) % 5 === 0 ? 'alt' : 'plain'))
    at(cx, 4, tileSprite(id, 'wall', 'face'))
  }
  at(3, 3, tileSprite(id, 'shrine'))
  at(1, 1, actorSprite(id, 'hero'))
  at(3, 1, actorSprite(id, 'grunt'))
  at(0, 2, itemSprite(['relic', 'bomb', 'heal', 'key', 'weapon', 'time'][i] as 'relic'))
  at(2, 3, actorSprite(id, 'boss'))
  at(0, 3, actorSprite(id, ['swarm', 'ranged', 'brute', 'swarm', 'ranged', 'brute'][i] as 'swarm'))
})
og.text("MADE BY CHRIS D'ALBANO", 62, 580, 3, MUTED)
og.text('PLAY FREE IN THE BROWSER', 1200 - 62 - (24 * 4 - 1) * 3, 580, 3, ORANGE)
writeFileSync('public/og.png', og.png())

// ---- icons -------------------------------------------------------------------
const hero = actorSprite('egypt', 'hero'), pal = { ...THEMES.egypt.palette, bg: NIGHT }
const fav = new Raster(32, 32, NIGHT); fav.sprite(hero, pal, 0, 0, 4); writeFileSync('public/favicon-32.png', fav.png())
const touch = new Raster(180, 180, NIGHT); touch.sprite(hero, pal, 26, 26, 16); writeFileSync('public/apple-touch-icon.png', touch.png())
const rects: string[] = []
hero.forEach((row, y) => [...row].forEach((ch, x) => { const c = colour(ch, pal); if (c) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`) }))
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${NIGHT}"/>${rects.join('')}</svg>\n`)
console.log('wrote public/og.png, favicon.svg, favicon-32.png, apple-touch-icon.png')
