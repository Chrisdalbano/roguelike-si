# Game logic handoff

Implemented the complete `lib/types.ts` API without changing the contract or touching `app/`. The only other root change is the requested `daily` package script. No runtime dependencies were added.

The run has four 28×18 floors, connected room/corridor and cellular-cave generators, deterministic seeded placement, five enemy archetypes, seven item types, fog memory, symmetric supercover line-of-sight, bump combat, and a final boss. Seeds also select a short procedural premise. Views expose only visible actors/items and the events from the latest action. State is plain JSON and every step clones its input; views and summaries do not expose mutable state references.

Theme mechanics: Egyptian chests accumulate curse damage and shrines cleanse it; zombie combat/bombs increase enemy hearing distance; future doors consume keys named Power Cells (or cost HP to force); steam vents fire every third turn; medieval shrines exchange 5 HP for attack; deepsea oxygen drains each turn and refills at shrines and floor transitions. Shrines are single-use. Locked chests can be passed without opening, so a missing key cannot block the stairs. Bumping doors, chests and shrines consumes a turn when successful. Wall bumps, unavailable inventory slots and invalid descents do not. Descending restores 10 HP. Bosses telegraph, pulse nearby, then pursue; brutes act every second turn; ranged enemies retreat at close range and shoot every second turn; weak swarms appear in greater numbers.

## UI usage

```ts
import { createRun, dailyRun, newGame, step, view, summary } from '~/lib'

const config = createRun('mummy heist under a dying sun')
// Or: dailyRun(new Date()), or the config in /api/daily.json.
// Shared link: { seed: query.seed, theme: validatedTheme, prompt: '' }.
let state = newGame(config)
state = step(state, { type: 'move', dir: 'e' })
let render = view(state) // Consume render.events now, before the next step.
state = step(state, { type: 'tick', elapsedMs: 250 })
render = view(state)
const result = summary(state)
// JSON.stringify(state) / JSON.parse(...) can persist and restore a run.
```

Send elapsed deltas (not total elapsed time) from a monotonic UI timer, including elapsed background-tab time. Ticks do not advance enemies. A tick clears previous animation events; enqueue animations before dispatching another action. `use.slot` is the current inventory index. Keys activate automatically when bumping chests/doors; relics score on pickup, other items require use. Floor numbers and descend events are 1-based; hero actor ID is 0. Dead enemies disappear from cells but retain death events for animation. The UI should validate theme query parameters against `THEMES` before constructing a config.

## Verification and balance

`npm test` covers identical deterministic replays and input immutability, JSON serialization, all 4 floors over 200 seeds per theme (4,800 floors), prompt mapping, UTC daily seeds, clock and time items, win/death paths, theme mechanics, line-of-sight symmetry, fog memory, archetype behavior, passage safety, and 300 seeded random-walk runs. The greedy bot uses only public views; it seeks visible loot and unseen territory, equips upgrades, heals, bombs groups, and descends. It gets 750 ms per action, including unsuccessful actions. Balance sampling uses `balance-0` through `balance-119`, cycling themes (20 each). The balance test prints its results so future changes can be compared.

Final measured result: **30/120 wins (25.0%), median floor reached 4**. Per-theme wins out of 20: Egypt 4, zombie 4, future 6, steampunk 8, medieval 6, deepsea 2. This is below the roughly one-third human target, but the bot never intentionally dodges the boss or budgets oxygen. Human validation is still needed; deepsea is the first candidate for easing. The final tuning grants 10 HP per descent and gives the boss 32 HP / 7 attack. All 11 tests pass.

Commands: `npm test`, `npx tsc -p lib/tsconfig.json`, `npm run daily`, and `npx nuxt generate`. On this Windows host use `npm.cmd`/`npx.cmd` because PowerShell script execution is disabled. The test/build processes required filesystem sandbox escalation for esbuild's parent-directory resolution. Static generation succeeds with existing Nitro external-import warnings.

## Static data and automation

`npm run daily` uses the build machine's UTC date and writes `public/api/daily.json` (date/config/intro/dungeon), `public/api/themes.json`, `llms.txt`, `robots.txt`, and `sitemap.xml`. Dungeon JSON includes a character legend, grid rows, start/stairs coordinates, and enemy/item lists for every floor. The script transpiles the TypeScript library in memory using the existing TypeScript dev dependency; its loader supports this library's acyclic relative imports.

The Pages workflow installs with `npm ci`, generates daily data, tests, type-checks, generates Nuxt, and uses official Pages actions. It runs on main pushes, manual dispatch, and 00:07 UTC daily; hosted cron execution can be delayed. Repository Pages must be configured for GitHub Actions. Nothing was deployed or pushed during this task.

## Known limits

- Balance measurements are a simple greedy bot, not a human playtest. It does not plan air management or dodge boss pulses intelligently. Theme difficulty is intentionally uneven and needs human phone playtesting.
- An empty prompt uses a timestamp-derived seed at the `createRun` boundary, matching the contract's “random from now”; calls with the same provided timestamp match. There is no time or unseeded randomness inside generation or simulation.
- The requirement to preserve an arbitrary normalized prompt as the full seed conflicts with an unconditional share-text limit: the URL alone can exceed 239 characters, especially with Unicode. For URLs that fit, captions are shortened to keep share text under 240. For longer URLs, the exact replay URL is preserved without a caption. A hard universal cap would require an agreed prompt limit or seed-compaction convention; neither was silently added to the UI contract.
- There is no runtime server, remote seed storage, sound, or UI work here. Replay stability applies to this generator version; changing generation/balance code can change old runs. Save data has no migration layer yet.
