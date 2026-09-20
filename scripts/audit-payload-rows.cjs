// Audits the RSC flight payload embedded in public/index.html:
// lists every row id defined (push([1,"<id>:...")) and every row id
// referenced ($<id>, $@<id>, $L<id>, $U<id>), then diffs the two sets
// to find truncation damage in the saved snapshot.
const fs = require('fs')

const h = fs.readFileSync('public/index.html', 'utf8')

// Only look at payload strings inside push([1,"..."]) script bodies.
const payloads = [...h.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(
  (m) => m[1]
)
console.log(`payload chunks found: ${payloads.length}`)
const payload = payloads.join('')

const defined = new Set()
for (const m of payload.matchAll(/\\n([0-9a-f]+):/g)) defined.add(m[1])
// First row often starts without a preceding \n
for (const m of payload.matchAll(/^([0-9a-f]+):/g)) defined.add(m[1])

const referenced = new Set()
// $<id>, $@<id>, $L<id>, $U<id> — ids are hex-ish tokens; stop at \n, ", or \
for (const m of payload.matchAll(/\$(?:L|U|@)?([0-9a-f]{1,4})(?![0-9a-f])/g)) {
  referenced.add(m[1])
}

const missing = [...referenced].filter((id) => !defined.has(id))
const definedArr = [...defined].sort()
const referencedArr = [...referenced].sort()

console.log(`defined rows (${definedArr.length}): ${definedArr.join(' ')}`)
console.log(`referenced rows (${referencedArr.length}): ${referencedArr.join(' ')}`)
console.log(
  missing.length
    ? `MISSING DEFINITIONS for: ${missing.sort().join(' ')}`
    : 'no missing row definitions — payload is self-contained'
)

// Also check where the payload rows physically end: the file's final script
const lastIdx = h.lastIndexOf('self.__next_f.push([1,"')
console.log('last payload row start index:', lastIdx)
console.log('file total chars:', h.length)
