// roguelike.si — static site (nuxt generate), hosted on GitHub Pages.
const title = 'roguelike.si: a five-minute procedural roguelike'
const description = 'Type a prompt, get a dungeon. A free five-minute 8-bit roguelike in the browser: four procedural floors, six eras, one boss, a doom clock.'
const url = 'https://roguelike.si/'
const image = 'https://roguelike.si/og.png'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  ssr: true,
  nitro: { preset: 'github-pages' },
  css: ['@fontsource-variable/inter', '~/assets/css/tokens.css', '~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en', 'data-variant': 'night' },
      title,
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: description },
        { name: 'theme-color', content: '#111310' },
        { name: 'author', content: "Chris D'Albano" },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'roguelike.si' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: image },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'Pixel-art heroes and monsters from six eras, with the words roguelike.si' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
      link: [
        { rel: 'canonical', href: url },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      script: [{
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org', '@type': 'VideoGame', name: 'roguelike.si', url, image, description,
          genre: ['Roguelike', 'Procedural generation'], gamePlatform: 'Web browser', applicationCategory: 'Game',
          playMode: 'SinglePlayer', isAccessibleForFree: true, inLanguage: 'en',
          author: { '@type': 'Person', name: "Chris D'Albano", url: 'https://chrisdalbano.com' },
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }),
      }],
    },
  },
})
