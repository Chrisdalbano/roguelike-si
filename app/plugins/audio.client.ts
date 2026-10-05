import { audio } from '~/audio/engine'

// Browsers block audio until a user gesture: start the context on the first
// tap, click or key press anywhere, and pause it while the tab is hidden.
export default defineNuxtPlugin(() => {
  const events = ['pointerdown', 'keydown', 'touchend'] as const
  const unlock = (e: Event) => {
    if (e instanceof KeyboardEvent && (e.key === 'Escape' || e.metaKey || e.ctrlKey || e.altKey)) return
    // Keep listening until the context is really running: some browsers only
    // count certain gestures, and a context created early can stay suspended.
    if (audio.running) { for (const ev of events) window.removeEventListener(ev, unlock, true); return }
    audio.unlock()
  }
  for (const ev of events) window.addEventListener(ev, unlock, true)
  document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()))
})
