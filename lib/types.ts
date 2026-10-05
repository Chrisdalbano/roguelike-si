// roguelike.si — the contract between game logic (lib/) and the UI (app/).
// Logic is pure, deterministic and DOM-free. The UI only ever calls the
// functions listed at the bottom of this file, exported from lib/index.ts.

export type ThemeId = 'egypt' | 'zombie' | 'future' | 'steampunk' | 'medieval' | 'deepsea'

/** Four-colour 8-bit palette, darkest to lightest, plus one accent. Hex strings. */
export interface Palette {
  bg: string
  dark: string
  mid: string
  light: string
  accent: string
}

export interface ThemeDef {
  id: ThemeId
  name: string // "Tomb of the Sun King"-style era label, short
  blurb: string // one line
  palette: Palette
  /** Words in a prompt that select this theme ("pharaoh", "mummy", ...). */
  keywords: string[]
}

/** Everything needed to reproduce a run. Shareable as ?seed=...&theme=... */
export interface RunConfig {
  seed: string
  theme: ThemeId
  /** The prompt the player typed, if any. Display only. */
  prompt: string
}

export type Dir = 'n' | 's' | 'e' | 'w'

export type Action =
  | { type: 'move'; dir: Dir } // moving into an enemy attacks it
  | { type: 'wait' }
  | { type: 'use'; slot: number } // use inventory item
  | { type: 'descend' } // on stairs
  | { type: 'tick'; elapsedMs: number } // real time passing; drives the doom clock

/**
 * Sprite ids are semantic, theme-independent. The UI owns the pixel art and
 * maps (theme, sprite) to an 8x8 bitmap. Logic never knows about pixels.
 */
export type TileSprite = 'void' | 'floor' | 'wall' | 'door' | 'stairs' | 'hazard' | 'chest' | 'shrine'
export type ActorSprite = 'hero' | 'grunt' | 'brute' | 'ranged' | 'swarm' | 'boss'
export type ItemSprite = 'heal' | 'weapon' | 'armor' | 'bomb' | 'key' | 'relic' | 'time'

export interface Cell {
  tile: TileSprite
  /** Currently in line of sight. */
  visible: boolean
  /** Seen before (draw dimmed when not visible). */
  seen: boolean
  actor?: { sprite: ActorSprite; hp: number; maxHp: number; id: number }
  item?: ItemSprite
}

export interface InventorySlot {
  sprite: ItemSprite
  name: string // themed: "Canopic Jar", "Stim Pack"
  desc: string
}

/** A thing that happened this step, so the UI can animate it. */
export type GameEvent =
  | { type: 'move'; id: number; from: [number, number]; to: [number, number] }
  | { type: 'attack'; id: number; target: number; dmg: number; at: [number, number] }
  | { type: 'death'; id: number; at: [number, number] }
  | { type: 'pickup'; item: ItemSprite; at: [number, number] }
  | { type: 'descend'; floor: number }
  | { type: 'hurt'; dmg: number }
  | { type: 'heal'; amount: number }
  | { type: 'explode'; at: [number, number]; radius: number }

export interface RenderView {
  width: number
  height: number
  /** Row-major, length width*height. */
  cells: Cell[]
  hero: { x: number; y: number; hp: number; maxHp: number; atk: number; def: number }
  floor: number // 1-based
  floors: number // total floors in the run
  /** Doom clock. Run is designed to last ~5 minutes of real time. */
  timeLeftMs: number
  inventory: InventorySlot[]
  /** Newest last. Themed, procedurally written. */
  log: string[]
  /** Events produced by the most recent step(), for animation. */
  events: GameEvent[]
  status: 'playing' | 'won' | 'dead' | 'timeout'
  score: number
  turns: number
}

/** Opaque to the UI. Must be plain JSON-serialisable data. */
export interface GameState {
  readonly __brand: 'GameState'
}

export interface RunSummary {
  config: RunConfig
  status: RenderView['status']
  score: number
  floor: number
  turns: number
  kills: number
  /** Two or three procedurally written sentences: how the run ended. */
  epitaph: string
  /** Compact text block for sharing on X (emoji-free, under 240 chars, includes the URL). */
  shareText: string
}

// ---- Functions lib/index.ts must export -----------------------------------
//
// THEMES: Record<ThemeId, ThemeDef>
// RUN_MS: number                                   // 300_000
// createRun(prompt: string, now?: Date): RunConfig // prompt -> seed + theme (keyword match; empty prompt = random from now)
// dailyRun(date: Date): RunConfig                  // same dungeon for everyone that UTC day
// newGame(config: RunConfig): GameState
// step(state: GameState, action: Action): GameState // pure; returns a new state
// view(state: GameState): RenderView
// intro(config: RunConfig): { title: string; lines: string[] } // procedural 2-4 line premise
// summary(state: GameState): RunSummary
// dungeonJSON(config: RunConfig): unknown          // full generated dungeon as JSON, for the public /api output
