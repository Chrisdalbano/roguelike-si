// roguelike.si — static site (nuxt generate), hosted on GitHub Pages.
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  ssr: true,
  nitro: { preset: 'github-pages' },
  css: ['@fontsource-variable/inter', '~/assets/css/tokens.css', '~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en', 'data-variant': 'night' },
      title: 'roguelike.si',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'A five-minute procedural 8-bit roguelike. Type a prompt, get a dungeon.' },
      ],
    },
  },
})
