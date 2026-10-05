// Tiny Web Audio engine: one AudioContext, created on the first user gesture.
// Graph: music voices -> music bus -> duck -> master -> compressor -> out
//        sfx voices   -> sfx bus   ---------^
// Client-only: nothing here touches window/AudioContext until unlock().

export type Wave = 'square' | 'pulse25' | 'pulse12' | 'triangle' | 'saw'
export type Bus = 'sfx' | 'music'

export interface ToneOpts {
  wave: Wave
  freq: number
  /** Slide target (Hz), reached at `at + (slide ?? dur)`. */
  to?: number
  slide?: number
  at?: number
  dur: number
  vol: number
  attack?: number
  bus?: Bus
  /** Extra send into the music echo (0..1). */
  echo?: number
  /** Cents; plays a second, detuned copy when set. */
  detune?: number
  vibrato?: { rate: number; cents: number }
}
export interface NoiseOpts {
  at?: number
  dur: number
  vol: number
  type?: BiquadFilterType
  freq?: number
  to?: number
  q?: number
  /** Stepped 8-bit style noise instead of white. */
  crunch?: boolean
  attack?: number
  bus?: Bus
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12)

class Engine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private sfxBus!: GainNode
  private musicBus!: GainNode
  private duckGain!: GainNode
  private echoIn!: GainNode
  private echoDelay!: DelayNode
  private echoFeedback!: GainNode
  private waves = new Map<Wave, PeriodicWave>()
  private noise: Record<'white' | 'crunch', AudioBuffer> | null = null
  private ready: (() => void)[] = []
  settings = { sfx: true, music: true, volume: 0.6 }

  get running() { return !!this.ctx && this.ctx.state === 'running' }
  now() { return this.ctx?.currentTime ?? 0 }

  /** Call from a user gesture. Creates or resumes the context. */
  unlock() {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      try { this.ctx = new AC({ latencyHint: 'interactive' }) } catch { return }
      this.build()
      for (const fn of this.ready.splice(0)) fn()
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {})
  }
  onReady(fn: () => void) { if (this.ctx) fn(); else this.ready.push(fn) }

  suspend() { if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {}) }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {}) }

  private build() {
    const c = this.ctx!
    const comp = c.createDynamicsCompressor()
    // Close to a limiter: it should only touch peaks, never pump the mix.
    comp.threshold.value = -10; comp.knee.value = 4; comp.ratio.value = 16; comp.attack.value = 0.002; comp.release.value = 0.18
    this.master = c.createGain()
    this.duckGain = c.createGain()
    this.musicBus = c.createGain()
    this.sfxBus = c.createGain()
    this.musicBus.connect(this.duckGain).connect(this.master)
    this.sfxBus.connect(this.master)
    this.master.connect(comp).connect(c.destination)
    // Feedback echo for the music (and stings), darkened so repeats sit back.
    this.echoIn = c.createGain()
    this.echoDelay = c.createDelay(2)
    this.echoFeedback = c.createGain()
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2200
    this.echoIn.connect(this.echoDelay)
    this.echoDelay.connect(tone).connect(this.echoFeedback).connect(this.echoDelay)
    tone.connect(this.musicBus)
    this.setEcho(0.375, 0.3)
    this.apply(true)
  }

  /** Push settings to the bus gains (smoothly unless `now`). */
  apply(now = false) {
    if (!this.ctx) return
    const t = this.ctx.currentTime, k = now ? 0 : 0.05
    const set = (p: AudioParam, v: number) => (k ? p.setTargetAtTime(v, t, k) : p.setValueAtTime(v, t))
    // Perceptual-ish curve; 0.6 lands around -9 dB.
    set(this.master.gain, Math.min(1, this.settings.volume) ** 1.7 * 0.9)
    set(this.sfxBus.gain, this.settings.sfx ? 0.85 : 0)
    set(this.musicBus.gain, this.settings.music ? 0.55 : 0)
  }

  setEcho(time: number, feedback: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.echoDelay.delayTime.setTargetAtTime(Math.min(1.9, time), t, 0.05)
    this.echoFeedback.gain.setTargetAtTime(Math.min(0.6, feedback), t, 0.05)
  }

  /** Dip the music under a big sound effect. */
  duck(depth = 0.4, hold = 0.35) {
    if (!this.ctx || !this.settings.sfx) return
    const t = this.ctx.currentTime, g = this.duckGain.gain
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t)
    g.setTargetAtTime(depth, t, 0.02)
    g.setTargetAtTime(1, t + hold, 0.3)
  }

  private wave(w: Wave): PeriodicWave | null {
    if (w === 'square' || w === 'triangle') return null
    let pw = this.waves.get(w)
    if (!pw) {
      const n = 48, real = new Float32Array(n), imag = new Float32Array(n)
      for (let k = 1; k < n; k++) {
        if (w === 'saw') imag[k] = (2 / (k * Math.PI)) * (k % 2 ? 1 : -1)
        else real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * (w === 'pulse25' ? 0.25 : 0.125))
      }
      pw = this.ctx!.createPeriodicWave(real, imag)
      this.waves.set(w, pw)
    }
    return pw
  }

  private bus(b: Bus | undefined) { return b === 'music' ? this.musicBus : this.sfxBus }

  /** Should a voice on this bus be created at all? Saves work when muted. */
  audible(b: Bus = 'sfx') { return this.running && (b === 'music' ? this.settings.music : this.settings.sfx) }

  tone(o: ToneOpts) {
    if (!this.audible(o.bus)) return
    const c = this.ctx!, t = Math.max(c.currentTime, o.at ?? c.currentTime)
    const a = o.attack ?? 0.004, end = t + o.dur
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(o.vol, t + a)
    g.gain.setTargetAtTime(0, t + a, Math.max(0.01, (o.dur - a) / 4))
    g.connect(this.bus(o.bus))
    if (o.echo) { const s = c.createGain(); s.gain.value = o.echo; g.connect(s).connect(this.echoIn) }
    const copies = o.detune ? [-o.detune / 2, o.detune / 2] : [0]
    for (const cents of copies) {
      const osc = c.createOscillator()
      const pw = this.wave(o.wave)
      if (pw) osc.setPeriodicWave(pw); else osc.type = o.wave as OscillatorType
      osc.frequency.setValueAtTime(o.freq, t)
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.slide ?? o.dur))
      osc.detune.value = cents
      let lfo: OscillatorNode | undefined
      if (o.vibrato) {
        lfo = c.createOscillator(); lfo.frequency.value = o.vibrato.rate
        const depth = c.createGain(); depth.gain.value = o.vibrato.cents
        lfo.connect(depth).connect(osc.detune); lfo.start(t); lfo.stop(end + 0.05)
      }
      const v = copies.length > 1 ? c.createGain() : null
      if (v) { v.gain.value = 0.6; osc.connect(v).connect(g) } else osc.connect(g)
      osc.start(t); osc.stop(end + 0.05)
      osc.onended = () => { g.disconnect() }
    }
  }

  noiseHit(o: NoiseOpts) {
    if (!this.audible(o.bus)) return
    const c = this.ctx!, t = Math.max(c.currentTime, o.at ?? c.currentTime)
    if (!this.noise) {
      const make = (hold: number) => {
        const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0)
        let v = 0
        for (let i = 0; i < d.length; i++) { if (i % hold === 0) v = Math.random() * 2 - 1; d[i] = v }
        return b
      }
      this.noise = { white: make(1), crunch: make(6) }
    }
    const src = c.createBufferSource()
    src.buffer = this.noise[o.crunch ? 'crunch' : 'white']
    src.loop = true
    const f = c.createBiquadFilter()
    f.type = o.type ?? 'highpass'
    f.frequency.setValueAtTime(o.freq ?? 1000, t)
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur)
    f.Q.value = o.q ?? 0.8
    const g = c.createGain(), a = o.attack ?? 0.002
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(o.vol, t + a)
    g.gain.setTargetAtTime(0, t + a, Math.max(0.008, (o.dur - a) / 4))
    src.connect(f).connect(g).connect(this.bus(o.bus))
    src.start(t, Math.random() * 0.9); src.stop(t + o.dur + 0.05)
    src.onended = () => { g.disconnect() }
  }
}

/** The single shared engine (module singleton; inert until unlock()). */
export const audio = new Engine()
