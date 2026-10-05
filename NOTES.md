# Game logic handoff

Implemented the complete `lib/types.ts` API without changing the contract or touching `app/`. The only other root change is the requested `daily` package script. No runtime dependencies were added.

The run has four 28×18 floors, connected room/corridor and cellular-cave generators, deterministic seeded placement, five enemy archetypes, seven item types, fog memory, symmetric supercover line-of-sight, bump combat, and a final boss. Seeds also select a short procedural premise. Views expose only visible actors/items and the events from the latest action. State is plain JSON and every step clones its input; views and summaries do not expose mutable state references.

Theme mechanics: Egyptian chests accumulate curse damage and shrines cleanse it; zombie combat/bombs increase enemy hearing distance; future doors consume keys named Power Cells (or cost HP to force); steam vents fire every third turn; medieval shrines exchange 5 HP for attack; deepsea oxygen drains 0.25 units each turn and refills at shrines and floor transitions. Shrines are single-use. Locked chests can be passed without opening, so a missing key cannot block the stairs. Bumping doors, chests and shrines consumes a turn when successful. Wall bumps, unavailable inventory slots and invalid descents do not. Descending restores 10 HP. Bosses telegraph, pulse nearby, then pursue; brutes act every second turn; ranged enemies retreat at close range and shoot every second turn; weak swarms appear in greater numbers.

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

Original UI hand-off result: **30/120 wins (25.0%), median floor reached 4**. Per-theme wins out of 20: Egypt 4, zombie 4, future 6, steampunk 8, medieval 6, deepsea 2. This is below the roughly one-third human target, but the bot never intentionally dodges the boss or budgets oxygen. Human validation is still needed; deepsea was the first candidate for easing (see the follow-up sample below). The final tuning grants 10 HP per descent and gives the boss 32 HP / 7 attack. The original 11 tests passed.

Commands: `npm test`, `npx tsc -p lib/tsconfig.json`, `npm run daily`, and `npx nuxt generate`. On this Windows host use `npm.cmd`/`npx.cmd` because PowerShell script execution is disabled. The test/build processes required filesystem sandbox escalation for esbuild's parent-directory resolution. Static generation succeeds with existing Nitro external-import warnings.

## Static data and automation

`npm run daily` uses the build machine's UTC date and writes `public/api/daily.json` (date/config/intro/dungeon), `public/api/themes.json`, `llms.txt`, `robots.txt`, and `sitemap.xml`. Dungeon JSON includes a character legend, grid rows, start/stairs coordinates, and enemy/item lists for every floor. The script transpiles the TypeScript library in memory using the existing TypeScript dev dependency; its loader supports this library's acyclic relative imports.

The Pages workflow installs with `npm ci`, generates daily data, tests, type-checks, generates Nuxt, and uses official Pages actions. It runs on main pushes, manual dispatch, and 00:07 UTC daily; hosted cron execution can be delayed. Repository Pages must be configured for GitHub Actions. Nothing was deployed or pushed during this task.

## Known limits

- Balance measurements are a simple greedy bot, not a human playtest. It does not plan air management or dodge boss pulses intelligently. Theme difficulty is intentionally uneven and needs human phone playtesting.
- An empty prompt uses a timestamp-derived seed at the `createRun` boundary, matching the contract's “random from now”; calls with the same provided timestamp match. There is no time or unseeded randomness inside generation or simulation.
- The requirement to preserve an arbitrary normalized prompt as the full seed conflicts with an unconditional share-text limit: the URL alone can exceed 239 characters, especially with Unicode. For URLs that fit, captions are shortened to keep share text under 240. For longer URLs, the exact replay URL is preserved without a caption. A hard universal cap would require an agreed prompt limit or seed-compaction convention; neither was silently added to the UI contract.
- There is no runtime server, remote seed storage, sound, or UI work here. Replay stability applies to this generator version; changing generation/balance code can change old runs. Legacy inventory keys migrate into the key counter on the next step; excess legacy inventory is left on the floor at the hero's position.

## Changes since UI hand-off

No changes to app/. Existing actions, events and summary fields are retained. The UI can now read:

- Optional `view(state).meters`, always supplied by this implementation as an array of fresh `{ id, label, value, max, danger }` objects. Consumers should use `meters ?? []` for compatibility.
- Egypt: `curse` / "Curse", danger at 2 or more; display max is at least 2 and grows with the uncapped count.
- Zombie: `noise` / "Noise", max 18, danger at 5 or more.
- Deepsea: `oxygen` / "Air", max 70, danger at 20 or less. Values may be fractional; each action costs 0.25 air. Shrines and floor transitions refill to 70; ticks cost no air.
- Steampunk: `vent` / "Vent", turns until the next eruption (1-3), max 3, danger at 1. Eruptions only hurt heroes standing on vents.
- All six themes: `keys`, labeled Scarab Key / Security Key / Power Cell / Winding Key / Iron Key / Hatch Key respectively. Exact count, danger when zero, display max `Math.max(1, count)` (no storage cap). Themes without an additional mechanic counter supply no extra entries; all current themes have keys, so none has a completely empty meters array.
- `inventory` has at most five usable slots and no keys. New runs start with a heal, a bomb and one separately counted key. Relics still score immediately. Full-pack items remain visible through `cells[].item`, emit no pickup event, and can be collected after freeing space and returning. Full-pack chest remedies are also left on the floor.
- `log` now names attackers and damage for melee, ranged and boss hits, including fatal hits; existing attack/hurt/death events are preserved. Full-pack pickups also produce a short themed log.

### Follow-up verification and balance

Final sample: **33/120 wins (27.5%), median floor 4**. Wins out of 20: Egypt **2**, zombie **4**, future **6**, steampunk **11**, medieval **6**, deepsea **4**. Same seeds, action budget and clock as the original sample. The bot now skips slot-consuming loot when its five slots are full, preventing futile pickup loops; it still uses only public views and does not plan oxygen use.

A control sample with the new inventory rules and capacity-aware bot, but the original 1-air drain, scored **31/120**, with exactly the same non-deepsea counts and only **2/20 deepsea wins**. The air tuning doubles that to **4/20**, matching zombie and falling within the other themes' range. No other theme's enemy stats, generation, healing or hazards were eased. This is a small deterministic sample, not a human difficulty estimate.

`npm.cmd test`: **23 tests pass**. `npx.cmd tsc -p lib/tsconfig.json`: passes. New regressions cover attacker logs/events, meters and danger boundaries, inventory overflow and recovery, keys/chests, legacy JSON saves, air depletion/refills, and complete unmodified generated winning runs with summary checks for every theme. Winning seeds: Egypt balance-36, zombie balance-19, future balance-14, steampunk balance-3, medieval balance-16, deepsea balance-5. Browser win animations remain outside this library verification.
