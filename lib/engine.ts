import type { Action, GameEvent, GameState, InventorySlot, ItemSprite, RenderView, RunConfig, RunSummary } from './types'
import { distances, generate, H, neighbors, W, walkable, type Enemy, type Floor } from './dungeon'
import { descriptions, itemTypes, vocabulary } from './themes'
import { intro } from './narrative'
import { lineOfSight, visibility } from './vision'

export const RUN_MS = 300_000
export interface State extends GameState {
  config: RunConfig; floors: Floor[]; floor: number; hero: RenderView['hero']; inventory: InventorySlot[]
  timeLeftMs: number; turns: number; status: RenderView['status']; score: number; kills: number
  log: string[]; events: GameEvent[]; cause: string; curse: number; noise: number; oxygen: number
}
const state = (s: GameState) => s as State
const current = (s: State) => s.floors[s.floor - 1]!
const pos = (s: State) => s.hero.y * W + s.hero.x
const say = (s: State, line: string) => { s.log.push(line); if (s.log.length > 60) s.log.shift() }
function reveal(s: State) {
  const f = current(s), visible = visibility(f.tiles, s.hero.x, s.hero.y)
  f.seen = f.seen.map((seen, p) => seen || visible[p]!)
}
function slot(s: State, sprite: ItemSprite): InventorySlot {
  const i = itemTypes.indexOf(sprite)
  return { sprite, name: vocabulary[s.config.theme].items[i]!, desc: descriptions[i]! }
}
export function newGame(config: RunConfig): GameState {
  const floors = generate(config), start = floors[0]!.start
  const s: State = {
    __brand: 'GameState', config: { ...config }, floors, floor: 1,
    hero: { x: start % W, y: Math.floor(start / W), hp: 38, maxHp: 38, atk: 5, def: 1 },
    inventory: [], timeLeftMs: RUN_MS, turns: 0, status: 'playing', score: 0, kills: 0,
    log: intro(config).lines, events: [], cause: '', curse: 0, noise: 0, oxygen: 70,
  }
  s.inventory = [slot(s, 'heal'), slot(s, 'bomb'), slot(s, 'key')]
  say(s, {
    egypt: 'Opening chests raises your curse. Shrines cleanse it.',
    zombie: 'Combat makes noise; the horde hears you. Quiet turns let it fade.',
    future: 'Blue doors consume a Power Cell. Without one, force the lock for 3 HP.',
    steampunk: 'Vents fire every third turn. Watch your footing.',
    medieval: 'Shrines trade 5 HP for 1 attack. Bump one to accept.',
    deepsea: 'Oxygen: 70. Each turn costs air. Shrines refill your tank.',
  }[config.theme])
  reveal(s); return s
}
function hurt(s: State, amount: number, cause: string) {
  if (s.status !== 'playing') return
  s.hero.hp = Math.max(0, s.hero.hp - amount); s.events.push({ type: 'hurt', dmg: amount })
  if (!s.hero.hp) { s.status = 'dead'; s.cause = cause; s.events.push({ type: 'death', id: 0, at: [s.hero.x, s.hero.y] }); say(s, `${cause} claims you.`) }
}
function damage(s: State, enemy: Enemy, amount: number) {
  enemy.hp -= amount
  s.events.push({ type: 'attack', id: 0, target: enemy.id, dmg: amount, at: [enemy.x, enemy.y] })
  if (enemy.hp <= 0) {
    s.kills++; s.score += enemy.sprite === 'boss' ? 500 : 25
    s.events.push({ type: 'death', id: enemy.id, at: [enemy.x, enemy.y] })
    say(s, `${enemy.name} falls in the ${vocabulary[s.config.theme].place[s.kills % 3]}.`)
    current(s).enemies = current(s).enemies.filter(e => e.id !== enemy.id)
    if (enemy.sprite === 'boss') { s.status = 'won'; say(s, 'The way home opens. You live.') }
  }
}
function heal(s: State, amount: number) {
  const actual = Math.min(s.hero.maxHp - s.hero.hp, amount)
  s.hero.hp += actual; s.events.push({ type: 'heal', amount: actual })
}
function pickup(s: State) {
  const f = current(s), i = f.items.findIndex(i => i.x === s.hero.x && i.y === s.hero.y)
  if (i < 0) return
  const item = f.items.splice(i, 1)[0]!
  s.events.push({ type: 'pickup', item: item.sprite, at: [item.x, item.y] })
  if (item.sprite === 'relic') s.score += 100
  else s.inventory.push(slot(s, item.sprite))
  say(s, `Recovered ${slot(s, item.sprite).name}.`)
}
function moveHero(s: State, x: number, y: number) {
  s.events.push({ type: 'move', id: 0, from: [s.hero.x, s.hero.y], to: [x, y] })
  s.hero.x = x; s.hero.y = y; pickup(s)
}
function enemies(s: State) {
  const f = current(s), d = distances(f.tiles, pos(s))
  for (const e of [...f.enemies]) {
    if (s.status !== 'playing') break
    const p = e.y * W + e.x, distance = d[p]!, manhattan = Math.abs(e.x - s.hero.x) + Math.abs(e.y - s.hero.y)
    if (distance < 0 || distance > (s.config.theme === 'zombie' ? 7 + s.noise : 8)) continue
    if (e.sprite === 'brute' && s.turns % 2) continue
    if (e.sprite === 'boss' && s.turns % 3 === 1) { say(s, `${e.name} gathers power. Move away!`); continue }
    const sight = lineOfSight(f.tiles, e.x, e.y, s.hero.x, s.hero.y)
    const ranged = e.sprite === 'ranged' && manhattan <= 5 && sight && s.turns % 2 === 0
    const pulse = e.sprite === 'boss' && s.turns % 3 === 2 && manhattan <= 2 && sight
    if (manhattan === 1 || ranged || pulse) {
      const dmg = Math.max(1, e.atk + (pulse ? 2 : 0) - s.hero.def)
      s.events.push({ type: 'attack', id: e.id, target: 0, dmg, at: [s.hero.x, s.hero.y] })
      hurt(s, dmg, e.name); continue
    }
    const candidates = neighbors(p).filter(n => walkable(f.tiles[n]) && f.tiles[n] !== 'door' && n !== pos(s) && !f.enemies.some(other => other.x === n % W && other.y === Math.floor(n / W)))
    const retreat = e.sprite === 'ranged' && manhattan < 3
    candidates.sort((a, b) => retreat ? d[b]! - d[a]! : d[a]! - d[b]!)
    const n = candidates.find(n => d[n]! >= 0 && (retreat ? d[n]! > distance : d[n]! < distance))
    if (n !== undefined) {
      const from: [number, number] = [e.x, e.y]; e.x = n % W; e.y = Math.floor(n / W)
      s.events.push({ type: 'move', id: e.id, from, to: [e.x, e.y] })
    }
  }
}
function environment(s: State) {
  if (s.status !== 'playing') return
  const theme = s.config.theme, tile = current(s).tiles[pos(s)]
  if (tile === 'hazard' && (theme !== 'steampunk' || s.turns % 3 === 0)) { say(s, theme === 'steampunk' ? 'The pressure vent erupts!' : 'The ground bites back.'); hurt(s, 3, theme === 'steampunk' ? 'a pressure vent' : 'a hidden hazard') }
  if (theme === 'egypt' && s.curse >= 2 && s.turns % 6 === 0) { say(s, `Curse ${s.curse}: the sun takes its due.`); hurt(s, s.curse, 'the sun curse') }
  if (theme === 'zombie') { s.noise = Math.max(0, s.noise - 1); if (s.turns % 8 === 0) say(s, `Noise: ${s.noise}. ${s.noise ? 'They are listening.' : 'Only your breath.'}`) }
  if (theme === 'deepsea') {
    s.oxygen = Math.max(0, s.oxygen - 1)
    if (s.oxygen % 10 === 0) say(s, `Oxygen: ${s.oxygen}. Find a shrine to refill.`)
    if (!s.oxygen) hurt(s, 2, 'the airless abyss')
  }
}
export function step(input: GameState, action: Action): GameState {
  const s = JSON.parse(JSON.stringify(input)) as State
  s.events = []
  if (s.status !== 'playing') return s
  if (action.type === 'tick') {
    if (Number.isFinite(action.elapsedMs) && action.elapsedMs > 0) s.timeLeftMs = Math.max(0, s.timeLeftMs - action.elapsedMs)
    if (!s.timeLeftMs) { s.status = 'timeout'; s.cause = 'the doom clock'; say(s, 'The last second burns away.') }
    return s
  }
  const f = current(s)
  if (action.type === 'move') {
    const [dx, dy] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[action.dir]!
    const x = s.hero.x + dx!, y = s.hero.y + dy!, p = y * W + x
    if (x < 0 || x >= W || y < 0 || y >= H || !walkable(f.tiles[p])) return s
    const enemy = f.enemies.find(e => e.x === x && e.y === y)
    if (enemy) { damage(s, enemy, s.hero.atk); s.noise = Math.min(18, s.noise + 5) }
    else if (f.tiles[p] === 'chest') {
      const key = s.inventory.findIndex(i => i.sprite === 'key')
      if (key < 0) { say(s, 'You pass the locked chest. A key is needed to open it.'); moveHero(s, x, y) }
      else {
        s.inventory.splice(key, 1); f.tiles[p] = 'floor'; s.score += 100
        s.inventory.push(slot(s, 'heal')); say(s, 'The chest yields a remedy and treasure.')
        if (s.config.theme === 'egypt') { s.curse++; say(s, `Curse: ${s.curse}. The sealed dead remember.`) }
      }
    } else if (f.tiles[p] === 'door') {
      if (s.config.theme === 'future') {
        const key = s.inventory.findIndex(i => i.sprite === 'key')
        if (key >= 0) { s.inventory.splice(key, 1); say(s, 'Power Cell consumed. Door online.') }
        else { hurt(s, 3, 'a powered lock'); say(s, 'No Power Cell. You force the circuit: -3 HP.') }
      }
      f.tiles[p] = 'floor'
    } else if (f.tiles[p] === 'shrine') {
      if (s.config.theme === 'medieval') {
        if (s.hero.hp <= 5) { say(s, 'The shrine refuses your last breath. You pass safely.'); moveHero(s, x, y) }
        else { hurt(s, 5, 'a blood oath'); s.hero.atk++; say(s, 'Blood oath: -5 HP, +1 attack.'); f.tiles[p] = 'floor' }
      } else if (s.config.theme === 'deepsea') { s.oxygen = 71; heal(s, 5); say(s, 'Shrine: oxygen refilled to 70.') }
      else { heal(s, 8); s.curse = 0; say(s, 'A quiet blessing restores you. Curse: 0.') }
      if (s.config.theme !== 'medieval') f.tiles[p] = 'floor'
    } else {
      moveHero(s, x, y)
    }
  } else if (action.type === 'use') {
    if (!Number.isInteger(action.slot)) return s
    const item = s.inventory[action.slot]
    if (!item || item.sprite === 'key') return s
    s.inventory.splice(action.slot, 1); say(s, `Used ${item.name}.`)
    if (item.sprite === 'heal') heal(s, 14)
    if (item.sprite === 'weapon') s.hero.atk += 2
    if (item.sprite === 'armor') s.hero.def++
    if (item.sprite === 'time') s.timeLeftMs += 20_000
    if (item.sprite === 'relic') s.score += 100
    if (item.sprite === 'bomb') {
      s.events.push({ type: 'explode', at: [s.hero.x, s.hero.y], radius: 3 }); s.noise = 18
      for (const e of [...f.enemies]) if (Math.abs(e.x - s.hero.x) + Math.abs(e.y - s.hero.y) <= 3) damage(s, e, 16)
    }
  } else if (action.type === 'descend') {
    if (pos(s) !== f.stairs || s.floor === 4) return s
    s.floor++; const start = current(s).start; s.hero.x = start % W; s.hero.y = Math.floor(start / W)
    s.score += 100; s.oxygen = 71; heal(s, 10)
    s.events.push({ type: 'descend', floor: s.floor }); say(s, `Floor ${s.floor}: ${vocabulary[s.config.theme].place[(s.floor - 1) % 3]}.`)
    s.turns++; reveal(s); return s
  }
  s.turns++
  if (s.status === 'playing') { environment(s); enemies(s) }
  reveal(s); return s
}
export function view(input: GameState): RenderView {
  const s = state(input), f = current(s), visible = visibility(f.tiles, s.hero.x, s.hero.y)
  const cells: RenderView['cells'] = f.tiles.map((tile, p) => ({ tile: f.seen[p] ? tile : 'void', seen: f.seen[p]!, visible: visible[p]! }))
  for (const e of f.enemies) if (visible[e.y * W + e.x]) cells[e.y * W + e.x]!.actor = { sprite: e.sprite, hp: e.hp, maxHp: e.maxHp, id: e.id }
  for (const i of f.items) if (visible[i.y * W + i.x]) cells[i.y * W + i.x]!.item = i.sprite
  cells[pos(s)]!.actor = { sprite: 'hero', id: 0, hp: s.hero.hp, maxHp: s.hero.maxHp }
  return { width: W, height: H, cells, hero: { ...s.hero }, floor: s.floor, floors: 4, timeLeftMs: s.timeLeftMs, inventory: s.inventory.map(i => ({ ...i })), log: [...s.log], events: JSON.parse(JSON.stringify(s.events)), status: s.status, score: s.score, turns: s.turns }
}
export function summary(input: GameState): RunSummary {
  const s = state(input), seconds = Math.ceil(s.timeLeftMs / 1000)
  const ending = s.status === 'won' ? `You silenced ${vocabulary[s.config.theme].foe[4]} and returned alive` : s.status === 'playing' ? 'Your story is still being written' : `You were claimed by ${s.cause || 'the darkness'}`
  const url = `https://roguelike.si/?seed=${encodeURIComponent(s.config.seed)}&theme=${encodeURIComponent(s.config.theme)}`
  const caption = `${s.status.toUpperCase()} | Floor ${s.floor}/4 | ${s.kills} kills | ${s.score} points. `
  return { config: { ...s.config }, status: s.status, score: s.score, floor: s.floor, turns: s.turns, kills: s.kills,
    epitaph: `${ending} on floor ${s.floor}. ${s.kills} foes fell in ${s.turns} turns; ${seconds} seconds remained. The ${vocabulary[s.config.theme].place[s.floor % 3]} remembers.`,
    shareText: caption.slice(0, Math.max(0, 239 - url.length)) + url }
}
