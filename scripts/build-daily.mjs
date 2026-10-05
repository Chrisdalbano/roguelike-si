import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Compile the small DOM-free library in memory; no runtime dependency or build output.
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const cache = new Map()
async function load(path) {
  if (cache.has(path)) return cache.get(path)
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(path, 'utf8')
  const imports = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(m => m[1])
  const dependencies = new Map()
  for (const name of new Set(imports)) dependencies.set(name, await load(resolve(path, '..', name + '.ts')))
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => dependencies.get(name) ?? require(name), module, module.exports)
  cache.set(path, module.exports)
  return module.exports
}
const { dailyRun, intro, dungeonJSON, THEMES } = await load(resolve(root, 'lib/index.ts'))
const now = new Date(), date = now.toISOString().slice(0, 10), config = dailyRun(now)
const publicDir = resolve(root, 'public')
await mkdir(resolve(publicDir, 'api'), { recursive: true })
const write = (name, data) => writeFile(resolve(publicDir, name), data, 'utf8')
await write('api/daily.json', JSON.stringify({ date, config, intro: intro(config), dungeon: dungeonJSON(config) }, null, 2) + '\n')
await write('api/themes.json', JSON.stringify(THEMES, null, 2) + '\n')
await write('llms.txt', `roguelike.si\nA free five-minute turn-based 8-bit browser roguelike. Four deterministic procedural floors, six themes, and a final boss. No account or server simulation.\n\nhttps://roguelike.si/api/daily.json - UTC date, RunConfig, procedural intro, and full dungeon (string-grid rows, legend, enemies and items). Regenerated daily.\nhttps://roguelike.si/api/themes.json - theme IDs, names, keyword lists and five-color palettes.\nhttps://roguelike.si/?seed=SEED&theme=THEME - replay a seed; URL-encode both values.\n`)
await write('robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://roguelike.si/sitemap.xml\n')
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://roguelike.si/</loc><lastmod>${date}</lastmod><changefreq>daily</changefreq></url></urlset>\n`)
console.log(`Generated daily dungeon for ${date}: ${config.theme}`)
