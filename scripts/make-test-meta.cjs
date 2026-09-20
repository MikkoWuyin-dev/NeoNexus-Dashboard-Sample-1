// EXPERIMENT: neutralize the hidden metadata div on both sides.
// The saved snapshot references payload rows 33:/34: that are absent from
// the file, so the client cannot resolve the hidden div's subtree that the
// SSR rendered as empty suspense markers. Empty it on both sides to test
// whether that resolves the #418 hydration failure.
const fs = require('fs')

let h = fs.readFileSync('public/index.html', 'utf8')

// 1. DOM: drop the empty suspense markers inside the hidden div
const domOld = '<div hidden=""><!--$--><!--/$--></div>'
if (!h.includes(domOld)) throw new Error('DOM hidden div not found')
h = h.replace(domOld, '<div hidden=""></div>')

// 2. Payload: remove the unresolvable $L33 subtree from the hidden div props
//    (exact bytes verified against the file: see Next.Metadata slice)
const payOld =
  ',"children":["$","$L33",null,{"children":["$","$2f",null,{"name":"Next.Metadata","children":"$L34"}]}]'
if (!h.includes(payOld)) throw new Error('PAYLOAD hidden children not found')
h = h.replace(payOld, '')

fs.writeFileSync('public/test-meta.html', h)
console.log('wrote test-meta.html (metadata slot neutralized on both sides)')
