// Verifies public/index.html is fully self-contained:
//  1. No external asset URLs remain (http(s):// references that the page
//     would fetch at runtime).
//  2. Every referenced local asset (/_next/..., /avatars/...) exists on disk.
// Exits 1 if either check fails. Run: node scripts/verify-local-clone.cjs
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')

let failed = false

// --- Check 1: external URLs ----------------------------------------------
// Strip the RSC payload's escaped form (\u0022 etc. behave like normal text
// here; we just look for literal http(s):// occurrences). Exempt URLs are
// namespaces, link backlinks and other things the browser never fetches.
const EXEMPT = [
  // Apex marketing URLs the browser never fetches on load: canonical link,
  // og:image meta, outbound "Pricing" anchors. (Must stay a prefix check so
  // dashboard.shadcnuikit.com regressions still fail.)
  'https://shadcnuikit.com/',
  'schema.org',
  'w3.org',
  'nextjs.org',
  'github.com',
  'ui.shadcn.com',
  'shadcn-ui.com',
]
const externals = [...html.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)]
  .map((m) => m[0].replace(/[.,;)\]]+$/, ''))
  .filter((u) => !EXEMPT.some((e) => u.includes(e)))

if (externals.length) {
  failed = true
  console.error('FAIL: external URLs still referenced:')
  for (const u of [...new Set(externals)]) console.error('  ' + u)
} else {
  console.log('OK: no external URLs referenced')
}

// --- Check 2: local assets exist on disk ----------------------------------
// Match both markup attributes and RSC-escaped paths (\"...\" or \"...\\\")
// by taking everything after the leading slash up to a quote/backslash/
// whitespace/paren. Trailing junk like \\u0022 is trimmed.
const refs = new Set()
for (const m of html.matchAll(/\/(?:_next|avatars)\/[^\s"'<>()\\]+/g)) {
  refs.add(m[0].replace(/[.,;]+$/, ''))
}
const missing = [...refs].filter((r) => {
  try {
    return !fs.statSync(path.join(ROOT, 'public', r)).isFile()
  } catch {
    return true
  }
})

if (missing.length) {
  failed = true
  console.error(`FAIL: ${missing.length} referenced asset(s) missing on disk:`)
  for (const r of missing) console.error('  ' + r)
} else {
  console.log(`OK: all ${refs.size} referenced local assets exist on disk`)
}

process.exitCode = failed ? 1 : 0
