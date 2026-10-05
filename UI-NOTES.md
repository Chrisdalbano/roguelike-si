# UI handoff

All UI lives in `app/` plus a small asset tool in `tools/`. `lib/`, `tests/` and `scripts/` are untouched.

## What is here

| File | Job |
|---|---|
| `app/pages/index.vue` | Title or run, How it works, footer. Shared links `/?seed=&theme=` start that run (theme validated against `THEMES`). |
| `app/components/TitleScreen.vue` | Prompt field (80 char cap), Play, six theme swatches (click to lock, click again to let the prompt decide; live "the prompt reads as ..." hint), Daily run. |
| `app/components/GameStage.vue` | HUD, canvas, intro card, boss bar, log, inventory, touch pad, CRT toggle, Quit. Integer device-pixel scaling via ResizeObserver. |
| `app/components/EndScreen.vue` | Status, epitaph, stats, Same dungeon again, New prompt, Copy result (`shareText`), Share on X (intent URL). |
| `app/components/HowItWorks.vue`, `SpriteIcon.vue` | Below-the-fold explainer with API links; one sprite drawn to a tiny canvas for DOM use. |
| `app/composables/useRun.ts` | Owns the GameState. 200 ms `setInterval` sends `performance.now()` deltas (background-tab time included, plus an immediate tick on `visibilitychange`). Every view is handed to the renderer before the next step, so events are never lost. |
| `app/composables/useControls.ts` | Arrows / WASD / hjkl, space or `.` waits, 1-9 use slots, Enter or `>` descends; held keys repeat at 85 ms; swipe on the canvas. |
| `app/game/sprites.ts` | All pixel art: 8x8, `.0123a` per pixel (transparent, bg, dark, mid, light, accent). Per-theme hero, grunt, boss, wall (face, top, accent variant) and floor (plain, decor). Shared brute, ranged, swarm, door, stairs, hazard, chest, shrine, seven items. 3x5 pixel font. |
| `app/game/renderer.ts` | Own rAF loop. Draws into a 224x144 buffer, blits at integer scale. |
| `tools/og-image.ts` | `node --experimental-strip-types tools/og-image.ts` rebuilds `public/og.png` (1200x630), `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` from the same sprites. Dependency-free PNG writer. |

Motion, all driven by `view.events`: eased move tweens with a footstep puff, attack lunge, hit flash, floating damage and heal numbers, ranged and boss bolts, screen shake on hurt (scaled by damage), per-pixel death dissolve (slower for hero and boss, boss death adds a ring and a big shake), pickup pop with sparks, bomb blast (dithered fill plus two diamond rings), floor-transition curtain wipe with "FLOOR n / place name", palette cycling on hazards, shrines and stairs, idle bob, flicker-in for actors entering view, pulsing accent outline on the boss. Doom clock: under 60 s the clock turns orange and the canvas border pulses at 1 Hz; under 15 s it blinks at 4 Hz with a one-pixel heartbeat shake each second. Fog: unseen cells are bg; remembered cells use a darker tone ramp plus a 25% bg dither (wall tops skip the dither so memory reads calm).

`prefers-reduced-motion`: no shake, bob, lunge, particles, palette cycling or curtain (the floor label shows in place instead); clock does not blink. CRT scanlines are aligned to the low-res pixel rows, on by default, toggle persists in localStorage (wrapped in try/catch).

## Verified

- `npm.cmd test`: 11/11 pass. `npx.cmd nuxt typecheck`: clean. `npx.cmd nuxt generate`: succeeds (the existing Nitro external-import warnings remain).
- Fetched the generated `index.html` from a local static server: title, hero copy, canonical, OG/Twitter tags, JSON-LD VideoGame, theme-color all present; `/og.png` and `/api/daily.json` return 200. Game code is client-only (`<ClientOnly>`), no SSR errors.
- Drove Chrome on both the dev server and the generated build: title screen, prompt to run, intro card, keyboard play, combat numbers and dissolve, bomb ring, a real descend to floor 2, death end screen, forced timeout end screen (clock jumped via a patched `performance.now`), Same dungeon again, Quit, shared link start, invalid theme falls back to title. No console errors.
- Captured the floor wipe and explosion frame by frame by calling the renderer at fixed timestamps (rAF is paused while the test tab is in the background).
- Phone portrait layout checked in a 375x667 iframe: the whole play UI (HUD, canvas, log, pad, inventory) ends at about 455 px, no scrolling. Theme grid overflow on narrow screens fixed.

## Not verified

- A winning run. My throwaway in-page bot never beat the boss in five tries; the win path (boss death ring, 1.6 s delay, "You made it out.") is unseen in a browser. Boss sprites for all six eras are visible in `public/og.png`.
- Real touch hardware: swipe and the on-screen pad were only exercised by click/synthetic events. On a real phone the canvas will be larger than in my test (DPR 2 gives scale 3, about 336 CSS px; DPR 3 gives scale 4, about 299 px). At DPR between 1 and 2 on a narrow screen the integer rule drops to scale 1 (224 px), which is small; a fractional fallback would trade crispness for size.
- Reduced-motion and the CRT toggle were reviewed in code, not toggled in a browser.
- Animations were judged from still frames, not watched in real time, so pacing (tween lengths, shake strength) may want tuning by eye.

## Logic observations (not patched)

- Enemy hits on the hero never write a log line, so HP can drop with nothing in the log. The UI shows `-n` floating numbers and shake, but the log reads as if nothing happened.
- Theme meters are invisible to the UI: curse (Egypt), noise (zombie) and oxygen (deepsea) are not in `RenderView`, so the HUD cannot show them; players only learn them from occasional log lines. Deepsea, the hardest era per NOTES, would benefit most from an oxygen field in the view.
- Inventory is unbounded and keys occupy slots, so after a few pickups the 1-5 keys stop reaching later items. The UI accepts 1-9 and every slot is tappable, but a slot cap or key counter in the logic would help.
- The boss sits on the floor-4 stairs, and `descend` is a no-op on floor 4. The UI hides the "press Enter" stairs hint on floor 4.
- Share text: the prompt field is capped at 80 characters in the UI, which keeps `shareText` comfortably under the limit for ASCII prompts. Shared links set `prompt: ''`, which is fine because generation only reads seed and theme.
- Balance not playtested by a human. Random walking dies on floor 1 in about 30 turns, as you would expect.
