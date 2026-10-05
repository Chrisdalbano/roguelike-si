<template>
  <section class="how" aria-labelledby="how-title">
    <h2 id="how-title">How it works</h2>
    <div class="cols">
      <div>
        <h3>Procedural</h3>
        <p>Your prompt is the seed. Keywords pick one of six eras; everything else falls out of a seeded generator: four 28 by 18 floors (rooms and corridors, or cellular caves), enemies, loot, shrines, the premise you read before the clock starts, and the epitaph you get after.</p>
        <p>Same prompt, same dungeon, on any machine. The sprites are hand-drawn 8 by 8 bitmaps in the source, recoloured from each era's four-tone palette.</p>
        <p>The sound is synthesised in your browser too: square, triangle and noise voices, no audio files. Each dungeon's music is composed from its seed, in the era's own scale and tempo, so the same seed always plays the same tune.</p>
      </div>
      <div>
        <h3>Optional narrator</h3>
        <p>If you type a prompt and leave "AI narrator" on, your prompt and the run's facts (floor, kills, time left, how it ended) go to Pollinations, a free third-party text model, which may rewrite the intro card and the epitaph. The game never waits for it: the procedural text shows first and stays if the answer is slow, blocked or malformed.</p>
        <p>It only changes those words. The dungeon, the rules, your score and the share text are all procedural and identical with it on or off. Daily runs and shared links never call it.</p>
      </div>
      <div>
        <h3>Rules</h3>
        <p>Turn-based. Bump to attack. The doom clock runs in real time, five minutes, whether you move or not. Reach the fourth floor and take down the boss to win. Each era bends one rule: curses, noise, power cells, steam vents, blood oaths, oxygen.</p>
      </div>
      <div>
        <h3>API</h3>
        <p>It is all static files. Agents and the curious can read them directly.</p>
        <ul>
          <li><a href="/api/daily.json">/api/daily.json</a> today's run, intro and full dungeon</li>
          <li><a href="/api/themes.json">/api/themes.json</a> eras, keywords, palettes</li>
          <li><a href="/llms.txt">/llms.txt</a> the short version for language models</li>
          <li><code>/?seed=...&amp;theme=...</code> replay any run</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.how { padding-block: clamp(48px, 8vw, 96px) 40px; border-top: 1px solid var(--border); }
h2 { margin: 0 0 24px; font-size: clamp(22px, 3vw, 32px); letter-spacing: -.02em; }
h3 { margin: 0 0 8px; font-family: var(--font-mono); font-size: 11px; font-weight: 400; color: var(--accent-lead); letter-spacing: .1em; text-transform: uppercase; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 32px; }
p { margin: 0 0 12px; color: var(--fg-secondary); line-height: 1.6; font-size: 15px; max-width: 60ch; }
ul { list-style: none; margin: 0; padding: 0; font-family: var(--font-mono); font-size: 12px; color: var(--fg-muted); }
li { padding: 6px 0; border-bottom: 1px solid var(--border); }
a { color: var(--accent-lead); margin-right: 8px; }
code { color: var(--fg-primary); font-size: 12px; }
</style>
