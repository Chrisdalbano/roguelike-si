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

# Sound, music and the optional narrator (2026-10-05)

All in `app/`; `lib/`, `tests/`, `scripts/` untouched, no new dependencies.

| File | Job |
|---|---|
| `app/audio/engine.ts` | One `AudioContext`, created on the first gesture. Voices: square, 25% and 12.5% pulse and saw (PeriodicWave), triangle, white and stepped "crunch" noise, short envelopes, pitch slides, optional detuned copy and vibrato. Graph: music bus -> duck gain -> master -> DynamicsCompressor (threshold -10 dB, ratio 16, 2 ms attack, used as a limiter) -> out; SFX bus -> master. Feedback echo (lowpassed, feedback capped at 0.6) on the music bus. |
| `app/audio/music.ts` | `compose(seed, theme)` is pure: seed + era -> chord loop, bass, arpeggio, lead melody, drone, a "rise" line and drums. `MusicPlayer` schedules 16th steps on AudioContext time (25 ms timer, 120 ms lookahead). Levels: `thin` (title and intro: bass, drone, arp), `full` (play), `tense` (last 60 s: tempo x1.12, extra hats, rising line). Boss sting on first sight. |
| `app/audio/sfx.ts` | Maps `view(state).events` plus a diff against the previous view (doors, chests, shrines, item use, wall bumps, last-15-s clock ticks, status changes) to sounds. Seeded pitch wobble on steps and hits, at most 4 sounds per step, big sounds duck the music. |
| `app/composables/useAudio.ts`, `app/components/AudioControls.vue` | SFX and Music toggles plus master volume, `localStorage` key `rl-audio`, default SFX on, music on, volume 0.6. Shown on the title screen and in the play screen's quiet row next to CRT. |
| `app/plugins/audio.client.ts` | Unlocks on pointerdown/keydown/touchend and keeps listening until the context is actually running; suspends on `visibilitychange` hidden, resumes on visible. |
| `app/composables/useNarrator.ts` | Optional AI rewrite of the intro card and the epitaph. `NARRATOR` holds endpoint, model and the 2.5 s / 4 s budgets. |

Era sounds (`STYLES` in music.ts): Egypt Phrygian dominant, 76 bpm, square lead with slow vibrato over a pedal bass and tom/shaker; zombie natural minor, 84 bpm, sparse 25% pulse lead detuned by 22 cents, off-beat bass, sparse kick; future Lydian, 138 bpm, 16th-note 12.5% pulse arpeggios, pumping octave bass, four-on-the-floor; steampunk Mixolydian, 104 bpm, swing 0.64, oom-pah bass, off-beat chord stabs, tick-tock clockwork kit; medieval Dorian, 96 bpm, open-fifth drone, hand-drum kit; deepsea Aeolian, 66 bpm, 4-bar loop, soft triangle lead, long echo (feedback 0.48), swell percussion. Per seed: key shifted -2..+2 semitones, tempo +-4%, one of three progressions, arp shape, melody. Melody structure A A' B A'' (2-bar phrases): mostly stepwise, occasional leaps of 3-5 degrees followed by a step back, chord tones on strong beats, last phrase ends on the tonic. The title screen plays a thin loop in the locked era (medieval if none is locked), so typing a prompt does not flip the music on every keystroke.

Narrator rules as built: only runs with a typed prompt (daily runs and `?seed=` links never call it), toggle on the title screen with a one-line disclosure, remembered in `rl-narrator` (default on). Procedural text renders first; the AI text replaces it only if a valid answer arrives within 2.5 s while the intro card is still up (Begin aborts the request) or within 4 s of the run ending. The reply must contain a JSON object; fields are stripped of tags, markdown, control and bidi characters, rejected if they contain links or handles, capped (title 48, lines 130, epitaph 300 chars), and rendered as text interpolation, never HTML. One intro per dungeon (cached by seed and theme, so "Same dungeon again" makes no new call) and one epitaph per run. The prompt is passed as data with an instruction not to follow anything inside it. Gameplay, generation, score and share text never read narrator output.

## Verified

- `npm.cmd test`: 23/23. `npx.cmd nuxt typecheck`: clean. `npx.cmd nuxt generate`: succeeds, 4 routes prerendered, only the existing Nitro warnings. Audio and fetch code is client-only (the plugin is `.client.ts`; everything else runs in `onMounted` or event handlers). The prerendered page includes the new controls and the How it works copy.
- Composer data, checked with a throwaway `vite-node` script over 200 seeds x 6 eras (1,200 songs): every note is in its era's scale, `compose` is deterministic (same seed gives identical JSON), 200/200 distinct melodies per era, about 61-74% of melodic intervals are steps and 15-17% leaps. Ranges in MIDI: bass 34-63, lead 57-87, arp 45-87, drone 48-62. Worst-case summed voice gain before the buses is 0.65 (future); after the music bus (0.55) and master at the default volume it peaks near 0.14, and the compressor sits after that.
- Headless Chrome over CDP (`Input.dispatchMouseEvent`, so real user activation) against the generated build on a local static server:
  - No AudioContext before a gesture; the first click creates it and it reports `running`. A shared link on a fresh load creates nothing until the Begin click, then runs.
  - Title music schedules about 3 oscillators per 2 s (thin medieval: bass plus a two-voice drone). Music off: 0 new voices in 2 s and `rl-audio` updated; Music on: voices resume. The SFX toggle persists. Seven moves in play created 20 oscillators and 10 noise sources.
  - A simulated tab hide suspends the context; show resumes it.
  - Narrator with a mocked 800 ms reply wrapped in a code fence and containing `<b>` tags: intro swapped, tags stripped. A mocked epitaph (1.5 s) swapped onto the end screen after a forced timeout. Facts sent: outcome, floor, kills, turns, seconds left, killed_by. Replay made 0 new calls and reused the cached intro.
  - Fallbacks: a 4 s reply was aborted at 2,501 ms and the procedural text stayed; a rejected fetch, a non-JSON reply (the "key budget" text the live API was returning) and the live endpoint all left the procedural text. The daily run made 0 calls; narrator off made 0 calls.
  - No console errors, warnings or exceptions in the whole session.
- The Claude-in-Chrome window was hidden (document.hidden true, input events not delivered), which is why the browser checks ran in a separate headless Chrome instead.

## Not verified / needs a human ear

- I cannot hear. None of this has been listened to: the mix balance, whether the era styles actually read as Egypt, zombie and so on, whether the step sound gets tiresome over 300 moves, whether the boss sting and win fanfare land, and whether the tense tempo jump is too abrupt all need a listen on speakers and on a phone.
- The live Pollinations endpoint did not answer usefully on 2026-10-05. Fresh anonymous POSTs to `https://text.pollinations.ai/openai` returned HTTP 402 (x402 "Payment required"), a 500 (`ENOSPC`), or a cached month-old reply saying an API key had hit its budget. So the swap path is verified only with a mocked response; with the live API as it behaved that day, players always get the procedural text, which is the intended fallback. If it stays like this, point `NARRATOR.endpoint` at a proxy or turn the default off.
- Not tested on Safari or iOS (where touchend is the gesture that counts; the plugin listens for it) or on real phone speakers.
- The win sounds (boss death plus fanfare) were not triggered in a browser, same as the win animation before.
