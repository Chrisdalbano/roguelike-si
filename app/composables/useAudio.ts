import { audio } from '~/audio/engine'
import { music } from '~/audio/music'

const KEY = 'rl-audio'
// Module-level so the title screen and the play screen share one set of toggles.
const settings = reactive({ sfx: true, music: true, volume: 0.6 })
let loaded = false

/** Audio toggles (SFX, Music, master volume), remembered in localStorage. */
export function useAudio() {
  function load() {
    if (loaded || !import.meta.client) return
    loaded = true
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<typeof settings> | null
      if (saved) {
        if (typeof saved.sfx === 'boolean') settings.sfx = saved.sfx
        if (typeof saved.music === 'boolean') settings.music = saved.music
        if (typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) settings.volume = saved.volume
      }
    } catch {}
    sync()
  }
  function sync() {
    Object.assign(audio.settings, settings)
    audio.apply()
    try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch {}
  }
  // Load after mount so the server-rendered defaults hydrate cleanly.
  onMounted(load)
  return {
    settings,
    toggle(which: 'sfx' | 'music') { settings[which] = !settings[which]; audio.unlock(); sync() },
    setVolume(v: number) { settings.volume = Math.min(1, Math.max(0, v)); sync() },
    music,
  }
}
