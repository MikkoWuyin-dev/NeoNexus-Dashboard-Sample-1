// Generates public/index.html from the downloaded SSR page:
// - rewrites all absolute dashboard.shadcnuikit.com URLs to local paths
// - rewrites i.pravatar.cc avatars to local /avatars/ files
// - bakes the dark theme into the SSR output (no script injection!)
// - patches the next-themes boot script default from "light" to "dark"
// - patches app chunks: local Turbopack base path, GA calls disabled
//
// IMPORTANT: never inject extra <script> tags into <head>. React 19
// reconciles <head> childList strictly, and any foreign head child breaks
// hydration with React error #418 (verified empirically — see
// scripts/verify-local-clone.cjs and the A/B tests this build evolved from).
// All runtime behavior fixes are therefore done as string patches of the
// artifact itself or of downloaded chunk files.
// Idempotent: always regenerates from the pristine source in Downloads.
const fs = require('fs')
const path = require('path')

const SRC =
  'C:/Users/micha/Downloads/Project Mgt Dashboard/shadcnuikit.com/dashboard/project-management.html'
const OUT = path.join(__dirname, '..', 'public', 'index.html')
const CHUNKS_DIR = path.join(__dirname, '..', 'public', '_next', 'static', 'immutable', 'chunks')

let html = fs.readFileSync(SRC, 'utf8')
const before = html.length

// 1. Make absolute asset URLs relative to the local server root.
//    Applies uniformly to DOM markup, RSC payload strings and preload hints,
//    so hydration stays consistent.
html = html.split('https://dashboard.shadcnuikit.com').join('')

// 2. Local avatars. "https://i.pravatar.cc/150?img=3" -> "/avatars/img3.jpg"
html = html.split('https://i.pravatar.cc/150?img=').join('/avatars/img')
html = html.replace(/\/avatars\/img(\d+)(?![\w.])/g, '/avatars/img$1.jpg')

// 3. Dark theme without script injection, in three in-artifact patches:
//    a) <html class="..."> in the DOM markup
//    b) the RSC payload's html-node className (what the client render uses)
//    c) the next-themes boot script's defaultTheme argument ("light"->"dark")
//       so a fresh profile (empty localStorage) also resolves dark pre-paint.
//    The html node carries suppressHydrationWarning, so the boot script's
//    pre-hydration class/style mutation stays a tolerated warning (proven:
//    hydration is clean when nothing touches <head>).
function patchOnce(label, from, to) {
  const n = html.split(from).length - 1
  if (n !== 1) {
    console.error(`PATCH FAIL: ${label}: expected 1 occurrence, found ${n}`)
    process.exitCode = 1
    return
  }
  html = html.replace(from, to)
  console.log(`patched: ${label}`)
}

const HTML_CLS_OLD = 'class="font-sans dm_sans_fb5c29f7-module__Edek3G__variable"'
const HTML_CLS_NEW = 'class="dark font-sans dm_sans_fb5c29f7-module__Edek3G__variable"'
const RSC_CLS_OLD = 'className\\":\\"font-sans dm_sans_fb5c29f7-module__Edek3G__variable'
const RSC_CLS_NEW = 'className\\":\\"dark font-sans dm_sans_fb5c29f7-module__Edek3G__variable'
const BOOT_OLD = '("class","theme","light",null'
const BOOT_NEW = '("class","theme","dark",null'
const PROVIDER_OLD = '\\"defaultTheme\\":\\"light\\"'
const PROVIDER_NEW = '\\"defaultTheme\\":\\"dark\\"'

if (html.includes(HTML_CLS_OLD)) {
  html = html.replace(HTML_CLS_OLD, HTML_CLS_NEW)
  console.log('patched: <html> class -> dark')
} else if (!html.includes('class="dark font-sans dm_sans')) {
  console.error('PATCH FAIL: <html> class marker not found')
  process.exitCode = 1
}
patchOnce('RSC payload html className -> dark', RSC_CLS_OLD, RSC_CLS_NEW)
patchOnce('boot script defaultTheme -> dark', BOOT_OLD, BOOT_NEW)
// The client-side ThemeProvider's own default is "light" in the payload; with
// empty localStorage the client render would emit <html class="... light">
// against the dark server markup -> React #418. All three layers (DOM tag,
// boot script, provider default) must agree on dark.
patchOnce('ThemeProvider defaultTheme -> dark', PROVIDER_OLD, PROVIDER_NEW)

// 4. Patch client chunks in place (idempotent via exact-match replacement).
//    - Turbopack chunk loader falls back to the live
//      https://dashboard.shadcnuikit.com/_next/ host when the global is
//      undefined; lazy-loaded routes would 404 offline. Patch the fallback
//      to the local root instead of injecting a global (no new scripts).
//    - react-ga fires initialize("G-SCDGVLHLXH") + send("pageview") in a
//      useEffect, phoning home on every load. Neutralize it.
const CHUNK_PATCHES = [
  {
    label: 'Turbopack chunk base fallback -> local',
    from: 'https://dashboard.shadcnuikit.com/_next/',
    to: '/_next/',
  },
  {
    label: 'react-ga initialize/send -> no-op',
    from: 'r.initialize("G-SCDGVLHLXH"),r.send("pageview")',
    to: 'void 0',
  },
]

let patchedChunks = 0
if (fs.existsSync(CHUNKS_DIR)) {
  for (const name of fs.readdirSync(CHUNKS_DIR)) {
    if (!name.endsWith('.js')) continue
    const p = path.join(CHUNKS_DIR, name)
    let src = fs.readFileSync(p, 'utf8')
    let changed = false
    for (const { label, from, to } of CHUNK_PATCHES) {
      if (src.includes(from)) {
        src = src.split(from).join(to)
        changed = true
        console.log(`patched: ${name}: ${label}`)
      }
    }
    if (changed) {
      fs.writeFileSync(p, src)
      patchedChunks++
    }
  }
}
console.log(`chunk patches applied to ${patchedChunks} file(s)`)

// 5. Refresh the SSR date range. The snapshot was saved with the 28-day
//    window frozen at "23 Aug 2026 - 19 Sep 2026"; the client recomputes the
//    trailing window from today, so the SSR text starts one day stale. Patch
//    both DOM and payload to the build-day values to minimize the mismatch
//    window (the client still recomputes after hydration — this only affects
//    first paint).
{
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const fmt = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const now = new Date()
  const start = fmt(new Date(now.getTime() - 27 * 86400000))
  const end = fmt(now)
  const staleStart = '23 Aug 2026'
  const staleEnd = '19 Sep 2026'
  for (const [from, to, label] of [
    [staleStart, start, 'range start'],
    [staleEnd, end, 'range end'],
  ]) {
    const n = html.split(from).length - 1
    if (n === 1) {
      html = html.replace(from, to)
      console.log(`patched: ${label} -> ${to}`)
    } else {
      console.log(`skipped: ${label} (found ${n} occurrences of "${from}")`)
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, html)
console.log(`Wrote ${OUT} (${before} -> ${html.length} bytes)`)

// Sanity checks: no runtime asset URLs may point at external hosts.
// Allowed leftovers are URLs the browser never fetches on page load:
// - apex shadcnuikit.com (NOT dashboard.): canonical link, og:image meta and
//   outbound "Pricing" anchor buttons. seo.jpg was never downloaded, so
//   keeping the absolute URL beats rewriting it into a local 404.
// - spec/namespace and doc links embedded in strings (schema.org, w3.org,
//   nextjs.org, github.com, ui.shadcn.com).
const ALLOWED_EXTERNAL = [
  /^https:\/\/shadcnuikit\.com\//, // apex only; dashboard. still fails
  /schema\.org/,
  /w3\.org/,
  /nextjs\.org/,
  /github\.com/,
  /ui\.shadcn\.com/,
]
const leftovers = [
  ...html.matchAll(/https:\/\/[^"\\\s]+/g),
]
  .map((m) => m[0].replace(/[),.;]+$/, ''))
  .filter((u) => !ALLOWED_EXTERNAL.some((re) => re.test(u)))
if (leftovers.length) {
  console.error('UNREWRITTEN URLS:', [...new Set(leftovers)])
  process.exitCode = 1
} else {
  console.log('All external URLs rewritten OK')
}
