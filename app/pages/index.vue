<script setup lang="ts">
import { THEMES, type RunConfig, type ThemeId } from '~~/lib'

// useState, not ref: survives the page re-creation Nuxt does after hydrating a
// prerendered route that arrived with a query string.
const config = useState<RunConfig | null>('run-config', () => null)
const runKey = useState('run-key', () => 0)
const router = useRouter()

function start(c: RunConfig) {
  config.value = c
  runKey.value++
  // Keep the address bar on the exact run so reloading or copying it replays it.
  router.replace({ query: { seed: c.seed, theme: c.theme } })
  if (import.meta.client) window.scrollTo({ top: 0 })
}
function exit() {
  config.value = null
  router.replace({ query: {} })
}

// Shared links: /?seed=...&theme=... start that exact run (client only; the page is static).
onNuxtReady(() => {
  // Read the real address bar: on a prerendered page route.query can still be
  // the empty build-time route at this point.
  const q = new URLSearchParams(window.location.search)
  const seed = q.get('seed')?.trim(), theme = q.get('theme')
  if (seed && theme && Object.hasOwn(THEMES, theme)) start({ seed, theme: theme as ThemeId, prompt: '' })
})
</script>

<template>
  <div class="page">
    <main class="wrap">
      <ClientOnly v-if="config">
        <GameStage :key="runKey" :config="config" @again="start(config!)" @exit="exit" />
      </ClientOnly>
      <TitleScreen v-else @start="start" />
    </main>
    <HowItWorks class="wrap" />
    <footer class="wrap foot">
      <a href="https://chrisdalbano.com">Made by Chris D'Albano</a>
      <span>The domain roguelike.si is for sale. <a href="https://chrisdalbano.com">Get in touch</a>.</span>
    </footer>
  </div>
</template>

<style scoped>
.page { min-height: 100dvh; display: flex; flex-direction: column; }
.wrap { width: 100%; max-width: 1180px; margin: 0 auto; padding-inline: clamp(16px, 4vw, 48px); }
main { padding-top: 16px; min-height: 92dvh; }
.foot { padding-block: 32px 40px; font-family: var(--font-mono); font-size: 12px; border-top: 1px solid var(--border); }
.foot a { color: var(--fg-secondary); text-decoration: none; }
.foot a:hover { color: var(--accent-lead); }
@media (max-width: 700px) { main { min-height: auto; padding-top: 10px; } }
</style>
