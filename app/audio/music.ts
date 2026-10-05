// Procedural chiptune: compose() is pure (seed + theme -> note data, no audio),
// MusicPlayer schedules it on AudioContext time with a lookahead loop.
import type { ThemeId } from '../../lib/types'
import { random } from '../../lib/random'
import { audio, midiHz, type Wave } from './engine'

export type Level = 'thin' | 'full' | 'tense'
type BassStyle = 'pedal' | 'offbeat' | 'pump' | 'oompah' | 'drone' | 'whole'
type DrumKit = 'tomb' | 'sparse' | 'four' | 'clock' | 'tabor' | 'swell'
export type Voice = 'lead' | 'bass' | 'arp' | 'drone' | 'rise'
export type Drum = 'kick' | 'snare' | 'hat' | 'tom' | 'shaker' | 'tick' | 'tock'

export interface Style {
  scale: number[] // semitones from root, ascending, within one octave
  root: number // bass-register MIDI note
  bpm: number
  swing: number // 0.5 = straight
  lead: Wave
  bass: Wave
  arp: Wave | null
  density: number // chance a beat in the melody carries notes
  detune: number // cents, lead only
  vibrato: number // cents
  echo: { beats: number; feedback: number; send: number }
  bassStyle: BassStyle
  drums: DrumKit
  drone: boolean
  bars: 4 | 8
  progressions: number[][] // scale degrees, one per bar (4 long)
}

/** Per-era sound. Degrees index into `scale`; 0 is the tonic. */
export const STYLES: Record<ThemeId, Style> = {
  // Phrygian dominant, slow and hollow: square lead with a slow vibrato over a pedal.
  egypt: { scale: [0, 1, 4, 5, 7, 8, 10], root: 38, bpm: 76, swing: 0.5, lead: 'square', bass: 'triangle', arp: null, density: 0.55, detune: 0, vibrato: 18, echo: { beats: 0.75, feedback: 0.32, send: 0.25 }, bassStyle: 'pedal', drums: 'tomb', drone: true, bars: 8, progressions: [[0, 1, 0, 6], [0, 6, 1, 0], [0, 3, 1, 0]] },
  // Natural minor, sparse, detuned pulse that never quite agrees with itself.
  zombie: { scale: [0, 2, 3, 5, 7, 8, 10], root: 45, bpm: 84, swing: 0.5, lead: 'pulse25', bass: 'triangle', arp: null, density: 0.38, detune: 22, vibrato: 0, echo: { beats: 1.5, feedback: 0.28, send: 0.3 }, bassStyle: 'offbeat', drums: 'sparse', drone: false, bars: 8, progressions: [[0, 5, 3, 4], [0, 3, 5, 4], [0, 5, 6, 4]] },
  // Lydian, bright and fast, 16th-note arpeggios over a pumping bass.
  future: { scale: [0, 2, 4, 6, 7, 9, 11], root: 40, bpm: 138, swing: 0.5, lead: 'pulse25', bass: 'square', arp: 'pulse12', density: 0.45, detune: 0, vibrato: 6, echo: { beats: 0.75, feedback: 0.25, send: 0.18 }, bassStyle: 'pump', drums: 'four', drone: false, bars: 8, progressions: [[0, 1, 5, 4], [0, 5, 1, 4], [0, 4, 5, 1]] },
  // Mixolydian, swung, oom-pah bass and a tick-tock clockwork kit.
  steampunk: { scale: [0, 2, 4, 5, 7, 9, 10], root: 43, bpm: 104, swing: 0.64, lead: 'pulse25', bass: 'square', arp: 'pulse12', density: 0.6, detune: 0, vibrato: 0, echo: { beats: 0.5, feedback: 0.2, send: 0.12 }, bassStyle: 'oompah', drums: 'clock', drone: false, bars: 8, progressions: [[0, 6, 3, 0], [0, 3, 6, 4], [0, 6, 0, 4]] },
  // Dorian over an open-fifth drone, hand-drum kit.
  medieval: { scale: [0, 2, 3, 5, 7, 9, 10], root: 38, bpm: 96, swing: 0.5, lead: 'pulse25', bass: 'triangle', arp: null, density: 0.62, detune: 0, vibrato: 10, echo: { beats: 0.75, feedback: 0.25, send: 0.2 }, bassStyle: 'drone', drums: 'tabor', drone: true, bars: 8, progressions: [[0, 3, 0, 6], [0, 6, 3, 0], [0, 3, 6, 4]] },
  // Aeolian, slow, lots of space: soft triangle with a long echo.
  deepsea: { scale: [0, 2, 3, 5, 7, 8, 10], root: 41, bpm: 66, swing: 0.5, lead: 'triangle', bass: 'triangle', arp: null, density: 0.32, detune: 0, vibrato: 8, echo: { beats: 1.5, feedback: 0.48, send: 0.5 }, bassStyle: 'whole', drums: 'swell', drone: true, bars: 4, progressions: [[0, 5, 3, 6], [0, 3, 5, 4], [0, 6, 5, 3]] },
}

export interface Note { step: number; midi: number; len: number; vel: number; voice: Voice }
export interface Hit { step: number; drum: Drum; vel: number }
export interface Song {
  id: string
  theme: ThemeId
  style: Style
  bpm: number
  steps: number // loop length in 16ths
  root: number
  chords: number[] // degree per bar
  notes: Note[]
  drums: Hit[]
}

const BAR = 16
const pick = <T>(rng: () => number, a: readonly T[]) => a[Math.floor(rng() * a.length)]!

/** MIDI note for scale degree `d` (any integer) above `root`. */
export function degreeMidi(style: Style, root: number, d: number) {
  const n = style.scale.length, oct = Math.floor(d / n)
  return root + 12 * oct + style.scale[((d % n) + n) % n]!
}

export function compose(seed: string, theme: ThemeId): Song {
  const style = STYLES[theme]
  const rng = random(`${seed}:${theme}:music`)
  const root = style.root + pick(rng, [-2, -1, 0, 0, 1, 2])
  const bpm = Math.round(style.bpm * (0.96 + rng() * 0.08))
  const bars = style.bars, steps = bars * BAR
  const prog = pick(rng, style.progressions)
  // 8 bars: the progression twice; half the time the last bar turns to the fifth so the loop pulls back to the top.
  const chords = Array.from({ length: bars }, (_, b) => prog[b % 4]!)
  if (bars === 8) chords[7] = rng() < 0.5 ? 4 % style.scale.length : chords[7]!
  const notes: Note[] = []
  const add = (voice: Voice, step: number, midi: number, len: number, vel: number) => notes.push({ voice, step, midi, len, vel })
  const n = style.scale.length
  // Lead register: the root's pitch class placed in MIDI 57-68, so every era sings in the same range.
  const leadRoot = root + 12 * Math.ceil((57 - root) / 12)
  // Bass never climbs more than a ninth above the root.
  const low = (m: number) => (m > root + 14 ? m - 12 : m)

  // ---- bass -------------------------------------------------------------
  for (let b = 0; b < bars; b++) {
    const s = b * BAR, d = chords[b]!, r = low(degreeMidi(style, root, d)), fifth = low(degreeMidi(style, root, d + 4))
    switch (style.bassStyle) {
      case 'pedal': add('bass', s, r, 6, 1); add('bass', s + 8, r, 4, 0.8); add('bass', s + 14, low(degreeMidi(style, root, d - 1)), 2, 0.6); break
      case 'offbeat': add('bass', s, r, 4, 1); if (rng() < 0.6) add('bass', s + 6, r, 2, 0.7); add('bass', s + 10, rng() < 0.5 ? fifth : r, 3, 0.75); break
      case 'pump': for (let i = 0; i < 8; i++) add('bass', s + i * 2, i % 2 ? r + 12 : r, 1, i % 2 ? 0.7 : 1); break
      case 'oompah': add('bass', s, r, 3, 1); add('bass', s + 8, fifth > r ? fifth - 12 : fifth, 3, 0.85); break
      case 'drone': add('bass', s, r, 16, 0.9); break
      case 'whole': add('bass', s, b % 2 && rng() < 0.5 ? fifth : r, 16, 0.9); break
    }
  }
  // ---- drone (open fifth, held for the bar) ---------------------------------
  if (style.drone) for (let b = 0; b < bars; b++) {
    add('drone', b * BAR, root + 12, BAR, 0.8); add('drone', b * BAR, root + 19, BAR, 0.6)
  }
  // ---- arpeggio ----------------------------------------------------------
  if (style.arp) {
    const shape = pick(rng, [[0, 2, 4, 7], [0, 4, 2, 4], [0, 2, 4, 2], [4, 2, 0, 2]])
    const rate = style.bassStyle === 'oompah' ? 4 : 1 // steampunk: chord stabs on the off-beats
    for (let b = 0; b < bars; b++) {
      const d = chords[b]!
      if (rate === 4) { for (const k of [4, 12]) for (const t of [0, 2, 4]) add('arp', b * BAR + k, degreeMidi(style, leadRoot - 12, d + t), 2, 0.7); continue }
      for (let i = 0; i < BAR; i++) add('arp', b * BAR + i, degreeMidi(style, leadRoot, d + shape[i % 4]! - (i >= 8 && d >= 3 ? n : 0)), 1, i % 4 ? 0.65 : 1)
    }
  }
  // ---- lead melody: phrases A A' B A'' -------------------------------------
  const lo = 0, hi = n + 4 // about an octave and a half above the lead root
  const isChordTone = (deg: number, chord: number) => [0, 2, 4].includes((((deg - chord) % n) + n) % n)
  const nearestChordTone = (deg: number, chord: number) => {
    for (const off of [0, -1, 1, -2, 2]) if (isChordTone(deg + off, chord) && deg + off >= lo && deg + off <= hi) return deg + off
    return chord
  }
  const cells = [[4], [2, 2], [3, 1], [1, 1, 2], [2, 1, 1], [0], [8]] // 16ths per note; [0] = rest beat
  function phrase(barIdx: number[], start: number, endOnTonic: boolean) {
    const out: { step: number; deg: number; len: number }[] = []
    let deg = start, last = 0
    for (let k = 0; k < barIdx.length; k++) {
      const chord = chords[barIdx[k]!]!
      for (let beat = 0; beat < 4; beat++) {
        const at = k * BAR + beat * 4
        if (out.length && out[out.length - 1]!.step + out[out.length - 1]!.len > at) continue // a held note covers this beat
        const finalBeat = k === barIdx.length - 1 && beat >= 2
        if (finalBeat && beat === 3) continue
        if (finalBeat) {
          deg = endOnTonic ? (deg > n / 2 + 2 ? n : 0) : nearestChordTone(deg, chord)
          out.push({ step: at, deg, len: 8 }); continue
        }
        if (rng() > style.density && beat !== 0) continue
        const cell = beat === 3 ? pick(rng, cells.slice(0, 5)) : pick(rng, cells)
        if (cell[0] === 0) continue
        let t = at
        for (const len of cell) {
          const r = rng()
          if (Math.abs(last) >= 2) deg -= Math.sign(last) // step back after a leap
          else if (r < 0.62) deg += rng() < 0.5 ? 1 : -1
          else if (r < 0.72) { /* repeat */ }
          else deg += (rng() < 0.5 ? 1 : -1) * (2 + Math.floor(rng() * 3))
          if (deg < lo) deg = lo + 1 // bounce off the range edges
          else if (deg > hi) deg = hi - 1
          if (t % 8 === 0) deg = nearestChordTone(deg, chord) // strong beats land on chord tones
          last = out.length ? deg - out[out.length - 1]!.deg : 0
          out.push({ step: t, deg, len })
          t += len
        }
      }
    }
    return out
  }
  const pair = (i: number) => [i * 2 % bars, (i * 2 + 1) % bars]
  const startDeg = pick(rng, [2, 4, n])
  const A = phrase(pair(0), startDeg, false)
  const phrases = bars === 8
    ? [A, [...A.filter(x => x.step < BAR), ...phrase(pair(1), A.at(-1)!.deg, false).filter(x => x.step >= BAR)], phrase(pair(2), 4, false), [...A.filter(x => x.step < BAR), ...phrase(pair(3), A.at(-1)!.deg, true).filter(x => x.step >= BAR)]]
    : [A, [...A.filter(x => x.step < BAR), ...phrase(pair(1), A.at(-1)!.deg, true).filter(x => x.step >= BAR)]]
  phrases.forEach((p, i) => {
    for (const x of p) {
      const chord = chords[(i * 2 + Math.floor(x.step / BAR)) % bars]!
      // Keep borrowed phrase-A notes consonant when the chord under them changed.
      const deg = x.step % 8 === 0 && !isChordTone(x.deg, chord) ? nearestChordTone(x.deg, chord) : x.deg
      add('lead', i * 2 * BAR + x.step, degreeMidi(style, leadRoot, deg), x.len, x.step % 4 === 0 ? 1 : 0.8)
    }
  })
  // ---- rising line, only heard in the tense variation ------------------------
  for (let b = 0; b < bars; b++) for (let q = 0; q < 4; q++) add('rise', b * BAR + q * 4, degreeMidi(style, leadRoot, chords[b]! + q + (b % 2) * 2), 3, 0.5 + q * 0.15)

  // ---- percussion -----------------------------------------------------------
  const drums: Hit[] = []
  const hit = (step: number, drum: Drum, vel: number) => drums.push({ step, drum, vel })
  for (let b = 0; b < bars; b++) {
    const s = b * BAR
    switch (style.drums) {
      case 'tomb': hit(s, 'tom', 1); hit(s + 10, 'tom', 0.6); hit(s + 4, 'shaker', 0.5); hit(s + 12, 'shaker', 0.5); break
      case 'sparse': hit(s, 'kick', 0.9); if (b % 2) hit(s + 8, 'kick', 0.5); if (rng() < 0.5) hit(s + 12, 'hat', 0.4); if (b % 4 === 3) hit(s + 12, 'snare', 0.6); break
      case 'four': for (let i = 0; i < 4; i++) hit(s + i * 4, 'kick', 1); hit(s + 4, 'snare', 0.8); hit(s + 12, 'snare', 0.8); for (let i = 2; i < BAR; i += 4) hit(s + i, 'hat', 0.6); break
      case 'clock': for (let i = 0; i < BAR; i += 2) hit(s + i, i % 4 ? 'tock' : 'tick', 0.7); hit(s, 'kick', 0.9); hit(s + 8, 'kick', 0.6); hit(s + 12, 'snare', 0.7); break
      case 'tabor': hit(s, 'tom', 1); hit(s + 6, 'tom', 0.6); hit(s + 8, 'tom', 0.8); hit(s + 12, 'snare', 0.5); break
      case 'swell': if (b % 2 === 0) hit(s, 'shaker', 0.8); hit(s + 8, 'tom', 0.4); break
    }
  }
  return { id: `${seed}|${theme}`, theme, style, bpm, steps, root, chords, notes, drums }
}

// ---- playback ----------------------------------------------------------------

const VOICE_VOL: Record<Voice, number> = { lead: 0.085, bass: 0.13, arp: 0.035, drone: 0.03, rise: 0.04 }
/** Which layers each level plays (gain multipliers). */
const LEVELS: Record<Level, Partial<Record<Voice | 'drums', number>>> = {
  thin: { bass: 0.8, drone: 1, arp: 0.6 },
  full: { bass: 1, drone: 0.8, arp: 1, lead: 1, drums: 1 },
  tense: { bass: 1, drone: 0.6, arp: 1, lead: 1, drums: 1.1, rise: 1 },
}

export class MusicPlayer {
  song: Song | null = null
  level: Level = 'thin'
  private byStep: { notes: Note[]; drums: Hit[] }[] = []
  private step = 0
  private next = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private fade = 1
  private fadeAt = 0
  private fadeSecs = 1

  play(song: Song, level: Level) {
    this.level = level
    if (this.song?.id === song.id && this.timer) { this.fade = 1; return }
    this.song = song
    this.byStep = Array.from({ length: song.steps }, () => ({ notes: [], drums: [] }))
    for (const n of song.notes) this.byStep[n.step]!.notes.push(n)
    for (const d of song.drums) this.byStep[d.step]!.drums.push(d)
    this.step = 0; this.fade = 1
    audio.onReady(() => {
      audio.setEcho((60 / song.bpm) * song.style.echo.beats, song.style.echo.feedback)
      this.start()
    })
  }
  setLevel(level: Level) { this.level = level }
  /** Fade out over `secs` and stop. */
  stop(secs = 1) {
    if (!this.song) return
    this.fade = 0; this.fadeAt = audio.now() + secs; this.fadeSecs = Math.max(0.05, secs)
    if (!audio.running) this.halt()
  }
  private halt() { clearInterval(this.timer); this.timer = undefined; this.song = null }

  private start() {
    if (this.timer || !this.song) return
    this.next = audio.now() + 0.08
    this.timer = setInterval(() => this.pump(), 25)
  }
  private pump() {
    const song = this.song
    if (!song) return this.halt()
    if (!audio.running) return // suspended (hidden tab) or not unlocked: hold position
    const now = audio.now()
    if (this.fade === 0 && now >= this.fadeAt) return this.halt()
    if (this.next < now - 0.2) this.next = now + 0.05 // woke from a long stall: do not burst-schedule
    const tempo = song.bpm * (this.level === 'tense' ? 1.12 : 1)
    const dur = 60 / tempo / 4
    while (this.next < now + 0.12) {
      this.schedule(this.step, this.next, dur)
      this.next += dur
      this.step = (this.step + 1) % song.steps
    }
  }
  private schedule(step: number, t: number, dur: number) {
    const song = this.song!, style = song.style, mix = LEVELS[this.level]
    const fadeK = this.fade === 0 ? Math.max(0, (this.fadeAt - t) / this.fadeSecs) : 1
    if (fadeK <= 0) return
    // Swing delays the off-beat 8th: it lands at 2*swing of the beat's first half instead of halfway.
    const swing = step % 4 === 2 ? 2 * dur * (2 * style.swing - 1) : 0
    const at = t + swing
    for (const n of this.byStep[step]!.notes) {
      const k = mix[n.voice]
      if (!k) continue
      const vol = VOICE_VOL[n.voice] * n.vel * k * fadeK
      const len = n.len * dur
      const wave = n.voice === 'lead' || n.voice === 'rise' ? (n.voice === 'rise' ? 'pulse12' : style.lead) : n.voice === 'arp' ? style.arp! : n.voice === 'drone' ? 'pulse12' : style.bass
      audio.tone({
        bus: 'music', wave, freq: midiHz(n.midi), at, vol,
        dur: n.voice === 'arp' ? Math.min(len, 0.09) : Math.max(0.05, len * (n.voice === 'drone' ? 1.02 : 0.88)),
        attack: n.voice === 'drone' ? 0.25 : style.lead === 'triangle' && n.voice === 'lead' ? 0.03 : 0.006,
        detune: n.voice === 'lead' ? style.detune || undefined : undefined,
        vibrato: n.voice === 'lead' && style.vibrato && len > 0.25 ? { rate: 5.5, cents: style.vibrato } : undefined,
        echo: n.voice === 'lead' || n.voice === 'rise' ? style.echo.send : n.voice === 'arp' ? style.echo.send * 0.5 : 0,
      })
    }
    const dk = mix.drums
    if (!dk) return
    for (const h of this.byStep[step]!.drums) drum(h.drum, at, h.vel * dk * fadeK)
    if (this.level === 'tense' && step % 2 === 1) drum('hat', at, 0.35 * fadeK)
  }

  /** A short sting, for the first sight of the boss. Rides over the loop. */
  sting() {
    const song = this.song
    if (!song) return
    const s = song.style, t = audio.now() + 0.02, r = song.root + 12 * Math.ceil((57 - song.root) / 12)
    const bus = audio.settings.music ? 'music' as const : 'sfx' as const
    ;[0, 1, 0, 1].forEach((d, i) => audio.tone({ bus, wave: 'square', freq: midiHz(r + 12 + d), at: t + i * 0.07, dur: 0.08, vol: 0.07, echo: 0.3 }))
    audio.tone({ bus, wave: s.lead, freq: midiHz(degreeMidi(s, r, 4)), to: midiHz(degreeMidi(s, r, 0)), slide: 0.5, at: t + 0.3, dur: 0.7, vol: 0.08, echo: 0.4, vibrato: { rate: 7, cents: 25 } })
    audio.tone({ bus, wave: 'triangle', freq: midiHz(song.root), at: t + 0.3, dur: 0.8, vol: 0.16 })
  }
}

/** Noise-channel drum kit (plus a pitched triangle for kick/tom). */
export function drum(d: Drum, at: number, vel: number) {
  switch (d) {
    case 'kick': audio.tone({ bus: 'music', wave: 'triangle', freq: 150, to: 45, slide: 0.08, at, dur: 0.12, vol: 0.2 * vel }); break
    case 'tom': audio.tone({ bus: 'music', wave: 'triangle', freq: 120, to: 70, slide: 0.15, at, dur: 0.2, vol: 0.16 * vel }); break
    case 'snare': audio.noiseHit({ bus: 'music', crunch: true, type: 'bandpass', freq: 1800, q: 0.6, at, dur: 0.11, vol: 0.09 * vel }); break
    case 'hat': audio.noiseHit({ bus: 'music', type: 'highpass', freq: 7000, at, dur: 0.035, vol: 0.05 * vel }); break
    case 'shaker': audio.noiseHit({ bus: 'music', type: 'highpass', freq: 5000, at, dur: 0.14, attack: 0.05, vol: 0.04 * vel }); break
    case 'tick': audio.noiseHit({ bus: 'music', type: 'bandpass', freq: 3800, q: 6, at, dur: 0.025, vol: 0.09 * vel }); break
    case 'tock': audio.noiseHit({ bus: 'music', type: 'bandpass', freq: 2300, q: 6, at, dur: 0.025, vol: 0.08 * vel }); break
  }
}

/** Shared player: the title screen and the run hand it songs. */
export const music = new MusicPlayer()
