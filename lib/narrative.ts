import type { RunConfig } from './types'
import { hash, random } from './random'
import { THEMES, vocabulary } from './themes'

export function createRun(prompt: string, now: Date = new Date()): RunConfig {
  const normalized = prompt.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
  const themes = Object.values(THEMES)
  const tokens = normalized.split(/[^\p{L}\p{N}]+/u)
  const theme = themes.find(t => t.keywords.some(k => tokens.includes(k))) ?? themes[hash(normalized) % themes.length]!
  return { seed: normalized || `wander-${now.toISOString()}`, theme: theme.id, prompt: prompt.trim() }
}
export function dailyRun(date: Date): RunConfig {
  const day = date.toISOString().slice(0, 10)
  const ids = Object.keys(THEMES) as RunConfig['theme'][]
  return { seed: `daily-${day}`, theme: ids[hash(day) % ids.length]!, prompt: '' }
}
export function intro(config: RunConfig): { title: string; lines: string[] } {
  const rng = random(`${config.seed}:story`), v = vocabulary[config.theme]
  const pick = (a: string[]) => a[Math.floor(rng() * a.length)]!
  const treasure = pick(v.treasure), place = pick(v.place)
  return { title: `The ${treasure}`, lines: [`${pick(['A dying courier', 'Your missing sister', 'An unsigned letter'])} sent you to the ${place}.`, `Recover the ${treasure} before the last five minutes burn away.`, `Four descents. One ${v.foe[4]}. ${pick(['No rescue is coming.', 'Someone still waits above.', 'Leave a name worth remembering.'])}`] }
}
