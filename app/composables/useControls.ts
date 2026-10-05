import type { Ref } from 'vue'
import type { Action, Dir } from '~~/lib'

const KEYS: Record<string, Dir> = {
  ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e',
  w: 'n', s: 's', a: 'w', d: 'e', W: 'n', S: 's', A: 'w', D: 'e',
  k: 'n', j: 's', h: 'w', l: 'e',
}

/** Keyboard (arrows / WASD / hjkl) and swipe input mapped to game actions. */
export function useControls(surface: Ref<HTMLElement | null>, act: (a: Action) => void, enabled: () => boolean) {
  let lastAt = 0
  const send = (a: Action, repeat = false) => {
    const now = performance.now()
    if (repeat && now - lastAt < 85) return // held keys: steady, not frantic
    lastAt = now
    act(a)
  }

  function onKey(e: KeyboardEvent) {
    if (!enabled() || e.metaKey || e.ctrlKey || e.altKey) return
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
    const dir = KEYS[e.key]
    let action: Action | null = null
    if (dir) action = { type: 'move', dir }
    else if (e.key === ' ' || e.key === '.') action = { type: 'wait' }
    else if (e.key === 'Enter' || e.key === '>') action = { type: 'descend' }
    else if (/^[1-9]$/.test(e.key)) action = { type: 'use', slot: Number(e.key) - 1 }
    if (!action) return
    e.preventDefault()
    send(action, e.repeat)
  }

  let start: { x: number; y: number } | null = null
  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    start = t ? { x: t.clientX, y: t.clientY } : null
  }
  function onTouchEnd(e: TouchEvent) {
    const t = e.changedTouches[0]
    if (!start || !t || !enabled()) return
    const dx = t.clientX - start.x, dy = t.clientY - start.y
    start = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
    e.preventDefault()
    send({ type: 'move', dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n') })
  }

  onMounted(() => {
    window.addEventListener('keydown', onKey)
    surface.value?.addEventListener('touchstart', onTouchStart, { passive: true })
    surface.value?.addEventListener('touchend', onTouchEnd)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    surface.value?.removeEventListener('touchstart', onTouchStart)
    surface.value?.removeEventListener('touchend', onTouchEnd)
  })
  return { send }
}
