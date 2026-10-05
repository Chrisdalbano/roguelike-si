import { newGame, step, summary, view, type Action, type GameState, type RenderView, type RunConfig, type RunSummary } from '~~/lib'

/**
 * One run: owns the opaque GameState, dispatches actions, and drives the doom
 * clock with monotonic deltas (background-tab time included, per NOTES.md).
 */
export function useRun(config: RunConfig, onView: (v: RenderView) => void) {
  let state: GameState = newGame(config)
  const current = shallowRef<RenderView>(view(state))
  const result = shallowRef<RunSummary | null>(null)
  let timer: ReturnType<typeof setInterval> | undefined
  let last = 0

  function dispatch(action: Action) {
    if (current.value.status !== 'playing') return
    state = step(state, action)
    const v = view(state)
    onView(v) // consume events now: the next step clears them
    current.value = v
    if (v.status !== 'playing') { stopClock(); result.value = summary(state) }
  }

  function tick() {
    const now = performance.now()
    const delta = now - last
    last = now
    if (delta > 0) dispatch({ type: 'tick', elapsedMs: delta })
  }
  const onVisibility = () => tick()

  function startClock() {
    if (timer) return
    last = performance.now()
    timer = setInterval(tick, 200)
    document.addEventListener('visibilitychange', onVisibility)
  }
  function stopClock() {
    if (timer) clearInterval(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisibility)
  }

  onView(current.value)
  onBeforeUnmount(stopClock)
  return { view: current, result, dispatch, startClock, stopClock }
}
